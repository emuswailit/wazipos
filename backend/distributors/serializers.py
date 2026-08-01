import datetime
from rest_framework import serializers, exceptions

from . import models
from utils.validations import start_and_end_date_validated, manufacture_and_expiry_dates_validated
from django.db import transaction
from products.serializers import ProductsSerializer
from authentication.serializers import EntitySerializer, StakesSerializer
from payments.serializers import PriceDiscountsSerializer, QuantityDiscountsSerializer


class DistributorCouponsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.DistributorCoupons
        fields = ('id', 'url', 'code', 'valid_from', 'valid_to', 'discount',
                  'created', 'updated', 'owner')
        read_only_fields = ('id', 'url',  'created',
                            'updated', 'owner', 'entity')

    def validate(self, attrs):
        valid_from = attrs.get('valid_from', None)
        valid_to = attrs.get('valid_to', None)

        if start_and_end_date_validated(valid_from, valid_to):
            return attrs


class DistributorVariationsSerializer(serializers.ModelSerializer):
    distributor_receipts = serializers.SerializerMethodField(read_only=True)
    product_details = serializers.SerializerMethodField(read_only=True)
    pack_quantity = serializers.SerializerMethodField(read_only=True)
    last_one_month_consumption = serializers.SerializerMethodField(
        read_only=True)

    class Meta:
        model = models.DistributorVariations
        fields = (
            'id',
            'url',
            'product',
            'pack_quantity',
            'is_active',
            'created',
            'updated',
            'owner',
            'distributor_receipts',
            'product_details',
            'last_one_month_consumption',

        )
        read_only_fields = ('id', 'url',  'created',
                            'updated', 'owner', 'entity', 'distributor_receipts', 'product_details')

    def get_product_details(self, obj):
        return ProductsSerializer(obj.product, context=self.context, many=False).data

    def get_last_one_month_consumption(self, obj):
        items_count = 0
        lastHourDateTime = datetime.datetime.now() - datetime.timedelta(days=30)
        if models.WholesalerOrderItems.objects.filter(distributor_receipt__distributor_variation=obj, created__lte=lastHourDateTime).exists():
            items_count = models.WholesalerOrderItems.objects.filter(
                distributor_receipt__distributor_variation=obj, created__lte=lastHourDateTime).count()
        return items_count

    def get_distributor_receipts(self, obj):
        receipts = None
        if models.DistributorReceipts.objects.filter(distributor_variation=obj).count() > 0:
            receipts = models.DistributorReceipts.objects.filter(
                distributor_variation=obj).all()
            return DistributorReceiptsSerializer(receipts, context=self.context, many=True).data
        return None

    def get_pack_quantity(self, obj):
        if models.DistributorReceipts.objects.filter(distributor_variation=obj).exists():
            wholesalerReceipts = models.DistributorReceipts.objects.filter(
                distributor_variation=obj)
            return sum(item.pack_quantity for item in wholesalerReceipts)
        else:
            return 0


class DistributorReceiptsSerializer(serializers.ModelSerializer):
    product_details = serializers.SerializerMethodField(read_only=True)
    quantity_discount_details = serializers.SerializerMethodField(
        read_only=True)
    price_discount_details = serializers.SerializerMethodField(
        read_only=True)
    item_price_discount = serializers.SerializerMethodField(
        read_only=True)

    class Meta:
        model = models.DistributorReceipts
        fields = (
            'id',
            'entity',
            'product',
            'received_from',
            'distributor_order_item',
            'batch',
            'distributor_variation',
            'price_discount',
            'quantity_discount',
            'pack_buying_price',
            'pack_selling_price',
            'pack_quantity',
            'manufacture_date',
            'expiry_date',
            'is_active',
            'created',
            'updated',
            'owner',
            'product_details',
            'quantity_discount_details',
            'price_discount_details',
            'item_price_discount'
        )
        read_only_fields = ('id', 'entity',  'created',
                            'updated', 'owner', 'quantity_discount_details',
                            'price_discount_details', 'Entity')

    def validate(self, attrs):
        distributor_order_item = None
        distributor_order_item = attrs.get(
            'distributor_order_item', None)

        if distributor_order_item:
            if distributor_order_item.is_received:
                raise exceptions.ValidationError("Item is already received")
        else:
            raise exceptions.ValidationError("I need distributor order item")

        manufacture_date = None
        if self.context['request'].method == 'PATCH':
            return attrs
        if self.context['request'].method == 'POST' and not 'pack_buying_price' in attrs:
            raise exceptions.ValidationError("Pack buying price is required")
        manufacture_date = attrs.get('manufacture_date', None)
        expiry_date = attrs.get('expiry_date', None)
        product = attrs.get('product', None)

        if self.context['request'].method == 'POST' and product.preparation:
            if manufacture_date == None:
                raise exceptions.ValidationError(
                    "Enter manufacture date for drug products")
            if expiry_date == None:
                raise exceptions.ValidationError("Enter expiry date")
            is_valid = manufacture_and_expiry_dates_validated(
                manufacture_date, expiry_date)

            if is_valid == True:
                return attrs
        else:
            raise exceptions.ValidationError("Date have issues")

    @transaction.atomic
    def create(self, validated_data):
        distributor_order_item = None
        distributor_order_item = validated_data.get(
            'distributor_order_item', None)
        product = validated_data.get('product', None)

        if distributor_order_item.is_received:
            raise exceptions.ValidationError("Item is already received")
        pack_quantity = validated_data.get('pack_quantity', None)
        user = self.context.get('user', None)

        if models.DistributorVariations.objects.filter(product=product).count() > 0:
            distributor_variation = models.DistributorVariations.objects.filter(
                product=product).first()
        else:
            distributor_variation = models.DistributorVariations.objects.create(
                product=product, owner=user, entity=user.entity)

        created = models.DistributorReceipts.objects.create(
            distributor_variation=distributor_variation, **validated_data)
        if distributor_order_item:
            distributor_order_item.is_received = True
            distributor_order_item.save()

        return created

    def get_product_details(self, obj):
        return ProductsSerializer(obj.product, context=self.context, many=False).data

    def get_quantity_discount_details(self, obj):
        if obj.quantity_discount:
            if models.DistributorQuantityDiscounts.objects.filter(
                    id=obj.quantity_discount.id).exists():
                wqd = models.DistributorQuantityDiscounts.objects.filter(
                    id=obj.quantity_discount.id).first()
            return QuantityDiscountsSerializer(wqd, context=self.context,).data
        return None

    def get_price_discount_details(self, obj):
        if obj.price_discount:
            if models.DistributorPriceDiscounts.objects.filter(
                    id=obj.price_discount.id).exists():
                wqd = models.WholesalerQuantityDiscounts.objects.filter(
                    id=obj.price_discount.id).first()
            return PriceDiscountsSerializer(wqd, context=self.context,).data
        return None

    def get_item_price_discount(self, object):
        discount = 0.00
        if object.price_discount == None:
            return 0.00
        else:
            discount = object.price_discount.percent / \
                100 * object.pack_selling_price
            return discount


