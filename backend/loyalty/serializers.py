from rest_framework import serializers
from . import models


class RatingSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Rating
        fields = "__all__"
        read_only_fields = ("id", "url", "created", "updated")
