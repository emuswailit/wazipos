# analytics/services/__init__.py

from analytics.services.snapshot import build_daily_snapshot
from analytics.services.profile import build_product_profiles
from analytics.services.metrics import build_entity_metrics
from analytics.services.alerts import detect_inventory_alerts
from analytics.services.expiry_risk import compute_expiry_risks
from analytics.services.campaign_advisor import suggest_campaign_candidates
from analytics.services.classification import classify_products
from analytics.services.demand_extract import extract_daily_demand
from analytics.services.demand_profile import build_demand_profiles
from analytics.services.forecast import build_forecasts

__all__ = [
    "build_daily_snapshot",
    "build_product_profiles",
    "build_entity_metrics",
    "detect_inventory_alerts",
    "compute_expiry_risks",
    "suggest_campaign_candidates",
    "classify_products",
    "extract_daily_demand",
    "build_demand_profiles",
    "build_forecasts",
]