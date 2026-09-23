# retailers/services/product_requests.py
#
# Product requests dispatcher.
#
# Role access pattern:
#   roles = _get_user_roles(user)      # flatten to list[str]
#   if not any(r in roles for r in WHOLESALER_ROLES):
#       return ("error", "...", {})
#
# -----------------------------------------------------------------------
# ACTION MAP
#
#   CreateRequest               — retailer creates a new request
#   GetMyRequests               — retailer fetches their own requests
#   GetWholesalerTaggedRequests — wholesaler fetches requests targeting them
#   GetRequestDetails           — either side fetches one request
#   CreateOffer                 — wholesaler submits an offer on a line
#   WithdrawOffer               — wholesaler retracts a submitted offer
#   ConfirmOffers               — retailer confirms / declines offers
#   CancelRequest               — retailer cancels an entire request
#   CancelRequestItem           — retailer cancels a single line
#   Respond                     — wholesaler accepts / rejects lines
# -----------------------------------------------------------------------

from __future__ import annotations
from utils.logging import create_log
import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from retailers.models import (
    RetailerProductRequest,
    RetailerProductRequestItem,
    RetailerProductRequestItemWholesaler,
    RetailerProductRequestOffer,
    RetailerProductRequestResponse,
)
from retailers.services.product_requests_respond import (
    wholesaler_respond_to_request,
)

logger = logging.getLogger(__name__)


# =========================================================
# Role constants — individual tokens
# =========================================================

# =========================================================
# Role constants
# =========================================================

RETAILER_ROLES = (
    
    "GeneralRetailerSuperAdmin",
    "PharmaceuticalRetailerSuperAdmin",
)

WHOLESALER_ROLES = (

    "GeneralWholesalerSuperAdmin",
    "PharmaceuticalWholesalerSuperAdmin",
)


# =========================================================
# Role utilities
# =========================================================

def _split_role_value(raw) -> list[str]:
    """Split a pipe-separated role value into individual tokens."""
    if raw is None:
        return []

    if isinstance(raw, (list, tuple, set)):
        out: list[str] = []
        for item in raw:
            out.extend(_split_role_value(item))
        return out

    s = str(raw).strip()
    if not s:
        return []

    if "||" in s:
        parts = s.split("||")
    elif "|" in s:
        parts = s.split("|")
    elif "," in s:
        parts = s.split(",")
    else:
        parts = [s]

    return [p.strip() for p in parts if p.strip()]


def _get_user_roles(user) -> list[str]:
    """
    Flatten every role token the user holds into one array.

    Handles every shape `user.roles` may take:
      - Django reverse FK manager (user.roles.all())
      - A QuerySet
      - A plain list of role model instances
      - A list of dicts (JWT-decoded shape)
    """
    if user is None:
        return []

    raw_roles = user.roles.all()
    if raw_roles is None:
        return []


    # Cache the iterable once so we don't issue multiple queries.
    try:
        role_list = list(raw_roles)
    except TypeError:
        return []

    out: list[str] = []
    for entry in role_list:
        if isinstance(entry, dict):
            value = entry.get("value")
        else:
            value = getattr(entry, "value", None)

        if value:
            out.extend(_split_role_value(value))

    return out
# =========================================================
# Shared helpers
# =========================================================

def _resolve_entity_id(user) -> str | None:
    """
    Return the caller's entity UUID, preferring the wholesaler
    role's entity when the user holds one.
    """
    if user is None:
        return None

    for attr in ("entity_id", "entity"):
        v = getattr(user, attr, None)
        if v:
            return str(getattr(v, "pk", v))

    raw_roles = user.roles.all()
    if raw_roles is None:
        return None

    role_list = list(raw_roles)

    # Prefer the wholesaler role's entity.
    for entry in role_list:
        value = getattr(entry, "value", "") or ""
        entity = getattr(entry, "entity", None)

        tokens = _split_role_value(value)
        if entity and any(t in WHOLESALER_ROLES for t in tokens):
            return str(getattr(entity, "pk", entity))

    # Fall back to any role with an entity.
    for entry in role_list:
        entity = getattr(entry, "entity", None)
        if entity:
            return str(getattr(entity, "pk", entity))

    return None


