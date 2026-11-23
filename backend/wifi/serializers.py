
from rest_framework import serializers, exceptions
from django.utils import timezone
from . import models
class WifiTarrifsSerializer(serializers.ModelSerializer):
    router_title= serializers.SerializerMethodField(read_only=True)
    entity_title= serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.WifiTarrifs
        fields = (
            "id",
            "entity",
            "entity_title",
            "router",
            "router_title",
            "price",
            "title",
            "length",
            "duration",
            "is_active",
            "description",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "url",
            "created",
            "updated",
            "owner",
        )

    def get_router_title(self,obj):
        if obj.router:
            return f"{obj.router.router_ip} - {obj.router.title}"
        else:
            return ""
    def get_entity_title(self,obj):
        return obj.entity.title
    

    
class WifiSubscriptionPaymentsSerializer(serializers.ModelSerializer):
    tariff_title= serializers.SerializerMethodField(read_only=True)
    entity_title= serializers.SerializerMethodField(read_only=True)
    # Live monitor fields (wifi/payments.py): device connected? owner's payout?
    connected = serializers.SerializerMethodField(read_only=True)
    payout = serializers.SerializerMethodField(read_only=True)

    def get_connected(self, obj):
        return models.WifiSubscriptions.objects.filter(payment=obj).exists()

    def get_payout(self, obj):
        from wifi.payments import payout_of, payout_out

        return payout_out(payout_of(obj))
    class Meta:
        model = models.WifiSubscriptionPayments
        fields = (
            "id",
            "entity",
            "entity_title",
            "tariff",
            "tariff_title",
            "reference_number",
            "payout_reference_number",
            "psp_reference_number",
            "provider_reference_number",
            "account",
            "currency",
            "telco",
            "description",
            "status",
            "amount",
            "is_settled",
            "mac_address",
            "activation_error",
            "connected",
            "payout",
            "created",
            "updated",
           
        )
        read_only_fields = (
            "id",
            "url",
            "created",
            "updated",
            "amount",
            "owner",
        )
    def get_tariff_title(self,obj):
        if obj.tariff:
            return obj.tariff.title
        else:
            return ""
    def get_entity_title(self,obj):
        return obj.entity.title      
        
class WifiSubscriptionsSerializer(serializers.ModelSerializer):
    is_active= serializers.SerializerMethodField(read_only=True)
    entity_title= serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.WifiSubscriptions
        fields = (
            "id",
            "entity",
            "entity_title",
            "mac_address",
            "username",
            "tariff_selected",
            "payment",
            "valid_from",
            "valid_to",
            "is_active",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "url",
            "created",
            "updated",
            "owner",
        )
    def get_is_active(self,obj):
        if obj.valid_to > timezone.now():
            return "true"
        else:
            return "false"
    def get_entity_title(self,obj):
        return obj.entity.title
    
class WifiRoutersSerializer(serializers.ModelSerializer):
    entity_title= serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.WifiRouters
        fields = (
            "id",
            "entity",
            "entity_title",
            "router_ip",
            "nas_id",
            "location",
            "contact",
            "title",
            "brand",
            "model",
            "is_active",
            "description",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "url",
            "created",
            "updated",
            "owner",
        )
    def get_entity_title(self,obj):
        return obj.entity.title