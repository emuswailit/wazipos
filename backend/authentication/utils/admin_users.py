# authentication/utils/admin_users.py
#
# Platform admins manage users: list, create, edit. A user can be attached to
# an entity (optional; default: the WAZIPOS entity) and may carry an identity
# document (National ID or passport — optional).
#
# Contact consent ("handshake"): whenever a user is created with, or given, a
# phone number, an SMS with a one-time code is sent to it. The code is the
# person's consent to SMS and calls from vendors and their staff on that
# number. It is confirmed when the person enters it (public ConfirmContactConsent)
# or reads it out to the staff member registering them (AdminConfirmConsent).
# Codes are stored hashed, expire, and allow a few attempts.
#
# Confirming the code also proves the phone is the person's: the user is marked
# phone-verified (phone_otp_verified, phone_verified_at). A new phone clears it.
#
# Email: a one-time link (hashed token, EMAIL_TOKEN_TTL) is emailed when a user is
# created with an email or the email changes; opening it (public ConfirmEmail)
# marks the email verified. Placeholder logins (<phone>@users.wazipos.co.ke) get none.

import secrets
from datetime import timedelta

from decouple import config
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import exceptions

from authentication import models
from core.utils import normalize_phone, send_email, send_sms
from utils.logging import create_log

CONSENT_TTL = timedelta(days=7)
CONSENT_MAX_ATTEMPTS = 5
# The web app is served at wazipos.co.ke (there is no app. subdomain).
APP_URL = str(config("WEB_APP_URL", default="https://wazipos.co.ke")).rstrip("/")
CONSENT_PAGE = f"{APP_URL}/consent"
API_URL = str(config("API_URL", default="https://api.wazipos.co.ke")).rstrip("/")
EMAIL_TOKEN_TTL = timedelta(days=3)
PLACEHOLDER_EMAIL_DOMAIN = "@users.wazipos.co.ke"
DEFAULT_ENTITY_TITLE = "WAZIPOS"