def _to_decimal(value, default=None):
    if value is None or value == "":
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return default


def _status_display(obj, field="status") -> str:
    getter = getattr(obj, f"get_{field}_display", None)
    if callable(getter):
        try:
            return str(getter())
        except Exception:
            pass
    return str(getattr(obj, field, ""))


def _serialize_item(item) -> dict:
    target_pairs = (
        item.target_pairs
        .filter(is_active=True)
        .select_related("wholesaler")
    )
    targets = list(target_pairs)
    offers = list(item.offers.all())

    return {
        "id": str(item.id),
        "request": str(item.request_id),
        "product": str(item.product_id),
        "product_title": getattr(
            getattr(item, "product", None), "title", ""
        ),
        "requested_quantity": item.requested_quantity,
        "urgency": item.urgency,
        "urgency_display": _status_display(item, "urgency"),
        "note": item.note or "",
        "status": item.status,
        "status_display": _status_display(item, "status"),
        "offer_count": item.offer_count,
        "total_offered_quantity": item.total_offered_quantity,
        "confirmed_quantity": item.confirmed_quantity,
        "target_wholesaler_ids": [
            str(p.wholesaler_id) for p in targets
        ],
        "target_wholesalers": [
            {
                "id": str(p.wholesaler_id),
                "title": getattr(p.wholesaler, "title", ""),
            }
            for p in targets
        ],
        "offers": [
            {
                "id": str(o.id),
                "wholesaler": str(o.wholesaler_id),
                "wholesaler_title": getattr(
                    getattr(o, "wholesaler", None), "title", ""
                ),
                "offered_quantity": o.offered_quantity,
                "offered_unit_price": (
                    str(o.offered_unit_price)
                    if o.offered_unit_price is not None
                    else None
                ),
                "status": o.status,
                "status_display": _status_display(o, "status"),
                "wholesaler_receipt": (
                    str(o.wholesaler_receipt_id)
                    if o.wholesaler_receipt_id
                    else None
                ),
                "wholesaler_receipt_title": getattr(
                    getattr(o, "wholesaler_receipt", None),
                    "title",
                    "",
                ),
                "batch": o.batch,
                "expiry_date": (
                    str(o.expiry_date) if o.expiry_date else None
                ),
                "created": str(o.created),
                "updated": str(o.updated),
            }
            for o in offers
        ],
        "created": str(item.created),
        "updated": str(item.updated),
    }


def _serialize_request(req) -> dict:
    items = list(req.items.all())

    return {
        "id": str(req.id),
        "draft_id": getattr(req, "draft_id", None),
        "request_number": req.request_number,
        "entity": str(req.entity_id),
        "entity_title": getattr(req, "entity_title", ""),
        "urgency": req.urgency,
        "urgency_display": _status_display(req, "urgency"),
        "note": req.note or "",
        "status": req.status,
        "status_display": _status_display(req, "status"),
        "total_line_count": req.total_line_count,
        "fulfilled_line_count": req.fulfilled_line_count,
        "pending_line_count": req.pending_line_count,
        "expires_at": (
            str(req.expires_at) if req.expires_at else None
        ),
        "fulfilled_at": (
            str(req.fulfilled_at) if req.fulfilled_at else None
        ),
        "cancelled_at": (
            str(req.cancelled_at) if req.cancelled_at else None
        ),
        "created": str(req.created),
        "updated": str(req.updated),
        "items": [_serialize_item(i) for i in items],
    }


# =========================================================
# Handlers
# =========================================================

