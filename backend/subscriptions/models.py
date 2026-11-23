from django.db import models
from authentication.models import Users
from core.models import EntityRelatedModel
from payments.models import PaymentServicesProvider

TRUE_FALSE_OPTIONS = (
    ("TRUE", "TRUE"),
    ("FALSE", "FALSE"),
)
SUSCRIPTION_TYPE_OPTIONS = (
    ("TRIAL", "TRIAL"),
    ("PAID", "PAID"),
)


class SubscriptionPayment(EntityRelatedModel):

    """Entity subscription payment"""
    
    # 🌟 Add Status Choices
    STATUS_CHOICES = (
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("FAILED", "FAILED"),
        ("CANCELLED", "CANCELLED"),
    )

    description = models.CharField(max_length=120, null=True, blank=True)
    reference_number = models.CharField(max_length=120, null=True, blank=True)
    psp_reference_number = models.CharField(max_length=120, null=True, blank=True)
    operator_reference_number = models.CharField(max_length=120, null=True, blank=True)
    provider_reference_number = models.CharField(max_length=120, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    months = models.PositiveIntegerField(
        default=1,
        help_text="Number of months this payment renews the subscription for.",
    )

    # 🌟 Add the new status field
    status = models.CharField(
        max_length=50, 
        choices=STATUS_CHOICES, 
        default="PENDING",
        help_text="Current state of the payment transaction."
    )
    
    # What the payment is for: the monthly subscription, or a stock take booked by
    # an agent (stocktakes.StockTakes) — same mobile money checkout and commission.
    PURPOSES = (("SUBSCRIPTION", "Subscription"), ("STOCK_TAKE", "Stock take"), ("TOKENS", "WaziPOS tokens"))
    purpose = models.CharField(max_length=20, choices=PURPOSES, default="SUBSCRIPTION", db_index=True)
    # Token top-ups (billing): tokens credited when this payment succeeds (pack + bonus).
    tokens = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    stock_take = models.ForeignKey(
        "stocktakes.StockTakes", related_name="payments", on_delete=models.SET_NULL, null=True, blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="subscription_payer", on_delete=models.CASCADE
    )

    def __str__(self):
        return f"{self.entity.title} - {self.status}"


class Subscription(EntityRelatedModel):

    """Entity subscription"""
    payment = models.ForeignKey(
        SubscriptionPayment, related_name="subscription_payment", on_delete=models.CASCADE, null=True, blank=True
    )
    months = models.IntegerField()
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    type = models.CharField(
        max_length=50, choices=SUSCRIPTION_TYPE_OPTIONS,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="subscription_owner", on_delete=models.CASCADE
    )

    def __str__(self):
        return self.entity.title