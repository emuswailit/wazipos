
from django.db import IntegrityError, transaction
from authentication.validators.authentication_models_validators import validate_user
from core.date_utils import get_formatted_from_date, get_formatted_to_date, get_today_date
from transport.models import Trip
from .. import models
from transport.transport_validators import validate_destination, validate_route, validate_trip, validate_vehicle, validate_sacco_vehicle
from rest_framework import exceptions
from django.db.models import Q
from core.date_utils import date_is_past,date_input_is_today, time_is_past_for_today


def create_trip(data,user):
    errors=[]
    vehicle =None
    departure_time=""
    departure_date=""
    expected_arrival_date=""
    expected_arrival_time=""
    is_active="true"
    if not "trip_details" in data:
        errors.append("Trip details are required")
        return errors,None
    if not "vehicle" in data["trip_details"] or data["trip_details"]["vehicle"]=="":
        errors.append("Vehicle ID is required")
    else:
        vehicle= validate_vehicle( data["trip_details"]["vehicle"])
    if not "route" in data["trip_details"] or data["trip_details"]["route"]=="":
        errors.append("Route ID is required")
    else:
        route= validate_route( data["trip_details"]["route"])

    if not "departure_date" in data["trip_details"] or data["trip_details"]["departure_date"]=="":
        errors.append("Departure date is required")
    else:
        departure_date= data["trip_details"]["departure_date"]
        print("date is past", date_is_past(departure_date))
        print("date is today", date_input_is_today(departure_date))
        if date_is_past(departure_date):
            errors.append(f"{departure_date} is in the past")
            return errors, None
        
    
    if not "departure_time" in data["trip_details"] or data["trip_details"]["departure_time"]=="":
        errors.append("Departure time is required")
    else:
        departure_time= data["trip_details"]["departure_time"]
        print("Dep time", departure_time)
        if date_input_is_today(departure_date):
            """Check if date is today"""
            print("Time is past", time_is_past_for_today(departure_time))
            if time_is_past_for_today(departure_time):
                """Check if time entered is passed for today"""
                errors.append(f"{departure_time} is past for today")
                return errors, None
                
    

    if  "is_active" in data["trip_details"]:
        is_active= data["trip_details"]["is_active"]

   
   
    # if not "expected_arrival_time" in data["trip_details"]:
    #     errors.append("Expected arrival  time is required")
    # else:
    #     expected_arrival_time= data["trip_details"]["expected_arrival_time"]
        
    if len(errors)>0:
        return errors, None
    else:
        try:
            # Close any open trips for vehicle
            if Trip.objects.filter(vehicle = vehicle,is_active="true").exists():
                active_trips = Trip.objects.filter(vehicle = vehicle,is_active="true").all()
            
                for trip in active_trips:
                    print("Active trip", trip)
                    print("Active trip", trip.is_active)
                    trip.is_active="false"
                    trip.save()
                    print("Active trip", trip.is_active)
            # Create new trip
            try:
                created = Trip.objects.create(
                    entity=user.entity,
                    owner=user,
                    departure_date=departure_date,
                    departure_time=departure_time,
                    vehicle=vehicle,
                    route=route,
                    is_active=is_active
                )

                if created:
                    return [], created
                else:
                    errors.append("Trip could not be created")
                    return errors, None
            except Exception as e:
                errors.append(str(e))
                return errors, None
        except IntegrityError as e:
            raise exceptions.ValidationError(f"Trip for {vehicle.registration} slated for date {departure_date} departing at {departure_time} already  exists")

def get_current_trip(data,user):
    errors=[]
    vehicle= None
    vehicle_id=""
    trip = None
    registration_id=None
    if not "registration" in data or data["registration"] =="":
        errors.append("Vehicle registration number is required")
        return errors, None
    else:
        registration_id=data["registration"]
        vehicle = validate_sacco_vehicle(registration_id, user)

    if vehicle:
        if Trip.objects.filter(vehicle=vehicle, is_active="true").exists():
            trip = Trip.objects.filter(vehicle=vehicle, is_active="true").first()
        
    return [], trip
        
@transaction.atomic
def update_trip(data, user):
    errors =[]
    title=""
    trip_id=""
    trip =None
    vehicle =None
    description =""
    departure_date=""
    if not "trip_details" in data:
        errors.append("Trip details are required")
        return errors,None
    
    if not "trip_id" in data["trip_details"] or data["trip_details"]["trip_id"]=="":
         errors.append("Trip ID are required")
         return errors, None
    else:
        trip = validate_trip( data["trip_details"]["trip_id"])

    if "vehicle" in  data["trip_details"]:
        vehicle =validate_vehicle(data["trip_details"]["vehicle"])
        trip.vehicle=vehicle
        trip.save()

    if "departure_date" in  data["trip_details"]:
        departure_date =data["trip_details"]["departure_date"]
        trip.departure_date=departure_date
        trip.save()

    if "departure_time" in  data["trip_details"]:
        departure_time =data["trip_details"]["departure_time"]
        trip.departure_time=departure_time
        trip.save()

    if "is_active" in  data["trip_details"]:
        is_active =data["trip_details"]["is_active"]
        trip.is_active=is_active
        trip.save()

    return [],trip

def get_entity_trips(user, data):


    qs = models.Trip.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by('-created')

   
    return qs

def search_entity_trips_by_vehicle(data, user):
    errors=[]
    vehicle=""
    vehicle_id=""
    if not "registration" in data or data["registration"] =="":
        errors.append("Vehicle registration number is required")
        return errors, None
    else:
        vehicle_id = data["registration"].upper()
        if models.Vehicles.objects.filter(registration=vehicle_id.upper()).exists():
            vehicle=models.Vehicles.objects.filter(registration=vehicle_id.upper()).first()
        else:
           errors.append("No vehicle found with provided registration number")
           return errors,None
    
    if models.Trip.objects.filter(vehicle=vehicle, departure_date__gte=get_today_date(),is_active="true").exists():
        return  [], models.Trip.objects.filter(vehicle=vehicle, departure_date__gte=get_today_date(),is_active="true")
    else:
        return [],None

def search_entity_trips(user, data):
    errors =[]
    destination=None
    qs=[]
    if not "destination_id" in data:
        raise exceptions.ValidationError("Destination ID is required")
    else:
        destination =validate_destination(data["destination_id"])

    print("DEST",destination)
    if destination:
        if models.Trip.objects.filter(
                route=destination.route,
            ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).exists():
            return  models.Trip.objects.filter(
                    route=destination.route,
                ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all()

        
        else:
            return []
    else: 
        return []
    
  
def search_all_trips(user, data):
    errors =[]
    destination=None
    qs=[]
    if not "destination_id" in data:
        raise exceptions.ValidationError("Destination ID is required")
    else:
        destination =validate_destination(data["destination_id"])

    print("DEST",destination)
    if destination:
        if models.Trip.objects.filter(
                route=destination.route,
            ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).exists():
            return  models.Trip.objects.filter(
                    route=destination.route,
                ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all()

        
        else:
            return []
    else: 
        return []


