from django.contrib import admin
from . import models

# Register your models here.
from django.contrib import admin
from . import models

@admin.register(models.Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "entity_title", # 🌟 Added here
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
    # 🌟 Added entity__title so you can search by the retailer's name too
    search_fields = ("type", "entity__title")
    
    # 🌟 Optional: Add a custom method if you want to rename the column header
    @admin.display(description="Entity Title", ordering="entity__title")
    def entity_title(self, obj):
        return obj.entity.title if obj.entity else "—"


from django.contrib import admin
from . import models

@admin.register(models.SubscriptionPayment)
class SubscriptionPaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id", 
        "entity_title", # 🌟 Added here
        "amount",
        "psp_reference_number",
        "provider_reference_number",
        "reference_number", 
        "created", 
        "updated"
    )
    list_filter = ("amount", "created", "updated")
    # 🌟 Added entity__title so you can search by the retailer's name
    search_fields = ("amount", "entity__title", "reference_number", "psp_reference_number")
    
    # 🌟 Custom method to display the entity title and allow sorting
    @admin.display(description="Entity Title", ordering="entity__title")
    def entity_title(self, obj):
        return obj.entity.title if obj.entity else "—"