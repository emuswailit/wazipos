# analytics/services/offer_advisor.py

"""
Wholesaler offer advisor.

Given a product and a retailer entity, returns a ranked list of
wholesaler receipts (lots) the retailer could buy from,
prioritizing active price and quantity discounts.

Ranking weights balance:
    - discount depth       (how much off the list price)
    - quantity bonus       (buy-N-get-M value)
    - shelf life           (days to expiry)
    - availability         (stock vs. forecast need)
    - placement bonus      (consignment offers nudge upward slightly)

Placement (consignment) lots ARE included as offers. The retailer
pays nothing upfront; they settle with the wholesaler per unit sold
at `unit_buying_price`, keeping the difference to
`final_unit_selling_price`.
"""

from datetime import date, timedelta
from decimal import Decimal

from wholesalers.models import (
    WholesalerPriceDiscounts,
    WholesalerQuantityDiscounts,
    WholesalerReceipts,
)


# Scoring weights — must sum to 1.0 (placement bonus is additive, not weighted)
WEIGHT_PRICE_DISCOUNT = 0.45
WEIGHT_BONUS_UNITS = 0.30
WEIGHT_SHELF_LIFE = 0.15
WEIGHT_AVAILABILITY = 0.10

# Additional bonus for placement offers
PLACEMENT_BONUS = 5.0

# Thresholds
MIN_DAYS_TO_EXPIRY = 30
GOOD_DAYS_TO_EXPIRY = 180


# =====================================================================
# Public entry point
# =====================================================================

def suggest_offers_for_product(
    product,
    retailer_entity,
    forecast_total: float,
    as_of_date: date | None = None,
    limit: int = 5,
) -> list[dict]:
    """
    Return a ranked list of offer dicts for the given product.

    Filters:
      - Product must allow the retailer's entity type
      - Lot must have stock (current_unit_quantity > 0)
      - Lot must have at least MIN_DAYS_TO_EXPIRY days left
      - Lot may be in placement (consignment is a valid offer)
    """
    as_of_date = as_of_date or date.today()

    # Distribution policy — is the retailer even allowed this product?
    entity_type = getattr(retailer_entity, "entity_type", None)
    allowed = product.allowed_entities or []
    if allowed and entity_type not in allowed:
        return []

    cutoff = as_of_date + timedelta(days=MIN_DAYS_TO_EXPIRY)

    receipts = (
        WholesalerReceipts.objects
        .filter(
            product=product,
            current_unit_quantity__gt=0,
        )
        .exclude(expiry_date__isnull=False, expiry_date__lt=cutoff)
        .select_related("entity", "product")
    )

    offers = []
    for receipt in receipts:
        offer = _build_offer(receipt, forecast_total, as_of_date)
        if offer is not None:
            offers.append(offer)

    offers.sort(key=lambda o: o["score"], reverse=True)
    return offers[:limit]


# =====================================================================
# Offer construction
# =====================================================================

