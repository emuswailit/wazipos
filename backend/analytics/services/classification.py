# analytics/services/classification.py

"""
ABC/XYZ classification service.

Populates abc_class and xyz_class on ProductInventoryProfile.

ABC = share of inventory value at cost over a rolling window:
    A: top 80% of value
    B: next 15%
    C: last 5%

XYZ = variability of on-hand value over the same window:
    X: CV <= 0.25 (stable)
    Y: CV <= 0.50 (moderate)
    Z: CV >  0.50 (erratic)

ABC classification is done on the day's snapshot; XYZ uses the
rolling window ending on that day.

Requires at least MIN_HISTORY_DAYS of ProductInventoryProfile history
to produce meaningful classes. Until then, fields stay NULL.
"""

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction

from analytics.models import ProductInventoryProfile


# Tunables
ABC_THRESHOLDS = (0.80, 0.95)   # cumulative share cutoffs for A / B
MIN_HISTORY_DAYS = 7            # need at least this many days of history
DEFAULT_WINDOW_DAYS = 30        # rolling window for classification
CV_THRESHOLDS = (0.25, 0.50)    # X / Y cutoff points


def classify_products(
    as_of_date: date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> dict:
    """
    Assign abc_class and xyz_class to ProductInventoryProfile rows
    on `as_of_date`, using history from the previous `window_days`.

    Idempotent: rewrites the two classification fields on the
    as_of_date profiles only. Everything else untouched.
    """
    as_of_date = as_of_date or date.today()
    window_start = as_of_date - timedelta(days=window_days)

    today_profiles = list(
        ProductInventoryProfile.objects
        .filter(as_of_date=as_of_date)
        .values(
            "id", "entity_id", "tier", "product_id",
            "total_value_at_cost",
        )
    )

    if not today_profiles:
        return {"as_of_date": as_of_date.isoformat(), "classified": 0}

    # Group by (entity, tier) — ABC/XYZ is computed per tenant
    by_tenant: dict = defaultdict(list)
    for p in today_profiles:
        by_tenant[(p["entity_id"], p["tier"])].append(p)

    # ---- One batched query for all XYZ history across every product ----
    xyz_map = _compute_xyz(
        today_profiles, window_start, as_of_date,
    )

    # ---- ABC per tenant ----
    abc_map: dict = {}
    for (entity_id, tier), group in by_tenant.items():
        abc_map.update(_compute_abc(group))

    # ---- Build update list ----
    updates = []
    for p in today_profiles:
        abc = abc_map.get(p["id"])
        xyz = xyz_map.get(p["id"])
        if abc is None and xyz is None:
            continue
        updates.append(
            ProductInventoryProfile(
                id=p["id"],
                abc_class=abc,
                xyz_class=xyz,
            )
        )

    # ---- Persist in one bulk_update ----
    with transaction.atomic():
        if updates:
            ProductInventoryProfile.objects.bulk_update(
                updates,
                ["abc_class", "xyz_class"],
                batch_size=500,
            )

    return {
        "as_of_date": as_of_date.isoformat(),
        "window_days": window_days,
        "classified": len(updates),
    }


# =====================================================================
# ABC — share of value at cost, per tenant
# =====================================================================

def _compute_abc(group: list[dict]) -> dict:
    """
    Assign A/B/C labels per profile in one (entity, tier) group.

    The item that *crosses* a threshold is the last one in the
    previous tier, not the first in the next. Concretely:

        share_before_this_item < 0.80  →  A
        share_before_this_item < 0.95  →  B
        otherwise                       →  C

    This means a single product with 100% of inventory gets A — it
    is the top 100% of inventory, so it must be A, not C.

    Returns { profile_id: "A" | "B" | "C" }.
    """
    ranked = sorted(
        group,
        key=lambda x: x["total_value_at_cost"] or Decimal("0"),
        reverse=True,
    )
    total_value = sum(
        (x["total_value_at_cost"] or Decimal("0")) for x in ranked
    )

    if total_value <= 0:
        return {}

    abc: dict = {}
    cumulative = Decimal("0")
    threshold_a, threshold_b = ABC_THRESHOLDS

    for p in ranked:
        share_before = float(cumulative / total_value)
        if share_before < threshold_a:
            abc[p["id"]] = "A"
        elif share_before < threshold_b:
            abc[p["id"]] = "B"
        else:
            abc[p["id"]] = "C"
        cumulative += p["total_value_at_cost"] or Decimal("0")

    return abc


# =====================================================================
# XYZ — variability of on-hand value, one query for all products
# =====================================================================

def _compute_xyz(
    today_profiles: list[dict],
    window_start: date,
    as_of_date: date,
) -> dict:
    """
    Compute XYZ labels from a single batched query.

    Returns { profile_id: "X" | "Y" | "Z" | None }.
    Products with fewer than MIN_HISTORY_DAYS of data get None
    (left untouched in the DB).
    """
    if not today_profiles:
        return {}

    entity_ids = {p["entity_id"] for p in today_profiles}
    product_ids = {p["product_id"] for p in today_profiles}
    tiers = {p["tier"] for p in today_profiles}

    rows = (
        ProductInventoryProfile.objects
        .filter(
            entity_id__in=entity_ids,
            product_id__in=product_ids,
            tier__in=tiers,
            as_of_date__gte=window_start,
            as_of_date__lte=as_of_date,
        )
        .values(
            "entity_id", "tier", "product_id",
            "as_of_date", "total_value_at_cost",
        )
        .order_by("entity_id", "tier", "product_id", "as_of_date")
    )

    # Group the window values by (entity, tier, product)
    series: dict = defaultdict(list)
    for r in rows:
        key = (str(r["entity_id"]), r["tier"], str(r["product_id"]))
        series[key].append(float(r["total_value_at_cost"] or 0))

    # Classify each product
    cv_by_key: dict = {}
    for key, values in series.items():
        if len(values) < MIN_HISTORY_DAYS:
            cv_by_key[key] = None
            continue

        mean = sum(values) / len(values)
        if mean == 0:
            cv_by_key[key] = 0.0
            continue

        variance = sum((v - mean) ** 2 for v in values) / len(values)
        std = variance ** 0.5
        cv_by_key[key] = std / mean

    # Map back to profile_id
    out: dict = {}
    for p in today_profiles:
        key = (str(p["entity_id"]), p["tier"], str(p["product_id"]))
        cv = cv_by_key.get(key)

        if cv is None:
            out[p["id"]] = None
            continue

        if cv <= CV_THRESHOLDS[0]:
            out[p["id"]] = "X"
        elif cv <= CV_THRESHOLDS[1]:
            out[p["id"]] = "Y"
        else:
            out[p["id"]] = "Z"

    return out