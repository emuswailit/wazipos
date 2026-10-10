# retailers/serializers.py

# ---------- Standard library ----------
from datetime import date

# ---------- Third-party ----------
from rest_framework import exceptions, serializers

# ---------- Django ----------
from django.db.models import Sum

# ---------- Local apps ----------
from authentication.models import UserImages
from authentication.serializers import (
    EntityMiniSerializer,
    EntitySerializer,
    GenericUserSerializer,
    UserImageSerializer,
)
from employees.models import Employees  # noqa: F401  (re-exported for other modules)
from payments.models import PaymentMethods
from products.models import ProductImages
from products.serializers import ProductImageSerializer
from wholesalers.models import (
    WholesalerPriceDiscounts,
    WholesalerQuantityDiscounts,
    WholesalerReceipts,
)
from wholesalers.serializers import (
    WholesalerPriceDiscountsSerializer,
    WholesalerQuantityDiscountsSerializer,
)

from . import models
from .models import RetailerIndent


# ===========================================================================
# Helpers
# ===========================================================================

def numOfDays(date1, date2):
    """Signed day difference between two `datetime.date` values."""
    if isinstance(date1, date) and isinstance(date2, date):
        return (date2 - date1).days
    return 0


# ===========================================================================
# Reviews
# ===========================================================================

class ReviewsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailerReviews
        fields = (
            "id", "url", "variation", "rating", "comment",
            "created", "updated", "owner",
        )
        read_only_fields = ("id", "url", "created", "updated", "owner")

    def create(self, validated_data):
        user = self.context.get("user")
        variation = validated_data.get("variation")

        if variation and models.RetailerReviews.objects.filter(
            variation=variation, owner=user
        ).exists():
            raise exceptions.ValidationError(
                f"Review for {variation} by {user} already exists"
            )

        if not validated_data.get("rating"):
            raise exceptions.ValidationError("Please select a rating")

        review = models.RetailerReviews.objects.create(**validated_data)

        reviews = variation.reviews_set.all()
        variation.num_reviews = reviews.count()
        variation.rating = (
            sum(r.rating for r in reviews) / variation.num_reviews
            if variation.num_reviews else 0
        )
        variation.save()

        return review

    def update(self, instance, validated_data):
        instance.comment = validated_data.get("comment", instance.comment)
        instance.rating = validated_data.get("rating", instance.rating)
        instance.save()

        reviews = instance.variation.reviews_set.all()
        instance.variation.num_reviews = reviews.count()
        instance.variation.rating = (
            sum(r.rating for r in reviews) / instance.variation.num_reviews
            if instance.variation.num_reviews else 0
        )
        instance.variation.save()

        return instance


# ===========================================================================
# Shipping
# ===========================================================================

class ShippingAddressSerializer(serializers.ModelSerializer):
    county_title = serializers.SerializerMethodField(read_only=True)
    country_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.ShippingAddress
        fields = (
            "id", "entity",
            "contact_person_name", "contact_person_phone",
            "estate", "road", "city",
            "county", "county_title",
            "country", "country_title",
            "created", "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity")

    def get_county_title(self, obj):
        return obj.county.title if obj.county else ""

    def get_country_title(self, obj):
        return obj.country.title if obj.country else ""


# ===========================================================================
# Wholesaler receipts / display
# ===========================================================================

class WholesaleReceiptsSerializer(serializers.ModelSerializer):
    class Meta:
        model = WholesalerReceipts
        fields = "__all__"
        read_only_fields = ("owner", "created", "updated", "entity")


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
            "id", "entity", "entity_title",
            "product", "product_title",
            "preparation", "preparation_title",
            "units_per_pack",
            "current_unit_quantity",
            "unit_selling_price", "final_unit_selling_price",
            "images",
            "wholesaler_price_discount", "wholesaler_quantity_discounts",
        )
        read_only_fields = ("owner", "created", "updated", "entity")

    def get_product_title(self, obj):
        return obj.product.title

    def get_units_per_pack(self, obj):
        return obj.product.units_per_pack

    def get_preparation(self, obj):
        return obj.product.preparation.id if obj.product.preparation else ""

    def get_preparation_title(self, obj):
        return obj.product.preparation.title if obj.product.preparation else ""

    def get_entity_title(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_images(self, obj):
        if not obj.product:
            return []
        images = ProductImages.objects.filter(product_id=obj.product.id)
        return ProductImageSerializer(
            images, context=self.context, many=True
        ).data

    def get_wholesaler_price_discount(self, obj):
        discount = (
            WholesalerPriceDiscounts.objects
            .filter(wholesaler_receipt=obj, is_active="true")
            .first()
        )
        if not discount:
            return None
        return WholesalerPriceDiscountsSerializer(
            discount, context=self.context, many=False
        ).data

    def get_wholesaler_quantity_discounts(self, obj):
        discounts = WholesalerQuantityDiscounts.objects.filter(
            wholesaler_receipt=obj, is_active="true"
        )
        return WholesalerQuantityDiscountsSerializer(
            discounts, context=self.context, many=True
        ).data


# ===========================================================================
# Order estimates
# ===========================================================================

class OrderEstimateSerializer(serializers.ModelSerializer):
    images = serializers.SerializerMethodField(read_only=True)
    offers = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.OrderEstimate
        fields = (
            "entity", "product", "product_title",
            "required_estimate", "current_quantity", "average_sold_daily",
            "retailer_indent", "offers", "images",
        )
        read_only_fields = ("owner", "created", "updated", "entity")

    def get_product_title(self, obj):
        return obj.product.title

    def get_images(self, obj):
        if not obj.product:
            return []
        images = ProductImages.objects.filter(product_id=obj.product.id)
        return ProductImageSerializer(
            images, context=self.context, many=True
        ).data

    def get_offers(self, obj):
        if not obj.product:
            return []
        offers = WholesalerReceipts.objects.filter(product_id=obj.product.id)
        return WholesalerReceiptsDisplaySerializer(
            offers, context=self.context, many=True
        ).data


# ===========================================================================
# Customer orders / items / payments
# ===========================================================================

class CustomerOrderItemsSerializer(serializers.ModelSerializer):
    receipt_details = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)

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
            "id", "title",
            "customer_order", "retailer_receipt",
            "purchased_quantity", "discount_quantity", "total_quantity",
            "unit_of_issue", "quantity",

            "item_price", "item_price_total",
            "item_tax", "item_tax_total",
            "item_price_discount", "item_price_discount_total",
            "item_net_price", "item_net_price_total",
            "item_counter_price_discount",
            "item_counter_price_discount_amount",
            "item_counter_price_discount_amount_total",

            "is_placement", "wholesaler_base_unit_price",
            "wholesaler_total", "retailer_margin_total",

            "receipt_details",
            "created", "updated", "images",
        )
        read_only_fields = (
            "id", "created", "updated",
            "item_price_total", "item_tax_total",
            "item_price_discount_total", "item_net_price_total",
            "item_counter_price_discount_amount_total",
            "is_placement", "wholesaler_base_unit_price",
            "wholesaler_total", "retailer_margin_total",
        )

    def get_title(self, obj):
        if obj.retailer_receipt and obj.retailer_receipt.product:
            return obj.retailer_receipt.product.title
        return ""

    def get_images(self, obj):
        if not obj.retailer_receipt or not obj.retailer_receipt.product:
            return None
        images = ProductImages.objects.filter(
            product=obj.retailer_receipt.product
        )
        if not images.exists():
            return None
        return ProductImageSerializer(
            images, context=self.context, many=True
        ).data

    def get_receipt_details(self, obj):
        if not obj.retailer_receipt:
            return None
        return RetailerReceiptsSerializer(
            obj.retailer_receipt, context=self.context, many=False
        ).data


class DuplicateCustomerOrderItemsSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    item_price_discount_total = serializers.SerializerMethodField(read_only=True)
    discount_quantity = serializers.SerializerMethodField(read_only=True)
    customer_order_number = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.CustomerOrderItems
        fields = (
            "id", "title", "customer_order", "customer_order_number",
            "retailer_receipt",
            "purchased_quantity", "discount_quantity", "total_quantity",
            "unit_of_issue", "quantity",
            "item_price", "item_price_total",
            "item_tax", "item_tax_total",
            "item_price_discount", "item_price_discount_total",
            "item_net_price", "item_net_price_total",
            "item_counter_price_discount",
            "item_counter_price_discount_amount",
            "item_counter_price_discount_amount_total",
            "created", "updated", "images",
        )
        read_only_fields = ("id", "created", "updated")

    def get_item_price_discount_total(self, obj):
        return obj.item_price_discount_total or "0.00"

    def get_discount_quantity(self, obj):
        return obj.discount_quantity or "0"

    def get_title(self, obj):
        return obj.retailer_receipt.product.title

    def get_images(self, obj):
        if not obj.retailer_receipt or not obj.retailer_receipt.product:
            return []
        images = ProductImages.objects.filter(
            product=obj.retailer_receipt.product
        )
        return ProductImageSerializer(
            images, context=self.context, many=True
        ).data

    def get_customer_order_number(self, obj):
        return obj.customer_order.order_number.document_number


class MiniCustomerOrdersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.CustomerOrders
        fields = "__all__"
        read_only_fields = ("id", "created", "updated", "owner")


