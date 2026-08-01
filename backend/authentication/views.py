from django.shortcuts import render
from django.db import IntegrityError
import re
import datetime
from intergrations.jambopay.jambopay_create_whitelabel_account import create_white_label_account
from utils.mailing import send_email
from payments.utils.payment_utils import create_user_account
import dateutil.parser
from rest_framework import generics, serializers, status, views, permissions, exceptions
from django.db import transaction
from authentication.utils import user_utils,sms_utils,agent_utils
from authentication.validators import authentication_models_validators
from utils.encription import decrypt
from core.responses import custom_error_response, custom_success_message,qr_code_response
from core.phone_number_utils import get_telco_by_phone_number
from employees.serializers import EmployeesSerializer
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms
from authentication.utils import utils
from payments.models import UserAccounts,PaymentServicesProvider
from django.utils.dateparse import parse_datetime
from core.utils import generate_password
from django.utils import timezone
from rest_framework.decorators import (
    api_view,
    permission_classes,
    parser_classes,
    renderer_classes,
)
from decouple import config
from rest_framework.mixins import CreateModelMixin
from rest_framework.parsers import MultiPartParser, FormParser
from authentication.renderers import UserRenderer
from rest_framework.response import Response
from django.contrib.auth import authenticate, login
from django.contrib import auth
from django.http import JsonResponse
from email_validator import validate_email, EmailNotValidError
from rest_framework.renderers import JSONRenderer
from rest_framework.parsers import MultiPartParser, JSONParser
from .utils import (
    utils,
    entity_branch_utils,
    sms_utils,
    user_details_kyc_utils,
    dependant_utils
)
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken
from . import models
from django.contrib.sites.shortcuts import get_current_site
from django.urls import reverse
from drf_yasg import openapi
from django.shortcuts import get_object_or_404
import jwt
from .validators import authentication_models_validators
from django.conf import settings
from drf_yasg.utils import swagger_auto_schema
import pyotp
from retailers.utils.generate_token_utils import generate_token
from django.utils.encoding import (
    DjangoUnicodeDecodeError,
    force_str,
    smart_bytes,
    smart_str,
)
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.http import urlsafe_base64_encode
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from .models import UserDocuments, Users, UserImages, IdentityDocuments, EntityImages
from employees.models import Employees
from core import app_permissions
from core.responses import custom_errors_response
import json
from intergrations.jambopay.jambopay_create_user_profile import create_jambopay_profile
from intergrations.jambopay.jambopay_get_profile_accounts import get_jambopay_main_profile
from payments.serializers import EntityPSPCollectionAccountSerializer
from utils.logging import create_log
from .serializers import (
    CadresSerializer,
    CountriesSerializer,
    CountiesSerializer,
    EmailVerificationSerializer,
    EntityRegisterSerializer,
    EntitySerializer,
    EntityLicencesSerializer,
    PhoneLoginSerializer,
    RegisterSerializer,
    CorporateRegisterSerializer,
    ResetPasswordEmailRequestSerializer,
    RolesSerializer,
    UserDocumentsSerializer,
    EntityDocumentsSerializer,
    SecondarySchoolsSerializer,
    SetNewPasswordSerializer,
    DependantsSerializer,
    DepartmentsSerializer,
    UsersSerializer,
    ClustersSerializer,
    GenericUserSerializer,
    UserImageSerializer,
    ProfilesSerializer,
    CategoriesSerializer,
    UserDocumentsSerializer,
    SubCategoriesSerializer,
    EntityBranchSerializer,
    BranchesSerializer,
    ConstituenciesSerializer,
    PlansSerializer,
    TownsSerializer,
    EntityImagesSerializer,
    PostalOfficesSerializer,
    OrganizationsSerializer,
    SubCountiesSerializer,
    SimpleUsersSerializer,
    AgentsSerializer,
    
  
)


# Web Imports
from django.contrib.auth import login
from django.contrib.auth.forms import UserCreationForm
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from . import forms
from authentication.models import Agents

from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView
from django.conf import settings
import requests
from django.urls import reverse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from urllib.parse import urljoin
from django.conf import settings
from django.shortcuts import render
from django.views import View


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
def dependantsAPIView(request):
    try: 
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetEntityDependants":
        dependants = []
        user=request.user
        """Get entity dependants"""


        if models.Dependants.objects.filter(user__entity=request.user.entity).exists():
            dependants = models.Dependants.objects.filter(user__entity=request.user.entity).all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(dependants, request)
        serializer = DependantsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "GetUserDependants":
        dependants = []
        """Get user dependants"""

        if models.Dependants.objects.filter(user=request.user).exists():
            dependants = models.Dependants.objects.filter(user=request.user).all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(dependants, request)
        serializer = DependantsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchUserDependants":
        dependants = []
        """Get user dependants"""
        dependants =dependant_utils.search_dependants(request.data)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(dependants, request)
        serializer = DependantsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateUserDependant":
        # utils.validate_dependant_data(request.data, request.user)

        errors,  dependant = utils.create_dependant(request.data, request.user)
        if dependant:
            serializer = DependantsSerializer(
                dependant, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Dependant created successfully", serializer.data, "dependant"
            )

        else:
            return custom_errors_response(1, "Dependant could not be created",errors)
    elif request.data["action"] == "UpdateDependant":
        dependant = utils.update_dependant(request.data, request.user)
        if dependant:
            serializer = DependantsSerializer(
                dependant, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Dependant updated successfully", serializer.data, "dependant"
            )
        else:
            return custom_error_response(1, "Dependant could not be updated")
    elif request.data["action"] == "GetDependantDetails":
        dependant = utils.get_dependant_details(request.data, request.user)
        if dependant:
            serializer = DependantsSerializer(
                dependant, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Dependant details sucessfuly retrieved",
                serializer.data,
                "dependant",
            )

        else:
            return custom_error_response(1, "Dependant details not retrieved")

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
def cadresAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetCadres":
        """Get all cadres"""

        cadres = utils.get_cadres()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(cadres, request)
        serializer = CadresSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateCadre":
        utils.validate_cadre_data(request.data, request.user)

        entity = utils.create_cadre(request.data, request.user)
        if entity:
            serializer = CadresSerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Cadre created successfully", serializer.data, "cadre"
            )

        else:
            return custom_error_response(1, "Cadre could not be created")

    elif request.data["action"] == "UpdateCadre":
        entity = utils.update_cadre(request.data, request.user)
        if entity:
            serializer = CadresSerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Cadre updated successfully", serializer.data, "cadre"
            )
        else:
            return custom_error_response(1, "Cadre could not be updated")
    elif request.data["action"] == "GetCadreDetails":
        cadre = utils.get_cadre_details(request.data, request.user)
        if cadre:
            serializer = CadresSerializer(
                cadre, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Cadre details sucessfuly retrieved", serializer.data, "cadre"
            )

        else:
            return custom_error_response(1, "Cadre details not retrieved")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
def departmentsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetEntityDepartments":
        """Get all entity departments"""

        departments = utils.get_entity_departments(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(departments, request)
        serializer = DepartmentsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateDepartment":

        # utils.validate_department_data(request.data, request.user)

        errors,department = utils.create_department(request.data, request.user)
        if department:
            serializer = DepartmentsSerializer(
                department, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Department created successfully", serializer.data, "department"
            )

        else:
            return custom_errors_response(1, "Department could not be created",errors)

    elif request.data["action"] == "UpdateDepartment":
        department = utils.update_department(request.data, request.user)
        if department:
            serializer = DepartmentsSerializer(
                department, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Department updated successfully", serializer.data, "department"
            )
        else:
            return custom_error_response(1, "Department could not be updated")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAdminUser,
    ]
)
def smsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "SendSMS":
        

        errors, sent = utils.send_sms_messages(request.data, request.user)
        if sent:
            return custom_error_response(0, "Message sent sucessfully")

        else:
            return custom_errors_response(1, "Message could not be created", errors)

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

@api_view(["POST"])
@permission_classes(
    [
        app_permissions.AdminsOnlyPermissions,
    ]
)
def plansAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetPlans":
        """Get all plans for admin users"""

        plans = utils.get_plans(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(plans, request)
        serializer = PlansSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreatePlan":
        utils.validate_role_data(request.data, request.user)

        entity = utils.create_role(request.data, request.user)
        if entity:
            serializer = RolesSerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Role created successfully", serializer.data, "role"
            )

        else:
            return custom_error_response(1, "Role could not be created")
    elif request.data["action"] == "UpdatePlan":
        entity = utils.update_role(request.data, request.user)
        if entity:
            serializer = RolesSerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Plan updated successfully", serializer.data, "role"
            )
        else:
            return custom_error_response(1, "Plan could not be updated")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')



