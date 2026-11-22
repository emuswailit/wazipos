# payments/utils/order_payouts.py
#
# One buyer payment, split and paid onward (payments.OrderPayouts):
#
#   buyer pays once (goods + shipping) by mobile money into the WaziPOS till
#     -> VENDOR: the goods amount (what the till took less the order's shipping,
#        less commission on B2B orders) to the seller's PayoutAccounts, due when
#        the goods are RELEASED to the delivery person (first leg picked up, or the
#        courier's office receives them); pickup orders: when the buyer collects;
#     -> DELIVERY_PERSON: each intracity leg's pay (at that person's rate) to their
#        UserPayoutAccounts, due on delivery to the buyer or to the courier's
#        dispatch office;
#     -> COURIER: the long-haul leg's pay to the courier's PayoutAccounts, due when
#        the goods are received at its dispatch office.
#
# Money the buyer paid the seller directly (cash, credit…) never reaches WaziPOS:
# no vendor payout, and delivery payouts are SELLER_PAYS (the seller pays them).
# DUE rows are paid by Celery (process_order_payouts) through JamboPay payouts;
# a row whose payee has no payout account waits as NO_ACCOUNT and becomes DUE as
# soon as one is added.

import json
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

import requests
from decouple import config
from django.db import transaction
from django.utils import timezone

from payments.models import OrderPayouts, PayoutAccounts, UserPayoutAccounts
from utils.logging import create_log

MIN_PAYOUT = Decimal("10")  # JamboPay's smallest payout
MAX_ATTEMPTS = 3
ORDER_LINK = {"retailer": "retailer_order", "customer": "customer_order", "food": "food_order", "wholesaler": "wholesaler_order"}
OFFLINE_METHODS = ("CASH", "CREDIT")


def _q(v):
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------- orders

def order_of(shipment):
    """(kind, order) a shipment carries."""
    for kind, link in ORDER_LINK.items():
        if getattr(shipment, f"{link}_id", None):
            return kind, getattr(shipment, link)
    return None, None


SELLER_FIELD = {"customer": "entity", "food": "entity", "retailer": "wholesaler", "wholesaler": "distributor"}


def seller_of(kind, order):
    field = SELLER_FIELD.get(kind)
    return getattr(order, field, None) if field else None


def _reference(order):
    for f in ("order_number", "reference_number", "document_number", "number"):
        v = getattr(order, f, None)
        if v:
            return str(v)[:64]
    return str(order.pk)[:8].upper()


def _till_payments(kind, order):
    """The order's successful payments that WaziPOS collected (mobile money / cards), not ones the seller took directly."""
    if kind == "customer":
        from retailers.models import CustomerOrderPayment

        return CustomerOrderPayment.objects.filter(customer_order=order, status="SUCCESS").exclude(payment_method__title__in=OFFLINE_METHODS)
    if kind == "food":
        from restaurants.models import FoodOrderPayment

        return FoodOrderPayment.objects.filter(food_order=order, status="SUCCESS").exclude(payment_method__title__in=OFFLINE_METHODS)
    if kind == "retailer":
        from wholesalers.models import RetailerOrderPayments

        return RetailerOrderPayments.objects.filter(retailer_order=order, status="SUCCESS").exclude(pay_in_reference_number__isnull=True).exclude(pay_in_reference_number="")
    if kind == "wholesaler":
        from distributors.models import DistributorPayments

        return DistributorPayments.objects.filter(wholesaler_order=order, status="SUCCESS").exclude(pay_in_reference_number__isnull=True).exclude(pay_in_reference_number="")
    return None


def till_paid(kind, order):
    qs = _till_payments(kind, order)
    if qs is None:
        return Decimal("0")
    return _q(sum((Decimal(str(p.amount or 0)) for p in qs), Decimal("0")))


def _mark_source_settled(kind, order):
    """The vendor was paid: the order's till payments are settled (legacy settlement tasks skip them)."""
    qs = _till_payments(kind, order)
    if qs is None:
        return
    now = timezone.now()
    if kind == "customer":
        qs.update(is_validated=True)
    elif kind == "retailer":
        qs.update(is_settled="true")
    elif kind == "wholesaler":
        qs.update(is_settled=True, settled_at=now)
    elif kind == "food":
        qs.update(is_settled=True)


def _entity_account(entity):
    return PayoutAccounts.objects.filter(entity=entity, is_active="true").first() if entity else None


def _user_account(user):
    return UserPayoutAccounts.objects.filter(user=user, is_active="true").first() if user else None


# ---------------------------------------------------------------- vendor

