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
# Not listed (nor switchable) in My businesses.
HIDDEN_TYPES = (
    "Default",
    "Bank",
    "GeneralManufacturer",
    "PharmaceuticalManufacturer",
    "Publisher",
    "GeneralDistributor",
    "PharmaceuticalDistributor",
)


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
            "is_active": bool(getattr(e, "is_active", True)),
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
    if entity.is_active is False:
        raise SwitchError("Business deactivated", [f"{entity.title} has been deactivated by WaziPOS. Contact WaziPOS support."])
    return entity


def _lock_key(user):
    return f"entity-switch-tries:{user.pk}"


def _check_lock(user):
    if cache.get(f"entity-switch-blocked:{user.pk}"):
        raise SwitchError("Switching is blocked", [
            "A business switch on this account was reported as not you, so switching is blocked for 24 hours. "
            "Change your password, or contact WaziPOS support to unblock it sooner."])
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


def _ensure_owner_role(user, entity):
    """
    The owner must hold the business's super admin role (menus come from roles).
    Found by business + value only: Roles.save() upper-cases titles, so matching on
    the title (as create_super_admin_role does) misses the existing role and tries to
    create a duplicate, which the unique (entity, title, value) rule refuses.
    """
    value = f"{entity.entity_type}SuperAdmin"
    role = models.Roles.objects.filter(entity=entity, value=value).order_by("created").first()
    if role is None:
        from authentication.utils.utils import create_super_admin_role

        create_super_admin_role(entity)  # none yet: safe to create
        role = models.Roles.objects.filter(entity=entity, value=value).first()
    if role is not None and not user.roles.filter(pk=role.pk).exists():
        user.roles.add(role)
    return role


def _device(request):
    """IP and a short device description, for the security email."""
    if request is None:
        return None, None
    try:
        from core.access_log import client_ip

        ip = client_ip(request)
    except Exception:
        ip = request.META.get("REMOTE_ADDR")
    ua = str(request.META.get("HTTP_USER_AGENT") or "")
    device = None
    if ua:
        lower = ua.lower()
        system = next((n for k, n in (("android", "Android"), ("iphone", "iPhone"), ("ipad", "iPad"), ("windows", "Windows"),
                                      ("mac os", "Mac"), ("linux", "Linux")) if k in lower), None)
        browser = next((n for k, n in (("edg/", "Edge"), ("firefox", "Firefox"), ("chrome", "Chrome"), ("safari", "Safari"),
                                       ("okhttp", "WaziPOS app"), ("expo", "WaziPOS app")) if k in lower), None)
        device = " · ".join(x for x in (browser, system) if x) or ua[:80]
    return ip, device


# ---------------------------------------------------------------- activate / deactivate

def set_entity_active(entity, active, by=None, reason=""):
    """
    Turn a business on or off. Off: no one can work in it (billing.can_operate refuses
    every business screen) and it can't be switched into. Its admins are told
    (deactivated: email + SMS, they must act; reactivated: email). Returns the entity.
    """
    from core.notify import deliver_to_entity, later

    active = bool(active)
    if entity.is_active == active:
        return entity
    entity.is_active = active
    entity.save(update_fields=["is_active"])
    who = getattr(by, "email", None) or "WaziPOS"
    try:
        from utils.logging import create_log

        create_log("warning" if not active else "info",
                   f"Entity {'REACTIVATED' if active else 'DEACTIVATED'}: {entity.pk} ({entity.title}) by {who}"
                   + (f" — {reason}" if reason else ""))
    except Exception:
        pass
    if active:
        later(lambda: deliver_to_entity(
            entity, f"{entity.title} is active again on WaziPOS",
            [f"WaziPOS has reactivated {entity.title}. You and your staff can work in it again."],
            push=True, data={"type": "entity_status", "entity": str(entity.id), "active": True},
        ))
    else:
        later(lambda: deliver_to_entity(
            entity, f"{entity.title} has been deactivated on WaziPOS",
            [f"WaziPOS has deactivated {entity.title}" + (f": {reason}" if reason else "."),
             "Sales, stock and staff screens are closed for it until it is reactivated. Contact WaziPOS support."],
            sms=True, sms_text=f"WaziPOS: {entity.title[:40]} has been deactivated. Contact WaziPOS support.",
            push=True, data={"type": "entity_status", "entity": str(entity.id), "active": False},
        ))
    return entity


# ---------------------------------------------------------------- "This wasn't me"
#
# The switch email carries a signed, single-switch link (valid 7 days, no sign-in
# needed — the account may be in someone else's hands):
#   GET  /api/v1/authentication/users/report-switch?t=…   confirmation page (email
#        scanners that open links can't trigger anything)
#   POST same URL                                         the report:
#     · the account goes back to the business it was on before the switch
#     · switching is blocked for 24 hours
#     · WaziPOS admins and the switched-to business's admins are alerted
#     · the user is told to change their password now (login tokens can't be revoked)

REPORT_SALT = "wazipos.entity-switch-report"
REPORT_MAX_AGE = 7 * 24 * 3600
SWITCH_BLOCK_SECONDS = 24 * 3600


def _block_key(user_id):
    return f"entity-switch-blocked:{user_id}"


def report_link(user, entity, previous, ip=None, device=None):
    from django.core import signing
    from django.utils import timezone

    from authentication.utils.admin_users import API_URL

    token = signing.dumps(
        {"u": str(user.pk), "to": str(entity.pk), "from": str(previous.pk) if previous is not None else None,
         "at": timezone.now().isoformat(), "ip": ip, "dev": device},
        salt=REPORT_SALT, compress=True,
    )
    return f"{API_URL}/api/v1/authentication/users/report-switch?t={token}"


