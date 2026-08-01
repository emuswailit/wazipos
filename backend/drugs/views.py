from django.shortcuts import render
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework import permissions, exceptions
from core import responses
from . import serializers, models, utils
from .utils import formulation_utils, frequency_utils, body_system_utils, drug_class_utils, drug_sub_class_utils, route_utils, generics_utils, preparation_utils
from core.responses import custom_error_response

# Create your views here.


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def body_systems_api_view(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateBodySystem":
        body_system_utils.validate_body_system_data(request.data)

        body_system = body_system_utils.create_body_system(
            request.data, request.user)
        if body_system:
            serializer = serializers.BodySystemSerializer(
                body_system, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Body system created successfully", serializer.data, 'body_system'
            )

        else:
            return responses.custom_error_response(1, "Body systems could not be created")
    elif request.data["action"] == "GetBodySystems":
        """Retrieve body systems"""

        body_systems = body_system_utils.get_all_body_systems(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(body_systems, request)
        serializer = serializers.BodySystemSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateBodySystem":

        product = body_system_utils.update_body_system(
            request.data, request.user)
        if product:
            serializer = serializers.BodySystemSerializer(
                product, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Body systems updated successfully", serializer.data, 'body_system'
            )
        else:
            return responses.custom_error_response(1, "Product could not be updated")
    elif request.data["action"] == "BodySystemDetails":
        body_system = None
        try:
            body_system_id = request.data["body_system"]
            if models.BodySystem.objects.filter(id=body_system_id).exists():
                body_system = models.BodySystem.objects.filter(
                    id=body_system_id).first()
                serializer = serializers.BodySystemSerializer(
                    body_system, many=False, context={"request": request}
                )
                return responses.custom_success_message(
                    0, "Body system retrieved successfully", serializer.data, 'body_system'
                )
            else:
                return responses.custom_error_response(
                    1, "Body system could not be retrieved"
                )

        except KeyError:
            raise exceptions.ValidationError("Body system ID is required")

    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def drug_classes_api_view(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateDrugClass":
        drug_class_utils.validate_drug_class_data(request.data)

        drug_class = drug_class_utils.create_drug_class(
            request.data, request.user)
        if drug_class:
            serializer = serializers.DrugClassSerializer(
                drug_class, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Drug class created successfully", serializer.data, 'drug_class'
            )

        else:
            return responses.custom_error_response(1, "Drug class could not be created")
    elif request.data["action"] == "GetDrugClasses":
        """Create new drug class"""

        drug_classes = drug_class_utils.get_all_drug_classes(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(drug_classes, request)
        serializer = serializers.DrugClassSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateDrugClass":

        product = drug_class_utils.update_drug_class(
            request.data, request.user)
        if product:
            serializer = serializers.DrugClassSerializer(
                product, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Drug class updated successfully", serializer.data, 'drug_class'
            )
        else:
            return responses.custom_error_response(1, "Product could not be updated")
    elif request.data["action"] == "DeleteDrugClass":

        entity = drug_class_utils.delete_drug_class(
            request.data, request.user)
        return custom_error_response(1, "Entity licence deleted succesfully")
    elif request.data["action"] == "DrugClassDetails":
        body_system = None
        try:
            drug_class_id = request.data["drug_class"]
            if models.DrugClass.objects.filter(id=drug_class_id).exists():
                drug_class = models.DrugClass.objects.filter(
                    id=drug_class_id).first()
                serializer = serializers.DrugClassSerializer(
                    drug_class, many=False, context={"request": request}
                )
                return responses.custom_success_message(
                    0, "Drug class retrieved successfully", serializer.data, 'drug_class'
                )
            else:
                return responses.custom_error_response(
                    1, "Drug class could not be retrieved"
                )

        except KeyError:
            raise exceptions.ValidationError("Drug class ID is required")
    elif request.data["action"] == "SearchDrugClasses":
        """Search drug class"""

        drug_classes = drug_class_utils.search_drug_classes(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(drug_classes, request)
        serializer = serializers.DrugClassSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def drug_sub_classes_api_view(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateDrugSubClass":
        drug_sub_class_utils.validate_drug_sub_class_data(request.data)

        drug_sub_class = drug_sub_class_utils.create_drug_sub_class(
            request.data, request.user)
        if drug_sub_class:
            serializer = serializers.DrugSubClassSerializer(
                drug_sub_class, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Drug sub class created successfully", serializer.data, 'drug_sub_class'
            )

        else:
            return responses.custom_error_response(1, "Drug sub class could not be created")
    elif request.data["action"] == "GetDrugSubClasses":
        """Retrieve drug sub classes"""

        drug_sub_classes = drug_sub_class_utils.get_all_drug_sub_classes(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(drug_sub_classes, request)
        serializer = serializers.DrugSubClassSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetDrugSubClassesForDrugClass":
        """Retrieve drug sub classes for a drug class"""

        drug_sub_classes = drug_sub_class_utils.get_all_drug_sub_classes_for_drug_class(
            request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(drug_sub_classes, request)
        serializer = serializers.DrugSubClassSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateDrugSubClass":

        product = drug_sub_class_utils.update_drug_sub_class(
            request.data, request.user)
        if product:
            serializer = serializers.DrugSubClassSerializer(
                product, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Drug sub class updated successfully", serializer.data, 'drug_sub_class'
            )
        else:
            return responses.custom_error_response(1, "Drug sub class could not be updated")
    elif request.data["action"] == "DrugSubClassDetails":
        body_system = None
        try:
            drug_sub_class_id = request.data["drug_sub_class"]
            if models.DrugSubClass.objects.filter(id=drug_sub_class_id).exists():
                drug_class = models.DrugSubClass.objects.filter(
                    id=drug_sub_class_id).first()
                serializer = serializers.DrugSubClassSerializer(
                    drug_class, many=False, context={"request": request}
                )
                return responses.custom_success_message(
                    0, "Drug sub class retrieved successfully", serializer.data, 'drug_sub_class'
                )
            else:
                return responses.custom_error_response(
                    1, "Drug sub class with give ID does not exist"
                )

        except KeyError:
            raise exceptions.ValidationError("Drug sub class ID is required")

    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def generics_api_view(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateGeneric":
        generics_utils.validate_generic_data(request.data)

        generic = generics_utils.create_generic(
            request.data, request.user)
        if generic:
            serializer = serializers.GenericSerializer(
                generic, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Generic created successfully", serializer.data, 'generic'
            )

        else:
            return responses.custom_error_response(1, "Drug sub class could not be created")
    elif request.data["action"] == "GetGenerics":
        """Retrieve generics"""

        generics = generics_utils.get_all_generics(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(generics, request)
        serializer = serializers.GenericSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchGenerics":
        """Retrieve preparations"""

        generics = generics_utils.search_generics(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(generics, request)
        serializer = serializers.GenericSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateGeneric":

        product = generics_utils.update_generic(
            request.data, request.user)
        if product:
            serializer = serializers.GenericSerializer(
                product, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Generic updated successfully", serializer.data, 'generic'
            )
        else:
            return responses.custom_error_response(1, "Drug generic could not be updated")
    elif request.data["action"] == "GenericDetails":
        body_system = None
        try:
            generic_id = request.data["generic"]
            if models.Generic.objects.filter(id=generic_id).exists():
                drug_class = models.Generic.objects.filter(
                    id=generic_id).first()
                serializer = serializers.GenericSerializer(
                    drug_class, many=False, context={"request": request}
                )
                return responses.custom_success_message(
                    0, "Generic retrieved successfully", serializer.data, 'generic'
                )
            else:
                return responses.custom_error_response(
                    1, "Generic with give ID does not exist"
                )

        except KeyError:
            raise exceptions.ValidationError("Generic ID is required")

    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def formulations_api_view(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateFormulation":
        formulation_utils.validate_formulation_data(request.data)

        formulation = formulation_utils.create_formulation(
            request.data, request.user)
        if formulation:
            serializer = serializers.FormulationsSerializer(
                formulation, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Formulation created successfully", serializer.data, 'formulation'
            )

        else:
            return responses.custom_error_response(1, "Formualtion could not be created")
    elif request.data["action"] == "GetFormulations":
        """Create new formulation"""

        formulations = formulation_utils.get_all_formulations(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(formulations, request)
        serializer = serializers.FormulationsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchFormulations":
        """Retrieve formulations"""

        formulations = formulation_utils.search_formulations(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(formulations, request)
        serializer = serializers.FormulationsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateFormulation":

        formulation = formulation_utils.update_formulation(
            request.data, request.user)
        if formulation:
            serializer = serializers.FormulationsSerializer(
                formulation, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Formulation updated successfully", serializer.data, 'formulation'
            )
        else:
            return responses.custom_error_response(1, "Product could not be updated")
    elif request.data["action"] == "GetFormulationDetails":

        formulation = formulation_utils.get_formulation_details(
            request.data, request.user)
        if formulation:
            serializer = serializers.FormulationsSerializer(
                formulation, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Formulation details sucessfuly retrieved", serializer.data, 'formulation'
            )

        else:
            return custom_error_response(1, "Formulation details not retrieved")
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def frequencies_api_view(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateFrequency":
        frequency_utils.validate_frequency_data(request.data)

        frequency = frequency_utils.create_frequency(
            request.data, request.user)
        if frequency:
            serializer = serializers.FrequencySerializer(
                frequency, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Frequency created successfully", serializer.data, 'frequency'
            )

        else:
            return responses.custom_error_response(1, "Frequency could not be created")
    elif request.data["action"] == "GetFrequencies":
        """Create new frequencies"""

        frequencies = frequency_utils.get_all_frequencies(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(frequencies, request)
        serializer = serializers.FrequencySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateFrequency":

        frequency = frequency_utils.update_frequency(
            request.data, request.user)
        if frequency:
            serializer = serializers.FrequencySerializer(
                frequency, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Frequency updated successfully", serializer.data, 'frequency'
            )
        else:
            return responses.custom_error_response(1, "Frequency could not be updated")
    elif request.data["action"] == "GetFrequencyDetails":

        frequency = frequency_utils.get_frequency_details(
            request.data, request.user)
        if frequency:
            serializer = serializers.FrequencySerializer(
                frequency, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Frequency details sucessfuly retrieved", serializer.data, 'frequency'
            )

        else:
            return custom_error_response(1, "Frequency details not retrieved")
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def routes_api_view(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateRoute":
        route_utils.validate_route_data(request.data)

        route = route_utils.create_route(
            request.data, request.user)
        if route:
            serializer = serializers.RoutesSerializer(
                route, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Route created successfully", serializer.data, 'route'
            )

        else:
            return responses.custom_error_response(1, "Route could not be created")
    elif request.data["action"] == "GetRoutes":
        """Create new routes"""

        routes = route_utils.get_all_routes(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(routes, request)
        serializer = serializers.RoutesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateRoute":

        route = route_utils.update_route(
            request.data, request.user)
        if route:
            serializer = serializers.RoutesSerializer(
                route, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Route updated successfully", serializer.data, 'route'
            )
        else:
            return responses.custom_error_response(1, "Route could not be updated")
    elif request.data["action"] == "GetRouteDetails":

        route = route_utils.get_route_details(
            request.data, request.user)
        if route:
            serializer = serializers.FormulationsSerializer(
                route, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Route details sucessfuly retrieved", serializer.data, 'route'
            )

        else:
            return custom_error_response(1, "Route details not retrieved")
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def preparations_api_view(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreatePreparation":
        preparation_utils.validate_preparation_data(request.data)

        preparation = preparation_utils.create_preparation(
            request.data, request.user)
        if preparation:
            serializer = serializers.PreparationSerializer(
                preparation, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Preparation created successfully", serializer.data, 'preparation'
            )

        else:
            return responses.custom_error_response(1, "Preparation could not be created")
    elif request.data["action"] == "GetPreparations":
        """Retrieve preparations"""

        preparations = preparation_utils.get_all_preparations(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(preparations, request)
        serializer = serializers.PreparationSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchPreparations":
        """Retrieve preparations"""

        preparations = preparation_utils.search_preparations(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(preparations, request)
        serializer = serializers.PreparationSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdatePreparation":

        route = preparation_utils.update_preparation(
            request.data, request.user)
        if route:
            serializer = serializers.PreparationSerializer(
                route, many=False, context={"request": request}
            )
            return responses.custom_success_message(
                0, "Preparation updated successfully", serializer.data, 'route'
            )
        else:
            return responses.custom_error_response(1, "Preparation could not be updated")

    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')
