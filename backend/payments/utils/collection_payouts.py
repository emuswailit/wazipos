# payments/utils/collection_payouts.py
#
# Every pay-in lands in the WaziPOS collection account (payments/utils/collection.py).
# This sweep turns what has been collected into payouts on the ledger
# (payments.OrderPayouts), paid by JamboPay payout to the payee's verified payout
# account (order_payouts.run_payouts). Nothing is transferred wallet to wallet.
#
#   source                            payee (account)                       due when
#   shop sale, no delivery            the shop (entity)                      paid; online pickup: collected
#   restaurant order, no delivery     the restaurant (entity)                paid
#   bar tab payment                   the bar / restaurant (entity)          paid
#   hotel stay payment                the hotel (entity)                     paid
#   WiFi package                      the hotspot owner (entity), in full    confirmed (wifi/payments.py)
#   rent                              the landlord / property (entity)       paid
#   matatu / boda fare                the vehicle's administrator (user)     paid
#   sacco subscription                the sacco (entity)                     paid
#   agent commission                  the agent (user)                       earned
#   stocktaker pay                    the stocktaker (user)                  stock take paid & submitted
# Delivery orders and B2B orders are released by their own flows
# (order_payouts.release_goods / release_vendor). Money taken directly by a seller
# (cash, credit) never reached WaziPOS, so it is never paid out.

from datetime import timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from payments.models import OrderPayouts
from payments.utils.order_payouts import OFFLINE_METHODS, _entity_account, _q, _user_account, release_vendor
from utils.logging import create_log

LOOKBACK_DAYS = 45
BATCH = 500


def _exists(kind, oid):
    return OrderPayouts.objects.filter(order_kind=kind, order_id=str(oid)).exists()


def _pay(kind, oid, reference, seller, *, gross, payee_entity=None, payee_user=None, commission=Decimal("0"),
         payee_kind=OrderPayouts.PayeeKind.VENDOR, note=""):
    """One payout row for one collected source (once)."""
    if seller is None or (payee_entity is None and payee_user is None) or _exists(kind, oid):
        return None
    gross = _q(gross)
    if gross <= 0:
        return None
    commission = _q(min(commission, gross))
    entity_account = _entity_account(payee_entity) if payee_entity is not None else None
    user_account = _user_account(payee_user) if payee_user is not None else None
    return OrderPayouts.objects.create(
        payee_kind=payee_kind, order_kind=kind, order_id=str(oid), order_reference=str(reference or oid)[:64],
        seller=seller, payee_entity=payee_entity, payee_user=payee_user,
        entity_account=entity_account, user_account=user_account,
        gross_amount=gross, commission_amount=commission, amount=_q(gross - commission),
        status=OrderPayouts.Status.DUE if (entity_account or user_account) else OrderPayouts.Status.NO_ACCOUNT,
        note=(note or "")[:300] if (entity_account or user_account) else "Waiting for a payout account",
        due_at=timezone.now(),
    )


def _pct(entity):
    try:
        return Decimal(str(getattr(entity, "commission_percentage", 0) or 0))
    except Exception:
        return Decimal("0")


# ---------------------------------------------------------------- sweeps

def _shop_sales(since):
    """Shop (customer) orders without delivery: paid in-store, or picked up online once collected."""
    from retailers.models import CustomerOrders

    qs = (
        CustomerOrders.objects.filter(is_paid="true", shipment__isnull=True)
        .exclude(status="CANCELLED")
        .filter(Q(paid_at__gte=since) | Q(paid_at__isnull=True, created__gte=since))
        .filter(Q(fulfilment__isnull=True) | Q(fulfilment__stage="COLLECTED"))
        .select_related("entity")
    )
    n = 0
    for order in qs[:BATCH]:
        if release_vendor("customer", order, None, "Sold in the shop" if not hasattr(order, "fulfilment") else "Collected by the customer"):
            n += 1
    return n


def _restaurant_orders(since):
    """Restaurant food orders without delivery (dine-in, take-away, QR menu): paid."""
    from restaurants.models import FoodOrder

    n = 0
    for order in FoodOrder.objects.filter(is_paid="true", shipment__isnull=True, created__gte=since).select_related("entity")[:BATCH]:
        if release_vendor("food", order, None, "Paid at the restaurant"):
            n += 1
    return n


