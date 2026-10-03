# analytics/services/campaign_advisor.py

"""
Campaign advisor.

Four entry points, one module:

  1. suggest_campaign_candidates(wholesaler)
     Wholesaler-side. Which lots should go into a new campaign,
     ranked by expected write-off value.

  2. suggest_campaigns_for_product(product, retailer_entity, ...)
     Retailer-side. Which active campaigns include this product and
     are eligible for this retailer, ranked by a multi-factor score.

  3. recommend_campaign_item_quantity(product, retailer_entity, ...)
     Retailer-side. How many units of ONE item on an opened campaign
     this specific retailer should order, based on their own demand
     history and current on-hand.

  4. suggest_wholesale_item_quantity(product, wholesaler_entity, ...)
     Wholesaler-side. What value to put in a campaign item's
     suggested_quantity field — the median of what the audience would
     each order, or a fallback from the wholesaler-tier forecast.

Usage:
    from analytics.services.campaign_advisor import (
        suggest_campaign_candidates,
        suggest_campaigns_for_product,
        recommend_campaign_item_quantity,
        suggest_wholesale_item_quantity,
    )

Reads only. No writes here — this module is purely advisory.
"""

import math
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Sum

from analytics.models import (
    DemandForecast,
    ExpiryRisk,
    ForecastAccuracy,
    ProductDemandProfile,
)


# =====================================================================
# Constants
# =====================================================================

# Only lots whose recommended action supports a campaign
CAMPAIGN_ELIGIBLE_ACTIONS = {"discount", "transfer", "promote", "monitor"}

# Probability / days-to-expiry → suggested discount
DISCOUNT_TIERS = [
    # (min_probability, max_days_to_expiry, suggested_percent, urgency)
    (0.80, 30,   Decimal("50.00"), "critical"),
    (0.80, 90,   Decimal("35.00"), "high"),
    (0.80, None, Decimal("25.00"), "medium"),
    (0.50, 60,   Decimal("25.00"), "high"),
    (0.50, None, Decimal("20.00"), "medium"),
    (0.30, None, Decimal("15.00"), "low"),
    (0.10, None, Decimal("10.00"), "low"),
]

# Campaign scoring weights — must sum to 1.0
WEIGHT_CAMPAIGN_DISCOUNT = 0.35
WEIGHT_CAMPAIGN_BONUS = 0.25
WEIGHT_CAMPAIGN_URGENCY = 0.20
WEIGHT_CAMPAIGN_SHELF_LIFE = 0.10
WEIGHT_CAMPAIGN_AUDIENCE = 0.10

# Service levels for the quantity recommender.
# quantile → which DemandForecast column to read for the window total.
# z        → safety-stock multiplier, applied only when demand_std > 0.
SERVICE_LEVEL_QUANTILE = {
    "conservative": "p10",
    "balanced": "p50",
    "aggressive": "p90",
}
SERVICE_LEVEL_Z = {
    "conservative": 0.00,
    "balanced": 1.28,
    "aggressive": 1.65,
}

# Minimum history days before we trust a per-retailer recommendation.
# Below this, we return an empty recommendation rather than a
# confident number built on a couple of days of data.
MIN_HISTORY_FOR_RECOMMENDATION = 14

# Nominal retailers-per-campaign used when the audience is empty and
# we're falling back to the wholesaler-tier forecast.
NOMINAL_RETAILERS_PER_CAMPAIGN = 5


# =====================================================================
# (1) Wholesaler-side: candidate lots for a new campaign
# =====================================================================

