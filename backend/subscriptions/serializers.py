from rest_framework import serializers, exceptions
from . import models
class SubscriptionPaymentsSerializer(serializers.ModelSerializer):
    entity_title=serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ["-created"]
        model = models.SubscriptionPayment
        fields = (
            "id",
            "owner",
            "entity",
            "status",
            "description",
            "entity_title",
            "operator_reference_number",
            "provider_reference_number",
            "psp_reference_number",
            "reference_number",
            "amount",
            "created",
            "updated",
        )

        read_only_fields = ("id", "created", "owner", "updated",)

    def get_entity_title(self,obj):
        return obj.entity.title
    
class SubscriptionSerializer(serializers.ModelSerializer):
    entity_title=serializers.SerializerMethodField(read_only=True)
    entity_monthly_subscription=serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ["-id"]
        model = models.Subscription
        fields = (
            "id",
            "owner",
            "entity",
            "entity_title",
            "entity_monthly_subscription",
            "months",
            "start_date",
            "end_date",
            "type",
            "is_active",
            "created",
            "updated",
        )

        read_only_fields = ("id", "created", "owner", "updated",)

    def get_entity_title(self,obj):
        return obj.entity.title
    
    def get_entity_monthly_subscription(self,obj):
        return obj.entity.monthly_subscription