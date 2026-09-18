from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db.models.fields.related import ManyToManyField
from django.db import models
from authentication.models import  Entities, Countries,Counties, Constituencies, DocumentNumbers,Dependants
from wholesalers.models import WholesalerReceipts,WholesalerPriceDiscounts,WholesalerQuantityDiscounts
from django.contrib.gis.db import models as geomodel
from entitylocations.models import BodaLocations
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django_advance_thumbnail import AdvanceThumbnailField
from django.core.files import File
from io import BytesIO
from PIL import Image
from wholesalers.models import RetailerOrderItems, RetailerOrders
from drugs.models import Frequency, Preparation, Routes, Users
from core.models import EntityRelatedModel
from django.contrib.auth import get_user_model
from django.db.models.signals import post_save, pre_save
from django.utils.text import slugify
from employees.models import Employees
from employees.models import DeliveryPersons
from django.utils.translation import gettext_lazy as _
import uuid
from django.db.models.signals import post_save
from django.dispatch import receiver
import requests
from core.constants import TRUE_FALSE_OPTIONS, UNITS_OF_ISSUE_CHOICES

User = get_user_model()

class UnitsOfReceipt(models.TextChoices):
    Gram = "Gram", _("Gram")
    Kilogram = "Kilogram", _("Kilogram")
    Litre = "Litre", _("Litre")
    Millilitre = "Millilitre", _("Millilitre")
    Piece = "Piece", _("Piece")
    Pack = "Pack", _("Pack")

class UnitOfIssue(models.TextChoices):
    Gram = "Gram", _("Gram")
    Kilogram = "Kilogram", _("Kilogram")
    Litre = "Litre", _("Litre")
    Millilitre = "Millilitre", _("Millilitre")
    Piece = "Piece", _("Piece")
    Pack = "Pack", _("Pack")



STOCK_ADJUSTMENT_DIRECTION_OPTIONS = (
    ("DECREMENT", "DECREMENT"),
    ("INCREMENT", "INCREMENT"),
)


class RetailerCoupon(models.Model):
    code = models.CharField(max_length=50, unique=True)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    discount = models.IntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    active = models.BooleanField()

    def __str__(self):
        return self.code

class RetailerVariations(EntityRelatedModel):
    product = models.ForeignKey(
        "products.Products", related_name="retailer_variation_product", on_delete=models.CASCADE
    )
    description = models.TextField(blank=True, null=True)
    pack_quantity = models.IntegerField(null=True, blank=True, default=0)
    unit_quantity = models.IntegerField(null=True, blank=True, default=0)
    minimum_stock = models.IntegerField(null=True, blank=True, default=0)
    maximum_stock = models.IntegerField(null=True, blank=True, default=0)
    reorder_level = models.IntegerField(null=True, blank=True, default=0)
    lead_time = models.IntegerField(null=True, blank=True, default=0)
    safety_stock = models.IntegerField(null=True, blank=True, default=0)
    danger_stock = models.IntegerField(null=True, blank=True, default=0)
    running_total_receipts = models.IntegerField(null=True, blank=True, default=0)
    running_total_issues = models.IntegerField(null=True, blank=True, default=0)
    current_stock_balance = models.IntegerField(null=True, blank=True, default=0)
    economic_order_quantity = models.IntegerField(null=True, blank=True, default=0)
    rating = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    num_reviews = models.IntegerField(null=True, blank=True, default=0)
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.product.title}"

class RetailerReviews(EntityRelatedModel):
    variation = models.ForeignKey(RetailerVariations, on_delete=models.CASCADE)
    rating = models.IntegerField(null=True, blank=True, default=0)
    comment = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="review_owner", on_delete=models.CASCADE
    )

class WholesalerInvoices(EntityRelatedModel):
    source_entity = models.ForeignKey(
        Entities, related_name="wholesaler_invoice_source_entity", on_delete=models.CASCADE
    )
    invoice_number = models.CharField(max_length=50, null=True, blank=True)
    total_amount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    outstanding_amount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    paid_amount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    delivered_by = models.ForeignKey(
        User,
        related_name="invoice_delivered_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    received_by = models.ForeignKey(
        User,
        related_name="invoice_received_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    owner = models.ForeignKey(
        User,
        related_name="invoice_created_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural = "Wholesaler Invoices"

class WholesalerInvoiceItems(EntityRelatedModel):
    wholesaler_invoice = models.ForeignKey(WholesalerInvoices, on_delete=models.CASCADE)
    product = models.ForeignKey("products.Products", on_delete=models.CASCADE)
    purchased_unit_quantity = models.IntegerField()
    bonus_unit_quantity = models.IntegerField()
    batch = models.CharField(max_length=50, null=True, blank=True)
    manufacture_date = models.DateField(default=None, null=True, blank=True)
    expiry_date = models.DateField(default=None, null=True, blank=True)
    pack_buying_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    pack_selling_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    percent_discount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="wholesaler_invoice_owner", on_delete=models.CASCADE
    )

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum
from django.utils import timezone


class RetailerReceipts(EntityRelatedModel):
    """
    Retailer's own inventory lot.

    Created either from a received RetailerOrder, or directly
    (onboarding, manual stock entry, adjustments). Both paths
    are supported — the order FKs are nullable.
    """

    draft_id = models.CharField(max_length=256, null=True, blank=True)
    product = models.ForeignKey("products.Products", on_delete=models.CASCADE)
    received_from = models.ForeignKey(
        Entities,
        related_name="retailerVariationReceiptSupplier",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    bar_code = models.CharField(max_length=256, default="", null=True, blank=True)

    retailer_order = models.ForeignKey(
        "wholesalers.RetailerOrders",
        related_name="retailer_receipts_from_order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text=(
            "The order this receipt came from. Null for direct/manual "
            "receipts (onboarding, opening stock, adjustments)."
        ),
    )
    retailer_order_item = models.ForeignKey(
        "wholesalers.RetailerOrderItems",
        related_name="retailer_receipts_from_order_item",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text=(
            "The order line this receipt was created from. Null when "
            "the retailer created the receipt directly."
        ),
    )
    wholesaler_receipt = models.ForeignKey(
        "wholesalers.WholesalerReceipts",
        related_name="retailer_placements",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text=(
            "The wholesaler's lot this stock came from. Set for both "
            "outright and placement receipts. Critical for placement "
            "because the wholesaler retains ownership until sale."
        ),
    )

    batch = models.CharField(max_length=50, null=True, blank=True)
    supplier_invoice = models.CharField(max_length=50, null=True, blank=True)
    manufacture_date = models.DateField(default=None, null=True, blank=True)
    expiry_date = models.DateField(default=None, null=True, blank=True)

    unit_buying_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            "Goods-only price per unit. For in_placement=True this is "
            "the base price owed to the wholesaler on sale, not paid "
            "at receipt time. Shipping is tracked separately in "
            "allocated_shipping_per_unit."
        ),
    )
    unit_price_discount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        help_text="Retail-side markdown off unit_selling_price.",
    )
    unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
    )
    final_unit_selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text="unit_selling_price − unit_price_discount.",
    )

    allocated_shipping_total = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00,
        help_text=(
            "This receipt's share of the parent order's shipping_amount, "
            "allocated by value across all receipts from that order."
        ),
    )
    allocated_shipping_per_unit = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        help_text=(
            "allocated_shipping_total / received_unit_quantity. "
            "Added to unit_buying_price to obtain landed cost."
        ),
    )

    units_per_pack = models.IntegerField(default=1)
    unit_of_receipt = models.CharField(
        verbose_name=_("Unit of Receipt"),
        choices=UnitsOfReceipt.choices,
        default="PIECE",
        max_length=20,
    )

    received_unit_quantity = models.IntegerField()
    current_unit_quantity = models.IntegerField()
    reserved_unit_quantity = models.IntegerField(
        default=0,
        help_text=(
            "Units committed to unpaid/undelivered customer orders. "
            "Reduced when the order is delivered or cancelled."
        ),
    )

    placement_sold_quantity = models.IntegerField(
        default=0,
        help_text="Cumulative units sold through delivered customer orders.",
    )
    placement_owed_total = models.DecimalField(
        max_digits=14, decimal_places=2, default=0.00,
        help_text="Total owed to the wholesaler for delivered placement units.",
    )
    placement_margin_total = models.DecimalField(
        max_digits=14, decimal_places=2, default=0.00,
        help_text="Total margin retained on delivered placement units.",
    )

    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    in_placement = models.BooleanField(default=False)
    created = models.DateTimeField(default=timezone.now)
    updated = models.DateTimeField(auto_now=True)
    employee = models.ForeignKey(
        Employees,
        related_name="employee_creating_receipt",
        on_delete=models.CASCADE,
    )
    owner = models.ForeignKey(
        User,
        related_name="retailerVariationReceiptOwner",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Retailer Inventory"

    def __str__(self):
        return self.product.title

    def title(self):
        return self.product.title

    def clean(self):
        super().clean()
        if (
            self.retailer_order_id
            and self.retailer_order_item_id
            and self.retailer_order_item.retailer_order_id
            != self.retailer_order_id
        ):
            raise ValidationError(
                "retailer_order and retailer_order_item must belong "
                "to the same order."
            )

    def save(self, *args, **kwargs):
        if self.product and self.product.bar_code:
            self.bar_code = self.product.bar_code

        # Keep final selling price consistent with list − discount.
        if self.unit_selling_price is not None:
            self.final_unit_selling_price = _q(
                (self.unit_selling_price or 0)
                - (self.unit_price_discount or 0)
            )

        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # Derived values
    # ------------------------------------------------------------------

    @property
    def landed_unit_buying_price(self) -> Decimal:
        return _q(
            (self.unit_buying_price or 0)
            + (self.allocated_shipping_per_unit or 0)
        )

    @property
    def available_unit_quantity(self) -> int:
        return max(
            0,
            (self.current_unit_quantity or 0)
            - (self.reserved_unit_quantity or 0),
        )

    @property
    def is_consignment_open(self) -> bool:
        return (
            self.in_placement
            and self.is_active == "true"
            and (self.current_unit_quantity or 0) > 0
        )

    # ------------------------------------------------------------------
    # Placement rollups
    # ------------------------------------------------------------------

    def recalculate_placement(self, save=True):
        """
        Roll up settled customer order items into the placement
        summary fields. Only counts items on delivered orders.
        """
        if not self.in_placement:
            self.placement_sold_quantity = 0
            self.placement_owed_total = Decimal("0.00")
            self.placement_margin_total = Decimal("0.00")
            if save:
                super().save(update_fields=[
                    "placement_sold_quantity",
                    "placement_owed_total",
                    "placement_margin_total",
                ])
            return

        agg = (
            CustomerOrderItems.objects
            .filter(
                retailer_receipt=self,
                is_placement=True,
                customer_order__is_delivered="true",
            )
            .aggregate(
                qty=Sum("total_quantity"),
                owed=Sum("wholesaler_total"),
                margin=Sum("retailer_margin_total"),
            )
        )

        self.placement_sold_quantity = int(agg["qty"] or 0)
        self.placement_owed_total = _q(agg["owed"] or 0)
        self.placement_margin_total = _q(agg["margin"] or 0)

        if save:
            super().save(update_fields=[
                "placement_sold_quantity",
                "placement_owed_total",
                "placement_margin_total",
                "updated",
            ])


class RetailQuantityDiscounts(EntityRelatedModel):
    class Meta:
        verbose_name_plural="Retailer Quantity Discounts"
    title = models.CharField(max_length=100)
    retailer_receipt = models.ForeignKey(
        RetailerReceipts,
        related_name="quantity_discout_product",
        on_delete=models.CASCADE, null=True, blank=True
    )
    limit_quantity = models.IntegerField()
    awarded_quantity = models.IntegerField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    start_date = models.DateField(default=None, null=True, blank=True)
    end_date = models.DateField(default=None, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="quantity_discount_owner",
        on_delete=models.CASCADE,
    )

# retailers/models.py

from decimal import Decimal

from django.db import models
from django.utils import timezone


class IndentItemSource(models.TextChoices):
    PREDICTION = "PREDICTION", "Auto-suggested by the prediction engine"
    PREDICTION_EDITED = "PREDICTION_EDITED", "Auto-suggested, then adjusted by the retailer"
    USER_ADDED = "USER_ADDED", "Manually added by the retailer"
    WHOLESALER_ADDED = "WHOLESALER_ADDED", "Added from a wholesaler's catalogue"
    IMPORTED = "IMPORTED", "Imported from an external source"



# apps/retailers/models.py

from decimal import Decimal, ROUND_HALF_UP



TWO_PLACES = Decimal("0.01")


def _q(value) -> Decimal:
    """Quantize to 2 dp, half-up. `None` → 0.00."""
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )


