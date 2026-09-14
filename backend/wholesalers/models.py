from authentication.models import Entities, Stakes
from django.db import transaction
from django.utils import timezone
from core.models import EntityRelatedModel
from distributors.models import (
    DistributorReceipts,
    WholesalerOrders,
    WholesalerOrderItems,
)
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.utils.dateparse import parse_date
from django_advance_thumbnail import AdvanceThumbnailField
from django.contrib.auth import get_user_model
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from drugs.models import Users
from employees.models import Employees
from authentication.models import DocumentNumbers
import pytz
from django.core.files import File
from io import BytesIO
from PIL import Image
from django.utils.text import slugify
from decimal import Decimal, InvalidOperation
from django.utils import timezone
from payments.models import PayoutAccounts
User = get_user_model()

TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)
# LOOSE_PACK_UNITS_CHOICES = (
#     ("FullPack", "FullPack"),
#     ("LoosePackUnits", "LoosePackUnits"),
# )


UNITS_OF_ISSUE_CHOICES = (
    ("Millilitre", "Millilitre"),
    ("Litre", "Litre"),
    ("Gram", "Gram"),
    ("Kilogram", "Kilogram"),
    ("Piece", "Piece"),
    ("Pack", "Pack"),
)


UNIT_OF_RECEIPT = (
    ("Millilitre", "Millilitre"),
    ("Litre", "Litre"),
    ("Gram", "Gram"),
    ("Kilogram", "Kilogram"),
    ("Piece", "Piece"),
    ("Pack", "Pack"),
)

def wholesaler_price_discount_image_upload_to(instance, filename):
    title = instance.wholesaler_price_discount.title
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename

def wholesaler_quantity_discount_image_upload_to(instance, filename):
    title = instance.wholesaler_quantity_discount.title
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

class WholesalerVariations(EntityRelatedModel):
    product = models.ForeignKey(
        "products.Products", related_name="wholesaler_receipt_product", on_delete=models.CASCADE
    )
    minimum_stock = models.IntegerField(null=True, blank=True, default=0)
    maximum_stock = models.IntegerField(null=True, blank=True, default=0)
    reorder_level = models.IntegerField(null=True, blank=True, default=0)
    lead_time = models.IntegerField(null=True, blank=True, default=0)
    safety_stock = models.IntegerField(null=True, blank=True, default=0)
    danger_stock = models.IntegerField(null=True, blank=True, default=0)
    economic_order_quantity = models.IntegerField(
        null=True, blank=True, default=0)
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    def save(self, *args, **kwargs):
        if self.product.preparation:
            self.isDrug = True
        super(WholesalerVariations, self).save(*args, **kwargs)


# class WholesalerReceipts(EntityRelatedModel):
#     product = models.ForeignKey(
#         "products.Products",
#         on_delete=models.CASCADE,
#     )
#     wholesaler_variation = models.ForeignKey(
#         WholesalerVariations,
#         on_delete=models.CASCADE,
#     )
#     received_from = models.ForeignKey(
#         "authentication.Entities",
#         related_name="variationReceiptDistributor",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     wholesaler_order_item = models.ForeignKey(
#         WholesalerOrderItems,
#         related_name="wholesalerDistributorOrder",
#         null=True,
#         blank=True,
#         on_delete=models.CASCADE,
#     )
#     unit_of_receipt = models.CharField(
#         max_length=20,
#         choices=UNIT_OF_RECEIPT,
#         default="Pack",
#     )
#     batch = models.CharField(
#         max_length=50, null=True, blank=True,
#     )
#     bar_code = models.CharField(
#         max_length=100, null=True, blank=True,
#     )
#     manufacture_date = models.DateField(
#         default=None, null=True, blank=True,
#     )
#     expiry_date = models.DateField(
#         default=None, null=True, blank=True,
#     )
#     current_unit_quantity = models.BigIntegerField(default=0)
#     received_unit_quantity = models.BigIntegerField(default=0)
#     received_pack_quantity = models.BigIntegerField(default=0)
#     unit_buying_price = models.DecimalField(
#         max_digits=10, decimal_places=2, default=0,
#     )
#     unit_selling_price = models.DecimalField(
#         max_digits=10, decimal_places=2, default=0,
#     )
#     discount_unit_selling_price = models.DecimalField(
#         max_digits=10, decimal_places=2, default=0.00,
#     )
#     final_unit_selling_price = models.DecimalField(
#         max_digits=10, decimal_places=2, default=0.00,
#     )

#     # ➕ Recommended retail price — used to compute tentative
#     #    profit on the retailer side. Optional. When set, it
#     #    overrides the retailer's markup when pricing the
#     #    suggested order.
#     recommended_retail_price = models.DecimalField(
#         max_digits=10,
#         decimal_places=2,
#         null=True,
#         blank=True,
#         default=None,
#         help_text=(
#             "Suggested price for the retailer to sell at. "
#             "If empty, the retailer's indent markup applies."
#         ),
#     )

