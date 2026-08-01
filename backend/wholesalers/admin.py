from django.contrib import admin
from . import models

# Register your models here.


@admin.register(models.WholesalerReceipts)
class WholesalerReceiptsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "product",
        "entity",
        "received_from",
        "batch",
        "manufacture_date",
        "current_unit_quantity",
        "unit_buying_price",
        "unit_selling_price",
        "owner",
        "created",
    )
    list_filter = (
        "product",
        "batch",
      
    )
    search_fields = ("product_title",)


@admin.register(models.RetailerOrders)
class RetailerOrdersAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "retailer",
        "wholesaler",
        "order_type",
        "order_terms",
        "owner",
        "created",
    )

@admin.register(models.RetailerOrderItems)
class RetailerOrderItemsAdmin(admin.ModelAdmin):
    list_display = (
        "wholesaler_receipt",
        "purchased_quantity",
        "owner",
        "created",
    )
@admin.register(models.RetailerOrderPayments)
class RetailerOrderPaymentsAdmin(admin.ModelAdmin):
    list_display = (
        "payout_account",
        "amount",
        "payment_method",
        "pay_in_reference_number",
        "pay_out_reference_number",
        "provider_reference_number",
        "psp_reference_number",
        "description",
        "telco",
        "status",
        "created",
    )

@admin.register(models.WholesalerPriceDiscounts)
class WholesalerPriceDiscountsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "title",
        "wholesaler_receipt",
        "percent",
        "start",
        "normal_price",
        "offer_price",
        "end",
        "created",
    )

@admin.register(models.WholesalerQuantityDiscounts)
class WholesalerQuantityDiscountsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "title",
        "wholesaler_receipt",
        "limit_quantity",
        "start",
        "awarded_quantity",
        "end",
        "created",
    )