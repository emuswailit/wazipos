# wholesalers/services/request_response.py

"""
Wholesaler responds to a retailer's product request.

Creates one RetailerProductRequestOffer per accepted line. No
reservation happens here — the retailer confirms later, and the
resulting order is committed by the wholesaler.
"""

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

# from retailers.models import (
#     RetailerProductRequest,
#     RetailerProductRequestItem,
#     RetailerProductRequestOffer,
#     RetailerProductRequestResponse,
# )
from wholesalers.models import WholesalerReceipts


@transaction.atomic
def wholesaler_respond_to_request(
    request_obj,
    wholesaler_entity,
    accepted_lines: list,
    rejected_lines: list,
    response_note: str = "",
    by_user=None,
):
    """
    accepted_lines: [{
        item_id,
        receipt_id | receipt: {...},
        response_note,
    }]

    rejected_lines: [{ item_id, reason }]
    """
    now = timezone.now()

    for payload in accepted_lines:
        item_id = payload.get("item_id")
        if not item_id:
            raise ValueError("Each accepted line requires item_id.")

        try:
            request_item = request_obj.items.get(id=item_id)
        except RetailerProductRequestItem.DoesNotExist:
            raise ValueError(f"Request line {item_id} not found.")

        # ---- Resolve or create receipt ----
        receipt_id = payload.get("receipt_id")
        if receipt_id:
            try:
                receipt = WholesalerReceipts.objects.get(id=receipt_id)
            except WholesalerReceipts.DoesNotExist:
                raise ValueError(f"Receipt {receipt_id} not found.")
            if receipt.entity_id != wholesaler_entity.id:
                raise ValueError(f"Receipt {receipt_id} does not belong to you.")
            if receipt.product_id != request_item.product_id:
                raise ValueError(
                    f"Receipt {receipt_id} product does not match "
                    f"request line product."
                )
        else:
            data = payload.get("receipt")
            if not isinstance(data, dict):
                raise ValueError(
                    "Each accepted line requires receipt_id or receipt object."
                )
            receipt = WholesalerReceipts.objects.create(
                entity=wholesaler_entity,
                product=request_item.product,
                received_from=None,
                batch=data.get("batch"),
                manufacture_date=data.get("manufacture_date"),
                expiry_date=data.get("expiry_date"),
                unit_of_receipt=data.get("unit_of_receipt", "Pack"),
                received_unit_quantity=int(data.get("received_unit_quantity", 0)),
                received_pack_quantity=0,
                current_unit_quantity=int(data.get("received_unit_quantity", 0)),
                unit_buying_price=Decimal(str(data.get("unit_buying_price", "0.00"))),
                unit_selling_price=Decimal(str(data.get("unit_selling_price", "0.00"))),
                discount_unit_selling_price=Decimal(str(
                    data.get("discount_unit_selling_price", "0.00")
                )),
                final_unit_selling_price=Decimal(str(
                    data.get("final_unit_selling_price", "0.00")
                )),
                recommended_retail_price=(
                    Decimal(str(data["recommended_retail_price"]))
                    if data.get("recommended_retail_price") is not None
                    else None
                ),
                in_placement=data.get("in_placement", "false"),
                description=f"Attached to request {request_obj.request_number}",
                owner=by_user,
            )

        # ---- Compute offered quantity ----
        # Quantity of this receipt already offered by other wholesalers on
        # other request lines (all still in play)
        other_committed = int(
            RetailerProductRequestOffer.objects
            .filter(
                wholesaler_receipt=receipt,
                status__in=[
                    RetailerProductRequestOffer.Status.OFFERED,
                    RetailerProductRequestOffer.Status.CONFIRMED,
                ],
            )
            .aggregate(total=Sum("offered_quantity"))["total"] or 0
        )

        physical = int(receipt.current_unit_quantity or 0)
        available = physical - other_committed

        if available <= 0:
            raise ValueError(
                f"Receipt {receipt.id} has {physical} units but "
                f"{other_committed} are already offered on other lines."
            )

        requested = int(request_item.requested_quantity or 0)
        offered_qty = min(available, requested)

        # ---- Upsert the offer ----
        RetailerProductRequestOffer.objects.update_or_create(
            request_item=request_item,
            wholesaler=wholesaler_entity,
            defaults={
                "entity": request_obj.entity,
                "wholesaler_receipt": receipt,
                "offered_quantity": offered_qty,
                "offered_unit_price": receipt.final_unit_selling_price,
                "batch": receipt.batch,
                "expiry_date": receipt.expiry_date,
                "manufacture_date": receipt.manufacture_date,
                "is_placement": receipt.in_placement == "true",
                "status": RetailerProductRequestOffer.Status.OFFERED,
                "responded_by_user": by_user,
                "responded_at": now,
                "response_note": payload.get("response_note", ""),
            },
        )

    # ---- Response record ----
    response_type = (
        "REJECTED" if rejected_lines and not accepted_lines
        else "PARTIAL" if rejected_lines and accepted_lines
        else "ACKNOWLEDGED"
    )

    response, _ = RetailerProductRequestResponse.objects.update_or_create(
        request=request_obj,
        wholesaler=wholesaler_entity,
        defaults={
            "entity": request_obj.entity,
            "response_type": response_type,
            "note": response_note,
            "offered_line_count": len(accepted_lines),
            "rejected_line_count": len(rejected_lines),
        },
    )

    # ---- Recalculate affected lines and header ----
    line_ids = (
        {p["item_id"] for p in accepted_lines}
        | {p["item_id"] for p in rejected_lines}
    )
    for line in request_obj.items.filter(id__in=line_ids):
        line.recalculate(save=True)

    request_obj.recalculate(save=True)

    return response