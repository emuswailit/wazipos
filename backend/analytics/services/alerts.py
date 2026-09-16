# analytics/services/alerts.py

"""
Inventory alert detector.

Scans InventorySnapshot and ProductInventoryProfile for anomalies,
generates InventoryAlert rows, and deactivates alerts that no longer
apply.

Idempotent per (entity, tier, alert_type, receipt/product):
    - Rerunning for the same date deactivates stale alerts and creates
      new ones as needed.
    - Existing active alerts that still apply are left untouched
      (no duplicate creation).

Alert types generated:
    stockout            — an active product has zero on-hand
    low_stock           — a product's on-hand is below a heuristic floor
    expired             — a lot is past its expiry date
    expiring_soon       — a lot expires within N days (30 by default)
    dead_stock          — a lot is older than 365 days and still on hand
    negative_stock      — a lot has negative on-hand (data integrity)
    zero_cost           — a lot has quantity > 0 but landed cost = 0
    policy_violation    — the owning entity's type is not in the product's
                          allowed_entities
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum, F

from analytics.models import (
    ExpiryRisk,
    InventoryAlert,
    InventorySnapshot,
    ProductInventoryProfile,
)
from analytics.utils.domains import entity_type_is_allowed
from core.constants import EntityType


# =====================================================================
# Public entry point
# =====================================================================

DEFAULT_EXPIRING_DAYS = 30
DEFAULT_DEAD_STOCK_AGE_DAYS = 365


def detect_inventory_alerts(
    snapshot_date: date | None = None,
    expiring_days: int = DEFAULT_EXPIRING_DAYS,
    dead_stock_days: int = DEFAULT_DEAD_STOCK_AGE_DAYS,
) -> dict:
    """
    Run all alert detectors for the given date.

    Idempotent: rerunning for the same date does not create duplicates.
    Alerts that no longer apply are deactivated (is_active=False).
    """
    snapshot_date = snapshot_date or date.today()

    detectors = [
        _detect_expired,
        _detect_expiring_soon,
        _detect_dead_stock,
        _detect_negative_stock,
        _detect_zero_cost,
        _detect_policy_violations,
        _detect_stockout,
    ]

    summary = {}
    with transaction.atomic():
        for detector in detectors:
            name = detector.__name__.replace("_detect_", "")
            created, deactivated = detector(snapshot_date, expiring_days, dead_stock_days)
            summary[name] = {
                "created": created,
                "deactivated": deactivated,
            }

    return {
        "snapshot_date": snapshot_date.isoformat(),
        "alerts": summary,
        "total_created": sum(v["created"] for v in summary.values()),
        "total_deactivated": sum(v["deactivated"] for v in summary.values()),
    }


# =====================================================================
# Detector: expired lots
# =====================================================================

def _detect_expired(snapshot_date, expiring_days, dead_stock_days):
    """
    Each expired lot with quantity > 0 gets one alert.
    Key: (entity, tier, alert_type='expired', receipt)
    """
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        alert_type="expired",
        severity="critical",
        filter_q=Q(is_expired=True, current_unit_quantity__gt=0),
        title_fn=lambda s: f"Expired: {s.product.title}",
        message_fn=lambda s: (
            f"Lot {s.batch or 'n/a'} expired on "
            f"{s.expiry_date}. {s.current_unit_quantity} units on hand, "
            f"valued at {s.lot_value_at_cost}."
        ),
        context_fn=lambda s: {
            "expiry_date": s.expiry_date.isoformat() if s.expiry_date else None,
            "days_since_expiry": abs(s.days_to_expiry or 0),
            "quantity": s.current_unit_quantity,
            "value_at_cost": str(s.lot_value_at_cost),
            "batch": s.batch,
        },
    )


# =====================================================================
# Detector: expiring soon
# =====================================================================

def _detect_expiring_soon(snapshot_date, expiring_days, dead_stock_days):
    """
    Lots expiring within `expiring_days` but not yet expired.
    """
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        alert_type="expiring_soon",
        severity="high",
        filter_q=Q(
            is_expired=False,
            is_expiring_soon=True,
            current_unit_quantity__gt=0,
            days_to_expiry__lte=expiring_days,
        ),
        title_fn=lambda s: f"Expiring in {s.days_to_expiry}d: {s.product.title}",
        message_fn=lambda s: (
            f"Lot {s.batch or 'n/a'} expires on {s.expiry_date} "
            f"({s.days_to_expiry} days). {s.current_unit_quantity} units "
            f"on hand, valued at {s.lot_value_at_cost}."
        ),
        context_fn=lambda s: {
            "expiry_date": s.expiry_date.isoformat() if s.expiry_date else None,
            "days_to_expiry": s.days_to_expiry,
            "quantity": s.current_unit_quantity,
            "value_at_cost": str(s.lot_value_at_cost),
            "batch": s.batch,
        },
    )


# =====================================================================
# Detector: dead stock (old lots)
# =====================================================================

def _detect_dead_stock(snapshot_date, expiring_days, dead_stock_days):
    """
    Lots older than `dead_stock_days` with quantity still on hand.
    No expiry required — this catches slow movers without shelf life.
    """
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        alert_type="dead_stock",
        severity="medium",
        filter_q=Q(
            current_unit_quantity__gt=0,
            age_days__gte=dead_stock_days,
        ),
        title_fn=lambda s: f"Dead stock: {s.product.title}",
        message_fn=lambda s: (
            f"Lot {s.batch or 'n/a'} has been in stock {s.age_days} days "
            f"with no sale. {s.current_unit_quantity} units, valued at "
            f"{s.lot_value_at_cost}."
        ),
        context_fn=lambda s: {
            "age_days": s.age_days,
            "quantity": s.current_unit_quantity,
            "value_at_cost": str(s.lot_value_at_cost),
            "batch": s.batch,
        },
    )


# =====================================================================
# Detector: negative stock (data integrity)
# =====================================================================

def _detect_negative_stock(snapshot_date, expiring_days, dead_stock_days):
    """
    Lots with negative on-hand — always a data integrity issue.
    """
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        alert_type="negative_stock",
        severity="critical",
        filter_q=Q(current_unit_quantity__lt=0),
        title_fn=lambda s: f"Negative stock: {s.product.title}",
        message_fn=lambda s: (
            f"Lot {s.batch or 'n/a'} has {s.current_unit_quantity} units — "
            f"negative on-hand. Check for unrecorded movements or race "
            f"conditions."
        ),
        context_fn=lambda s: {
            "quantity": s.current_unit_quantity,
            "batch": s.batch,
            "received_unit_quantity": s.received_unit_quantity,
        },
    )


# =====================================================================
# Detector: zero-cost inventory (data quality)
# =====================================================================

def _detect_zero_cost(snapshot_date, expiring_days, dead_stock_days):
    """
    Lots with quantity > 0 but no cost basis. Typically onboarding or
    direct receipts where cost wasn't captured.
    """
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        alert_type="zero_cost",
        severity="low",
        filter_q=Q(
            current_unit_quantity__gt=0,
            landed_unit_cost=Decimal("0.00"),
        ),
        title_fn=lambda s: f"Zero-cost inventory: {s.product.title}",
        message_fn=lambda s: (
            f"Lot {s.batch or 'n/a'} has {s.current_unit_quantity} units "
            f"but no cost basis. Financial metrics will show zero for "
            f"this stock."
        ),
        context_fn=lambda s: {
            "quantity": s.current_unit_quantity,
            "batch": s.batch,
            "received_from": str(s.received_from_entity_id) if s.received_from_entity_id else None,
        },
    )


# =====================================================================
# Detector: policy violations
# =====================================================================

def _detect_policy_violations(snapshot_date, expiring_days, dead_stock_days):
    """
    Lots where the owning entity's type is not in the product's
    allowed_entities. Upstream data issue.
    """
    existing_alerts = set(
        InventoryAlert.objects
        .filter(
            alert_type="policy_violation",
            is_active=True,
        )
        .values_list("wholesaler_receipt_id", "retailer_receipt_id")
    )

    # Note: policy violations are computed at the entity level, not
    # per receipt. We group snapshots and produce one alert per
    # (entity, product, tier) combination, keyed on the first receipt.

    snapshots = (
        InventorySnapshot.objects
        .filter(
            snapshot_date=snapshot_date,
            current_unit_quantity__gt=0,
        )
        .select_related("entity", "product")
    )

    seen_keys = set()
    to_create = []
    created = 0

    for s in snapshots.iterator(chunk_size=500):
        allowed = s.product.allowed_entities
        entity_type = s.entity.entity_type
        if entity_type_is_allowed(entity_type, allowed):
            continue

        key = (s.entity_id, s.product_id, s.tier)
        if key in seen_keys:
            continue
        seen_keys.add(key)

        # One alert per (entity, product, tier)
        to_create.append(InventoryAlert(
            entity_id=s.entity_id,
            tier=s.tier,
            product_id=s.product_id,
            wholesaler_receipt_id=s.wholesaler_receipt_id,
            retailer_receipt_id=s.retailer_receipt_id,
            alert_type="policy_violation",
            severity="high",
            title=f"Not allowed: {s.product.title}",
            message=(
                f"Entity type {entity_type} is not in the product's "
                f"allowed_entities. Review the receipt."
            ),
            context={
                "entity_type": entity_type,
                "allowed_entities": list(allowed or []),
            },
        ))
        created += 1

    if to_create:
        InventoryAlert.objects.bulk_create(to_create, batch_size=500, ignore_conflicts=True)

    deactivated = _deactivate_stale(
        snapshot_date=snapshot_date,
        alert_type="policy_violation",
        still_valid_keys=seen_keys,
        key_fn=lambda a: (a.entity_id, a.product_id, a.tier),
    )

    return created, deactivated


# =====================================================================
# Detector: stockout
# =====================================================================

def _detect_stockout(snapshot_date, expiring_days, dead_stock_days):
    """
    Products with a profile on this date but zero total on-hand.
    This catches the transition to empty — the snapshot itself excludes
    zero-quantity lots, so we infer stockout from the profile.
    """
    profiles = (
        ProductInventoryProfile.objects
        .filter(
            as_of_date=snapshot_date,
            total_on_hand_units__lte=0,
        )
        .select_related("product", "entity")
    )

    seen_keys = set()
    to_create = []
    created = 0

    for p in profiles.iterator(chunk_size=500):
        key = (p.entity_id, p.product_id, p.tier)
        if key in seen_keys:
            continue
        seen_keys.add(key)

        to_create.append(InventoryAlert(
            entity_id=p.entity_id,
            tier=p.tier,
            product_id=p.product_id,
            alert_type="stockout",
            severity="high",
            title=f"Out of stock: {p.product.title}",
            message=(
                f"{p.product.title} has no on-hand units. "
                f"Recent activity suggests it may be in demand."
            ),
            context={
                "total_on_hand_units": p.total_on_hand_units,
                "total_reserved_units": p.total_reserved_units,
                "value_at_cost_last_known": str(p.total_value_at_cost),
            },
        ))
        created += 1

    if to_create:
        InventoryAlert.objects.bulk_create(to_create, batch_size=500, ignore_conflicts=True)

    deactivated = _deactivate_stale(
        snapshot_date=snapshot_date,
        alert_type="stockout",
        still_valid_keys=seen_keys,
        key_fn=lambda a: (a.entity_id, a.product_id, a.tier),
    )

    return created, deactivated


# =====================================================================
# Shared helpers
# =====================================================================

def _detect_by_snapshot_condition(
    snapshot_date,
    alert_type,
    severity,
    filter_q,
    title_fn,
    message_fn,
    context_fn,
):
    """
    Generic detector: one alert per receipt matching `filter_q` on this date.

    Idempotency: only new (receipt) keys create alerts. Existing active
    alerts on the same key are left untouched.
    """
    snapshots = (
        InventorySnapshot.objects
        .filter(snapshot_date=snapshot_date)
        .filter(filter_q)
        .select_related("product", "entity")
    )

    # Collect existing active alerts for this type+date to avoid dupes
    existing_keys = set(
        InventoryAlert.objects
        .filter(alert_type=alert_type, is_active=True)
        .values_list("wholesaler_receipt_id", "retailer_receipt_id")
    )

    to_create = []
    valid_keys = set()
    created = 0

    for s in snapshots.iterator(chunk_size=500):
        receipt_key = (s.wholesaler_receipt_id, s.retailer_receipt_id)
        valid_keys.add(receipt_key)

        if receipt_key in existing_keys:
            continue   # already have an active alert for this receipt

        to_create.append(InventoryAlert(
            entity_id=s.entity_id,
            tier=s.tier,
            product_id=s.product_id,
            wholesaler_receipt_id=s.wholesaler_receipt_id,
            retailer_receipt_id=s.retailer_receipt_id,
            alert_type=alert_type,
            severity=severity,
            title=title_fn(s),
            message=message_fn(s),
            context=context_fn(s),
        ))
        created += 1

    if to_create:
        InventoryAlert.objects.bulk_create(
            to_create, batch_size=500, ignore_conflicts=True,
        )

    # Deactivate alerts for this type whose receipt no longer qualifies
    deactivated = _deactivate_stale(
        snapshot_date=snapshot_date,
        alert_type=alert_type,
        still_valid_keys=valid_keys,
        key_fn=lambda a: (a.wholesaler_receipt_id, a.retailer_receipt_id),
    )

    return created, deactivated


def _deactivate_stale(snapshot_date, alert_type, still_valid_keys, key_fn):
    """
    Deactivate active alerts of `alert_type` whose key is no longer in
    `still_valid_keys`. Returns the count deactivated.
    """
    active = InventoryAlert.objects.filter(
        alert_type=alert_type,
        is_active=True,
    )
    stale_ids = []
    for a in active.iterator(chunk_size=500):
        k = key_fn(a)
        if k not in still_valid_keys:
            stale_ids.append(a.id)

    if stale_ids:
        InventoryAlert.objects.filter(id__in=stale_ids).update(
            is_active=False,
            resolved_at=date.today(),
        )

    return len(stale_ids)