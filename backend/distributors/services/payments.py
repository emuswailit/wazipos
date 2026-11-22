# distributors/services/payments.py
#
# Payments on a wholesaler's order on a distributor — the same rules as retailer
# orders (wholesalers/services/retailer_order_payments.py):
#
#   - the buyer (the wholesaler's staff) pays by mobile money only: an STK push
#     into the WaziPOS system till; once SUCCESS the money is owed to the
#     distributor's active payout account (payout_amount = amount - commission,
#     is_settled False until paid out);
#   - the distributor's own staff may also record any other method (cash,
#     credit, cheque…): paid and settled at once — the distributor holds it.
#
# Once successful payments cover the order, it is marked paid (orders.mark_paid:
# stock off the lots, fulfilment opened). PENDING pushes are followed by the
# client (RefreshPayment) and reconciled by Celery (distributors/tasks.py).

import math
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from distributors.models import DistributorPayments
from utils.logging import create_log

FINAL_FAILURES = {"FAILED", "CANCELLED"}


def payment_out(p):
    return {
        "id": str(p.id),
        "reference_number": p.pay_in_reference_number,
        "amount": str(p.amount),
        "status": p.status,
        "description": p.description or p.narrative or "",
        "method": p.payment_method.title if p.payment_method_id else ("Mobile money" if p.pay_in_reference_number else ""),
        "is_settled": p.is_settled,
        "created": p.created.isoformat() if p.created else None,
    }


def amount_due(order):
    owed = Decimal(str(order.final_price_total or 0)) + Decimal(str(order.shipping_amount or 0))
    paid = DistributorPayments.objects.filter(wholesaler_order=order, status="SUCCESS").aggregate(t=Sum("amount"))["t"] or Decimal("0")
    return max(Decimal("0"), owed - paid)


def _active_payout_account(distributor):
    from payments.models import PayoutAccounts

    return PayoutAccounts.objects.filter(entity=distributor, is_active="true").order_by("-updated").first()


def _mobile_money_method():
    from payments.models import PaymentMethods

    return PaymentMethods.objects.filter(title__iexact="MOBILE MONEY").first()


def _covered(order):
    from distributors.services.orders import mark_paid

    if amount_due(order) <= 0:
        mark_paid(order)


def initiate_mobile_money(order, user, phone):
    """STK push for what's still due into the system till. Returns (errors, payment)."""
    from authentication.utils.utils import generate_reference_number, use_reference_number
    from payments.utils.system_till import push_to_system_till

    if order.status in ("REJECTED", "CANCELLED"):
        return ["This order is closed"], None
    phone = str(phone or "").strip()
    if not phone:
        return ["Enter the mobile money number to charge"], None
    due = amount_due(order)
    if due <= 0:
        return ["This order is already paid"], None
    amount = math.ceil(due)  # whole shillings; never under-collect
    reference = generate_reference_number(order.wholesaler, user)
    errors, result, telco = push_to_system_till(reference, amount, phone, description=f"Order {order.distributor.title}"[:60])
    if errors:
        create_log("error", f"Wholesaler order STK push failed: {errors}")
        return errors, None
    payment = DistributorPayments.objects.create(
        entity=order.wholesaler, owner=user, distributor=order.distributor, wholesaler_order=order,
        payment_method=_mobile_money_method(), pay_in_reference_number=reference, reference=reference,
        psp_reference_number=str(result.get("ref") or ""), status="PENDING", description="Waiting for PIN entry.",
        amount=amount, telco=telco or "", currency="KES",
    )
    use_reference_number(reference)
    return [], payment


def record_offline_payment(order, user, method_id, description=None):
    """Distributor staff record cash / credit / any non-mobile method: paid and settled at once."""
    from payments.models import PaymentMethods

    method = PaymentMethods.objects.filter(id=method_id or None).first() if method_id else None
    if not method:
        return ["Pick the payment method"], None
    if method.title.strip().upper() == "MOBILE MONEY":
        return ["Mobile money goes through a payment prompt, not a recorded payment"], None
    if order.status in ("REJECTED", "CANCELLED"):
        return ["This order is closed"], None
    due = amount_due(order)
    if due <= 0:
        return ["This order is already paid"], None
    with transaction.atomic():
        payment = DistributorPayments.objects.create(
            entity=order.wholesaler, owner=user, distributor=order.distributor, wholesaler_order=order,
            payment_method=method, status="SUCCESS", description=(description or f"{method.title} recorded by the distributor")[:120],
            amount=due, payout_amount=Decimal("0"), is_paid=True, is_settled=True, settled_at=timezone.now(), currency="KES",
        )
        order.payment_method = method
        order.save(update_fields=["payment_method", "updated"])
        _covered(order)
    return [], payment


def apply_transaction(payment_id, tx):
    """PENDING -> what JamboPay reports. Row-locked; the success booking runs once."""
    status = (tx or {}).get("status", "")
    with transaction.atomic():
        payment = DistributorPayments.objects.select_for_update().select_related("wholesaler_order__distributor").filter(id=payment_id).first()
        if not payment or payment.status != "PENDING" or not status or status == "PENDING":
            return payment
        payment.status = status if status in {"SUCCESS", *FINAL_FAILURES} else "FAILED"
        if tx.get("description"):
            payment.description = str(tx["description"])[:120]
        if tx.get("providerRef"):
            payment.provider_reference_number = str(tx["providerRef"])[:120]
        if payment.status == "SUCCESS":
            order = payment.wholesaler_order
            payment.is_paid = True
            payment.is_settled = False
            payment.payout_account = _active_payout_account(order.distributor)
            payment.payout_amount = Decimal(str(payment.amount or 0)) - Decimal(str(payment.commission_amount or 0))
            payment.save()
            _covered(order)
            if not payment.payout_account:
                create_log("warning", f"Wholesaler order payment {payment.pay_in_reference_number} succeeded but {order.distributor} has no payout account.")
        else:
            payment.save()
    return payment


def refresh_payment(reference, order_filter):
    """RefreshPayment {reference}: poll JamboPay for one of the caller's PENDING payments."""
    from payments.utils.system_till import fetch_transaction

    payment = DistributorPayments.objects.filter(pay_in_reference_number=reference or None, **order_filter).first() if reference else None
    if not payment:
        return ["Payment not found"], None
    if payment.status == "PENDING":
        tx = fetch_transaction(reference)
        if tx:
            payment = apply_transaction(payment.id, tx)
    return [], payment


def reconcile_pending():
    """Celery: settle PENDING pushes the client didn't follow; expire abandoned ones."""
    from payments.utils.system_till import PENDING_TIMEOUT_MINUTES, fetch_transaction, get_jambopay_token

    cutoff = timezone.now() - timedelta(minutes=PENDING_TIMEOUT_MINUTES)
    base = DistributorPayments.objects.filter(status="PENDING", pay_in_reference_number__isnull=False)
    recent = list(base.filter(created__gte=cutoff))
    if recent:
        error, token = get_jambopay_token()
        if error:
            create_log("error", f"Wholesaler order payment reconcile: {error}")
        else:
            for p in recent:
                tx = fetch_transaction(p.pay_in_reference_number, token=token)
                if tx:
                    apply_transaction(p.id, tx)
    for p in base.filter(created__lt=cutoff):
        apply_transaction(p.id, {"status": "FAILED", "description": "Payment expired (timed out waiting for PIN)."})
    return len(recent)
