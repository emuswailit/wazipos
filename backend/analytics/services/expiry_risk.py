# analytics/services/expiry_risk.py

"""
Per-lot expiry risk scoring.

For each active lot with an expiry date and stock on hand, computes:
    - Expected sell-through before expiry
    - Expected unsold quantity at expiry
    - Expiry probability (0-1)
    - Expected write-off value
    - Recommended action

Two design points worth knowing:

1. FEFO allocation
     Lots of the same product compete for the same demand. If we scored
     each lot independently at the product's daily sell rate, every lot
     would claim the same demand, and the total expected sell-through
     would exceed what the shop can physically move. We therefore
     allocate demand FEFO (first-expiry-first-out): nearest expiry
     consumes first, and demand only flows to the next lot once the
     previous one is depleted.

2. Sell-through signal
     Primary: the latest DemandForecast for the product at horizon 1.
     Fallback: aggregate consumption history of the lots themselves.
     If neither is available, sell-through is 0 — honest for a lot
     with no sales history, and it produces a clear "monitor" or
     "write_off" recommendation.

Idempotent: rerunning for the same date replaces all rows for that date.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db import transaction

from analytics.models import (
    DemandForecast,
    ExpiryRisk,
    InventorySnapshot,
)


# =====================================================================
# Tunables
# =====================================================================

# Lots farther out than this are not scored. Negative values (already
# expired) always pass because they are below the cutoff.
MAX_DAYS_TO_EXPIRY = 365

# Heuristic thresholds for the recommended action
WRITE_OFF_PROBABILITY = 0.80
DISCOUNT_PROBABILITY = 0.50
TRANSFER_PROBABILITY = 0.30
MONITOR_PROBABILITY = 0.10

# Minimum age before the fallback consumption heuristic is trusted.
MIN_AGE_FOR_FALLBACK_DAYS = 7


# =====================================================================
# Entry point
# =====================================================================

def compute_expiry_risks(
    as_of_date: date | None = None,
    max_days_to_expiry: int = MAX_DAYS_TO_EXPIRY,
) -> dict:
    """
    Score every active lot with an expiry date.

    Usage:
        from analytics.services.expiry_risk import compute_expiry_risks
        result = compute_expiry_risks()
    """
    as_of_date = as_of_date or date.today()

    # ---- Pull candidate snapshots ----
    # `days_to_expiry__lte` also passes negative values, so already-
    # expired lots are included and correctly flagged as write-offs.
    candidates = list(
        InventorySnapshot.objects
        .filter(
            snapshot_date=as_of_date,
            current_unit_quantity__gt=0,
            expiry_date__isnull=False,
            days_to_expiry__lte=max_days_to_expiry,
        )
        .select_related("product", "entity")
    )

    if not candidates:
        with transaction.atomic():
            ExpiryRisk.objects.filter(as_of_date=as_of_date).delete()
        return {"as_of_date": as_of_date.isoformat(), "lots_scored": 0}

    # ---- One batched query for the demand signal ----
    forecast_map = _load_forecast_map(candidates)

    # ---- Group lots by (entity, product, tier) for FEFO ----
    groups: dict = defaultdict(list)
    for s in candidates:
        key = (str(s.entity_id), str(s.product_id), s.tier)
        groups[key].append(s)

    # ---- Allocate demand across competing lots, per group ----
    allocation: dict = {}  # snapshot_id -> expected units sold
    for key, lots in groups.items():
        daily_rate = _product_daily_rate(lots, forecast_map.get(key))
        allocated = _simulate_fefo(lots, daily_rate)
        allocation.update(allocated)

    # ---- Score each lot against its allocation ----
    risks = [
        _score_lot(s, as_of_date, allocation.get(s.id, 0.0))
        for s in candidates
    ]

    with transaction.atomic():
        ExpiryRisk.objects.filter(as_of_date=as_of_date).delete()
        if risks:
            ExpiryRisk.objects.bulk_create(risks, batch_size=500)

    return {
        "as_of_date": as_of_date.isoformat(),
        "lots_scored": len(risks),
    }


# =====================================================================
# Demand signal — one batched query for the whole run
# =====================================================================

def _load_forecast_map(candidates) -> dict:
    """
    Latest h=1 point forecast per (entity, product, tier).

    Returns { (entity_id, product_id, tier): daily_rate }.
    """
    keys = {
        (str(s.entity_id), str(s.product_id), s.tier)
        for s in candidates
    }
    if not keys:
        return {}

    entity_ids = {k[0] for k in keys}
    product_ids = {k[1] for k in keys}
    tiers = {k[2] for k in keys}

    rows = (
        DemandForecast.objects
        .filter(
            entity_id__in=entity_ids,
            product_id__in=product_ids,
            tier__in=tiers,
            horizon_days=1,
        )
        .order_by(
            "entity_id", "product_id", "tier", "-run_date",
        )
        .values(
            "entity_id", "product_id", "tier", "point_forecast",
        )
    )

    out: dict = {}
    for r in rows:
        key = (str(r["entity_id"]), str(r["product_id"]), r["tier"])
        if key in out:
            continue  # keep the latest run_date only
        out[key] = float(r["point_forecast"] or 0)
    return out


def _product_daily_rate(lots, forecast_rate) -> float:
    """
    Effective units-per-day for a product.

    1. Forecast, if one exists and is positive.
    2. Otherwise, aggregate consumption across the product's lots:
       total_consumed / max_age. This is the crudest possible
       velocity estimate and is only used until the forecast
       pipeline produces a real signal.
    3. Zero if neither is available. Returning a fabricated rate
       would trigger false alarms on lots that have no sales history.
    """
    if forecast_rate is not None and forecast_rate > 0:
        return float(forecast_rate)

    total_consumed = sum(
        float(s.consumed_unit_quantity or 0) for s in lots
    )
    max_age = max((s.age_days or 0) for s in lots)

    if max_age >= MIN_AGE_FOR_FALLBACK_DAYS and total_consumed > 0:
        return total_consumed / max_age

    return 0.0


# =====================================================================
# FEFO allocation
# =====================================================================

def _simulate_fefo(lots, daily_rate: float) -> dict:
    """
    Allocate demand across competing lots of the same product.

    Model
    -----
    The shop sells `daily_rate` units/day, drawn from the lot with
    the nearest expiry. When a lot is depleted, demand flows to the
    next lot. When a lot expires with stock remaining, that stock is
    written off and future demand skips to the next lot.

    Returns
    -------
    { snapshot_id: units_sold_before_expiry }
    """
    result = {s.id: 0.0 for s in lots}

    if daily_rate <= 0 or not lots:
        return result

    ordered = sorted(
        lots,
        key=lambda s: (s.expiry_date or date.max, str(s.id)),
    )

    # Fractional-day cursor tracking how far we have consumed the
    # timeline. Starts at 0 (as_of_date) and advances by take/rate.
    cursor = 0.0

    for lot in ordered:
        d = float(lot.days_to_expiry or 0)

        # Lot expires at or before the current cursor — no demand
        # reaches it.
        if d <= cursor:
            continue

        stock = float(lot.current_unit_quantity or 0)
        if stock <= 0:
            continue

        # How many units does the shop move between the cursor and
        # this lot's expiry?
        demand_in_window = daily_rate * (d - cursor)
        take = min(stock, demand_in_window)

        result[lot.id] = take

        # Advance the cursor by however long it took to sell `take`.
        cursor += take / daily_rate

    return result


# =====================================================================
# Scoring
# =====================================================================

def _score_lot(snapshot, as_of_date: date, expected_sell_through: float) -> ExpiryRisk:
    """
    Compute expiry risk metrics for a single lot given its FEFO
    allocation.
    """
    days_to_expiry = snapshot.days_to_expiry or 0
    current_qty = float(snapshot.current_unit_quantity or 0)

    expected_unsold = max(0.0, current_qty - expected_sell_through)

    if current_qty <= 0:
        probability = 0.0
    else:
        probability = min(1.0, expected_unsold / current_qty)

    landed_cost = float(snapshot.landed_unit_cost or 0)
    write_off_value = Decimal(str(expected_unsold * landed_cost))

    action = _recommend_action(probability, days_to_expiry)

    return ExpiryRisk(
        entity_id=snapshot.entity_id,
        tier=snapshot.tier,
        as_of_date=as_of_date,
        wholesaler_receipt_id=snapshot.wholesaler_receipt_id,
        retailer_receipt_id=snapshot.retailer_receipt_id,
        product_id=snapshot.product_id,
        days_to_expiry=days_to_expiry,
        current_quantity=snapshot.current_unit_quantity,
        current_value_at_cost=snapshot.lot_value_at_cost,
        expected_sell_through_before_expiry=round(
            expected_sell_through, 4,
        ),
        expected_unsold_quantity=round(expected_unsold, 4),
        expected_write_off_value=write_off_value,
        expiry_probability=round(probability, 4),
        recommended_action=action,
    )


# =====================================================================
# Recommendation logic
# =====================================================================

def _recommend_action(probability: float, days_to_expiry: int) -> str:
    """
    Map expiry probability to a recommended action. The choice also
    considers how close the lot is to expiry.
    """
    if days_to_expiry < 0:
        # Already expired — nothing to do but write it off.
        return "write_off"
    if probability >= WRITE_OFF_PROBABILITY:
        return "write_off" if days_to_expiry <= 30 else "discount"
    if probability >= DISCOUNT_PROBABILITY:
        return "discount"
    if probability >= TRANSFER_PROBABILITY:
        return "transfer" if days_to_expiry <= 60 else "monitor"
    if probability >= MONITOR_PROBABILITY:
        return "monitor"
    return "none"