class CustomerOrdersSerializer(serializers.ModelSerializer):
    entity_title = serializers.SerializerMethodField(read_only=True)
    is_paid = serializers.CharField(read_only=True)
    is_delivered_string = serializers.SerializerMethodField(read_only=True)
    is_packed_string = serializers.SerializerMethodField(read_only=True)

    order_items = serializers.SerializerMethodField(read_only=True)
    shipping_address = serializers.SerializerMethodField(read_only=True)

    psp_reference_number = serializers.SerializerMethodField(read_only=True)
    provider_reference_number = serializers.SerializerMethodField(read_only=True)
    payment_status = serializers.SerializerMethodField(read_only=True)
    payment_description = serializers.SerializerMethodField(read_only=True)
    payment_summary = serializers.SerializerMethodField(read_only=True)
    payments = serializers.SerializerMethodField(read_only=True)

    selected_payment_method_title = serializers.SerializerMethodField(read_only=True)
    vendor = serializers.SerializerMethodField(read_only=True)
    user = serializers.SerializerMethodField(read_only=True)
    phone = serializers.SerializerMethodField(read_only=True)
    email = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)

    bodaboda_title = serializers.SerializerMethodField(read_only=True)
    bodaboda_farness = serializers.SerializerMethodField(read_only=True)
    bodaboda_latitude = serializers.SerializerMethodField(read_only=True)
    bodaboda_longitude = serializers.SerializerMethodField(read_only=True)
    origin_latitude = serializers.SerializerMethodField(read_only=True)
    origin_longitude = serializers.SerializerMethodField(read_only=True)
    destination_latitude = serializers.SerializerMethodField(read_only=True)
    destination_longitude = serializers.SerializerMethodField(read_only=True)

    order_number = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.CustomerOrders
        fields = (
            "id", "draft_id", "status", "reference_number",
            "psp_reference_number", "provider_reference_number",
            "employee", "order_number", "order_type",
            "payment_account_number",
            "order_price_discount_total", "order_net_price_total",
            "order_price_total", "order_tax_total",
            "order_origin", "shipping_cost", "is_quoted",

            "is_paid", "paid_at", "paid_total", "balance_due",
            "is_settled", "due_date",

            "is_delivered", "is_delivered_string",
            "delivered_at", "delivered_by",
            "is_packed", "is_packed_string",
            "packed_at", "packed_by",
            "is_received", "received_at", "received_by",
            "delivery_method",

            "customer", "coupon",
            "entity", "entity_title",
            "vendor", "user", "phone", "email",

            "bodaboda", "bodaboda_title", "bodaboda_farness",
            "bodaboda_latitude", "bodaboda_longitude",
            "origin_latitude", "origin_longitude",
            "destination_latitude", "destination_longitude",
            "origin_point", "destination_point",
            "farness", "city_name",

            "customer_name", "customer_phone",
            "recipient_name", "recipient_phone",

            "selected_payment_method", "selected_payment_method_title",
            "payment_status", "payment_description",
            "payment_summary", "payments",

            "order_items", "images", "shipping_address",

            "created", "updated", "owner",
        )
        read_only_fields = (
            "id", "created", "updated", "owner", "entity",

            "order_price_total", "order_tax_total",
            "order_price_discount_total", "order_net_price_total",

            "is_paid", "paid_at", "paid_total",
            "balance_due", "is_settled",

            "is_delivered", "delivered_at",

            "entity_title", "is_delivered_string", "is_packed_string",
            "order_items", "shipping_address",
            "psp_reference_number", "provider_reference_number",
            "payment_status", "payment_description",
            "payment_summary", "payments",
            "selected_payment_method_title",
            "vendor", "user", "phone", "email", "images",
            "bodaboda_title", "bodaboda_farness",
            "bodaboda_latitude", "bodaboda_longitude",
            "origin_latitude", "origin_longitude",
            "destination_latitude", "destination_longitude",
            "order_number",
        )

    # ------------------------------------------------------------------
    # Payment helpers
    # ------------------------------------------------------------------

    def _any_payment(self, obj):
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
        statuses = set(
            models.CustomerOrderPayment.objects
            .filter(customer_order=obj)
            .values_list("status", flat=True)
        )
        if "SUCCESS" in statuses:
            return "SUCCESS"
        if "PENDING" in statuses:
            return "PENDING"
        if "FAILED" in statuses:
            return "FAILED"
        return "UNAVAILABLE"

    def get_payment_summary(self, obj):
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
                customer_order=obj
            ).count(),
        }

    def get_payments(self, obj):
        payments = (
            models.CustomerOrderPayment.objects
            .filter(customer_order=obj)
            .select_related("payment_method")
            .order_by("created")
        )
        return CustomerOrderPaymentsSerializer(
            payments, context=self.context, many=True
        ).data

    # ------------------------------------------------------------------
    # Nested items / address
    # ------------------------------------------------------------------

    def get_order_items(self, obj):
        items = obj.parent_order.all()
        return CustomerOrderItemsSerializer(
            items, context=self.context, many=True
        ).data

    def get_shipping_address(self, obj):
        address = models.ShippingAddress.objects.filter(
            customer_order_id=obj.id
        ).first()
        if not address:
            return None
        return ShippingAddressSerializer(
            address, context=self.context, many=False
        ).data

    # ------------------------------------------------------------------
    # Titles / display
    # ------------------------------------------------------------------

    def get_entity_title(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_vendor(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_is_delivered_string(self, obj):
        return "Yes" if obj.is_delivered == "true" else "No"

    def get_is_packed_string(self, obj):
        return "Yes" if obj.is_packed == "true" else "No"

    def get_order_number(self, obj):
        return obj.order_number.document_number if obj.order_number else "N/A"

    def get_selected_payment_method_title(self, obj):
        return obj.selected_payment_method.title if obj.selected_payment_method else ""

    def get_user(self, obj):
        if not obj.owner:
            return ""
        return f"{obj.owner.first_name} {obj.owner.last_name}"

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
            images, context=self.context, many=True
        ).data

    # ------------------------------------------------------------------
    # Boda / geo
    # ------------------------------------------------------------------

    def get_bodaboda_title(self, obj):
        if not obj.bodaboda:
            return ""
        return f"{obj.bodaboda.owner.first_name}, {obj.bodaboda.owner.phone}"

    def get_bodaboda_farness(self, obj):
        return f"{obj.bodaboda.farness}km" if obj.bodaboda else ""

    def get_bodaboda_latitude(self, obj):
        if obj.bodaboda and obj.bodaboda.point:
            return list(obj.bodaboda.point)[1]
        return None

    def get_bodaboda_longitude(self, obj):
        if obj.bodaboda and obj.bodaboda.point:
            return list(obj.bodaboda.point)[0]
        return None

    def get_origin_longitude(self, obj):
        return list(obj.origin_point)[0] if obj.origin_point else None

    def get_origin_latitude(self, obj):
        return list(obj.origin_point)[1] if obj.origin_point else None

    def get_destination_longitude(self, obj):
        return list(obj.destination_point)[0] if obj.destination_point else None

    def get_destination_latitude(self, obj):
        return list(obj.destination_point)[1] if obj.destination_point else None


class CustomerOrdersDetailedSerializer(serializers.ModelSerializer):
    is_paid = serializers.SerializerMethodField(read_only=True)
    shipping_address = serializers.SerializerMethodField(read_only=True)
    owner_details = serializers.SerializerMethodField(read_only=True)
    customer_details = serializers.SerializerMethodField(read_only=True)
    entity_details = serializers.SerializerMethodField(read_only=True)
    shipping_cost = serializers.SerializerMethodField(read_only=True)
    selected_payment_method_title = serializers.SerializerMethodField(read_only=True)
    vendor = serializers.SerializerMethodField()
    is_delivered_string = serializers.SerializerMethodField()
    is_packed_string = serializers.SerializerMethodField()
    user = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    class Meta:
        model = models.CustomerOrders
        fields = (
            "id", "employee", "reference_number", "payment_account_number",
            "order_origin",
            "order_price_discount_total", "order_price_total",
            "order_tax_total", "order_net_price_total",
            "shipping_cost", "shipping_address",
            "is_quoted", "is_paid", "paid_at",
            "is_delivered", "is_delivered_string", "is_packed_string",
            "delivered_at", "delivered_by",
            "is_packed", "packed_at", "packed_by",
            "is_received", "received_at", "received_by",
            "delivery_method",
            "customer", "coupon", "entity",
            "vendor", "user", "phone", "email", "due_date",
            "created", "updated", "owner",
            "customer_name", "customer_phone",
            "owner_details", "entity_details", "customer_details",
            "selected_payment_method", "selected_payment_method_title",
        )
        read_only_fields = ("id", "created", "updated", "owner", "net_amount")

    def get_shipping_cost(self, obj):
        return float(obj.shipping_cost or 0)

    def get_shipping_address(self, obj):
        address = models.ShippingAddress.objects.filter(
            customer_order_id=obj.id
        ).first()
        if not address:
            return None
        return ShippingAddressSerializer(
            address, context=self.context, many=False
        ).data

    def get_owner_details(self, obj):
        if not obj.owner:
            return None
        return GenericUserSerializer(
            obj.owner, context=self.context, many=False
        ).data

    def get_customer_details(self, obj):
        if not obj.customer:
            return None
        return GenericUserSerializer(
            obj.customer, context=self.context, many=False
        ).data

    def get_entity_details(self, obj):
        if not obj.entity:
            return None
        return EntitySerializer(
            obj.entity, context=self.context, many=False
        ).data

    def get_vendor(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_user(self, obj):
        if not obj.owner:
            return ""
        return f"{obj.owner.first_name} {obj.owner.last_name}"

    def get_phone(self, obj):
        return obj.owner.phone if obj.owner else ""

    def get_email(self, obj):
        return obj.owner.email if obj.owner else ""

    def get_selected_payment_method_title(self, obj):
        if not obj.selected_payment_method:
            return ""
        return PaymentMethods.objects.get(id=obj.selected_payment_method.id).title

    def get_is_paid(self, obj):
        return "true" if obj.is_paid == "true" else "false"

    def get_is_packed_string(self, obj):
        return "Yes" if obj.is_packed else "No"


class CustomerOrderPaymentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.CustomerOrderPayment
        fields = (
            "id", "paying_entity", "customer_order", "receiving_entity",
            "reference_number", "psp_reference_number",
            "provider_reference_number", "administrator_account",
            "amount", "is_validated", "narration", "currency", "status",
            "entity_collection_account",
            "created", "updated", "owner",
        )
        read_only_fields = ("id", "created", "updated", "owner")


class CustomerOrderSettlementSerializer(serializers.ModelSerializer):
    psp_title = serializers.SerializerMethodField()

    class Meta:
        model = models.CustomerOrderSettlement
        fields = (
            "id", "entity", "customer_order_payment", "receiving_entity",
            "reference_number", "psp_title", "amount",
            "account_from", "account_to", "created", "updated",
        )
        read_only_fields = ("id", "created", "updated")

    def get_psp_title(self, obj):
        return (
            obj.customer_order_payment.payment_services_provider.psp_title
            if obj.customer_order_payment
            and obj.customer_order_payment.payment_services_provider
            else ""
        )


# ===========================================================================
# Out of stock
# ===========================================================================

class OutOfStocksSerializer(serializers.ModelSerializer):
    product_title = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    wholesaler_offers = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.OutOfStock
        fields = (
            "id", "draft_id", "entity", "product",
            "unit_of_receipt",
            "product_title", "units_per_pack",
            "customer", "customer_name", "customer_phone",
            "required_quantity",
            "is_special_order", "is_ordered", "retailer_indent",
            "created", "images", "wholesaler_offers",
            "updated", "owner",
        )
        read_only_fields = ("id", "created", "updated", "owner")

    def get_product_title(self, obj):
        return obj.product.title

    def get_units_per_pack(self, obj):
        return obj.product.units_per_pack

    def get_images(self, obj):
        images = ProductImages.objects.filter(product=obj.product)
        return ProductImageSerializer(
            images, context=self.context, many=True
        ).data

    def get_wholesaler_offers(self, obj):
        if not obj.product_id:
            return []

        from django.db.models import Case, Count, IntegerField, Q, Value, When

        from wholesalers.models import WholesalerReceipts
        from wholesalers.serializers import WholesalerReceiptsSerializer

        try:
            today = date.today()

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
                        filter=active_price_discount, distinct=True,
                    ),
                    has_quantity_discount=Count(
                        "wholesaler_quantity_discount_receipt",
                        filter=active_quantity_discount, distinct=True,
                    ),
                )
                .annotate(
                    discount_rank=Case(
                        When(
                            has_price_discount__gt=0,
                            has_quantity_discount__gt=0,
                            then=Value(3),
                        ),
                        When(has_price_discount__gt=0, then=Value(2)),
                        When(has_quantity_discount__gt=0, then=Value(1)),
                        default=Value(0),
                        output_field=IntegerField(),
                    ),
                )
                .select_related(
                    "product", "product__preparation",
                    "product__manufacturer", "product__origin_country",
                    "received_from", "retailer_order_item",
                    "employee", "owner",
                )
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
            return []


