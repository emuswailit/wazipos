# retailers/services/product_requests.py
#
# Domain layer for product requests.
#
# Every handler takes `(user, data, role)` and returns one of:
#
#   ("success", message, payload, payload_key)
#   ("error", message, errors)
#
# The HTTP view wraps these in the project's response envelopes.
# Non-HTTP callers (management commands, tasks, tests) can call
# `product_requests_dispatch` directly.

from collections import defaultdict
from datetime import timedelta

from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination

from authentication.models import Entities
from products.models import Products
from core.constants import (
    REQUEST_EXPIRY_DAYS,
    WHOLESALER_ENTITY_TYPES,
)
from retailers.models import (
    RetailerProductRequest,
    RetailerProductRequestItem,
    RetailerProductRequestItemWholesaler,
    RetailerProductRequestOffer,
)
from retailers.querysets import (
    tagged_items_for_wholesaler,
    tagged_requests_for_wholesaler,
)
from retailers.serializers import (
    RetailerProductRequestListSerializer,
    RetailerProductRequestSerializer,
    WholesalerFacingDetailSerializer,
    WholesalerFacingListSerializer,
    WholesalerFacingOfferSerializer,
)
from retailers.services.request_confirmation import retailer_confirm_offers


# =====================================================================
# Public dispatcher
# =====================================================================

def product_requests_dispatch(user, data):
    """
    Route a product-requests action.

    Returns a 4-tuple:
        ("success", message, payload, payload_key)
        ("error", message, errors)
    """
    action = data.get("action")
    if not action:
        return ("error", "Action is not supplied", {})

    role = _resolve_role(user)

    handlers = {
        "CreateRequest": handle_create_request,
        "GetMyRequests": handle_get_my_requests,
        "GetWholesalerTaggedRequests": handle_get_wholesaler_tagged_requests,
        "GetRequestDetails": handle_get_request_details,
        "CreateOffer": handle_create_offer,
        "WithdrawOffer": handle_withdraw_offer,
        "ConfirmOffers": handle_confirm_offers,
        "CancelRequest": handle_cancel_request,
        "CancelRequestItem": handle_cancel_request_item,
    }

    handler = handlers.get(action)
    if handler is None:
        return ("error", f"Action {action} is unknown", {})

    return handler(user, data, role)


# =====================================================================
# Role
# =====================================================================

def _resolve_role(user):
    """
    Return "wholesaler", "retailer", or "unknown".
    """
    entity = getattr(user, "entity", None)
    entity_type = getattr(entity, "entity_type", None) if entity else None

    if entity_type in WHOLESALER_ENTITY_TYPES:
        return "wholesaler"

    if entity_type:
        return "retailer"

    return "unknown"


def _require_retailer(role):
    if role == "wholesaler":
        return ("error", "Not authorised", {"detail": "Retailers only."})
    return None


def _require_wholesaler(role):
    if role != "wholesaler":
        return ("error", "Not authorised", {"detail": "Wholesalers only."})
    return None


# =====================================================================
# CreateRequest
# =====================================================================