def _per_payment(model, kind, since, seller_of, *, method_field="payment_method", settled=("is_settled", False), commission=False,
                 payee_kind=OrderPayouts.PayeeKind.VENDOR, user_payee=False, note=""):
    """Sources paid payment by payment (tabs, stays, WiFi, rent, fares, sacco subscriptions)."""
    qs = model.objects.filter(status="SUCCESS", created__gte=since)
    if settled:
        qs = qs.filter(**{settled[0]: settled[1]})
    if method_field:
        qs = qs.exclude(**{f"{method_field}__title__in": OFFLINE_METHODS})
    n = 0
    for p in qs.order_by("created")[:BATCH]:
        seller, payee = seller_of(p)
        if seller is None or payee is None:
            continue
        row = _pay(
            kind, p.pk, getattr(p, "reference_number", None), seller, gross=Decimal(str(p.amount or 0)),
            payee_entity=None if user_payee else payee, payee_user=payee if user_payee else None,
            commission=_q(Decimal(str(p.amount or 0)) * _pct(seller) / Decimal("100")) if commission else Decimal("0"),
            payee_kind=payee_kind, note=note,
        )
        if row:
            n += 1
    return n


def _agent_commissions(since):
    from authentication.models import AgentCommissions

    n = 0
    for c in AgentCommissions.objects.filter(status="PENDING", created__gte=since, amount__gt=0).select_related("agent__user", "entity")[:BATCH]:
        if _pay("agent_commission", c.pk, f"Commission {str(c.pk)[:8]}", c.entity, gross=c.amount, payee_user=c.agent.user,
                payee_kind=OrderPayouts.PayeeKind.AGENT_COMMISSION, note="Commission on a subscription you brought in"):
            n += 1
    return n


def _stocktaker_pay(since):
    from stocktakes.models import StockTakeAssignments

    n = 0
    qs = StockTakeAssignments.objects.filter(
        payout_status="PENDING", days_worked__gt=0, stock_take__is_paid=True,
        stock_take__status__in=["SUBMITTED", "APPLIED"], updated__gte=since,
    ).select_related("onboarder__user", "stock_take__entity")
    for a in qs[:BATCH]:
        if _pay("stocktaker_pay", a.pk, f"Stock take {str(a.stock_take_id)[:8]}", a.stock_take.entity, gross=a.amount_due,
                payee_user=a.onboarder.user, payee_kind=OrderPayouts.PayeeKind.STOCKTAKER, note=f"{a.days_worked} day(s) counting"):
            n += 1
    return n


def _sweep_start():
    """
    Pay-ins before PAYOUT_SWEEP_FROM (YYYY-MM-DD, set it to the go-live date) are never
    swept — they may already have been paid by hand — and never older than LOOKBACK_DAYS.
    """
    from datetime import date, datetime, time

    from decouple import config

    since = timezone.now() - timedelta(days=LOOKBACK_DAYS)
    raw = str(config("PAYOUT_SWEEP_FROM", default="") or "").strip()
    if raw:
        try:
            start = timezone.make_aware(datetime.combine(date.fromisoformat(raw[:10]), time.min))
            since = max(since, start)
        except ValueError:
            create_log("error", f"PAYOUT_SWEEP_FROM={raw!r} is not a date (YYYY-MM-DD)")
    return since


