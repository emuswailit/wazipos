from rest_framework import permissions
from rest_framework import exceptions
from employees.models import Employees

class SaccoStaffPermission(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
        roles = []
        allowed_roles = [
            "SACCO_SUPER_ADMIN", "SACCO_TELLER", "SACCO_CASHIER"
        ]

        if request.user.is_authenticated:
            if request.user.entity.entity_type == "SACCO":
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