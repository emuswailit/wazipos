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
from core.serializers import BaseModelSerializer
from utils.logging import create_log
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


# retailers/views.py

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from employees.models import Employees
from retailers.models import RetailerIndent

class RetailerIndentItemEditSerializer(serializers.ModelSerializer):
    """
    Only the editable quantity. Everything else is derived
    from the wholesale receipt at creation time.
    """
    required_quantity = serializers.IntegerField(min_value=1)

    class Meta:
        model = models.RetailerIndentItem
        fields = ["required_quantity"]

    def validate_required_quantity(self, value):
        if value > 100000:
            raise serializers.ValidationError(
                "Quantity cannot exceed 100,000."
            )
        return value

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
    title = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)

    # ---- Placement snapshot (model-computed) ----
    is_placement = serializers.BooleanField(read_only=True)
    wholesaler_base_unit_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True, allow_null=True,
    )
    wholesaler_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, allow_null=True,
    )
    retailer_margin_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, allow_null=True,
    )

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

            # Unit price chain
            "item_price",
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

            # Placement settlement snapshot
            "is_placement",
            "wholesaler_base_unit_price",
            "wholesaler_total",
            "retailer_margin_total",

            "receipt_details",
            "created",
            "updated",
            "images",
        )
        read_only_fields = (
            "id",
            "created",
            "updated",

            # Derived totals — set by CustomerOrderItems.recalculate()
            "item_price_total",
            "item_tax_total",
            "item_price_discount_total",
            "item_net_price_total",
            "item_counter_price_discount_amount_total",

            # Placement snapshot — set by CustomerOrderItems.recalculate()
            "is_placement",
            "wholesaler_base_unit_price",
            "wholesaler_total",
            "retailer_margin_total",
        )

    # ------------------------------------------------------------------
    # Method fields
    # ------------------------------------------------------------------

    def get_title(self, obj):
        if obj.retailer_receipt and obj.retailer_receipt.product:
            return obj.retailer_receipt.product.title
        return ""

    def get_images(self, obj):
        if not obj.retailer_receipt or not obj.retailer_receipt.product:
            return None
        images = ProductImages.objects.filter(
            product=obj.retailer_receipt.product,
        )
        if not images.exists():
            return None
        return ProductImageSerializer(
            images, context=self.context, many=True,
        ).data

    def get_receipt_details(self, obj):
        if not obj.retailer_receipt:
            return None
        return RetailerReceiptsSerializer(
            obj.retailer_receipt, context=self.context, many=False,
        ).data

    
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
    entity_title = serializers.SerializerMethodField(read_only=True)
    is_paid = serializers.CharField(read_only=True)
    is_delivered_string = serializers.SerializerMethodField(read_only=True)
    is_packed_string = serializers.SerializerMethodField(read_only=True)

    # ---- Nested items / address ----
    order_items = serializers.SerializerMethodField(read_only=True)
    shipping_address = serializers.SerializerMethodField(read_only=True)

    # ---- Payment display (delegated to CustomerOrderPayment) ----
    psp_reference_number = serializers.SerializerMethodField(read_only=True)
    provider_reference_number = serializers.SerializerMethodField(read_only=True)
    payment_status = serializers.SerializerMethodField(read_only=True)
    payment_description = serializers.SerializerMethodField(read_only=True)
    payment_summary = serializers.SerializerMethodField(read_only=True)
    payments = serializers.SerializerMethodField(read_only=True)

    # ---- Contact / user ----
    selected_payment_method_title = serializers.SerializerMethodField(read_only=True)
    vendor = serializers.SerializerMethodField(read_only=True)
    user = serializers.SerializerMethodField(read_only=True)
    phone = serializers.SerializerMethodField(read_only=True)
    email = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)

    # ---- Boda / geo ----
    bodaboda_title = serializers.SerializerMethodField(read_only=True)
    bodaboda_farness = serializers.SerializerMethodField(read_only=True)
    bodaboda_latitude = serializers.SerializerMethodField(read_only=True)
    bodaboda_longitude = serializers.SerializerMethodField(read_only=True)
    origin_latitude = serializers.SerializerMethodField(read_only=True)
    origin_longitude = serializers.SerializerMethodField(read_only=True)
    destination_latitude = serializers.SerializerMethodField(read_only=True)
    destination_longitude = serializers.SerializerMethodField(read_only=True)

    # ---- Document number ----
    order_number = serializers.SerializerMethodField(read_only=True)

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
            "payment_account_number",
            "order_price_discount_total",
            "order_net_price_total",
            "order_price_total",
            "order_tax_total",
            "order_origin",
            "shipping_cost",
            "is_quoted",

            # Payment state (model-owned, read-only)
            "is_paid",
            "paid_at",
            "paid_total",
            "balance_due",
            "is_settled",
            "due_date",

            # Delivery state
            "is_delivered",
            "is_delivered_string",
            "delivered_at",
            "delivered_by",
            "is_packed",
            "is_packed_string",
            "packed_at",
            "packed_by",
            "is_received",
            "received_at",
            "received_by",
            "delivery_method",

            # Relationships
            "customer",
            "coupon",
            "entity",
            "entity_title",
            "vendor",
            "user",
            "phone",
            "email",

            # Boda / geo
            "bodaboda",
            "bodaboda_title",
            "bodaboda_farness",
            "bodaboda_latitude",
            "bodaboda_longitude",
            "origin_latitude",
            "origin_longitude",
            "destination_latitude",
            "destination_longitude",
            "origin_point",
            "destination_point",
            "farness",
            "city_name",

            # Contact snapshot
            "customer_name",
            "customer_phone",
            "recipient_name",
            "recipient_phone",

            # Payment methods / display
            "selected_payment_method",
            "selected_payment_method_title",
            "payment_status",
            "payment_description",
            "payment_summary",
            "payments",

            # Nested
            "order_items",
            "images",
            "shipping_address",

            # Timestamps
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

            # Derived totals — set by CustomerOrders.recalculate()
            "order_price_total",
            "order_tax_total",
            "order_price_discount_total",
            "order_net_price_total",

            # Derived payment state — set by recompute_order_payment_state()
            "is_paid",
            "paid_at",
            "paid_total",
            "balance_due",
            "is_settled",

            # Event-driven delivery state — set by deliver_customer_order()
            "is_delivered",
            "delivered_at",

            # Method fields — read-only by nature
            "entity_title",
            "is_delivered_string",
            "is_packed_string",
            "order_items",
            "shipping_address",
            "psp_reference_number",
            "provider_reference_number",
            "payment_status",
            "payment_description",
            "payment_summary",
            "payments",
            "selected_payment_method_title",
            "vendor",
            "user",
            "phone",
            "email",
            "images",
            "bodaboda_title",
            "bodaboda_farness",
            "bodaboda_latitude",
            "bodaboda_longitude",
            "origin_latitude",
            "origin_longitude",
            "destination_latitude",
            "destination_longitude",
            "order_number",
        )

    # ------------------------------------------------------------------
    # Payment helpers
    # ------------------------------------------------------------------

    def _successful_payment(self, obj):
        """First SUCCESS payment. Cached on the instance between calls."""
        cached = getattr(obj, "_successful_payment_cache", None)
        if cached is None:
            cached = (
                models.CustomerOrderPayment.objects
                .filter(customer_order=obj, status="SUCCESS")
                .select_related("payment_method")
                .first()
            )
            obj._successful_payment_cache = cached
        return cached

    def _any_payment(self, obj):
        """First payment of any status. Cached on the instance."""
        cached = getattr(obj, "_any_payment_cache", None)
        if cached is None:
            cached = (
                models.CustomerOrderPayment.objects
                .filter(customer_order=obj)
                .select_related("payment_method")
                .first()
            )
            obj._any_payment_cache = cached
        return cached

    def get_psp_reference_number(self, obj):
        payment = self._any_payment(obj)
        return payment.psp_reference_number if payment else ""

    def get_provider_reference_number(self, obj):
        payment = self._any_payment(obj)
        return payment.provider_reference_number if payment else ""

    def get_payment_description(self, obj):
        payment = self._any_payment(obj)
        return payment.description if payment else ""

    def get_payment_status(self, obj):
        """Return the most authoritative payment status available."""
        if models.CustomerOrderPayment.objects.filter(
            customer_order=obj, status="SUCCESS",
        ).exists():
            return "SUCCESS"
        if models.CustomerOrderPayment.objects.filter(
            customer_order=obj, status="PENDING",
        ).exists():
            return "PENDING"
        if models.CustomerOrderPayment.objects.filter(
            customer_order=obj, status="FAILED",
        ).exists():
            return "FAILED"
        return "UNAVAILABLE"

    def get_payment_summary(self, obj):
        """Aggregate of successful payments vs. order net total."""
        agg = (
            models.CustomerOrderPayment.objects
            .filter(customer_order=obj, status="SUCCESS")
            .aggregate(total=Sum("amount"))
        )
        paid = float(agg["total"] or 0)
        owed = float(obj.order_net_price_total or 0)
        return {
            "paid_total": round(paid, 2),
            "balance_due": round(max(0.0, owed - paid), 2),
            "is_paid": paid >= owed if owed else False,
            "payment_count": models.CustomerOrderPayment.objects.filter(
                customer_order=obj,
            ).count(),
        }

    def get_payments(self, obj):
        """All payments against this order, in chronological order."""
        payments = (
            models.CustomerOrderPayment.objects
            .filter(customer_order=obj)
            .select_related("payment_method")
            .order_by("created")
        )
        if not payments.exists():
            return []
        return CustomerOrderPaymentsSerializer(
            payments, context=self.context, many=True,
        ).data

    # ------------------------------------------------------------------
    # Nested items / address
    # ------------------------------------------------------------------

    def get_order_items(self, obj):
        items = obj.parent_order.all()
        return CustomerOrderItemsSerializer(
            items, context=self.context, many=True,
        ).data

    def get_shipping_address(self, obj):
        address = models.ShippingAddress.objects.filter(
            customer_order_id=obj.id,
        ).first()
        if not address:
            return None
        return ShippingAddressSerializer(
            address, context=self.context, many=False,
        ).data

    # ------------------------------------------------------------------
    # Titles / display
    # ------------------------------------------------------------------

    def get_entity_title(self, obj):
        return f"{obj.entity.title}" if obj.entity else ""

    def get_vendor(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_is_delivered_string(self, obj):
        return "Yes" if obj.is_delivered == "true" else "No"

    def get_is_packed_string(self, obj):
        return "Yes" if obj.is_packed == "true" else "No"

    def get_order_number(self, obj):
        return obj.order_number.document_number if obj.order_number else "N/A"

    def get_selected_payment_method_title(self, obj):
        if obj.selected_payment_method:
            return obj.selected_payment_method.title
        return ""

    def get_user(self, obj):
        if obj.owner:
            return f"{obj.owner.first_name} {obj.owner.last_name}"
        return ""

    def get_phone(self, obj):
        return obj.owner.phone if obj.owner else ""

    def get_email(self, obj):
        return obj.owner.email if obj.owner else ""

    def get_images(self, obj):
        target_user = obj.customer or obj.owner
        if not target_user:
            return []
        images = UserImages.objects.filter(owner=target_user)
        if not images.exists():
            return []
        return UserImageSerializer(
            images, context=self.context, many=True,
        ).data

    # ------------------------------------------------------------------
    # Boda / geo
    # ------------------------------------------------------------------

    def get_bodaboda_title(self, obj):
        if obj.bodaboda:
            return f"{obj.bodaboda.owner.first_name}, {obj.bodaboda.owner.phone}"
        return ""

    def get_bodaboda_farness(self, obj):
        if obj.bodaboda:
            return f"{obj.bodaboda.farness}km"
        return ""

    def get_bodaboda_latitude(self, obj):
        if obj.bodaboda and obj.bodaboda.point:
            return list(obj.bodaboda.point)[1]
        return None

    def get_bodaboda_longitude(self, obj):
        if obj.bodaboda and obj.bodaboda.point:
            return list(obj.bodaboda.point)[0]
        return None

    def get_origin_longitude(self, obj):
        if obj.origin_point:
            return list(obj.origin_point)[0]
        return None

    def get_origin_latitude(self, obj):
        if obj.origin_point:
            return list(obj.origin_point)[1]
        return None

    def get_destination_longitude(self, obj):
        if obj.destination_point:
            return list(obj.destination_point)[0]
        return None

    def get_destination_latitude(self, obj):
        if obj.destination_point:
            return list(obj.destination_point)[1]
        return None

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
    wholesaler_offers = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.OutOfStock
        fields = (
            "id",
            "draft_id",
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
            "wholesaler_offers",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
        )

    def get_product_title(self, obj):
        return obj.product.title

    def get_units_per_pack(self, obj):
        return obj.product.units_per_pack

    def get_images(self, obj):
        images = []
        if ProductImages.objects.filter(product=obj.product).exists():
            images = ProductImages.objects.filter(product=obj.product).all()
        return ProductImageSerializer(
            images, context=self.context, many=True
        ).data

    def get_wholesaler_offers(self, obj):
        if not obj.product_id:
            return []

        # Local imports to avoid a circular dependency between the
        # retailers and wholesalers apps.
        from datetime import date

        from django.db.models import Case, Count, IntegerField, Q, When, Value

        from wholesalers.models import WholesalerReceipts
        from wholesalers.serializers import WholesalerReceiptsSerializer

        try:
            today = date.today()

            # A receipt is "discounted" if it has an active price
            # discount OR an active quantity discount whose date
            # window covers today.
            active_price_discount = Q(
                wholesaler_price_discount_receipt__is_active="true",
                wholesaler_price_discount_receipt__start__lte=today,
                wholesaler_price_discount_receipt__end__gte=today,
            )
            active_quantity_discount = Q(
                wholesaler_quantity_discount_receipt__is_active="true",
                wholesaler_quantity_discount_receipt__start__lte=today,
                wholesaler_quantity_discount_receipt__end__gte=today,
            )

            receipts = (
                WholesalerReceipts.objects
                .filter(product=obj.product)
                .annotate(
                    has_price_discount=Count(
                        "wholesaler_price_discount_receipt",
                        filter=active_price_discount,
                        distinct=True,
                    ),
                    has_quantity_discount=Count(
                        "wholesaler_quantity_discount_receipt",
                        filter=active_quantity_discount,
                        distinct=True,
                    ),
                )
                .annotate(
                    discount_rank=Case(
                        # Both price + quantity discounts
                        When(
                            has_price_discount__gt=0,
                            has_quantity_discount__gt=0,
                            then=Value(3),
                        ),
                        # Price discount only
                        When(
                            has_price_discount__gt=0,
                            then=Value(2),
                        ),
                        # Quantity discount only
                        When(
                            has_quantity_discount__gt=0,
                            then=Value(1),
                        ),
                        # No active discount
                        default=Value(0),
                        output_field=IntegerField(),
                    ),
                )
                .select_related(
                    "product",
                    "product__preparation",
                    "product__manufacturer",
                    "product__origin_country",
                    "wholesaler_variation",
                    "received_from",
                    "retailer_order_item",
                    "employee",
                    "owner",
                )
                # Best offers first, then cheapest price, then newest.
                .order_by(
                    "-discount_rank",
                    "final_unit_selling_price",
                    "-created",
                )[:5]
            )

            return WholesalerReceiptsSerializer(
                receipts, context=self.context, many=True
            ).data
        except Exception:
            # Never let an offer-lookup failure break the
            # OutOfStock response.
            return []

from rest_framework import serializers

from products.models import ProductImages
from .models import RetailerIndent, RetailerIndentItem


class InventoryPredictionQuerySerializer(serializers.Serializer):
    """Sanitises the input params for the simulator playground endpoint."""
    days_to_order = serializers.IntegerField(min_value=1, max_value=365)
    lead_time_days = serializers.IntegerField(min_value=0, max_value=90, default=0)
    lookback_window = serializers.IntegerField(default=30, min_value=7, max_value=90, required=False)
    max_shelf_days = serializers.IntegerField(default=90, min_value=15, max_value=365, required=False)
# =========================================================
# Indent item
# =========================================================

# apps/retailers/serializers.py

from rest_framework import serializers

from products.models import ProductImages  # adjust import
from products.serializers import (
    ProductImageSerializer,
)  # adjust import

from .models import RetailerIndent, RetailerIndentItem


class RetailerIndentItemsSerializer(serializers.ModelSerializer):
    # ---- Product / wholesaler info ----
    wholesale_receipt_title = serializers.SerializerMethodField()
    wholesaler = serializers.SerializerMethodField()
    wholesaler_title = serializers.SerializerMethodField()

    # ---- Batch dates ----
    manufacture_date = serializers.SerializerMethodField()
    expiry_date = serializers.SerializerMethodField()

    # ---- Images ----
    images = serializers.SerializerMethodField()

    # ---- Discount titles ----
    wholesaler_price_discount_title = serializers.SerializerMethodField()
    wholesaler_quantity_discount_title = serializers.SerializerMethodField()

    # ---- Campaign link ----
    campaign_item_details = serializers.SerializerMethodField()

    # ---- Entity info ----
    entity_title = serializers.SerializerMethodField()

    # ---- Source label ----
    source_label = serializers.CharField(
        source="get_source_display", read_only=True,
    )

    # ---- Snapshot fields (persisted) ----
    supplier_unit_selling_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True, allow_null=True,
    )
    final_supplier_unit_selling_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True, allow_null=True,
    )
    recommended_retail_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True, allow_null=True,
    )
    markup_percentage_used = serializers.DecimalField(
        max_digits=6, decimal_places=2, read_only=True, allow_null=True,
    )

    # ---- Bonus rule snapshot ----
    bonus_quantity_earned = serializers.IntegerField(read_only=True)
    bonus_blocks_earned = serializers.IntegerField(read_only=True)
    bonus_rule_buy_quantity = serializers.IntegerField(
        read_only=True, allow_null=True,
    )
    bonus_rule_free_quantity = serializers.IntegerField(
        read_only=True, allow_null=True,
    )

    # ---- Profit accessors (model @property) ----
    cost_per_unit = serializers.CharField(read_only=True, allow_null=True)
    sell_per_unit = serializers.CharField(read_only=True, allow_null=True)
    profit_per_unit = serializers.CharField(read_only=True, allow_null=True)
    total_profit = serializers.CharField(read_only=True, allow_null=True)
    total_revenue = serializers.CharField(read_only=True, allow_null=True)
    margin_percent = serializers.CharField(read_only=True, allow_null=True)
    pricing_source = serializers.CharField(read_only=True, allow_null=True)

    class Meta:
        model = RetailerIndentItem
        fields = (
            "id",
            "entity",
            "entity_title",

            # Source
            "source",
            "source_label",

            # Relationships
            "retailer_indent",
            "wholesale_receipt",
            "wholesale_receipt_title",
            "wholesaler",
            "wholesaler_title",

            # Discounts
            "wholesaler_price_discount",
            "wholesaler_price_discount_title",
            "wholesaler_quantity_discount",
            "wholesaler_quantity_discount_title",

            # Campaign
            "campaign_item",
            "campaign_item_details",

            # Quantities
            "required_quantity",
            "total_quantity",

            # Bonus snapshot
            "bonus_quantity_earned",
            "bonus_blocks_earned",
            "bonus_rule_buy_quantity",
            "bonus_rule_free_quantity",

            # Price snapshot chain
            "supplier_unit_selling_price",
            "final_supplier_unit_selling_price",
            "recommended_retail_price",
            "markup_percentage_used",

            # Derived pricing (model @property)
            "final_unit_price",
            "item_gross_total_amount",
            "item_net_total_amount",

            # Profit
            "profit_estimate",
            "cost_per_unit",
            "sell_per_unit",
            "profit_per_unit",
            "total_profit",
            "total_revenue",
            "margin_percent",
            "pricing_source",

            # Lead time
            "lead_time_days",
            "lead_time_variance_days",
            "lead_time_source",

            # Product metadata
            "manufacture_date",
            "expiry_date",
            "images",

            # Timestamps / audit
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

            # Snapshots
            "final_supplier_unit_selling_price",
            "markup_percentage_used",

            # Bonus snapshot
            "bonus_quantity_earned",
            "bonus_blocks_earned",
            "bonus_rule_buy_quantity",
            "bonus_rule_free_quantity",

            # Derived pricing
            "final_unit_price",
            "item_gross_total_amount",
            "item_net_total_amount",

            # Profit
            "profit_estimate",
            "cost_per_unit",
            "sell_per_unit",
            "profit_per_unit",
            "total_profit",
            "total_revenue",
            "margin_percent",
            "pricing_source",
        )

    # -----------------------------------------------------
    # Method fields
    # -----------------------------------------------------

    def get_entity_title(self, obj):
        if obj.retailer_indent and obj.retailer_indent.entity:
            return obj.retailer_indent.entity.title
        return ""

    def get_wholesale_receipt_title(self, obj):
        if obj.wholesale_receipt and obj.wholesale_receipt.product:
            return obj.wholesale_receipt.product.title
        return ""

    def get_wholesaler(self, obj):
        if obj.wholesale_receipt and obj.wholesale_receipt.received_from:
            return str(obj.wholesale_receipt.received_from.id)
        return None

    def get_wholesaler_title(self, obj):
        if obj.wholesale_receipt and obj.wholesale_receipt.received_from:
            return obj.wholesale_receipt.received_from.title
        return ""

    def get_manufacture_date(self, obj):
        if obj.manufacture_date:
            return obj.manufacture_date
        if obj.wholesale_receipt:
            return obj.wholesale_receipt.manufacture_date
        return None

    def get_expiry_date(self, obj):
        if obj.expiry_date:
            return obj.expiry_date
        if obj.wholesale_receipt:
            return obj.wholesale_receipt.expiry_date
        return None

    def get_images(self, obj):
        if not obj.wholesale_receipt:
            return []
        images = ProductImages.objects.filter(
            product=obj.wholesale_receipt.product,
        )
        return ProductImageSerializer(
            images, context=self.context, many=True,
        ).data

    def get_wholesaler_price_discount_title(self, obj):
        return obj.wholesaler_price_discount.title if obj.wholesaler_price_discount else ""

    def get_wholesaler_quantity_discount_title(self, obj):
        return obj.wholesaler_quantity_discount.title if obj.wholesaler_quantity_discount else ""

    def get_campaign_item_details(self, obj):
        if not obj.campaign_item_id:
            return None
        ci = obj.campaign_item
        return {
            "id": ci.id,
            "campaign_id": ci.campaign_id,
            "campaign_title": ci.campaign.title if ci.campaign else "",
            "suggested_quantity": ci.suggested_quantity,
            "per_retailer_limit": ci.per_retailer_limit,
        }
