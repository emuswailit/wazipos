# wifi/payments.py — WiFi package payments: confirm, connect, pay the hotspot owner.
#
# A customer pays for a package on the captive portal (hotspot_views): an M-Pesa /
# Airtel prompt into the WaziPOS collection account, recorded PENDING. From then on
# the server owns the outcome — the customer may close the portal page:
#
#   resolve(payment)   asks JamboPay; SUCCESS -> activate() + queue_payout()
#   activate(payment)  WifiSubscriptions row + FreeRADIUS radcheck/radreply (once)
#   queue_payout(p)    an OrderPayouts row (order_kind "wifi_payment") to the
#                      hotspot owner's active entity PayoutAccounts for the FULL
#                      amount JamboPay confirms it received (no commission on
#                      WiFi), sent straight away by
#                      payments.tasks.process_order_payouts (once per payment)
#   monitor()          Celery, every 30 s: every pending payment of the last
#                      30 min is resolved; older ones expire; paid ones that were
#                      not connected / not queued for payout are retried.
#
# Every change is pushed live (wifi/signals.py -> broadcast) to:
#   ws/wifi/payments/?token=<jwt>     the hotspot owner's staff + WaziPOS admins
#   ws/wifi/payment/<psp_reference>/  the portal page waiting for one payment

import datetime
import logging
import re
from datetime import timedelta
from decimal import Decimal

from django.db import connections, transaction
from django.utils import timezone

from utils.logging import create_log
from wifi.models import WifiSubscriptionPayments, WifiSubscriptions

log = logging.getLogger(__name__)

PENDING_WINDOW = timedelta(minutes=30)  # an STK prompt never lasts longer
FIRST_CHECK_AFTER = timedelta(seconds=10)  # give the customer time to enter the PIN
FINAL = ("SUCCESS", "FAILED", "CANCELLED")
GATEWAY_FAILED = ("FAILED", "CANCELLED", "TIMEOUT", "REVERSED", "DECLINED")
ADMIN_GROUP = "wifi-payments-admin"
MAC_RE = re.compile(r"([0-9a-f]{2}(?::[0-9a-f]{2}){5})", re.I)


def entity_group(entity_id):
    return f"wifi-payments-{entity_id}"


def payment_group(psp_reference):
    # Channels group names: letters, digits, hyphens, underscores, periods only.
    return "wifi-pay-" + re.sub(r"[^A-Za-z0-9_.-]", "", str(psp_reference or ""))[:80]


# ---------------------------------------------------------------- reading

def mac_of(payment):
    if payment.mac_address:
        return payment.mac_address.lower()
    m = MAC_RE.search(payment.description or "")  # older rows: "WiFi Sub - <mac>"
    return m.group(1).lower() if m else None


def payout_of(payment):
    from payments.models import OrderPayouts

    return OrderPayouts.objects.filter(order_kind="wifi_payment", order_id=str(payment.pk)).select_related("entity_account").first()


def payout_out(row):
    if row is None:
        return None
    return {
        "id": str(row.id),
        "status": row.status,
        "status_label": row.get_status_display(),
        "amount": str(row.amount),
        "fee": str(row.commission_amount),
        "account": row.entity_account.account_number if row.entity_account_id else None,
        "account_type": row.entity_account.account_type if row.entity_account_id else None,
        "note": row.note or None,
        "paid_at": row.paid_at.isoformat() if row.paid_at else None,
        "psp_reference": row.psp_reference,
    }


def payment_out(p, with_payout=True):
    return {
        "id": str(p.id),
        "entity": str(p.entity_id),
        "entity_title": p.entity.title if p.entity_id else None,
        "tariff": str(p.tariff_id) if p.tariff_id else None,
        "tariff_title": p.tariff.title if p.tariff_id else None,
        "amount": str(p.amount),
        "currency": p.currency or "KES",
        "telco": p.telco,
        "status": p.status,
        "is_settled": p.is_settled,
        "reference_number": p.reference_number,
        "psp_reference_number": p.psp_reference_number,
        "provider_reference_number": p.provider_reference_number,
        "mac_address": mac_of(p),
        "connected": WifiSubscriptions.objects.filter(payment=p).exists(),
        "activation_error": p.activation_error or None,
        "created": p.created.isoformat() if p.created else None,
        "updated": p.updated.isoformat() if p.updated else None,
        "payout": payout_out(payout_of(p)) if with_payout else None,
    }


def recent(entity=None, limit=50):
    qs = WifiSubscriptionPayments.objects.select_related("entity", "tariff").order_by("-created")
    if entity is not None:
        qs = qs.filter(entity=entity)
    return [payment_out(p) for p in qs[:limit]]


# ---------------------------------------------------------------- live updates

