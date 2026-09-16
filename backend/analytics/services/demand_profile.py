# analytics/services/demand_profile.py

"""
Product demand profile builder.

Rolls DemandFact history up to ProductDemandProfile — statistics per
(entity, product, tier).

Idempotent per as_of_date.
"""

from datetime import date, timedelta

from django.db import transaction
from django.db.models import Sum

from analytics.models import DemandFact, ProductDemandProfile


MIN_HISTORY_DAYS = 7
WINDOW_DAYS = 90
TREND_WINDOW = 30          # days for trend comparison
INTERMITTENT_ZERO_PCT = 0.30
ERRATIC_CV = 0.75
STABLE_CV = 0.50


def build_demand_profiles(as_of_date: date | None = None) -> dict:
    """
    Aggregate DemandFact for the last WINDOW_DAYS into
    ProductDemandProfile rows for as_of_date.
    """
    as_of_date = as_of_date or date.today()
    window_start = as_of_date - timedelta(days=WINDOW_DAYS)

    facts = (
        DemandFact.objects
        .filter(fact_date__gte=window_start, fact_date__lte=as_of_date)
        .values("entity_id", "product_id", "tier")
        .distinct()
    )

    profiles = []
    for row in facts:
        profile = _build_profile(
            entity_id=row["entity_id"],
            product_id=row["product_id"],
            tier=row["tier"],
            as_of_date=as_of_date,
            window_start=window_start,
        )
        if profile:
            profiles.append(profile)

    with transaction.atomic():
        ProductDemandProfile.objects.filter(as_of_date=as_of_date).delete()
        if profiles:
            ProductDemandProfile.objects.bulk_create(profiles, batch_size=500)

    return {
        "as_of_date": as_of_date.isoformat(),
        "profiles_created": len(profiles),
    }


def _build_profile(
    entity_id, product_id, tier, as_of_date, window_start,
) -> ProductDemandProfile | None:
    """
    Compute stats for one (entity, product, tier).
    """
    # Pull the daily net quantity across all source types
    daily = (
        DemandFact.objects
        .filter(
            entity_id=entity_id,
            product_id=product_id,
            tier=tier,
            fact_date__gte=window_start,
            fact_date__lte=as_of_date,
        )
        .values("fact_date")
        .annotate(total=Sum("quantity"))
        .order_by("fact_date")
    )

    days = [(d["fact_date"], float(d["total"] or 0)) for d in daily]
    if not days:
        return None

    history_days = (as_of_date - days[0][0]).days + 1

    # Build a continuous daily series (fill missing dates with 0)
    series = _fill_series(days, window_start, as_of_date)

    values = [v for _, v in series]
    n = len(values)
    if n == 0:
        return None

    total = sum(values)
    mean = total / n
    variance = sum((v - mean) ** 2 for v in values) / n
    std = variance ** 0.5
    cv = (std / mean) if mean > 0 else None

    zero_count = sum(1 for v in values if v == 0)
    zero_pct = zero_count / n

    positive_days = n - zero_count
    avg_interval = (n / positive_days) if positive_days > 0 else None

    total_30d = sum(v for _, v in series[-30:])
    total_90d = sum(values) if n >= 90 else None
    max_daily = max(values) if values else None

    # ---- Trend ----
    trend_direction, trend_pct = _compute_trend(series, TREND_WINDOW)

    # ---- Seasonality ----
    weekly = _weekly_seasonality(series)
    monthly = _monthly_seasonality(series)

    # ---- Pattern ----
    pattern = _classify_pattern(
        history_days=history_days,
        cv=cv,
        zero_pct=zero_pct,
        trend_direction=trend_direction,
        weekly=weekly,
        monthly=monthly,
    )

    return ProductDemandProfile(
        entity_id=entity_id,
        product_id=product_id,
        tier=tier,
        as_of_date=as_of_date,
        avg_daily_demand=mean,
        demand_std=std,
        demand_cv=cv,
        demand_interval_days=avg_interval,
        zero_demand_pct=zero_pct,
        total_demand_30d=total_30d,
        total_demand_90d=total_90d,
        max_daily_demand=max_daily,
        trend_direction=trend_direction,
        trend_pct=trend_pct,
        weekly_seasonality=weekly,
        monthly_seasonality=monthly,
        demand_pattern=pattern,
        history_days=history_days,
    )


# =====================================================================
# Helpers
# =====================================================================

def _fill_series(days, start, end):
    """Produce a continuous list of (date, value) from start to end."""
    by_date = dict(days)
    out = []
    d = start
    while d <= end:
        out.append((d, by_date.get(d, 0.0)))
        d += timedelta(days=1)
    return out


def _compute_trend(series, window=30):
    if len(series) < window * 2:
        return None, None
    recent = [v for _, v in series[-window:]]
    earlier = [v for _, v in series[-2 * window:-window]]
    r_mean = sum(recent) / len(recent)
    e_mean = sum(earlier) / len(earlier)
    if e_mean == 0:
        return ("flat" if r_mean == 0 else "up"), None
    pct = (r_mean - e_mean) / e_mean
    if pct > 0.15:
        return "up", pct
    if pct < -0.15:
        return "down", pct
    return "flat", pct


def _weekly_seasonality(series):
    """Average demand per day-of-week."""
    buckets = {i: [] for i in range(7)}
    for d, v in series:
        buckets[d.weekday()].append(v)
    return {
        str(k): (sum(vs) / len(vs) if vs else 0.0)
        for k, vs in buckets.items()
    }


def _monthly_seasonality(series):
    """Average demand per month."""
    buckets: dict = {}
    for d, v in series:
        buckets.setdefault(d.month, []).append(v)
    return {
        str(k): (sum(vs) / len(vs) if vs else 0.0)
        for k, vs in buckets.items()
    }


def _classify_pattern(history_days, cv, zero_pct, trend_direction, weekly, monthly):
    if history_days < MIN_HISTORY_DAYS:
        return "new"
    if zero_pct is not None and zero_pct > INTERMITTENT_ZERO_PCT:
        return "intermittent"
    if cv is not None and cv > ERRATIC_CV:
        return "erratic"
    # Seasonality detection: weekly peak/valley ratio > 1.5
    if weekly:
        vals = [v for v in weekly.values() if v > 0]
        if vals and (max(vals) / min(vals)) > 1.5:
            return "seasonal"
    if trend_direction == "up":
        return "trending_up"
    if trend_direction == "down":
        return "trending_down"
    if cv is not None and cv <= STABLE_CV:
        return "stable"
    return "erratic"