def suggest_campaign_candidates(
    wholesaler,
    as_of_date: date | None = None,
) -> list[dict]:
    """
    Return a list of candidate lots for a campaign, sorted by
    expected write-off value (highest first).

    Each candidate is a plain dict:
        {
            receipt_id, product_id, product_title, batch,
            days_to_expiry, current_quantity, at_risk_quantity,
            at_risk_value, expiry_probability, recommended_action,
            suggested_discount_percent, suggested_end_date, urgency
        }
    """
    as_of_date = as_of_date or date.today()

    risks = (
        ExpiryRisk.objects
        .filter(
            entity=wholesaler,
            tier="WHOLESALER",
            as_of_date=as_of_date,
            expiry_probability__gte=0.10,
            recommended_action__in=CAMPAIGN_ELIGIBLE_ACTIONS,
        )
        .select_related("product", "wholesaler_receipt")
        .order_by("-expected_write_off_value")
    )

    candidates = []
    for r in risks:
        pct, urgency = _suggested_discount(
            probability=r.expiry_probability,
            days_to_expiry=r.days_to_expiry,
        )
        end_date = _suggested_end_date(
            receipt=r.wholesaler_receipt,
            risk=r,
            as_of_date=as_of_date,
        )

        receipt = r.wholesaler_receipt
        candidates.append({
            "receipt_id": str(r.wholesaler_receipt_id),
            "product_id": str(r.product_id),
            "product_title": r.product.title,
            "batch": getattr(receipt, "batch", None) if receipt else None,
            "days_to_expiry": r.days_to_expiry,
            "current_quantity": r.current_quantity,
            "at_risk_quantity": int(round(r.expected_unsold_quantity or 0)),
            "at_risk_value": str(r.expected_write_off_value or Decimal("0.00")),
            "expiry_probability": r.expiry_probability,
            "recommended_action": r.recommended_action,
            "suggested_discount_percent": str(pct),
            "suggested_end_date": end_date.isoformat() if end_date else None,
            "urgency": urgency,
        })

    return candidates


def _suggested_discount(probability: float, days_to_expiry: int):
    for min_prob, max_days, pct, urgency in DISCOUNT_TIERS:
        if probability < min_prob:
            continue
        if max_days is not None and days_to_expiry > max_days:
            continue
        return pct, urgency
    return Decimal("10.00"), "low"


def _suggested_end_date(receipt, risk, as_of_date, safety_margin_days=14):
    expiry = getattr(receipt, "expiry_date", None) if receipt else None
    if not expiry:
        return None
    latest = expiry - timedelta(days=safety_margin_days)
    if risk.expiry_probability >= 0.80:
        latest = min(latest, as_of_date + timedelta(days=30))
    elif risk.expiry_probability >= 0.50:
        latest = min(latest, as_of_date + timedelta(days=60))
    return latest


# =====================================================================
# (2) Retailer-side: which campaigns to opt into, per product
# =====================================================================

