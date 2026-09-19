from rest_framework import serializers, exceptions
from . import models
from authentication.validators.authentication_models_validators import validate_entity
from products.serializers import ProductsSerializer, ProductImageSerializer
from authentication.serializers import EntitySerializer
from retailers.models import RetailerReceipts, CustomerOrderItems, OutOfStock
from products.models import ProductImages
from datetime import datetime, timedelta, date
from django.utils import timezone
from rest_framework.response import Response
from rest_framework import exceptions, generics, permissions, status
from decimal import Decimal, InvalidOperation
from core.serializers import BaseModelSerializer
from decimal import Decimal

from rest_framework import serializers

from .models import (
    WholesalerCampaign,
    WholesalerCampaignAudience,
    WholesalerCampaignItem,
)


# =====================================================================
# Audience
# =====================================================================


class WholesalerCampaignAudienceListSerializer(BaseModelSerializer):
    retailer_title = serializers.CharField(
        source="retailer.title", read_only=True,
    )
    opted_in = serializers.SerializerMethodField()

    class Meta:
        model = WholesalerCampaignAudience
        fields = [
            "id",
            "campaign",
            "retailer",
            "retailer_title",
            "opted_in_at",
            "opted_out_at",
            "opted_in",
            "is_visible",
            "owner",
            "created",
            "updated",
        ]
        read_only_fields = ["opted_in_at", "opted_out_at"]

    def get_opted_in(self, obj):
        return obj.opted_in_at is not None


class WholesalerCampaignAudienceDetailSerializer(BaseModelSerializer):
    retailer_title = serializers.CharField(
        source="retailer.title", read_only=True,
    )
    campaign_title = serializers.CharField(
        source="campaign.title", read_only=True,
    )
    opted_in = serializers.SerializerMethodField()

    class Meta:
        model = WholesalerCampaignAudience
        fields = [
            "id",
            "campaign",
            "campaign_title",
            "retailer",
            "retailer_title",
            "opted_in_at",
            "opted_out_at",
            "opted_in",
            "is_visible",
            "owner",
            "created",
            "updated",
        ]
        read_only_fields = ["opted_in_at", "opted_out_at"]

    def get_opted_in(self, obj):
        return obj.opted_in_at is not None


# =====================================================================
# Campaign item
# =====================================================================


class WholesalerCampaignItemListSerializer(BaseModelSerializer):
    receipt_title = serializers.CharField(
        source="wholesaler_receipt.product.title", read_only=True,
    )
    wholesaler_title = serializers.CharField(
        source="wholesaler_receipt.received_from.title",
        read_only=True,
        default="",
    )

    class Meta:
        model = WholesalerCampaignItem
        fields = [
            "id",
            "campaign",
            "wholesaler_receipt",
            "receipt_title",
            "wholesaler_title",
            "suggested_quantity",
            "per_retailer_limit",
            "retail_price_hint",
            "published_unit_price",
            "published_bonus_quantity",
            "owner",
            "created",
            "updated",
        ]
        read_only_fields = [
            "published_unit_price",
            "published_bonus_quantity",
        ]


class WholesalerCampaignItemDetailSerializer(BaseModelSerializer):
    receipt_title = serializers.CharField(
        source="wholesaler_receipt.product.title", read_only=True,
    )
    wholesaler_title = serializers.CharField(
        source="wholesaler_receipt.received_from.title",
        read_only=True,
        default="",
    )
    price_discount_title = serializers.CharField(
        source="wholesaler_price_discount.title",
        read_only=True,
        default="",
    )
    quantity_discount_title = serializers.CharField(
        source="wholesaler_quantity_discount.title",
        read_only=True,
        default="",
    )
    receipt_unit_selling_price = serializers.DecimalField(
        source="wholesaler_receipt.unit_selling_price",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    receipt_final_unit_selling_price = serializers.DecimalField(
        source="wholesaler_receipt.final_unit_selling_price",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = WholesalerCampaignItem
        fields = [
            "id",
            "campaign",
            "wholesaler_receipt",
            "receipt_title",
            "wholesaler_title",
            "receipt_unit_selling_price",
            "receipt_final_unit_selling_price",
            "wholesaler_price_discount",
            "price_discount_title",
            "wholesaler_quantity_discount",
            "quantity_discount_title",
            "suggested_quantity",
            "per_retailer_limit",
            "retail_price_hint",
            "published_unit_price",
            "published_bonus_quantity",
            "owner",
            "created",
            "updated",
        ]
        read_only_fields = [
            "published_unit_price",
            "published_bonus_quantity",
        ]

    def validate(self, data):
        if data.get("per_retailer_limit") is not None and data.get(
            "per_retailer_limit"
        ) < 0:
            raise serializers.ValidationError(
                {"per_retailer_limit": "Must be zero or greater."}
            )
        if data.get("suggested_quantity", 0) < 0:
            raise serializers.ValidationError(
                {"suggested_quantity": "Must be zero or greater."}
            )
        return data


# =====================================================================
# Campaign
# =====================================================================


class WholesalerCampaignListSerializer(BaseModelSerializer):
    wholesaler_title = serializers.CharField(
        source="wholesaler.title", read_only=True,
    )
    status_label = serializers.CharField(
        source="get_status_display", read_only=True,
    )
    item_count = serializers.SerializerMethodField()
    audience_count = serializers.SerializerMethodField()

    class Meta:
        model = WholesalerCampaign
        fields = [
            "id",
            "wholesaler",
            "wholesaler_title",
            "title",
            "description",
            "banner",
            "status",
            "status_label",
            "start",
            "end",
            "is_active",
            "budget_cap",
            "item_count",
            "audience_count",
            "owner",
            "created",
            "updated",
        ]
        read_only_fields = ["status"]

    def get_item_count(self, obj):
        return getattr(obj, "item_count", None) or obj.items.count()

    def get_audience_count(self, obj):
        return getattr(obj, "audience_count", None) or obj.audience.count()


class WholesalerCampaignDetailSerializer(BaseModelSerializer):
    wholesaler_title = serializers.CharField(
        source="wholesaler.title", read_only=True,
    )
    status_label = serializers.CharField(
        source="get_status_display", read_only=True,
    )
    is_currently_active = serializers.BooleanField(read_only=True)
    items = WholesalerCampaignItemListSerializer(
        many=True, read_only=True,
    )
    audience = WholesalerCampaignAudienceListSerializer(
        many=True, read_only=True,
    )

    class Meta:
        model = WholesalerCampaign
        fields = [
            "id",
            "wholesaler",
            "wholesaler_title",
            "title",
            "description",
            "banner",
            "status",
            "status_label",
            "is_active",
            "is_currently_active",
            "start",
            "end",
            "budget_cap",
            "items",
            "audience",
            "owner",
            "created",
            "updated",
        ]
        read_only_fields = ["status"]

    def validate(self, data):
        start = data.get("start", getattr(self.instance, "start", None))
        end = data.get("end", getattr(self.instance, "end", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end": "end must be on or after start."}
            )
        return data


# =====================================================================
# Action payloads
# =====================================================================


class CampaignOptInSerializer(serializers.Serializer):
    """
    Payload for POST /campaigns/{id}/opt-in/

    quantities: {"<campaign_item_id>": <quantity>, ...}
    """
    quantities = serializers.DictField(
        child=serializers.IntegerField(min_value=0),
        allow_empty=False,
    )

    def validate_quantities(self, value):
        try:
            return {int(k): int(v) for k, v in value.items()}
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                "Keys must be campaign item ids (integers)."
            )


class CampaignProjectSerializer(serializers.Serializer):
    """
    Payload for POST /campaigns/{id}/project/

    quantities: {"<campaign_item_id>": <quantity>, ...}
    markup_pct: optional override for the projection
    """
    quantities = serializers.DictField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )
    markup_pct = serializers.DecimalField(
        max_digits=6,
        decimal_places=2,
        required=False,
        default=Decimal("30.00"),
    )

    def validate_quantities(self, value):
        try:
            return {int(k): int(v) for k, v in value.items()}
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                "Keys must be campaign item ids (integers)."
            )