# =========================================================
# Retailer indent header
# =========================================================

class RetailerIndentSerializer(serializers.ModelSerializer):
    retailer_indent_items = serializers.SerializerMethodField()
    entity_title = serializers.SerializerMethodField()
    over_budget = serializers.BooleanField(read_only=True)
    has_items = serializers.SerializerMethodField()
    active_item_count = serializers.SerializerMethodField()

    # ---- Lead-time aggregate ----
    average_lead_time_days = serializers.DecimalField(
        max_digits=6,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )
    average_variance_days = serializers.DecimalField(
        max_digits=6,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )

    # ---- Projected aggregates ----
    total_cost = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )
    total_revenue = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )
    total_profit = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = RetailerIndent
        fields = (
            "id",
            "is_open",
            "indent_number",
            "entity",
            "entity_title",

            # Ordering parameters
            "lead_time",
            "order_days",
            "budget_amount",
            "budget_enforced",
            "pricing_percentage",

            # Aggregate lead time
            "average_lead_time_days",
            "average_variance_days",
            "min_lead_time_days",
            "max_lead_time_days",
            "lead_time_updated_at",

            # Projected aggregates
            "total_cost",
            "total_revenue",
            "total_profit",
            "included_item_count",
            "excluded_item_count",
            "over_budget",
            "has_items",
            "active_item_count",

            # Snapshot of the config used to generate
            "config_snapshot",

            # Nested items
            "retailer_indent_items",

            # Timestamps / audit
            "created",
            "updated",
            "owner",
        )
        read_only_fields = (
            "id",
            "indent_number",
            "average_lead_time_days",
            "average_variance_days",
            "min_lead_time_days",
            "max_lead_time_days",
            "lead_time_updated_at",
            "total_cost",
            "total_revenue",
            "total_profit",
            "included_item_count",
            "excluded_item_count",
            "over_budget",
            "has_items",
            "active_item_count",
            "config_snapshot",
            "created",
            "updated",
            "owner",
        )

    def get_entity_title(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_retailer_indent_items(self, obj):
        items = obj.indent_for_item.all()
        return RetailerIndentItemsSerializer(
            items, context=self.context, many=True,
        ).data

    def get_has_items(self, obj):
        return obj.indent_for_item.exists()

    def get_active_item_count(self, obj):
        return obj.indent_for_item.count()
# class RetailerIndentSerializer(serializers.ModelSerializer):
#     retailer_indent_items = serializers.SerializerMethodField(read_only=True)
#     indent_number = serializers.SerializerMethodField(read_only=True)
#     entity_title = serializers.SerializerMethodField(read_only=True)
#     class Meta:
#         model = models.RetailerIndent
#         fields = (
#             "id",
#             "is_open",
#             "indent_number",
#             "entity_title",
#             "lead_time",
#             "order_days",
#             "retailer_indent_items",
#             "created",
#             "updated",
#             "owner",
#         )
#         read_only_fields = (
#             "id",
#             "indent_number",
#             "created",
#             "updated",
#             "owner",
#         )

#     def get_retailer_indent_items(self,obj):
#         items =[]
#         if models.RetailerIndentItem.objects.filter(retailer_indent=obj).exists():
#             items = models.RetailerIndentItem.objects.filter(retailer_indent=obj).all()
#         return RetailerIndentItemsSerializer(items, context=self.context, many=True).data
        
#     def get_indent_number(self,obj):
#         if obj.indent_number:
#             return obj.indent_number.document_number
#         else:
#             return ""
#     def get_entity_title(self,obj):
#         if obj.entity:
#             return obj.entity.title
#         else:
#             return ""
        
# class RetailerIndentItemsSerializer(serializers.ModelSerializer):
#     wholesaler = serializers.SerializerMethodField(read_only=True)
#     wholesaler_title = serializers.SerializerMethodField(read_only=True)
#     wholesaler_title = serializers.SerializerMethodField(read_only=True)
#     manufacture_date = serializers.SerializerMethodField(read_only=True)
#     expiry_date = serializers.SerializerMethodField(read_only=True)
#     entity_title = serializers.SerializerMethodField(read_only=True)
#     wholesaler_price_discount_title = serializers.SerializerMethodField(read_only=True)
#     wholesaler_quantity_discount_title = serializers.SerializerMethodField(read_only=True)
#     wholesale_receipt_title = serializers.SerializerMethodField(read_only=True)
  
#     images = serializers.SerializerMethodField(read_only=True)
#     class Meta:
#         model = models.RetailerIndentItem
#         fields = (
#             "id",
#             "entity",
#             "entity_title",
#             "indenting_criteria",
#             "retailer_indent",
#             "wholesale_receipt",
#             "wholesale_receipt_title",
#             "wholesaler",
#             "wholesaler_title",
#             "wholesaler_price_discount",
#             "wholesaler_price_discount_title",
#             "wholesaler_quantity_discount",
#             "wholesaler_quantity_discount_title",
#             "required_quantity",
#             "total_quantity",
#             "item_gross_total_amount",
#             "item_net_total_amount",
#             "final_pack_price",
#             "manufacture_date",
#             "expiry_date",
#             "images",
#             "created",
#             "updated",
#             "owner",
#         )
#         read_only_fields = (
#             "id",
#             "entity",
#             "created",
#             "updated",
#             "owner",
#         )
#     def get_entity_title(self,obj):
#         return obj.retailer_indent.entity.title
    
#     def get_wholesale_receipt_title(self,obj):
#         return obj.wholesale_receipt.product.title
    
#     def get_manufacture_date(self,obj):
#         return obj.wholesale_receipt.manufacture_date
    
#     def get_expiry_date(self,obj):
#         return obj.wholesale_receipt.expiry_date
    
#     def get_wholesaler(self,obj):
#         return obj.wholesale_receipt.entity.id
    
#     def get_images(self,obj):
#         images =[]
#         if ProductImages.objects.filter(product=obj.wholesale_receipt.product).exists():
#             images = ProductImages.objects.filter(product=obj.wholesale_receipt.product).all()
#         return ProductImageSerializer(images, context=self.context, many=True).data
    
#     def get_wholesaler_title(self,obj):
#         return obj.wholesale_receipt.entity.title
    
    
#     def get_wholesaler_price_discount_title(self,obj):
#         if obj.wholesaler_price_discount:
#             return obj.wholesaler_price_discount.title
#         else:
#             return ""
        
#     def get_wholesaler_quantity_discount_title(self,obj):
#         if obj.wholesaler_quantity_discount:
#             return obj.wholesaler_quantity_discount.title
#         else:
#             return ""

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
    final_unit_selling_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True,
    )
    landed_unit_buying_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True,
    )
    available_unit_quantity = serializers.IntegerField(read_only=True)
    is_consignment_open = serializers.BooleanField(read_only=True)

    entity_title = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    received_from_title = serializers.SerializerMethodField(read_only=True)
    origin_country = serializers.SerializerMethodField(read_only=True)
    origin_country_title = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    formulation_title = serializers.SerializerMethodField(read_only=True)
    long_title = serializers.SerializerMethodField(read_only=True)
    days_to_expiry = serializers.SerializerMethodField(read_only=True)
    expiry_status = serializers.SerializerMethodField(read_only=True)
    packaging = serializers.SerializerMethodField(read_only=True)
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
            "draft_id",
            "preparation_title",
            "product_title",
            "formulation_title",
            "long_title",
            "received_from",
            "unit_of_receipt",
            "received_from_title",
            "retailer_order",
            "retailer_order_item",
            "wholesaler_receipt",
            "batch",
            "bar_code",
            "manufacture_date",
            "expiry_date",
            "unit_buying_price",
            "unit_selling_price",
            "unit_price_discount",
            "final_unit_selling_price",
            "allocated_shipping_total",
            "allocated_shipping_per_unit",
            "landed_unit_buying_price",
            "current_unit_quantity",
            "received_unit_quantity",
            "reserved_unit_quantity",
            "available_unit_quantity",
            "in_placement",
            "is_consignment_open",
            "is_active",
            "is_pom",
            "supplier_invoice",
            "origin_country",
            "origin_country_title",
            "placement_sold_quantity",
            "placement_owed_total",
            "placement_margin_total",
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
            "created",
            "updated",
            "entity",
            "owner",
            "final_unit_selling_price",
            "landed_unit_buying_price",
            "allocated_shipping_total",
            "allocated_shipping_per_unit",
            "available_unit_quantity",
            "placement_sold_quantity",
            "placement_owed_total",
            "placement_margin_total",
            "is_consignment_open",
            "received_from_title",
            "images",
        )

    # ------------------------------------------------------------------
    # Method fields — kept exactly as before except where noted
    # ------------------------------------------------------------------

    def get_received_from_title(self, obj):
        if obj.received_from:
            return obj.received_from.title
        return ""

    def get_entity_title(self, obj):
        if obj.entity:
            return obj.entity.title
        return ""

    def get_title(self, obj):
        if obj.product.preparation:
            return f"{obj.product.preparation.title} - {obj.product.title} {obj.product.preparation.formulation.title} {obj.product.units_per_pack}s"
        else:
            return f"{obj.product.title} {obj.product.units_per_pack}s"

    def get_is_pom(self, obj):
        # CHANGED: no write side-effect. Derive the flag.
        return bool(obj.product.preparation)

    def get_preparation_title(self, obj):
        if obj.product.preparation:
            return obj.product.preparation.title
        return ""

    def get_origin_country_title(self, obj):
        if obj.product.origin_country:
            return obj.product.origin_country.title
        return ""

    def get_origin_country(self, obj):
        if obj.product.origin_country:
            return obj.product.origin_country.id
        return ""

    def get_product_title(self, obj):
        if obj.product.title:
            return obj.product.title
        return ""

    def get_packaging(self, obj):
        if obj.product.packaging:
            return obj.product.packaging
        return ""

    def get_manufacturer(self, obj):
        if obj.product.manufacturer:
            return obj.product.manufacturer.id
        return ""

    def get_manufacturer_title(self, obj):
        if obj.product.manufacturer:
            return obj.product.manufacturer.title
        return ""

    def get_formulation_title(self, obj):
        if obj.product.preparation:
            return obj.product.preparation.formulation.title
        return ""

    def get_long_title(self, obj):
        if obj.product.preparation:
            return f"{obj.product.preparation.title}-{obj.product.preparation.formulation.title} - {obj.product.title} {obj.product.units_per_pack}s"
        else:
            return f"{obj.product.title}"

    def get_images(self, obj):
        if not obj.product:
            return None
        images = ProductImages.objects.filter(product=obj.product)
        if not images.exists():
            return None
        return ProductImageSerializer(
            images, context=self.context, many=True,
        ).data

    def get_days_to_expiry(self, obj):
        if obj.expiry_date:
            today = date.today()
            expiry_date = obj.expiry_date
            if expiry_date:
                return numOfDays(today, expiry_date)
        return None

    def get_expiry_status(self, obj):
        if obj.expiry_date:
            today = date.today()
            expiry_date = obj.expiry_date
            expiry_days = numOfDays(today, expiry_date)
            if expiry_days is not None:
                if expiry_days < 1:
                    return f"EXPIRED {expiry_days} DAY(S) AGO"
                elif 1 < expiry_days < 7:
                    return f"EXPIRES IN A WEEK (IN {expiry_days} DAY(S)"
                elif 7 < expiry_days < 28:
                    return f"EXPIRES IN A MONTH (IN {expiry_days} DAY(S)"
                elif 28 < expiry_days < 56:
                    return f"EXPIRES 2 MONTHS (IN {expiry_days} DAY(S)"
                elif expiry_days > 56:
                    return f"EXPIRES IN {expiry_days} DAY(S)"
        return None
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
    