def sweep_collections():
    """Celery (with run_payouts): every collected pay-in becomes a payout to its payee, once."""
    since = _sweep_start()
    done = {}
    steps = [("shop_sales", lambda: _shop_sales(since)), ("restaurant_orders", lambda: _restaurant_orders(since))]

    def add(name, fn):
        steps.append((name, fn))

    try:
        from restaurants.models import BarInventoryOrderPayment, RoomBookingPayment

        add("bar", lambda: _per_payment(BarInventoryOrderPayment, "bar_payment", since,
                                        lambda p: (p.bar_inventory_order.entity, p.bar_inventory_order.entity) if p.bar_inventory_order_id else (None, None),
                                        note="Bar tab paid"))
        add("stay", lambda: _per_payment(RoomBookingPayment, "stay_payment", since,
                                         lambda p: (p.booking.entity, p.booking.entity) if p.booking_id else (None, None), note="Stay paid"))
    except ImportError:
        pass
    # WiFi packages are paid out by wifi/payments.py (monitor_wifi_payments): the full
    # amount JamboPay confirms it received, no commission. Not swept here.
    try:
        from properties.models import PropertyUnitPayments

        add("rent", lambda: _per_payment(PropertyUnitPayments, "rent_payment", since, lambda p: (p.entity, p.entity),
                                         settled=None, commission=True, note="Rent paid"))
    except ImportError:
        pass
    try:
        from transport.models import SaccoSubscriptionPayment, TicketPayment

        def fare_payee(p):
            v = p.vehicle
            admin = getattr(v, "administrator", None) if v else None
            return (v.entity, admin.user) if admin and getattr(admin, "user_id", None) else (None, None)

        add("fares", lambda: _per_payment(TicketPayment, "fare_payment", since, fare_payee, user_payee=True,
                                          payee_kind=OrderPayouts.PayeeKind.FARE, note="Fares collected"))
        add("sacco", lambda: _per_payment(SaccoSubscriptionPayment, "sacco_payment", since,
                                          lambda p: (p.sacco_subscription.entity, p.sacco_subscription.entity) if p.sacco_subscription_id else (None, None),
                                          note="Sacco subscription paid"))
    except ImportError:
        pass
    add("agent_commissions", lambda: _agent_commissions(since))
    add("stocktakers", lambda: _stocktaker_pay(since))

    for name, fn in steps:
        try:
            done[name] = fn()
        except Exception as e:  # one broken source never stops the others
            create_log("error", f"Collection payouts sweep ({name}) failed: {e}")
    return done


# ---------------------------------------------------------------- paid out

def on_paid(row):
    """The payout went through: mark the source settled (legacy jobs then skip it)."""
    now = row.paid_at or timezone.now()
    kind, oid = row.order_kind, row.order_id
    try:
        if kind == "bar_payment":
            from restaurants.models import BarInventoryOrderPayment as M

            M.objects.filter(pk=oid).update(is_settled=True)
        elif kind == "stay_payment":
            from restaurants.models import RoomBookingPayment as M

            M.objects.filter(pk=oid).update(is_settled=True)
        elif kind == "wifi_payment":
            from wifi.models import WifiSubscriptionPayments as M

            M.objects.filter(pk=oid).update(is_settled="true")
        elif kind == "fare_payment":
            from transport.models import TicketPayment as M

            M.objects.filter(pk=oid).update(is_settled=True)
        elif kind == "sacco_payment":
            from transport.models import SaccoSubscriptionPayment as M

            M.objects.filter(pk=oid).update(is_settled=True)
        elif kind == "agent_commission":
            from authentication.models import AgentCommissions as M

            M.objects.filter(pk=oid, status="PENDING").update(status="PAID", paid_at=now)
        elif kind == "stocktaker_pay":
            from stocktakes.models import StockTakeAssignments as M

            M.objects.filter(pk=oid, payout_status="PENDING").update(
                payout_status="PAID", paid_at=now, payout_reference=(row.psp_reference or row.reference_number or "")[:120],
            )
    except Exception as e:
        create_log("error", f"Marking {kind} {oid} settled failed: {e}")


COLLECTION_KINDS = {"bar_payment", "stay_payment", "wifi_payment", "rent_payment", "fare_payment", "sacco_payment", "agent_commission", "stocktaker_pay"}


def paid_manually(kind, ids, reference):
    """An admin paid these outside WaziPOS: their payout rows are paid too, so nobody is paid twice."""
    OrderPayouts.objects.filter(order_kind=kind, order_id__in=[str(i) for i in ids]).exclude(
        status__in=[OrderPayouts.Status.PAID, OrderPayouts.Status.PROCESSING],
    ).update(status=OrderPayouts.Status.PAID, paid_at=timezone.now(), psp_reference=str(reference or "")[:120], note="Paid manually")