@api_view(["POST"])
@permission_classes(
    [
        app_permissions.AdminsOnlyPermissions,
    ]
)
def rolesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetEntityRoles":
        """Get all entities foor admin users"""

        roles = utils.get_entity_roles(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(roles, request)
        serializer = RolesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "CreateRole":
        errors,role = utils.create_entity_role(request.data, request.user)
        if role:
            serializer = RolesSerializer(
                role, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Role created successfully", serializer.data, "role"
            )

        else:
            return custom_errors_response(1, "QR code not created",errors)
    elif request.data["action"] == "UpdateRole":
        errors, role = utils.update_role(request.data, request.user)
        if role:
            serializer = RolesSerializer(
                role, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Role updated successfully", serializer.data, "role"
            )
        else:
            return custom_errors_response(1, "Role could not be updated",errors)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
def documentsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetUserDocuments":
        """Get all entities foor admin users"""

        documents = utils.get_user_documents(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(documents, request)
        serializer = UserDocumentsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "GetEntityDocuments":
        """Get all entity documents for admin users"""

        documents = utils.get_entity_documents(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(documents, request)
        serializer = EntityDocumentsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "VerifyDocument":
        document = utils.verify_document(request.data, request.user)
        if document:
            serializer = UserDocumentsSerializer(
                document, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Document verified successfully", serializer.data, "document"
            )
        else:
            return custom_error_response(1, "Document could not be updated")

    elif request.data["action"] == "DeleteDocument":
        utils.delete_document(request.data, request.user)
        return Response(
            data={
                "response_code": 0,
                "response_message": "Document deleted succesfully",
            },
            status=status.HTTP_200_OK,
        )

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
def kycApiView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "KYC":
        national_id = ""
        first_name = ""
        year_of_birth = ""
        token = generate_token()
        if not request.data["user_details"]["national_id"]:
            raise exceptions.ValidationError("National ID number is required")
        else:
            national_id = request.data["user_details"]["national_id"]

        if not request.data["user_details"]["first_name"]:
            raise exceptions.ValidationError("First name is required")
        else:
            first_name = request.data["user_details"]["first_name"]
        if not request.data["user_details"]["year_of_birth"]:
            raise exceptions.ValidationError("Year of birth is required")
        else:
            year_of_birth = request.data["user_details"]["year_of_birth"]

        if token:
            result = user_details_kyc_utils.user_details_kyc(national_id, token)
            if (
                result["first_name"] == first_name
                and result["doc_number"] == national_id
            ):
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "User details ok",
                        "data": result,
                    },
                    status=status.HTTP_200_OK,
                )
            else:
                return custom_error_response(1, "User details not matching")

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
def imagesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetUserImages":
        """Get all entities foor admin users"""

        documents = utils.get_user_documents(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(documents, request)
        serializer = UserDocumentsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "DeleteImage":
        utils.delete_image(request.data, request.user)
        return Response(
            data={
                "response_code": 0,
                "response_message": "Image deleted succesfully",
            },
            status=status.HTTP_200_OK,
        )

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.AllowAny,
    ]
)
def sequenceAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GenerateReferenceNumber":
        """Generate single reference number"""
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
        """Get batched reference numbers"""

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

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
def usersAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "ChangeUserPassword":
        """Get all entities for admin users"""

        errors, user = utils.update_user_password(request.data,request.user)
        if user:
            serializer = UsersSerializer(
                user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "User password changed sucessfully", serializer.data, "user"
            )

        else:
            return custom_errors_response(1, "User epassword could not be changed",errors)
    elif request.data["action"] == "GetAgentUsers":
        """Get all users for admin users"""
        users = []
        agent = models.Agents.objects.filter(user=request.user).first()
        if agent:
            users = models.Users.objects.filter(creating_agent=agent)
        else:
            users=[]
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(users, request)
        serializer = GenericUserSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityRolesById":
        """Get all entities foor admin users"""

        roles = utils.get_entity_roles_by_id(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(roles, request)
        serializer = RolesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateUserDetails":
        """Update user details"""

        errors, user = utils.update_user_details(request.data,request.user)
        if user:
            serializer = UsersSerializer(
                user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "User password changed sucessfully", serializer.data, "user"
            )

        else:
            return custom_errors_response(1, "User epassword could not be changed",errors)

      
    if request.data["action"] == "GetEntityFollowers":
        """Get all entities for admin users"""

        customers = utils.get_entity_followers(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customers, request)
        serializer = UsersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityUsersById":
        """Get all entities for admin users"""

        customers = utils.get_entity_users_admin(request.user, request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customers, request)
        serializer = UsersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetUserProfile":
        # get user profile

        profile = utils.get_user_profile(request.data, request.user)
        if profile:
            serializer = ProfilesSerializer(
                profile, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "User profile sucessfuly retrieved", serializer.data, "profile"
            )

        else:
            return custom_error_response(1, "User profile not retrieved")
    elif request.data["action"] == "GetUserDetails":
        # get user profile

        if request.user:
            serializer = UsersSerializer(
                request.user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "User  sucessfuly retrieved", serializer.data, "user"
            )

        else:
            return custom_error_response(1, "User profile not retrieved")
    elif request.data["action"] == "GenerateQRCode":
        errors, qr_code = user_utils.generate_qr_code(request.data, request.user)
        if qr_code:
            return qr_code_response(qr_code)
        else:
            return custom_errors_response(1, "QR code not created",errors)
    elif request.data["action"] == "VerifyUser":
        errors, user = utils.verify_user(request.data, request.user)
        if user:
            serializer = UsersSerializer(user, many=False, context={"request": request})
            return custom_success_message(
                0, "User verified successfully", serializer.data, "user"
            )
        else:
            return custom_errors_response(1, "User could not be verified",errors)
    elif request.data["action"] == "SearchUsers":
        """Search users"""

        users = utils.search_users(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(users, request)
        serializer = UsersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchEntityFollowers":
        """Search entity followers"""

        users = utils.search_entity_followers(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(users, request)
        serializer = UsersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "AddEmployeeToEntity":
        # switch user to entity

        user = utils.add_user_to_entity(request.data, request.user)
        if user:
            serializer = ProfilesSerializer(
                user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "User entity changed sucessfully", serializer.data, "profile"
            )

        else:
            return custom_error_response(1, "User entity could not be changed")
    elif request.data["action"] == "RemoveEmployeeFromEntity":
        # switch user to entity

        user = utils.remove_employee_from_entity(request.data, request.user)
        if user:
            serializer = UsersSerializer(user, many=False, context={"request": request})
            return custom_success_message(
                0, "Employee removed from entity sucessfully", serializer.data, "user"
            )

        else:
            return custom_error_response(1, "Employee could not be removed from entity")
    elif request.data["action"] == "SendOTP":
        # switch user to entity

        sent = sms_utils.send_sms_code(request.user)
        if sent:
            serializer = UsersSerializer(
                request.user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "OTP send you your phone number succesfully", serializer.data, "user"
            )

        else:
            return custom_error_response(1, "OTP could not be sent succesfully")
    elif request.data["action"] == "SendCorporateUserOTP":
        # switch user to entity

        errors, user = sms_utils.send_corporate_user_sms_code(request.data)
        if user:
            serializer = UsersSerializer(
                request.user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "OTP sent successfully", serializer.data, "user"
            )

        else:
            return   custom_errors_response(1, "OTP not sent", errors)
    elif request.data["action"] == "VerifyOTP":
        # switch user to entity

        sent = sms_utils.verify_otp(request.user, request.data)
        if sent:
            serializer = UsersSerializer(
                request.user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "OTP verified succesfully", serializer.data, "user"
            )

        else:
            return custom_error_response(1, "OTP could not be verified")
    elif request.data["action"] == "VerifyIPRS":
        errors, user = utils.verify_iprs(request.data, request.user)
        if user:
            serializer = UsersSerializer(
                user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "IPRS verification was successful", serializer.data, "user"
            )

        else:
            return custom_errors_response(1, "User noVerifyCorporateUserOTPt verified", errors)
    elif request.data["action"] == "":
        # switch user to entity

        errors, user = sms_utils.verify_corporate_user_otp(request.data)
        if user:
            serializer = UsersSerializer(
                request.user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "OTP verified succesfully", serializer.data, "user"
            )

        else:
             return   custom_errors_response(1, "OTP not verified", errors)
    elif request.data["action"] == "IsPhoneOTPVerifed":
        # switch userff to entity

        if request.user.phone_otp_verified == "true":
            return Response(
                data={
                    "response_code": 0,
                    "phone_otp_verified": "true",
                },
                status=status.HTTP_200_OK,
            )

        else:
            return Response(
                data={
                    "response_code": 0,
                    "phone_otp_verified": "false",
                },
                status=status.HTTP_200_OK,
            )

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAdminUser,
    ]
)
def adminUsersAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetUserDetailsById":
        # get user profile

        if "user" in request.data and not request.data["user"] == "":
            user_id = request.data["user"]
            user = None
            if Users.objects.filter(id=user_id).exists():
                user = Users.objects.filter(id=user_id).first()
                serializer = GenericUserSerializer(
                    user, many=False, context={"request": request}
                )
                return custom_success_message(
                    0, "User details  sucessfuly retrieved", serializer.data, "user"
                )

            else:
                return custom_error_response(1, "User profile not retrieved")
        else:
            return custom_error_response(1, "User Id is required")
    if request.data["action"] == "GetEntityFollowers":
        """Get all entities for admin users"""

        customers = utils.get_entity_followers(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customers, request)
        serializer = UsersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    
    elif request.data["action"] == "SearchUsers":
        """Search users"""

        users = utils.search_users(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(users, request)
        serializer = UsersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllUsers":
        """Get all users for admin users"""
        users = []

        users = utils.get_all_users(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(users, request)
        serializer = GenericUserSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAgentUsers":
        """Get all users for admin users"""
        users = []
        agent = models.Agents.filter(user=request.user).first()
        if agent:
            users = models.Users.objects.filter(creating_agent=agent)
        else:
            users=[]
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(users, request)
        serializer = GenericUserSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UsersPendingVerification":
        """Users profiles pending verification"""

        users = utils.users_pending_verification(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(users, request)
        serializer = UsersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllTowns":
        """Get all towns"""

        towns = models.Towns.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(towns, request)
        serializer = TownsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    
    elif request.data["action"] == "CreateAgent":
        errors, agent = agent_utils.create_agent(request.data, request.user)
        if agent:
            serializer = AgentsSerializer(
                agent, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Agent created successfully", serializer.data, "town"
            )

        else:
            return custom_errors_response(1, "Agent not created", errors)
    elif request.data["action"] == "CreateTown":
        errors, town = utils.create_town(request.data, request.user)
        if town:
            serializer = TownsSerializer(
                town, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Town created successfully", serializer.data, "town"
            )

        else:
            return custom_errors_response(1, "Town not created", errors)
    elif request.data["action"] == "UpdateTown":
        errors, town = utils.update_town(request.data, request.user)
        if town:
            serializer = TownsSerializer(
                town, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Town updated successfully", serializer.data, "town"
            )

        else:
            return custom_errors_response(1, "Town not created", errors)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
@renderer_classes(
    [
        JSONRenderer,
    ]
)
@parser_classes([JSONParser, MultiPartParser])
def categoriesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetAllCategories":
        """Get all categories for users"""

        categories = utils.get_all_categories()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = CategoriesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "GetAllSubCategories":
        """Get all sub categories for users"""

        sub_categories = utils.get_all_sub_categories()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sub_categories, request)
        serializer = SubCategoriesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "GetCategorySubCategories":
        """Get all sub categories for category"""

        sub_categories = utils.get_category_sub_categories(request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sub_categories, request)
        serializer = SubCategoriesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetUserEntityCategories":
        """Get user entity categories"""

        categories = utils.get_user_entity_categories(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = CategoriesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "CreateCategory":
        utils.validate_create_category_data(request.data, request.user)

        category = utils.create_category(request.data, request.user)
        if category:
            serializer = CategoriesSerializer(
                category, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Category created successfully", serializer.data, "category"
            )

        else:
            return custom_error_response(1, "Category could not be created")
    elif request.data["action"] == "GetCategoryDetails":
        # check_user_is_wholesale_admin(request.data, request.user)

        category = utils.get_category_details(request.data, request.user)
        if category:
            serializer = CategoriesSerializer(
                category, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Category details sucessfuly retrieved", serializer.data, "category"
            )

        else:
            return custom_error_response(1, "Category details not retrieved")
    elif request.data["action"] == "UpdateCategory":
        category = utils.update_category(request.data, request.user)
        if category:
            serializer = CategoriesSerializer(
                category, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Category updated successfully", serializer.data, "category"
            )
        else:
            return custom_error_response(1, "Entity could not be updated")
    elif request.data["action"] == "UpdateSubCategory":
        sub_category = utils.update_sub_category(request.data, request.user)
        if sub_category:
            serializer = SubCategoriesSerializer(
                sub_category, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Sub category updated successfully", serializer.data, "sub_category"
            )
        else:
            return custom_error_response(1, "Entity could not be updated")
    elif request.data["action"] == "CreateSubCategory":
        utils.validate_create_sub_category_data(request.data, request.user)

        sub_category = utils.create_sub_category(request.data, request.user)
        if sub_category:
            serializer = SubCategoriesSerializer(
                sub_category, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Sub category created successfully", serializer.data, "sub_category"
            )

        else:
            return custom_error_response(1, "Sub category could not be created")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


# @api_view(["POST"])
# @permission_classes(
#     [
#         permissions.IsAuthenticated,
#     ]
# )
# @renderer_classes(
#     [
#         JSONRenderer,
#     ]
# )
# @parser_classes([JSONParser, MultiPartParser])
# def collectionAccountsAPIView(request):
#     try:
#         action = request.data["action"]
#     except KeyError:
#         raise exceptions.ValidationError("Action is not supplied")
#     if request.data["action"] == "GetEntityCollectionAccounts":
#         """Get collection accounts for an entity for logged in user"""

#         collection_accounts = collection_account_utils.get_entity_collection_accounts(
#             request.user
#         )
#         paginator = PageNumberPagination()
#         page = paginator.paginate_queryset(collection_accounts, request)
#         serializer = EntityCollectionAccountsSerializer(
#             page, many=True, context={"request": request, "user": request.user}
#         )
#         return paginator.get_paginated_response(serializer.data)

#     elif request.data["action"] == "CreateEntityCollectionAccount":
#         collection_account = collection_account_utils.create_entity_collection_account(
#             request.data, request.user
#         )
#         if collection_account:
#             serializer = EntityCollectionAccountsSerializer(
#                 collection_account, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0,
#                 "Collection account created successfully",
#                 serializer.data,
#                 "collection_account",
#             )

#         else:
#             return custom_error_response(1, "Collection account could not be created")
#     elif request.data["action"] == "GetActiveEntityCollectionAccount":
#         collection_account = collection_account_utils.get_active_collection_account(
#             request.data, request.user
#         )
#         if collection_account:
#             serializer = EntityCollectionAccountsSerializer(
#                 collection_account, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0,
#                 "Collection account retrieved successfully",
#                 serializer.data,
#                 "collection_account",
#             )

#         else:
#             return custom_error_response(1, "Collection account could not be created")
#     elif request.data["action"] == "UpdateEntityCollectionAccount":
#         collection_account = collection_account_utils.update_entity_collection_account(
#             request.data, request.user
#         )
#         if collection_account:
#             serializer = EntityCollectionAccountsSerializer(
#                 collection_account, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0,
#                 "Collection account updated successfully",
#                 serializer.data,
#                 "collection_account",
#             )
#         else:
#             return custom_error_response(1, "Collection account could not be updated")
#     else:
#         raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


# @api_view(["POST"])
# @permission_classes(
#     [
#         permissions.IsAuthenticated,
#     ]
# )
# @renderer_classes(
#     [
#         JSONRenderer,
#     ]
# )
# @parser_classes([JSONParser, MultiPartParser])
# def settlementAccountsAPIView(request):
#     try:
#         action = request.data["action"]
#     except KeyError:
#         raise exceptions.ValidationError("Action is not supplied")
#     if request.data["action"] == "GetEntitySettlementAccounts":
#         """Get settlement accounts for an entity for logged in user"""

#         settlement_accounts = settlement_account_utils.get_entity_settlement_accounts(
#             request.user
#         )
#         paginator = PageNumberPagination()
#         page = paginator.paginate_queryset(settlement_accounts, request)
#         serializer = EntitySettlementAccountsSerializer(
#             page, many=True, context={"request": request, "user": request.user}
#         )
#         return paginator.get_paginated_response(serializer.data)

#     elif request.data["action"] == "CreateEntitySettlementAccount":
#         settlement_account = settlement_account_utils.create_entity_settlement_account(
#             request.data, request.user
#         )
#         if settlement_account:
#             serializer = EntitySettlementAccountsSerializer(
#                 settlement_account, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0,
#                 "Settlement account created successfully",
#                 serializer.data,
#                 "settlement_account",
#             )

#         else:
#             return custom_error_response(1, "Settlement account could not be created")
#     elif request.data["action"] == "UpdateEntitySettlementAccount":
#         settlement_account = settlement_account_utils.update_entity_settlement_account(
#             request.data, request.user
#         )
#         if settlement_account:
#             serializer = EntitySettlementAccountsSerializer(
#                 settlement_account, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0,
#                 "Settlement account updated successfully",
#                 serializer.data,
#                 "settlement_account",
#             )
#         else:
#             return custom_error_response(1, "Settlement account could not be updated")
#     else:
#         raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        app_permissions.AdminsOnlyPermissions,
    ]
)
@renderer_classes(
    [
        JSONRenderer,
    ]
)
@parser_classes([JSONParser, MultiPartParser])
def entitiesAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "VerifyEntity":
        errors, entity = utils.verify_entity(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity verified successfully", serializer.data, "entity"
            )
        else:
            return custom_errors_response(1, "Entity could not be verified",errors)

    elif request.data["action"] == "VerifyEntityBranch":
        errors, branch = utils.verify_entity_branch(request.data, request.user)
        if branch:
            serializer = EntityBranchSerializer(
                branch, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity branch verified successfully", serializer.data, "branch"
            )
        else:
            return custom_errors_response(1, "Entity branch could not be verified",errors)
    elif request.data["action"] == "EntitiesPendingVerification":
        """Entities  pending verification"""
        entities = utils.entities_pending_verification(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "DeleteEntity":
        entity = utils.delete_entity(request.data, request.user)
        return custom_error_response(1, "Entity  deleted succesfully")
    elif request.data["action"] == "UpdateEntityCategories":
        entity = utils.verify_entity(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity verified successfully", serializer.data, "entity"
            )
        else:
            return custom_error_response(1, "Entity could not be verified")
    elif request.data["action"] == "SetEntityAdministrator":
        errors, entity = utils.update_entity_administrator(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity administrator updated successfully", serializer.data, "entity"
            )
        else:
             return custom_errors_response(1, "Entity administrator not updated",errors)
    elif request.data["action"] == "CreateCorporateEmployee":
        errors, employee = utils.create_corporate_employee(request.data, request.user)
        if employee:
            serializer = EmployeesSerializer(
                employee, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Employee created successfully", serializer.data, "employee"
            )
        else:
             return custom_errors_response(1, "Employee not created",errors)
    elif request.data["action"] == "CreateOrganization":
        errors, organization = utils.create_corporate_organization(request.data, request.user)
        if organization:
            serializer = OrganizationsSerializer(
                organization, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Organizationt created successfully", serializer.data, "organization"
            )
        else:
             return custom_errors_response(1, "Organization not created",errors)
    elif request.data["action"] == "GetOrganizations":
        employees = utils.get_organizations(request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employees, request)
        serializer = OrganizationsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    
    elif request.data["action"] == "CreateCorporateWallet":
        errors, entity = utils.create_corporate_wallet(request.data, request.user)
        if entity:
            serializer = EntityPSPCollectionAccountSerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity wallet created successfully", serializer.data, "employee"
            )
        else:
             return custom_errors_response(1, "Entity wallet not created",errors)
    elif request.data["action"] == "GetEntityEmployees":
        employees = utils.get_entity_employees(request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employees, request)
        serializer = EmployeesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityUsers":
        users = utils.get_entity_users(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(users, request)
        serializer = UsersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated
    ]
)
@renderer_classes(
    [
        JSONRenderer,
    ]
)
@parser_classes([JSONParser, MultiPartParser])
def entitiesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetUserEntities":
        """Get entities owned by a user"""

        entities = utils.get_user_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllEntities":
        """Get all entities for admin users"""

        entities = utils.get_all_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllPlans":
        """Get all payment plans"""

        plans = utils.get_all_plans()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(plans, request)
        serializer = PlansSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchManufacturers":
        """Search manufacturers"""

        manufacturers = utils.search_manufacturers(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(manufacturers, request)
        serializer = EntitySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchDistributors":
        """Search distributors"""

        distributors = utils.search_distributors(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(distributors, request)
        serializer = EntitySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchRetailers":
        """Search retailers"""

        retailers = utils.search_retailers(request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailers, request)
        serializer = EntitySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchWholesalers":
        """Search wholesalers"""

        wholesalers = utils.search_wholesalers(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesalers, request)
        serializer = EntitySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetFavoriteEntities":
        """Get entities favorited by a user"""

        entities = utils.get_user_favorite_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetFacilitatorEntities":
        """Get entities that offer loan facilities"""

        entities = utils.get_facilitator_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetRetailEntities":
        """Get retailer entities"""

        entities = utils.get_retail_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAgentEntities":
        """Get agent entities"""

        entities = utils.get_agent_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetWholesaleEntities":
        """Get retailer orders list for both wholesaler and retailer admins"""

        entities = utils.get_wholesale_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetDistributorEntities":
        """Get retailer orders list for both wholesaler and retailer admins"""

        entities = utils.get_distributor_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetManufacturerEntities":
        """Get manufacturer entities"""

        entities = utils.get_manufacturer_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetBanks":
        """Get banks"""

        entities = utils.get_banks()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetBanksAndTelcos":
        """Get banks and telcos"""

        entities = utils.get_banks_and_telcos()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetTelcos":
        """Get telcos only"""

        entities = utils.get_telcos()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityDetails":
        # check_user_is_wholesale_admin(request.data, request.user)

        entity = utils.get_entity_details(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity details sucessfuly retrieved", serializer.data, "entity"
            )

        else:
            return custom_error_response(1, "Entity details not retrieved")
    elif request.data["action"] == "SearchEntities":
        """Search entities"""

        entities = utils.search_entities(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchRetailEntities":
        """Search entities"""

        entities = utils.search_retailers(request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetUserEmployerEntities":
        """Retrieve entities where user is employed"""

        entities = utils.get_employer_entities(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entities, request)
        serializer = EntitySerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateLocalEntity":
        errors = utils.validate_create_local_entity_data(request.data, request.user)
  
        if len(errors) > 0:
            return custom_errors_response(1, "Entity not created", errors)

        entity = utils.create_local_entity(request.data, request.user)
        if entity:
            # Create super admin role
            utils.create_super_admin_role(entity)

            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity created successfully", serializer.data, "entity"
            )

        else:
            return custom_error_response(1, "Entity could not be created")
    elif request.data["action"] == "CreateLocalEntityByAgent":
        # errors = utils.validate_create_local_entity_data(request.data, request.user)
  
        # if len(errors) > 0:
        #     return custom_errors_response(1, "Entity not created", errors)

        errors, entity = utils.create_local_entity_by_agent(request.data, request.user)
        if entity:
            # Create super admin role
            utils.create_super_admin_role(entity)

            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity created successfully", serializer.data, "entity"
            )

        else:
            return custom_errors_response(1, "Entity not created", errors)
    elif request.data["action"] == "CreateEntityBranch":
        if not request.user.is_staff:
            raise exceptions.ValidationError("Not authorized")

        entity_branch = entity_branch_utils.create_entity_branch(
            request.data, request.user
        )
        if entity_branch:
            serializer = EntityBranchSerializer(
                entity_branch, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity branch created successfully",
                serializer.data,
                "entity_branch",
            )

        else:
            return custom_error_response(1, "Entity branch could not be created")
    elif request.data["action"] == "GetEntityBranches":
        """Retrieve  branches for entity"""

        entity_branches = entity_branch_utils.get_entity_branches(request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_branches, request)
        serializer = BranchesSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateInternationalEntity":
        # if not request.user.is_staff:
        #     raise exceptions.ValidationError("Not authorized")
        utils.validate_create_international_entity_data(request.data)

        entity = utils.create_international_entity(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity created successfully", serializer.data, "entity"
            )

        else:
            return custom_error_response(1, "Entity could not be created")
    elif request.data["action"] == "UpdateEntity":
        entity = utils.update_entity(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity updated successfully", serializer.data, "entity"
            )
        else:
            return custom_error_response(1, "Entity could not be updated")
    elif request.data["action"] == "EntityAssignCategories":
        entity = utils.entity_assign_categories(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Categories assigned sucessfully", serializer.data, "entity"
            )
        else:
            return custom_error_response(1, "Categories could not be assigned")
    elif request.data["action"] == "VerifyEntityLicence":
        entity = utils.verify_entity_licence(request.data, request.user)
        if entity:
            serializer = EntityLicencesSerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity licence verified successfully", serializer.data, "licence"
            )
        else:
            return custom_error_response(1, "Entity licence could not be verified")
    elif request.data["action"] == "DeleteEntityLicence":
        entity = utils.delete_entity_licence(request.data, request.user)
        return custom_error_response(1, "Entity licence deleted succesfully")
    elif request.data["action"] == "DeleteEntityImage":
        entity = utils.delete_entity_image(request.data, request.user)
        return custom_error_response(1, "Entity image deleted succesfully")
    elif request.data["action"] == "FollowEntity":
        entity = utils.follow_entity(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                f"You have succesfully followed {entity.title}",
                serializer.data,
                "entity",
            )
        else:
            return custom_error_response(
                1, "Entity could not be added to favorites verified"
            )
    elif request.data["action"] == "RemoveFavoriteEntity":
        entity = utils.remove_favorite_entity(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity removed from favorites", serializer.data, "entity"
            )
        else:
            return custom_error_response(
                1, "Entity could not be removed from favorites"
            )
    elif request.data["action"] == "SwitchToEntity":
        errors, entity = utils.switch_to_entity(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, f"You have switched to {entity.title}", serializer.data, "entity"
            )
        else:
            return custom_errors_response(1, f"Switch to entity was not succesful",errors)
    elif request.data["action"] == "FollowEntity":
        entity = utils.follow_entity(request.data, request.user)
        if entity:
            serializer = EntitySerializer(
                entity, many=False, context={"request": request}
            )
            return custom_success_message(
                0, f"You are now following {entity.title}", serializer.data, "entity"
            )
        else:
            return custom_error_response(
                1, f"An error occurred while following thie entity. Please try again"
            )
    elif request.data["action"] == "GetEntityFollowers":
        """Get entities owned by a user"""

        followers = utils.get_entity_followers(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(followers, request)
        serializer = GenericUserSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')
    
class EntitiesCreateByAgentAPIView(generics.GenericAPIView):
    """
    Create new entity
    """

    name = "entities-create"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = EntitySerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        try:
            errors_messages=[]
            agent = None
            if not request.user.is_staff:
                if not models.Agents.objects.filter(user=request.user).exists():
                    errors_messages.append("You are not authorized")
                    return JsonResponse(
                        {
                                "response_code": 1,
                                "response_message": "Entity not created",
                                "errors": errors_messages,
                            
                            },
                
                        )
                else:
                    agent = models.Agents.objects.filter(user=request.user).first()

                
            categories = None
            owner = None
            my_cats=[]
            m_cats_str=None
    
            # if not request.user.is_agent and not request.user.is_verified == "true":
            #     raise exceptions.ValidationError("Not authorized.")
            # Assign super admin roles
            images = request.FILES.getlist("images")
            licences = request.FILES.getlist("licences")
            
            offer_trial= request.data["offer_trial"]
            if not request.data["country"]:
                errors_messages.append("Country ID is required")


            
            if not request.data["owner"]:
                errors_messages.append("Owner ID is required")
            else:
                owner_id =  request.data["owner"]
                owner = authentication_models_validators.validate_user(owner_id)

                # if owner==request.user:
                #     errors_messages.append("You cannot create an entity for yourself")

            if len(errors_messages)>0:
                create_log("error",errors_messages)
                return Response(
                        data={
                            "response_code": 1,
                            "response_message": "Entity not created",
                            "errors": errors_messages,
                
                        },
            
                    )
            else:
                pass
            if not request.data["entity_type"]=="RETAIL":
                if len(licences)<1:
                    errors_messages.append("Registraion certificate or county business certificate required")
                    return Response(
                        data={
                            "response_code": 1,
                            "response_message": "Entity not created",
                            "errors": errors_messages,
                        
                        },
            
                    )
        
            serializer_context = {"request": request, "user": self.request.user}

            serializer = EntitySerializer(data=request.data, context=serializer_context)
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid(raise_exception=True):
                serializer.save(
                    owner=owner,
                    administrator=owner,
                    agent=agent,
                    offer_tial="true"
                    
                )
                entity = models.Entities.objects.get(id=serializer.data["id"])
                entity.owner=owner
                entity.save()

                
                entity.owner.entity=entity
                
                entity.owner.save()
                create_log("info", f"Created : {entity.title}")

                if "entity_categories" in request.data and not request.data["entity_categories"]=="":
                    m_cats_str=request.data["entity_categories"]
                    print("entity categories",m_cats_str)
                    create_log("info", m_cats_str)
                    my_cats= m_cats_str.split(",")
                    print("my categories",my_cats)
                    for cat in my_cats:
                        if not cat=="":
                            if models.Categories.objects.filter(id=cat).exists():
                                category=models.Categories.objects.filter(id=cat).first()
                                print("category",category)
                                entity.categories.add(category)




                # Switch user to the created entity if user is not admin
                # if not request.user.is_staff:
                #     request.user.entity = entity
                #     request.user.save()
                # elif request.user.is_staff:
                    # Verify entity if created by admin if it
                    # if entity.entity_type == "MANUFACTURING":
                entity.is_verified = "true"
                entity.is_licenced = True
                entity.agent= agent
                entity.save()
                entity = utils.create_super_admin_role(entity)

                if offer_trial=="true":
                    from django.utils import timezone
                    from datetime import timedelta
                    from subscriptions.models import Subscription


                    today = timezone.localdate()
                    trial_ends = today + timedelta(days=30)
                    entity.trial_from=today
                    entity.trial_to =trial_ends
                    entity.save()
                    subscription = Subscription.objects.create(
                        payment=None,
                        start_date =today,
                        end_date =trial_ends,
                        month=1,
                        entity=entity,
                        owner=request.user

                    )
                errors_messages = []

                uploaded_files = []
                if len(licences) > 0:
                    for licence in licences:
                        content = models.EntityLicences.objects.create(
                            owner=owner, licence=licence, entity=entity
                        )
                        uploaded_files.append(content)

                    entity.licences.add(*uploaded_files)
                    context = serializer.data
                    arr =[]

                    ls= EntityLicencesSerializer(entity.licences,context={'request': request}, many=True).data,
                    context["licences"] =arr

                uploaded_images = []
                if len(images) > 0:
                    for image in images:
                        content = models.EntityImages.objects.create(
                            owner=owner, image=image, entity=entity
                        )
                        uploaded_images.append(content)

                    entity.images.add(*uploaded_images)
                    context = serializer.data

                    arr =[]

                    ls= EntityImagesSerializer(entity.images,context={'request': request}, many=True).data,
                    context["images"] =arr


                errors_messages = []
                return Response(
                        data={
                            "response_code": 0,
                            "response_message": "Entity succesfully created",
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
                        "response_message": "Entity not created",
                        "entity": serializer.data,
                        "errors": errors_messages,
                    
                    },
                    status=status.HTTP_200_OK
                )
        except Exception as e:
            create_log("error",str(e))
            errors_messages.append(str(e))
            return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Entity not created",
                        # "entity": serializer.data,
                        "errors": errors_messages,
                    
                    },
                    status=status.HTTP_200_OK
                )



class EntitiesCreateAPIView(generics.GenericAPIView):
    """
    Create new entity
    """

    name = "entities-create"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = EntitySerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        # if not UserAccounts.objects.filter(owner=request.user).exists():
        #     raise exceptions.ValidationError("You have not yet created a collection account") 
        # create_log("info", str(request['data']))
        if not request.user.is_staff and not request.user.is_verified == "true":
            raise exceptions.ValidationError("Your profile is not yet verified.")
        # Assign super admin roles
        images = request.FILES.getlist("images")
        licences = request.FILES.getlist("licences")
        if not request.data["country"]:
            raise exceptions.ValidationError("Country is required")

        if len(licences) > 0 or len(images) > 0:
            serializer_context = {"request": request, "user": self.request.user}

            serializer = EntitySerializer(data=request.data, context=serializer_context)
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid(raise_exception=True):
                serializer.save(
                    owner=request.user,
                    phone=request.user.phone,
                    email=request.user.email,
                    administrator=request.user
                )
                entity = models.Entities.objects.get(id=serializer.data["id"])
            
                utils.create_super_admin_role(entity)
                employee = Employees.objects.create(entity=entity,user=entity.owner, is_active = "true",owner=request.user)
                


                # Switch user to the created entity if user is not admin
                if not request.user.is_staff:
                    pass
                elif request.user.is_staff:
                    # Verify entity if created by admin if it
                    # if entity.entity_type == "MANUFACTURING":
                    entity.is_verified = "true"
                    entity.is_licenced = True
                    entity.save()
            

                errors_messages = []

                uploaded_files = []
                if len(licences) > 0:
                    for licence in licences:
                        content = models.EntityLicences.objects.create(
                            owner=request.user, licence=licence, entity=entity
                        )
                        uploaded_files.append(content)

                    entity.licences.add(*uploaded_files)
                    context = serializer.data
                    context["licences"] = [licence.id for licence in uploaded_files]

                uploaded_images = []
                if len(images) > 0:
                    for image in images:
                        content = models.EntityImages.objects.create(
                            owner=request.user, image=image, entity=entity
                        )
                        uploaded_images.append(content)

                    entity.images.add(*uploaded_images)
                    context = serializer.data
                    context["images"] = [image.id for image in uploaded_images]

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Entity succesfully created",
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
                        "response_message": "Entity not created",
                        "entity": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            serializer_context = {"request": request, "user": self.request.user}
            serializer = EntitySerializer(data=request.data, context=serializer_context)
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid(raise_exception=True):
                entity = None
                serializer.save(
                    owner=request.user,
                    administrator=request.user
                )
                # Retrieve created entity
                entity = models.Entities.objects.get(id=serializer.data["id"])
                utils.create_super_admin_role(entity)
                employee = Employees.objects.create(entity=entity,user=entity.owner, is_active = "true",owner=request.user)
                


                if not request.user.is_staff:
                    pass
                

                elif request.user.is_staff:
                    # Verify entity if created by admin if it
                    # if entity.entity_type == "MANUFACTURING":
                    entity.is_verified = "true"
                    entity.is_licenced = True
                    entity.save()
                # entity = models.Entities.objects.get(
                #     id=serializer.data['id'])
                # user_data = serializer.data
                # request.user.entity = entity
                # request.user.save()
                # Update user profile roles

                # Retrieve user from database
                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Entity succesfully created",
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
                        "response_message": "Entity not created",
                        "entity": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )


