# wholesalers/services/retailer_order_payments.py
#
# Mobile-money payments for retailer orders (requisitions), collected into
# the WaziPOS system till (payments/utils/system_till.py) and owed onward to
# the wholesaler:
#
#   push  -> RetailerOrderPayments(status=PENDING, is_paid=false, is_settled=false,
#                                  pay_in_reference_number=<our ref>)
#   SUCCESS -> payment paid; order paid once successful payments cover it;
#              wholesaler stock reduced; payout_account = the wholesaler's
#              active PayoutAccount, payout_amount = amount - commission,
#              is_settled stays "false" until the payout to the wholesaler is made.
#
# Status is followed live by RetailerOrderPaymentConsumer and reconciled by
# the Celery task reconcile_retailer_order_payments (same split as subscriptions).

from datetime import timedelta
from decimal import Decimal

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from payments.utils.system_till import PENDING_TIMEOUT_MINUTES, fetch_transaction, get_jambopay_token
from utils.logging import create_log
from wholesalers.models import RetailerOrderPayments

FINAL_FAILURES = {"FAILED", "CANCELLED"}


def payment_group(reference_number):
    """Channels group for clients following one payment."""
    return f"retailer-order-payment-{reference_number}"


def active_payout_account(wholesaler):
    from payments.models import PayoutAccounts

    if not wholesaler:
        return None
    return PayoutAccounts.objects.filter(entity=wholesaler, is_active="true").order_by("-updated").first()


def payment_payload(payment):
    """What the payment dialog reads ({"payment": {...}} on the socket)."""
    if not payment:
        return {"status": "NOT_FOUND", "description": "Payment record could not be found."}
    return {
        "payment_id": str(payment.id),
        "reference_number": payment.pay_in_reference_number,
        "amount": float(payment.amount or 0),
        "status": payment.status,
        "description": payment.description,
    }


def broadcast(payment):
    """Wake the payment dialog and both sides' requisition lists."""
    layer = get_channel_layer()
    if not layer or not payment:
        return
    try:
        from retailers.consumers import retailer_requisitions_group

        if payment.pay_in_reference_number:
            async_to_sync(layer.group_send)(payment_group(payment.pay_in_reference_number), {"type": "send_payment_status"})
        order = payment.retailer_order
        if order and order.retailer_id:
            async_to_sync(layer.group_send)(retailer_requisitions_group(order.retailer_id), {"type": "send_retailer_requisitions"})
    except Exception as e:
        create_log("error", f"Retailer order payment broadcast failed: {e}")


def _complete(payment):
    """Book a successful payment. Runs once per payment (caller holds the row lock)."""
    from retailers.utils.retailer_utils import update_wholesaler_stock

    order = payment.retailer_order
    payout_account = active_payout_account(order.wholesaler)
    commission = Decimal(str(payment.commission_amount or 0))

    payment.is_paid = "true"
    payment.is_settled = "false"
    payment.payout_account = payout_account
    payment.payout_amount = Decimal(str(payment.amount or 0)) - commission
    payment.save()

    paid = (
        RetailerOrderPayments.objects.filter(retailer_order=order, status="SUCCESS")
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0")
    )
    owed = Decimal(str(order.final_price_total or 0)) + Decimal(str(order.shipping_amount or 0))
    if paid >= owed and str(order.is_paid).lower() != "true":
        order.is_paid = "true"
        order.save()
        update_wholesaler_stock(order)

    if not payout_account:
        create_log(
            "warning",
            f"Retailer order payment {payment.pay_in_reference_number} succeeded but "
            f"{order.wholesaler} has no active payout account to settle to.",
        )


def apply_transaction(payment_id, tx):
    """
    Move a PENDING payment to JamboPay's reported status. Safe to call from
    the socket poller and the Celery task at the same time (row lock; the
    success booking runs only on the PENDING -> SUCCESS transition).
    Returns the payment.
    """
    status = (tx or {}).get("status", "")
    with transaction.atomic():
        payment = (
            RetailerOrderPayments.objects.select_for_update()
            .select_related("retailer_order__wholesaler")
            .filter(id=payment_id)
            .first()
        )
        if not payment or payment.status != "PENDING" or not status or status == "PENDING":
            return payment

        payment.status = status if status in {"SUCCESS", *FINAL_FAILURES} else "FAILED"
        if tx.get("description"):
            payment.description = str(tx["description"])[:120]
        if tx.get("providerRef"):
            payment.provider_reference_number = tx["providerRef"]
        if payment.status == "SUCCESS":
            _complete(payment)
        else:
            payment.is_paid = "false"
            payment.save()

    broadcast(payment)
    return payment


def refresh_payment(reference_number, token=None):
    """Poll JamboPay for one payment (used by the status socket)."""
    payment = RetailerOrderPayments.objects.filter(pay_in_reference_number=reference_number).first()
    if payment and payment.status == "PENDING":
        tx = fetch_transaction(reference_number, token=token)
        if tx:
            payment = apply_transaction(payment.id, tx)
    return payment


def reconcile_pending():
    """Celery: settle PENDING payments the socket missed; expire abandoned ones."""
    cutoff = timezone.now() - timedelta(minutes=PENDING_TIMEOUT_MINUTES)
    base = RetailerOrderPayments.objects.filter(status="PENDING", pay_in_reference_number__isnull=False)

    recent = list(base.filter(created__gte=cutoff))
    if recent:
        error, token = get_jambopay_token()
        if error:
            create_log("error", f"Retailer order payment reconcile: {error}")
        else:
            for payment in recent:
                tx = fetch_transaction(payment.pay_in_reference_number, token=token)
                if tx:
                    apply_transaction(payment.id, tx)

    for payment in base.filter(created__lt=cutoff):
        apply_transaction(
            payment.id,
            {"status": "FAILED", "description": "Payment expired (timed out waiting for PIN)."},
        )
    return len(recent)