# retailers/serializers.py

from rest_framework import serializers

from retailers import models


class StockAdjustmentsSerializer(serializers.ModelSerializer):
    """
    Serializer for StockAdjustments.

    Additions since the original version:
      - return_intent        (new field)
      - linked_return        (new field, FK to WholesalerReceiptReturns)
      - direction            (was missing from the original)
      - display strings      (return_intent_display, direction_display)
      - linked return summary (linked_return_id, linked_return_status)
    """

    retailer_receipt_title = serializers.SerializerMethodField(read_only=True)
    return_intent_display = serializers.CharField(
        source="get_return_intent_display", read_only=True,
    )
    direction_display = serializers.CharField(
        source="get_direction_display", read_only=True,
    )
    linked_return_id = serializers.UUIDField(read_only=True)
    linked_return_status = serializers.CharField(
        source="linked_return.status", read_only=True,
    )

    class Meta:
        model = models.StockAdjustments
        fields = (
            "id",
            "retailer_receipt",
            "retailer_receipt_title",
            "quantity",
            "direction",
            "direction_display",
            "justification",
            "return_intent",
            "return_intent_display",
            "linked_return",
            "linked_return_id",
            "linked_return_status",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = (
            "id",
            "created",
            "updated",
        )

    def get_retailer_receipt_title(self, obj):
        if obj.retailer_receipt and obj.retailer_receipt.product:
            return obj.retailer_receipt.product.title
        return None


# retailers/serializers.py

class RetailerIndentParamsSerializer(serializers.ModelSerializer):
    """
    Only the parameters a retailer is allowed to edit on their
    own indent.
    """

    class Meta:
        model = RetailerIndent
        fields = [
            "order_days",           # ← replaces days_to_order
            "lead_time",            # ← replaces lead_time_days
            "budget_amount",        # ← new
            "budget_enforced",      # ← new
            "pricing_percentage",   # ← new
        ]



class RetailerOrderCheckoutItemSerializer(serializers.Serializer):
    """Validates individual items inside the bulk checkout array payload."""
    wholesaler_receipt_id = serializers.IntegerField()
    purchased_quantity = serializers.IntegerField(min_value=0)


class BulkWholesaleCheckoutRequestSerializer(serializers.Serializer):
    """Validates the simplified payload where only the items array matters."""
    items = RetailerOrderCheckoutItemSerializer(many=True, allow_empty=False)



# apps/retailers/serializers.py

from rest_framework import serializers


class RetailerIndentItemParamsUpdateSerializer(
    serializers.Serializer
):
    """
    Fields a retailer is allowed to edit on a single indent item.

    The user can override the price snapshot chain
    (supplier_unit_selling_price, recommended_retail_price) — for
    example when the supplier's list price or RRP is wrong or
    missing — and the model recomputes the derived bonus,
    markup, totals, and profit on save.
    """

    required_quantity = serializers.IntegerField(
        required=False,
        min_value=1,
    )
    source = serializers.ChoiceField(
        choices=[
            "PREDICTION",
            "MANUAL",
            "IMPORTED",
        ],
        required=False,
    )

    # ---- Price snapshot chain (user-editable) ----
    supplier_unit_selling_price = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=10,
        decimal_places=2,
        min_value=0,
    )
    recommended_retail_price = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=10,
        decimal_places=2,
        min_value=0,
    )
    markup_percentage_used = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=10,
        decimal_places=2,
        min_value=0,
    )

    # ---- Optional FK overrides ----
    wholesaler_price_discount = serializers.UUIDField(
        required=False,
        allow_null=True,
    )
    wholesaler_quantity_discount = serializers.UUIDField(
        required=False,
        allow_null=True,
    )
    wholesale_receipt = serializers.UUIDField(
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                "At least one field is required."
            )
        return attrs


