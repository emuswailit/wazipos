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
from datetime import date

from django.db.models import Count, Sum

from analytics.models import DemandForecast
from analytics.services.campaign_advisor import suggest_campaigns_for_product
from analytics.services.offer_advisor import suggest_offers_for_product

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

    agg = (
        qs.values("product_id")
        .annotate(
            total_forecast=Sum("point_forecast"),
            total_p10=Sum("p10"),
            total_p90=Sum("p90"),
            days_covered=Count("horizon_days"),
        )
        .order_by("product_id")
    )

    product_summaries = []
    for row in agg:
        days = row["days_covered"] or horizon_days
        total = float(row["total_forecast"] or 0)
        avg_daily = (total / days) if days else 0.0

        if min_avg_daily_demand is not None and avg_daily < min_avg_daily_demand:
            continue

        product_summaries.append({
            "product_id": str(row["product_id"]),
            "total_forecast": round(total, 4),
            "total_p10": round(float(row["total_p10"] or 0), 4),
            "total_p90": round(float(row["total_p90"] or 0), 4),
            "avg_daily_forecast": round(avg_daily, 4),
            "days_covered": days,
        })

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

    for p in product_summaries:
        product_obj = product_objs.get(p["product_id"])
        if not product_obj:
            p["suggested_offers"] = []
            p["suggested_campaigns"] = []
            continue

        if include_offers:
            try:
                p["suggested_offers"] = suggest_offers_for_product(
                    product=product_obj,
                    retailer_entity=retailer_entity,
                    forecast_total=p["total_forecast"],
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
                    forecast_total=p["total_forecast"],
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