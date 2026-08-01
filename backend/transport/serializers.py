import asyncio
from intergrations.jambopay import jambopay_check_wallet_balance
from rest_framework import exceptions, serializers
from  employees.serializers import EmployeesSerializer
from core.date_utils import get_today_date
from core.time_utils import it_is_route_peak
from intergrations.jambopay import jambopay_wallet
from . import models
from datetime import datetime, timedelta
from core.time_utils import it_is_route_peak
from payments.models import UserAccounts
from rest_framework_gis.serializers import GeoFeatureModelSerializer


class ChargesSerializer(serializers.ModelSerializer):
    destination_title=serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.Charges
        fields = (
            "id",
            "destination",
            "entity",
            "price",
            "title",
            "description",
            "destination_title",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_destination_title(self,obj):
        if obj.destination:
            return obj.destination.title
        else:
            return ""
        


class RoutesDisplaySerializer(serializers.ModelSerializer):
    is_peak = serializers.SerializerMethodField(read_only=True)
    destinations = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.OperationRoutes
        fields = (
            "id",
            "entity",
           "evening_peak_start",
            "evening_peak_end",
            "morning_peak_start",
            "morning_peak_end",
            "is_peak",
            "title",
            "destinations",
            "description",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_is_peak(self,obj):
        
        return it_is_route_peak(obj)
    def get_destinations(self, obj):
        destinations = []
        if models.Destinations.objects.filter(route=obj).exists():
            destinations = models.Destinations.objects.filter(route=obj).all()

        return DestinationsSerializer(
            destinations, context=self.context, many=True
        ).data

class VehiclesDisplaySerializer(serializers.ModelSerializer):
    routes=serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.Vehicles
        fields = (
            "id",
            "entity",
            "seats",
            "routes",
            "registration",
            "administrator",
            "conductor",  
            "driver",
            "title",
            "description",
            "is_active",
            "vehicle_type",
            "vehicle_make",
            "vehicle_model",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    def get_routes(self,obj):   
        return RoutesDisplaySerializer(obj.routes.all(), context=self.context, many=True).data

class SaccoPersonnelDisplaySerializer(serializers.ModelSerializer):
      first_name =  serializers.CharField(source="user.first_name")
      last_name =  serializers.CharField(source="user.last_name")
      gender =  serializers.CharField(source="user.gender")
      phone =  serializers.CharField(source="user.phone")
      email =  serializers.CharField(source="user.email")
      identifier_type =  serializers.CharField(source="user.identifier_type")
      identifier_number =  serializers.CharField(source="user.identifier_number")
      administered_vehicles =  serializers.SerializerMethodField(read_only=True)
      conducted_vehicle =  serializers.SerializerMethodField(read_only=True)
      driven_vehicle = serializers.SerializerMethodField(read_only=True)
      class Meta:
        model = models.SaccoPersonnel
        fields = (
            "id",
            "user",
            "first_name",
            "last_name",
            "gender",
            "phone",
            "email",
            "identifier_type",
            "identifier_number",
            "personnel_type",
            "tenure",
            "roles",
            "administered_vehicles",
            "conducted_vehicle",
            "driven_vehicle",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

      def get_administered_vehicles(self, obj):
        vehicles =[]
        if models.Vehicles.objects.filter(administrator=obj).exists():
            vehicles = models.Vehicles.objects.filter(administrator=obj).all()
              
        return VehiclesDisplaySerializer(vehicles, context=self.context, many=True).data
      
      def get_driven_vehicle(self, obj):
        vehicle = None
        if models.Vehicles.objects.filter(driver=obj).exists():
            vehicle = models.Vehicles.objects.filter(driver=obj).first()  
            return VehiclesDisplaySerializer(vehicle, context=self.context, many=False).data
        else:
            return None
      
      def get_conducted_vehicle(self, obj):
        vehicle = None
        if models.Vehicles.objects.filter(conductor=obj).exists():
            vehicle = models.Vehicles.objects.filter(conductor=obj).first()
              
            return VehiclesDisplaySerializer(vehicle, context=self.context, many=False).data
        else:
            return None


class VehiclesSerializer(serializers.ModelSerializer):
    routes = serializers.SerializerMethodField(read_only=True)
    crew_members = serializers.SerializerMethodField(read_only=True)
    administrator_title = serializers.SerializerMethodField(read_only=True)
    conductor_title = serializers.SerializerMethodField(read_only=True)
    collector_title = serializers.SerializerMethodField(read_only=True)
    collector_account_number = serializers.SerializerMethodField(read_only=True)
    driver_title = serializers.SerializerMethodField(read_only=True)
    sacco_subscriptions = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.Vehicles
        fields = (
            "id",
            "entity",
            "seats",
            "registration",
            "administrator",
            "administrator_title",
            "conductor",
            "conductor_title",
            "collector",
            "collector_title",
            "collector_account_number",
            "vehicle_make",
            "vehicle_model",
            "vehicle_type",
            "driver",
            "driver_title",
            "title",
            "description",
            "is_active",
            "sacco_subscriptions",
            "crew_members",
            "routes",
            "agent",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    
    def get_administrator_title(self, obj):
        if obj.administrator:
            return f"{obj.administrator.user.first_name} {obj.administrator.user.last_name}"
        else:
            return None
    def get_conductor_title(self, obj):
        if obj.conductor:
            return f"{obj.conductor.user.first_name} {obj.conductor.user.last_name}"
        else:
            return None
    def get_collector_title(self, obj):
        if obj.collector:
            return f"{obj.collector.first_name} {obj.collector.last_name}"
        else:
            return ""
    def get_collector_account_number(self, obj):
        account = None
        if obj.collector:
            if UserAccounts.objects.filter(owner=obj.collector).exists():
                account =UserAccounts.objects.filter(owner=obj.collector).first()
                return account.account_number
        else:
            return None
        
        
    def get_driver_title(self, obj):
        if obj.driver:
            return f"{obj.driver.user.first_name} {obj.driver.user.last_name}"
        else:
            return None
        
    def get_sacco_subscriptions(self, obj):
        subscriptions =[]
        if len(obj.sacco_subscriptions.all())>0:
            subscriptions= obj.sacco_subscriptions.all()
              
        return SaccoSubscriptionSerializer(subscriptions, context=self.context, many=True).data


    def get_routes(self, obj):
        routes = []
        if len(obj.routes.all())>0:
            routes = obj.routes.all()
        return RoutesDisplaySerializer(routes, context=self.context, many=True).data
    
    def get_crew_members(self, obj):
        routes = []
        if len(obj.crew_members.all())>0:
            routes = obj.crew_members.all()
        return SaccoPersonnelDisplaySerializer(routes, context=self.context, many=True).data
 
class DestinationsSerializer(serializers.ModelSerializer):
    charges = serializers.SerializerMethodField(read_only=True)
    route_title = serializers.SerializerMethodField(read_only=True)
    fare_now = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Destinations
        fields = (
            "id",
            "entity",
            "route",
            "route_title",
            "title",
            "fare",
            "fare_peak",
            "fare_now",
            "is_route_start",
            "is_route_end",
            "destination_from",
            "destination_to",
            "description",
            "charges",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "title", "created", "updated", "entity", "id")
    def get_route_title(self,obj):
        if obj.route:
            return obj.route.title
        else:
            return ""

    def get_charges(self, obj):
        charges = []
        if models.Charges.objects.filter(destination=obj).exists():
            charges = models.Charges.objects.filter(destination=obj).all()

        return ChargesSerializer(charges, context=self.context, many=True).data

    def get_fare_now(self, obj):
        if it_is_route_peak(obj.route):
            return f"{obj.fare_peak}"
        else:
            return f"{obj.fare}"
        
class OperationRoutesSerializer(serializers.ModelSerializer):
    destinations = serializers.SerializerMethodField(read_only=True)
    vehicles = serializers.SerializerMethodField(read_only=True)
    is_peak = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.OperationRoutes
        fields = (
            "id",
            "entity",
            "title",
            "evening_peak_start",
            "evening_peak_end",
            "morning_peak_start",
            "morning_peak_end",
             "is_peak",
            "description",
            "owner",
            "destinations",
            "vehicles",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_destinations(self, obj):
        destinations = []
        if models.Destinations.objects.filter(route=obj).exists():
            destinations = models.Destinations.objects.filter(route=obj).all()

        return DestinationsSerializer(
            destinations, context=self.context, many=True
        ).data

    def get_vehicles(self, obj):
        vehicles = []
        vehicles = models.Vehicles.objects.filter(entity=obj.entity)
        # if models.Vehicles.objects.filter(route=obj).exists():
        #     vehicles = models.Vehicles.objects.filter(route=obj).all()

        return VehiclesSerializer(vehicles, context=self.context, many=True).data
    def get_is_peak(self,obj):
        
        return it_is_route_peak(obj)

class LegacyTicketsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.LegacyTickets
        fields = (
            "id",
            "entity",
            "from_city",
            "item_name",
            "to_city",
            "travel_date",
            "selected_vehicle",
            "selected_seat",
            "seater",
            "selected_ticket_type",
            "payment_method",
            "phone_number",
            "id_number",
            "passenger_name",
            "email_address",
            "insurance_charge",
            "served_by",
            "amount_charged",
            "reference_number",
            "quantity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated", "entity", "id")


class TicketsSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField(read_only=True)
    ticket_total_amount = serializers.SerializerMethodField(read_only=True)
    destination_title = serializers.SerializerMethodField(read_only=True)
    vehicle_title = serializers.SerializerMethodField(read_only=True)
    vehicle_registration = serializers.SerializerMethodField(read_only=True)
    route_title = serializers.SerializerMethodField(read_only=True)
    owner_title = serializers.SerializerMethodField(read_only=True)
    departure_date = serializers.SerializerMethodField(read_only=True)
    departure_time = serializers.SerializerMethodField(read_only=True)
    payment_method_title = serializers.SerializerMethodField(read_only=True)
    document_number = serializers.SerializerMethodField(read_only=True)
    reference_number = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Tickets
        fields = (
            "id",
            "entity",
            "first_name",
            "last_name",
            "passenger_phone",
            "identifier_type",
            "identifier_number",
            "document_number",
            "payment_reference",
            "payment_narrative",
            "origin",
            "is_paid",
            "trip",
            "vehicle",
            "seat",
            "fare",
            "payment_method",
            "payment_method_title",
            "ticket_total_amount",
            "destination",
            "reference_number",
            "route_title",
            "destination_title",
            "vehicle_title",
            "vehicle_registration",
            "description",
            "items",
            "owner",
            "owner_title",
            "departure_time",
            "departure_date",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_items(self, obj):
        items = []
        if models.TicketItems.objects.filter(ticket=obj).exists():
            items = models.TicketItems.objects.filter(ticket=obj).all()
        return TicketItemsSerializer(items, context=self.context, many=True).data

    def get_ticket_total_amount(self, obj):
        total_amount = 0.00
        if models.TicketItems.objects.filter(ticket=obj).exists():
            items = models.TicketItems.objects.filter(ticket=obj).all()
            for item in items:
                total_amount = total_amount + (
                    float(item.quantity) * float(item.charge.price)
                )
            return float(total_amount)
        else:
            return float(obj.fare)
        
    def get_fare(self,obj):
        total_amount = 0.00
        if models.TicketItems.objects.filter(ticket=obj).exists():
            items = models.TicketItems.objects.filter(ticket=obj).all()
            for item in items:
                total_amount = total_amount + (
                    float(item.quantity) * float(item.charge.price)
                )
            return float(total_amount)
        else:
            return float(obj.fare)


    def get_destination_title(self, obj):
        return obj.destination.title
    
    def get_document_number(self, obj):
        if obj.document_number:
            return obj.document_number.document_number
        else:
            return "N/A"
        
    def get_reference_number(self, obj):
        if obj.reference_number:
            return obj.reference_number


    def get_vehicle_title(self, obj):
        return obj.vehicle.title
    
    def get_vehicle_registration(self, obj):
        return obj.vehicle.registration

    def get_route_title(self, obj):
        return obj.destination.route.title
    def get_departure_date(self, obj):
        if obj.trip:
            return obj.trip.departure_date
        else:
            return ""
    
    def get_departure_time(self, obj):
        if obj.trip:
            return obj.trip.departure_time
        else:
            return ""

    def get_owner_title(self, obj):
        if obj.owner:
            return f"{obj.owner.first_name} {obj.owner.last_name}"
        else:
            return ""
    
    def get_payment_method_title(self, obj):
        return f"{obj.payment_method.title}"


class TicketItemsSerializer(serializers.ModelSerializer):
    item_total_amount = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    price = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.TicketItems
        fields = (
            "id",
            "entity",
            "ticket",
            "charge",
            "item_total_amount",
            "price",
            "title",
            "quantity",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_item_total_amount(self, obj):
        item_total_amount = 0.00
        if obj.quantity and obj.charge:
            item_total_amount = float(obj.quantity) * float(obj.charge.price)
        return float(item_total_amount)

    def get_title(self, obj):
        return obj.charge.title

    def get_price(self, obj):
        return obj.charge.price


class PassengersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Passengers
        fields = (
            "id",
            "ticket",
            "identifier_number",
            "identifier_type",
            "first_name",
            "last_name",
            "gender",
            "nationality",
            "date_of_birth",
            "user",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

class VehicleCollectionAccountSerializer(serializers.ModelSerializer):
    # balance = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = models.VehicleCollectionAccount
        fields = (
            "id",
            "vehicle",
            "psp",
            "account_name",
            "account_number",
            "currency",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    # def get_balance(self, obj):
    #     if obj.account_number:
    #         print("ACC No", obj.account_number)
    #         data =  {

    #                 "accountNo":obj.account_number 
    #                 }
    #         errors, balance =jambopay_check_wallet_balance.check_wallet_balance(data)

    #         if balance:
    #             return balance
    #         else:
    #             return "--:--"
    #     else:
    #         return "--:--"


class TicketPaymentSettlementSerializer(serializers.ModelSerializer):
    administrator_title = serializers.SerializerMethodField(read_only=True)
    vehicle_title = serializers.SerializerMethodField(read_only=True)
    trip_title = serializers.SerializerMethodField(read_only=True)
    provider_reference_number = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.TicketPaymentSettlement
        fields = (
            "id",
            "administrator",
            "administrator_title",
            "trip",
            "trip_title",
            "vehicle",
            "vehicle_title",
            "sacco_personnel_account",
            "ticket_payment",
            "reference_number",
            "psp_reference_number",
            "provider_reference_number",
            "account_from",
            "account_to",
            "amount",
            "created",
            "updated",
        )
        read_only_fields = ( "created", "updated", "entity", "id")
    def get_administrator_title(self,obj):
        if obj.administrator: 
            return f"{obj.administrator.user.first_name} {obj.administrator.user.last_name}"
        else:
            return "No adminisrator" 
    def get_trip_title(self,obj):
        if obj.trip: 
            return f"{obj.trip.route.title} - {obj.trip.departure_date} at {obj.trip.departure_time}"
    def get_vehicle_title(self,obj):
        if obj.vehicle: 
            return f"{obj.vehicle.registration}"
    def get_provider_reference_number(self,obj):
        if obj.ticket_payment: 
            return f"{obj.ticket_payment.provider_reference_number}"
class TicketPaymentSerializer(serializers.ModelSerializer):
    tickets = serializers.SerializerMethodField(read_only=True)
    trip_title = serializers.SerializerMethodField(read_only=True)
    vehicle_title = serializers.SerializerMethodField(read_only=True)
    payment_method_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.TicketPayment
        fields = (
            "id",
            "trip",
            "trip_title",
            "vehicle",
            "vehicle_title",
            "payment_method",
            "payment_method_title",
            "reference_number",
            "description",
            "psp_reference_number",
            "currency",
            "provider_reference_number",
            "telco",
            "msisdn",
            "status",
            "amount",
            "transaction_charge",
            "is_settled",
            "tickets",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    def get_trip_title(self,obj):
        if obj.trip and obj.trip.route:
            formatted = obj.created.strftime("%Y-%m-%d %H:%M:%S")
            return f"{obj.trip.route.title} - {formatted}"
        else:
            return f"N/A  {obj.created}"
    def get_vehicle_title(self,obj):
        if obj.vehicle: 
            return obj.vehicle.registration
        else:
            return "N/A"   
    def get_payment_method_title(self,obj):
        if obj.payment_method: 
            return obj.payment_method.title
        else:
            return "N/A"   
    
    def get_tickets(self,obj):
        tickets = []
        if len(obj.tickets.all())>0: 
            tickets = obj.tickets.all()
        return TicketsSerializer(tickets, context=self.context, many=True).data
class SubscriptionBannersImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SubscriptionBanners
        fields = (
            "id",
            "banner",
            "thumbnail",
            "owner",
            "subscription",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("subscription", "thumbnail", "owner", "entity")
       
class SaccoSubscriptionSerializer(serializers.ModelSerializer):
    is_subscribed = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    sacco_settlement_account_title = serializers.SerializerMethodField(read_only=True)
    banners = SubscriptionBannersImageSerializer(many=True, read_only=True)
    class Meta:
        model = models.SaccoSubscription
        fields = (
            "id",
            "title",
            "entity",
            "entity_title",
            "sacco_settlement_account",
            "sacco_settlement_account_title",
            "product_partner",
            "banking_partner",
            "principal_amount",
            "interest_amount",
            "interest_rate",
            "repayment_amount",
            "schedule",
            "is_subscribed",
            "description",
            "per_crew",
            "is_active",
            "owner",
            "banners",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

        extra_kwargs = {
            "banners": {
                "required": False,
            }
        }
    def get_is_subscribed(self, obj):
        return False
    
    def get_entity_title(self, obj):
        return obj.entity.title
    
    def get_sacco_settlement_account_title(self, obj):
       if obj.sacco_settlement_account:
           return obj.sacco_settlement_account.account_name
       else:
           return "N/A"


class SaccoSubscriptionPaymentSerializer(serializers.ModelSerializer):
    sacco_subscription_title = serializers.SerializerMethodField(read_only=True)
    schedule = serializers.SerializerMethodField(read_only=True)
    is_valid = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.SaccoSubscriptionPayment
        fields = (
            "id",
            "vehicle",
            "sacco_subscription",
            "sacco_subscription_title",
            "schedule",
            "reference_number",
            "psp_reference_number",
            "status",
            "currency",
            "amount",
            "valid_from",
            "valid_to",
            "is_valid",
            "narrative",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    def get_sacco_subscription_title(self,obj):
        return obj.sacco_subscription.title
    
    def get_schedule(self,obj):
        return obj.sacco_subscription.schedule
    
    def get_is_valid(self,obj):
        today = datetime.today()
        if  models.SaccoSubscriptionPayment.objects.filter(id=obj.id,valid_to__gte=datetime.now(),status="SETTLED").exists():
            return "TRUE"
        else:
            return "FALSE"


class SaccoSubscriptionSettlementSerializer(serializers.ModelSerializer):
    sacco_subscription_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.SaccoSubscriptionSettlement
        fields = (
            "id",
            "vehicle",
            "sacco_subscription_payment",
            "sacco_subscription_title",
            "sacco_collection_account",
            "sacco_collection_account_title",
            "reference_number",
            "psp_reference_number",
            "status",
            "amount",
            "narrative",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    def get_sacco_subscription_title(self,obj):
        return obj.sacco_subscription.title
    


class TripSerializer(serializers.ModelSerializer):
    route_title = serializers.SerializerMethodField(read_only=True)
    route_details = serializers.SerializerMethodField(read_only=True)
    all_seats = serializers.SerializerMethodField(read_only=True)
    sold_seats = serializers.SerializerMethodField(read_only=True)
    seats_configuration = serializers.SerializerMethodField(read_only=True)
    trip_tickets = serializers.SerializerMethodField(read_only=True)
    vehicle_registration = serializers.SerializerMethodField(read_only=True)
    vehicle_details = serializers.SerializerMethodField(read_only=True)
    vehicle_seats = serializers.SerializerMethodField(read_only=True)
    

    class Meta:
        model = models.Trip
        fields = (
            "id",
            "vehicle",
            "vehicle_registration",
            "vehicle_seats",
            "route",
            "route_title",
            "route_details",
            "departure_date",
            "departure_time",
            "expected_arrival_date",
            "expected_arrival_time",
            "is_active",
            "slot",
            "owner",
            "created",
            "updated",
            "all_seats",
            "sold_seats",
            "seats_configuration",
            "trip_tickets",
            "vehicle_details"
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_vehicle_registration(self,obj):
        return obj.vehicle.registration
    def get_vehicle_seats(self,obj):
        return obj.vehicle.seats
    def get_route_title(self,obj):
        return obj.route.title
    def get_vehicle_details(self,obj):
         return VehiclesSerializer(obj.vehicle, context=self.context, many=False).data
    def get_route_details(self,obj):
         return OperationRoutesSerializer(obj.route, context=self.context, many=False).data
    def get_sold_seats(self,obj):
        sold_seats_array=["D"]
        one_minutes_ago = datetime.now() - timedelta(minutes=1)
        if models.Tickets.objects.filter(trip=obj, is_paid="true").exists():
            trip_tickets =models.Tickets.objects.filter(trip=obj,is_paid="true").all()
            for ticket in trip_tickets:
                if ticket.seat and ticket.is_paid=="true":
                    sold_seats_array.append(ticket.seat)
        return sold_seats_array
    
    
    def get_seats_configuration(self,obj):
        if obj.vehicle.seats==12:
            return {
                "row1":["1", "H", "D"],
                "row2":["H","2", "3",],
                "row3":["4", "5","6"],
                "row4":["7", "8","9"],
                "row5":["10", "11","12"],
            }
        if obj.vehicle.seats==14:
            return {
                "row1":["1","1x","D"],
                "row2":["2", "3","4"],
                "row3":["5", "6","7"],
                "row4":["8", "9","10"],
                "row5":["11", "12","13"],
            }
    
    def get_all_seats(self, obj):
        if obj.vehicle.seats==12:
            return ["1","1X","2","3","4","5","6","7","8","9","10","11"]
        
        if obj.vehicle.seats==14:
            return  ["1","1X","2","3","4","5","6","7","8","9","10","11","12","13"]
    def get_trip_tickets(self,obj):
        trips = []
        if models.Tickets.objects.filter(trip=obj,is_paid="true").exists():    
            trips = models.Tickets.objects.filter(trip=obj, is_paid="true").all().order_by("-created")   
        return TicketsSerializer(trips, context=self.context, many=True).data 
    
class SaccoPersonnelSerializer(serializers.ModelSerializer):
    first_name =  serializers.CharField(source="user.first_name")
    last_name =  serializers.CharField(source="user.last_name")
    last_name =  serializers.CharField(source="user.last_name")
    gender =  serializers.CharField(source="user.gender")
    phone =  serializers.CharField(source="user.phone")
    email =  serializers.CharField(source="user.email")
    identifier_number =  serializers.CharField(source="user.identifier_number")
    identifier_type =  serializers.CharField(source="user.identifier_type")
    administered_vehicles =  serializers.SerializerMethodField(read_only=True)
    conducted_vehicle =  serializers.SerializerMethodField(read_only=True)
    driven_vehicle = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.SaccoPersonnel
        fields = (
            "id",
            "user",
            "first_name",
            "last_name",
            "gender",
            "phone",
            "email",
            "identifier_number",
            "identifier_type",
            "personnel_type",
            "tenure",
            "is_active",
            "basic_salary",
            "house_allowance",
            "hire_date",
            "retire_date",
            "administered_vehicles",
            "conducted_vehicle",
            "driven_vehicle",
            "agent",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_administered_vehicles(self, obj):
        vehicles =[]
        if models.Vehicles.objects.filter(administrator=obj).exists():
            vehicles = models.Vehicles.objects.filter(administrator=obj).all()
              
        return VehiclesSerializer(vehicles, context=self.context, many=True).data
      
    def get_driven_vehicle(self, obj):
        vehicle = None
        if models.Vehicles.objects.filter(driver=obj).exists():
            vehicle = models.Vehicles.objects.filter(driver=obj).first()
              
        return VehiclesSerializer(vehicle, context=self.context, many=False).data
      
    def get_conducted_vehicle(self, obj):
        vehicle = None
        if models.Vehicles.objects.filter(conductor=obj).exists():
            vehicle = models.Vehicles.objects.filter(conductor=obj).first()
              
        return VehiclesSerializer(vehicle, context=self.context, many=False).data
    

class SaccoPersonnelAccountsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SaccoPersonnelAccount
        fields = (
            "id",
            "entity",
            "sacco_personnel",
            "psp",
            "account_number",
            "account_name",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

class SaccoSettlementAccountsSerializer(serializers.ModelSerializer):
    administrator_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.SaccoSettlementAccount
        fields = (
            "id",
            "entity",
            "administrator",
            "administrator_title",
            "psp",
            "account_number",
            "account_name",
            "account_phone_number",
            "currency",
            "description",
            "is_active",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_administrator_title(self,obj):
        if obj.administrator:
            return f"{obj.administrator.user.first_name} {obj.administrator.user.last_name} - {obj.administrator.user.phone}"
        else:
            return "N/A"

# class FareVouchersSerializer(serializers.ModelSerializer):

#     class Meta:
#         model = models.FareVouchers
#         fields = (
#             "id",
#             "entity",
#             "operator",
#             "document_number",
#             "identifier_type",
#             "identifier_nummber",
#             "passenger_name",
#             "passenger_phone",
#             "amount",
#             "is_redeemed",
#             "expiry_date",
#             "agent",
#             "created",
#             "updated",
#         )
#         read_only_fields = ("agent", "created", "updated", "entity", "id")

# class EscrowCollectionAccountSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = models.EscrowCollectionAccount
#         fields = (
#             "id",
#             "entity",
#             "psp",
#             "account_number",
#             "account_name",
#             "currency",
#             "agent",
#             "created",
#             "updated",
#         )
#         read_only_fields = ("agent", "created", "updated", "entity", "id")

# class FareVoucherPaymentsSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = models.FareVoucherPayments
#         fields = (
#             "id",
#             "entity",
#             "escrow_collection_account",
#             "fare_vouchers",
#             "payment_method",
#             "description",
#             "document_reference",
#             "psp_reference_number",
#             "provider_reference_number",
#             "status",
#             "amount",
#             "is_settled",
#             "currency",
#             "created",
#             "updated",
#         )
#         read_only_fields = ("agent", "created", "updated", "entity", "id")

# class TransferPointsSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = models.TransferPoints
#         fields = (
#             "id",
#             "entity",
#             "city",
#             "title",
#             "abbreviation",
#             "owner",
#             "created",
#             "updated",
#         )
#         read_only_fields = ("owner", "created", "updated", "entity", "id")

class TransferPointsSerializer(serializers.ModelSerializer):
    city_title= serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.TransferPoints
        fields = (
            "id",
            "entity",
            "city",
            "city_title",
            "title",
            "abbreviation",
            "is_active",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    def get_city_title(self,obj):
        if obj.city:
            return obj.city.title
        else:
            return ""
class TransfersSerializer(serializers.ModelSerializer):
    origin_transfer_point_title= serializers.SerializerMethodField(read_only=True)
    destination_transfer_point_title= serializers.SerializerMethodField(read_only=True)
    town_title= serializers.SerializerMethodField(read_only=True)
    vehicle_registration= serializers.SerializerMethodField(read_only=True)
    driver_title= serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.Transfers
        fields = (
            "id",
            "entity",
            "town",
            "town_title",
            "origin_transfer_point",
            "origin_transfer_point_title",
            "destination_transfer_point",
            "destination_transfer_point_title",
            "transfer_fare",
            "transfer_date",
            "reporting_time",
            "departure_time",
            "vehicle",
            "vehicle_registration",
            "driver",
            "driver_title",
            "official_pick_up_point",
            "is_active",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    def get_destination_transfer_point_title(self,obj):
        return obj.destination_transfer_point.title
    
    def get_origin_transfer_point_title(self,obj):
        return obj.origin_transfer_point.title
    
    def get_driver_title(self,obj):
        if obj.driver:
            return f"{obj.driver.user.first_name} {obj.driver.user.last_name}"
        else:
            return "NOT ASIGNED"
    
    def get_vehicle_registration(self,obj):
        if obj.vehicle:
            return obj.vehicle.registration
        else:
            return "NOT ASSIGNED"
    
    def get_town_title(self,obj):
        if obj.town:
            return obj.town.title
        else:
            return ""

class TransferBookingsSerializer(serializers.ModelSerializer):
    document_number= serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.TransferBookings
        fields = (
            "id",
            "entity",
            "transfer",
            "first_name",
            "last_name",
            "identifier_type",
            "identifier_number",
            "passenger_phone",
            "document_number",
            "payment_reference",
            "payment_narrative",
            "provider_reference_number",
            "status",
            "description",
            "mobile_money_phone",
            "payment_method",
            "preferred_pick_up_point",
            "telco",
            "owner",
            "is_paid",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_document_number(self,obj):
        return obj.document_number.document_number
    
class JourniesSerializer(serializers.ModelSerializer):
    all_seats = serializers.SerializerMethodField(read_only=True)
    sold_seats = serializers.SerializerMethodField(read_only=True)
    available_seats = serializers.SerializerMethodField(read_only=True)
    seats_configuration = serializers.SerializerMethodField(read_only=True)
    journey_tickets = serializers.SerializerMethodField(read_only=True)
    origin_town_title = serializers.SerializerMethodField(read_only=True)
    destination_town_title = serializers.SerializerMethodField(read_only=True)
    vehicle_registration = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.Journies
        fields = (
            "id",
            "entity",
            "origin_town",
            "origin_town_title",
            "destination_town",
            "destination_town_title",
            "is_active",
            "drivers",
            "conductors",
            "journey_fare",
            "departure_date",
            "departure_time",
            "reporting_time",
            "expected_arrival_date",
            "expected_arrival_time",
            "vehicle",
            "vehicle_registration",
            "official_pick_up_point",
            "owner",
            "available_seats",
            "sold_seats",
            "seats_configuration",
            "all_seats",
            "journey_tickets",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_origin_town_title(self,obj):
        return obj.origin_town.title
    
    def get_destination_town_title(self,obj):
        return obj.destination_town.title
    
    def get_vehicle_registration(self,obj):
        return obj.vehicle.registration
    

    def get_sold_seats(self,obj):
        sold_seats_array=["D"]
        one_minutes_ago = datetime.now() - timedelta(minutes=1)
        if models.JourneyBookings.objects.filter(journey=obj, is_paid="true").exists():
            journey_tickets =models.JourneyBookings.objects.filter(journey=obj,is_paid="true").all()
            for ticket in journey_tickets:
                if ticket.seat and ticket.is_paid=="true":
                    sold_seats_array.append(ticket.seat)
        return sold_seats_array
    
    
    def get_seats_configuration(self,obj):
        if obj.vehicle.seats==12:
            return {
                "row1":["1", "H", "D"],
                "row2":["H","2", "3",],
                "row3":["4", "5","6"],
                "row4":["7", "8","9"],
                "row5":["10", "11","12"],
            }
        if obj.vehicle.seats==14:
            return {
                "row1":["1","1x","D"],
                "row2":["2", "3","4"],
                "row3":["5", "6","7"],
                "row4":["8", "9","10"],
                "row5":["11", "12","13"],
            }
    
    def get_all_seats(self, obj):
        if obj.vehicle.seats==12:
            return ["1","1X","2","3","4","5","6","7","8","9","10","11"]
        
        if obj.vehicle.seats==14:
            return  ["1","1X","2","3","4","5","6","7","8","9","10","11","12","13"]
    def get_available_seats(self, obj):
        sold_seats_array=["D",]
        one_minutes_ago = datetime.now() - timedelta(minutes=1)
        if models.JourneyBookings.objects.filter(journey=obj, is_paid="true").exists():
            journey_tickets =models.JourneyBookings.objects.filter(journey=obj,is_paid="true").all()
            for ticket in journey_tickets:
                if ticket.seat and ticket.is_paid=="true":
                    sold_seats_array.append(ticket.seat)

        if obj.vehicle.seats==12:
            all_seats = ["1","1X","2","3","4","5","6","7","8","9","10","11"]
            for seat in all_seats:
                for sold_seat in sold_seats_array:
                    if str(seat).upper()==str(sold_seat).upper():
                        all_seats.remove(seat)
            return all_seats
        if obj.vehicle.seats==14:
            all_seats=  ["1","1X","2","3","4","5","6","7","8","9","10","11","12","13"]
            for seat in all_seats:
                for sold_seat in sold_seats_array:
                    if str(seat).upper()==str(sold_seat).upper():
                        all_seats.remove(seat)
            return all_seats
        
    def get_journey_tickets(self,obj):
        tickets = []
        if models.JourneyBookings.objects.filter(journey=obj,is_paid="true").exists():    
            tickets = models.Tickets.objects.filter(journey=obj, is_paid="true").all().order_by("-created")   
        return JourneyBookingsSerializer(tickets, context=self.context, many=True).data 
    
class JourneyBookingsSerializer(serializers.ModelSerializer):
    document_number = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.JourneyBookings
        fields = (
            "id",
            "entity",
            "journey",
            "seat",
            "first_name",
            "last_name",
            "identifier_type",
            "identifier_number",
            "passenger_phone",
            "document_number",
            "payment_reference",
            "payment_narrative",
            "provider_reference_number",
            "description",
            "status",
            "telco",
            "is_active",
            "amount",
            "mobile_money_phone",
            "payment_method",
            "preferred_pick_up_point",
            "owner",
            "is_paid",
            "created",
            "updated",
            "started_at",
            "completed_at",
        )
        read_only_fields = ("owner", "created", "updated","started_at","completed_at", "entity", "id")

    def get_document_number(self, obj):
        if obj.document_number:
            return obj.document_number.document_number
        else:
            return "N/A"
        

class BodabodaTripsSerializer(serializers.ModelSerializer):
    boda_title= serializers.SerializerMethodField(read_only=True)
    # food_order_entity_title= serializers.SerializerMethodField(read_only=True)
    shopping_order_entity_title= serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.BodabodaTrips
        fields = (
            "id",
            "entity",
            "origin",
            "destination",
            "distance",
            "fare",
            "is_delivery",
            "is_accepted",
            "is_cancelled",
            "is_started",
            "is_completed",
            "is_declined",
            "children",
            "adults",
            "luggage",
            "fare",
            "boda",
            "boda_title",
            "departure",
            "arrival",
            "owner",
            "status",
            "origin_point",
            "destination_point",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_boda_title(self,obj):
        return f"{obj.boda.user.first_name} {obj.boda.user.last_name}"
    