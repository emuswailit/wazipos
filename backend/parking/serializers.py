
from rest_framework import serializers, exceptions
from . import models

class ParkingStationSerializer(serializers.ModelSerializer):
    entity_title = serializers.SerializerMethodField(read_only=True)
    town_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.ParkingStation
        fields = [
            "id",
            "entity",
            "entity_title",
            "town",
            "town_title",
            "title",
            "created",
            "updated",
        ]
        read_only_fields = (
            "id",
            "owner",
            "created",
            "updated",
        )

    def get_entity_title(self, obj):
        if obj.entity:
            return obj.entity.title
        else:
            return ""
        
    def get_town_title(self, obj):
        if obj.town:
            return obj.town.title
        else:
            return ""