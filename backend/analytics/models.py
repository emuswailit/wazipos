# analytics/models.py

from decimal import Decimal

from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError

from authentication.models import Users
from products.models import Products
from core.models import EntityRelatedModel


# =====================================================================
# InventorySnapshot
# =====================================================================

class InventorySnapshot(EntityRelatedModel):
    """
    Daily snapshot of a lot. The atomic unit of inventory analytics.

    Tier invariant:
      - Wholesaler snapshots come from WholesalerReceipts (tier=WHOLESALER).
      - Retailer snapshots come from RetailerReceipts (tier=RETAILER).
      Exactly one of the two receipt FKs is populated.

    The owning entity (`self.entity`) is the entity that holds the stock:
      - tier=WHOLESALER → entity is the wholesaler's entity
      - tier=RETAILER   → entity is the retailer's entity

    Idempotent by design: rerunning for the same date replaces all rows
    for that date (delete + bulk_create in the service layer).
    """

    TIER_CHOICES = (
        ("WHOLESALER", "WHOLESALER"),
        ("RETAILER", "RETAILER"),
    )

    AGING_BUCKETS = (
        ("fresh", "Fresh (0-30d)"),
        ("normal", "Normal (31-90d)"),
        ("aging", "Aging (91-180d)"),
        ("slow", "Slow (181-365d)"),
        ("dead", "Dead (>365d)"),
    )

    snapshot_date = models.DateField(db_index=True)

    # Two possible receipt sources — exactly one populated per row
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)
    wholesaler_receipt = models.ForeignKey(
        "wholesalers.WholesalerReceipts",
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="analytics_snapshots",
    )
    retailer_receipt = models.ForeignKey(
        "retailers.RetailerReceipts",
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="analytics_snapshots",
    )

    # Denormalized for fast filtering
    product = models.ForeignKey(
        Products,
        on_delete=models.CASCADE,
        related_name="analytics_snapshots",
    )
    received_from_entity = models.ForeignKey(
        "authentication.Entities",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="supplied_analytics_snapshots",
    )
    batch = models.CharField(max_length=50, null=True, blank=True)

    # Quantities
    received_unit_quantity = models.BigIntegerField(default=0)
    current_unit_quantity = models.BigIntegerField(default=0)
    reserved_unit_quantity = models.BigIntegerField(default=0)
    consumed_unit_quantity = models.BigIntegerField(default=0)
    units_per_pack = models.IntegerField(null=True, blank=True)

    # Financial
    unit_buying_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00"),
    )
    allocated_shipping_per_unit = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00"),
    )
    landed_unit_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00"),
    )
    final_unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00"),
    )
    lot_value_at_cost = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00"),
    )
    lot_value_at_sale = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00"),
    )
    potential_margin = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00"),
    )
    margin_pct = models.FloatField(null=True, blank=True)

    # Expiry
    manufacture_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True, db_index=True)
    days_to_expiry = models.IntegerField(null=True, blank=True, db_index=True)
    age_days = models.IntegerField(null=True, blank=True)
    shelf_life_days = models.IntegerField(null=True, blank=True)
    is_expired = models.BooleanField(default=False, db_index=True)
    is_expiring_soon = models.BooleanField(default=False, db_index=True)
    aging_bucket = models.CharField(
        max_length=20, choices=AGING_BUCKETS,
        null=True, blank=True, db_index=True,
    )

    # Placement (retail only)
    in_placement = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Inventory Snapshots"
        indexes = [
            models.Index(fields=["snapshot_date", "tier"]),
            models.Index(fields=["entity", "snapshot_date"]),
            models.Index(fields=["entity", "product", "snapshot_date"]),
            models.Index(fields=["snapshot_date", "is_expired"]),
            models.Index(fields=["snapshot_date", "is_expiring_soon"]),
            models.Index(fields=["snapshot_date", "aging_bucket"]),
        ]

    def __str__(self):
        source = self.wholesaler_receipt_id or self.retailer_receipt_id
        return f"{self.snapshot_date} {self.tier} {self.product_id} ({source})"

    def clean(self):
        super().clean()
        errors = {}

        has_ws = self.wholesaler_receipt_id is not None
        has_rt = self.retailer_receipt_id is not None

        if has_ws and has_rt:
            errors["wholesaler_receipt"] = (
                "A snapshot cannot reference both a wholesaler and a retailer receipt."
            )
        if not has_ws and not has_rt:
            errors["wholesaler_receipt"] = (
                "A snapshot must reference either a wholesaler or a retailer receipt."
            )

        if has_ws and self.tier != "WHOLESALER":
            errors["tier"] = "Tier must be WHOLESALER when wholesaler_receipt is set."
        if has_rt and self.tier != "RETAILER":
            errors["tier"] = "Tier must be RETAILER when retailer_receipt is set."

        if errors:
            raise ValidationError(errors)


