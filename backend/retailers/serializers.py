from datetime import date, datetime
from venv import create

from rest_framework.validators import UniqueTogetherValidator
from drugs.models import Frequency, Preparation, Routes
from products.models import ProductImages, Products
from employees.models import Employees
from employees.serializers import EmployeesSerializer
from authentication.models import UserImages
from products.serializers import ProductImageSerializer, ProductsSerializer
from wholesalers.models import RetailerOrderItems, WholesalerReceipts,WholesalerPriceDiscounts,WholesalerQuantityDiscounts
from wholesalers.serializers import WholesalerPriceDiscountsSerializer,WholesalerQuantityDiscountsSerializer
from . import models
from authentication.models import Entities
from utils.logging import create_log
from django.db import transaction
from rest_framework import serializers, exceptions
from authentication.serializers import (
    DependantsSerializer,
    EntitySerializer,
    UsersSerializer,
    GenericUserSerializer,
    UserImageSerializer,
    EntityMiniSerializer
)
from django.db.models import Sum
from rest_framework.response import Response
from payments.serializers import (
    PaymentMethodsSerializer,
    PriceDiscountsSerializer,
    QuantityDiscountsSerializer,
)
from payments.models import PaymentMethods

from . import models

# Retailer variations receipts serializer


class ReviewsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailerReviews
        fields = (
            "id",
            "url",
            "variation",
            "rating",
            "comment",
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

    def create(self, validated_data):
        user = self.context.get("user")
        variation = validated_data.get("variation", None)

        # Check if user has already reviewed the variation
        if variation:
            if models.RetailerReviews.objects.filter(
                variation=variation, owner=user
            ).exists():
                raise exceptions.ValidationError(
                    f"Review for {variation} by {user} already exists "
                )

        rating = validated_data.get("rating", None)

        # Ensure user has selected a rating
        if not rating:
            raise exceptions.ValidationError("Please select a rating")

        review = models.RetailerReviews.objects.create(**validated_data)
        if review:
            reviews = variation.reviews_set.all()
            variation.num_reviews = len(reviews)
            # Calculate and save current variation rating
            total = 0
            for i in reviews:
                total += i.rating
            variation.rating = total / len(reviews)
            variation.save()
            return review
        else:
            raise exceptions.ValidationError("Review was not created")

    def update(self, instance, validated_data):
        comment = validated_data.get("comment", instance.comment)
        instance.comment = comment
        instance.save()

        rating = validated_data.get("rating", instance.rating)
        instance.rating = rating
        instance.save()

        reviews = instance.variation.reviews_set.all()
        total = 0
        for i in reviews:
            total += i.rating
        instance.variation.num_reviews = len(reviews)
        instance.variation.rating = total / len(reviews)
        instance.variation.save()

        return instance


class ShippingAddressSerializer(serializers.ModelSerializer):
    county_title = serializers.SerializerMethodField(read_only=True)
    country_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.ShippingAddress
        fields = (
            "id",
            "entity",
            "contact_person_name",
            "contact_person_phone",
            "estate",
            "road",
            "city",
            "county",
            "county_title",
            "country",
            "country_title",
            "created",
            "updated",
        )
        read_only_fields = (
            "owner",
            "created",
            "updated",
            "entity",
        )

    def get_county_title(self,obj):
        if obj.county:
            return obj.county.title
        else:
            return ""
    def get_country_title(self,obj):
        if obj.country:
            return obj.country.title
        else:
            return ""

class WholesaleReceiptsSerializer(serializers.ModelSerializer):
    class Meta:
        model = WholesalerReceipts
        fields ="__all__"
        read_only_fields = (
            "owner",
            "created",
            "updated",
            "entity",
        )


class OrderEstimateSerializer(serializers.ModelSerializer):
    images = serializers.SerializerMethodField(read_only=True)
    offers = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.OrderEstimate
        fields =(
            "entity",
            "product",
            "product_title",
            "required_estimate",
            "current_quantity",
            "average_sold_daily",
            "retailer_indent",
            "offers",
            "images"
        )
        read_only_fields = (
            "owner",
            "created",
            "updated",
            "entity",
        )
    def get_product_title(self, obj):
        return obj.product.title
    
    def get_images(self, obj):
        images = []
        if obj.product:
            images = ProductImages.objects.filter(product_id=obj.product.id)
            return ProductImageSerializer(images, context=self.context, many=True).data
        return images   
    def get_offers(self, obj):
        offers = []
        if obj.product:
            offers = WholesalerReceipts.objects.filter(product_id=obj.product.id)
            return WholesalerReceiptsDisplaySerializer(offers, context=self.context, many=True).data
        return offers   
    
class WholesalerReceiptsDisplaySerializer(serializers.ModelSerializer):
    images = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    preparation = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    wholesaler_price_discount = serializers.SerializerMethodField(read_only=True)
    wholesaler_quantity_discounts = serializers.SerializerMethodField(read_only=True)
 

    class Meta:
        model = WholesalerReceipts
        fields = (
            "id",
            "entity",
            "entity_title",
            "product",
            "product_title",
            "preparation",
            "preparation_title",
            "units_per_pack",
            "current_unit_quantity",
            "unit_selling_price",
            "final_unit_selling_price",
            "images",
            "wholesaler_price_discount",
            "wholesaler_quantity_discounts",
           
        )
        read_only_fields = (
                    "owner",
                    "created",
                    "updated",
                    "entity",
                )
    def get_product_title(self, obj):
        return obj.product.title

    # def get_object_type(self, obj):
    #     return "WholesalerReceipt"

    def get_units_per_pack(self, obj):
        return obj.product.units_per_pack

    def get_preparation(self, obj):
        preparation_id = ""
        if obj.product.preparation:
            preparation_id = obj.product.preparation.id
        return preparation_id

    def get_preparation_title(self, obj):
        if obj.product.preparation:
            return obj.product.preparation.title
        else:
            return ""

    def get_entity_title(self, obj):
        if obj.entity:
            return obj.entity.title
        else:
            return ""

    def get_images(self, obj):
        images = []
        if obj.product:
            images = ProductImages.objects.filter(product_id=obj.product.id)
            return ProductImageSerializer(images, context=self.context, many=True).data
        return images
    
    def get_wholesaler_price_discount(self, obj):
        wholesaler_price_discount = None
        if WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=obj,is_active="true").exists():
            wholesaler_price_discounts =WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=obj,is_active="true").first()
            return WholesalerPriceDiscountsSerializer(wholesaler_price_discounts, context=self.context, many=False).data
        else:
            return None


    def get_wholesaler_quantity_discounts(self, obj):
        wholesaler_quantity_discounts = []
        if WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=obj,is_active="true").exists():
            wholesaler_price_discounts =WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=obj,is_active="true").all()
            return WholesalerQuantityDiscountsSerializer(wholesaler_price_discounts, context=self.context, many=True).data
        return wholesaler_quantity_discounts

