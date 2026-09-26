# retailers/services/product_requests.py
#
# Product requests dispatcher.
#
# Return-tuple shapes:
#
#     ("success",  message, payload, payload_key)  → wrapped in custom_success_message
#     ("paginated", {count, next, previous, results}) → emitted raw by the view
#     ("error",    message, errors)                 → wrapped in custom_errors_response
#
# List endpoints use the "paginated" shape so the response body matches
# DRF's PageNumberPagination output exactly, identical to the receipts
# endpoints the frontend already consumes.
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

import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination

from retailers.models import (
    RetailerProductRequest,
    RetailerProductRequestItem,
    RetailerProductRequestItemWholesaler,
    RetailerProductRequestOffer,
    RetailerProductRequestResponse,
    RetailerIndent,
    RetailerIndentItem
)
from retailers.services.product_requests_respond import (
    wholesaler_respond_to_request,
)

logger = logging.getLogger(__name__)


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
# Pagination
# =========================================================

class BodyPageNumberPagination(PageNumberPagination):
    """
    PageNumberPagination variant that reads `page` and `page_size`
    from the JSON request body instead of the query string.

    The entire product-requests API is POST + JSON, so query params
    are unavailable. `next` and `previous` still point at the same
    endpoint — the client keeps sending the body and bumps `page`.
    """

    page_size = 20
    max_page_size = 200

    def get_page_number(self, request, paginator):
        if request is None:
            return 1
        try:
            value = request.data.get(self.page_query_param)
            return max(1, int(value)) if value is not None else 1
        except (TypeError, ValueError):
            return 1

    def get_page_size(self, request):
        if request is None:
            return self.page_size
        try:
            value = request.data.get("page_size")
            if value is None:
                return self.page_size
            size = int(value)
            return max(1, min(size, self.max_page_size))
        except (TypeError, ValueError):
            return self.page_size