def is_platform_admin(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    # Platform admins are WaziPOS staff: is_staff or is_superuser (the "Admin" role alone does not count).
    return bool(user.is_staff or user.is_superuser)


def can_add_employees(user, entity) -> bool:
    """
    Only an entity's own super admin (a *SuperAdmin role held for that entity), or
    a platform admin, may add employees to it. Agents register people as users
    only; they never add staff to a business.
    """
    if not user or not user.is_authenticated or not entity:
        return False
    if is_platform_admin(user):
        return True
    return user.roles.filter(entity=entity, value__endswith="SuperAdmin").exists()


def default_entity():
    entity = models.Entities.objects.filter(title=DEFAULT_ENTITY_TITLE).first()
    if not entity:
        raise exceptions.APIException("The default WAZIPOS entity is not set up")
    return entity


# ---------------------------------------------------------------- consent

def _latest_consent(user):
    return models.ContactConsent.objects.filter(user=user).order_by("-created").first()


def consent_status(user) -> str:
    """NONE (no phone / never asked) · PENDING · EXPIRED · CONFIRMED · REVOKED — for the current phone."""
    if not user.phone:
        return "NONE"
    c = _latest_consent(user)
    if not c or c.phone != user.phone:
        return "NONE"
    if c.status == models.ContactConsent.Status.PENDING and c.expires_at and c.expires_at < timezone.now():
        return "EXPIRED"
    return c.status


def request_contact_consent(user, requested_by=None):
    """Send a fresh consent code to the user's phone. Returns (errors, consent)."""
    phone = normalize_phone(user.phone or "")
    if not phone:
        return ["The user has no valid phone number"], None
    code = f"{secrets.randbelow(10**6):06d}"
    with transaction.atomic():
        models.ContactConsent.objects.filter(user=user, status=models.ContactConsent.Status.PENDING).update(
            status=models.ContactConsent.Status.REVOKED
        )
        consent = models.ContactConsent.objects.create(
            user=user,
            phone=user.phone,
            code_hash=make_password(code),
            expires_at=timezone.now() + CONSENT_TTL,
            requested_by=requested_by,
        )
    message = (
        f"WaziPOS: {user.first_name.title() if user.first_name else 'Hello'}, your consent code is {code}. "
        f"Giving it to the staff member registering you, or entering it at {CONSENT_PAGE}, "
        "allows WaziPOS vendors and their staff to SMS and call this number. "
        "Ignore this message if you did not ask to register."
    )
    errors, _ = send_sms(phone, message)
    consent.sms_sent_at = timezone.now() if not errors else None
    consent.sms_error = "; ".join(errors)[:255] if errors else None
    consent.save(update_fields=["sms_sent_at", "sms_error", "updated"])
    if errors:
        create_log("error", f"Consent SMS to user {user.id} failed: {errors}")
        return [f"The consent SMS could not be sent: {errors[0]}"], consent
    return [], consent


def confirm_contact_consent(user, code, confirmed_by=None, via="USER"):
    """Check the code for the user's pending consent. Returns (errors, consent)."""
    consent = (
        models.ContactConsent.objects.filter(user=user, status=models.ContactConsent.Status.PENDING)
        .order_by("-created")
        .first()
    )
    if not consent:
        if consent_status(user) == models.ContactConsent.Status.CONFIRMED:
            return ["Consent was already given for this number"], None
        return ["There is no consent request waiting for this number; send a new code"], None
    if consent.expires_at and consent.expires_at < timezone.now():
        return ["That code has expired; send a new code"], None
    if consent.attempts >= CONSENT_MAX_ATTEMPTS:
        return ["Too many wrong codes; send a new code"], None
    if not check_password(str(code or "").strip(), consent.code_hash):
        consent.attempts += 1
        consent.save(update_fields=["attempts", "updated"])
        left = CONSENT_MAX_ATTEMPTS - consent.attempts
        return [f"That code is wrong ({left} attempt{'s' if left != 1 else ''} left)"], None
    consent.status = models.ContactConsent.Status.CONFIRMED
    consent.confirmed_at = timezone.now()
    consent.confirmed_by = confirmed_by
    consent.confirmed_via = via
    consent.save(update_fields=["status", "confirmed_at", "confirmed_by", "confirmed_via", "updated"])
    # The code reached this number and came back: the phone is the person's.
    if normalize_phone(user.phone or "") == normalize_phone(consent.phone or ""):
        user.phone_otp_verified = "true"
        user.phone_verified_at = consent.confirmed_at
        user.save(update_fields=["phone_otp_verified", "phone_verified_at"])
    return [], consent


# ---------------------------------------------------------------- email link

def has_real_email(user) -> bool:
    return bool(user.email) and not user.email.lower().endswith(PLACEHOLDER_EMAIL_DOMAIN)


def request_email_verification(user):
    """Email a one-time verification link. Returns (errors, sent)."""
    if not has_real_email(user):
        return ["This user has no email address"], False
    token = secrets.token_urlsafe(32)
    user.email_token_hash = make_password(token)
    user.email_token_expires_at = timezone.now() + EMAIL_TOKEN_TTL
    user.email_token_sent_at = timezone.now()
    user.save(update_fields=["email_token_hash", "email_token_expires_at", "email_token_sent_at"])
    # Opened on the API (always reachable), not the web app: verifyEmailLinkView.
    link = f"{API_URL}/api/v1/authentication/users/verify-email?u={user.id}&t={token}"
    name = user.first_name.title() if user.first_name else "there"
    body = (
        f"Hello {name},\n\n"
        f"Please confirm that {user.email} is your email address for WaziPOS:\n\n{link}\n\n"
        f"The link works for {EMAIL_TOKEN_TTL.days} days. If you did not expect this, ignore this email."
    )
    from core.email_layout import branded_html, button, paragraph

    html = branded_html(
        "Confirm your email",
        paragraph(f"Hello {name},")
        + paragraph(f"Please confirm that {user.email} is your email address for WaziPOS.")
        + button("Confirm my email", link)
        + paragraph(f"The link works for {EMAIL_TOKEN_TTL.days} days. If you did not expect this, ignore this email."),
    )
    try:
        errors, sent = send_email(to=user.email, subject="Confirm your email for WaziPOS", body=body, html_body=html)
    except Exception as e:  # never fail a save over email
        create_log("error", f"Email verification for {user.id} failed: {e}")
        return [str(e)], False
    return list(errors or []), bool(sent)


def my_verification(user):
    """Where the signed-in person's own phone and email verification stand."""
    latest = _latest_consent(user)
    return {
        "phone": user.phone,
        "phone_verified": str(user.phone_otp_verified).lower() == "true",
        "phone_code_pending": bool(latest and latest.status == models.ContactConsent.Status.PENDING),
        "phone_sms_error": latest.sms_error if latest and latest.status == "PENDING" else None,
        "email": user.email if has_real_email(user) else None,
        "has_email": has_real_email(user),
        "email_verified": str(user.is_email_verified).lower() == "true",
        "email_link_sent_at": user.email_token_sent_at.isoformat() if user.email_token_sent_at else None,
    }


def confirm_email(user_id, token):
    """Public: the person opened the emailed link. Returns (errors, user)."""
    user = models.Users.objects.filter(id=user_id).first() if user_id else None
    if not user or not token:
        return ["This link is not valid"], None
    if user.email_verified_at and not user.email_token_hash:
        return [], user  # already confirmed
    if not user.email_token_hash or not check_password(str(token), user.email_token_hash):
        return ["This link is not valid or was replaced by a newer one"], None
    if user.email_token_expires_at and user.email_token_expires_at < timezone.now():
        return ["This link has expired; ask for a new one"], None
    user.is_email_verified = "true"
    user.email_verified_at = timezone.now()
    user.email_token_hash = None
    user.email_token_expires_at = None
    user.save(update_fields=["is_email_verified", "email_verified_at", "email_token_hash", "email_token_expires_at"])
    return [], user


def confirm_consent_by_phone(phone, code):
    """Public handshake: the person enters the code they received."""
    number = normalize_phone(phone or "")
    if not number:
        return ["Enter the phone number the code was sent to"], None
    variants = {number, "0" + number[3:], "+" + number}
    user = (
        models.Users.objects.filter(phone__in=variants, contact_consents__status=models.ContactConsent.Status.PENDING)
        .distinct()
        .first()
    )
    if not user:
        return ["There is no consent request waiting for this number"], None
    return confirm_contact_consent(user, code, via="USER")


# ---------------------------------------------------------------- list / out

def admin_user_out(user, request=None):
    doc = user.documents.order_by("-created").first() if user.pk else None
    if not doc:
        doc = models.UserDocuments.objects.filter(owner=user).order_by("-created").first()
    document_url = None
    if doc and doc.document:
        try:
            document_url = request.build_absolute_uri(doc.document.url) if request else doc.document.url
        except Exception:
            document_url = None
    latest = _latest_consent(user)
    return {
        "id": str(user.id),
        "first_name": user.first_name,
        "middle_name": user.middle_name,
        "last_name": user.last_name,
        "name": " ".join(x for x in (user.first_name, user.middle_name, user.last_name) if x).title(),
        "email": user.email,
        "phone": user.phone,
        "gender": user.gender,
        "date_of_birth": user.date_of_birth.isoformat() if user.date_of_birth else None,
        "identifier_type": user.identifier_type if user.identifier_type in ("NationalId", "Passport") else None,
        "identifier_number": user.identifier_number,
        "document_url": document_url,
        "document_type": doc.document_type if doc else None,
        "entity": str(user.entity_id) if user.entity_id else None,
        "entity_title": user.entity.title if user.entity_id else None,
        "roles": [r.title for r in user.roles.all()],
        "is_active": bool(user.is_active),
        "is_staff": bool(user.is_staff),
        "registration_method": user.registration_method,
        "consent_status": consent_status(user),
        "consent_confirmed_at": latest.confirmed_at.isoformat() if latest and latest.confirmed_at else None,
        "consent_sms_error": latest.sms_error if latest and latest.status == "PENDING" else None,
        "phone_verified": str(user.phone_otp_verified).lower() == "true",
        "phone_verified_at": user.phone_verified_at.isoformat() if user.phone_verified_at else None,
        "has_email": has_real_email(user),
        "email_verified": str(user.is_email_verified).lower() == "true",
        "email_verified_at": user.email_verified_at.isoformat() if user.email_verified_at else None,
        "email_link_sent_at": user.email_token_sent_at.isoformat() if user.email_token_sent_at else None,
        "has_payout_account": _has_payout_account(user),
        "created": user.created_at.isoformat() if user.created_at else None,
    }


def _has_payout_account(user):
    from payments.models import UserPayoutAccounts

    return UserPayoutAccounts.objects.filter(user=user, is_active="true").exists() if user.pk else False


def admin_list_users(data):
    qs = models.Users.objects.select_related("entity").prefetch_related("roles").order_by("-created_at")
    q = str(data.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q)
            | Q(phone__icontains=q) | Q(identifier_number__icontains=q) | Q(entity__title__icontains=q)
        )
    if data.get("entity"):
        qs = qs.filter(entity_id=data["entity"])
    limit = min(int(data.get("limit") or 500), 2000)
    return qs[:limit]


