# authentication/utils/my_entities.py — "My businesses": the signed-in user's OWN entities,
# and switching between them after signing in again.
#
#   GetMyEntities                 strictly entities whose owner is the signed-in user
#   SendSwitchCode {entity}       accounts without a password (Google / Facebook sign-up):
#                                 a 6-digit code by SMS to confirm the switch
#   SwitchMyEntity {entity, password | code}
#                                 re-checks who they are, makes the entity current, makes
#                                 sure the owner holds its SuperAdmin role and returns FRESH
#                                 tokens — the app signs in with them so the new business's
#                                 roles, menus and settings load.
#
# Five wrong passwords / codes in 15 minutes lock switching for 15 minutes.

import pyotp
from django.core.cache import cache
from django.db import transaction

from authentication import models

SWITCH_CODE_SECONDS = 300
MAX_TRIES = 5
LOCK_SECONDS = 15 * 60
HIDDEN_TYPES = ("Default",)


class SwitchError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = list(errors or [message])


def _owned(user):
    return models.Entities.objects.filter(owner=user).exclude(entity_type__in=HIDDEN_TYPES)


def _label(entity_type):
    import re

    return re.sub(r"(?<!^)(?=[A-Z])", " ", str(entity_type or "")).strip()


def my_entities(user, request=None):
    """Strictly the entities this user owns, current one first."""
    owned = list(_owned(user).order_by("title"))
    ids = [e.id for e in owned]
    located, approvals = set(), {}
    try:
        from entitylocations.models import Locations

        located = set(Locations.objects.filter(entity_id__in=ids, point__isnull=False).values_list("entity_id", flat=True))
    except Exception:
        pass
    try:
        from onboarding.models import EntityApprovals

        approvals = dict(EntityApprovals.objects.filter(entity_id__in=ids).values_list("entity_id", "status"))
    except Exception:
        pass
    rows = []
    for e in owned:
        rows.append({
            "id": str(e.id),
            "title": e.title,
            "entity_type": e.entity_type,
            "type_label": _label(e.entity_type),
            "town": getattr(e, "town", None),
            "road": getattr(e, "road", None),
            "phone": getattr(e, "phone", None),
            "email": getattr(e, "email", None),
            "is_verified": str(getattr(e, "is_verified", "")).lower() == "true",
            "approval": approvals.get(e.id),
            "has_location": e.id in located,
            "current": e.id == user.entity_id,
            "created": e.created.isoformat() if getattr(e, "created", None) else None,
        })
    rows.sort(key=lambda r: (not r["current"], r["title"].lower()))
    return {
        "entities": rows,
        "current": str(user.entity_id) if user.entity_id else None,
        "confirm_with": "password" if user.has_usable_password() else "code",
        "phone_hint": _mask(user.phone),
    }


def _mask(phone):
    p = str(phone or "")
    return (p[:4] + "•••" + p[-3:]) if len(p) >= 8 else None


def _entity_for(user, data):
    entity = _owned(user).filter(pk=str(data.get("entity") or "")).first() if data.get("entity") else None
    if entity is None:
        raise SwitchError("Not your business", ["You can only switch to a business you own"])
    return entity


def _lock_key(user):
    return f"entity-switch-tries:{user.pk}"


def _check_lock(user):
    if (cache.get(_lock_key(user)) or 0) >= MAX_TRIES:
        raise SwitchError("Too many tries", ["Too many wrong attempts. Wait 15 minutes and try again."])


def _failed(user):
    key = _lock_key(user)
    tries = (cache.get(key) or 0) + 1
    cache.set(key, tries, LOCK_SECONDS)
    left = MAX_TRIES - tries
    return f" {left} {'try' if left == 1 else 'tries'} left." if left > 0 else " Switching is locked for 15 minutes."


def _totp(user):
    if not user.key:
        from authentication.signals import generate_key

        user.key = generate_key()
        user.save(update_fields=["key"])
    return pyotp.TOTP(user.key, interval=SWITCH_CODE_SECONDS, digits=6)


def send_switch_code(user, data):
    entity = _entity_for(user, data)
    _check_lock(user)
    if not user.phone:
        raise SwitchError("No phone", ["Add a phone number to your profile to get a code"])
    from core.utils import send_sms

    code = _totp(user).now()
    errors, _sent = send_sms(user.phone, f"WaziPOS: your code to switch to {entity.title[:40]} is {code}. It expires in 5 minutes.")
    if errors:
        raise SwitchError("Code not sent", [str(e) for e in errors])
    return {"sent_to": _mask(user.phone), "expires_in": SWITCH_CODE_SECONDS}


def switch_my_entity(user, data):
    entity = _entity_for(user, data)
    _check_lock(user)

    # Sign in again: the password, or the SMS code for accounts without one.
    password = str(data.get("password") or "")
    code = str(data.get("code") or "").strip()
    if user.has_usable_password():
        if not password:
            raise SwitchError("Enter your password", ["Enter your password to confirm the switch"])
        if not user.check_password(password):
            raise SwitchError("Wrong password", ["That password is not correct." + _failed(user)])
    else:
        if not code:
            raise SwitchError("Enter the code", ["Enter the code we texted you"])
        if not _totp(user).verify(code, valid_window=1):
            raise SwitchError("Wrong code", ["That code is wrong or has expired." + _failed(user)])
    cache.delete(_lock_key(user))

    with transaction.atomic():
        user.entity = entity
        user.save(update_fields=["entity"])
        # The owner must hold the business's super admin role (menus come from roles).
        from authentication.utils.utils import create_super_admin_role

        create_super_admin_role(entity)
        role = models.Roles.objects.filter(entity=entity, value=f"{entity.entity_type}SuperAdmin").first()
        if role is not None and not user.roles.filter(pk=role.pk).exists():
            user.roles.add(role)

    try:
        from utils.logging import create_log

        create_log("info", f"Entity switch: user {user.pk} -> {entity.pk} ({entity.title})")
    except Exception:
        pass
    user.refresh_from_db()
    return {
        "entity": {"id": str(entity.id), "title": entity.title, "entity_type": entity.entity_type, "type_label": _label(entity.entity_type)},
        "tokens": user.tokens(),
    }