def release_vendor(kind, order, shipment=None, note=""):
    """
    The goods left the seller (released to the delivery person, or collected):
    the goods share of what WaziPOS collected becomes due to the seller. Once per order.
    """
    if order is None or kind not in ORDER_LINK:
        return None
    existing = OrderPayouts.objects.filter(payee_kind=OrderPayouts.PayeeKind.VENDOR, order_kind=kind, order_id=str(order.pk)).first()
    if existing:
        return existing
    seller = seller_of(kind, order)
    paid = till_paid(kind, order)
    if not seller or paid <= 0:
        return None  # the seller took the money directly
    shipping = _q(shipment.total_cost) if shipment is not None else Decimal("0")
    gross = _q(paid - min(paid, shipping))
    pct = Decimal(str(getattr(seller, "commission_percentage", 0) or 0)) if kind in ("retailer", "wholesaler") else Decimal("0")
    commission = _q(gross * pct / Decimal("100"))
    account = _entity_account(seller)
    return OrderPayouts.objects.create(
        payee_kind=OrderPayouts.PayeeKind.VENDOR, order_kind=kind, order_id=str(order.pk), order_reference=_reference(order),
        seller=seller, shipment=shipment, payee_entity=seller, entity_account=account,
        gross_amount=gross, commission_amount=commission, amount=_q(gross - commission),
        status=OrderPayouts.Status.DUE if account else OrderPayouts.Status.NO_ACCOUNT,
        note=(note or "Goods released")[:300], due_at=timezone.now(),
    )


def release_goods(shipment, note=""):
    """Delivery orders: the goods were handed to the delivery person (or the courier's office)."""
    kind, order = order_of(shipment)
    return release_vendor(kind, order, shipment, note or "Goods released to the delivery person")


# ---------------------------------------------------------------- delivery legs

def record_leg_payout(leg):
    """
    A delivery leg earned its pay: intracity person -> their user payout account;
    long-haul courier -> its entity payout account. Once per leg.
    """
    from logistics.models import ShipmentLeg

    if not leg.cost or Decimal(str(leg.cost)) <= 0:
        return None
    existing = OrderPayouts.objects.filter(leg=leg).first()
    if existing:
        return existing
    shipment = leg.shipment
    kind, order = order_of(shipment)
    if order is None:
        return None
    courier = leg.kind == ShipmentLeg.Kind.TRANSIT
    if courier:
        payee_entity, payee_user = leg.provider, None
        entity_account, user_account = _entity_account(leg.provider), None
        payee_kind = OrderPayouts.PayeeKind.COURIER
    else:
        if not leg.agent_id:
            return None
        payee_entity, payee_user = None, leg.agent.user
        entity_account, user_account = None, _user_account(leg.agent.user)
        payee_kind = OrderPayouts.PayeeKind.DELIVERY_PERSON
    # WaziPOS holds the shipping only if the buyer paid through the till.
    funded = till_paid(kind, order) >= _q(shipment.total_cost)
    if not funded:
        status, note = OrderPayouts.Status.SELLER_PAYS, "The buyer paid the seller directly; the seller pays this delivery"
    elif entity_account or user_account:
        status, note = OrderPayouts.Status.DUE, ""
    else:
        status, note = OrderPayouts.Status.NO_ACCOUNT, "Waiting for a payout account"
    return OrderPayouts.objects.create(
        payee_kind=payee_kind, order_kind=kind, order_id=str(order.pk), order_reference=_reference(order),
        seller=shipment.entity, shipment=shipment, leg=leg, payee_entity=payee_entity, payee_user=payee_user,
        entity_account=entity_account, user_account=user_account,
        gross_amount=_q(leg.cost), amount=_q(leg.cost), status=status, note=note, due_at=timezone.now(),
    )


def mark_legs_paid_manually(leg_ids, reference):
    """Admin paid delivery legs outside WaziPOS (MarkDeliveryPayoutPaid): their payout rows are paid too."""
    OrderPayouts.objects.filter(leg_id__in=leg_ids).exclude(status=OrderPayouts.Status.PAID).update(
        status=OrderPayouts.Status.PAID, psp_reference=str(reference)[:120], paid_at=timezone.now(), note="Paid manually",
    )


# ---------------------------------------------------------------- paying out