def _paginate(queryset, request, serializer) -> dict:
    """
    Apply BodyPageNumberPagination and return the DRF-standard dict:

        {"count": N, "next": url|null, "previous": url|null, "results": [...]}

    `serializer` is a callable that takes a list of model instances
    and returns a list of dicts.

    When `request` is None (unit tests), the envelope is produced
    with `next`/`previous` set to None.
    """
    paginator = BodyPageNumberPagination()
    page = paginator.paginate_queryset(queryset, request)

    if page is None:
        items = list(queryset)
        return {
            "count": len(items),
            "next": None,
            "previous": None,
            "results": serializer(items),
        }

    payload = serializer(page)

    if request is not None:
        return paginator.get_paginated_response(payload).data

    return {
        "count": paginator.page.paginator.count,
        "next": None,
        "previous": None,
        "results": payload,
    }


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
    """
    if user is None:
        return []

    raw_roles = user.roles.all()
    if not raw_roles:
        return []

    role_list = list(raw_roles)

    out: list[str] = []
    for entry in role_list:
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
    if not raw_roles:
        return None

    role_list = list(raw_roles)

    for entry in role_list:
        value = getattr(entry, "value", "") or ""
        entity = getattr(entry, "entity", None)

        tokens = _split_role_value(value)
        if entity and any(t in WHOLESALER_ROLES for t in tokens):
            return str(getattr(entity, "pk", entity))

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


def _prefetch_for_list():
    """Shared prefetch chain for request-list queries."""
    from django.db.models import Prefetch

    return Prefetch(
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


# =========================================================
# Handlers
# =========================================================

def handle_create_request(user, data, request=None):
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
                    "product_id": "db635cbd-bc49-4d37-9655-e70fa11fe21d",
                    "requested_quantity": 21,
                    "urgency": "medium",
                    "note": "",
                    "target_wholesaler_ids": [
                        "10df5e17-7c55-44f9-b762-ed5dfda323b7",
                        "165f2dd8-f092-42c9-afa1-f32260bc11f7"
                    ]
                }
            ]
        }

    Success payload (key "request"):
        {
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "request_number": "PR0000000002"
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


def handle_get_my_requests(user, data, request=None):
    """
    Retailer fetches their own product requests.

    Sample request:
        {
            "action": "GetMyRequests",
            "status": "PUBLISHED",
            "page": 1,
            "page_size": 20
        }

    Response (raw paginated envelope):
        {
            "count": 42,
            "next": "https://.../product-requests?page=2",
            "previous": null,
            "results": [ ...RetailerProductRequest shapes... ]
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

    qs = RetailerProductRequest.objects.filter(entity_id=entity_id)

    status_filter = data.get("status")
    if status_filter:
        qs = qs.filter(status=str(status_filter).upper())

    qs = qs.prefetch_related(_prefetch_for_list()).order_by("-created")

    paginated = _paginate(
        qs, request, lambda rows: [_serialize_request(r) for r in rows]
    )

    return ("paginated", paginated)


def handle_get_wholesaler_tagged_requests(user, data, request=None):
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

    Response (raw paginated envelope):
        {
            "count": 42,
            "next": "https://.../product-requests?page=2",
            "previous": null,
            "results": [ ...WholesalerProductRequest shapes... ]
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

    qs = qs.prefetch_related(_prefetch_for_list()).order_by("-created")

    paginated = _paginate(
        qs, request, lambda rows: [_serialize_request(r) for r in rows]
    )

    return ("paginated", paginated)


def handle_get_request_details(user, data, request=None):
    """
    Fetch details for a single request (either role).

    Sample request:
        {
            "action": "GetRequestDetails",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf"
        }

    Success payload (key "request"):
        {
            "request": { ...full RetailerProductRequest with items... }
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

    try:
        req = RetailerProductRequest.objects.prefetch_related(
            _prefetch_for_list()
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


def handle_create_offer(user, data, request=None):
    """
    Wholesaler submits an offer on a specific request line.

    Sample request:
        {
            "action": "CreateOffer",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "line_id": "9d2dafa2-bdf6-48c7-94c2-f3accb636e9c",
            "offered_quantity": 21,
            "offered_unit_price": 8.00,
            "note": ""
        }

    Success payload (key "offer"):
        {
            "offer_id": "f2a1a2b3-...",
            "status": "OFFERED"
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


def handle_withdraw_offer(user, data, request=None):
    """
    Wholesaler withdraws a previously submitted offer.

    Sample request:
        {
            "action": "WithdrawOffer",
            "offer_id": "f2a1a2b3-..."
        }

    Success payload (key "offer"):
        {
            "offer_id": "f2a1a2b3-...",
            "status": "WITHDRAWN"
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


def handle_confirm_offers(user, data, request=None):
    """
    Retailer confirms / declines offers on their request.

    On confirmation:
      - Each accepted offer flips to CONFIRMED.
      - A RetailerIndentItem is appended to the retailer's open
        indent (creating the indent if none exists), tagged with
        source='PRODUCT_REQUEST' and the source request + offer so
        the trace is intact.
      - The indent totals recompute.
      - The request status recomputes.

    Declinations alone do NOT touch the indent. Only confirmed
    offers create indent items. A submit with zero confirmations
    is a pure decline — the request status updates, no indent work.

    Sample request:
        {
            "action": "ConfirmOffers",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "confirmations": [
                { "offer_id": "f2a1a2b3-...", "response_note": "" }
            ],
            "declinations": [
                { "offer_id": "f9e8d7c6-...", "reason": "out of budget" }
            ],
            "note": ""
        }

    Success payload (key "request"):
        {
            "request_id": "a54de545-...",
            "confirmed_offer_count": 1,
            "declined_offer_count": 1,
            "indent_id": "…",            # null when nothing confirmed
            "created_new_indent": true,  # true if created now
            "items_added": 1,
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
    accepted_offers = []  # collected for the indent builder below

    # Indent result — populated only when confirmations exist.
    indent_id = None
    created_new_indent = False
    items_added = 0

    try:
        with transaction.atomic():
            # ---------------- Confirmations ----------------
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
                accepted_offers.append(offer)
                confirmed_count += 1

            # ---------------- Declinations ----------------
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

            # ---------------- Indent construction ----------------
            # Only touch the indent when there is at least one
            # accepted offer. Pure-declination submits skip this
            # block entirely.
            if accepted_offers:
                # Lock the indent row (or the absence of one) so
                # concurrent ConfirmOffers calls for the same
                # retailer serialise. NOTE: select_for_update()
                # does not lock when no row matches. If two
                # submits race before an indent exists, both may
                # create one. Add a partial unique index on
                # (entity, is_open='true') or lock the entity row
                # itself to close this.
                indent = (
                    RetailerIndent.objects.select_for_update()
                    .filter(
                        entity=req.entity,
                        # Adjust to is_open=True if the model uses
                        # BooleanField instead of CharField.
                        is_open="true",
                    )
                    .order_by("-created")
                    .first()
                )

                if indent is None:
                    indent = RetailerIndent.objects.create(
                        entity=req.entity,
                        is_open="true",
                        owner=request.user
                    )
                    created_new_indent = True

                for offer in accepted_offers:
                    # request_item.product_id is the FK column
                    # value (UUID). Adjust to `.product` if the
                    # field is a plain UUIDField rather than a
                    # ForeignKey.
                    line_product_id = (
                        offer.request_item.product_id
                    )

                    RetailerIndentItem.objects.create(
                        retailer_indent=indent,
                        source="PRODUCT_REQUEST",
                        product_request=req,
                        product_request_offer=offer,
                        wholesale_receipt=offer.wholesaler_receipt,
                        required_quantity=offer.offered_quantity,
                        total_quantity=offer.offered_quantity,
                        final_supplier_unit_selling_price=offer.offered_unit_price,
                        supplier_unit_selling_price=(
                            offer.offered_unit_price
                        ),
                        manufacture_date=offer.manufacture_date,
                        expiry_date=offer.expiry_date,
                    )
                    items_added += 1

                # Recompute derived totals (total_cost, profit,
                # over_budget, active_item_count, has_items).
                if hasattr(indent, "recompute_totals"):
                    indent.recompute_totals()
                    indent.save()

                indent_id = str(indent.id)

            # ---------------- Recounts ----------------
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
            "indent_id": indent_id,
            "created_new_indent": created_new_indent,
            "items_added": items_added,
        },
        "request",
    )


def handle_cancel_request(user, data, request=None):
    """
    Retailer cancels an entire request.

    Sample request:
        {
            "action": "CancelRequest",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "reason": "no longer needed"
        }

    Success payload (key "request"):
        {
            "request_id": "a54de545-...",
            "status": "CANCELLED"
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


def handle_cancel_request_item(user, data, request=None):
    """
    Retailer cancels a single line on a request.

    Sample request:
        {
            "action": "CancelRequestItem",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "item_id": "9d2dafa2-bdf6-48c7-94c2-f3accb636e9c",
            "reason": "duplicate"
        }

    Success payload (key "request"):
        {
            "request_id": "a54de545-...",
            "cancelled_item_id": "9d2dafa2-..."
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


def handle_respond(user, data, request=None):
    """
    Wholesaler responds to a request with accepted / rejected lines.

    Sample request:
        {
            "action": "Respond",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "note": "",
            "accepted_lines": [
                {
                    "item_id": "9d2dafa2-bdf6-48c7-94c2-f3accb636e9c",
                    "receipt_id": "0a1b2c3d-..."
                }
            ],
            "rejected_lines": [
                { "item_id": "5e6f7a8b-..." }
            ]
        }

    Success payload (key "response"):
        {
            "response_id": "f2a1a2b3-...",
            "offered_line_count": 1,
            "rejected_line_count": 1
        }

    Rules enforced by the backend:
        - at least one line must be accepted or rejected
        - every accepted line requires exactly one of
          `receipt_id` or `receipt` (not both)
        - every item_id must belong to this request
        - a line cannot appear in both accepted_lines and rejected_lines
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

def product_requests_dispatch(user, data, request=None):
    """
    Route a product-requests action.

    Return tuples:
        ("success",  message, payload, payload_key)   — wrapped by the view
        ("paginated", paginated_dict)                 — emitted raw by the view
        ("error",    message, errors)                 — wrapped by the view
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

    return handler(user, data, request)