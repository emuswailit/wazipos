from django.contrib import admin
from .models import (

    CustomerOrders,
    CustomerOrderItems,
)
from . import models

# Register your models here.



class CustomerOrderPaymentsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "msisdn",
        "transfer_status",
        "reference_number",
        "description",
        "user",
        "created",
        "transaction_id",
        "updated",
    )


# class CustomerOrderFailedPaymentsAdmin(admin.ModelAdmin):
#     list_display = ("entity", "response_message", "response_code", "reference_number",
#                     "user", "created",  "updated",)


# admin.site.register(CustomerOrderFailedPayments,
#                     CustomerOrderFailedPaymentsAdmin)


class CustomerOrdersAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "order_type",
        "order_origin",
        "order_number",
        "order_channel",
        "shipping_cost",
        "order_price_total",
        "order_total_ammount",
        "owner",
        "created",
        "updated",
    )

    def order_total_ammount(self, obj):
        amount = 0.00
        if models.CustomerOrderItems.objects.filter(customer_order=obj).exists():
            order_items = models.CustomerOrderItems.objects.filter(customer_order=obj)
            for item in order_items:
                amount = amount + (float(item.retailer_receipt.unit_selling_price) * float(item.purchased_quantity))
            return "{:.2f}".format(amount)

@admin.register(models.RetailQuantityDiscounts)
class RetailQuantityDiscountsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "title",
        "retailer_receipt",
        "limit_quantity",
        "start_date",
        "awarded_quantity",
        "end_date",
        "created",
    )
# @admin.register(models.RetailQuantityDiscounts)
# class RetailQuantityDiscountsAdmin(admin.ModelAdmin):
#     list_display = (
#         "entity",
#         "retailer_receipt",
#         "limit_quantity",
#         "awarded_quantity",
#         "start_date",
#         "end_date",
#         "created",
#         "updated",
#     )

# @admin.register(models.RetailerReceipts)
# class RetailerReceiptsAdmin(admin.ModelAdmin):
#     list_display = (
#         "entity",
#         "order_type",
#         "order_origin",
#         "reference_number",
#         "shipping_cost",
#         "created",
#         "updated",
#     )

@admin.register(models.OutOfStock)
class OutOfStockAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "owner",
        "product",
        "required_quantity",
        "customer_name",
        "customer_phone",
        "is_special_order",
        "is_ordered",
        "created"
    )
    list_filter = ("product",)
    search_fields = ("product",)


@admin.register(models.OrderEstimate)
class OrderEstimatesAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "owner",
        "product",
        "retailer_indent",
        "required_estimate",
        "is_ordered",
        "created"
    )
    list_filter = ("product",)
    search_fields = ("product",)


@admin.register(models.RetailerIndent)
class OrderEstimatesAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "owner",
        "indent_number",
        "order_days",
        "is_open",
        "created"
    )


@admin.register(models.RetailerIndentItem)
class RetailerIndentItemAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "owner",
        "wholesale_receipt",
        "retailer_indent",
        "required_quantity",
        "required_quantity",
        "total_quantity",
        "created"
    )
    list_filter = ("wholesale_receipt", "entity")
    search_fields = ("wholesale_receipt",)

@admin.register(models.RetailerReceipts)
class ReceiptsAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "entity",
        "created",
        "unit_of_receipt",
        "received_unit_quantity",
        "current_unit_quantity",
        "unit_buying_price",
        "unit_selling_price",
        "unit_price_discount",
        "final_unit_selling_price",
        "expiry_date",
        "manufacture_date",
            "owner",
       
    )
    list_filter = ("product", "entity")
    search_fields = ("product",)


admin.site.register(CustomerOrders, CustomerOrdersAdmin)


class CustomerOrderItemssAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "customer_order",
        "retailer_receipt",
        "item_price",
        "item_price_total",
        "purchased_quantity",
        "created",
        "updated",
    )


admin.site.register(CustomerOrderItems, CustomerOrderItemssAdmin)


@admin.register(models.WholesalerInvoices)
class WholesalerInvoicesAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "source_entity",
        "invoice_number",
    )
    list_filter = ("invoice_number", "entity")
    search_fields = ("invoice_number",)

@admin.register(models.CustomerOrderPayment)
class PaymentsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "payment_method",
        "reference_number",
        "psp_reference_number",
        "provider_reference_number",
        "narration",
        "description",
        "status",
        "amount",
        "currency",
        "created",
    )
    list_filter = (
        "reference_number",
        "psp_reference_number",
        "provider_reference_number",
        "payment_method",
    )
    search_fields = ("reference_number",)


@admin.register(models.CustomerOrderSettlement)
class SettlementsAdmin(admin.ModelAdmin):
    list_display = (
        "receiving_entity",
        "entity_collection_account",
        "reference_number",
        "psp_reference_number",
        "account_from",
        "account_to",
        "amount",
        "created",
    )
    list_filter = (
        "psp_reference_number",
       
    )
    search_fields = ("reference_number",)

@admin.register(models.Prescriptions)
class PrescriptionsAdmin(admin.ModelAdmin):
    list_display = (
        "created_by",
        "interpreted_by",
        "nature",
        "status",
        "patient",
        "updated",
        "created",
    )


@admin.register(models.PrescriptionItems)
class PrescriptionItemsAdmin(admin.ModelAdmin):
    list_display = (
            "id",
            "prescription",
            "preparation",
            "product",
            "prescribed_by",
            "interpreted_by",
            "frequency",
            "route",
            "dose",
            "days",
            "required_unit_quantity",
            "issued_unit_quantity",
            "balance_unit_quantity",
            "created_by",
            "created",
            "updated",
        )
