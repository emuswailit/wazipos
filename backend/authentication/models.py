import random
from utils.logging import create_log
import re
from rest_framework.response import Response
from utils.mailing import send_email
from django.db.models import Q
from django.db import models
from datetime import date, timedelta, timezone,datetime
from django.db.models.fields.related import ManyToManyField
from core.phone_number_utils import get_telco_by_phone_number
import datetime
import uuid
import pyotp
import jwt
from django.utils.text import slugify
from rest_framework import exceptions,status
from rest_framework_simplejwt.tokens import RefreshToken
from authentication.validators.authentication_models_validators import validate_entity
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.utils.translation import gettext_lazy as _
from core.models import EntityRelatedModel
from decouple import config
from django.db.models.signals import post_save
from django.dispatch import receiver
from stdimage import StdImageField
from django_better_choices import Choices
from django_advance_thumbnail import AdvanceThumbnailField
from django.core.files import File
from io import BytesIO
from PIL import Image
from core.utils import generate_password
def compress_image(image):
    im = Image.open(image)
    if im.mode != 'RGB':
        im = im.convert('RGB')
    im_io = BytesIO()
    im.save(im_io, 'jpeg', quality=70,optimize=True)
    new_image = File(im_io, name=image.name)
    return new_image

DOCUMENT_TYPE_CHOICES = (
        ("NationalId", "NationalId"),
        ("Passport", "Passport"),
    )

ENTITY_TYPE = (
        ("Bar", "Bar"),
        ("Bank", "Bank"),
        ("Clinic", "Clinic"),
        ("Default", "Default"),
        ("Dispensary", "Dispensary"),
        ("GeneralDistributor", "GeneralDistributor"),
        ("PharmaceuticalDistributor", "PharmaceuticalDistributor"),
        ("Farm", "Farm"),
        ("Grocery", "Grocery"),
        ("Hospital", "Hospital"),
        ("Hotel", "Hotel"),
        ("InternetServiceProvider", "InternetServiceProvider"),
        ("Insurance", "Insurance"),
        ("GeneralManufaturer", "GeneralManufaturer"),
        ("PharmaceuticalManufaturer", "PharmaceuticalManufaturer"),
        ("Park", "Park"),
        ("Parking", "Parking"),
        ("GeneralRetailer", "GeneralRetailer"),
        ("PharmaceuticalRetailer", "PharmaceuticalRetailer"),
        ("Realty", "Realty"),
        ("Restaurant", "Restaurant"),
        ("Sacco", "Sacco"),
        ("TransportCompany", "TransportCompany"),
        ("Telco", "Telco"),
        ("GeneralWholesaler", "GeneralWholesaler"),
        ("PharmaceuticalWholesaler", "PharmaceuticalWholesaler"),
    )
CATEGORY_TYPE = (
        ("ALCOHOL", "ALCOHOL"),
        ("FMCG", "FMCG"),
        ("GROCERIES", "GROCERIES"),
        ("HYGIENE", "HYGIENE"),
        ("NONPHARMACEUTICALS", "NONPHARMACEUTICALS"),
        ("PHARMACEUTICALS", "PHARMACEUTICALS"),
        ("TELECOMMUNICATION", "TELECOMMUNICATION"),
        
    )


class SubscriptionFrequencyOptions(models.TextChoices):
    MONTHLY = "MONTHLY", _("MONTHLY")
    QUARTERLY = "QUARTERLY", _("QUARTERLY")
    BIANNUALY = "BIANNUALY", _("BIANNUALY")
    ANNUALY = "ANNUALY", _("ANNUALY")


class Plans(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=256, unique=True)
    registration_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    duration_in_days = models.IntegerField()
    subscription = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    subscription_frequency = models.CharField(
        verbose_name=_("Subscription Frequency"),
        choices=SubscriptionFrequencyOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=False)
    owner = models.ForeignKey(
        "Users",
        related_name="plan_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Plans"

    def __str__(self) -> str:
        return self.title


TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)


class TrueFalseOptions(models.TextChoices):
    TRUE = "true", _("true")
    FALSE = "false", _("false")