class WholesalerOrdersSerializer(serializers.ModelSerializer):
    distributor_coupon_details = serializers.SerializerMethodField(
        read_only=True)
    wholesaler_order_items = serializers.SerializerMethodField(read_only=True)
    distributor_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.WholesalerOrders
        fields = (
            'id',
            'distributor',
            'draft_id',
            'tax_total',
            'shipping_amount',
            'items_price_total',
            'discount_total',
            'net_price_total',
            'final_amount_total',
            'distributor_payment',
            'delivery_method',
            'order_terms',
            'is_paid',
            'payment',
            'distributor_coupon',
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
            'is_approved',
            'approved_by',
            'approved_at',
            'distributor_coupon_details',
            'wholesaler_order_items',
            'distributor_details',
            'owner',
            'created',
            'updated')
        read_only_fields = (
            'owner', 'payment',
        )

    def get_distributor_coupon_details(self, obj):
        if obj.distributor_coupon:
            return DistributorCouponsSerializer(obj.distributor_coupon, context=self.context).data
        else:
            return None

    def get_distributor_details(self, obj):
        if obj.distributor:
            return EntitySerializer(obj.distributor, context=self.context).data
        else:
            return None

    def get_wholesaler_order_items(self, obj):
        if models.WholesalerOrderItems.objects.filter(wholesaler_order=obj).count() > 0:
            return WholesalerOrderItemsSerializer(models.WholesalerOrderItems.objects.filter(wholesaler_order=obj).all(), context=self.context, many=True).data
        else:
            return None


class WholesalerOrderItemsSerializer(serializers.ModelSerializer):
    stakeholder_details = serializers.SerializerMethodField(read_only=True)
    product_details = serializers.SerializerMethodField(read_only=True)
    distributor_receipt_details = serializers.SerializerMethodField(
        read_only=True)

    class Meta:
        model = models.WholesalerOrderItems
        fields = ('id',
                  'distributor_receipt',
                  'wholesaler_order',
                  'purchased_quantity',
                  'discount_quantity',
                  'total_quantity',
                  'stakeholders',
                  'item_gross_price',
                  'item_discount',
                  'item_net_price',
                  'item_tax',
                  'is_received',
                  'owner',
                  'created',
                  'updated',
                  'stakeholder_details',
                  'product_details',
                  'distributor_receipt_details'

                  )
        read_only_fields = (
            'owner', 'tax_amount'
        )

    def get_stakeholder_details(self, obj):
        if obj.stakeholders:
            return StakesSerializer(obj.stakeholders, context=self.context, many=True).data
        else:
            return None

    def get_product_details(self, obj):
        return ProductsSerializer(obj.distributor_receipt.product, context=self.context, many=False).data

    def get_distributor_receipt_details(self, obj):
        return DistributorReceiptsSerializer(obj.distributor_receipt, context=self.context, many=False).data


class DistributorPaymnetsSerializer(serializers.ModelSerializer):

    class Meta:
        model = models.DistributorPayments
        fields = ('id',
                  'url',
                  'entity',
                  'wholesaler_order',
                  'distributor',
                  'amount',
                  'payment_method',
                  'narrative',
                  'reference',
                  'status',
                  'owner',
                  'created',
                  'updated')
        read_only_fields = (
            'owner',
        )