class CampaignAudienceBulkWriteSerializer(serializers.Serializer):
    """
    Payload for adding many retailers to a campaign at once.
    POST /campaigns/{id}/add-audience/
    """
    retailer_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False,
    )
    is_visible = serializers.BooleanField(required=False, default=True)






class WholesalerReceiptsSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField(read_only=True)
    manufacturer = serializers.SerializerMethodField(read_only=True)
    manufacturer_title = serializers.SerializerMethodField(read_only=True)
    origin_country = serializers.SerializerMethodField(read_only=True)
    days_to_expiry = serializers.SerializerMethodField(read_only=True)
    packaging = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    expiry_status = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    received_from_details = serializers.SerializerMethodField(read_only=True)
    quantity_discounts = serializers.SerializerMethodField(read_only=True)
    price_discount = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    retailer_order_item_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.WholesalerReceipts
        fields = (
            "id", "title", "unit_of_receipt", "product_title", "preparation_title",
            "product", "bar_code",  "received_from",
            "wholesaler_order_item", "retailer_order_item",
            "retailer_order_item_details",
            "batch", "employee", "manufacture_date", "days_to_expiry",
            "expiry_date",
            "unit_buying_price", "unit_selling_price", "final_unit_selling_price",
            "discount_unit_selling_price",
            "current_unit_quantity", "received_unit_quantity",
            "received_pack_quantity",
            "recommended_retail_price",
            "in_placement", "description", "created", "updated", "expiry_status",
            "received_from_details", "manufacturer", "manufacturer_title",
            "origin_country", "packaging", "units_per_pack",
            "quantity_discounts", "price_discount", "images", "owner",
        )
        read_only_fields = (
            "id", "created", "updated",
            "quantity_discounts", "price_discount", "images",
            "days_to_expiry", "expiry_status",
            "owner", "entity",
        )

    # ------------------------------------------------------------------
    # Nested display helpers
    # ------------------------------------------------------------------

    def get_received_from_details(self, obj):
        if obj.received_from:
            return EntitySerializer(
                obj.received_from, context=self.context, many=False,
            ).data
        return None

    def get_retailer_order_item_details(self, obj):
        if obj.retailer_order_item_id:
            return {
                "id": obj.retailer_order_item.id,
                "retailer_order": obj.retailer_order_item.retailer_order_id,
                "purchased_quantity": obj.retailer_order_item.purchased_quantity,
                "total_quantity": obj.retailer_order_item.total_quantity,
            }
        return None

    def get_quantity_discounts(self, obj):
        qds = models.WholesalerQuantityDiscounts.objects.filter(
            wholesaler_receipt=obj,
        )
        if qds.exists():
            return WholesalerQuantityDiscountsSerializer(
                qds, context=self.context, many=True,
            ).data
        return None

    def get_price_discount(self, obj):
        price_discount = models.WholesalerPriceDiscounts.objects.filter(
            wholesaler_receipt=obj,
        ).first()
        if price_discount:
            return WholesalerPriceDiscountsSerializer(
                price_discount, context=self.context, many=False,
            ).data
        return None



    def get_title(self, obj):
        if obj.product.preparation:
            return f"{obj.product.preparation.title} - {obj.product.title}"
        return obj.product.title

    def get_manufacturer(self, obj):
        if obj.product.manufacturer:
            return obj.product.manufacturer.id
        return None

    def get_packaging(self, obj):
        if obj.product.packaging:
            return obj.product.packaging
        return None

    def get_units_per_pack(self, obj):
        if obj.product.units_per_pack:
            return obj.product.units_per_pack
        return None

    def get_manufacturer_title(self, obj):
        if obj.product.manufacturer:
            return obj.product.manufacturer.title
        return None

    def get_origin_country(self, obj):
        if obj.product.origin_country:
            return obj.product.origin_country.title
        return None

    def get_preparation_title(self, obj):
        if obj.product.preparation:
            return obj.product.preparation.title
        return ""

    def get_product_title(self, obj):
        return obj.product.title

    def get_images(self, obj):
        if obj.product:
            images = ProductImages.objects.filter(product=obj.product)
            if images.exists():
                return ProductImageSerializer(
                    images, context=self.context, many=True,
                ).data
        return None

    def get_days_to_expiry(self, obj):
        if obj.expiry_date:
            return numOfDays(date.today(), obj.expiry_date)
        return None

    def get_expiry_status(self, obj):
        if obj.expiry_date:
            expiry_days = numOfDays(date.today(), obj.expiry_date)
            if expiry_days is not None:
                if expiry_days < 1:
                    return f"EXPIRED {expiry_days} DAY(S) AGO"
                elif 1 < expiry_days < 7:
                    return f"EXPIRES IN A WEEK (IN {expiry_days} DAY(S))"
                elif 7 < expiry_days < 28:
                    return f"EXPIRES IN A MONTH (IN {expiry_days} DAY(S))"
                elif 28 < expiry_days < 56:
                    return f"EXPIRES IN 2 MONTHS (IN {expiry_days} DAY(S))"
                elif expiry_days > 56:
                    return f"EXPIRES IN {expiry_days} DAY(S)"
        return None


