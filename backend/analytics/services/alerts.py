# analytics/services/alerts.py

"""
Inventory alert detector.

Scans InventorySnapshot and ProductInventoryProfile for anomalies,
generates InventoryAlert rows, and deactivates alerts that no longer
apply.

Idempotency
    Every detector checks active alerts of its own type before
    creating. Rerunning for the same date produces zero new rows for
    keys that already have an active alert. Rerunning also deactivates
    alerts whose underlying condition no longer holds.

Guardrail
    If there is no InventorySnapshot for the target date, the run is
    skipped entirely. Without this, an empty candidate set would
    deactivate every active alert — the opposite of what "no snapshot
    yet" should mean.

Deactivation scope
    Deactivation runs against the entities that have a snapshot for
    the date, not against the whole historical alert table. Cost is
    proportional to today's snapshot size.

Alert types generated
    stockout          — an active product has zero on-hand
    expired           — a lot is past its expiry date
    expiring_soon     — a lot expires within N days (30 by default)
    dead_stock        — a lot older than N days still on hand
    negative_stock    — a lot has negative on-hand (data integrity)
    zero_cost         — quantity > 0 but landed cost = 0
    policy_violation  — entity type not in product.allowed_entities
"""

import logging
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from analytics.models import (
    InventoryAlert,
    InventorySnapshot,
    ProductInventoryProfile,
)
from analytics.utils.domains import entity_type_is_allowed

logger = logging.getLogger(__name__)


DEFAULT_EXPIRING_DAYS = 30
DEFAULT_DEAD_STOCK_AGE_DAYS = 365


# =====================================================================
# Public entry point
# =====================================================================

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

    # ---- Refuse to run when there is no snapshot for the date ----
    # Without this guard, every detector would see an empty candidate
    # set and happily deactivate all its active alerts. Skipping the
    # run leaves prior alerts in place, which is the correct semantics
    # for "the snapshot hasn't been built yet."
    entity_scope = set(
        InventorySnapshot.objects
        .filter(snapshot_date=snapshot_date)
        .values_list("entity_id", flat=True)
        .distinct()
    )
    if not entity_scope:
        return {
            "snapshot_date": snapshot_date.isoformat(),
            "alerts": {},
            "total_created": 0,
            "total_deactivated": 0,
            "skipped": "no snapshot for date",
        }

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
            created, deactivated = detector(
                snapshot_date,
                expiring_days,
                dead_stock_days,
                entity_scope,
            )
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

def _detect_expired(snapshot_date, expiring_days, dead_stock_days, entity_scope):
    """Each expired lot with quantity > 0 gets one alert."""
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        entity_scope=entity_scope,
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

def _detect_expiring_soon(snapshot_date, expiring_days, dead_stock_days, entity_scope):
    """Lots expiring within `expiring_days` but not yet expired."""
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        entity_scope=entity_scope,
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

def _detect_dead_stock(snapshot_date, expiring_days, dead_stock_days, entity_scope):
    """
    Lots older than `dead_stock_days` with quantity still on hand.
    No expiry required — catches slow movers without shelf life.
    """
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        entity_scope=entity_scope,
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

def _detect_negative_stock(snapshot_date, expiring_days, dead_stock_days, entity_scope):
    """Lots with negative on-hand — always a data integrity issue."""
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        entity_scope=entity_scope,
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

def _detect_zero_cost(snapshot_date, expiring_days, dead_stock_days, entity_scope):
    """
    Lots with quantity > 0 but no cost basis. Typically onboarding or
    direct receipts where cost wasn't captured.
    """
    return _detect_by_snapshot_condition(
        snapshot_date=snapshot_date,
        entity_scope=entity_scope,
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
            "received_from": (
                str(s.received_from_entity_id)
                if s.received_from_entity_id else None
            ),
        },
    )


# =====================================================================
# Detector: policy violations
# =====================================================================

