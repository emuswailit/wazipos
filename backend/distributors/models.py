import re
from django.contrib.auth import get_user_model
from django.db import models
from authentication.models import Entities, Stakes, Users
from core.models import EntityRelatedModel
# from manufacturers.models import DistributorOrderItems, DistributorOrders
from products.models import Products
from django.core.validators import MinValueValidator, MaxValueValidator
# from payments.models import PaymentMethods, PriceDiscounts, QuantityDiscounts
from employees.models import Employees
from core.constants import UNITS_OF_ISSUE_CHOICES

# Distributors — sell to wholesalers, as wholesalers sell to retailers
# (wholesalers/). Kept in their own tables: the distributor <-> wholesaler trade
# is its own domain. Rules live in distributors/services/.
#
#   DistributorReceipts          stock lots (what a distributor has to sell)
#   DistributorPriceDiscounts    a lower price for a period
#   DistributorQuantityDiscounts buy N, get M free
#   WholesalerOrders / Items     a wholesaler's order on a distributor
#   DistributorPayments          payments on those orders (mobile money into the
#                                system till, or recorded by distributor staff)
User = get_user_model()

TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)


class DistributorVariations(EntityRelatedModel):
    product = models.ForeignKey(
        Products, related_name="distributor_variation_product", on_delete=models.CASCADE
    )
    minimum_stock = models.IntegerField(null=True, blank=True, default=0)
    maximum_stock = models.IntegerField(null=True, blank=True, default=0)
    reorder_level = models.IntegerField(null=True, blank=True, default=0)
    lead_time = models.IntegerField(null=True, blank=True, default=0)
    safety_stock = models.IntegerField(null=True, blank=True, default=0)
    danger_stock = models.IntegerField(null=True, blank=True, default=0)
    economic_order_quantity = models.IntegerField(
        null=True, blank=True, default=0)
    is_drug = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.product.title}"


class DistributorReceipts(EntityRelatedModel):
    product = models.ForeignKey(
        Products, related_name="distributor_receipt_product", on_delete=models.CASCADE
    )
    received_from = models.ForeignKey(
        Entities,
        related_name="distributor_receipt_entity",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    employee = models.ForeignKey(
        Employees, related_name="employee_for_distributor_variation", on_delete=models.CASCADE,
        null=True, blank=True,
    )
    batch = models.CharField(
        max_length=100, editable=True, null=True, blank=True)
    distributor_variation = models.ForeignKey(
        DistributorVariations,
        related_name="distributor_variation_receipt",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    # distributor_order_item = models.ForeignKey(
    #     DistributorOrderItems,
    #     related_name="product_distributor_order_item",
    #     null=True,
    #     blank=True,
    #     on_delete=models.CASCADE,
    # )
    # quantity_discount = models.ForeignKey(
    #     QuantityDiscounts,
    #     related_name="distributor_quantity_discount",
    #     null=True,
    #     blank=True,
    #     on_delete=models.CASCADE,
    # )
    # price_discount = models.ForeignKey(
    #     PriceDiscounts,
    #     related_name="distributor_quantity_discount",
    #     null=True,
    #     blank=True,
    #     on_delete=models.CASCADE,
    # )
    # Legacy pack figures (older screens); unit_* below are what pricing uses.
    pack_buying_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pack_selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pack_quantity = models.BigIntegerField(default=0)
    manufacture_date = models.DateField(default=None, null=True, blank=True)
    expiry_date = models.DateField(default=None, null=True, blank=True)

    # ---- the lot as sold to wholesalers
    draft_id = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    bar_code = models.CharField(max_length=100, null=True, blank=True)
    unit_of_receipt = models.CharField(max_length=20, choices=UNITS_OF_ISSUE_CHOICES, default="Pack")
    received_unit_quantity = models.BigIntegerField(default=0)
    current_unit_quantity = models.BigIntegerField(default=0)
    unit_buying_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit_selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Set from the active price discount (sync_price_from_discounts).
    discount_unit_selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    final_unit_selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Listed = wholesalers can see and order it.
    is_listed = models.BooleanField(default=True)
    is_drug = models.BooleanField(default=False)
    description = models.TextField(max_length=300, blank=True, default="")
    is_active = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.product.title} ({self.batch or 'no batch'})"

    def sync_price_from_discounts(self):
        """final price = the most recent active price discount's offer, else the list price."""
        from decimal import Decimal

        from django.utils import timezone

        today = timezone.localdate()
        price = Decimal(self.unit_selling_price or 0)
        active = (
            self.price_discounts.filter(is_active=True, start__lte=today, end__gte=today)
            .order_by("-start", "-created").first()
        )
        offer = Decimal("0")
        if active:
            offer = Decimal(active.offer_price or 0)
            if offer <= 0 and active.percent:
                offer = (price * (Decimal("100") - Decimal(active.percent)) / Decimal("100")).quantize(Decimal("0.01"))
        if active and Decimal("0") < offer < price:
            self.discount_unit_selling_price = price - offer
            self.final_unit_selling_price = offer
        else:
            self.discount_unit_selling_price = Decimal("0")
            self.final_unit_selling_price = price
        type(self).objects.filter(pk=self.pk).update(
            discount_unit_selling_price=self.discount_unit_selling_price,
            final_unit_selling_price=self.final_unit_selling_price,
        )

    def save(self, *args, **kwargs):
        if self.product.preparation:
            self.is_drug = True
        if self.batch:
            self.batch = self.batch.upper()
        if self.product and self.product.bar_code and not self.bar_code:
            self.bar_code = self.product.bar_code
        super(DistributorReceipts, self).save(*args, **kwargs)


class DistributorPriceDiscounts(EntityRelatedModel):
    """A lower price on one lot for a period (offer_price, or percent off the list price)."""

    distributor_receipt = models.ForeignKey(DistributorReceipts, related_name="price_discounts", on_delete=models.CASCADE)
    title = models.CharField(max_length=100)
    percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    normal_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    offer_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    start = models.DateField()
    end = models.DateField()
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Distributor price discounts"
        ordering = ["-start", "-created"]

    def __str__(self):
        return f"{self.title} ({self.offer_price or str(self.percent) + '%'})"


class DistributorQuantityDiscounts(EntityRelatedModel):
    """Buy limit_quantity, get awarded_quantity free (repeats: 2x the quantity, 2x free)."""

    distributor_receipt = models.ForeignKey(DistributorReceipts, related_name="quantity_discounts", on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    limit_quantity = models.PositiveIntegerField()
    awarded_quantity = models.PositiveIntegerField()
    start = models.DateField()
    end = models.DateField()
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Distributor quantity discounts"
        ordering = ["-start", "-created"]

    def __str__(self):
        return f"{self.title}: buy {self.limit_quantity} get {self.awarded_quantity}"


class DistributorReviews(EntityRelatedModel):
    variation = models.ForeignKey(
        DistributorVariations, on_delete=models.CASCADE)
    rating = models.IntegerField(null=True, blank=True, default=0)
    comment = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="distributor_review_owner", on_delete=models.CASCADE
    )


class DistributorCoupons(models.Model):
    code = models.CharField(max_length=50, unique=True)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    discount = models.IntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    is_active = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="distributorCouponOwner", on_delete=models.CASCADE
    )

    def __str__(self):
        return self.code


