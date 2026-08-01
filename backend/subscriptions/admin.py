from django.contrib import admin
from . import models

# Register your models here.
@admin.register(models.Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "payment",
        "start_date",
        "end_date",
        "type",
        "is_active",
        "owner",
        "updated",
        "created",
    )
    list_filter = ("type", "is_active", "owner")
    search_fields = ("type",)


@admin.register(models.SubscriptionPayment)
class SubscriptionPaymentAdmin(admin.ModelAdmin):
    list_display = ("id", "amount","psp_reference_number","provider_reference_number","reference_number", "created", "updated")
    list_filter = ("amount", "created", "updated")
    search_fields = ("amount",)