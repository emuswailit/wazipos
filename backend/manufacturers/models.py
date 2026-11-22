from django.contrib.auth import get_user_model
from django.db import models
from authentication.models import Entities, Stakes
from core.models import EntityRelatedModel
from django.core.validators import MinValueValidator, MaxValueValidator


# Manufacturers
Users = get_user_model()


TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)


class ManufacturerVariations(EntityRelatedModel):
    batch = models.CharField(
        max_length=100,  editable=True, null=True, blank=True)
    product = models.ForeignKey(
        "products.Products", related_name="manufacturer_variation_product", on_delete=models.CASCADE)
    pack_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2,)
    pack_quantity = models.BigIntegerField()
    manufacture_date = models.DateField(auto_now_add=True)
    expiry_date = models.DateField(auto_now=True)
    is_active = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    employee = models.ForeignKey(
        "employees.Employees", related_name="employee_for_manufacturer_variation", on_delete=models.CASCADE
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.title}"

    def save(self, *args, **kwargs):
        if self.batch:
            self.batch = self.batch.upper()

        if self.product.preparation:
            self.is_drug = True

        super(ManufacturerVariations, self).save(*args, **kwargs)


class ManufacturerReviews(EntityRelatedModel):
    variation = models.ForeignKey(
        ManufacturerVariations, on_delete=models.CASCADE)
    rating = models.IntegerField(null=True, blank=True, default=0)
    comment = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="manufacturer_review_owner", on_delete=models.CASCADE)


class ManufacturerCoupons(models.Model):
    code = models.CharField(max_length=50,
                            unique=True)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    discount = models.IntegerField(
        validators=[MinValueValidator(0),
                    MaxValueValidator(100)])
    active = models.BooleanField()
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="manufacturer_coupon_owner", on_delete=models.CASCADE)

    def __str__(self):
        return self.code


