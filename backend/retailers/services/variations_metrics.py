# retailers/services/variations_metrics.py
#
# Recompute performance metadata on RetailerVariations from the
# transient side of the model graph.
#
# Demand signal priority (each level falls through to the next):
#   1. DemandForecast          — forward-looking, per (entity, product, tier)
#   2. ProductDemandProfile    — backward-looking statistics
#   3. Raw CustomerOrderItems  — last-resort 90-day window
#
# Lead time is sampled from RetailerReceipts × RetailerOrders.
# Thresholds (safety stock, reorder level, EOQ, max, danger) are
# derived from the selected demand signal plus sampled lead time.
#
# Idempotent. Batched. Atomic per batch. Cache-locked.

from __future__ import annotations

import logging
import statistics
import time
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, Iterable, List, Optional, Tuple

from django.core.cache import cache
from django.db import transaction
from django.db.models import (
    Count,
    DecimalField,
    Max,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from analytics.models import DemandForecast, ProductDemandProfile
from retailers.models import (
    CustomerOrderItems,
    RetailerReceipts,
    RetailerVariations,
)

logger = logging.getLogger(__name__)


# =====================================================================
# Typed zero constants
#
# `Value(0)` is an IntegerField. When it's coalesced against a Sum
# over a DecimalField, Django refuses to compile the query with
# "Expression contains mixed types". These constants give each
# fallback the correct output type up-front.
# =====================================================================

ZERO_DEC = Value(
    Decimal("0.00"),
    output_field=DecimalField(max_digits=18, decimal_places=2),
)
ZERO_INT = Value(0)


# =====================================================================
# Configuration
# =====================================================================

@dataclass
class MetricsConfig:
    # ---- Demand signal ----
    forecast_horizon_days: int = 30
    lookback_days: int = 90
    min_forecast_days: int = 7

    # ---- Lead time sampling ----
    lead_time_lookback: int = 20
    default_lead_time: int = 7
    min_lead_time: int = 1
    max_lead_time: int = 60

    # ---- Safety stock ----
    service_level_z: Decimal = Decimal("1.65")   # 95% service level
    min_safety_days: int = 2

    # ---- Reorder level ----
    min_reorder_units: int = 5

    # ---- EOQ ----
    ordering_cost: Decimal = Decimal("500.00")
    holding_rate: Decimal = Decimal("0.20")
    eoq_fallback_days: int = 30

    # ---- Danger stock ----
    danger_factor: Decimal = Decimal("0.50")

    # ---- Batch ----
    batch_size: int = 1000

    # ---- Time budget ----
    time_budget_seconds: int = 60 * 25


Key = Tuple[str, str]  # (entity_id, product_id)


# =====================================================================
# Pure calculators
# =====================================================================

def _median_lead_time(
    samples: List[int], config: MetricsConfig,
) -> int:
    if len(samples) >= 3:
        raw = int(round(statistics.median(samples)))
        return max(
            config.min_lead_time, min(config.max_lead_time, raw),
        )
    return config.default_lead_time


def _safety_stock(
    sigma_daily: float,
    lead_time: int,
    avg_daily: float,
    config: MetricsConfig,
) -> int:
    z = float(config.service_level_z)
    sigma_over_lead = sigma_daily * (max(lead_time, 1) ** 0.5)
    statistical = z * sigma_over_lead
    floor = avg_daily * config.min_safety_days
    return max(0, int(round(max(statistical, floor))))


def _reorder_level(
    safety_stock: int,
    avg_daily: float,
    lead_time: int,
    config: MetricsConfig,
) -> int:
    raw = safety_stock + avg_daily * lead_time
    return max(config.min_reorder_units, int(raw))


def _eoq(
    avg_daily: float,
    unit_cost: Decimal,
    config: MetricsConfig,
) -> int:
    annual_demand = avg_daily * 365
    if annual_demand <= 0:
        return 0
    if unit_cost > 0:
        holding_cost = float(unit_cost * config.holding_rate)
        if holding_cost > 0:
            raw = (
                2 * annual_demand * float(config.ordering_cost)
                / holding_cost
            ) ** 0.5
            return max(1, int(round(raw)))
    return max(1, int(avg_daily * config.eoq_fallback_days))


def _danger_stock(
    safety_stock: int, config: MetricsConfig,
) -> int:
    return max(1, int(round(safety_stock * float(config.danger_factor))))


# =====================================================================
# Bulk loaders — one query per metric, batched across keys
# =====================================================================

def _keys(variations: Iterable[RetailerVariations]) -> List[Key]:
    return [(str(v.entity_id), str(v.product_id)) for v in variations]


def _load_current_stock(keys: List[Key]) -> Dict[Key, int]:
    """current_unit_quantity is an IntegerField — ZERO_INT is fine."""
    entity_ids = {k[0] for k in keys}
    product_ids = {k[1] for k in keys}
    rows = (
        RetailerReceipts.objects
        .filter(
            entity_id__in=entity_ids,
            product_id__in=product_ids,
            is_active="true",
        )
        .values("entity_id", "product_id")
        .annotate(units=Coalesce(Sum("current_unit_quantity"), ZERO_INT))
    )
    return {
        (str(r["entity_id"]), str(r["product_id"])): int(r["units"] or 0)
        for r in rows
    }


def _load_all_time_receipts(keys: List[Key]) -> Dict[Key, int]:
    """received_unit_quantity is an IntegerField — ZERO_INT is fine."""
    entity_ids = {k[0] for k in keys}
    product_ids = {k[1] for k in keys}
    rows = (
        RetailerReceipts.objects
        .filter(entity_id__in=entity_ids, product_id__in=product_ids)
        .values("entity_id", "product_id")
        .annotate(
            total=Coalesce(Sum("received_unit_quantity"), ZERO_INT),
        )
    )
    return {
        (str(r["entity_id"]), str(r["product_id"])): int(r["total"] or 0)
        for r in rows
    }


def _load_all_time_issues(keys: List[Key]) -> Dict[Key, int]:
    """total_quantity is a DecimalField — must use ZERO_DEC."""
    entity_ids = {k[0] for k in keys}
    product_ids = {k[1] for k in keys}
    rows = (
        CustomerOrderItems.objects
        .filter(
            customer_order__entity_id__in=entity_ids,
            retailer_receipt__product_id__in=product_ids,
        )
        .exclude(customer_order__status="CANCELLED")
        .values(
            "customer_order__entity_id",
            "retailer_receipt__product_id",
        )
        .annotate(total=Coalesce(Sum("total_quantity"), ZERO_DEC))
    )
    return {
        (
            str(r["customer_order__entity_id"]),
            str(r["retailer_receipt__product_id"]),
        ): int(r["total"] or 0)
        for r in rows
    }


def _load_lead_samples(
    keys: List[Key], config: MetricsConfig,
) -> Dict[Key, List[int]]:
    entity_ids = {k[0] for k in keys}
    product_ids = {k[1] for k in keys}
    rows = (
        RetailerReceipts.objects
        .filter(
            entity_id__in=entity_ids,
            product_id__in=product_ids,
            retailer_order_id__isnull=False,
        )
        .select_related("retailer_order")
        .order_by("entity_id", "product_id", "-created")
    )

    out: Dict[Key, List[int]] = {}
    for r in rows:
        key = (str(r.entity_id), str(r.product_id))
        samples = out.setdefault(key, [])
        if len(samples) >= config.lead_time_lookback:
            continue
        order = r.retailer_order
        if not order or not order.created:
            continue
        delta = (r.created.date() - order.created.date()).days
        if config.min_lead_time <= delta <= config.max_lead_time:
            samples.append(delta)
    return out


def _load_unit_cost(keys: List[Key]) -> Dict[Key, Decimal]:
    entity_ids = {k[0] for k in keys}
    product_ids = {k[1] for k in keys}
    rows = (
        RetailerReceipts.objects
        .filter(
            entity_id__in=entity_ids,
            product_id__in=product_ids,
            unit_buying_price__gt=0,
        )
        .order_by("entity_id", "product_id", "-created")
        .values("entity_id", "product_id", "unit_buying_price")
    )
    out: Dict[Key, Decimal] = {}
    for r in rows:
        key = (str(r["entity_id"]), str(r["product_id"]))
        if key not in out:
            out[key] = Decimal(str(r["unit_buying_price"]))
    return out


# =====================================================================
# Demand signal loaders
# =====================================================================

def _load_forecast_stats(
    keys: List[Key],
    as_of: date,
    config: MetricsConfig,
) -> Dict[Key, dict]:
    """
    Primary source. Averages the point forecast over the next
    `forecast_horizon_days` and derives sigma from the (p90 − p50)
    spread. Uses the most recent run_date at or before `as_of`.
    """
    entity_ids = {k[0] for k in keys}
    product_ids = {k[1] for k in keys}
    horizon_end = as_of + timedelta(days=config.forecast_horizon_days)

    latest_run = (
        DemandForecast.objects
        .filter(
            entity_id__in=entity_ids,
            product_id__in=product_ids,
            tier="RETAILER",
            run_date__lte=as_of,
            forecast_date__gt=as_of,
        )
        .aggregate(latest=Max("run_date"))
    )["latest"]

    if latest_run is None:
        return {}

    rows = (
        DemandForecast.objects
        .filter(
            entity_id__in=entity_ids,
            product_id__in=product_ids,
            tier="RETAILER",
            run_date=latest_run,
            forecast_date__gt=as_of,
            forecast_date__lte=horizon_end,
        )
        .values(
            "entity_id", "product_id",
            "point_forecast", "p50", "p90",
            "model_name",
        )
    )

    bucket: Dict[Key, dict] = {}
    for r in rows:
        key = (str(r["entity_id"]), str(r["product_id"]))
        b = bucket.setdefault(key, {
            "points": [],
            "sigmas": [],
            "model_name": r["model_name"] or "",
        })
        b["points"].append(float(r["point_forecast"] or 0))

        p50 = float(r["p50"] or 0)
        p90 = float(r["p90"] or 0)
        if p90 > p50:
            # z for p90 of a normal is ~1.28
            b["sigmas"].append((p90 - p50) / 1.28)

    out: Dict[Key, dict] = {}
    for key, b in bucket.items():
        if len(b["points"]) < config.min_forecast_days:
            continue
        avg = sum(b["points"]) / len(b["points"])
        sigma = (
            sum(b["sigmas"]) / len(b["sigmas"])
            if b["sigmas"] else avg * 0.3
        )
        out[key] = {
            "avg_daily": avg,
            "sigma_daily": sigma,
            "source": "forecast",
            "model_name": b["model_name"],
            "days_used": len(b["points"]),
        }
    return out


def _load_profile_stats(
    keys: List[Key], as_of: date,
) -> Dict[Key, dict]:
    """Secondary source. Latest ProductDemandProfile at or before as_of."""
    entity_ids = {k[0] for k in keys}
    product_ids = {k[1] for k in keys}

    rows = (
        ProductDemandProfile.objects
        .filter(
            entity_id__in=entity_ids,
            product_id__in=product_ids,
            tier="RETAILER",
            as_of_date__lte=as_of,
        )
        .order_by("entity_id", "product_id", "-as_of_date")
        .values(
            "entity_id", "product_id",
            "avg_daily_demand", "demand_std",
        )
    )

    out: Dict[Key, dict] = {}
    for r in rows:
        key = (str(r["entity_id"]), str(r["product_id"]))
        if key in out:
            continue
        avg = float(r["avg_daily_demand"] or 0)
        sigma = float(r["demand_std"] or 0)
        out[key] = {
            "avg_daily": avg,
            "sigma_daily": sigma,
            "source": "profile",
            "model_name": "",
            "days_used": 0,
        }
    return out


def _load_raw_order_stats(
    keys: List[Key],
    as_of: date,
    config: MetricsConfig,
) -> Dict[Key, dict]:
    """Tertiary source. Naive 90-day window from CustomerOrderItems."""
    entity_ids = {k[0] for k in keys}
    product_ids = {k[1] for k in keys}
    cutoff = as_of - timedelta(days=config.lookback_days)

    daily_rows = (
        CustomerOrderItems.objects
        .filter(
            customer_order__entity_id__in=entity_ids,
            retailer_receipt__product_id__in=product_ids,
            customer_order__created__date__gte=cutoff,
            customer_order__created__date__lte=as_of,
        )
        .exclude(customer_order__status="CANCELLED")
        .values(
            "customer_order__entity_id",
            "retailer_receipt__product_id",
            "customer_order__created__date",
        )
        .annotate(units=Coalesce(Sum("total_quantity"), ZERO_DEC))
    )

    bucket: Dict[Key, Dict[date, float]] = {}
    for r in daily_rows:
        key = (
            str(r["customer_order__entity_id"]),
            str(r["retailer_receipt__product_id"]),
        )
        bucket.setdefault(key, {})[
            r["customer_order__created__date"]
        ] = float(r["units"] or 0)

    out: Dict[Key, dict] = {}
    n_days = config.lookback_days
    for key, daily_map in bucket.items():
        series = [
            daily_map.get(cutoff + timedelta(days=i + 1), 0.0)
            for i in range(n_days)
        ]
        total = sum(series)
        if total <= 0:
            continue
        avg = total / n_days
        sigma = statistics.pstdev(series) if len(series) > 1 else 0.0
        out[key] = {
            "avg_daily": avg,
            "sigma_daily": sigma,
            "source": "raw",
            "model_name": "",
            "days_used": n_days,
        }
    return out


# =====================================================================
# Per-variation assembler
# =====================================================================

def _assemble_metrics(
    variation: RetailerVariations,
    maps: dict,
    as_of: date,
    config: MetricsConfig,
) -> dict:
    key: Key = (str(variation.entity_id), str(variation.product_id))

    current_stock = maps["stock"].get(key, 0)
    running_receipts = maps["all_receipts"].get(key, 0)
    running_issues = maps["all_issues"].get(key, 0)
    lead_samples = maps["lead"].get(key, [])
    unit_cost = maps["cost"].get(key, Decimal("0.00"))

    demand = (
        maps["forecast"].get(key)
        or maps["profile"].get(key)
        or maps["raw"].get(key)
    )

    if demand:
        avg_daily = float(demand["avg_daily"])
        sigma_daily = float(demand["sigma_daily"])
        demand_source = demand["source"]
    else:
        avg_daily = 0.0
        sigma_daily = 0.0
        demand_source = "none"

    lead_time = _median_lead_time(lead_samples, config)

    if avg_daily > 0:
        safety = _safety_stock(sigma_daily, lead_time, avg_daily, config)
        reorder = _reorder_level(safety, avg_daily, lead_time, config)
        eoq = _eoq(avg_daily, unit_cost, config)
        maximum = reorder + eoq
        danger = _danger_stock(safety, config)
    else:
        safety = 0
        reorder = 0
        eoq = 0
        maximum = 0
        danger = 0

    return {
        "current_stock_balance": current_stock,
        "running_total_receipts": running_receipts,
        "running_total_issues": running_issues,
        "safety_stock": safety,
        "reorder_level": reorder,
        "economic_order_quantity": eoq,
        "maximum_stock": maximum,
        "danger_stock": danger,
        "lead_time": lead_time,
        # diagnostics, not persisted
        "_avg_daily": round(avg_daily, 4),
        "_sigma_daily": round(sigma_daily, 4),
        "_demand_source": demand_source,
        "_lead_samples": len(lead_samples),
    }


# =====================================================================
# Orchestrator
# =====================================================================

OWNED_FIELDS = [
    "current_stock_balance",
    "running_total_receipts",
    "running_total_issues",
    "safety_stock",
    "reorder_level",
    "economic_order_quantity",
    "maximum_stock",
    "danger_stock",
    "lead_time",
    "updated",
]

LOCK_KEY = "retailers:update_variation_metrics:lock"
LOCK_TTL = 60 * 30


def run_variation_metrics_update(
    config: Optional[MetricsConfig] = None,
    *,
    entity_id: Optional[str] = None,
    dry_run: bool = False,
    verbose: bool = False,
) -> dict:
    """
    Recompute metrics on every RetailerVariations row (or a single
    entity's). Safe to rerun. Serialised via cache lock.

    Returns a summary dict with source attribution counts.
    """
    config = config or MetricsConfig()
    started = timezone.now()
    as_of = timezone.now().date()

    if not cache.add(LOCK_KEY, "1", LOCK_TTL):
        logger.info("variation metrics: another run is in progress")
        return {
            "total_variations": 0,
            "processed": 0,
            "updated": 0,
            "failed": 0,
            "errors": [],
            "duration_seconds": 0.0,
            "skipped": "locked",
            "sources": {},
        }

    try:
        qs = RetailerVariations.objects.all()
        if entity_id:
            qs = qs.filter(entity_id=entity_id)

        total_variations = qs.count()
        processed = 0
        updated = 0
        failed = 0
        errors: List[Tuple[str, str]] = []
        source_counts = {
            "forecast": 0, "profile": 0, "raw": 0, "none": 0,
        }

        offset = 0
        while True:
            elapsed = (timezone.now() - started).total_seconds()
            if elapsed > config.time_budget_seconds:
                logger.warning(
                    "variation metrics: time budget reached after %d rows",
                    offset,
                )
                break

            batch = list(
                qs.order_by("id")[offset:offset + config.batch_size]
            )
            if not batch:
                break

            keys = _keys(batch)
            maps = {
                "stock": _load_current_stock(keys),
                "all_receipts": _load_all_time_receipts(keys),
                "all_issues": _load_all_time_issues(keys),
                "lead": _load_lead_samples(keys, config),
                "cost": _load_unit_cost(keys),
                "forecast": _load_forecast_stats(keys, as_of, config),
                "profile": _load_profile_stats(keys, as_of),
                "raw": _load_raw_order_stats(keys, as_of, config),
            }

            to_save: List[RetailerVariations] = []

            for v in batch:
                try:
                    metrics = _assemble_metrics(v, maps, as_of, config)
                    source_counts[metrics["_demand_source"]] = (
                        source_counts.get(metrics["_demand_source"], 0) + 1
                    )

                    changed = any(
                        getattr(v, f) != metrics[f]
                        for f in OWNED_FIELDS
                        if f != "updated"
                    )

                    if verbose and metrics["_avg_daily"] > 0:
                        logger.info(
                            "variation=%s product=%s src=%s "
                            "avg=%.3f sigma=%.3f lead=%dd "
                            "ss=%d rl=%d eoq=%d max=%d danger=%d",
                            v.id,
                            v.product_id,
                            metrics["_demand_source"],
                            metrics["_avg_daily"],
                            metrics["_sigma_daily"],
                            metrics["lead_time"],
                            metrics["safety_stock"],
                            metrics["reorder_level"],
                            metrics["economic_order_quantity"],
                            metrics["maximum_stock"],
                            metrics["danger_stock"],
                        )

                    for f in OWNED_FIELDS:
                        if f == "updated":
                            continue
                        setattr(v, f, metrics[f])

                    to_save.append(v)
                    if changed:
                        updated += 1
                except Exception as exc:
                    failed += 1
                    errors.append((str(v.id), str(exc)))
                    logger.exception(
                        "Failed to compute metrics for variation %s",
                        v.id,
                    )

                processed += 1

            if not dry_run and to_save:
                with transaction.atomic():
                    RetailerVariations.objects.bulk_update(
                        to_save,
                        OWNED_FIELDS,
                        batch_size=config.batch_size,
                    )

            offset += config.batch_size

        duration = (timezone.now() - started).total_seconds()

        return {
            "total_variations": total_variations,
            "processed": processed,
            "updated": updated,
            "failed": failed,
            "errors": errors[:50],
            "duration_seconds": round(duration, 2),
            "dry_run": dry_run,
            "entity_id": entity_id,
            "sources": source_counts,
        }

    finally:
        cache.delete(LOCK_KEY)