class IndentItemSource(models.TextChoices):
    PREDICTION = "PREDICTION", "Auto-suggested by the prediction engine"
    MANUAL = "MANUAL", "Added manually by the retailer"
    IMPORTED = "IMPORTED", "Imported from another source"


from decimal import Decimal

from django.db import models

from authentication.models import Users


class RetailerIndent(EntityRelatedModel):
    """
    A replenishment plan for a retailer.

    The indent is the retailer's shopping list: a persistent draft
    that items are added to (manually, from prediction, or from
    campaigns) and later committed to orders. It is the sole
    commitment path — campaign or not.
    """

    class Meta:
        verbose_name_plural = "Retailer Indents"
        ordering = ["-created"]

    is_open = models.CharField(max_length=10, default="true")
    indent_number = models.CharField(
        max_length=32, unique=True, null=True, blank=True,
    )
    lead_time = models.IntegerField(default=0)
    order_days = models.IntegerField(default=30)

    budget_amount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
    )
    budget_enforced = models.CharField(max_length=10, default="true")
    pricing_percentage = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=30.00,
        help_text=(
            "Markup % applied to the supplier's post-discount unit "
            "price when neither the item nor the receipt provides a "
            "recommended retail price."
        ),
    )

    average_lead_time_days = models.DecimalField(
        max_digits=6, decimal_places=2, default=0.00,
    )
    average_variance_days = models.DecimalField(
        max_digits=6, decimal_places=2, default=0.00,
    )
    min_lead_time_days = models.IntegerField(default=0)
    max_lead_time_days = models.IntegerField(default=0)
    lead_time_updated_at = models.DateTimeField(null=True, blank=True)

    total_cost = models.DecimalField(
        max_digits=14, decimal_places=2, default=0.00,
    )
    total_revenue = models.DecimalField(
        max_digits=14, decimal_places=2, default=0.00,
    )
    total_profit = models.DecimalField(
        max_digits=14, decimal_places=2, default=0.00,
    )
    included_item_count = models.IntegerField(default=0)
    excluded_item_count = models.IntegerField(default=0)
    over_budget = models.BooleanField(default=False)

    config_snapshot = models.JSONField(null=True, blank=True)

    owner = models.ForeignKey(
        Users,
        related_name="retailer_indent_owner",
        on_delete=models.CASCADE,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.indent_number or '(unsaved)'} · {self.entity_title}"

    def save(self, *args, **kwargs):
        if not self.indent_number:
            self.indent_number = self._generate_indent_number()
        super().save(*args, **kwargs)

    def _generate_indent_number(self):
        if not self.entity_id:
            return None

        prefix = getattr(self.entity, "code", "TRA")
        prefix = (prefix or "TRA")[:5].upper()

        last = (
            RetailerIndent.objects
            .filter(entity=self.entity)
            .exclude(indent_number__isnull=True)
            .order_by("-indent_number")
            .values_list("indent_number", flat=True)
            .first()
        )

        if last and last.startswith(prefix):
            try:
                seq = int(last[len(prefix):]) + 1
            except (ValueError, TypeError):
                seq = 1
        else:
            seq = 1

        return f"{prefix}{seq:010d}"

    def recalculate(self, save=True):
        """
        Roll up item-level profit_estimate into header aggregates.
        Only counts items with a profit_estimate (i.e. priced).
        """
        items = self.indent_for_item.all()

        total_cost = Decimal("0.00")
        total_revenue = Decimal("0.00")
        total_profit = Decimal("0.00")
        included_count = 0

        for it in items:
            est = it.profit_estimate or {}
            cost = est.get("total_cost")
            revenue = est.get("total_revenue")
            profit = est.get("total_profit")

            if cost is None:
                continue

            total_cost += Decimal(str(cost))
            total_revenue += Decimal(str(revenue or 0))
            total_profit += Decimal(str(profit or 0))
            included_count += 1

        self.total_cost = _q(total_cost)
        self.total_revenue = _q(total_revenue)
        self.total_profit = _q(total_profit)
        self.included_item_count = included_count
        self.excluded_item_count = self.excluded_item_count or 0

        budget = self.budget_amount
        if budget is not None:
            self.over_budget = self.total_cost > Decimal(str(budget))
        else:
            self.over_budget = False

        if save:
            super().save(update_fields=[
                "total_cost",
                "total_revenue",
                "total_profit",
                "included_item_count",
                "excluded_item_count",
                "over_budget",
                "updated",
            ])


from decimal import Decimal

from django.db import models
from django.utils import timezone