class DistributorOrders(EntityRelatedModel):
    """
    Order that a distributor places on a manufacturer premises
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
    manufacturer = models.ForeignKey(
        'authentication.Entities', related_name="orderingDistributor", on_delete=models.CASCADE)
    is_paid = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    is_processed = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    payment = models.ForeignKey(
        'manufacturers.ManufacturerPayments', on_delete=models.CASCADE, null=True, blank=True)
    order_shipping_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    order_total_tax = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    order_total_discount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    order_gross_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    order_net_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    order_final_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    paid_at = models.DateTimeField(auto_now_add=True)
    is_dispatched = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    dispatched_by = models.ForeignKey(
        Users, related_name="manufacturerOrderDispachedBy", on_delete=models.CASCADE, null=True, blank=True)
    dispatched_at = models.DateTimeField(auto_now_add=True)
    is_checked = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    checked_by = models.ForeignKey(
        Users, related_name="manufacturerOrderCheckedBy", on_delete=models.CASCADE, null=True, blank=True)
    checked_at = models.DateTimeField(auto_now_add=True)
    is_delivered = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    delivered_by = models.ForeignKey(
        Users, related_name="manufacturerOrderDeliveredBy", on_delete=models.CASCADE, null=True, blank=True)
    delivered_at = models.DateTimeField(auto_now_add=True)
    is_approved = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    approvedd_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(auto_now_add=True)
    processed_by = models.ForeignKey(
        Users, related_name="manufacturerOrderProcessedBy", on_delete=models.CASCADE, null=True, blank=True)
    is_packed = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    packed_at = models.DateTimeField(auto_now_add=True)
    packed_by = models.ForeignKey(
        Users, related_name="manufacturerOrderPackedBy", on_delete=models.CASCADE, null=True, blank=True)
    is_received = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    received_at = models.DateTimeField(auto_now_add=True)
    received_by = models.ForeignKey(
        Users, related_name="manufacturerOrderReceivedBy", on_delete=models.CASCADE, null=True, blank=True)
    delivery_method = models.CharField(max_length=20, choices=DELIVERY_CHOICES)
    order_terms = models.CharField(max_length=20, choices=TERMS_CHOICES)
    draft_id = models.CharField(max_length=100, null=True, blank=True)
    manufacturer_coupon = models.ForeignKey(ManufacturerCoupons,
                                            related_name='manufacturer_order_coupon',
                                            null=True,
                                            blank=True,
                                            on_delete=models.SET_NULL)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="manufacturer_order_owner", on_delete=models.CASCADE)

    def save(self, *args, **kwargs):

        if self.manufacturer_coupon:
            self.discount = self.manufacturer_coupon.discount
        super(DistributorOrders, self).save(*args, **kwargs)


class DistributorOrderItems(EntityRelatedModel):
    distributor_order = models.ForeignKey(
        DistributorOrders, related_name="manufacturer_order", on_delete=models.CASCADE)
    manufacturer = models.ForeignKey(
        'authentication.Entities', related_name="orderItemManufacturer", on_delete=models.CASCADE)
    manufacturer_variation = models.ForeignKey(
        ManufacturerVariations, related_name="manufacturer_variations", null=True, blank=True, on_delete=models.CASCADE)
    purchased_quantity = models.IntegerField(default=0)
    discount_quantity = models.IntegerField(default=0)
    total_quantity = models.IntegerField(default=0)
    stakeholders = models.ManyToManyField(Stakes)
    is_received = models.BooleanField(default=False)
    item_gross_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    item_net_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    item_discount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    item_tax = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    item_pending_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    item_paid_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00)
    created = models.DateField(auto_now_add=True)
    updated = models.DateField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="manufacturer_order_item_added_by", on_delete=models.CASCADE)


class ManufacturerPayments(EntityRelatedModel):
    PAYMENT_STATUS_CHOICES = (
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )
    payee = models.ForeignKey(
        Entities, related_name="manufacturerPayee", on_delete=models.CASCADE)
    distributor_order = models.ForeignKey(
        DistributorOrders, related_name='distributor_order', on_delete=models.CASCADE)
    amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00)
    # payment_method = models.ForeignKey(
    #     PaymentMethods, related_name="manufacturerPaymentMethd", on_delete=models.CASCADE,)
    narrative = models.CharField(
        max_length=300, null=True, blank=True)
    reference = models.CharField(
        max_length=120, null=False, blank=False)
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING")
    orderSetPaid = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        'authentication.Users', related_name="manufaturerPaymentOwner", on_delete=models.CASCADE)


# =====================================================================
# The manufacturer <-> distributor trade (rules: manufacturers/services/).
#
# Products are the source: a manufacturer owns its product master
# (products.Products with manufacturer = it). Every distributor, wholesaler,
# retailer, restaurant and hotel stocks those products.
#   ManufacturerBatches           production lots of the manufacturer's own products:
#                                 batch, manufacture / expiry date, quantity, price
#   ManufacturerPriceDiscounts    a lower price on a batch for a period
#   ManufacturerQuantityDiscounts buy N, get M free on a batch
#   DistributorPurchaseOrders / Items  a distributor's order on a manufacturer
#   ManufacturerOrderPayments     payments on those orders (buyer: mobile money into
#                                 the WaziPOS till; manufacturer staff: any method)
# Paid orders are prepared through logistics.Fulfilment and, when delivered,
# carried through logistics.Shipment; the distributor receives them into its
# stock (distributors.DistributorReceipts). The legacy tables above
# (ManufacturerVariations, DistributorOrders, ...) are kept for old data only.
# =====================================================================

import uuid as _uuid  # noqa: E402

UNIT_CHOICES = tuple((u, u) for u in ("Pack", "Carton", "Box", "Piece", "Bottle", "Bag", "Strip", "Tube", "Sachet", "Crate", "Pallet"))


class ManufacturerBatches(EntityRelatedModel):
    product = models.ForeignKey("products.Products", related_name="manufacturer_batches", on_delete=models.CASCADE)
    batch = models.CharField(max_length=100)
    manufacture_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    unit_of_issue = models.CharField(max_length=20, choices=UNIT_CHOICES, default="Carton")
    # How many product units (packs) one unit of issue holds, e.g. 24 packs per carton.
    packs_per_unit = models.PositiveIntegerField(default=1)
    produced_quantity = models.BigIntegerField(default=0)
    current_quantity = models.BigIntegerField(default=0)
    # Production cost per unit of issue: never shown to buyers.
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    final_unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    minimum_order_quantity = models.PositiveIntegerField(default=1)
    is_listed = models.BooleanField(default=True)
    description = models.CharField(max_length=300, blank=True, default="")
    draft_id = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Manufacturer batches"
        ordering = ["product__title", "expiry_date"]
        constraints = [models.UniqueConstraint(fields=["entity", "product", "batch"], name="uniq_manufacturer_batch")]

    def __str__(self):
        return f"{self.product} batch {self.batch}"

    def save(self, *args, **kwargs):
        self.batch = (self.batch or "").strip().upper()
        super().save(*args, **kwargs)

    def sync_price_from_discounts(self):
        """final price = the latest running price discount's offer, else the list price."""
        from decimal import Decimal

        from django.utils import timezone

        today = timezone.localdate()
        price = Decimal(self.unit_price or 0)
        active = self.price_discounts.filter(is_active=True, start__lte=today, end__gte=today).order_by("-start", "-created").first()
        offer = Decimal("0")
        if active:
            offer = Decimal(active.offer_price or 0)
            if offer <= 0 and active.percent:
                offer = (price * (Decimal("100") - Decimal(active.percent)) / Decimal("100")).quantize(Decimal("0.01"))
        if active and Decimal("0") < offer < price:
            self.discount_unit_price, self.final_unit_price = price - offer, offer
        else:
            self.discount_unit_price, self.final_unit_price = Decimal("0"), price
        type(self).objects.filter(pk=self.pk).update(discount_unit_price=self.discount_unit_price, final_unit_price=self.final_unit_price)