class RetailerVariationsSerializer(serializers.ModelSerializer):
    object_type = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)
    product = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    preparation = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    # product_details = serializers.SerializerMethodField(read_only=True)
    # entity_details = serializers.SerializerMethodField(read_only=True)
    reviews = serializers.SerializerMethodField(read_only=True)
    # variation_receipts = serializers.SerializerMethodField(read_only=True)
    number_of_receipts = serializers.SerializerMethodField(read_only=True)
    total_quantity_received = serializers.SerializerMethodField(read_only=True)
    number_of_issues = serializers.SerializerMethodField(read_only=True)
    total_quantity_issued = serializers.SerializerMethodField(read_only=True)
    average_buying_price = serializers.SerializerMethodField(read_only=True)
    average_selling_price = serializers.SerializerMethodField(read_only=True)
    current_quantity = serializers.SerializerMethodField(read_only=True)
    wholesaler_offers = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.RetailerVariations
        fields = (
            "id",
            "url",
            "entity",
            "entity_title",
            "product",
            "product_title",
            "units_per_pack",
            "preparation",
            "preparation_title",
            "minimum_stock",
            "maximum_stock",
            "reorder_level",
            "lead_time",
            "economic_order_quantity",
            "safety_stock",
            "danger_stock",
            "number_of_receipts",
            "total_quantity_received",
            "number_of_issues",
            "total_quantity_issued",
            "description",
            "rating",
            "num_reviews",
            "reviews",
            "is_active",
            "owner",
            "average_buying_price",
            "average_selling_price",
            "current_quantity",
            "object_type",
            "created",
            "updated",
            "images",
            "wholesaler_offers",
        )

        read_only_fields = (
            "id",
            "url",
            "entity",
            "entity_title",
            "rating",
            "pack_quantity",
            "unit_quantity",
            "num_reviews",
            "variation_receipts",
            "average_buying_price",
            "average_selling_price",
            "current_quantity",
            "object_type",
            "url",
            "created",
            "updated",
            "owner",
        )

    def validate(self, attrs):
        """
        Validation to ensure only one product variation exists per entity
        """
        user = self.context.get("user", None)
        product = attrs.get("product", None)
        if user and product:
            if models.RetailerVariations.objects.filter(
                product=product, entity=user.entity
            ).exists():
                raise exceptions.ValidationError(
                    "Variation for selected product already exists in your entity"
                )
        return super().validate(attrs)

    def get_images(self, obj):
        images = []
        if obj.product:
            images = ProductImages.objects.filter(product_id=obj.product.id)
            return ProductImageSerializer(images, context=self.context, many=True).data
        return images

    def get_object_type(self, obj):
        return "RetailerVariations"

    def get_product(self, obj):
        return obj.product.id

    def get_product_title(self, obj):
        return obj.product.title

    def get_units_per_pack(self, obj):
        return obj.product.units_per_pack

    def get_preparation(self, obj):
        preparation_id = ""
        if obj.product.preparation:
            preparation_id = obj.product.preparation.id
        return preparation_id

    def get_preparation_title(self, obj):
        if obj.product.preparation:
            return obj.product.preparation.title
        else:
            return ""

    # def get_product_details(self, obj):
    #     if obj.product:
    #         product = models.Products.objects.get(id=obj.product.id)
    #         return ProductsSerializer(product, context=self.context).data
    #     return None

    # def get_entity_details(self, obj):
    #     entity = Entities.objects.get(id=obj.entity.id)
    #     return EntitySerializer(entity, context=self.context).data
    def get_entity_title(self, obj):
        entity = Entities.objects.get(id=obj.entity.id)
        # return entity.title
        return ""

    def get_reviews(self, obj):
        if models.RetailerReviews.objects.filter(variation_id=obj.id).exists():
            reviews = models.RetailerReviews.objects.filter(variation_id=obj.id)
            return ReviewsSerializer(reviews, context=self.context, many=True).data
        else:
            return None

    def get_unitQuantity(self, obj):
        return obj.pack_quantity * obj.units_per_pack

    def get_number_of_receipts(self, obj):
        number_of_receipts = 0
        if models.RetailerReceipts.objects.filter(
            retailer_variation_id=obj.id
        ).exists():
            number_of_receipts = models.RetailerReceipts.objects.filter(
                retailer_variation_id=obj.id
            ).count()
        return number_of_receipts

    def get_total_quantity_received(self, obj):
        """Total quantities received so far"""
        total_quantity_received = 0
        if models.RetailerReceipts.objects.filter(
            retailer_variation_id=obj.id
        ).exists():
            total_quantity_received = models.RetailerReceipts.objects.filter(
                retailer_variation_id=obj.id
            ).aggregate(TOTAL=Sum("pack_quantity"))["TOTAL"]
        return total_quantity_received

    def get_number_of_issues(self, obj):
        number_of_issues = 0
        if models.CustomerOrderItems.objects.filter(
            retailer_receipt__product_id=obj.product.id
        ).exists():
            number_of_receipts = models.CustomerOrderItems.objects.filter(
                retailer_receipt__product_id=obj.product.id
            ).count()
        return number_of_issues

    def get_total_quantity_issued(self, obj):
        """ """
        total_quantity_issued = 0
        if models.CustomerOrderItems.objects.filter(
            retailer_receipt__product_id=obj.product.id
        ).exists():
            total_quantity_issued = models.CustomerOrderItems.objects.filter(
                retailer_receipt__product_id=obj.product.id
            ).aggregate(TOTAL=Sum("total_quantity"))["TOTAL"]
        return total_quantity_issued

    def get_current_quantity(self, obj):
        total_quantity_issued = 0
        total_quantity_received = 0
        if models.RetailerReceipts.objects.filter(
            retailer_variation_id=obj.id
        ).exists():
            total_quantity_received = models.RetailerReceipts.objects.filter(
                retailer_variation_id=obj.id
            ).aggregate(TOTAL=Sum("pack_quantity"))["TOTAL"]

        if models.CustomerOrderItems.objects.filter(
            retailer_receipt__product_id=obj.product.id
        ).exists():
            total_quantity_issued = models.CustomerOrderItems.objects.filter(
                retailer_receipt__product_id=obj.product.id
            ).aggregate(TOTAL=Sum("total_quantity"))["TOTAL"]
        return total_quantity_received - total_quantity_issued

    def get_average_buying_price(self, obj):
        """Average buying price"""
        average_buying_price = 0
        if models.RetailerReceipts.objects.filter(
            retailer_variation_id=obj.id
        ).exists():
            average_buying_price = models.RetailerReceipts.objects.filter(
                retailer_variation_id=obj.id
            ).aggregate(TOTAL=Sum("pack_buying_price"))["TOTAL"]
        return float(average_buying_price)

    def get_average_selling_price(self, obj):
        """ """
        average_selling_price = 0
        if models.CustomerOrderItems.objects.filter(
            retailer_receipt__product_id=obj.product.id
        ).exists():
            average_selling_price = models.CustomerOrderItems.objects.filter(
                retailer_receipt__product_id=obj.product.id
            ).aggregate(TOTAL=Sum("item_price"))["TOTAL"]
        return average_selling_price

    def get_wholesaler_offers(self, obj):
        items = []
        if WholesalerReceipts.objects.filter(product_id=obj.product.id).exists():
            items = (
                WholesalerReceipts.objects.filter(product_id=obj.product.id)
                .filter(product_id=obj.product.id)
                .all()
            )
        return WholesalerReceiptsDisplaySerializer(
            items, context=self.context, many=True
        ).data

    # def get_variation_receipts(self, obj):
    #     if models.RetailerReceipts.objects.filter(
    #         retailer_variation_id=obj.id
    #     ).exists():
    #         items = models.RetailerReceipts.objects.filter(
    #             retailer_variation_id=obj.id
    #         ).all()
    #         return RetailerReceiptsSerializer(
    #             items, context=self.context, many=True
    #         ).data
    #     else:
    #         return None


class CustomerOrderItemsSerializer(serializers.ModelSerializer):
    receipt_details = serializers.SerializerMethodField(read_only=True)
    # item_profit = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    item_price_discount_total = serializers.SerializerMethodField(read_only=True)
    discount_quantity = serializers.SerializerMethodField(read_only=True)


    class Meta:
        model = models.CustomerOrderItems
        fields = (
            "id",
            "title",
            "customer_order",
            "retailer_receipt",
            "purchased_quantity",
            "discount_quantity",
            "total_quantity",
            "unit_of_issue",
            "quantity",
            "item_price",
            # "item_profit",
            "item_price_total",
            "item_tax",
            "item_tax_total",
            "item_price_discount",
            "item_price_discount_total",
            "item_net_price",
            "item_net_price_total",
            "item_counter_price_discount",
            "item_counter_price_discount_amount",
            "item_counter_price_discount_amount_total",
            "receipt_details",
            "created",
            "updated",
            "images",
        )
        read_only_fields = ("id", "url", "dose", "created", "updated")
    
    def get_item_price_discount_total(self,obj):
        if obj.item_price_discount_total:
            return obj.item_price_discount_total
        else:
            return "0.00"
        
    def get_discount_quantity(self,obj):
        if obj.discount_quantity:
            return obj.discount_quantity
        else:
            return "0"

    def get_variationDetails(self, obj):
        if models.RetailerVariations.objects.filter(id=obj.variation.id).exists():
            variation = models.RetailerVariations.objects.filter(
                id=obj.variation.id
            ).first()
            return RetailerVariationsSerializer(
                variation, context=self.context, many=False
            ).data
        else:
            return None

    def get_title(self, obj):
        return obj.retailer_receipt.product.title

    def get_images(self, obj):
        images = None
        if obj.retailer_receipt.product:
            if ProductImages.objects.filter(
                product=obj.retailer_receipt.product
            ).exists():
                images = ProductImages.objects.filter(
                    product=obj.retailer_receipt.product
                ).all()
            return ProductImageSerializer(images, context=self.context, many=True).data
        return None

    def get_receipt_details(self, obj):
        if obj.retailer_receipt:
            return RetailerReceiptsSerializer(
                obj.retailer_receipt, context=self.context
            ).data
        return None
    