# Countries api view
@api_view(["POST"])
@permission_classes(
    [
        permissions.AllowAny,
    ]
)
def countriesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetCountries":
        """Get all countries users"""
        countries = utils.get_countries()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(countries, request)
        serializer = CountriesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetPostalOffices":
        """Get all countries users"""
        countries = utils.get_postal_offices()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(countries, request)
        serializer = CountriesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetCountryDetails":
        country = utils.get_country_details(request.data)
        if country:
            serializer = CountriesSerializer(
                country, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Country retrieved successfully", serializer.data, "country"
            )
        else:
            return custom_error_response(1, "Country could not be retrieved")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

# Countries api view
@api_view(["POST"])
@permission_classes(
    [
        permissions.AllowAny,
    ]
)
def postalAddressesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetPostalOffices":
        """Get all countries users"""
        countries = utils.get_postal_offices()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(countries, request)
        serializer = PostalOfficesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

@api_view(["POST"])
@permission_classes(
    [
        permissions.AllowAny,
    ]
)
def countiesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetCounties":
        """Get all counties users"""
        counties = utils.get_counties()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(counties, request)
        serializer = CountiesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    
    elif request.data["action"] == "GetSubCounties":
        """Get sub counties for county"""
        sub_counties = utils.get_sub_counties(request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sub_counties, request)
        serializer = SubCountiesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "GetCountyDetails":
        country = utils.get_county_details(request.data)
        if country:
            serializer = CountiesSerializer(
                country, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "County retrieved successfully", serializer.data, "county"
            )
        else:
            return custom_error_response(1, "County could not be retrieved")
        
    elif request.data["action"] == "GetAllTowns":
        """Get all towns"""

        towns = models.Towns.objects.all().order_by("title")
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(towns, request)
        serializer = TownsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.AllowAny,
    ]
)
def constituenciesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetConstituencies":
        """Get all constituencies users"""
        constituencies = utils.get_constituencies()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(constituencies, request)
        serializer = ConstituenciesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetCountyConstituencies":
        """Get county constituencies"""
        constituencies = utils.get_county_constituencies(request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(constituencies, request)
        serializer = ConstituenciesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetConstituencyDetails":
        country = utils.get_constituenct_details(request.data)
        if country:
            serializer = ConstituenciesSerializer(
                country, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Constituency retrieved successfully", serializer.data, "county"
            )
        else:
            return custom_error_response(1, "Constituency could not be retrieved")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
def clustersAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetClusters":
        """Get all clusters"""

        clusters = utils.get_clusters()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(clusters, request)
        serializer = ClustersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    # elif request.data["action"] == "GetClusterDetails":
    #     country = utils.get_county_details(request.data)
    #     if country:
    #         serializer = CountiesSerializer(
    #             country, many=False, context={"request": request}
    #         )
    #         return custom_success_message(
    #             0, "County retrieved successfully", serializer.data, "county"
    #         )

    #     else:
    #         return custom_error_response(1, "County could not be retrieved")

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


class SelfRegisterView(CreateModelMixin, generics.GenericAPIView):
    """
    UC42: Register User
    """

    serializer_class = RegisterSerializer
    renderer_classes = (UserRenderer,)
    parser_classes = (MultiPartParser, FormParser)

    @transaction.atomic
    def post(self, request):
        errors=[]
        user_obj = None
        authenticated_user = None
        phone =request.data['phone']
        email =request.data['email']
        identifier_number =request.data['identifier_number']
        default_entity = models.Entities.objects.get(
                     title="WAZIPOS"
                )
        create_log("info",f"{default_entity}")
        password = request.data['password']
        if phone and  models.Users.objects.filter(phone=phone).exists():
            errors.append("Phone is already in use")
        if email and models.Users.objects.filter(email=email).exists():
            errors.append("Email is already in use")

        if identifier_number and models.Users.objects.filter(identifier_number=identifier_number).exists():
            errors.append("User identifier number is already in use")

        if len(errors)>0:
            return JsonResponse(
                        {
                                "response_code": 1,
                                "response_message": "User not created",
                                "errors": errors,
                            
                            },
                
                        )
      
        
        # sms_endpoint = request.data['sms_endpoint']
        # api_key = request.data['api_key']
        
        images = request.FILES.getlist("images")
        documents = request.FILES.getlist("documents")
        if images and len(images) > 0 or documents and len(documents) > 0:
            # request.data.pop("images")
            user = request.data


            
            serializer = self.serializer_class(data=user, context={"request": request})
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid(raise_exception=True):
                create_log("info",f"With images : {images}")
                serializer.save(entity=default_entity)
                user_data = serializer.data

                # Retrieve user from database


                user = models.Users.objects.get(email=user_data["email"])
                user.set_password(password)
                user.entity=default_entity
                user.save()
                authenticated_user = authenticate(phone_or_email=phone, password=password)
                # if authenticated_user:
                #     sent = sms_utils.send_sms_code(authenticated_user)
                # else:
                #     print("No auth user 2")
                # Generate token
                token = RefreshToken.for_user(user).access_token

                uploaded_images = []
                for image in images:
                    content = models.UserImages.objects.create(
                        owner=user, image=image,
                    )
                    uploaded_images.append(content)

                user.images.add(*uploaded_images)
                context = serializer.data
                context["images"] = [image.id for image in uploaded_images]

                uploaded_documents = []
                for document in documents:
                    content = models.UserDocuments.objects.create(
                        owner=user,
                        document=document,
                    )
                    uploaded_documents.append(content)

                user.documents.add(*uploaded_documents)
                context = serializer.data
                context["documents"] = [document.id for document in uploaded_documents]

                # Get current site
                current_site = get_current_site(request).domain
                relativeLink = reverse("email-verify")

                # generate absolute url
                absurl = (
                    "http://" + current_site + relativeLink + "?token=" + str(token)
                )

                email_body = f"Your Wazipos account has been created. Your password is {password} . Do not share your password with any other person."
        
    
                data = {
                        "email_body": email_body,
                        "to_email": user.email,
                        "email_subject": "Succesful Wazipos Account Creation",
                    }

                utils.Util.send_email(data)

                # Send sms
                telco, phone_number = get_telco_by_phone_number(user.phone)
                message =f"Your Wazipos account has been created. Your password is {password} . Do not share your password with any other person."
                payload = {
                        "contact" : phone_number,
                        "message" : message,
                        "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                        "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                    }
        
                errors, sent = send_swift_sms(payload)
                # email_body = (
                #     "Hi "
                #     + user.first_name
                #     + " "
                #     + user.last_name
                #     + " Use link below to verify your email \n"
                #     + absurl
                # )
                # data = {
                #     "email_body": email_body,
                #     "to_email": user.email,
                #     "email_subject": "Verify your email address",
                # }

                # utils.Util.send_email(data)

                # time_otp = sms_utils.generate_otp(user)
                # message =f"Mobiticket verification OTP {time_otp}.You or your agent should use it to activate your account. Your secret password is {password}. PLease donT share password with anyone"
                # payload = {
                #         "contact" : user.phone,
                #         "message" : message,
                #         "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                #         "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                #     }
        
                # errors, sent = send_swift_sms(payload)
                # data = {
                #     "email_body": email_body,
                #     "to_email": user.email,
                #     "email_subject": "Verify your email address",
                # }

                # utils.Util.send_email(data)
                # sent = sms_utils.send_sms_code(user)

                errors_messages = []

                errors_messages = []

                return JsonResponse(
                    data={
                        "response_code": 0,
                        "response_message": "User succesfully created",
                        "user": serializer.data,
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )

            else:
                create_log("info",f"No images : {images}")
                default_errors = serializer.errors  # default errors dict
                errors_messages = []
                for field_name, field_errors in default_errors.items():
                    for field_error in field_errors:
                        error_message = "%s: %s" % (field_name, field_error)
                        errors_messages.append(error_message)

                return JsonResponse(
                    {
                        "response_code": 1,
                        "response_message": "User not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        else:
            user = request.data


            serializer = self.serializer_class(data=user, context={"request": request})
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                serializer.save(entity=default_entity)
                user_data = serializer.data

                # Retrieve user from database
                user = models.Users.objects.get(email=user_data["email"])
                user.set_password(password)
                user.save()
                user_obj = models.Users.objects.get(email=user_data["email"])
                # Generate token
                token = RefreshToken.for_user(user).access_token
                # Get current site
                # TODO: Ensure current site settings have been updated in the django admin panel
                current_site = get_current_site(request).domain
                # current_site = 'wazipos.com'
                relativeLink = reverse("email-verify")
                # generate absolute url
                absurl = (
                    "https://" + current_site + relativeLink + "?token=" + str(token)
                )

                email_body = f"Your Wazipos account has been created. Your password is {password} . Do not share your password with any other person."
        
    
                data = {
                        "email_body": email_body,
                        "to_email": user.email,
                        "email_subject": "Succesful Wazipos Account Creation",
                    }

                utils.Util.send_email(data)

                # Send sms
                telco, phone_number = get_telco_by_phone_number(user.phone)
                message =f"Your Wazipos account has been created. Your password is {password} . Do not share your password with any other person."
                payload = {
                        "contact" : phone_number,
                        "message" : message,
                        "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                        "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                    }
        
                errors, sent = send_swift_sms(payload)
              

                errors_messages = []

                authenticated_user = authenticate(phone_or_email=phone, password=password)
                # if authenticated_user:
                #     sent = sms_utils.send_sms_code(authenticated_user)
                # else:
                #     print("No auth user 2")
                return JsonResponse(
                    data={
                        "response_code": 0,
                        "response_message": "User succesfully created",
                        "user": serializer.data,
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

                return JsonResponse(
                    data={
                        "response_code": 1,
                        "response_message": "User not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )


class EntityRegisterView(CreateModelMixin, generics.GenericAPIView):
    """
    Register User user by admin
    """

    serializer_class = EntityRegisterSerializer
    renderer_classes = (UserRenderer,)
    parser_classes = (MultiPartParser, FormParser)

    @transaction.atomic
    def post(self, request):
        user_obj = None
     
        # sms_endpoint = request.data['sms_endpoint']
        # api_key = request.data['api_key']
        
        images = request.FILES.getlist("images")
        documents = request.FILES.getlist("documents")
        if images and len(images) > 0 or documents and len(documents) > 0:
            # request.data.pop("images")
            user = request.data
            serializer = self.serializer_class(data=user, context={"request": request})
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid(raise_exception=True):
                serializer.save()
                user_data = serializer.data
                # Retrieve user from database
                entity = user_data['entity']
                user = models.Users.objects.get(email=user_data["email"])
                user.entity=request.user.entity
                user.owner=request.user
                user.save()
                # sent = sms_utils.send_sms_code(user)
                # sent = sms_utils.send_password(user, request.data['password'])
                # Generate token
                token = RefreshToken.for_user(user).access_token

                uploaded_images = []
                for image in images:
                    content = models.UserImages.objects.create(
                        owner=user, image=image, 
                    )
                    uploaded_images.append(content)

                user.images.add(*uploaded_images)
                context = serializer.data
                context["images"] = [image.id for image in uploaded_images]

                uploaded_documents = []
                for document in documents:
                    content = models.UserDocuments.objects.create(
                        owner=user,
                        document=document,
                    )
                    uploaded_documents.append(content)

                user.documents.add(*uploaded_documents)
                context = serializer.data
                context["documents"] = [document.id for document in uploaded_documents]

                # Get current site
                current_site = get_current_site(request).domain
                relativeLink = reverse("email-verify")

                # generate absolute url
                absurl = (
                    "http://" + current_site + relativeLink + "?token=" + str(token)
                )
                email_body = (
                    "Hi "
                    + user.first_name
                    + " "
                    + user.last_name
                    + " Use link below to verify your email \n"
                    + absurl
                )
                data = {
                    "email_body": email_body,
                    "to_email": user.email,
                    "email_subject": "Verify your email address",
                }

                utils.Util.send_email(data)
                sent = sms_utils.send_sms_code(user)

                errors_messages = []

                errors_messages = []

                return JsonResponse(
                    data={
                        "response_code": 0,
                        "response_message": "User succesfully created",
                        "user": serializer.data,
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

                return JsonResponse(
                    {
                        "response_code": 1,
                        "response_message": "User not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        else:
            user = request.data

            serializer = self.serializer_class(data=user, context={"request": request})
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                serializer.save()
                user_data = serializer.data
                entity = user_data['entity']
               
                # Retrieve user from database
                user = models.Users.objects.get(email=user_data["email"])
                user_obj = models.Users.objects.get(email=user_data["email"])
                user.entity=request.user.entity
                user.owner=request.user
                user.save()
                # Generate token
                token = RefreshToken.for_user(user).access_token
                # Get current site
                # TODO: Ensure current site settings have been updated in the django admin panel
                current_site = get_current_site(request).domain
                # current_site = 'wazipos.com'
                relativeLink = reverse("email-verify")
                # generate absolute url
                absurl = (
                    "https://" + current_site + relativeLink + "?token=" + str(token)
                )
                email_body = (
                    "Hi "
                    + user.first_name
                    + " "
                    + user.last_name
                    + " Use link below to verify your email \n"
                    + absurl
                )
                data = {
                    "email_body": email_body,
                    "to_email": user.email,
                    "email_subject": "Verify your email address",
                }

                utils.Util.send_email(data)

                errors_messages = []
                # sent = sms_utils.send_sms_code(user)
                # sent = sms_utils.send_password(user, request.data['password'])
                return JsonResponse(
                    data={
                        "response_code": 0,
                        "response_message": "User succesfully created",
                        "user": serializer.data,
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

                return JsonResponse(
                    data={
                        "response_code": 1,
                        "response_message": "User not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )


class ShopFrontAPIView(generics.GenericAPIView):
    def get_serializer_class(self):
        return super().get_serializer_class()

    def post(self, request):
        user=None
        decrypted_data = ""
        token = request.data.get("token")
        print("Token",token)
        if token:
            decrypted_data= decrypt(token)
        print("Dec",decrypted_data)

        splitted = decrypted_data.split(':')

        user = authenticate(phone_or_email=splitted[0], password=splitted[1])
        # roles = []

        if user:
            # Retrieve only roles a user is currently assigned to and append to the login payload



            decodeJTW = jwt.decode(
            user.tokens()["access"], config("SECRET_KEY"), algorithms=["HS256"]
                
            )
           

            return JsonResponse(
                data={
                    "tokens": user.tokens(),
                    "expires":decodeJTW['exp'],
                    "response_code": 0,
                    "response_message": "Log in was succesful",
                    "entity":{
                    "entity": user.entity.id,
                    "entity_title":user.entity.title,
                    "country_title":user.country.title,
                    "town":user.entity.town
                    }
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
                status=status.HTTP_400_BAD_REQUEST,
            )


class SendOTPAPIView(generics.GenericAPIView):
    def get_serializer_class(self):
        return super().get_serializer_class()

    def post(self, request):
        phone = request.data.get("phone")
        password = request.data.get("password")
        user = authenticate(phone_or_email=phone, password=password)
        if user:
            sent = sms_utils.send_sms_code(user)
            if sent:
                return JsonResponse(
                        data={
                            "response_code": 0,
                            "response_message": "OTP sent succesfully"
                
                        },
                        status=status.HTTP_200_OK,
                    )
            else:
                return JsonResponse(
                        data={
                            "response_code": 1,
                            "response_message": "OTP sending failed"
                
                        },
                        status=status.HTTP_200_OK,
                    )
        else:
            return JsonResponse(
                        data={
                            "response_code": 1,
                            "response_message": "Check user credentials"
                        },
                        status=status.HTTP_200_OK,
                    )

class SendEmailPasswordAPIView(generics.GenericAPIView):

    def post(self, request):
        print("DT", request.data)
        user =None
        email=None
        if not "email" in request.data or request.data["email"]=="":
            return JsonResponse(
                            data={
                                "response_code": 1,
                                "response_message": "Email address is required"
                    
                            },
                            status=status.HTTP_200_OK,
                        )
        else:
            email_input = request.data["email"]
            print("email_input",email_input)
            # validated_email = check_email_validity(email_input)

            # print("validated_email",validated_email)

            if email_input:
                # from core.utils import generate_password
                if models.Users.objects.filter(email=email_input).exists():
                    user =  models.Users.objects.filter(email=email_input).first()
                    create_log("user",user)
                    password = generate_password()
                    print("user",user)
                    print("password",password)
                    user.set_password(password)
                    user.save()

                    email_body = f"Your Wazipos pawword is {password}"
                   
                
                    data = {
                            "email_body": email_body,
                            "to_email": user.email,
                            "email_subject": "Wazipos Password  Reset",
                        }

                    utils.Util.send_email(data)
                    return JsonResponse(
                                data={
                                    "response_code": 1,
                                    "response_message": "Your password has been sent to email"
                        
                                },
                                status=status.HTTP_200_OK,
                            )

                else:
                    return JsonResponse(
                        data={
                            "response_code": 1,
                            "response_message": "No user with provided"
                
                        },
                        status=status.HTTP_200_OK,
                    )
            else:
                return JsonResponse(
                        data={
                            "response_code": 1,
                            "response_message": "Email is nt valid"
                
                        },
                        status=status.HTTP_200_OK,
                    )



class SendPasswordAPIView(generics.GenericAPIView):

    def post(self, request):
        user =None
        phone=None
        if not "phone" in request.data or request.data["phone"]=="":
            return JsonResponse(
                            data={
                                "response_code": 1,
                                "response_message": "Phone number is required"
                    
                            },
                            status=status.HTTP_200_OK,
                        )
        telco, phone_number = get_telco_by_phone_number(request.data["phone"])
        print("phone_number",phone_number)
        print("telco",telco)
        if phone_number:
            if models.Users.objects.filter(phone=phone_number).exists():
                today = datetime.date.today()
                next_day = today+ datetime.timedelta(days=1)
                if models.PasswordResets.objects.filter(created__gte=today, created__lt=next_day).count()>3:
                    return JsonResponse(
                                data={
                                    "response_code": 1,
                                    "response_message": "You have exceeded your daily password reset limit. Please contact support for frther assistance"
                        
                                },
                                status=status.HTTP_200_OK,
                            )

                user=models.Users.objects.filter(phone=phone_number).first()
                print("user",user)
                if user:
                    user_with_new_password = sms_utils.send_new_password(user)
                    if user_with_new_password:
                        models.PasswordResets.objects.create(user=user,entity=user.entity)
                        return JsonResponse(
                                data={
                                    "response_code": 0,
                                    "response_message": "Secret sent succesfully"
                        
                                },
                                status=status.HTTP_200_OK,
                            )
                    else:
                        return JsonResponse(
                                data={
                                    "response_code": 1,
                                    "response_message": "Secret sending failed"
                        
                                },
                                status=status.HTTP_200_OK,
                            )
                else:
                    return JsonResponse(
                                data={
                                    "response_code": 1,
                                    "response_message": "Check user credentials"
                                },
                                status=status.HTTP_200_OK,
                            )

            else:
                return JsonResponse(
                    data={
                        "response_code": 1,
                        "response_message": "User with provided phone number not found"
            
                    },
                    status=status.HTTP_200_OK,
                )

        else:
            return JsonResponse(
                                data={
                                    "response_code": 1,
                                    "response_message": "Phone number not validated"
                        
                                },
                                status=status.HTTP_200_OK,
                            )

class VerifyOTPAPIView(generics.GenericAPIView):
    def get_serializer_class(self):
        return super().get_serializer_class()

    def post(self, request):
        validate=None
        phone = request.data.get("phone")
        otp = request.data.get("otp")
        password = request.data.get("password")
        print("password", password)
        print("phone", phone)
        user = authenticate(phone_or_email=phone, password=password)
        if user:
            try:    
                validate = user.authenticate(int(otp))
            except Exception as e:
                print("Error at OPT")
                print("error at verify otp", e)

            try:

                if validate:
                    user_with_new_password = sms_utils.send_new_password(user)
                    if user_with_new_password:
                        user.phone_otp_verified = "true"
                        user.is_verified = "true"
                        user.save()
                        return JsonResponse(
                            data={
                                "response_code": 0,
                                "response_message": "OTP verified succesfully",
                                "user": UsersSerializer(
                                    user, many=False, context={"request": request}
                                ).data
                    
                            },
                            status=status.HTTP_200_OK,
                        )
                    else:
                        return JsonResponse(
                            data={
                                "response_code": 1,
                                "response_message": "OTP verification failed",
                          
                    
                            },
                            status=status.HTTP_200_OK,
                        )


                else:
                    return JsonResponse(
                        data={
                            "response_code": 1,
                            "response_message": "OTP could not be validated",
                    
                        },
                        status=status.HTTP_200_OK,
                    )
            except Exception as e:
                print("Exception", str(e))
        else:
            return JsonResponse(
                data={
                    "response_code": 2,
                    "response_message": "Check your credentials",
                },
                status=status.HTTP_200_OK,
            )
def is_valid_email(email):

    """Check if the email is a valid format."""

    # Regular expression for validating an Email

    regex = r'^[a-z0-9]+[\._]?[a-z0-9]+[@]\w+[.]\w+$'

    # If the string matches the regex, it is a valid email

    if re.match(regex, email):

        return True

    else:

        return False



class LoginAPIView(generics.GenericAPIView):
    
    def get_serializer_class(self):
        return super().get_serializer_class()

    def post(self, request):
        entered_email = ""
        entered_phone_number=""
        user = None
        phone_or_email = None
        password = None

        current_employment = None
        if not "password" in request.data or request.data["password"]=="":
            return JsonResponse(
                data={
                    "response_code": 1,
                    "response_message": "Password is required"
                },
                status=status.HTTP_200_OK,
            )
        else:
            password = request.data.get("password")
        if not "phone_or_email" in request.data or not request.data["phone_or_email"]=="":
            phone_or_email = request.data.get("phone_or_email")
        else:
            return JsonResponse(
                data={
                    "response_code": 1,
                    "response_message": "Phone or email is required"
                },
                status=status.HTTP_200_OK,
            )
        # username = phone_or_email
        # if is_valid_email(phone_or_email):
        #     username = phone_or_email
        #     entered_email = phone_or_email
        #     create_log("info", "Loging in with "+entered_email)

        # else:
        #     telco, phone_number = get_telco_by_phone_number(phone_or_email)
        #     if phone_number:
        #         username = phone_number
        #         entered_phone_number= phone_number
        #         create_log("info", "Loging in with "+entered_phone_number)
                
        # password = request.data.get("password")
        user = authenticate(phone_or_email=phone_or_email, password=password)


        roles = []
        if user:
            if not entered_email=="" and  user.is_email_verified=="false":

                return JsonResponse(
                    data={
                        "response_code": 1,
                        "response_message": "Your email address is not verified. Login to your email to complete verification",
                    },
                    status=status.HTTP_200_OK
                )
            else:
                create_log("info", "email: "+entered_email)

            if  not entered_phone_number=="" and user.phone_otp_verified=="false":
                time_otp = sms_utils.generate_otp(user)
                message =f"Mobiticket verification OTP {time_otp}."
                payload = {
                        "contact" : user.phone,
                        "message" : message,
                        "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                        "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                    }
            
                errors, sent = send_swift_sms(payload)
                # return JsonResponse(
                #     data={
                #         "response_code": 2,
                #         "response_message": "Your phone number is not OTP verified. ",
                #     },
                #     status=status.HTTP_200_OK
                # )
            
            else:
                create_log("info", "phone: "+ entered_phone_number)

        if user:

            suspended="false"
            # today = datetime.datetime.today()
            # now = datetime.datetime.now()
            # today = datetime.date.today()
            # registration_paid = user.entity.registration_fee_paid
            # offer_trial = user.entity.offer_trial
            # trial_from = user.entity.trial_from
            # trial_to = user.entity.trial_to
            # if trial_to:
            #     if today>trial_to:
            #         suspended="true"
        
            # print("User is verified: ",user.is_verified)
            # if  user.phone_otp_verified=="false":
            #     return JsonResponse(
            #     data={
            #         "response_code": 2,
            #         "response_message": "Your profile is not yet verified by admin",
            #     },
            #     status=status.HTTP_200_OK
            # )
            # if  user.phone_otp_verified=="false":
            #     return JsonResponse(
            #     data={
            #         "response_code": 2,
            #         "response_message": "Please verify phone number via OTP",
            #     },
            #     status=status.HTTP_200_OK
            # )

            # Retrieve only roles a user is currently assigned to and append to the login payload

            if user.is_staff:
                role = models.Roles.objects.filter(value="Admin").first()
                roles.append(role)

            else:
                user_roles = user.roles.all().filter(entity=user.entity)
                for user_role in user_roles:
                    roles.append(user_role)
                role = models.Roles.objects.filter(value="Client").first()
                roles.append(role)

            login(request, user)

            decodeJTW = jwt.decode(
            user.tokens()["access"], config("SECRET_KEY"), algorithms=["HS256"]
                
            )
            print("Decodec JWTS", str(decodeJTW['exp']))
            data={
                    "tokens": user.tokens(),
                    "expires":decodeJTW['exp'],
                    "response_code": 0,
                    "response_message": "Log in was succesful",

                    "user": UsersSerializer(
                        user, many=False, context={"request": request}
                    ).data
              
                }

            # if user.entity.registration_fee_paid and user.entity.registration_fee_paid=="false":
            #     data={
            #         "tokens": user.tokens(),
            #         "expires":decodeJTW['exp'],
            #         "response_code": 0,
            #         "response_message": "Log in was succesful",
            #         "registration_paid":registration_paid,
            #         "trial_from":trial_from,
            #         "trial_to":trial_to,
            #         "offer_trial":offer_trial,
            #         "suspended":suspended,
            #         "user": UsersSerializer(
            #             user, many=False, context={"request": request}
            #         ).data
              
            #     },
            # else:
            #     data={
            #         "tokens": user.tokens(),
            #         "expires":decodeJTW['exp'],
            #         "response_code": 0,
            #         "response_message": "Log in was succesful",

            #         "user": UsersSerializer(
            #             user, many=False, context={"request": request}
            #         ).data
              
            #     },

            return JsonResponse(
                data,
                safe=False,
                status=status.HTTP_200_OK,
            )

        else:
            return JsonResponse(
                data={
                    "response_code": 1,
                    "response_message": "Invalid or unverified credentials or user doesnt exist",
                },
                status=status.HTTP_200_OK,
            )


class VerifyEmail(views.APIView):
    """Verify user email"""

    serializer_class = EmailVerificationSerializer
    token_param_config = openapi.Parameter(
        "token",
        in_=openapi.IN_QUERY,
        description="Description",
        type=openapi.TYPE_STRING,
    )

    @swagger_auto_schema(manual_parameters=[token_param_config])
    def get(self, request):
        token = request.GET.get("token")
        print(token)
        try:
            payload = jwt.decode(
                jwt=token, key=settings.SECRET_KEY, algorithms=["HS256"]
            )
            user = models.Users.objects.get(id=payload["user_id"])
            if not user.is_email_verified:
                user.is_email_verified = "true"
                user.is_verified = "true"
                user.save()
            return Response(
                {"email": "Successfully activated"}, status=status.HTTP_200_OK
            )
        except jwt.ExpiredSignatureError as identifier:
            return Response(
                {"error": "Activation link is expired"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except jwt.exceptions.DecodeError as identifier:
            return Response(
                {"error": "Invalid token. Please request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class TokenUpdateAPIView(generics.RetrieveUpdateAPIView):
    name = "user-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = UsersSerializer

    def get_object(self):
        return self.request.user


class RequestPasswordResetEmail(generics.GenericAPIView):
    serializer_class = ResetPasswordEmailRequestSerializer

    def post(self, request):
        serializer = self.serializer_class(data=request.data)

        email = request.data["email"]
        if models.Users.objects.filter(email=email).exists():
            user = models.Users.objects.get(email=email)
            uidb64 = urlsafe_base64_encode(smart_bytes(user.id))
            token = PasswordResetTokenGenerator().make_token(user)
            current_site = get_current_site(request=request).domain
            relativeLink = reverse(
                "password-reset-confirm", kwargs={"uidb64": uidb64, "token": token}
            )

            # generate absolute url
            absurl = "http://" + current_site + relativeLink
            email_body = "Hello,\n  Use link below to reset your password \n" + absurl
            data = {
                "email_body": email_body,
                "to_email": user.email,
                "email_subject": "Reset your password",
            }

            utils.Util.send_email(data)
        return Response(
            {"success": "We have sent you a link to reset your password"},
            status=status.HTTP_200_OK,
        )


class PasswordTokenCheckAPI(generics.GenericAPIView):
    serializer_class = PhoneLoginSerializer

    def get(self, request, uidb64, token):
        print("uidb64",uidb64)
        print("token",token)
        user=None
        try:
            id = smart_str(urlsafe_base64_decode(uidb64))
            user = models.Users.objects.get(id=id)

            if not PasswordResetTokenGenerator().check_token(user,token):
                return Response(
                    {"error": "Token is no longer valid"},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            return Response(
                {
                    "success": True,
                    "message": "Credentials are valid",
                    "uidb64": uidb64,
                    "token": token,
                },
                status=status.HTTP_200_OK,
            )

        except DjangoUnicodeDecodeError as e:
            print("error",e)
            # if PasswordResetTokenGenerator().check_token(user,token):
            return Response(
                    {"error": "Token is no longer valid. Please request a new one"},
                    status=status.HTTP_401_UNAUTHORIZED,
                )


class PhoneLoginSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(max_length=255, min_length=3, read_only=True)
    password = serializers.CharField(max_length=68, min_length=6, write_only=True)
    id = serializers.CharField(max_length=255, min_length=3, read_only=True)
    notification_token = serializers.CharField(
        max_length=255, min_length=3, read_only=True
    )
    is_staff = serializers.BooleanField(read_only=True)
    is_searchable = serializers.BooleanField(read_only=True)
    phone = serializers.CharField(
        max_length=20,
        min_length=3,
    )
    first_name = serializers.CharField(max_length=100, min_length=3, read_only=True)
    last_name = serializers.CharField(max_length=100, min_length=3, read_only=True)
    date_of_birth = serializers.CharField(max_length=255, min_length=3, read_only=True)
    entity = serializers.CharField(max_length=255, min_length=3, read_only=True)
    roles = RolesSerializer(read_only=True, many=True)
    tokens = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    wallets = serializers.SerializerMethodField(read_only=True)
    entities = serializers.SerializerMethodField(read_only=True)
    user_details = serializers.SerializerMethodField(read_only=True)
    entity_details = serializers.SerializerMethodField(read_only=True)
    profile_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Users
        fields = [
            "id",
            "email",
            "password",
            "phone",
            "first_name",
            "last_name",
            "date_of_birth",
            "entity",
            "is_staff",
            "is_searchable",
            "is_profile_verified",
            "roles",
            "tokens",
            "entities",
            "wallets",
            "images",
            "user_details",
            "entity_details",
            "profile_details",
            "notification_token",
        ]
        read_only_fields = [
            "is_profile_verified",
        ]

    def get_entities(self, obj):
        user = models.Users.objects.get(email=obj["email"])
        if not user.is_staff:
            entities = models.Entities.objects.filter(owner=user)
            if entities.count() > 0:
                # for entity in entities:
                    # if models.Roles.objects.filter(
                    #     value="RETAIL_SUPER_ADMIN", entity=entity.id
                    # ).exists():
                    #     roles = models.Roles.objects.get(
                    #         value="RETAIL_SUPER_ADMIN", entity=entity.id
                    #     )
                    #     user.roles.add(roles)
                    #     user.save()

                return EntitySerializer(entities, context=self.context, many=True).data
            else:
                return None
        return None

    def get_user_details(self, obj):
        user = models.Users.objects.get(email=obj["email"])
        return GenericUserSerializer(
            user,
            context=self.context,
        ).data

    def get_entity_details(self, obj):
        user = models.Users.objects.get(email=obj["email"])
        entity = models.Entities.objects.get(id=user.entity_id)

        return EntitySerializer(
            entity,
            context=self.context,
        ).data

    def get_images(self, obj):
        user = models.Users.objects.get(email=obj["email"])
        image = models.UserImages.objects.filter(owner=user)

        return UserImageSerializer(image, context=self.context, many=True).data

    def get_profile_details(self, obj):
        user = models.Users.objects.get(email=obj["email"])
        if models.Profiles.objects.filter(owner=user).count() > 0:
            profile = models.Profiles.objects.get(owner=user)
            return ProfilesSerializer(
                profile,
                context=self.context,
            ).data
        else:
            return None

    def get_tokens(self, obj):
        # Pass the default client role

        user = models.Users.objects.get(email=obj["email"])
        if not user.is_staff:
            role = models.Roles.objects.get(value="Client")
            if role:
                user.roles.add(role)
                user.save()
                # raise exceptions.ValidationError(f"{roles}")
            else:
                pass

        return {
            "access": user.tokens()["access"],
            "refresh": user.tokens()["refresh"],
        }

    def validate(self, attrs):
        phone = attrs.get("phone", "")
        password = attrs.get("password", "")

        user = auth.authenticate(phone=phone, password=password)
        if not user:
            raise exceptions.ValidationError(
                "No user was retrieved for provided details. Enter new details and try again."
            )

        if not user.is_active:
            raise exceptions.ValidationError("models.Wallets not active. Contact admin")
        # if not user.is_verified:
        #     raise serializers.ValidationError(
        #         'Email is not verified. Log in to your email to verify')

        if user.notification_token:
            utils.send_message(
                user.notification_token, "Hey there", "You are logged in!!"
            )
        return {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "date_of_birth": user.date_of_birth,
            "phone": user.phone,
            "entity": user.entity,
            "is_staff": user.is_staff,
            "is_active": user.is_active,
            "is_searchable": user.is_searchable,
            "is_profile_verified": user.is_profile_verified,
            "tokens": user.tokens(),
            "entities": "entities",
            "wallets": "wallets",
            "roles": user.roles,
            "rights": "rights",
            "notification_token": user.notification_token,
        }


class SetNewPasswordAPIView(generics.GenericAPIView):
    serializer_class = SetNewPasswordSerializer

    def patch(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            {"success": True, "message": "Password reset successfully"},
            status=status.HTTP_200_OK,
        )


class EntityImagesUploadAPIView(generics.RetrieveUpdateAPIView):
    """
    Update entity with pdf
    """

    name = "entity-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = EntitySerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.Entities.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update entity with new images
        """
        entity = None
        entity_id = self.kwargs.get("pk")

        if entity_id and models.Entities.objects.filter(id=entity_id).exists():
            entity = models.Entities.objects.filter(id=entity_id).first()
        else:
            raise exceptions.ValidationError("No entity with the provided ID exists")
        if not request.user.id == entity.owner.id:
            raise exceptions.ValidationError(
                "You can only upload documents for your business"
            )

        # Exclude users with pending documents
        if models.EntityImages.objects.filter(owner=request.user).count() > 10:
            raise exceptions.ValidationError("Not more than 10 uploads permitted")
        else:
            pass
        if not "images" in request.data or len(request.data["images"]) < 2:
            raise exceptions.ValidationError("No image attached")
        else:
            files = request.FILES.getlist("images")

        user_id = self.kwargs.get("pk")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = EntitySerializer(instance, context=serializer_context)
        if files and len(files) < 1:
            raise exceptions.ValidationError("No image is attached")
        else:
            uploaded_files = []
            for file in files:
                content = models.EntityImages.objects.create(
                    image=file, owner=request.user, entity=entity
                )
                uploaded_files.append(content)

            instance.images.add(*uploaded_files)
            context = serializer.data
            context["images"] = [file.id for file in uploaded_files]
            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Images uploaded succesfully",
                    "entity": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj




class EntityLicencesUploadAPIView(generics.RetrieveUpdateAPIView):
    """
    Update entity with pdf
    """

    name = "entity-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = EntitySerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.Entities.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update user with new documents
        """
        licence_number = None
        licence_type = None
        entity = None
        entity_id = self.kwargs.get("pk")

        if entity_id and models.Entities.objects.filter(id=entity_id).exists():
            entity = models.Entities.objects.filter(id=entity_id).first()
        else:
            raise exceptions.ValidationError("No entity with the provided ID exists")
        if not request.user.id == entity.owner.id:
            raise exceptions.ValidationError(
                "You can only upload documents for your business"
            )

        # Exclude users with pending documents
        if (
            models.EntityLicences.objects.filter(
                owner=request.user, is_verified="false"
            ).count()
            > 10
        ):
            raise exceptions.ValidationError("Not more than 10 uploads permitted")
        if "licence_number" in request.data:
            licence_number = request.data["licence_number"]
        if "licence_type" in request.data:
            licence_type = request.data["licence_type"]
        if not "licences" in request.data or len(request.data["licences"]) < 2:
            raise exceptions.ValidationError(
                "At least one licence page photo must be attached"
            )
        else:
            files = request.FILES.getlist("licences")

        user_id = self.kwargs.get("pk")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = EntitySerializer(instance, context=serializer_context)
        if files and len(files) < 1:
            raise exceptions.ValidationError(
                "At least one page of the licence is required"
            )
        else:
            uploaded_files = []
            for file in files:
                content = models.EntityLicences.objects.create(
                    licence=file,
                    owner=request.user,
                    licence_type=licence_type,
                    licence_number=licence_number,
                    entity=entity,
                )
                uploaded_files.append(content)

            instance.licences.add(*uploaded_files)
            context = serializer.data
            context["licences"] = [file.id for file in uploaded_files]
            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Licence uploaded succesfully",
                    "entity": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

    # def update(self, request, *args, **kwargs):
    #     """
    #     Update entity with new documents
    #     """
    #     files = request.FILES.getlist("licences")
    #     entity_id = self.kwargs.get("pk")
    #     instance = self.get_object()
    #     serializer_context = {
    #         "request": request,
    #     }
    #     serializer = EntitySerializer(instance, context=serializer_context)
    #     if files:
    #         uploaded_files = []
    #         for file in files:
    #             content = models.EntityLicences.objects.create(
    #                 owner=request.user,
    #                 licence=file,
    #                 entity_id=entity_id,
    #             )
    #             uploaded_files.append(content)

    #         instance.licences.add(*uploaded_files)
    #         context = serializer.data
    #         context["licences"] = [file.id for file in uploaded_files]

    #     data = request.data
    #     return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class EntityLogosUploadAPIView(generics.RetrieveUpdateAPIView):
    """
    Update logo
    """

    name = "entity-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = EntitySerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.Entities.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update entity with new images
        """
        entity = None
        entity_id = self.kwargs.get("pk")

        if entity_id and models.Entities.objects.filter(id=entity_id).exists():
            entity = models.Entities.objects.filter(id=entity_id).first()
        else:
            raise exceptions.ValidationError("No entity with the provided ID exists")
        # if not request.user.entity == entity:
        #     raise exceptions.ValidationError(
        #         "You can only upload logos for your business"
        #     )

        # Exclude users with pending documents
        if models.EntityLogos.objects.filter(entity=request.user.entity).count() > 3:
            raise exceptions.ValidationError("Not more than 3 logo uploads is permitted")
        else:
            pass
        if not "logos" in request.data or len(request.data["logos"]) < 1:
            raise exceptions.ValidationError("No logo image is attached")
        else:
            files = request.FILES.getlist("logos")

        user_id = self.kwargs.get("pk")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = EntitySerializer(instance, context=serializer_context)
        if files and len(files) < 1:
            raise exceptions.ValidationError("No image is attached")
        else:
            uploaded_files = []
            for file in files:
                content = models.EntityLogos.objects.create(
                    logo=file, owner=request.user, entity=entity
                )
                uploaded_files.append(content)

            instance.logos.add(*uploaded_files)
            context = serializer.data
            context["logos"] = [file.id for file in uploaded_files]
            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Logo uploaded succesfully",
                    "entity": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj



class UserDocumentsUploadAPIView(generics.RetrieveUpdateAPIView):
    """
    Update entity with pdf
    """

    name = "users-detail"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = UsersSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.Users.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update user with new documents
        """
        errors = []
        document_number = None
        document_type = None
        user_id = self.kwargs.get("pk")

        if not user_id == request.user.id:
            errors.append("Not authorized profile other than yours")
            return custom_errors_response(1, "Upload failed", errors)

        # Exclude verified users
        if request.user.is_staff:
            errors.append("Not for administrators")
            return custom_errors_response(1, "Upload failed", errors)
        # if request.user.is_verified == "true":
        #     raise exceptions.ValidationError("You are already verified")

        # Exclude users with pending documents
        if (
            UserDocuments.objects.filter(
                owner=request.user, is_verified="false"
            ).count()
            > 5
        ):
            errors.append("You have uploaded documents awaiting verification")
            return custom_errors_response(1, "Upload failed", errors)


        if (
            not "document_number" in request.data
            or request.data["document_number"] == ""
        ):
            errors.append("Document number is required")
        else:
            document_number = request.data["document_number"]
        if not "document_type" in request.data or request.data["document_type"] == "":
            errors.append("Document type is required")
        else:
            document_type = request.data["document_type"]
        if not "documents" in request.data or len(request.data["documents"]) < 2:
            errors.append("At least one document must be attached")

        if len(errors) > 0:
            return custom_errors_response(1, "Upload failed", errors)

        files = request.FILES.getlist("documents")
        if files and len(files) < 2:
            errors.append("At least two pages of the document are required")
            return custom_errors_response(1, "Upload failed", errors)

        user_id = self.kwargs.get("pk")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = UsersSerializer(instance, context=serializer_context)

        uploaded_files = []
        for file in files:
            content = models.UserDocuments.objects.create(
                document=file,
                owner_id=user_id,
                document_type=document_type,
                document_number=document_number,
            )
            uploaded_files.append(content)

        instance.documents.add(*uploaded_files)
        context = serializer.data
        instance.save()
        # Call Jamb#opay to create user profile
        context["documents"] = [file.id for file in uploaded_files]
        return Response(
            data={
                "response_code": 0,
                "response_message": "Document uploaded succesfully",
                "user": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
        # return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class UserDocumentVerifyAPIView(generics.RetrieveUpdateAPIView):
    """
    Update entity with pdf
    """

    name = "entity-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = UserDocumentsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.UserDocuments.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update entity with new documents
        """
        instance = self.get_object()
        instance.is_verified = "true"
        instance.save()
        serializer_context = {
            "request": request,
        }
        serializer = EntitySerializer(instance, context=serializer_context)

        return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class UserUpdate(generics.RetrieveUpdateAPIView):
    """
    User update
    """

    name = "user-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = RegisterSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = Users.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update user with new images
        """
        images = request.FILES.getlist("images")
        print("Image images", request.FILES)
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = RegisterSerializer(instance, context=serializer_context)
        if images and len(images) > 0:
            uploaded_images = []
            for file in images:
                content = UserImages.objects.create(
                    owner=request.user, image=file, entity=request.user.entity
                )
                uploaded_images.append(content)

            print("uploaded images", uploaded_images)

            instance.images.add(*uploaded_images)
            context = serializer.data
            context["images"] = [file.id for file in uploaded_images]

        documents = request.FILES.getlist("documents")
        print("Image documents", request.FILES)
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = RegisterSerializer(instance, context=serializer_context)
        if documents and len(documents) > 0:
            uploaded_documents = []
            for file in documents:
                content = UserDocuments.objects.create(
                    owner=request.user,
                    document=file,
                )
                uploaded_documents.append(content)

            print("uploaded documents", uploaded_documents)

            instance.documents.add(*uploaded_documents)
            context = serializer.data
            context["documents"] = [file.id for file in uploaded_documents]
        data = request.data
        # print("received data", data.get("favorite_entities", None))
        print("received data mike", data.get("entity", None))
        if data.get("favorite_entities", None):
            items = data.get("favorite_entities", None)
            instance.favorite_entities.add(data.get("favorite_entities", None))

        if data.get("entity", None):
            print("Changing to", data.get("entity", None))
            instance.entity_id = data.get("entity", None)
            instance.save()
        else:
            print("Not changed")
            pass
        print("All in all", instance.entity_id)
        instance.date_of_birth = data.get("date_of_birth", instance.date_of_birth)
        instance.first_name = data.get("first_name", instance.first_name)
        instance.last_name = data.get("last_name", instance.last_name)
        # instance.gender = data.get("gender", instance.gender)
        instance.notification_token = data.get(
            "notification_token", instance.notification_token
        )

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


class UserDetail(generics.RetrieveAPIView):
    name = "users-detail"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = UsersSerializer
    queryset = Users.objects.all()

    def get_queryset(self):
        user_id = self.kwargs.get("pk")
        return (
            super().get_queryset().filter(id=user_id, entity=self.request.user.entity)
        )

    def get_serializer_context(self):
        user_pk = self.request.user.id
        context = super(UserDetail, self).get_serializer_context()

        context.update({"user_pk": self.kwargs.get("pk")})
        return context


class UserImagesUploadAPIView(generics.RetrieveUpdateAPIView):
    """
    Update user images
    """

    name = "users-detail"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = UsersSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.Users.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update user with new images
        """

        user_id = self.kwargs.get("pk")

        if not "images" in request.data:
            raise exceptions.ValidationError("At least one image must be attached")
        else:
            files = request.FILES.getlist("images")

        user_id = self.kwargs.get("pk")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = UsersSerializer(instance, context=serializer_context)
        if UserImages.objects.filter(owner=request.user).count() > 5:
            raise exceptions.ValidationError(
                "Not more than 5 profile pictures allowed. "
            )
        if files and len(files) > 5:
            raise exceptions.ValidationError("Not more than 5 images can be uploaded")
        else:
            uploaded_files = []
            for file in files:
                content = models.UserImages.objects.create(
                    image=file,
                    owner_id=user_id,
                )
                uploaded_files.append(content)

            instance.images.add(*uploaded_files)
            context = serializer.data
            context["images"] = [file.id for file in uploaded_files]

            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Image uploaded succesfully",
                    "user": serializer.data,
                },
                status=status.HTTP_200_OK,
            )
            # return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class EntityDocumentUploadAPIView(generics.RetrieveUpdateAPIView):
    """
    Upload entity documents
    """

    name = "users-detail"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = EntitySerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.Entities.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update user with new documents
        """
        title = request.data.get("title", "")
        if not title:
            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Title is required",
                  
                },
                status=status.HTTP_200_OK,
            )
        if models.EntityDocuments.objects.filter(title=title).exists():
            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Document with similar title exists",
                  
                },
                status=status.HTTP_200_OK,
            )

        description = request.data.get("description", "")
        reference = request.data.get("reference", "")
        if not reference:
            return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Reference is required",
                        
                    },
                    status=status.HTTP_200_OK,
                )

        entity_id = self.kwargs.get("pk")

        if not "documents" in request.data:
            raise exceptions.ValidationError("At least one image must be attached")
        else:
            files = request.FILES.getlist("documents")

        entity_id = self.kwargs.get("pk")
        entity=authentication_models_validators.validate_entity(entity_id)

        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = EntitySerializer(instance, context=serializer_context)
  
        if files and len(files) > 1:
            raise exceptions.ValidationError("Upload one document at a time")
        else:
            uploaded_files = []
            for file in files:
                content = models.EntityDocuments.objects.create(
                    document=file,
                    entity=entity,
                    owner=request.user,
                    reference=reference,
                    description=description,
                    title=title,
                    entity_branch_id=request.data.get("entity_branch", None),
                )
                uploaded_files.append(content)

            instance.documents.add(*uploaded_files)
            context = serializer.data
            context["documents"] = [file.id for file in uploaded_files]

            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Document uploaded succesfully",
                    "entity": serializer.data,
                },
                status=status.HTTP_200_OK,
            )
            # return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


def add_entity(request):
    return render(request, "entities/add_entity.html")


def login_user(request):
    form = forms.LoginForm()
    message = ""
    if request.method == "POST":
        form = forms.LoginForm(request.POST)
        if form.is_valid():
            user = authenticate(
                phone_or_email=form.cleaned_data["phone_or_email"],
                password=form.cleaned_data["password"],
            )
            if user is not None:
                login(request, user)
                message = f"Hello {user.first_name}! You have been logged in"
                print("message at login success", message)
                return redirect("frontpage")
            else:
                message = "Login failed!"
                print("message at login failed", message)
    return render(
        request, "entities/login.html", context={"form": form, "message": message}
    )


def register_user(request):
    message = ""
    form = forms.SignupForm()
    if request.method == "POST":
        form = forms.SignupForm(request.POST)
        # entity = models.Entities.objects.filter(entity_type='Default').first()
        # form.instance.entity = entity
        # form.fields["entity"].widget.attrs.update({'value': entity})
        if form.is_valid():
            user = form.save()
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
            return redirect("frontpage")
    else:
        form = forms.SignupForm()
    return render(
        request,
        "entities/register_user.html",
        context={"form": form, "message": message},
    )


# @login_required
# def entity_admin(request):
#     entity = request.user.entity
#     return render(request, "entities/entity_admin.html", context={entity: entity})

# view for registering users
class SimpleRegisterView(APIView):
    def post(self, request):
        
        if not "email" in request.data or  request.data.get("email")==None or request.data["email"]=="":
            print("Email is required")
            return Response(
            {"response_code":1,"response_message": "Email is required"}, status=status.HTTP_200_OK
                )
        else:
            try:
                email =validate_email(request.data.get("email"))
                if models.Users.objects.filter(email=request.data.get("email")).exists():
                    return Response(
            {"response_code":1,"response_message": "Email already in use"}, status=status.HTTP_200_OK
                )

            except EmailNotValidError as e:
                print(str(e))
                print("Email is invalid.")  
                print("Email is invalid.")

        # request.data._mutable = True
        ## REmoved above
        # data = request.data.copy()
        # role_str =data.pop("roles")

        # roles_list = role_str[0].split(',')
        # print(role_str)
        # print(roles_list)
        serializer = SimpleUsersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        user_data = serializer.data

        # Retrieve user from database ffffff
        user = models.Users.objects.get(email=user_data["email"])
        user.is_verified="true"
        user.save()
        data = request.data.copy()
        role_str =data.pop("roles_string")

        if "," in role_str:
            roles_list = role_str[0].split(',')
            for role_id in roles_list:
                print("role_id",f"{role_id}")
                role = models.Roles.objects.get(id=role_id)
                if role:
                    if  role  in user.roles.all():
                        pass
                    else:
                        user.roles.add(role)
        else:
            role = models.Roles.objects.get(id=role_str)
            if role:
                if  role  in user.roles.all():
                    pass
                else:
                    user.roles.add(role)

        user.save()

        employee = Employees.objects.create(user=user, entity=user.entity,owner=request.user, is_active='true')
        employee.save()

        #Get token
        # token = RefreshToken.for_user(user).access_token
        # print("token",token)
        # # Get current site
        # current_site = get_current_site(request).domain
        # relativeLink = reverse("email-verify")

        # # generate absolute url
        # absurl = (
        #     "http://" + current_site + relativeLink + "?token=" + str(token)
        # )
        # email_body = (
        #     "Hi "
        #     + user.first_name
        #     + " "
        #     + user.last_name
        #     + " Use link below to verify your email \n"
        #     + absurl
        # )
        # data = {
        #     "email_body": email_body,
        #     "to_email": user.email,
        #     "email_subject": "Verify your email address",
        # }

        # send_email(data)

        # Send password via email

        password = generate_password()
        print("user",user)
        print("password",password)
        user.set_password(password)
        user.save()

        email_body = f"Your Wazipos account has been created. Your password is {password} . Please do not share your password."
        
    
        data = {
                "email_body": email_body,
                "to_email": user.email,
                "email_subject": "Succesful Wazipos Account Creation",
            }

        utils.Util.send_email(data)

        # Send sms
        telco, phone_number = get_telco_by_phone_number(user.phone)
        message =f"Wazipos password is {password}.Do not share your password with any other person."
        payload = {
                "contact" : phone_number,
                "message" : message,
                "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
            }
        
        errors, sent = send_swift_sms(payload)
        return Response(
                data={
                    "response_code": 0,
                    "response_message": "User succesfully created",
                    "user": UsersSerializer(user,context={'request': request}).data
                  
                },
                status=status.HTTP_201_CREATED,
            )

class CorporateRegisterView(CreateModelMixin, generics.GenericAPIView):
    """
    Register User user by admin
    """
   

    serializer_class = CorporateRegisterSerializer
    renderer_classes = (UserRenderer,)
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (app_permissions.AdminsOnlyPermissions,)

    @transaction.atomic
            
    def post(self, request):
        psp =None
        user_obj=None
        agent = None
        errors_messages = []
        jambopay_profile = None
        create_log("info",f"Validated ddata: {request.data}")
        entity = None
        is_entity_administrator= request.data["is_entity_administrator"]
      
        entity_id= request.data["entity"]
        if models.Entities.objects.filter(id=entity_id).exists():
            entity = models.Entities.objects.filter(id=entity_id).first()
        else:
            errors_messages.append("Entity with provided ID does not exist")
            return JsonResponse(
                data={
                    "response_code": 1,
                    "response_message": "User not created",
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )

        if models.Users.objects.filter(phone =request.data["phone"]).exists():
            errors_messages.append("Phone number provided is already in use")
        # if not request.user.is_staff:
        #     if not models.Agents.objects.filter(user=request.user).exists():
        #         errors_messages.append("You are not authorized")
        #         create_log("error","No agent exists for user")


        if models.Agents.objects.filter(user=request.user).exists():
            agent=models.Agents.objects.filter(user=request.user).first()
            
            create_log("info",f"Agent: {agent}")
        if len(errors_messages)>0:
            return JsonResponse(
                        {
                                "response_code": 1,
                                "response_message": "User not created",
                                "errors": errors_messages,
                            
                            },
                
                        )
        password = generate_password()

        user_obj = None

        
        user = request.data

        # files = request.FILES.getlist("documents")
        # if files:
        #     request.data.pop("documents")
        #     serializer_context = {
        #         "request": request,
        #     }

        #     serializer = serializers.UsersSerializer(
        #         data=request.data, context=serializer_context
        #     )
            # serializer.is_valid(raise_exception=   True)
            # if serializer.is_valid():
            #     try:
            #         serializer.save(owner=request.user,
            #                         entity=request.user.entity)
            #     except IntegrityError as exc:
            #         raise exceptions.ValidationError(exc)
            #     item = models.Users.objects.get(id=serializer.data["id"])
            #     errors_messages = []

                # uploaded_files = []
                # for file in files:
                #     content = models.UserDocuments.objects.create(
                #         owner=request.user,
                #         image=file,
                #         product=item,
                #         entity=request.user.entity,
                #     )
                #     uploaded_files.append(content)

                # item.documents.add(*uploaded_files)
                # item.save()
                # context = serializer.data
                # arr =[]
                # context["images"] = [file.id for file in uploaded_files]
                # context["images"] = [file.id for file in uploaded_files]
                # context["images"] = [image for image in uploaded_files]
                # ls= serializers.UserDocumentsSerializer(item.images,context={'request': request}, many=True).data,
                # context["images"] =arr

                
                # return Response(
                #     data={
                #         "response_code": 0,
                #         "response_message": "User succesfully created",
                #         "product": serializers.UsersSerializer(item,context={'request': request}).data,
                #         "errors": errors_messages,
                #     },
                #     status=status.HTTP_201_CREATED,
                # )
        files = request.FILES.getlist("documents")
        if files:
            request.data.pop("documents")
            serializer_context = {
                "request": request,
            }
        serializer = self.serializer_class(data=user, context={"request": request, "user":request.user})
      
        # serializer.is_valid(raise_exception=   True)
        if serializer.is_valid():
           
            profile = None
            serializer.save(owner=request.user,entity=entity)
            user_data = serializer.data
           
            create_log("info", f"Serializer data: {user_data}")
            # Retrieve user from database
            # user = models.Users.objects.get(email=user_data["email"])
            user_obj = models.Users.objects.get(phone=user_data["phone"])
            user_obj.set_password(password)

       
            if agent:
                user_obj.creating_agent=agent
                user_obj.save()
            user_obj.accepted_terms="true"
            user_obj.iprs_verified="true"
            user_obj.save()
            if files:
                uploaded_files = []
                for file in files:
                    content = models.UserDocuments.objects.create(
                        owner=request.user,
                        document=file,
                        document_number=user_obj.identifier_number,
                        document_type=user_obj.identifier_type,
                        is_valid=True,
                        is_verified="true"
                    )
                    uploaded_files.append(content)

                user_obj.documents.add(*uploaded_files)
                user_obj.save()
                context = serializer.data
                arr =[]

        
                # context["documents"] = [file.id for file in uploaded_files]
                # context["documents"] = [file.id for file in uploaded_files]
                context["documents"] = [image for image in uploaded_files]
                ls= UserDocumentsSerializer(user_obj.documents,context={'request': request}, many=True).data,
                context["documents"] =arr

            if user_obj.is_entity_administrator=="true":
                jambopay_profile = get_jambopay_main_profile(user_obj.phone)
                if jambopay_profile:
                ## Create wallet
                    pass
                else:
                    document = models.UserDocuments.objects.filter(owner=user_obj.owner).first()
                    profile_data = {
                    "firstName": user_obj.first_name,
                    "lastName": user_obj.last_name,
                    "identityNumber": document.document_number,
                    "identityType": document.document_type,
                    "phoneNumber": user_obj.phone,
                    "gender": user_obj.gender,
                    "dateOfBirth": user_obj.date_of_birth.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    "county": user_obj.county.title,
                    "physicalAddress": user_obj.constituency.title,
                    "email": user_obj.email,
                 }
                    jambopay_profile = create_jambopay_profile(profile_data)

          
   
                if jambopay_profile:
                    data=json.dumps({
                                        "currency": "KES",
                                        "phoneNumber": user_obj.phone, 
                                        "name": f"{user_obj.first_name} {user_obj.last_name}",
                                        "description": f"Wallet account for {user_obj.first_name} {user_obj.last_name}",
                                        "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                                        "accountType": "Individual"
                                    })

                    errors, account =create_white_label_account(data)
                    create_log("info", f"Jambopay waller account: {account}")
                    create_log("info", f"Jambopay wallet errors: {errors}")
                    
                    if account:
                        psp=None
                        if  PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
                            psp= PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
                        else:
                            errors.append("No such payment services provider")
                        user_account = UserAccounts.objects.create(
                        psp=psp,
                        account_number=account["accountNo"],
                        account_name=account["name"],
                        account_phone=user_obj.phone,
                        account_type="WALLET",
                        currency=account["currency"],
                        entity=user_obj.entity,
                        owner=user_obj
                    )
                        create_log("info", f"User account: {user_account}")
                    else:
                        user_obj.delete()
                        for error in errors:
                            errors_messages.append(error)
                        return JsonResponse(
                data={
                    "response_code": 1,
                    "response_message": "User not created",
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )

            else:
                create_log("info", "Wallet not created, use is not entity administrator")
                pass

            # Generate token
            token = RefreshToken.for_user(user_obj).access_token
            # Get current site
            # TODO: Ensure current site settings have been updated in the django admin panel
            current_site = get_current_site(request).domain
            # current_site = 'wazipos.com'
            relativeLink = reverse("email-verify")
            # generate absolute url
            absurl = (
                "https://" + current_site + relativeLink + "?token=" + str(token)
            )
            email_body = (
                f"Your Wazipos account has been created. Your password is {password} . Please do not share your password."
            )
            # message = f"Your account for {user.entity} has been created at JAMBOPAY. Your password is {password}"
            # time_otp = sms_utils.generate_otp(user_obj)
            message =f"Your Wazipos account has been created. Your password is {password} . Please do not share your password."
            payload = {
                    "contact" : user_obj.phone,
                    "message" : message,
                    "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                    "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                }
        
            errors, sent = send_swift_sms(payload)
            data = {
                "email_body": email_body,
                "to_email": user_obj.email,
                "email_subject": "Verify your email address",
            }

            utils.Util.send_email(data)

            errors_messages = []
            # sent = sms_utils.send_sms_code(user)
            # sent = sms_utils.send_password(user, request.data['password'])
            return JsonResponse(
                data={
                    "response_code": 0,
                    "response_message": "User succesfully created",
                    "user": serializer.data,
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

            return JsonResponse(
                data={
                    "response_code": 1,
                    "response_message": "User not created",
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def agentsOnlyAPIView(request):

    
    if not request.user.is_agent==True:
        raise exceptions.ValidationError("Not authorized")
    else:
        pass
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetEntityRolesById":
        """Get all entities foor admin users"""

        roles = utils.get_entity_roles_by_id(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(roles, request)
        serializer = RolesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateEntityRole":
        utils.validate_role_data(request.data, request.user)

        errors, role = utils.create_entity_role(request.data, request.user)
        if role:
            serializer = RolesSerializer(
                role, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Role created successfully", serializer.data, "role"
            )

        else:
            return custom_errors_response(1, "Roles not created", errors)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')








class GoogleLoginCallback(APIView):
    def get(self, request, *args, **kwargs):
        """
        If you are building a fullstack application (eq. with React app next to Django)
        you can place this endpoint in your frontend application to receive
        the JWT tokens there - and store them in the state
        """

        code = request.GET.get("code")
        print("code", code)

        if code is None:
            return Response(status=status.HTTP_400_BAD_REQUEST)
        
        # Remember to replace the localhost:8000 with the actual domain name before deployment
        token_endpoint_url = urljoin("https://api.wazipos.co.ke", reverse("google_login"))
        response = requests.post(url=token_endpoint_url, data={"code": code})

        return Response(response.json(), status=status.HTTP_200_OK)

class LoginPage(View):
    def get(self, request, *args, **kwargs):
        return render(
            request,
            "pages/login.html",
            {
                "google_callback_uri": settings.GOOGLE_OAUTH_CALLBACK_URL,
                "google_client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            },
        )

class SafeOAuth2Client(OAuth2Client):
    def __init__(self, *args, **kwargs):
        kwargs.pop("scope_delimiter", None) # Avoid duplicate
        kwargs.pop("callback_url", None) # Avoid duplicate
        super().__init__(*args, **kwargs)

class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter
    callback_url = settings.GOOGLE_OAUTH_CALLBACK_URL
    client_class = SafeOAuth2Client


class UserMe(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    
    def get(self, request):
        serializer = GenericUserSerializer(request.user)
        return Response(serializer.data)