def suggest_campaigns_for_product(
    product,
    retailer_entity,
    forecast_total: float,
    as_of_date: date | None = None,
    limit: int = 3,
) -> list[dict]:
    """
    Rank published campaigns that include this product and that the
    retailer is eligible for.

    Eligibility:
      - Campaign status is PUBLISHED and currently active
      - Retailer is in the campaign audience (if the campaign has one)
      - Retailer hasn't opted out

    Returns at most `limit` items, sorted by score descending.
    Already-opted-in campaigns sort to the bottom.

    NOTE: the `suggested_quantity` field on each result is a lightweight
    hint (min of item.suggested_quantity, per_retailer_limit, and the
    caller-supplied forecast_total). It does NOT subtract on-hand or
    account for pack size. When the retailer actually opens a campaign,
    call `recommend_campaign_item_quantity` for the precise number.
    """
    from wholesalers.models import (
        WholesalerCampaignAudience,
        WholesalerCampaignItem,
    )

    as_of_date = as_of_date or date.today()

    # Distribution policy — same check as offers
    entity_type = getattr(retailer_entity, "entity_type", None)
    allowed = product.allowed_entities or []
    if allowed and entity_type not in allowed:
        return []

    items = (
        WholesalerCampaignItem.objects
        .filter(
            wholesaler_receipt__product=product,
            campaign__status="PUBLISHED",
            campaign__is_active="true",
            campaign__start__lte=as_of_date,
            campaign__end__gte=as_of_date,
        )
        .select_related("campaign", "campaign__wholesaler", "wholesaler_receipt")
    )

    campaign_ids = [i.campaign_id for i in items]

    audience_map = {
        a.campaign_id: a
        for a in WholesalerCampaignAudience.objects.filter(
            retailer=retailer_entity,
            campaign_id__in=campaign_ids,
        )
    }

    campaigns_with_audience = set(
        WholesalerCampaignAudience.objects
        .filter(campaign_id__in=campaign_ids)
        .values_list("campaign_id", flat=True)
        .distinct()
    )

    results = []
    for item in items:
        campaign = item.campaign
        audience = audience_map.get(campaign.id)
        has_audience = campaign.id in campaigns_with_audience

        # If the campaign targets specific retailers, this one must be in it
        if has_audience and audience is None:
            continue

        # Skip explicitly opted-out
        if audience is not None and audience.opted_out_at is not None:
            continue

        opted_in = bool(audience and audience.opted_in_at is not None)

        score = _score_campaign(
            item=item,
            campaign=campaign,
            audience=audience,
            forecast_total=forecast_total,
            as_of_date=as_of_date,
        )

        results.append(_build_campaign_dict(
            item=item,
            campaign=campaign,
            audience=audience,
            opted_in=opted_in,
            forecast_total=forecast_total,
            score=score,
            as_of_date=as_of_date,
        ))

    results.sort(key=lambda c: (c["opted_in"], -c["score"]))
    return results[:limit]


def _score_campaign(item, campaign, audience, forecast_total, as_of_date):
    # Discount vs. list
    list_price = float(item.wholesaler_receipt.unit_selling_price or 0)
    published_price = float(item.published_unit_price or list_price)
    if list_price > 0:
        discount_pct = ((list_price - published_price) / list_price) * 100
    else:
        discount_pct = 0.0
    discount_component = min(max(discount_pct, 0) / 40.0, 1.0) * 100

    # Bonus
    bonus_units = item.published_bonus_quantity or 0
    suggested = item.suggested_quantity or 0
    bonus_pct = (bonus_units / suggested * 100) if suggested > 0 else 0.0
    bonus_component = min(bonus_pct / 30.0, 1.0) * 100

    # Urgency
    days_remaining = (campaign.end - as_of_date).days
    if days_remaining <= 3:
        urgency_component = 100.0
    elif days_remaining <= 7:
        urgency_component = 80.0
    elif days_remaining <= 14:
        urgency_component = 60.0
    elif days_remaining <= 30:
        urgency_component = 40.0
    else:
        urgency_component = 20.0

    # Shelf life
    days_to_expiry = None
    if item.wholesaler_receipt.expiry_date:
        days_to_expiry = (item.wholesaler_receipt.expiry_date - as_of_date).days
    if days_to_expiry is None:
        shelf_component = 50.0
    elif days_to_expiry >= 180:
        shelf_component = 100.0
    elif days_to_expiry <= 30:
        shelf_component = 0.0
    else:
        shelf_component = ((days_to_expiry - 30) / 150) * 100

    # Audience targeting
    audience_component = 100.0 if audience is not None else 50.0

    return (
        WEIGHT_CAMPAIGN_DISCOUNT * discount_component
        + WEIGHT_CAMPAIGN_BONUS * bonus_component
        + WEIGHT_CAMPAIGN_URGENCY * urgency_component
        + WEIGHT_CAMPAIGN_SHELF_LIFE * shelf_component
        + WEIGHT_CAMPAIGN_AUDIENCE * audience_component
    )