def get_current_retailer_stock(retailer, instance):
    current_unit_quantity=0
    if RetailerReceipts.objects.filter(entity=retailer, unit_quantity__gte=1, product=instance.product).exists():
        current_receipts = RetailerReceipts.objects.filter(entity=retailer, unit_quantity__gte=1, product = instance.product).all()
        for item in current_receipts:
            current_unit_quantity = current_unit_quantity + item.current_unit_quantity
    return current_unit_quantity

def get_product_os_units(retailer, instance,order_days):
    os_units =0
    if OutOfStock.objects.filter(entity=retailer,product=instance.product,is_ordered="false",created__gt=datetime.today()-timedelta(days=order_days)).exists():
        os_appearances = OutOfStock.objects.filter(entity=retailer,product=instance.product,is_ordered="false",created__gt=datetime.today()-timedelta(days=order_days)).all()
        for appearance in os_appearances:
            os_units = os_units + appearance.required_quantity
    return os_units

def get_product_sold_units (retailer,instance, order_days=30):
    sold_units = 0
    if CustomerOrderItems.objects.filter(entity=retailer,retailer_receipt__product=instance.product,created__gt=datetime.today()-timedelta(days=order_days)).exists():
        order_appearances = CustomerOrderItems.objects.filter(entity=retailer,retailer_receipt__product=instance.product,created__gt=datetime.today()-timedelta(days=order_days)).all()
        for appearance in order_appearances:
            sold_units = sold_units + appearance.purchased_quantity
    return sold_units

