# analytics/utils/inventory_utils.py

"""
Per-action handlers for the analytics API.

Each function returns (errors, result) — result may be a queryset,
a model instance, a list of dicts, or a dict.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from analytics.models import (
    ExpiryRisk,
    InventoryAlert,
    InventoryMetricSnapshot,
    InventorySnapshot,
    ProductInventoryProfile,
)
from analytics.services.campaign_advisor import suggest_campaign_candidates
from authentication.models import Entities
from analytics.services.bulk_forecast import get_bulk_forecast


# =====================================================================
# Scoping
# =====================================================================

def _scoped_alerts(user):
    qs = InventoryAlert.objects.select_related("product", "entity")
    if user.is_staff:
        return qs
    entity_id = getattr(user, "entity_id", None)
    if not entity_id:
        return qs.none()
    return qs.filter(entity_id=entity_id)


def _scoped_expiry_risks(user):
    qs = ExpiryRisk.objects.select_related("product", "entity", "wholesaler_receipt", "retailer_receipt")
    if user.is_staff:
        return qs
    entity_id = getattr(user, "entity_id", None)
    if not entity_id:
        return qs.none()
    return qs.filter(entity_id=entity_id)


def _scoped_snapshots(user):
    qs = InventorySnapshot.objects.select_related("product", "entity", "received_from_entity")
    if user.is_staff:
        return qs
    entity_id = getattr(user, "entity_id", None)
    if not entity_id:
        return qs.none()
    return qs.filter(entity_id=entity_id)


def _scoped_profiles(user):
    qs = ProductInventoryProfile.objects.select_related("product", "entity")
    if user.is_staff:
        return qs
    entity_id = getattr(user, "entity_id", None)
    if not entity_id:
        return qs.none()
    return qs.filter(entity_id=entity_id)


def _scoped_metrics(user):
    qs = InventoryMetricSnapshot.objects.select_related("entity")
    if user.is_staff:
        return qs
    entity_id = getattr(user, "entity_id", None)
    if not entity_id:
        return qs.none()
    return qs.filter(entity_id=entity_id)


# =====================================================================
# Inventory Overview
# =====================================================================

def get_inventory_overview(data, user):
    """
    Payload:
    {
        "action": "GetInventoryOverview",
        "as_of_date": "2026-09-15",     # optional, defaults to today
        "tier": "RETAILER"              # optional
    }

    Returns the latest InventoryMetricSnapshot for the caller's entity,
    plus 30-day trend.
    """
    as_of_date = _parse_date(data.get("as_of_date")) or date.today()
    tier_filter = data.get("tier")

    qs = _scoped_metrics(user).filter(snapshot_date=as_of_date)
    if tier_filter:
        qs = qs.filter(tier=tier_filter)

    latest = list(qs)

    # Last 30 days trend for sparklines
    since = as_of_date - timedelta(days=30)
    trend_qs = _scoped_metrics(user).filter(
        snapshot_date__gte=since,
        snapshot_date__lte=as_of_date,
    )
    if tier_filter:
        trend_qs = trend_qs.filter(tier=tier_filter)

    trend = list(
        trend_qs
        .order_by("snapshot_date")
        .values(
            "snapshot_date", "tier",
            "total_value_at_cost", "active_lot_count", "active_product_count",
        )
    )

    return {}, {
        "as_of_date": as_of_date.isoformat(),
        "latest": latest,
        "trend": trend,
    }


# =====================================================================
# Alerts
# =====================================================================

def get_alerts(data, user):
    """
    Payload:
    {
        "action": "GetAlerts",
        "status": "active" | "resolved" | "all",   # optional, default active
        "severity": "critical",                    # optional
        "alert_type": "expired",                   # optional
        "tier": "RETAILER",                        # optional
        "product_id": "<uuid>"                     # optional
    }
    """
    qs = _scoped_alerts(user)

    status = data.get("status", "active")
    if status == "active":
        qs = qs.filter(is_active=True)
    elif status == "resolved":
        qs = qs.filter(is_active=False)
    # else: all

    if data.get("severity"):
        qs = qs.filter(severity=data["severity"])
    if data.get("alert_type"):
        qs = qs.filter(alert_type=data["alert_type"])
    if data.get("tier"):
        qs = qs.filter(tier=data["tier"])
    if data.get("product_id"):
        qs = qs.filter(product_id=data["product_id"])

    return {}, qs.order_by("-severity", "-detected_at")


def get_alert_details(data, user):
    """
    Payload:
    {
        "action": "GetAlertDetails",
        "alert_id": "<uuid>"
    }
    """
    alert_id = data.get("alert_id")
    if not alert_id:
        return {"alert_id": "This field is required."}, None
    try:
        alert = _scoped_alerts(user).get(pk=alert_id)
    except InventoryAlert.DoesNotExist:
        return {"alert_id": "Alert not found."}, None
    return {}, alert


def acknowledge_alert(data, user):
    """
    Payload:
    {
        "action": "AcknowledgeAlert",
        "alert_id": "<uuid>"
    }
    """
    alert_id = data.get("alert_id")
    if not alert_id:
        return {"alert_id": "This field is required."}, None
    try:
        alert = _scoped_alerts(user).get(pk=alert_id)
    except InventoryAlert.DoesNotExist:
        return {"alert_id": "Alert not found."}, None

    alert.acknowledged_at = timezone.now()
    alert.acknowledged_by = user
    alert.save(update_fields=["acknowledged_at", "acknowledged_by", "updated_at"])
    return {}, alert


def resolve_alert(data, user):
    """
    Payload:
    {
        "action": "ResolveAlert",
        "alert_id": "<uuid>",
        "reason": "Handled"   # optional
    }
    """
    alert_id = data.get("alert_id")
    if not alert_id:
        return {"alert_id": "This field is required."}, None
    try:
        alert = _scoped_alerts(user).get(pk=alert_id)
    except InventoryAlert.DoesNotExist:
        return {"alert_id": "Alert not found."}, None

    alert.is_active = False
    alert.resolved_at = timezone.now()
    if data.get("reason"):
        ctx = alert.context or {}
        ctx["resolution_reason"] = data["reason"]
        alert.context = ctx
    alert.save(update_fields=["is_active", "resolved_at", "context", "updated_at"])
    return {}, alert


# =====================================================================
# Expiry risks
# =====================================================================

def get_expiry_risks(data, user):
    """
    Payload:
    {
        "action": "GetExpiryRisks",
        "as_of_date": "2026-09-15",       # optional
        "tier": "WHOLESALER",             # optional
        "min_probability": 0.5,           # optional, default 0.3
        "max_days_to_expiry": 90,         # optional
        "recommended_action": "discount"  # optional
    }
    """
    as_of_date = _parse_date(data.get("as_of_date")) or date.today()
    min_probability = float(data.get("min_probability", 0.3))

    qs = _scoped_expiry_risks(user).filter(
        as_of_date=as_of_date,
        expiry_probability__gte=min_probability,
    )
    if data.get("tier"):
        qs = qs.filter(tier=data["tier"])
    if data.get("max_days_to_expiry") is not None:
        qs = qs.filter(days_to_expiry__lte=int(data["max_days_to_expiry"]))
    if data.get("recommended_action"):
        qs = qs.filter(recommended_action=data["recommended_action"])

    return {}, qs.order_by("-expected_write_off_value", "days_to_expiry")


# =====================================================================
# Product profile
# =====================================================================

def get_product_profile(data, user):
    """
    Payload:
    {
        "action": "GetProductProfile",
        "product_id": "<uuid>",
        "as_of_date": "2026-09-15",   # optional
        "tier": "RETAILER"             # optional
    }
    """
    product_id = data.get("product_id")
    if not product_id:
        return {"product_id": "This field is required."}, None

    as_of_date = _parse_date(data.get("as_of_date")) or date.today()

    qs = _scoped_profiles(user).filter(
        product_id=product_id,
        as_of_date=as_of_date,
    )
    if data.get("tier"):
        qs = qs.filter(tier=data["tier"])

    profiles = list(qs)
    if not profiles:
        return {"product_id": "No profile found for this product on this date."}, None

    # Also include the underlying active lots for drill-down
    receipts = _scoped_snapshots(user).filter(
        product_id=product_id,
        snapshot_date=as_of_date,
    )
    if data.get("tier"):
        receipts = receipts.filter(tier=data["tier"])

    return {}, {
        "profiles": profiles,
        "lots": list(receipts.order_by("expiry_date", "days_to_expiry")),
    }


# =====================================================================
# Lots with expiring stock (drill-down view)
# =====================================================================

def get_expiring_lots(data, user):
    """
    Payload:
    {
        "action": "GetExpiringLots",
        "days": 30,                 # optional, default 30
        "tier": "RETAILER",         # optional
        "as_of_date": "2026-09-15"  # optional
    }
    """
    as_of_date = _parse_date(data.get("as_of_date")) or date.today()
    days = int(data.get("days", 30))

    qs = _scoped_snapshots(user).filter(
        snapshot_date=as_of_date,
        current_unit_quantity__gt=0,
        is_expired=False,
        is_expiring_soon=True,
        days_to_expiry__lte=days,
    )
    if data.get("tier"):
        qs = qs.filter(tier=data["tier"])

    return {}, qs.order_by("days_to_expiry")


# =====================================================================
# Campaign candidates
# =====================================================================

def get_campaign_candidates(data, user):
    """
    Payload:
    {
        "action": "GetCampaignCandidates",
        "as_of_date": "2026-09-15",     # optional
        "wholesaler_id": "<uuid>"       # optional — platform staff only
    }

    Returns ranked campaign candidates for a wholesaler, derived from
    the ExpiryRisk table. Only wholesalers have campaigns, so a
    retailer calling this gets an error.
    """
    as_of_date = _parse_date(data.get("as_of_date")) or date.today()

    # Resolve target wholesaler
    wholesaler_id = data.get("wholesaler_id")
    if wholesaler_id:
        if not user.is_staff:
            return {"wholesaler_id": "Only platform staff may specify a wholesaler."}, None
        try:
            wholesaler = Entities.objects.get(pk=wholesaler_id)
        except Entities.DoesNotExist:
            return {"wholesaler_id": "Wholesaler not found."}, None
    else:
        wholesaler = user.entity
        if not user.is_staff and wholesaler.entity_type not in (
            "GeneralWholesaler", "PharmaceuticalWholesaler",
        ):
            return {"detail": "Campaign candidates are only available for wholesalers."}, None

    candidates = suggest_campaign_candidates(wholesaler, as_of_date=as_of_date)
    return {}, {
        "wholesaler_id": str(wholesaler.id),
        "wholesaler_title": wholesaler.title,
        "as_of_date": as_of_date.isoformat(),
        "candidates": candidates,
    }


# =====================================================================
# Helpers
# =====================================================================

def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    from datetime import datetime
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None

# analytics/utils/inventory_utils.py — APPEND

from analytics.models import DemandForecast, ProductDemandProfile, ForecastAccuracy


def _scoped_demand_profiles(user):
    qs = ProductDemandProfile.objects.select_related("product", "entity")
    if user.is_staff:
        return qs
    entity_id = getattr(user, "entity_id", None)
    if not entity_id:
        return qs.none()
    return qs.filter(entity_id=entity_id)


def _scoped_forecasts(user):
    qs = DemandForecast.objects.select_related("product", "entity")
    if user.is_staff:
        return qs
    entity_id = getattr(user, "entity_id", None)
    if not entity_id:
        return qs.none()
    return qs.filter(entity_id=entity_id)


def _scoped_accuracies(user):
    qs = ForecastAccuracy.objects.select_related("product", "entity")
    if user.is_staff:
        return qs
    entity_id = getattr(user, "entity_id", None)
    if not entity_id:
        return qs.none()
    return qs.filter(entity_id=entity_id)


def get_demand_profile(data, user):
    """
    Payload:
    {
        "action": "GetDemandProfile",
        "tier": "RETAILER",             # optional
        "demand_pattern": "stable",     # optional
        "product_id": "<uuid>"          # optional
    }
    Returns the latest ProductDemandProfile per (entity, product, tier).
    """
    qs = _scoped_demand_profiles(user)

    if data.get("tier"):
        qs = qs.filter(tier=data["tier"])
    if data.get("demand_pattern"):
        qs = qs.filter(demand_pattern=data["demand_pattern"])
    if data.get("product_id"):
        qs = qs.filter(product_id=data["product_id"])

    # Latest as_of_date only
    latest = (
        qs.order_by("-as_of_date")
        .values_list("as_of_date", flat=True)
        .first()
    )
    if not latest:
        return {}, []

    return {}, qs.filter(as_of_date=latest).order_by("-avg_daily_demand")


def get_forecast(data, user):
    """
    Payload:
    {
        "action": "GetForecast",
        "product_id": "<uuid>",         # required
        "tier": "RETAILER",             # optional
        "horizon_days": 7,              # optional, max 28
        "run_date": "2026-09-15"        # optional, defaults to latest
    }
    """
    product_id = data.get("product_id")
    if not product_id:
        return {"product_id": "This field is required."}, None

    qs = _scoped_forecasts(user).filter(product_id=product_id)

    if data.get("tier"):
        qs = qs.filter(tier=data["tier"])

    # Latest run_date for this product
    run_date = _parse_date(data.get("run_date"))
    if not run_date:
        run_date = (
            qs.order_by("-run_date")
            .values_list("run_date", flat=True)
            .first()
        )
    if not run_date:
        return {"product_id": "No forecast available for this product."}, None

    qs = qs.filter(run_date=run_date)

    max_horizon = int(data.get("horizon_days", 28))
    qs = qs.filter(horizon_days__lte=max_horizon)

    return {}, {
        "product_id": str(product_id),
        "run_date": run_date.isoformat(),
        "forecasts": qs.order_by("horizon_days"),
    }


def get_forecast_accuracy(data, user):
    """
    Payload:
    {
        "action": "GetForecastAccuracy",
        "tier": "RETAILER",             # optional
        "model_name": "ses",            # optional
        "segment": "stable",            # optional
        "limit": 50                     # optional
    }
    """
    qs = _scoped_accuracies(user)

    if data.get("tier"):
        qs = qs.filter(tier=data["tier"])
    if data.get("model_name"):
        qs = qs.filter(model_name=data["model_name"])
    if data.get("segment"):
        qs = qs.filter(segment=data["segment"])

    latest = (
        qs.order_by("-period_end")
        .values_list("period_end", flat=True)
        .first()
    )
    if not latest:
        return {}, []

    limit = int(data.get("limit", 100))
    return {}, qs.filter(period_end=latest).order_by("-wape")[:limit]


def get_bulk_forecast_action(data, user):
    """
    Payload:
    {
        "action": "GetBulkForecast",
        "tier": "RETAILER",                    # optional, defaults to user's tier
        "lead_time_days": 7,                    # required
        "order_days": 14,                       # required
        "product_ids": ["<uuid>", ...],         # optional
        "min_avg_daily_demand": 0.5,            # optional
        "include_daily": true,                  # optional, default true
        "run_date": "2026-09-15"                # optional, defaults to latest
    }

    Only platform staff may pass entity_id explicitly. Everyone else
    gets their own entity's forecast.
    """
    tier = data.get("tier")
    if not tier:
        # Derive from the user's entity type
        from analytics.utils.domains import tier_of
        et = user.entity.entity_type if user.entity else None
        tier = tier_of(et) if et else None
    if tier not in ("WHOLESALER", "RETAILER"):
        return {"tier": "Could not determine tier. Pass tier explicitly."}, None

    try:
        lead_time_days = int(data.get("lead_time_days", 0))
        order_days = int(data.get("order_days", 0))
    except (TypeError, ValueError):
        return {"lead_time_days": "Must be an integer.", "order_days": "Must be an integer."}, None

    if lead_time_days <= 0:
        return {"lead_time_days": "Must be greater than zero."}, None
    if order_days <= 0:
        return {"order_days": "Must be greater than zero."}, None

    # Determine target entity
    entity_id = getattr(user, "entity_id", None)
    if data.get("entity_id"):
        if not user.is_staff:
            return {"entity_id": "Only platform staff may specify entity."}, None
        entity_id = data["entity_id"]

    if not entity_id:
        return {"entity_id": "No entity on user."}, None

    try:
        result = get_bulk_forecast(
            entity_id=entity_id,
            tier=tier,
            lead_time_days=lead_time_days,
            order_days=order_days,
            product_ids=data.get("product_ids"),
            min_avg_daily_demand=data.get("min_avg_daily_demand"),
            include_daily=data.get("include_daily", True),
            run_date=_parse_date(data.get("run_date")),
        )
    except Exception as e:
        return {"detail": str(e)}, None

    return {}, result