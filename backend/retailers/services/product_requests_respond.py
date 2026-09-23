# retailers/services/product_requests_respond.py
#
# Domain logic for a wholesaler responding to a product request.
#
# The dispatcher (retailers/services/product_requests.py → handle_respond)
# validates the payload and calls into this module to apply the change.
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

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def _get_entity_id(entity) -> str | None:
    """Accept either an Entity instance or a UUID/string id."""
    if entity is None:
        return None
    return str(getattr(entity, "pk", entity))


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
        - status = CANCELLED (the closest "not supplying this" state)

    Also upserts a RetailerProductRequestResponse header row
    (unique per request + wholesaler).

    Returns
    -------
    (response_obj, offered_count, rejected_count)
    """
    from retailers.models import (
        RetailerProductRequestItem,
        RetailerProductRequestOffer,
        RetailerProductRequestResponse,
    )

    entity_id = _get_entity_id(wholesaler_entity)
    if not entity_id:
        raise ValueError(
            "wholesaler_entity is required to record a response."
        )

    # The response row carries BOTH the retailer entity (owner of
    # the request) and the responding wholesaler. `entity` is
    # NOT NULL on the DB, so it must be sourced from the request.
    retailer_entity_id = getattr(request_obj, "entity_id", None)
    if not retailer_entity_id:
        raise ValueError(
            "Cannot record a response: the product request has no "
            "owning entity."
        )

    with transaction.atomic():
        # --------------------------------------------------
        # 1. Upsert the header response row
        # --------------------------------------------------
        response_obj, _created = (
            RetailerProductRequestResponse.objects.update_or_create(
            
                request=request_obj,
                wholesaler_id=entity_id,
                defaults={
                    "note": response_note or "",
                    "entity_id": retailer_entity_id,   # ← was missing
                },
            )
        )

        offered_count = 0
        rejected_count = 0

        # --------------------------------------------------
        # 2. Accepted lines
        # --------------------------------------------------
        for payload in accepted_lines or []:
            item_id = payload.get("item_id")
            if not item_id:
                raise ValueError("Accepted line is missing item_id.")

            item = (
                RetailerProductRequestItem.objects
                .filter(id=item_id, request=request_obj)
                .first()
            )
            if item is None:
                raise ValueError(
                    f"Item {item_id} does not belong to this request."
                )

            receipt_id = payload.get("receipt_id")
            receipt_payload = payload.get("receipt")

            resolved_receipt_id = None
            if receipt_id:
                resolved_receipt_id = receipt_id
            elif isinstance(receipt_payload, dict):
                resolved_receipt_id = (
                    receipt_payload.get("id")
                    or receipt_payload.get("remote_id")
                )

            # Snapshot fields from the receipt (so the offer survives
            # receipt edits later).
            receipt = None
            if resolved_receipt_id:
                from wholesalers.models import WholesalerReceipts

                receipt = (
                    WholesalerReceipts.objects
                    .filter(id=resolved_receipt_id)
                    .first()
                )

            defaults = {
                "wholesaler_id": entity_id,
                "status": RetailerProductRequestOffer.Status.OFFERED,
                "offered_quantity": int(
                    payload.get("offered_quantity")
                    or getattr(item, "requested_quantity", 0)
                ),
                "offered_unit_price": payload.get("offered_unit_price"),
                "responded_by_user": by_user,
                "responded_at": timezone.now(),
                "response_note": response_note or "",
            }

            if resolved_receipt_id:
                defaults["wholesaler_receipt_id"] = resolved_receipt_id
            if receipt is not None:
                defaults["batch"] = getattr(receipt, "batch", None)
                defaults["expiry_date"] = getattr(
                    receipt, "expiry_date", None
                )
                defaults["manufacture_date"] = getattr(
                    receipt, "manufacture_date", None
                )
                # Prefer the receipt's price if the payload didn't
                # provide one.
                if defaults["offered_unit_price"] is None:
                    price = (
                        getattr(receipt, "final_unit_selling_price", None)
                        or getattr(receipt, "unit_selling_price", None)
                    )
                    if price is not None:
                        defaults["offered_unit_price"] = price

            RetailerProductRequestOffer.objects.update_or_create(
                request_item=item,
                wholesaler_id=entity_id,
                defaults=defaults,
            )

            item.recalculate(save=True)
            offered_count += 1

        # --------------------------------------------------
        # 3. Rejected lines
        # --------------------------------------------------
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

            RetailerProductRequestOffer.objects.update_or_create(
                request_item=item,
                wholesaler_id=entity_id,
                defaults={
                    "status": RetailerProductRequestOffer.Status.CANCELLED,
                    "offered_quantity": 0,
                    "offered_unit_price": None,
                    "responded_by_user": by_user,
                    "responded_at": timezone.now(),
                    "response_note": response_note or "",
                },
            )

            item.recalculate(save=True)
            rejected_count += 1

        # --------------------------------------------------
        # 4. Refresh parent request rollups
        # --------------------------------------------------
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