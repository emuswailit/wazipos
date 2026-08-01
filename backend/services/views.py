from django.shortcuts import render
from core.responses import custom_error_response, custom_success_message
from rest_framework.decorators import api_view, permission_classes, parser_classes, renderer_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.pagination import PageNumberPagination
from rest_framework import generics, serializers, status, views, permissions, exceptions
from . import models,serializers
from .utils import services_utils
from core.responses import custom_errors_response, custom_success_message

# Create your views here.


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]

)
@renderer_classes([JSONRenderer,])
@parser_classes([JSONParser, MultiPartParser])
def servicesOpenAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetServicesCategories":
        """Get all service categories for users"""

        categories = models.ServicesCategories.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.ServicesCategoriesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetServices":
        """Get all service  for users"""

        categories = models.Services.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.ServicesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)


    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')
    

@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]

)
@renderer_classes([JSONRenderer,])
@parser_classes([JSONParser, MultiPartParser])
def servicesAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetLaboratoryServices":
        """Get all laboratory for admin"""

        categories = models.LaboratoryServices.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.LaboratoryServicesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "CreateLaboratoryService":
        errors, laboratory_service = services_utils.create_laboratory_service(
            request.data, request.user
        )
        if laboratory_service:
            serializer = serializers.LaboratoryServicesSerializer(
                laboratory_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Laboratory services created successfully",
                serializer.data,
                "laboratory_service",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Laboratory services not created",errors)
    elif request.data["action"] == "UpdateLaboratoryService":
        errors, laboratory_service = services_utils.update_laboratory_service(
            request.data, request.user
        )
        if laboratory_service:
            serializer = serializers.LaboratoryServicesSerializer(
                laboratory_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Laboratory services updated successfully",
                serializer.data,
                "laboratory_service",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Laboratory services not updated",errors)
    elif request.data["action"] == "GetRadiologyServices":
        """Get all services radiology for admin"""

        categories = models.RadiologyServices.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.RadiologyServicesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "CreateRadiologyService":
        errors, laboratory_service = services_utils.create_radiology_service(
            request.data, request.user
        )
        if laboratory_service:
            serializer = serializers.RadiologyServicesSerializer(
                laboratory_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Radiology service created successfully",
                serializer.data,
                "radiology_service",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Radiology service not created",errors)
    elif request.data["action"] == "UpdateRadiologyService":
        errors, laboratory_service = services_utils.update_radiology_service(
            request.data, request.user
        )
        if laboratory_service:
            serializer = serializers.RadiologyServicesSerializer(
                laboratory_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Radiology service updated successfully",
                serializer.data,
                "radiology_service",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Radiology service not updated",errors)
    elif request.data["action"] == "GetPhysiotherapyServices":
        """Get all services radiology for admin"""

        categories = models.PhysiotherapyServices.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.PhysiotherapyServicesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "CreatePhysiotherapyService":
        errors, laboratory_service = services_utils.create_physiotherapy_service(
            request.data, request.user
        )
        if laboratory_service:
            serializer = serializers.PhysiotherapyServicesSerializer(
                laboratory_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Physiotherapy service created successfully",
                serializer.data,
                "physiotherapy_service",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Physiotherapy service not created",errors)
    elif request.data["action"] == "UpdatePhysiotherapyService":
        errors, laboratory_service = services_utils.update_physiotherapy_service(
            request.data, request.user
        )
        if laboratory_service:
            serializer = serializers.PhysiotherapyServicesSerializer(
                laboratory_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Physiotherapy service updated successfully",
                serializer.data,
                "physiotherapy_service",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Physiotherapy service not updated",errors)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')