class DuplicateCustomerOrderItemsSerializer(serializers.ModelSerializer):
   
    # item_profit = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    item_price_discount_total = serializers.SerializerMethodField(read_only=True)
    discount_quantity = serializers.SerializerMethodField(read_only=True)
    customer_order_number = serializers.SerializerMethodField(read_only=True)


    class Meta:
        model = models.CustomerOrderItems
        fields = (
            "id",
            "title",
            "customer_order",
            "customer_order_number",
            "retailer_receipt",
            "purchased_quantity",
            "discount_quantity",
            "total_quantity",
            "unit_of_issue",
            "quantity",
            "item_price",
            # "item_profit",
            "item_price_total",
            "item_tax",
            "item_tax_total",
            "item_price_discount",
            "item_price_discount_total",
            "item_net_price",
            "item_net_price_total",
            "item_counter_price_discount",
            "item_counter_price_discount_amount",
            "item_counter_price_discount_amount_total",
            "created",
            "updated",
            "images",
        )
        read_only_fields = ("id", "url", "dose", "created", "updated")
    
    def get_item_price_discount_total(self,obj):
        if obj.item_price_discount_total:
            return obj.item_price_discount_total
        else:
            return "0.00"
        
    def get_discount_quantity(self,obj):
        if obj.discount_quantity:
            return obj.discount_quantity
        else:
            return "0"

    def get_variationDetails(self, obj):
        if models.RetailerVariations.objects.filter(id=obj.variation.id).exists():
            variation = models.RetailerVariations.objects.filter(
                id=obj.variation.id
            ).first()
            return RetailerVariationsSerializer(
                variation, context=self.context, many=False
            ).data
        else:
            return None

    def get_title(self, obj):
        return obj.retailer_receipt.product.title
    
    def get_title(self, obj):
        return obj.retailer_receipt.product.title
    
    def get_images(self, obj):
        images = None
        if obj.retailer_receipt.product:
            if ProductImages.objects.filter(
                product=obj.retailer_receipt.product
            ).exists():
                images = ProductImages.objects.filter(
                    product=obj.retailer_receipt.product
                ).all()
            return ProductImageSerializer(images, context=self.context, many=True).data
        return None

    def get_customer_order_number(self, obj):
        return obj.customer_order.order_number.document_number

    # def get_item_profit(self, obj):
    #     profit = (
    #         obj.item_net_price - obj.retailer_receipt.unit_buying_price
    #     ) * obj.purchased_quantity

    #     return "{:.2f}".format(profit)

class MiniCustomerOrdersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.CustomerOrders
        fields="__all__"
        read_only_fields = ("id", "url", "created", "updated", "owner",)

        
