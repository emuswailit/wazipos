# analytics/services/bulk_forecast.py

"""
Bulk forecast aggregation.

Returns, for a given entity + tier, the aggregated forecast over
lead_time_days + order_days for every product that has a forecast.

For retailer-tier queries, enriches each product with:
    - suggested_offers     (wholesaler lots to buy from)
    - suggested_campaigns  (active campaigns to opt into)
"""

import logging
from collections import defaultdict
from datetime import date
from math import ceil, sqrt

from django.db.models import Avg, Count, ExpressionWrapper, F, FloatField, Max, Sum

from analytics.models import DemandForecast
from analytics.services.campaign_advisor import suggest_campaigns_for_product
from analytics.services.offer_advisor import offer_lots_qs, suggest_offers_for_product

# Open wholesale orders: placed but not yet in stock.
CLOSED_ORDER_STATUSES = ("RECEIVED", "COMPLETED", "CANCELLED")

logger = logging.getLogger(__name__)


# =====================================================================
# Public entry point
# =====================================================================

def get_bulk_forecast(
    entity_id,
    tier: str,
    lead_time_days: int,
    order_days: int,
    product_ids: list | None = None,
    min_avg_daily_demand: float | None = None,
    include_daily: bool = True,
    include_offers: bool = True,
    include_campaigns: bool = True,
    run_date: date | None = None,
) -> dict:
    horizon_days = int(lead_time_days) + int(order_days)
    if horizon_days <= 0:
        raise ValueError("lead_time_days + order_days must be positive.")

    base_qs = DemandForecast.objects.filter(entity_id=entity_id, tier=tier)
    if run_date is None:
        run_date = (
            base_qs.order_by("-run_date")
            .values_list("run_date", flat=True)
            .first()
        )
    if run_date is None:
        return {
            "entity_id": str(entity_id),
            "tier": tier,
            "horizon_days": horizon_days,
            "run_date": None,
            "products": [],
        }

    qs = base_qs.filter(run_date=run_date, horizon_days__lte=horizon_days)
    if product_ids:
        qs = qs.filter(product_id__in=product_ids)

    # Daily spread above the median: (p90 − p50). Quantiles don't add up
    # across days; for independent days the spread of the total is
    # sqrt(Σ spread²). Summing p90s (as before) made the range far too wide.
    spread = F("p90") - F("p50")
    agg = (
        qs.values("product_id")
        .annotate(
            total_forecast=Sum("point_forecast"),
            spread_sq=Sum(
                ExpressionWrapper(spread * spread, output_field=FloatField()),
            ),
            days_covered=Count("horizon_days"),
            last_h=Max("horizon_days"),
        )
        .order_by("product_id")
    )

    # Forecasts stop at FORECAST_HORIZON_DAYS. When the order window is
    # longer, extend each product by the average of its last week.
    tails = {}
    longest = qs.aggregate(m=Max("horizon_days"))["m"] or 0
    if horizon_days > longest > 0:
        tails = {
            str(r["product_id"]): (float(r["avg_point"] or 0), float(r["avg_spread_sq"] or 0))
            for r in qs.filter(horizon_days__gt=max(0, longest - 7))
            .values("product_id")
            .annotate(
                avg_point=Avg("point_forecast"),
                avg_spread_sq=Avg(ExpressionWrapper(spread * spread, output_field=FloatField())),
            )
        }

    product_summaries = []
    for row in agg:
        pid = str(row["product_id"])
        total = float(row["total_forecast"] or 0)
        spread_sq = float(row["spread_sq"] or 0)
        covered = int(row["days_covered"] or 0)
        missing = max(0, horizon_days - covered)
        if missing and pid in tails:
            tail_point, tail_sq = tails[pid]
            total += tail_point * missing
            spread_sq += tail_sq * missing
        avg_daily = total / horizon_days if horizon_days else 0.0

        if min_avg_daily_demand is not None and avg_daily < min_avg_daily_demand:
            continue

        band = sqrt(max(spread_sq, 0.0))
        product_summaries.append({
            "product_id": pid,
            "total_forecast": round(total, 4),
            "total_p10": round(max(0.0, total - band), 4),
            "total_p90": round(total + band, 4),
            "avg_daily_forecast": round(avg_daily, 4),
            "days_covered": covered,
            "days_extrapolated": missing if pid in tails else 0,
        })

    # ---- What to order: forecast + safety − on hand − on order ----
    _attach_order_quantities(product_summaries, entity_id, tier)

    # ---- Attach product titles ----
    from products.models import Products

    product_ids_str = [p["product_id"] for p in product_summaries]
    product_titles = {
        str(pid): title
        for pid, title in Products.objects
        .filter(id__in=product_ids_str)
        .values_list("id", "title")
    }

    for p in product_summaries:
        p["product_title"] = product_titles.get(p["product_id"], "")

    # ---- Daily breakdown ----
    # `model_name` and `segment` are set on every product, even when
    # `include_daily` is False or a product has no daily rows, so
    # downstream consumers never hit a KeyError.
    daily_by_product = _load_daily(qs) if include_daily else {}
    for p in product_summaries:
        daily = daily_by_product.get(p["product_id"], [])
        p["daily"] = daily if include_daily else []
        p["model_name"] = daily[0].get("model_name") if daily else None
        p["segment"] = daily[0].get("segment") if daily else None

    # ---- Offers and campaigns (retailer-tier only) ----
    if tier == "RETAILER" and (include_offers or include_campaigns):
        _enrich_with_offers_and_campaigns(
            product_summaries=product_summaries,
            product_ids=product_ids_str,
            entity_id=entity_id,
            include_offers=include_offers,
            include_campaigns=include_campaigns,
        )
    else:
        for p in product_summaries:
            p["suggested_offers"] = []
            p["suggested_campaigns"] = []

    return {
        "entity_id": str(entity_id),
        "tier": tier,
        "run_date": run_date.isoformat(),
        "horizon_days": horizon_days,
        "lead_time_days": int(lead_time_days),
        "order_days": int(order_days),
        "products": product_summaries,
    }