#     employee = models.ForeignKey(
#         Employees,
#         related_name="employee_creating_wholesaler_receipt",
#         on_delete=models.CASCADE,
#     )
#     in_placement = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='true',
#     )
#     description = models.TextField(max_length=300)
#     created = models.DateTimeField(default=timezone.now)
#     updated = models.DateTimeField(auto_now=True)
#     owner = models.ForeignKey(
#         User,
#         related_name="wholesalerReceiptOwner",
#         on_delete=models.CASCADE,
#     )

#     def __str__(self):
#         return self.product.title

#     def save(self, *args, **kwargs):
#         product = self.product

#         if product and product.bar_code:
#             self.bar_code = product.bar_code
#         elif self.bar_code and product and not product.bar_code:
#             product.bar_code = self.bar_code
#             product.save(update_fields=['bar_code'])

#         super(WholesalerReceipts, self).save(*args, **kwargs)




class WholesalerReceipts(EntityRelatedModel):
    """
    Distributor -> wholesaler inventory lot.

    One row per batch / expiry received by a wholesaler from a
    distributor. The wholesaler prices retailer indents against
    these rows.
    """

    product = models.ForeignKey(
        "products.Products",
        on_delete=models.CASCADE,
    )
    wholesaler_variation = models.ForeignKey(
        WholesalerVariations,
        on_delete=models.CASCADE,
    )
    received_from = models.ForeignKey(
        "authentication.Entities",
        related_name="variationReceiptDistributor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    wholesaler_order_item = models.ForeignKey(
        WholesalerOrderItems,
        related_name="wholesalerDistributorOrder",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    retailer_order_item = models.ForeignKey(
        "wholesalers.RetailerOrderItems",
        related_name="resulting_receipts",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text=(
            "Retailer order line this lot is fulfilling, if any. "
            "Null for lots that came in via a distributor order only."
        ),
    )

    unit_of_receipt = models.CharField(
        max_length=20,
        choices=UNIT_OF_RECEIPT,
        default="Pack",
    )
    batch = models.CharField(max_length=50, null=True, blank=True)
    bar_code = models.CharField(max_length=100, null=True, blank=True)
    manufacture_date = models.DateField(default=None, null=True, blank=True)
    expiry_date = models.DateField(default=None, null=True, blank=True)

    current_unit_quantity = models.BigIntegerField(default=0)
    received_unit_quantity = models.BigIntegerField(default=0)
    received_pack_quantity = models.BigIntegerField(default=0)

    unit_buying_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    discount_unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
    )
    final_unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
    )
    recommended_retail_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        default=None,
        help_text=(
            "Suggested retail price for the retailer to sell at. "
            "When set, overrides the retailer's indent markup. "
            "When empty, the retailer's indent markup applies."
        ),
    )

    employee = models.ForeignKey(
        Employees,
        related_name="employee_creating_wholesaler_receipt",
        on_delete=models.CASCADE,
    )
    in_placement = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default="true",
    )
    description = models.TextField(max_length=300)
    created = models.DateTimeField(default=timezone.now)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User,
        related_name="wholesalerReceiptOwner",
        on_delete=models.CASCADE,
    )

    def __str__(self):
        return self.product.title

    def save(self, *args, **kwargs):
        product = self.product

        if product and product.bar_code:
            self.bar_code = product.bar_code
        elif self.bar_code and product and not product.bar_code:
            product.bar_code = self.bar_code
            product.save(update_fields=["bar_code"])

        super().save(*args, **kwargs)

