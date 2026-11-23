from distutils import errors
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework import exceptions
from django.utils import timezone


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
    """May this business work today? WaziPOS Tokens (billing/services.can_operate):
    old subscription, free month, set-up / awaiting approval, or token balance."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            raise exceptions.ValidationError("Please log in")
        if request.user.is_superuser:
            return True
        entity = request.user.entity
        try:
            from billing.services import can_operate

            ok, reason = can_operate(entity)
        except Exception:
            from subscriptions.models import Subscription

            ok = Subscription.objects.filter(entity=entity, end_date__gte=timezone.now()).exists()
            reason = f"{getattr(entity, 'title', 'This business')} has no active subscription"
        if ok:
            return True
        raise exceptions.ValidationError(reason)