def _build_campaign_dict(
    item, campaign, audience, opted_in, forecast_total, score, as_of_date,
):
    receipt = item.wholesaler_receipt
    days_remaining = (campaign.end - as_of_date).days
    days_to_expiry = None
    if receipt.expiry_date:
        days_to_expiry = (receipt.expiry_date - as_of_date).days

    # Lightweight hint only. The precise number comes from
    # recommend_campaign_item_quantity when the retailer opens the
    # campaign. See the docstring of suggest_campaigns_for_product.
    suggested = item.suggested_quantity or 0
    if item.per_retailer_limit:
        suggested = min(suggested, item.per_retailer_limit)
    if forecast_total and forecast_total > 0:
        suggested = min(suggested, int(round(forecast_total)))

    expected_margin = None
    try:
        expected_margin = item.project_for_quantity(suggested, Decimal("0.00"))
    except Exception:
        expected_margin = None

    parts = []
    if item.published_unit_price:
        parts.append(f"campaign price {item.published_unit_price}")
    if item.published_bonus_quantity:
        parts.append(f"+{item.published_bonus_quantity} bonus")
    if days_remaining <= 7:
        parts.append(f"ends in {days_remaining} days")
    if not parts:
        parts.append("active campaign")

    return {
        "campaign_id": str(campaign.id),
        "campaign_title": campaign.title,
        "campaign_status": campaign.status,
        "campaign_end": campaign.end.isoformat(),
        "days_remaining": days_remaining,
        "wholesaler_id": str(campaign.wholesaler_id),
        "wholesaler_title": campaign.wholesaler.title,
        "receipt_id": str(receipt.id),
        "batch": receipt.batch,
        "days_to_expiry": days_to_expiry,
        "published_unit_price": str(item.published_unit_price or "0.00"),
        "published_bonus_quantity": item.published_bonus_quantity or 0,
        "suggested_quantity": suggested,
        "per_retailer_limit": item.per_retailer_limit,
        "expected_margin_estimate": (
            str(expected_margin) if expected_margin is not None else None
        ),
        "opted_in": opted_in,
        "score": round(score, 2),
        "rationale": " · ".join(parts),
    }


# =====================================================================
# (3) Retailer-side: how many units of one campaign item
# =====================================================================

