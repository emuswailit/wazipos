# analytics/admin.py

from django.contrib import admin

from analytics.models import (
    InventorySnapshot,
    ProductInventoryProfile,
    InventoryMetricSnapshot,
    InventoryAlert,
    ExpiryRisk,
)


# =====================================================================
# InventorySnapshot
# =====================================================================

@admin.register(InventorySnapshot)
class InventorySnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "snapshot_date", "tier", "entity", "product",
        "batch", "current_unit_quantity",
        "lot_value_at_cost", "days_to_expiry", "aging_bucket",
    )
    list_filter = (
        "snapshot_date", "tier",
        "is_expired", "is_expiring_soon", "aging_bucket",
    )
    search_fields = (
        "product__title", "entity__title", "batch",
    )
    date_hierarchy = "snapshot_date"
    readonly_fields = ("created",)
    autocomplete_fields = ("product", "entity", "received_from_entity")

    def has_add_permission(self, request):
        # Snapshots are pipeline-generated — never created by hand
        return False

    def has_change_permission(self, request, obj=None):
        # Read-only
        return False


# =====================================================================
# ProductInventoryProfile
# =====================================================================

@admin.register(ProductInventoryProfile)
class ProductInventoryProfileAdmin(admin.ModelAdmin):
    list_display = (
        "as_of_date", "tier", "entity", "product",
        "total_on_hand_units", "total_value_at_cost",
        "value_expiring_30d", "value_dead_stock",
        "abc_class", "xyz_class",
    )
    list_filter = (
        "as_of_date", "tier",
        "abc_class", "xyz_class",
    )
    search_fields = ("product__title", "entity__title")
    date_hierarchy = "as_of_date"
    readonly_fields = ("computed_at",)
    autocomplete_fields = ("product", "entity")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


# =====================================================================
# InventoryMetricSnapshot
# =====================================================================

@admin.register(InventoryMetricSnapshot)
class InventoryMetricSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "snapshot_date", "tier", "entity",
        "active_product_count", "active_lot_count",
        "total_value_at_cost", "value_expiring_30d",
        "value_expired", "value_dead_stock",
    )
    list_filter = ("snapshot_date", "tier")
    search_fields = ("entity__title",)
    date_hierarchy = "snapshot_date"
    readonly_fields = ("computed_at",)
    autocomplete_fields = ("entity",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


# =====================================================================
# InventoryAlert
# =====================================================================

@admin.register(InventoryAlert)
class InventoryAlertAdmin(admin.ModelAdmin):
    list_display = (
        "detected_at", "tier", "entity", "product",
        "alert_type", "severity", "is_active",
        "acknowledged_at",
    )
    list_filter = (
        "alert_type", "severity", "is_active", "tier",
        "detected_at",
    )
    search_fields = (
        "product__title", "entity__title", "title", "message",
    )
    date_hierarchy = "detected_at"
    readonly_fields = (
        "detected_at", "updated_at",
        "wholesaler_receipt", "retailer_receipt",
    )
    autocomplete_fields = ("product", "entity")

    # Alerts can be acknowledged/resolved in admin
    fieldsets = (
        ("Identity", {
            "fields": ("entity", "tier", "product",
                       "wholesaler_receipt", "retailer_receipt"),
        }),
        ("Alert", {
            "fields": ("alert_type", "severity", "title",
                       "message", "context"),
        }),
        ("State", {
            "fields": ("is_active", "acknowledged_at",
                       "acknowledged_by", "resolved_at"),
        }),
        ("Timestamps", {
            "fields": ("detected_at", "updated_at"),
        }),
    )


# =====================================================================
# ExpiryRisk
# =====================================================================

@admin.register(ExpiryRisk)
class ExpiryRiskAdmin(admin.ModelAdmin):
    list_display = (
        "as_of_date", "tier", "entity", "product",
        "days_to_expiry", "current_quantity",
        "expiry_probability", "expected_write_off_value",
        "recommended_action",
    )
    list_filter = (
        "as_of_date", "tier",
        "recommended_action",
    )
    search_fields = ("product__title", "entity__title")
    date_hierarchy = "as_of_date"
    readonly_fields = ("computed_at",)
    autocomplete_fields = ("product", "entity")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False