# retailers/serializers.py
#
# Complete file. Contains every serializer used by the retailer- and
# wholesaler-facing product request endpoints.

from rest_framework import serializers

from .models import (
    RetailerProductRequest,
    RetailerProductRequestItem,
    RetailerProductRequestItemWholesaler,
    RetailerProductRequestOffer,
    RetailerProductRequestResponse,
)


# =====================================================================
# Offers
# =====================================================================

class RetailerProductRequestOfferSerializer(serializers.ModelSerializer):
    """
    Full offer shape for the retailer's view of one of their requests.
    Includes the offering wholesaler's display data.
    """

    wholesaler_title = serializers.CharField(
        source="wholesaler.title",
        read_only=True,
    )
    wholesaler_receipt_title = serializers.CharField(
        source="wholesaler_receipt.title",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )

    class Meta:
        model = RetailerProductRequestOffer
        fields = [
            "id",
            "request_item",
            "wholesaler",
            "wholesaler_title",
            "wholesaler_receipt",
            "wholesaler_receipt_title",
            "offered_quantity",
            "offered_unit_price",
            "batch",
            "expiry_date",
            "manufacture_date",
            "is_placement",
            "status",
            "status_display",
            "response_note",
            "retailer_response_note",
            "retailer_confirmed_at",
            "created",
            "updated",
        ]
        read_only_fields = fields