def handle_create_request(user, data):
    """
    Retailer creates a new product request.

    Sample request:
        {
            "action": "CreateRequest",
            "urgency": "medium",
            "note": "Please supply asap",
            "draft_id": "user-123:db635cbd-...:1789751110596",
            "items": [
                {
                    "product_id": "db635cbd-...",
                    "requested_quantity": 21,
                    "urgency": "medium",
                    "note": "",
                    "target_wholesaler_ids": [
                        "10df5e17-...", "165f2dd8-..."
                    ]
                }
            ]
        }
    """
    roles = _get_user_roles(user)
    if not any(r in roles for r in RETAILER_ROLES):
        return ("error", "Only retailers can create requests", {})

    entity_id = _resolve_entity_id(user)
    if not entity_id:
        return (
            "error",
            "No retailer entity attached to this account",
            {},
        )

    raw_items = data.get("items") or []
    if not isinstance(raw_items, list) or len(raw_items) == 0:
        return (
            "error",
            "A request must contain at least one line",
            {"items": "Provide at least one item."},
        )

    urgency = str(data.get("urgency", "medium")).lower()
    if urgency not in ("low", "medium", "high"):
        urgency = "medium"
    note = str(data.get("note", "") or "")
    draft_id = data.get("draft_id")

    try:
        with transaction.atomic():
            req = RetailerProductRequest.objects.create(
                entity_id=entity_id,
                owner=user,
                urgency=urgency,
                note=note,
                draft_id=draft_id,
                status=RetailerProductRequest.Status.PUBLISHED,
            )

            for index, item in enumerate(raw_items):
                product_id = item.get("product_id")
                if not product_id:
                    raise ValueError(
                        f"Item #{index + 1} is missing product_id."
                    )

                try:
                    qty = int(item.get("requested_quantity"))
                except (TypeError, ValueError):
                    raise ValueError(
                        f"Item #{index + 1} has an invalid requested_quantity."
                    )
                if qty <= 0:
                    raise ValueError(
                        f"Item #{index + 1} requested_quantity must be > 0."
                    )

                line_urgency = str(
                    item.get("urgency", urgency)
                ).lower()
                if line_urgency not in ("low", "medium", "high"):
                    line_urgency = urgency

                line = RetailerProductRequestItem.objects.create(
                    request=req,
                    product_id=product_id,
                    requested_quantity=qty,
                    urgency=line_urgency,
                    note=str(item.get("note", "") or ""),
                    draft_id=item.get("draft_id"),
                    owner=user,
                    entity_id=entity_id,
                    status=RetailerProductRequestItem.Status.PENDING,
                )

                target_ids = item.get("target_wholesaler_ids") or []
                for wid in target_ids:
                    RetailerProductRequestItemWholesaler.objects.create(
                        request_item=line,
                        wholesaler_id=wid,
                        is_active=True,
                    )

                line.recalculate(save=True)

            req.recalculate(save=True)

    except ValueError as e:
        return (
            "error",
            "Request could not be created",
            {"detail": str(e)},
        )

    return (
        "success",
        "Request created",
        {
            "request_id": str(req.id),
            "request_number": req.request_number,
        },
        "request",
    )


def handle_get_my_requests(user, data):
    """
    Retailer fetches their own product requests.

    Sample request:
        {
            "action": "GetMyRequests",
            "status": "PUBLISHED",
            "page": 1,
            "page_size": 20
        }
    """
    roles = _get_user_roles(user)
    if not any(r in roles for r in RETAILER_ROLES):
        return (
            "error",
            "Only retailers can fetch their own requests",
            {},
        )

    entity_id = _resolve_entity_id(user)
    if not entity_id:
        return (
            "error",
            "No retailer entity attached to this account",
            {},
        )

    from django.db.models import Prefetch

    qs = RetailerProductRequest.objects.filter(entity_id=entity_id)

    status_filter = data.get("status")
    if status_filter:
        qs = qs.filter(status=str(status_filter).upper())

    try:
        page = max(1, int(data.get("page", 1)))
    except (TypeError, ValueError):
        page = 1

    try:
        page_size = int(data.get("page_size", 20))
    except (TypeError, ValueError):
        page_size = 20
    page_size = max(1, min(page_size, 200))

    start = (page - 1) * page_size
    end = start + page_size

    qs = qs.prefetch_related(
        Prefetch(
            "items",
            queryset=RetailerProductRequestItem.objects.select_related(
                "product"
            ).prefetch_related(
                "offers",
                Prefetch(
                    "target_pairs",
                    queryset=RetailerProductRequestItemWholesaler.objects.select_related(
                        "wholesaler"
                    ).filter(is_active=True),
                ),
            ),
        )
    ).order_by("-created")

    total = qs.count()
    page_items = list(qs[start:end])
    payload = [_serialize_request(r) for r in page_items]

    return (
        "success",
        "My product requests",
        {
            "requests": payload,
            "total": total,
            "page": page,
            "page_size": page_size,
        },
        "data",
    )


