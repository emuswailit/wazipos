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


class EntitySubscriptionPermission(permissions.BasePermission):
    """Allow selected array of roles to access a resource"""

    def has_permission(self, request, view):
    
        if request.user.is_authenticated:
            
            if Subscription.objects.filter(entity=request.user.entity, end_date__gte=timezone.now()).exists(): 
                return True
            else:

               
                raise exceptions.ValidationError(f"{request.user.entity.title} has no active subscription")
        else:
            raise exceptions.ValidationError("Please log in")

