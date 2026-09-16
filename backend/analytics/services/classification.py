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

Requires at least MIN_HISTORY_DAYS of ProductInventoryProfile history
to produce meaningful classes. Until then, fields stay NULL.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Avg, Count, Q, StdDev, Sum

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

    # Pull profile rows for the day we're classifying
    today_profiles = list(
        ProductInventoryProfile.objects
        .filter(as_of_date=as_of_date)
        .values("id", "entity_id", "tier", "product_id", "total_value_at_cost")
    )

    if not today_profiles:
        return {"as_of_date": as_of_date.isoformat(), "classified": 0}

    # Group profiles by (entity, tier) so ABC/XYZ is computed per tenant
    by_tenant: dict = {}
    for p in today_profiles:
        key = (p["entity_id"], p["tier"])
        by_tenant.setdefault(key, []).append(p)

    updates = []

    for (entity_id, tier), group in by_tenant.items():
        # ---- ABC: share of inventory value at cost ----
        ranked = sorted(
            group,
            key=lambda x: x["total_value_at_cost"] or Decimal("0"),
            reverse=True,
        )
        total_value = sum(
            (x["total_value_at_cost"] or Decimal("0")) for x in ranked
        )

        abc_by_profile_id = {}
        if total_value > 0:
            cumulative = Decimal("0")
            for p in ranked:
                cumulative += p["total_value_at_cost"] or Decimal("0")
                share = float(cumulative / total_value)
                if share <= ABC_THRESHOLDS[0]:
                    abc_by_profile_id[p["id"]] = "A"
                elif share <= ABC_THRESHOLDS[1]:
                    abc_by_profile_id[p["id"]] = "B"
                else:
                    abc_by_profile_id[p["id"]] = "C"

        # ---- XYZ: variability of on-hand value over the window ----
        xyz_by_profile_id = {}
        for p in group:
            values = list(
                ProductInventoryProfile.objects
                .filter(
                    entity_id=entity_id,
                    tier=tier,
                    product_id=p["product_id"],
                    as_of_date__gte=window_start,
                    as_of_date__lte=as_of_date,
                )
                .order_by("as_of_date")
                .values_list("total_value_at_cost", flat=True)
            )

            if len(values) < MIN_HISTORY_DAYS:
                xyz_by_profile_id[p["id"]] = None
                continue

            numeric = [float(v or 0) for v in values]
            mean = sum(numeric) / len(numeric)

            if mean == 0:
                xyz_by_profile_id[p["id"]] = "X"
                continue

            variance = sum((v - mean) ** 2 for v in numeric) / len(numeric)
            std = variance ** 0.5
            cv = std / mean

            if cv <= CV_THRESHOLDS[0]:
                xyz_by_profile_id[p["id"]] = "X"
            elif cv <= CV_THRESHOLDS[1]:
                xyz_by_profile_id[p["id"]] = "Y"
            else:
                xyz_by_profile_id[p["id"]] = "Z"

        # Collect per-row updates
        for p in group:
            abc = abc_by_profile_id.get(p["id"])
            xyz = xyz_by_profile_id.get(p["id"])
            if abc is not None or xyz is not None:
                updates.append((p["id"], abc, xyz))

    # ---- Persist ----
    with transaction.atomic():
        for profile_id, abc, xyz in updates:
            ProductInventoryProfile.objects.filter(id=profile_id).update(
                abc_class=abc, xyz_class=xyz,
            )

    return {
        "as_of_date": as_of_date.isoformat(),
        "window_days": window_days,
        "classified": len(updates),
    }