def handle_get_wholesaler_tagged_requests(user, data):
    """
    Wholesaler fetches requests where their entity is a target.

    Sample request:
        {
            "action": "GetWholesalerTaggedRequests",
            "status": "PUBLISHED",
            "urgency": "high",
            "page": 1,
            "page_size": 20
        }
    """
    roles = _get_user_roles(user)
    if not any(r in roles for r in WHOLESALER_ROLES):
        return (
            "error",
            "Only wholesalers can fetch tagged requests",
            {},
        )

    entity_id = _resolve_entity_id(user)
    if not entity_id:
        return (
            "error",
            "No wholesaler entity attached to this account",
            {},
        )

    from django.db.models import Prefetch

    qs = RetailerProductRequest.objects.filter(
        items__target_pairs__wholesaler_id=entity_id,
        items__target_pairs__is_active=True,
    ).distinct()

    status_filter = data.get("status")
    if status_filter:
        qs = qs.filter(status=str(status_filter).upper())

    urgency_filter = data.get("urgency")
    if urgency_filter:
        qs = qs.filter(urgency=str(urgency_filter).lower())

    try:
        page = max(1, int(data.get("page", 1)))
    except (TypeError, ValueError):
        page = 1

    try:
        page_size = int(data.get("page_size", 20))
    except (TypeError, ValueError):
        page_size = 20
    page_size = max(1, min(page_size, 200))

    start = (page - 1) * page_size
    end = start + page_size

    qs = qs.prefetch_related(
        Prefetch(
            "items",
            queryset=RetailerProductRequestItem.objects.select_related(
                "product"
            ).prefetch_related(
                "offers",
                Prefetch(
                    "target_pairs",
                    queryset=RetailerProductRequestItemWholesaler.objects.select_related(
                        "wholesaler"
                    ).filter(is_active=True),
                ),
            ),
        )
    ).order_by("-created")

    total = qs.count()
    page_items = list(qs[start:end])
    payload = [_serialize_request(r) for r in page_items]

    return (
        "success",
        "Wholesaler tagged requests",
        {
            "wholesaler_product_requests": payload,
            "total": total,
            "page": page,
            "page_size": page_size,
        },
        "data",
    )


def handle_get_request_details(user, data):
    """
    Fetch details for a single request (either role).

    Sample request:
        {
            "action": "GetRequestDetails",
            "request_id": "a54de545-..."
        }
    """
    roles = _get_user_roles(user)

    is_retailer = any(r in roles for r in RETAILER_ROLES)
    is_wholesaler = any(r in roles for r in WHOLESALER_ROLES)

    if not (is_retailer or is_wholesaler):
        return ("error", "Not authorized to view requests", {})

    request_id = data.get("request_id")
    if not request_id:
        return (
            "error",
            "Request could not be loaded",
            {"request_id": "This field is required."},
        )

    from django.db.models import Prefetch

    try:
        req = RetailerProductRequest.objects.prefetch_related(
            Prefetch(
                "items",
                queryset=RetailerProductRequestItem.objects.select_related(
                    "product"
                ).prefetch_related(
                    "offers",
                    Prefetch(
                        "target_pairs",
                        queryset=RetailerProductRequestItemWholesaler.objects.select_related(
                            "wholesaler"
                        ).filter(is_active=True),
                    ),
                ),
            )
        ).get(id=request_id)
    except RetailerProductRequest.DoesNotExist:
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    entity_id = _resolve_entity_id(user)

    if is_retailer:
        if str(req.entity_id) != str(entity_id):
            return (
                "error",
                "Request not found",
                {"request_id": "Not found."},
            )
    else:
        is_target = RetailerProductRequestItemWholesaler.objects.filter(
            request_item__request=req,
            wholesaler_id=entity_id,
            is_active=True,
        ).exists()
        if not is_target:
            return (
                "error",
                "Request not found",
                {"request_id": "Not found."},
            )

    return (
        "success",
        "Request details",
        {"request": _serialize_request(req)},
        "request",
    )