# =====================================================================
# ProductInventoryProfile
# =====================================================================

class ProductInventoryProfile(EntityRelatedModel):
    """
    Per (entity, product, tier, as_of_date) aggregated inventory profile.

    Rolled up from InventorySnapshot. Dashboard queries hit this instead
    of aggregating raw snapshots.
    """

    TIER_CHOICES = (
        ("WHOLESALER", "WHOLESALER"),
        ("RETAILER", "RETAILER"),
    )

    ABC_CLASSES = (("A", "A"), ("B", "B"), ("C", "C"))
    XYZ_CLASSES = (("X", "X"), ("Y", "Y"), ("Z", "Z"))

    as_of_date = models.DateField(db_index=True)
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)
    product = models.ForeignKey(
        Products,
        on_delete=models.CASCADE,
        related_name="inventory_profiles",
    )

    # Position
    total_on_hand_units = models.BigIntegerField(default=0)
    total_reserved_units = models.BigIntegerField(default=0)
    active_lot_count = models.IntegerField(default=0)
    oldest_lot_age_days = models.IntegerField(null=True, blank=True)
    nearest_expiry_days = models.IntegerField(null=True, blank=True)

    # Value
    total_value_at_cost = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )
    total_value_at_sale = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )
    total_potential_margin = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )
    avg_margin_pct = models.FloatField(null=True, blank=True)

    # Placement split (retail only; zero for wholesaler rows)
    value_owned_at_cost = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )
    value_placement_at_cost = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )

    # Risk buckets
    value_expiring_30d = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )
    value_expiring_90d = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )
    value_expired = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )
    value_dead_stock = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )

    # Classification
    abc_class = models.CharField(
        max_length=1, choices=ABC_CLASSES, null=True, blank=True,
    )
    xyz_class = models.CharField(
        max_length=1, choices=XYZ_CLASSES, null=True, blank=True,
    )

    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Product Inventory Profiles"
        indexes = [
            models.Index(fields=["entity", "as_of_date", "tier"]),
            models.Index(fields=["entity", "tier", "abc_class"]),
            models.Index(fields=["entity", "tier", "xyz_class"]),
            models.Index(fields=["product", "as_of_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["entity", "product", "tier", "as_of_date"],
                name="unique_product_profile_per_day",
            ),
        ]

    def __str__(self):
        return f"{self.as_of_date} {self.tier} {self.product_id} @ {self.entity_id}"


# =====================================================================
# InventoryMetricSnapshot
# =====================================================================

class InventoryMetricSnapshot(EntityRelatedModel):
    """
    Entity-level aggregate. One row per (entity, tier, snapshot_date).
    Fast dashboard reads without touching snapshot-level data.
    """

    TIER_CHOICES = (
        ("WHOLESALER", "WHOLESALER"),
        ("RETAILER", "RETAILER"),
    )

    snapshot_date = models.DateField(db_index=True)
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)

    # Counts
    active_lot_count = models.IntegerField(default=0)
    active_product_count = models.IntegerField(default=0)
    expired_lot_count = models.IntegerField(default=0)
    expiring_soon_lot_count = models.IntegerField(default=0)

    # Values
    total_value_at_cost = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    total_value_at_sale = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    total_potential_margin = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )

    # Risk buckets
    value_expiring_30d = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    value_expiring_60d = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    value_expiring_90d = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    value_expired = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    value_dead_stock = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )

    # Aging distribution at cost
    value_fresh = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    value_normal = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    value_aging = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    value_slow = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )
    value_dead = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal("0.00"),
    )

    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Inventory Metric Snapshots"
        indexes = [
            models.Index(fields=["entity", "snapshot_date"]),
            models.Index(fields=["entity", "tier", "snapshot_date"]),
            models.Index(fields=["snapshot_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["entity", "tier", "snapshot_date"],
                name="unique_metric_snapshot_per_day",
            ),
        ]

    def __str__(self):
        return f"{self.snapshot_date} {self.tier} @ {self.entity_id}"


# =====================================================================
# InventoryAlert
# =====================================================================

class InventoryAlert(EntityRelatedModel):
    """
    Actionable inventory alert. Generated by the analytics pipeline,
    consumed by WebSocket clients and REST reads.
    """

    TIER_CHOICES = (
        ("WHOLESALER", "WHOLESALER"),
        ("RETAILER", "RETAILER"),
    )

    ALERT_TYPES = (
        ("stockout", "Stockout"),
        ("low_stock", "Low stock"),
        ("overstock", "Overstock"),
        ("slow_moving", "Slow moving"),
        ("dead_stock", "Dead stock"),
        ("expiring_soon", "Expiring soon"),
        ("expired", "Expired"),
        ("ghost_stock", "Ghost stock"),
        ("negative_stock", "Negative stock"),
        ("mismatch", "Ledger mismatch"),
        ("policy_violation", "Product not allowed for entity type"),
    )

    SEVERITY_LEVELS = (
        ("info", "Info"),
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("critical", "Critical"),
    )

    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)
    product = models.ForeignKey(
        Products,
        on_delete=models.CASCADE,
        related_name="inventory_alerts",
    )
    wholesaler_receipt = models.ForeignKey(
        "wholesalers.WholesalerReceipts",
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="analytics_alerts",
    )
    retailer_receipt = models.ForeignKey(
        "retailers.RetailerReceipts",
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="analytics_alerts",
    )

    alert_type = models.CharField(
        max_length=30, choices=ALERT_TYPES, db_index=True,
    )
    severity = models.CharField(
        max_length=20, choices=SEVERITY_LEVELS, db_index=True,
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    context = models.JSONField(
        default=dict,
        help_text="Numeric payload: quantities, values, thresholds.",
    )

    is_active = models.BooleanField(default=True, db_index=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(
        Users,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="acknowledged_inventory_alerts",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    detected_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Inventory Alerts"
        indexes = [
            models.Index(fields=["entity", "is_active", "severity"]),
            models.Index(fields=["entity", "alert_type", "is_active"]),
            models.Index(fields=["detected_at"]),
            models.Index(fields=["entity", "tier", "alert_type"]),
        ]

    def __str__(self):
        return f"{self.alert_type} [{self.severity}] {self.entity_id}"


# =====================================================================
# ExpiryRisk
# =====================================================================

class ExpiryRisk(EntityRelatedModel):
    """
    Per-lot expiry risk. Refreshed daily.

    Predicts how much of a lot will sell through before expiry,
    and what value is at risk of becoming a write-off.
    """

    TIER_CHOICES = (
        ("WHOLESALER", "WHOLESALER"),
        ("RETAILER", "RETAILER"),
    )

    RECOMMENDED_ACTIONS = (
        ("none", "No action"),
        ("monitor", "Monitor"),
        ("discount", "Discount to accelerate"),
        ("transfer", "Transfer to faster mover"),
        ("promote", "Promote"),
        ("return", "Return to supplier"),
        ("write_off", "Accept write-off"),
    )

    as_of_date = models.DateField(db_index=True)
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)

    wholesaler_receipt = models.ForeignKey(
        "wholesalers.WholesalerReceipts",
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="analytics_expiry_risks",
    )
    retailer_receipt = models.ForeignKey(
        "retailers.RetailerReceipts",
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="analytics_expiry_risks",
    )
    product = models.ForeignKey(
        Products,
        on_delete=models.CASCADE,
        related_name="analytics_expiry_risks",
    )

    days_to_expiry = models.IntegerField(db_index=True)
    current_quantity = models.BigIntegerField()
    current_value_at_cost = models.DecimalField(
        max_digits=14, decimal_places=2,
    )

    expected_sell_through_before_expiry = models.FloatField(null=True, blank=True)
    expected_unsold_quantity = models.FloatField(null=True, blank=True)
    expected_write_off_value = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
    )
    expiry_probability = models.FloatField(
        help_text="Probability the lot expires with unsold stock (0-1)",
    )

    recommended_action = models.CharField(
        max_length=30, choices=RECOMMENDED_ACTIONS, default="none",
    )

    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Expiry Risks"
        indexes = [
            models.Index(fields=["entity", "as_of_date"]),
            models.Index(fields=["as_of_date", "expiry_probability"]),
            models.Index(fields=["entity", "tier", "as_of_date"]),
        ]

    def __str__(self):
        return f"{self.as_of_date} {self.tier} {self.product_id} risk={self.expiry_probability:.2f}"

    def clean(self):
        super().clean()
        errors = {}
        has_ws = self.wholesaler_receipt_id is not None
        has_rt = self.retailer_receipt_id is not None

        if has_ws and has_rt:
            errors["wholesaler_receipt"] = (
                "ExpiryRisk cannot reference both a wholesaler and a retailer receipt."
            )
        if not has_ws and not has_rt:
            errors["wholesaler_receipt"] = (
                "ExpiryRisk must reference either a wholesaler or a retailer receipt."
            )
        if has_ws and self.tier != "WHOLESALER":
            errors["tier"] = "Tier must be WHOLESALER when wholesaler_receipt is set."
        if has_rt and self.tier != "RETAILER":
            errors["tier"] = "Tier must be RETAILER when retailer_receipt is set."

        if errors:
            raise ValidationError(errors)

# analytics/models.py — APPEND

# =====================================================================
# DemandFact
# =====================================================================

class DemandFact(EntityRelatedModel):
    """
    Daily demand fact per (seller entity, product, tier, date).

    `entity` is the SELLER — the party whose demand history we track.
    `buyer_entity` is the counterparty (nullable for direct customer sales).

    One row per (entity, product, tier, fact_date, source_type).
    The unique constraint allows multiple source types on the same
    day for the same product (e.g., a customer sale AND a return).
    """

    TIER_CHOICES = (
        ("WHOLESALER", "WHOLESALER"),
        ("RETAILER", "RETAILER"),
    )

    SOURCE_TYPE_CHOICES = (
        ("order", "Order-driven"),
        ("direct_receipt", "Direct receipt"),
        ("customer_sale", "Customer sale"),
        ("sales_return", "Sales return"),
        ("wholesaler_return", "Wholesaler return"),
        ("adjustment", "Stock adjustment"),
    )

    fact_date = models.DateField(db_index=True)
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)
    source_type = models.CharField(
        max_length=20, choices=SOURCE_TYPE_CHOICES, db_index=True,
    )
    product = models.ForeignKey(
        Products,
        on_delete=models.CASCADE,
        related_name="demand_facts",
    )
    buyer_entity = models.ForeignKey(
        "authentication.Entities",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="demand_facts_as_buyer",
    )
    batch = models.CharField(max_length=50, null=True, blank=True)

    # Quantities
    quantity = models.DecimalField(
        max_digits=14, decimal_places=4,
        help_text="Net demand. Positive for sales, negative for returns.",
    )
    gross_quantity = models.DecimalField(
        max_digits=14, decimal_places=4, default=Decimal("0.0000"),
        help_text="Gross units in this fact (before any netting).",
    )
    return_quantity = models.DecimalField(
        max_digits=14, decimal_places=4, default=Decimal("0.0000"),
        help_text="Units that were returned in this fact.",
    )

    # Financials
    gross_revenue = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )
    net_revenue = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal("0.00"),
    )
    unit_price_avg = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
    )

    # Provenance
    order_line_count = models.IntegerField(default=0)
    source_refs = models.JSONField(
        default=list, blank=True,
        help_text="Optional list of source UUIDs (order item IDs, etc.)",
    )

    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Demand Facts"
        indexes = [
            models.Index(fields=["entity", "tier", "product", "fact_date"]),
            models.Index(fields=["product", "fact_date"]),
            models.Index(fields=["fact_date", "tier"]),
            models.Index(fields=["source_type", "fact_date"]),
            models.Index(fields=["buyer_entity", "fact_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["entity", "product", "tier", "fact_date", "source_type"],
                name="unique_demand_fact_per_day",
            ),
        ]

    def __str__(self):
        return f"{self.fact_date} {self.tier} {self.source_type} {self.product_id} ({self.quantity})"


# =====================================================================
# ProductDemandProfile
# =====================================================================

class ProductDemandProfile(EntityRelatedModel):
    """
    Per (entity, product, tier) demand statistics, refreshed on demand
    or weekly from DemandFact history.

    Demand pattern classification:
        stable        — low CV, no strong trend
        trending_up   — recent window mean >> earlier window mean
        trending_down — recent window mean << earlier window mean
        seasonal      — weekly/monthly seasonality detected
        intermittent  — >30% zero-demand days
        erratic       — high CV (>0.75)
        new           — insufficient history (< MIN_HISTORY_DAYS)
    """

    TIER_CHOICES = (
        ("WHOLESALER", "WHOLESALER"),
        ("RETAILER", "RETAILER"),
    )

    PATTERN_CHOICES = (
        ("stable", "Stable"),
        ("trending_up", "Trending up"),
        ("trending_down", "Trending down"),
        ("seasonal", "Seasonal"),
        ("intermittent", "Intermittent"),
        ("erratic", "Erratic"),
        ("new", "New (insufficient history)"),
    )

    as_of_date = models.DateField(db_index=True)
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)
    product = models.ForeignKey(
        Products,
        on_delete=models.CASCADE,
        related_name="demand_profiles",
    )

    # Core statistics
    avg_daily_demand = models.FloatField(null=True, blank=True)
    demand_std = models.FloatField(null=True, blank=True)
    demand_cv = models.FloatField(null=True, blank=True)
    demand_interval_days = models.FloatField(null=True, blank=True)
    zero_demand_pct = models.FloatField(null=True, blank=True)

    # Magnitude
    total_demand_30d = models.FloatField(null=True, blank=True)
    total_demand_90d = models.FloatField(null=True, blank=True)
    max_daily_demand = models.FloatField(null=True, blank=True)

    # Trend
    trend_direction = models.CharField(max_length=20, null=True, blank=True)
    trend_pct = models.FloatField(null=True, blank=True)

    # Seasonality (day-of-week averages, month averages)
    weekly_seasonality = models.JSONField(default=dict, blank=True)
    monthly_seasonality = models.JSONField(default=dict, blank=True)

    # Classification
    demand_pattern = models.CharField(
        max_length=20, choices=PATTERN_CHOICES, default="new",
    )
    history_days = models.IntegerField(default=0)

    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Product Demand Profiles"
        constraints = [
            models.UniqueConstraint(
                fields=["entity", "product", "tier", "as_of_date"],
                name="unique_demand_profile_per_day",
            ),
        ]
        indexes = [
            models.Index(fields=["entity", "tier", "as_of_date"]),
            models.Index(fields=["product", "as_of_date"]),
            models.Index(fields=["demand_pattern"]),
        ]

    def __str__(self):
        return f"{self.as_of_date} {self.tier} {self.product_id} ({self.demand_pattern})"

