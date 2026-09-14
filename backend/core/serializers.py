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


from rest_framework import serializers


class BaseModelSerializer(serializers.ModelSerializer):
    """
    Project base serializer. Auto-injects `owner` and `entity`
    from the request on create; exposes `created` / `updated`
    as read-only.
    """
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    created = serializers.DateTimeField(read_only=True)
    updated = serializers.DateTimeField(read_only=True)

    def create(self, validated_data):
        request = self.context.get("request")
        if request and not validated_data.get("owner"):
            validated_data["owner"] = request.user
        if request and "entity" in self.fields and not validated_data.get("entity"):
            validated_data["entity"] = request.user.entity
        return super().create(validated_data)