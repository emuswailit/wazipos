# wifi/utils/wifi_crud.py
#
# The CRUD the Wi-Fi screens need beyond wifi_utils.py (all scoped to the
# caller's business, entity type InternetServiceProvider):
#   DeleteWifiRouter {id}
#   CreateWifiSubscription {tariff_selected, mac_address, username?, password?, valid_from?, valid_to?}
#       valid_to defaults to valid_from + the package's length; username / password generated if blank
#   UpdateWifiSubscription {id, ...same fields, is_active?}
#   DeleteWifiSubscription {id}
#   CreateWifiPayment {tariff, amount?, telco?, description?, status?}   payment taken by staff (cash etc.)
#   UpdateWifiPayment {id, status?, description?, telco?, amount?}
#   DeleteWifiPayment {id}   (only payments recorded by staff, never M-Pesa ones)

import secrets
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from wifi import models

STEP = {"MINUTE": timedelta(minutes=1), "HOUR": timedelta(hours=1), "DAY": timedelta(days=1), "WEEK": timedelta(weeks=1), "MONTH": timedelta(days=30)}
STATUSES = ("PENDING", "SUCCESS", "CANCELLED", "FAILED")


def _mine(model, data, user):
    return model.objects.filter(id=data.get("id"), entity=user.entity).first() if data.get("id") else None


def _dt(v):
    if not v:
        return None
    d = parse_datetime(str(v))
    if d and timezone.is_naive(d):
        d = timezone.make_aware(d)
    return d


def _money(v):
    try:
        return Decimal(str(v)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return None


def delete_router(data, user):
    router = _mine(models.WifiRouters, data, user)
    if not router:
        return ["Router not found."]
    if models.WifiTarrifs.objects.filter(router=router).exists():
        return ["This router still has packages. Delete or move them first, or switch the router off."]
    router.delete()
    return []


def save_subscription(data, user, create):
    sub = None if create else _mine(models.WifiSubscriptions, data, user)
    if not create and not sub:
        return ["Subscription not found."], None
    tariff = None
    if data.get("tariff_selected"):
        tariff = models.WifiTarrifs.objects.filter(id=data["tariff_selected"], entity=user.entity).first()
        if not tariff:
            return ["Package not found."], None
    mac = str(data.get("mac_address") if "mac_address" in data else (sub.mac_address if sub else "")).strip()
    if not mac:
        return ["Enter the device's MAC address."], None
    if create and not tariff:
        return ["Pick the package."], None
    start = _dt(data.get("valid_from")) or (sub.valid_from if sub else timezone.now())
    end = _dt(data.get("valid_to"))
    if not end:
        if tariff and (create or "tariff_selected" in data):
            end = start + STEP.get(tariff.duration, timedelta(hours=1)) * max(1, int(tariff.length or 1))
        else:
            end = sub.valid_to if sub else None
    if not end or end <= start:
        return ["The end time must be after the start."], None
    sub = sub or models.WifiSubscriptions(entity=user.entity, owner=user)
    sub.mac_address = mac[:256]
    sub.tariff_selected = tariff or sub.tariff_selected
    sub.username = (str(data.get("username") or "").strip() or sub.username or f"u{secrets.token_hex(3)}")[:256]
    sub.password = (str(data.get("password") or "").strip() or sub.password or secrets.token_hex(4))[:256]
    sub.valid_from, sub.valid_to = start, end
    if "is_active" in data:
        sub.is_active = "true" if str(data["is_active"]).lower() in ("true", "1", "yes") else "false"
    sub.save()
    return [], sub


def delete_subscription(data, user):
    sub = _mine(models.WifiSubscriptions, data, user)
    if not sub:
        return ["Subscription not found."]
    sub.delete()
    return []


def save_payment(data, user, create):
    pay = None if create else _mine(models.WifiSubscriptionPayments, data, user)
    if not create and not pay:
        return ["Payment not found."], None
    tariff = None
    if data.get("tariff"):
        tariff = models.WifiTarrifs.objects.filter(id=data["tariff"], entity=user.entity).first()
        if not tariff:
            return ["Package not found."], None
    if create and not tariff:
        return ["Pick the package paid for."], None
    amount = _money(data["amount"]) if data.get("amount") not in (None, "") else (tariff.price if tariff and create else None)
    if create and (amount is None or amount <= 0):
        return ["Enter the amount paid."], None
    status = str(data.get("status") or ("SUCCESS" if create else pay.status)).upper()
    if status not in STATUSES:
        return ["Pick a valid status."], None
    if create:
        pay = models.WifiSubscriptionPayments(
            entity=user.entity, currency="KES", reference_number=f"CASH{secrets.token_hex(4).upper()}", psp_reference_number="",
        )
    elif pay.psp_reference_number and pay.reference_number and not pay.reference_number.startswith("CASH") and "amount" in data:
        return ["Mobile money payments can't be changed, only their notes."], None
    if tariff:
        pay.tariff = tariff
    if amount is not None:
        pay.amount = amount
    pay.status = status
    for f in ("telco", "description"):
        if f in data:
            setattr(pay, f, str(data.get(f) or "").strip()[:256] or None)
    pay.save()
    return [], pay


def delete_payment(data, user):
    pay = _mine(models.WifiSubscriptionPayments, data, user)
    if not pay:
        return ["Payment not found."]
    if not str(pay.reference_number or "").startswith("CASH"):
        return ["Mobile money payments can't be deleted."]
    pay.delete()
    return []