class CustomerOrdersSerializer(serializers.ModelSerializer):
    # payment = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    is_paid = serializers.SerializerMethodField(read_only=True)
    # shipping_address = serializers.SerializerMethodField(read_only=True)
    # owner_details = serializers.SerializerMethodField(read_only=True)
    # customer_details = serializers.SerializerMethodField(read_only=True)
    # dependant_details = serializers.SerializerMethodField(read_only=True)
    # entity_details = serializers.SerializerMethodField(read_only=True)
    order_items = serializers.SerializerMethodField(read_only=True)
    shipping_address = serializers.SerializerMethodField(read_only=True)
    selected_payment_method_title = serializers.SerializerMethodField(read_only=True)
    # total_cost = serializers.SerializerMethodField()
    # discount_amount = serializers.SerializerMethodField()
    # discount = serializers.SerializerMethodField()
    vendor = serializers.SerializerMethodField()
    is_delivered_string = serializers.SerializerMethodField()
    is_packed_string = serializers.SerializerMethodField()
    user = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField(read_only=True)

    # reference_number = serializers.SerializerMethodField(read_only=True)
    psp_reference_number = serializers.SerializerMethodField(read_only=True)
    payment_status = serializers.SerializerMethodField(read_only=True)
    payment_description = serializers.SerializerMethodField(read_only=True)
    provider_reference_number = serializers.SerializerMethodField(read_only=True)
    bodaboda_title = serializers.SerializerMethodField(read_only=True)
    bodaboda_farness = serializers.SerializerMethodField(read_only=True)
    bodaboda_latitude = serializers.SerializerMethodField(read_only=True)
    bodaboda_longitude = serializers.SerializerMethodField(read_only=True)
    origin_latitude = serializers.SerializerMethodField(read_only=True)
    origin_longitude = serializers.SerializerMethodField(read_only=True)
    destination_latitude = serializers.SerializerMethodField(read_only=True)
    destination_longitude = serializers.SerializerMethodField(read_only=True)
    order_number = serializers.SerializerMethodField(read_only=True)
    order_tax_total = serializers.SerializerMethodField(read_only=True)
    order_price_discount_total = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.CustomerOrders
        fields = (
            "id",
            "draft_id",
            "status",
            "reference_number",
            "psp_reference_number",
            "provider_reference_number",
            "employee",
            "order_number",
            "order_type",
            "order_number",
            "payment_account_number",
            "order_price_discount_total",
            "order_net_price_total",
            "order_origin",
            "order_price_total",
            "order_tax_total",
            "shipping_cost",
            "is_quoted",
            "is_paid",
            "paid_at",
            "due_date",
            "is_delivered",
            "is_delivered_string",
            "is_packed_string",
            "delivered_at",
            "delivered_by",
            "is_packed",
            "packed_at",
            "packed_by",
            "is_received",
            "received_at",
            "received_by",
            "delivery_method",
            "customer",
            "coupon",
            "entity",
            "entity_title",
            "vendor",
            "user",
            "phone",
            "email",
            "bodaboda_latitude",
            "bodaboda_longitude",
            "origin_latitude",
            "origin_longitude",
            "destination_latitude",
            "destination_longitude",
            "created",
            "updated",
            "owner",
            "customer_name",
            "customer_phone",
            "recipient_name",
            "recipient_phone",
            # "customer_details",
            "selected_payment_method",
            "selected_payment_method_title",
            "payment_status",
            "payment_description",
            "order_items",
            "images",
            # "payment",
            "shipping_address",
            "origin_point",
            "destination_point",
            "farness",
            "bodaboda",
            "bodaboda_title",
            "bodaboda_farness",
            "city_name",
        )
        read_only_fields = ("id", "url", "created", "updated", "owner", "net_amount")

    # def get_net_amount(self, obj):
    #     net_amount = 0
    #     net_amount = (
    #         float(obj.items_price)
    #         + float(obj.tax_price)
    #         + float(obj.shipping_cost)
    #         - float(obj.discount_amount)
    #     )

    def get_order_tax_total(self,obj):
        if obj.order_tax_total:
            return float(obj.order_tax_total)
        else:
            return float(0.00)
        
    def get_order_price_discount_total(self,obj):
        if obj.order_price_discount_total:
            return float(obj.order_price_discount_total)
        else:
            return float(0.00)
        
    def get_order_net_price_total(self,obj):
        if obj.order_net_price_total:
            return float(obj.order_net_price_total)
        else:
            return float(0.00)


    def get_order_items(self, obj):
        items = []
        if models.CustomerOrderItems.objects.filter(customer_order=obj).count() > 0:
            items = models.CustomerOrderItems.objects.filter(customer_order=obj)

        return CustomerOrderItemsSerializer(items, context=self.context, many=True).data

    def get_shipping_address(self, obj):
        if models.ShippingAddress.objects.filter(customer_order_id=obj.id).exists():
            address = models.ShippingAddress.objects.filter(
                customer_order_id=obj.id
            ).first()
            return ShippingAddressSerializer(
                address, context=self.context, many=False
            ).data
        else:
            return None

    # def get_owner_details(self, obj):
    #     if models.Users.objects.filter(id=obj.owner.id).exists():
    #         user = models.Users.objects.filter(id=obj.owner.id).first()
    #         return GenericUserSerializer(user, context=self.context, many=False).data
    #     else:
    #         return None

    def get_bodaboda_title(self,obj):
        if obj.bodaboda:
            return f"{obj.bodaboda.owner.first_name}, {obj.bodaboda.owner.phone}"
        else:
            return ""
        
    def get_entity_title(self,obj):
        if obj.entity:
            return f"{obj.entity.title}"
        else:
            return ""
        
    def get_bodaboda_farness(self,obj):
        if obj.bodaboda:
           
            
            return f"{obj.bodaboda.farness}km"
        else:
            return ""
        
    def get_bodaboda_latitude(self,obj):
        if obj.bodaboda and obj.bodaboda.point:
           
            return [coord for coord in  obj.bodaboda.point][1]
        else:
            return None
    def get_bodaboda_longitude(self,obj):
        if obj.bodaboda and obj.bodaboda.point:
           
            return [coord for coord in  obj.bodaboda.point][0]
        else:
            return None
    def get_origin_longitude(self,obj):
        if obj.origin_point:
           
            return [coord for coord in  obj.origin_point][0]
        else:
            return None
    def get_origin_latitude(self,obj):
        if obj.origin_point:
           
            return [coord for coord in  obj.origin_point][1]
        else:
            return None
    def get_destination_longitude(self,obj):
        if obj.destination_point:
           
            return [coord for coord in  obj.destination_point][0]
        else:
            return None
    def get_destination_latitude(self,obj):
        if obj.destination_point:
           
            return [coord for coord in  obj.destination_point][1]
        else:
            return None

    def get_payment(self, obj):
        if models.CustomerOrderPayment.objects.filter(
            customer_order=obj
        ).exists():
            payment = models.CustomerOrderPayment.objects.filter(
                customer_order=obj
            ).first()
            return CustomerOrderPaymentsSerializer(payment, context=self.context, many=False).data
        else:
            return None
    # def get_reference_number(self, obj):
    #     if models.CustomerOrderPayment.objects.filter(
    #         customer_order=obj
    #     ).exists():
    #         payment = models.CustomerOrderPayment.objects.filter(
    #             customer_order=obj
    #         ).first()
    #         return payment.reference_number
    #     else:
    #         return ""
    def get_psp_reference_number(self, obj):
        if models.CustomerOrderPayment.objects.filter(
            customer_order=obj
        ).exists():
            payment = models.CustomerOrderPayment.objects.filter(
                customer_order=obj
            ).first()
            return payment.psp_reference_number
        else:
            return ""
    def get_payment_status(self, obj):
        if models.CustomerOrderPayment.objects.filter(
            customer_order=obj,status="SUCCESS"
        ).exists():
            payment = models.CustomerOrderPayment.objects.filter(
                customer_order=obj,status="SUCCESS"
            ).first()
            return payment.status
        elif models.CustomerOrderPayment.objects.filter(
            customer_order=obj,status="FAILED"
        ).exists():
                payment = models.CustomerOrderPayment.objects.filter(
                customer_order=obj,status="FAILED"
            ).first()
                return payment.status
        elif models.CustomerOrderPayment.objects.filter(
            customer_order=obj,status="PENDING"
        ).exists():
                payment = models.CustomerOrderPayment.objects.filter(
                customer_order=obj,status="PENDING"
            ).first()
                return payment.status
        else:
            return "UNAVAILABLE"
            
    def get_payment_description(self, obj):
        if models.CustomerOrderPayment.objects.filter(
            customer_order=obj
        ).exists():
            payment = models.CustomerOrderPayment.objects.filter(
                customer_order=obj
            ).first()
            return payment.description
        else:
            return ""
    def get_provider_reference_number(self, obj):
        if models.CustomerOrderPayment.objects.filter(
            customer_order=obj
        ).exists():
            payment = models.CustomerOrderPayment.objects.filter(
                customer_order=obj
            ).first()
            return payment.provider_reference_number
        else:
            return ""
        
    def get_is_paid(self, obj):
        if obj.selected_payment_method and  obj.selected_payment_method.title =="CASH":
            obj.is_paid=="true"
            obj.save()
            return "true"
        else:
            if models.CustomerOrderPayment.objects.filter(customer_order=obj).exists():
                payment =models.CustomerOrderPayment.objects.filter(customer_order=obj).first()
                if not payment.provider_reference_number ==None and not payment.provider_reference_number=="":
                    # obj.customer_order.is_paid=="true"
                    # obj.customer_order.save()
                    return "true"
                else:  
                    return "false"
            else:
                return "false"
    def get_customer_details(self, obj):
        if obj.customer:
            if models.Users.objects.filter(id=obj.customer.id).exists():
                user = models.Users.objects.filter(id=obj.customer.id).first()
                return GenericUserSerializer(
                    user, context=self.context, many=False
                ).data
            else:
                return None
        else:
            return None

    # def get_dependant_details(self, obj):
    #     if obj.dependant:
    #         if models.Dependants.objects.filter(id=obj.dependant.id).exists():
    #             dependant = models.Dependants.objects.filter(
    #                 id=obj.dependant.id
    #             ).first()
    #             return DependantsSerializer(
    #                 dependant, context=self.context, many=False
    #             ).data
    #         else:
    #             return None
    #     else:
    #         return None

    def get_order_number(self,obj):
        if obj.order_number:
            return obj.order_number.document_number
        else:
            return ""

    def get_vendor(self, obj):
        if models.Entities.objects.filter(id=obj.entity.id).exists():
            entity = models.Entities.objects.filter(id=obj.entity.id).first()
            return entity.title
        else:
            return ""

    def get_user(self, obj):
        if models.Users.objects.filter(id=obj.owner.id).exists():
            owner = models.Users.objects.filter(id=obj.owner.id).first()
            return f"{owner.first_name} {owner.last_name}"
        else:
            return ""

    # def get_title(self, obj):
    #     if obj and obj.reference_number:

    #         return f'{obj.reference_number} - {obj.entity.title}'
    #     else:
    #         return ""

    def get_order_number(self, obj):
        if obj.order_number:
            return obj.order_number.document_number
        else:
            return "N/A"

    def get_images(self, obj):
        images = []
        if obj.customer:
            if UserImages.objects.filter(owner=obj.customer).exists():
                images = UserImages.objects.filter(owner=obj.customer).all()
            return UserImageSerializer(images, context=self.context, many=True).data
        else:
            if UserImages.objects.filter(owner=obj.owner).exists():
                images = UserImages.objects.filter(owner=obj.owner).all()
            return UserImageSerializer(images, context=self.context, many=True).data

    def get_phone(self, obj):
        if models.Users.objects.filter(id=obj.owner.id).exists():
            owner = models.Users.objects.filter(id=obj.owner.id).first()
            return f"{owner.phone}"
        else:
            return ""

    def get_email(self, obj):
        if models.Users.objects.filter(id=obj.owner.id).exists():
            owner = models.Users.objects.filter(id=obj.owner.id).first()
            return f"{owner.email}"
        else:
            return ""

    def get_selected_payment_method_title(self, obj):
        if obj.selected_payment_method:
            if PaymentMethods.objects.filter(
                id=obj.selected_payment_method.id
            ).exists():
                spm = PaymentMethods.objects.filter(
                    id=obj.selected_payment_method.id
                ).first()
                return f"{spm.title}"
            else:
                return ""
    def get_is_delivered_string(self, obj):
        if obj.is_delivered:
            return "Yes"
        else:
            return "No"
    def get_is_delivered_string(self, obj):
        if obj.is_delivered:
            return "Yes"
        else:
            return "No"

    def get_is_packed_string(self, obj):
        if obj.is_packed:
            return "Yes"
        else:
            return "No"

    #     if obj.retailer_payment:
    #         return "Yes"
    #     else:
    #         return "No"

    # def get_total_cost(self, obj):
    #     order_total = 0.00
    #     discount_amount = 0.00
    #     # Calculate customer_order amount
    #     if models.OrderItems.objects.filter(order_id=obj.id).count() > 0:
    #         items = models.OrderItems.objects.filter(order_id=obj.id)
    #         for item in items:
    #             if item.variation:
    #                 order_total = order_total + int(item.quantity) * \
    #                     float(item.variation.pack_selling_price) / \
    #                     float(item.variation.units_per_pack)

    #     # Calculate discount amount if there is coupon
    #     if obj.coupon and obj.discount:
    #         discount_amount = order_total * obj.discount/100

    #     return order_total-discount_amount

    # def get_discount_amount(self, obj):
    #     order_total = 0.00
    #     discount_amount = 0.00
    #     # Calculate customer_order amount
    #     if models.CustomerOrderItems.objects.filter(customer_order_id=obj.id).count() > 0:
    #         items = models.CustomerOrderItems.objects.filter(
    #             customer_order_id=obj.id)
    #         for item in items:
    #             if item.retailer_variationReceipt:
    #                 order_total = order_total + int(item.quantity) * \
    #                     float(item.retailer_variationReceipt.pack_selling_price) / \
    #                     float(
    #                         item.retailer_variationReceipt.retailer_variation.product.units_per_pack)

    #     # Calculate discount amount if there is coupon
    #     if obj.coupon and obj.discount:
    #         discount_price = order_total * obj.discount/100

    #     return discount_price

    # def get_shipping_address(self, obj):
    #     shipping_address = None
    #     if models.ShippingAddress.objects.filter(customer_order=obj).exists():
    #         shipping_address = models.ShippingAddress.objects.filter(
    #             customer_order=obj
    #         ).first()
    #         return ShippingAddressSerializer(shipping_address, many=False).data


