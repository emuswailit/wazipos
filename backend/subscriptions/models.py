from django.db import models
from authentication.models import Users
from core.models  import EntityRelatedModel
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

    reference_number = models.CharField(max_length=120, null=True, blank=True)
    psp_reference_number = models.CharField(max_length=120, null=True, blank=True)
    operator_reference_number = models.CharField(max_length=120, null=True, blank=True)
    provider_reference_number = models.CharField(max_length=120, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="subscription_payer", on_delete=models.CASCADE
    )

    def __str__(self):
        return self.entity.title

class Subscription(EntityRelatedModel):

    """Entity subscription"""
    payment = models.ForeignKey(
        SubscriptionPayment, related_name="subscription_payment", on_delete=models.CASCADE,null=True,blank=True
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
# class Subscription(EntityRelatedModel):

#     """Entity subscription"""
#     plan = models.ForeignKey(
#         Plans, related_name="subscription_plan", on_delete=models.CASCADE,null=True,blank=True
#     )
#     title = models.TextField(max_length=100)
#     payment_service_provider=models.ForeignKey(
#         PaymentServicesProvider, related_name="subscription_payment_provider", on_delete=models.CASCADE,null=True,blank=True
#     )
#     operator_reference_number = models.CharField(max_length=120, null=True, blank=True)
#     provider_reference_number = models.CharField(max_length=120, null=True, blank=True)
#     description = models.TextField(max_length=100, null=True, blank=True)
#     amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
#     expires = models.DateTimeField()
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)
#     owner = models.ForeignKey(
#         Users, related_name="subscription_owner", on_delete=models.CASCADE
#     )

#     def __str__(self):
#         return self.entity.title