# =====================================================================
# Order quantities
# =====================================================================

def _attach_order_quantities(product_summaries, entity_id, tier):
    """
    For each product:
        on_hand          units in stock now
        on_order         units on open wholesale orders (retailers)
        safety_stock     p90 − forecast  (covers demand 9 times in 10)
        suggested_order_quantity = ceil(forecast + safety − on_hand − on_order), ≥ 0
        days_of_stock    on_hand / average daily demand
    """
    if not product_summaries:
        return
    ids = [p["product_id"] for p in product_summaries]

    on_hand = defaultdict(float)
    on_order = defaultdict(float)
    try:
        if tier == "RETAILER":
            from retailers.models import RetailerReceipts
            from wholesalers.models import RetailerOrderItems

            for r in (
                RetailerReceipts.objects
                .filter(entity_id=entity_id, product_id__in=ids, is_active="true")
                .values("product_id")
                .annotate(units=Sum("current_unit_quantity"))
            ):
                on_hand[str(r["product_id"])] = float(r["units"] or 0)

            for r in (
                RetailerOrderItems.objects
                .filter(
                    retailer_order__retailer_id=entity_id,
                    wholesaler_receipt__product_id__in=ids,
                )
                .exclude(retailer_order__status__in=CLOSED_ORDER_STATUSES)
                .values("wholesaler_receipt__product_id")
                .annotate(units=Sum("total_quantity"))
            ):
                on_order[str(r["wholesaler_receipt__product_id"])] = float(r["units"] or 0)
        else:
            from wholesalers.models import WholesalerReceipts

            for r in (
                WholesalerReceipts.objects
                .filter(entity_id=entity_id, product_id__in=ids)
                .values("product_id")
                .annotate(units=Sum("current_unit_quantity"))
            ):
                on_hand[str(r["product_id"])] = float(r["units"] or 0)
    except Exception:
        # Never fail the forecast over stock lookups; quantities fall back to
        # the plain forecast.
        logger.exception("bulk_forecast: stock lookup failed for entity=%s", entity_id)

    for p in product_summaries:
        pid = p["product_id"]
        stock = on_hand.get(pid, 0.0)
        coming = on_order.get(pid, 0.0)
        safety = max(0.0, p["total_p90"] - p["total_forecast"])
        need = p["total_forecast"] + safety - stock - coming
        avg = p["avg_daily_forecast"]
        p["on_hand"] = round(stock, 2)
        p["on_order"] = round(coming, 2)
        p["safety_stock"] = round(safety, 2)
        p["suggested_order_quantity"] = max(0, ceil(need - 1e-9))
        p["days_of_stock"] = round(stock / avg, 1) if avg > 0 else None
        p["order_status"] = "ORDER" if p["suggested_order_quantity"] > 0 else "COVERED"


