from os import error
from django.shortcuts import render
from rest_framework import generics, permissions, response, status, exceptions
from rest_framework.decorators import api_view, permission_classes
from authentication.serializers import UsersSerializer
from authentication.models import Roles
from decouple import config
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate, login
from transport.utils import sacco_personnel_utils
from transport.utils import trip_utils, transfers_utils, bus_utils,boda_utils
from core.responses import (
    custom_count_response,
    custom_success_message,
    custom_error_response,
    custom_errors_response,
    custom_plain_response,
    custom_json_response
)
import jwt
from . import models, serializers
from rest_framework.pagination import PageNumberPagination
from . import transport_utils
from django.http import JsonResponse
from authentication.validators import authentication_models_validators
from authentication.utils import utils
from payments.serializers import PaymentMethodsSerializer, PaymentServicesProviderSerializer
from .utils import route_utils,destination_utils,charges_utils,vehicle_utils


@api_view(["PUT"])
@permission_classes([permissions.AllowAny])
def legacyTicketsAPIView(request):
    customer_orders = []
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "BatchReserveSeats":
        hash = "FBEAD9B-D9CD-400D-ADF3-F4D0E639CEE0"
        username = ("emuswailit",)
        api_key = "c8e254c0adbe4b2623ff85567027d78d4cc066357627e284d4b4a01b159d97a7"
        ticket_items = request.data["ticket_items"]
        if ticket_items and len(ticket_items) > 0:
            (
                created_tickets,
                rejected_tickets,
                errors,
            ) = transport_utils.create_ticket_item(ticket_items)
            return JsonResponse(
                {
                    "response_code": 0,
                    "response_message": "Syncing done succesfully",
                    "rejected": rejected_tickets,
                    "synced": created_tickets,
                }
            )
        else:
            return JsonResponse(
                {"response_code": 1, "response_message": "Syncing event failed"}
            )

    elif request.data["action"] == "RetrieveLegacyTickets":
        legacy_tickets = []
        entity = request.data["entity"]
        if models.LegacyTickets.objects.filter(entity_id=entity).exists():
            legacy_tickets = models.LegacyTickets.objects.filter(entity_id=entity).all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(legacy_tickets, request)
        serializer = serializers.LegacyTicketsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')




