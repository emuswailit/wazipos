from django.db.utils import IntegrityError
from django.http import request
from django.shortcuts import get_object_or_404, render
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from authentication.models import Departments, Profiles
from core.views import EntitySafeViewMixin
from rest_framework import generics, permissions, status, exceptions
from rest_framework.response import Response
from core import app_permissions
from . import serializers, models, utils
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from core.responses import custom_error_response, custom_success_message, custom_errors_response


@api_view(["POST"])
@permission_classes([app_permissions.AdminsOnlyPermissions])
def advertsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateAdvert":
        utils.validate_adverts_data(request.data, request.user)

        product = utils.create_advert(request.data, request.user)
        if product:
            serializer = serializers.AdvertsSerializer(
                product, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Advert created successfully", serializer.data, 'advert'
            )

        else:
            return custom_error_response(1, "Advert could not be created")

    elif request.data["action"] == "GetAdverts":
        """Retrieve adverts for a particular entity"""

        designations = utils.get_entity_adverts(request.user)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(designations, request)
        serializer = serializers.AdvertsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "UpdateAdvert":

        designation = utils.update_advert(request.data, request.user)
        if designation:
            serializer = serializers.AdvertsSerializer(
                designation, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Advert updated successfully", serializer.data, 'designation'
            )
        else:
            return custom_error_response(1, "Advert could not be updated")
    elif request.data["action"] == "AdvertDetails":
        advert = None
        try:
            advert_id = request.data["advert_id"]
            if models.Adverts.objects.filter(id=advert_id).exists():
                advert = models.Adverts.objects.filter(
                    id=advert_id).first()
                serializer = serializers.AdvertsSerializer(
                    advert, many=False, context={"request": request}
                )
                return custom_success_message(
                    0, "Advert retrieved successfully", serializer.data, 'advert'
                )
            else:
                return custom_error_response(
                    1, "Advert could not be retrieved"
                )

        except KeyError:
            raise exceptions.ValidationError("Advert ID are required")

    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([app_permissions.EntityOwnerPermission])
def designationsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateDesignation":
        utils.validate_designation_data(request.data, request.user)

        product = utils.create_designation(request.data, request.user)
        if product:
            serializer = serializers.DesignationsSerializer(
                product, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Employee created successfully", serializer.data, 'employee'
            )

        else:
            return custom_error_response(1, "Employee could not be created")

    elif request.data["action"] == "EntityDesignations":
        """Retrieve designations for a particular entity"""

        designations = utils.get_entity_designations(request.user)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(designations, request)
        serializer = serializers.DesignationsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "UpdateDesignation":

        designation = utils.update_designation(request.data, request.user)
        if designation:
            serializer = serializers.DesignationsSerializer(
                designation, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Designation updated successfully", serializer.data, 'designation'
            )
        else:
            return custom_error_response(1, "Designation could not be updated")
    elif request.data["action"] == "DesignationDetails":
        designation = None
        try:
            designation_id = request.data["designation_id"]
            if models.Designations.objects.filter(id=designation_id).exists():
                designation = models.Designations.objects.filter(
                    id=designation_id).first()
                serializer = serializers.DesignationsSerializer(
                    designation, many=False, context={"request": request}
                )
                return custom_success_message(
                    0, "Designation retrieved successfully", serializer.data, 'designation'
                )
            else:
                return custom_error_response(
                    1, "Desigantion could not be retrieved"
                )

        except KeyError:
            raise exceptions.ValidationError("Designation ID are required")

    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([app_permissions.AdminsOnlyPermissions])
def employeesAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateEmployee":
        errors = []
        errors= utils.validate_employee_data(request.data, request.user)

        if len(errors)>0:
            return custom_errors_response(
                1, "Employee could not be created",errors
            )
        else:
            employee = utils.create_employee(request.data, request.user)
            if employee:
                serializer = serializers.EmployeesSerializer(
                    employee, many=False, context={"request": request}
                )
                return custom_success_message(
                    0, "Employee created successfully", serializer.data, 'employee'
                )

            else:
                return custom_error_response(1, "Employee could not be created")
    if request.data["action"] == "CreateCorporateEmployee":
       

        errors, employee = utils.create_corporate_employee(request.data, request.user)
        if employee:
            print("emo",employee)
            serializer = serializers.EmployeesSerializer(
                employee, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Employee created successfully", serializer.data, 'employee'
            )

        else:
            return custom_errors_response(
                1, "Employee  could not be created",errors
            )
    if request.data["action"] == "CreateDeliveryPerson":

        delivery_person = utils.create_delivery_person(
            request.data, request.user)
        if delivery_person:
            serializer = serializers.DeliveryPersonSerializer(
                delivery_person, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Delivery person  created successfully", serializer.data, 'delivery_person'
            )

        else:
            return custom_error_response(1, "Delivery person could not be created")
    elif request.data["action"] == "GetEntityDeliveryPersons":
        """Retrieve delivery people for a particualr entity"""

        employees = utils.get_entity_delivery_persons(
            request.user, request.data)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employees, request)
        serializer = serializers.EmployeesSerializer(
            page, many=True, context={"request": request, "delivery_persons": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllEmployees":
        """Retrieve all employees"""

        if not request.user.is_staff:
            raise exceptions.ValidationError(
                'Not authorized to access this content')

        employees = utils.get_all_employees(request.user, request.data)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employees, request)
        serializer = serializers.EmployeesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveEntityEmployees":
        """Retrieve employees for a particualr entity"""

        employees = utils.get_entity_employees(request.user, request.data)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employees, request)
        serializer = serializers.EmployeesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveEntityEmployeesById":
        """Retrieve employees for a particualr entity by ID"""

        employees = utils.get_entity_employees_by_id(request.data)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employees, request)
        serializer = serializers.EmployeesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveOwnedEmployees":
        """Retrieve employees for a particualr user"""

        employees = utils.get_owned_employees(request.user)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employees, request)
        serializer = serializers.EmployeesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateEmployee":

        errors, employee = utils.update_employee(request.data, request.user)
        if employee:
            serializer = serializers.EmployeesSerializer(
                employee, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Employee updated successfully", serializer.data, 'employee'
            )
        else:
            return custom_errors_response(1, "Employee could not be updated",errors)
    elif request.data["action"] == "EmployeeDetails":
        employee = None
        try:
            employee_id = request.data["employee"]
            print('empid', employee_id)
            if employee_id:
                if models.Employees.objects.filter(id=employee_id).exists():
                    employee = models.Employees.objects.filter(
                        id=employee_id).first()
                    serializer = serializers.EmployeesSerializer(
                        employee, many=False, context={"request": request}
                    )
                    return custom_success_message(
                        0, "Employee retrieved successfully", serializer.data, 'employee'
                    )
                else:
                    return custom_error_response(
                        1, "No employee exists for supplied ID"
                    )

        except KeyError:
            raise exceptions.ValidationError("Employee ID are required")
    
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def employeesJointAPIView(request):
    print("user", request.user)
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "EmployeeDetails":
        employee = None
        try:
            employee_id = request.data["employee"]
            if models.Employees.objects.filter(id=employee_id).exists():
                employee = models.Employees.objects.filter(
                    id=employee_id).first()
                serializer = serializers.EmployeesSerializer(
                    employee, many=False, context={"request": request}
                )
                return custom_success_message(
                    0, "Employee retrieved successfully", serializer.data, 'employee'
                )
            else:
                return custom_error_response(
                    1, "Employee could not be retrieved"
                )

        except KeyError:
            raise exceptions.ValidationError("Employee ID are required")
    elif request.data["action"] == "CurrentUserEmployment":
        employee = None
        try:

            if models.Employees.objects.filter(user=request.user, is_active='true').exists():
                employee = models.Employees.objects.filter(
                    user=request.user, is_active='true').first()
                serializer = serializers.EmployeesSerializer(
                    employee, many=False, context={"request": request}
                )
                return custom_success_message(
                    0, f"You are an active employee at {request.user.entity.title}", serializer.data, 'employee'
                )
            else:
                return custom_error_response(
                    1, f"You are not actively employed currently."
                )

        except KeyError:
            raise exceptions.ValidationError("Employee ID are required")
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def agentsOnlyAPIView(request):
    
    if not request.user.is_agent:
        raise exceptions.ValidationError("Not authorized")
    else:
        pass
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")



    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')