class CustomerOrdersDetailedSerializer(serializers.ModelSerializer):
    payment = serializers.SerializerMethodField(read_only=True)
    is_paid = serializers.SerializerMethodField(read_only=True)
    shipping_address = serializers.SerializerMethodField(read_only=True)
    owner_details = serializers.SerializerMethodField(read_only=True)
    customer_details = serializers.SerializerMethodField(read_only=True)
    dependant_details = serializers.SerializerMethodField(read_only=True)
    entity_details = serializers.SerializerMethodField(read_only=True)
    # order_items = serializers.SerializerMethodField(read_only=True)
    shipping_cost = serializers.SerializerMethodField(read_only=True)
    selected_payment_method_title = serializers.SerializerMethodField(read_only=True)
    # total_cost = serializers.SerializerMethodField()
    # discount_amount = serializers.SerializerMethodField()
    # discount = serializers.SerializerMethodField()
    vendor = serializers.SerializerMethodField()
    is_delivered_string = serializers.SerializerMethodField()
    is_packed_string = serializers.SerializerMethodField()
    user = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    # title = serializers.SerializerMethodField(read_only=True)
    # images = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.CustomerOrders
        fields = (
            "id",
  
            "dependant",
            "employee",
            "reference_number",
            "payment_account_number",
            "order_origin",
            "order_price_discount_total",
            "order_price_total",
            "order_tax_total",
            "order_net_price_total",
            "shipping_cost",
            "shipping_address",
            "is_quoted",
            "is_paid",
            "paid_at", 
            "is_delivered",
            "is_delivered_string",
            "is_packed_string",
            "delivered_at",
            "delivered_by",
            "is_packed",
            "packed_at",
            "packed_by",
            "is_received",
            "received_at",
            "received_by",
            "delivery_method",
            "customer",
            "coupon",
            "entity",
            "vendor",
            "user",
            "phone",
            "email",
            "due_date",
            "created",
            "updated",
            "owner",
            "customer_name",
            "customer_phone",
            "owner_details",
            "entity_details",
            "customer_details",
            "dependant_details",
            "shipping_address",
            "selected_payment_method",
            "selected_payment_method_title",
        )
        read_only_fields = ("id", "url", "created", "updated", "owner", "net_amount")

    # def get_net_amount(self, obj):
    #     net_amount = 0
    #     net_amount = (
    #         float(obj.items_price)
    #         + float(obj.tax_price)
    #         + float(obj.shipping_cost)
    #         - float(obj.discount_amount)
    #     )

    #     return net_amount

    # def get_order_items(self, obj):
    #     items = None
    #     if models.CustomerOrderItems.objects.filter(customer_order=obj).count() > 0:
    #         items = models.CustomerOrderItems.objects.filter(customer_order=obj)

    #     return CustomerOrderItemsSerializer(items, context=self.context, many=True).data

    def get_shipping_cost(self,obj):
        return float(obj.shipping_cost)

    def get_shipping_address(self, obj):
        if models.ShippingAddress.objects.filter(customer_order_id=obj.id).exists():
            address = models.ShippingAddress.objects.filter(
                customer_order_id=obj.id
            ).first()
            return ShippingAddressSerializer(
                address, context=self.context, many=False
            ).data
        else:
            return None

    def get_owner_details(self, obj):
        if models.Users.objects.filter(id=obj.owner.id).exists():
            user = models.Users.objects.filter(id=obj.owner.id).first()
            return GenericUserSerializer(user, context=self.context, many=False).data
        else:
            return None

    def get_payment(self, obj):
        if models.CustomerOrderPayment.objects.filter(customer_order=obj).exists():
            payment = models.CustomerOrderPayment.objects.filter(
                customer_order=obj
            ).first()
            return CustomerOrderPaymentsSerializer(
                payment, context=self.context, many=False
            ).data
        else:
            return None

    def get_customer_details(self, obj):
        if obj.customer:
            if models.Users.objects.filter(id=obj.customer.id).exists():
                user = models.Users.objects.filter(id=obj.customer.id).first()
                return GenericUserSerializer(
                    user, context=self.context, many=False
                ).data
            else:
                return None
        else:
            return None

    def get_dependant_details(self, obj):
        if obj.dependant:
            if models.Dependants.objects.filter(id=obj.dependant.id).exists():
                dependant = models.Dependants.objects.filter(
                    id=obj.dependant.id
                ).first()
                return DependantsSerializer(
                    dependant, context=self.context, many=False
                ).data
            else:
                return None
        else:
            return None

    def get_entity_details(self, obj):
        if models.Entities.objects.filter(id=obj.entity.id).exists():
            entity = models.Entities.objects.filter(id=obj.entity.id).first()
            return EntitySerializer(entity, context=self.context, many=False).data
        else:
            return None

    def get_vendor(self, obj):
        if models.Entities.objects.filter(id=obj.entity.id).exists():
            entity = models.Entities.objects.filter(id=obj.entity.id).first()
            return entity.title
        else:
            return ""

    def get_user(self, obj):
        if models.Users.objects.filter(id=obj.owner.id).exists():
            owner = models.Users.objects.filter(id=obj.owner.id).first()
            return f"{owner.first_name} {owner.last_name}"
        else:
            return ""

    # def get_retailer_title(self, obj):
    #     return obj.entity.title

    def get_images(self, obj):
        images = []
        if obj.user:
            if UserImages.objects.filter(owner=obj.user).exists():
                images = UserImages.objects.filter(owner=obj.user).all()
            return UserImageSerializer(images, context=self.context, many=True).data
        else:
            return []

    def get_phone(self, obj):
        if models.Users.objects.filter(id=obj.owner.id).exists():
            owner = models.Users.objects.filter(id=obj.owner.id).first()
            return f"{owner.phone}"
        else:
            return ""

    def get_email(self, obj):
        if models.Users.objects.filter(id=obj.owner.id).exists():
            owner = models.Users.objects.filter(id=obj.owner.id).first()
            return f"{owner.email}"
        else:
            return ""

    def get_selected_payment_method_title(self, obj):
        if obj.selected_payment_method:
            if PaymentMethods.objects.filter(
                id=obj.selected_payment_method.id
            ).exists():
                spm = models.PaymentMethods.objects.filter(
                    id=obj.selected_payment_method.id
                ).first()
                return f"{spm.title}"
            else:
                return ""

    def get_is_paid(self, obj):
        if models.CustomerOrderPayment.objects.filter(customer_order=obj).exists():
            payment =models.CustomerOrderPayment.objects.filter(customer_order=obj).first()
            if not payment.provider_reference_number ==None and not payment.provider_reference_number=="":
                obj.is_paid=="true"
                obj.save()
                return "true"
            else:  
                return "false"
        else:
            return "false"

    def get_is_packed_string(self, obj):
        if obj.is_packed:
            return "Yes"
        else:
            return "No"

    #     if obj.retailer_payment:
    #         return "Yes"
    #     else:
    #         return "No"

    # def get_total_cost(self, obj):
    #     order_total = 0.00
    #     discount_amount = 0.00
    #     # Calculate customer_order amount
    #     if models.OrderItems.objects.filter(order_id=obj.id).count() > 0:
    #         items = models.OrderItems.objects.filter(order_id=obj.id)
    #         for item in items:
    #             if item.variation:
    #                 order_total = order_total + int(item.quantity) * \
    #                     float(item.variation.pack_selling_price) / \
    #                     float(item.variation.units_per_pack)

    #     # Calculate discount amount if there is coupon
    #     if obj.coupon and obj.discount:
    #         discount_amount = order_total * obj.discount/100

    #     return order_total-discount_amount

    # def get_discount_amount(self, obj):
    #     order_total = 0.00
    #     discount_amount = 0.00
    #     # Calculate customer_order amount
    #     if models.CustomerOrderItems.objects.filter(customer_order_id=obj.id).count() > 0:
    #         items = models.CustomerOrderItems.objects.filter(
    #             customer_order_id=obj.id)
    #         for item in items:
    #             if item.retailer_variationReceipt:
    #                 order_total = order_total + int(item.quantity) * \
    #                     float(item.retailer_variationReceipt.pack_selling_price) / \
    #                     float(
    #                         item.retailer_variationReceipt.retailer_variation.product.units_per_pack)

    #     # Calculate discount amount if there is coupon
    #     if obj.coupon and obj.discount:
    #         discount_price = order_total * obj.discount/100

    #     return discount_price

    def get_shipping_address(self, obj):
        shipping_address = None
        if models.ShippingAddress.objects.filter(customer_order=obj).exists():
            shipping_address = models.ShippingAddress.objects.filter(
                customer_order=obj
            ).first()
            return ShippingAddressSerializer(shipping_address, many=False).data


class CustomerOrderPaymentsSerializer(serializers.ModelSerializer):
   
    class Meta:
        model = models.CustomerOrderPayment
        fields = (
            "id",
            "paying_entity",
            "customer_order",
            "receiving_entity",
            "reference_number",
            "psp_reference_number",
            "provider_reference_number",
            "administrator_account",
            "amount",
            "is_validated",
            "narration",
            "currency",
            "status",
            "entity_collection_account",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
        )

class CustomerOrderSettlementSerializer(serializers.ModelSerializer):
    psp_title = serializers.SerializerMethodField()
    class Meta:
        model = models.CustomerOrderSettlement
        fields = (
            "id",
            "entity",
            "customer_order_payment",
            "receiving_entity",
            "reference_number",
            "payment_services_provider",
            "psp_title",
            "amount",
            "account_from",
            "account_to",
            "created",
            "updated",
        
        )
        read_only_fields = (
            "id",
            "created",
            "updated",
        
        )
    def get_psp_title(self,obj):
        return obj.payment_services_provider.psp_title
    


class OutOfStocksSerializer(serializers.ModelSerializer):
    product_title = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.OutOfStock
        fields = (
            "id",
            "entity",
            "product",
            "unit_of_receipt",
            "product_title",
            "units_per_pack",
            "customer",
            "customer_name",
            "customer_phone",
            "required_quantity",
            "is_special_order",
            "is_ordered",
            "retailer_indent",
            "created",
            "images",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
        )

    def get_product_title(self,obj):
        return obj.product.title
    
    def get_units_per_pack(self,obj):
        return obj.product.units_per_pack
    
    def get_images(self,obj):
        images =[]
        if ProductImages.objects.filter(product=obj.product).exists():
            images = ProductImages.objects.filter(product=obj.product).all()
        return ProductImageSerializer(images, context=self.context, many=True).data
    
