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




# products/models.py

from django.contrib.postgres.fields import ArrayField
from django.db import models

from authentication.models import Entities, Users
from core.constants import EntityType
from core.models import EntityRelatedModel





# =====================================================================
# Products
# =====================================================================
# products/models.py (or wherever this model lives)

from django.contrib.gis.db import models as geomodel
from django.db import models
from django.utils.translation import gettext_lazy as _
from decimal import Decimal
# ... (keep your other imports: Preparation, Categories, Entities, etc.) ...

class Products(EntityRelatedModel):
    """
    Model for all products in the system.

    - If `preparation` is set, the product is a drug.
    - Creation is admin-level to prevent duplication.

    FK safety:
    Every read of `self.preparation` / `self.manufacturer` in this
    class goes through `_safe_fk`, which reads the raw `_id` column
    and resolves it with `.filter(...).first()`. This means a
    foreign key that points at a deleted row (possible if the row
    was removed via raw SQL or a migration that bypassed CASCADE)
    will not raise `DoesNotExist` from inside `__str__`,
    `product_name`, `check_is_drug`, or `save`. Those methods are
    called by DRF during serialization and by ORM during writes —
    an unhandled `DoesNotExist` there 500s the whole request.
    """

    IS_VATABLE_OPTIONS = (
        ("true", "true"),
        ("false", "false"),
    )

    preparation = models.ForeignKey(
        Preparation,
        related_name="product_preparation",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=100)
    packaging = models.CharField(max_length=100, default="")
    bar_code = models.CharField(
        max_length=256, default="", null=True, blank=True
    )
    category = models.ForeignKey(
        Categories,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    sub_category = models.ForeignKey(
        SubCategories,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    description = models.TextField(null=True, blank=True)
    is_pom = models.BooleanField(default=True)
    is_vatable = models.CharField(
        max_length=50,
        choices=IS_VATABLE_OPTIONS,
        default="false",
    )
    manufacturer = models.ForeignKey(
        Entities,
        related_name="product_manufacturer",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    origin_country = models.ForeignKey(
        Countries,
        related_name="product_origin_country",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    units_per_pack = models.BigIntegerField(
        null=True, blank=True, default=None
    )

    # --- NEW: Weight & Dimensions for Dynamic Shipping ---
    weight_kg = models.DecimalField(
        max_digits=8, 
        decimal_places=2, 
        default=Decimal('0.50'),
        help_text="Actual physical weight in kilograms (e.g., 0.50 for 500g)."
    )
    length_cm = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Length in centimeters for volumetric weight calculation."
    )
    width_cm = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Width in centimeters for volumetric weight calculation."
    )
    height_cm = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Height in centimeters for volumetric weight calculation."
    )
    # ------------------------------------------------------

    # NOTE: `related_name="images"` on this M2M creates a reverse
    # accessor `ProductImages.images` that returns products — 
    images = models.ManyToManyField(
        ProductImages,
        related_name="images",
        blank=True,
    )

    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    allowed_entities = ArrayField(
        models.CharField(
            max_length=50, choices=EntityType.choices()
        ),
        blank=True,
        default=EntityType.default_entities,
    )

    class Meta:
        verbose_name_plural = "products"
        constraints = [
            models.UniqueConstraint(
                fields=["manufacturer", "title", "units_per_pack"],
                name="Unique names for products by a manufacturer",
            ),
        ]

    # ---------------------------------------------------------
    # FK helpers
    # ---------------------------------------------------------

    @staticmethod
    def _safe_fk(model, pk):
        if not pk:
            return None
        try:
            return model.objects.filter(pk=pk).first()
        except Exception:
            return None

    def _safe_preparation(self):
        return self._safe_fk(
            Preparation, self.preparation_id
        )

    def _safe_manufacturer(self):
        return self._safe_fk(
            Entities, self.manufacturer_id
        )

    # ---------------------------------------------------------
    # Display helpers
    # ---------------------------------------------------------

    def __str__(self):
        prep = self._safe_preparation()
        if prep is None:
            return self.title or ""
        return f"{prep.title} - {self.title}"

    def product_name(self):
        prep = self._safe_preparation()
        if prep is None:
            return self.title or ""
        return f"{prep.title} - {self.title}"

    @property
    def check_is_drug(self):
        return self.preparation_id is not None

    # ---------------------------------------------------------
    # Save override
    # ---------------------------------------------------------

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()

        manufacturer = self._safe_manufacturer()
        if manufacturer is not None and manufacturer.country_id:
            self.origin_country_id = manufacturer.country_id

        super().save(*args, **kwargs)

    objects = ProductsManager()