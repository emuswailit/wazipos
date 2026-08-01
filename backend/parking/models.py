from django.db import models
from core.models import EntityRelatedModel
from authentication.models import Towns, Users
from django.utils.translation import gettext_lazy as _




class TrueFalseOptions(models.TextChoices):
    TRUE = "true", _("true")
    FALSE = "false", _("false")

class CheckMethodOptions(models.TextChoices):
    CAMERA = "CAMERA", _("CAMERA")
    TOKEN = "TOKEN", _("TOKEN")

# Create your models here.
class ParkingStation(EntityRelatedModel):
    town = models.ForeignKey(
        Towns,
        related_name="parking_station_town",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, default="")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="parking_station_added_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural="Parking Stations"

    def __str__(self) -> str:
        return f"{self.title}-{self.town.title}"
    

class ParkingAttendant(EntityRelatedModel):
    employee = models.ForeignKey(
        "employees.Employees",
        related_name="parking_atendant_employee",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    parking_station = models.ForeignKey(
        ParkingStation,
        related_name="parking_attendant_station",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="parking_attendant_added_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural="Parking Attendants"
        
    def __str__(self) -> str:
        return f"{self.parking_station.title}-{self.plate_number}"
    

class ParkingSlot(EntityRelatedModel):
    parking_station = models.ForeignKey(
        ParkingStation,
        related_name="parking_slot_station",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, default="")
    is_occupied = models.CharField(
        verbose_name=_("Is Occupied"),
        choices=TrueFalseOptions.choices,
        default=TrueFalseOptions.FALSE,
        max_length=20,
    )
    check_in_method = models.CharField(
        verbose_name=_("Check In Method"),
        choices=TrueFalseOptions.choices,
        default=TrueFalseOptions.FALSE,
        max_length=20,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="parking_slot_added_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural="Parking Slots"
        
    def __str__(self) -> str:
        return f"{self.parking_station.title}-{self.title}"
    


class ParkingEvent(EntityRelatedModel):
    parking_station = models.ForeignKey(
        ParkingStation,
        related_name="parking_event_station",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    parking_slot = models.ForeignKey(
        ParkingSlot,
        related_name="parking_event_slot",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    plate_number = models.CharField(max_length=256, default="")
    check_in_lane = models.CharField(max_length=256, default="")
    check_in_time = models.DateTimeField(auto_now_add=True)
    check_out_time = models.DateTimeField(auto_now_add=True)
    check_in_method = models.CharField(
        verbose_name=_("Checkin Method"),
        choices=CheckMethodOptions.choices,
        default=TrueFalseOptions.FALSE,
        max_length=20,
    )
    check_out_method = models.CharField(
        verbose_name=_("Checkout Method"),
        choices=CheckMethodOptions.choices,
        max_length=20,
    )
    is_active = models.CharField(
        verbose_name=_("Is Occupied"),
        choices=TrueFalseOptions.choices,
        default=TrueFalseOptions.FALSE,
        max_length=20,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="parking_event_added_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural="Parking Events"
        
    def __str__(self) -> str:
        return f"{self.parking_station.title}-{self.plate_number}"

class PaymentStatusOptions(models.TextChoices):
    INITIATED = "INITIATED", _("INITIATED")
    SUCCESS = "SUCCESS", _("SUCCESS")
    FAILED = "FAILED", _("FAILED")
    PENDING = "PENDING", _("PENDING")  

class ParkingPayment(EntityRelatedModel):
    parking_event = models.ForeignKey(
        ParkingEvent,
        related_name="parking_event_payment",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    verified_by = models.ForeignKey(
        ParkingAttendant,
        related_name="parking_payment_verifier",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        verbose_name=_("Is Occupied"),
        choices=TrueFalseOptions.choices,
        default=TrueFalseOptions.FALSE,
        max_length=20,
    )
    reference_number = models.CharField(max_length=50, default="")
    psp_reference_number = models.CharField(max_length=50, default="")
    currency = models.CharField(max_length=50, default="")
    provider_reference_num = models.CharField(max_length=50, default="",null=True,blank=True)
    desc = models.CharField(max_length=256, default="",null=True,blank=True)
    telco_name = models.CharField(max_length=28, default="",null=True,blank=True)
    narration = models.CharField(max_length=50, default="",null=True,blank=True)
    status = models.CharField(
        verbose_name=_("Payment Status"),
        choices=PaymentStatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    transaction_charge = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00
    )
    is_settled = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="parking_payment_added_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural="Parking Slots"
        
    def __str__(self) -> str:
        return f"{self.parking_station.title}-{self.plate_number}"