class RetailerIndentSerializer(serializers.ModelSerializer):
    retailer_indent_items = serializers.SerializerMethodField(read_only=True)
    indent_number = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.RetailerIndent
        fields = (
            "id",
            "is_open",
            "indent_number",
            "entity_title",
            "lead_time",
            "order_days",
            "retailer_indent_items",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "indent_number",
            "created",
            "updated",
            "owner",
        )

    def get_retailer_indent_items(self,obj):
        items =[]
        if models.RetailerIndentItem.objects.filter(retailer_indent=obj).exists():
            items = models.RetailerIndentItem.objects.filter(retailer_indent=obj).all()
        return RetailerIndentItemsSerializer(items, context=self.context, many=True).data
        
    def get_indent_number(self,obj):
        if obj.indent_number:
            return obj.indent_number.document_number
        else:
            return ""
    def get_entity_title(self,obj):
        if obj.entity:
            return obj.entity.title
        else:
            return ""
        
class RetailerIndentItemsSerializer(serializers.ModelSerializer):
    wholesaler = serializers.SerializerMethodField(read_only=True)
    wholesaler_title = serializers.SerializerMethodField(read_only=True)
    wholesaler_title = serializers.SerializerMethodField(read_only=True)
    manufacture_date = serializers.SerializerMethodField(read_only=True)
    expiry_date = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    wholesaler_price_discount_title = serializers.SerializerMethodField(read_only=True)
    wholesaler_quantity_discount_title = serializers.SerializerMethodField(read_only=True)
    wholesale_receipt_title = serializers.SerializerMethodField(read_only=True)
  
    images = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.RetailerIndentItem
        fields = (
            "id",
            "entity",
            "entity_title",
            "indenting_criteria",
            "retailer_indent",
            "wholesale_receipt",
            "wholesale_receipt_title",
            "wholesaler",
            "wholesaler_title",
            "wholesaler_price_discount",
            "wholesaler_price_discount_title",
            "wholesaler_quantity_discount",
            "wholesaler_quantity_discount_title",
            "required_quantity",
            "total_quantity",
            "item_gross_total_amount",
            "item_net_total_amount",
            "final_pack_price",
            "manufacture_date",
            "expiry_date",
            "images",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "entity",
            "created",
            "updated",
            "owner",
        )
    def get_entity_title(self,obj):
        return obj.retailer_indent.entity.title
    
    def get_wholesale_receipt_title(self,obj):
        return obj.wholesale_receipt.product.title
    
    def get_manufacture_date(self,obj):
        return obj.wholesale_receipt.manufacture_date
    
    def get_expiry_date(self,obj):
        return obj.wholesale_receipt.expiry_date
    
    def get_wholesaler(self,obj):
        return obj.wholesale_receipt.entity.id
    
    def get_images(self,obj):
        images =[]
        if ProductImages.objects.filter(product=obj.wholesale_receipt.product).exists():
            images = ProductImages.objects.filter(product=obj.wholesale_receipt.product).all()
        return ProductImageSerializer(images, context=self.context, many=True).data
    
    def get_wholesaler_title(self,obj):
        return obj.wholesale_receipt.entity.title
    
    
    def get_wholesaler_price_discount_title(self,obj):
        if obj.wholesaler_price_discount:
            return obj.wholesaler_price_discount.title
        else:
            return ""
        
    def get_wholesaler_quantity_discount_title(self,obj):
        if obj.wholesaler_quantity_discount:
            return obj.wholesaler_quantity_discount.title
        else:
            return ""
# class CustomerOrderFailedPaymentsSerializer(serializers.ModelSerializer):

#     class Meta:
#         model = models.CustomerOrderFailedPayments
#         fields = (
#             "id",
#             "customer_order",
#             'user',
#             "reference_number",
#             "amount",
#             "narration",
#             "msisdn",
#             "transfer_status",
#             "account_number",
#             "created",
#             "transaction_time",
#             "updated",
#             "owner",
#         )
#         read_only_fields = ("id",  "created",
#                             "updated", "owner", )

class MiniRetailerReceiptsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailerReceipts
        fields="__all__"
        read_only_fields = (
            "id",
            "url",
            "created",
            "entity",
            "description",
            "unit_buying_price",
            "unit_price_discount",
            "pack_price_discount",
            "unit_selling_price",
            "updated",
            "owner",
            "retailer_variation_details",
            "received_from_details",
            "received_from_title",
            "images",
        )