def _build_offer(receipt, forecast_total, as_of_date):
    # ---- Placement flag ----
    in_placement = (receipt.in_placement == "true")

    # ---- Price discount ----
    price_discount = (
        WholesalerPriceDiscounts.objects
        .filter(
            wholesaler_receipt=receipt,
            is_active="true",
            start__lte=as_of_date,
            end__gte=as_of_date,
        )
        .order_by("-percent")
        .first()
    )

    list_price = receipt.unit_selling_price or Decimal("0.00")
    if price_discount:
        effective_price = price_discount.offer_price or receipt.final_unit_selling_price or list_price
        price_discount_pct = float(price_discount.percent or 0)
    else:
        effective_price = receipt.final_unit_selling_price or list_price
        price_discount_pct = 0.0

    if effective_price <= 0:
        return None

    # ---- Quantity discount ----
    qty_discount = (
        WholesalerQuantityDiscounts.objects
        .filter(
            wholesaler_receipt=receipt,
            is_active="true",
            start__lte=as_of_date,
            end__gte=as_of_date,
        )
        .order_by("-awarded_quantity")
        .first()
    )

    if qty_discount and qty_discount.limit_quantity:
        bonus_pct = (
            qty_discount.awarded_quantity / qty_discount.limit_quantity
        ) * 100.0
    else:
        bonus_pct = 0.0

    # Effective unit cost after bonus dilution
    if qty_discount and qty_discount.limit_quantity:
        paid = float(qty_discount.limit_quantity)
        free = float(qty_discount.awarded_quantity or 0)
        total = paid + free
        effective_unit_after_bonus = Decimal(
            str(float(effective_price) * paid / total)
        ) if total > 0 else effective_price
    else:
        effective_unit_after_bonus = effective_price

    # ---- Shelf life ----
    days_to_expiry = None
    if receipt.expiry_date:
        days_to_expiry = (receipt.expiry_date - as_of_date).days

    # ---- Availability ----
    available_qty = receipt.current_unit_quantity or 0

    # ---- Score ----
    score = _score_offer(
        price_discount_pct=price_discount_pct,
        bonus_pct=bonus_pct,
        days_to_expiry=days_to_expiry,
        available_qty=available_qty,
        forecast_total=forecast_total,
        in_placement=in_placement,
    )

    # ---- Rationale ----
    parts = []
    if in_placement:
        parts.append("consignment")
    if price_discount_pct > 0:
        parts.append(f"{price_discount_pct:.0f}% off")
    if bonus_pct > 0:
        parts.append(
            f"buy {qty_discount.limit_quantity} get "
            f"{qty_discount.awarded_quantity} free"
        )
    if days_to_expiry is not None:
        parts.append(f"{days_to_expiry} days shelf life")
    if not parts:
        parts.append("standard offer")

    # ---- Placement note ----
    placement_note = (
        "Consignment — pay the wholesaler only when each unit sells. "
        "You keep the difference to the selling price."
        if in_placement else None
    )

    return {
        "receipt_id": str(receipt.id),
        "wholesaler_id": str(receipt.entity_id),
        "wholesaler_title": receipt.entity.title,
        "batch": receipt.batch,
        "expiry_date": receipt.expiry_date.isoformat() if receipt.expiry_date else None,
        "days_to_expiry": days_to_expiry,
        "current_quantity": available_qty,
        "list_unit_price": str(list_price),
        "effective_unit_price": str(effective_price),
        "price_discount_percent": round(price_discount_pct, 2),
        "wholesaler_price_discount_id": (
            str(price_discount.id) if price_discount else None
        ),
        "quantity_discount": {
            "limit_quantity": qty_discount.limit_quantity,
            "awarded_quantity": qty_discount.awarded_quantity,
            "bonus_pct": round(bonus_pct, 2),
        } if qty_discount else None,
        "wholesaler_quantity_discount_id": (
            str(qty_discount.id) if qty_discount else None
        ),
        "effective_unit_cost_after_bonus": str(effective_unit_after_bonus),
        "score": round(score, 2),
        "rationale": " + ".join(parts),
        "in_placement": in_placement,
        "placement_note": placement_note,
    }


# =====================================================================
# Scoring
# =====================================================================

def _score_offer(
    price_discount_pct,
    bonus_pct,
    days_to_expiry,
    available_qty,
    forecast_total,
    in_placement=False,
):
    # Price discount: 50%+ = full marks
    price_component = min(price_discount_pct / 50.0, 1.0) * 100

    # Bonus: 30%+ = full marks
    bonus_component = min(bonus_pct / 30.0, 1.0) * 100

    # Shelf life: MIN threshold = 0, GOOD threshold = full
    if days_to_expiry is None:
        shelf_component = 50.0
    elif days_to_expiry >= GOOD_DAYS_TO_EXPIRY:
        shelf_component = 100.0
    elif days_to_expiry <= MIN_DAYS_TO_EXPIRY:
        shelf_component = 0.0
    else:
        span = GOOD_DAYS_TO_EXPIRY - MIN_DAYS_TO_EXPIRY
        shelf_component = ((days_to_expiry - MIN_DAYS_TO_EXPIRY) / span) * 100

    # Availability: enough stock to cover the forecast need = full
    if forecast_total <= 0:
        avail_component = 50.0
    else:
        coverage = available_qty / forecast_total
        avail_component = min(coverage, 1.5) / 1.5 * 100

    # Placement bonus — small nudge upward for consignment
    placement_component = PLACEMENT_BONUS if in_placement else 0.0

    return (
        WEIGHT_PRICE_DISCOUNT * price_component
        + WEIGHT_BONUS_UNITS * bonus_component
        + WEIGHT_SHELF_LIFE * shelf_component
        + WEIGHT_AVAILABILITY * avail_component
        + placement_component
    )