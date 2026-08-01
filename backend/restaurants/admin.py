from django.contrib import admin
from . import models

@admin.register(models.Menu)
class MenusAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "title",
        "description",
        "owner",
        "created",
    )
    list_filter = ("entity", "owner")
    search_fields = ("title",)

@admin.register(models.MenuItemImages)
class MenuItemImagesAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "menu_item",
        "created",
        "updated",
    )
    list_filter = ("menu_item",)
    search_fields = ("title",)


@admin.register(models.MenuItem)
class MenuItemssAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "menu",
        "title",
        "owner",
        "created",
    )
    list_filter = ("menu",)
    search_fields = ("title",)


@admin.register(models.BranchFoodOrderPayment)
class MenuItemssAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        # "entity_collection_account",
        "branch_food_order",
        "payment_method",
        "reference_number",
        "psp_reference_number",
        "provider_reference_num",
        "desc",
        "amount",
        "status",
        "owner",
        "created",
    )
    # list_filter = ("provider_reference_number",)
    # search_fields = ("provider_reference_number",)

@admin.register(models.BranchTable)
class TablesAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
       
        "title",
        "description",
        "attendant",
        "seats",
        "is_available",
        "owner",
        "created",
    )
    list_filter = ("created", )
    search_fields = ("title",)

# @admin.register(models.BranchInventory)
# class DrinksAdmin(admin.ModelAdmin):
#     list_display = (
#         "product",
#         "entity",
#         "supplier",
#         "unit_quantity",
#         "pack_quantity",
#         "unit_buying_price",
#         "pack_buying_price",
#         "unit_selling_price",
#         "pack_selling_price",
#         "owner",
#         "created",
#     )
#     list_filter = ( "owner",)



@admin.register(models.BranchFoodOrder)
class FoodOrdersAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        # "entity_collection_account",
        "amount",
        "payment_method",
        "branch_table",
        "document_number",
        "order_origin",
        "owner",
        "created",
    )
    list_filter = ("created", "owner")
    search_fields = ("document_number",)

    def amount(self, obj):
        amount = 0.00
        if models.BranchFoodOrderItem.objects.filter(branch_food_order=obj).exists():
            order_items = models.BranchFoodOrderItem.objects.filter(branch_food_order=obj).all()
            for item in order_items:
                amount = amount + (float(item.branch_food_item.price) * float(item.quantity))
        return "{:.2f}".format(amount)

@admin.register(models.BranchFoodOrderItem)
class FoodOrderItemsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "branch_food_order",
        "branch_food_item",
        "quantity",
        "owner",
        "created",
    )
    list_filter = ("entity", "owner")

@admin.register(models.BarInventoryOrder)
class BarInventoryOrdersAdmin(admin.ModelAdmin):
    list_display = (
    
        "entity",
        "order_origin",
        "branch",
        "document_number",
        "is_paid",
        "owner",
        "created",
    )
    list_filter = ("entity", "owner")

@admin.register(models.BarInventoryOrderPayment)
class BarInventoryOrderPaymentsAdmin(admin.ModelAdmin):
    list_display = (
        # "entity_collection_account",
        "bar_inventory_order",
        "payment_method",
        "reference_number",
        "psp_reference_number",
        "status",
        "provider_reference_num",
        "narration",
        "desc",
        "created",
    )
    list_filter = ("reference_number", "owner","created")


@admin.register(models.BranchFoodItem)
class BranchFoodItemAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "menu_item",
        "branch",
        "quantity",
        "price",
        "preparation_date",
        "expiry_date",
        "owner",
        "created",
    )
    list_filter = ("entity", "owner")


# @admin.register(models.BranchInventoryOrderPayment)
# class BranchDrinksOrderPaymentAdmin(admin.ModelAdmin):
#     list_display = (
#         "entity",
#         "amount",
#         "status",
#         "entity_collection_account",
#         "reference_number",
#         "payment_method",
#         "psp_reference_number",
#         "currency",
#         "amount",
#         "status",
#         "owner",
#         "created",
#     )
#     list_filter = ("entity", "owner")

@admin.register(models.BranchRoomBooking)
class BranchRoomBookingAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "checkin_date",
        "checkout_date",
        "branch_room",
        "owner",
        "created",
    )
    list_filter = ("entity", "owner")

