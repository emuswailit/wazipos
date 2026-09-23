# retailers/services/request_confirmation.py

"""
Retailer confirms or declines offers.

Confirmed offers group by wholesaler → one RetailerOrder per wholesaler.
Confirmed quantity per line is validated against requested_quantity.
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
from wholesalers.models import RetailerOrders, RetailerOrderItems


URGENCY_TO_ORDER_TYPE = {
    "high": "EMERGENCY",
    "medium": "NORMAL",
    "low": "NORMAL",
}


@transaction.atomic
def retailer_confirm_offers(
    request_obj,
    confirmations: list,
    declinations: list,
    note: str = "",
    by_user=None,
):
    """
    confirmations: [{"offer_id": str, "response_note": str|None}]
    declinations: [{"offer_id": str, "reason": str|None}]

    Returns the list of created RetailerOrders.
    """
    now = timezone.now()

    # ---- 1. Confirm offers ----
    confirmed_offers = []
    for payload in confirmations:
        offer_id = payload.get("offer_id")
        if not offer_id:
            raise ValueError("Each confirmation requires offer_id.")

        offer = (
            RetailerProductRequestOffer.objects
            .select_related("request_item", "wholesaler_receipt")
            .get(id=offer_id)
        )

        if offer.request_item.request_id != request_obj.id:
            raise ValueError(f"Offer {offer.id} is not on this request.")

        if offer.status != RetailerProductRequestOffer.Status.OFFERED:
            raise ValueError(
                f"Offer {offer.id} is not in OFFERED state "
                f"(currently {offer.status})."
            )

        receipt = offer.wholesaler_receipt
        if receipt is None:
            raise ValueError(f"Offer {offer.id} has no receipt attached.")

        if (receipt.current_unit_quantity or 0) < offer.offered_quantity:
            offer.status = RetailerProductRequestOffer.Status.WITHDRAWN
            offer.retailer_response_note = "Stock consumed before confirmation."
            offer.save(update_fields=[
                "status", "retailer_response_note", "updated",
            ])
            raise ValueError(
                f"Offer {offer.id} no longer available — only "
                f"{receipt.current_unit_quantity} units remain, "
                f"but {offer.offered_quantity} were offered."
            )

        offer.status = RetailerProductRequestOffer.Status.CONFIRMED
        offer.retailer_confirmed_at = now
        offer.retailer_response_note = payload.get("response_note", "")
        offer.save(update_fields=[
            "status", "retailer_confirmed_at",
            "retailer_response_note", "updated",
        ])
        confirmed_offers.append(offer)

    # ---- 2. Decline offers ----
    for payload in declinations:
        offer_id = payload.get("offer_id")
        if not offer_id:
            raise ValueError("Each declination requires offer_id.")

        offer = RetailerProductRequestOffer.objects.get(id=offer_id)

        if offer.request_item.request_id != request_obj.id:
            raise ValueError(f"Offer {offer.id} is not on this request.")

        if offer.status != RetailerProductRequestOffer.Status.OFFERED:
            raise ValueError(
                f"Offer {offer.id} is not in OFFERED state "
                f"(currently {offer.status})."
            )

        offer.status = RetailerProductRequestOffer.Status.DECLINED_BY_RETAILER
        offer.retailer_confirmed_at = now
        offer.retailer_response_note = payload.get("reason", "")
        offer.save(update_fields=[
            "status", "retailer_confirmed_at",
            "retailer_response_note", "updated",
        ])

    # ---- 3. Guard: total confirmed per line ≤ requested ----
    for line in request_obj.items.all():
        confirmed_total = int(
            line.offers
            .filter(status__in=[
                RetailerProductRequestOffer.Status.CONFIRMED,
                RetailerProductRequestOffer.Status.FULFILLED,
            ])
            .aggregate(total=Sum("offered_quantity"))["total"] or 0
        )
        if confirmed_total > line.requested_quantity:
            raise ValueError(
                f"Line {line.id} ({line.product.title}): "
                f"confirmed {confirmed_total} exceeds requested "
                f"{line.requested_quantity}."
            )

    # ---- 4. Group by wholesaler and build orders ----
    by_wholesaler = {}
    for offer in confirmed_offers:
        by_wholesaler.setdefault(offer.wholesaler_id, []).append(offer)

    created_orders = []
    for wholesaler_id, offers in by_wholesaler.items():
        order = RetailerOrders.objects.create(
            entity=request_obj.entity,
            retailer=request_obj.entity,
            wholesaler_id=wholesaler_id,
            order_terms="CONTRACT",
            order_type=URGENCY_TO_ORDER_TYPE.get(request_obj.urgency, "NORMAL"),
            delivery_method="COURIER",
            order_origin="RETAILER",
            status="SUBMITTED",
            reference_number=request_obj.request_number,
            owner=by_user,
            created=now,
            updated=now,
        )

        for offer in offers:
            receipt = offer.wholesaler_receipt
            qty = offer.offered_quantity or 0
            unit_price = offer.offered_unit_price or receipt.final_unit_selling_price

            order_item = RetailerOrderItems(
                entity=request_obj.entity,
                retailer_order=order,
                wholesaler_receipt=receipt,
                purchased_quantity=qty,
                discount_quantity=0,
                total_quantity=qty,
                item_price=unit_price,
                item_final_price=unit_price,
                item_net_price=unit_price,
                item_net_price_total=(
                    unit_price * Decimal(str(qty))
                ).quantize(Decimal("0.01")),
                unit_of_issue=receipt.unit_of_receipt,
                owner=by_user,
            )
            order_item.recalculate(save=False)
            order_item.save()

            offer.resulting_order_item = order_item
            offer.status = RetailerProductRequestOffer.Status.FULFILLED
            offer.save(update_fields=[
                "resulting_order_item", "status", "updated",
            ])

        order.recalculate(save=True)
        created_orders.append(order)

        # Link the wholesaler's response to this order
        response = RetailerProductRequestResponse.objects.filter(
            request=request_obj, wholesaler_id=wholesaler_id,
        ).first()
        if response:
            response.resulting_orders.add(order)

            total_offered = (
                RetailerProductRequestOffer.objects
                .filter(
                    request_item__request=request_obj,
                    wholesaler_id=wholesaler_id,
                )
                .exclude(status__in=[
                    RetailerProductRequestOffer.Status.CANCELLED,
                    RetailerProductRequestOffer.Status.DECLINED_BY_RETAILER,
                ])
                .count()
            )
            fulfilled = (
                RetailerProductRequestOffer.objects
                .filter(
                    request_item__request=request_obj,
                    wholesaler_id=wholesaler_id,
                    status=RetailerProductRequestOffer.Status.FULFILLED,
                )
                .count()
            )
            if total_offered > 0 and fulfilled == total_offered:
                response.response_type = "FULL"
            elif fulfilled > 0:
                response.response_type = "PARTIAL"
            response.save(update_fields=["response_type", "updated"])

    # ---- 5. Recalculate ----
    for line in request_obj.items.all():
        line.recalculate(save=True)
    request_obj.recalculate(save=True)

    return created_orders