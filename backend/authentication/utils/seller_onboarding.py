# authentication/utils/seller_onboarding.py
#
# Shoppers can sign up with just an email (Google / Facebook): a "sketch"
# account under WAZIPOS that can shop. Before someone opens their own shop
# they must complete a seller profile:
#   phone · identity document type (National ID / passport) · document number
#   · an uploaded copy of the document (mandatory)
# Then CreateMyBusiness creates the entity, makes them its owner and super
# admin, moves them onto it and returns fresh tokens (so the app sees the new
# roles straight away).

from django.db import transaction
from rest_framework import exceptions

from authentication import models
from core.utils import normalize_phone

SELF_SERVICE_TYPES = {
    "GeneralRetailer": "Shop / retail store",
    "PharmaceuticalRetailer": "Pharmacy",
    "GeneralWholesaler": "Wholesaler",
    "PharmaceuticalWholesaler": "Pharmaceutical wholesaler",
    "Restaurant": "Restaurant / eatery",
    "Hotel": "Hotel / lodge (rooms + restaurant)",
    "InternetServiceProvider": "Wi-Fi hotspot (business or shared home internet)",
    "GeneralDistributor": "Distributor",
    "PharmaceuticalDistributor": "Pharmaceutical distributor",
    "GeneralManufacturer": "Manufacturer",
    "PharmaceuticalManufacturer": "Pharmaceutical manufacturer",
    "Publisher": "Book publisher",
    "Church": "Church / place of worship",
    "Courier": "Courier / delivery company",
    "Facilitator": "Lender / credit facilitator (licensed)",
}
# Every self-opened business waits for WaziPOS to approve it (onboarding app);
# the free month starts on approval.
ID_TYPES = ("NationalId", "Passport")


def _document_on_file(user):
    if user.identifier_type not in ID_TYPES:
        return None
    return (
        models.UserDocuments.objects.filter(owner=user, document_type=user.identifier_type)
        .exclude(document="")
        .order_by("-created")
        .first()
    )


def seller_readiness(user, request=None):
    """What the user still needs before opening a shop."""
    from authentication.utils.admin_users import consent_status

    missing = []
    if not normalize_phone(user.phone or ""):
        missing.append("phone")
    if user.identifier_type not in ID_TYPES:
        missing.append("identifier_type")
    if not (user.identifier_number or "").strip():
        missing.append("identifier_number")
    doc = _document_on_file(user)
    if not doc:
        missing.append("document")
    doc_url = None
    if doc and doc.document:
        try:
            doc_url = request.build_absolute_uri(doc.document.url) if request else doc.document.url
        except Exception:
            doc_url = None
    # Every business the user owns (they can run several; the current one is user.entity).
    from entitylocations.models import Locations

    owned = list(models.Entities.objects.filter(owner=user).exclude(entity_type__in=["Default", "Bank"]).order_by("title"))
    located = set(Locations.objects.filter(entity__in=owned, point__isnull=False).values_list("entity_id", flat=True))
    try:
        from onboarding.models import EntityApprovals

        approvals = dict(EntityApprovals.objects.filter(entity__in=owned).values_list("entity_id", "status"))
    except Exception:
        approvals = {}
    businesses = [
        {
            "id": str(e.id),
            "title": e.title,
            "entity_type": e.entity_type,
            "type_label": SELF_SERVICE_TYPES.get(e.entity_type, e.entity_type),
            "town": e.town,
            "current": e.id == user.entity_id,
            "has_location": e.id in located,
            "approval": approvals.get(e.id),
        }
        for e in owned
    ]
    return {
        "ready": not missing,
        "missing": missing,
        "phone": user.phone,
        "identifier_type": user.identifier_type if user.identifier_type in ID_TYPES else None,
        "identifier_number": user.identifier_number,
        "document_url": doc_url,
        "consent_status": consent_status(user),
        "businesses": businesses,
        "business_types": [{"value": k, "label": v} for k, v in SELF_SERVICE_TYPES.items()],
    }


def complete_seller_profile(data, files, user):
    """Save phone + identity document (copy mandatory). Returns (errors, consent_note)."""
    from authentication.utils.admin_users import request_contact_consent

    get = lambda k: str(data.get(k) or "").strip()
    errors = []
    phone = normalize_phone(get("phone"))
    if not phone:
        errors.append("Enter a valid phone number, e.g. 0712345678")
    elif models.Users.objects.filter(phone__in={phone, "0" + phone[3:], "+" + phone}).exclude(id=user.id).exists():
        errors.append("Another account already uses this phone number")
    id_type = get("identifier_type")
    if id_type not in ID_TYPES:
        errors.append("Pick your identity document: National ID or passport")
    id_number = get("identifier_number")
    if not id_number:
        errors.append("Enter your document number")
    elif models.Users.objects.filter(identifier_number__iexact=id_number).exclude(id=user.id).exists():
        errors.append("This ID / passport number is registered to another account")
    document = files.get("document") if files else None
    same_doc_on_file = (
        id_type == user.identifier_type
        and id_number.lower() == (user.identifier_number or "").lower()
        and _document_on_file(user) is not None
    )
    if not document and not same_doc_on_file:
        errors.append("Upload a photo or scan of your ID / passport")
    if errors:
        return errors, None

    phone_changed = phone != normalize_phone(user.phone or "")
    with transaction.atomic():
        user.phone = phone
        user.identifier_type = id_type
        user.identifier_number = id_number
        user.save()
        if document:
            doc = models.UserDocuments.objects.create(owner=user, document=document, document_type=id_type, document_number=id_number)
            user.documents.add(doc)

    note = None
    if phone_changed:
        sms_errors, _ = request_contact_consent(user)
        note = sms_errors[0] if sms_errors else "Consent code sent by SMS"
    return [], note


def create_my_business(data, user):
    """Open one of the user's shops (they may own several). Returns (errors, entity)."""
    from authentication.utils import utils

    readiness = seller_readiness(user)
    if not readiness["ready"]:
        labels = {"phone": "phone number", "identifier_type": "ID type", "identifier_number": "ID number", "document": "copy of your ID / passport"}
        return ["Complete your seller profile first: " + ", ".join(labels[m] for m in readiness["missing"])], None

    details = dict(data.get("entity_details") or {})
    entity_type = str(details.get("entity_type") or "")
    if entity_type not in SELF_SERVICE_TYPES:
        return ["Pick what kind of business this is"], None
    # The location is mandatory: buyers, the shop front and deliveries find the
    # business by it. (Best set on the premises with the device's location.)
    try:
        lat, lng = float(details.get("latitude")), float(details.get("longitude"))
    except (TypeError, ValueError):
        return ["Set the business location on the map"], None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180) or (lat == 0 and lng == 0):
        return ["Set a valid business location on the map"], None
    details["latitude"], details["longitude"] = lat, lng
    details["owner"] = None  # always the caller
    details.setdefault("entity_ownership", "PRIVATE")
    details["entity_type"] = entity_type
    payload = {"entity_details": details}

    errors = utils.validate_create_local_entity_data(payload, user)
    if errors:
        return errors, None
    try:
        with transaction.atomic():
            entity = utils.create_local_entity(payload, user)
            utils.create_super_admin_role(entity)
            user.entity = entity
            user.save()
            from onboarding.services import open_setup

            open_setup(entity, user)
    except exceptions.ValidationError as e:
        detail = e.detail
        if isinstance(detail, dict):
            detail = detail.get("errors", detail)
        return [str(x) for x in (detail if isinstance(detail, list) else [detail])], None
    return [], entity