class ManufacturerPriceDiscounts(EntityRelatedModel):
    batch = models.ForeignKey(ManufacturerBatches, related_name="price_discounts", on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    normal_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    offer_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    start = models.DateField()
    end = models.DateField()
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start", "-created"]


class ManufacturerQuantityDiscounts(EntityRelatedModel):
    batch = models.ForeignKey(ManufacturerBatches, related_name="quantity_discounts", on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    limit_quantity = models.PositiveIntegerField()
    awarded_quantity = models.PositiveIntegerField()
    start = models.DateField()
    end = models.DateField()
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start", "-created"]


class DistributorPurchaseOrders(EntityRelatedModel):
    """A distributor's order on a manufacturer. entity = the distributor (buyer)."""

    STATUS_CHOICES = (
        ("SUBMITTED", "Submitted"),
        ("PAID", "Paid"),
        ("PREPARING", "Preparing"),
        ("PACKED", "Packed"),
        ("READY", "Ready"),
        ("COLLECTED", "Collected"),
        ("DISPATCHED", "Dispatched"),
        ("RECEIVED", "Received into stock"),
        ("REJECTED", "Rejected by the manufacturer"),
        ("CANCELLED", "Cancelled"),
    )
    manufacturer = models.ForeignKey(Entities, related_name="purchase_orders_received", on_delete=models.CASCADE)
    distributor = models.ForeignKey(Entities, related_name="purchase_orders_placed", on_delete=models.CASCADE)
    reference_number = models.CharField(max_length=56, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SUBMITTED", db_index=True)
    order_origin = models.CharField(max_length=20, choices=(("DISTRIBUTOR", "Placed by the distributor"), ("STAFF", "Taken by manufacturer staff")), default="DISTRIBUTOR")
    order_terms = models.CharField(max_length=20, choices=(("CASH", "Cash"), ("CREDIT", "Credit")), default="CASH")
    # SELF = the distributor collects; COURIER = delivered (logistics.Shipment).
    delivery_method = models.CharField(max_length=20, choices=(("SELF", "Collect"), ("COURIER", "Delivery")), default="SELF")
    payment_method = models.ForeignKey("payments.PaymentMethods", related_name="distributor_purchase_orders", on_delete=models.SET_NULL, null=True, blank=True)
    employee = models.ForeignKey("employees.Employees", related_name="distributor_purchase_orders", on_delete=models.SET_NULL, null=True, blank=True)
    gross_price_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    final_price_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    shipping_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)
    stock_deducted_at = models.DateTimeField(null=True, blank=True)
    collected_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(Users, related_name="+", on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.CharField(max_length=300, blank=True, default="")
    rejected_reason = models.CharField(max_length=300, blank=True, default="")
    rejected_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    draft_id = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Distributor purchase orders"
        ordering = ["-created"]

    def __str__(self):
        return f"{self.reference_number}: {self.distributor} <- {self.manufacturer}"


class DistributorPurchaseOrderItems(models.Model):
    id = models.UUIDField(primary_key=True, default=_uuid.uuid4, editable=False)
    order = models.ForeignKey(DistributorPurchaseOrders, related_name="items", on_delete=models.CASCADE)
    batch = models.ForeignKey(ManufacturerBatches, related_name="order_items", on_delete=models.PROTECT)
    unit_of_issue = models.CharField(max_length=20, default="Carton")
    purchased_quantity = models.PositiveIntegerField()
    free_quantity = models.PositiveIntegerField(default=0)
    total_quantity = models.PositiveIntegerField()
    item_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)        # list price per unit
    item_final_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # charged per unit
    item_discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    item_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    is_received = models.BooleanField(default=False)
    received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["order", "batch"], name="uniq_batch_per_purchase_order")]


class ManufacturerOrderPayments(EntityRelatedModel):
    """A payment on a distributor's purchase order. entity = the distributor (payer)."""

    STATUS_CHOICES = (("PENDING", "PENDING"), ("SUCCESS", "SUCCESS"), ("CANCELLED", "CANCELLED"), ("FAILED", "FAILED"))
    manufacturer = models.ForeignKey(Entities, related_name="order_payments_received", on_delete=models.CASCADE)
    order = models.ForeignKey(DistributorPurchaseOrders, related_name="payments", on_delete=models.CASCADE)
    payment_method = models.ForeignKey("payments.PaymentMethods", related_name="manufacturer_order_payments", on_delete=models.SET_NULL, null=True, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING", db_index=True)
    pay_in_reference_number = models.CharField(max_length=120, null=True, blank=True, db_index=True)
    psp_reference_number = models.CharField(max_length=120, blank=True, default="")
    provider_reference_number = models.CharField(max_length=120, blank=True, default="")
    description = models.CharField(max_length=120, blank=True, default="")
    telco = models.CharField(max_length=40, blank=True, default="")
    currency = models.CharField(max_length=10, default="KES")
    is_paid = models.BooleanField(default=False)
    is_settled = models.BooleanField(default=False)
    settled_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]
