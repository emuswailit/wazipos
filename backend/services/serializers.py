
from rest_framework import serializers, exceptions
from . import models

class LaboratoryServicesSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.LaboratoryServices
        fields = (
            "id",
            "title",
            "description",
            "sample",
            "sample_handling_temparature",
            "cause_for_rejection",
            "time_to_result_unit",
            "time_to_result",
            "created",
            "updated",
        )

        read_only_fields = ("id", "created", "owner", "updated",)


class RadiologyServicesSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.RadiologyServices
        fields = (
            "id",
            "title",
            "description",
            "created",
            "updated",
        )

        read_only_fields = ("id", "created", "owner", "updated",)

    def get_category_title(self,obj):
        return obj.category.title
    
class PhysiotherapyServicesSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.PhysiotherapyServices
        fields = (
            "id",
            "title",
            "description",
            "created",
            "updated",
        )

        read_only_fields = ("id", "created", "owner", "updated",)

    def get_category_title(self,obj):
        return obj.category.title