def handle_create_request(user, data, role):
    denied = _require_retailer(role)
    if denied:
        return denied

    items = data.get("items", [])
    urgency = data.get("urgency", "medium")
    note = data.get("note", "")
    draft_id = data.get("draft_id") or None

    if not items:
        return (
            "error",
            "Request could not be created",
            {"items": "At least one line is required."},
        )

    product_ids = [it.get("product_id") for it in items]
    products = {
        str(p.id): p
        for p in Products.objects.filter(id__in=product_ids)
    }

    for idx, it in enumerate(items):
        pid = str(it.get("product_id") or "")
        if not pid:
            return (
                "error",
                "Request could not be created",
                {"items": f"Line {idx + 1}: product_id required."},
            )
        if pid not in products:
            return (
                "error",
                "Request could not be created",
                {"items": f"Line {idx + 1}: product {pid} not found."},
            )
        try:
            qty = int(it.get("requested_quantity", 0))
        except (TypeError, ValueError):
            qty = 0
        if qty <= 0:
            return (
                "error",
                "Request could not be created",
                {
                    "items": (
                        f"Line {idx + 1}: requested_quantity must be > 0."
                    )
                },
            )

    # Idempotency by draft_id.
    if draft_id:
        existing = (
            RetailerProductRequest.objects
            .filter(draft_id=draft_id, entity=user.entity)
            .first()
        )
        if existing is not None:
            existing.recalculate(save=True)
            return (
                "success",
                "Request already submitted",
                RetailerProductRequestSerializer(existing).data,
                "request",
            )

    # Validate target wholesaler ids.
    all_target_ids = set()
    for it in items:
        for wid in (it.get("target_wholesaler_ids") or []):
            all_target_ids.add(str(wid))

    valid_wholesaler_ids = set()
    if all_target_ids:
        valid_wholesaler_ids = {
            str(x)
            for x in Entities.objects.filter(
                id__in=list(all_target_ids),
                entity_type__in=WHOLESALER_ENTITY_TYPES,
                is_active=True,
            ).values_list("id", flat=True)
        }

    # Pairs already open for this retailer.
    existing_open_pairs = {
        (str(pid), str(wid))
        for pid, wid in (
            RetailerProductRequestItemWholesaler.objects
            .filter(
                request_item__request__entity=user.entity,
                request_item__request__status__in=[
                    RetailerProductRequest.Status.PUBLISHED,
                    RetailerProductRequest.Status.ACKNOWLEDGED,
                    RetailerProductRequest.Status.PARTIALLY_FULFILLED,
                ],
                request_item__status__in=[
                    RetailerProductRequestItem.Status.PENDING,
                    RetailerProductRequestItem.Status.OFFERED,
                    RetailerProductRequestItem.Status.PARTIALLY_FULFILLED,
                ],
                is_active=True,
            )
            .values_list(
                "request_item__product_id",
                "wholesaler_id",
            )
        )
    }

    lines_to_create = []
    skipped_lines = []

    for idx, it in enumerate(items):
        pid = str(it["product_id"])

        requested_targets = [
            str(wid)
            for wid in (it.get("target_wholesaler_ids") or [])
        ]

        fresh_targets = [
            wid
            for wid in requested_targets
            if wid in valid_wholesaler_ids
            and (pid, wid) not in existing_open_pairs
        ]

        if not fresh_targets:
            skipped_lines.append({
                "index": idx,
                "product_id": pid,
                "requested_targets": requested_targets,
                "reason": (
                    "Product is already on an open request for "
                    "every selected wholesaler."
                ),
            })
            continue

        lines_to_create.append({
            **it,
            "target_wholesaler_ids": fresh_targets,
        })

    if not lines_to_create:
        return (
            "error",
            (
                "All products are already on an open request for "
                "the selected wholesalers"
            ),
            {"skipped": skipped_lines},
        )

    with transaction.atomic():
        req = RetailerProductRequest.objects.create(
            entity=user.entity,
            draft_id=draft_id,
            urgency=urgency,
            note=note,
            expires_at=timezone.now() + timedelta(days=REQUEST_EXPIRY_DAYS),
            owner=user,
            status=RetailerProductRequest.Status.PUBLISHED,
        )

        for it in lines_to_create:
            item = RetailerProductRequestItem.objects.create(
                entity=user.entity,
                request=req,
                product=products[str(it["product_id"])],
                draft_id=draft_id,
                requested_quantity=int(it["requested_quantity"]),
                urgency=it.get("urgency", urgency),
                note=it.get("note", ""),
                owner=user,
            )

            per_item_ids = [
                str(wid)
                for wid in (it.get("target_wholesaler_ids") or [])
            ]

            if per_item_ids:
                now = timezone.now()
                RetailerProductRequestItemWholesaler.objects.bulk_create(
                    [
                        RetailerProductRequestItemWholesaler(
                            request_item=item,
                            wholesaler_id=wid,
                            notified_at=now,
                        )
                        for wid in per_item_ids
                    ],
                    ignore_conflicts=True,
                )

        req.recalculate(save=True)

    _fan_out_new_request(req)

    return (
        "success",
        "Request submitted",
        RetailerProductRequestSerializer(req).data,
        "request",
    )


