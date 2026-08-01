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


TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)
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

class RetailerReceipts(EntityRelatedModel):

    product = models.ForeignKey("products.Products", on_delete=models.CASCADE)
    received_from = models.ForeignKey(
        Entities,
        related_name="retailerVariationReceiptSupplier",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    bar_code = models.CharField(max_length=256, default="",null=True,blank=True)
    retailer_order = models.ForeignKey(
        RetailerOrders,
        related_name="retailer_wholesale_order",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    retailer_order_item = models.ForeignKey(
        RetailerOrderItems,
        related_name="retailer_wholesale_order_item",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    batch = models.CharField(max_length=50, null=True, blank=True)
    supplier_invoice = models.CharField(max_length=50, null=True, blank=True)
    manufacture_date = models.DateField(default=None, null=True, blank=True)
    expiry_date = models.DateField(default=None, null=True, blank=True)
    unit_buying_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,blank=True
    )
    unit_price_discount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )

    final_unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    units_per_pack=models.IntegerField(default=1)
    unit_of_receipt = models.CharField(
        verbose_name=_("Unit of Receipt"),
        choices=UnitsOfReceipt.choices,default="PIECE",
        max_length=20,
    )

    received_unit_quantity = models.IntegerField()
 
    current_unit_quantity = models.IntegerField()

    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
 
    in_placement = models.BooleanField(default=False)
    created = models.DateTimeField(default=timezone.now)
    updated = models.DateTimeField(auto_now=True)
    employee = models.ForeignKey(
        Employees, related_name="employee_creating_receipt", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        User, related_name="retailerVariationReceiptOwner", on_delete=models.CASCADE
    )

    class Meta:
        verbose_name_plural = "Retailer Inventory"

    def save(self, *args, **kwargs):
     
            
        if self.product.bar_code:
            self.bar_code=self.product.bar_code

        super(RetailerReceipts, self).save(*args, **kwargs)

    def title(self):
        return self.product.title

    def __str__(self):
        return self.product.title


    def num_reviews(self):
        return self.retailer_variation.num_reviews

    def description(self):
        return self.retailer_variation.product.description



class IndentingCriteria(models.TextChoices):
        OUT_OF_STOCK = "OUT_OF_STOCK", _("OUT_OF_STOCK")
        TOP_UP = "TOP_UP", _("TOP_UP")
        SPECIAL_ORDER = "SPECIAL_ORDER", _("SPECIAL_ORDER")
        ON_OFFER = "ON_OFFER", _("ON_OFFER")

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


class RetailerIndent(EntityRelatedModel):
    class Meta:
        verbose_name_plural="Retailer Indent"
    indent_number = models.ForeignKey(
        DocumentNumbers,
        related_name="indent_number",
        on_delete=models.CASCADE, null=True, blank=True
    )
    order_days = models.IntegerField()
    lead_time = models.IntegerField()
    is_open = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="retailer_indent_owner",
        on_delete=models.CASCADE,
    )

class RetailerIndentItem(EntityRelatedModel):
    class Meta:
        verbose_name_plural="Retailer Indent Items"
        unique_together=("wholesale_receipt","retailer_indent","entity")
    indenting_criteria = models.CharField(
        verbose_name=_("Indenting Criteria"),
        choices=IndentingCriteria.choices,
        max_length=20,null=True, blank=True
    )
   
    retailer_indent = models.ForeignKey(
        RetailerIndent,
        on_delete=models.CASCADE,
        related_name="indent_for_item",
        null=True,
        blank=True,
    )

    wholesale_receipt = models.ForeignKey(WholesalerReceipts, on_delete=models.CASCADE,null=True,blank=True)
    wholesaler_price_discount = models.ForeignKey(WholesalerReceipts, on_delete=models.CASCADE,null=True,blank=True)
    wholesaler_price_discount = models.ForeignKey(WholesalerPriceDiscounts, on_delete=models.CASCADE,null=True,blank=True)
    wholesaler_quantity_discount = models.ForeignKey(WholesalerQuantityDiscounts, on_delete=models.CASCADE,null=True,blank=True)
    required_quantity = models.IntegerField()
    total_quantity = models.IntegerField()
    final_pack_price = models.DecimalField(max_digits=7, decimal_places=2,default=0.00)
    item_gross_total_amount = models.DecimalField(max_digits=7, decimal_places=2,default=0.00)
    item_net_total_amount = models.DecimalField(max_digits=7, decimal_places=2,default=0.00)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="retailer_indent_item_owner",
        on_delete=models.CASCADE,
    )

    # def save(self, *args, **kwargs):
    #     if self.wholesaler_price_discount:
    #         self.final_pack_price =self.wholesale_receipt.pack_selling_price - (self.wholesale_receipt.pack_selling_price*self.wholesaler_price_discount.percent/100)
    #         self.item_gross_total_amount =self.required_quantity * self.wholesale_receipt.pack_selling_price
    #         self.item_net_total_amount =self.final_pack_price * self.required_quantity
    #     else:
    #         self.final_pack_price=self.wholesale_receipt.pack_selling_price
    #         self.item_gross_total_amount =float(self.required_quantity) * float(self.wholesale_receipt.pack_selling_price)
    #         self.item_net_total_amount =float(self.final_pack_price) * float(self.required_quantity)
        
    #     if self.wholesaler_quantity_discount:
    #         self.total_quantity=self.required_quantity+ self.wholesaler_quantity_discount.awarded_quantity
    #     else:
    #         self.total_quantity=self.required_quantity

    #     super(RetailerIndentItem, self).save(*args, **kwargs)

