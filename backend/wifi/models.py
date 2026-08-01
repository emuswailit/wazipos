from django.db import models
from authentication.models import Users
import uuid

from core.models import EntityRelatedModel

# Create your models here.

TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)

DURATION_OPTIONS = (
    ("MINUTE", "MINUTE"),
    ("HOUR", "HOUR"),
    ("DAY", "DAY"),
    ("WEEK", "WEEK"),
    ("MONTH", "MONTH"),
)

PAYMENT_STATUS_CHOICES = (
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )

# Create your models here.

class WifiRouters(EntityRelatedModel):
    title = models.CharField(max_length=256)
    router_ip = models.CharField(max_length=256)
    nas_id = models.CharField(max_length=256)
    contact = models.CharField(max_length=256)
    brand = models.CharField(max_length=256)
    model = models.CharField(max_length=256)
    location = models.ForeignKey(
        "entitylocations.WifiLocations",
        related_name="wifi_tariff_location",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        related_name="wifi_router_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(WifiRouters, self).save(*args, **kwargs)
    def __str__(self):
        return f"{self.nas_id} - {self.title}"
    class Meta:
        verbose_name_plural = "Wifi Routers"

        unique_together = (
            "nas_id",
            "entity",
        )


class WifiTarrifs(EntityRelatedModel):
    title = models.CharField(max_length=256)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    length = models.IntegerField(default=1)

    router = models.ForeignKey(
        WifiRouters,
        related_name="wifi_tariff_router",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    owner = models.ForeignKey(
        Users,
        related_name="wifi_tariff_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    duration = models.CharField(
        max_length=50, choices=DURATION_OPTIONS, default="false"
    )
   
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Wifi Tariffs"

    def __str__(self) -> str:
        return self.title
    
    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(WifiTarrifs, self).save(*args, **kwargs)

class WifiSubscriptionPayments(EntityRelatedModel):
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    tariff = models.ForeignKey(
        WifiTarrifs,
        related_name="wifi_subscription_payment_tariff",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_settled = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    account = models.ForeignKey(
        "payments.UserAccounts",
        related_name="wifi_subscription_payment_account",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    description = models.CharField(max_length=256, default="", null=True,blank=True)
    telco = models.CharField(max_length=50, null=True, blank=True)
    currency = models.CharField(max_length=50, default="")
    reference_number = models.CharField(max_length=50, default="")
    payout_reference_number = models.CharField(max_length=50, default="",null=True,blank=True)
    provider_reference_number = models.CharField(max_length=50, null=True)
    psp_reference_number = models.CharField(
        max_length=50
    )
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Wifi Subscription Payments"


class WifiSubscriptions(EntityRelatedModel):
    tariff_selected = models.ForeignKey(
        WifiTarrifs,
        related_name="wifi_subscription_tariff",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    mac_address = models.CharField(max_length=256)
    username = models.CharField(max_length=256)
    password = models.CharField(max_length=256)
    payment = models.ForeignKey(
        WifiSubscriptionPayments,
        related_name="wifi_subscription_tariff",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        related_name="wifi_subscription_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Wifi Subscriptions"

    def __str__(self) -> str:
        return self.mac_address
    
