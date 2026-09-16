# analytics/services/expiry_risk.py

"""
Per-lot expiry risk scoring.

For each active lot with an expiry date and stock on hand, computes:
    - Expected sell-through before expiry
    - Expected unsold quantity at expiry
    - Expiry probability (0-1)
    - Expected write-off value
    - Recommended action

Without demand history, sell-through is estimated from the lot's
consumption rate so far. When demand forecasting lands, replace
_estimate_sell_through with a demand-based projection.

Idempotent: rerunning for the same date replaces all rows for that date.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction

from analytics.models import ExpiryRisk, InventorySnapshot


# =====================================================================
# Tunables
# =====================================================================

# Lot must be within this many days of expiry to be scored
MAX_DAYS_TO_EXPIRY = 365

# Heuristic thresholds for the recommended action
WRITE_OFF_PROBABILITY = 0.80      # ≥80% → accept write-off
DISCOUNT_PROBABILITY = 0.50       # ≥50% → discount
TRANSFER_PROBABILITY = 0.30       # ≥30% → consider transfer
MONITOR_PROBABILITY = 0.10        # ≥10% → monitor


def compute_expiry_risks(
    as_of_date: date | None = None,
    max_days_to_expiry: int = MAX_DAYS_TO_EXPIRY,
) -> dict:
    """
    Score every active lot with an expiry date.

    Returns a summary dict.

    Usage:
        from analytics.services.expiry_risk import compute_expiry_risks
        result = compute_expiry_risks()
    """
    as_of_date = as_of_date or date.today()

    # Pull candidate snapshots — the latest ones for the given date
    candidates = (
        InventorySnapshot.objects
        .filter(
            snapshot_date=as_of_date,
            current_unit_quantity__gt=0,
            expiry_date__isnull=False,
            expiry_date__gte=as_of_date,
            days_to_expiry__lte=max_days_to_expiry,
        )
        .select_related("product", "entity")
    )

    risks = []
    for s in candidates.iterator(chunk_size=500):
        risks.append(_score_lot(s, as_of_date))

    with transaction.atomic():
        ExpiryRisk.objects.filter(as_of_date=as_of_date).delete()
        if risks:
            ExpiryRisk.objects.bulk_create(risks, batch_size=500)

    return {
        "as_of_date": as_of_date.isoformat(),
        "lots_scored": len(risks),
    }


# =====================================================================
# Scoring
# =====================================================================

def _score_lot(snapshot, as_of_date: date) -> ExpiryRisk:
    """
    Compute expiry risk metrics for a single lot.
    """
    days_to_expiry = snapshot.days_to_expiry or 0
    current_qty = float(snapshot.current_unit_quantity or 0)

    # ---- Step 1: Estimate daily sell-through rate ----
    daily_rate = _estimate_daily_sell_through(snapshot)

    # ---- Step 2: Project sell-through before expiry ----
    expected_sell_through = min(current_qty, daily_rate * days_to_expiry)
    expected_unsold = max(0.0, current_qty - expected_sell_through)

    # ---- Step 3: Expiry probability ----
    if current_qty <= 0:
        probability = 0.0
    else:
        probability = min(1.0, expected_unsold / current_qty)

    # ---- Step 4: Write-off value ----
    landed_cost = float(snapshot.landed_unit_cost or 0)
    write_off_value = Decimal(str(expected_unsold * landed_cost))

    # ---- Step 5: Recommended action ----
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
        expected_sell_through_before_expiry=round(expected_sell_through, 4),
        expected_unsold_quantity=round(expected_unsold, 4),
        expected_write_off_value=write_off_value,
        expiry_probability=round(probability, 4),
        recommended_action=action,
    )


# =====================================================================
# Sell-through estimation (heuristic — replace with demand model later)
# =====================================================================

def _estimate_daily_sell_through(snapshot) -> float:
    """
    Estimate how many units this lot sells per day.

    Primary source: the latest DemandForecast for this
    (entity, product, tier) at horizon 1.

    Fallback: heuristic from consumed / age_days, if no forecast
    exists yet. This happens on day one for a new entity.
    """
    from analytics.models import DemandForecast

    forecast = (
        DemandForecast.objects
        .filter(
            entity_id=snapshot.entity_id,
            product_id=snapshot.product_id,
            tier=snapshot.tier,
            horizon_days=1,
        )
        .order_by("-run_date")
        .values_list("point_forecast", flat=True)
        .first()
    )

    if forecast is not None:
        return float(forecast)

    # ---- Fallback heuristic (used only when no forecast exists) ----
    consumed = float(snapshot.consumed_unit_quantity or 0)
    age_days = float(snapshot.age_days or 0)

    if age_days >= 7 and consumed > 0:
        return consumed / age_days

    current = float(snapshot.current_unit_quantity or 0)
    if current <= 0:
        return 0.0
    return max(current * 0.01, 0.1)
# =====================================================================
# Recommendation logic
# =====================================================================

def _recommend_action(probability: float, days_to_expiry: int) -> str:
    """
    Map expiry probability to a recommended action.
    The choice also considers how close the lot is to expiry.
    """
    if probability >= WRITE_OFF_PROBABILITY:
        return "write_off" if days_to_expiry <= 30 else "discount"
    if probability >= DISCOUNT_PROBABILITY:
        return "discount"
    if probability >= TRANSFER_PROBABILITY:
        return "transfer" if days_to_expiry <= 60 else "monitor"
    if probability >= MONITOR_PROBABILITY:
        return "monitor"
    return "none"