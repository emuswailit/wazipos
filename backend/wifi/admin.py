from django.contrib import admin
from . import models
# Register your models here.
@admin.register(models.WifiRouters)
class WifiRoutersAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "location",
        "description",
        "owner",
        "created",
    )

@admin.register(models.WifiTarrifs)
class WifiTarrifsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "duration",
        "length",
        "price",
        "owner",
        "created",
    )
@admin.register(models.WifiSubscriptions)
class WifiSubscriptionsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "mac_address",
        "username",
        "password",
        "valid_from",
        "valid_to",
        "owner",
        "created",
    )
@admin.register(models.WifiSubscriptionPayments)
class WifiSubscriptionPaymentsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "amount",
        "account",
        "is_settled",
        "description",
        "reference_number",
        "telco",
        "provider_reference_number",
        "psp_reference_number",
        "status",
        "created",
    )

