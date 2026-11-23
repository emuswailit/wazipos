from rest_framework import permissions
from rest_framework import exceptions
from employees.models import Employees
from subscriptions.models import Subscription
from django.utils import timezone
from core.responses import custom_error_response


class EntitySubscriptionPermission(permissions.BasePermission):
    """
    May this business work today? (WaziPOS Tokens — billing/services.can_operate)
    Yes while: an old monthly subscription runs, the free month runs, it is being
    set up / waiting for approval, or its token wallet has balance (a small
    overdraft after a first top-up keeps the till open).
    """

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            raise exceptions.ValidationError("Please log in")
        # Super admins act on other entities' data; their own entity's billing is irrelevant.
        if request.user.is_superuser:
            return True
        entity = request.user.entity
        try:
            from billing.services import can_operate

            ok, reason = can_operate(entity)
        except Exception:
            # Billing must never lock everyone out: fall back to the subscription check.
            ok = Subscription.objects.filter(entity=entity, end_date__gte=timezone.now()).exists()
            reason = f"{getattr(entity, 'title', 'This business')} has no active subscription"
        if ok:
            return True
        raise exceptions.ValidationError(reason)


class RetailAdminPermission(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
        roles = []
        allowed_roles = [
            "GeneralRetailerSuperAdmin","RestaurantSuperAdmin","PharmaceuticalRetailerSuperAdmin"
        ]
        if request.user.is_authenticated:
            for x in request.user.roles.all():
                roles.append(x.value)
            if set(roles).intersection(allowed_roles):
                return True
            else:
                raise exceptions.ValidationError("Not authorized")
        else:
            raise exceptions.ValidationError("Please log in")


class RetaillointPermission(permissions.BasePermission):
    """Retail staff and owner permission"""

    def has_permission(self, request, view):
        roles = []
        allowed_roles = [
            "GeneralRetailerSuperAdmin", "RETAIL_ACCOUNTS","RETAIL_PHARMACY","PharmaceuticalRetailerSuperAdmin"
        ]

        if request.user.is_authenticated:
            if request.user.entity.entity_type == "GeneralRetailer":
                if Employees.objects.filter(user=request.user, entity=request.user.entity, is_active='true').exists() or request.user.entity.owner == request.user:
                    for x in request.user.roles.filter(entity=request.user.entity):
                        roles.append(x.value)
                    if set(roles).intersection(allowed_roles):
                        return True
                    else:
                        raise exceptions.ValidationError("Not authorized")
                else:
                    raise exceptions.ValidationError(
                        f"You are not actively employed at {request.user.entity}")
            else:
                raise exceptions.ValidationError(
                    "Not permitted for your entity type")
        else:
            raise exceptions.ValidationError("Please log in")


class RetailEmployeePermission(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
        roles = []
        allowed_roles = [
            "RETAIL_ACCOUNTS","PharmaceuticalRetailerSuperAdmin", "GeneralRetailerSuperAdmin","PharmaceuticalRetailerSuperAdmin","RestaurantSuperAdmin","RestaurantSales","RETAIL_PHARMACY","RETAIL_SALES"
        ]

        if request.user.is_authenticated:
            if request.user.entity.entity_type == "GeneralRetailer" or  request.user.entity.entity_type == "Restaurant" or  request.user.entity.entity_type == "PharmaceuticalRetailer":
                if Employees.objects.filter(user=request.user, entity=request.user.entity, is_active='true').exists():
                    for x in request.user.roles.filter(entity=request.user.entity):
                        roles.append(x.value)
                    if set(roles).intersection(allowed_roles):
                        return True
                    else:

                        raise exceptions.ValidationError(
                            "Check with your admin if you are assigned correct roles")
                else:
                    raise exceptions.ValidationError(
                        f"You are not actively employed at {request.user.entity}")
            else:
                raise exceptions.ValidationError(
                    "Not permitted for your entity type")
        else:
            raise exceptions.ValidationError("Please log in")


class RetailStaffPermission(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
        roles = []
        allowed_roles = [
            "GeneralRetailerSuperAdmin", "RETAIL_ACCOUNTS", "RETAIL_PHARMACY","PharmaceuticalRetailerSuperAdmin"
        ]

        if request.user.is_authenticated:
            if request.user.entity.entity_type == "GeneralRetailer":
                if Employees.objects.filter(user=request.user, entity=request.user.entity, is_active='true').exists():
                    for x in request.user.roles.filter(entity=request.user.entity):
                        roles.append(x.value)
                    if set(roles).intersection(allowed_roles):
                        return True
                    else:
                        raise exceptions.ValidationError("Not authorized")
                else:
                    raise exceptions.ValidationError(
                        f"You are not actively employed at {request.user.entity}")
            else:
                raise exceptions.ValidationError(
                    "Not permitted for your entity type")
        else:
            raise exceptions.ValidationError("Please log in")


# class RetailEmployeesPermission(permissions.BasePermission):
#     """Retail employee permissions"""

#     def has_permission(self, request, view):
#         if request.user.is_authenticated:
#             if request.user.entity.entity_type == "GeneralRetailer":
#                 if Employees.objects.filter(user=request.user, entity=request.user.entity, is_active='true').exists():
#                     return True
#                 else:
#                     raise exceptions.ValidationError(f"Not authorized")
#             else:
#                 raise exceptions.ValidationError(
#                     "Not permitted for your entity type")
#         else:
#             raise exceptions.ValidationError("Authentication is required")