class WholesalerReceiptsWithAnalyticsSerializer(serializers.ModelSerializer):
    current_retailer_unit_quantity = serializers.SerializerMethodField(method_name='calculate_current_retailer_unit_quantity')
    average_daily_consumption = serializers.SerializerMethodField(method_name='calculate_average_daily_consumption')
    reported_out_of_stock = serializers.SerializerMethodField(method_name='retrieve_reported_out_of_stock')
    recommended_requisition_quantity = serializers.SerializerMethodField(method_name='calculate_recommended_requisition_quantity')
    title = serializers.SerializerMethodField(read_only=True)
    days_to_expiry = serializers.SerializerMethodField(read_only=True)
    expiry_status = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    key = serializers.SerializerMethodField(read_only=True)
    wholesale_price_dscount = serializers.SerializerMethodField(read_only=True)
    wholesale_price_dscount_title = serializers.SerializerMethodField(read_only=True)
    wholesale_quantity_dscount = serializers.SerializerMethodField(read_only=True)
    wholesale_quantity_dscount_title = serializers.SerializerMethodField(read_only=True)
    key = serializers.SerializerMethodField(read_only=True)
    received_from_details = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(
        read_only=True)

    class Meta:
        model = models.WholesalerReceipts
        fields = (
            "id",
            "key",
            "title",
            "product_title",
            "preparation_title",
            "product",
            "bar_code",
            "wholesaler_variation",
            "received_from",
            "wholesaler_order_item",
            "unit_of_receipt",
            "batch",
            "employee",
            "manufacture_date",
            "days_to_expiry",
            "expiry_date",
            "units_per_pack",
            "unit_quantity",
            "pack_buying_price",
            "discounted_pack_selling_price",
            "in_placement",
            "description",
            "created",
            "updated",
            "expiry_status",
            "received_from_details",
            "current_retailer_unit_quantity",
            "average_daily_consumption",
            "reported_out_of_stock",
            "recommended_requisition_quantity",
            "wholesale_price_dscount",
            "wholesale_price_dscount_title",
            "wholesale_quantity_dscount",
            "wholesale_quantity_dscount_title",
            "images",
            "owner",
        )
        read_only_fields = ("id", "created","quantity_discounts",
                            "updated", "owner", "entity")
    
    def calculate_current_retailer_unit_quantity(self, instance):
        current_unit_quantity=0
        retailer_id = self.context.get('retailer_id')
        retailer = validate_entity(retailer_id)
        current_unit_quantity = get_current_retailer_stock(retailer, instance)
        return current_unit_quantity
    

    

    def calculate_average_daily_consumption(self, instance):
        retailer_id = self.context.get('retailer_id')
        retailer = validate_entity(retailer_id)
        order_days = self.context.get('order_days')
        sold_units = get_product_sold_units(retailer, instance, order_days)
        return sold_units/order_days
    
    def retrieve_reported_out_of_stock(self, instance):
        retailer_id = self.context.get('retailer_id')
        retailer = validate_entity(retailer_id)
        order_days = self.context.get('order_days')
        os_units = get_product_os_units(retailer, instance,order_days)
        return os_units

    def calculate_recommended_requisition_quantity(self,instance):
        retailer_id = self.context.get('retailer_id')
        retailer = validate_entity(retailer_id)
        order_days = self.context.get('order_days')
        current_stock = get_current_retailer_stock(retailer, instance)
        sold_units_last_order_days =  get_product_sold_units(retailer, instance, order_days)
        average_consumption = int(sold_units_last_order_days)/int(order_days)
        reported_out_of_stock = get_product_os_units(retailer, instance,order_days)
        total_required = (order_days* average_consumption) + reported_out_of_stock

        to_purchase = total_required - current_stock

        if to_purchase>0:
            return to_purchase
        else:
            return 0



    def get_received_from_details(self, obj):
        if obj.received_from:
            return EntitySerializer(obj.received_from, context=self.context, many=False).data
        else:
            return None


    def get_wholesaler_variation_details(self, obj):
        if obj.wholesaler_variation:
            return WholesalerVariationSerializer(obj.wholesaler_variation, context=self.context, many=False).data
        else:
            return None

    def get_title(self, obj):
        if obj.product.preparation:

            return f'{obj.product.preparation.title} - {obj.product.title}'
        else:
            return obj.product.title
    def get_key(self, obj):
        return obj.id
    
    def get_wholesale_price_dscount(self, obj):
        wholesaler_price_discount = None
        if models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=obj).exists():
            wholesaler_price_discount=models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=obj).first()
            return wholesaler_price_discount.id
        else:
            return ""
    def get_wholesale_price_dscount_title(self, obj):
        wholesaler_price_discount = None
        if models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=obj).exists():
            wholesaler_price_discount=models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=obj).first()
            return wholesaler_price_discount.title
        else:
            return ""
    def get_wholesale_quantity_dscount(self, obj):
        wholesaler_quantity_discount = None
        if models.WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=obj).exists():
            wholesaler_quantity_discount=models.WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=obj).first()
            return wholesaler_quantity_discount.id
        else:
            return ""
    def get_wholesale_quantity_dscount_title(self, obj):
        wholesaler_quantity_discount = None
        if models.WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=obj).exists():
            wholesaler_quantity_discount=models.WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=obj).first()
            return wholesaler_quantity_discount.title
        else:
            return ""
    
    def get_quantity_discounts_str(self, obj):
        stringified =""
        if  obj.quantity_discounts.count()>0:
            for i in obj.quantity_discounts.all():
                stringified = stringified + i.title + ","

        return f'{stringified[:-1]}'
    

    def get_preparation_title(self, obj):
        if obj.product.preparation:

            return obj.product.preparation.title
        else:
            return ""

    def get_product_title(self, obj):
        return obj.product.title
    
    def get_units_per_pack(self, obj):
        return obj.product.units_per_pack

    def get_images(self, obj):
        images = None
        if obj.product:
            if ProductImages.objects.filter(
                product=obj.product
            ).exists():
                images = ProductImages.objects.filter(
                    product=obj.product
                ).all()
            return ProductImageSerializer(images, context=self.context, many=True).data
        return None

    def get_days_to_expiry(self, obj):
        if obj.expiry_date:
            today = date.today()
            expiry_date = obj.expiry_date
            if expiry_date:
                return numOfDays(today, expiry_date)

    def get_expiry_status(self, obj):
        if obj.expiry_date:
            today = date.today()

            expiry_date = obj.expiry_date
            expiry_days = numOfDays(today, expiry_date)
            if expiry_days:
                if expiry_days < 1:
                    return f"EXPIRED {expiry_days} DAY(S) AGO"
                elif expiry_days > 1 and expiry_days < 7:
                    return f"EXPIRES IN A WEEK (IN {expiry_days} DAY(S)"
                elif expiry_days > 7 and expiry_days < 28:
                    return f"EXPIRES IN A MONTH (IN {expiry_days} DAY(S)"
                elif expiry_days > 28 and expiry_days < 56:
                    return f"EXPIRES 2 MONTHS (IN {expiry_days} DAY(S)"
                elif expiry_days > 56:
                    return f"EXPIRES IN {expiry_days} DAY(S)"

# class RetailerOrdersSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = models.RetailerOrders
#         fields = "__all__"

