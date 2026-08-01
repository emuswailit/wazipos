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

# Distributors
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
        Employees, related_name="employee_for_distributor_variation", on_delete=models.CASCADE
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
    pack_buying_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )
    pack_selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )
    pack_quantity = models.BigIntegerField()
    manufacture_date = models.DateField(default=None)
    expiry_date = models.DateField(default=None)
    is_active = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.title}"

    def save(self, *args, **kwargs):
        if self.product.preparation:
            self.is_drug = True
        if self.batch:
            self.batch = self.batch.upper()
        super(DistributorReceipts, self).save(*args, **kwargs)


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
        default='true'
    )
    employee = models.ForeignKey(
        Employees, related_name="employee_for_wholesaler_order", on_delete=models.CASCADE
    )
    paid_at = models.DateTimeField(auto_now_add=True)
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
        default='true'
    )
    delivered_at = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
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
        default='true'
    )
    processed_at = models.DateTimeField(auto_now_add=True)
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
        default='true'
    )
    packed_at = models.DateTimeField(auto_now_add=True)
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
        default='true'
    )
    received_at = models.DateTimeField(auto_now_add=True)
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
        default='true'
    )
    approved_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(
        Users,
        related_name="distributor_orderApprovedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    delivery_method = models.CharField(max_length=20, choices=DELIVERY_CHOICES)
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
    item_discount = models.IntegerField(default=0)
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
    reference = models.CharField(max_length=120, null=False, blank=False)
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
