# analytics/serializers.py

from rest_framework import serializers

from analytics.models import (
    ExpiryRisk,
    InventoryAlert,
    InventoryMetricSnapshot,
    InventorySnapshot,
    ProductInventoryProfile,
)


# =====================================================================
# Snapshot
# =====================================================================

class InventorySnapshotSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    entity_title = serializers.CharField(source="entity.title", read_only=True)
    received_from_title = serializers.CharField(
        source="received_from_entity.title", read_only=True,
    )
    tier_display = serializers.CharField(source="get_tier_display", read_only=True)
    aging_bucket_display = serializers.CharField(
        source="get_aging_bucket_display", read_only=True,
    )

    class Meta:
        model = InventorySnapshot
        fields = [
            "id", "snapshot_date", "tier", "tier_display",
            "entity", "entity_title",
            "product", "product_title",
            "wholesaler_receipt", "retailer_receipt",
            "received_from_entity", "received_from_title",
            "batch",
            "received_unit_quantity", "current_unit_quantity",
            "reserved_unit_quantity", "consumed_unit_quantity",
            "units_per_pack",
            "unit_buying_price", "allocated_shipping_per_unit",
            "landed_unit_cost", "final_unit_selling_price",
            "lot_value_at_cost", "lot_value_at_sale",
            "potential_margin", "margin_pct",
            "manufacture_date", "expiry_date", "days_to_expiry",
            "age_days", "shelf_life_days",
            "is_expired", "is_expiring_soon",
            "aging_bucket", "aging_bucket_display",
            "in_placement", "is_active",
            "created",
        ]
        read_only_fields = fields


class InventorySnapshotListSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    entity_title = serializers.CharField(source="entity.title", read_only=True)

    class Meta:
        model = InventorySnapshot
        fields = [
            "id", "snapshot_date", "tier",
            "entity", "entity_title",
            "product", "product_title",
            "batch", "current_unit_quantity",
            "lot_value_at_cost", "lot_value_at_sale",
            "expiry_date", "days_to_expiry",
            "is_expired", "is_expiring_soon",
            "aging_bucket",
        ]
        read_only_fields = fields


# =====================================================================
# ProductInventoryProfile
# =====================================================================

class ProductInventoryProfileSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    entity_title = serializers.CharField(source="entity.title", read_only=True)

    class Meta:
        model = ProductInventoryProfile
        fields = [
            "id", "as_of_date", "tier",
            "entity", "entity_title",
            "product", "product_title",
            "total_on_hand_units", "total_reserved_units",
            "active_lot_count",
            "oldest_lot_age_days", "nearest_expiry_days",
            "total_value_at_cost", "total_value_at_sale",
            "total_potential_margin", "avg_margin_pct",
            "value_owned_at_cost", "value_placement_at_cost",
            "value_expiring_30d", "value_expiring_90d",
            "value_expired", "value_dead_stock",
            "abc_class", "xyz_class",
            "computed_at",
        ]
        read_only_fields = fields


# =====================================================================
# InventoryMetricSnapshot
# =====================================================================

class InventoryMetricSnapshotSerializer(serializers.ModelSerializer):
    entity_title = serializers.CharField(source="entity.title", read_only=True)

    class Meta:
        model = InventoryMetricSnapshot
        fields = [
            "id", "snapshot_date", "tier",
            "entity", "entity_title",
            "active_lot_count", "active_product_count",
            "expired_lot_count", "expiring_soon_lot_count",
            "total_value_at_cost", "total_value_at_sale",
            "total_potential_margin",
            "value_expiring_30d", "value_expiring_60d", "value_expiring_90d",
            "value_expired", "value_dead_stock",
            "value_fresh", "value_normal", "value_aging",
            "value_slow", "value_dead",
            "computed_at",
        ]
        read_only_fields = fields


# =====================================================================
# InventoryAlert
# =====================================================================

class InventoryAlertSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    entity_title = serializers.CharField(source="entity.title", read_only=True)
    alert_type_display = serializers.CharField(
        source="get_alert_type_display", read_only=True,
    )
    severity_display = serializers.CharField(
        source="get_severity_display", read_only=True,
    )
    acknowledged_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = InventoryAlert
        fields = [
            "id", "tier",
            "entity", "entity_title",
            "product", "product_title",
            "wholesaler_receipt", "retailer_receipt",
            "alert_type", "alert_type_display",
            "severity", "severity_display",
            "title", "message", "context",
            "is_active",
            "acknowledged_at", "acknowledged_by", "acknowledged_by_name",
            "resolved_at",
            "detected_at", "updated_at",
        ]
        read_only_fields = fields

    def get_acknowledged_by_name(self, obj):
        if obj.acknowledged_by:
            return f"{obj.acknowledged_by.first_name} {obj.acknowledged_by.last_name}".strip()
        return None


class InventoryAlertListSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    alert_type_display = serializers.CharField(
        source="get_alert_type_display", read_only=True,
    )
    severity_display = serializers.CharField(
        source="get_severity_display", read_only=True,
    )

    class Meta:
        model = InventoryAlert
        fields = [
            "id", "tier",
            "entity", "product", "product_title",
            "alert_type", "alert_type_display",
            "severity", "severity_display",
            "title",
            "is_active", "detected_at",
        ]
        read_only_fields = fields


# =====================================================================
# ExpiryRisk
# =====================================================================

class ExpiryRiskSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    entity_title = serializers.CharField(source="entity.title", read_only=True)
    recommended_action_display = serializers.CharField(
        source="get_recommended_action_display", read_only=True,
    )

    class Meta:
        model = ExpiryRisk
        fields = [
            "id", "as_of_date", "tier",
            "entity", "entity_title",
            "wholesaler_receipt", "retailer_receipt",
            "product", "product_title",
            "days_to_expiry", "current_quantity", "current_value_at_cost",
            "expected_sell_through_before_expiry",
            "expected_unsold_quantity",
            "expected_write_off_value",
            "expiry_probability",
            "recommended_action", "recommended_action_display",
            "computed_at",
        ]
        read_only_fields = fields


class ExpiryRiskListSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    recommended_action_display = serializers.CharField(
        source="get_recommended_action_display", read_only=True,
    )

    class Meta:
        model = ExpiryRisk
        fields = [
            "id", "as_of_date", "tier",
            "entity", "product", "product_title",
            "days_to_expiry", "current_quantity",
            "expected_unsold_quantity", "expected_write_off_value",
            "expiry_probability",
            "recommended_action", "recommended_action_display",
        ]
        read_only_fields = fields

# analytics/serializers.py — APPEND

from analytics.models import DemandForecast, ProductDemandProfile, ForecastAccuracy


class ProductDemandProfileSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    entity_title = serializers.CharField(source="entity.title", read_only=True)

    class Meta:
        model = ProductDemandProfile
        fields = [
            "id", "as_of_date", "tier",
            "entity", "entity_title",
            "product", "product_title",
            "avg_daily_demand", "demand_std", "demand_cv",
            "demand_interval_days", "zero_demand_pct",
            "total_demand_30d", "total_demand_90d", "max_daily_demand",
            "trend_direction", "trend_pct",
            "weekly_seasonality", "monthly_seasonality",
            "demand_pattern", "history_days",
            "computed_at",
        ]
        read_only_fields = fields


class DemandForecastSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)

    class Meta:
        model = DemandForecast
        fields = [
            "id", "run_date", "forecast_date", "horizon_days",
            "tier", "entity", "product", "product_title",
            "point_forecast", "p10", "p50", "p90",
            "model_name", "model_version", "segment",
            "created",
        ]
        read_only_fields = fields


class ForecastAccuracySerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)

    class Meta:
        model = ForecastAccuracy
        fields = [
            "id", "period_start", "period_end", "tier",
            "entity", "product", "product_title",
            "model_name", "segment",
            "wape", "mape", "bias", "mae",
            "n_observations", "actual_total", "forecast_total",
            "computed_at",
        ]
        read_only_fields = fields