class RetailerOrdersSerializer(serializers.ModelSerializer):
    telco = serializers.SerializerMethodField(read_only=True)
    description = serializers.SerializerMethodField(read_only=True)
    provider_reference_number = serializers.SerializerMethodField(read_only=True)
    psp_reference_number = serializers.SerializerMethodField(read_only=True)
    document_number_display = serializers.SerializerMethodField(read_only=True)
    order_items = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    wholesaler_title = serializers.SerializerMethodField(read_only=True)

    wholesaler_postal_address = serializers.SerializerMethodField(read_only=True)
    wholesaler_postal_code = serializers.SerializerMethodField(read_only=True)
    wholesaler_postal_town = serializers.SerializerMethodField(read_only=True)
    wholesaler_phone = serializers.SerializerMethodField(read_only=True)
    wholesaler_email = serializers.SerializerMethodField(read_only=True)

    payment_method_title = serializers.SerializerMethodField(read_only=True)
    retailer_title = serializers.SerializerMethodField(read_only=True)
    retailer_postal_address = serializers.SerializerMethodField(read_only=True)
    retailer_postal_code = serializers.SerializerMethodField(read_only=True)
    retailer_postal_town = serializers.SerializerMethodField(read_only=True)
    retailer_phone = serializers.SerializerMethodField(read_only=True)
    retailer_email = serializers.SerializerMethodField(read_only=True)

    owner_title = serializers.SerializerMethodField(read_only=True)
    actual_lead_time_days = serializers.SerializerMethodField(read_only=True)
    payment_summary = serializers.SerializerMethodField(read_only=True)

    # ---- NEW: commit display helpers ----
    commit_type_display = serializers.SerializerMethodField(read_only=True)
    committed_by_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.RetailerOrders
        fields = (
            "id",
            "wholesaler",
            "title",
            "payment_method",
            "document_number",
            "document_number_display",
            "retailer",
            "retailer_title",
            "wholesaler_title",
            "order_origin",
            "payment_method_title",
            "employee",
            "draft_id",
            "status",
            "reference_number",

            "shipping_amount",
            "order_discount_total",
            "order_gross_price_total",
            "order_price_total",
            "order_tax_total",
            "order_terms",
            "final_price",
            "final_price_total",

            "is_paid",
            "paid_at",
            "is_delivered",
            "delivered_at",
            "delivered_by",
            "is_processed",
            "processed_at",
            "processed_by",
            "is_packed",
            "packed_at",
            "packed_by",
            "is_received",
            "received_at",
            "received_by",
            "is_approved",
            "approved_at",
            "approved_by",
            "is_dispatched",
            "dispatched_at",
            "dispatched_by",
            "delivery_method",
            "actual_lead_time_days",
            "payment_summary",

            # ---- NEW: commit fields ----
            "is_committed",
            "commit_type",
            "commit_type_display",
            "committed_at",
            "committed_by_entity",
            "committed_by_title",
            "committed_by_user",
            "commit_note",
            "cancelled_at",

            "created",
            "updated",
            "order_items",
            "owner_title",

            "retailer_postal_town",
            "retailer_postal_code",
            "retailer_postal_address",
            "retailer_phone",
            "retailer_email",
            "wholesaler_postal_town",
            "wholesaler_postal_code",
            "wholesaler_postal_address",
            "wholesaler_phone",
            "wholesaler_email",

            "provider_reference_number",
            "psp_reference_number",
            "telco",
            "description",
            "owner",
        )
        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
            "entity",
            # Derived / computed fields — set by model recalculate()
            "order_gross_price_total",
            "order_discount_total",
            "order_tax_total",
            "final_price_total",
            "actual_lead_time_days",
            "payment_summary",
            # Event-driven flags
            "is_paid",
            "is_delivered",
            # ---- NEW: commit fields, all read-only ----
            "is_committed",
            "commit_type",
            "committed_at",
            "committed_by_entity",
            "committed_by_user",
            "commit_note",
            "cancelled_at",
        )

    # ------------------------------------------------------------------
    # Nested items
    # ------------------------------------------------------------------

    def get_order_items(self, obj):
        items = obj.retailer_order.all()
        if not items.exists():
            return []
        return RetailerOrderItemsSerializer(
            items, context=self.context, many=True,
        ).data

    # ------------------------------------------------------------------
    # Titles and display helpers
    # ------------------------------------------------------------------

    def get_title(self, obj):
        doc = obj.document_number.document_number if obj.document_number else "N/A"
        return f"{doc} - {obj.wholesaler.title}"

    def get_document_number_display(self, obj):
        if obj.document_number:
            return obj.document_number.document_number
        return "N/A"

    def get_owner_title(self, obj):
        if not obj.owner:
            return ""
        return f"{obj.owner.first_name} {obj.owner.last_name} - {obj.owner.phone}"

    def get_retailer_title(self, obj):
        return obj.retailer.title if obj.retailer else ""

    def get_wholesaler_title(self, obj):
        return obj.wholesaler.title if obj.wholesaler else ""

    def get_actual_lead_time_days(self, obj):
        return obj.actual_lead_time_days

    # ---- NEW: commit display resolvers ----
    def get_commit_type_display(self, obj):
        if not obj.commit_type:
            return None
        return obj.get_commit_type_display()

    def get_committed_by_title(self, obj):
        if obj.committed_by_entity:
            return obj.committed_by_entity.title
        return None

    # ------------------------------------------------------------------
    # Addresses and contact details
    # ------------------------------------------------------------------

    def get_retailer_postal_address(self, obj):
        return obj.retailer.postal_address if obj.retailer else None

    def get_retailer_postal_code(self, obj):
        return obj.retailer.postal_code if obj.retailer else None

    def get_retailer_postal_town(self, obj):
        return obj.retailer.postal_town if obj.retailer else None

    def get_retailer_email(self, obj):
        return obj.retailer.email if obj.retailer else None

    def get_retailer_phone(self, obj):
        return obj.retailer.phone if obj.retailer else None

    def get_wholesaler_postal_address(self, obj):
        return obj.wholesaler.postal_address if obj.wholesaler else None

    def get_wholesaler_postal_code(self, obj):
        return obj.wholesaler.postal_code if obj.wholesaler else None

    def get_wholesaler_postal_town(self, obj):
        return obj.wholesaler.postal_town if obj.wholesaler else None

    def get_wholesaler_email(self, obj):
        return obj.wholesaler.email if obj.wholesaler else None

    def get_wholesaler_phone(self, obj):
        return obj.wholesaler.phone if obj.wholesaler else None

    # ------------------------------------------------------------------
    # Payment-related display (delegated to RetailerOrderPayments)
    # ------------------------------------------------------------------

    def _successful_payment(self, obj):
        return (
            models.RetailerOrderPayments.objects
            .filter(retailer_order=obj, status="SUCCESS")
            .select_related("payment_method")
            .first()
        )

    def get_description(self, obj):
        payment = self._successful_payment(obj)
        return payment.description if payment else "N/A"

    def get_provider_reference_number(self, obj):
        payment = self._successful_payment(obj)
        return payment.provider_reference_number if payment else "N/A"

    def get_telco(self, obj):
        payment = self._successful_payment(obj)
        return payment.telco if payment else "N/A"

    def get_psp_reference_number(self, obj):
        payment = self._successful_payment(obj)
        return payment.psp_reference_number if payment else "N/A"

    def get_payment_method_title(self, obj):
        payment = self._successful_payment(obj)
        if payment and payment.payment_method:
            return payment.payment_method.title
        return "N/A"

    def get_payment_summary(self, obj):
        agg = (
            models.RetailerOrderPayments.objects
            .filter(retailer_order=obj, status="SUCCESS")
            .aggregate(total=Sum("amount"))
        )
        paid = float(agg["total"] or 0)
        owed = float(obj.final_price_total or 0)
        return {
            "paid_total": round(paid, 2),
            "balance_due": round(max(0.0, owed - paid), 2),
            "is_paid": paid >= owed if owed else False,
        }

class WholesalerPriceDiscountBannersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.WholesalerPriceDiscountBanners
        fields = (
            "id",
            "price_discount_banner",
            "thumbnail",
            "owner",
            "wholesaler_price_discount",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("wholesaler_quantity_discount", "thumbnail", "owner", "entity")

class WholesalerPriceDiscountsSerializer(serializers.ModelSerializer):
    price_discount_banners = WholesalerPriceDiscountBannersSerializer(
        many=True, read_only=True,
    )

    entity_title = serializers.SerializerMethodField(read_only=True)
    wholesaler_receipt_title = serializers.SerializerMethodField(read_only=True)
    is_currently_active = serializers.BooleanField(read_only=True)

    # Parent receipt price state (read-only — driven by sync)
    receipt_unit_selling_price = serializers.DecimalField(
        source="wholesaler_receipt.unit_selling_price",
        max_digits=10, decimal_places=2, read_only=True,
    )
    receipt_final_unit_selling_price = serializers.DecimalField(
        source="wholesaler_receipt.final_unit_selling_price",
        max_digits=10, decimal_places=2, read_only=True,
    )

    class Meta:
        model = models.WholesalerPriceDiscounts
        fields = (
            "id",
            "entity",
            "entity_title",
            "wholesaler_receipt",
            "wholesaler_receipt_title",
            "receipt_unit_selling_price",
            "receipt_final_unit_selling_price",
            "title",
            "percent",
            "normal_price",
            "offer_price",
            "start",
            "end",
            "is_active",
            "is_currently_active",
            "price_discount_banners",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
            "entity",
            "is_currently_active",
            "receipt_unit_selling_price",
            "receipt_final_unit_selling_price",
        )
        extra_kwargs = {
            "price_discount_banners": {"required": False},
        }

    # ------------------------------------------------------------------
    # Method fields
    # ------------------------------------------------------------------

    def get_entity_title(self, obj):
        return obj.entity.title if obj.entity else None

    def get_wholesaler_receipt_title(self, obj):
        receipt = obj.wholesaler_receipt
        if not receipt or not receipt.product:
            return None
        return getattr(receipt.product, "title", "") or None

    # ------------------------------------------------------------------
    # Validation — mirrors WholesalerPriceDiscounts.clean()
    # ------------------------------------------------------------------

    def validate(self, data):
        start = data.get("start", getattr(self.instance, "start", None))
        end = data.get("end", getattr(self.instance, "end", None))

        if start and end and end < start:
            raise serializers.ValidationError(
                {"end": "End date must be on or after start date."}
            )

        offer = data.get(
            "offer_price", getattr(self.instance, "offer_price", None),
        )
        normal = data.get(
            "normal_price", getattr(self.instance, "normal_price", None),
        )
        if offer is not None and normal is not None and offer > normal:
            raise serializers.ValidationError(
                {"offer_price": "Offer price cannot exceed normal price."}
            )

        # If percent is provided and the other two are, they should agree
        # to within one cent.
        percent = data.get(
            "percent", getattr(self.instance, "percent", None),
        )
        if percent is not None and normal is not None and offer is not None:
            expected_offer = (normal * (Decimal("1") - percent / Decimal("100")))
            if abs(expected_offer - offer) > Decimal("0.01"):
                raise serializers.ValidationError({
                    "percent": (
                        f"Percent ({percent}) does not match the implied "
                        f"discount from normal_price to offer_price "
                        f"(expected offer ≈ {expected_offer:.2f})."
                    )
                })

        return data

class WholesalerQuantityDiscountBannersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.WholesalerQuantityDiscountBanners
        fields = (
            "id",
            "quantity_discount_banner",
            "thumbnail",
            "owner",
            "wholesaler_quantity_discount",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("wholesaler_quantity_discount", "thumbnail", "owner", "entity")

        # object level validation 
    def validate(self,data):
        errors_messages=[]
        from core.date_utils import get_today
        wholesaler_receipt = data.get("wholesaler_receipt", None)

        if wholesaler_receipt:
            if models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=wholesaler_receipt,end__gte=get_today()).exists():
                price_discount=models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=wholesaler_receipt,end__gte=get_today()).first()
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Active price discount already exists for this product",
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )

        return data

