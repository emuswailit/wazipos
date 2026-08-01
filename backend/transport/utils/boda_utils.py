from .. import models
from ..transport_validators import validate_sacco_personnel
from authentication.validators.authentication_models_validators import validate_user
from transport.models import SaccoPersonnel
from django.contrib.gis.geos import fromstr
from django.contrib.gis.measure import Distance
from core.date_utils import get_formatted_from_date, get_formatted_to_date
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from datetime import datetime

def get_bodaboda_trips(user):
    sacco_personnel= None
    boda_trips =[]
    data=None
    if models.SaccoPersonnel.objects.filter(user=user).exists():
        sacco_personnel = models.SaccoPersonnel.objects.filter(user=user).first()
    if sacco_personnel:
        if models.BodabodaTrips.objects.filter(boda=sacco_personnel,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).exists():
            boda_trips = models.BodabodaTrips.objects.filter(boda=sacco_personnel,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).all()
    return boda_trips

def create_bodaboda_trip(data,user):

    errors =[]
    trip =None
    entered_user = None
    destination = ""
    adults = 1
    children = 0
    sacco_personnel=None
    origin_latitude=None
    origin_longitude=None
    destination_latitude=None
    destination_longitude=None


    if not "boda" in data['trip'] or  data['trip']['boda']=="":
        errors.append("Bodaboda ID is required")
    else:
        entered_user=validate_user( data['trip']['boda'])
        print("entered_user",entered_user)

    if entered_user:
        if SaccoPersonnel.objects.filter(user=entered_user).exists():
            sacco_personnel=SaccoPersonnel.objects.filter(user=entered_user).first()

        else:
            errors.append("No sacco personnel")
    else:
        errors.append("No entered user")
    
    if not "destination" in data['trip'] or  data['trip']['destination']=="":
        errors.append("Destination is required")
    else:
        destination=data['trip']['destination']
    
    if not "origin" in data['trip'] or  data['trip']['origin']=="":
        errors.append("Origin is required")
    else:
        origin=data['trip']['origin']

    if not "origin_latlng" in data['trip'] or  data['trip']['origin_latlng']=="":
        errors.append("Origin coordinates are required")
    else:
        origin_latitude=data['trip']['origin_latlng']['latitude']
        origin_longitude=data['trip']['origin_latlng']['longitude']

    if not "destination_latlng" in data['trip'] or  data['trip']['destination_latlng']=="":
        errors.append("Destination coordinates are required")
    else:
        destination_latitude=data['trip']['destination_latlng']['latitude']
        destination_longitude=data['trip']['destination_latlng']['longitude']


    if not "adults" in data['trip'] or data['trip']['adults']=="":
        errors.append("Adults number is required")
    else:
        adults=data['trip']['adults']

    if not "children" in data['trip'] or  data['trip']['children']=="":
        errors.append("Children number is required")
    else:
        children=data['trip']['children']

    if not "luggage" in data['trip'] or  data['trip']['luggage']=="":
        errors.append("Luggage status is required")
    else:
        luggage=data['trip']['luggage']

    origin_point = fromstr(f"POINT({origin_longitude} {origin_latitude})", srid=4326)
    destination_point = fromstr(f"POINT({destination_longitude} {destination_latitude})", srid=4326)

    # Calculate the distance
    distance_obj = origin_point.distance(destination_point)

    distance_km = distance_obj*100
    print("Distance in km:", round(distance_km,2))
    fare = 50.00 + float(float(distance_km) * 18)  # Base fare of 50.00 and 18 per km
    
    
    if models.BodabodaTrips.objects.filter(boda=sacco_personnel,owner=user,is_cancelled="false",is_completed="false",origin_point=origin_point,destination_point=destination_point).exists():
            errors.append("You have an open trip with this boda boda")

    if len(errors)>0:
        return errors, None
    else:

        created = models.BodabodaTrips.objects.create(
            entity=entered_user.entity,
            owner=user,
            origin=origin,
            destination=destination,
            boda=sacco_personnel,
            adults=adults,
            children=children,
            distance=round(distance_km,2),
            fare=round(fare,2),
            origin_point=origin_point,
            destination_point=destination_point,
            luggage=luggage)

        return [],created
    



def update_bodaboda_trip(data,user):
    errors=[]
    trip = None
    if not "trip" in data or data['trip']=="":
        errors.append("Trip ID is required")
    else:
        if models.BodabodaTrips.objects.filter(id=data['trip']).exists():
            trip =models.BodabodaTrips.objects.filter(id=data['trip']).first()

    if "status" in data and not data['status']==None:
        trip.status=data['status']
        trip.save()

    if "fare" in data and not data['fare']==None:
        trip.fare=data['fare']
        trip.save()

    if "departure" in data and not data['departure']==None:
        trip.departure=data['departure']
        trip.save()

    if "arrival" in data and not data['arrival']==None:
        trip.arrival=data['arrival']
        trip.save()

    if "is_accepted" in data and not data['is_accepted']==None:
        trip.is_accepted=data['is_accepted']
        trip.save()

    if "is_declined" in data and not data['is_declined']==None:
        trip.is_declined=data['is_declined']
        trip.save()

    if "is_cancelled" in data and not data['is_cancelled']==None:
        trip.is_cancelled=data['is_cancelled']
        trip.save()

    if "is_started" in data and not data['is_started']==None:
        trip.is_started=data['is_started']
        trip.started_at = datetime.now() if trip.is_started == "true" else None
        trip.save()

    if "is_completed" in data and not data['is_completed']==None:
        trip.is_completed=data['is_completed']
        trip.completed_at = datetime.now() if trip.is_completed == "true" else None
        trip.save()

    channel_layer = get_channel_layer()
    group_name = f"user_{trip.boda.user.id}"  # Target specific user's group

    notification_data = {
        "type": "send_notification",  # Custom type for your consumer
        "adults": trip.adults,
        "is_accepted": trip.is_accepted,
        "is_declined": trip.is_declined,
        "is_cancelled": trip.is_cancelled,
        "is_completed": trip.is_completed,
        "is_delivery": trip.is_delivery,
        "children": trip.children,
        "destination": trip.destination,
        "origin": trip.origin,
        "fare": trip.fare,
        "origin": trip.origin,
        "distance": trip.distance,
        "boda": str(trip.boda.id),
        "boda_user": str(trip.boda.user.id),
        "id": str(trip.id),

    }

    async_to_sync(channel_layer.group_send)(group_name, notification_data)


    return  errors, trip

