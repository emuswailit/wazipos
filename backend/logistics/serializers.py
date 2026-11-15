from rest_framework import serializers
from . import models


class OrganizationStoreSerializer(serializers.ModelSerializer):
    """
    Organization Store serializer
    """

    class Meta:
        model = models.OrganizationStore
        fields = ('id', 'organization',  'title','description',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')
        
class CountySubStoreSerializer(serializers.ModelSerializer):
    """
    County Sub Store serializer
    """
    class Meta:
        model = models.OrganizationSubStore
        fields = ('id',  'entity','title','organization_store',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')
        
class EntityStoreSerializer(serializers.ModelSerializer):
    """
    Entity Store serializer
    """
    class Meta:
        model = models.EntityStore
        fields = ('id',   'entity','title','organization_store','organization_sub_store','description',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')
class EntitySubStoreSerializer(serializers.ModelSerializer):
    """
    Entity Sub Store serializer
    """
    class Meta:
        model = models.EntitySubStore
        fields = ('id',   'entity','title','entity_store','department','description',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')

class EntitySubStoreReceiptsSerializer(serializers.ModelSerializer):
    """
    Entity Sub Store serializer
    """
    units_per_pack = serializers.SerializerMethodField()
    preparation = serializers.SerializerMethodField()
    preparation_title = serializers.SerializerMethodField()
    product_title = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    class Meta:
        model = models.EntitySubStoreReceipts
        fields = ('id',   'entity',
                  'received_pack_quantity',
                  'current_pack_quantity',
                  'received_unit_quantity',
                  'current_unit_quantity',
                  'pack_buying_price',
                  'pack_selling_price',
                  'unit_buying_price',
                  'unit_selling_price',
                  'entity_sub_store',
                  'product',
                  "product_title",
                  "preparation",
                  "preparation_title",
                  "units_per_pack",
                  "manufacture_date",
                  "expiry_date",
                  "key",
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')
        
    def get_preparation(self,obj):
        if obj.product.preparation:
            return obj.product.preparation.id
        else:
            return ""
        
    def get_units_per_pack(self,obj):
        if obj.product.units_per_pack:
            return obj.product.units_per_pack
        else:
            return ""
    def get_preparation_title(self,obj):
        if obj.product.preparation:
            return obj.product.preparation.title
        else:
            return ""
        
    def get_product_title(self,obj):
        if obj.product:
            return obj.product.title
        else:
            return ""
    def get_key(self,obj):
        return obj.id

        

class EntityStoreReceiptsSerializer(serializers.ModelSerializer):
    """
    Entity Sub Store serializer
    """
    class Meta:
        model = models.EntityStoreReceipts
        fields = ('id',   'entity','received_pack_quantity','current_pack_quantity','entity_store','product',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')



# ---------------------------------------------------------------------------
# Deliveries (logistics/utils/deliveries.py)
# ---------------------------------------------------------------------------

def _point(p):
    return {"latitude": p.y, "longitude": p.x} if p else None


class DeliveryPartnerSerializer(serializers.ModelSerializer):
    partner_title = serializers.CharField(source="partner.title", read_only=True)
    partner_type = serializers.CharField(source="partner.entity_type", read_only=True)

    class Meta:
        model = models.DeliveryPartner
        fields = ("id", "entity", "partner", "partner_title", "partner_type", "kind", "is_active", "created", "updated")
        read_only_fields = ("id", "entity", "created", "updated")


class DeliveryAgentSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    entity_title = serializers.CharField(source="entity.title", read_only=True)
    last_location = serializers.SerializerMethodField()

    class Meta:
        model = models.DeliveryAgent
        fields = ("id", "entity", "entity_title", "user", "name", "mode", "max_weight_kg", "vehicle_registration",
                  "phone", "is_active", "last_location", "last_seen_at", "created", "updated")
        read_only_fields = ("id", "entity", "last_seen_at", "created", "updated")

    def get_name(self, obj):
        u = obj.user
        return f"{u.first_name} {u.last_name}".strip() or getattr(u, "phone", "") or str(u)

    def get_last_location(self, obj):
        return _point(obj.last_point)


class DeliveryRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.DeliveryRate
        fields = ("id", "entity", "mode", "base_fee", "rate_per_km", "rate_per_kg", "min_fee",
                  "max_distance_km", "max_weight_kg", "is_active", "created", "updated")
        read_only_fields = ("id", "entity", "created", "updated")


class ShipmentLegSerializer(serializers.ModelSerializer):
    provider_title = serializers.CharField(source="provider.title", read_only=True, default=None)
    agent_name = serializers.SerializerMethodField()
    agent_phone = serializers.CharField(source="agent.phone", read_only=True, default=None)
    origin_collection_point_title = serializers.CharField(source="origin_collection_point.title", read_only=True, default=None)
    destination_collection_point_title = serializers.CharField(source="destination_collection_point.title", read_only=True, default=None)
    origin = serializers.SerializerMethodField()
    destination = serializers.SerializerMethodField()

    class Meta:
        model = models.ShipmentLeg
        fields = ("id", "sequence", "kind", "mode", "status", "provider", "provider_title", "agent", "agent_name",
                  "agent_phone", "waybill_number", "origin", "destination", "origin_collection_point",
                  "origin_collection_point_title", "destination_collection_point", "destination_collection_point_title",
                  "distance_km", "cost", "payout_amount", "is_payable", "is_settled", "assigned_at",
                  "picked_up_at", "completed_at", "notes")

    def get_agent_name(self, obj):
        if not obj.agent:
            return None
        u = obj.agent.user
        return f"{u.first_name} {u.last_name}".strip() or str(u)

    def get_origin(self, obj):
        return _point(obj.origin_point)

    def get_destination(self, obj):
        return _point(obj.destination_point)


class ShipmentSerializer(serializers.ModelSerializer):
    legs = ShipmentLegSerializer(many=True, read_only=True)
    destination_collection_point_title = serializers.CharField(source="destination_collection_point.title", read_only=True, default=None)
    delivery_code = serializers.SerializerMethodField()

    class Meta:
        model = models.Shipment
        fields = ("id", "entity", "retailer_order", "customer_order", "method", "status", "recipient_name",
                  "recipient_phone", "destination_collection_point", "destination_collection_point_title",
                  "chargeable_weight_kg", "distance_km", "total_cost", "tracking_number", "delivery_code",
                  "confirmed_at", "delivered_at", "notes", "legs", "created", "updated")

    def get_delivery_code(self, obj):
        """Only the recipient sees the code (they give it to whoever delivers)."""
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user:
            return None
        order = obj.retailer_order
        if order and getattr(user, "entity_id", None) == order.retailer_id:
            return obj.delivery_code
        customer_order = obj.customer_order
        if customer_order and customer_order.owner_id == user.id and customer_order.entity_id != getattr(user, "entity_id", None):
            return obj.delivery_code
        return None


class OfficeSerializer(serializers.Serializer):
    """A courier's office / collection point (authentication.CollectionPoints), read side."""

    id = serializers.UUIDField()
    title = serializers.CharField()
    code = serializers.CharField(allow_null=True)
    point_type = serializers.CharField()
    county = serializers.UUIDField(source="county_id")
    county_title = serializers.CharField(source="county.title", default=None)
    physical_address = serializers.CharField(allow_null=True)
    landmark = serializers.CharField(allow_null=True)
    phone_number = serializers.CharField(allow_null=True)
    is_active = serializers.BooleanField()
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()

    def get_latitude(self, obj):
        return obj.location.y if obj.location else None

    def get_longitude(self, obj):
        return obj.location.x if obj.location else None


class PayableLegSerializer(ShipmentLegSerializer):
    """A finished leg owed to its deliverer (platform payouts)."""

    payee = serializers.SerializerMethodField()
    payee_account = serializers.SerializerMethodField()
    order_reference = serializers.SerializerMethodField()

    class Meta(ShipmentLegSerializer.Meta):
        fields = ShipmentLegSerializer.Meta.fields + ("payee", "payee_account", "order_reference", "settled_at", "pay_out_reference_number")

    def get_payee(self, obj):
        if obj.payout_user_account_id:
            u = obj.payout_user_account.user
            return f"{u.first_name} {u.last_name}".strip() or str(u)
        if obj.agent and obj.agent.entity_id == obj.shipment.entity_id:
            u = obj.agent.user
            return f"{u.first_name} {u.last_name}".strip() or str(u)
        return obj.provider.title if obj.provider else None

    def get_payee_account(self, obj):
        acc = obj.payout_user_account or obj.payout_entity_account
        if not acc:
            return None
        bank = getattr(acc, "account_entity", None)
        return {
            "type": acc.account_type,
            "name": acc.account_name,
            "number": acc.account_number,
            "business_number": acc.business_number,
            "bank": bank.title if bank else None,
            "code": acc.account_code,
        }

    def get_order_reference(self, obj):
        o = obj.shipment.retailer_order or obj.shipment.customer_order
        if not o:
            return None
        return getattr(o, "reference_number", None) or getattr(o, "order_number", None) or str(o.pk)