class WholesalerOrders(EntityRelatedModel):
    """
    Order that a wholesaler places on a distributor premises
    """

    DELIVERY_CHOICES = (
        ("SELF", "SELF"),
        ("COURIER", "COURIER"),
    )
    TERMS_CHOICES = (
        ("CASH", "CASH"),
        ("CREDIT", "CREDIT"),
        ("FACILITY", "FACILITY"),
        ("PLACEMENT", "PLACEMENT"),
    )
    distributor = models.ForeignKey(
        Entities, related_name="ordering_wholesaler", on_delete=models.CASCADE
    )
    distributor_payment = models.ForeignKey(
        "distributors.DistributorPayments",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    shipping_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    tax_total = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    discount_total = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    items_price_total = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    net_price_total = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    final_amount_total = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    order_terms = models.CharField(max_length=20, choices=TERMS_CHOICES)
    draft_id = models.CharField(max_length=100, null=True, blank=True)
    payment = models.ForeignKey(
        "distributors.DistributorPayments",
        related_name="distributor_order_payment",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_paid = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    employee = models.ForeignKey(
        Employees, related_name="employee_for_wholesaler_order", on_delete=models.CASCADE,
        null=True, blank=True,
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        Users,
        related_name="order_paid_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_delivered = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    delivered_at = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    delivered_by = models.ForeignKey(
        Users,
        related_name="orderDeliveredBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_processed = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_by = models.ForeignKey(
        Users,
        related_name="orderProcessedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_packed = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    packed_at = models.DateTimeField(null=True, blank=True)
    packed_by = models.ForeignKey(
        Users,
        related_name="orderPackedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_received = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    received_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(
        Users,
        related_name="orderReceivedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_approved = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        Users,
        related_name="distributor_orderApprovedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    # SELF = the wholesaler collects; COURIER = delivered (logistics.Shipment).
    delivery_method = models.CharField(max_length=20, choices=DELIVERY_CHOICES, default="SELF")

    # ---- the order as placed and followed (distributors/services/orders.py)
    STATUS_CHOICES = (
        ("SUBMITTED", "Submitted"),
        ("PAID", "Paid"),
        ("PREPARING", "Preparing"),
        ("PACKED", "Packed"),
        ("READY", "Ready"),
        ("COLLECTED", "Collected"),
        ("DISPATCHED", "Dispatched"),
        ("RECEIVED", "Received into stock"),
        ("REJECTED", "Rejected by the distributor"),
        ("CANCELLED", "Cancelled"),
    )
    ORIGIN_CHOICES = (("WHOLESALER", "Placed by the wholesaler"), ("STAFF", "Taken by distributor staff"))
    wholesaler = models.ForeignKey(
        Entities, related_name="orders_on_distributors", on_delete=models.CASCADE, null=True, blank=True,
    )
    reference_number = models.CharField(max_length=56, null=True, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SUBMITTED", db_index=True)
    order_origin = models.CharField(max_length=20, choices=ORIGIN_CHOICES, default="WHOLESALER")
    payment_method = models.ForeignKey(
        "payments.PaymentMethods", related_name="wholesaler_orders_paid_with",
        on_delete=models.SET_NULL, null=True, blank=True,
    )
    gross_price_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    final_price_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.CharField(max_length=300, blank=True, default="")
    rejected_reason = models.CharField(max_length=300, blank=True, default="")
    rejected_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    collected_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    stock_deducted_at = models.DateTimeField(null=True, blank=True)
    distributor_coupon = models.ForeignKey(
        DistributorCoupons,
        related_name="distributor_order_coupon",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="distributor_order_owner", on_delete=models.CASCADE
    )

    def save(self, *args, **kwargs):

        if self.distributor_coupon:
            self.discount = self.distributor_coupon.discount
        super(WholesalerOrders, self).save(*args, **kwargs)


class WholesalerOrderItems(EntityRelatedModel):
    wholesaler_order = models.ForeignKey(
        WholesalerOrders, related_name="item_wholesaler_order", on_delete=models.CASCADE
    )
    distributor_receipt = models.ForeignKey(
        DistributorReceipts,
        related_name="distributor_order_item_receipt",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    purchased_quantity = models.IntegerField(default=0)
    discount_quantity = models.IntegerField(default=0)
    total_quantity = models.IntegerField(default=0)
    is_received = models.BooleanField(default=False)
    received_at = models.DateTimeField(null=True, blank=True)
    item_discount = models.IntegerField(default=0)
    # Priced by the server when the order is placed (distributors/services/orders.py):
    unit_of_issue = models.CharField(max_length=20, blank=True, default="")
    item_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)          # list price per unit
    item_final_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)    # price per unit charged
    item_price_discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    item_final_price_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    item_gross_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_net_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_tax = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_pending_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    item_paid_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00)
    stakeholders = models.ManyToManyField(Stakes)
    distributor_coupon = models.ForeignKey(
        DistributorCoupons,
        related_name="manufacturer_order_coupon",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created = models.DateField(auto_now_add=True)
    updated = models.DateField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="wholesaler_ordering_agent", on_delete=models.CASCADE
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["wholesaler_order", "distributor_receipt"],
                name="One receipt item in order",
            )
        ]


class DistributorPayments(EntityRelatedModel):
    PAYMENT_STATUS_CHOICES = (
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )
    distributor = models.ForeignKey(
        Entities, related_name="distributorPayee", on_delete=models.CASCADE
    )
    wholesaler_order = models.ForeignKey(
        WholesalerOrders, related_name="wholesaler_order", on_delete=models.CASCADE
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    # payment_method = models.ForeignKey(
    #     PaymentMethods,
    #     related_name="distributorPaymentMethod",
    #     on_delete=models.CASCADE,
    # )
    narrative = models.CharField(max_length=300, null=True, blank=True)
    reference = models.CharField(max_length=120, blank=True, default="")
    # Mobile money into the WaziPOS system till, then settled to the distributor
    # (distributors/services/payments.py); other methods are recorded by the
    # distributor's staff, paid and settled at once.
    payment_method = models.ForeignKey(
        "payments.PaymentMethods", related_name="distributor_payments",
        on_delete=models.SET_NULL, null=True, blank=True,
    )
    pay_in_reference_number = models.CharField(max_length=120, null=True, blank=True, db_index=True)
    psp_reference_number = models.CharField(max_length=120, blank=True, default="")
    provider_reference_number = models.CharField(max_length=120, blank=True, default="")
    description = models.CharField(max_length=120, blank=True, default="")
    telco = models.CharField(max_length=40, blank=True, default="")
    currency = models.CharField(max_length=10, default="KES")
    commission_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payout_account = models.ForeignKey(
        "payments.PayoutAccounts", related_name="distributor_payments",
        on_delete=models.SET_NULL, null=True, blank=True,
    )
    payout_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_paid = models.BooleanField(default=False)
    is_settled = models.BooleanField(default=False)
    settled_at = models.DateTimeField(null=True, blank=True)
    pay_out_reference_number = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )
    orderSetPaid = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        "authentication.Users",
        related_name="manufacturerPaymentOwner",
        on_delete=models.CASCADE,
    )