class RetailerIndentItem(EntityRelatedModel):
    """
    One line on a retailer indent.

    Pricing chain (locked):
      list_price    = supplier_unit_selling_price or receipt.unit_selling_price
      final_price   = price_discount.offer_price if FK set, else list_price
      bonus         = from quantity_discount FK
      total_qty     = required_quantity + bonus
      sell_per_unit = item RRP > receipt RRP > final_price * (1 + markup/100)
      total_cost    = final_price * required_quantity
      total_revenue = sell_per_unit * total_qty
      total_profit  = total_revenue - total_cost

    Markup base is final_price (what the retailer pays per paid unit).
    Bonus dilution does NOT affect the markup base.
    """

    class Meta:
        verbose_name_plural = "Retailer Indent Items"
        constraints = [
            models.UniqueConstraint(
                fields=("wholesale_receipt", "retailer_indent", "entity"),
                name="uniq_retailer_indent_item_receipt_indent_entity",
            ),
        ]

    source = models.CharField(
        max_length=20,
        choices=IndentItemSource.choices,
        default=IndentItemSource.PREDICTION,
    )

    retailer_indent = models.ForeignKey(
        RetailerIndent,
        on_delete=models.CASCADE,
        related_name="indent_for_item",
        null=True,
        blank=True,
    )
    wholesale_receipt = models.ForeignKey(
        WholesalerReceipts,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    wholesaler_price_discount = models.ForeignKey(
        WholesalerPriceDiscounts,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="indent_items_priced_against",
    )
    wholesaler_quantity_discount = models.ForeignKey(
        WholesalerQuantityDiscounts,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="indent_items_priced_against",
    )
    campaign_item = models.ForeignKey(
        "wholesalers.WholesalerCampaignItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="indent_items",
        help_text="Set when this line was created by accepting a campaign.",
    )

    required_quantity = models.IntegerField(default=0)
    total_quantity = models.IntegerField(default=0)

    bonus_quantity_earned = models.IntegerField(default=0)
    bonus_blocks_earned = models.IntegerField(default=0)
    bonus_rule_buy_quantity = models.IntegerField(null=True, blank=True)
    bonus_rule_free_quantity = models.IntegerField(null=True, blank=True)

    supplier_unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
    )
    final_supplier_unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text=(
            "Post-price-discount unit price. What the retailer pays "
            "per paid unit. Markup is applied to this."
        ),
    )
    recommended_retail_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
    )
    markup_percentage_used = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
    )

    profit_estimate = models.JSONField(null=True, blank=True)

    lead_time_days = models.IntegerField(default=0)
    lead_time_variance_days = models.IntegerField(default=0)
    lead_time_source = models.CharField(max_length=32, default="default")

    manufacture_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="retailer_indent_item_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    def __str__(self):
        title = self.wholesale_receipt_title or "(no product)"
        return f"{title} × {self.required_quantity}"

    def save(self, *args, **kwargs):
        if kwargs.pop("recalculate", True):
            self.recalculate()
        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # Inputs
    # ------------------------------------------------------------------

    def _retailer_markup_percentage(self, override: Decimal = None) -> Decimal:
        if override is not None:
            return Decimal(str(override))
        parent = self.retailer_indent
        if parent is not None and parent.pricing_percentage is not None:
            return Decimal(str(parent.pricing_percentage))
        return Decimal("30.00")

    def _resolve_list_price(self) -> Decimal:
        if self.supplier_unit_selling_price is not None:
            return _q(self.supplier_unit_selling_price)
        receipt = self.wholesale_receipt
        if receipt is None:
            return Decimal("0.00")
        return _q(getattr(receipt, "unit_selling_price", 0) or 0)

    def _resolve_final_price(self, list_price: Decimal) -> Decimal:
        pd = self.wholesaler_price_discount
        if pd is not None and pd.offer_price is not None:
            return _q(pd.offer_price)
        return list_price

    def _resolve_recommended_rrp(self):
        if self.recommended_retail_price is not None:
            return _q(self.recommended_retail_price)
        receipt = self.wholesale_receipt
        if receipt is None:
            return None
        raw = getattr(receipt, "recommended_retail_price", None)
        return _q(raw) if raw is not None else None

    def _compute_bonus(self, qty: int):
        qd = self.wholesaler_quantity_discount
        if (
            qd is None
            or (qd.limit_quantity or 0) <= 0
            or (qd.awarded_quantity or 0) <= 0
            or qty <= 0
        ):
            return 0, 0, None, None

        buy_qty = int(qd.limit_quantity)
        free_qty = int(qd.awarded_quantity)
        blocks = qty // buy_qty
        return blocks * free_qty, blocks, buy_qty, free_qty

    # ------------------------------------------------------------------
    # Recalculate
    # ------------------------------------------------------------------

    def recalculate(self, markup_override: Decimal = None):
        qty = int(self.required_quantity or 0)

        list_price = self._resolve_list_price()
        final_price = self._resolve_final_price(list_price)
        self.final_supplier_unit_selling_price = final_price

        bonus_qty, blocks, buy_qty, free_qty = self._compute_bonus(qty)
        self.bonus_quantity_earned = bonus_qty
        self.bonus_blocks_earned = blocks
        self.bonus_rule_buy_quantity = buy_qty
        self.bonus_rule_free_quantity = free_qty
        self.total_quantity = qty + bonus_qty

        markup_pct = self._retailer_markup_percentage(markup_override)
        self.markup_percentage_used = markup_pct

        rrp = self._resolve_recommended_rrp()
        if rrp is not None:
            sell_per_unit = rrp
            pricing_source = "rrp"
        else:
            sell_per_unit = _q(
                final_price * (Decimal("1") + markup_pct / Decimal("100"))
            )
            pricing_source = "markup"

        total_cost = _q(final_price * qty)
        total_revenue = _q(sell_per_unit * self.total_quantity)
        total_profit = _q(total_revenue - total_cost)

        effective_cost = (
            _q(total_cost / self.total_quantity)
            if self.total_quantity else _q(final_price)
        )
        profit_per_unit = _q(sell_per_unit - final_price)
        margin_percent = (
            _q((total_profit / total_revenue) * Decimal("100"))
            if total_revenue else Decimal("0.00")
        )

        self.profit_estimate = {
            "list_unit_price": str(list_price),
            "cost_per_unit": str(final_price),
            "effective_cost_per_unit": str(effective_cost),
            "sell_per_unit": str(sell_per_unit),
            "profit_per_unit": str(profit_per_unit),
            "total_revenue": str(total_revenue),
            "total_cost": str(total_cost),
            "total_profit": str(total_profit),
            "margin_percent": str(margin_percent),
            "markup_percentage": str(markup_pct),
            "pricing_source": pricing_source,
        }

        receipt = self.wholesale_receipt
        if receipt is not None:
            self.lead_time_days = int(getattr(receipt, "lead_time_days", 0) or 0)
            self.lead_time_variance_days = int(
                getattr(receipt, "lead_time_variance_days", 0) or 0
            )
            self.lead_time_source = getattr(
                receipt, "lead_time_source", "receipt",
            )
            self.manufacture_date = getattr(receipt, "manufacture_date", None)
            self.expiry_date = getattr(receipt, "expiry_date", None)
        else:
            self.lead_time_days = 0
            self.lead_time_variance_days = 0
            self.lead_time_source = "default"

    # ------------------------------------------------------------------
    # Derived pricing
    # ------------------------------------------------------------------

    @property
    def final_unit_price(self):
        return (self.profit_estimate or {}).get("cost_per_unit")

    @property
    def item_net_total_amount(self):
        return (self.profit_estimate or {}).get("total_cost")

    @property
    def item_gross_total_amount(self):
        receipt = self.wholesale_receipt
        if receipt is None:
            return None
        list_price = getattr(receipt, "unit_selling_price", None)
        if list_price is None or self.required_quantity is None:
            return None
        return Decimal(str(list_price)) * Decimal(str(self.required_quantity))

    # ------------------------------------------------------------------
    # Display helpers
    # ------------------------------------------------------------------

    @property
    def wholesale_receipt_title(self):
        if self.wholesale_receipt and self.wholesale_receipt.product:
            return self.wholesale_receipt.product.product_name()
        return ""

    @property
    def wholesaler_title(self):
        r = self.wholesale_receipt
        if r and r.received_from:
            return r.received_from.title
        return ""

    @property
    def wholesaler(self):
        r = self.wholesale_receipt
        if r and r.received_from:
            return str(r.received_from.id)
        return None

    @property
    def wholesaler_price_discount_title(self):
        return self.wholesaler_price_discount.title if self.wholesaler_price_discount else ""

    @property
    def wholesaler_quantity_discount_title(self):
        return self.wholesaler_quantity_discount.title if self.wholesaler_quantity_discount else ""

    @property
    def source_label(self):
        return self.get_source_display()

    # ------------------------------------------------------------------
    # Profit accessors
    # ------------------------------------------------------------------

    @property
    def cost_per_unit(self):
        return (self.profit_estimate or {}).get("cost_per_unit")

    @property
    def sell_per_unit(self):
        return (self.profit_estimate or {}).get("sell_per_unit")

    @property
    def profit_per_unit(self):
        return (self.profit_estimate or {}).get("profit_per_unit")

    @property
    def total_profit(self):
        return (self.profit_estimate or {}).get("total_profit")

    @property
    def total_revenue(self):
        return (self.profit_estimate or {}).get("total_revenue")

    @property
    def margin_percent(self):
        return (self.profit_estimate or {}).get("margin_percent")

    @property
    def pricing_source(self):
        return (self.profit_estimate or {}).get("pricing_source")
    
#


class OutOfStock(EntityRelatedModel):
    class Meta:
        verbose_name_plural="Out Of Stock Items"
    draft_id = models.CharField(max_length=256, null=True, blank=True)
    product = models.ForeignKey("products.Products", on_delete=models.CASCADE)
    unit_of_receipt = models.CharField(
        verbose_name=_("Unit of Receipt"),
        choices=UnitsOfReceipt.choices,default="Piece",
        max_length=20,
    )
    customer = models.ForeignKey(
        Users,
        on_delete=models.CASCADE,
        related_name="requisitioning_customer",
        null=True,
        blank=True,
    )
    retailer_indent = models.ForeignKey(
        RetailerIndent,
        on_delete=models.CASCADE,
        related_name="requisitioning_customer",
        null=True,
        blank=True,
    )

    customer_name = models.CharField(max_length=100, null=True, blank=True)
    customer_phone = models.CharField(max_length=100, null=True, blank=True)
    required_quantity = models.IntegerField()
    is_special_order = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    is_ordered = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="os_added_by",
        on_delete=models.CASCADE,
    )

