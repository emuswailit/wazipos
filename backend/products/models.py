from django.db import models
from django.contrib.auth import get_user_model
from authentication.models import Categories, Countries, Entities, SubCategories
from django.utils.text import slugify
from core.models import EntityRelatedModel
from drugs.models import Preparation
from django_advance_thumbnail import AdvanceThumbnailField
from django.core.files import File
from io import BytesIO
from PIL import Image
from authentication.models import Departments,Users
from django.contrib.postgres.fields import ArrayField
from enum import Enum

User = get_user_model()



TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)


def product_image_upload_to(instance, filename):
    title = instance.product.title
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

class ProductImages(EntityRelatedModel):
    """ Product image"""
    """Model for uploading profile product image as we create"""

    product = models.ForeignKey(
        "Products", related_name="product_images", on_delete=models.CASCADE
    )
    image = models.ImageField(upload_to=product_image_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/products/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Product Images"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.image:
            image = self.image
            if (
                image.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress image function
                self.image = compress_image(image)
        super(ProductImages, self).save(*args, **kwargs)

    def __str__(self):
        if self.product.preparation:
            return f"{self.product.title} - {self.product.preparation.title}"
        else:
            return self.product.title


class ProductsQuerySet(models.query.QuerySet):
    def active(self):
        return self.filter(active=True)

    def featured(self):
        return self.filter(featured=True, active=True)


class ProductsManager(models.Manager):
    def get_queryset(self):
        return ProductsQuerySet(self.model, using=self._db)

    def all(self):
        return self.get_queryset().filter(active=True)

    def featured(self):  # Products.objects.featured()
        return self.get_queryset().featured()

    def get_by_id(self, id):
        # Products.objects == self.get_queryset()
        qs = self.get_queryset().filter(id=id, active=True)
        if qs.count() == 1:
            return qs.first()
        return None

    # def get_by_category(self, category_id):
    #     # Products.objects == self.get_queryset()
    #     qs = self.get_queryset().filter(category_id=category_id)
    #     if qs.count() > 0:
    #         return qs
    #     return None

    def search(self, query):
        return self.get_queryset().active().search(query)

class DrinksCategory(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Drinks Categories"
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=48, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="drink_category_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
  
        super(DrinksCategory, self).save(*args, **kwargs)




class EntityType(Enum):
    BAR = "Bar"
    BANK = "Bank"
    CLINIC = "Clinic"
    DEFAULT = "Default"
    DISPENSARY = "Dispensary"
    GENERAL_DISTRIBUTOR = "GeneralDistributor"
    PHARMACEUTICAL_DISTRIBUTOR = "PharmaceuticalDistributor"
    FARM = "Farm"
    GROCERY = "Grocery"
    HOSPITAL = "Hospital"
    HOTEL = "Hotel"
    INTERNET_SERVICE_PROVIDER = "InternetServiceProvider"
    INSURANCE = "Insurance"
    GENERAL_MANUFACTURER = "GeneralManufacturer"
    PHARMACEUTICAL_MANUFACTURER = "PharmaceuticalManufacturer"
    PARK = "Park"
    PARKING = "Parking"
    GENERAL_RETAILER = "GeneralRetailer"
    PHARMACEUTICAL_RETAILER = "PharmaceuticalRetailer"
    REALTY = "Realty"
    RESTAURANT = "Restaurant"
    SACCO = "Sacco"
    TRANSPORT_COMPANY = "TransportCompany"
    TELCO = "Telco"
    GENERAL_WHOLESALER = "GeneralWholesaler"
    PHARMACEUTICAL_WHOLESALER = "PharmaceuticalWholesaler"

    @classmethod
    def choices(cls):
        return [(item.value, item.value) for item in cls]

    @classmethod
    def default_entities(cls):
        """Returns the default list of string values for migrations/models."""
        return [
            cls.GENERAL_MANUFACTURER.value,
            cls.GENERAL_WHOLESALER.value,
            cls.GENERAL_RETAILER.value
        ]


class Products(EntityRelatedModel):
    IS_VATABLE_OPTIONS = (
        ("true", "true"),
        ("false", "false"),
    )
    """
    -Model for all products in the system
    -If preparation parameter is provided then the product is a drug
    -Creation of this instances must be controlled to to ensure no duplication
    -Should be done at admin level though it may pose onboarding challenges

    """

    preparation = models.ForeignKey(
        Preparation,
        related_name="product_preparation",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=100)
    packaging = models.CharField(max_length=100, default="")
    bar_code = models.CharField(max_length=256, default="",null=True,blank=True)
    category = models.ForeignKey(Categories, on_delete=models.CASCADE,null=True,blank=True)
    sub_category = models.ForeignKey(
        SubCategories, on_delete=models.CASCADE, null=True, blank=True
    )
    description = models.TextField(null=True, blank=True)
    is_drug = models.BooleanField(default=True)
    is_pom = models.BooleanField(default=True)
    is_vatable = models.CharField(
        max_length=50, choices=IS_VATABLE_OPTIONS, default="false"
    )
    images = models.ManyToManyField(
        ProductImages,
        related_name="images",
    )
    manufacturer = models.ForeignKey(
        Entities, related_name="product_manufacturer", on_delete=models.CASCADE,null=True,blank=True
    )
    origin_country = models.ForeignKey(
        Countries, related_name="product_origin_country", on_delete=models.CASCADE, null=True, blank=True
    )
    units_per_pack = models.BigIntegerField(null=True,blank=True,default=None)
    images = models.ManyToManyField(ProductImages, related_name="images", blank=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    allowed_entities = ArrayField(
        models.CharField(max_length=50, choices=EntityType.choices()),
        blank=True,
        # Uses the classmethod callable to guarantee immutability across row generation
        default=EntityType.default_entities 
    )

    # class Meta:
    #     unique_together = ("manufacturer", "title", "units_per_pack")
    class Meta:
        verbose_name_plural = "products"
        constraints = [
            models.UniqueConstraint(
                fields=["manufacturer", "title", "units_per_pack"],
                name="Unique names for products by a manufacturer",
            ),
        ]

    def __str__(self):
        if self.preparation:
            return f"{self.preparation.title} - {self.title}"
        else:
            return self.title

    def product_name(self):
        if self.preparation:
            return f"{self.preparation.title} - {self.title}"
        else:
            return f"{self.title}"

    objects = ProductsManager()

    def is_drug(self):
        if self.preparation:
            return True
        else:
            return False

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        if self.manufacturer and self.manufacturer.country:
            self.origin_country= self.manufacturer.country
        super(Products, self).save(*args, **kwargs)


# class EntityServices(EntityRelatedModel):
#     title = models.CharField(max_length=256, null=True, blank=True)
#     service_code = models.CharField(max_length=48, null=True, blank=True)
#     price = models.DecimalField(default=0.00, max_digits=7, decimal_places=2 )
#     description = models.CharField(max_length=48, null=True, blank=True)
#     department = models.ForeignKey(
#         Departments,
#         related_name="service_creator",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     owner = models.ForeignKey(
#         Users,
#         related_name="service_creator",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     attendants = models.ManyToManyField("employees.Employees",blank=True)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)

#     def save(self, *args, **kwargs):
#         if self.title:
#             self.title = self.title.upper()
#         super(EntityServices, self).save(*args, **kwargs)
#     class Meta:
#         constraints = [
#             models.UniqueConstraint(
#                 fields=["entity", "department", "title"],
#                 name="Title must be unique for each entity department",
#             )
#         ]
#         verbose_name_plural = "Entity Services"