# ===========================================================================
# Prediction query
# ===========================================================================

class InventoryPredictionQuerySerializer(serializers.Serializer):
    days_to_order = serializers.IntegerField(min_value=1, max_value=365)
    lead_time_days = serializers.IntegerField(
        min_value=0, max_value=90, default=0
    )
    lookback_window = serializers.IntegerField(
        default=30, min_value=7, max_value=90, required=False
    )
    max_shelf_days = serializers.IntegerField(
        default=90, min_value=15, max_value=365, required=False
    )


# ===========================================================================
# Retailer indent — items
# ===========================================================================

class RetailerIndentItemEditSerializer(serializers.ModelSerializer):
    required_quantity = serializers.IntegerField(min_value=1, max_value=100000)

    class Meta:
        model = models.RetailerIndentItem
        fields = ["required_quantity"]

    def validate_required_quantity(self, value):
        if value > 100000:
            raise serializers.ValidationError(
                "Quantity cannot exceed 100,000."
            )
        return value


class RetailerIndentItemsSerializer(serializers.ModelSerializer):
    wholesale_receipt_title = serializers.SerializerMethodField()
    wholesaler = serializers.SerializerMethodField()
    wholesaler_title = serializers.SerializerMethodField()

    manufacture_date = serializers.SerializerMethodField()
    expiry_date = serializers.SerializerMethodField()

    images = serializers.SerializerMethodField()

    wholesaler_price_discount_title = serializers.SerializerMethodField()
    wholesaler_quantity_discount_title = serializers.SerializerMethodField()

    campaign_item_details = serializers.SerializerMethodField()

    entity_title = serializers.SerializerMethodField()

    source_label = serializers.CharField(
        source="get_source_display", read_only=True,
    )

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

    bonus_quantity_earned = serializers.IntegerField(read_only=True)
    bonus_blocks_earned = serializers.IntegerField(read_only=True)
    bonus_rule_buy_quantity = serializers.IntegerField(
        read_only=True, allow_null=True,
    )
    bonus_rule_free_quantity = serializers.IntegerField(
        read_only=True, allow_null=True,
    )

    cost_per_unit = serializers.CharField(read_only=True, allow_null=True)
    sell_per_unit = serializers.CharField(read_only=True, allow_null=True)
    profit_per_unit = serializers.CharField(read_only=True, allow_null=True)
    total_profit = serializers.CharField(read_only=True, allow_null=True)
    total_revenue = serializers.CharField(read_only=True, allow_null=True)
    margin_percent = serializers.CharField(read_only=True, allow_null=True)
    pricing_source = serializers.CharField(read_only=True, allow_null=True)

    class Meta:
        model = models.RetailerIndentItem
        fields = (
            "id", "entity", "entity_title",

            "source", "source_label",

            "retailer_indent",
            "wholesale_receipt", "wholesale_receipt_title",
            "wholesaler", "wholesaler_title",

            "product_request", "product_request_offer",

            "wholesaler_price_discount", "wholesaler_price_discount_title",
            "wholesaler_quantity_discount",
            "wholesaler_quantity_discount_title",

            "campaign_item", "campaign_item_details",

            "required_quantity", "total_quantity",

            "bonus_quantity_earned", "bonus_blocks_earned",
            "bonus_rule_buy_quantity", "bonus_rule_free_quantity",

            "supplier_unit_selling_price",
            "final_supplier_unit_selling_price",
            "recommended_retail_price",
            "markup_percentage_used",

            "final_unit_price",
            "item_gross_total_amount",
            "item_net_total_amount",

            "profit_estimate",
            "cost_per_unit", "sell_per_unit", "profit_per_unit",
            "total_profit", "total_revenue", "margin_percent",
            "pricing_source",

            "lead_time_days", "lead_time_variance_days", "lead_time_source",

            "manufacture_date", "expiry_date", "images",

            "created", "updated", "owner",
        )
        read_only_fields = (
            "id", "entity", "created", "updated", "owner",

            "final_supplier_unit_selling_price",
            "markup_percentage_used",

            "bonus_quantity_earned", "bonus_blocks_earned",
            "bonus_rule_buy_quantity", "bonus_rule_free_quantity",

            "final_unit_price",
            "item_gross_total_amount",
            "item_net_total_amount",

            "profit_estimate",
            "cost_per_unit", "sell_per_unit", "profit_per_unit",
            "total_profit", "total_revenue", "margin_percent",
            "pricing_source",
        )

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
            product=obj.wholesale_receipt.product
        )
        return ProductImageSerializer(
            images, context=self.context, many=True
        ).data

    def get_wholesaler_price_discount_title(self, obj):
        return (
            obj.wholesaler_price_discount.title
            if obj.wholesaler_price_discount else ""
        )

    def get_wholesaler_quantity_discount_title(self, obj):
        return (
            obj.wholesaler_quantity_discount.title
            if obj.wholesaler_quantity_discount else ""
        )

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


