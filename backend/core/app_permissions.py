from distutils import errors
from rest_framework import permissions
from rest_framework import exceptions, status
from rest_framework.exceptions import NotAuthenticated, NotAcceptable
from django.shortcuts import get_object_or_404
from authentication.models import Profiles
from rest_framework.response import Response
from employees.models import Employees
from utils.logging import create_log

# from authentication.models import Entity,  Subscriptions
from employees.serializers import Users
# from payments.models import Subscriptions


class MedicineRolesOnly(permissions.BasePermission):
    """Only employees whose facilities are either clinics or hospitals"""

    def has_permission(self, request, view):
        user_roles = []
        allowed_roles = ["PharmaceuticalRetailerPharmaceuticalTechnologist",
                         "ClinicNurse", "PharmaceuticalRetailerNurse"]
        similars = []
        if request.user.is_authenticated:
            print("user roles", request.user.allowed_roles.all())
            print("allowed roles", allowed_roles)
            for x in request.user.allowed_roles.all():
                user_roles.append(x.value)
            # TODO : Refer to this on comparing role arrays
            for ur in user_roles:
                for ar in allowed_roles:
                    if ur == ar:
                        similars.append(ur)
            if len(similars) > 0:
                return True
            else:
                raise exceptions.ValidationError(
                    "Not authorized to carry out this operation"
                )
        else:
            raise exceptions.ValidationError("Not authenticated")


class PharmacyRolesOnly(permissions.BasePermission):
    """Only employees whose facilities are either clinics or hospitals"""

    def has_permission(self, request, view):
        roles = []
        role = "PHARMACY"
        if request.user.is_authenticated:
            if Profiles.objects.filter(owner=request.user).count() > 0:
                profile = Profiles.objects.filter(owner=request.user).first()
                print(profile)
                if profile:
                    for x in profile.roles.all():
                        roles.append(x.title)
                        print(roles)
                    if role not in roles:
                        raise exceptions.ValidationError(
                            "You are not permitted to access this service"
                        )

                    else:
                        return True
            else:
                raise exceptions.ValidationError("No profile")

        else:
            raise exceptions.ValidationError("Not authenticated")


