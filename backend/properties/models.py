from django.db import models
from core.models import EntityRelatedModel
from authentication.models import Countries,Counties

# Create your models here.
import random
import string

from autoslug import AutoSlugField
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from django_advance_thumbnail import AdvanceThumbnailField
from django.core.files import File
from io import BytesIO
from PIL import Image
from django.utils.text import slugify
from datetime import date
from dateutil.relativedelta import relativedelta
from month.models import MonthField


User = get_user_model()

TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)

class StatusOptions(models.TextChoices):
    INITIATED = "INITIATED", _("INITIATED")
    SUCCESS = "SUCCESS", _("SUCCESS")
    FAILED = "FAILED", _("FAILED")
    PENDING = "PENDING", _("PENDING")
    SETTLED = "SETTLED", _("SETTLED")


def property_image_upload_to(instance, filename):
    title = instance.property.title
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename

def property_unit_image_upload_to(instance, filename):
    title = instance.property_unit.title
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename

def property_unit_tenant_contract_upload_to(instance, filename):
    title = instance.property_unit.title
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


class PropertyImages(EntityRelatedModel):
    """Model for uploading property image as we create"""

    property = models.ForeignKey(
        "Property", related_name="property_images", on_delete=models.CASCADE
    )
    image = models.ImageField(upload_to=property_image_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/properties/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User,null=True,blank=True, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Property Images"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.image:
            image = self.image
            if (
                image.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress image function
                self.image = compress_image(image)
        super(PropertyImages, self).save(*args, **kwargs)


class PropertyFacilities(EntityRelatedModel):
    title = models.CharField(verbose_name=_("Property Facility Title"), max_length=250)
    icon = models.CharField(verbose_name=_("Property Facility Icon"), max_length=250)
    description = models.TextField(
        verbose_name=_("Description"),
        default="Default description...update me please....",
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User,null=True,blank=True, on_delete=models.CASCADE)

    def __str__(self):
        return self.title


class PropertyPublishedManager(models.Manager):
    def get_queryset(self):
        return (
            super(PropertyPublishedManager, self)
            .get_queryset()
            .filter(is_published="true")
        )


class Property(EntityRelatedModel):
    class DisposalType(models.TextChoices):
        SALE = "SALE", _("SALE")
        RENTAL = "RENTAL", _("RENTAL")
        AUCTION = "AUCTION", _("AUCTION")

    class PropertyType(models.TextChoices):
        HOUSE = "HOUSE", _("HOUSE")
        APARTMENT = "APARTMENT", _("APARTMENT")
        OFFICE = "OFFICE", _("OFFICE")
        WAREHOUSE = "WAREHOUSE", _("WAREHOUSE")
        COMMERCIAL = "COMMERCIAL", _("COMMERCIAL")
        OTHER = "OTHER", _("OTHER")

    owner = models.ForeignKey(
        User,
        verbose_name=_("Property Owner"),
        related_name="property_owner",
        on_delete=models.DO_NOTHING,
    )
    care_taker = models.ForeignKey(
        User,
        verbose_name=_("Property Caretaker"),
        related_name="property_care_taker",
        on_delete=models.DO_NOTHING,null=True,blank=True
    )

    title = models.CharField(verbose_name=_("Property Title"), max_length=250)
    slug = AutoSlugField(populate_from="title", unique=True, always_update=True)

    description = models.TextField(
        verbose_name=_("Description"),
        default="Default description...update me please....",
    )
    country = models.ForeignKey(
        Countries, related_name="property_country", on_delete=models.CASCADE, null=True, blank=True
    )
    county = models.ForeignKey(
        Counties,related_name="property_county", on_delete=models.CASCADE, null=True, blank=True
    )
    town = models.CharField(verbose_name=_("Town"), max_length=180, default="")
    street_address = models.CharField(
        verbose_name=_("Street Address"), max_length=150, default="KG8 Avenue"
    )
    estate = models.CharField(
        verbose_name=_("Estate"), max_length=150, default=""
    )
    property_number = models.CharField(
        verbose_name=_("Property Number"), max_length=150, default=""
    )

    plot_area = models.DecimalField(
        verbose_name=_("Plot Area(m^2)"), max_digits=8, decimal_places=2, default=0.0
    )
    total_floors = models.IntegerField(verbose_name=_("Number of floors"), default=0)
    number_of_units = models.IntegerField(verbose_name=_("Number of Units"), default=1)
    disposal_type = models.CharField(
        verbose_name=_("Disposal Type"),
        max_length=50,
        choices=DisposalType.choices,
        default=DisposalType.RENTAL,
    )

    property_type = models.CharField(
        verbose_name=_("Property Type"),
        max_length=50,
        choices=PropertyType.choices,
        default=PropertyType.OTHER,
    )

    images = models.ManyToManyField(
        PropertyImages,
        related_name="images",
    )
    facilities = models.ManyToManyField(
        PropertyFacilities,
        related_name="facilities",
    )

    is_published = models.CharField(
        max_length=50,verbose_name=_("Is Published"), choices=TRUE_FALSE_OPTIONS, default="true"
    )

    views = models.IntegerField(verbose_name=_("Total Views"), default=0)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    objects = models.Manager()
    published = PropertyPublishedManager()

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = "Property"
        verbose_name_plural = "Properties"
        unique_together = ("entity", "title",)

    @property
    def average_rating(self):
        reviews = self.reviews.all()
        if reviews.exists():
            return round(sum([r.rating for r in reviews]) / reviews.count(), 1)
        return None

    def save(self, *args, **kwargs):
        self.title = self.title.strip().upper()
        super(Property, self).save(*args, **kwargs)

class PropertyReview(EntityRelatedModel):
    property = models.ForeignKey(Property, related_name="property_review_property", on_delete=models.CASCADE)
    user = models.ForeignKey(User, related_name="property_review_user", on_delete=models.CASCADE)
    rating = models.PositiveIntegerField(choices=[(i, i) for i in range(1, 6)])  # 1–5
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('property', 'user')  # 1 review per user per property
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.property.title} ({self.rating})"

class PropertyViews(EntityRelatedModel):
    ip = models.CharField(verbose_name=_("IP Address"), max_length=250)
    property = models.ForeignKey(
        Property, related_name="property_views", on_delete=models.CASCADE
    )

    def __str__(self):
        return (
            f"Total views on - {self.property.title} is - {self.property.views} view(s)"
        )

    class Meta:
        verbose_name = "Total Views on Property"
        verbose_name_plural = "Total Property Views"

class PropertyUnitImages(EntityRelatedModel):
    """Model for uploading property unit image as we create"""

    property_unit = models.ForeignKey(
        "PropertyUnits", related_name="property_unit_images", on_delete=models.CASCADE
    )
    image = models.ImageField(upload_to=property_unit_image_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/properties/units/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User,null=True,blank=True, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Property Unit Images"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.image:
            image = self.image
            if (
                image.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress image function
                self.image = compress_image(image)
        super(PropertyUnitImages, self).save(*args, **kwargs)


class PropertyUnits(EntityRelatedModel):
    class DisposalType(models.TextChoices):
        SALE = "SALE", _("SALE")
        RENTAL = "RENTAL", _("RENTAL")
        AUCTION = "AUCTION", _("AUCTION")

    class PropertyUnitType(models.TextChoices):
        APARTMENT = "APARTMENT", _("APARTMENT")
        BEDSITTER = "BEDSITTER", _("BEDSITTER")
        BUNGALOW = "BUNGALOW", _("BUNGALOW")
        CHALET = "CHALET", _("CHALET")
        CONDO = "CONDO", _("CONDO")
        DUPLEX = "DUPLEX", _("DUPLEX")
        FAMHOUSE = "FAMHOUSE", _("FAMHOUSE")
        WAREHOUSE = "WAREHOUSE", _("WAREHOUSE")
        OFFICE = "OFFICE", _("OFFICE")
        OTHER = "OTHER", _("OTHER")
        MAISONNETE = "MAISONNETE", _("MAISONNETE")
        PENTHOUSE = "PENTHOUSE", _("PENTHOUSE")
        STUDIO = "STUDIO", _("STUDIO")
        TOWNHOUSE = "TOWNHOUSE", _("TOWNHOUSE")
        VILLA = "VILLA", _("VILLA")

    property = models.ForeignKey(
        Property, related_name="property_units", on_delete=models.CASCADE
    )
    property_unit_type = models.CharField(
            verbose_name=_("Property Unit Type"),
            max_length=50,
            choices=PropertyUnitType.choices,
            default=PropertyUnitType.OTHER,
        )
    tax = models.DecimalField(
        verbose_name=_("Property Tax"),
        max_digits=6,
        decimal_places=2,
        default=0.15,
        help_text="15% property tax charged",
    )
    reference_number = models.CharField(
        verbose_name=_("Property Reference Code"),
        max_length=255,
        unique=True,
        blank=True,
    )
    disposal_type = models.CharField(
        verbose_name=_("Disposal Type"),
        max_length=50,
        choices=DisposalType.choices,
        default=DisposalType.RENTAL,
    ) 
    title = models.CharField(verbose_name=_("Unit Title"), max_length=255,null=True,blank=True)
    floor = models.CharField(verbose_name=_("Floor Number"), max_length=255,null=True,blank=True)
    bedrooms = models.IntegerField(verbose_name=_("Bedrooms"), default=0)
    bathrooms = models.IntegerField(
        verbose_name=_("Bathrooms"), default=0
    )
    area = models.DecimalField(
        verbose_name=_("Area(m^2)"), max_digits=8, decimal_places=2, default=0.0
    )
    price = models.DecimalField(
        verbose_name=_("Price"), max_digits=8, decimal_places=2, default=0.0
    )
    price_due_date = models.DateField(verbose_name=_("Price Due Date"), null=True, blank=True)
    images = models.ManyToManyField(
        PropertyUnitImages,
        related_name="property_unit_images",
    )
    owner = models.ForeignKey(
        User,
        verbose_name=_("Property Unit Owner"),
        related_name="property_unit_owner",
        on_delete=models.DO_NOTHING,
    )
    description = models.TextField(
        verbose_name=_("Description"),null=True,blank=True
    )
    is_available = models.CharField(
        max_length=50,verbose_name=_("Is Available"), choices=TRUE_FALSE_OPTIONS, default="true"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
    
        super(PropertyUnits, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.property.title} - Unit {self.title}"

    class Meta:
        verbose_name = "Property Unit"
        verbose_name_plural = "Property Units"
        unique_together = ("entity", "property", "title",) 

class PropertyUnitTenants(EntityRelatedModel):
    property_unit = models.ForeignKey(
        PropertyUnits, related_name="unit_tenants", on_delete=models.CASCADE
    )
    
    tenant = models.ForeignKey(
        User, related_name="tenant", on_delete=models.CASCADE
    )
    lease_start = models.DateField(verbose_name=_("Lease Start Date"))
    lease_end = models.DateField(verbose_name=_("Lease End Date"),null=True,blank=True)
    contract = models.FileField(upload_to='tenants/contracts/',null=True,blank=True)

    is_active = models.CharField(
        max_length=50,verbose_name=_("Is Active"), choices=TRUE_FALSE_OPTIONS, default="true"
    )
    owner = models.ForeignKey(User, related_name="property_unit_tenant_owner",on_delete=models.DO_NOTHING)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    def __str__(self):
        return f"{self.property_unit.property.title} - Unit {self.property_unit.reference_number} - Tenant: {self.tenant.first_name}"

    class Meta:
        verbose_name = "Property Unit Tenant"
        verbose_name_plural = "Property Unit Tenants"

class PropertyUnitPayments(EntityRelatedModel):
    property_unit = models.ForeignKey(
        PropertyUnits, related_name="tenant_payments", on_delete=models.CASCADE
    )
    amount = models.DecimalField(
        verbose_name=_("Amount Paid"), max_digits=8, decimal_places=2, default=0.0
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    valid_from = models.DateField(verbose_name=_("Payment Valid From Date"))
    valid_to = models.DateField(verbose_name=_("Payment Valid To Date"))
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="property_unit_payment_method",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    description = models.CharField(max_length=256, default="",null=True,blank=True)
    reference_number = models.CharField(max_length=50, default="",null=True, blank=True)
    msisdn = models.CharField(max_length=50, default="",null=True, blank=True)
    psp_reference_number = models.CharField(max_length=50, null=True, blank=True)
    months = models.IntegerField(verbose_name=_("Number of months paid for"), default=1)
    telco = models.CharField(max_length=50, null=True, blank=True)
    currency = models.CharField(max_length=50, default="KES")
    provider_reference_number = models.CharField(max_length=50, default="",null=True,blank=True)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    account = models.ForeignKey(
        "payments.UserAccounts",
        related_name="property_unit_payment_account",
        on_delete=models.CASCADE,   
    )

    # def save(self, *args, **kwargs):
    #     if not self.pk:  # Only set due_date if it's a new object
    #         today = date.today()
    #         self.valid_from = today
    #         # Calculate the first day of the next month
    #         # Add one month to the current date, then set the day to 1
    #         self.valid_to = (today + relativedelta(months=1)).replace(day=5)
    #     super().save(*args, **kwargs)

    def __str__(self):
        return f"Payment of {self.amount} for {self.property_unit.title}for {self.months} months"

    class Meta:
        verbose_name = "Property Unit Payment"
        verbose_name_plural = "Property Unit Payments"

class PropertyUnitPaymentMonths(EntityRelatedModel):
    payment = models.ForeignKey(
        PropertyUnitPayments, related_name="payment_months", on_delete=models.CASCADE
    )
    month = MonthField()
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Receipt for Payment {self.payment.reference_number} - Amount: {self.payment.amount}"

    class Meta:
        verbose_name = "Property Unit Payment Months"
        verbose_name_plural = "Property Unit Payment Months"