class RetailerReceiptsSerializer(serializers.ModelSerializer):
    final_unit_selling_price = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    # bar_code = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    # item_tax = serializers.SerializerMethodField(read_only=True)
    received_from_title = serializers.SerializerMethodField(read_only=True)
    origin_country = serializers.SerializerMethodField(read_only=True)
    origin_country_title = serializers.SerializerMethodField(read_only=True)
    # received_from_details = serializers.SerializerMethodField(read_only=True)
    # product_details = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)
    # employee_details = serializers.SerializerMethodField(read_only=True)

    # retailer_variation_details = serializers.SerializerMethodField(read_only=True)
    # retailer_variation_details = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    formulation_title = serializers.SerializerMethodField(read_only=True)
    long_title = serializers.SerializerMethodField(read_only=True)
   
    days_to_expiry = serializers.SerializerMethodField(read_only=True)
    expiry_status = serializers.SerializerMethodField(read_only=True)
    packaging = serializers.SerializerMethodField(read_only=True)
    # units_per_pack = serializers.SerializerMethodField(read_only=True)
    manufacturer = serializers.SerializerMethodField(read_only=True)
    manufacturer_title = serializers.SerializerMethodField(read_only=True)
    is_pom = serializers.SerializerMethodField(read_only=True)
  
    class Meta:
        model = models.RetailerReceipts
        fields = (
            "id",
            "title",
            "entity",
            "entity_title",
            "product",
            "preparation_title",
            "product_title",
            "formulation_title",
            "long_title",
            "received_from",
            "unit_of_receipt",
            "received_from_title",
            "retailer_order",
            "retailer_order_item",
            "batch",
            "bar_code",
            "manufacture_date",
            "expiry_date",
            "unit_buying_price",
            "unit_selling_price",
            "unit_price_discount",
            "current_unit_quantity",
            "received_unit_quantity",
            "in_placement",
            # "item_tax",
            "is_active",
            "is_pom",
            "supplier_invoice",
            "origin_country",
            "origin_country_title",
            "final_unit_selling_price",
            "unit_price_discount",
            "images",
            "created",
            "updated",
            "employee",
            "owner",
            "days_to_expiry",
            "expiry_status",
            "packaging",
            "units_per_pack",
            "manufacturer",
            "manufacturer_title",
        )
        read_only_fields = (
            "id",
            "url",
            "created",
            "entity",
            "description",
            "unit_buying_price",
            "unit_price_discount",
            "pack_price_discount",
            "unit_selling_price",
            "updated",
            "owner",
            "retailer_variation_details",
            "received_from_details",
            "received_from_title",
            "images",
         
        )

    # def update(self, instance, validated_data):
    #     print("instance pack", instance.pack_quantity)
    #     print("instance unit", instance.unit_quantity)
    #     pack_quantity = validated_data.pop("pack_quantity", None)
    #     unit_quantity = validated_data.pop("unit_quantity", None)
    #     batch = validated_data.pop("batch", instance.batch)

    #     if pack_quantity and unit_quantity and instance.product:
    #         if unit_quantity > instance.product.units_per_pack:
    #             raise exceptions.ValidationError(
    #                 f"Loose pieces cannot be more than {instance.product.units_per_pack}. Add them as a pack "
    #             )
    #         pack_quantity_final = pack_quantity
    #         unit_quantity_final = (
    #             pack_quantity_final * instance.product.units_per_pack + unit_quantity
    #         )

    #     elif pack_quantity and instance.product:
    #         pack_quantity_final = pack_quantity
    #         unit_quantity_final = pack_quantity_final * instance.product.units_per_pack
        
    #     elif unit_quantity and instance.product:
    #         pack_quantity_final = 0
    #         unit_quantity_final = unit_quantity

    #     instance.pack_quantity = pack_quantity_final
    #     instance.unit_quantity = unit_quantity_final
    #     instance.batch = batch
    #     instance.save()
    #     return instance

    # @transaction.atomic
    # def create(self, validated_data):
    #     pack_quantity_final = 0
    #     unit_quantity_final = 0
    #     retailer_variation = None
    #     created = None

    #     user = self.context.get("user", None)

    #     # Admin cannot create a variation
    #     if user.is_staff:
    #         raise exceptions.ValidationError("Not authorized to")
    #     product = validated_data.get("product", None)

    #     batch = validated_data.pop("batch", None)
    #     pack_quantity = validated_data.pop("pack_quantity", None)
    #     unit_quantity = validated_data.pop("unit_quantity", None)



    #     # Product is required
    #     if not product:
    #         raise exceptions.ValidationError("Please select product")
    #     else:
    #         # Retrieve variation for this product if it exists
    #         if models.RetailerVariations.objects.filter(
    #             product=product, entity=user.entity
    #         ).exists():
    #             retailer_variation = models.RetailerVariations.objects.filter(
    #                 entity=user.entity, owner=user, product=product
    #             ).first()

    #             retailer_variation.save()
    #         else:
    #             retailer_variation = models.RetailerVariations.objects.create(
    #                 entity=user.entity,
    #                 owner=user,
    #                 product=product,
    #             )
    #         # Product is required

    #     if models.RetailerReceipts.objects.filter(
    #         product=product, entity=user.entity, batch=batch
    #     ).exists():
    #         # raise exceptions.ValidationError(
    #         #     f"Iko units: {unit_quantity_final} packs: {pack_quantity_final}"
    #         # )
    #         existing_receipt = models.RetailerReceipts.objects.filter(
    #             entity=user.entity, owner=user, product=product, batch=batch
    #         ).first()

    #         existing_receipt.unit_quantity = existing_receipt.unit_quantity + int(
    #             unit_quantity_final
    #         )
    #         existing_receipt.pack_quantity = existing_receipt.pack_quantity + int(
    #             pack_quantity_final
    #         )

    #         existing_receipt.save()
    #     else:
    #         # raise exceptions.ValidationError("Hakuna")

    #         created = models.RetailerReceipts.objects.create(
    #             retailer_variation=retailer_variation,
    #             unit_quantity=unit_quantity_final,
    #             pack_quantity=pack_quantity_final,
    #             batch=batch,
    #             **validated_data,
    #         )

    #         return created

    def get_received_from_title(self, obj):
        if obj.received_from:
            return obj.received_from.title
        else:
            return ""

    def get_entity_title(self, obj):
        if obj.entity:
            return obj.entity.title
        else:
            return ""

    def get_final_unit_selling_price(self, obj):
        """ final unit selling price"""
        if obj.unit_price_discount:
            return f"{round((obj.unit_selling_price - obj.unit_price_discount),2)}"
        else:
            return f"{round(obj.unit_selling_price,2)}"
 

    def get_title(self, obj):
   
        if obj.product.preparation:
            return f"{obj.product.preparation.title} - {obj.product.title} {obj.product.preparation.formulation.title} {obj.product.units_per_pack}s"
        else:
            return f"{obj.product.title} {obj.product.units_per_pack}s"
    def get_is_pom(self, obj):
        if obj.product.preparation:
            obj.product.is_pom=True
            obj.product.save()
            return obj.product.is_pom
        else:
            obj.product.is_pom=False
            obj.product.save()
            return obj.product.is_pom

    def get_preparation_title(self, obj):
        if obj.product.preparation:
            return obj.product.preparation.title
        else:
            return ""
    def get_origin_country_title(self, obj):
        if obj.product.origin_country:
            return obj.product.origin_country.title
        else:
            return ""
        
    def get_origin_country(self, obj):
        if obj.product.origin_country:
            return obj.product.origin_country.id
        else:
            return ""

    def get_product_title(self, obj):
        if obj.product.title:
            return obj.product.title
        else:
            return ""

    def get_packaging(self, obj):
        if obj.product.packaging:
            return obj.product.packaging
        else:
            return ""
 
    def get_manufacturer(self, obj):
        if obj.product.manufacturer:
            return obj.product.manufacturer.id
        else:
            return ""
    def get_manufacturer_title(self, obj):
        if obj.product.manufacturer:
            return obj.product.manufacturer.title
        else:
            return ""

    def get_formulation_title(self, obj):
        if obj.product.preparation:
            return obj.product.preparation.formulation.title
        else:
            return ""

    def get_long_title(self, obj):
        if obj.product.preparation:
            return f"{obj.product.preparation.title}-{obj.product.preparation.formulation.title} - {obj.product.title} {obj.product.units_per_pack}s"
        else:
            return f"{obj.product.title}"

    def get_images(self, obj):
        images = None
        if obj.product:
            if ProductImages.objects.filter(product=obj.product).exists():
                images = ProductImages.objects.filter(product=obj.product).all()
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
            # return numOfDays(today, expiry_date)


class RetailerPaymentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailerPayments
        fields = "__all__"
        read_only_fields = ("id", "url", "created", "updated")

class RetailQuantityDiscountsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailQuantityDiscounts
        fields = "__all__"
        read_only_fields = ("id", "url", "created", "updated")

class ProductMovementSerializer(serializers.ModelSerializer):
    customer_order = serializers.SerializerMethodField(read_only=True)
    owner_title = serializers.SerializerMethodField(read_only=True)
    retailer_order = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.ProductMovement
        fields = ("retailer_receipt","customer_order_item","customer_order","retailer_order","balance","direction","quantity","transaction_date","id","owner_title", "created", "updated")
        read_only_fields = ("id", "url", "created", "updated")
    def get_owner_title(self,obj):
        if obj.owner:
            return f"{obj.owner.first_name} {obj.owner.last_name}"
        else:
            return None
    def get_customer_order(self,obj):
        if obj.customer_order_item and obj.customer_order_item.customer_order:
            return obj.customer_order_item.customer_order.id
        else:
            return None
    def get_retailer_order(self,obj):
        if obj.retailer_receipt and obj.retailer_receipt.retailer_order:
            return obj.retailer_receipt.retailer_order.id
        else:
            return None

class RetailerShippingRatesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailersShippingRates
        fields = "__all__"
        read_only_fields = ("id", "created", "updated")


class WholesalerInvoicesSerializer(serializers.ModelSerializer):
    total_amount = serializers.SerializerMethodField(read_only=True)

    class Meta:
        
        model = models.WholesalerInvoices
        fields = (
            "source_entity",
            "invoice_number",
            "total_amount",
            "paid_amount",
            "outstanding_amount",
            "delivered_by",
            "received_by",
        )
        read_only_fields = ("id", "created", "owner", "updated")

    def get_total_amount(self, obj):
        total_amount = 0.00
        if models.WholesalerInvoiceItems.objects.filter(wholesaler_invoice=obj).exists():
            items_in_invoice = models.WholesalerInvoiceItems.objects.filter(
                wholesaler_invoice=obj
            ).all()
            for item in items_in_invoice:
                total_amount = total_amount + (
                    float(item.purchased_unit_quantity) * float(item.pack_buying_price)
                )
        return total_amount


class WholesalerInvoicesItemsSerializer(serializers.ModelSerializer):
    item_total_amount = serializers.SerializerMethodField(read_only=True)

    class Meta:
        verbose_name_plural = "Inbound Invoice Items"
        model = models.WholesalerInvoiceItems
        fields = (
            "wholesaler_invoice",
            "product",
            "purchased_unit_quantity",
            "bonus_unit_quantity",
            "pack_buying_price",
            "pack_seling_price",
            "percent_discount",
            "manufacture_date",
            "expiry_date",
            "item_total_amount",
        )
        read_only_fields = ("id", "created", "owner", "updated")

    def get_item_total_amount(self, obj):
        return float(obj.purchased_quantity) * float(obj.pack_buying_price)


def numOfDays(date1, date2):
    # check which date is greater to avoid days output in -ve number
    if isinstance(date1, date) and isinstance(date2, date):
        return (date2 - date1).days
    else:
        return 0
class CustomerPaymentsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.CustomerOrderPayment
        fields = (
            "id",
            "customer_order",
            "payment_method",
            "owner",
            "narration",
            "reference_number",
            "created",
            "updated",
        )

        read_only_fields = ("id", "created", "updated")

class PrescriptionImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PrescriptionImages
        fields = (
            "id",
            "image",
            "thumbnail",
            "owner",
            "prescription",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("prescription", "thumbnail", "owner", "entity")



class PrescriptionsSerializer(serializers.ModelSerializer):

    class Meta:
        ordering = ["-created"]
        model = models.Prescriptions
        fields = (
            "id",
            "entity",
            "created_by",
            "interpreted_by",
            "is_closed",
            "is_dispensed",
            "origin_point",
            "destination_point",
            "status",
            "nature",
            "patient",
            "patient_name",
            "patient_gender",
            "patient_date_of_birth",
            "comment",
            "created",
            "updated",
        )
        read_only_fields = ("id","created_by", "created", "updated")

 


class RetailPrescriptionsSerializer(serializers.ModelSerializer):
    images = PrescriptionImageSerializer(many=True, read_only=True)
    items = serializers.SerializerMethodField(read_only=True)
    items_count = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    entity_details = serializers.SerializerMethodField(read_only=True)
    # patient_title = serializers.SerializerMethodField(read_only=True)
    # patient_gender = serializers.SerializerMethodField(read_only=True)
    # patient_date_of_birth = serializers.SerializerMethodField(read_only=True)
    patient_age = serializers.SerializerMethodField(read_only=True)
    key = serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ["-created"]
        model = models.Prescriptions
        fields = (
            "id",
            "entity",
            "entity_title",
            "entity_details",
            "created_by",
            "interpreted_by",
            "is_closed",
            "is_dispensed",
            "origin_point",
            "destination_point",
            "status",
            "nature",
            "images",
            "items",
            "items_count",
            "patient",
            "patient_name",
            "patient_gender",
            "patient_date_of_birth",
            "patient_age",
            "comment",
            "key",
            "created",
            "updated",
        )
        read_only_fields = ("id","created_by", "created", "updated")

        extra_kwargs = {
            "images": {
                "required": False,
            }
        }

    def get_key(self,obj):
        return obj.id
    

    def get_items(self,obj):
        items=[]
        if models.PrescriptionItems.objects.filter(prescription=obj).exists():
            items=models.PrescriptionItems.objects.filter(prescription=obj).all()
        return PrescriptionItemsSerializer(items,many=True, context=self.context).data
    
    def get_items_count(self,obj):
        if models.PrescriptionItems.objects.filter(prescription=obj).exists():
            return models.PrescriptionItems.objects.filter(prescription=obj).count()
        else:
            return 0
    
    def get_entity_title(self,obj):
        entity_title="" 
        if obj.entity:
            entity_title= obj.entity.title
        return entity_title
    
    def get_entity_details(self,obj):
        if obj.entity:
             return EntityMiniSerializer(obj.entity,many=False, context=self.context).data
    
    
    
    # def get_patient_title(self,obj):
    #     patient_title="" 
    #     if obj.patient:
    #         patient_title= f"{obj.patient.first_name} {obj.patient.last_name}"
    #     return patient_title
   
    # def get_patient_gender(self,obj):
    #     patient_gender="" 
    #     if obj.patient:
    #         patient_gender= f"{obj.patient.gender}"
    #     return patient_gender
    
    # def get_patient_date_of_birth(self,obj):
    #     patient_date_of_birth="" 
    #     if obj.patient:
    #         patient_date_of_birth= f"{obj.patient.date_of_birth}"
    #     return patient_date_of_birth
    
    def get_patient_age(self,obj):
        from core.date_utils import get_age_in_years
        return get_age_in_years(f"{obj.patient_date_of_birth}")

class PrescriptionItemAdministrationsSerializer(serializers.ModelSerializer):
    key = serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ['-id']
        model = models.PrescriptionItemAdministrations
        fields = ("id", 
                    "entity",
                    "comment",
                    "administration_date",
                    "administration_time",
                    "prescription_item",
                    "is_administered",
                    "key",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )
        
    def get_key(self,obj):
        return obj.id
     
class PrescriptionItemsSerializer(serializers.ModelSerializer):
    product_title = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    administration_progress = serializers.SerializerMethodField(read_only=True)
    administrations = serializers.SerializerMethodField(read_only=True)
    frequency_title = serializers.SerializerMethodField(read_only=True)
    route_title = serializers.SerializerMethodField(read_only=True)
    retailer_receipt_price = serializers.SerializerMethodField(read_only=True)
    total_cost = serializers.SerializerMethodField(read_only=True)
    issued_value = serializers.SerializerMethodField(read_only=True)
    current_order_value = serializers.SerializerMethodField(read_only=True)
    required_value = serializers.SerializerMethodField(read_only=True)
    balance_value = serializers.SerializerMethodField(read_only=True)
    key = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.PrescriptionItems
        fields = (
            "id",
            "prescription",
            "preparation",
            "preparation_title",
            "product",
            "product_title",
            "prescribed_by",
            "interpreted_by",
            "frequency",
            "frequency_title",
            "route",
            "route_title",
            "dose",
            "days",
            "unit_of_issue",
            "retailer_receipt",
            "total_cost",
            "retailer_receipt_price",
            "required_unit_quantity",
            "current_order_unit_quantity",
            "issued_unit_quantity",
            "balance_unit_quantity",
            "required_value",
            "current_order_value",
            "issued_value",
            "balance_value",
            "administrations",
            "administration_progress",
            "is_divisible",
            "key",
            "created_by",
            "created",
            "updated",
        )
        read_only_fields = ("id","created_by", "created", "updated")
    
    
    def get_key(self,obj):
        return obj.id
    
    def get_retailer_receipt_price(self,obj):
        if obj.retailer_receipt:
            return obj.retailer_receipt.unit_selling_price
        else:
            return 0.00
        
    def get_total_cost(self,obj):
        total_cost =0.00
        if obj.retailer_receipt and obj.required_unit_quantity:
            total_cost= float(obj.retailer_receipt.unit_selling_price)* float(obj.required_unit_quantity)
        
        return total_cost
    
    def get_required_value(self,obj):
        required_value =0.00
        if obj.retailer_receipt and obj.required_unit_quantity:
            required_value= float(obj.retailer_receipt.unit_selling_price)* float(obj.required_unit_quantity)
        
        return required_value
    
    def get_issued_value(self,obj):
        issued_value =0.00
        if obj.retailer_receipt and obj.issued_unit_quantity:
            issued_value= float(obj.retailer_receipt.unit_selling_price)* float(obj.issued_unit_quantity)
        return issued_value
    
    def get_balance_value(self,obj):
        balance_value =0.00
        if obj.retailer_receipt and obj.balance_unit_quantity:
            balance_value= float(obj.retailer_receipt.unit_selling_price)* float(obj.balance_unit_quantity)
        return balance_value
    
    def get_current_order_value(self,obj):
        current_order_value =0.00
        if obj.retailer_receipt and obj.current_order_unit_quantity:
            current_order_value= float(obj.retailer_receipt.unit_selling_price)* float(obj.current_order_unit_quantity)
        return current_order_value
    
    def get_product_title(self,obj):
        if obj.product:
            return obj.product.title
        else:
            return ""
    def get_preparation_title(self,obj):
        if obj.product.preparation:
            return obj.product.preparation.title
        else:
            return ""
    def get_frequency_title(self,obj):
        if obj.frequency:
            return obj.frequency.title
        else:
            return ""
        
    def get_route_title(self,obj):
        if obj.route:
            return obj.route.title
        else:
            return ""
        
    def get_administrations(self,obj):
        administrations=[]
        if models.PrescriptionItemAdministrations.objects.filter(prescription_item=obj).exists():
            administrations=models.PrescriptionItemAdministrations.objects.filter(prescription_item=obj).all().order_by("administration_date")
        return PrescriptionItemAdministrationsSerializer(administrations,many=True, context=self.context).data        
    
    def get_administration_progress(self,obj):
        true_administrations=[]
        false_administrations=[]
        total_administrations=[]
        if models.PrescriptionItemAdministrations.objects.filter(prescription_item=obj).exists():
            total_administrations=models.PrescriptionItemAdministrations.objects.filter(prescription_item=obj).all()
        
        if models.PrescriptionItemAdministrations.objects.filter(prescription_item=obj,is_administered="true").exists():
            true_administrations=models.PrescriptionItemAdministrations.objects.filter(prescription_item=obj,is_administered="true").all()
        
        if models.PrescriptionItemAdministrations.objects.filter(prescription_item=obj,is_administered="false").exists():
            false_administrations=models.PrescriptionItemAdministrations.objects.filter(prescription_item=obj,is_administered="false").all()

        return f"{len(true_administrations)}/{len(total_administrations)}"   
    


class PurchasesReturnsSerializer(serializers.ModelSerializer):
    retailer_receipt_title=serializers.SerializerMethodField(read_only=True)
    class Meta:
        model=models.PurchasesReturns
        fields=("id","draft_id","retailer_receipt","retailer_receipt_title","retailer_order","quantity","justification","owner","created","updated")
        read_only_fields=("id","created","updated")
    
    def get_retailer_receipt_title(self,obj):
        return obj.retailer_receipt.product.title
    
class SalesReturnsSerializer(serializers.ModelSerializer):
    retailer_receipt_title=serializers.SerializerMethodField(read_only=True)
    class Meta:
        model=models.SalesReturns
        fields=("id","draft_id","retailer_receipt","retailer_receipt_title","quantity","customer_order","justification","owner","created","updated")
        read_only_fields=("id","created","updated")
    def get_retailer_receipt_title(self,obj):
        return obj.retailer_receipt.product.title
    

class StockAdjustmentsSerializer(serializers.ModelSerializer):
    retailer_receipt_title=serializers.SerializerMethodField(read_only=True)
    class Meta:
        model=models.StockAdjustments
        fields=("id","retailer_receipt","retailer_receipt_title","quantity","justification","owner","created","updated")
        read_only_fields=("id","created","updated")

    def get_retailer_receipt_title(self,obj):
        return obj.retailer_receipt.product.title