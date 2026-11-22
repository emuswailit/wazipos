# manufacturers/services/payments.py
#
# Payments on a distributor's order on a manufacturer (same rules as every buyer):
#   - the buyer (the distributor's staff) pays by mobile money only: an STK push into
#     the WaziPOS system till. WaziPOS then pays the manufacturer the goods amount
#     (less commission) into its payout account once the goods are released, and the
#     shipping to whoever delivers (payments/utils/order_payouts.py);
#   - the manufacturer's own staff may also record any other method (cash, credit,
#     cheque…): paid at once, the manufacturer holds that money.
# Once successful payments cover the order it is marked paid (orders.mark_paid).

import math
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from manufacturers.models import ManufacturerOrderPayments
from utils.logging import create_log

FINAL_FAILURES = {"FAILED", "CANCELLED"}


def payment_out(p):
    return {
        "id": str(p.id),
        "reference_number": p.pay_in_reference_number,
        "amount": str(p.amount),
        "status": p.status,
        "description": p.description,
        "method": p.payment_method.title if p.payment_method_id else ("Mobile money" if p.pay_in_reference_number else ""),
        "is_settled": p.is_settled,
        "created": p.created.isoformat() if p.created else None,
    }


def amount_due(order):
    owed = Decimal(str(order.final_price_total or 0)) + Decimal(str(order.shipping_amount or 0))
    paid = ManufacturerOrderPayments.objects.filter(order=order, status="SUCCESS").aggregate(t=Sum("amount"))["t"] or Decimal("0")
    return max(Decimal("0"), owed - paid)


def _covered(order):
    from manufacturers.services.orders import mark_paid

    if amount_due(order) <= 0:
        mark_paid(order)


def initiate_mobile_money(order, user, phone):
    """STK push for what's still due into the system till. Returns (errors, payment)."""
    from authentication.utils.utils import generate_reference_number, use_reference_number
    from payments.models import PaymentMethods
    from payments.utils.system_till import push_to_system_till

    if order.status in ("REJECTED", "CANCELLED"):
        return ["This order is closed"], None
    phone = str(phone or "").strip()
    if not phone:
        return ["Enter the mobile money number to charge"], None
    due = amount_due(order)
    if due <= 0:
        return ["This order is already paid"], None
    amount = math.ceil(due)
    reference = generate_reference_number(order.distributor, user)
    errors, result, telco = push_to_system_till(reference, amount, phone, description=f"Order {order.manufacturer.title}"[:60])
    if errors:
        create_log("error", f"Purchase order STK push failed: {errors}")
        return errors, None
    payment = ManufacturerOrderPayments.objects.create(
        entity=order.distributor, owner=user, manufacturer=order.manufacturer, order=order,
        payment_method=PaymentMethods.objects.filter(title__iexact="MOBILE MONEY").first(),
        pay_in_reference_number=reference, psp_reference_number=str(result.get("ref") or ""),
        status="PENDING", description="Waiting for PIN entry.", amount=amount, telco=telco or "",
    )
    use_reference_number(reference)
    return [], payment


def record_offline_payment(order, user, method_id, description=None):
    """Manufacturer staff record cash / credit / any non-mobile method: paid at once, nothing to settle."""
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
        payment = ManufacturerOrderPayments.objects.create(
            entity=order.distributor, owner=user, manufacturer=order.manufacturer, order=order, payment_method=method,
            status="SUCCESS", description=(description or f"{method.title} recorded by the manufacturer")[:120],
            amount=due, is_paid=True, is_settled=True, settled_at=timezone.now(),
        )
        order.payment_method = method
        order.save(update_fields=["payment_method", "updated"])
        _covered(order)
    return [], payment


def apply_transaction(payment_id, tx):
    """PENDING -> what JamboPay reports. Row-locked; the success booking runs once."""
    status = (tx or {}).get("status", "")
    with transaction.atomic():
        payment = ManufacturerOrderPayments.objects.select_for_update().select_related("order").filter(id=payment_id).first()
        if not payment or payment.status != "PENDING" or not status or status == "PENDING":
            return payment
        payment.status = status if status in {"SUCCESS", *FINAL_FAILURES} else "FAILED"
        if tx.get("description"):
            payment.description = str(tx["description"])[:120]
        if tx.get("providerRef"):
            payment.provider_reference_number = str(tx["providerRef"])[:120]
        if payment.status == "SUCCESS":
            payment.is_paid = True
        payment.save()
        if payment.status == "SUCCESS":
            _covered(payment.order)
    return payment


def refresh_payment(reference, order_filter):
    """RefreshPayment {reference}: poll JamboPay for one of the caller's PENDING payments."""
    from payments.utils.system_till import fetch_transaction

    payment = ManufacturerOrderPayments.objects.filter(pay_in_reference_number=reference or None, **order_filter).first() if reference else None
    if not payment:
        return ["Payment not found"], None
    if payment.status == "PENDING":
        tx = fetch_transaction(reference)
        if tx:
            payment = apply_transaction(payment.id, tx) or payment
    return [], payment


def reconcile_pending():
    """Celery: follow PENDING pushes; expire them after the till's timeout."""
    from payments.utils.system_till import PENDING_TIMEOUT_MINUTES, fetch_transaction, get_jambopay_token

    base = ManufacturerOrderPayments.objects.filter(status="PENDING").exclude(pay_in_reference_number__isnull=True)
    cutoff = timezone.now() - timedelta(minutes=PENDING_TIMEOUT_MINUTES)
    recent = list(base.filter(created__gte=cutoff)[:200])
    if recent:
        error, token = get_jambopay_token()
        if error:
            create_log("error", f"Purchase order payment reconcile: {error}")
        else:
            for p in recent:
                tx = fetch_transaction(p.pay_in_reference_number, token=token)
                if tx:
                    apply_transaction(p.id, tx)
    for p in base.filter(created__lt=cutoff):
        apply_transaction(p.id, {"status": "FAILED", "description": "Payment expired (timed out waiting for PIN)."})
    return len(recent)
