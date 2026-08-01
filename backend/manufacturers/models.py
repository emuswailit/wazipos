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
