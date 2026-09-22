# retailers/services/product_requests_respond.py
#
# Domain logic for the wholesaler "Respond" action on a product request.
#
# The dispatcher (retailers/services/product_requests.py → handle_respond)
# validates the payload and calls into this module to apply the change.
# Keeping the transaction here means the dispatcher stays thin and the
# business rules live next to the models they touch.
#
# Called as:
#     wholesaler_respond_to_request(
#         request_obj=req,
#         wholesaler_entity=user.entity,
#         accepted_lines=[{"item_id": ..., "receipt_id": ...}],
#         rejected_lines=[{"item_id": ...}],
#         response_note=note,
#         by_user=user,
#     )
#
# Returns: the created RetailerProductRequestResponse with
#          .id, .offered_line_count, .rejected_line_count populated.
#
# Raises: ValueError for malformed input that reaches this layer.
#         The dispatcher catches ValueError and returns a clean error
#         tuple to the HTTP client.

from __future__ import annotations

import logging

from django.db import transaction

logger = logging.getLogger(__name__)


# =========================================================
# Helpers
# =========================================================

def _get_entity_id(entity) -> str | None:
    """Accept either an Entity instance or a UUID/string id."""
    if entity is None:
        return None
    return str(getattr(entity, "pk", entity))


# =========================================================
# Public API
# =========================================================

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

    All writes happen inside a single transaction. If any line fails
    validation, nothing is persisted.
    """
    from retailers.models import (
        RetailerProductRequestResponse,
        RetailerProductRequestOffer,
    )

    entity_id = _get_entity_id(wholesaler_entity)

    if not entity_id:
        raise ValueError(
            "wholesaler_entity is required to record a response."
        )

    with transaction.atomic():
        # --------------------------------------------------
        # 1. Create the parent response row
        # --------------------------------------------------
        response_obj = RetailerProductRequestResponse.objects.create(
            request=request_obj,
            wholesaler_id=entity_id,
            note=response_note or "",
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

            item = request_obj.items.filter(id=item_id).first()
            if item is None:
                raise ValueError(
                    f"Item {item_id} does not belong to this request."
                )

            receipt_id = payload.get("receipt_id")
            receipt_payload = payload.get("receipt")

            defaults = {
                "response": response_obj,
                "wholesaler_id": entity_id,
                "status": "OFFERED",
                # Default the offered quantity to whatever the
                # retailer asked for; the receipt's price picks up
                # the actual unit cost at read time.
                "offered_quantity": getattr(
                    item, "requested_quantity", 0
                ),
            }

            # Exactly one of receipt_id / receipt should be present —
            # the dispatcher already validated that. Prefer receipt_id.
            if receipt_id:
                defaults["wholesaler_receipt_id"] = receipt_id
            elif isinstance(receipt_payload, dict):
                # Inline payload path — use whatever server id it
                # carries. If your backend never uses this variant,
                # the dispatcher still rejects it before we get here.
                inline_id = receipt_payload.get("id") or receipt_payload.get(
                    "remote_id"
                )
                if inline_id:
                    defaults["wholesaler_receipt_id"] = inline_id

            RetailerProductRequestOffer.objects.update_or_create(
                request_item=item,
                wholesaler_id=entity_id,
                defaults=defaults,
            )
            offered_count += 1

        # --------------------------------------------------
        # 3. Rejected lines
        # --------------------------------------------------
        for payload in rejected_lines or []:
            item_id = payload.get("item_id")
            if not item_id:
                raise ValueError("Rejected line is missing item_id.")

            item = request_obj.items.filter(id=item_id).first()
            if item is None:
                raise ValueError(
                    f"Item {item_id} does not belong to this request."
                )

            RetailerProductRequestOffer.objects.update_or_create(
                request_item=item,
                wholesaler_id=entity_id,
                defaults={
                    "response": response_obj,
                    "wholesaler_id": entity_id,
                    "status": "REJECTED",
                    "offered_quantity": 0,
                    "wholesaler_receipt_id": None,
                },
            )
            rejected_count += 1

        # --------------------------------------------------
        # 4. Rollups on the response
        # --------------------------------------------------
        response_obj.offered_line_count = offered_count
        response_obj.rejected_line_count = rejected_count
        response_obj.save(
            update_fields=[
                "offered_line_count",
                "rejected_line_count",
            ]
        )

    logger.info(
        "wholesaler_respond_to_request: request=%s wholesaler=%s "
        "offered=%s rejected=%s",
        request_obj.pk,
        entity_id,
        offered_count,
        rejected_count,
    )

    return response_obj