class OrderEstimate(EntityRelatedModel):
    class Meta:
        verbose_name_plural="Out Of Stock Items"

    product = models.ForeignKey("products.Products",related_name="order_estimate_product", on_delete=models.CASCADE,null=True,blank=True)
    retailer_indent = models.ForeignKey(RetailerIndent,related_name="order_estimate_retailer_indent", on_delete=models.CASCADE,null=True,blank=True)
    required_estimate = models.IntegerField(default=0)
    sold_quantity = models.IntegerField(default=0)
    current_quantity = models.IntegerField(default=0)
    average_sold_daily = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    owner = models.ForeignKey(
        Users,
        related_name="estimate_added_by",
        on_delete=models.CASCADE,
    )
    is_ordered = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class RetailersShippingRates(EntityRelatedModel):
    distance_in_km_from = models.FloatField()
    distance_in_km_to = models.FloatField()
    county = models.ForeignKey(
        Counties, on_delete=models.CASCADE, null=True, blank=True
    )
    constituency = models.ForeignKey(
        Constituencies, on_delete=models.CASCADE, null=True, blank=True
    )
    courier = models.ForeignKey(
        Entities,
        related_name="courier_entity",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    collection_point = models.CharField(max_length=100, null=True, blank=True)
    shipping_cost = models.DecimalField(max_digits=7, decimal_places=2)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        "authentication.Users",
        related_name="retail_shipping_cost_creator",
        on_delete=models.CASCADE,
    )

    class Meta:
        unique_together = ("entity", "distance_in_km_from", "distance_in_km_to")

def prescription_image_upload_to(instance, filename):
    title = instance.prescription.patient_name
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename

def compress_image(image):
    im = Image.open(image)
    if im.mode != 'RGB':
        im = im.convert('RGB')
    im_io = BytesIO()
    im.save(im_io, 'jpeg', quality=70,optimize=True)
    new_image = File(im_io, name=image.name)
    return new_image

