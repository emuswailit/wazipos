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

# Forecast runs kept (the backtest scores the last 30 days of forecasts).
KEEP_RUNS_DAYS = 45

# Facts that are not demand: expired / damaged stock written off. Counting
# them made products that expire a lot look busier, so we ordered more of them.
NON_DEMAND_SOURCES = ("adjustment",)


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

    # All history for the window in ONE query (was one query per product).
    histories = _load_histories(run_date)

    # v2 corrections, each learned from the business's own data:
    calendar = _calendar_factors(histories)             # payday week / public holidays per entity
    bias = _bias_factors(run_date)                      # last backtest: forecasts ran high / low
    adjustments = _active_adjustments(run_date, horizon_days)  # owner-approved context (AI analyst)

    all_forecasts = []
    for profile in profiles.iterator(chunk_size=200):
        key = (profile.entity_id, profile.product_id, profile.tier)
        history = histories.get(key, [])
        context = {
            "calendar": calendar.get(profile.entity_id),
            "bias": bias.get(key, 1.0),
            "adjustments": adjustments.get(key, []),
        }
        forecasts = _forecast_for_profile(profile, run_date, horizon_days, history, context)
        all_forecasts.extend(forecasts)

    with transaction.atomic():
        # Replace this run's forecasts, and drop runs older than the
        # backtest needs (the table otherwise grows by horizon × products a day).
        DemandForecast.objects.filter(run_date=run_date).delete()
        purged, _ = DemandForecast.objects.filter(
            run_date__lt=run_date - timedelta(days=KEEP_RUNS_DAYS),
        ).delete()
        if all_forecasts:
            DemandForecast.objects.bulk_create(all_forecasts, batch_size=1000)

    return {
        "run_date": run_date.isoformat(),
        "horizon_days": horizon_days,
        "forecasts_created": len(all_forecasts),
        "old_forecasts_purged": purged,
    }


# =====================================================================
# Per-product forecast
# =====================================================================

def _forecast_for_profile(profile, run_date, horizon_days, history=None, context=None):
    """
    Produce DemandForecast rows for one product profile.
    """
    if history is None:
        history = _get_history(
            entity_id=profile.entity_id,
            product_id=profile.product_id,
            tier=profile.tier,
            run_date=run_date,
        )

    series = _to_series(history, run_date)

    model_name, predict_fn = _select_champion(profile.demand_pattern, series)
    context = context or {}
    bias = float(context.get("bias") or 1.0)
    calendar = context.get("calendar")
    adjustments = context.get("adjustments") or []

    forecasts = []
    for h in range(1, horizon_days + 1):
        forecast_date = run_date + timedelta(days=h)
        point, p10, p90 = predict_fn(h)
        factor = bias * _calendar_factor(calendar, forecast_date)
        adj = _adjustment_factor(adjustments, forecast_date)
        factor *= adj
        point = max(0.0, point * factor)   # demand can't be negative
        p10 = max(0.0, p10 * factor)
        p90 = max(0.0, p90 * factor)
        name = f"{model_name}+adj" if adj != 1.0 else model_name

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
            model_name=name,
            model_version=MODEL_VERSION,
            segment=profile.demand_pattern or "unknown",
        ))
    return forecasts


def _load_histories(run_date):
    """
    Daily net demand for every (entity, product, tier) in the history
    window, in one query: {(entity_id, product_id, tier): [(date, qty), …]}.
    """
    since = run_date - timedelta(days=HISTORY_WINDOW_DAYS)
    rows = (
        DemandFact.objects
        .filter(fact_date__gte=since, fact_date__lte=run_date)
        .exclude(source_type__in=NON_DEMAND_SOURCES)
        .values("entity_id", "product_id", "tier", "fact_date")
        .annotate(total=Sum("quantity"))
        .order_by("entity_id", "product_id", "tier", "fact_date")
    )
    out = defaultdict(list)
    for r in rows.iterator(chunk_size=5000):
        out[(r["entity_id"], r["product_id"], r["tier"])].append(
            (r["fact_date"], float(r["total"] or 0))
        )
    return out


def _get_history(entity_id, product_id, tier, run_date):
    """Daily net demand for the history window (one product)."""
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
        .exclude(source_type__in=NON_DEMAND_SOURCES)
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
# v2: champion selection, Kenyan calendar, bias correction, adjustments
# =====================================================================

MODEL_VERSION = "2.0"

# Champion selection: every candidate forecasts the last CHAMPION_HOLDOUT days from
# the history before them; the lowest error wins — but it must beat the
# pattern-routed model by CHAMPION_MARGIN, so a lucky fortnight doesn't flip models.
CHAMPION_HOLDOUT = 14
CHAMPION_MIN_HISTORY = 42
CHAMPION_MARGIN = 0.05

# Fixed-date Kenyan public holidays (Easter and Idd move; they're left to the history).
KE_HOLIDAYS = {(1, 1), (5, 1), (6, 1), (10, 10), (10, 20), (12, 12), (12, 25), (12, 26)}


def _is_payday(d):
    """End-of-month / start-of-month salary window, when many Kenyan shops sell more."""
    return d.day >= 25 or d.day <= 3


def _candidates():
    return {
        "ses": lambda s: _ses(s),
        "ses_fast": lambda s: _ses(s, alpha=0.5),
        "holt": lambda s: _holt(s),
        "holt_winters": lambda s: _holt_winters(s, season_length=7),
        "croston": lambda s: _croston(s),
        "wma": lambda s: _wma(s, window=14),
        "seasonal_naive": lambda s: _seasonal_naive(s),
    }