def handle_create_offer(user, data):
    """
    Wholesaler submits an offer on a specific request line.

    Sample request:
        {
            "action": "CreateOffer",
            "request_id": "a54de545-...",
            "line_id": "9d2dafa2-...",
            "offered_quantity": 21,
            "offered_unit_price": 8.00,
            "note": ""
        }
    """
    roles = _get_user_roles(user)
    if not any(r in roles for r in WHOLESALER_ROLES):
        return ("error", "Only wholesalers can submit offers", {})

    entity_id = _resolve_entity_id(user)
    if not entity_id:
        return (
            "error",
            "No wholesaler entity attached to this account",
            {},
        )

    request_id = data.get("request_id")
    line_id = data.get("line_id")
    note = str(data.get("note", "") or "")

    if not request_id or not line_id:
        return (
            "error",
            "Offer could not be recorded",
            {
                "request_id": "Required." if not request_id else None,
                "line_id": "Required." if not line_id else None,
            },
        )

    try:
        qty = int(data.get("offered_quantity"))
    except (TypeError, ValueError):
        qty = None
    if qty is None or qty <= 0:
        return (
            "error",
            "Offer could not be recorded",
            {"offered_quantity": "Must be a positive integer."},
        )

    price = _to_decimal(data.get("offered_unit_price"))
    if price is not None and price <= 0:
        return (
            "error",
            "Offer could not be recorded",
            {"offered_unit_price": "Must be greater than zero."},
        )

    try:
        req = RetailerProductRequest.objects.get(id=request_id)
    except RetailerProductRequest.DoesNotExist:
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    try:
        line = RetailerProductRequestItem.objects.get(
            id=line_id, request=req
        )
    except RetailerProductRequestItem.DoesNotExist:
        return (
            "error",
            "Line not found on this request",
            {"line_id": "Not found."},
        )

    is_target = RetailerProductRequestItemWholesaler.objects.filter(
        request_item=line,
        wholesaler_id=entity_id,
        is_active=True,
    ).exists()
    if not is_target:
        return (
            "error",
            "You are not a target of this request line",
            {"line_id": "Not targeted."},
        )

    if req.status in (
        RetailerProductRequest.Status.CANCELLED,
        RetailerProductRequest.Status.EXPIRED,
        RetailerProductRequest.Status.FULFILLED,
    ):
        return (
            "error",
            "This request is no longer accepting offers",
            {"request_id": f"Status is {req.status}."},
        )

    with transaction.atomic():
        offer, _created = (
            RetailerProductRequestOffer.objects.update_or_create(
                request_item=line,
                wholesaler_id=entity_id,
                defaults={
                    "offered_quantity": qty,
                    "offered_unit_price": price,
                    "response_note": note,
                    "responded_by_user": user,
                    "responded_at": timezone.now(),
                    "status": RetailerProductRequestOffer.Status.OFFERED,
                },
            )
        )
        line.recalculate(save=True)
        req.recalculate(save=True)

    return (
        "success",
        "Offer recorded",
        {
            "offer_id": str(offer.id),
            "status": offer.status,
        },
        "offer",
    )


def handle_withdraw_offer(user, data):
    """
    Wholesaler withdraws a previously submitted offer.

    Sample request:
        {
            "action": "WithdrawOffer",
            "offer_id": "f2a1a2b3-..."
        }
    """
    roles = _get_user_roles(user)
    if not any(r in roles for r in WHOLESALER_ROLES):
        return ("error", "Only wholesalers can withdraw offers", {})

    entity_id = _resolve_entity_id(user)
    if not entity_id:
        return (
            "error",
            "No wholesaler entity attached to this account",
            {},
        )

    offer_id = data.get("offer_id")
    if not offer_id:
        return (
            "error",
            "Offer could not be withdrawn",
            {"offer_id": "This field is required."},
        )

    try:
        offer = RetailerProductRequestOffer.objects.select_related(
            "request_item", "request_item__request"
        ).get(id=offer_id)
    except RetailerProductRequestOffer.DoesNotExist:
        return (
            "error",
            "Offer not found",
            {"offer_id": "Not found."},
        )

    if str(offer.wholesaler_id) != str(entity_id):
        return (
            "error",
            "Offer not found",
            {"offer_id": "Not found."},
        )

    if offer.status in (
        RetailerProductRequestOffer.Status.CONFIRMED,
        RetailerProductRequestOffer.Status.FULFILLED,
    ):
        return (
            "error",
            "This offer has already been confirmed and cannot be withdrawn",
            {},
        )

    line = offer.request_item
    req = line.request

    with transaction.atomic():
        offer.status = RetailerProductRequestOffer.Status.WITHDRAWN
        offer.save(update_fields=["status", "updated"])
        line.recalculate(save=True)
        req.recalculate(save=True)

    return (
        "success",
        "Offer withdrawn",
        {
            "offer_id": str(offer.id),
            "status": offer.status,
        },
        "offer",
    )