class WholesalerPriceDiscountBanners(EntityRelatedModel):
    """Model for uploading price discount banners"""

    wholesaler_price_discount = models.ForeignKey(
        "WholesalerPriceDiscounts", related_name="wholesaler_price_discount_banners", on_delete=models.CASCADE
    )
    price_discount_banner = models.ImageField(upload_to=wholesaler_price_discount_image_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="price_discount_banners",
        upload_to="thumbnails/discounts/price",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Price Discount Banners"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.price_discount_banner:
            price_discount_banner = self.price_discount_banner
            if (
                price_discount_banner.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress price_discount_banner function
                self.price_discount_banner = compress_image(price_discount_banner)
        super(WholesalerPriceDiscountBanners, self).save(*args, **kwargs)

    def __str__(self):
        return self.wholesaler_price_discount.title

            


from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone


class WholesalerPriceDiscounts(EntityRelatedModel):
    """
    A dated promotional price on a specific WholesalerReceipts lot.

    The offer price is authoritative. On save, if the discount is
    currently active (start <= today <= end, is_active=True), the
    parent receipt's final_unit_selling_price is set to offer_price
    and discount_unit_selling_price is set to the per-unit delta.

    When a discount ends or is deactivated, the receipt reverts to
    its list price (unit_selling_price) on the next recompute.
    """

    wholesaler_receipt = models.ForeignKey(
        WholesalerReceipts,
        related_name="wholesaler_price_discount_receipt",
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=100)
    percent = models.DecimalField(max_digits=4, decimal_places=2)
    normal_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        help_text="List price snapshot at creation time.",
    )
    offer_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        help_text="Promotional price per unit.",
    )
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    price_discount_banners = models.ManyToManyField(
        WholesalerPriceDiscountBanners,
        related_name="price_discount_banners",
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User,
        related_name="wholesaler_price_discount_owner",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Wholesaler Price Discounts"
        indexes = [
            models.Index(fields=["wholesaler_receipt", "is_active"]),
            models.Index(fields=["start", "end"]),
        ]

    def __str__(self):
        return f"{self.title}"

    @property
    def is_currently_active(self) -> bool:
        today = timezone.now().date()
        return (
            self.is_active == "true"
            and self.start <= today <= self.end
        )

    def clean(self):
        super().clean()
        errors = {}

        if self.end and self.start and self.end < self.start:
            errors["end"] = "End date must be on or after start date."

        if self.offer_price is not None and self.normal_price:
            if self.offer_price > self.normal_price:
                errors["offer_price"] = (
                    "Offer price cannot exceed normal price."
                )

        if errors:
            from django.core.exceptions import ValidationError
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        """
        Save the discount, then sync the parent receipt's derived
        price fields. Idempotent — the receipt is recomputed from
        scratch each time.
        """
        super().save(*args, **kwargs)
        self.wholesaler_receipt.sync_price_from_discounts()

    def delete(self, *args, **kwargs):
        receipt = self.wholesaler_receipt
        super().delete(*args, **kwargs)
        receipt.sync_price_from_discounts()



class WholesalerQuantityDiscountBanners(EntityRelatedModel):
    """Model for uploading quantity discount banners"""

    wholesaler_quantity_discount = models.ForeignKey(
        "WholesalerQuantityDiscounts", related_name="wholesaler_quantity_discount_banners", on_delete=models.CASCADE
    )
    quantity_discount_banner = models.ImageField(upload_to=wholesaler_quantity_discount_image_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="quantity_discount_banner",
        upload_to="thumbnails/discounts/quantity",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Price Discount Banners"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.quantity_discount_banner:
            quantity_discount_banner = self.quantity_discount_banner
            if (
                quantity_discount_banner.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress quantity_discount_banner function
                self.quantity_discount_banner = compress_image(quantity_discount_banner)
        super(WholesalerQuantityDiscountBanners, self).save(*args, **kwargs)

    def __str__(self):
        return self.wholesaler_quantity_discount.title
   

class WholesalerQuantityDiscounts(EntityRelatedModel):
    """
    A dated buy-N-get-M-free offer on a specific WholesalerReceipts
    lot. Consumed by RetailerIndentItem for bonus calculation, and
    referenced by WholesalerCampaignItem.

    No price mutation here — quantity discounts only affect the
    free-unit count, not the unit price. Price effects flow through
    the indent item's bonus dilution.
    """

    wholesaler_receipt = models.ForeignKey(
        WholesalerReceipts,
        related_name="wholesaler_quantity_discount_receipt",
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=200)
    limit_quantity = models.IntegerField(
        default=0,
        help_text="Buy quantity per block. Order must reach this to earn the award.",
    )
    awarded_quantity = models.IntegerField(
        default=0,
        help_text="Free units granted per block purchased.",
    )
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    quantity_discount_banners = models.ManyToManyField(
        WholesalerQuantityDiscountBanners,
        related_name="quantity_discount_banners",
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="wholesale_quantity_discount_owner",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Wholesaler Quantity Discounts"
        indexes = [
            models.Index(fields=["wholesaler_receipt", "is_active"]),
            models.Index(fields=["start", "end"]),
        ]

    def __str__(self):
        return f"{self.title}"

    @property
    def is_currently_active(self) -> bool:
        today = timezone.now().date()
        return (
            self.is_active == "true"
            and self.start <= today <= self.end
        )

    def clean(self):
        super().clean()
        errors = {}

        if self.end and self.start and self.end < self.start:
            errors["end"] = "End date must be on or after start date."

        if self.limit_quantity is not None and self.limit_quantity <= 0:
            errors["limit_quantity"] = "Limit quantity must be greater than zero."

        if self.awarded_quantity is not None and self.awarded_quantity <= 0:
            errors["awarded_quantity"] = "Awarded quantity must be greater than zero."

        if (
            self.limit_quantity
            and self.awarded_quantity
            and self.awarded_quantity >= self.limit_quantity
        ):
            errors["awarded_quantity"] = (
                "Awarded quantity should be less than limit quantity."
            )

        if errors:
            from django.core.exceptions import ValidationError
            raise ValidationError(errors)
        
# class RetailerOrders(EntityRelatedModel):
#     """
#     Order that a wholesaler places on a wholesaler
#     """

#     ORDER_ORIGIN_CHOICES = (
#         ("RETAILER", "RETAILER"),
#         ("STAFF", "STAFF"),
#     )
#     DELIVERY_CHOICES = (
#         ("SELF", "SELF"),
#         ("COURIER", "COURIER"),
#     )
#     TERMS_CHOICES = (
#         ("CASH", "CASH"),
#         ("CONTRACT", "CONTRACT"),
#         ("CREDIT", "CREDIT"),
#         ("FACILITY", "FACILITY"),
#         ("PLACEMENT", "PLACEMENT"),
#     )

#     ORDER_TYPE_CHOICES = (
#         ("EMERGENCY", "EMERGENCY"),
#         ("NORMAL", "NORMAL"),
#     )
#     ORDER_STATUS_CHOICES = (
#         ("COMPLETED", "COMPLETED"),
#         ("SUBMITTED", "SUBMITTED"),
#         ("PROCESSING", "PROCESSING"),
#         ("DISPATCHED", "DISPATCHED"),
#         ("RECEIVED", "RECEIVED"),
#         ("CANCELLED", "CANCELLED"),
#     )

#     retailer = models.ForeignKey(
#         Entities, related_name="wholesalerOrderRetailer", on_delete=models.CASCADE
#     )
#     wholesaler = models.ForeignKey(
#         Entities, related_name="wholesalerOrderWholesaler", on_delete=models.CASCADE
#     )
#     facilitator = models.ForeignKey(
#         Entities, related_name="wholesalerOrderFacilitator", on_delete=models.CASCADE,null=True,blank=True
#     )
#     # retailer_order_number = models.CharField(
#     #     max_length=10, unique=True
#     # )
#     draft_id = models.CharField(max_length=100, null=True, blank=True)
#     payment_method = models.ForeignKey(
#         "payments.PaymentMethods",
#         related_name="reatiler_order_payment_method",
#         on_delete=models.CASCADE, null=True, blank=True
#     )
#     document_number = models.ForeignKey(
#         DocumentNumbers,
#         related_name="retailer_order_document_number",
#         on_delete=models.CASCADE, null=True, blank=True
#     )
#     shipping_amount = models.DecimalField(
#         max_digits=7, default=0.00, decimal_places=2
#     )
#     order_discount_total = models.DecimalField(
#         max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
#     )
#     order_gross_price_total = models.DecimalField(
#         max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
#     )
#     final_price = models.DecimalField(
#         max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
#     )
#     final_price_total = models.DecimalField(
#         max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
#     )
#     order_tax_total = models.DecimalField(
#         max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
#     )
#     order_terms = models.CharField(max_length=20, choices=TERMS_CHOICES)
#     order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES)
#     status = models.CharField(
#         max_length=20, choices=ORDER_STATUS_CHOICES, default='SUBMITTED')
#     is_paid = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='false'
#     )
#     paid_at = models.DateTimeField(auto_now_add=True)
#     is_delivered = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='true'
#     )
#     delivered_at = models.DateTimeField(auto_now_add=True)
#     employee = models.ForeignKey(
#         Employees, related_name="employee_creating_order", on_delete=models.CASCADE,null=True,blank=True
#     )
#     delivered_by = models.ForeignKey(
#         Users,
#         related_name="wholesalerOrderDeliveredBy",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     is_processed = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='true'
#     )
#     processed_at = models.DateTimeField(auto_now_add=True)
#     processed_by = models.ForeignKey(
#         Users,
#         related_name="wholesalerOrderProcessedBy",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     is_packed = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='true'
#     )
#     packed_at = models.DateTimeField(auto_now_add=True)
#     packed_by = models.ForeignKey(
#         Users,
#         related_name="wholesalerOrderPackedBy",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     is_received = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='true'
#     )
#     reference_number = models.CharField(
#         max_length=56,null=True, blank=True
#     )
#     received_at = models.DateTimeField(auto_now_add=True)
#     received_by = models.ForeignKey(
#         Users,
#         related_name="wholesalerOrderReceivedBy",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     is_approved = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='true'
#     )
#     approved_at = models.DateTimeField(auto_now_add=True)
#     approved_by = models.ForeignKey(
#         Users,
#         related_name="wholesalerOrderApprovedBy",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     is_dispatched = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='true'
#     )
#     dispatched_at = models.DateTimeField(auto_now_add=True)
#     dispatched_by = models.ForeignKey(
#         Users,
#         related_name="wholesalerOrderDispatchedBy",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     order_origin = models.CharField(
#         max_length=20, choices=ORDER_ORIGIN_CHOICES)
#     delivery_method = models.CharField(max_length=20, choices=DELIVERY_CHOICES)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)
#     owner = models.ForeignKey(
#         User, related_name="wholesaler_order_owner", on_delete=models.CASCADE
#     )

#     def save(self, *args, **kwargs):
#         # self.retailer_order_number = self.retailer_order_number.upper()

#         super(RetailerOrders, self).save(*args, **kwargs)


# class RetailerOrderItems(EntityRelatedModel):
#     retailer_order = models.ForeignKey(
#         RetailerOrders, related_name="retailer_order", on_delete=models.CASCADE
#     )
#     wholesaler_receipt = models.ForeignKey(
#         WholesalerReceipts, related_name="order_item_wholesaler_receipt", on_delete=models.CASCADE
#     )
#     purchased_quantity = models.IntegerField(default=0)
#     discount_quantity = models.IntegerField(default=0)
#     total_quantity = models.IntegerField(default=0)

#     item_price = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_price_total = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_final_price = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_final_price_total = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     unit_of_issue = models.CharField(max_length=20,choices=UNITS_OF_ISSUE_CHOICES, default="Pack")

#     item_tax = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_tax_total = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_counter_price_discount = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_counter_price_discount_amount = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_counter_price_discount_amount_total = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True,default=0.00
#     )
#     item_price_discount = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_price_discount_total = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_net_price = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     item_net_price_total = models.DecimalField(
#         max_digits=7, decimal_places=2, null=True, blank=True
#     )
#     stakeholders = models.ManyToManyField(Stakes)
#     is_received = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='false'
#     )
#     is_issued = models.CharField(
#         max_length=50,
#         choices=TRUE_FALSE_OPTIONS,
#         default='false'
#     )
#     item_pending_amount = models.DecimalField(
#         max_digits=12, decimal_places=2, null=True, blank=True)
#     item_paid_amount = models.DecimalField(
#         max_digits=12, decimal_places=2, default=0.00)
#     employee = models.ForeignKey(
#         Employees, related_name="employee_creating_order_item", on_delete=models.CASCADE, null=True, blank=True
#     )
#     created = models.DateField(auto_now_add=True)
#     updated = models.DateField(auto_now=True)
#     owner = models.ForeignKey(
#         User, related_name="wholesaler_order_item_owner", on_delete=models.CASCADE
#     )

#     class Meta:
#         constraints = [
#             models.UniqueConstraint(
#                 fields=["retailer_order", "wholesaler_receipt"],
#                 name="One item per order",
#             )
#         ]

#     def __str__(self) -> str:
#         return f"{self.wholesaler_receipt.product.title}"

#     # def save(self, *args, **kwargs):

#     #     self.item_price_total= float(self.purchased_quantity) * float(self.wholesaler_receipt.pack_selling_price)
#     #     quantity_discount =None
#     #     applicable_discounts =[]
#     #     price_discount = None
#     #     if WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=self.wholesaler_receipt,is_active="true",limit_quantity__gte=self.purchased_quantity).exists():
#     #         applicable_discounts =WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=self.wholesaler_receipt,is_active="true",limit_quantity__gte=self.purchased_quantity).all()

#     #         for disc in applicable_discounts:
#     #             if self.purchased_quantity % disc.limit_quantity>0 and self.purchased_quantity % disc.limit_quantity <self.purchased_quantity:
#     #                 quantity_discount = disc
#     #                 self.discount_quantity=quantity_discount.awarded_quantity
#     #                 self.total_quantity = self.purchased_quantity + quantity_discount.awarded_quantity
#     #                 return
                

#     #     if WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=self.wholesaler_receipt,is_active="true").exists():
#     #         price_discount =WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=self.wholesaler_receipt,is_active="true").first()

#     #         self.item_price_discount = float(self.wholesaler_receipt.pack_selling_price)* float(price_discount.percent)/100.00  
#     #         self.item_net_price = float(self.wholesaler_receipt.pack_selling_price) - float(self.item_price_discount)

#     #         self.item_net_price_total = self.item_net_price * float(self.purchased_quantity)
#     #     super(RetailerOrderItems, self).save(*args, **kwargs)

def wholesaler_campaign_image_upload_to(instance, filename):
    return f"campaigns/{instance.id or 'draft'}/{filename}"


class WholesalerCampaign(EntityRelatedModel):
    """
    Wholesaler-initiated offer: a curated set of receipts, each
    with optional price and quantity discounts, published to
    retailers with suggested quantities and projected earnings.

    Opting in seeds a RetailerIndent — the indent is the sole
    commitment path, campaign or not.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", _("Draft")
        PUBLISHED = "PUBLISHED", _("Published")
        CLOSED = "CLOSED", _("Closed")
        CANCELLED = "CANCELLED", _("Cancelled")

    wholesaler = models.ForeignKey(
        "authentication.Entities",
        related_name="campaigns_published",
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=200)
    description = models.TextField(max_length=500, blank=True, default="")
    banner = models.ImageField(
        upload_to=wholesaler_campaign_image_upload_to,
        null=True, blank=True,
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT,
    )
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(
        max_length=10, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    budget_cap = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        help_text="Optional cap on total campaign value, wholesaler-side.",
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Campaigns"
        indexes = [
            models.Index(fields=["wholesaler", "status"]),
            models.Index(fields=["start", "end"]),
        ]

    def __str__(self):
        return f"{self.wholesaler.title} — {self.title}"

    @property
    def is_currently_active(self) -> bool:
        today = timezone.now().date()
        return (
            self.is_active == "true"
            and self.status == self.Status.PUBLISHED
            and self.start <= today <= self.end
        )


class WholesalerCampaignItem(EntityRelatedModel):
    """
    One receipt on a campaign. Price and quantity discounts are
    reused from the existing discount models.
    """

    campaign = models.ForeignKey(
        WholesalerCampaign, related_name="items", on_delete=models.CASCADE,
    )
    wholesaler_receipt = models.ForeignKey(
        "WholesalerReceipts",
        related_name="campaign_items",
        on_delete=models.CASCADE,
    )
    wholesaler_price_discount = models.ForeignKey(
        "WholesalerPriceDiscounts",
        related_name="campaign_items",
        on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    wholesaler_quantity_discount = models.ForeignKey(
        "WholesalerQuantityDiscounts",
        related_name="campaign_items",
        on_delete=models.SET_NULL,
        null=True, blank=True,
    )

    suggested_quantity = models.IntegerField(default=0)
    per_retailer_limit = models.IntegerField(null=True, blank=True)
    retail_price_hint = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
    )

    published_unit_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Receipt's effective unit price at publication.",
    )
    published_bonus_quantity = models.IntegerField(
        default=0,
        help_text="Free units earned per block at publication.",
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Campaign Items"
        constraints = [
            models.UniqueConstraint(
                fields=["campaign", "wholesaler_receipt"],
                name="One receipt per campaign",
            )
        ]

    def __str__(self):
        return f"{self.wholesaler_receipt.product.title} on {self.campaign.title}"

    def project_for_quantity(self, quantity: int, markup_pct: Decimal):
        from retailers.models import RetailerIndentItem
        """
        Run the same math as RetailerIndentItem.recalculate against
        an unsaved probe. Guarantees the projection the retailer
        sees matches the line they get on opt-in.
        """
        probe = RetailerIndentItem(
            retailer_indent=None,
            wholesale_receipt=self.wholesaler_receipt,
            wholesaler_price_discount=self.wholesaler_price_discount,
            wholesaler_quantity_discount=self.wholesaler_quantity_discount,
            required_quantity=quantity,
            recommended_retail_price=self.retail_price_hint,
            supplier_unit_selling_price=None,
        )
        probe.recalculate(markup_override=markup_pct)
        return probe.profit_estimate    

class WholesalerCampaignAudience(EntityRelatedModel):
    """
    Which retailers see this campaign, and opt-in state.
    """

    campaign = models.ForeignKey(
        WholesalerCampaign, related_name="audience", on_delete=models.CASCADE,
    )
    retailer = models.ForeignKey(
        "authentication.Entities",
        related_name="campaigns_received",
        on_delete=models.CASCADE,
    )
    opted_in_at = models.DateTimeField(null=True, blank=True)
    opted_out_at = models.DateTimeField(null=True, blank=True)
    is_visible = models.CharField(
        max_length=10, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Campaign Audiences"
        constraints = [
            models.UniqueConstraint(
                fields=["campaign", "retailer"],
                name="One audience row per retailer per campaign",
            )
        ]

    def __str__(self):
        return f"{self.retailer.title} · {self.campaign.title}"

    
class RetailerOrders(EntityRelatedModel):
    """
    An order a retailer places on a wholesaler. Generated from
    an indent (or created directly for one-off orders).
    """

    ORDER_ORIGIN_CHOICES = (
        ("RETAILER", "RETAILER"),
        ("STAFF", "STAFF"),
    )
    DELIVERY_CHOICES = (
        ("SELF", "SELF"),
        ("COURIER", "COURIER"),
    )
    TERMS_CHOICES = (
        ("CASH", "CASH"),
        ("CONTRACT", "CONTRACT"),
        ("CREDIT", "CREDIT"),
        ("FACILITY", "FACILITY"),
        ("PLACEMENT", "PLACEMENT"),
    )
    ORDER_TYPE_CHOICES = (
        ("EMERGENCY", "EMERGENCY"),
        ("NORMAL", "NORMAL"),
    )
    ORDER_STATUS_CHOICES = (
        ("COMPLETED", "COMPLETED"),
        ("SUBMITTED", "SUBMITTED"),
        ("PROCESSING", "PROCESSING"),
        ("DISPATCHED", "DISPATCHED"),
        ("RECEIVED", "RECEIVED"),
        ("CANCELLED", "CANCELLED"),
    )

    retailer = models.ForeignKey(
        Entities, related_name="wholesalerOrderRetailer",
        on_delete=models.CASCADE,
    )
    wholesaler = models.ForeignKey(
        Entities, related_name="wholesalerOrderWholesaler",
        on_delete=models.CASCADE,
    )
    facilitator = models.ForeignKey(
        Entities, related_name="wholesalerOrderFacilitator",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    draft_id = models.CharField(max_length=100, null=True, blank=True)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="reatiler_order_payment_method",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    document_number = models.ForeignKey(
        DocumentNumbers,
        related_name="retailer_order_document_number",
        on_delete=models.CASCADE, null=True, blank=True,
    )

    shipping_amount = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2,
    )
    order_discount_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )
    order_gross_price_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )
    final_price = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )
    final_price_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )
    order_tax_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )

    order_terms = models.CharField(max_length=20, choices=TERMS_CHOICES)
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES)
    status = models.CharField(
        max_length=20, choices=ORDER_STATUS_CHOICES, default="SUBMITTED",
    )
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    is_delivered = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    employee = models.ForeignKey(
        Employees, related_name="employee_creating_order",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    delivered_by = models.ForeignKey(
        Users, related_name="wholesalerOrderDeliveredBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_processed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    processed_by = models.ForeignKey(
        Users, related_name="wholesalerOrderProcessedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_packed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    packed_by = models.ForeignKey(
        Users, related_name="wholesalerOrderPackedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_received = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    reference_number = models.CharField(
        max_length=56, null=True, blank=True,
    )
    received_by = models.ForeignKey(
        Users, related_name="wholesalerOrderReceivedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_approved = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    approved_by = models.ForeignKey(
        Users, related_name="wholesalerOrderApprovedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_dispatched = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    dispatched_by = models.ForeignKey(
        Users, related_name="wholesalerOrderDispatchedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )

    # ---- Timestamps (nullable, set explicitly on transition) ----
    paid_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    packed_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)

    order_origin = models.CharField(
        max_length=20, choices=ORDER_ORIGIN_CHOICES,
    )
    delivery_method = models.CharField(
        max_length=20, choices=DELIVERY_CHOICES,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="wholesaler_order_owner",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Retailer Orders"

    def __str__(self):
        return f"{self.retailer.title}-{self.id}"

    # ------------------------------------------------------------------
    # Aggregates
    # ------------------------------------------------------------------

    def recalculate(self, save=True):
        agg = self.retailer_order.aggregate(
            gross=Sum("item_price_total"),
            discount=Sum("item_price_discount_total"),
            tax=Sum("item_tax_total"),
            net=Sum("item_net_price_total"),
        )
        self.order_gross_price_total = _q(agg["gross"] or 0)
        self.order_discount_total = _q(agg["discount"] or 0)
        self.order_tax_total = _q(agg["tax"] or 0)
        self.final_price_total = _q(
            (self.order_gross_price_total or 0)
            - (self.order_discount_total or 0)
            + (self.order_tax_total or 0)
            + (self.shipping_amount or 0)
        )

        if save:
            super().save(update_fields=[
                "order_gross_price_total",
                "order_discount_total",
                "order_tax_total",
                "final_price_total",
                "updated",
            ])

    # ------------------------------------------------------------------
    # Shipping allocation
    # ------------------------------------------------------------------

    def allocate_shipping_to_receipts(self, save=True):
        from retailers.models import RetailerReceipts
        """
        Spread shipping_amount across active RetailerReceipts
        created from this order, proportional to line value.
        Idempotent — wipes and rebuilds.
        """
        receipts = list(
            RetailerReceipts.objects.filter(
                retailer_order=self, is_active="true",
            )
        )
        if not receipts:
            return

        line_values = []
        total_value = Decimal("0.00")
        for r in receipts:
            value = _q(
                (r.received_unit_quantity or 0) * (r.unit_buying_price or 0)
            )
            line_values.append((r, value))
            total_value += value

        shipping = _q(self.shipping_amount or 0)

        if total_value <= 0 or shipping <= 0:
            for r, _ in line_values:
                r.allocated_shipping_total = Decimal("0.00")
                r.allocated_shipping_per_unit = Decimal("0.00")
            if save:
                RetailerReceipts.objects.bulk_update(
                    [r for r, _ in line_values],
                    ["allocated_shipping_total", "allocated_shipping_per_unit"],
                )
            return

        largest = max(line_values, key=lambda pair: pair[1])[0]
        running_total = Decimal("0.00")

        for r, value in line_values:
            if r is largest:
                share = _q(shipping - running_total)
            else:
                share = _q(shipping * (value / total_value))
                running_total += share

            r.allocated_shipping_total = share
            r.allocated_shipping_per_unit = (
                _q(share / r.received_unit_quantity)
                if r.received_unit_quantity else Decimal("0.00")
            )

        if save:
            RetailerReceipts.objects.bulk_update(
                [r for r, _ in line_values],
                ["allocated_shipping_total", "allocated_shipping_per_unit"],
            )

    @property
    def actual_lead_time_days(self):
        if self.approved_at and self.received_at:
            return max(0, (self.received_at - self.approved_at).days)
        return None

from decimal import Decimal

from django.db import models

from authentication.models import  Users

from employees.models import Employees
class RetailerOrderItems(EntityRelatedModel):
    """
    One committed line on a retailer order.

    Generated from a RetailerIndentItem. Pricing snapshots are
    copied from the indent — not recomputed — so the order stays
    faithful to what the retailer agreed to, even if a discount
    expires or a receipt price changes between indent and order.
    """

    retailer_order = models.ForeignKey(
        RetailerOrders,
        related_name="retailer_order",
        on_delete=models.CASCADE,
    )
    retailer_indent_item = models.ForeignKey(
        "retailers.RetailerIndentItem",
        related_name="order_items_generated_from",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The indent line this order item was generated from.",
    )
    wholesaler_receipt = models.ForeignKey(
        WholesalerReceipts,
        related_name="order_item_wholesaler_receipt",
        on_delete=models.CASCADE,
    )

    purchased_quantity = models.IntegerField(default=0)
    discount_quantity = models.IntegerField(default=0)
    total_quantity = models.IntegerField(default=0)

    item_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_final_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_final_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    unit_of_issue = models.CharField(
        max_length=20,
        choices=UNITS_OF_ISSUE_CHOICES,
        default="Pack",
    )

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

    intended_retail_unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="What the retailer intends to sell this at once received.",
    )
    intended_retail_unit_price_source = models.CharField(
        max_length=32,
        default="markup",
        help_text="'rrp' or 'markup' — matches the indent's pricing_source.",
    )

    stakeholders = models.ManyToManyField(Stakes)
    is_received = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    is_issued = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    item_pending_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
    )
    item_paid_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00,
    )
    employee = models.ForeignKey(
        Employees,
        related_name="employee_creating_order_item",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateField(auto_now_add=True)
    updated = models.DateField(auto_now=True)
    owner = models.ForeignKey(
        User,
        related_name="wholesaler_order_item_owner",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Retailer Order Items"
        constraints = [
            models.UniqueConstraint(
                fields=["retailer_order", "wholesaler_receipt"],
                name="One item per order",
            )
        ]

    def __str__(self) -> str:
        return f"{self.wholesaler_receipt.product.title}"

    def recalculate(self, save=True):
        """
        Recompute derived fields from purchased_quantity,
        item_price, item_final_price and unit-level discounts.

        Only used when this item is NOT generated from an indent
        (i.e. one-off / manual orders). Items generated from an
        indent copy their snapshot from the indent item and should
        save with recalculate=False.
        """
        qty = Decimal(str(self.purchased_quantity or 0))
        final_unit = _q(self.item_final_price or 0)
        list_unit = _q(self.item_price or final_unit)
        discount_unit = _q(list_unit - final_unit)

        self.item_price_total = _q(list_unit * qty)
        self.item_price_discount = discount_unit
        self.item_price_discount_total = _q(discount_unit * qty)
        self.item_net_price = final_unit
        self.item_net_price_total = _q(final_unit * qty)

        tax_unit = _q(self.item_tax or 0)
        self.item_tax_total = _q(tax_unit * qty)

        total_qty = Decimal(str(self.total_quantity or self.purchased_quantity or 0))
        shipping_unit = Decimal("0.00")  # populated after receipt allocation
        self.item_final_price_total = _q(
            (final_unit + tax_unit + shipping_unit) * total_qty
        )

        if save:
            self.save(recalculate=False)

    # ------------------------------------------------------------------
    # Display helpers
    # ------------------------------------------------------------------

    @property
    def product_title(self):
        if self.wholesaler_receipt and self.wholesaler_receipt.product:
            return self.wholesaler_receipt.product.title
        return ""

    @property
    def wholesaler_title(self):
        r = self.wholesaler_receipt
        if r and r.received_from:
            return r.received_from.title
        return ""

    @property
    def line_margin(self):
        """Projected margin on this line: retail total − net cost total."""
        if (
            self.intended_retail_unit_price is None
            or self.item_net_price_total is None
        ):
            return None
        return _q(
            (self.intended_retail_unit_price * Decimal(str(self.total_quantity or 0)))
            - self.item_net_price_total
        )

    def save(self, *args, **kwargs):
        # Escape hatch for the generation service: copy snapshots
        # from the indent item and skip recomputation.
        if kwargs.pop("recalculate", False):
            self.recalculate(save=False)
        super().save(*args, **kwargs)

    
class RetailerOrderPayments(EntityRelatedModel):
    PAYMENT_STATUS_CHOICES = (
        ("INITIATED", "INITIATED"),
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )
    retailer_order = models.ForeignKey(
        RetailerOrders, related_name="wholesalerOrders", on_delete=models.CASCADE
    )
    # entity_collection_account = models.ForeignKey(
    #     "payments.EntityPSPCollectionAccount",
    #     related_name="wholesaler_collection_account",
    #     on_delete=models.CASCADE,
    #     null=True,
    #     blank=True,
    # )
    payout_account = models.ForeignKey(
        "payments.PayoutAccounts",
        related_name="entity_payout_account",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    commission_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payout_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="wholesalerPaymentMethd",
        on_delete=models.CASCADE,
    )
    narrative = models.CharField(max_length=300, null=True, blank=True)
    pay_in_reference_number = models.CharField(max_length=120, null=True, blank=True)
    telco = models.CharField(max_length=120, null=False, blank=False)
    psp_reference_number = models.CharField(max_length=120, null=False, blank=False)
    provider_reference_number = models.CharField(max_length=120, null=True, blank=True)
    description = models.CharField(max_length=120, null=True, blank=True)
    currency = models.CharField(max_length=120, null=False, blank=False)
    pay_out_reference_number = models.CharField(max_length=120, null=True, blank=True)
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )
    is_paid = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    is_settled = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    commission_paid = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        "authentication.Users",
        related_name="wholesalerPaymentOwner",
        on_delete=models.CASCADE,
    )

    def save(self, *args, **kwargs):
        
        self.retailer_order.pay_in_reference_number = self.pay_in_reference_number
        super(RetailerOrderPayments, self).save(*args, **kwargs)
