# analytics/services/forecast.py

"""
Demand forecast engine.

Reads DemandFact history, produces DemandForecast rows.

Model routing by demand pattern:
    stable         → SES   (simple exponential smoothing)
    trending_up    → Holt  (double exponential, additive trend)
    trending_down  → Holt
    seasonal       → Holt-Winters (additive)
    intermittent   → Croston
    erratic        → WMA   (weighted moving average)
    new            → Mean  (product average fallback)

Everything is plain Python + numpy. Swap in ML models later by
adding cases to MODEL_ROUTER.

Idempotent per (run_date). Deleting + rebuilding on rerun.
"""

from collections import defaultdict
from datetime import date, timedelta
from math import sqrt

import numpy as np
from django.db import transaction
from django.db.models import Sum

from analytics.models import (
    DemandFact,
    DemandForecast,
    ProductDemandProfile,
)


# How many days ahead to forecast
FORECAST_HORIZON_DAYS = 28

# Minimum history required to run a real model
MIN_HISTORY_DAYS = 14

# How far back to look for history
HISTORY_WINDOW_DAYS = 180


def build_forecasts(
    run_date: date | None = None,
    horizon_days: int = FORECAST_HORIZON_DAYS,
) -> dict:
    """
    Build DemandForecast rows for every (entity, product, tier) that
    has a ProductDemandProfile on or before run_date.

    Returns a summary dict.
    """
    run_date = run_date or date.today()

    # One profile per (entity, product, tier) — latest available
    profiles = (
        ProductDemandProfile.objects
        .filter(as_of_date__lte=run_date)
        .order_by("entity_id", "product_id", "tier", "-as_of_date")
        .distinct("entity_id", "product_id", "tier")
    )

    all_forecasts = []
    for profile in profiles.iterator(chunk_size=200):
        forecasts = _forecast_for_profile(profile, run_date, horizon_days)
        all_forecasts.extend(forecasts)

    with transaction.atomic():
        # Delete only this run's forecasts (don't touch prior run_dates)
        DemandForecast.objects.filter(run_date=run_date).delete()
        if all_forecasts:
            DemandForecast.objects.bulk_create(all_forecasts, batch_size=1000)

    return {
        "run_date": run_date.isoformat(),
        "horizon_days": horizon_days,
        "forecasts_created": len(all_forecasts),
    }


# =====================================================================
# Per-product forecast
# =====================================================================

def _forecast_for_profile(profile, run_date, horizon_days):
    """
    Produce DemandForecast rows for one product profile.
    """
    history = _get_history(
        entity_id=profile.entity_id,
        product_id=profile.product_id,
        tier=profile.tier,
        run_date=run_date,
    )

    series = _to_series(history, run_date)

    model_name, predict_fn = _select_model(profile.demand_pattern, series)

    forecasts = []
    for h in range(1, horizon_days + 1):
        forecast_date = run_date + timedelta(days=h)
        point, p10, p90 = predict_fn(h)
        point = max(0.0, point)   # demand can't be negative
        p10 = max(0.0, p10)
        p90 = max(0.0, p90)

        forecasts.append(DemandForecast(
            entity_id=profile.entity_id,
            product_id=profile.product_id,
            tier=profile.tier,
            run_date=run_date,
            forecast_date=forecast_date,
            horizon_days=h,
            point_forecast=point,
            p10=p10,
            p50=point,
            p90=p90,
            model_name=model_name,
            segment=profile.demand_pattern or "unknown",
        ))
    return forecasts


def _get_history(entity_id, product_id, tier, run_date):
    """Daily net demand for the history window."""
    since = run_date - timedelta(days=HISTORY_WINDOW_DAYS)
    rows = (
        DemandFact.objects
        .filter(
            entity_id=entity_id,
            product_id=product_id,
            tier=tier,
            fact_date__gte=since,
            fact_date__lte=run_date,
        )
        .values("fact_date")
        .annotate(total=Sum("quantity"))
        .order_by("fact_date")
    )
    return [(r["fact_date"], float(r["total"] or 0)) for r in rows]


def _to_series(history, run_date):
    """Fill missing dates with 0 and return a dense numpy array."""
    if not history:
        return np.array([], dtype=float)

    by_date = dict(history)
    start = history[0][0]
    n_days = (run_date - start).days + 1
    series = np.zeros(n_days, dtype=float)
    for d, v in history:
        idx = (d - start).days
        if 0 <= idx < n_days:
            series[idx] = v
    return series


# =====================================================================
# Model router
# =====================================================================

def _select_model(pattern, series):
    """
    Return (model_name, predict_fn).
    predict_fn(h) -> (point, p10, p90)
    """
    if len(series) < MIN_HISTORY_DAYS:
        return "mean_fallback", _mean_fallback(series)

    if pattern == "intermittent":
        return "croston", _croston(series)

    if pattern == "seasonal":
        return "holt_winters", _holt_winters(series, season_length=7)

    if pattern in ("trending_up", "trending_down"):
        return "holt", _holt(series)

    if pattern == "erratic":
        return "wma", _wma(series, window=14)

    # Default: stable / new / unknown
    return "ses", _ses(series)


# =====================================================================
# Models — each returns (model_name, predict_fn)
# =====================================================================