def handle_confirm_offers(user, data):
    """
    Retailer confirms / declines offers on their request.

    Sample request:
        {
            "action": "ConfirmOffers",
            "request_id": "a54de545-...",
            "confirmations": [{"offer_id": "f2a1a2b3-..."}],
            "declinations":  [{"offer_id": "f9e8d7c6-...", "reason": "out of budget"}]
        }
    """
    roles = _get_user_roles(user)
    if not any(r in roles for r in RETAILER_ROLES):
        return ("error", "Only retailers can confirm offers", {})

    entity_id = _resolve_entity_id(user)
    if not entity_id:
        return (
            "error",
            "No retailer entity attached to this account",
            {},
        )

    request_id = data.get("request_id")
    if not request_id:
        return (
            "error",
            "Request could not be updated",
            {"request_id": "This field is required."},
        )

    confirmations = data.get("confirmations") or []
    declinations = data.get("declinations") or []

    if not confirmations and not declinations:
        return ("error", "Nothing to confirm or decline", {})

    try:
        req = RetailerProductRequest.objects.get(id=request_id)
    except RetailerProductRequest.DoesNotExist:
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    if str(req.entity_id) != str(entity_id):
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    confirmed_count = 0
    declined_count = 0
    touched_items = set()

    try:
        with transaction.atomic():
            for entry in confirmations:
                offer_id = entry.get("offer_id")
                if not offer_id:
                    raise ValueError(
                        "Each confirmation requires offer_id."
                    )

                try:
                    offer = RetailerProductRequestOffer.objects.select_related(
                        "request_item"
                    ).get(
                        id=offer_id,
                        request_item__request=req,
                    )
                except RetailerProductRequestOffer.DoesNotExist:
                    raise ValueError(
                        f"Offer {offer_id} does not belong to this request."
                    )

                offer.status = (
                    RetailerProductRequestOffer.Status.CONFIRMED
                )
                offer.retailer_response_note = str(
                    entry.get("response_note", "") or ""
                )
                offer.retailer_confirmed_at = timezone.now()
                offer.save(
                    update_fields=[
                        "status",
                        "retailer_response_note",
                        "retailer_confirmed_at",
                        "updated",
                    ]
                )
                touched_items.add(offer.request_item_id)
                confirmed_count += 1

            for entry in declinations:
                offer_id = entry.get("offer_id")
                if not offer_id:
                    raise ValueError(
                        "Each declination requires offer_id."
                    )

                try:
                    offer = RetailerProductRequestOffer.objects.select_related(
                        "request_item"
                    ).get(
                        id=offer_id,
                        request_item__request=req,
                    )
                except RetailerProductRequestOffer.DoesNotExist:
                    raise ValueError(
                        f"Offer {offer_id} does not belong to this request."
                    )

                offer.status = (
                    RetailerProductRequestOffer.Status.DECLINED_BY_RETAILER
                )
                offer.retailer_response_note = str(
                    entry.get("reason", "") or ""
                )
                offer.save(
                    update_fields=[
                        "status",
                        "retailer_response_note",
                        "updated",
                    ]
                )
                touched_items.add(offer.request_item_id)
                declined_count += 1

            for item_id in touched_items:
                try:
                    item = RetailerProductRequestItem.objects.get(
                        id=item_id
                    )
                    item.recalculate(save=True)
                except RetailerProductRequestItem.DoesNotExist:
                    pass

            req.recalculate(save=True)

    except ValueError as e:
        return (
            "error",
            "Request could not be updated",
            {"detail": str(e)},
        )

    return (
        "success",
        "Offers processed",
        {
            "request_id": str(req.id),
            "confirmed_offer_count": confirmed_count,
            "declined_offer_count": declined_count,
        },
        "request",
    )


