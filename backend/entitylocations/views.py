import json
from utils.logging import create_log
from django.http import JsonResponse
from rest_framework.response import Response
from rest_framework import generics, permissions, status, exceptions
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser
from .models import Locations,BodaLocations,WifiLocations,PropertyLocations
from .serializers import LocationsSerializer,LocationsGeofeatureSerializer,BodaLocationsSerializer
from rest_framework.decorators import api_view, permission_classes, parser_classes
from django.contrib.gis.db.models.functions import Distance
from rest_framework.pagination import PageNumberPagination
from django.contrib.gis.geos import Point
from django.contrib.gis.geos import *
from core.responses import custom_success_message, custom_error_response
from core import app_permissions
from django.contrib.gis.geos import fromstr
from django.contrib.gis.measure import D
from retailers.models import RetailerReceipts
from retailers.serializers import RetailerReceiptsSerializer
from authentication.models import Entities
from transport.models import SaccoPersonnel
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from authentication.validators.authentication_models_validators import (
    validate_entity,
    verify_category_exists,
    validate_user
)
from products.validators.product_models_validator import validate_product
from transport.transport_validators import validate_sacco_personnel
from . import serializers
from properties.models import Property
@csrf_exempt
def locationsAPIView(request):
    if request.method == "GET":
        locations = Locations.objects.all()
        serializer = LocationsGeofeatureSerializer(locations, many=True)
        return JsonResponse(serializer.data, safe=False)
    elif request.method == "POST":
        data = JSONParser().parse(request)
        serializer = LocationsGeofeatureSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return JsonResponse(serializer.data, status=status.HTTP_201_CREATED)
        else:
            return JsonResponse(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
def locations_filters_api_view(request):
    stripped = 0.00
    stringified = 0.00
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetLocationsWithDistances":
        category = None

        """Retrieve body systems"""
        entities = []
        near_by = []
        print("request.data", request.data)

        latitude = request.data["coords"]["latitude"]
        longitude = request.data["coords"]["longitude"]
        # category_id = request.data["category"]
        # category = verify_category_exists(category_id)

        user_location = Point(longitude, latitude, srid=4326)
        
        dist = Distance("point", user_location)
       
        entities = (
            Locations.objects.filter()
            .annotate(distance=Distance("point", user_location))
            .order_by("distance")
        )
        for loc in entities:
            print("LOC",loc.point)
           
            if loc.distance:
                loc.point=fromstr(loc.point)
                loc.farness = loc.distance
                stringified = str(loc.farness)
                stripped = stringified.rstrip(stringified[-1])
                # loc.farness=stripped
                print("stripped", stripped)
                print("stringified", stringified)
                print("farness", loc.farness)
                if stripped:
                    farness_in_km = float(stripped) / float(1000.00)
                    loc.farness = round(farness_in_km, 2)

                else:
                    loc.farness = 0.00
                if float(loc.farness) <float(10.00):
                    near_by.append(loc)
                else:
                    pass

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(near_by, request)
        serializer = LocationsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    
    elif request.data["action"] == "GetAdjacentPharmacies":
        category = None

        """Retrieve adjacent pharmacies"""
        entities = []
        near_by = []
        print("request.data", request.data)

        latitude = request.data["coords"]["latitude"]
        longitude = request.data["coords"]["longitude"]
        # category_id = request.data["category"]
        # category = verify_category_exists(category_id)

        user_location = Point(longitude, latitude, srid=4326)
        
        dist = Distance("point", user_location)
       
        entities = (
            Locations.objects.filter( Q(entity__entity_type="PHARMACY"))
            .annotate(distance=Distance("point", user_location))
            .order_by("distance")
        )
        for loc in entities:
            print("LOC",loc.point)
           
            if loc.distance:
                loc.point=fromstr(loc.point)
                loc.farness = loc.distance
                stringified = str(loc.farness)
                stripped = stringified.rstrip(stringified[-1])
                # loc.farness=stripped
                print("stripped", stripped)
                print("stringified", stringified)
                print("farness", loc.farness)
                if stripped:
                    farness_in_km = float(stripped) / float(1000.00)
                    loc.farness = round(farness_in_km, 2)

                else:
                    loc.farness = 0.00
                #     if float(farness_in_km) <float(10.00):
                #         near_by.append(loc)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = LocationsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    
    if request.data["action"] == "GetRetailersWithDistancesSellingProduct":
        category = None

        """Retrieve products"""
        entities = []
        near_by = []
        all_receipts = []
        print("request.data", request.data)

        latitude = request.data["coords"]["latitude"]
        longitude = request.data["coords"]["longitude"]
        product_id = request.data["product"]
        print("product_id", product_id)
        product = validate_product(request.data["product"])
        print("product", product)


        user_location = Point(longitude, latitude, srid=4326)
        
        dist = Distance("point", user_location)
       
        entities = (
            Locations.objects.filter( Q(entity__entity_type="RETAIL"))
            .annotate(distance=Distance("point", user_location))
            .order_by("distance")
        )
        for loc in entities:
            print("LOC",loc.point)
            if loc.distance:
                loc.point=fromstr(loc.point)
                loc.farness = loc.distance
                stringified = str(loc.farness)
                stripped = stringified.rstrip(stringified[-1])
                # loc.farness=stripped
                print("stripped", stripped)
                print("stringified", stringified)
                print("farness", loc.farness)
                if stripped:
                    farness_in_km = float(stripped) / float(1000.00)
                    loc.farness = round(farness_in_km, 2)

                else:
                    loc.farness = 0.00  
            if loc.farness < 5.00:
           
                if RetailerReceipts.objects.filter(product=product, entity=loc.entity,current_unit_quantity__gte=1).exists():
                    all_receipts+= RetailerReceipts.objects.filter(product=product, entity=loc.entity,current_unit_quantity__gte=1).all()
                    # all_receipts.append(receipt)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(all_receipts, request)
        serializer = RetailerReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "GetAdjacentShopsByProduct":
        entities = []
        category = None

        """Retrieve shops that sell a product"""
        entities = []
        locations = []
        print("request.data", request.data)

        latitude = request.data["coords"]["latitude"]
        longitude = request.data["coords"]["longitude"]
        product_id = request.data["product"]
        product = validate_product(product_id)

        user_location = Point(longitude, latitude, srid=4326)
        dist = Distance("point", user_location)
        if RetailerReceipts.objects.filter(product=product).exists():
            retailer_receipts_for_product = RetailerReceipts.objects.filter(
                product=product
            ).all()

            for receipt in retailer_receipts_for_product:
                # Check if entity is already in the list if list has items
                if len(entities) > 0:
                    if receipt.entity in entities:
                        pass
                    else:
                        entities.append(receipt.entity)
                else:
                    # List is empty, just add item into it
                    entities.append(receipt.entity)
            if len(entities) > 0:
                for entity in entities:
                    if (
                        Locations.objects.filter(entity=entity)
                        .annotate(distance=Distance("point", user_location))
                        .exists()
                    ):
                        location = (
                            Locations.objects.filter(entity=entity)
                            .annotate(distance=Distance("point", user_location))
                            .order_by("distance")
                            .first()
                        )
                        locations.append(location)
                    else:
                        print(entity)

                if len(locations) > 0:
                    for loc in locations:
                        loc.point=fromstr(loc.point)
                        loc.farness = loc.distance
                        stringified = str(loc.farness)
                        stripped = stringified.rstrip(stringified[-1])
                        # loc.farness=stripped
                        print("stripped", stripped)
                        print("stringified", stringified)
                        print("farness", loc.farness)
                        if stripped:
                            farness_in_km = float(stripped) / float(1000.00)
                            loc.farness = round(farness_in_km, 2)

                        else:
                            loc.farness = 0.00
                    
                    
                    if len(locations) > 0:
                        paginator = PageNumberPagination()
                        page = paginator.paginate_queryset(locations, request)
                        serializer = LocationsSerializer(
                            page,
                            many=True,
                            context={"request": request, "user": request.user},
                        )
                        return paginator.get_paginated_response(serializer.data)
                    else:
                        return Response(
                            data={
                                "response_code": 1,
                                "response_message": "No shops retrieved",
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                else:
                    raise exceptions.ValidationError(
                        "No nearby entities selling this product"
                    )
            else:
                raise exceptions.ValidationError("No entities")
        else:
            raise exceptions.ValidationError("No receipts")
    elif request.data["action"] == "GetShopLocation":
        entities = []
        category = None

        """Get shop location"""
        entities = []
        locations = []
        validated_entity = None

        latitude = request.data["coords"]["latitude"]
        longitude = request.data["coords"]["longitude"]
        entity_id = request.data["entity"]
        entity = validate_entity(entity_id)

        user_location = Point(longitude, latitude, srid=4326)
        dist = Distance("point", user_location)
        if Entities.objects.filter(id=entity.id).exists():
            validated_entity = Entities.objects.filter(id=entity.id).first()

            if validated_entity:
                if (
                    Locations.objects.filter(entity=validated_entity)
                    .annotate(distance=Distance("point", user_location))
                    .order_by("distance")
                    .exists()
                ):
                    location = (
                        Locations.objects.filter(entity=validated_entity)
                        .annotate(distance=Distance("point", user_location))
                        .order_by("distance")
                        .first()
                    )
                    locations.append(location)
                else:
                    print(entity)

                if len(locations) > 0:
                    print("Ziko", locations)
                    for loc in locations:
                        loc.farness = loc.distance
                        if len(locations) > 0:
                            paginator = PageNumberPagination()
                            page = paginator.paginate_queryset(locations, request)
                            serializer = LocationsSerializer(
                                page,
                                many=True,
                                context={"request": request, "user": request.user},
                            )
                            return paginator.get_paginated_response(serializer.data)
                        else:
                            return Response(
                                data={
                                    "response_code": 1,
                                    "response_message": "No shops retrieved",
                                },
                                status=status.HTTP_400_BAD_REQUEST,
                            )

                else:
                    raise exceptions.ValidationError(
                        "No nearby entities selling this product"
                    )
            else:
                raise exceptions.ValidationError("No entity")
        else:
            raise exceptions.ValidationError("No receipts")

    elif request.data["action"] == "AddEntityLocation":
        entity_location = None
        data = request.data
        print("data", data)
        entity_id = request.data["entity"]
        entity = validate_entity(entity_id)
        
        latitude = request.data["location"]["latitude"]
        longitude = request.data["location"]["longitude"]

        #    Check if location is already set
        if Locations.objects.filter(entity=entity).exists():
            return custom_error_response(1, "Entity location is already set")
        if latitude and not latitude==None and longitude and not longitude==None:
            point = fromstr(f"POINT({longitude} {latitude})", srid=4326)
            print("point", point)
            entity_location = Locations.objects.create(entity=entity, point=point)

        if entity_location:
            serializer = LocationsSerializer(
                entity_location, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity location created successfully",
                serializer.data,
                "entity_location",
            )

        else:
            return custom_error_response(1, "Entity location could not be created")

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
def locations_filters_api_view_staff(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetEntityLocationById":
        """Retrieve entity point by id"""

        entity_id = request.data["entity"]
        entity = None
        location = None
        entity = validate_entity(entity_id)
        if Locations.objects.filter(entity_id=entity_id).exists():
            location = Locations.objects.filter(entity_id=entity_id).first()
            serializer = LocationsSerializer(
                location, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity location  sucessfuly retrieved", serializer.data, "location"
            )
        else:
            return custom_error_response(1, "Entity location not retrieved")

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated,])
def bodaLocationsAPIView(request):
    stripped = 0.00
    stringified = 0.00
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetBodaLocationsWithDistances":
        category = None

        """Retrieve boda locations"""
        bodas = []
        near_by = []
        print("request.data", request.data)

        latitude = request.data["coords"]["latitude"]
        longitude = request.data["coords"]["longitude"]


        user_location = Point(longitude, latitude, srid=4326)
        print("User Location",user_location)
        dist = Distance("point", user_location)
        print("dist", dist)
        bodas = (
            BodaLocations.objects.filter(is_active="true")
            .annotate(distance=Distance("point", user_location))
            .order_by("distance")
        )
        for loc in bodas:
            print("LOC",loc.point)
           
            if loc.distance:
                loc.point=fromstr(loc.point)
                loc.farness = loc.distance
                stringified = str(loc.farness)
                stripped = stringified.rstrip(stringified[-1])
                # loc.farness=stripped
                print("stripped", stripped)
                print("stringified", stringified)
                print("farness", loc.farness)
                if stripped:
                    farness_in_km = float(stripped) / float(1000.00)
                    loc.farness = round(farness_in_km, 2)

                else:
                    loc.farness = 0.00
                #     if float(farness_in_km) <float(10.00):
                #         near_by.append(loc)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(bodas, request)
        serializer = BodaLocationsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "SetBodaLocation":
        boda_location = None
        sacco_personnel = None
        created = None

        if SaccoPersonnel.objects.filter(user=request.user,personnel_type="BODABODA", is_active="true").exists():
            sacco_personnel=SaccoPersonnel.objects.filter(user=request.user,personnel_type="BODABODA", is_active="true").first()
        else:
            return custom_error_response(1,"You are not registered as bodaboda.")
        
        latitude = request.data["location"]["latitude"]
        longitude = request.data["location"]["longitude"]

        #    Check if location is already set
        if BodaLocations.objects.filter(boda=sacco_personnel,owner=request.user,is_active="true").exists():
            boda_location =  BodaLocations.objects.filter(boda=sacco_personnel,owner=request.user,is_active="true").first()
            # point = fromstr(f"POINT({longitude} {latitude})", srid=4326)
            # boda_location.point=point
            boda_location.is_active = "false"
            boda_location.save()
        else:
            pass

        if latitude and not latitude==None and longitude and not longitude==None:
            point = fromstr(f"POINT({longitude} {latitude})", srid=4326)
            print("point", point)
            created = BodaLocations.objects.create(boda=sacco_personnel, point=point,owner=request.user,is_active="true")

            if created:
                serializer = BodaLocationsSerializer(
                    boda_location, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Boda location set successfully",
                    serializer.data,
                    "boda_location",
                )

            else:
                return custom_error_response(1, "Entity location could not be created")
        else:
            return custom_error_response(1, "Location coordinates are not valid")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')
    
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated,])
def wifiLocationsAPIView(request):
    stripped = 0.00
    stringified = 0.00
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetWifiLocationsWithDistances":
        category = None

        """Retrieve wifi locations"""
        wifis = []
        near_by = []
        print("request.data", request.data)

        latitude = request.data["coords"]["latitude"]
        longitude = request.data["coords"]["longitude"]


        user_location = Point(longitude, latitude, srid=4326)
        print("User Location",user_location)
        dist = Distance("point", user_location)
        print("dist", dist)
        wifis = (
            WifiLocations.objects.filter(is_active="true")
            .annotate(distance=Distance("point", user_location))
            .order_by("distance")
        )
        for loc in wifis:
            print("LOC",loc.point)
           
            if loc.distance:
                loc.point=fromstr(loc.point)
                loc.farness = loc.distance
                stringified = str(loc.farness)
                stripped = stringified.rstrip(stringified[-1])
                # loc.farness=stripped
                print("stripped", stripped)
                print("stringified", stringified)
                print("farness", loc.farness)
                if stripped:
                    farness_in_km = float(stripped) / float(1000.00)
                    loc.farness = round(farness_in_km, 2)

                else:
                    loc.farness = 0.00
                #     if float(farness_in_km) <float(10.00):
                #         near_by.append(loc)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wifis, request)
        serializer = serializers.WifiLocationsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "SetWifiLocation":
        wifi_location = None

        created = None
        title = None
        if not request.user.entity.entity_type=="ISP":
            return custom_error_response(1,"You are not registered as an ISP, you cannot set wifi locations.")
        
        if not "title" in request.data or  request.data["title"]=="":
            return custom_error_response(1,"Wifi location title is required.")
        title = request.data["title"].upper()
        
        if not "location" in request.data or not "latitude" in request.data["location"] or not "longitude" in request.data["location"]:
            return custom_error_response(1,"Wifi location coordinates are required.")


        
        latitude = request.data["location"]["latitude"]
        longitude = request.data["location"]["longitude"]


        if latitude and not latitude==None and longitude and not longitude==None:
            point = fromstr(f"POINT({longitude} {latitude})", srid=4326)
            print("point", point)
            created = WifiLocations.objects.create(entity=request.user.entity, point=point,owner=request.user,is_active="true",title=title)

            if created:
                serializer = serializers.WifiLocationsSerializer(
                    created, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Wifi location set successfully",
                    serializer.data,
                    "wifi_location",
                )

            else:
                return custom_error_response(1, "Wifi location could not be created")
        else:
            return custom_error_response(1, "Location coordinates are not valid")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')



