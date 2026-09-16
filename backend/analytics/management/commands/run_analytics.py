# analytics/management/commands/run_analytics.py — the two dicts

from analytics.services import (
    build_daily_snapshot,
    build_product_profiles,
    build_entity_metrics,
    detect_inventory_alerts,
    compute_expiry_risks,
    classify_products,
    extract_daily_demand,
    build_demand_profiles,
    build_forecasts,
    backtest_forecasts
    
)

STAGES = {
    "snapshot":       build_daily_snapshot,
    "profile":        build_product_profiles,
    "metrics":        build_entity_metrics,
    "alerts":         detect_inventory_alerts,
    "expiry":         compute_expiry_risks,
    "classification": classify_products,
    "demand_extract": extract_daily_demand,
    "demand_profile": build_demand_profiles,
    "forecast":       build_forecasts,
    "backtest":       backtest_forecasts,
}

PIPELINE_ORDER = [
    "snapshot", "profile", "metrics",
    "alerts", "expiry", "classification",
    "demand_extract", "demand_profile", "forecast", "backtest",
]