class PrescriptionImages(EntityRelatedModel):
    """Model prescription image"""

    prescription = models.ForeignKey(
        "Prescriptions", related_name="prescription_images", on_delete=models.CASCADE,null=True,blank=True
    )
    image = models.ImageField(upload_to=prescription_image_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/retailers/prescriptions",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Retail Prescription Images"

    def save(self, *args, **kwargs):
        if self.image:
            image = self.image
            if (
                image.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress image function
                self.image = compress_image(image)
        super(PrescriptionImages, self).save(*args, **kwargs)

    def __str__(self):
        if self.prescription.patient_name:
            return f"{self.prescription.patient_name}"
        else:
            return None

class Prescriptions(EntityRelatedModel):
    """Model for retail inventory"""
    PRESCRIPTION_STATUS_CHOICES = (
        ("CANCELLED", "CANCELLED"),
        ("CLOSED", "CLOSED"),
        ("DISPENSED", "DISPENSED"),
        ("QUEUING", "QUEUING"),
    )
    PRESCRIPTION_NATURE_CHOICES = (
        ("ACUTE", "ACUTE"),
        ("REPEAT", "REPEAT"),
    )
    GENDER_CHOICES = (
        ("FEMALE","FEMALE"),
        ("MALE","MALE"),
        ("OTHER","OTHER"),
    )
    RELATIONSHIP_CHOICES = (
        ("CHILD","CHILD"),
        ("SELF","SELF"),
        ("SIBLING","SIBLING"),
        ("SPOUSE","SPOUSE"),
        ("PARENT","PARENT"),
        ("OTHER","OTHER"),
    )

    created_by = models.ForeignKey(
            Users,related_name="prescription_created_by", on_delete=models.CASCADE)
    interpreted_by = models.ForeignKey(
            Employees,related_name="prescription_interpreted_by", on_delete=models.CASCADE,null=True,blank=True)  
    is_closed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_dispensed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    images = models.ManyToManyField(
        PrescriptionImages,
        related_name="images",
    )
    patient_gender = models.CharField(
        max_length=120,
        choices=GENDER_CHOICES,
    )
    relationship = models.CharField(
        max_length=120, choices=RELATIONSHIP_CHOICES
    )
    
    patient_name = models.CharField(max_length=256)
    patient_date_of_birth = models.DateField()
    comment = models.CharField(max_length=256, null=True, blank=True,default="")
    status = models.CharField(
        max_length=120, choices=PRESCRIPTION_STATUS_CHOICES,default="QUEUING"
    )
    nature = models.CharField(
        max_length=120, choices=PRESCRIPTION_NATURE_CHOICES,
    )
    origin_point = geomodel.PointField(null=True, blank=True, srid=4326)
    destination_point = geomodel.PointField(null=True, blank=True, srid=4326)
    patient = models.ForeignKey(
        Dependants, on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    def __str__(self):
        return f"{self.patient_name} created on {self.created}"
    class Meta:
        verbose_name_plural = "Retail Prescriptions"
    
class PrescriptionItems(EntityRelatedModel):
    """Model for retail prescription item"""
    prescription = models.ForeignKey(
        Prescriptions,related_name="prescription_item_prescription", on_delete=models.CASCADE)

    preparation = models.ForeignKey(
        Preparation,related_name="prescription_item_preparation", on_delete=models.CASCADE,null=True,blank=True)
    product = models.ForeignKey(
        "products.Products",related_name="prescription_item_preparation", on_delete=models.CASCADE,null=True,blank=True)
    prescribed_by = models.ForeignKey(
            Employees,related_name="prescription_item_prescribed_by", on_delete=models.CASCADE)

    route = models.ForeignKey(
            Routes,related_name="prescription_item_route", on_delete=models.CASCADE,null=True,blank=True)
    frequency = models.ForeignKey(
            Frequency,related_name="prescription_item_frequency", on_delete=models.CASCADE,null=True,blank=True)

    dose = models.CharField(max_length=128)
    days = models.IntegerField()
    is_divisible = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    interpreted_by = models.ForeignKey(
            Employees,related_name="prescription_item_interpreted_by", on_delete=models.CASCADE,null=True,blank=True)
    required_unit_quantity=models.IntegerField(default=0)
    issued_unit_quantity=models.IntegerField(default=0)
    balance_unit_quantity=models.IntegerField(default=0)
    current_order_unit_quantity=models.IntegerField(default=0)
    instruction = models.CharField(max_length=256,null=True,blank=True)
    created_by = models.ForeignKey(
            Employees,related_name="prescription_item_created_by", on_delete=models.CASCADE,null=True,blank=True)
    
    retailer_receipt = models.ForeignKey(
            RetailerReceipts,related_name="prescription_item_retailer_receipt", on_delete=models.CASCADE,null=True,blank=True)
    unit_of_issue = models.CharField(
        verbose_name=_("Unit of Issue"),
        choices=UnitOfIssue.choices,default="PIECE",
        max_length=20,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.id}"
    class Meta:
        verbose_name_plural = "Retail Prescription Items"
    
    def save(self, *args, **kwargs):
        self.balance_unit_quantity = self.required_unit_quantity - self.issued_unit_quantity
        super(PrescriptionItems, self).save(*args, **kwargs)
             
class PrescriptionItemAdministrations(EntityRelatedModel):
    prescription_item = models.ForeignKey(
            PrescriptionItems,related_name="prescription_item_administration_prescription_item", on_delete=models.CASCADE,null=True,blank=True)
    administration_date = models.DateField()
    administration_time = models.TimeField()
    is_administered = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    comment = models.CharField(
        max_length=120, null=True,blank=True
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)

def convert_time(time_str):
    if time_str.startswith("24:"):
        return "00:" + time_str[3:]
    return time_str

@receiver(post_save, sender=PrescriptionItems)
def create_retail_presciption_item_administrations_model(sender, instance, created, **kwargs):
    from datetime import datetime,date, timedelta
    if created and instance:
        try:
            print("Am at receiver 1")
            date_count=0
            administration_date=date.today()
            
            time_apart =0
            if instance.days:
                for day in range(instance.days):
                    date_count = int(date_count)+1
                    administration_date = date.today() + timedelta(days=date_count)
                    administration_time=0
                    print("Am at receiver 2")
                    
                    if instance.frequency.numerical:
                        time_apart = 24/int(instance.frequency.numerical)
                        for i in range(int(instance.frequency.numerical)):
                            
                            
                            administration_time=int(administration_time+24/int(instance.frequency.numerical))
                            print("Dates", administration_date)
                            print("Times",  time_apart)

                            if len(str(administration_time))==1:
                                administration_time_f= "0"+ str(administration_time)+":00"
                            else:
                                administration_time_f = str(administration_time)+":00"
                            
                            print("l administration_time_f",len(administration_time_f))
                            print("administration_time_f",administration_time_f)

                            time_time=datetime.strptime(convert_time(administration_time_f),  '%H:%M').time()
                            # print("administration_time", "{:.2f}".format(administration_time) )
                            created = PrescriptionItemAdministrations.objects.create(prescription_item=instance, administration_date=administration_date, administration_time=time_time,owner = instance.owner,entity=instance.entity)
        except Exception as e:
            print(str(e))
                            
  

class CustomerOrders(EntityRelatedModel):
    """
    End-customer order. Terminal document in the chain.

    Payment and delivery are tracked independently:
      - is_paid is recomputed from successful CustomerOrderPayments.
      - is_delivered is set when stock physically leaves.
      - is_settled guards the stock-movement service (idempotency).
    """

    class OrderOriginOptions(models.TextChoices):
        CUSTOMER = "CUSTOMER", _("CUSTOMER")
        STAFF = "STAFF", _("STAFF")

    class OrderTypeOptions(models.TextChoices):
        NORMAL = "NORMAL", _("NORMAL")
        PRESCRIPTION = "PRESCRIPTION", _("PRESCRIPTION")

    class OrderChannelOptions(models.TextChoices):
        WEB = "WEB", _("WEB")
        ANDROID = "ANDROID", _("ANDROID")
        IOS = "IOS", _("IOS")
        WINDOWS = "WINDOWS", _("WINDOWS")

    class DeliveryMethodOptions(models.TextChoices):
        DELIVERY = "DELIVERY", _("DELIVERY")
        PICKUP = "PICKUP", _("PICKUP")

    class OrderStatusOptions(models.TextChoices):
        ASSIGNED = "ASSIGNED", _("ASSIGNED")
        CANCELLED = "CANCELLED", _("CANCELLED")
        COMPLETED = "COMPLETED", _("COMPLETED")
        DISPATCHED = "DISPATCHED", _("DISPATCHED")
        DELIVERED = "DELIVERED", _("DELIVERED")
        PICKED = "PICKED", _("PICKED")
        PROCESSING = "PROCESSING", _("PROCESSING")
        RECEIVED = "RECEIVED", _("RECEIVED")

    entity = models.ForeignKey(Entities, on_delete=models.CASCADE)

    order_number = models.ForeignKey(
        DocumentNumbers,
        related_name="customer_order_number",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    payment_account_number = models.CharField(
        max_length=50, null=True, blank=True,
    )
    reference_number = models.CharField(max_length=100, null=True, blank=True)
    prescription = models.ForeignKey(
        Prescriptions, null=True, blank=True, on_delete=models.CASCADE,
    )

    order_type = models.CharField(
        max_length=100, null=True, blank=True, default="NORMAL",
        choices=OrderTypeOptions.choices,
    )
    draft_id = models.CharField(max_length=256, null=True, blank=True)
    city_name = models.CharField(max_length=256, null=True, blank=True)
    recipient_name = models.CharField(max_length=256, null=True, blank=True)
    recipient_phone = models.CharField(max_length=256, null=True, blank=True)
    order_origin = models.CharField(
        verbose_name=_("Order Origin"),
        choices=OrderOriginOptions.choices,
        max_length=20,
    )
    status = models.CharField(
        verbose_name=_("Order Status"),
        choices=OrderStatusOptions.choices,
        max_length=20,
        default=OrderStatusOptions.PROCESSING,
    )
    order_channel = models.CharField(
        verbose_name=_("Order Source"),
        choices=OrderChannelOptions.choices,
        default="WEB",
        max_length=20,
    )

    origin_point = geomodel.PointField(null=True, blank=True, srid=4326)
    destination_point = geomodel.PointField(null=True, blank=True, srid=4326)
    order_tax_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00,
    )
    farness = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    shipping_cost = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00,
    )
    order_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00,
    )
    order_price_discount_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    order_net_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )

    paid_total = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00,
        help_text="Sum of successful CustomerOrderPayment amounts.",
    )
    balance_due = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00,
        help_text="order_net_price_total − paid_total. Never negative.",
    )

    is_quoted = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    is_settled = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    is_delivered = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )

    employee = models.ForeignKey(
        Employees,
        on_delete=models.CASCADE,
        related_name="order_employee",
        null=True,
        blank=True,
    )
    customer = models.ForeignKey(
        Users,
        related_name="customer_user",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        default=None,
    )
    delivered_by = models.ForeignKey(
        Users,
        related_name="retailerOrderDeliveredBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    bodaboda = models.ForeignKey(
        BodaLocations,
        related_name="customer_order_deliverer",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    selected_payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="order_payment",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    is_processed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    processed_by = models.ForeignKey(
        Users,
        related_name="retailerOrderProcessedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_packed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    packed_by = models.ForeignKey(
        Users,
        related_name="retailerOrderPackedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_received = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    received_by = models.ForeignKey(
        Users,
        related_name="retailerOrderReceivedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    delivery_method = models.CharField(
        verbose_name=_("Delivery Method"),
        choices=DeliveryMethodOptions.choices,
        max_length=20,
    )
    customer_name = models.CharField(max_length=256, null=True, blank=True)
    customer_phone = models.CharField(max_length=20, null=True, blank=True)
    coupon = models.ForeignKey(
        RetailerCoupon,
        related_name="retailerOrderCoupon",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    user = models.ForeignKey(
        User,
        related_name="retailerOrderUser",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    # ---- Timestamps (nullable, set explicitly on transition) ----
    paid_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    packed_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="retailerOrderOwner", on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Customer Orders"

    def __str__(self):
        number = self.order_number.id if self.order_number else "unsaved"
        return f"{self.entity.title}-{number}"

    @property
    def has_placement_items(self) -> bool:
        return self.parent_order.filter(is_placement=True).exists()

    def recalculate(self, save=True):
        agg = self.parent_order.aggregate(
            gross=Sum("item_price_total"),
            tax=Sum("item_tax_total"),
            discount=Sum("item_price_discount_total"),
            counter_discount=Sum("item_counter_price_discount_amount_total"),
        )

        self.order_price_total = _q(agg["gross"] or 0)
        self.order_tax_total = _q(agg["tax"] or 0)
        self.order_price_discount_total = _q(agg["discount"] or 0)
        self.order_net_price_total = _q(
            (self.order_price_total or 0)
            + (self.order_tax_total or 0)
            + (self.shipping_cost or 0)
            - (self.order_price_discount_total or 0)
            - _q(agg["counter_discount"] or 0)
        )

        if save:
            super().save(update_fields=[
                "order_price_total",
                "order_tax_total",
                "order_price_discount_total",
                "order_net_price_total",
                "updated",
            ])
@receiver(post_save, sender=CustomerOrders)
def send_notification_on_create(sender, instance, created, **kwargs):
    
    if created:  # Only send notification when a new object is created
        print("Am at receiver 1",instance.order_price_total)

        channel_layer = get_channel_layer()
        group_name = f"user_{instance.owner.id}"  # Target specific user's group
        notification_data = {
            "type": "send_notification",  # Custom type for your consumer
            "customer_name": instance.customer_name,
            "customer_phone": instance.customer_phone,
            "delivery_method": instance.delivery_method,
            "is_received": instance.is_received,
            "is_delivered": instance.is_delivered,
            "selected_payment_method": str(instance.selected_payment_method.id) if instance.selected_payment_method else "",
            "selected_payment_method_title": instance.selected_payment_method.title if instance.selected_payment_method else "",
            "is_paid": instance.is_paid,
            "shipping_cost": instance.shipping_cost,
            "status": instance.status,
            "order_price_total": instance.order_price_total,
            "entity": str(instance.entity.id),
            "entity_title": instance.entity.title,
            "owner": str(instance.owner.id),
           
            "id": str(instance.id),
   
        }

        async_to_sync(channel_layer.group_send)(group_name, notification_data)
    else:
        print("Am at receiver 2","Not created")

    # class Meta:
    #     constraints = [
    #         models.UniqueConstraint(
    #             fields=["entity", "prescription"],
    #             name="Prescription can be digitized only once in a pharmacy",
    #         )
    #     ]

class CustomerOrderItems(EntityRelatedModel):
    """
    One line on a customer order — the actual sale event.

    For placement receipts, the line snapshots the base price
    owed to the wholesaler and the retailer's retained margin at
    the moment the sale is recorded.
    """

    customer_order = models.ForeignKey(
        CustomerOrders,
        related_name="parent_order",
        on_delete=models.CASCADE,
    )
    retailer_receipt = models.ForeignKey(
        RetailerReceipts,
        related_name="orderItemRetailerReceipt",
        on_delete=models.CASCADE,
    )
    unit_of_issue = models.CharField(
        verbose_name=_("Unit of Issue"),
        choices=UnitOfIssue.choices,
        max_length=20,
    )
    purchased_quantity = models.IntegerField(null=True, blank=True, default=0)
    discount_quantity = models.IntegerField(default=0)
    total_quantity = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00,
    )
    quantity = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00,
    )

    item_price = models.DecimalField(max_digits=7, decimal_places=2)
    item_price_total = models.DecimalField(max_digits=7, decimal_places=2)
    item_tax = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_tax_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_counter_price_discount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_counter_price_discount_amount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_counter_price_discount_amount_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00,
    )
    item_price_discount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_price_discount_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_net_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_net_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )

    # ---- Placement snapshot (set at order creation) ----
    is_placement = models.BooleanField(
        default=False,
        help_text="Snapshot of retailer_receipt.in_placement at sale time.",
    )
    wholesaler_base_unit_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Frozen unit_buying_price of the receipt. Placement only.",
    )
    wholesaler_total = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="wholesaler_base_unit_price × total_quantity. Placement only.",
    )
    retailer_margin_total = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="item_net_price_total − wholesaler_total. Placement only.",
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Customer Order Items"

    def __str__(self):
        return f"{self.retailer_receipt.product.title} × {self.total_quantity}"

    def recalculate(self):
        qty = Decimal(str(self.total_quantity or 0))
        retail_unit = _q(self.item_net_price or self.item_price or 0)

        self.item_price_total = _q(
            Decimal(str(self.item_price or 0))
            * Decimal(str(self.purchased_quantity or 0))
        )

        receipt = self.retailer_receipt
        placement = bool(receipt and receipt.in_placement)
        self.is_placement = placement

        if placement:
            base = _q(receipt.unit_buying_price or 0)
            self.wholesaler_base_unit_price = base
            self.wholesaler_total = _q(base * qty)
            self.retailer_margin_total = _q(
                (retail_unit * qty) - self.wholesaler_total
            )
        else:
            self.wholesaler_base_unit_price = None
            self.wholesaler_total = None
            self.retailer_margin_total = None

    def save(self, *args, **kwargs):
        self.recalculate()
        super().save(*args, **kwargs)

        if self.retailer_receipt_id:
            self.retailer_receipt.recalculate_placement()
        if self.customer_order_id:
            self.customer_order.recalculate()

    def delete(self, *args, **kwargs):
        receipt = self.retailer_receipt
        order = self.customer_order
        super().delete(*args, **kwargs)
        if receipt:
            receipt.recalculate_placement()
        if order:
            order.recalculate()


