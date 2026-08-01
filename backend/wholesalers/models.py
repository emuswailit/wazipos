from authentication.models import Entities, Stakes
from django.db import transaction
from django.utils import timezone
from core.models import EntityRelatedModel
from distributors.models import (
    DistributorReceipts,
    WholesalerOrders,
    WholesalerOrderItems,
)
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


from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator

class WholesalerReceipts(EntityRelatedModel):
    product = models.ForeignKey("products.Products", on_delete=models.CASCADE)
    wholesaler_variation = models.ForeignKey(WholesalerVariations, on_delete=models.CASCADE)
    received_from = models.ForeignKey(
        Entities, related_name="variationReceiptDistributor", on_delete=models.CASCADE, null=True, blank=True
    )
    wholesaler_order_item = models.ForeignKey(
        WholesalerOrderItems, related_name="wholesalerDistributorOrder", null=True, blank=True, on_delete=models.CASCADE
    )
    unit_of_receipt = models.CharField(max_length=20, choices=UNIT_OF_RECEIPT, default="Pack")
    batch = models.CharField(max_length=50, null=True, blank=True)
    bar_code = models.CharField(max_length=100, null=True, blank=True)
    manufacture_date = models.DateField(default=None, null=True, blank=True)
    expiry_date = models.DateField(default=None, null=True, blank=True)
    current_unit_quantity = models.BigIntegerField(default=0)
    received_unit_quantity = models.BigIntegerField(default=0)
    received_pack_quantity = models.BigIntegerField(default=0)  # Added default
    unit_buying_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit_selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_unit_selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    final_unit_selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
   
    employee = models.ForeignKey(Employees, related_name="employee_creating_wholesaler_receipt", on_delete=models.CASCADE)
    in_placement = models.CharField(max_length=50, choices=TRUE_FALSE_OPTIONS, default='true')
    description = models.TextField(max_length=300)
    created = models.DateTimeField(default=timezone.now)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, related_name="wholesalerReceiptOwner", on_delete=models.CASCADE)

    def __str__(self):
        return self.product.title

    def save(self, *args, **kwargs):
        # 1. Cache product to avoid multiple database hits
        product = self.product
        
        # 2. Sync barcodes safely
        if product and product.bar_code:
            self.bar_code = product.bar_code
        elif self.bar_code and product and not product.bar_code:
            product.bar_code = self.bar_code
            product.save(update_fields=['bar_code'])  # Safe: limits save to one column

      
        super(WholesalerReceipts, self).save(*args, **kwargs)


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

            


