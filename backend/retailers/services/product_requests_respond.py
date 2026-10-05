# retailers/services/product_requests_respond.py
#
# Domain logic for a wholesaler responding to a product request.
#
# The dispatcher (retailers/services/product_requests.py → handle_respond)
# validates the payload shape and calls into this module to apply the
# change.
#
# Model shapes used:
#   RetailerProductRequest          — parent request
#   RetailerProductRequestItem      — one line
#   RetailerProductRequestOffer     — wholesaler's offer on a line
#   RetailerProductRequestResponse  — wholesaler's header response
#
# Returns (response_obj, offered_count, rejected_count).
# The response model has no line-count fields, so the counts are
# returned to the caller and echoed back in the HTTP payload.

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _get_entity_id(entity) -> str | None:
    """Accept either an Entity instance or a UUID/string id."""
    if entity is None:
        return None
    return str(getattr(entity, "pk", entity))


def _coerce_quantity(raw, fallback):
    """
    Parse an offered quantity. Returns an int > 0 or raises ValueError.

    `fallback` is used when `raw` is None/empty — typically the line's
    requested_quantity.
    """
    if raw in (None, ""):
        try:
            value = int(fallback or 0)
        except (TypeError, ValueError):
            value = 0
    else:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValueError(f"Invalid offered_quantity: {raw!r}.")
    if value <= 0:
        raise ValueError("offered_quantity must be > 0.")
    return value


def _coerce_price(raw):
    """
    Parse an offered unit price. Returns Decimal >= 0, or None if
    `raw` is None/empty.
    """
    if raw in (None, ""):
        return None
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"Invalid offered_unit_price: {raw!r}.")
    if value < 0:
        raise ValueError("offered_unit_price must be >= 0.")
    return value


def _guard_offer_not_retired(existing, item_id):
    """
    Raise ValueError if an offer already exists and has been acted on
    by either side. Prevents a resubmitted response from silently
    un-confirming a confirmed/fulfilled offer, or from rewriting a
    declined one.
    """
    if existing is None:
        return
    terminal = (
        "CONFIRMED",
        "FULFILLED",
        "DECLINED_BY_RETAILER",
        "DECLINED_BY_WHOLESALER",
    )
    if existing.status in terminal:
        raise ValueError(
            f"Cannot modify offer {existing.id} on item {item_id}: "
            f"already {existing.status}."
        )


def _resolve_receipt(receipt_id, receipt_payload):
    """
    Return a WholesalerReceipts instance from either a direct id or a
    dict payload, or None.
    """
    from wholesalers.models import WholesalerReceipts

    resolved_id = None
    if receipt_id:
        resolved_id = receipt_id
    elif isinstance(receipt_payload, dict):
        resolved_id = (
            receipt_payload.get("id")
            or receipt_payload.get("remote_id")
        )

    if not resolved_id:
        return None, None

    receipt = (
        WholesalerReceipts.objects
        .filter(id=resolved_id)
        .first()
    )
    return resolved_id, receipt


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