def recommend_campaign_item_quantity(
    product,
    retailer_entity,
    *,
    campaign_start: date,
    campaign_end: date,
    per_retailer_limit: int | None = None,
    lead_time_days: int = 3,
    service_level: str = "balanced",
    pack_size: int = 1,
    run_date: date | None = None,
) -> dict:
    """
    Recommend how many units a retailer should order of one campaign
    item, given their own demand history and current on-hand.

    Composes:
      - the retailer's own DemandForecast over the campaign window
      - safety stock from ProductDemandProfile.demand_std
      - current on-hand from RetailerReceipts
      - a confidence flag derived from ForecastAccuracy

    Tail extrapolation: if the campaign window extends past the
    forecast horizon, the covered daily rate is extrapolated to fill
    the remaining days. This keeps the recommendation stable even
    when FORECAST_HORIZON_DAYS is short.

    Returns:
        {
            "recommended_quantity": int,
            "confidence": "high" | "medium" | "low" | "none",
            "reason": str,
            "current_on_hand": int,
            "expected_demand": float,
            "safety_stock": float,
            "demand_pattern": str | None,
            "forecast_wape": float | None,
            "capped_by_limit": bool,
        }
    """
    from retailers.models import RetailerReceipts

    quantile = SERVICE_LEVEL_QUANTILE.get(service_level, "p50")
    z = SERVICE_LEVEL_Z.get(service_level, 1.28)

    # ---- 1. Which forecast run to use ----
    latest_run = (
        DemandForecast.objects
        .filter(
            entity=retailer_entity,
            product=product,
            tier="RETAILER",
        )
        .order_by("-run_date")
        .values_list("run_date", flat=True)
        .first()
    )

    if latest_run is None:
        return _empty_recommendation(
            "No forecast available for this retailer/product yet."
        )

    if run_date is None:
        run_date = latest_run

    # ---- 2. Expected demand over the campaign window ----
    window_qs = DemandForecast.objects.filter(
        entity=retailer_entity,
        product=product,
        tier="RETAILER",
        run_date=run_date,
        forecast_date__gte=campaign_start,
        forecast_date__lte=campaign_end,
    )

    agg = window_qs.aggregate(
        expected=Sum(quantile),
        days_covered=Count("forecast_date", distinct=True),
    )
    days_covered = agg["days_covered"] or 0
    campaign_days = (campaign_end - campaign_start).days + 1

    if days_covered and days_covered < campaign_days:
        # Tail extrapolation.
        avg_daily = float(agg["expected"] or 0) / days_covered
        window_forecast = avg_daily * campaign_days
    else:
        window_forecast = float(agg["expected"] or 0)

    # ---- 3. Demand variability ----
    profile = (
        ProductDemandProfile.objects
        .filter(
            entity=retailer_entity,
            product=product,
            tier="RETAILER",
        )
        .order_by("-as_of_date")
        .first()
    )

    # New products — fall through rather than confidently recommend
    # a number based on a couple of days.
    if profile and (profile.history_days or 0) < MIN_HISTORY_FOR_RECOMMENDATION:
        return _empty_recommendation(
            "Not enough sales history to recommend a quantity — "
            "use the wholesaler's suggestion or your own judgement."
        )

    demand_std = float(profile.demand_std or 0) if profile else 0.0

    # Safety stock = z * σ * sqrt(lead_time). Applied only when we
    # have a non-zero σ; otherwise the quantile already carries the
    # distribution.
    safety_stock = z * demand_std * math.sqrt(max(lead_time_days, 1))

    # ---- 4. Current on-hand ----
    current_on_hand = (
        RetailerReceipts.objects
        .filter(
            entity=retailer_entity,
            product=product,
            is_active="true",
            current_unit_quantity__gt=0,
        )
        .aggregate(total=Sum("current_unit_quantity"))
        .get("total") or 0
    )

    # ---- 5. Net requirement ----
    target = float(window_forecast) + safety_stock
    raw = max(0.0, target - float(current_on_hand))

    # ---- 6. Round up to pack size ----
    if pack_size and pack_size > 1:
        raw = math.ceil(raw / pack_size) * pack_size

    recommended = int(raw)

    # ---- 7. Clamp to per-retailer limit ----
    capped = False
    if per_retailer_limit is not None and recommended > per_retailer_limit:
        recommended = per_retailer_limit
        capped = True

    # ---- 8. Confidence from forecast accuracy ----
    confidence, wape = _confidence_for(retailer_entity, product, profile)

    return {
        "recommended_quantity": recommended,
        "confidence": confidence,
        "reason": (
            f"Forecast {quantile}={float(window_forecast):.1f} over "
            f"{campaign_days}d; on hand {int(current_on_hand)}; "
            f"service level {service_level}"
            + (" (capped by per-retailer limit)" if capped else "")
        ),
        "current_on_hand": int(current_on_hand),
        "expected_demand": float(window_forecast),
        "safety_stock": float(safety_stock),
        "demand_pattern": profile.demand_pattern if profile else None,
        "forecast_wape": wape,
        "capped_by_limit": capped,
    }


def _confidence_for(retailer_entity, product, profile):
    accuracy = (
        ForecastAccuracy.objects
        .filter(
            entity=retailer_entity,
            product=product,
            tier="RETAILER",
        )
        .order_by("-period_end")
        .first()
    )
    if accuracy:
        if accuracy.wape < 0.20:
            return "high", accuracy.wape
        if accuracy.wape < 0.40:
            return "medium", accuracy.wape
        return "low", accuracy.wape
    if profile and profile.demand_pattern == "new":
        return "low", None
    return "medium", None


def _empty_recommendation(reason: str) -> dict:
    return {
        "recommended_quantity": 0,
        "confidence": "none",
        "reason": reason,
        "current_on_hand": 0,
        "expected_demand": 0.0,
        "safety_stock": 0.0,
        "demand_pattern": None,
        "forecast_wape": None,
        "capped_by_limit": False,
    }


