from .. import models
from django.db import IntegrityError, transaction
from ..transport_validators import validate_destination, validate_route
from rest_framework import exceptions

@transaction.atomic
def create_destination(data, user):
    errors =[]
    title=""
    description =""
    route_id=""
    destination_from=""
    destination_to=""
    destination=None
    fare_peak=0.00
    fare=0.00
    route =None
    if not "destination_details" in data:
        errors.append("Destination details are required")
        return errors,None

    if not "destination_from" in data["destination_details"] or data["destination_details"]["destination_from"]=="":
         errors.append("Destination from is required")
    else:
        destination_from =  data["destination_details"]["destination_from"]

    if not "destination_to" in data["destination_details"] or data["destination_details"]["destination_to"]=="":
         errors.append("Destination to is  required")
    else:
        destination_to =  data["destination_details"]["destination_to"]
    
    if not "fare_peak" in data["destination_details"] or data["destination_details"]["fare_peak"]=="":
         errors.append("Fare is  required")
    else:
        fare_peak =  float(data["destination_details"]["fare_peak"])

    if not "fare" in data["destination_details"] or data["destination_details"]["fare"]=="":
         errors.append("Fare is  required")
    else:
        fare =  float(data["destination_details"]["fare"])
    
    if not "route_id" in data["destination_details"] or data["destination_details"]["route_id"]=="":
         errors.append("Route ID is required")
    else:
        route_id =  data["destination_details"]["route_id"]
        route = validate_route(route_id)

    if "description" in  data["destination_details"]:
        description=data["destination_details"]["description"]

    if len(errors)>0:
        return errors, None
    else:
        try:
            destination = models.Destinations.objects.create(
                destination_from=destination_from, 
                destination_to=destination_to, 
                description=description, 
                entity=user.entity,owner=user,
                route=route,
                fare_peak=fare_peak,
                fare=fare
                )
            return [], destination
        except IntegrityError as e:
            raise exceptions.ValidationError(f"Destination from {destination_from} to {destination_to} already  exists for {route} route")

@transaction.atomic
def update_destination(data, user):
    errors =[]
    title=""
    destination_id=""
    route =None
    description =""
    if not "destination_details" in data:
        errors.append("Destination details are required")
        return errors,None
    
    if not "destination_id" in data["destination_details"] or data["destination_details"]["destination_id"]=="":
         errors.append("Destination ID are required")
         return errors, None
    else:
        destination = validate_destination( data["destination_details"]["destination_id"])

    if "destination_from" in  data["destination_details"]:
        destination_from=data["destination_details"]["destination_from"]
        destination.destination_from=destination_from
        destination.save()

    if "destination_to" in  data["destination_details"]:
        destination_to=data["destination_details"]["destination_to"]
        destination.destination_to=destination_to
        destination.save()


    if "route_id" in  data["destination_details"]:
        # Ensure route exists
        route=validate_route(data["destination_details"]["route_id"])
        destination.route=route
        destination.save()

    if "description" in  data["destination_details"]:
        description=data["destination_details"]["description"]
        destination.description=description
        destination.save()

    if "fare" in  data["destination_details"]:
        fare=data["destination_details"]["fare"]
        destination.fare=fare
        destination.save()

    if "fare_peak" in  data["destination_details"]:
        fare_peak=data["destination_details"]["fare_peak"]
        destination.fare_peak=fare_peak
        destination.save()

    if len(errors)>0:
        return errors, None
    else:
        return [], destination
    


def get_entity_destinations(user):
    destinations = []
    if models.Destinations.objects.filter(entity=user.entity).exists():
        destinations = models.Destinations.objects.filter(entity=user.entity).all()
        return destinations
    else:
        return None