def _fan_out_new_request(req):
    """
    Send one WS frame per tagged wholesaler, containing only the
    items that wholesaler was tagged on.
    """
    from analytics.realtime import push_new_product_request

    by_wholesaler = defaultdict(list)
    pairs = (
        RetailerProductRequestItemWholesaler.objects
        .filter(
            request_item__request=req,
            is_active=True,
        )
        .select_related("request_item__product")
    )
    for pair in pairs:
        by_wholesaler[str(pair.wholesaler_id)].append(pair.request_item)

    for wid, items_for_wholesaler in by_wholesaler.items():
        payload = {
            "request_id": str(req.id),
            "request_number": req.request_number,
            "urgency": req.urgency,
            "note": req.note,
            "line_count": len(items_for_wholesaler),
            "retailer_id": str(req.entity_id),
            "retailer_title": req.entity.title,
            "created": req.created.isoformat(),
            "items": [
                {
                    "item_id": str(item.id),
                    "product_id": str(item.product_id),
                    "product_title": item.product.title,
                    "requested_quantity": item.requested_quantity,
                    "urgency": item.urgency,
                    "note": item.note,
                }
                for item in items_for_wholesaler
            ],
        }
        push_new_product_request([wid], payload)


# =====================================================================
# GetMyRequests
# =====================================================================

def handle_get_my_requests(user, data, role):
    denied = _require_retailer(role)
    if denied:
        return denied

    qs = (
        RetailerProductRequest.objects
        .filter(entity=user.entity)
        .select_related("entity")
        .order_by("-created")
    )
    if data.get("status"):
        qs = qs.filter(status=data["status"])

    paginator = PageNumberPagination()
    page = paginator.paginate_queryset(qs, _page_request(user, data))
    serializer = RetailerProductRequestListSerializer(page, many=True)

    return (
        "success",
        "Requests retrieved",
        paginator.get_paginated_response(serializer.data).data,
        None,
    )


# =====================================================================
# GetWholesalerTaggedRequests
# =====================================================================

def handle_get_wholesaler_tagged_requests(user, data, role):
    denied = _require_wholesaler(role)
    if denied:
        return denied

    entity_id = user.entity_id
    qs = tagged_requests_for_wholesaler(entity_id)

    if data.get("status"):
        qs = qs.filter(status=data["status"])

    qs = qs.prefetch_related(
        Prefetch(
            "items",
            queryset=tagged_items_for_wholesaler(entity_id),
            to_attr="tagged_items",
        ),
    )

    paginator = PageNumberPagination()
    page = paginator.paginate_queryset(qs, _page_request(user, data))
    serializer = WholesalerFacingListSerializer(
        page,
        many=True,
        context={"wholesaler_id": entity_id},
    )

    return (
        "success",
        "Requests retrieved",
        paginator.get_paginated_response(serializer.data).data,
        None,
    )


# =====================================================================
# GetRequestDetails
# =====================================================================

def handle_get_request_details(user, data, role):
    request_id = data.get("request_id")
    draft_id = data.get("draft_id") or None

    if not request_id and not draft_id:
        return (
            "error",
            "Request could not be retrieved",
            {"request_id": "This field or draft_id is required."},
        )

    if role == "wholesaler":
        return _get_request_details_for_wholesaler(user, request_id)

    return _get_request_details_for_retailer(user, request_id, draft_id)


def _get_request_details_for_wholesaler(user, request_id):
    entity_id = user.entity_id
    req = (
        tagged_requests_for_wholesaler(entity_id)
        .filter(id=request_id)
        .prefetch_related(
            Prefetch(
                "items",
                queryset=tagged_items_for_wholesaler(entity_id),
                to_attr="tagged_items",
            ),
        )
        .first()
    )

    if req is None:
        return (
            "error",
            "Request not found",
            {
                "request_id": (
                    "Not found, not open, or not tagged to you."
                )
            },
        )

    return (
        "success",
        "Request retrieved",
        WholesalerFacingDetailSerializer(
            req,
            context={"wholesaler_id": entity_id},
        ).data,
        "request",
    )