# ---------------------------------------------------------------- save

def _clean(data, key):
    v = data.get(key)
    return str(v).strip() if v not in (None, "") else ""


def admin_save_user(data, files, admin, user=None, creating_agent=None, entity_locked=False):
    """
    Create (user=None) or update a user. Returns (errors, user, consent_note).

    Agents (authentication/agents.py) pass creating_agent (recorded on new users)
    and entity_locked=True: a user an agent creates always starts on the default
    WAZIPOS entity, and an agent can never move a user to another entity. The
    user moves only when the agent creates a business for them (they become its
    owner, authentication/utils/agents.py create_entity). Adding staff to a
    business is for that business's super admin (employees, CreateEmployee).
    """
    errors = []
    first = _clean(data, "first_name")
    last = _clean(data, "last_name")
    if not first:
        errors.append("Enter the first name")
    if not last:
        errors.append("Enter the last name")

    raw_phone = _clean(data, "phone")
    phone = normalize_phone(raw_phone) if raw_phone else None
    if raw_phone and not phone:
        errors.append("Enter a valid Kenyan phone number")
    if not user and not phone:
        errors.append("Enter the phone number (the consent code is sent to it)")

    email = _clean(data, "email").lower()
    if email:
        clash = models.Users.objects.filter(email__iexact=email)
        if user:
            clash = clash.exclude(id=user.id)
        if clash.exists():
            errors.append("Another user already has this email")
    if phone:
        clash = models.Users.objects.filter(phone__in={phone, "0" + phone[3:], "+" + phone})
        if user:
            clash = clash.exclude(id=user.id)
        if clash.exists():
            errors.append("Another user already has this phone number")

    id_type = _clean(data, "identifier_type")
    if id_type and id_type not in ("NationalId", "Passport"):
        errors.append("Identity document must be a National ID or a passport")
    id_number = _clean(data, "identifier_number")
    if id_number and not id_type:
        errors.append("Pick the identity document type")
    document = files.get("document") if files else None
    if document and not id_type:
        errors.append("Pick the identity document type for the uploaded file")

    entity = None
    if entity_locked and _clean(data, "entity"):
        current = str(user.entity_id) if user and user.entity_id else ""
        if _clean(data, "entity") != current:
            errors.append(
                "Agents can't attach users to a business. New users join WAZIPOS; creating a business "
                "for a user makes them its owner, and staff are added by the business's super admin."
            )
    elif _clean(data, "entity"):
        entity = models.Entities.objects.filter(id=data["entity"]).first()
        if not entity:
            errors.append("Entity for provided ID does not exist")
    gender = _clean(data, "gender")
    if gender and gender not in ("Female", "Male", "Other"):
        errors.append("Pick a valid gender")
    dob = _clean(data, "date_of_birth") or None

    if errors:
        return errors, None, None

    creating = user is None
    phone_changed = False
    email_changed = False
    with transaction.atomic():
        if creating:
            client_role = models.Roles.objects.filter(value="Client").first()
            if not client_role:
                raise exceptions.APIException("System roles are not set up")
            # Email is the login id; people registered at a counter may not have one.
            login_email = email or f"{phone}@users.wazipos.co.ke"
            user = models.Users(
                email=login_email, registration_method="Agent" if creating_agent else "Admin",
                owner=admin, creating_agent=creating_agent,
            )
            user.set_unusable_password()
        else:
            if email and email != (user.email or "").lower():
                user.email = email
                email_changed = True
        user.first_name = first
        user.middle_name = _clean(data, "middle_name") or None
        user.last_name = last
        if phone and phone != normalize_phone(user.phone or ""):
            phone_changed = True
            user.phone = phone
            # A new number is not proven yet.
            user.phone_otp_verified = "false"
            user.phone_verified_at = None
        if email_changed:
            user.is_email_verified = "false"
            user.email_verified_at = None
        user.gender = gender or None
        user.date_of_birth = dob
        user.identifier_type = id_type or "false"
        user.identifier_number = id_number or None
        if entity_locked:
            # Agents: new users start on WAZIPOS; existing users keep their entity.
            target_entity = (user.entity if not creating and user.entity_id else None) or default_entity()
        else:
            target_entity = entity or (user.entity if not creating and user.entity_id else None) or default_entity()
        user.entity = target_entity
        if not user.country_id and target_entity.country_id:
            user.country_id = target_entity.country_id
        if "is_active" in data:
            user.is_active = str(data.get("is_active")).lower() in ("true", "1", "yes")
        if creating:
            user.accepted_terms = "false"
        user.save()
        if creating:
            user.roles.add(client_role)

        if document:
            doc = models.UserDocuments.objects.create(
                owner=user, document=document, document_type=id_type, document_number=id_number or None
            )
            user.documents.add(doc)

    note = None
    if creating or phone_changed:
        sms_errors, _ = request_contact_consent(user, requested_by=admin)
        note = sms_errors[0] if sms_errors else "Consent code sent by SMS"
    # Email ownership is confirmed later, from the emailed link.
    if (creating and has_real_email(user)) or email_changed:
        request_email_verification(user)
    return [], user, note