def _detect_policy_violations(snapshot_date, expiring_days, dead_stock_days, entity_scope):
    """
    Lots where the owning entity's type is not in the product's
    allowed_entities. One alert per (entity, product, tier) — multiple
    receipts of the same product for the same entity share one alert.
    """
    base_qs = (
        InventorySnapshot.objects
        .filter(
            snapshot_date=snapshot_date,
            current_unit_quantity__gt=0,
            entity_id__in=entity_scope,
        )
    )

    # ---- Pass 1: identify violating keys, keep one representative ----
    # Represented as primitive tuples to avoid holding model instances.
    violations: dict = {}

    for s in base_qs.select_related("entity", "product").iterator(chunk_size=500):
        allowed = s.product.allowed_entities or []
        entity_type = s.entity.entity_type
        if entity_type_is_allowed(entity_type, allowed):
            continue

        key = (s.entity_id, s.product_id, s.tier)
        if key in violations:
            continue

        violations[key] = {
            "entity_id": s.entity_id,
            "tier": s.tier,
            "product_id": s.product_id,
            "wholesaler_receipt_id": s.wholesaler_receipt_id,
            "retailer_receipt_id": s.retailer_receipt_id,
            "entity_type": entity_type,
            "product_title": s.product.title,
            "allowed_entities": list(allowed),
        }

    if not violations:
        deactivated = _deactivate_stale(
            alert_type="policy_violation",
            still_valid_keys=set(),
            key_fn=lambda a: (a.entity_id, a.product_id, a.tier),
            entity_ids=entity_scope,
        )
        return 0, deactivated

    # ---- Existing active alerts for the affected entities only ----
    existing_keys = set(
        InventoryAlert.objects
        .filter(
            alert_type="policy_violation",
            is_active=True,
            entity_id__in=entity_scope,
        )
        .values_list("entity_id", "product_id", "tier")
    )

    # ---- Create for keys not already alerted ----
    to_create = []
    for key, v in violations.items():
        if key in existing_keys:
            continue
        to_create.append(InventoryAlert(
            entity_id=v["entity_id"],
            tier=v["tier"],
            product_id=v["product_id"],
            wholesaler_receipt_id=v["wholesaler_receipt_id"],
            retailer_receipt_id=v["retailer_receipt_id"],
            alert_type="policy_violation",
            severity="high",
            title=f"Not allowed: {v['product_title']}",
            message=(
                f"Entity type {v['entity_type']} is not in the product's "
                f"allowed_entities. Review the receipt."
            ),
            context={
                "entity_type": v["entity_type"],
                "allowed_entities": v["allowed_entities"],
            },
        ))

    if to_create:
        InventoryAlert.objects.bulk_create(to_create, batch_size=500)

    deactivated = _deactivate_stale(
        alert_type="policy_violation",
        still_valid_keys=set(violations.keys()),
        key_fn=lambda a: (a.entity_id, a.product_id, a.tier),
        entity_ids=entity_scope,
    )

    return len(to_create), deactivated


# =====================================================================
# Detector: stockout
# =====================================================================

def _detect_stockout(snapshot_date, expiring_days, dead_stock_days, entity_scope):
    """
    Products with a profile on this date but zero total on-hand.
    The snapshot itself excludes zero-quantity lots, so stockout is
    inferred from the profile.
    """
    base_qs = (
        ProductInventoryProfile.objects
        .filter(
            as_of_date=snapshot_date,
            total_on_hand_units__lte=0,
            entity_id__in=entity_scope,
        )
        .select_related("product")
    )

    # ---- Pass 1: collect stockout keys, keep one representative ----
    stockouts: dict = {}
    for p in base_qs.iterator(chunk_size=500):
        key = (p.entity_id, p.product_id, p.tier)
        if key in stockouts:
            continue
        stockouts[key] = {
            "entity_id": p.entity_id,
            "tier": p.tier,
            "product_id": p.product_id,
            "product_title": p.product.title,
            "total_on_hand_units": p.total_on_hand_units,
            "total_reserved_units": p.total_reserved_units,
            "total_value_at_cost": str(p.total_value_at_cost),
        }

    if not stockouts:
        deactivated = _deactivate_stale(
            alert_type="stockout",
            still_valid_keys=set(),
            key_fn=lambda a: (a.entity_id, a.product_id, a.tier),
            entity_ids=entity_scope,
        )
        return 0, deactivated

    existing_keys = set(
        InventoryAlert.objects
        .filter(
            alert_type="stockout",
            is_active=True,
            entity_id__in=entity_scope,
        )
        .values_list("entity_id", "product_id", "tier")
    )

    to_create = []
    for key, v in stockouts.items():
        if key in existing_keys:
            continue
        to_create.append(InventoryAlert(
            entity_id=v["entity_id"],
            tier=v["tier"],
            product_id=v["product_id"],
            alert_type="stockout",
            severity="high",
            title=f"Out of stock: {v['product_title']}",
            message=(
                f"{v['product_title']} has no on-hand units. "
                f"Recent activity suggests it may be in demand."
            ),
            context={
                "total_on_hand_units": v["total_on_hand_units"],
                "total_reserved_units": v["total_reserved_units"],
                "value_at_cost_last_known": v["total_value_at_cost"],
            },
        ))

    if to_create:
        InventoryAlert.objects.bulk_create(to_create, batch_size=500)

    deactivated = _deactivate_stale(
        alert_type="stockout",
        still_valid_keys=set(stockouts.keys()),
        key_fn=lambda a: (a.entity_id, a.product_id, a.tier),
        entity_ids=entity_scope,
    )

    return len(to_create), deactivated