# analytics/models.py — APPEND

# =====================================================================
# DemandForecast
# =====================================================================

class DemandForecast(EntityRelatedModel):
    """
    A demand forecast for a specific (entity, product, tier) on a
    specific future date.

    One row per (entity, product, tier, forecast_date, run_date).
    The `run_date` distinguishes forecasts made at different points
    in time, enabling forecast-vs-actual comparisons.

    Quantiles:
        p10 — pessimistic (10th percentile)
        p50 — median
        p90 — optimistic (90th percentile)
    """

    TIER_CHOICES = (
        ("WHOLESALER", "WHOLESALER"),
        ("RETAILER", "RETAILER"),
    )

    run_date = models.DateField(
        db_index=True,
        help_text="When this forecast was generated.",
    )
    forecast_date = models.DateField(
        db_index=True,
        help_text="The future date being forecast.",
    )
    horizon_days = models.IntegerField(
        help_text="Days ahead of run_date this forecast covers.",
    )
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)
    product = models.ForeignKey(
        Products,
        on_delete=models.CASCADE,
        related_name="demand_forecasts",
    )

    # Point + intervals
    point_forecast = models.FloatField()
    p10 = models.FloatField(null=True, blank=True)
    p50 = models.FloatField(null=True, blank=True)
    p90 = models.FloatField(null=True, blank=True)

    # Which model produced this
    model_name = models.CharField(max_length=50)
    model_version = models.CharField(max_length=20, default="1.0")
    segment = models.CharField(max_length=20)  # the demand_pattern

    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Demand Forecasts"
        constraints = [
            models.UniqueConstraint(
                fields=["entity", "product", "tier", "forecast_date", "run_date"],
                name="unique_demand_forecast_per_date",
            ),
        ]
        indexes = [
            models.Index(fields=["entity", "tier", "product", "run_date"]),
            models.Index(fields=["forecast_date"]),
            models.Index(fields=["run_date", "horizon_days"]),
        ]

    def __str__(self):
        return (
            f"{self.run_date}+{self.horizon_days}d → "
            f"{self.forecast_date} {self.product_id} = {self.point_forecast:.2f}"
        )