def handle_cancel_request(user, data):
    """
    Retailer cancels an entire request.

    Sample request:
        {
            "action": "CancelRequest",
            "request_id": "a54de545-...",
            "reason": "no longer needed"
        }
    """
    roles = _get_user_roles(user)
    if not any(r in roles for r in RETAILER_ROLES):
        return ("error", "Only retailers can cancel requests", {})

    entity_id = _resolve_entity_id(user)
    if not entity_id:
        return (
            "error",
            "No retailer entity attached to this account",
            {},
        )

    request_id = data.get("request_id")
    if not request_id:
        return (
            "error",
            "Request could not be cancelled",
            {"request_id": "This field is required."},
        )

    try:
        req = RetailerProductRequest.objects.get(id=request_id)
    except RetailerProductRequest.DoesNotExist:
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    if str(req.entity_id) != str(entity_id):
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    if req.status == RetailerProductRequest.Status.CANCELLED:
        return (
            "success",
            "Request already cancelled",
            {
                "request_id": str(req.id),
                "status": "CANCELLED",
            },
            "request",
        )

    if req.status == RetailerProductRequest.Status.FULFILLED:
        return (
            "error",
            "Fulfilled requests cannot be cancelled",
            {},
        )

    reason = data.get("reason")

    with transaction.atomic():
        req.status = RetailerProductRequest.Status.CANCELLED
        req.cancelled_at = timezone.now()
        if reason:
            req.note = f"{req.note}\nCancelled: {reason}".strip()
        req.save(
            update_fields=[
                "status",
                "cancelled_at",
                "note",
                "updated",
            ]
        )

    return (
        "success",
        "Request cancelled",
        {
            "request_id": str(req.id),
            "status": "CANCELLED",
        },
        "request",
    )


def handle_cancel_request_item(user, data):
    """
    Retailer cancels a single line on a request.

    Sample request:
        {
            "action": "CancelRequestItem",
            "request_id": "a54de545-...",
            "item_id": "9d2dafa2-...",
            "reason": "duplicate"
        }
    """
    roles = _get_user_roles(user)
    if not any(r in roles for r in RETAILER_ROLES):
        return ("error", "Only retailers can cancel lines", {})

    entity_id = _resolve_entity_id(user)
    if not entity_id:
        return (
            "error",
            "No retailer entity attached to this account",
            {},
        )

    request_id = data.get("request_id")
    item_id = data.get("item_id")
    if not request_id or not item_id:
        return (
            "error",
            "Line could not be cancelled",
            {
                "request_id": "Required." if not request_id else None,
                "item_id": "Required." if not item_id else None,
            },
        )

    try:
        req = RetailerProductRequest.objects.get(id=request_id)
    except RetailerProductRequest.DoesNotExist:
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    if str(req.entity_id) != str(entity_id):
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    try:
        line = RetailerProductRequestItem.objects.get(
            id=item_id, request=req
        )
    except RetailerProductRequestItem.DoesNotExist:
        return (
            "error",
            "Line not found",
            {"item_id": "Not found."},
        )

    if line.status == RetailerProductRequestItem.Status.FULFILLED:
        return ("error", "Fulfilled lines cannot be cancelled", {})

    with transaction.atomic():
        line.status = RetailerProductRequestItem.Status.CANCELLED
        line.save(update_fields=["status", "updated"])
        req.recalculate(save=True)

    return (
        "success",
        "Line cancelled",
        {
            "request_id": str(req.id),
            "cancelled_item_id": str(line.id),
        },
        "request",
    )