def _holdout_error(predict_fn, actual):
    preds = [max(0.0, float(predict_fn(h)[0])) for h in range(1, len(actual) + 1)]
    abs_err = sum(abs(f - a) for f, a in zip(preds, actual))
    total = float(sum(actual))
    # WAPE where there were sales; mean absolute error on an all-zero window.
    return abs_err / total if total > 0 else abs_err / max(1, len(actual))


def _select_champion(pattern, series):
    """The pattern-routed model, unless another candidate is clearly more accurate on recent days."""
    routed_name, routed_fn = _select_model(pattern, series)
    if len(series) < CHAMPION_MIN_HISTORY:
        return routed_name, routed_fn
    train, test = series[:-CHAMPION_HOLDOUT], series[-CHAMPION_HOLDOUT:]
    scores = {}
    for name, build in _candidates().items():
        try:
            scores[name] = _holdout_error(build(train), test)
        except Exception:  # a model that can't fit this series just doesn't compete
            continue
    if not scores:
        return routed_name, routed_fn
    best = min(scores, key=scores.get)
    base = scores.get(routed_name)
    if best != routed_name and (base is None or scores[best] < base * (1 - CHAMPION_MARGIN)):
        return best, _candidates()[best](series)
    return routed_name, routed_fn


def _seasonal_naive(series, season_length=7, weeks=4):
    """Average of the same weekday over the last few weeks."""
    n = len(series)

    def predict(h):
        start_k = -(-h // season_length)  # ceil(h / 7): the first week back that's in the past
        idx = [n - 1 + h - season_length * k for k in range(start_k, start_k + weeks)]
        vals = [float(series[i]) for i in idx if 0 <= i < n]
        if not vals:
            return 0.0, 0.0, 0.0
        point = float(np.mean(vals))
        sigma = float(np.std(vals)) if len(vals) > 1 else point * 0.3
        return point, max(0.0, point - 1.28 * sigma), point + 1.28 * sigma

    return predict


def _calendar_factors(histories, min_days=90):
    """
    Per entity: how much busier payday week and public holidays are than ordinary days,
    from the entity's total daily demand. Shrunk toward 1 and normalised so the
    month's average demand is unchanged (the models already learned the average).
    """
    totals = defaultdict(lambda: defaultdict(float))
    for (entity_id, _p, _t), rows in histories.items():
        for d, q in rows:
            totals[entity_id][d] += q
    out = {}
    for entity_id, by_date in totals.items():
        if not by_date:
            continue
        start, end = min(by_date), max(by_date)
        days = (end - start).days + 1
        if days < min_days:
            continue
        pay, normal, hol = [], [], []
        for i in range(days):
            d = start + timedelta(days=i)
            v = by_date.get(d, 0.0)
            if (d.month, d.day) in KE_HOLIDAYS:
                hol.append(v)
            elif _is_payday(d):
                pay.append(v)
            else:
                normal.append(v)
        base = float(np.mean(normal)) if normal else 0.0
        if base <= 0:
            continue
        f_pay = min(1.3, max(0.85, float(np.mean(pay)) / base)) if pay else 1.0
        f_pay = 1 + 0.7 * (f_pay - 1)
        f_hol = min(1.5, max(0.6, float(np.mean(hol)) / base)) if len(hol) >= 2 else 1.0
        f_hol = 1 + 0.5 * (f_hol - 1)
        share = 10 / 30.4  # payday-window days in an average month
        mean_f = share * f_pay + (1 - share)
        out[entity_id] = {"payday": f_pay / mean_f, "normal": 1 / mean_f, "holiday": f_hol / mean_f}
    return out


def _calendar_factor(calendar, d):
    if not calendar:
        return 1.0
    if (d.month, d.day) in KE_HOLIDAYS:
        return calendar["holiday"]
    return calendar["payday"] if _is_payday(d) else calendar["normal"]


def _bias_factors(run_date):
    """
    Products whose last backtest ran consistently high or low get nudged back —
    half the measured gap, capped at ±25%, and only with two weeks of evidence.
    """
    from analytics.models import ForecastAccuracy

    latest = (
        ForecastAccuracy.objects.filter(period_end__lte=run_date)
        .order_by("entity_id", "product_id", "tier", "-period_end")
        .distinct("entity_id", "product_id", "tier")
        .values("entity_id", "product_id", "tier", "actual_total", "forecast_total", "n_observations")
    )
    out = {}
    for r in latest.iterator(chunk_size=2000):
        f_total, a_total = float(r["forecast_total"] or 0), float(r["actual_total"] or 0)
        if (r["n_observations"] or 0) < 14 or f_total <= 0:
            continue
        ratio = a_total / f_total
        out[(r["entity_id"], r["product_id"], r["tier"])] = min(1.25, max(0.75, 1 + 0.5 * (ratio - 1)))
    return out


def _active_adjustments(run_date, horizon_days):
    from analytics.models import ForecastAdjustment

    out = defaultdict(list)
    rows = ForecastAdjustment.objects.filter(
        is_active=True,
        ends_on__gte=run_date + timedelta(days=1),
        starts_on__lte=run_date + timedelta(days=horizon_days),
    ).values("entity_id", "product_id", "tier", "starts_on", "ends_on", "pct")
    for r in rows:
        out[(r["entity_id"], r["product_id"], r["tier"])].append((r["starts_on"], r["ends_on"], float(r["pct"])))
    return out


def _adjustment_factor(adjustments, d):
    factor = 1.0
    for start, end, pct in adjustments:
        if start <= d <= end:
            factor *= max(0.2, 1 + pct / 100)
    return factor


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