def _payload(account, amount, reference, narration):
    """JamboPay payout body for an entity / user payout account, or None when the type can't be paid automatically."""
    kind = str(account.account_type or "").upper()
    base = {
        "amount": int(amount),
        "accountFrom": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
        "orderId": reference,
        "callBackUrl": config("JAMBOPAY_PAYOUT_CALLBACK_URL", default="https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31"),
        "narration": narration[:60],
    }
    if kind == "MOBILE":
        return {**base, "provider": "MOMO_B2C", "payTo": {"accountRef": account.account_number, "accountNumber": account.account_number}}
    if kind == "PAYBILL":
        return {**base, "provider": "MOMO_B2B", "payTo": {"accountRef": account.business_number or account.account_number, "accountNumber": account.account_number}}
    if kind == "TILL":
        return {**base, "provider": "MOMO_B2B", "payTo": {"accountNumber": account.account_number}}
    if kind == "BANK":
        return {**base, "provider": "BANK", "payTo": {"accountRef": account.account_number, "accountNumber": account.account_number, "bankCode": account.account_code}}
    return None


def _refresh_accounts():
    """NO_ACCOUNT rows whose payee has since added a payout account become DUE."""
    for row in OrderPayouts.objects.filter(status=OrderPayouts.Status.NO_ACCOUNT).select_related("payee_entity", "payee_user")[:500]:
        account = _entity_account(row.payee_entity) if row.payee_entity_id else None
        user_account = _user_account(row.payee_user) if row.payee_user_id else None
        if account or user_account:
            row.entity_account, row.user_account = account, user_account
            row.status, row.note = OrderPayouts.Status.DUE, ""
            row.save(update_fields=["entity_account", "user_account", "status", "note", "updated"])


def _on_paid(row):
    if row.payee_kind == OrderPayouts.PayeeKind.EMPLOYEE_COMMISSION:
        from shopguard.services import commission_paid_out

        commission_paid_out(row)
        return
    if row.payee_kind == OrderPayouts.PayeeKind.VENDOR:
        from django.apps import apps

        model = {
            "customer": "retailers.CustomerOrders", "food": "restaurants.FoodOrder",
            "retailer": "wholesalers.RetailerOrders", "wholesaler": "distributors.WholesalerOrders",
        }.get(row.order_kind)
        order = apps.get_model(model).objects.filter(pk=row.order_id).first() if model else None
        if order is not None:
            _mark_source_settled(row.order_kind, order)
    elif row.leg_id:
        from logistics.models import ShipmentLeg

        ShipmentLeg.objects.filter(id=row.leg_id).update(
            is_settled=True, settled_at=row.paid_at, pay_out_reference_number=(row.psp_reference or row.reference_number),
        )


def _poll_processing(token):
    from payments.utils.system_till import fetch_transaction

    stale = timezone.now() - timedelta(minutes=2)
    lost = timezone.now() - timedelta(minutes=15)
    for row in OrderPayouts.objects.filter(status=OrderPayouts.Status.PROCESSING, updated__lte=stale)[:200]:
        tx = fetch_transaction(row.reference_number, token)
        status = (tx or {}).get("status")
        if tx is None and not row.psp_reference and row.updated <= lost:
            # JamboPay never registered it: send again under a new reference.
            row.status = OrderPayouts.Status.DUE if row.attempts < MAX_ATTEMPTS else OrderPayouts.Status.FAILED
            row.reference_number, row.note = None, "Payout not registered; retrying"
            row.save(update_fields=["status", "reference_number", "note", "updated"])
            continue
        if status == "SUCCESS":
            row.status, row.paid_at = OrderPayouts.Status.PAID, timezone.now()
            row.psp_reference = str(tx.get("providerRef") or tx.get("ref") or row.psp_reference or "")[:120]
            row.save(update_fields=["status", "paid_at", "psp_reference", "updated"])
            _on_paid(row)
        elif status in ("FAILED", "CANCELLED", "REVERSED"):
            # Confirmed failure: a retry gets a fresh reference.
            row.status = OrderPayouts.Status.DUE if row.attempts < MAX_ATTEMPTS else OrderPayouts.Status.FAILED
            row.note = str(tx.get("description") or "Payout failed")[:300]
            row.reference_number, row.psp_reference = None, None
            row.save(update_fields=["status", "note", "reference_number", "psp_reference", "updated"])