# ===========================================================================
# Retailer indent — header
# ===========================================================================

class RetailerIndentSerializer(serializers.ModelSerializer):
    retailer_indent_items = serializers.SerializerMethodField()
    entity_title = serializers.SerializerMethodField()
    over_budget = serializers.BooleanField(read_only=True)
    has_items = serializers.SerializerMethodField()
    active_item_count = serializers.SerializerMethodField()

    campaign_title = serializers.SerializerMethodField(read_only=True)

    average_lead_time_days = serializers.DecimalField(
        max_digits=6, decimal_places=2, read_only=True, allow_null=True,
    )
    average_variance_days = serializers.DecimalField(
        max_digits=6, decimal_places=2, read_only=True, allow_null=True,
    )

    total_cost = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )
    total_revenue = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )
    total_profit = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )

    class Meta:
        model = RetailerIndent
        fields = (
            "id", "is_open", "indent_number",
            "entity", "entity_title",

            "campaign", "campaign_title",

            "lead_time", "order_days",
            "budget_amount", "budget_enforced", "pricing_percentage",

            "average_lead_time_days", "average_variance_days",
            "min_lead_time_days", "max_lead_time_days",
            "lead_time_updated_at",

            "total_cost", "total_revenue", "total_profit",
            "included_item_count", "excluded_item_count",
            "over_budget", "has_items", "active_item_count",

            "config_snapshot",

            "retailer_indent_items",

            "created", "updated", "owner",
        )
        read_only_fields = (
            "id", "indent_number",
            "campaign", "campaign_title",
            "average_lead_time_days", "average_variance_days",
            "min_lead_time_days", "max_lead_time_days",
            "lead_time_updated_at",
            "total_cost", "total_revenue", "total_profit",
            "included_item_count", "excluded_item_count",
            "over_budget", "has_items", "active_item_count",
            "config_snapshot", "created", "updated", "owner",
        )

    def get_entity_title(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_campaign_title(self, obj):
        campaign = getattr(obj, "campaign", None)
        return campaign.title if campaign else ""

    def get_retailer_indent_items(self, obj):
        items = obj.indent_for_item.all()
        return RetailerIndentItemsSerializer(
            items, context=self.context, many=True
        ).data

    def get_has_items(self, obj):
        return obj.indent_for_item.exists()

    def get_active_item_count(self, obj):
        return obj.indent_for_item.count()


# ===========================================================================
# Retailer receipts
# ===========================================================================

class MiniRetailerReceiptsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailerReceipts
        fields = "__all__"
        read_only_fields = (
            "id", "created", "entity",
            "unit_buying_price", "unit_price_discount", "unit_selling_price",
            "updated", "owner",
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
    category = serializers.SerializerMethodField(read_only=True)
    category_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.RetailerReceipts
        fields = (
            "id", "title",
            "entity", "entity_title",
            "product", "draft_id",
            "preparation_title", "product_title",
            "formulation_title", "long_title",
            "received_from", "unit_of_receipt", "received_from_title",
            "retailer_order", "retailer_order_item", "wholesaler_receipt",
            "batch", "bar_code",
            "manufacture_date", "expiry_date",
            "unit_buying_price", "unit_selling_price", "unit_price_discount",
            "final_unit_selling_price",
            "allocated_shipping_total", "allocated_shipping_per_unit",
            "landed_unit_buying_price",
            "current_unit_quantity", "received_unit_quantity",
            "reserved_unit_quantity", "available_unit_quantity",
            "in_placement", "is_consignment_open",
            "is_active", "is_pom",
            "supplier_invoice",
            "origin_country", "origin_country_title",
            "placement_sold_quantity",
            "placement_owed_total",
            "placement_margin_total",
            "images",
            "created", "updated", "employee", "owner",
            "days_to_expiry", "expiry_status",
            "packaging", "units_per_pack",
            "manufacturer", "manufacturer_title",
            "category", "category_title",
        )
        read_only_fields = (
            "id", "created", "updated", "entity", "owner",
            "final_unit_selling_price", "landed_unit_buying_price",
            "allocated_shipping_total", "allocated_shipping_per_unit",
            "available_unit_quantity",
            "placement_sold_quantity", "placement_owed_total",
            "placement_margin_total",
            "is_consignment_open", "received_from_title", "images",
        )

    def get_received_from_title(self, obj):
        return obj.received_from.title if obj.received_from else ""

    def get_entity_title(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_title(self, obj):
        if obj.product.preparation:
            return (
                f"{obj.product.preparation.title} - "
                f"{obj.product.title} "
                f"{obj.product.preparation.formulation.title} "
                f"{obj.product.units_per_pack}s"
            )
        return f"{obj.product.title} {obj.product.units_per_pack}s"

    def get_is_pom(self, obj):
        return bool(obj.product.preparation)

    def get_preparation_title(self, obj):
        return obj.product.preparation.title if obj.product.preparation else ""

    def get_origin_country_title(self, obj):
        return obj.product.origin_country.title if obj.product.origin_country else ""

    def get_origin_country(self, obj):
        return obj.product.origin_country.id if obj.product.origin_country else ""

    def get_product_title(self, obj):
        return obj.product.title or ""

    def get_packaging(self, obj):
        return obj.product.packaging or ""

    def get_manufacturer(self, obj):
        return obj.product.manufacturer.id if obj.product.manufacturer else ""

    def get_manufacturer_title(self, obj):
        return obj.product.manufacturer.title if obj.product.manufacturer else ""

    def get_category(self, obj):
        if obj.product and obj.product.category:
            return obj.product.category.id
        return ""

    def get_category_title(self, obj):
        if obj.product and obj.product.category:
            return obj.product.category.title
        return ""

    def get_formulation_title(self, obj):
        return (
            obj.product.preparation.formulation.title
            if obj.product.preparation else ""
        )

    def get_long_title(self, obj):
        if obj.product.preparation:
            return (
                f"{obj.product.preparation.title}-"
                f"{obj.product.preparation.formulation.title} - "
                f"{obj.product.title} {obj.product.units_per_pack}s"
            )
        return f"{obj.product.title}"

    def get_images(self, obj):
        if not obj.product:
            return None
        images = ProductImages.objects.filter(product=obj.product)
        if not images.exists():
            return None
        return ProductImageSerializer(
            images, context=self.context, many=True
        ).data

    def get_days_to_expiry(self, obj):
        if obj.expiry_date:
            return numOfDays(date.today(), obj.expiry_date)
        return None

    def get_expiry_status(self, obj):
        if not obj.expiry_date:
            return None
        expiry_days = numOfDays(date.today(), obj.expiry_date)
        if expiry_days is None:
            return None
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


# ===========================================================================
# Retailer payments / discounts / movement / shipping rates
# ===========================================================================

class RetailerPaymentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailerPayments
        fields = "__all__"
        read_only_fields = ("id", "created", "updated")


class RetailQuantityDiscountsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailQuantityDiscounts
        fields = "__all__"
        read_only_fields = ("id", "created", "updated")


class ProductMovementSerializer(serializers.ModelSerializer):
    customer_order = serializers.SerializerMethodField(read_only=True)
    owner_title = serializers.SerializerMethodField(read_only=True)
    retailer_order = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.ProductMovement
        fields = (
            "retailer_receipt", "customer_order_item", "customer_order",
            "retailer_order", "balance", "direction", "quantity",
            "transaction_date", "id", "owner_title",
            "created", "updated",
        )
        read_only_fields = ("id", "created", "updated")

    def get_owner_title(self, obj):
        if obj.owner:
            return f"{obj.owner.first_name} {obj.owner.last_name}"
        return None

    def get_customer_order(self, obj):
        if obj.customer_order_item and obj.customer_order_item.customer_order:
            return obj.customer_order_item.customer_order.id
        return None

    def get_retailer_order(self, obj):
        if obj.retailer_receipt and obj.retailer_receipt.retailer_order:
            return obj.retailer_receipt.retailer_order.id
        return None


class RetailerShippingRatesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RetailersShippingRates
        fields = "__all__"
        read_only_fields = ("id", "created", "updated")


# ===========================================================================
# Wholesaler invoices
# ===========================================================================

class WholesalerInvoicesSerializer(serializers.ModelSerializer):
    total_amount = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.WholesalerInvoices
        fields = (
            "source_entity", "invoice_number", "total_amount",
            "paid_amount", "outstanding_amount",
            "delivered_by", "received_by",
        )
        read_only_fields = ("id", "created", "owner", "updated")

    def get_total_amount(self, obj):
        total_amount = 0.00
        items = models.WholesalerInvoiceItems.objects.filter(
            wholesaler_invoice=obj
        )
        for item in items:
            total_amount += (
                float(item.purchased_unit_quantity)
                * float(item.pack_buying_price or 0)
            )
        return total_amount


class WholesalerInvoicesItemsSerializer(serializers.ModelSerializer):
    item_total_amount = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.WholesalerInvoiceItems
        fields = (
            "wholesaler_invoice", "product",
            "purchased_unit_quantity", "bonus_unit_quantity",
            "pack_buying_price", "pack_selling_price", "percent_discount",
            "manufacture_date", "expiry_date",
            "item_total_amount",
        )
        read_only_fields = ("id", "created", "owner", "updated")

    def get_item_total_amount(self, obj):
        return (
            float(obj.purchased_unit_quantity or 0)
            * float(obj.pack_buying_price or 0)
        )


# ===========================================================================
# Customer payments (legacy)
# ===========================================================================

class CustomerPaymentsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.CustomerOrderPayment
        fields = (
            "id", "customer_order", "payment_method", "owner",
            "narration", "reference_number",
            "created", "updated",
        )
        read_only_fields = ("id", "created", "updated")


# ===========================================================================
# Prescriptions
# ===========================================================================

class PrescriptionImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PrescriptionImages
        fields = (
            "id", "image", "thumbnail", "owner", "prescription",
            "entity", "created", "updated",
        )
        read_only_fields = ("prescription", "thumbnail", "owner", "entity")


class PrescriptionsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-created"]
        model = models.Prescriptions
        fields = (
            "id", "entity", "created_by", "interpreted_by",
            "is_closed", "is_dispensed",
            "origin_point", "destination_point",
            "status", "nature",
            "patient", "patient_name", "patient_gender",
            "patient_date_of_birth", "comment",
            "created", "updated",
        )
        read_only_fields = ("id", "created_by", "created", "updated")


class RetailPrescriptionsSerializer(serializers.ModelSerializer):
    images = PrescriptionImageSerializer(many=True, read_only=True)
    items = serializers.SerializerMethodField(read_only=True)
    items_count = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    entity_details = serializers.SerializerMethodField(read_only=True)
    patient_age = serializers.SerializerMethodField(read_only=True)
    key = serializers.SerializerMethodField(read_only=True)

    class Meta:
        ordering = ["-created"]
        model = models.Prescriptions
        fields = (
            "id", "entity", "entity_title", "entity_details",
            "created_by", "interpreted_by",
            "is_closed", "is_dispensed",
            "origin_point", "destination_point",
            "status", "nature",
            "images", "items", "items_count",
            "patient", "patient_name", "patient_gender",
            "patient_date_of_birth", "patient_age", "comment",
            "key", "created", "updated",
        )
        read_only_fields = ("id", "created_by", "created", "updated")
        extra_kwargs = {"images": {"required": False}}

    def get_key(self, obj):
        return obj.id

    def get_items(self, obj):
        items = models.PrescriptionItems.objects.filter(prescription=obj)
        return PrescriptionItemsSerializer(
            items, many=True, context=self.context
        ).data

    def get_items_count(self, obj):
        return models.PrescriptionItems.objects.filter(prescription=obj).count()

    def get_entity_title(self, obj):
        return obj.entity.title if obj.entity else ""

    def get_entity_details(self, obj):
        if not obj.entity:
            return None
        return EntityMiniSerializer(
            obj.entity, many=False, context=self.context
        ).data

    def get_patient_age(self, obj):
        from core.date_utils import get_age_in_years

        return get_age_in_years(f"{obj.patient_date_of_birth}")


class PrescriptionItemAdministrationsSerializer(serializers.ModelSerializer):
    key = serializers.SerializerMethodField(read_only=True)

    class Meta:
        ordering = ["-id"]
        model = models.PrescriptionItemAdministrations
        fields = (
            "id", "entity", "comment",
            "administration_date", "administration_time",
            "prescription_item", "is_administered",
            "key", "created", "updated",
        )
        read_only_fields = ("id", "entity", "created", "updated")

    def get_key(self, obj):
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
            "id", "prescription",
            "preparation", "preparation_title",
            "product", "product_title",
            "prescribed_by", "interpreted_by",
            "frequency", "frequency_title",
            "route", "route_title",
            "dose", "days", "unit_of_issue", "retailer_receipt",
            "total_cost", "retailer_receipt_price",
            "required_unit_quantity", "current_order_unit_quantity",
            "issued_unit_quantity", "balance_unit_quantity",
            "required_value", "current_order_value",
            "issued_value", "balance_value",
            "administrations", "administration_progress",
            "is_divisible", "key",
            "created_by", "created", "updated",
        )
        read_only_fields = ("id", "created_by", "created", "updated")

    def get_key(self, obj):
        return obj.id

    def _unit_price(self, obj):
        return (
            float(obj.retailer_receipt.unit_selling_price)
            if obj.retailer_receipt else 0.00
        )

    def get_retailer_receipt_price(self, obj):
        return self._unit_price(obj)

    def get_total_cost(self, obj):
        if not obj.retailer_receipt or not obj.required_unit_quantity:
            return 0.00
        return self._unit_price(obj) * float(obj.required_unit_quantity)

    def get_required_value(self, obj):
        if not obj.retailer_receipt or not obj.required_unit_quantity:
            return 0.00
        return self._unit_price(obj) * float(obj.required_unit_quantity)

    def get_issued_value(self, obj):
        if not obj.retailer_receipt or not obj.issued_unit_quantity:
            return 0.00
        return self._unit_price(obj) * float(obj.issued_unit_quantity)

    def get_balance_value(self, obj):
        if not obj.retailer_receipt or not obj.balance_unit_quantity:
            return 0.00
        return self._unit_price(obj) * float(obj.balance_unit_quantity)

    def get_current_order_value(self, obj):
        if not obj.retailer_receipt or not obj.current_order_unit_quantity:
            return 0.00
        return self._unit_price(obj) * float(obj.current_order_unit_quantity)

    def get_product_title(self, obj):
        return obj.product.title if obj.product else ""

    def get_preparation_title(self, obj):
        return obj.product.preparation.title if obj.product.preparation else ""

    def get_frequency_title(self, obj):
        return obj.frequency.title if obj.frequency else ""

    def get_route_title(self, obj):
        return obj.route.title if obj.route else ""

    def get_administrations(self, obj):
        administrations = (
            models.PrescriptionItemAdministrations.objects
            .filter(prescription_item=obj)
            .order_by("administration_date")
        )
        return PrescriptionItemAdministrationsSerializer(
            administrations, many=True, context=self.context
        ).data

    def get_administration_progress(self, obj):
        qs = models.PrescriptionItemAdministrations.objects.filter(
            prescription_item=obj
        )
        total = qs.count()
        administered = qs.filter(is_administered="true").count()
        return f"{administered}/{total}"


# ===========================================================================
# Purchases / sales returns
# ===========================================================================




class SalesReturnsSerializer(serializers.ModelSerializer):
    retailer_receipt_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.SalesReturns
        fields = (
            "id", "draft_id", "retailer_receipt", "retailer_receipt_title",
            "quantity", "customer_order", "justification", "owner",
            "created", "updated",
        )
        read_only_fields = ("id", "created", "updated")

    def get_retailer_receipt_title(self, obj):
        return obj.retailer_receipt.product.title


# ===========================================================================
# Stock adjustments
# ===========================================================================

class StockAdjustmentsSerializer(serializers.ModelSerializer):
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
            "id", "retailer_receipt", "retailer_receipt_title",
            "quantity", "direction", "direction_display", "justification",
            "return_intent", "return_intent_display",
            "linked_return", "linked_return_id", "linked_return_status",
            "owner", "created", "updated",
        )
        read_only_fields = ("id", "created", "updated")

    def get_retailer_receipt_title(self, obj):
        if obj.retailer_receipt and obj.retailer_receipt.product:
            return obj.retailer_receipt.product.title
        return None


# ===========================================================================
# Indent params / checkout payloads
# ===========================================================================

class RetailerIndentParamsSerializer(serializers.ModelSerializer):
    class Meta:
        model = RetailerIndent
        fields = [
            "order_days", "lead_time",
            "budget_amount", "budget_enforced", "pricing_percentage",
        ]


class RetailerOrderCheckoutItemSerializer(serializers.Serializer):
    wholesaler_receipt_id = serializers.IntegerField()
    purchased_quantity = serializers.IntegerField(min_value=0)


class BulkWholesaleCheckoutRequestSerializer(serializers.Serializer):
    items = RetailerOrderCheckoutItemSerializer(many=True, allow_empty=False)


class RetailerIndentItemParamsUpdateSerializer(serializers.Serializer):
    required_quantity = serializers.IntegerField(
        required=False, min_value=1, max_value=100000,
    )
    source = serializers.ChoiceField(
        choices=[
            "PREDICTION", "MANUAL", "IMPORTED",
            "USER_ADDED", "WHOLESALER_ADDED", "PRODUCT_REQUEST",
        ],
        required=False,
    )

    supplier_unit_selling_price = serializers.DecimalField(
        required=False, allow_null=True, max_digits=10, decimal_places=2,
        min_value=0,
    )
    recommended_retail_price = serializers.DecimalField(
        required=False, allow_null=True, max_digits=10, decimal_places=2,
        min_value=0,
    )
    markup_percentage_used = serializers.DecimalField(
        required=False, allow_null=True, max_digits=10, decimal_places=2,
        min_value=0,
    )

    wholesaler_price_discount = serializers.UUIDField(
        required=False, allow_null=True,
    )
    wholesaler_quantity_discount = serializers.UUIDField(
        required=False, allow_null=True,
    )
    wholesale_receipt = serializers.UUIDField(
        required=False, allow_null=True,
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                "At least one field is required."
            )
        return attrs


# ===========================================================================
# Retailer product requests — offers
# ===========================================================================

class RetailerProductRequestOfferSerializer(serializers.ModelSerializer):
    wholesaler_title = serializers.CharField(
        source="wholesaler.title", read_only=True,
    )
    wholesaler_receipt_title = serializers.CharField(
        source="wholesaler_receipt.product.title",
        read_only=True, allow_null=True,
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )

    class Meta:
        model = models.RetailerProductRequestOffer
        fields = [
            "id", "request_item", "wholesaler", "wholesaler_title",
            "wholesaler_receipt", "wholesaler_receipt_title",
            "offered_quantity", "offered_unit_price",
            "batch", "expiry_date", "manufacture_date", "is_placement",
            "status", "status_display",
            "response_note", "retailer_response_note", "retailer_confirmed_at",
            "created", "updated",
        ]
        read_only_fields = fields


class WholesalerFacingOfferSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )

    class Meta:
        model = models.RetailerProductRequestOffer
        fields = [
            "id", "request_item", "offered_quantity", "offered_unit_price",
            "batch", "expiry_date", "manufacture_date", "is_placement",
            "status", "status_display",
            "response_note", "retailer_response_note",
            "created", "updated",
        ]
        read_only_fields = fields