# =====================================================================
# Shared helpers
# =====================================================================

def _detect_by_snapshot_condition(
    snapshot_date,
    entity_scope,
    alert_type,
    severity,
    filter_q,
    title_fn,
    message_fn,
    context_fn,
):
    """
    Generic detector: one alert per receipt matching `filter_q` on this
    date.

    Idempotency: alerts are keyed on (wholesaler_receipt_id,
    retailer_receipt_id). Existing active alerts on the same key are
    left untouched.

    Memory: iterates the snapshot query twice — once for keys (cheap),
    once for creation (streamed). Does not materialise the full list.
    """
    base_qs = (
        InventorySnapshot.objects
        .filter(
            snapshot_date=snapshot_date,
            entity_id__in=entity_scope,
        )
        .filter(filter_q)
    )

    # ---- Pass 1: collect candidate keys ----
    candidate_keys: set = set()
    for wh_id, rt_id in (
        base_qs
        .values_list("wholesaler_receipt_id", "retailer_receipt_id")
        .iterator(chunk_size=2000)
    ):
        candidate_keys.add((wh_id, rt_id))

    # ---- Load existing active alerts, scoped to the snapshot entities ----
    existing_keys = set(
        InventoryAlert.objects
        .filter(
            alert_type=alert_type,
            is_active=True,
            entity_id__in=entity_scope,
        )
        .values_list("wholesaler_receipt_id", "retailer_receipt_id")
    )

    # ---- Pass 2: stream snapshots and build new alerts ----
    to_create = []
    if candidate_keys:
        for s in base_qs.select_related("product", "entity").iterator(chunk_size=500):
            receipt_key = (s.wholesaler_receipt_id, s.retailer_receipt_id)
            if receipt_key in existing_keys:
                continue
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

    if to_create:
        InventoryAlert.objects.bulk_create(to_create, batch_size=500)

    deactivated = _deactivate_stale(
        alert_type=alert_type,
        still_valid_keys=candidate_keys,
        key_fn=lambda a: (a.wholesaler_receipt_id, a.retailer_receipt_id),
        entity_ids=entity_scope,
    )

    return len(to_create), deactivated


def _deactivate_stale(alert_type, still_valid_keys, key_fn, entity_ids):
    """
    Deactivate active alerts of `alert_type` whose key is not in
    `still_valid_keys`.

    Scoped to `entity_ids` — the set of entities that have a snapshot
    for the date being processed. This bounds the scan to the current
    day's data.

    Uses a batched update so the id__in clause never exceeds Postgres'
    parameter limit.

    Returns the count deactivated.
    """
    qs = InventoryAlert.objects.filter(
        alert_type=alert_type,
        is_active=True,
        entity_id__in=entity_ids,
    )

    stale_ids = []
    for a in qs.iterator(chunk_size=500):
        if key_fn(a) not in still_valid_keys:
            stale_ids.append(a.id)

    if not stale_ids:
        return 0

    now = timezone.now()
    BATCH = 500
    for i in range(0, len(stale_ids), BATCH):
        chunk = stale_ids[i:i + BATCH]
        InventoryAlert.objects.filter(id__in=chunk).update(
            is_active=False,
            resolved_at=now,
        )

    return len(stale_ids)