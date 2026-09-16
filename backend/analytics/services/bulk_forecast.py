# analytics/services/bulk_forecast.py

"""
Bulk forecast aggregation.

Returns, for a given entity + tier, the aggregated forecast over
`lead_time_days + order_days` for every product that has a forecast.

Aggregates the daily DemandForecast rows into:
    - total forecast over the horizon
    - p10 / p90 bounds over the horizon
    - average daily forecast
    - daily breakdown (optional)

This is the input for reorder decisions. Not a separate forecast model
— a projection of the same underlying per-product, per-day forecasts.
"""

from datetime import date
from decimal import Decimal

from django.db.models import Sum, Max

from analytics.models import DemandForecast


def get_bulk_forecast(
    entity_id,
    tier: str,
    lead_time_days: int,
    order_days: int,
    product_ids: list | None = None,
    min_avg_daily_demand: float | None = None,
    include_daily: bool = True,
    run_date: date | None = None,
) -> dict:
    """
    Return aggregated forecasts for every product at (entity, tier)
    over the horizon of lead_time_days + order_days.

    If run_date is None, the latest run_date for the entity is used.
    """
    horizon_days = int(lead_time_days) + int(order_days)
    if horizon_days <= 0:
        raise ValueError("lead_time_days + order_days must be positive.")

    # Resolve the latest run_date if not provided
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

    # Filter to the horizon window
    qs = base_qs.filter(
        run_date=run_date,
        horizon_days__lte=horizon_days,
    )

    if product_ids:
        qs = qs.filter(product_id__in=product_ids)

    # Aggregate per product
    agg = (
        qs.values("product_id")
        .annotate(
            total_forecast=Sum("point_forecast"),
            total_p10=Sum("p10"),
            total_p90=Sum("p90"),
            days_covered=Max("horizon_days"),
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

    # Attach product metadata and optional daily breakdown
    from products.models import Products

    product_titles = dict(
        Products.objects
        .filter(id__in=[p["product_id"] for p in product_summaries])
        .values_list("id", "title")
    )

    if include_daily:
        daily_by_product = _load_daily(qs, [p["product_id"] for p in product_summaries])
    else:
        daily_by_product = {}

    for p in product_summaries:
        p["product_title"] = product_titles.get(p["product_id"], "")
        if include_daily:
            p["daily"] = daily_by_product.get(p["product_id"], [])

    # Also attach model/segment from any daily row
    if include_daily:
        for p in product_summaries:
            dailies = p["daily"]
            if dailies:
                p["model_name"] = dailies[0].get("model_name")
                p["segment"] = dailies[0].get("segment")

    return {
        "entity_id": str(entity_id),
        "tier": tier,
        "run_date": run_date.isoformat(),
        "horizon_days": horizon_days,
        "lead_time_days": int(lead_time_days),
        "order_days": int(order_days),
        "products": product_summaries,
    }


def _load_daily(qs, product_ids):
    """
    Return a dict {product_id: [daily rows]} for the given queryset.
    """
    if not product_ids:
        return {}

    daily_rows = (
        qs.filter(product_id__in=product_ids)
        .values(
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