def _send_due(token):
    sent = 0
    for row_id in list(OrderPayouts.objects.filter(status=OrderPayouts.Status.DUE, amount__gte=MIN_PAYOUT).values_list("id", flat=True)[:100]):
        with transaction.atomic():
            row = OrderPayouts.objects.select_for_update(skip_locked=True).filter(id=row_id, status=OrderPayouts.Status.DUE).first()
            if not row:
                continue
            account = row.entity_account or row.user_account
            narration = f"WaziPOS {row.get_payee_kind_display().lower()} {row.order_reference}"
            # One stable orderId per payout row: a retry never creates a second payout.
            row.reference_number = row.reference_number or f"WZPO{row.id.hex[:16].upper()}"
            payload = _payload(account, row.amount, row.reference_number, narration) if account else None
            if payload is None:
                row.status = OrderPayouts.Status.FAILED if account else OrderPayouts.Status.NO_ACCOUNT
                row.note = f"{account.account_type} accounts are paid manually" if account else "Waiting for a payout account"
                row.save(update_fields=["status", "note", "reference_number", "updated"])
                continue
            row.status = OrderPayouts.Status.PROCESSING
            row.attempts += 1
            row.save(update_fields=["status", "attempts", "reference_number", "updated"])
        try:
            res = requests.post(
                config("JAMBOPAY_BASE_URL") + "/payout", data=json.dumps(payload),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "Accept": "*/*"}, timeout=30,
            )
            body = res.json() if res.content else {}
        except Exception as e:
            # Unknown outcome (timeout…): stays PROCESSING under the same reference;
            # the next run asks JamboPay before ever sending again.
            create_log("error", f"Order payout {row.reference_number}: {e}")
            continue
        if body.get("ref"):
            OrderPayouts.objects.filter(id=row_id).update(psp_reference=str(body["ref"])[:120], updated=timezone.now())
            sent += 1
        else:
            create_log("error", f"Order payout {row.reference_number} not accepted: {body}")
            OrderPayouts.objects.filter(id=row_id).update(
                status=OrderPayouts.Status.DUE if row.attempts < MAX_ATTEMPTS else OrderPayouts.Status.FAILED,
                reference_number=None,
                note=str(body.get("message") or body.get("error") or "Payout not accepted")[:300], updated=timezone.now(),
            )
    return sent


def run_payouts():
    """Celery: accounts added -> DUE; check payouts in flight; send what's due."""
    from payments.utils.system_till import get_jambopay_token

    _refresh_accounts()
    if not OrderPayouts.objects.filter(status__in=[OrderPayouts.Status.DUE, OrderPayouts.Status.PROCESSING]).exists():
        return 0
    error, token = get_jambopay_token()
    if error:
        create_log("error", f"Order payouts: {error}")
        return 0
    _poll_processing(token)
    return _send_due(token)


# ---------------------------------------------------------------- reading

def payout_out(row):
    payee = row.payee_entity.title if row.payee_entity_id else (
        " ".join(x for x in (row.payee_user.first_name, row.payee_user.last_name) if x) or str(row.payee_user) if row.payee_user_id else None
    )
    return {
        "id": str(row.id),
        "payee_kind": row.payee_kind,
        "payee_kind_label": row.get_payee_kind_display(),
        "payee": payee,
        "order_kind": row.order_kind,
        "order_reference": row.order_reference,
        "seller": row.seller.title if row.seller_id else None,
        "gross_amount": str(row.gross_amount),
        "commission_amount": str(row.commission_amount),
        "amount": str(row.amount),
        "status": row.status,
        "status_label": row.get_status_display(),
        "note": row.note,
        "account": (row.entity_account or row.user_account).account_number if (row.entity_account_id or row.user_account_id) else None,
        "reference_number": row.reference_number,
        "psp_reference": row.psp_reference,
        "due_at": row.due_at.isoformat() if row.due_at else None,
        "paid_at": row.paid_at.isoformat() if row.paid_at else None,
    }


def list_payouts(data, *, entity=None, user=None, admin=False):
    """Admin: every payout; others: what they are owed (their entity's, or their own as a delivery person)."""
    qs = OrderPayouts.objects.select_related("payee_entity", "payee_user", "seller", "entity_account", "user_account")
    if not admin:
        from django.db.models import Q

        qs = qs.filter(Q(payee_entity=entity) | Q(payee_user=user)) if entity else qs.filter(payee_user=user)
    if data.get("status"):
        qs = qs.filter(status=data["status"])
    if data.get("payee_kind"):
        qs = qs.filter(payee_kind=data["payee_kind"])
    return [payout_out(r) for r in qs[:500]]


def retry_payout(row_id):
    """Admin: a FAILED payout (confirmed failed, so nothing was paid) goes back to DUE."""
    n = OrderPayouts.objects.filter(id=row_id or None, status=OrderPayouts.Status.FAILED).update(
        status=OrderPayouts.Status.DUE, attempts=0, reference_number=None, psp_reference=None, note="Retry requested", updated=timezone.now(),
    )
    return [] if n else ["Only failed payouts can be retried"]