def _mean_fallback(series):
    """
    Not enough history. Fall back to mean, with a wide interval.
    """
    if len(series) == 0:
        mean = 0.0
        std = 0.0
    else:
        mean = float(np.mean(series))
        std = float(np.std(series)) if len(series) > 1 else mean * 0.5

    def predict(h):
        point = mean
        # Widen the interval with horizon
        width = std * sqrt(max(h, 1))
        return point, max(0.0, point - 1.28 * width), point + 1.28 * width

    return predict


def _ses(series, alpha=0.3):
    """Simple exponential smoothing."""
    level = float(series[0])
    for x in series[1:]:
        level = alpha * float(x) + (1 - alpha) * level

    # Residual std from in-sample error
    residuals = []
    level_ = float(series[0])
    for x in series[1:]:
        residuals.append(float(x) - level_)
        level_ = alpha * float(x) + (1 - alpha) * level_
    sigma = float(np.std(residuals)) if residuals else 0.0

    def predict(h):
        point = level
        # SES has constant uncertainty up to horizon scaling
        width = sigma * sqrt(1 + 0.1 * h)
        return point, max(0.0, point - 1.28 * width), point + 1.28 * width

    return predict


def _holt(series, alpha=0.3, beta=0.1):
    """Holt's linear — level + trend."""
    if len(series) < 2:
        return _ses(series)

    level = float(series[0])
    trend = float(series[1]) - float(series[0])

    for x in series[1:]:
        x = float(x)
        prev_level = level
        level = alpha * x + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend

    # Residual std
    residuals = []
    lvl, tr = float(series[0]), float(series[1]) - float(series[0])
    for x in series[1:]:
        residuals.append(float(x) - (lvl + tr))
        prev = lvl
        lvl = alpha * float(x) + (1 - alpha) * (lvl + tr)
        tr = beta * (lvl - prev) + (1 - beta) * tr
    sigma = float(np.std(residuals)) if residuals else 0.0

    def predict(h):
        point = level + h * trend
        width = sigma * sqrt(h)
        return point, max(0.0, point - 1.28 * width), point + 1.28 * width

    return predict


def _holt_winters(series, season_length=7, alpha=0.3, beta=0.1, gamma=0.3):
    """Holt-Winters additive — level + trend + seasonality."""
    if len(series) < season_length * 2:
        return _holt(series)

    # Initialize
    n_seasons = len(series) // season_length
    season_avgs = np.array([
        np.mean(series[i * season_length:(i + 1) * season_length])
        for i in range(n_seasons)
    ])
    overall_mean = float(np.mean(season_avgs))
    seasonal = np.array([
        float(np.mean(series[i::season_length]) - overall_mean)
        for i in range(season_length)
    ])

    # Initialize level and trend from first two seasonal cycles
    first_cycle = series[:season_length]
    second_cycle = series[season_length:2 * season_length]
    level = float(np.mean(first_cycle))
    trend = float(np.mean(second_cycle) - np.mean(first_cycle)) / season_length

    residuals = []

    for i, x in enumerate(series):
        s_idx = i % season_length
        x = float(x)
        season_val = seasonal[s_idx]
        forecast_one = level + trend + season_val
        residuals.append(x - forecast_one)

        prev_level = level
        level = alpha * (x - season_val) + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend
        seasonal[s_idx] = (
            gamma * (x - level) + (1 - gamma) * season_val
        )

    sigma = float(np.std(residuals)) if residuals else 0.0

    def predict(h):
        s_idx = (h - 1) % season_length
        point = level + h * trend + seasonal[s_idx]
        width = sigma * sqrt(h)
        return point, max(0.0, point - 1.28 * width), point + 1.28 * width

    return predict


def _croston(series, alpha=0.3):
    """
    Croston's method for intermittent demand.

    Decomposes into two exponential smoothings:
      - interval between non-zero demands
      - size of non-zero demands
    Forecast = size / interval, constant across horizon.
    """
    non_zero = [float(x) for x in series if x > 0]

    if not non_zero:
        def predict(h):
            return 0.0, 0.0, 0.0
        return predict

    # Smooth the demand sizes
    size = non_zero[0]
    for x in non_zero[1:]:
        size = alpha * x + (1 - alpha) * size

    # Smooth the intervals
    intervals = []
    last = -1
    for i, x in enumerate(series):
        if x > 0:
            if last >= 0:
                intervals.append(i - last)
            last = i
    if intervals:
        interval = intervals[0]
        for x in intervals[1:]:
            interval = alpha * x + (1 - alpha) * interval
    else:
        interval = 1.0

    rate = size / max(interval, 1e-6)

    # Uncertainty from the non-zero demand std
    sigma = float(np.std(non_zero)) if len(non_zero) > 1 else size * 0.5

    def predict(h):
        point = rate
        width = sigma / max(interval, 1.0)
        return point, max(0.0, point - 1.28 * width), point + 1.28 * width

    return predict


def _wma(series, window=14):
    """Weighted moving average — recent observations weighted higher."""
    w = np.arange(1, window + 1, dtype=float)
    w /= w.sum()

    def predict(h):
        recent = series[-window:]
        if len(recent) < window:
            wts = np.arange(1, len(recent) + 1, dtype=float)
            wts /= wts.sum()
            point = float(np.dot(recent, wts)) if len(recent) else 0.0
        else:
            point = float(np.dot(recent, w))
        sigma = float(np.std(recent)) if len(recent) > 1 else 0.0
        width = sigma * sqrt(h)
        return point, max(0.0, point - 1.28 * width), point + 1.28 * width

    return predict