# =====================================================================
# Enrichment
# =====================================================================

def _enrich_with_offers_and_campaigns(
    product_summaries,
    product_ids,
    entity_id,
    include_offers,
    include_campaigns,
):
    from authentication.models import Entities
    from products.models import Products

    try:
        retailer_entity = Entities.objects.get(id=entity_id)
    except Entities.DoesNotExist:
        logger.warning(
            "bulk_forecast: retailer entity %s not found; skipping offers",
            entity_id,
        )
        for p in product_summaries:
            p["suggested_offers"] = []
            p["suggested_campaigns"] = []
        return

    product_objs = {
        str(p.id): p
        for p in Products.objects.filter(id__in=product_ids)
    }

    # All offerable wholesale lots for these products in one query
    # (was one query per product).
    lots_by_product = defaultdict(list)
    if include_offers:
        for lot in offer_lots_qs().filter(product_id__in=product_ids):
            lots_by_product[str(lot.product_id)].append(lot)

    for p in product_summaries:
        product_obj = product_objs.get(p["product_id"])
        if not product_obj:
            p["suggested_offers"] = []
            p["suggested_campaigns"] = []
            continue

        # Size offers by what we'd actually buy, not total demand.
        buy = p.get("suggested_order_quantity") or p["total_forecast"]

        if include_offers:
            try:
                p["suggested_offers"] = suggest_offers_for_product(
                    product=product_obj,
                    retailer_entity=retailer_entity,
                    forecast_total=buy,
                    receipts=lots_by_product.get(p["product_id"], []),
                )
            except Exception:
                # Log the traceback so operators can spot failures.
                # The response shape stays valid (empty list) so a
                # single product failure doesn't break the whole call.
                logger.exception(
                    "bulk_forecast: suggest_offers_for_product failed "
                    "for product=%s entity=%s",
                    p["product_id"], entity_id,
                )
                p["suggested_offers"] = []
        else:
            p["suggested_offers"] = []

        if include_campaigns:
            try:
                p["suggested_campaigns"] = suggest_campaigns_for_product(
                    product=product_obj,
                    retailer_entity=retailer_entity,
                    forecast_total=buy,
                )
            except Exception:
                logger.exception(
                    "bulk_forecast: suggest_campaigns_for_product failed "
                    "for product=%s entity=%s",
                    p["product_id"], entity_id,
                )
                p["suggested_campaigns"] = []
        else:
            p["suggested_campaigns"] = []


# =====================================================================
# Daily loader
# =====================================================================

def _load_daily(qs):
    """
    Pull per-day forecast rows for the products already selected by
    `qs`. The caller has already filtered by entity, tier, run_date,
    and horizon_days — no additional filtering is needed here.
    """
    daily_rows = (
        qs.values(
            "product_id", "forecast_date", "horizon_days",
            "point_forecast", "p10", "p50", "p90",
            "model_name", "segment",
        )
        .order_by("product_id", "horizon_days")
    )

    result: dict = {}
    for r in daily_rows:
        pid = str(r["product_id"])
        result.setdefault(pid, []).append({
            "forecast_date": r["forecast_date"].isoformat(),
            "horizon_days": r["horizon_days"],
            "point_forecast": r["point_forecast"],
            "p10": r["p10"],
            "p50": r["p50"],
            "p90": r["p90"],
            "model_name": r["model_name"],
            "segment": r["segment"],
        })
    return result