@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated,])
def propertiesLocationsAPIView(request):
    stripped = 0.00
    stringified = 0.00
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetPropertyLocationsWithDistances":
        category = None

        """Retrieve property locations"""
        wifis = []
        near_by = []
        print("request.data", request.data)

        latitude = request.data["coords"]["latitude"]
        longitude = request.data["coords"]["longitude"]


        user_location = Point(longitude, latitude, srid=4326)
       
        dist = Distance("point", user_location)
        print("dist", dist)
        wifis = (
            PropertyLocations.objects.filter(is_active="true")
            .annotate(distance=Distance("point", user_location))
            .order_by("distance")
        )
        for loc in wifis:
            print("LOC",loc.point)
           
            if loc.distance:
                loc.point=fromstr(loc.point)
                loc.farness = loc.distance
                stringified = str(loc.farness)
                stripped = stringified.rstrip(stringified[-1])
                # loc.farness=stripped
                print("stripped", stripped)
                print("stringified", stringified)
                print("farness", loc.farness)
                if stripped:
                    farness_in_km = float(stripped) / float(1000.00)
                    loc.farness = round(farness_in_km, 2)

                else:
                    loc.farness = 0.00
                #     if float(farness_in_km) <float(10.00):
                #         near_by.append(loc)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wifis, request)
        serializer = serializers.PropertyLocationsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "SetPropertyLocation":
   

        created = None
        property_id = None
        if not request.user.entity.entity_type=="REALTY":
            return custom_error_response(1,"You are not registered as an Realtor, you cannot set property locations.")
        
        if not "property_id" in request.data or  request.data["property_id"]=="":
            return custom_error_response(1,"Property ID is required.")
        else:
            property_id = request.data["property_id"]
            if Property.objects.filter(id=property_id).exists():
                property= Property.objects.filter(id=property_id).first()
                if PropertyLocations.objects.filter(property=property,is_active="true").exists():
                    return custom_error_response(1,"Location for this property is already set.")
            else:
                return custom_error_response(1,"Property with provided ID does not exist.")

        
        if not "location" in request.data or not "latitude" in request.data["location"] or not "longitude" in request.data["location"]:
            return custom_error_response(1,"Property location coordinates are required.")



        latitude = request.data["location"]["latitude"]
        longitude = request.data["location"]["longitude"]

        if latitude and not latitude==None and longitude and not longitude==None:
            point = fromstr(f"POINT({longitude} {latitude})", srid=4326)
            print("point", point)
            created = PropertyLocations.objects.create(entity=request.user.entity,property=property, point=point,owner=request.user,is_active="true")

            if created:
                serializer = serializers.PropertyLocationsSerializer(
                    created, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Property location set successfully",
                    serializer.data,
                    "property_location",
                )

            else:
                return custom_error_response(1, "Property location could not be created")
        else:
            return custom_error_response(1, "Location coordinates are not valid")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