class WholesalerFacingOfferSerializer(serializers.ModelSerializer):
    """
    Offer shape for a wholesaler's view of one of their own offers.
    Hides who else is offering, and hides retailer-only fields.
    """

    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )

    class Meta:
        model = RetailerProductRequestOffer
        fields = [
            "id",
            "request_item",
            "offered_quantity",
            "offered_unit_price",
            "batch",
            "expiry_date",
            "manufacture_date",
            "is_placement",
            "status",
            "status_display",
            "response_note",
            "retailer_response_note",
            "created",
            "updated",
        ]
        read_only_fields = fields


# =====================================================================
# Items
# =====================================================================

class RetailerProductRequestItemSerializer(serializers.ModelSerializer):
    """
    Retailer-facing item. Includes every offer received on the line
    and the list of wholesalers the line was sent to.
    """

    product_title = serializers.CharField(
        source="product.title",
        read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    offers = RetailerProductRequestOfferSerializer(
        many=True,
        read_only=True,
    )
    target_wholesaler_ids = serializers.SerializerMethodField()
    target_wholesalers = serializers.SerializerMethodField()

    class Meta:
        model = RetailerProductRequestItem
        fields = [
            "id",
            "request",
            "product",
            "product_title",
            "requested_quantity",
            "urgency",
            "urgency_display",
            "note",
            "status",
            "status_display",
            "offer_count",
            "total_offered_quantity",
            "confirmed_quantity",
            "target_wholesaler_ids",
            "target_wholesalers",
            "offers",
            "created",
            "updated",
        ]
        read_only_fields = fields

    def _active_pairs(self, obj):
        # Use prefetched attribute if present, else query.
        cached = getattr(obj, "active_target_pairs", None)
        if cached is not None:
            return cached
        return list(
            obj.target_pairs.filter(is_active=True).select_related(
                "wholesaler"
            )
        )

    def get_target_wholesaler_ids(self, obj):
        return [str(p.wholesaler_id) for p in self._active_pairs(obj)]

    def get_target_wholesalers(self, obj):
        return [
            {
                "id": str(p.wholesaler_id),
                "title": p.wholesaler.title,
            }
            for p in self._active_pairs(obj)
        ]


class RetailerProductRequestListItemSerializer(
    serializers.ModelSerializer
):
    """
    Compact item shape for the retailer's list endpoint. No offers,
    no targeting detail — just enough for a summary row.
    """

    product_title = serializers.CharField(
        source="product.title",
        read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )

    class Meta:
        model = RetailerProductRequestItem
        fields = [
            "id",
            "product",
            "product_title",
            "requested_quantity",
            "urgency",
            "urgency_display",
            "note",
            "status",
            "status_display",
            "offer_count",
            "total_offered_quantity",
            "confirmed_quantity",
            "created",
        ]
        read_only_fields = fields


class WholesalerFacingItemSerializer(serializers.ModelSerializer):
    """
    Item shape for a wholesaler. Contains only the caller's own
    offers. Reads `wholesaler_id` from context.
    """

    product_title = serializers.CharField(
        source="product.title",
        read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display",
        read_only=True,
    )
    my_offers = serializers.SerializerMethodField()

    class Meta:
        model = RetailerProductRequestItem
        fields = [
            "id",
            "product",
            "product_title",
            "requested_quantity",
            "urgency",
            "urgency_display",
            "note",
            "status",
            "my_offers",
            "created",
        ]
        read_only_fields = fields

    def get_my_offers(self, obj):
        wholesaler_id = self.context.get("wholesaler_id")
        if not wholesaler_id:
            return []
        # Use prefetched attribute if present.
        cached = getattr(obj, "my_offers_cache", None)
        if cached is not None:
            offers = cached
        else:
            offers = obj.offers.filter(wholesaler_id=wholesaler_id)
        return WholesalerFacingOfferSerializer(offers, many=True).data


# =====================================================================
# Requests — retailer facing
# =====================================================================

class RetailerProductRequestSerializer(serializers.ModelSerializer):
    """
    Full retailer-facing request. Every item with every offer.
    Used by GetRequestDetails on the retailer side.
    """

    entity_title = serializers.CharField(
        source="entity.title",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display",
        read_only=True,
    )
    items = RetailerProductRequestItemSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = RetailerProductRequest
        fields = [
            "id",
            "draft_id",
            "request_number",
            "entity",
            "entity_title",
            "urgency",
            "urgency_display",
            "note",
            "status",
            "status_display",
            "total_line_count",
            "fulfilled_line_count",
            "pending_line_count",
            "expires_at",
            "fulfilled_at",
            "cancelled_at",
            "created",
            "updated",
            "items",
        ]
        read_only_fields = fields


class RetailerProductRequestListSerializer(
    serializers.ModelSerializer
):
    """
    Compact retailer-facing request. Nested item summaries, no
    offers. Used by GetMyRequests and the WS initial snapshot.
    """

    entity_title = serializers.CharField(
        source="entity.title",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display",
        read_only=True,
    )
    items = RetailerProductRequestListItemSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = RetailerProductRequest
        fields = [
            "id",
            "draft_id",
            "request_number",
            "entity",
            "entity_title",
            "urgency",
            "urgency_display",
            "note",
            "status",
            "status_display",
            "total_line_count",
            "fulfilled_line_count",
            "pending_line_count",
            "expires_at",
            "created",
            "items",
        ]
        read_only_fields = fields


# =====================================================================
# Requests — wholesaler facing
# =====================================================================

class WholesalerFacingListSerializer(serializers.ModelSerializer):
    """
    Request shape for a wholesaler's list view.

    Relies on the queryset passing a `tagged_items` attribute
    (Prefetch to_attr) containing only the caller's tagged items.
    Computes `line_count` from that set so the wholesaler never sees
    counts for lines they weren't sent.
    """

    entity_title = serializers.CharField(
        source="entity.title",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display",
        read_only=True,
    )
    line_count = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = RetailerProductRequest
        fields = [
            "id",
            "request_number",
            "entity",
            "entity_title",
            "urgency",
            "urgency_display",
            "note",
            "status",
            "status_display",
            "line_count",
            "expires_at",
            "created",
            "items",
        ]
        read_only_fields = fields

    def _tagged(self, obj):
        return getattr(obj, "tagged_items", None) or []

    def get_line_count(self, obj):
        return len(self._tagged(obj))

    def get_items(self, obj):
        wholesaler_id = self.context.get("wholesaler_id")
        return [
            WholesalerFacingItemSerializer(
                item,
                context={"wholesaler_id": wholesaler_id},
            ).data
            for item in self._tagged(obj)
        ]


class WholesalerFacingDetailSerializer(WholesalerFacingListSerializer):
    """
    Same fields as the list serializer today. Kept as a separate
    class so the details response can diverge (e.g. include more
    metadata) without touching the list endpoint.
    """

    pass


# =====================================================================
# Targeting pairs (optional — for admin / debug use)
# =====================================================================

class RetailerProductRequestItemWholesalerSerializer(
    serializers.ModelSerializer
):
    wholesaler_title = serializers.CharField(
        source="wholesaler.title",
        read_only=True,
    )

    class Meta:
        model = RetailerProductRequestItemWholesaler
        fields = [
            "id",
            "request_item",
            "wholesaler",
            "wholesaler_title",
            "notified_at",
            "seen_at",
            "is_active",
            "created",
            "updated",
        ]
        read_only_fields = fields


# =====================================================================
# Responses (optional)
# =====================================================================

class RetailerProductRequestResponseSerializer(
    serializers.ModelSerializer
):
    wholesaler_title = serializers.CharField(
        source="wholesaler.title",
        read_only=True,
    )

    class Meta:
        model = RetailerProductRequestResponse
        fields = [
            "id",
            "request",
            "wholesaler",
            "wholesaler_title",
            "note",
            "created",
            "updated",
        ]
        read_only_fields = fields