class Categories(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=256, unique=True)
    category_class = models.CharField(max_length=50, choices=CATEGORY_TYPE)
    icon_category = models.CharField(max_length=56,null=True, blank=True)
    icon = models.CharField(max_length=56,null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        if self.icon_category:
            self.icon_category = self.icon_category.upper()
        if self.icon:
            self.icon = self.icon.lower()
        super(Categories, self).save(*args, **kwargs)


class Stakes(EntityRelatedModel):
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    owner = models.ForeignKey(
        "authentication.Users", related_name="stake_creator", on_delete=models.CASCADE
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class SubCategories(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        Categories,
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=256)
    description = models.TextField(max_length=300, null=True, blank=True)
    description2 = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title


class DocumentTypesOptions(models.TextChoices):

    LETTER = "LETTER", _("LETTER")
    INVOICE = "INVOICE", _("INVOICE")
    CERTIFICATE = "CERTIFICATE", _("CERTIFICATE")
    CONTRACT = "CONTRACT", _("CONTRACT")
  

class EntityDocuments(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Documents"
    owner = models.ForeignKey(
        "Users",
        related_name="entity_document_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    entity = models.ForeignKey("Entities",related_name="document_entity", on_delete=models.CASCADE)
    entity_branch = models.ForeignKey("EntityBranches",related_name="document_entity_branch", on_delete=models.CASCADE,null=True,blank=True)
    document = models.FileField(upload_to="entity_documents_uploads")
    thumbnail = AdvanceThumbnailField(
        source_field="document",
        upload_to="thumbnails/documents/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    document_type = models.CharField(
        verbose_name=_("Document Type"),
        choices=DocumentTypesOptions.choices,
        max_length=50,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)   
    reference = models.CharField(max_length=256, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    verified_by = models.ForeignKey(
        "Users",
        related_name="entity_document_verifier",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
 
    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
            self.reference = self.reference.upper()
        super(EntityDocuments, self).save(*args, **kwargs)

class LicenceTypesOptions(models.TextChoices):
    NONE = "", _("")
    BUSINESS_NAME_CERTIFICATE = "BUSINESS NAME CERTIFICATE", _(
        "BUSINESS NAME CERTIFICATE"
    )
    CERTIFICATE_OF_INCORPORATION = "CERTIFICATE OF INCORPORATION", _(
        "CERTIFICATE OF INCORPORATION"
    )
    COUNCIL_BUSINESS_PERMIT = "COUNCIL BUSINESS PERMIT", _("COUNCIL BUSINESS PERMIT")


class EntityLicences(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Licences"
    owner = models.ForeignKey(
        "Users",
        related_name="entity_licences_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    entity = models.ForeignKey("Entities", on_delete=models.CASCADE)
    licence = models.FileField(upload_to="entity_licences_uploads")
    thumbnail = AdvanceThumbnailField(
        source_field="licence",
        upload_to="thumbnails/licences/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    licence_type = models.CharField(
        verbose_name=_("Licence Type"),
        choices=LicenceTypesOptions.choices,
        default=LicenceTypesOptions.NONE,
        max_length=50,
        null=True,
        blank=True,
    )
    licence_number = models.CharField(max_length=256, null=True, blank=True)
    valid_from = models.DateField(null=True, blank=True)
    valid_to = models.DateField(null=True, blank=True)
    is_verified = models.CharField(
        verbose_name=_("Is Verified"),
        choices=TrueFalseOptions.choices,
        default=TrueFalseOptions.FALSE,
        max_length=20,
    )
    is_valid = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    verified_by = models.ForeignKey(
        "Users",
        related_name="entity_licence_verifier",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.licence:
            licence = self.licence
            if (
                licence.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress licence function
                self.licence = compress_image(licence)
        super(EntityLicences, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.owner.first_name}'s licences"


class UserDocuments(models.Model):
    class Meta:
        verbose_name_plural = "User Documents"
    IS_VERIFIED_OPTIONS = (
        ("true", "true"),
        ("false", "false"),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    DOCUMENT_TYPE = (
        ("NationalId", "NationalId"),
        ("Passport", "Passport"),
    )
    owner = models.ForeignKey(
        "Users",
        related_name="user_documents_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    document = models.FileField(upload_to="id_front_page")
    thumbnail = AdvanceThumbnailField(
        source_field="document",
        upload_to="thumbnails/documents/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    document_type = models.CharField(
        max_length=50,
        choices=DOCUMENT_TYPE,
        default="NationalId",
        null=True,
        blank=True,
    )
    document_number = models.CharField(max_length=256, null=True, blank=True)
    is_verified = models.CharField(
        max_length=50, choices=IS_VERIFIED_OPTIONS, default="false"
    )
    is_valid = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    verified_by = models.ForeignKey(
        "Users",
        related_name="user_document_verifier",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.document:
            image = self.document
            if (
                image.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress image function
                self.document = compress_image(image)
        super(UserDocuments, self).save(*args, **kwargs)


class EntityImages(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Images"
    owner = models.ForeignKey(
        "Users",
        related_name="entity_image_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    entity = models.ForeignKey(
        "Entities", on_delete=models.CASCADE, null=True, blank=True
    )
    image = models.FileField(upload_to="entity_image_uploads")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.image:
            image = self.image
            if (
                image.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress image function
                self.image = compress_image(image)
        super(EntityImages, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.owner.first_name}'s photos"
    


class EntityLogos(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Logos"
    owner = models.ForeignKey(
        "Users",
        related_name="entity_logo_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    entity = models.ForeignKey(
        "Entities", on_delete=models.CASCADE, null=True, blank=True
    )
    logo = models.FileField(upload_to="entity_logo_uploads")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.logo:
            image = self.logo
            if (
                image.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress image function
                self.logo = compress_image(image)
        super(EntityLogos, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.title}'s logo"
    

class Countries(models.Model):
    class Meta:
        verbose_name_plural = "Countries"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    country_code = models.CharField(max_length=100, null=True, blank=True)
    iso_code_two = models.CharField(max_length=100, null=True, blank=True)
    iso_code_three = models.CharField(max_length=100, null=True, blank=True)
    title = models.CharField(max_length=256, null=True, blank=True)
    currency_name = models.CharField(max_length=256, null=True, blank=True)
    currency_symbol = models.CharField(max_length=256, null=True, blank=True)
    flag_png = models.CharField(max_length=256, null=True, blank=True)
    flag_svg = models.CharField(max_length=256, null=True, blank=True)
    flag_alt = models.TextField(null=True, blank=True)
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title


class Counties(models.Model):
    class Meta:
        verbose_name_plural = "Counties"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    county_code = models.CharField(max_length=10, null=True, blank=True)
    country = models.ForeignKey(
        Countries, on_delete=models.CASCADE, null=True, blank=True
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class SubCounties(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sub_county_code = models.CharField(max_length=10, null=True, blank=True)
    county = models.ForeignKey(
        Counties, on_delete=models.CASCADE, null=True, blank=True
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Locations(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sub_county_code = models.CharField(max_length=10, null=True, blank=True)
    county = models.ForeignKey(
        Counties, on_delete=models.CASCADE, null=True, blank=True
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class SubLocations(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    location = models.ForeignKey(
        Locations, on_delete=models.CASCADE, null=True, blank=True
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Villages(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    sub_location = models.ForeignKey(
        SubLocations, on_delete=models.CASCADE, null=True, blank=True
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Constituencies(models.Model):
    class Meta:
        verbose_name_plural = "Constituencies"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    constituency_code = models.CharField(max_length=10, null=True, blank=True)
    county = models.ForeignKey(
        Counties, on_delete=models.CASCADE, null=True, blank=True
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    

class PostalAddresses(models.Model):
    class Meta:
        verbose_name_plural = "Postal Addresses"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    postal_code = models.CharField(max_length=128, null=True, blank=True)
    post_office = models.CharField(max_length=127, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class Towns(EntityRelatedModel):
    county = models.ForeignKey(
        Counties,
        related_name="city_county",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    abbreviation = models.CharField(max_length=256, null=True, blank=True)
    is_city = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title}"
    class Meta:
            verbose_name_plural = "Towns"
            constraints = [
                models.UniqueConstraint(
                    fields=["county", "title"],
                    name="Unique names for towns in a county",
                ),]
            
class Agents(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Agents"

    user = models.ForeignKey(
        "authentication.Users",
        related_name="agent_user",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    is_approved = models.BooleanField(default=True)
    approver = models.ForeignKey(
        "authentication.Users",
        related_name="agent_approver",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        "authentication.Users",
        related_name="agent_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approved_on = models.DateTimeField(auto_now_add=True)
    entities = models.ManyToManyField("authentication.Entities", related_name="agent_entities", blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return str(self.user.email)
            
class Organizations(models.Model):
    ORGANIZATION_TYPE = (
        ("COUNTY", "COUNTY"),
        ("GROUP", "GROUP"),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(
        max_length=256,
    )
    description = models.CharField(
        max_length=256, null=True, blank=True
    )
    organization_type = models.CharField(max_length=50, choices=ORGANIZATION_TYPE)
    email = models.EmailField(max_length=256, null=True, blank=True)
    country = models.ForeignKey(
        Countries,
        related_name="organization_country",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        "Users",
        related_name="organization_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    contact1 = models.ForeignKey(
        "Users",
        related_name="organization_contact_1",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    contact2 = models.ForeignKey(
        "Users",
        related_name="organization_contact_2",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    contact3 = models.ForeignKey(
        "Users",
        related_name="organization_contact_3",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
            
        super(Organizations, self).save(*args, **kwargs)
    class Meta:
        verbose_name_plural="Organizations"


            
class Entities(models.Model):

    ENTITY_OWNERSHIP = (
        ("PRIVATE", "PRIVATE"),
        ("PUBLIC", "PUBLIC"),
        ("COMMUNITY-BASED ORGANIZATION", "COMMUNITY-BASED ORGANIZATION"),
        ("FAITH-BASED ORGANIZATION", "FAITH-BASED ORGANIZATION"),
    )
    ENTITY_LEVELS = (
        (0,"ZERO"),
        (1,"ONE"),
        (2,"TWO"),
        (3,"THREE"),
        (4,"FOUR"),
        (5,"FIVE"),
        (6,"SIX"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    categories = models.ManyToManyField(Categories, related_name="entities", blank=True)
    title = models.CharField(
        max_length=256,
    )
    registration = models.CharField(max_length=256, null=True, blank=True)
    phone = models.CharField(max_length=256, null=True, blank=True)
    phone1 = models.CharField(max_length=256, null=True, blank=True)
    phone2 = models.CharField(max_length=256, null=True, blank=True)
    phone3 = models.CharField(max_length=256, null=True, blank=True)
    email = models.EmailField(max_length=256, null=True, blank=True)
    postal_town = models.CharField(max_length=256, null=True, blank=True)
    postal_code = models.CharField(max_length=256, null=True, blank=True)
    entity_ownership = models.CharField(
        max_length=50,
        choices=ENTITY_OWNERSHIP,
    )
    entity_level = models.IntegerField(
        choices=ENTITY_LEVELS, default=0
    )
    entity_type = models.CharField(max_length=50, choices=ENTITY_TYPE)
    entity_code = models.CharField(max_length=7, null=True, blank=True)
    bank_code = models.CharField(max_length=7, null=True, blank=True)
    town = models.CharField(max_length=256, null=True, blank=True)
    road = models.CharField(max_length=256, null=True, blank=True)
    building = models.CharField(max_length=256, null=True, blank=True)
    postal_address = models.CharField(max_length=256, null=True, blank=True)
    country = models.ForeignKey(
        Countries, null=True, blank=True, on_delete=models.DO_NOTHING
    )
    organization = models.ForeignKey(
        Organizations,
        related_name="entity_organization",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
    )
    county = models.ForeignKey(
        Counties,
        related_name="entity_county",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
    )
    constituency = models.ForeignKey(
        Constituencies,
        related_name="entity_constituency",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
    )
    description = models.TextField(max_length=300, null=True, blank=True)
    paid_until = models.DateTimeField(null=True, blank=True)
    is_subscribed = models.BooleanField(default=False)
    is_verified = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    registration_fee_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    offer_trial = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    offer_tial = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",null=True,blank=True
    )
    trial_done = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    registration_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    commission_percentage = models.DecimalField(max_digits=10, decimal_places=2, default=3.00)
    is_active = models.BooleanField(default=True)
    trial_from = models.DateField(blank=True,null=True)
    trial_to = models.DateField(blank=True,null=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    images = models.ManyToManyField(EntityImages, related_name="images", blank=True)
    logos = models.ManyToManyField(EntityLogos, related_name="logos", blank=True)
    licences = models.ManyToManyField(
        EntityLicences, related_name="licences", blank=True,
    )
    documents = models.ManyToManyField(
        EntityDocuments, related_name="documents", blank=True,
    )
    followers = models.ManyToManyField("Users", related_name="followers", blank=True)
    plan = models.ForeignKey(
        Plans,
        related_name="entity_plan",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    administrator = models.ForeignKey(
        "Users",
        related_name="entity_administrator",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )
    agent = models.ForeignKey(
        Agents,
        related_name="entity_agent",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        "Users",
        related_name="entity_owner",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )

    def generate_entity_code(self):
        if self.entity_code:
            return                
        title = ""
        title = self.title
        title = title.replace(" ", "")
        title = re.sub('[^A-Za-z0-9]+', '', title)
        title = re.sub("\(.*?\)", "", title)
        title = re.sub("\[.*?\]", "", title)
        title = re.sub(r"[-()\"#/@;:<>{}`+=~|.!?,]", "", title)
        sames =[]
        count = 0
        formatted_count = ""
        code = ""

        first_letter = title[0]
        random_others = ''.join(random.choice(title[1:]) for _ in range(2))  
        code = first_letter+random_others
        code = code.replace(" ","")
        sames = Entities.objects.filter(entity_code=code).count()
        # if self.entity_code == code:
        #     sames.append(self)

        if sames >0:
            count = sames + 1
        else:
            count =sames

        formatted_count = str(count).zfill(2) 
        code = code+formatted_count
        print (code)
        self.entity_code = code
        return code

    class Meta:
        verbose_name_plural = "Entities"
        constraints = [
            models.UniqueConstraint(
                fields=["title","owner","country"],
                name="Unique names for entities for owner",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        if not self.entity_code or self.entity_code=="":
            self.entity_code = self.generate_entity_code()
        # if not self.owner.is_staff:
        #     if Clusters.objects.filter(value="SuperAdmin").exists():
        #         cluster= Clusters.objects.filter(value="SuperAdmin").first()
        #         create_log("info", f"Cluster: {cluster}")
        #         create_log("info", f"Entity: {cluster}")
        #         role_value= f"{self.entity_type}+cluster.value"
        #         role_title= re.sub(r'([A-Z])', r' \1', self.entity_type).strip()+ cluster.title
        #         admin_role= Roles.objects.create(value=role_value,cluster=cluster,title=role_title, entity=self, owner=self.owner)   
        #         self.owner.roles.add(admin_role)
        #     else:
        #         return

        super(Entities, self).save(*args, **kwargs)

    def __str__(self):
        return str(self.title)

    def set_paid_until(self, days):
        if self.paid_until and self.paid_until > date.today():
            # Current subscription has not elapsed
            self.paid_until = self.paid_until + timedelta(days=days)
        else:
            # Current Fsubscription has elapsed
            self.paid_until = date.today() + timedelta(days=days)

    def has_paid(self, current_date=datetime.date.today()):
        if self.paid_until is None:
            self.is_subscribed = False
            return False

        return current_date < self.paid_until

    def get_is_subscribed(self):
        return self.is_subscribed
    def get_registration_fee_paid(self):
        self.registration_fee_paid="false"
        if self.entity_type=="RETAIL":
            from payments.models import EntityRegistrationFeePayments
            if EntityRegistrationFeePayments.objects.filter(entity=self).exists():
                self.registration_fee_paid="true"
            else:   
                self.registration_fee_paid="false"
        return self.registration_fee_paid


@receiver(post_save, sender=Entities)
def create_entity_system_user(sender, instance, created, **kwargs):
    if created:
        phone = instance.entity_code
        password = str(instance.id).replace("-", "")
        if Users.objects.filter(phone=instance.entity_code).exists():
            existing = Users.objects.filter(phone=instance.entity_code).count()
            phone = instance.entity_code + str(existing + 1)
        create_log("info", f"Password {password}")
        try:
            user =Users.objects.create(
                email=str(instance.title).lower().replace(" ", "") + "@wazipos.com",
                first_name=instance.title,
                last_name="System User",
                entity_code =instance.entity_code,
                phone=instance.entity_code,
                is_verified=True,
                user_type="Cron",
                country=instance.country,
                is_active=True, 
                entity=instance,
                date_of_birth=instance.created,  # Use created date as a placeholder for DOB
            )
            user.set_password(password)  # Set a default password
            user.save()
            create_log("info", f"System user created for entity {instance.title} with code {password}")
        except Exception as e:
            create_log("error",f"Error creating system user for entity {instance.title}: {e}")  
class EntityBranches(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Branches"
    entity = models.ForeignKey(
        Entities, related_name="entity_branch_entity", on_delete=models.CASCADE
    )
    administrator = models.ForeignKey(
        "authentication.Users",
        related_name="entity_branch_administrator",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    branch_code = models.CharField(max_length=48, null=True, blank=True)
    branch_telephone = models.CharField(max_length=48, null=True, blank=True)
    branch_email = models.CharField(max_length=256, null=True, blank=True)
    county = models.ForeignKey(
        Counties,
       related_name="entity_branch_county",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
    )
    country = models.ForeignKey(
        Countries,
       related_name="entity_branch_country",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
    )
    town = models.CharField(max_length=256, null=True, blank=True)
    road = models.CharField(max_length=256, null=True, blank=True)
    building = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=256, null=True, blank=True)
    is_verified = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    owner = models.ForeignKey(
        "authentication.Users",
        related_name="entity_branch_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(EntityBranches, self).save(*args, **kwargs)
    def __str__(self):

        return f"{self.title} - {self.entity.title}"
    

class Branches(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Branches"
    entity = models.ForeignKey(
        Entities, related_name="branch_entity", on_delete=models.CASCADE
    )
    administrator = models.ForeignKey(
        "authentication.Users",
        related_name="branch_administrator",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    branch_code = models.CharField(max_length=48, null=True, blank=True)
    branch_telephone = models.CharField(max_length=48, null=True, blank=True)
    branch_email = models.CharField(max_length=256, null=True, blank=True)
    county = models.ForeignKey(
        Counties,
       related_name="branch_county",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
    )
    country = models.ForeignKey(
        Countries,
       related_name="branch_country",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
    )
    town = models.CharField(max_length=256, null=True, blank=True)
    road = models.CharField(max_length=256, null=True, blank=True)
    building = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=256, null=True, blank=True)
    is_verified = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    owner = models.ForeignKey(
        "authentication.Users",
        related_name="branch_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(Branches, self).save(*args, **kwargs)
    def __str__(self):

        return f"{self.title} - {self.entity.title}"
    


class AccountType(models.TextChoices):
    PAYBILL = "Paybill", _("Paybill")
    POCHI_LA_BIASHARA = "Pochi La Biashara", _("Pochi La Biashara")
    TILL = "Till", _("Till")


# class EntityCollectionAccounts(models.Model):
#     account_type = models.CharField(
#         verbose_name=_("Account Type"),
#         choices=AccountType.choices,
#         max_length=50,
#     )
#     id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
#     entity = models.ForeignKey(
#         Entities, related_name="collection_account_entity", on_delete=models.CASCADE
#     )
#     account_provider = models.ForeignKey(Entities, on_delete=models.CASCADE)
#     account_number = models.CharField(max_length=50)
#     consumer_code = models.CharField(max_length=100, null=True, blank=True)
#     consumer_key = models.CharField(max_length=100, null=True, blank=True)
#     consumer_secret = models.CharField(max_length=100, null=True, blank=True)
#     account_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
#     owner = models.ForeignKey(
#         "Users",
#         related_name="entity_collection_account_creator",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     is_verified = models.CharField(
#         max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
#     )
#     is_active = models.CharField(
#         max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
#     )
#     verified_by = models.ForeignKey(
#         "Users",
#         related_name="entity_collection_account_verifier",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)

#     class Meta:
#         unique_together = ("entity", "is_active", "account_number")
#         verbose_name_plural = "Entity Collection Accounts"


# class EntitySettlementAccounts(models.Model):
#     ACCOUNT_TYPE = (
#         ("BANK ACCOUNT", "BANK ACCOUNT"),
#         ("PHONE NUMBER", "PHONE NUMBER"),
#         ("WALLET", "WALLET"),
#     )
#     id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
#     entity = models.ForeignKey(
#         Entities, related_name="settlement_account_entity", on_delete=models.CASCADE
#     )
#     account_provider = models.ForeignKey(Entities, on_delete=models.CASCADE)
#     account_provider_branch = models.ForeignKey(
#         EntityBranches, on_delete=models.CASCADE, null=True, blank=True
#     )
#     account_number = models.CharField(max_length=10)
#     account_type = models.CharField(
#         max_length=50,
#         choices=ACCOUNT_TYPE,
#     )
#     owner = models.ForeignKey(
#         "Users",
#         related_name="entity_settlement_account_creator",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     is_verified = models.CharField(
#         max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
#     )
#     is_active = models.CharField(
#         max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
#     )
#     verified_by = models.ForeignKey(
#         "Users",
#         related_name="entity_settlement_account_verifier",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)


class AllergyTypeOptions(models.TextChoices):
    Drug = "Drug", _("Drug")
    Food = "Food", _("Food")
    Environmental = "Environmental", _("Environmental") 


class Allergies(models.Model):
    """Model for allergies"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=112) 
    description = models.TextField()
    created = models.DateField(auto_now_add=True)
    updated = models.DateField(auto_now=True)

    allergy_type = models.CharField(
        verbose_name=_("Allergy Type"),
        choices=AllergyTypeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        "Users",related_name="allergy_added_by", on_delete=models.CASCADE)
    
    def __str__(self):
        return self.title

class EntityReviews(EntityRelatedModel):
    entity = models.ForeignKey(Entities, on_delete=models.CASCADE)
    rating = models.IntegerField(null=True, blank=True, default=0)
    comment = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        "Users", related_name="entity_review_owner", on_delete=models.CASCADE
    )


class Clusters(EntityRelatedModel):
    """
    Model for user clusters
    """

    # ROLE_CATEGORIES = (
    #     ("Accounts", "Accounts"),
    #     ("Admin", "Admin"),
    #     ("Courier", "Courier"),
    #     ("Default", "Default"),
    #     ("Despatch", "Despatch"),
    #     ("Inventory", "Inventory"),
    #     ("Medicine", "Medicine"),
    #     ("Nursing", "Nursing"),
    #     ("Pharmacy", "Pharmacy"),
    #     ("Sales", "Sales"),
    #     ("Support", "Support"),
    #     ("SuperAdmin", "SuperAdmin"),
    # )

    title = models.CharField(max_length=100)
    value = models.CharField(max_length=100)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        "Users",
        related_name="cluster_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    def __str__(self):
        return self.value

    class Meta:
        verbose_name_plural = "Clusters"


class Cadres(models.Model):
    """Profile cadres"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=100, unique=True)
    cluster = models.ForeignKey(Clusters, on_delete=models.CASCADE)
    description = models.TextField(max_length=100, null=True, blank=True)
    owner = models.ForeignKey(
        "Users",
        related_name="cadre_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Cadres, self).save(*args, **kwargs)

    class Meta:
        verbose_name_plural = "Cadres"


class Tokens(models.Model):
    """
    Model for all user roles
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=100, null=True)
    token = models.TextField()

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class Roles(EntityRelatedModel):
    """
    Model for all user roles
    """

    level = models.CharField(max_length=100, null=True)
    title = models.CharField(
        max_length=100,
    )
    value = models.CharField(max_length=100, null=True)
    cluster = models.ForeignKey(Clusters, on_delete=models.CASCADE)
    description = models.TextField(max_length=150, default="")
    owner = models.ForeignKey(
        "Users",
        related_name="role_owner",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.entity.title} - {self.title}"

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Roles, self).save(*args, **kwargs)

    class Meta:
        verbose_name_plural = "Roles"
        constraints = [
            models.UniqueConstraint(
                fields=["entity", "title", "value"],
                name="Unique role for each entity",
            ),
        ]


class UserImages(models.Model):
    class Meta:
        verbose_name_plural = "User Images"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        "Users",
        related_name="images_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    image = models.FileField(upload_to="images")
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/images/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.owner.first_name}'s photos"


# User
class UserManager(BaseUserManager):

    def create_user(self,email, **extra_fields):
        user = None
        password = generate_password()
        if "registration_method" in extra_fields and extra_fields['registration_method']=="Email":
            
            # if not password:
            #     password = "123456"
            # if not username:
            #     username = email
        
            """
            Create and save a user with the given email and password.
            """
            role = None
            if Roles.objects.filter(value="Client").count() > 0:
                role = Roles.objects.filter(value="Client").first()
            else:
                raise exceptions.APIException("Please create system roles")
            default_entity = None
            if Entities.objects.all().count() == 0:
                telco, phone_number = get_telco_by_phone_number("0722217348")
                default_entity = Entities.objects.create(
                    title="WAZIPOS",
                    phone=phone_number,
                    road="Utalii lane",
                    building="View Park Towers, 12th Flr",
                    entity_type="Default",
                    town="Nairobi",
                    country_id="b4d0e91b-1600-4e1d-b147-f3f1c7e2f35f",
                    registration="PVT-AADKZ0",
                )
            else:
                default_entity = Entities.objects.get(
                   title="WAZIPOS"
                )
            # Directly create user under an entity by Admin
            if 'entity' in extra_fields:

                # entity = validate_entity(extra_fields['entity'])
                telco, phone_number = get_telco_by_phone_number(phone)
                email = self.normalize_email(email)
                user = self.model(phone=phone_number, email=email, **extra_fields)
                user.set_password(password)
                user.save(using=self._db)
                user.entity=extra_fields['entity']
                user.phone_otp_verified="false"
                user.is_verified="false"
                user.is_profile_verified=False
                user.roles.add(role)
                user.save()
                # return user

            else:
                if default_entity:
                    # telco, phone_number = get_telco_by_phone_number(phone)
                    email = self.normalize_email(email)
                    user = self.model( email=email, **extra_fields)
                    user.set_password(password)
                    user.entity = default_entity
                    user.save(using=self._db)
                    user.roles.add(role)
                    user.save()
                    # return user
            
                else:
                    
                    raise exceptions.NotAcceptable(
                        {
                            "response_code": 0,
                            "response_message": "Default entity is not created",
                        }
                    )
        else:
            role =None
            if Roles.objects.filter(value="Client").count() > 0:
                role = Roles.objects.filter(value="Client").first()
            else:
                raise exceptions.APIException("Please create system roles")
           
            default_entity = Entities.objects.get(
                   title="WAZIPOS"
                )
            if not email:
                raise ValueError('Email is Required')
            user = self.model(email=self.normalize_email(email), **extra_fields)
            user.set_password(password)
            user.entity = default_entity
            user.country = default_entity.country
            user.is_active = True
            user.save(using=self._db)
            user.roles.add(role)
            
           
        if user:
            send_email({
                        "email_body": "Your  password is "+password,
                        "to_email": user.email,
                        "email_subject": "Wazipos Registration Success Notification",
                    })

            return Response(
            {"response_code":0,"response_message": "Registration was successful. Password sucessfully sent to email"}, status=status.HTTP_200_OK
        )
           
   
        else:
                raise exceptions.NotAcceptable(
                    {
                        "response_code": 0,
                        "response_message": "Default entity is not created",
                    }
                )
        


    def create_superuser(self, email, **extra_fields):
        print("Extra filds", extra_fields)
        
        """
        Create and save a SuperUser with the given phone and password.Email has been ommitted to catef for users who may not have an email and will be managed at facility level
        """
        if "registration_method" in extra_fields and extra_fields['registration_method']=="Email":
            client_role = None
            phone_number = None
            if Roles.objects.filter(value="Client").count() > 0:
                client_role = Roles.objects.filter(value="Client").first()
            else:
                raise exceptions.APIException("Please create system roles")

            admin_role = None
            if Roles.objects.filter(value="Admin").count() > 0:
                admin_role = Roles.objects.filter(value="Admin").first()
            else:
                raise exceptions.APIException("Please create system roles")
            extra_fields.setdefault("is_staff", True)
            extra_fields.setdefault("is_superuser", True)
            extra_fields.setdefault("is_active", True)
            extra_fields.setdefault("is_verified", "true")
            extra_fields.setdefault("accepted_terms", "true")
            telco, phone_number = get_telco_by_phone_number(extra_fields.get("phone"))
            if extra_fields.get("is_staff") is not True:
                raise ValueError(_("Superuser must have is_staff=True."))
            if extra_fields.get("is_superuser") is not True:
                raise ValueError(_("Superuser must have is_superuser=True."))
            user = self.create_user( email, **extra_fields)
            user.country_id = "b4d0e91b-1600-4e1d-b147-f3f1c7e2f35f"
            user.roles.add(admin_role)
            user.roles.remove(client_role)
            user.save()
            return user
        
        else:
            extra_fields.setdefault('is_staff', True)
            extra_fields.setdefault('is_superuser', True)
            extra_fields.setdefault('is_active', True)

            if extra_fields.get('is_staff') is not True:
                raise ValueError('Superuser must have is_staff = True')
            if extra_fields.get('is_superuser') is not True:
                raise ValueError('Superuser must have is_superuser = True')

            return self.create_user(email, **extra_fields)

class UserTypeOptions(models.TextChoices):
    Admin = "Admin", _("Admin")
    Cron = "Cron", _("Cron")
    User = "User", _("User") 


class Users(AbstractBaseUser, PermissionsMixin):
    class Meta:
        verbose_name_plural = "Users"
    REGISTRATION_CHOICES = [
        ('Email', 'Email'),
        ('Google', 'Google')
    ]
    GENDER_CHOICES = (
        ("Female", "Female"),
        ("Male", "Male"),
        ("Other", "Other"),
    )
    MARITAL_STATUS_CHOICES = (
        ("Married", "Married"),
        ("Not-Specified", "Not-Specified"),
        ("Single", "Single"),
    )
    EDUCATION_LEVEL_CHOICES = (
        ("Bachelor", "Bachelor"),
        ("High-School", "High-School"),
        ("Not-Specified", "Not-Specified"),
        ("Masters", "Masters"),
        ("PhD", "PhD"),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    gender = models.CharField(max_length=100, choices=GENDER_CHOICES,null=True,blank=True)
    marital_status = models.CharField(max_length=100, choices=MARITAL_STATUS_CHOICES,default="Not-Specified")
    education_level = models.CharField(max_length=100, choices=EDUCATION_LEVEL_CHOICES,default="Not-Specified")
    entity = models.ForeignKey(
        Entities, related_name="%(class)s", on_delete=models.DO_NOTHING, editable=True,null=True,blank=True
    )
    user_type = models.CharField(
        verbose_name=_("User Type"),
        choices=UserTypeOptions.choices,
        default=UserTypeOptions.User,
        max_length=100,
        null=True,
        blank=True,
    )
    first_name = models.CharField(max_length=120)
    middle_name = models.CharField(max_length=120, null=True, blank=True)
    last_name = models.CharField(max_length=120)
    identifier_type = models.CharField(
        max_length=50, choices=DOCUMENT_TYPE_CHOICES, default="false"
    )
    identifier_number = models.CharField(max_length=50,null=True, blank=True)
    phone_or_email = models.CharField(null=True, blank=True, max_length=255)
    phone = models.CharField(max_length=255, null=True,blank=True)
    email = models.EmailField(max_length=255, unique=True, db_index=True)
    date_of_birth = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    phone_otp_verified = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_staff = models.BooleanField(default=False)
    is_agent = models.BooleanField(default=False)
    roles_string = models.TextField(null=True, blank=True)
    key = models.CharField(max_length=100, blank=True)
    notification_token = models.CharField(max_length=200, null=True, blank=True)
    is_searchable = models.BooleanField(default=False)
    accepted_terms = models.CharField(max_length=50, choices=TRUE_FALSE_OPTIONS)
    is_profile_verified = models.BooleanField(default=False)
    is_profile_updated = models.BooleanField(default=False)
    is_jp_profile_updated = models.BooleanField(default=False)
    is_recruitable = models.BooleanField(default=False)
    is_email_verified = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_verified = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    iprs_verified = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_entity_administrator = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    roles = models.ManyToManyField("Roles", related_name="roles", blank=True)
    allowed_roles = models.ManyToManyField(
        "Roles", related_name="allowed_roles", blank=True
    )
    verified_at = models.DateTimeField(auto_now=True)
    updated_at = models.DateTimeField(auto_now=True)
    favorite_entities = ManyToManyField(
        Entities,
        related_name="favorite_entities",
        blank=True,
    )
    documents = models.ManyToManyField(
        UserDocuments, related_name="documents", blank=True
    )
    owner = models.ForeignKey(
        "Users",
        related_name="user_created_by",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    creating_agent = models.ForeignKey(
        Agents,
        related_name="user_created_by",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    verified_by = models.ForeignKey(
        "Users",
        related_name="user_verified_by",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )

    country = models.ForeignKey(
        Countries, related_name="user_country", on_delete=models.CASCADE,null=True, blank=True
    )
    county = models.ForeignKey(
        Counties,
        related_name="user_county",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    constituency = models.ForeignKey(
        Constituencies,
        related_name="user_constituency",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    # physical_address = models.CharField(max_length=100, null=True, blank=True)
    images = models.ManyToManyField(UserImages, related_name="images", blank=True)
    registration_method = models.CharField(max_length=20, choices=REGISTRATION_CHOICES, default='Email')
    username = None
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = [
        "registration_method",
        # "first_name",
        # "last_name",
    ]

    objects = UserManager()
    # TODO : To retain this code while still considering a subscription business model
    # def is_subscribed(self):
    #     return Subscription.objects.filter(end_date__gte=datetime.date.today, user=self)

    def save(self, *args, **kwargs):
        self.first_name = self.first_name.upper()
        self.last_name = self.last_name.upper()
        super(Users, self).save(*args, **kwargs)

    def __str__(self):
        return str(f"{self.first_name} {self.last_name} - {self.phone} ")

    def tokens(self):
        roles = []
        employee=None
        my_is_staff="true"
        entity_trial_done= "false"
        entity_registration_paid= "false"
        has_uploaded_documents= "false"
        is_bodaboda= "false"
        refresh = RefreshToken.for_user(self)
        decodeJTW = jwt.decode(
            str(refresh.access_token), config("SECRET_KEY"), algorithms=["HS256"]
        )
        from payments.models import EntityRegistrationFeePayments
        from transport.models import SaccoPersonnel
        from employees.models import Employees
        if SaccoPersonnel.objects.filter(user=self,personnel_type="BODABODA", is_active="true").exists():
            is_bodaboda="true"


      
        if EntityRegistrationFeePayments.objects.filter(entity=self.entity).exists():
            entity_registration_paid="true" 

        if UserDocuments.objects.filter(owner=self).exists():
            has_uploaded_documents="true" 

        if not self.entity.trial_from ==None and not self.entity.trial_to ==None:
            today = datetime.date.today()
            yesterday = datetime.date.today() - timedelta(1)
            # if self.entity.trial_to > today:
            #     entity_trial_done="false"
            # else:
            #     entity_trial_done="true"

        ## Admin role
        if self.is_staff:
            admin_role = Roles.objects.filter(value="Admin").first()
            if admin_role:
                role_item = dict(
                    id=str(admin_role.id),
                    cluster=str(admin_role.cluster_id),
                    owner=str(admin_role.owner_id),
                    entity=str(admin_role.entity.id),
                    entity_title=str(admin_role.entity.title),
                    level=admin_role.level,
                    title=admin_role.title,
                    value=admin_role.value,
                )
                roles.append(role_item)

        # Add roles to token

        if not self.is_staff:
            my_is_staff="false"
            if Roles.objects.filter(value="Client").exists():
                default_role = Roles.objects.filter(value="Client").first()
                role_item = dict(
                    id=str(default_role.id),
                    cluster=str(default_role.cluster_id),
                    owner=str(default_role.owner_id),
                    entity=str(default_role.entity.id),
                    entity_title=str(default_role.entity.title),
                    level=default_role.level,
                    title=default_role.title,
                    value=default_role.value,
                )
                roles.append(role_item)
        

        for role in self.roles.all().filter(entity=self.entity):
        # for role in self.roles.all():
            role_item = dict(
                id=str(role.id),
                cluster=str(role.cluster_id),
                owner=str(role.owner_id),
                entity=str(role.entity.id),
                entity_title=str(role.entity.title),
                level=role.level,
                title=role.title,
                value=role.value,
            )
            roles.append(role_item)



        decodeJTW["roles"] = roles
        decodeJTW["first_name"] = f"{self.first_name}"
        decodeJTW["last_name"] = f"{self.last_name}"
        decodeJTW["name"] = f"{self.first_name} {self.last_name}"
        decodeJTW["id"] = f"{self.id}"
        decodeJTW["email"] = f"{self.email}"
        decodeJTW["phone"] = f"{self.phone}"
        decodeJTW["is_staff"] = f"{my_is_staff}"
        decodeJTW["is_bodaboda"] = is_bodaboda
        decodeJTW["is_agent"] = f"false"
        decodeJTW["is_active"] = f"{self.is_active}"
        decodeJTW["iprs_verified"] = f"{self.iprs_verified}"
        decodeJTW["phone_otp_verified"] = f"{self.phone_otp_verified}"
        decodeJTW["is_verified"] = f"{self.is_verified}"
        decodeJTW["notification_token"] = f"{self.notification_token}"
        decodeJTW["documents_uploaded"] = f"{has_uploaded_documents}"
        decodeJTW["entity_registration_fee"] = f"{self.entity.registration_fee}"
        decodeJTW["entity_type"] = f"{self.entity.entity_type}"
        decodeJTW["entity_id"] = f"{self.entity.id}"
        decodeJTW["entity_registration_paid"] = f"{entity_registration_paid}"
        decodeJTW["entity_trial_done"] = f"{entity_trial_done}"
        decodeJTW["entity_title"] = f"{self.entity.title}"
        decodeJTW["marital_status"] = f"{self.marital_status}"
        decodeJTW["education_level"] = f"{self.education_level}"
        if self.country:
            decodeJTW["country_title"] = f"{self.country.title}"
            decodeJTW["country_id"] = f"{self.country.id}"
    
        if Agents.objects.filter(user=self,is_active=True).exists():
            agent = Agents.objects.filter(user=self,is_active=True).first()
            decodeJTW["agent_id"] = f"{agent.id}"
            decodeJTW["is_agent"] = "true"
        else:
            decodeJTW["agent_id"] = ""
            decodeJTW["is_agent"] = "false"

        if Employees.objects.filter(user=self,entity=self.entity).exists():
            employee = Employees.objects.filter(user=self,entity=self.entity).first()
            decodeJTW["employment_id"] = f"{employee.id}"
            decodeJTW["employment_entity"] = f"{employee.entity}"
            decodeJTW["employment_entity_title"] = f"{employee.entity.title}"
            if employee.department:
                decodeJTW["employment_department"] = f"{employee.department.id}"
                decodeJTW["employment_department_title"] = f"{employee.department.title}"
                decodeJTW["employment_department_type"] = f"{employee.department.department_type}"
            else:
                decodeJTW["employment_department"] = None
                decodeJTW["employment_department_title"] = None
                decodeJTW["employment_department_type"] = None

        else:
            decodeJTW["employment_id"] = None
            decodeJTW["employment_entity"] = None
            decodeJTW["employment_entity_title"] = None
            decodeJTW["employment_department"] = None
            decodeJTW["employment_department_title"] = None
            decodeJTW["employment_department_type"] = None
        # encode
        encoded = jwt.encode(decodeJTW, config("SECRET_KEY"), algorithm="HS256")
        return {"refresh": str(refresh), "access": encoded}

    def authenticate(self, otp):
        """This method authenticates the given otp"""

    #     def verify_otp(secret_key, otp_input):
    # totp = pyotp.TOTP(secret_key)
    # return totp.verify(otp_input)
    
        provided_otp = 0
        try:
            provided_otp = int(otp)
        except:
            return False
        # Here we are using Time Based OTP. The interval is 60 seconds.
        # otp must be provided within this interval or it's invalid
        t = pyotp.TOTP(self.key, interval=300, digits=4)
        return t.verify(provided_otp)


class DependantImages(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dependant = models.ForeignKey(
        "Dependants",
        related_name="image_dependant",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        "Users",
        related_name="uploaded_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    image = models.FileField(upload_to="images")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.dependant.first_name}'s photos"
    class Meta:
        verbose_name_plural="Dependant Images"


class Dependants(models.Model):
    """Dependants under a user wallet. This include family members and other persons under the wallet holder's care"""

    MARITAL_STATUS_CHOICES = Choices( 
        DIVORCED="DIVORCED",
        MARRIED="MARRIED",
        SINGLE="SINGLE",
         UNDERAGE="UNDERAGE",
    )
    GENDER_CHOICES = Choices(
        FEMALE="FEMALE",
        MALE="MALE",
        OTHER="OTHER",
    )
    RELIGION_CHOICES = Choices(
        CATHOLIC="CATHOLIC",
        ISLAM="ISLAM",
        OTHER="OTHER",
        PROTESTANT="PROTESTANT",
    )

    # class GenderChoices(Choices):
    #     FEMALE = 'FEMALE', 'FEMALE'
    #     MALE = 'MALE', 'MALE'
    #     OTHER = 'OTHER', 'OTHER'
    RELATIONSHIP_CHOICES = Choices(
        CHILD="CHILD",
        SELF="SELF",
        SIBLING="SIBLING",
        SPOUSE="SPOUSE",
        PARENT="PARENT",
    )

    class RelationshipsChoices(Choices):
        CHILD = ("CHILD",)
        SELF = ("SELF",)
        SIBLING = ("SIBLING",)
        SPOUSE = ("SPOUSE",)
        PARENT = ("PARENT",)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        Users, related_name="dependant_user", on_delete=models.CASCADE
    )
    first_name = models.CharField(max_length=120)
    last_name = models.CharField(
        max_length=120,
    )
    middle_name = models.CharField(max_length=120, null=True, blank=True)
    images = models.ManyToManyField(DependantImages, related_name="dependant_images")
    identifier_type = models.CharField(
        max_length=50, choices=DOCUMENT_TYPE_CHOICES, default="false"
    )
    identifier_number = models.CharField(max_length=50,null=True, blank=True)
    gender = models.CharField(
        max_length=120,
        choices=GENDER_CHOICES,
    )
    relationship = models.CharField(
        max_length=120, choices=RELATIONSHIP_CHOICES, default="SELF"
    )
    marital_status = models.CharField(
        max_length=120, choices=MARITAL_STATUS_CHOICES,null=True,blank=True
    )
    religion = models.CharField(
        max_length=120, choices=RELIGION_CHOICES,null=True,blank=True
    )
    date_of_birth = models.DateField(null=True, blank=True )
    county = models.ForeignKey(
        Counties, on_delete=models.CASCADE, null=True, blank=True
    )
    sub_county = models.ForeignKey(
        SubCounties, on_delete=models.CASCADE, null=True, blank=True
    )
    location = models.ForeignKey(
        Locations, on_delete=models.CASCADE, null=True, blank=True
    )
    sub_location = models.ForeignKey(
        SubLocations, on_delete=models.CASCADE, null=True, blank=True
    )
    village = models.ForeignKey(
        Villages, on_delete=models.CASCADE, null=True, blank=True
    )
    village_name = models.CharField(
        max_length=256,null=True,blank=True
    )
    location_name = models.CharField(
        max_length=256,null=True,blank=True
    )
    sub_location_name = models.CharField(
        max_length=256,null=True,blank=True
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="dependant_created_by", on_delete=models.CASCADE
    )

    class Meta:
        verbose_name_plural="Dependants"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "first_name", "last_name"],
                name="Dependants must be unique for each user",
            )
        ]
    def save(self, *args, **kwargs):
        if self.first_name:
            self.first_name = self.first_name.upper()
        if self.last_name:
            self.last_name = self.last_name.upper()
        if self.gender:
            self.gender = self.gender.upper()
        super(Dependants, self).save(*args, **kwargs)

    def __str__(self):
        if self.first_name==self.user.first_name and  self.last_name==self.user.last_name:
            return f"{self.user.first_name} {self.user.last_name}"
        else:
            return f"{self.first_name} {self.last_name} c/o {self.user.first_name} {self.user.last_name}"

    # @receiver(post_save, sender=Users)
    # def create_dependants_model(sender, instance, created, **kwargs):
    #     if created and instance.user_type == UserTypeOptions.User:
    #         if not instance.is_staff:
    #             Dependants.objects.create(
    #                 owner=instance,
    #                 user=instance,
    #                 first_name=instance.first_name,
    #                 last_name=instance.last_name,
    #                 date_of_birth=instance.date_of_birth,
    #                 gender=instance.gender,
    #                 relationship="SELF",
    #             )
    #         else:
    #             return
    #     else:
    #         return

class DepartmentTypeOptions(models.TextChoices):
    CLINIC = "CLINIC", _("CLINIC")
    LABORATORY = "LABORATORY", _("LABORATORY")
    NUTRITION = "NUTRITION", _("NUTRITION")
    PHYSIOTHERAPY = "PHYSIOTHERAPY", _("PHYSIOTHERAPY")
    PHARMACY = "PHARMACY", _("PHARMACY")
    RADIOLOGY = "RADIOLOGY", _("RADIOLOGY")
    OUTPATIENT = "OUTPATIENT", _("OUTPATIENT")
    OTHER = "OTHER", _("OTHER")
    WARD = "WARD", _("WARD")
class Departments(EntityRelatedModel):

    """Entity departments"""

    title = models.CharField(max_length=100)

    department_type = models.CharField(
            verbose_name=_("Department Type"),
            choices=DepartmentTypeOptions.choices,
            max_length=100,
            default="Other"

        )
    description = models.TextField(max_length=100, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="department_owner", on_delete=models.CASCADE
    )

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Departments, self).save(*args, **kwargs)

    class Meta:
        unique_together = ("entity", "title")


# class EntityFollowers(EntityRelatedModel):

#     """Entity followers"""
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)
#     is_active = models.CharField(
#         max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
#     )
#     follower = models.ForeignKey(
#         Users, related_name="entity_follower", on_delete=models.CASCADE
#     )

#     class Meta:
#         unique_together = ("entity", "follower")

#     def __str__(self):
#         return f"{self.follower.first_name} {self.follower.last_name} follows {self.entity.title} since {self.created}"




class PrimaryCertificates(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    primary_school = models.ForeignKey(
        "PrimarySchools",
        related_name="academic_certificate_primary_school",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        "Users",
        related_name="primary_certificate_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    certificate = models.FileField(upload_to="certificate")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.owner.first_name} {self.owner.last_name}'s primary school certificate"


class PrimarySchools(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    primary_certificates = models.ManyToManyField(
        PrimaryCertificates, related_name="primary_certificates"
    )
    school_title = models.CharField(max_length=255, unique=True)
    start = models.DateField()
    end = models.DateField()
    marks_attained = models.IntegerField(default=0)
    marks_possible = models.IntegerField(default=0)
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="primary_certificate_verified_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="primary_school_attendee", on_delete=models.CASCADE
    )

    def __str__(self) -> str:
        return f"{self.owner.first_name} {self.owner.last_name} -  {self.cadre.title}"


class SecondaryCertificates(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    secondary_school = models.ForeignKey(
        "SecondarySchools",
        related_name="academic_certificate_secondary_school",
        on_delete=models.CASCADE,
    )
    owner = models.ForeignKey(
        "Users", related_name="secondary_certificate_owner", on_delete=models.CASCADE
    )
    certificate = models.FileField(upload_to="certificate")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.owner.first_name} {self.owner.last_name}'s secondary school certificate"


class SecondarySchools(models.Model):
    SECONDARY_GRADES = (
        ("-", "-"),
        ("A", "A"),
        ("A", "A"),
        ("A-", "A-"),
        ("B+", "B+"),
        ("B", "B"),
        ("B-", "B-"),
        ("C+", "C+"),
        ("C", "C"),
        ("C-", "C-"),
        ("D+", "D+"),
        ("D", "D"),
        ("D-", "D-"),
        ("E", "E"),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    secondary_certificates = models.ManyToManyField(
        SecondaryCertificates,
        related_name="secondary_certificates",
    )
    school_title = models.CharField(max_length=255, unique=True)
    start = models.DateField()
    end = models.DateField()
    grade_attained = models.CharField(max_length=50, choices=SECONDARY_GRADES)
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="secondary_education_verified_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="secondary_school_attendee", on_delete=models.CASCADE
    )

    def __str__(self) -> str:
        return f"{self.owner.first_name} {self.owner.last_name} -  {self.cadre.title}"


# Colleges attended


class CollegeTranscripts(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    college = models.ForeignKey(
        "Colleges",
        related_name="college_transcript_college",
        on_delete=models.CASCADE,
    )
    owner = models.ForeignKey(
        "Users",
        related_name="college_transcript_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    transcript = models.FileField(upload_to="transcript")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.owner.first_name} {self.owner.last_name}'s college diploma transcript"


class Colleges(models.Model):
    CERTIFICATE_TYPE = (
        ("CERTIFICATE", "CERTIFICATE"),
        ("DIPLOMA", "DIPLOMA"),
        ("HIGHER DIPLOMA", "HIGHER DIPLOMA"),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    college_transcripts = models.ManyToManyField(
        CollegeTranscripts, related_name="college_transcripts"
    )
    college_title = models.CharField(max_length=255)
    start = models.DateField()
    end = models.DateField()
    certificate_title = models.CharField(max_length=255, null=True, blank=True)
    certificate_type = models.CharField(max_length=255, choices=CERTIFICATE_TYPE)
    grade_attained = models.CharField(max_length=100, blank=True)
    gpa_attained = models.CharField(max_length=100, null=True)
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="college_attendance_verified_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="college_attendee", on_delete=models.CASCADE
    )

    def __str__(self) -> str:
        return f"{self.owner.first_name} {self.owner.last_name} -  {self.cadre.title}"


# Universities attended


class UniversityTranscripts(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    university = models.ForeignKey(
        "Universities",
        related_name="university_transcript_university",
        on_delete=models.CASCADE,
    )
    owner = models.ForeignKey(
        "Users",
        related_name="university_transcript_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    transcript = models.FileField(upload_to="transcript")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.owner.first_name} {self.owner.last_name}'s university degree transcript"


class Universities(models.Model):
    DEGREE_TYPES = (
        ("BACHELORS", "BACHELORS"),
        ("GRADUATE DIPLOMA", "GRADUATE DIPLOMA"),
        ("MASTERS", "MASTERS"),
        ("DOCTORATE", "DOCTORATE"),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    university_transcripts = models.ManyToManyField(
        UniversityTranscripts, related_name="university_transcripts"
    )
    university_title = models.CharField(max_length=255)
    start = models.DateField()
    end = models.DateField()
    grade_attained = models.CharField(max_length=100, null=True, blank=True)
    gpa_attained = models.CharField(max_length=100, null=True, blank=True)
    degree_title = models.CharField(max_length=255, null=True, blank=True)
    degree_type = models.CharField(max_length=100, choices=DEGREE_TYPES)
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="university_attendance_verified_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="university_attendee", on_delete=models.CASCADE
    )

    def __str__(self) -> str:
        return f"{self.owner.first_name} {self.owner.last_name} -  {self.cadre.title}"


# Employment history


class EmploymentTestimonials(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employment = models.ForeignKey(
        "Employments",
        related_name="employment_testimonials_employment",
        on_delete=models.CASCADE,
    )
    owner = models.ForeignKey(
        "Users",
        related_name="employment_testimonials_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    testimonial = models.FileField(upload_to="testimonial")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.owner.first_name} {self.owner.last_name}'s university degree transcript"


class Employments(models.Model):
    EMPLOYMENT_TYPES = (
        ("INTERNSHIP", "INTERNSHIP"),
        ("CONTRACTUAL", "CONTRACTUAL"),
        ("PERMANENT", "PERMANENT"),
        ("LOCUM", "LOCUM"),
        ("CONSULTANCY", "CONSULTANCY"),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employment_testimonials = models.ManyToManyField(
        EmploymentTestimonials,
    )
    employer_title = models.CharField(max_length=255)
    start = models.DateField()
    end = models.DateField(null=True, blank=True)
    position_title = models.CharField(max_length=100, null=True, blank=True)
    comment = models.TextField(max_length=100, null=True, blank=True)
    employment_type = models.CharField(max_length=100, choices=EMPLOYMENT_TYPES)
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="employment_entry_verified_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="employment_owner", on_delete=models.CASCADE
    )

    def __str__(self) -> str:
        return f"{self.employer_title} -  {self.position_title}"


class Referees(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    salutation = models.CharField(
        max_length=100,
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=100)
    email = models.EmailField(max_length=100)
    position = models.CharField(
        max_length=100,
    )
    institution = models.CharField(
        max_length=100,
    )
    box = models.CharField(
        max_length=100,
    )
    code = models.CharField(
        max_length=100,
    )
    town = models.CharField(
        max_length=100,
    )
    # country = CountryField(
    #     verbose_name=_("Country"), default="KE", blank=False, null=False
    # )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(Users, related_name="referee", on_delete=models.CASCADE)

    def __str__(self) -> str:
        return f"{self.first_name} -  {self.last_name}"


class IdentityDocuments(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(
        "Profiles",
        related_name="document_profile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        "Users",
        related_name="document_uploader",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    document = models.FileField(upload_to="profile_documents")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.owner.first_name}'s photos"


class ProfilePhotos(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(
        "Profiles",
        related_name="photo_profile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        "Users",
        related_name="photo_uploader",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    photo = StdImageField(
        upload_to="profile_photos",
        variations={
            "medium": (300, 200),
        },
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.owner.first_name}'s photos"


class Profiles(models.Model):
    GENDER_CHOICES = (("Male", "Male"), ("Female", "Female"), ("Other", "Other"))
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    documents = models.ManyToManyField(
        IdentityDocuments,
        related_name="documents",
    )
    photos = models.ManyToManyField(
        ProfilePhotos,
        related_name="photos",
    )
    biography = models.TextField(null=True, blank=True)
    current_address = models.TextField(null=True, blank=True)
    permanent_address = models.TextField(null=True, blank=True)
    gender = models.CharField(max_length=120, choices=GENDER_CHOICES)
    is_active = models.BooleanField(default=True)
    is_available = models.BooleanField(default=True)
    is_verified = models.BooleanField(default=False)
    is_cadre_updated = models.BooleanField(default=False)
    is_searchable = models.BooleanField(default=False)
    cadre = models.ForeignKey(Cadres, on_delete=models.CASCADE, null=True, blank=True)
    primary_schools = ManyToManyField(
        PrimarySchools, related_name="primary_schools", blank=True
    )
    secondary_schools = ManyToManyField(
        SecondarySchools, related_name="secondary_schools", blank=True
    )
    colleges = ManyToManyField(Colleges, related_name="colleges", blank=True)
    universities = ManyToManyField(
        Universities, related_name="universities", blank=True
    )
    employments = ManyToManyField(Employments, related_name="employments", blank=True)
    verified_by = models.ForeignKey(
        Users,
        related_name="profile_verified_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.OneToOneField(
        Users, related_name="profile_user", on_delete=models.CASCADE
    )

    def __str__(self) -> str:
        return f"{self.owner.first_name} {self.owner.last_name} -  {self.cadre.title}"


def profile_images(instance, filename):
    title = instance.title
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename


def user_licences(instance, filename):
    title = instance.owner.email
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename


def dependant_images(instance, filename):
    title = instance.title
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename

class Document(models.TextChoices):
    FARE = "Fare", _("Fare")
    GENERAL = "General", _("General")
    INVOICE = "Invoice", _("Invoice")
    ORDER = "Order", _("Order")
    PAYMENT = "Payment", _("Payment")
    SETTLEMENT = "Settlement", _("Settlement")
    TICKET = "Ticket", _("Ticket")
  

class DocumentNumbers(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Document Numbers"
    reference_number = models.CharField(max_length=10, null=True, blank=True)
    document_number = models.CharField(max_length=15,null=True,blank=True)

    owner = models.ForeignKey(
        Users, related_name="document_number_owner", on_delete=models.CASCADE
    )
    document = models.CharField(
        verbose_name=_("Document"),
        choices=Document.choices,
        default=Document.GENERAL,
        max_length=20,
    )
    is_used = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    def __str__(self) -> str:
        return self.document_number
    def save(self, *args, **kwargs):
        if self.document_number:
            self.document_number = self.document_number.upper()
        if self.document:
            self.document = self.document.upper()
  
        super(DocumentNumbers, self).save(*args, **kwargs)

    class Meta:
        unique_together = ("reference_number", "owner", "entity")
    

class ReferenceNumbers(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Reference Numbers"
    reference_number = models.CharField(max_length=24)

    owner = models.ForeignKey(
        Users, related_name="reference_number_user", on_delete=models.CASCADE
    )
    is_used = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class YearLetters(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Year Letters"
    year = models.CharField(max_length=4)
    letter = models.CharField(max_length=4)

    owner = models.ForeignKey(
        Users, related_name="year_letter_owner", on_delete=models.CASCADE
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class PasswordResets(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Password Resets"

    user = models.ForeignKey(
        Users, related_name="password_reset_user", on_delete=models.CASCADE
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

