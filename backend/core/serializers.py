from rest_framework import serializers
from authentication.models import Entities, Users


class EntitySafeRelatedField(serializers.HyperlinkedRelatedField):
    """
    Ensures that the queryset only returns values for the entity
    """

    def get_queryset(self):

        request = self.context['request']
        if request.user.is_authenticated:
            return super().get_queryset().filter(entity=request.user.entity)


class EntitySafeSerializerMixin(object):
    """
    Mixin to be used with HyperlinkedModelSerializer to ensure that only entity values are returned
    """
    serializer_related_field = EntitySafeRelatedField


class OwnerSafeRelatedField(serializers.HyperlinkedRelatedField):
    """
    Ensures that the queryset only returns values for the user
    """

    def get_queryset(self):

        request = self.context['request']
        if request.user.is_authenticated:
            user = request.user
            return super().get_queryset().filter(owner=user)


class OwnerSafeSerializerMixin(object):
    """
    Mixin to be used with HyperlinkedModelSerializer to ensure that only entity values are returned
    """
    serializer_related_field = OwnerSafeRelatedField
