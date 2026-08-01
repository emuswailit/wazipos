from django.core import exceptions
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound


class EntitySafeViewMixin:
    """
    Mixin to be used with views that ensures that models are related to the entity during creation and are querysets
    are filtered for read operations
    """

    def get_queryset(self):

        if self.request.user and self.request.user.is_authenticated:
            queryset = super().get_queryset()

            return queryset.filter(entity=self.request.user.entity)
        else:
            return None

    def perform_create(self, serializer):

        serializer.save(entity=self.request.user.entity)
