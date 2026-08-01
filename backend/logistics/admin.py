from django.contrib import admin
from . import models

# Register your models here.

# @admin.register(models.OrganizationStore)
# class OrganizationStoreAdmin(admin.ModelAdmin):
#     list_display = (
#         "id",
#         "organization",
#         "title",
#         "created",
#     )
#     list_filter = ("organization", "title",)
#     search_fields = ("title",)


# admin.site.register(models.CountyStore)




@admin.register(models.EntitySubStoreReceipts)
class FacilitySubStoreAdmin(admin.ModelAdmin):
    list_display = (
        "get_product_title",
        "get_preparation_title",
        "entity",
        "received_pack_quantity",
        "received_unit_quantity",
        "current_pack_quantity",
        "current_unit_quantity",
        "created",
    )
    list_filter = ("entity", "product__title",)
    search_fields = ("get_product_title",)


    def get_product_title(self,obj):
        return obj.product.title
    
    def get_preparation_title(self,obj):
        return obj.product.preparation.title