class AdminsOnlyPermissions(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
        roles = []
        errors = []
        allowed_roles = [
            "GeneralDistributorSuperAdmin",
            "HospitalSuperAdmin",
            "RestaurantSuperAdmin",
            "GeneralRetailerSuperAdmin",
            "PharmaceuticalRetailerSuperAdmin",
            "ClinicSuperAdmin",
            "GeneralWholesalerSuperAdmin",
            "PharmaceuticalWholesalerSuperAdmin",
            "PharmaceuticalManufaturerSuperAdmin",
            "GeneralManufaturerSuperAdmin",
            "Admin",
            "TransportSuperAdmin",
            "RealtySuperAdmin",
        ]
        if request.user.is_authenticated:
            # if request.user.entity.company_type == 'Default':
            #     raise NotAcceptable("You are not added to a entity")
            # TODO: REVISIT IMPACT OF THIS CHECK
            for x in request.user.roles.all():
                create_log("INFO", f"User role: {x}")
                if x.entity==request.user.entity:
                    print("Role entity", x.entity)
                    print("User entity", request.user.entity)
                    roles.append(x.value)

            print("User roles", roles)
            print("Allowed roles", allowed_roles)
            # Check if role is indeed for the logged on user entity
            #     if x.entity == request.user.entity:
            #         roles.append(x.value)

            # Check if content of one array in another array

            if set(roles).intersection(allowed_roles):
                print('User is allowed')
                print('User is inter',set(roles).intersection(allowed_roles))

                return True
            else:
                print('User Not allowed')
                errors.append("Not authorized")
                raise exceptions.ValidationError(errors)


class MedicsOnlyPermissions(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
        roles = []
        allowed_roles = [
            "PHARMACY_SUPER_ADMIN",
            "MEDICINE",
        ]
        if request.user.is_authenticated:
            if request.user.entity.company_type == "Default":
                raise NotAcceptable("You are not added to a entity")

        for x in request.user.roles.all():
            # Check if role is indeed for the logged on user entity
            if x.entity == request.user.entity:
                roles.append(x.value)

        print(roles)
        # Check if content of one array in another array
        if set(roles).intersection(allowed_roles):
            return True
        else:
            raise exceptions.ValidationError("Not authorized")


class VerifiedEntitiesPermissions(permissions.BasePermission):
    """Allow selected only verified companies"""

    def has_permission(self, request, view):

        if request.user.is_authenticated:
            if request.user.entity.is_verified:
                return True
            else:
                raise exceptions.ValidationError(
                    f"{ request.user.entity.title} IS NOT VERIFIED"
                )

        else:
            raise exceptions.ValidationError("Please log in")


class RetailPharmacyUsersOnly(permissions.BasePermission):
    """Only employees whose facilities are either clinics or hospitals"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:

            return request.user.entity.company_type == "RETAIL"
        else:
            raise exceptions.ValidationError("Retail pharmacy users only")


class DistributorEmployeesOnlyPermission(permissions.BasePermission):
    """Only employees whose entities are distributors"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.entity.company_type == "DISTRIBUTOR":
                return True
            else:
                raise NotAcceptable("Not permitted")


class ManufacturerEmployeesOnlyPermission(permissions.BasePermission):
    """Only employees whose entities are manufacturers"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.entity.company_type == "MANUFACTURER":
                return True
            else:
                raise NotAcceptable("Not permitted")


class ClinicUsersOnlyPermission(permissions.BasePermission):
    """Only employees whose facilities are either clinics or hospitals"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.entity.company_type == "RETAILER":
                return True
            elif request.user.entity.company_type == "CLINIC":
                return True
            else:
                raise NotAcceptable("Hospital employees only")


class EntityAdministratorPermission(permissions.BasePermission):
    """Entity administrator permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:

            return request.user.is_administrator
        else:
            raise NotAcceptable("Administrators only")


class EntitySuperintendentPermission(permissions.BasePermission):
    """Entity superintendent permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            print(request.user.role)
            return request.user.is_pharmacist and request.user.is_superintendent
        else:
            raise NotAcceptable("Superintendents only")


class ClinicSuperintendentPermission(permissions.BasePermission):
    """Medical superintendent permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            print(request.user.role)
            return request.user.is_prescriber and request.user.is_superintendent
        else:
            raise NotAcceptable("Med Sups only")


class SubscribedOrStaffPermission(permissions.BasePermission):
    """Subscribed or Staff permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            print(request.user.entity.is_subscribed)

            if request.user.entity.is_subscribed or request.user.is_staff:
                return True
            else:
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You are not authorized to view this content: admins or subscribed users only",
                    }
                )


class ConsultationPermission(permissions.BasePermission):
    """Permissions for users who can create consultations: doctors and clinical officers"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            user = request.user
            if not user.cadre:
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You are not registered as a professional",
                    }
                )

            if user.cadre.cluster == "CONSULTATION":
                return True
            else:
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You are not authorized to view this content",
                    }
                )


class NonProfessionalsPermission(permissions.BasePermission):
    """Only users not registered as professionals can access"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:

            if request.user.is_professional == False:
                return True
            else:
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You have already created your professional profile in the system",
                    }
                )


class ProfessionalsOnlyPermission(permissions.BasePermission):
    """Only users registered as professionals can access"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:

            if request.user.is_professional == True:
                return True
            else:
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You have not created your professional profile in the system",
                    }
                )


# class IsSubscribedPermission(permissions.BasePermission):
#     """Subscribed Only permissions"""

#     def has_permission(self, request, view):
#         if request.user.is_authenticated:

#             if (
#                 Subscriptions.objects.filter(
#                     entity=request.user.entity, is_active=True
#                 ).count()
#                 > 0
#             ):
#                 return True
#             else:
#                 raise exceptions.ValidationError(
#                     "You have company has no running subscription. Subscribe to continue using the service"
#                 )


class PharmacistPermission(permissions.BasePermission):
    """Pharmacist permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.cadre:
                if request.user.cadre.cluster == "PHARMACY":
                    return True
                else:
                    raise NotAcceptable(
                        "Pharmacists or Pharmaceutical Technologists only"
                    )
        else:
            raise NotAcceptable("Pharmacists only")


