from .. import models
from django.db import transaction
from ..transport_validators import validate_route

@transaction.atomic
def create_operational_route(data, user):
    errors =[]
    title=""
    description =""
    morning_peak_start =""
    morning_peak_end =""
    evening_peak_start =""
    evening_peak_end =""
    if not "route_details" in data:
        errors.append("Route details are required")
        return errors,None
    
    if not "title" in data["route_details"] or data["route_details"]["title"]=="":
         errors.append("Route title are required")
    else:
        title =  data["route_details"]["title"]

    if "morning_peak_start" in  data["route_details"]:
        morning_peak_start=data["route_details"]["morning_peak_start"]

    if "morning_peak_end" in  data["route_details"]:
        morning_peak_end=data["route_details"]["morning_peak_end"]


    if "evening_peak_start" in  data["route_details"]:
        evening_peak_start=data["route_details"]["evening_peak_start"]

    if "evening_peak_end" in  data["route_details"]:
        evening_peak_end=data["route_details"]["evening_peak_end"]

    if "description" in  data["route_details"]:
        description=data["route_details"]["description"]

    if len(errors)>0:
        return errors, None
    else:
        route = models.OperationRoutes.objects.create(title =title, morning_peak_start=morning_peak_start,morning_peak_end=morning_peak_end,evening_peak_start=evening_peak_start,evening_peak_end=evening_peak_end,
                                                      description=description, entity=user.entity,owner=user)
        return [], route

@transaction.atomic
def update_operational_route(data, user):
    errors =[]
    title=""
    route_id=""
    route =None
    description =""
    if not "route_details" in data:
        errors.append("Route details are required")
        return errors,None
    
    if not "route_id" in data["route_details"] or data["route_details"]["route_id"]=="":
         errors.append("Route ID are required")
         return errors, None
    else:
        route_id =  data["route_details"]["route_id"]
    
    route = validate_route(route_id)

    if "title" in  data["route_details"]:
        title=data["route_details"]["title"]
        route.title=title
        route.save()

    if "peak_start" in  data["route_details"]:
        peak_start=data["route_details"]["peak_start"]
        route.morning_peak_start=peak_start
        route.save()

    if "peak_end" in  data["route_details"]:
        peak_end=data["route_details"]["peak_end"]
        route.morning_peak_end=peak_end
        route.save()


    if "description" in  data["route_details"]:
        description=data["route_details"]["description"]
        route.description=description
        route.save()

    if len(errors)>0:
        return errors, None
    else:
        return [], route