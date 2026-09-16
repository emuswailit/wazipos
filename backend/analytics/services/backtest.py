# analytics/services/backtest.py

"""
Forecast backtest.

Compares aged DemandForecast rows against actual DemandFact demand,
computes WAPE / MAPE / bias / MAE, and writes ForecastAccuracy rows.

Idempotent per (period_end). Rerunning replaces that day's accuracy
rows for the affected products.

Usage:
    from analytics.services.backtest import backtest_forecasts
    backtest_forecasts(period_end=date.today() - timedelta(days=7))
"""

from datetime import date, timedelta
from collections import defaultdict

from django.db import transaction

from analytics.models import (
    DemandFact,
    DemandForecast,
    ForecastAccuracy,
)


# How far back to look for forecasts to score
BACKTEST_WINDOW_DAYS = 30


def backtest_forecasts(period_end: date | None = None) -> dict:
    """
    Score all forecasts whose forecast_date fell in the last
    BACKTEST_WINDOW_DAYS and whose actual demand is now known.

    One ForecastAccuracy row per (entity, product, tier, model_name,
    period). We use period_start = first forecast date scored,
    period_end = last.
    """
    period_end = period_end or date.today()
    period_start = period_end - timedelta(days=BACKTEST_WINDOW_DAYS)

    # Forecasts to score: forecast_date in [period_start, period_end]
    forecasts = (
        DemandForecast.objects
        .filter(forecast_date__gte=period_start, forecast_date__lte=period_end)
        .values(
            "entity_id", "product_id", "tier",
            "forecast_date", "model_name", "segment",
            "point_forecast",
        )
    )

    from django.db.models import Sum

    actuals = (
        DemandFact.objects
        .filter(fact_date__gte=period_start, fact_date__lte=period_end)
        .values("entity_id", "product_id", "tier", "fact_date")
        .annotate(actual=Sum("quantity"))
    )

    # Group forecasts by the accuracy key
    buckets = defaultdict(list)
    for f in forecasts:
        key = (
            f["entity_id"], f["product_id"], f["tier"],
            f["model_name"], f["segment"],
        )
        actual = actual_map.get((
            f["entity_id"], f["product_id"], f["tier"], f["forecast_date"],
        ))
        if actual is None:
            continue  # no actual recorded for that day
        buckets[key].append((
            float(f["point_forecast"] or 0),
            actual,
        ))

    # Build accuracy rows
    rows = []
    for (entity_id, product_id, tier, model_name, segment), pairs in buckets.items():
        if not pairs:
            continue

        errors = [f - a for f, a in pairs]
        abs_errors = [abs(e) for e in errors]
        actuals_list = [a for _, a in pairs]
        forecast_list = [f for f, _ in pairs]

        n = len(pairs)
        actual_total = sum(actuals_list)
        forecast_total = sum(forecast_list)
        abs_error_total = sum(abs_errors)

        wape = (abs_error_total / actual_total) if actual_total > 0 else None
        mae = abs_error_total / n
        bias = sum(errors) / n

        # MAPE: mean of per-observation absolute percentage errors,
        # only where actual > 0
        ape = [
            abs(e) / a
            for e, a in zip(errors, actuals_list)
            if a > 0
        ]
        mape = (sum(ape) / len(ape)) if ape else None

        rows.append(ForecastAccuracy(
            entity_id=entity_id,
            product_id=product_id,
            tier=tier,
            model_name=model_name,
            segment=segment,
            period_start=period_start,
            period_end=period_end,
            wape=wape if wape is not None else 1.0,
            mape=mape,
            bias=bias,
            mae=mae,
            n_observations=n,
            actual_total=actual_total,
            forecast_total=forecast_total,
        ))

    with transaction.atomic():
        ForecastAccuracy.objects.filter(period_end=period_end).delete()
        if rows:
            ForecastAccuracy.objects.bulk_create(rows, batch_size=500)

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "accuracies_created": len(rows),
    }