# =====================================================================
# ForecastAccuracy
# =====================================================================

class ForecastAccuracy(EntityRelatedModel):
    """
    Backtest result. How well did the model do at predicting what
    actually happened?

    Populated by the backtest service after forecasts age out and
    actual demand becomes known.
    """

    TIER_CHOICES = (
        ("WHOLESALER", "WHOLESALER"),
        ("RETAILER", "RETAILER"),
    )

    period_start = models.DateField(db_index=True)
    period_end = models.DateField(db_index=True)
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)
    product = models.ForeignKey(
        Products,
        on_delete=models.CASCADE,
        related_name="forecast_accuracies",
    )

    model_name = models.CharField(max_length=50)
    segment = models.CharField(max_length=20)

    # Standard forecast metrics
    wape = models.FloatField(
        help_text="Weighted absolute percentage error.",
    )
    mape = models.FloatField(null=True, blank=True)
    bias = models.FloatField(
        help_text="Mean signed error; positive = over-forecast.",
    )
    mae = models.FloatField(
        help_text="Mean absolute error.",
    )

    n_observations = models.IntegerField()
    actual_total = models.FloatField(
        help_text="Sum of actual demand over the period.",
    )
    forecast_total = models.FloatField(
        help_text="Sum of forecast demand over the period.",
    )

    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Forecast Accuracies"
        indexes = [
            models.Index(fields=["entity", "tier", "product", "period_end"]),
            models.Index(fields=["model_name", "period_end"]),
            models.Index(fields=["segment", "period_end"]),
        ]

    def __str__(self):
        return f"{self.period_end} {self.product_id} WAPE={self.wape:.3f}"