def broadcast(payment_id):
    """Push a payment's current state to its owner's staff, WaziPOS admins and the waiting portal page."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        layer = get_channel_layer()
        p = WifiSubscriptionPayments.objects.select_related("entity", "tariff").filter(pk=payment_id).first()
        if layer is None or p is None:
            return
        data = payment_out(p)
        send = async_to_sync(layer.group_send)
        event = {"type": "wifi.payment", "payment": data}
        send(entity_group(p.entity_id), event)
        send(ADMIN_GROUP, event)
        if p.psp_reference_number:
            # The portal only learns what it needs to log the device in.
            send(payment_group(p.psp_reference_number), {"type": "wifi.status", "status": portal_status(p)})
    except Exception as e:  # live updates must never break a payment
        log.warning("wifi payment broadcast failed for %s: %s", payment_id, e)


def portal_status(p):
    if p.status == "SUCCESS":
        return "SUCCESS" if WifiSubscriptions.objects.filter(payment=p).exists() else "PENDING"
    return "FAILED" if p.status in ("FAILED", "CANCELLED") else "PENDING"


# ---------------------------------------------------------------- connect the device

def _expiry(tariff, now_local):
    length = tariff.length if tariff else 1
    unit = (tariff.duration or "HOUR").lower() if tariff else "hour"
    if unit == "minute":
        return now_local + datetime.timedelta(minutes=length)
    if unit == "hour":
        return now_local + datetime.timedelta(hours=length)
    if unit == "day":
        return now_local + datetime.timedelta(days=length)
    if unit == "week":
        return now_local + datetime.timedelta(weeks=length)
    if unit == "month":
        return now_local + datetime.timedelta(days=length * 30)
    return now_local + datetime.timedelta(hours=1)


def activate(payment, mac=None, tariff=None):
    """
    Paid: create the subscription and let the device in through FreeRADIUS.
    Once per payment. Returns (ok, error). Times are the server's local time, as
    the RADIUS Expiration attribute expects (unchanged from the portal).
    """
    if WifiSubscriptions.objects.filter(payment=payment).exists():
        return True, None
    mac = (mac or mac_of(payment) or "").lower()
    tariff = tariff or payment.tariff
    if not mac:
        return False, "No device (MAC address) on this payment"
    now_local = datetime.datetime.now()
    expiry_local = _expiry(tariff, now_local)
    session_timeout = int((expiry_local - now_local).total_seconds())
    try:
        with transaction.atomic(using="default"):
            locked = WifiSubscriptionPayments.objects.select_for_update().get(pk=payment.pk)
            if WifiSubscriptions.objects.filter(payment=locked).exists():
                return True, None
            WifiSubscriptions.objects.create(
                entity=getattr(tariff, "entity", None) or payment.entity,
                tariff_selected=tariff,
                mac_address=mac,
                username=mac,
                password=mac,
                payment=locked,
                owner=getattr(tariff, "owner", None),
                valid_from=now_local,
                valid_to=expiry_local,
                is_active="true",
            )
            # FreeRADIUS wants "Jun  9 2026 14:15:00" (day space-padded).
            day = expiry_local.day
            expiration = expiry_local.strftime(f"%b {f' {day}' if day < 10 else day} %Y %H:%M:%S")
            with connections["radius"].cursor() as cursor:
                cursor.execute("DELETE FROM radcheck WHERE username = %s", [mac])
                cursor.execute("DELETE FROM radreply WHERE username = %s", [mac])
                cursor.execute("INSERT INTO radcheck (username, attribute, op, value) VALUES (%s, 'Cleartext-Password', ':=', %s)", [mac, mac])
                cursor.execute("INSERT INTO radcheck (username, attribute, op, value) VALUES (%s, 'Expiration', ':=', %s)", [mac, expiration])
                cursor.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (%s, 'Session-Timeout', '=', %s)", [mac, str(session_timeout)])
        if payment.activation_error:
            WifiSubscriptionPayments.objects.filter(pk=payment.pk).update(activation_error=None)
        create_log("info", f"WiFi payment {payment.reference_number}: device {mac} connected until {expiry_local}")
        return True, None
    except Exception as e:
        # The subscription row rolls back with RADIUS, so the next check retries both.
        msg = f"Could not connect the device: {e}"[:300]
        WifiSubscriptionPayments.objects.filter(pk=payment.pk).update(activation_error=msg)
        create_log("error", f"WiFi payment {payment.reference_number}: {msg}")
        return False, msg


# ---------------------------------------------------------------- pay the hotspot owner

def _confirmed_amount(payment, token=None):
    """
    What JamboPay says it actually received for this payment (SUCCESS only), or None
    when it cannot confirm right now (the payout then waits for the next run).
    """
    if token is None:
        from payments.utils.system_till import get_jambopay_token

        error, token = get_jambopay_token()
        if error:
            create_log("error", f"[wifi-payout] {payment.reference_number}: cannot confirm amount: {error}")
            return None
    tx = _gateway_status(payment, token)
    if not tx or str(tx.get("status") or "").upper() != "SUCCESS":
        create_log("error", f"[wifi-payout] {payment.reference_number}: JamboPay did not confirm SUCCESS ({(tx or {}).get('status')})")
        return None
    for key in ("amount", "transactionAmount", "amountPaid"):
        raw = tx.get(key)
        if raw not in (None, ""):
            try:
                value = Decimal(str(raw))
            except Exception:
                continue
            if value > 0:
                return value
    create_log("error", f"[wifi-payout] {payment.reference_number}: JamboPay SUCCESS without an amount: {tx}")
    return None


def queue_payout(payment, token=None):
    """
    Pay the hotspot owner the FULL amount JamboPay confirms it received (no WaziPOS
    commission on WiFi) -> payout ledger (once), sent right away.
    """
    from payments.models import OrderPayouts
    from payments.utils.collection_payouts import _pay
    from payments.utils.order_payouts import MIN_PAYOUT, _q

    ref = payment.reference_number or payment.pk
    if payment.status != "SUCCESS":
        create_log("info", f"[wifi-payout] {ref}: not queued, payment is {payment.status}")
        return None
    if payment.entity_id is None:
        create_log("error", f"[wifi-payout] {ref}: not queued, payment has no entity (hotspot owner)")
        return None

    existing = payout_of(payment)
    if existing and existing.status in (OrderPayouts.Status.PAID, OrderPayouts.Status.PROCESSING):
        return existing  # money already on its way: never touched

    confirmed = _confirmed_amount(payment, token)
    if confirmed is None:
        return existing  # retried by the monitor every 30 s
    confirmed = _q(confirmed)
    if confirmed != _q(payment.amount):
        create_log("warning", f"[wifi-payout] {ref}: recorded KES {payment.amount}, JamboPay confirmed KES {confirmed}; paying the confirmed amount")
        WifiSubscriptionPayments.objects.filter(pk=payment.pk).update(amount=confirmed, updated=timezone.now())
        payment.amount = confirmed

    entity = payment.entity
    if existing:
        # Not sent yet (DUE / NO_ACCOUNT / FAILED): the full confirmed amount, no commission.
        if existing.gross_amount != confirmed or existing.commission_amount or existing.amount != confirmed:
            existing.gross_amount, existing.commission_amount, existing.amount = confirmed, Decimal("0"), confirmed
            existing.save(update_fields=["gross_amount", "commission_amount", "amount", "updated"])
            create_log("info", f"[wifi-payout] {ref}: corrected unsent payout to KES {confirmed} (no commission)")
        row = existing
    else:
        row = _pay("wifi_payment", payment.pk, payment.reference_number, entity, gross=confirmed, payee_entity=entity,
                   commission=Decimal("0"), note="WiFi package sold")
        if row is None:
            create_log("error", f"[wifi-payout] {ref}: no payout row created (entity={entity.pk} amount={confirmed})")
            return payout_of(payment)

    create_log(
        "info",
        f"[wifi-payout] {ref}: KES {row.amount} to {entity.title} (confirmed received, no commission) status={row.status}"
        + (f"; below the KES {MIN_PAYOUT} JamboPay minimum, waits for manual payment" if row.amount < MIN_PAYOUT else "")
        + ("; the business has no active payout account" if row.status == OrderPayouts.Status.NO_ACCOUNT else ""),
    )

    def kick():
        try:
            from payments.tasks import process_order_payouts

            process_order_payouts.delay()
        except Exception as e:  # beat sends it within 2 minutes anyway
            log.warning("could not queue payouts now: %s", e)

    transaction.on_commit(kick)
    return row


# ---------------------------------------------------------------- confirm a payment

def _gateway_status(payment, token):
    from payments.utils.system_till import fetch_transaction

    tx = None
    for ref in (payment.reference_number, payment.psp_reference_number):
        if ref:
            tx = fetch_transaction(ref, token)
            if tx and tx.get("status"):
                break
    return tx


def resolve(payment, token=None, mac=None, tariff=None):
    """
    Bring one payment up to date and act on it. Safe to call any number of times
    (portal polling, the monitor, the live socket): it never connects a device or
    queues a payout twice. Returns the payment's status.
    """
    if payment.status == "PENDING":
        if token is None:
            from payments.utils.system_till import get_jambopay_token

            error, token = get_jambopay_token()
            if error:
                create_log("error", f"WiFi payment check: {error}")
                token = None
        tx = _gateway_status(payment, token) if token else None
        status = str((tx or {}).get("status") or "").upper()
        fields = {"checks": payment.checks + 1, "last_checked_at": timezone.now()}
        if status == "SUCCESS":
            fields["status"] = "SUCCESS"
            for key in ("amount", "transactionAmount", "amountPaid"):
                try:
                    confirmed = Decimal(str(tx.get(key)))
                except Exception:
                    continue
                if confirmed > 0:
                    fields["amount"] = confirmed  # what was actually received
                    break
        elif status in GATEWAY_FAILED:
            fields["status"] = "CANCELLED" if status == "CANCELLED" else "FAILED"
            fields["description"] = str(tx.get("description") or payment.description or "")[:256]
        elif payment.created and timezone.now() - payment.created > PENDING_WINDOW:
            fields["status"] = "FAILED"
            fields["description"] = "Payment expired (no PIN entered in time)"
        if tx and tx.get("providerRef"):
            fields["provider_reference_number"] = str(tx["providerRef"])[:50]
        # Conditional update: two checkers racing can't flip a final status back.
        WifiSubscriptionPayments.objects.filter(pk=payment.pk, status="PENDING").update(**fields, updated=timezone.now())
        payment.refresh_from_db()
        if payment.status != "PENDING":
            create_log("info", f"WiFi payment {payment.reference_number}: {payment.status}")
            broadcast(payment.pk)  # .update() fires no signal

    if payment.status == "SUCCESS":
        ok, _ = activate(payment, mac=mac, tariff=tariff)
        if ok:
            broadcast(payment.pk)
        queue_payout(payment, token)
    return payment.status


def monitor():
    """Celery (every 30 s): resolve pending payments, repair paid ones. Returns a small summary."""
    from payments.utils.system_till import get_jambopay_token

    now = timezone.now()
    summary = {"checked": 0, "success": 0, "failed": 0, "connected": 0, "queued": 0}
    pending = list(
        WifiSubscriptionPayments.objects.filter(status="PENDING", created__lte=now - FIRST_CHECK_AFTER).order_by("created")[:200]
    )
    token = None
    if pending:
        error, token = get_jambopay_token()
        if error:
            create_log("error", f"WiFi payment monitor: {error}")
            token = None
    for p in pending:
        if token is None and now - p.created <= PENDING_WINDOW:
            continue  # can't ask the gateway now; try next run
        try:
            status = resolve(p, token=token)
        except Exception as e:
            create_log("error", f"WiFi payment monitor {p.reference_number}: {e}")
            continue
        summary["checked"] += 1
        if status == "SUCCESS":
            summary["success"] += 1
        elif status in ("FAILED", "CANCELLED"):
            summary["failed"] += 1

    # Paid, but the device wasn't connected (RADIUS down…) or the payout wasn't queued.
    since = now - timedelta(days=3)
    for p in WifiSubscriptionPayments.objects.filter(status="SUCCESS", created__gte=since, wifi_subscription_tariff__isnull=True).order_by("created")[:100]:
        if activate(p)[0]:
            summary["connected"] += 1
            broadcast(p.pk)
    # Paid packages whose owner payout is not on its way yet: create / correct it.
    # (This module owns WiFi payouts; the generic collection sweep skips them.)
    from payments.models import OrderPayouts

    sent = set(
        OrderPayouts.objects.filter(order_kind="wifi_payment", status__in=[OrderPayouts.Status.PAID, OrderPayouts.Status.PROCESSING])
        .values_list("order_id", flat=True)
    )
    todo = [
        p for p in WifiSubscriptionPayments.objects.filter(status="SUCCESS", is_settled="false", created__gte=now - timedelta(days=45))
        .select_related("entity").order_by("created")[:200]
        if str(p.pk) not in sent
    ]
    if todo:
        if token is None:
            error, token = get_jambopay_token()
            if error:
                create_log("error", f"WiFi payout monitor: {error}")
                token = None
        if token:
            for p in todo:
                row = payout_of(p)
                if row and row.status in (OrderPayouts.Status.DUE, OrderPayouts.Status.NO_ACCOUNT) and not row.commission_amount and row.amount == p.amount:
                    continue  # already right, waiting to be sent / for an account
                if queue_payout(p, token):
                    summary["queued"] += 1
    if any(summary.values()):
        create_log("info", f"[wifi-monitor] {summary}")
    return summary


def recheck(user, payment_id):
    """An owner's admin (or a WaziPOS admin) asks for a payment to be checked now."""
    p = WifiSubscriptionPayments.objects.select_related("entity", "tariff").filter(pk=payment_id).first()
    if p is None or not can_watch(user, p.entity):
        return None
    resolve(p)
    p.refresh_from_db()
    return payment_out(p)


def can_watch(user, entity):
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if user.is_superuser or user.is_staff:
        return True
    if entity is None:
        return False
    if getattr(entity, "owner_id", None) == user.pk or getattr(entity, "administrator_id", None) == user.pk:
        return True
    return user.roles.filter(entity=entity, value__endswith="SuperAdmin").exists()
