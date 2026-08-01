from unicodedata import decimal
from rest_framework import serializers, exceptions
# from manufacturers.utils.distributor_order_utils import check_distributor_order_is_paid

from products.serializers import ProductsSerializer
from . import models
from utils.validations import start_and_end_date_validated
from authentication.serializers import EntitySerializer, StakesSerializer
from payments.serializers import PriceDiscountsSerializer, QuantityDiscountsSerializer


class ManufacturerCouponsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ManufacturerCoupons
        fields = ('id', 'url', 'code', 'valid_from', 'valid_to', 'discount',
                  'created', 'updated', 'owner')
        read_only_fields = ('id', 'url',  'created',
                            'updated', 'owner', 'entity')

    def validate(self, attrs):
        valid_from = attrs.get('valid_from', None)
        valid_to = attrs.get('valid_to', None)

        if start_and_end_date_validated(valid_from, valid_to):
            return attrs


class ManufacturerVariationsSerializer(serializers.ModelSerializer):
    price_discount_details = serializers.SerializerMethodField(
        read_only=True)
    quantity_discount_details = serializers.SerializerMethodField(
        read_only=True)
    product_details = serializers.SerializerMethodField(
        read_only=True)
    pack_discount_selling_price = serializers.SerializerMethodField(
        read_only=True)
    item_price_discount = serializers.SerializerMethodField(
        read_only=True)

    class Meta:
        model = models.ManufacturerVariations
        fields = (
            'id',
            'url',
            'entity',
            'product',
            'batch',
            'manufacture_date',
            'expiry_date',
            'price_discount',
            'quantity_discount',
            'pack_buying_price',
            'pack_selling_price',
            'pack_discount_selling_price',
            'item_price_discount',
            'pack_quantity',
            'is_active',
            'created',
            'updated',
            'owner',
            'price_discount_details',
            'quantity_discount_details',
            'product_details',
        )

        read_only_fields = ('id', 'entity', 'url',  'created',
                            'updated', 'owner', 'entity', 'price_discount_details', 'quantity_discount_details',)

    def get_price_discount_details(self, object):
        if object.manufacturer_price_discount == None:
            return None
        else:
            return PriceDiscountsSerializer(object.manufacturer_price_discount, context=self.context).data

    def get_quantity_discount_details(self, object):
        if object.manufacturer_quantity_discount == None:
            return None
        else:
            return QuantityDiscountsSerializer(object.manufacturer_quantity_discount, context=self.context).data

    def get_product_details(self, object):
        if object.product == None:
            return None
        else:
            return ProductsSerializer(object.product, context=self.context, many=False).data

    def get_pack_discount_selling_price(self, object):
        if object.manufacturer_price_discount == None:
            return None
        else:
            discount = object.manufacturer_price_discount.percent / \
                100 * object.pack_selling_price

            discountPrice = float("{:.2f}".format(
                object.pack_selling_price - discount))
            return discountPrice

    def get_item_price_discount(self, object):
        discount = 0.00
        if object.manufacturer_price_discount == None:
            return None
        else:
            discount = object.manufacturer_price_discount.percent / \
                100 * object.pack_selling_price

            # discountPrice = float("{:.2f}".format(
            #     object.pack_selling_price - discount))
            return discount


class DistributorOrdersSerializer(serializers.ModelSerializer):
    manufacturer_coupon_details = serializers.SerializerMethodField(
        read_only=True)
    manufacturer_order_items = serializers.SerializerMethodField(
        read_only=True)
    manufacturer_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.DistributorOrders
        fields = (
            'id',
            'manufacturer',
            'url',
            'payment',
            'order_terms',
            'order_total_tax',
            'order_shipping_cost',
            'order_gross_cost',
            'order_total_discount',
            'order_net_cost',
            'order_final_cost',
            'manufacturer_coupon',
            'draft_id',
            'is_paid',
            'paid_at',
            'is_packed',
            'packed_at',
            'packed_by',
            'is_delivered',
            'delivered_at',
            'delivered_by',
            'is_processed',
            'processed_at',
            'processed_by',
            'is_checked',
            'checked_at',
            'checked_by',
            'is_dispatched',
            'dispatched_at',
            'dispatched_by',
            'is_received',
            'received_at',
            'received_by',
            'owner',
            'manufacturer_coupon_details',
            'manufacturer_order_items',
            'manufacturer_details',
            'created',
            'updated')
        read_only_fields = (
            'owner', 'manufacturer_order_items',
        )

    def get_manufacturer_coupon_details(self, obj):
        if obj.manufacturer_coupon:
            return ManufacturerCouponsSerializer(obj.manufacturer_coupon, context=self.context).data
        else:
            return None

    def get_manufacturer_details(self, obj):
        if obj.manufacturer:
            return EntitySerializer(obj.manufacturer, context=self.context).data
        else:
            return None

    def get_manufacturer_order_items(self, obj):
        if models.DistributorOrderItems.objects.filter(distributor_order=obj).count() > 0:
            return DistributorOrderItemsSerializer(models.DistributorOrderItems.objects.filter(distributor_order=obj).all(), context=self.context, many=True).data
        else:
            return None


class DistributorOrderItemsSerializer(serializers.ModelSerializer):
    item_stakeholer_details = serializers.SerializerMethodField(read_only=True)
    manufacturer_variation_details = serializers.SerializerMethodField(
        read_only=True)

    class Meta:
        model = models.DistributorOrderItems
        fields = ('id',
                  'url',
                  'distributor_order',
                  'manufacturer_variation',
                  'stakeholders',
                  'purchased_quantity',
                  'discount_quantity',
                  'total_quantity',
                  'item_tax',
                  'item_gross_price',
                  'item_net_price',
                  'item_discount',
                  'item_pending_amount',
                  'item_paid_amount',
                  'is_received',
                  'item_stakeholer_details',
                  'manufacturer_variation_details',
                  'owner',
                  'created',
                  'updated')
        read_only_fields = (
            'owner',
        )

    def get_item_stakeholer_details(self, obj):
        if obj.item_stakeholders:
            return StakesSerializer(obj.item_stakeholders, context=self.context, many=True).data
        else:
            return None

    def get_manufacturer_variation_details(self, obj):
        if obj.manufacturer_variation:
            return ManufacturerVariationsSerializer(obj.manufacturer_variation, context=self.context, many=False).data
        else:
            return None


class ManufacturerPaymnetsSerializer(serializers.ModelSerializer):

    class Meta:
        model = models.ManufacturerPayments
        fields = ('id',
                  'url',
                  'entity',
                  'distributor_order',
                  'payee',
                  'amount',
                  'payment_method',
                  'narrative',
                  'reference',
                  'status',
                  'owner',
                  'orderSetPaid',
                  'created',
                  'updated')
        read_only_fields = (
            'owner',
        )

    def create(self, validated_data):
        distributor_order = None
        if 'distributor_order' in validated_data:
            distributor_order = validated_data.get('distributor_order', None)
        if distributor_order:
            if check_distributor_order_is_paid(distributor_order):
                raise exceptions.ValidationError("Order is already paid for")
        created = models.ManufacturerPayments.objects.create(**validated_data)
        if distributor_order:
            distributor_order.payment = created
            distributor_order.save()
        return created
