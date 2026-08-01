from rest_framework import permissions
from rest_framework import exceptions

# from utils.permission_errors import raise_validation_error


class DistributorAdminPermission(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
        roles = []
        allowed_roles = ['DISTRIBUTION_SUPER_ADMIN', ]
        if request.user.is_authenticated:
            for x in request.user.roles.all():
                # Check if role is indeed for the logged on user entity
                if x.entity == request.user.entity:
                    print(
                        f"Not your entity {request.user.entity} vs {x.entity}")
                    roles.append(x.value)
            # Check if content of one array in another array
            if set(roles).intersection(allowed_roles):
                return True
            else:
                raise exceptions.ValidationError('Not authorized')
        else:
            raise exceptions.ValidationError("Please log in")


class DistributorEmployeePermission(permissions.BasePermission):
    """Distributor employee permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.entity.entity_type == 'DISTRIBUTION':
                return True
            else:
                raise exceptions.ValidationError("Not authorized")
        else:
            raise exceptions.ValidationError("Please log in")