class CustomerOrderPayments(EntityRelatedModel):
    customer_order = models.OneToOneField(
        CustomerOrders, related_name="customer_order_paid", on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        Users,
        related_name="paying_user",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    reference_number = models.CharField(max_length=50, default="")
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    narration = models.CharField(max_length=100)
    msisdn = models.CharField(max_length=50, default="")
    transfer_status = models.CharField(max_length=50, default="")
    account_number = models.CharField(max_length=50, default="")
    transaction_id = models.CharField(max_length=50, default="")
    created = models.DateTimeField(auto_now_add=True)
    transaction_time = models.DateTimeField(auto_now_add=False)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="payment_owner", on_delete=models.CASCADE
    )

    class Meta:
        verbose_name_plural = "Customer Order Payments"


# def customer_order_post_save(sender, instance, signal, *args, **kwargs):
#     if instance:

#         # Create payment
#         process_mpesa_collection.delay(
#             instance.payment_account_number, instance.reference_number, instance.order_price_total)


# post_save.connect(customer_order_post_save, sender=CustomerOrders)

# class CustomerOrderMonitor(models.Model):
#     id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
#     customer_order = models.ForeignKey(
#         CustomerOrders, related_name="order_to_monitor", on_delete=models.CASCADE
#     )
#     # interval in seconds
#     # enpoint will be checked every specified interval time period
#     interval = models.IntegerField(blank=False)

#     task = models.OneToOneField(
#         PeriodicTask, null=True, blank=True, on_delete=models.SET_NULL
#     )

#     created_at = models.DateTimeField(auto_now_add=True)


# class OrderMonitor(models.Model):
#     id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
#     customer_order = models.ForeignKey(
#         CustomerOrders, related_name="order_to_monitor", on_delete=models.DO_NOTHING
#     )
#     # interval in seconds
#     # enpoint will be checked every specified interval time period
#     interval = models.IntegerField(blank=False)

#     task = models.OneToOneField(
#         PeriodicTask, null=True, blank=True, on_delete=models.CASCADE
#     )

#     created_at = models.DateTimeField(auto_now_add=True)


class ShippingAddress(EntityRelatedModel):
    customer_order = models.ForeignKey(
        CustomerOrders, related_name="order_shipping_address", on_delete=models.CASCADE
    )
    contact_person_name = models.CharField(max_length=100, null=True, blank=True)
    contact_person_phone = models.CharField(max_length=100, null=True, blank=True)
    estate = models.CharField(max_length=100, null=True, blank=True)
    road = models.CharField(max_length=100, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    delivery_entity = models.ForeignKey(
        Entities,
        related_name="order_delivery_entity",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    delivery_person = models.ForeignKey(
        DeliveryPersons, on_delete=models.CASCADE, null=True, blank=True
    )
    country = models.ForeignKey(
        Countries, on_delete=models.CASCADE, null=True, blank=True
    )
    county = models.ForeignKey(
        Counties, on_delete=models.CASCADE, null=True, blank=True
    )

    shipping_rate = models.ForeignKey(
        RetailersShippingRates, on_delete=models.CASCADE, null=True, blank=True
    )
    
    created = models.DateField(auto_now_add=True)
    updated = models.DateField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="shipping_address_owner", on_delete=models.CASCADE
    )





class CustomerOrderFailedPayments(EntityRelatedModel):
    customer_order = models.OneToOneField(
        CustomerOrders,
        related_name="customer_order_failed_payment",
        on_delete=models.CASCADE,
    )
    user = models.ForeignKey(
        Users,
        related_name="user_failed_payment",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    reference_number = models.CharField(max_length=50, default="")
    response_message = models.CharField(max_length=100)
    response_code = models.CharField(max_length=50, default="")
    transfer_status = models.CharField(max_length=50, default="")
    msisdn = models.CharField(max_length=50, default="")
    account_number = models.CharField(max_length=50, default="")
    created = models.DateTimeField(auto_now_add=True)
    transaction_time = models.DateTimeField(auto_now_add=False)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="owner_failed_payment", on_delete=models.CASCADE
    )

    class Meta:
        verbose_name_plural = "Customer Order Failed Payments"

    # def save(self, *args, **kwargs):

    #     retailer_order_items = CustomerOrderItems.objects.filter(
    #         customer_order=self.customer_order)
    #     for item in retailer_order_items:
    #         print('db qty', item.retailer_receipt.unit_quantity)
    #         print('purchased qty', item.purchased_quantity)
    #         item.retailer_receipt.unit_quantity = int(item.retailer_receipt.unit_quantity) - \
    #             int(item.purchased_quantity)
    #         item.retailer_receipt.save()
    #         item.retailer_receipt.pack_quantity = int(item.retailer_receipt.unit_quantity) / int(
    #             item.retailer_receipt.product.units_per_pack)
    #         item.retailer_receipt.save()
    #         print('itemm', item)
    #     super(CustomerOrderPayments, self).save(*args, **kwargs)

# @receiver(post_save, sender=CustomerOrderPayments)
# def post_save_adjust_inventory(sender, instance, created, **kwargs):
#     token_data = {
#         "action": config("TOKEN_ACTION"),
#         "consumer_code": config("TOKEN_CONSUMER_CODE"),
#         "consumer_key": config("TOKEN_CONSUMER_KEY"),
#         "consumer_secret": config("TOKEN_CONSUMER_SECRET"),
#     }
#     result = requests.post(
#         f'{config("TOKEN_URL")}',
#         json=token_data,
#         headers={"Accept": "application/json", "Api-Key": f'{config("TOKEN_API_KEY")}'},
#     )
#     result_json = result.json()

#     token = result_json["access_token"]

#     data = {
#         "action": "Send",
#         "callback_url": "https://webhook.site/3",
#         "sms": [
#             {
#                 "sender_name": "MOBITICKET",
#                 "msisdn": f"{instance.customer_order.payment_account_number}",
#                 "message": f"Your payment of KES {instance.amount} to {instance.entity.title} for order number {instance.reference_number} was SUCCESSFUL.",
#             }
#         ],
#     }

#     result = requests.post(
#         f'{config("SEND_SMS_URL")}',
#         json=data,
#         headers={"Accept": "application/json", "Access-Token": f"{token}"},
#     )

#     print("result5", result.json())

#     result_json = result.json()
#     print("result at sending sms", result_json)
#     order_items = None

#     #    Decrement inventory
#     if CustomerOrderItems.objects.filter(
#         customer_order=instance.customer_order
#     ).exists():
#         order_items = CustomerOrderItems.objects.filter(
#             customer_order=instance.customer_order
#         ).all()
#         for item in order_items:
#             print(" item unit qty1", item.retailer_receipt.unit_quantity)
#             print("item pack qty1", item.retailer_receipt.pack_quantity)
#             item.retailer_receipt.unit_quantity = (
#                 item.retailer_receipt.unit_quantity - item.purchased_quantity
#             )
#             item.retailer_receipt.save()
#             item.retailer_receipt.pack_quantity = (
#                 item.retailer_receipt.unit_quantity
#                 / item.retailer_receipt.product.units_per_pack
#             )

#             print(" item unit qty2", item.retailer_receipt.unit_quantity)

#     else:
#         print("No order items")

#     # retailer_order_items = CustomerOrderItems.objects.filter(
#     #     customer_order=sender.customer_order)
#     # for item in retailer_order_items:
#     #     print('db qty', item.retailer_receipt.unit_quantity)
#     #     print('purchased qty', item.purchased_quantity)
#     #     item.retailer_receipt.unit_quantity = int(item.retailer_receipt.unit_quantity) - \
#     #         int(item.purchased_quantity)
#     #     item.retailer_receipt.save()
#     #     item.retailer_receipt.pack_quantity = int(item.retailer_receipt.unit_quantity) / int(
#     #         item.retailer_receipt.product.units_per_pack)
#     #     item.retailer_receipt.save()


class RetailerPayments(EntityRelatedModel):
    PAYMENT_STATUS_CHOICES = (
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )

    customer_order = models.ForeignKey(
        CustomerOrders, related_name="customer_order", on_delete=models.CASCADE
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="payment_method",
        on_delete=models.CASCADE,
    )
    narrative = models.CharField(max_length=300, null=True, blank=True)
    reference = models.CharField(max_length=120, null=False, blank=False)
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )
    order_set_paid = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        "authentication.Users",
        related_name="retailer_payment_created_by",
        on_delete=models.CASCADE,
    )

class NarrationOptions(models.TextChoices):
    REGISTRATION = "REGISTRATION", _("REGISTRATION")
    SUBSCRIPTION = "SUBSCRIPTION", _("SUBSCRIPTION")
    CUSTOMER_TO_RETAILER = "CUSTOMER_TO_RETAILER", _("CUSTOMER_TO_RETAILER")
    RETAILER_TO_WHOLESALER = "RETAILER_TO_WHOLESALER", _("RETAILER_TO_WHOLESALER")
    WHOLESALER_TO_DISTRIBUTOR = "WHOLESALER_TO_DISTRIBUTOR", _(
        "WHOLESALER_TO_DISTRIBUTOR"
    )