def _get_request_details_for_retailer(user, request_id, draft_id):
    try:
        base_qs = (
            RetailerProductRequest.objects
            .filter(entity=user.entity)
            .prefetch_related(
                Prefetch(
                    "items",
                    queryset=(
                        RetailerProductRequestItem.objects
                        .select_related("product")
                        .prefetch_related(
                            Prefetch(
                                "target_pairs",
                                queryset=(
                                    RetailerProductRequestItemWholesaler
                                    .objects
                                    .filter(is_active=True)
                                    .select_related("wholesaler")
                                ),
                                to_attr="active_target_pairs",
                            ),
                        )
                    ),
                ),
                Prefetch(
                    "items__offers",
                    queryset=(
                        RetailerProductRequestOffer.objects
                        .select_related(
                            "wholesaler",
                            "wholesaler_receipt",
                        )
                    ),
                ),
                "responses",
            )
        )
        if request_id:
            req = base_qs.get(id=request_id)
        else:
            req = base_qs.get(draft_id=draft_id)
    except RetailerProductRequest.DoesNotExist:
        return (
            "error",
            "Request not found",
            {"request_id": "Not found or not yours."},
        )

    return (
        "success",
        "Request retrieved",
        RetailerProductRequestSerializer(req).data,
        "request",
    )


# =====================================================================
# CreateOffer
# =====================================================================

def handle_create_offer(user, data, role):
    denied = _require_wholesaler(role)
    if denied:
        return denied

    item_id = data.get("item_id")
    if not item_id:
        return (
            "error",
            "Offer failed",
            {"item_id": "This field is required."},
        )

    item = (
        RetailerProductRequestItem.objects
        .filter(
            id=item_id,
            target_pairs__wholesaler_id=user.entity_id,
            target_pairs__is_active=True,
            request__status__in=[
                RetailerProductRequest.Status.PUBLISHED,
                RetailerProductRequest.Status.ACKNOWLEDGED,
                RetailerProductRequest.Status.PARTIALLY_FULFILLED,
            ],
        )
        .select_related("product", "request")
        .distinct()
        .first()
    )

    if item is None:
        return (
            "error",
            "Offer failed",
            {"item_id": "Not found or not tagged to you."},
        )

    try:
        offered_quantity = int(data.get("offered_quantity", 0))
    except (TypeError, ValueError):
        offered_quantity = 0

    if offered_quantity <= 0:
        return (
            "error",
            "Offer failed",
            {"offered_quantity": "Must be > 0."},
        )

    offered_unit_price = data.get("offered_unit_price")
    wholesaler_receipt_id = data.get("wholesaler_receipt")

    if wholesaler_receipt_id:
        from wholesalers.models import WholesalerReceipts

        receipt = WholesalerReceipts.objects.filter(
            id=wholesaler_receipt_id,
            entity_id=user.entity_id,
            product_id=item.product_id,
        ).first()
        if receipt is None:
            return (
                "error",
                "Offer failed",
                {
                    "wholesaler_receipt": (
                        "Not found, not yours, or wrong product."
                    )
                },
            )

    with transaction.atomic():
        offer, _created = (
            RetailerProductRequestOffer.objects.update_or_create(
                request_item=item,
                wholesaler_id=user.entity_id,
                defaults={
                    "entity_id": user.entity_id,
                    "wholesaler_receipt_id": (
                        wholesaler_receipt_id or None
                    ),
                    "offered_quantity": offered_quantity,
                    "offered_unit_price": offered_unit_price,
                    "batch": data.get("batch"),
                    "expiry_date": data.get("expiry_date") or None,
                    "manufacture_date": (
                        data.get("manufacture_date") or None
                    ),
                    "is_placement": bool(
                        data.get("is_placement", False)
                    ),
                    "status": (
                        RetailerProductRequestOffer.Status.OFFERED
                    ),
                    "responded_by_user": user,
                    "responded_at": timezone.now(),
                    "response_note": data.get("response_note", ""),
                    "owner": user,
                },
            )
        )

        item.recalculate(save=True)
        item.request.recalculate(save=True)

    _notify_retailer_of_offer(item, offer, user)

    return (
        "success",
        "Offer recorded",
        WholesalerFacingOfferSerializer(offer).data,
        "offer",
    )