def handle_respond(user, data):
    """
    Wholesaler responds to a request with accepted / rejected lines.

    Sample request:
        {
            "action": "Respond",
            "request_id": "a54de545-...",
            "note": "",
            "accepted_lines": [
                {"item_id": "9d2dafa2-...", "receipt_id": "0a1b2c3d-..."}
            ],
            "rejected_lines": [
                {"item_id": "5e6f7a8b-..."}
            ]
        }
    """
    roles = _get_user_roles(user)
    if not any(r in roles for r in WHOLESALER_ROLES):
        return (
            "error",
            "Only wholesalers can respond to requests",
            {},
        )

    request_id = data.get("request_id")
    if not request_id:
        return (
            "error",
            "Response could not be recorded",
            {"request_id": "This field is required."},
        )

    try:
        req = RetailerProductRequest.objects.get(id=request_id)
    except RetailerProductRequest.DoesNotExist:
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    accepted_lines = data.get("accepted_lines", []) or []
    rejected_lines = data.get("rejected_lines", []) or []
    note = data.get("note", "") or ""

    if not accepted_lines and not rejected_lines:
        return (
            "error",
            "Response must accept or reject at least one line",
            {},
        )

    for payload in accepted_lines:
        item_id = payload.get("item_id")
        if not item_id:
            return (
                "error",
                "Invalid accepted line",
                {"accepted_lines": "Each line requires item_id."},
            )

        has_receipt_id = bool(payload.get("receipt_id"))
        has_receipt_payload = isinstance(payload.get("receipt"), dict)

        if has_receipt_id and has_receipt_payload:
            return (
                "error",
                "Invalid accepted line",
                {
                    "accepted_lines": (
                        "Provide either receipt_id or receipt, not both."
                    )
                },
            )
        if not has_receipt_id and not has_receipt_payload:
            return (
                "error",
                "Invalid accepted line",
                {
                    "accepted_lines": (
                        "Each accepted line requires receipt_id or receipt."
                    )
                },
            )

        if not req.items.filter(id=item_id).exists():
            return (
                "error",
                "Line not found on this request",
                {
                    "accepted_lines": (
                        f"Item {item_id} does not belong to this request."
                    )
                },
            )

    for payload in rejected_lines:
        if not payload.get("item_id"):
            return (
                "error",
                "Invalid rejected line",
                {"rejected_lines": "Each line requires item_id."},
            )
        if not req.items.filter(id=payload["item_id"]).exists():
            return (
                "error",
                "Line not found on this request",
                {
                    "rejected_lines": (
                        f"Item {payload['item_id']} does not belong to this request."
                    )
                },
            )

    accepted_ids = {p["item_id"] for p in accepted_lines}
    rejected_ids = {p["item_id"] for p in rejected_lines}
    overlap = accepted_ids & rejected_ids
    if overlap:
        return (
            "error",
            "A line cannot be both accepted and rejected",
            {"overlap": list(overlap)},
        )

    try:
        response_obj, offered_count, rejected_count = (
            wholesaler_respond_to_request(
                request_obj=req,
                wholesaler_entity=user.entity,
                accepted_lines=accepted_lines,
                rejected_lines=rejected_lines,
                response_note=note,
                by_user=user,
            )
        )
    except ValueError as e:
        return (
            "error",
            "Response could not be recorded",
            {"detail": str(e)},
        )

    try:
        from analytics.realtime import push_request_response

        push_request_response(
            str(req.entity_id),
            {
                "request_id": str(req.id),
                "request_number": req.request_number,
                "wholesaler_id": str(user.entity_id),
                "wholesaler_title": user.entity.title,
                "offered_line_count": offered_count,
                "rejected_line_count": rejected_count,
                "note": note,
            },
        )
    except Exception:
        logger.exception("push_request_response failed")

    return (
        "success",
        "Response recorded",
        {
            "response_id": str(response_obj.id),
            "offered_line_count": offered_count,
            "rejected_line_count": rejected_count,
        },
        "response",
    )


# =========================================================
# Dispatcher
# =========================================================

def product_requests_dispatch(user, data):
    """
    Route a product-requests action.

    Each handler performs its own role check via _get_user_roles().
    """
    action = data.get("action")
    if not action:
        return ("error", "Action is not supplied", {})

    handlers = {
        "CreateRequest": handle_create_request,
        "GetMyRequests": handle_get_my_requests,
        "GetWholesalerTaggedRequests":
            handle_get_wholesaler_tagged_requests,
        "GetRequestDetails": handle_get_request_details,
        "CreateOffer": handle_create_offer,
        "WithdrawOffer": handle_withdraw_offer,
        "ConfirmOffers": handle_confirm_offers,
        "CancelRequest": handle_cancel_request,
        "CancelRequestItem": handle_cancel_request_item,
        "Respond": handle_respond,
    }

    handler = handlers.get(action)
    if handler is None:
        return ("error", f"Action {action} is unknown", {})

    return handler(user, data)