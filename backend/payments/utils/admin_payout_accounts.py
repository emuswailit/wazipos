# payments/utils/admin_payout_accounts.py
#
# Platform-admin management of PayoutAccounts across all entities (the older
# Create/UpdatePayoutAccount actions only touch the caller's own entity).
#
# Payload shape for create / update:
#   {"action": "...", "payout_account_id": "<id, update only>",
#    "payout_account_details": {entity, account_type, account_name,
#        account_number, account_code, business_number, description,
#        is_active, is_verified}}
#
# Only one account per entity is active: PayoutAccounts.save() switches the
# entity's other accounts off when this one is saved active.
#
# Scope: adminsPaymentsAPIView (AdminsOnlyPermissions) also admits every
# entity super admin, so these functions scope by caller:
#   platform admin (is_staff / superuser / "Admin" role) -> every entity, may verify;
#   anyone else -> only their own entity, can't verify; editing the payout
#   destination of a verified account makes it unverified again.

from django.db import transaction
from django.db.models import Q

from authentication.models import Entities
from payments.models import PayoutAccounts

ACCOUNT_TYPES = {choice for choice, _ in PayoutAccounts.ACCOUNT_TYPE}
# Paybill payments need the paybill (business) number as well as the account.
NEEDS_BUSINESS_NUMBER = {"PAYBILL"}

TRUE_VALUES = {"true", "1", "yes", "on"}
# Changing any of these changes where the money goes.
DESTINATION_FIELDS = ("account_type", "account_number", "business_number", "account_code")


def is_platform_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return user.roles.filter(value="Admin").exists()


def _bool_str(value, default="false"):
    """PayoutAccounts.is_active is a "true"/"false" CharField."""
    if value is None or value == "":
        return default
    return "true" if str(value).strip().lower() in TRUE_VALUES else "false"


def _clean(value):
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def admin_list_payout_accounts(data, user):
    qs = (
        PayoutAccounts.objects
        .select_related("entity", "owner", "verified_by", "account_entity")
        .order_by("-created")
    )
    if not is_platform_admin(user):
        qs = qs.filter(entity_id=user.entity_id)

    search = _clean(data.get("search"))
    if search:
        qs = qs.filter(
            Q(account_name__icontains=search)
            | Q(account_number__icontains=search)
            | Q(business_number__icontains=search)
            | Q(account_code__icontains=search)
            | Q(entity__title__icontains=search)
        )

    entity = _clean(data.get("entity"))
    if entity:
        qs = qs.filter(entity_id=entity)

    account_type = _clean(data.get("account_type"))
    if account_type:
        qs = qs.filter(account_type=account_type.upper())

    is_active = _clean(data.get("is_active"))
    if is_active:
        qs = qs.filter(is_active=_bool_str(is_active))

    return qs


def _validate(details, instance=None):
    """Returns (errors, cleaned_fields)."""
    errors = []
    fields = {}

    def pick(key):
        # On update, a missing key keeps the stored value.
        if key in details:
            return _clean(details.get(key))
        return getattr(instance, key, None) if instance else None

    entity_id = pick("entity") if "entity" in details else (
        str(instance.entity_id) if instance and instance.entity_id else None
    )
    entity = None
    if not entity_id:
        errors.append("Entity is required")
    else:
        entity = Entities.objects.filter(id=entity_id).first()
        if not entity:
            errors.append("Entity does not exist")
    fields["entity"] = entity

    account_type = (pick("account_type") or "").upper()
    if not account_type:
        errors.append("Account type is required")
    elif account_type not in ACCOUNT_TYPES:
        errors.append(
            f"Account type must be one of: {', '.join(sorted(ACCOUNT_TYPES))}"
        )
    fields["account_type"] = account_type

    account_name = pick("account_name")
    if not account_name:
        errors.append("Account name is required")
    fields["account_name"] = account_name

    account_number = pick("account_number")
    if not account_number:
        errors.append("Account number is required")
    fields["account_number"] = account_number

    business_number = pick("business_number")
    if account_type in NEEDS_BUSINESS_NUMBER and not business_number:
        errors.append("Business (paybill) number is required for a paybill account")
    fields["business_number"] = business_number

    fields["account_code"] = pick("account_code")
    fields["description"] = pick("description")

    if entity and account_number:
        dupes = PayoutAccounts.objects.filter(
            entity=entity, account_number=account_number,
            business_number=business_number,
        )
        if instance:
            dupes = dupes.exclude(pk=instance.pk)
        if dupes.exists():
            errors.append(f"{entity.title} already has this payout account")

    return errors, fields


def admin_create_payout_account(data, user):
    details = dict(data.get("payout_account_details") or {})
    platform = is_platform_admin(user)
    if not platform:
        # Entity admins add accounts for their own entity only, unverified.
        details["entity"] = str(user.entity_id) if user.entity_id else ""
        details["is_verified"] = "false"
    errors, fields = _validate(details)
    if errors:
        return errors, None

    is_verified = _bool_str(details.get("is_verified")) == "true"
    with transaction.atomic():
        account = PayoutAccounts.objects.create(
            **fields,
            is_active=_bool_str(details.get("is_active"), default="true"),
            is_verified=is_verified,
            verified_by=user if is_verified else None,
            owner=user,
        )
    return [], account


def admin_update_payout_account(data, user):
    account_id = _clean(data.get("payout_account_id"))
    if not account_id:
        return ["Payout account ID is required"], None
    platform = is_platform_admin(user)
    account = PayoutAccounts.objects.filter(id=account_id).first()
    if not account or (not platform and account.entity_id != user.entity_id):
        return ["Payout account does not exist"], None

    details = dict(data.get("payout_account_details") or {})
    if not platform:
        details.pop("entity", None)        # can't move it to another entity
        details.pop("is_verified", None)   # only platform admins verify
    errors, fields = _validate(details, instance=account)
    if errors:
        return errors, None

    destination_changed = any(
        (fields.get(f) or None) != (getattr(account, f) or None) for f in DESTINATION_FIELDS
    )
    for key, value in fields.items():
        setattr(account, key, value)
    if destination_changed and "is_verified" not in details:
        account.is_verified = False
        account.verified_by = None
    if "is_active" in details:
        account.is_active = _bool_str(details.get("is_active"))
    if "is_verified" in details:
        verified = _bool_str(details.get("is_verified")) == "true"
        if verified and not account.is_verified:
            account.verified_by = user
        if not verified:
            account.verified_by = None
        account.is_verified = verified

    with transaction.atomic():
        account.save()
    return [], account
