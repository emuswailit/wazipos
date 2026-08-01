from rest_framework import permissions
from rest_framework import exceptions


class ManufacturerAndDistributorAdminsPermission(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
        """
        Permission that alows manufacturer and distributor admins to view data
        """
        roles = []
        allowed_roles = ['MANUFACTURING_SUPER_ADMIN', 'MANUFACTURING_ADMIN',
                         'DISTRIBUTION_SUPER_ADMIN', ]
        if request.user.is_authenticated:
            for x in request.user.roles.all():
                # Check if role is indeed for the logged on user entity
                if x.entity == request.user.entity:
                    roles.append(x.value)
            # Check if content of one array in another array
            if set(roles).intersection(allowed_roles):
                return True
            else:
                raise exceptions.ValidationError('Not authorized')
        else:
            raise exceptions.ValidationError("Please log in")


class ManufacturerAdminPermission(permissions.BasePermission):
    """Permission that allows only manufacturer admins to view data"""

    def has_permission(self, request, view):
        roles = []
        allowed_roles = ['MANUFACTURING_SUPER_ADMIN', 'MANUFACTURING_ADMIN']
        if request.user.is_authenticated:
            for x in request.user.roles.all():
                # Check if role is indeed for the logged on user entity
                if x.entity == request.user.entity:
                    roles.append(x.value)
            # Check if content of one array in another array
            if set(roles).intersection(allowed_roles):
                return True
            else:
                raise exceptions.ValidationError('Not authorized')
        else:
            raise exceptions.ValidationError("Please log in")


class ManufacturerEmployeePermission(permissions.BasePermission):
    """Manufacturer employee permissions"""

    def has_permission(self, request, view):
        if request.user.is_authenticated:
            if request.user.entity.entity_type == 'MANUFACTURING':
                return True
            else:
                raise exceptions.ValidationError("Not authorized")
        else:
            raise exceptions.ValidationError("Please log in")