class StatusOptions(models.TextChoices):
    DEFERRED = "DEFERRED", _("DEFERRED")
    SUCCESS = "SUCCESS", _("SUCCESS")
    FAILED = "FAILED", _("FAILED")
    PENDING = "PENDING", _("PENDING")

class DirectionOptions(models.TextChoices):
    ISSUE = "ISSUE", _("ISSUE")
    FAILED = "RECEIPT", _("RECEIPT")

class CustomerOrderPayment(EntityRelatedModel):
    payment_services_provider = models.ForeignKey(
        "payments.PaymentServicesProvider",
        related_name="paying_entity",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    customer_order = models.ForeignKey(
        CustomerOrders,
        related_name="paying_entity",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    paying_entity = models.ForeignKey(
        Entities,
        related_name="paying_entity",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    receiving_entity = models.ForeignKey(
        Entities,
        related_name="receiving_entity",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="payments_payment_method",
        on_delete=models.CASCADE,
    )
    reference_number = models.CharField(max_length=50, default="")
    description = models.CharField(max_length=256, default="", null=True,blank=True)
    telco = models.CharField(max_length=50, null=True, blank=True)
    psp_reference_number = models.CharField(max_length=50, default="")
    currency = models.CharField(max_length=50, default="")
    provider_reference_number = models.CharField(max_length=50, null=True)
    narration = models.CharField(
        verbose_name=_("Narration"),
        choices=NarrationOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    administrator_account = models.ForeignKey(
        "payments.UserAccounts",
        related_name="payment_administrator_account",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    entity_collection_account = models.ForeignKey(
        "payments.EntityPSPCollectionAccount",
        related_name="payment_destination_account",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    transaction_charge = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00
    )
    is_validated = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="payment_created_by", on_delete=models.CASCADE
    )
    class Meta:
        verbose_name_plural="Customer Order Payments"

    # def __str__(self) -> str:
    #     return self.entity_collection_account
    # def save(self, *args, **kwargs):
    #     if self.status:
           
    #         self.customer_order.status = self.status
    #         self.customer_order.save()

    #     super(CustomerOrderPayment, self).save(*args, **kwargs)

class CustomerOrderSettlement(EntityRelatedModel):
    receiving_entity=models.ForeignKey(Entities, related_name="settled_entity",on_delete=models.CASCADE)
    customer_order_payment=models.OneToOneField(CustomerOrderPayment,on_delete=models.CASCADE)
    entity_collection_account=models.ForeignKey("payments.EntityPSPCollectionAccount",on_delete=models.CASCADE,null=True, blank=True)
    reference_number = models.CharField(
        max_length=56,
    )
    psp_reference_number = models.CharField(
        max_length=56,
    )
    account_from = models.CharField(
        max_length=56, 
    )
    account_to = models.CharField(
        max_length=56, 
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

PRODUCT_MOVEMENT_OPTIONS = (
    ("ISSUE", "ISSUE"),
    ("RECEIPT", "RECEIPT"),
)

class ProductMovement(EntityRelatedModel):
    product=models.ForeignKey("products.Products", related_name="product_movement_product",on_delete=models.CASCADE)
    retailer_receipt=models.ForeignKey(RetailerReceipts, related_name="product_movement_receipt",on_delete=models.CASCADE,null=True,blank=True)
    customer_order_item=models.ForeignKey(CustomerOrderItems, related_name="product_movement_order_item",on_delete=models.CASCADE,null=True,blank=True)
    quantity = models.IntegerField()
    balance = models.IntegerField(default=0)
    direction = models.CharField(
        verbose_name=_("Direction"),
        choices=DirectionOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    owner=models.ForeignKey(Users, related_name="product_movement_owner",on_delete=models.DO_NOTHING)
    transaction_date = models.DateTimeField()
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)



# class Wishlists(EntityRelatedModel):
#     title = models.CharField(max_length=256, null=True, blank=True)
#     description = models.TextField(null=True, blank=True)
#     limit_amount = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
#     wishlist_price_total = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
#     owner=models.ForeignKey(Users, related_name="wishlist_owner",on_delete=models.DO_NOTHING)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)

# class Wishlist"products.Products"(EntityRelatedModel):
#     product=models.ForeignKey(RetailerReceipts, related_name="wishlist_product_product",on_delete=models.CASCADE)
#     title = models.CharField(max_length=256, null=True, blank=True)
#     description = models.TextField(null=True, blank=True)
#     quantity=models.IntegerField()
#     unit_of_issue = models.CharField(
#         verbose_name=_("Unit of Issue"),
#         choices=UnitOfIssue.choices,default="PIECE",
#         max_length=20,
#     )
#     item_price = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
#     item_price_total = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
#     owner=models.ForeignKey(Users, related_name="wishlist_product_owner",on_delete=models.DO_NOTHING)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)


class PurchasesReturns(EntityRelatedModel):
    class Meta:
        verbose_name_plural="Purchases Returns"
    draft_id = models.CharField(
        max_length=256, null=True, blank=True,
    )
    retailer_receipt = models.ForeignKey(RetailerReceipts,related_name="purchase_return_inventory", on_delete=models.CASCADE,null=True,blank=True)
    retailer_order = models.ForeignKey(RetailerOrders,related_name="purchase_return_inventory", on_delete=models.CASCADE,null=True,blank=True)
    quantity = models.IntegerField(default=0)
    justification = models.CharField(max_length=256)
    owner = models.ForeignKey(
        Users,
        related_name="purchases_returned_by",
        on_delete=models.CASCADE,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class SalesReturns(EntityRelatedModel):
    class Meta:
        verbose_name_plural="Sales Returns"
    draft_id = models.CharField(
        max_length=256, null=True, blank=True,
    )
    customer_order = models.ForeignKey(CustomerOrders,related_name="sales_return_order", on_delete=models.CASCADE,null=True,blank=True)
    retailer_receipt = models.ForeignKey(RetailerReceipts,related_name="sales_return_inventory", on_delete=models.CASCADE,null=True,blank=True)
    quantity = models.IntegerField(default=0)
    justification = models.CharField(max_length=256)
    owner = models.ForeignKey(
        Users,
        related_name="sales_returned_by",
        on_delete=models.CASCADE,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
class StockAdjustments(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Stock Adjustment"

    RETURN_INTENTS = (
        ("NONE", "NONE"),
        ("WHOLESALER_RETURN", "WHOLESALER_RETURN"),
        ("CUSTOMER_RETURN", "CUSTOMER_RETURN"),
        ("EXPIRY_WRITE_OFF", "EXPIRY_WRITE_OFF"),
        ("DAMAGE_WRITE_OFF", "DAMAGE_WRITE_OFF"),
        ("INTERNAL_CORRECTION", "INTERNAL_CORRECTION"),
    )

    retailer_receipt = models.ForeignKey(
        "retailers.RetailerReceipts",
        related_name="stock_adjustment_inventory",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    quantity = models.IntegerField(default=0)
    justification = models.CharField(max_length=256)
    direction = models.CharField(
        max_length=50, choices=STOCK_ADJUSTMENT_DIRECTION_OPTIONS,
    )

    # ---- NEW FIELD 1 ----
    return_intent = models.CharField(
        max_length=30,
        choices=RETURN_INTENTS,
        default="NONE",
        help_text=(
            "When 'WHOLESALER_RETURN', this adjustment signals the "
            "wholesaler that goods are inbound and should expect a "
            "return. The paired WholesalerReceiptReturns is created in "
            "the same transaction."
        ),
    )

    # ---- NEW FIELD 2 ----
    linked_return = models.ForeignKey(
        "wholesalers.WholesalerReceiptReturns",
        related_name="initiating_adjustments",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        help_text=(
            "The WholesalerReceiptReturns created alongside this "
            "adjustment. Set for return_intent=WHOLESALER_RETURN."
        ),
    )

    owner = models.ForeignKey(
        Users, related_name="stock_adjusted_by", on_delete=models.CASCADE,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    class Meta:
        verbose_name_plural="Stock Adjustment"
    retailer_receipt = models.ForeignKey(RetailerReceipts,related_name="stock_adjustment_inventory", on_delete=models.CASCADE,null=True,blank=True)
    quantity = models.IntegerField(default=0)
    justification = models.CharField(max_length=256)
    direction = models.CharField(
        max_length=50, choices=STOCK_ADJUSTMENT_DIRECTION_OPTIONS,
    )
    owner = models.ForeignKey(
        Users,
        related_name="stock_adjusted_by",
        on_delete=models.CASCADE,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)



# =====================================================================
# Product Request Feature
# =====================================================================

class RetailerProductRequest(EntityRelatedModel):
    """
    A proforma-style request from a retailer to their wholesale network.

    Contains N lines (RetailerProductRequestItem). Wholesalers respond
    per line (RetailerProductRequestOffer). The retailer confirms offers
    per line, splitting across wholesalers if desired. Confirmed offers
    become RetailerOrderItems grouped by wholesaler.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", _("Draft — not yet published")
        PUBLISHED = "PUBLISHED", _("Published — accepting offers")
        ACKNOWLEDGED = "ACKNOWLEDGED", _("At least one offer received")
        PARTIALLY_FULFILLED = "PARTIALLY_FULFILLED", _("Some lines fulfilled")
        FULFILLED = "FULFILLED", _("All lines fulfilled")
        CANCELLED = "CANCELLED", _("Cancelled by retailer")
        EXPIRED = "EXPIRED", _("Expired")

    class Urgency(models.TextChoices):
        LOW = "low", _("Low")
        MEDIUM = "medium", _("Medium")
        HIGH = "high", _("High")

    request_number = models.CharField(
        max_length=32, unique=True, null=True, blank=True,
    )

    # Deterministic client-generated correlation key.
    # Format: `${userId}:${productId}:${createdMs}` — see
    # RetailerProductRequestsSyncContext.buildDraftId on the client.
    # Nullable because older rows and server-created requests won't
    # have one. Indexed because the client matches responses back to
    # its local draft by this value.
    draft_id = models.CharField(
        max_length=256,
        null=True,
        blank=True,
        db_index=True,
        help_text=(
            "Client-side correlation key that ties a local draft "
            "to the server-side RetailerProductRequest created from it."
        ),
    )

    urgency = models.CharField(
        max_length=10, choices=Urgency.choices, default=Urgency.MEDIUM,
    )
    note = models.CharField(max_length=256, blank=True, default="")
    status = models.CharField(
        max_length=25, choices=Status.choices, default=Status.DRAFT,
    )

    total_line_count = models.IntegerField(default=0)
    fulfilled_line_count = models.IntegerField(default=0)
    pending_line_count = models.IntegerField(default=0)

    expires_at = models.DateTimeField(null=True, blank=True)
    fulfilled_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    owner = models.ForeignKey(
        "authentication.Users",
        on_delete=models.CASCADE,
        related_name="retailer_product_requests",
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Retailer Product Requests"
        ordering = ["-created"]
        indexes = [
            models.Index(fields=["entity", "status", "-created"]),
            models.Index(fields=["status", "-created"]),
            models.Index(fields=["draft_id"]),
        ]
        constraints = [
            # Only one DRAFT per (entity, draft_id). Two devices with
            # different draft_ids can each keep their own draft open,
            # but a single draft can only exist once on the server.
            models.UniqueConstraint(
                fields=["entity", "draft_id"],
                condition=models.Q(
                    status="DRAFT",
                    draft_id__isnull=False,
                ),
                name="one_draft_request_per_entity_and_draft_id",
            ),
            # Belt-and-braces: one DRAFT per entity, no draft_id.
            # Remove this one if you want to support multi-device.
            models.UniqueConstraint(
                fields=["entity"],
                condition=models.Q(
                    status="DRAFT",
                    draft_id__isnull=True,
                ),
                name="one_draft_request_per_entity_no_draft_id",
            ),
        ]

    def __str__(self):
        return f"{self.request_number or '(unsaved)'} · {self.entity.title}"

    
class RetailerProductRequestItem(EntityRelatedModel):
    """
    One product line on a request. Demand side only — no wholesaler
    references. Wholesaler responses live on RetailerProductRequestOffer.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", _("No offers yet")
        OFFERED = "OFFERED", _("Offers received")
        PARTIALLY_FULFILLED = "PARTIALLY_FULFILLED", _("Partially confirmed")
        FULFILLED = "FULFILLED", _("Fully fulfilled")
        CANCELLED = "CANCELLED", _("Cancelled")

    request = models.ForeignKey(
        RetailerProductRequest,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        "products.Products",
        on_delete=models.CASCADE,
        related_name="request_items",
    )

    # Same correlation key as the parent request. Denormalized so the
    # client can match a single line if needed without a join.
    draft_id = models.CharField(
        max_length=256,
        null=True,
        blank=True,
        db_index=True,
    )

    requested_quantity = models.IntegerField(default=0)
    urgency = models.CharField(
        max_length=10,
        choices=RetailerProductRequest.Urgency.choices,
        default=RetailerProductRequest.Urgency.MEDIUM,
    )
    note = models.CharField(max_length=256, blank=True, default="")

    status = models.CharField(
        max_length=25, choices=Status.choices, default=Status.PENDING,
    )

    # Aggregates across offers (denormalized for fast display)
    offer_count = models.IntegerField(default=0)
    total_offered_quantity = models.IntegerField(default=0)
    confirmed_quantity = models.IntegerField(default=0)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        "authentication.Users",
        on_delete=models.CASCADE,
        related_name="retailer_product_request_items",
    )

    class Meta:
        verbose_name_plural = "Retailer Product Request Items"
        ordering = ["created"]
        indexes = [
            models.Index(fields=["request", "status"]),
            models.Index(fields=["product", "status"]),
            models.Index(fields=["draft_id"]),
        ]

    def __str__(self):
        return f"{self.product.title} × {self.requested_quantity}"
    
class RetailerProductRequestOffer(EntityRelatedModel):
    """
    One wholesaler's offer against a request line.

    Multiple wholesalers can offer against the same line. The retailer
    picks which to confirm. Each confirmed offer produces a
    RetailerOrderItem on that wholesaler's RetailerOrder.
    """

    class Status(models.TextChoices):
        OFFERED = "OFFERED", _("Awaiting retailer")
        CONFIRMED = "CONFIRMED", _("Confirmed by retailer")
        DECLINED_BY_RETAILER = "DECLINED_BY_RETAILER", _("Declined by retailer")
        WITHDRAWN = "WITHDRAWN", _("Withdrawn — stock consumed")
        FULFILLED = "FULFILLED", _("Order item created")
        CANCELLED = "CANCELLED", _("Cancelled by wholesaler")

    request_item = models.ForeignKey(
        RetailerProductRequestItem,
        on_delete=models.CASCADE,
        related_name="offers",
    )
    wholesaler = models.ForeignKey(
        "authentication.Entities",
        on_delete=models.CASCADE,
        related_name="product_request_offers",
    )
    wholesaler_receipt = models.ForeignKey(
        "wholesalers.WholesalerReceipts",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="request_offers",
    )

    # Snapshotted at offer time
    offered_quantity = models.IntegerField(default=0)
    offered_unit_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
    )
    batch = models.CharField(max_length=50, null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    manufacture_date = models.DateField(null=True, blank=True)
    is_placement = models.BooleanField(default=False)

    status = models.CharField(
        max_length=25, choices=Status.choices, default=Status.OFFERED,
    )

    retailer_confirmed_at = models.DateTimeField(null=True, blank=True)
    retailer_response_note = models.CharField(max_length=256, blank=True, default="")

    responded_by_user = models.ForeignKey(
        "authentication.Users",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="product_request_offers",
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    response_note = models.CharField(max_length=256, blank=True, default="")

    resulting_order_item = models.ForeignKey(
        "wholesalers.RetailerOrderItems",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="source_offer",
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Retailer Product Request Offers"
        ordering = ["offered_unit_price", "-offered_quantity"]
        constraints = [
            models.UniqueConstraint(
                fields=["request_item", "wholesaler"],
                name="one_offer_per_wholesaler_per_line",
            ),
        ]
        indexes = [
            models.Index(fields=["request_item", "status"]),
            models.Index(fields=["wholesaler", "status"]),
            models.Index(fields=["wholesaler_receipt"]),
        ]

    def __str__(self):
        return (
            f"{self.wholesaler.title} → {self.offered_quantity} "
            f"@ {self.offered_unit_price}"
        )

    def clean(self):
        from django.core.exceptions import ValidationError

        super().clean()
        errors = {}

        if self.wholesaler_receipt_id and self.wholesaler_id:
            if self.wholesaler_receipt.entity_id != self.wholesaler_id:
                errors["wholesaler_receipt"] = (
                    "The receipt must belong to the offering wholesaler."
                )

        if (
            self.wholesaler_receipt_id
            and self.request_item_id
            and self.wholesaler_receipt.product_id != self.request_item.product_id
        ):
            errors["wholesaler_receipt"] = (
                "The receipt must be for the same product as the request line."
            )

        if errors:
            raise ValidationError(errors)


class RetailerProductRequestResponse(EntityRelatedModel):
    """
    Header-level record of a wholesaler's response to a request.

    Aggregates what the wholesaler offered across lines. Line-level
    detail lives on RetailerProductRequestOffer.
    """

    class ResponseType(models.TextChoices):
        FULL = "FULL", _("All offered lines accepted")
        PARTIAL = "PARTIAL", _("Some lines accepted")
        REJECTED = "REJECTED", _("All lines rejected")
        ACKNOWLEDGED = "ACKNOWLEDGED", _("Response made, nothing accepted yet")

    request = models.ForeignKey(
        RetailerProductRequest,
        on_delete=models.CASCADE,
        related_name="responses",
    )
    wholesaler = models.ForeignKey(
        "authentication.Entities",
        on_delete=models.CASCADE,
        related_name="product_request_responses",
    )
    response_type = models.CharField(
        max_length=20, choices=ResponseType.choices,
    )
    note = models.CharField(max_length=256, blank=True, default="")

    offered_line_count = models.IntegerField(default=0)
    rejected_line_count = models.IntegerField(default=0)

    resulting_orders = models.ManyToManyField(
        "wholesalers.RetailerOrders",
        blank=True,
        related_name="source_request_responses",
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Retailer Product Request Responses"
        ordering = ["-created"]
        constraints = [
            models.UniqueConstraint(
                fields=["request", "wholesaler"],
                name="one_response_per_request_wholesaler",
            ),
        ]

    def __str__(self):
        return f"{self.wholesaler.title} → {self.response_type}"