class OutOfStock(EntityRelatedModel):
    class Meta:
        verbose_name_plural="Out Of Stock Items"

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
    An order describes the entire need of a client e.g. the exact costing of the prescription
    """

    class OrderOriginOptions(models.TextChoices):
        CUSTOMER = "CUSTOMER", _("CUSTOMER")
        STAFF = "STAFF", _("STAFF")

    class OrderTypeOptions(models.TextChoices):
        CUSTOMER = "NORMAL", _("NORMAL")
        STAFF = "PRESCRIPTION", _("PRESCRIPTION")

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
        on_delete=models.CASCADE, null=True, blank=True
    )
    payment_account_number = models.CharField(max_length=50, null=True, blank=True)

    reference_number = models.CharField(max_length=100, null=True, blank=True)
    prescription = models.ForeignKey(
        Prescriptions, null=True, blank=True, on_delete=models.CASCADE
    )

    order_type = models.CharField(
        max_length=100, null=True, blank=True, default="NORMAL",
         choices=OrderTypeOptions.choices,
    )
    draft_id = models.CharField(
        max_length=256, null=True, blank=True,
    )
    city_name = models.CharField(
        max_length=256, null=True, blank=True,
    )
    recipient_name = models.CharField(
        max_length=256, null=True, blank=True,
    )
    recipient_phone = models.CharField(
        max_length=256, null=True, blank=True,
    )
    order_origin = models.CharField(
        verbose_name=_("Order Origin"),
        choices=OrderOriginOptions.choices,
        max_length=20,
    )

    status = models.CharField(
        verbose_name=_("Order Status"),
        choices=OrderStatusOptions.choices,
        max_length=20,
        default=OrderStatusOptions.PROCESSING
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
        max_digits=7, decimal_places=2, null=True, blank=True,default=0.00
    )
    farness = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    shipping_cost = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    order_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,default=0.00
    )
    order_price_discount_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    order_net_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )

    is_quoted = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    paid_at = models.DateTimeField(auto_now_add=True)
    is_settled = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_delivered = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    delivered_at = models.DateTimeField(auto_now_add=True)
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
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    processed_at = models.DateTimeField(auto_now_add=True)
    processed_by = models.ForeignKey(
        Users,
        related_name="retailerOrderProcessedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_packed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    packed_at = models.DateTimeField(auto_now_add=True)
    packed_by = models.ForeignKey(
        Users,
        related_name="retailerOrderPackedBy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_received = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    received_at = models.DateTimeField(auto_now_add=True)
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
    due_date = models.DateField(auto_now=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="retailerOrderOwner", on_delete=models.CASCADE
    )
    class Meta:
        verbose_name_plural = "Customer Orders"
    def __str__(self):
        return f"{self.entity.title}-{self.order_number}"

    # def save(self, *args, **kwargs):
    #     if self.customer:
    #         self.customer_name = f"{self.customer.first_name} {self.customer.last_name}"
    #         self.customer_phone = f"{self.customer.phone}"

    #     if self.coupon:
    #         self.discount = self.coupon.discount
    #     super(CustomerOrders, self).save(*args, **kwargs)


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

class CustomerOrderItems(EntityRelatedModel):
    customer_order = models.ForeignKey(
        CustomerOrders, related_name="parent_order", on_delete=models.CASCADE
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
    purchased_quantity = models.IntegerField(null=True,blank=True,default=0)
    discount_quantity = models.IntegerField(default=0)
    total_quantity = models.DecimalField(max_digits=7, decimal_places=2,default=0.00)
    quantity = models.DecimalField(max_digits=7, decimal_places=2,default=0.00)
    item_price = models.DecimalField(max_digits=7, decimal_places=2)
    item_price_total = models.DecimalField(max_digits=7, decimal_places=2)
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
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    
    class Meta:
        verbose_name_plural = "Customer Order Items"
    def save(self, *args, **kwargs):

        if self.purchased_quantity and self.item_price:
            self.item_price_total = self.purchased_quantity * self.item_price
            self.customer_order.order_price_total +=self.item_price_total
            self.customer_order.save()
        super(CustomerOrderItems, self).save(*args, **kwargs)

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


# class CustomerOrderPayments(EntityRelatedModel):
#     customer_order = models.OneToOneField(
#         CustomerOrders, related_name="customer_order_paid", on_delete=models.CASCADE
#     )
#     user = models.ForeignKey(
#         Users,
#         related_name="paying_user",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     reference_number = models.CharField(max_length=50, default="")
#     amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
#     narration = models.CharField(max_length=100)
#     msisdn = models.CharField(max_length=50, default="")
#     transfer_status = models.CharField(max_length=50, default="")
#     account_number = models.CharField(max_length=50, default="")
#     transaction_id = models.CharField(max_length=50, default="")
#     created = models.DateTimeField(auto_now_add=True)
#     transaction_time = models.DateTimeField(auto_now_add=False)
#     updated = models.DateTimeField(auto_now=True)
#     owner = models.ForeignKey(
#         Users, related_name="payment_owner", on_delete=models.CASCADE
#     )

#     class Meta:
#         verbose_name_plural = "Customer Order Payments"


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