# ===========================================================================
# Retailer product requests — items
# ===========================================================================

class RetailerProductRequestItemSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(
        source="product.title", read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display", read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )
    offers = RetailerProductRequestOfferSerializer(many=True, read_only=True)
    target_wholesaler_ids = serializers.SerializerMethodField()
    target_wholesalers = serializers.SerializerMethodField()

    class Meta:
        model = models.RetailerProductRequestItem
        fields = [
            "id", "request", "product", "product_title",
            "requested_quantity", "urgency", "urgency_display", "note",
            "status", "status_display",
            "offer_count", "total_offered_quantity", "confirmed_quantity",
            "target_wholesaler_ids", "target_wholesalers", "offers",
            "created", "updated",
        ]
        read_only_fields = fields

    def _active_pairs(self, obj):
        cached = getattr(obj, "active_target_pairs", None)
        if cached is not None:
            return cached
        return list(
            obj.target_pairs.filter(is_active=True).select_related("wholesaler")
        )

    def get_target_wholesaler_ids(self, obj):
        return [str(p.wholesaler_id) for p in self._active_pairs(obj)]

    def get_target_wholesalers(self, obj):
        return [
            {"id": str(p.wholesaler_id), "title": p.wholesaler.title}
            for p in self._active_pairs(obj)
        ]


class RetailerProductRequestListItemSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(
        source="product.title", read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display", read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )

    class Meta:
        model = models.RetailerProductRequestItem
        fields = [
            "id", "product", "product_title",
            "requested_quantity", "urgency", "urgency_display", "note",
            "status", "status_display",
            "offer_count", "total_offered_quantity", "confirmed_quantity",
            "created",
        ]
        read_only_fields = fields


class WholesalerFacingItemSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(
        source="product.title", read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display", read_only=True,
    )
    my_offers = serializers.SerializerMethodField()

    class Meta:
        model = models.RetailerProductRequestItem
        fields = [
            "id", "product", "product_title",
            "requested_quantity", "urgency", "urgency_display", "note",
            "status", "my_offers", "created",
        ]
        read_only_fields = fields

    def get_my_offers(self, obj):
        wholesaler_id = self.context.get("wholesaler_id")
        if not wholesaler_id:
            return []
        cached = getattr(obj, "my_offers_cache", None)
        if cached is not None:
            offers = cached
        else:
            offers = obj.offers.filter(wholesaler_id=wholesaler_id)
        return WholesalerFacingOfferSerializer(
            offers, context=self.context, many=True
        ).data


# ===========================================================================
# Retailer product requests — retailer facing
# ===========================================================================

class RetailerProductRequestSerializer(serializers.ModelSerializer):
    entity_title = serializers.CharField(source="entity.title", read_only=True)
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display", read_only=True,
    )
    items = RetailerProductRequestItemSerializer(many=True, read_only=True)

    class Meta:
        model = models.RetailerProductRequest
        fields = [
            "id", "draft_id", "request_number",
            "entity", "entity_title",
            "urgency", "urgency_display", "note",
            "status", "status_display",
            "total_line_count", "fulfilled_line_count",
            "partial_line_count", "pending_line_count",
            "expires_at", "fulfilled_at", "cancelled_at",
            "created", "updated", "items",
        ]
        read_only_fields = fields


class RetailerProductRequestListSerializer(serializers.ModelSerializer):
    entity_title = serializers.CharField(source="entity.title", read_only=True)
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display", read_only=True,
    )
    items = RetailerProductRequestListItemSerializer(many=True, read_only=True)

    class Meta:
        model = models.RetailerProductRequest
        fields = [
            "id", "draft_id", "request_number",
            "entity", "entity_title",
            "urgency", "urgency_display", "note",
            "status", "status_display",
            "total_line_count", "fulfilled_line_count",
            "partial_line_count", "pending_line_count",
            "expires_at", "created", "items",
        ]
        read_only_fields = fields