def _notify_retailer_of_offer(item, offer, user):
    from analytics.realtime import push_new_offer

    push_new_offer(str(item.request.entity_id), {
        "request_id": str(item.request_id),
        "request_number": item.request.request_number,
        "item_id": str(item.id),
        "offer_id": str(offer.id),
        "wholesaler_id": str(user.entity_id),
        "wholesaler_title": user.entity.title,
        "product_id": str(item.product_id),
        "product_title": item.product.title,
        "requested_quantity": item.requested_quantity,
        "offered_quantity": offer.offered_quantity,
        "offered_unit_price": (
            str(offer.offered_unit_price)
            if offer.offered_unit_price is not None
            else None
        ),
    })


# =====================================================================
# WithdrawOffer
# =====================================================================

def handle_withdraw_offer(user, data, role):
    denied = _require_wholesaler(role)
    if denied:
        return denied

    offer_id = data.get("offer_id")
    if not offer_id:
        return (
            "error",
            "Withdraw failed",
            {"offer_id": "This field is required."},
        )

    try:
        offer = (
            RetailerProductRequestOffer.objects
            .select_related("request_item__request")
            .get(id=offer_id, wholesaler_id=user.entity_id)
        )
    except RetailerProductRequestOffer.DoesNotExist:
        return (
            "error",
            "Withdraw failed",
            {"offer_id": "Not found or not yours."},
        )

    if offer.status in (
        RetailerProductRequestOffer.Status.CONFIRMED,
        RetailerProductRequestOffer.Status.FULFILLED,
    ):
        return (
            "error",
            "Withdraw failed",
            {
                "status": (
                    f"Cannot withdraw an offer in status {offer.status}."
                )
            },
        )

    with transaction.atomic():
        offer.status = RetailerProductRequestOffer.Status.WITHDRAWN
        offer.save(update_fields=["status", "updated"])
        offer.request_item.recalculate(save=True)
        offer.request_item.request.recalculate(save=True)

    return (
        "success",
        "Offer withdrawn",
        WholesalerFacingOfferSerializer(offer).data,
        "offer",
    )


# =====================================================================
# ConfirmOffers
# =====================================================================

def handle_confirm_offers(user, data, role):
    denied = _require_retailer(role)
    if denied:
        return denied

    request_id = data.get("request_id")
    confirmations = data.get("confirmations", [])
    declinations = data.get("declinations", [])
    note = data.get("note", "")

    if not request_id:
        return (
            "error",
            "Confirmation failed",
            {"request_id": "This field is required."},
        )

    try:
        req = RetailerProductRequest.objects.get(
            id=request_id, entity=user.entity,
        )
    except RetailerProductRequest.DoesNotExist:
        return (
            "error",
            "Request not found",
            {"request_id": "Not found or not yours."},
        )

    if req.status == RetailerProductRequest.Status.DRAFT:
        return (
            "error",
            "Confirmation failed",
            {"status": "Cannot confirm offers on a draft request."},
        )

    if not confirmations and not declinations:
        return (
            "error",
            "Confirmation failed",
            {
                "detail": (
                    "Provide at least one confirmation or declination."
                )
            },
        )

    confirmed_ids = {p.get("offer_id") for p in confirmations}
    declined_ids = {p.get("offer_id") for p in declinations}
    overlap = confirmed_ids & declined_ids
    if overlap:
        return (
            "error",
            "Confirmation failed",
            {"overlap": list(overlap)},
        )

    try:
        orders = retailer_confirm_offers(
            request_obj=req,
            confirmations=confirmations,
            declinations=declinations,
            note=note,
            by_user=user,
        )
    except ValueError as e:
        return ("error", "Confirmation failed", {"detail": str(e)})
    except RetailerProductRequestOffer.DoesNotExist:
        return (
            "error",
            "Confirmation failed",
            {"detail": "One or more offers not found."},
        )

    _notify_wholesalers_of_confirmation(req, orders)

    return (
        "success",
        "Confirmation recorded",
        {
            "order_ids": [str(o.id) for o in orders],
            "order_count": len(orders),
        },
        "orders",
    )


