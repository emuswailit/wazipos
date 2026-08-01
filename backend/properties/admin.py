from django.contrib import admin
from . import models

# Register your models here.
@admin.register(models.Property)
class PropertiesAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "town", "street_address", "county", "country")
    search_fields = ("title",)
    list_filter = ("title",)


@admin.register(models.PropertyUnits)
class PropertyUnitsAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "reference_number", "price", "disposal_type", "price_due_date")
    search_fields = ("title",)
    list_filter = ("title",)

@admin.register(models.PropertyUnitPayments)
class PropertyUnitPaymentsAdmin(admin.ModelAdmin):
    list_display = ("id", "msisdn","months","valid_from","valid_to", "reference_number", "amount","provider_reference_number","account", "psp_reference_number", "status", "created")
    search_fields = ("msidn",)
    list_filter = ("msisdn",)


@admin.register(models.PropertyUnitTenants)
class PropertyUnitTenantsAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant","contract","entity","lease_start","lease_end","updated", "created")