# =====================================================================
# (4) Wholesaler-side: the value for a campaign item's suggested_quantity
# =====================================================================

def suggest_wholesale_item_quantity(
    product,
    wholesaler_entity,
    *,
    campaign_start: date,
    campaign_end: date,
    audience_entity_ids: list | None = None,
    service_level: str = "balanced",
) -> dict:
    """
    Suggestion for the `suggested_quantity` field on a
    WholesalerCampaignItem.

    Unlike `recommend_campaign_item_quantity` (per retailer), this
    returns a representative per-retailer quantity suitable as the
    default hint shown to every retailer in the audience.

    Strategy:
      1. If `audience_entity_ids` is non-empty, compute each retailer's
         own recommendation and take the median. Median, not mean,
         so one outlier retailer doesn't skew the hint.
      2. Otherwise, fall back to the wholesaler-tier forecast for the
         product, divided by a nominal retailers-per-campaign factor.
      3. If neither is available, return 0 with confidence "none".

    Returns:
        {
            "suggested_quantity": int,
            "audience_size": int,
            "expected_total_volume": int,
            "confidence": "high" | "medium" | "low" | "none",
            "reason": str,
        }
    """
    from authentication.models import Entities

    audience_entity_ids = audience_entity_ids or []
    campaign_days = max(1, (campaign_end - campaign_start).days + 1)

    # ---- Path 1: median across the current audience ----
    if audience_entity_ids:
        per_retailer = []
        for rid in audience_entity_ids:
            try:
                retailer = Entities.objects.get(pk=rid)
            except Entities.DoesNotExist:
                continue

            r = recommend_campaign_item_quantity(
                product=product,
                retailer_entity=retailer,
                campaign_start=campaign_start,
                campaign_end=campaign_end,
                service_level=service_level,
            )
            if r["confidence"] != "none":
                per_retailer.append(r["recommended_quantity"])

        if per_retailer:
            per_retailer.sort()
            n = len(per_retailer)
            median = (
                per_retailer[n // 2]
                if n % 2 == 1
                else (per_retailer[n // 2 - 1] + per_retailer[n // 2]) // 2
            )
            total = sum(per_retailer)
            return {
                "suggested_quantity": int(median),
                "audience_size": n,
                "expected_total_volume": int(total),
                "confidence": "high" if n >= 5 else "medium",
                "reason": (
                    f"Median of {n} retailer forecast"
                    f"{'s' if n != 1 else ''}: {median} units per retailer. "
                    f"Total expected volume across audience: {total}."
                ),
            }

    # ---- Path 2: fall back to wholesaler-tier forecast ----
    latest_run = (
        DemandForecast.objects
        .filter(
            entity=wholesaler_entity,
            product=product,
            tier="WHOLESALER",
        )
        .order_by("-run_date")
        .values_list("run_date", flat=True)
        .first()
    )

    if latest_run is None:
        return {
            "suggested_quantity": 0,
            "audience_size": 0,
            "expected_total_volume": 0,
            "confidence": "none",
            "reason": (
                "No audience and no wholesaler-tier forecast yet — "
                "set the quantity manually."
            ),
        }

    quantile = SERVICE_LEVEL_QUANTILE.get(service_level, "p50")
    wholesaler_total = (
        DemandForecast.objects
        .filter(
            entity=wholesaler_entity,
            product=product,
            tier="WHOLESALER",
            run_date=latest_run,
            forecast_date__gte=campaign_start,
            forecast_date__lte=campaign_end,
        )
        .aggregate(expected=Sum(quantile))
        .get("expected") or 0
    )

    per_retailer = int(
        round(float(wholesaler_total) / NOMINAL_RETAILERS_PER_CAMPAIGN)
    )

    return {
        "suggested_quantity": per_retailer,
        "audience_size": 0,
        "expected_total_volume": int(round(float(wholesaler_total))),
        "confidence": "low",
        "reason": (
            f"Wholesaler forecast total {float(wholesaler_total):.1f} units "
            f"over {campaign_days}d; split across ~"
            f"{NOMINAL_RETAILERS_PER_CAMPAIGN} retailers → "
            f"{per_retailer}/retailer. Add audience to refine."
        ),
    }

# =====================================================================
# Batched: per-item recommendations for an entire campaign
# =====================================================================

def recommend_quantities_for_campaign_items(
    items,
    retailer_entity,
    *,
    service_level: str = "balanced",
    lead_time_days: int = 3,
    pack_size_by_item: dict | None = None,
) -> dict:
    """
    Batch variant of recommend_campaign_item_quantity.

    Takes a list of WholesalerCampaignItem objects (all on the same
    campaign, so the same window) and returns a map
    { str(item.id): recommendation_dict }.

    Queries are batched across all items:
      - 1 for the latest run_date
      - 1 for the window forecast totals
      - 1 for the demand profiles
      - 1 for current on-hand
      - 1 for forecast accuracies

    5 queries total, independent of item count. Falls back to each
    item's `suggested_quantity` when the batch can't help (missing
    forecast for that product, insufficient history, etc.).
    """
    from retailers.models import RetailerReceipts

    if not items:
        return {}

    products = [it.wholesaler_receipt.product for it in items]
    product_ids = [p.id for p in products]
    pack_size_by_item = pack_size_by_item or {}

    # Assume all items share one campaign — the caller's contract.
    # If they don't, use the widest window.
    campaign_start = min(it.campaign.start for it in items)
    campaign_end = max(it.campaign.end for it in items)
    campaign_days = max(1, (campaign_end - campaign_start).days + 1)

    quantile = SERVICE_LEVEL_QUANTILE.get(service_level, "p50")
    z = SERVICE_LEVEL_Z.get(service_level, 1.28)

    # ---- 1. Latest run_date across all products ----
    latest_run = (
        DemandForecast.objects
        .filter(
            entity=retailer_entity,
            product_id__in=product_ids,
            tier="RETAILER",
        )
        .order_by("-run_date")
        .values_list("run_date", flat=True)
        .first()
    )

    # ---- 2. Window forecast totals, grouped by product ----
    forecast_totals: dict = {}
    days_covered: dict = {}
    if latest_run:
        rows = (
            DemandForecast.objects
            .filter(
                entity=retailer_entity,
                product_id__in=product_ids,
                tier="RETAILER",
                run_date=latest_run,
                forecast_date__gte=campaign_start,
                forecast_date__lte=campaign_end,
            )
            .values("product_id")
            .annotate(
                expected=Sum(quantile),
                days=Count("forecast_date", distinct=True),
            )
        )
        for r in rows:
            forecast_totals[r["product_id"]] = float(r["expected"] or 0)
            days_covered[r["product_id"]] = r["days"] or 0

    # ---- 3. Latest demand profile per product ----
    profiles: dict = {}
    profile_rows = (
        ProductDemandProfile.objects
        .filter(
            entity=retailer_entity,
            product_id__in=product_ids,
            tier="RETAILER",
        )
        .order_by("product_id", "-as_of_date")
        .distinct("product_id")
    )
    for p in profile_rows:
        profiles[p.product_id] = p

    # ---- 4. Current on-hand, grouped by product ----
    on_hand: dict = {}
    on_hand_rows = (
        RetailerReceipts.objects
        .filter(
            entity=retailer_entity,
            product_id__in=product_ids,
            is_active="true",
            current_unit_quantity__gt=0,
        )
        .values("product_id")
        .annotate(total=Sum("current_unit_quantity"))
    )
    for r in on_hand_rows:
        on_hand[r["product_id"]] = r["total"] or 0

    # ---- 5. Latest forecast accuracy per product ----
    accuracies: dict = {}
    accuracy_rows = (
        ForecastAccuracy.objects
        .filter(
            entity=retailer_entity,
            product_id__in=product_ids,
            tier="RETAILER",
        )
        .order_by("product_id", "-period_end")
        .distinct("product_id")
    )
    for a in accuracy_rows:
        accuracies[a.product_id] = a

    # ---- Compute per item ----
    out: dict = {}
    for item in items:
        product = item.wholesaler_receipt.product
        pack_size = pack_size_by_item.get(str(item.id), 1)
        fallback_qty = int(item.suggested_quantity or 0)

        # No forecast for this product — use the wholesaler's hint.
        if product.id not in forecast_totals:
            out[str(item.id)] = _recommendation_payload(
                quantity=fallback_qty,
                confidence="none",
                reason="No forecast available — using the wholesaler's hint.",
                current_on_hand=int(on_hand.get(product.id, 0)),
                expected_demand=0.0,
                safety_stock=0.0,
                demand_pattern=None,
                forecast_wape=None,
                capped=False,
            )
            continue

        covered = days_covered.get(product.id, 0)
        raw_total = forecast_totals.get(product.id, 0.0)
        if covered and covered < campaign_days:
            # Tail extrapolation: extend the covered daily rate to
            # the uncovered portion of the window.
            window_forecast = (raw_total / covered) * campaign_days
        else:
            window_forecast = raw_total

        profile = profiles.get(product.id)

        # New product — don't confidently recommend off a few days.
        if profile and (profile.history_days or 0) < MIN_HISTORY_FOR_RECOMMENDATION:
            out[str(item.id)] = _recommendation_payload(
                quantity=fallback_qty,
                confidence="none",
                reason="Not enough history — using the wholesaler's hint.",
                current_on_hand=int(on_hand.get(product.id, 0)),
                expected_demand=float(window_forecast),
                safety_stock=0.0,
                demand_pattern=profile.demand_pattern,
                forecast_wape=None,
                capped=False,
            )
            continue

        demand_std = float(profile.demand_std or 0) if profile else 0.0
        safety_stock = z * demand_std * math.sqrt(max(lead_time_days, 1))

        current = on_hand.get(product.id, 0)
        raw = max(0.0, float(window_forecast) + safety_stock - float(current))
        if pack_size and pack_size > 1:
            raw = math.ceil(raw / pack_size) * pack_size

        recommended = int(raw)
        capped = False
        if (
            item.per_retailer_limit is not None
            and recommended > item.per_retailer_limit
        ):
            recommended = item.per_retailer_limit
            capped = True

        accuracy = accuracies.get(product.id)
        if accuracy:
            if accuracy.wape < 0.20:
                confidence = "high"
            elif accuracy.wape < 0.40:
                confidence = "medium"
            else:
                confidence = "low"
            wape = accuracy.wape
        elif profile and profile.demand_pattern == "new":
            confidence, wape = "low", None
        else:
            confidence, wape = "medium", None

        out[str(item.id)] = _recommendation_payload(
            quantity=recommended,
            confidence=confidence,
            reason=(
                f"Forecast {quantile}={window_forecast:.1f} over "
                f"{campaign_days}d; on hand {int(current)}; "
                f"service level {service_level}"
                + (" (capped by per-retailer limit)" if capped else "")
            ),
            current_on_hand=int(current),
            expected_demand=float(window_forecast),
            safety_stock=float(safety_stock),
            demand_pattern=profile.demand_pattern if profile else None,
            forecast_wape=wape,
            capped=capped,
        )

    return out


def _recommendation_payload(
    *, quantity, confidence, reason,
    current_on_hand, expected_demand, safety_stock,
    demand_pattern, forecast_wape, capped,
) -> dict:
    """Uniform payload for the batched recommendation."""
    return {
        "recommended_quantity": int(quantity),
        "confidence": confidence,
        "reason": reason,
        "current_on_hand": int(current_on_hand),
        "expected_demand": float(expected_demand),
        "safety_stock": float(safety_stock),
        "demand_pattern": demand_pattern,
        "forecast_wape": forecast_wape,
        "capped_by_limit": bool(capped),
    }