def _notify_wholesalers_of_confirmation(req, orders):
    from analytics.realtime import push_retailer_confirmation

    affected_wholesalers = set(
        RetailerProductRequestOffer.objects
        .filter(
            request_item__request=req,
            status=RetailerProductRequestOffer.Status.FULFILLED,
        )
        .values_list("wholesaler_id", flat=True)
    )
    for wid in affected_wholesalers:
        order_ids = [
            str(o.id) for o in orders
            if str(o.wholesaler_id) == str(wid)
        ]
        push_retailer_confirmation(str(wid), {
            "request_id": str(req.id),
            "request_number": req.request_number,
            "retailer_id": str(req.entity_id),
            "retailer_title": req.entity.title,
            "order_ids": order_ids,
            "order_count": len(order_ids),
        })


# =====================================================================
# CancelRequest
# =====================================================================

def handle_cancel_request(user, data, role):
    denied = _require_retailer(role)
    if denied:
        return denied

    request_id = data.get("request_id")
    draft_id = data.get("draft_id") or None

    if not request_id and not draft_id:
        return (
            "error",
            "Cancel failed",
            {"request_id": "This field or draft_id is required."},
        )

    try:
        if request_id:
            req = RetailerProductRequest.objects.get(
                id=request_id, entity=user.entity,
            )
        else:
            req = RetailerProductRequest.objects.get(
                draft_id=draft_id, entity=user.entity,
            )
    except RetailerProductRequest.DoesNotExist:
        return ("error", "Cancel failed", {"request_id": "Not found."})

    if req.status in (
        RetailerProductRequest.Status.FULFILLED,
        RetailerProductRequest.Status.CANCELLED,
        RetailerProductRequest.Status.EXPIRED,
    ):
        return (
            "error",
            "Cancel failed",
            {"status": f"Cannot cancel a request in status {req.status}."},
        )

    now = timezone.now()
    req.items.update(
        status=RetailerProductRequestItem.Status.CANCELLED
    )
    RetailerProductRequestOffer.objects.filter(
        request_item__request=req,
        status=RetailerProductRequestOffer.Status.OFFERED,
    ).update(status=RetailerProductRequestOffer.Status.CANCELLED)

    RetailerProductRequestItemWholesaler.objects.filter(
        request_item__request=req,
        is_active=True,
    ).update(is_active=False)

    req.status = RetailerProductRequest.Status.CANCELLED
    req.cancelled_at = now
    req.save(update_fields=["status", "cancelled_at", "updated"])

    return (
        "success",
        "Request cancelled",
        RetailerProductRequestSerializer(req).data,
        "request",
    )


# =====================================================================
# CancelRequestItem
# =====================================================================

def handle_cancel_request_item(user, data, role):
    denied = _require_retailer(role)
    if denied:
        return denied

    item_id = data.get("item_id")
    if not item_id:
        return (
            "error",
            "Cancel failed",
            {"item_id": "This field is required."},
        )

    try:
        item = RetailerProductRequestItem.objects.get(
            id=item_id, request__entity=user.entity,
        )
    except RetailerProductRequestItem.DoesNotExist:
        return ("error", "Cancel failed", {"item_id": "Not found."})

    if item.status in (
        RetailerProductRequestItem.Status.FULFILLED,
        RetailerProductRequestItem.Status.CANCELLED,
    ):
        return (
            "error",
            "Cancel failed",
            {"status": f"Cannot cancel a line in status {item.status}."},
        )

    item.status = RetailerProductRequestItem.Status.CANCELLED
    item.save(update_fields=["status", "updated"])

    RetailerProductRequestOffer.objects.filter(
        request_item=item,
        status=RetailerProductRequestOffer.Status.OFFERED,
    ).update(status=RetailerProductRequestOffer.Status.CANCELLED)

    RetailerProductRequestItemWholesaler.objects.filter(
        request_item=item,
        is_active=True,
    ).update(is_active=False)

    item.request.recalculate(save=True)

    return (
        "success",
        "Line cancelled",
        RetailerProductRequestSerializer(item.request).data,
        "request",
    )


# =====================================================================
# Helpers
# =====================================================================

class _PageRequest:
    """
    Minimal stand-in for a DRF request, so PageNumberPagination works
    when the service is called from a non-HTTP context.
    """

    def __init__(self, user, data):
        self.user = user
        self.query_params = data
        self.data = data


def _page_request(user, data):
    return _PageRequest(user, data)