class WholesalerQuantityDiscountsSerializer(serializers.ModelSerializer):
    quantity_discount_banners = WholesalerQuantityDiscountBannersSerializer(
        many=True, read_only=True,
    )

    entity_title = serializers.SerializerMethodField(read_only=True)
    wholesaler_receipt_title = serializers.SerializerMethodField(read_only=True)
    awarded_quantity_str = serializers.SerializerMethodField(read_only=True)
    limit_quantity_str = serializers.SerializerMethodField(read_only=True)
    is_currently_active = serializers.BooleanField(read_only=True)

    # Bonus preview — what an order of `limit_quantity` units earns.
    bonus_ratio = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.WholesalerQuantityDiscounts
        fields = (
            "id",
            "entity",
            "entity_title",
            "wholesaler_receipt",
            "wholesaler_receipt_title",
            "quantity_discount_banners",
            "title",
            "limit_quantity",
            "awarded_quantity",
            "awarded_quantity_str",
            "limit_quantity_str",
            "bonus_ratio",
            "start",
            "end",
            "is_active",
            "is_currently_active",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
            "entity",
            "is_currently_active",
            "bonus_ratio",
        )
        extra_kwargs = {
            "quantity_discount_banners": {"required": False},
        }

    # ------------------------------------------------------------------
    # Method fields
    # ------------------------------------------------------------------

    def get_awarded_quantity_str(self, obj):
        if obj.awarded_quantity:
            return f"{obj.awarded_quantity}"
        return ""

    def get_limit_quantity_str(self, obj):
        if obj.limit_quantity:
            return f"{obj.limit_quantity}"
        return ""

    def get_entity_title(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_wholesaler_receipt_title(self, obj):
        if obj.wholesaler_receipt and obj.wholesaler_receipt.product:
            return obj.wholesaler_receipt.product.title
        return ""

    def get_bonus_ratio(self, obj):
        """
        Convenience for the frontend: 'Buy N get M free'.
        Returns a dict so it can be rendered without string parsing.
        """
        if not obj.limit_quantity or not obj.awarded_quantity:
            return None
        return {
            "buy": obj.limit_quantity,
            "free": obj.awarded_quantity,
            "display": f"Buy {obj.limit_quantity} get {obj.awarded_quantity} free",
        }

    # ------------------------------------------------------------------
    # Validation — mirrors WholesalerQuantityDiscounts.clean()
    # ------------------------------------------------------------------

    def validate(self, data):
        start = data.get("start", getattr(self.instance, "start", None))
        end = data.get("end", getattr(self.instance, "end", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end": "End date must be on or after start date."}
            )

        limit_qty = data.get(
            "limit_quantity",
            getattr(self.instance, "limit_quantity", None),
        )
        awarded_qty = data.get(
            "awarded_quantity",
            getattr(self.instance, "awarded_quantity", None),
        )

        if limit_qty is not None and limit_qty <= 0:
            raise serializers.ValidationError(
                {"limit_quantity": "Limit quantity must be greater than zero."}
            )

        if awarded_qty is not None and awarded_qty <= 0:
            raise serializers.ValidationError(
                {"awarded_quantity": "Awarded quantity must be greater than zero."}
            )

        if (
            limit_qty is not None
            and awarded_qty is not None
            and awarded_qty >= limit_qty
        ):
            raise serializers.ValidationError(
                {"awarded_quantity": (
                    "Awarded quantity should be less than limit quantity."
                )}
            )

        return data

class RetailerOrderItemsSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    product = serializers.SerializerMethodField(read_only=True)
    batch = serializers.SerializerMethodField(read_only=True)
    manufacture_date = serializers.SerializerMethodField(read_only=True)
    expiry_date = serializers.SerializerMethodField(read_only=True)
    unit_quantity = serializers.SerializerMethodField(read_only=True)
    retailer = serializers.SerializerMethodField(read_only=True)
    wholesaler = serializers.SerializerMethodField(read_only=True)
    facilitator = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    line_margin = serializers.SerializerMethodField(read_only=True)
    pricing_source_label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.RetailerOrderItems
        fields = (
            "id",
            "entity",
            "title",
            "units_per_pack",
            "retailer_order",
            "retailer_indent_item",
            "product_title",
            "preparation_title",
            "wholesaler_receipt",
            "purchased_quantity",
            "discount_quantity",
            "total_quantity",

            "item_price",
            "item_price_total",
            "item_net_price",
            "item_net_price_total",
            "item_price_discount",
            "item_price_discount_total",
            "item_tax",
            "item_tax_total",
            "item_counter_price_discount",
            "item_counter_price_discount_amount",
            "item_counter_price_discount_amount_total",
            "item_final_price",
            "item_final_price_total",

            "intended_retail_unit_price",
            "intended_retail_unit_price_source",
            "line_margin",
            "pricing_source_label",

            "stakeholders",
            "is_received",
            "is_issued",
            "item_paid_amount",
            "item_pending_amount",
            "product",
            "batch",
            "manufacture_date",
            "expiry_date",
            "unit_quantity",
            "wholesaler",
            "retailer",
            "facilitator",
            "images",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
            "entity",
            # Derived fields — set by recalculate() or copied from indent
            "item_price_total",
            "item_net_price_total",
            "item_price_discount",
            "item_price_discount_total",
            "item_tax_total",
            "item_counter_price_discount_amount",
            "item_counter_price_discount_amount_total",
            "item_final_price_total",
            "line_margin",
        )

    # ------------------------------------------------------------------
    # Display helpers
    # ------------------------------------------------------------------

    def get_images(self, obj):
        product = obj.wholesaler_receipt.product if obj.wholesaler_receipt else None
        if not product:
            return None
        images = ProductImages.objects.filter(product=product)
        if not images.exists():
            return None
        return ProductImageSerializer(
            images, context=self.context, many=True,
        ).data

    def get_title(self, obj):
        product = obj.wholesaler_receipt.product if obj.wholesaler_receipt else None
        if not product:
            return ""
        if product.preparation:
            return f"{product.preparation.title} - {product.title}"
        return product.title

    def get_units_per_pack(self, obj):
        product = obj.wholesaler_receipt.product if obj.wholesaler_receipt else None
        return product.units_per_pack if product else None

    def get_product(self, obj):
        product = obj.wholesaler_receipt.product if obj.wholesaler_receipt else None
        return product.id if product else None

    def get_batch(self, obj):
        return obj.wholesaler_receipt.batch if obj.wholesaler_receipt else None

    def get_manufacture_date(self, obj):
        return (
            obj.wholesaler_receipt.manufacture_date
            if obj.wholesaler_receipt else None
        )

    def get_expiry_date(self, obj):
        return (
            obj.wholesaler_receipt.expiry_date
            if obj.wholesaler_receipt else None
        )

    def get_unit_quantity(self, obj):
        product = obj.wholesaler_receipt.product if obj.wholesaler_receipt else None
        if not product:
            return 0
        return int(obj.total_quantity or 0) * int(product.units_per_pack or 1)

    def get_product_title(self, obj):
        product = obj.wholesaler_receipt.product if obj.wholesaler_receipt else None
        return product.title if product else ""

    def get_wholesaler(self, obj):
        if obj.retailer_order and obj.retailer_order.wholesaler:
            return obj.retailer_order.wholesaler.id
        return ""

    def get_retailer(self, obj):
        if obj.retailer_order and obj.retailer_order.retailer:
            return obj.retailer_order.retailer.id
        return ""

    def get_facilitator(self, obj):
        if obj.retailer_order and obj.retailer_order.facilitator:
            return obj.retailer_order.facilitator.id
        return ""

    def get_preparation_title(self, obj):
        product = obj.wholesaler_receipt.product if obj.wholesaler_receipt else None
        if product and product.preparation:
            return product.preparation.title
        return ""

    def get_line_margin(self, obj):
        """Projected margin on the line, from intended retail vs net cost."""
        return obj.line_margin

    def get_pricing_source_label(self, obj):
        source = obj.intended_retail_unit_price_source or ""
        labels = {
            "markup": "Markup",
            "rrp": "Recommended Retail Price",
            "item_override": "Manual Override",
        }
        return labels.get(source, source.title() if source else "")

    
class WholesalerPaymentsSerializer(serializers.ModelSerializer):
    retailer_title = serializers.SerializerMethodField(
        read_only=True)
    retailer_order_reference = serializers.SerializerMethodField(
        read_only=True)
    payment_method_title = serializers.SerializerMethodField(
        read_only=True)
    class Meta:
        model = models.RetailerOrderPayments
        fields = (
            "id",
            "retailer_order",
            "retailer_order_reference",
            "retailer_title",
            "amount",
            "payment_method",
            "payment_method_title",
            "provider_reference_number",
            "pay_in_reference_number",
            "pay_out_reference_number",
            "telco",
            "description",
            "narrative",
            "status",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = ("id", "created",
                            "updated", "owner", "entity")
    def get_retailer_order_reference(self,obj):
        if obj.retailer_order.reference_number:
            return obj.retailer_order.reference_number
        else:
            return ""
    def get_retailer_title(self,obj):
        if obj.retailer_order.retailer.title:
            return obj.retailer_order.retailer.title
        else:
            return ""
    def get_payment_method_title(self,obj):
        if obj.payment_method:
            return obj.payment_method.title
        else:
            return ""

# wholesalers/serializers.py

from rest_framework import serializers

from wholesalers.models import WholesalerReceiptReturns


class WholesalerReceiptReturnDetailSerializer(serializers.ModelSerializer):
    """
    Full read-only detail of a return. Used by:
      - InitiateReturn
      - CreateReturn
      - GetReturnDetails
      - UpdateReturn
      - ConfirmReturn
      - RejectReturn
      - SettleReturn
      - CancelReturn
    """

    # Nested read-only — human-readable labels
    product_title = serializers.CharField(source="product.title", read_only=True)
    product_bar_code = serializers.CharField(
        source="product.bar_code", read_only=True,
    )
    retailer_title = serializers.CharField(
        source="retailer_entity.title", read_only=True,
    )
    wholesaler_title = serializers.CharField(
        source="wholesaler_entity.title", read_only=True,
    )
    wholesaler_batch = serializers.CharField(
        source="wholesaler_receipt.batch", read_only=True,
    )
    wholesaler_expiry_date = serializers.DateField(
        source="wholesaler_receipt.expiry_date", read_only=True,
    )
    retailer_batch = serializers.CharField(
        source="retailer_receipt.batch", read_only=True,
    )
    retailer_expiry_date = serializers.DateField(
        source="retailer_receipt.expiry_date", read_only=True,
    )
    order_reference = serializers.CharField(
        source="retailer_order.reference_number", read_only=True,
    )
    initiating_adjustment_id = serializers.UUIDField(read_only=True)

    # Display strings
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )
    reason_display = serializers.CharField(
        source="get_reason_display", read_only=True,
    )
    return_type_display = serializers.CharField(
        source="get_return_type_display", read_only=True,
    )
    confirmation_outcome_display = serializers.CharField(
        source="get_confirmation_outcome_display", read_only=True,
    )

    # Property fields
    net_refund_per_unit = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True,
    )

    class Meta:
        model = WholesalerReceiptReturns
        fields = [
            # identifiers
            "id", "draft_id", "document_number", "reference_number",
            # references
            "retailer_order", "retailer_order_item",
            "retailer_entity", "wholesaler_entity",
            "retailer_receipt", "wholesaler_receipt",
            "initiating_adjustment", "initiating_adjustment_id",
            "product",
            # nested read-only
            "product_title", "product_bar_code",
            "retailer_title", "wholesaler_title",
            "wholesaler_batch", "wholesaler_expiry_date",
            "retailer_batch", "retailer_expiry_date",
            "order_reference",
            # quantity
            "quantity", "unit_of_return",
            # financials
            "unit_price_paid", "unit_price_refunded",
            "restocking_fee_percent", "net_refund_per_unit",
            "total_refund_amount",
            # reason
            "reason", "reason_display", "justification",
            "return_type", "return_type_display",
            # confirmation
            "confirmation_outcome", "confirmation_outcome_display",
            "confirmed_quantity", "written_off_quantity",
            "confirmation_notes",
            # state
            "status", "status_display",
            "is_confirmed", "is_settled",
            # who
            "employee", "confirmed_by", "settled_by", "rejected_by",
            "owner",
            # timestamps
            "confirmed_at", "settled_at", "rejected_at", "cancelled_at",
            "created", "updated",
        ]
        read_only_fields = fields  # everything


class WholesalerReceiptReturnListSerializer(serializers.ModelSerializer):
    """
    Lightweight list output. Used by:
      - ListReturns
      - GetStaleReturns
      - GetReturnMismatches
    """

    product_title = serializers.CharField(source="product.title", read_only=True)
    retailer_title = serializers.CharField(
        source="retailer_entity.title", read_only=True,
    )
    wholesaler_title = serializers.CharField(
        source="wholesaler_entity.title", read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )
    reason_display = serializers.CharField(
        source="get_reason_display", read_only=True,
    )
    confirmation_outcome_display = serializers.CharField(
        source="get_confirmation_outcome_display", read_only=True,
    )

    class Meta:
        model = WholesalerReceiptReturns
        fields = [
            "id",
            "product", "product_title",
            "retailer_entity", "retailer_title",
            "wholesaler_entity", "wholesaler_title",
            "quantity", "total_refund_amount",
            "reason", "reason_display",
            "status", "status_display",
            "confirmation_outcome", "confirmation_outcome_display",
            "created", "updated",
        ]
        read_only_fields = fields
