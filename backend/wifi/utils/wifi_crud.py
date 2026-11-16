# wifi/utils/wifi_crud.py
#
# Extra Wi-Fi actions beyond wifi_utils.py (scoped to the caller's business):
#   DeleteWifiRouter {id}   refused while the router still has packages
# Payments and the subscriptions they create come from customers: read only.

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
