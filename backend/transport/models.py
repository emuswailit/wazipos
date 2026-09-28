from django.db import models
from core.models import EntityRelatedModel
from authentication.models import  Users, Countries, Entities, DocumentNumbers,Roles
from django.utils.translation import gettext_lazy as _
from django.core.files import File                  
from io import BytesIO
from PIL import Image
from django.utils.text import slugify
from authentication.models import  Counties,Towns
from django.contrib.gis.db import models as gis_model
from authentication.models import Agents
from django.db.models.signals import post_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from utils.logging import create_log
import json
from uuid import UUID
from django_advance_thumbnail import AdvanceThumbnailField

class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            # if the obj is uuid, we simply return the value of uuid
            return obj.hex
        return json.JSONEncoder.default(self, obj)
    
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
    
class OperationRoutes(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Sacco Routes"

    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=256, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="operation_route_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    morning_peak_start = models.TimeField(auto_now=False, auto_now_add=False,null=True,blank=True)
    morning_peak_end = models.TimeField(auto_now=False, auto_now_add=False,null=True,blank=True)
    evening_peak_start = models.TimeField(auto_now=False, auto_now_add=False,null=True,blank=True)
    evening_peak_end = models.TimeField(auto_now=False, auto_now_add=False,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(OperationRoutes, self).save(*args, **kwargs)

    def __str__(self):
        return self.title


class Destinations(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Route Destinations"
        unique_together=("entity","route","destination_from","destination_to")

    route = models.ForeignKey(
        OperationRoutes,
        related_name="destination_route",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    fare = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_route_start = models.BooleanField(default=False)
    is_route_end = models.BooleanField(default=False)
    fare_peak = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    destination_from = models.CharField(max_length=256, null=True, blank=True)
    destination_to = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=48, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="destination_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.destination_from + " - " + self.destination_to
        self.title = self.title.upper()
        self.destination_from = self.destination_from.upper()
        self.destination_to = self.destination_to.upper()
        super(Destinations, self).save(*args, **kwargs)

    def __str__(self):
        return self.title

class SaccoPersonnelTypeOptions(models.TextChoices):
    ADMINISTRATOR = "ADMINISTRATOR", _("ADMINISTRATOR")
    BODABODA = "BODABODA", _("BODABODA")
    CONDUCTOR = "CONDUCTOR", _("CONDUCTOR")
    DRIVER = "DRIVER", _("DRIVER")
    INVESTOR = "INVESTOR", _("INVESTOR")
    MEMBER = "MEMBER", _("MEMBER")


class SaccoPersonnelTenureOptions(models.TextChoices):
   
    CONTRACTUAL = "CONTRACTUAL", _("CONTRACTUAL")
    INTERN = "INTERNSHIP", _("INTERNSHIP")
    TEMPORARY = "TEMPORARY", _("TEMPORARY")
    PERMANENT = "PERMANENT", _("PERMANENT")

class SaccoPersonnel(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Sacco Personnel"

    personnel_type = models.CharField(
        verbose_name=_("Personnel Type"),
        choices=SaccoPersonnelTypeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    roles = models.ManyToManyField(
        Roles,
        blank=True,
    )
    tenure = models.CharField(
        verbose_name=_("Tenure"),
        choices=SaccoPersonnelTenureOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        Users,
        related_name="vehicle_collection_account_psp",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        related_name="sacco_personnel_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    agent = models.ForeignKey(
        Agents,
        related_name="sacco_personnel_agent",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    house_allowance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    basic_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    hire_date = models.DateField()
    retire_date = models.DateField()
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user.first_name} {self.user.last_name}"


class SaccoPersonnelAccount(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Sacco Personnel Accounts"

    sacco_personnel = models.OneToOneField(
        SaccoPersonnel,
        related_name="account_sacco_personnel",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    psp = models.ForeignKey(
        "payments.PaymentServicesProvider",
        related_name="sacco_personnel_account_psp",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    account_number = models.CharField(max_length=56, null=True, blank=True)
    account_name = models.CharField(max_length=256, null=True, blank=True)
    currency = models.CharField(max_length=56, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="sacco_personnel_account_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    def save(self, *args, **kwargs):
        if self.account_name:
            self.account_name = self.account_name.upper()
        super(SaccoPersonnelAccount, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.sacco_personnel.user.phone}"
    
class SaccoSettlementAccount(EntityRelatedModel):
    """Sacco settlement account. This can be settlements to wholesaler bank accounts, wallets and paybills"""
 
    psp = models.ForeignKey("payments.PaymentServicesProvider", on_delete=models.CASCADE)
    currency = models.CharField(max_length=56, null=True, blank=True)
    account_number = models.CharField(max_length=56)
    account_name = models.CharField(max_length=256)
    account_phone_number = models.CharField(max_length=56)
    description = models.TextField( null=True,blank=True)
    administrator = models.ForeignKey(SaccoPersonnel, on_delete=models.CASCADE)
    owner = models.ForeignKey(
        Users,
        related_name="sacco_settlement_account_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="sacco_settlement_account_verifier",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together=("entity","account_name")
        verbose_name_plural="Sacco Settlement Accounts"
        
    def __str__(self) -> str:
        return f"{self.account_number} - {self.account_name}"

class ScheduleOptions(models.TextChoices):
    ANNUALY = "ANNUALLY", _("ANNUALLY")
    DAILY = "DAILY", _("DAILY")
    MONTHLY = "MONTHLY", _("MONTHLY")
    ONCE = "ONCE", _("ONCE")
    WEEKLY = "WEEKLY", _("WEEKLY")
    
def subscription_image_upload_to(instance, filename):
    title = instance.id
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


class SubscriptionBanners(EntityRelatedModel):
    """Model for uploading subscription image"""

    subscription = models.ForeignKey(
        "SaccoSubscription", related_name="sacco_subscription_banners", on_delete=models.CASCADE
    )
    banner = models.ImageField(upload_to=subscription_image_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="banner",
        upload_to="thumbnails/transport/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Subscription Banners"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.banner:
            banner = self.banner
            if (
                banner.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress banner function
                self.banner = compress_image(banner)
        super(SubscriptionBanners, self).save(*args, **kwargs)

    def __str__(self):
        return self.subscription.title
        

class SaccoSubscription(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Sacco Subscriptions"

    title = models.CharField(max_length=256,)
    banking_partner= models.ForeignKey("payments.PaymentServicesProvider",related_name="subscription_banking_partner", on_delete=models.CASCADE,null=True, blank=True)
    product_partner= models.ForeignKey(Entities,related_name="subscription_product_partner", on_delete=models.CASCADE,null=True, blank=True)
    sacco_settlement_account = models.ForeignKey(SaccoSettlementAccount, on_delete=models.CASCADE,null=True, blank=True)
    principal_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    interest_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    repayment_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    interest_rate = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    schedule_duration = models.IntegerField(default=1)
    description = models.CharField(max_length=48, null=True, blank=True)
    per_crew = models.CharField(
        max_length=10, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    owner = models.ForeignKey(
        Users,
        related_name="sacco_subscription_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    banners = models.ManyToManyField(SubscriptionBanners, related_name="banners", blank=True)
    schedule = models.CharField(
        verbose_name=_("Schedule"),
        choices=ScheduleOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(SaccoSubscription, self).save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.title}"


class Charges(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Route Charges"
        unique_together =("entity","destination","title")

    destination = models.ForeignKey(
        Destinations,
        related_name="destination_charge",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    description = models.CharField(max_length=48, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="charge_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(Charges, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} - {self.price}"


class VehicleType(models.TextChoices):
    Bodaboda = "Bodaboda", _("Bodaboda")
    Bus = "Bus", _("Bus")
    Matatu = "Matatu", _("Matatu")
    Shuttle = "Shuttle", _("Shuttle")
    Taxi = "Taxi", _("Taxi")
    Tuktuk = "Tuktuk", _("Tuktuk")

class Vehicles(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Vehicles"
        unique_together=("entity", "registration")
    routes = models.ManyToManyField(OperationRoutes,blank=True)
    vehicle_type = models.CharField(
        verbose_name=_("Vehicle Type"),
        choices=VehicleType.choices,
        max_length=50,
    )
    administrator = models.ForeignKey(
        SaccoPersonnel,
        related_name="vehicle_administrator",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )
    driver = models.OneToOneField(
        SaccoPersonnel,
        related_name="vehicle_driver",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )

    standby_driver = models.OneToOneField(
        SaccoPersonnel,
        related_name="vehicle_standby_driver",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )

    conductor = models.ForeignKey(
        SaccoPersonnel,
        related_name="vehicle_conductor",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )
    collector = models.ForeignKey(
        Users,
        related_name="vehicle_fare_collector",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )

    standby_conductor = models.ForeignKey(
        SaccoPersonnel,
        related_name="vehicle_standby_conductor",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )
    agent = models.ForeignKey(
        Agents,
        related_name="vehicle_agent",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )
    sacco_subscriptions = models.ManyToManyField(SaccoSubscription,blank=True)
    payout_accounts = models.ManyToManyField("payments.PayoutAccounts",blank=True)
    seats = models.IntegerField()
    vehicle_make = models.CharField(max_length=10, null=True,blank=True)
    vehicle_model = models.CharField(max_length=10, null=True,blank=True)
    registration = models.CharField(max_length=10, null=True,blank=True)
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=48, null=True, blank=True)
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    owner = models.ForeignKey(
        Users,
        related_name="vehicle_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    crew_members = models.ManyToManyField(SaccoPersonnel,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        if self.registration:
            self.registration = self.registration.upper()
        super(Vehicles, self).save(*args, **kwargs)

    def __str__(self) -> str:
        return self.registration
    
class Trip(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Trips"
        unique_together=("vehicle","departure_date","departure_time","created")
    route = models.ForeignKey(
        OperationRoutes,
        related_name="trip_route",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    vehicle = models.ForeignKey(
        Vehicles,
        related_name="trip_vehicle",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    owner = models.ForeignKey(
        Users,
        related_name="trip_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    departure_date=models.DateField()
    departure_time=models.TimeField()
    expected_arrival_date=models.DateField(null=True,blank =True)
    expected_arrival_time=models.TimeField(null=True,blank=True)
    slot=models.IntegerField(default=0,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.vehicle:
            self.title = self.vehicle.registration.upper()
        super(Trip, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} - {self.departure_date} at {self.departure_time}"

class IdentifierType(models.TextChoices):
    NationalId = "NationalId", _("NationalId")
    Passport = "Passport", _("Passport")



class GenderChoices(models.TextChoices):
    Female = "Female", _("Female")
    Male = "Male", _("Male")

class Origin(models.TextChoices):
    ANDROID = "ANDROID", _("ANDROID")
    DESKTOP = "DESKTOP", _("DESKTOP")
    USSD = "USSD", _("USSD")
    WEB = "WEB", _("WEB")
    
class Tickets(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Tickets"
    seat = models.CharField(max_length=56,null=True,blank=True)
    first_name = models.CharField(max_length=256, null=True, blank=True)
    last_name = models.CharField(max_length=256, null=True, blank=True)
    identifier_number = models.CharField(max_length=56, null=True, blank=True)
    identifier_type = models.CharField(
        verbose_name=_("Identifier Type"),
        choices=IdentifierType.choices,
        max_length=50,
    )
    origin = models.CharField(
        verbose_name=_("Ticket Origin"),
        choices=Origin.choices,
        default=Origin.ANDROID,
        max_length=20,
    )
    fare = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    passenger_phone = models.CharField(max_length=56, null=True, blank=True)
    document_number = models.ForeignKey(
        DocumentNumbers,
        related_name="ticket_document_number",
        on_delete=models.CASCADE, null=True, blank=True
    )
    payment_reference = models.CharField(max_length=56, null=True, blank=True)
    payment_narrative = models.CharField(max_length=256, null=True, blank=True)
    mobile_money_phone = models.CharField(max_length=56, null=True, blank=True)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="ticket_payment_method",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    trip = models.ForeignKey(
        Trip,
        related_name="ticket_trip",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    vehicle = models.ForeignKey(
        Vehicles,
        related_name="ticket_vehicle",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    route = models.ForeignKey(
        OperationRoutes,
        related_name="ticket_route",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    destination = models.ForeignKey(
        Destinations,
        related_name="ticket_destination",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    reference_number = models.CharField(max_length=56,null=True, blank=True)

    description = models.CharField(max_length=48, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="ticket_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    # def __str__(self):
    #     return f"{self.reference_number}"

    # class Meta:
    #     unique_together = (
    #         "reference_number",
    #         "entity",
    #     )

    def save(self, *args, **kwargs):
        if self.payment_method and self.payment_method.title=="CASH":
            print("Pm", self.payment_method.title)
            self.is_paid = "true"
        super(Tickets, self).save(*args, **kwargs)



class TransferPoints(EntityRelatedModel):
    city = models.ForeignKey(
        Towns,
        related_name="transfer_point_city",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    abbreviation = models.CharField(max_length=256, null=True, blank=True)
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    owner = models.ForeignKey(
        Users,
        related_name="transfer_point_created_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title}"
    class Meta:
            verbose_name_plural = "Transfer Points"
            constraints = [
                models.UniqueConstraint(
                    fields=["city", "title"],
                    name="Unique names for transfer points in a city",
                ),
            ]    

class Transfers(EntityRelatedModel):
    town = models.ForeignKey(
        Towns,
        related_name="transfer_town",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    origin_transfer_point = models.ForeignKey(
        TransferPoints,
        related_name="transfer_origin_transfer_point",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    destination_transfer_point = models.ForeignKey(
        TransferPoints,
        related_name="transfer_destination_transfer_point",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    transfer_fare = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    transfer_date=models.DateField()
    reporting_time=models.TimeField()
    departure_time=models.TimeField()
    vehicle = models.ForeignKey(
        Vehicles,
        related_name="transfer_vehicle",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    official_pick_up_point = models.CharField(max_length=256, null=True, blank=True)
    driver = models.ForeignKey(
        SaccoPersonnel,
        related_name="transfer_driver",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    owner = models.ForeignKey(
        Users,
        related_name="transfer_created_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.origin_transfer_point.title}-{self.destination_transfer_point.title}"

class TransferBookings(EntityRelatedModel):
    transfer = models.ForeignKey(
        Transfers,
        related_name="transfer_booking_transfer",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    description = models.CharField(max_length=256, null=True, blank=True)
    first_name = models.CharField(max_length=256, null=True, blank=True)
    last_name = models.CharField(max_length=256, null=True, blank=True)
    identifier_number = models.CharField(max_length=56, null=True, blank=True)
    identifier_type = models.CharField(
        verbose_name=_("Identifier Type"),
        choices=IdentifierType.choices,
        max_length=50,
    )
    passenger_phone = models.CharField(max_length=56, null=True, blank=True)
    reference_number = models.CharField(max_length=56, null=True, blank=True)
    document_number = models.ForeignKey(
        DocumentNumbers,
        related_name="transfer_booking_document_number",
        on_delete=models.CASCADE, null=True, blank=True
    )
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    is_settled = models.BooleanField(default=False)
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    telco = models.CharField(max_length=56, null=True, blank=True)
    provider_reference_number = models.CharField(max_length=56, null=True, blank=True)
    psp_reference_number = models.CharField(max_length=56, null=True, blank=True)
    payment_reference = models.CharField(max_length=56, null=True, blank=True)
    payment_narrative = models.CharField(max_length=256, null=True, blank=True)
    mobile_money_phone = models.CharField(max_length=56, null=True, blank=True)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="transfer_booking_payment_method",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    provider_reference_number = models.CharField(max_length=50, default="",null=True,blank=True)
    preferred_pick_up_point = models.CharField(max_length=256, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="transfer_booking_created_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

class TransferBookingPayments(EntityRelatedModel):
    transfer_booking = models.ManyToManyField(
        TransferBookings,
        blank=True,
    )

    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="transfer_booking_payment_payment_method",
        on_delete=models.CASCADE,
    )

    description = models.CharField(max_length=256, default="",null=True,blank=True)
    reference_number = models.CharField(max_length=50, default="",null=True, blank=True)
    psp_reference_number = models.CharField(max_length=50, null=True, blank=True)
    currency = models.CharField(max_length=50, default="")
    provider_reference_number = models.CharField(max_length=50, default="",null=True,blank=True)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    transaction_charge = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00
    )
    narrative =models.TextField(null=True,blank=True)
    is_settled = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="transfer_booking_payment_owner", on_delete=models.CASCADE
    )
    class Meta:
        verbose_name_plural="Transfer Booking Payments"
    def __str__(self) -> str:
        if self.reference_number:
            return f"{self.amount}"
        else:
            return "N/A"

class TicketItems(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Ticket Items"

    ticket = models.ForeignKey(
        Tickets,
        related_name="ticket_item_ticket",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    charge = models.ForeignKey(
        Charges,
        related_name="ticket_item_charge",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    quantity = models.IntegerField()
    owner = models.ForeignKey(
        Users,
        related_name="ticket_item_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def price(self):
        if self.charge:
            return self.charge.price
        else:
            return 0.00
    
class Passengers(EntityRelatedModel):
    ticket = models.ForeignKey(
        Tickets,
        related_name="passenger_ticket",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    first_name = models.CharField(max_length=256, null=True, blank=True)
    last_name = models.CharField(max_length=256, null=True, blank=True)
    identifier_number = models.CharField(max_length=56, null=True, blank=True)
    identifier_type = models.CharField(
        verbose_name=_("Identifier Type"),
        choices=IdentifierType.choices,
        max_length=50,
    )
    gender = models.CharField(
        verbose_name=_("Gender"),
        choices=GenderChoices.choices,
        max_length=50,
    )
    date_of_birth = models.DateField()
    nationality = models.ForeignKey(
        Countries, on_delete=models.CASCADE, null=True, blank=True
    )
    owner = models.ForeignKey(
        Users,
        related_name="passenger_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        Users,
        related_name="passenger_user",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.gender}"

class LegacyTickets(EntityRelatedModel):
    item_name = models.CharField(max_length=256, null=True, blank=True)
    from_city = models.CharField(max_length=256, null=True, blank=True)
    to_city = models.CharField(max_length=256, null=True, blank=True)
    travel_date = models.DateTimeField(auto_now_add=True)
    selected_vehicle = models.CharField(max_length=56, null=True, blank=True)
    selected_seat = models.CharField(max_length=56, null=True, blank=True)
    seater = models.CharField(max_length=56, null=True, blank=True)
    selected_ticket_type = models.CharField(max_length=56, null=True, blank=True)
    payment_method = models.CharField(max_length=56, null=True, blank=True)
    phone_number = models.CharField(max_length=24, null=True, blank=True)
    id_number = models.CharField(max_length=24, null=True, blank=True)
    passenger_name = models.CharField(max_length=256, null=True, blank=True)
    email_address = models.CharField(max_length=256, null=True, blank=True)
    amount_charged = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    insurance_charge = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    reference_number = models.CharField(max_length=12, unique=True)
    quantity = models.IntegerField()
    served_by = models.CharField(max_length=256, null=True, blank=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (
            "entity",
            "reference_number",
        )
        verbose_name_plural = "Legacy Tickets"

class Journies(EntityRelatedModel):
    origin_town = models.ForeignKey(
        Towns,
        related_name="journey_origin_town",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    destination_town = models.ForeignKey(
        Towns,
        related_name="journey_destination_town",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    drivers = models.ManyToManyField(
        SaccoPersonnel, related_name="journey_drivers"
    )
    conductors = models.ManyToManyField(
        SaccoPersonnel, related_name="journey_conductors"
    )
    journey_fare = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    departure_date=models.DateField()
    reporting_time=models.TimeField()
    departure_time=models.TimeField()
    expected_arrival_date=models.DateField(null=True,blank =True)
    expected_arrival_time=models.TimeField(null=True,blank=True)
    vehicle = models.ForeignKey(
        Vehicles,
        related_name="journey_vehicle",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    official_pick_up_point = models.CharField(max_length=256, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="journey_created_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    # def __str__(self):
    #     if self.origin_town and self.destination_town:
    #         return f"{self.origin_town.title}-{self.destination_town.title}"
    #     else:
    #         return self.entity.title
    class Meta:
        verbose_name_plural = "Intercity Jounies"

class JourneyBookings(EntityRelatedModel):
    journey = models.ForeignKey(
        Journies,
        related_name="journey_booking_transfer",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    is_settled = models.BooleanField(default=False)
    seat = models.CharField(max_length=12)
    first_name = models.CharField(max_length=256, null=True, blank=True)
    last_name = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=256, null=True, blank=True)
    identifier_number = models.CharField(max_length=56, null=True, blank=True)
    identifier_type = models.CharField(
        verbose_name=_("Identifier Type"),
        choices=IdentifierType.choices,
        max_length=50,
    )
    telco = models.CharField(max_length=12, null=True, blank=True)
    passenger_phone = models.CharField(max_length=56, null=True, blank=True)
    document_number = models.ForeignKey(
        DocumentNumbers,
        related_name="journey_booking_document_number",
        on_delete=models.CASCADE, null=True, blank=True
    )
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    provider_reference_number = models.CharField(max_length=56, null=True, blank=True)
    psp_reference_number = models.CharField(max_length=56, null=True, blank=True)
    reference_number = models.CharField(max_length=56, null=True, blank=True)
    payment_reference = models.CharField(max_length=56, null=True, blank=True)
    payment_narrative = models.CharField(max_length=256, null=True, blank=True)
    mobile_money_phone = models.CharField(max_length=56, null=True, blank=True)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="journey_booking_payment_method",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    provider_reference_number = models.CharField(max_length=50, default="",null=True,blank=True)
    preferred_pick_up_point = models.CharField(max_length=256, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="journey_booking_created_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.document_number}-{self.first_name} {self.first_name}"

class JourneyBookingPayments(EntityRelatedModel):
    journey_booking = models.ManyToManyField(
        JourneyBookings,
        blank=True,
    )

    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="journey_booking_payment_payment_method",
        on_delete=models.CASCADE,
    )

    description = models.CharField(max_length=256, default="",null=True,blank=True)
    reference_number = models.CharField(max_length=50, default="",null=True, blank=True)
    psp_reference_number = models.CharField(max_length=50, null=True, blank=True)
    currency = models.CharField(max_length=50, default="")
    provider_reference_number = models.CharField(max_length=50, default="",null=True,blank=True)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    transaction_charge = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00
    )
    narrative =models.TextField(null=True,blank=True)
    is_settled = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="journey_booking_payment_owner", on_delete=models.CASCADE
    )
    class Meta:
        verbose_name_plural="Journey Booking Payments"
    def __str__(self) -> str:
        if self.reference_number:
            return f"{self.amount}"
        else:
            return "N/A"


# Vehicle Payments
        
class Accountype(models.TextChoices):
    NationalId = "Till", _("Till")
    Passport = "Wallet", _("Wallet")

class VehicleCollectionAccount(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Ticket Items"

    vehicle = models.OneToOneField(
        Vehicles,
        related_name="collection_account_vehicle",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    psp = models.ForeignKey(
        "payments.PaymentServicesProvider",
        related_name="vehicle_collection_account_psp",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    account_number = models.CharField(max_length=56, null=True, blank=True)
    account_name = models.CharField(max_length=256, null=True, blank=True)
    currency = models.CharField(max_length=56, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="vehicle_collection_account_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    class Meta:
        verbose_name_plural="Collection Accounts"

    def __str__(self):
        return f"{self.account_number} {self.vehicle.registration}"



class TicketPayment(EntityRelatedModel):
    tickets = models.ManyToManyField(
        Tickets,
        blank=True,
    )

    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="ticket_payment_payment_method",
        on_delete=models.CASCADE,
    )
    trip = models.ForeignKey(
        Trip,
        related_name="ticket_payment_trip",
        on_delete=models.CASCADE,
        null=True, blank=True
    )
    vehicle = models.ForeignKey(
        Vehicles,
        related_name="ticket_payment_vehicle",
        on_delete=models.CASCADE,
        null=True, blank=True
    )
    description = models.CharField(max_length=256, default="",null=True,blank=True)
    reference_number = models.CharField(max_length=50, default="",null=True, blank=True)
    msisdn = models.CharField(max_length=50, default="",null=True, blank=True)
    psp_reference_number = models.CharField(max_length=50, null=True, blank=True)
    telco = models.CharField(max_length=50, null=True, blank=True)
    currency = models.CharField(max_length=50, default="")
    provider_reference_number = models.CharField(max_length=50, default="",null=True,blank=True)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    transaction_charge = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00
    )
    narrative =models.TextField(null=True,blank=True)
    is_settled = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="ticket_payment_creator", on_delete=models.CASCADE
    )
    class Meta:
        verbose_name_plural="Ticket Payments"
    def __str__(self) -> str:
        if self.reference_number:
            return f"{self.amount}"
        else:
            return "N/A"


class TicketPaymentSettlement(EntityRelatedModel):
    # receiving_entity=models.ForeignKey(Entities, related_name="settled_administrator_entity",on_delete=models.CASCADE,null=True,blank=True)
    administrator=models.ForeignKey(SaccoPersonnel, related_name="settled_administrator",on_delete=models.CASCADE,null=True,blank=True)
    sacco_personnel_account=models.ForeignKey(SaccoPersonnelAccount, related_name="settled_administrator_account",on_delete=models.CASCADE,null=True,blank=True)
    vehicle=models.ForeignKey(Vehicles, related_name="settled_vehicle",on_delete=models.CASCADE,null=True,blank=True)
    trip=models.ForeignKey(Trip, related_name="settled_trip",on_delete=models.CASCADE,null=True,blank=True)
    ticket_payment=models.OneToOneField(TicketPayment,on_delete=models.CASCADE)
    reference_number = models.CharField(
        max_length=56,
    )
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        default=StatusOptions.INITIATED,
        max_length=100,
        null=True,
        blank=True,
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

class SaccoSubscriptionPayment(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Sacco Subscription Payments"
    vehicle=models.ForeignKey(Vehicles, related_name="subscription_vehicle",on_delete=models.CASCADE,null=True,blank=True)
    sacco_subscription=models.ForeignKey(SaccoSubscription, related_name="sacco_subscription",on_delete=models.CASCADE,null=True,blank=True)
    # entity_collection_account=models.ForeignKey(EntityPSPCollectionAccount, related_name="sacco_subscription_collection_account",on_delete=models.CASCADE,null=True,blank=True)
    payment_method=models.ForeignKey("payments.PaymentMethods", related_name="sacco_subscription_payment_method",on_delete=models.CASCADE,null=True,blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    # account_from = models.CharField(max_length=256, null=True, blank=True)
    # account_to = models.CharField(max_length=256, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="subscription_payment_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    reference_number = models.CharField(
        max_length=56,
    )
    psp_reference_number = models.CharField(max_length=50, default="")
    currency = models.CharField(max_length=50, default="")
    provider_reference_number = models.CharField(max_length=50, default="",null=True,blank=True)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )

    narrative =models.TextField(null=True,blank=True)
    is_settled = models.BooleanField(default=False)
    validity_days=models.IntegerField(default=0)
    valid_from= models.DateField()
    valid_to= models.DateField()
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)



    def __str__(self) -> str:
        return f"{self.sacco_subscription} - {self.sacco_subscription.title}"
    
class SaccoSubscriptionSettlement(EntityRelatedModel):
    class Meta:
        verbose_name_plural="Sacco Subscriptions Payment Settlements"
    sacco_subscription_payment=models.OneToOneField(SaccoSubscriptionPayment, related_name="settled_sacco_subscription_payment",on_delete=models.CASCADE,null=True,blank=True)
    sacco_settlement_account=models.ForeignKey(SaccoSettlementAccount, related_name="settled_sacco_settlement_account",on_delete=models.CASCADE,null=True,blank=True)
    reference_number = models.CharField(
        max_length=56,
    )
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        default=StatusOptions.INITIATED,
        max_length=100,
        null=True,
        blank=True,
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

class IdentifierType(models.TextChoices):
    NationalId = "NationalId", _("NationalId")
    Passport = "Passport", _("Passport")


class BodabodaTripStatusChoices(models.TextChoices):
    REQUESTED = "REQUESTED", _("REQUESTED")
    ACCEPTED = "ACCEPTED", _("ACCEPTED")
    DECLINED = "DECLINED", _("DECLINED")
    CANCELLED = "CANCELLED", _("CANCELLED")
    COMPLETED = "COMPLETED", _("COMPLETED")

class BodabodaTrips(EntityRelatedModel):
    status = models.CharField(
        verbose_name=_("Bodaboda Trip Status"),
        choices=BodabodaTripStatusChoices.choices,
        max_length=50,
        default=BodabodaTripStatusChoices.REQUESTED
    )
    adults = models.IntegerField(default=1)
    children = models.IntegerField(default=0)
    is_delivery = models.CharField(
            max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
        )
    is_accepted = models.CharField(
            max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
        )
    is_declined = models.CharField(
            max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
        )
    is_cancelled = models.CharField(
            max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
        )
    is_started = models.CharField(
            max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
        )
    is_completed = models.CharField(
            max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
        )
    origin =  models.CharField(
        verbose_name=_("Origin"),
        max_length=100,
        null=True,
        blank=True,
    )

    origin_point = gis_model.PointField(null=True, blank=True, srid=4326)

    destination =  models.CharField(
        verbose_name=_("Destination"),
        max_length=100,
        null=True,
        blank=True,
    )
    destination_point = gis_model.PointField(null=True, blank=True, srid=4326)
    luggage = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    distance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    fare = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    boda = models.ForeignKey(
        SaccoPersonnel,
        related_name="trip_boda",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    owner = models.ForeignKey(
        Users,
        related_name="boda_trip_initiator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    departure = models.DateTimeField(auto_now_add=True)
    arrival = models.DateTimeField(auto_now_add=True)
    created = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated = models.DateTimeField(auto_now=True)

@receiver(post_save, sender=BodabodaTrips)
def send_notification_on_create(sender, instance, created, **kwargs):
    
    create_log("info","Am at notification")
    if created:  # Only send notification when a new object is created
        print("Notification sent for comment creation", f"{instance.status}")

        channel_layer = get_channel_layer()
        group_name = f"user_{instance.boda.user.id}"  # Target specific user's group

        notification_data = {
            "type": "send_notification",  # Custom type for your consumer
            "is_accepted": instance.is_accepted,
            "s_declined": instance.s_declined,
            "is_completed": instance.is_completed,
            "is_cancelled": instance.is_cancelled,
            "is_delivery": instance.is_delivery,
            "adults": instance.adults,
            "children": instance.children,
            "destination": instance.destination,
            "origin": instance.origin,
            "fare": instance.fare,
            "origin": instance.origin,
            "distance": instance.distance,
            "owner": str(instance.owner.id),
            "boda": str(instance.boda.id),
            "boda_user": str(instance.boda.user.id),
            "id": str(instance.id),
   
        }

        async_to_sync(channel_layer.group_send)(group_name, notification_data)




# class EscrowCollectionAccount(EntityRelatedModel):
#     class Meta:
#         verbose_name_plural = "Escrow Collection Accounts"
#     psp = models.ForeignKey(
#         "payments.PaymentServicesProvider",
#         related_name="escrow_collection_account_psp",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     account_number = models.CharField(max_length=56, null=True, blank=True)
#     account_name = models.CharField(max_length=256, null=True, blank=True)
#     currency = models.CharField(max_length=56, null=True, blank=True)
#     owner = models.ForeignKey(
#         Users,
#         related_name="escrow_collection_account_owner",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)
#     class Meta:
#         verbose_name_plural="Collection Accounts"

#     def __str__(self):
#         return f"{self.account_number} {self.account_name}"


# class FareVoucherPayments(EntityRelatedModel):
#     escrow_collection_account = models.ForeignKey(
#         EscrowCollectionAccount,
#         related_name="escrow_collection_account",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
#     fare_vouchers = models.ManyToManyField(
#         FareVouchers,
#         blank=True,
#     )

#     payment_method = models.ForeignKey(
#         "payments.PaymentMethods",
#         related_name="fare_voucher_payment_method",
#         on_delete=models.CASCADE,
#     )
#     description = models.CharField(max_length=256, default="")
#     document_reference = models.CharField(max_length=15, null=True, blank=True)
#     psp_reference_number = models.CharField(max_length=50, default="")
#     currency = models.CharField(max_length=50, default="")
#     provider_reference_number = models.CharField(max_length=50, default="",null=True,blank=True)
#     status = models.CharField(
#         verbose_name=_("Status"),
#         choices=StatusOptions.choices,
#         max_length=100,
#         null=True,
#         blank=True,
#     )
#     amount = models.DecimalField(max_digits=7, decimal_places=2)
#     transaction_charge = models.DecimalField(
#         max_digits=7, decimal_places=2, default=0.00
#     )
#     # description =models.TextField(null=True,blank=True)
#     is_settled = models.BooleanField(default=False)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)
#     owner = models.ForeignKey(
#         Users, related_name="fare_vouchers_payment_creator", on_delete=models.CASCADE
#     )
#     class Meta:
#         verbose_name_plural="Fare Voucher Payments"
#     def __str__(self) -> str:
#         return f"{self.escrow_collection_account.account_name}-{self.amount}"
    

# class EscrowAccountSettlement(EntityRelatedModel):
#     vehicle_collection_account=models.ForeignKey(VehicleCollectionAccount, related_name="fare_vouche_settlement_account",on_delete=models.CASCADE,null=True,blank=True)
#     escrow_collection_account = models.ForeignKey(
#         EscrowCollectionAccount,
#         related_name="escrow_collection_account_settlemet_account",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )
    
#     reference_number = models.CharField(
#         max_length=56,
#     )
#     psp_reference_number = models.CharField(
#         max_length=56,
#     )
#     account_from = models.CharField(
#         max_length=56, 
#     )
#     account_to = models.CharField(
#         max_length=56, 
#     )
#     amount = models.DecimalField(max_digits=7, decimal_places=2)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)