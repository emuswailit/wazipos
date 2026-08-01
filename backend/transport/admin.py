from django.contrib import admin

from intergrations.jambopay.jambopay_check_wallet_balance import check_wallet_balance
from . import models

# Register your models here.


class LegacyTicketsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "reference_number",
        "amount_charged",
        "item_name",
        "from_city",
        "to_city",
        "served_by",
        "created",
        "updated",
    )


admin.site.register(models.LegacyTickets, LegacyTicketsAdmin)


class OperationRoutesAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        # "morning_peak_start",
        # "morning_peak_end",
        # "evening_peak_start",
        # "evening_peak_end",
        "description",
        "owner",
        "created",
        "updated",
    )


admin.site.register(models.OperationRoutes, OperationRoutesAdmin)


class DestinationsAdmin(admin.ModelAdmin):
    list_display = (
        "route",
        "title",
        "fare",
        "fare_peak",
        "destination_from",
        "destination_to",
        "is_route_start",
        "is_route_end",
        "owner",
        "created",
        "updated",
    )


admin.site.register(models.Destinations, DestinationsAdmin)


class ChargesAdmin(admin.ModelAdmin):
    list_display = (
        "destination",
        "title",
        "price",
        "owner",
        "created",
        "updated",
    )


admin.site.register(models.Charges, ChargesAdmin)


class VehiclesAdmin(admin.ModelAdmin):
    list_display = (
        "registration",
        "title",
        "seats",
        "administrator",
        "driver",
        "conductor",
        "created",
        "updated",
    )


admin.site.register(models.Vehicles, VehiclesAdmin)


class TicketsAdmin(admin.ModelAdmin):
    list_display = (
    
     "reference_number",
      "amount",
    "origin",
    "destination",
    "route",
     "is_paid",
        "entity",
        "passenger_phone",
        "fare",
        "owner",
        "created",
        "updated",
    )
    list_filter = ( "owner","created")
    search_fields = ("reference_number",)

    def amount(self, obj):
        amount = 0.00
        if models.TicketItems.objects.filter(ticket=obj).exists():
            ticket_items = models.TicketItems.objects.filter(ticket=obj).all()
            for item in ticket_items:
                amount = amount + (float(item.charge.price) * float(item.quantity))
            return "{:.2f}".format(amount)
        else:
            return "{:.2f}".format(obj.fare)


admin.site.register(models.Tickets, TicketsAdmin)


class TicketItemsAdmin(admin.ModelAdmin):
    list_display = (
        "ticket",
        "charge",
        "quantity",
        "owner",
        "destination",
        "created",
        "updated",
    )
    list_filter = ("ticket", "owner", "charge")
    search_fields = ("ticket", "charge")

    def destination(self, obj):
        return obj.charge.destination.title


admin.site.register(models.TicketItems, TicketItemsAdmin)


@admin.register(models.TicketPayment)
class TicketPaymentsAdmin(admin.ModelAdmin):
    list_display = (
        "reference_number",
        "is_settled",
        "status",
        "amount",
        "payment_method_title",
        "description",
        "narrative",
        "created",
    )
    list_filter = (
        "status",
    )
    search_fields = ("reference_number",)

    def payment_method_title(self,obj):
        return obj.payment_method.title

@admin.register(models.SubscriptionBanners)
class SubscriptionBannersAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "subscription",
        "created",
    )  


@admin.register(models.Transfers)
class TransfersAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "town",
        "origin_transfer_point",
        "destination_transfer_point",
        "transfer_date",
        "transfer_fare",
        "reporting_time",
        "departure_time",
        "created",
    ) 
@admin.register(models.TransferBookings)
class TransferBookingsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "transfer",
        "first_name",
        "last_name",
        "identifier_number",
        "reference_number",
        "payment_reference",
        "payment_narrative",
        "provider_reference_number",
        "psp_reference_number",
        "status",
        "description",
        "created",
    ) 


@admin.register(models.SaccoSubscription)
class SaccoSubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "title",
        "schedule",
        "description",
        "banking_partner",
        "product_partner",
        "principal_amount",
        "repayment_amount",
        "interest_amount",
        "interest_rate",
        "created",
    )
    list_filter = (
        "entity",
    )
    search_fields = ("title",)

#     def balance(self,obj):
#         if obj.account_number:
#             return check_wallet_balance({
#                 "accountNo":obj.account_number
#             })
#         else:
#             return "--:--"

@admin.register(models.SaccoSubscriptionPayment)
class SaccoSubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "sacco_subscription",
        "amount",
        "vehicle",
        "reference_number",
        "status",
        "psp_reference_number",
        "currency",
        "created",
    )
    list_filter = (
        "entity",
    )
    search_fields = ("reference_number",)


@admin.register(models.SaccoSubscriptionSettlement)
class SaccoSubscriptionSettlementAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "sacco_subscription_payment",
        "reference_number",
        "status",
        "psp_reference_number",
        "account_from",
        "account_to",
        "created",
    )
    list_filter = (
        "entity",
    )
    search_fields = ("reference_number",)

@admin.register(models.Trip)
class TripsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "route",
        "vehicle",
        "title",
        "departure_date",
        "departure_time",
        "is_active",
        "created",
    )
    list_filter = (
        "entity",
        "is_active"
    )
    search_fields = ("route","vehicle")


@admin.register(models.VehicleCollectionAccount)
class VehicleCollectionAccountsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "vehicle",
        "account_number",
        "account_name",
        "psp",
        "currency",
        "created",
    )
    list_filter = (
        "psp",
    )
    search_fields = ("account_number","vehicle")

@admin.register(models.TicketPaymentSettlement)
class TicketPaymentSettlementsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "administrator",
        "vehicle",
        "trip",
        "ticket_payment",
        "psp_reference_number",
        "reference_number",
        "account_from",
        "account_to",
        "amount",
        "created",
    )
  
    search_fields = ("account_number","reference_number")

@admin.register(models.SaccoPersonnel)
class SaccoPersonnelAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "personnel_type",
        "tenure",
        "user",
        "owner",
        "created",
    )
  
    search_fields = ("user","personnel_type")


@admin.register(models.SaccoPersonnelAccount)
class SaccoPersonnelAccountAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "sacco_personnel",
        "psp",
        "account_name",
        "account_number",
        "created",
    )
  
    search_fields = ("user","account_number")

@admin.register(models.Journies)
class JourniesAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "origin_town",
        "destination_town",
        "journey_fare",
        "departure_date",
        "departure_time",
        "created",
    )
  
    search_fields = ("origin_town","destination_town")


@admin.register(models.JourneyBookings)
class JourneyBookingsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "journey",
        "first_name",
        "last_name",
        "identifier_number",
        "reference_number",
        "payment_reference",
        "payment_narrative",
        "provider_reference_number",
        "psp_reference_number",
        "status",
        "description",
        "created",
    ) 


@admin.register(models.BodabodaTrips)
class BodabodaTripsAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "adults",
        "children",
        "boda",
        "owner",
        "origin",
        "destination",
        "luggage",
        "status",
        "created",
        "updated"
    ) 