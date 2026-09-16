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