def read_report(token):
    """(payload, error) for a report link."""
    from django.core import signing

    try:
        return signing.loads(token or "", salt=REPORT_SALT, max_age=REPORT_MAX_AGE), None
    except signing.SignatureExpired:
        return None, "This link has expired. If you think someone else is using your account, change your password now."
    except signing.BadSignature:
        return None, "This link is not valid."


def file_report(token, request=None):
    """Act on 'This wasn't me'. Returns (ok, message)."""
    from django.utils import timezone

    from core.notify import deliver_to_entity, deliver_to_users, later

    payload, error = read_report(token)
    if error:
        return False, error
    user = models.Users.objects.filter(pk=payload.get("u")).select_related("entity").first()
    switched_to = models.Entities.objects.filter(pk=payload.get("to")).first()
    previous = models.Entities.objects.filter(pk=payload.get("from")).first() if payload.get("from") else None
    if user is None or switched_to is None:
        return False, "We couldn't find that account or business."
    done_key = f"entity-switch-report:{payload.get('u')}:{payload.get('at')}"
    if cache.get(done_key):
        return True, "Already reported. Your account was moved back and switching is blocked. Change your password now."

    # 1. Back to the business it was on, if the switched-to one is still current.
    moved_back = False
    if user.entity_id == switched_to.pk:
        fallback = previous or models.Entities.objects.filter(title="WAZIPOS").first()
        if fallback is not None:
            user.entity = fallback
            user.save(update_fields=["entity"])
            moved_back = True
    # 2. No more switching for a day.
    cache.set(_block_key(user.pk), timezone.now().isoformat(), SWITCH_BLOCK_SECONDS)
    # 3. The business that was switched into is closed at once, until a WaziPOS admin
    #    reactivates it (Admin -> Entities -> details -> Activate).
    set_entity_active(switched_to, False, reason="its owner reported a business switch they did not make")
    cache.set(done_key, True, REPORT_MAX_AGE)

    reporter_ip, _ = _device(request)
    when = payload.get("at", "")[:16].replace("T", " ")
    summary = (f"{user.email or user.phone} reported a business switch they did not make: to {switched_to.title} "
               f"at {when} (from {payload.get('dev') or 'unknown device'}, IP {payload.get('ip') or '?'}).")
    try:
        from utils.logging import create_log

        create_log("warning", f"SECURITY entity switch reported: user {user.pk} -> {switched_to.pk}; report from IP {reporter_ip}")
    except Exception:
        pass

    # 3. Alerts: WaziPOS admins, the business's admins, and the user.
    def build():
        from django.db.models import Q

        staff = list(models.Users.objects.filter(Q(is_staff=True) | Q(is_superuser=True), is_active=True)[:25])
        deliver_to_users(staff, f"Security: unrecognised business switch — {switched_to.title}",
                         [summary, f"{switched_to.title} has been DEACTIVATED, the account was moved back and switching is blocked for 24 hours.",
                          "Check the access logs, contact the owner, then reactivate it from Admin → Entities when it's safe."],
                         push=True, data={"type": "security", "user": str(user.pk)})
        deliver_to_entity(switched_to, f"Security notice for {switched_to.title}",
                          [f"Someone switched into {switched_to.title} using {user.email or 'an owner account'} and the account holder says it wasn't them.",
                           "Review recent sales, stock changes and staff in WaziPOS. WaziPOS support has been alerted."])
        deliver_to_users([user], "We've secured your WaziPOS account",
                         ["Thanks for reporting the business switch you didn't make.",
                          f"Your account is back on {(previous or user.entity).title if (previous or user.entity) else 'your previous business'} and switching is blocked for 24 hours.",
                          "Change your password now — anyone who knows it can still sign in until you do."],
                         sms=True, sms_text="WaziPOS: we secured your account after your report. Change your password now.")

    later(build)
    return True, ("Thank you. " + f"{switched_to.title} has been deactivated so no one can use it. "
                  + ("Your account was moved back to your previous business. " if moved_back else "")
                  + "Business switching is blocked for 24 hours and WaziPOS has been alerted. Change your password now.")


def _email_switch(user, entity, previous, request):
    """Tell the account holder their account switched business (security notice)."""
    from django.utils import timezone

    from core.notify import deliver_to_users, later

    when = timezone.localtime(timezone.now()).strftime("%d %b %Y, %H:%M")
    ip, device = _device(request)
    name = (user.first_name or "").strip().title() or "there"
    lines = [
        f"Hello {name},",
        f"Your WaziPOS account switched to {entity.title} ({_label(entity.entity_type)}) on {when}"
        + (f", from {previous.title}." if previous is not None else "."),
        "You can now see and manage its sales, stock, staff and settings in the app.",
    ]
    if device or ip:
        lines.append("Signed in from: " + " · ".join(x for x in (device, f"IP {ip}" if ip else None) if x))
    lines.append(f"Wasn't you? Report it here — we'll move your account back and block switching: {report_link(user, entity, previous, ip, device)}")
    later(lambda: deliver_to_users(
        [user], f"You switched to {entity.title} on WaziPOS", lines,
        email=True, push=True, data={"type": "entity_switch", "entity": str(entity.id)},
    ))


def switch_my_entity(user, data, request=None):
    entity = _entity_for(user, data)
    _check_lock(user)
    previous = user.entity if user.entity_id else None

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
        _ensure_owner_role(user, entity)
        # Sent after the switch is saved (core.notify.later runs on commit).
        try:
            _email_switch(user, entity, previous, request)
        except Exception:
            pass  # a notice must never undo the switch

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