# ===========================================================================
# Retailer product requests — wholesaler facing
# ===========================================================================

class WholesalerFacingListSerializer(serializers.ModelSerializer):
    entity_title = serializers.CharField(source="entity.title", read_only=True)
    status_display = serializers.CharField(
        source="get_status_display", read_only=True,
    )
    urgency_display = serializers.CharField(
        source="get_urgency_display", read_only=True,
    )
    line_count = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = models.RetailerProductRequest
        fields = [
            "id", "request_number",
            "entity", "entity_title",
            "urgency", "urgency_display", "note",
            "status", "status_display", "line_count",
            "expires_at", "created", "items",
        ]
        read_only_fields = fields

    def _get_tagged_items(self, obj):
        cached = getattr(obj, "tagged_items", None)
        if cached is None:
            import logging

            logging.getLogger(__name__).warning(
                "WholesalerFacingListSerializer called on request %s "
                "without a `tagged_items` prefetch. Returning an empty "
                "items list. Add Prefetch('items', queryset=..., "
                "to_attr='tagged_items') to the queryset.",
                getattr(obj, "id", "<unknown>"),
            )
            return []
        return list(cached)

    def get_line_count(self, obj):
        return len(self._get_tagged_items(obj))

    def get_items(self, obj):
        wholesaler_id = self.context.get("wholesaler_id")
        tagged = self._get_tagged_items(obj)
        if not tagged:
            return []
        return [
            WholesalerFacingItemSerializer(
                item, context={"wholesaler_id": wholesaler_id}
            ).data
            for item in tagged
        ]


class WholesalerFacingDetailSerializer(WholesalerFacingListSerializer):
    pass


# ===========================================================================
# Retailer product requests — targeting pairs / responses
# ===========================================================================

class RetailerProductRequestItemWholesalerSerializer(serializers.ModelSerializer):
    wholesaler_title = serializers.CharField(
        source="wholesaler.title", read_only=True,
    )

    class Meta:
        model = models.RetailerProductRequestItemWholesaler
        fields = [
            "id", "request_item", "wholesaler", "wholesaler_title",
            "notified_at", "seen_at", "is_active", "owner",
            "created", "updated",
        ]
        read_only_fields = fields


class RetailerProductRequestResponseSerializer(serializers.ModelSerializer):
    wholesaler_title = serializers.CharField(
        source="wholesaler.title", read_only=True,
    )

    class Meta:
        model = models.RetailerProductRequestResponse
        fields = [
            "id", "request", "wholesaler", "wholesaler_title",
            "note", "owner", "created", "updated",
        ]
        read_only_fields = fields