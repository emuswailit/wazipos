from rest_framework import permissions
from rest_framework import exceptions
from employees.models import Employees


class WholesalerAdminPermission(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
        roles = []
        allowed_roles = ['GeneralWholesalerSuperAdmin', ]

        print("Allowed roles", allowed_roles)
        if request.user.is_authenticated:
            for x in request.user.roles.filter(entity=request.user.entity):
                roles.append(x.value)
                # Check if role is indeed for the logged on user entity
                # if x.entity == request.user.entity:
                #     roles.append(x.value)
                # else:
                #     raise exceptions.ValidationError(
                #         f"The role you are accessing to does not belong to your current company")
            # Check if content of one array in another array

            if set(roles).intersection(allowed_roles):
                return True
            else:
                raise exceptions.ValidationError('Not authorized for you')
        else:
            raise exceptions.ValidationError("Please log in")


class WholesalerEmployeePermission(permissions.BasePermission):
    """Wholesaler employee permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.entity.entity_type == 'GeneralWholesaler':
                if Employees.objects.filter(user=request.user, entity=request.user.entity, is_active='true').exists():
                    return True
                else:
                    raise exceptions.ValidationError(
                        f"You are not an active employee at {request.user.entity.title}")
            else:
                raise exceptions.ValidationError("Not authorized")
        else:
            raise exceptions.ValidationError("Please log in")

class WholesalerAndRetailerEmployeePermission(permissions.BasePermission):
    """Wholesaler employee permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.entity.entity_type == 'GeneralWholesaler' or  request.user.entity.entity_type == 'GeneralRetailer':
                if Employees.objects.filter(user=request.user, entity=request.user.entity, is_active='true').exists():
                    return True
                else:
                    raise exceptions.ValidationError(
                        f"You are not an active employee at {request.user.entity.title}")
            else:
                raise exceptions.ValidationError("Not authorized")
        else:
            raise exceptions.ValidationError("Please log in")