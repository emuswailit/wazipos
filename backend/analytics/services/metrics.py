# analytics/services/metrics.py

"""
Entity-level metrics builder.

Rolls ProductInventoryProfile rows up to InventoryMetricSnapshot —
one row per (entity, tier, snapshot_date).

Idempotent: rerunning for the same date replaces all rows for that date.
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum

from analytics.models import ProductInventoryProfile, InventoryMetricSnapshot


def build_entity_metrics(snapshot_date: date | None = None) -> dict:
    """
    Aggregate ProductInventoryProfile to InventoryMetricSnapshot.

    Returns a summary dict.

    Usage:
        from analytics.services.metrics import build_entity_metrics
        result = build_entity_metrics()                # today
        result = build_entity_metrics(date(2026, 9, 15))
    """
    snapshot_date = snapshot_date or date.today()

    metrics = _aggregate_metrics(snapshot_date)

    with transaction.atomic():
        InventoryMetricSnapshot.objects.filter(snapshot_date=snapshot_date).delete()
        if metrics:
            InventoryMetricSnapshot.objects.bulk_create(metrics, batch_size=500)

    return {
        "snapshot_date": snapshot_date.isoformat(),
        "metrics_created": len(metrics),
    }


# =====================================================================
# Aggregation
# =====================================================================

def _aggregate_metrics(snapshot_date: date) -> list[InventoryMetricSnapshot]:
    """
    Group product profiles by (entity, tier) and produce metric rows.
    """
    rows = (
        ProductInventoryProfile.objects
        .filter(as_of_date=snapshot_date)
        .values("entity_id", "tier")
        .annotate(
            # ---- Counts ----
            # active_product_count = number of profiles in this group
            active_product_count=Count("id"),
            # active_lot_count = sum of active_lot_count across products
            active_lot_count=Sum("active_lot_count"),

            # ---- Values ----
            total_value_at_cost=Sum("total_value_at_cost"),
            total_value_at_sale=Sum("total_value_at_sale"),
            total_potential_margin=Sum("total_potential_margin"),

            # ---- Risk buckets ----
            value_expiring_30d=Sum("value_expiring_30d"),
            value_expiring_90d=Sum("value_expiring_90d"),
            value_expired=Sum("value_expired"),
            value_dead_stock=Sum("value_dead_stock"),

            # ---- Aging distribution via product-level value_dead_stock ----
            # The product profile has value_dead_stock but not the full
            # fresh/normal/aging/slow/dead distribution. We approximate
            # aging buckets here from the product profile's aggregated
            # values. To do this exactly, the snapshot-level aging data
            # would need to be carried up to the profile level.
        )
    )

    metrics = []
    for r in rows:
        # 60d bucket: we don't have it on the profile. Approximate with 90d
        # unless we add a dedicated field. For now, mirror 90d.
        value_expiring_60d = r["value_expiring_90d"] or Decimal("0.00")

        metrics.append(InventoryMetricSnapshot(
            entity_id=r["entity_id"],
            tier=r["tier"],
            snapshot_date=snapshot_date,
            active_lot_count=r["active_lot_count"] or 0,
            active_product_count=r["active_product_count"] or 0,
            expired_lot_count=0,       # populated below if available
            expiring_soon_lot_count=0, # populated below if available
            total_value_at_cost=_d(r["total_value_at_cost"]),
            total_value_at_sale=_d(r["total_value_at_sale"]),
            total_potential_margin=_d(r["total_potential_margin"]),
            value_expiring_30d=_d(r["value_expiring_30d"]),
            value_expiring_60d=_d(value_expiring_60d),
            value_expiring_90d=_d(r["value_expiring_90d"]),
            value_expired=_d(r["value_expired"]),
            value_dead_stock=_d(r["value_dead_stock"]),
            # Aging buckets — filled by a second pass below
            value_fresh=Decimal("0.00"),
            value_normal=Decimal("0.00"),
            value_aging=Decimal("0.00"),
            value_slow=Decimal("0.00"),
            value_dead=_d(r["value_dead_stock"]),
        ))

    # Second pass: fill in aging distribution and lot counts from snapshots
    _enrich_from_snapshots(metrics, snapshot_date)

    return metrics


def _enrich_from_snapshots(
    metrics: list[InventoryMetricSnapshot],
    snapshot_date: date,
) -> None:
    """
    Fill fields that require snapshot-level aggregation:
      - aging distribution (fresh/normal/aging/slow/dead)
      - expired_lot_count, expiring_soon_lot_count
    Mutates the metrics list in place.
    """
    from analytics.models import InventorySnapshot

    # Build a lookup keyed by (entity_id, tier)
    by_key = {(m.entity_id, m.tier): m for m in metrics}

    if not by_key:
        return

    # Single grouped query across all entities
    rows = (
        InventorySnapshot.objects
        .filter(snapshot_date=snapshot_date)
        .values("entity_id", "tier")
        .annotate(
            expired_lots=Count("id", filter=Q(is_expired=True)),
            expiring_lots=Count(
                "id",
                filter=Q(is_expiring_soon=True, is_expired=False),
            ),
            value_fresh=Sum(
                "lot_value_at_cost",
                filter=Q(aging_bucket="fresh"),
            ),
            value_normal=Sum(
                "lot_value_at_cost",
                filter=Q(aging_bucket="normal"),
            ),
            value_aging=Sum(
                "lot_value_at_cost",
                filter=Q(aging_bucket="aging"),
            ),
            value_slow=Sum(
                "lot_value_at_cost",
                filter=Q(aging_bucket="slow"),
            ),
            value_dead_bucket=Sum(
                "lot_value_at_cost",
                filter=Q(aging_bucket="dead"),
            ),
        )
    )

    for r in rows:
        key = (r["entity_id"], r["tier"])
        m = by_key.get(key)
        if not m:
            continue
        m.expired_lot_count = r["expired_lots"] or 0
        m.expiring_soon_lot_count = r["expiring_lots"] or 0
        m.value_fresh = _d(r["value_fresh"])
        m.value_normal = _d(r["value_normal"])
        m.value_aging = _d(r["value_aging"])
        m.value_slow = _d(r["value_slow"])
        m.value_dead = _d(r["value_dead_bucket"])


# =====================================================================
# Helpers
# =====================================================================

def _d(value) -> Decimal:
    """Coerce None to Decimal('0.00')."""
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))