@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def transportAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetAssignedRoutes":
        assigned_routes = transport_utils.get_assigned_routes(request.user)
        if assigned_routes:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(assigned_routes, request)
            serializer = serializers.OperationRoutesSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No routes retrieved", [])
    elif request.data["action"] == "GetEntityRoutes":
        entity_routes = transport_utils.get_entity_routes(request.user)
        if entity_routes:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(entity_routes, request)
            serializer = serializers.OperationRoutesSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No routes retrieved", [])
    elif request.data["action"] == "GetRouteDestinations":
        destinations = transport_utils.get_route_destinations(
            request.data, request.data
        )
        if destinations:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(destinations, request)
            serializer = serializers.DestinationsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No routes retrieved", [])
    elif request.data["action"] == "GetEntityDestinations":
        destinations = destination_utils.get_entity_destinations(
            request.user
        )
        if destinations:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(destinations, request)
            serializer = serializers.DestinationsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No destinations retrieved", [])
    elif request.data["action"] == "CreateDestination":
        errors, destination = destination_utils.create_destination(request.data, request.user)
        if destination:
            serializer =serializers.DestinationsSerializer(destination,many=False).data
            return custom_success_message(0, "Destination sucessfully created",serializer,"route")
        else:
            return custom_errors_response(1, "Destination could not be created", errors)
    elif request.data["action"] == "UpdateDestination":
        errors, destination = destination_utils.update_destination(request.data, request.user)
        if destination:
            serializer =serializers.DestinationsSerializer(destination,many=False).data
            return custom_success_message(0, "Destination sucessfully updated",serializer,"route")
        else:
            return custom_errors_response(1, "Destination could not be updated", errors)
    elif request.data["action"] == "GetEntityCharges":
        charges = charges_utils.get_entity_charges(
            request.user
        )
        if charges:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(charges, request)
            serializer = serializers.ChargesSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No charges retrieved", [])
    elif request.data["action"] == "CreateCharge":
        errors, charge = charges_utils.create_charge(request.data, request.user)
        if charge:
            serializer =serializers.ChargesSerializer(charge,many=False).data
            return custom_success_message(0, "Charge sucessfully created",serializer,"charge")
        else:
            return custom_errors_response(1, "Charge could not be created", errors)
    elif request.data["action"] == "UpdateCharge":
        errors, charge = charges_utils.update_charge(request.data, request.user)
        if charge:
            serializer =serializers.ChargesSerializer(charge,many=False).data
            return custom_success_message(0, "Charge sucessfully updated",serializer,"charge")
        else:
            return custom_errors_response(1, "Charge could not be updated", errors)
    elif request.data["action"] == "FilterAllVehicles":
        vehicles = vehicle_utils.filter_all_vehicle_by_registration(
            request.data
        )
        if vehicles:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vehicles, request)
            serializer = serializers.VehiclesSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No charges retrieved", [])
    elif request.data["action"] == "FilterEntityVehicles":
        vehicles = vehicle_utils.filter_entity_vehicle_by_registration(
            request.data,request.user
        )
        if vehicles:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vehicles, request)
            serializer = serializers.VehiclesSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No charges retrieved", [])
    elif request.data["action"] == "SearchVehicleByRegistration":
        errors, vehicle = vehicle_utils.search_vehicle_by_registration(
            request.data
        )
        if vehicle:
            serializer =serializers.VehiclesSerializer(vehicle,many=False).data
            return custom_success_message(0, "Vehicle sucessfully retrieved",serializer,"vehicle")
        else:
            return custom_errors_response(1, "Vehicle not retrieved", errors)
    elif request.data["action"] == "GetEntityVehicles":
        vehicles = vehicle_utils.get_entity_vehicles(
            request.user
        )
        if vehicles:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vehicles, request)
            serializer = serializers.VehiclesSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No vehicles were retrieved", [])
    elif request.data["action"] == "GetUserVehicles":
        vehicles = vehicle_utils.get_user_vehicles(
            request.user
        )
        if vehicles:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vehicles, request)
            serializer = serializers.VehiclesSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No vehicles were retrieved", [])
    elif request.data["action"] == "CreateVehicle":
        errors, vehicle = vehicle_utils.create_vehicle(request.data, request.user)
        if vehicle:
            serializer =serializers.VehiclesSerializer(vehicle,many=False).data
            return custom_success_message(0, "Vehicle sucessfully created",serializer,"vehicle")
        else:
            return custom_errors_response(1, "Vehicle could not be created", errors)
    elif request.data["action"] == "CreateVehicleByAgent":
        errors, vehicle = vehicle_utils.create_vehicle_by_agent(request.data, request.user)
        if vehicle:
            serializer =serializers.VehiclesSerializer(vehicle,many=False).data
            return custom_success_message(0, "Vehicle sucessfully created",serializer,"vehicle")
        else:
            return custom_errors_response(1, "Vehicle could not be created", errors)
    elif request.data["action"] == "UpdateVehicle":
        errors, vehicle = vehicle_utils.update_vehicle(request.data, request.user)
        if vehicle:
            serializer =serializers.VehiclesSerializer(vehicle,many=False).data
            return custom_success_message(0, "Vehicle sucessfully updated",serializer,"vehicle")
        else:
            return custom_errors_response(1, "Vehicle could not be updated", errors)
    elif request.data["action"] == "CreateSaccoPersonnel":
        errors, sacco_personnel = sacco_personnel_utils.create_sacco_personnel(request.data, request.user)
        if sacco_personnel:
            serializer =serializers.SaccoPersonnelSerializer(sacco_personnel,many=False).data
            return custom_success_message(0, "Sacco personnel sucessfully created",serializer,"sacco_personnel")
        else:
            return custom_errors_response(1, "Sacco personnel not be created", errors)  
    elif request.data["action"] == "UpdateSaccoPersonnel":
        errors, sacco_personnel = sacco_personnel_utils.update_sacco_personnel(request.data, request.user)
        if sacco_personnel:
            serializer =serializers.SaccoPersonnelSerializer(sacco_personnel,many=False).data
            return custom_success_message(0, "Sacco personnel sucessfully updated",serializer,"vehicle")
        else:
            return custom_errors_response(1, "Crew member not be updated", errors)
    elif request.data["action"] == "GetSaccoPersonnel":
        sacco_personnel = sacco_personnel_utils.get_sacco_personnel(
            request.user
        )
        if sacco_personnel:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(sacco_personnel, request)
            serializer = serializers.SaccoPersonnelSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No sacco personnel were retrieved", [])
    elif request.data["action"] == "GetSaccoPersonnelByOwner":
        sacco_personnel = sacco_personnel_utils.get_sacco_personnel_by_owner(
            request.user
        )
        if sacco_personnel:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(sacco_personnel, request)
            serializer = serializers.SaccoPersonnelSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No sacco personnel were retrieved", [])
    elif request.data["action"] == "GetSaccoDrivers":
        sacco_drivers = sacco_personnel_utils.get_sacco_drivers(
            request.user
        )
        if sacco_drivers:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(sacco_drivers, request)
            serializer = serializers.SaccoPersonnelSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No sacco personnel were retrieved", [])
    elif request.data["action"] == "CreateSaccoSubscriptionPayment":
        errors, sacco_subscription_payment = sacco_personnel_utils.create_sacco_subscription_payment(request.data, request.user)
        if sacco_subscription_payment:
            serializer =serializers.SaccoSubscriptionPaymentSerializer(sacco_subscription_payment,many=False).data
            return custom_success_message(0, "Sacco subscription payment sucessfully created",serializer,"sacco_subscription_payment")
        else:
            return custom_errors_response(1, "Sacco subscription payment not be created", errors)  
    elif request.data["action"] == "GetSaccoProfile":
        sacco_personnel_profile = sacco_personnel_utils.get_sacco_personnel_profile(request.user)
        if sacco_personnel_profile:
            serializer =serializers.SaccoPersonnelDisplaySerializer(sacco_personnel_profile,many=False).data
            return custom_success_message(0, "Sacco profile retrieved",serializer,"sacco_personnel_profile")
        else:
            return custom_errors_response(1, "Sacco profile not be retrieved", [])  
    elif request.data["action"] == "CreateOperationalRoute":
        errors, route = route_utils.create_operational_route(request.data, request.user)
        if route:
            serializer =serializers.OperationRoutesSerializer(route,many=False).data
            return custom_success_message(0, "Route sucessfully created",serializer,"route")
        else:
            return custom_errors_response(1, "Route could not be created", errors)
    elif request.data["action"] == "UpdateOperationalRoute":
        errors, route = route_utils.update_operational_route(request.data, request.user)
        if route:
            serializer =serializers.OperationRoutesSerializer(route,many=False).data
            return custom_success_message(0, "Route sucessfully updated",serializer,"route")
        else:
            return custom_errors_response(1, "Route could not be updated", errors)
    
    elif request.data["action"] == "CreateSingleTicket":
        errors, ticket = transport_utils.create_single_ticket(request.data, request.user)
        if ticket:
            return custom_plain_response(0, "Ticket sucessfully created","")
        else:
            return custom_errors_response(1, "Ticket could not be created", errors)
    elif request.data["action"] == "CreateBatchedTickets":
        errors, tickets, reference = transport_utils.create_batched_tickets(request.data, request.user)
        if tickets:
            return custom_plain_response(
                0,
                "Tickets sucessfully created",reference
            )
        else:
            return custom_errors_response(1, "Tickets not created", errors)
    elif request.data["action"] == "JambopayAuthorizeTransaction":
        errors, response = transport_utils.jp_authorize_transaction(request.data)
        if response:
            return custom_plain_response(
                0,
                "OTP verified sucessfuly",""
            )
        else:
            return custom_errors_response(1, "OTP not verified", errors)
    elif request.data["action"] == "GetEntityTicketCount":
        count = transport_utils.get_entity_ticket_count(request.data, request.user)
        if count:
            return custom_count_response(
                0,
                "Count retrieved succesfully",
                count
            )
        else:
            return custom_count_response(1, "No tickets", 0)
    elif request.data["action"] == "GetUserTickets":
        user_tickets = transport_utils.get_user_tickets(request.user, request.data)
        if user_tickets:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(user_tickets, request)
            serializer = serializers.TicketsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No tickets were retrieved", [])
    elif request.data["action"] == "GetUserTicketsById":
        user_tickets = transport_utils.get_user_tickets_by_id(request.data)
        if user_tickets:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(user_tickets, request)
            serializer = serializers.TicketsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No tickets were retrieved", [])
    elif request.data["action"] == "GetEntityTickets":
        user_tickets = transport_utils.get_entity_tickets(request.user, request.data)
        if user_tickets:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(user_tickets, request)
            serializer = serializers.TicketsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No tickets were retrieved", [])
    elif request.data["action"] == "GetEntityTicketPayments":
        user_ticket_payments = transport_utils.get_entity_ticket_payments(request.user, request.data)
        if user_ticket_payments:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(user_ticket_payments, request)
            serializer = serializers.TicketPaymentSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No tickets payments were retrieved", [])
    elif request.data["action"] == "GetEntityTicketPaymentSettlements":
        ticket_payment_settlements = transport_utils.get_entity_ticket_payment_settlements(request.user, request.data)
        if ticket_payment_settlements:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(ticket_payment_settlements, request)
            serializer = serializers.TicketPaymentSettlementSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No tickets payment settlements were retrieved", [])
    elif request.data["action"] == "GenerateReferenceNumber":
        """Get all entities for admin users"""
        entity = None
        if request.data["entity_id"]:
            entity_id = request.data["entity_id"]
            entity = authentication_models_validators.validate_entity(entity_id)
            if entity:
                sequence = utils.generate_reference_number(entity, request.user)
                if sequence:
                    return Response(
                        data={
                            "reference_number": sequence,
                        },
                        status=status.HTTP_200_OK,
                    )
        else:
            raise exceptions.ValidationError("Entity ID is required")
    elif request.data["action"] == "GenerateBatchReferenceNumbers":
        """Get all entities for admin users"""

        sequences = utils.generate_batch_reference_number(request.data, request.user)
        if sequences:
            return JsonResponse(
                {
                    "response_code": 0,
                    "response_message": "References succesfully generated",
                    "reference_numbers": sequences,
                }
            )
        else:
            return custom_errors_response(1, "References not retrieved", [])
    elif request.data["action"] == "GetPaymentMethods":
        payment_methods = transport_utils.get_payment_methods()
        if payment_methods:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(payment_methods, request)
            serializer = PaymentMethodsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No routes retrieved", [])
    elif request.data["action"] == "GetSaccoSubscriptions":
        vehicle_subscriptions = transport_utils.get_vehicle_subscriptions(request.user)
        if vehicle_subscriptions:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vehicle_subscriptions, request)
            serializer = serializers.SaccoSubscriptionSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No subscriptions retrieved", [])
    elif request.data["action"] == "CreateVehicleSubscriptionPayment":
        errors, subscription_payment = vehicle_utils.create_vehicle_subscription_payment(request.data,request.user)
        if subscription_payment:
            serializer =serializers.SaccoSubscriptionPaymentSerializer(subscription_payment,many=False).data
            return custom_success_message(0, "Sacco subscription payment sucessfully updated",serializer,"subscription")
        else:
            return custom_errors_response(1, "Sacco subscription payment  not be created", errors)
    elif request.data["action"] == "GetSaccoSubscriptionPayments":
        vehicle_subscription_payments = transport_utils.get_vehicle_subscription_payments(request.user)
        if vehicle_subscription_payments:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vehicle_subscription_payments, request)
            serializer = serializers.SaccoSubscriptionPaymentSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No subscription payments retrieved", [])
    elif request.data["action"] == "CreateSaccoSubscription":
        errors, subscription = vehicle_utils.create_vehicle_sacco_subscription(request.data,request.user)
        if subscription:
            
            serializer =serializers.SaccoSubscriptionSerializer(subscription,many=False).data
            return custom_success_message(0, "Sacco subscription  sucessfully updated",serializer,"subscription")
        else:
            return custom_errors_response(1, "Sacco subscription could not be created", errors)
    elif request.data["action"] == "UpdateSaccoSubscription":
        errors, subscription = vehicle_utils.update_vehicle_sacco_subscription(request.data,request.user)
        if subscription:
            
            serializer =serializers.SaccoSubscriptionSerializer(subscription,many=False).data
            return custom_success_message(0, "Sacco subscription  sucessfully updated",serializer,"subscription")
        else:
            return custom_errors_response(1, "Sacco subscription could not be created", errors)
    elif request.data["action"] == "CreateTrip":
        errors, trip = trip_utils.create_trip(request.data,request.user)
        if trip:
            
            serializer =serializers.TripSerializer(trip,many=False).data
            return custom_success_message(0, "Trip  sucessfully created",serializer,"trip")
        else:
            return custom_errors_response(1, "Trip could not be created", errors)
    elif request.data["action"] == "UpdateTrip":
        errors, trip = trip_utils.update_trip(request.data,request.user)
        if trip:
            
            serializer =serializers.TripSerializer(trip,many=False).data
            return custom_success_message(0, "Trip  sucessfully updated",serializer,"trip")
        else:
            return custom_errors_response(1, "Trip could not be updated", errors)
    elif request.data["action"] == "GetCurrentTrip":
        errors, trip = trip_utils.get_current_trip(request.data,request.user)
        if trip:
            
            serializer =serializers.TripSerializer(trip,many=False).data
            return custom_success_message(0, "Trip  sucessfully retrieved",serializer,"current_trip")
        else:
            return custom_errors_response(1, "Trip could not be retrieved", errors)
    elif request.data["action"] == "GetTripDetails":
        errors, trip = vehicle_utils.get_trip_details(
            request.data
        )
        if trip:
            serializer =serializers.TripSerializer(trip,many=False).data
            return custom_success_message(0, "Trip sucessfully retrieved",serializer,"trip")
        else:
            return custom_errors_response(1, "Trip not retrieved", errors)
    elif request.data["action"] == "GetEntityTrips":
        trips = trip_utils.get_entity_trips(request.user, request.data)
        if trips:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(trips, request)
            serializer = serializers.TripSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No trips were retrieved", [])
    elif request.data["action"] == "SearchEntityTripsByVehicle":
        errors, trips = trip_utils.search_entity_trips_by_vehicle(request.data, request.user)
        if trips:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(trips, request)
            serializer = serializers.TripSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No trips were retrieved", errors)
    elif request.data["action"] == "SearchEntityTrips":
        trips = trip_utils.search_entity_trips(request.user, request.data)
        if trips:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(trips, request)
            serializer = serializers.TripSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No entity trips were retrieved",[])
    elif request.data["action"] == "SearchAllTrips":
        trips = trip_utils.search_all_trips(request.user, request.data)
        if trips:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(trips, request)
            serializer = serializers.TripSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No trips were retrieved",[])
    elif request.data["action"] == "GetSaccoSettlementAccounts":
        sacco_settlement_accounts = transport_utils.get_sacco_settlement_accounts(request.user)
        if sacco_settlement_accounts:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(sacco_settlement_accounts, request)
            serializer = serializers.SaccoSettlementAccountsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No settlement accounts retrieved", [])
    elif request.data["action"] == "CreateSaccoSettlementAccount":
        errors, sacco_settlement_account = transport_utils.create_sacco_settlement_account(request.data,request.user)
        if sacco_settlement_account:
            
            serializer =serializers.SaccoSettlementAccountsSerializer(sacco_settlement_account,many=False).data
            return custom_success_message(0, "Sacco settlement account  sucessfully created",serializer,"settlement_account")
        else:
            return custom_errors_response(1, "Payout account could not be created", errors)
    elif request.data["action"] == "UpdateSaccoSettlementAccount":
        errors, sacco_settlement_account = transport_utils.update_sacco_settlement_account(request.data,request.user)
        if sacco_settlement_account:
            
            serializer =serializers.SaccoSettlementAccountsSerializer(sacco_settlement_account,many=False).data
            return custom_success_message(0, "Settlement sucessfully updated",serializer,"sacco_settlement_account")
        else:
            return custom_errors_response(1, "Settlement account could not be updated", errors)
    elif request.data["action"] == "GetVehicleWalletSettlements":
        errors, vehicle_wallet_settlements = transport_utils.get_vehicle_wallet_settlements(request.data,request.user)
        if vehicle_wallet_settlements:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vehicle_wallet_settlements, request)
            serializer = serializers.TicketPaymentSettlementSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No vehicle wallet settlements retrieved", [])
    elif request.data["action"] == "GetVehicleWalletBalance":
        errors, balance = transport_utils.get_vehicle_wallet_balance(request.data, request.user)
        if balance:
            return custom_json_response(0,"Balance retrieved", "balance", balance)
        else:
            return custom_errors_response(1, "Balance not retrieved", errors)
    elif request.data["action"] == "GetVehicleConductor":
        errors, conductor = transport_utils.get_vehicle_conductor(request.data, request.user)
        if conductor:
            serializer =serializers.SaccoPersonnelSerializer(conductor,many=False).data
            return custom_success_message(0, "Conductor sucessfully retrieved",serializer,"conductor")
        else:
            return custom_errors_response(1, "Conductor details not retrieved", errors)
    elif request.data["action"] == "GetVehicleDriver":
        errors, driver = transport_utils.get_vehicle_driver(request.data, request.user)
        if driver:
            serializer =serializers.SaccoPersonnelSerializer(driver,many=False).data
            return custom_success_message(0, "Driver sucessfully retrieved",serializer,"conductor")
        else:
            return custom_errors_response(1, "Driver details not retrieved", errors)
    elif request.data["action"] == "VehicleCollectionToAirtel":
        errors, collection_to_airtel = transport_utils.vehicle_collection_to_airtel(request.data, request.user)
        if collection_to_airtel:
            return custom_json_response(0,"Collection payout to Airtel Money successful", "collection_to_airtel", collection_to_airtel)
        else:
            return custom_errors_response(1, "Collection payout to Airtel Money failed", errors)
    elif request.data["action"] == "VehicleCollectionToMpesa":
        errors, collection_to_mpesa = transport_utils.vehicle_collection_to_mpesa(request.data, request.user)
        if collection_to_mpesa:
            return custom_json_response(0,"Collection payout to mpessa successful", "collection_to_mpesa", collection_to_mpesa)
        else:
            return custom_errors_response(1, "Collection payout to mpesa not sucessful", errors)
    elif request.data["action"] == "VehicleCollectionToBank":
        errors, collection_to_bank = transport_utils.vehicle_collection_to_bank(request.data, request.user)
        if collection_to_bank:
            return custom_json_response(0,"Collection payout to bank successful", "collection_to_bank", collection_to_bank)
        else:
            return custom_errors_response(1, "Collection payout to bank not sucessful", errors)
    elif request.data["action"] == "VehicleCollectionToTill":
        errors, collection_to_till = transport_utils.vehicle_collection_to_till(request.data, request.user)
        if collection_to_till:
            return custom_json_response(0,"Collection payout to till successful", "collection_to_till", collection_to_till)
        else:
            return custom_errors_response(1, "Collection payout to till not sucessful", errors)
    elif request.data["action"] == "VehicleCollectionToPaybill":
        errors, collection_to_paybill = transport_utils.vehicle_collection_to_paybill(request.data, request.user)
        if collection_to_paybill:
            return custom_json_response(0,"Collection payout to paybill successful", "collection_to_paybill", collection_to_paybill)
        else:
            return custom_errors_response(1, "Collection payout to till not sucessful", errors)
    elif request.data["action"] == "JambopayAuthorizePayout":
        errors, collection_to_mpesa = transport_utils.jp_authorize_payout(request.data)
        if collection_to_mpesa:
            return custom_json_response(0,"Balance retrieved", "collection_to_mpesa", collection_to_mpesa)
        else:
            return custom_errors_response(1, "Collection payout to mpesa not sucessful", errors)
    elif request.data["action"] == "CheckJambopayTransactionStatus":
        errors, jambopay_transaction_status = transport_utils.check_jambopay_transaction_status(request.data)
        if jambopay_transaction_status:
            return custom_json_response(0,"Transaction status retrieved", "jambopay_transaction_status", jambopay_transaction_status)
        else:
            return custom_errors_response(1, "Transaction status not retrieved", errors)
    elif request.data["action"] == "GetAllBanks":
        """Get all banks"""

        payment_methods = models.PaymentServicesProvider.objects.filter(psp_type="BANK").all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(payment_methods, request)
        serializer = PaymentServicesProviderSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityTransferPoints":
        """Get all towns"""

        transfer_points = transfers_utils.get_entity_transfer_points(request.user, request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(transfer_points, request)
        serializer = serializers.TransferPointsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetCityTransferPoints":
        """Get all towns"""

        city_transfer_points = transfers_utils.get_entity_city_transfer_points(request.user, request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(city_transfer_points, request)
        serializer = serializers.TransferPointsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateTransferBooking":
        errors, transfer_point = transfers_utils.create_transfer_booking(request.data, request.user)
        if transfer_point:
            serializer = serializers.TransferBookingsSerializer(
                transfer_point, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Transfer booking created successfully", serializer.data, "transfer_booking"
            )

        else:
            return custom_errors_response(1, "Transfer booking not created", errors)
    elif request.data["action"] == "CreateJourneyBooking":
        errors, journey_booking = bus_utils.create_journey_booking(request.data, request.user)
        if journey_booking:
            serializer = serializers.JourneyBookingsSerializer(
                journey_booking, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Journey booking created successfully", serializer.data, "journey_booking"
            )

        else:
            return custom_errors_response(1, "Transfer booking not created", errors)
    elif request.data["action"] == "CreateTransferPoint":
        errors, transfer_point = transport_utils.create_transfer_point(request.data, request.user)
        if transfer_point:
            serializer = serializers.TransferPointsSerializer(
                transfer_point, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Transfer point created successfully", serializer.data, "transfer_point"
            )

        else:
            return custom_errors_response(1, "Transfer point not created", errors)
    elif request.data["action"] == "UpdateTransferPoint":
        errors, transfer_point = transport_utils.update_transfer_point(request.data, request.user)
        if transfer_point:
            serializer = serializers.TransferPointsSerializer(
                transfer_point, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Transfer point updated successfully", serializer.data, "transfer_point"
            )

        else:
            return custom_errors_response(1, "Transfer point not created", errors)
    elif request.data["action"] == "GetAllTransfers":
        """Get all towns"""

        transfers = transfers_utils.get_entity_transfers(request.user, request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(transfers, request)
        serializer = serializers.TransfersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateTransfer":
        errors, transfer_point = transport_utils.create_transfer(request.data, request.user)
        if transfer_point:
            serializer = serializers.TransfersSerializer(
                transfer_point, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Transfer created successfully", serializer.data, "transfer"
            )

        else:
            return custom_errors_response(1, "Transfer not created", errors)
    elif request.data["action"] == "UpdateTransfer":
        errors, transfer_point = transport_utils.update_transfer(request.data, request.user)
        if transfer_point:
            serializer = serializers.TransfersSerializer(
                transfer_point, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Transfer updated successfully", serializer.data, "transfer"
            )

        else:
            return custom_errors_response(1, "Transfer not created", errors)
    elif request.data["action"] == "GetAllTransferBookings":
        """Get all transfer bookings"""

        transfer_bookings = transfers_utils.get_transfer_bookings(request.user, request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(transfer_bookings, request)
        serializer = serializers.TransferBookingsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllJourneyBookings":
        """Get all journey bookings"""

        journey_bookings = bus_utils.get_journey_bookings(request.user, request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(journey_bookings, request)
        serializer = serializers.JourneyBookingsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllJourneys":
        """Get all transfer bookings"""

        journeys = models.Journies.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(journeys, request)
        serializer = serializers.JourniesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "CreateJourney":
        errors, journey = transport_utils.create_journey(request.data, request.user)
        if journey:
            serializer = serializers.JourniesSerializer(
                journey, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Journey created successfully", serializer.data, "journey"
            )

        else:
            return custom_errors_response(1, "Transfer booking not created", errors)
    elif request.data["action"] == "UpdateJourney":
        errors, journey = transport_utils.update_journey(request.data, request.user)
        if journey:
            serializer = serializers.JourniesSerializer(
                journey, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Journey updated successfully", serializer.data, "journey"
            )

        else:
            return custom_errors_response(1, "Journey not updated", errors)
    else:
        return custom_errors_response(1, "Supplied action is unknown", [])


class LoginAPIView(generics.GenericAPIView):
    def get_serializer_class(self):
        return super().get_serializer_class()

    def post(self, request):
        current_employment = None
        phone_or_email = request.data.get("phone_or_email")
        password = request.data.get("password")
        user = authenticate(phone_or_email=phone_or_email, password=password)
        roles = []

        if user:
            # Retrieve only roles a user is currently assigned to and append to the login payload

            if user.is_staff:
                role = Roles.objects.filter(value="ADMIN").first()
                roles.append(role)

            else:
                user_roles = user.roles.all().filter(entity=user.entity)
                for user_role in user_roles:
                    roles.append(user_role)
                role = Roles.objects.filter(value="CLIENT").first()
                roles.append(role)

            login(request, user)
            decodeJTW = jwt.decode(
            user.tokens()["access"], config("SECRET_KEY"), algorithms=["HS256"]
                
            )

            return JsonResponse(
                data={
                    "tokens": user.tokens(),
                    "expires":decodeJTW['exp'],
                    "response_code": 0,
                    "response_message": "Log in was succesful",
                    "user": UsersSerializer(
                        user, many=False, context={"request": request}
                    ).data
                    # "id": user.id,
                    # "email": user.email,
                    # "first_name": user.first_name,
                    # "last_name": user.last_name,
                    # "date_of_birth": user.date_of_birth,
                    # "phone": user.phone,
                    # "is_staff": user.is_staff,
                    # "is_verified": user.is_verified,
                    # "is_active": user.is_active,
                    # "entity": user.entity.id,
                    # "entity_title": user.entity.title,
                    # 'roles':  RolesSerializer(roles,  many=True).data,
                },
                status=status.HTTP_200_OK,
            )

        else:
            return JsonResponse(
                data={
                    "response_code": 1,
                    "response_message": "Invalid credentials",
                },
                status=status.HTTP_200_OK,
            )


class SubscriptionCreateAPIView(generics.GenericAPIView):
    """
    Create new entity
    """

    name = "entities-create"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.SaccoSubscriptionSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        # Assign super admin roles
        banners = request.FILES.getlist("banners")




        if len(banners) > 0:
            serializer_context = {"request": request, "subscription": self.request.user}

            serializer = serializers.SaccoSubscriptionSerializer(data=request.data, context=serializer_context)
            serializer.is_valid(raise_exception=   True)
            if serializer.is_valid(raise_exception=True):
                serializer.save(
                    owner=request.user,
                    entity=request.user.entity
                )
                subscription = models.SaccoSubscription.objects.get(id=serializer.data["id"])

                errors_messages = []

                uploaded_banners = []

                if len(banners) > 0:
                    for image in banners:
                        content = models.SubscriptionBanners.objects.create(
                            owner=request.user, image=image, subscription=subscription
                        )
                        uploaded_banners.append(content)

                    subscription.banners.add(*uploaded_banners)
                    context = serializer.data
                    context["banners"] = [image.id for image in uploaded_banners]

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Subscription succesfully created",
                        "entity": serializer.data,
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )
            else:
                default_errors = serializer.errors  # default errors dict
                errors_messages = []
                for field_name, field_errors in default_errors.items():
                    for field_error in field_errors:
                        error_message = "%s: %s" % (field_name, field_error)
                        errors_messages.append(error_message)

                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Subscription not created",
                        "entity": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            serializer_context = {"request": request, "user": self.request.user}
            serializer = serializers.SaccoSubscriptionSerializer(data=request.data, context=serializer_context)
            serializer.is_valid(raise_exception=   True)
            if serializer.is_valid(raise_exception=True):
                subscription = None
                serializer.save(
                    owner=request.user,
                    entity=request.user.entity
                )
                # Retrieve created entity
                subscription = models.SaccoSubscription.objects.get(id=serializer.data["id"])

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Subscription succesfully created",
                        "entity": serializer.data,
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )
            else:
                default_errors = serializer.errors  # default errors dict
                errors_messages = []
                for field_name, field_errors in default_errors.items():
                    for field_error in field_errors:
                        error_message = "%s: %s" % (field_name, field_error)
                        errors_messages.append(error_message)
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Subscription not created",
                        "entity": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )



class SubscriptionUpdate(generics.RetrieveUpdateAPIView):

    """
    Subscription update
    """

    name = "subscription-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.SaccoSubscriptionSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.SaccoSubscription.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update subscription with new banners
        """
        banners = request.FILES.getlist("banners")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = serializers.SaccoSubscriptionSerializer(instance, context=serializer_context)
        if banners and len(banners) > 0:
            uploaded_banners = []
            for file in banners:
                content = models.SubscriptionBanners.objects.create(
                    owner=request.user, banner=file, entity=request.user.entity, subscription=instance
                )
                uploaded_banners.append(content)

            print("uploaded banners", uploaded_banners)

            instance.banners.add(*uploaded_banners)
            context = serializer.data
            context["banners"] = [file.id for file in uploaded_banners]

        instance = self.get_object()
        serializer_context = {
            "request": request,
        }

        data = request.data


        if data.get("description", None):
            instance.description = data.get("description", None)
            instance.save()
        else:
            print("Not changed")
            pass

        instance.save()

        return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj
    

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def bodabodaAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetBodaTrips":
        """Get all trips for boda"""

        boda_trips = boda_utils.get_bodaboda_trips(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(boda_trips, request)
        serializer = serializers.BodabodaTripsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    
    elif request.data["action"] == "CreateBodabodaTrip":
        errors, trip = boda_utils.create_bodaboda_trip(request.data, request.user)
        if trip:
            serializer = serializers.BodabodaTripsSerializer(
                trip, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Bodaboda trip created successfully", serializer.data, "trip"
            )

        else:
            return custom_errors_response(1, "Boda boda trip not created", errors)
    elif request.data["action"] == "UpdateBodabodaTrip":
        errors, trip = boda_utils.update_bodaboda_trip(request.data, request.user)
        if trip:
            serializer = serializers.BodabodaTripsSerializer(
                trip, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Bodaboda trip updated successfully", serializer.data, "trip"
            )

        else:
            return custom_errors_response(1, "Boda boda trip not updated", errors)
    
    else:
        return custom_errors_response(1, "Supplied action is unknown", [])