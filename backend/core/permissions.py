from distutils import errors
from rest_framework import permissions, status
from rest_framework.response import Response


class IsOwner(permissions.BasePermission):
    errors = []

    def has_object_permission(self, request, view, obj):
        if obj.owner == request.user:
            return True
        else:
            errors.append("Permission denied")
            return Response(
                data={
                    "errors": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