class PrescriberPermission(permissions.BasePermission):
    """Prescriber permissions: doctors and clinical officers"""

    def has_permission(self, request, view):
        errors = []
        if request.user.is_authenticated:
            if request.user.is_prescriber:
                if request.user.cadre.cluster == "CONSULTATION":
                    return True
                else:
                    errors.append("Prescribers only")
                    raise NotAcceptable(errors)
            else:
                errors.append("Permission denied")
                return Response(
                    data={
                        "errors": errors,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )


class IsMyEntityObjectPermission(permissions.BasePermission):
    """
    Object-level permission to only allow owners of an object to edit it.
    Assumes the model instance has an `owner` attribute.
    """

    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed to any request,

        print(f"Hapa")
        return True


class MyCustomPermission(permissions.BasePermission):
    message = "You are not allowed here"

    def has_permission(self, request, view):
        return False


# class IsOwner(MyCustomPermission):
#     """
#     User can only access objects they are owner
#     """

#     def has_object_permission(self, request, view, obj):
#         # Read permissions are allowed to any request,
#         if request.user.is_authenticated:
#             print("objeee")
#             return obj.owner == request.user
#         else:
#             raise NotAcceptable("Please log in")


class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.user.is_authenticated:
            print("objeee")
            return obj.owner == request.user
        else:
            raise NotAcceptable("Please log in")


class EntityObjectPermission(permissions.BasePermission):
    """
    User can only access objects for their entity
    """

    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed to any request,
        print(f"Objei {obj}")

        if request.user.is_authenticated:

            if obj.entity == request.user.entity:
                return True
            else:
                raise exceptions.ValidationError("Not authorized")

        else:
            raise exceptions.ValidationError("Please log in")


class ClientPermission(permissions.BasePermission):
    """Prescriber permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:

            return request.user.is_client
        else:
            raise NotAcceptable("Clients only")


class EntityEmployeePermission(permissions.BasePermission):
    """Entity employee permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if Employees.objects.filter(user=request.user, entity=request.user.entity, is_active='true').exists():
                return True
            else:
                return False
        else:
            raise NotAcceptable("Employees only")


class WholesaleEmployeesOnlyPermission(permissions.BasePermission):
    """Entity owner permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:

            return request.user.entity.company_type == "WHOLESALE"
        else:
            raise NotAcceptable("Wholesalers only")


class EntityOwnerPermission(permissions.BasePermission):
    """Entity owner permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            # print(f"User entity {request.user.id}")
            # print(f"Owner ID {request.user.entity.owner.id} ")
            if request.user.is_verified == "false":
                raise exceptions.ValidationError(
                    f'{request.user.first_name} is not verified')
            if request.user.entity.owner == request.user:

                return True
            else:
                raise NotAcceptable("Not authorized")

        else:
            raise NotAcceptable("Not authorized")


class CourierPermission(permissions.BasePermission):
    """Courier permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:

            return request.user.is_courier
        else:
            raise NotAcceptable("Couriers only")


class EntitySuperintendentPermission(permissions.BasePermission):
    """Entity Superintendent permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.is_superintendent:
                return True

            else:
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You are not authorized to access this!",
                    }
                )
        else:
            raise NotAcceptable("Please log in")


class RetailSuperintendentPermission(permissions.BasePermission):
    """Retail Entity Superintendent permissions"""

    def has_object_permission(self, request, view, obj):
        if request.user.is_authenticated:
            if (
                request.user.is_superintendent
                and request.user.entity.company_type == "RetailPharmacy"
            ):
                return True

            else:
                return False
        else:
            raise NotAcceptable("Please log in")


class WholesaleSuperintendentPermission(permissions.BasePermission):
    """Wholesale Entity Superintendent permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if (
                request.user.is_superintendent
                and request.user.entity.company_type == "BulkPharmacy"
            ):
                return True

            else:
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You are not authorized to access this!",
                    }
                )
        else:
            raise NotAcceptable(
                {"response_code": 1, "response_message": "Please log in"}
            )


class ClinicSuperintendentPermission(permissions.BasePermission):
    """Entity Superintendent permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:

            if (
                request.user.is_superintendent
                and request.user.entity.company_type == "Clinic"
            ):
                return True

            else:
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You are not authorized to access this!",
                    }
                )
        else:
            raise NotAcceptable(
                {"response_code": 1, "response_message": "Please log in"}
            )


class PharmacySuperintendentPermission(permissions.BasePermission):
    """Entity Superintendent permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.entity.company_type != "RetailPharmacy":
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You are not authorized to access this!",
                    }
                )

            if (
                request.user.is_superintendent
                and request.user.entity.company_type == "RetailPharmacy"
            ):
                return True
            else:
                raise NotAcceptable(
                    {
                        "response_code": 1,
                        "response_message": "You are not authorized to access this!",
                    }
                )
        else:
            raise NotAcceptable(
                {"response_code": 1, "response_message": "Please log in"}
            )