@transaction.atomic
def wholesaler_respond_to_request(
    *,
    request_obj,
    wholesaler_entity,
    accepted_lines,
    rejected_lines,
    response_note,
    by_user,
):
    """
    Apply a wholesaler's response to a product request.

    For each accepted line:
        - upsert a RetailerProductRequestOffer
        - status = OFFERED
        - snapshot the receipt, quantity, price and batch/expiry

    For each rejected line:
        - upsert a RetailerProductRequestOffer
        - status = DECLINED_BY_WHOLESALER

    Also upserts a RetailerProductRequestResponse header row
    (unique per request + wholesaler).

    Refuses to modify any offer that the retailer has already acted
    on (CONFIRMED / FULFILLED) or that has already been declined by
    either side.

    Returns
    -------
    (response_obj, offered_count, rejected_count)

    Raises
    ------
    ValueError
        On any validation failure. The transaction rolls back.
    """
    # Local imports to avoid a circular import between retailers
    # services and models.
    from retailers.models import (
        RetailerProductRequest,
        RetailerProductRequestItem,
        RetailerProductRequestOffer,
        RetailerProductRequestResponse,
    )

    entity_id = _get_entity_id(wholesaler_entity)
    if not entity_id:
        raise ValueError(
            "wholesaler_entity is required to record a response."
        )

    if by_user is None:
        raise ValueError("by_user is required to record a response.")

    # ------------------------------------------------------------------
    # 0. Request status guard — reject responses to closed requests.
    # ------------------------------------------------------------------
    if request_obj.status in (
        RetailerProductRequest.Status.CANCELLED,
        RetailerProductRequest.Status.EXPIRED,
        RetailerProductRequest.Status.FULFILLED,
    ):
        raise ValueError(
            f"Request {request_obj.request_number or request_obj.pk} "
            f"is {request_obj.status} and is no longer accepting "
            f"responses."
        )

    # The response row carries BOTH the retailer entity (owner of the
    # request) and the responding wholesaler. `entity` is NOT NULL on
    # the DB, so it must be sourced from the request.
    retailer_entity_id = getattr(request_obj, "entity_id", None)
    if not retailer_entity_id:
        raise ValueError(
            "Cannot record a response: the product request has no "
            "owning entity."
        )

    # ------------------------------------------------------------------
    # 1. Upsert the header response row.
    # ------------------------------------------------------------------
    response_obj, _created = (
        RetailerProductRequestResponse.objects.update_or_create(
            request=request_obj,
            wholesaler_id=entity_id,
            defaults={
                "note": response_note or "",
                "entity_id": retailer_entity_id,
                "owner": by_user,
            },
        )
    )

    offered_count = 0
    rejected_count = 0

    # ------------------------------------------------------------------
    # 2. Accepted lines.
    # ------------------------------------------------------------------
    for payload in accepted_lines or []:
        item_id = payload.get("item_id")
        if not item_id:
            raise ValueError("Accepted line is missing item_id.")

        item = (
            RetailerProductRequestItem.objects
            .filter(id=item_id, request=request_obj)
            .select_related("product")
            .first()
        )
        if item is None:
            raise ValueError(
                f"Item {item_id} does not belong to this request."
            )

        # Refuse to touch an offer the retailer has already decided on.
        existing = (
            RetailerProductRequestOffer.objects
            .filter(request_item=item, wholesaler_id=entity_id)
            .first()
        )
        _guard_offer_not_retired(existing, item_id)

        # Validate quantity and price before writing.
        qty = _coerce_quantity(
            payload.get("offered_quantity"),
            item.requested_quantity,
        )
        price = _coerce_price(payload.get("offered_unit_price"))

        # Resolve the receipt, if any.
        resolved_receipt_id, receipt = _resolve_receipt(
            payload.get("receipt_id"),
            payload.get("receipt"),
        )

        # If a receipt was supplied, it must belong to this wholesaler
        # and be for the same product as the line.
        if receipt is not None:
            if str(receipt.received_from_id or "") != str(entity_id):
                raise ValueError(
                    f"Receipt {resolved_receipt_id} does not belong "
                    f"to the responding wholesaler."
                )
            if receipt.product_id != item.product_id:
                raise ValueError(
                    f"Receipt {resolved_receipt_id} is not for the "
                    f"same product as line {item_id}."
                )

        defaults = {
            "wholesaler_id": entity_id,
            "status": RetailerProductRequestOffer.Status.OFFERED,
            "offered_quantity": qty,
            "offered_unit_price": price,
            "responded_by_user": by_user,
            "responded_at": timezone.now(),
            "response_note": response_note or "",
        }

        if resolved_receipt_id:
            defaults["wholesaler_receipt_id"] = resolved_receipt_id

        if receipt is not None:
            defaults["batch"] = getattr(receipt, "batch", None)
            defaults["expiry_date"] = getattr(receipt, "expiry_date", None)
            defaults["manufacture_date"] = getattr(
                receipt, "manufacture_date", None
            )

            # Price fallback — explicit `is None` so a legitimate
            # 0.00 on the receipt isn't skipped. Prefer the
            # post-discount price; fall back to the list price.
            if defaults["offered_unit_price"] is None:
                candidate = getattr(
                    receipt, "final_unit_selling_price", None,
                )
                if candidate is None:
                    candidate = getattr(
                        receipt, "unit_selling_price", None,
                    )
                if candidate is not None:
                    defaults["offered_unit_price"] = candidate

        offer, _ = RetailerProductRequestOffer.objects.update_or_create(
            request_item=item,
            wholesaler_id=entity_id,
            defaults=defaults,
        )

        # Belt and braces: run the model's cross-field validation.
        # Offer.clean() includes the targeting check, so a wholesaler
        # responding against a line they were not targeted for is
        # stopped here rather than silently persisted.
        offer.full_clean(
            exclude=[
                # These fields are being resolved by the ORM right
                # now and are already validated above.
                "wholesaler_receipt",
                "request_item",
            ],
        )

        # Bubble counts up. Item.save() with default refresh_parent
        # also recomputes the parent request.
        item.save()
        offered_count += 1

    # ------------------------------------------------------------------
    # 3. Rejected lines.
    # ------------------------------------------------------------------
    for payload in rejected_lines or []:
        item_id = payload.get("item_id")
        if not item_id:
            raise ValueError("Rejected line is missing item_id.")

        item = (
            RetailerProductRequestItem.objects
            .filter(id=item_id, request=request_obj)
            .first()
        )
        if item is None:
            raise ValueError(
                f"Item {item_id} does not belong to this request."
            )

        existing = (
            RetailerProductRequestOffer.objects
            .filter(request_item=item, wholesaler_id=entity_id)
            .first()
        )
        _guard_offer_not_retired(existing, item_id)

        RetailerProductRequestOffer.objects.update_or_create(
            request_item=item,
            wholesaler_id=entity_id,
            defaults={
                "status": (
                    RetailerProductRequestOffer.Status
                    .DECLINED_BY_WHOLESALER
                ),
                "offered_quantity": 0,
                # offered_unit_price is intentionally preserved.
                # Historical record of what was offered, and lets the
                # wholesaler re-accept without re-entering the price.
                "responded_by_user": by_user,
                "responded_at": timezone.now(),
                "response_note": response_note or "",
            },
        )

        item.save()
        rejected_count += 1

    # ------------------------------------------------------------------
    # 4. Refresh parent request rollups.
    #    Item.save() already bubbled per-item, so this is a final
    #    normalisation pass in case the item-level bubbles raced with
    #    each other.
    # ------------------------------------------------------------------
    request_obj.recalculate(save=True)

    logger.info(
        "wholesaler_respond_to_request: request=%s wholesaler=%s "
        "offered=%s rejected=%s",
        request_obj.pk,
        entity_id,
        offered_count,
        rejected_count,
    )

    return response_obj, offered_count, rejected_count