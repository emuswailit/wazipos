# analytics/services/campaign_advisor.py

"""
Campaign advisor.

Given a wholesaler entity, suggests campaign candidates from the
ExpiryRisk table. Purely advisory — the wholesaler still decides.

Usage:
    from analytics.services.campaign_advisor import suggest_campaign_candidates

    suggestions = suggest_campaign_candidates(wholesaler, as_of_date=today)
"""

from datetime import date, timedelta
from decimal import Decimal

from analytics.models import ExpiryRisk


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


def suggest_campaign_candidates(wholesaler, as_of_date: date | None = None) -> list[dict]:
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


# analytics/services/campaign_advisor.py — APPEND THIS FUNCTION

"""
Campaign advisor for a specific product + retailer.

Complements suggest_campaign_candidates (wholesaler-side) with a
retailer-side recommendation: which active campaigns should this
retailer opt into?
"""

from datetime import date
from decimal import Decimal

from wholesalers.models import (
    WholesalerCampaign,
    WholesalerCampaignAudience,
    WholesalerCampaignItem,
)


# Scoring weights — must sum to 1.0
WEIGHT_CAMPAIGN_DISCOUNT = 0.35
WEIGHT_CAMPAIGN_BONUS = 0.25
WEIGHT_CAMPAIGN_URGENCY = 0.20
WEIGHT_CAMPAIGN_SHELF_LIFE = 0.10
WEIGHT_CAMPAIGN_AUDIENCE = 0.10


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
    """
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

    # Which audience rows exist for this retailer?
    audience_map = {
        a.campaign_id: a
        for a in WholesalerCampaignAudience.objects.filter(
            retailer=retailer_entity,
            campaign_id__in=campaign_ids,
        )
    }

    # Which campaigns have any audience at all?
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

    # Sort: not-yet-opted-in first, then by score desc
    results.sort(key=lambda c: (c["opted_in"], -c["score"]))
    return results[:limit]


# =====================================================================
# Scoring
# =====================================================================

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

    # Urgency — closer end date = higher
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


# =====================================================================
# Response shaping
# =====================================================================

def _build_campaign_dict(item, campaign, audience, opted_in, forecast_total, score, as_of_date):
    receipt = item.wholesaler_receipt
    days_remaining = (campaign.end - as_of_date).days
    days_to_expiry = None
    if receipt.expiry_date:
        days_to_expiry = (receipt.expiry_date - as_of_date).days

    # Suggested quantity: min of item's suggestion, per-retailer cap,
    # and what the forecast says we actually need
    suggested = item.suggested_quantity or 0
    if item.per_retailer_limit:
        suggested = min(suggested, item.per_retailer_limit)
    if forecast_total and forecast_total > 0:
        suggested = min(suggested, int(round(forecast_total)))

    # Projected earnings from your existing model logic
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
        "expected_margin_estimate": str(expected_margin) if expected_margin is not None else None,
        "opted_in": opted_in,
        "score": round(score, 2),
        "rationale": " · ".join(parts),
    }