class WholesalerPriceDiscounts(EntityRelatedModel):
    wholesaler_receipt = models.ForeignKey(
        WholesalerReceipts, 
        related_name="wholesaler_price_discount_receipt", 
        on_delete=models.CASCADE
    )
    title = models.CharField(max_length=100)
    percent = models.DecimalField(max_digits=4, decimal_places=2)
    normal_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    offer_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(max_length=50, choices=TRUE_FALSE_OPTIONS, default="true")
    price_discount_banners = models.ManyToManyField(
        WholesalerPriceDiscountBanners, related_name="price_discount_banners"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="wholesaler_price_discount_owner", on_delete=models.CASCADE
    )
    def __str__(self):
        return f"{self.title}"
    
    def save(self, *args, **kwargs):
            # Use an atomic transaction so both updates succeed or fail together
            with transaction.atomic():
                # 1. Save the discount record first
                super(WholesalerPriceDiscounts, self).save(*args, **kwargs)

                # 2. If this discount is active today, force update the receipt's final price
                today = timezone.now().date()
                if self.is_active == "true" and self.start <= today <= self.end:
                    receipt = self.wholesaler_receipt
                    receipt.final_unit_selling_price = self.offer_price
                    receipt.discount_unit_selling_price = receipt.unit_selling_price - self.offer_price
                    receipt.save(update_fields=['final_unit_selling_price', 'discount_unit_selling_price'])  

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
    wholesaler_receipt = models.ForeignKey(WholesalerReceipts,related_name="wholesaler_quantity_discount_receipt", on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    limit_quantity = models.IntegerField(default=0)
    awarded_quantity = models.IntegerField(default=0)
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    quantity_discount_banners = models.ManyToManyField(
        WholesalerQuantityDiscountBanners,
        related_name="quantity_discount_banners",
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="wholesale_quantity_discount_owner", on_delete=models.CASCADE
    )


    # def __str__(self):
    #     return f"{self.title}"


class RetailerOrders(EntityRelatedModel):
    """
    Order that a wholesaler places on a wholesaler
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
        Entities, related_name="wholesalerOrderRetailer", on_delete=models.CASCADE
    )
    wholesaler = models.ForeignKey(
        Entities, related_name="wholesalerOrderWholesaler", on_delete=models.CASCADE
    )
    facilitator = models.ForeignKey(
        Entities, related_name="wholesalerOrderFacilitator", on_delete=models.CASCADE,null=True,blank=True
    )
    # retailer_order_number = models.CharField(
    #     max_length=10, unique=True
    # )
    draft_id = models.CharField(max_length=100, null=True, blank=True)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="reatiler_order_payment_method",
        on_delete=models.CASCADE, null=True, blank=True
    )
    document_number = models.ForeignKey(
        DocumentNumbers,
        related_name="retailer_order_document_number",
        on_delete=models.CASCADE, null=True, blank=True
    )
    shipping_amount = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2
    )
    order_discount_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
    )
    order_gross_price_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
    )
    final_price = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
    )
    final_price_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
    )
    order_tax_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True
    )
    order_terms = models.CharField(max_length=20, choices=TERMS_CHOICES)
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES)
    status = models.CharField(
        max_length=20, choices=ORDER_STATUS_CHOICES, default='SUBMITTED')
    is_paid = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    paid_at = models.DateTimeField(auto_now_add=True)
    is_delivered = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    delivered_at = models.DateTimeField(auto_now_add=True)
    employee = models.ForeignKey(
        Employees, related_name="employee_creating_order", on_delete=models.CASCADE,null=True,blank=True
    )
    delivered_by = models.ForeignKey(
        Users,
        related_name="wholesalerOrderDeliveredBy",
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
        related_name="wholesalerOrderProcessedBy",
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
        related_name="wholesalerOrderPackedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_received = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    reference_number = models.CharField(
        max_length=56,null=True, blank=True
    )
    received_at = models.DateTimeField(auto_now_add=True)
    received_by = models.ForeignKey(
        Users,
        related_name="wholesalerOrderReceivedBy",
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
        related_name="wholesalerOrderApprovedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_dispatched = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='true'
    )
    dispatched_at = models.DateTimeField(auto_now_add=True)
    dispatched_by = models.ForeignKey(
        Users,
        related_name="wholesalerOrderDispatchedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    order_origin = models.CharField(
        max_length=20, choices=ORDER_ORIGIN_CHOICES)
    delivery_method = models.CharField(max_length=20, choices=DELIVERY_CHOICES)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="wholesaler_order_owner", on_delete=models.CASCADE
    )

    def save(self, *args, **kwargs):
        # self.retailer_order_number = self.retailer_order_number.upper()

        super(RetailerOrders, self).save(*args, **kwargs)


class RetailerOrderItems(EntityRelatedModel):
    retailer_order = models.ForeignKey(
        RetailerOrders, related_name="retailer_order", on_delete=models.CASCADE
    )
    wholesaler_receipt = models.ForeignKey(
        WholesalerReceipts, related_name="order_item_wholesaler_receipt", on_delete=models.CASCADE
    )
    purchased_quantity = models.IntegerField(default=0)
    discount_quantity = models.IntegerField(default=0)
    total_quantity = models.IntegerField(default=0)

    item_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_final_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_final_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    unit_of_issue = models.CharField(max_length=20,choices=UNITS_OF_ISSUE_CHOICES, default="Pack")

    item_tax = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_tax_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_counter_price_discount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_counter_price_discount_amount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_counter_price_discount_amount_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,default=0.00
    )
    item_price_discount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_price_discount_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_net_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    item_net_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    stakeholders = models.ManyToManyField(Stakes)
    is_received = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    is_issued = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default='false'
    )
    item_pending_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True)
    item_paid_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00)
    employee = models.ForeignKey(
        Employees, related_name="employee_creating_order_item", on_delete=models.CASCADE, null=True, blank=True
    )
    created = models.DateField(auto_now_add=True)
    updated = models.DateField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="wholesaler_order_item_owner", on_delete=models.CASCADE
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["retailer_order", "wholesaler_receipt"],
                name="One item per order",
            )
        ]

    def __str__(self) -> str:
        return f"{self.wholesaler_receipt.product.title}"

    # def save(self, *args, **kwargs):

    #     self.item_price_total= float(self.purchased_quantity) * float(self.wholesaler_receipt.pack_selling_price)
    #     quantity_discount =None
    #     applicable_discounts =[]
    #     price_discount = None
    #     if WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=self.wholesaler_receipt,is_active="true",limit_quantity__gte=self.purchased_quantity).exists():
    #         applicable_discounts =WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=self.wholesaler_receipt,is_active="true",limit_quantity__gte=self.purchased_quantity).all()

    #         for disc in applicable_discounts:
    #             if self.purchased_quantity % disc.limit_quantity>0 and self.purchased_quantity % disc.limit_quantity <self.purchased_quantity:
    #                 quantity_discount = disc
    #                 self.discount_quantity=quantity_discount.awarded_quantity
    #                 self.total_quantity = self.purchased_quantity + quantity_discount.awarded_quantity
    #                 return
                

    #     if WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=self.wholesaler_receipt,is_active="true").exists():
    #         price_discount =WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=self.wholesaler_receipt,is_active="true").first()

    #         self.item_price_discount = float(self.wholesaler_receipt.pack_selling_price)* float(price_discount.percent)/100.00  
    #         self.item_net_price = float(self.wholesaler_receipt.pack_selling_price) - float(self.item_price_discount)

    #         self.item_net_price_total = self.item_net_price * float(self.purchased_quantity)
    #     super(RetailerOrderItems, self).save(*args, **kwargs)


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
