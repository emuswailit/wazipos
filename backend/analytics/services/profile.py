# analytics/services/profile.py

"""
Product inventory profile builder.

Rolls InventorySnapshot rows up to ProductInventoryProfile —
one row per (entity, product, tier, as_of_date).

Idempotent: rerunning for the same date replaces all rows for that date.
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import (
    Avg, Count, Max, Min, Q, Sum,
)

from analytics.models import InventorySnapshot, ProductInventoryProfile


def build_product_profiles(as_of_date: date | None = None) -> dict:
    """
    Aggregate InventorySnapshot to ProductInventoryProfile.

    Returns a summary dict.

    Usage:
        from analytics.services.profile import build_product_profiles
        result = build_product_profiles()                # today
        result = build_product_profiles(date(2026, 9, 15))
    """
    as_of_date = as_of_date or date.today()

    profiles = _aggregate_profiles(as_of_date)

    with transaction.atomic():
        ProductInventoryProfile.objects.filter(as_of_date=as_of_date).delete()
        if profiles:
            ProductInventoryProfile.objects.bulk_create(profiles, batch_size=500)

    return {
        "as_of_date": as_of_date.isoformat(),
        "profiles_created": len(profiles),
    }


# =====================================================================
# Aggregation
# =====================================================================

def _aggregate_profiles(as_of_date: date) -> list[ProductInventoryProfile]:
    """
    Group snapshots by (entity, product, tier) and produce profiles.
    """
    # Base annotation for each aggregate bucket
    rows = (
        InventorySnapshot.objects
        .filter(snapshot_date=as_of_date)
        .values("entity_id", "product_id", "tier")
        .annotate(
            # ---- Counts ----
            active_lot_count=Count("id"),
            # ---- Quantities ----
            total_on_hand_units=Sum("current_unit_quantity"),
            total_reserved_units=Sum("reserved_unit_quantity"),
            # ---- Age / expiry landmarks ----
            oldest_lot_age_days=Max("age_days"),
            nearest_expiry_days=Min(
                "days_to_expiry",
                filter=Q(days_to_expiry__gte=0),
            ),
            # ---- Values ----
            total_value_at_cost=Sum("lot_value_at_cost"),
            total_value_at_sale=Sum("lot_value_at_sale"),
            total_potential_margin=Sum("potential_margin"),
            avg_margin_pct=Avg("margin_pct"),
            # ---- Placement split (retail only) ----
            value_owned_at_cost=Sum(
                "lot_value_at_cost",
                filter=Q(in_placement=False),
            ),
            value_placement_at_cost=Sum(
                "lot_value_at_cost",
                filter=Q(in_placement=True),
            ),
            # ---- Risk buckets ----
            value_expiring_30d=Sum(
                "lot_value_at_cost",
                filter=Q(
                    is_expired=False,
                    days_to_expiry__gte=0,
                    days_to_expiry__lte=30,
                ),
            ),
            value_expiring_90d=Sum(
                "lot_value_at_cost",
                filter=Q(
                    is_expired=False,
                    days_to_expiry__gte=0,
                    days_to_expiry__lte=90,
                ),
            ),
            value_expired=Sum(
                "lot_value_at_cost",
                filter=Q(is_expired=True),
            ),
            value_dead_stock=Sum(
                "lot_value_at_cost",
                filter=Q(aging_bucket="dead"),
            ),
        )
    )

    profiles = []
    for r in rows:
        profiles.append(ProductInventoryProfile(
            entity_id=r["entity_id"],
            product_id=r["product_id"],
            tier=r["tier"],
            as_of_date=as_of_date,
            total_on_hand_units=r["total_on_hand_units"] or 0,
            total_reserved_units=r["total_reserved_units"] or 0,
            active_lot_count=r["active_lot_count"] or 0,
            oldest_lot_age_days=r["oldest_lot_age_days"],
            nearest_expiry_days=r["nearest_expiry_days"],
            total_value_at_cost=_d(r["total_value_at_cost"]),
            total_value_at_sale=_d(r["total_value_at_sale"]),
            total_potential_margin=_d(r["total_potential_margin"]),
            avg_margin_pct=r["avg_margin_pct"],
            value_owned_at_cost=_d(r["value_owned_at_cost"]),
            value_placement_at_cost=_d(r["value_placement_at_cost"]),
            value_expiring_30d=_d(r["value_expiring_30d"]),
            value_expiring_90d=_d(r["value_expiring_90d"]),
            value_expired=_d(r["value_expired"]),
            value_dead_stock=_d(r["value_dead_stock"]),
        ))
    return profiles


# =====================================================================
# Helpers
# =====================================================================

def _d(value) -> Decimal:
    """Coerce None to Decimal('0.00')."""
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))