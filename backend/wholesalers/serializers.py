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



class WholesalerVariationSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField(read_only=True)
    last_year_sales = serializers.SerializerMethodField(read_only=True)
    last_month_sales = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.WholesalerVariations
        fields = (
            "id",
            "title",
            "product",
            "minimum_stock",
            "maximum_stock",
            "reorder_level",
            "lead_time",
            "safety_stock",
            "danger_stock",
            "economic_order_quantity",
            "last_year_sales",
            "last_month_sales",
            "owner",
        )
        read_only_fields = ("id", "created",
                            "updated", "owner", "entity")

    def get_title(self, obj):
        if obj.product.preparation:

            return f'{obj.product.preparation.title} - {obj.product.title}'
        else:
            return {obj.product.title}

    def get_last_year_sales(self, obj):
        a_year_ago = datetime.now() - timedelta(days=365)

        ads = 0
        if models.WholesalerReceipts.objects.filter(product=obj.product).exists():
            variation_receipts = models.WholesalerReceipts.objects.filter(
                product=obj.product).all()
            for vr in variation_receipts:
                if models.RetailerOrderItems.objects.filter(wholesaler_receipt=vr, is_issued='true', created__gte=a_year_ago).exists():
                    variation_order_items = models.RetailerOrderItems.objects.filter(
                        wholesaler_receipt=vr, is_issued='true').exists()
                    for voi in variation_order_items:
                        ads = ads + voi.total_quantity
        return ads

    def get_last_month_sales(self, obj):
        a_year_ago = datetime.now() - timedelta(days=365)

        ads = 0
        if models.WholesalerReceipts.objects.filter(product=obj.product).exists():
            variation_receipts = models.WholesalerReceipts.objects.filter(
                product=obj.product).all()
            for vr in variation_receipts:
                if models.RetailerOrderItems.objects.filter(wholesaler_receipt=vr, is_issued='true', created__gte=a_year_ago).exists():
                    variation_order_items = models.RetailerOrderItems.objects.filter(
                        wholesaler_receipt=vr, is_issued='true').exists()
                    for voi in variation_order_items:
                        ads = ads + voi.total_quantity
        return ads

def numOfDays(date1, date2):
    # check which date is greater to avoid days output in -ve number
    if isinstance(date1, date) and isinstance(date2, date):
        return (date2 - date1).days
    else:
        return 0



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

    class Meta:
        model = models.WholesalerReceipts
        fields = (
            "id", "title","unit_of_receipt", "product_title", "preparation_title", "product", "bar_code",
            "wholesaler_variation", "received_from", "wholesaler_order_item", "batch",
            "employee", "manufacture_date", "days_to_expiry", "expiry_date", 
            "unit_buying_price","unit_selling_price","final_unit_selling_price",
            "current_unit_quantity",
            "received_unit_quantity", 
           "discount_unit_selling_price", # Added missing schema exposures
            "in_placement", "description", "created", "updated", "expiry_status", 
            "received_from_details", "manufacturer", "manufacturer_title", "origin_country", 
            "packaging", "units_per_pack", "quantity_discounts","price_discount", "images", "owner",
        )
        read_only_fields = ("id", "created", "quantity_discounts", "updated", "owner", "entity")



 
    # ... (Keep all your other get_* methods exactly the same as you pasted them) ...
    def get_received_from_details(self, obj):
        if obj.received_from:
            return EntitySerializer(obj.received_from, context=self.context, many=False).data
        return None

    def get_quantity_discounts(self, obj):
        qds = models.WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=obj,)
        if qds.exists():
            return WholesalerQuantityDiscountsSerializer(qds, context=self.context, many=True).data
        return None

    def get_wholesaler_variation_details(self, obj):
        if obj.wholesaler_variation:
            return WholesalerVariationSerializer(obj.wholesaler_variation, context=self.context, many=False).data
        return None
    def get_price_discount(self, obj):
        price_discount=None
        if models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=obj).exists():
            price_discount= models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=obj).first()
            return WholesalerPriceDiscountsSerializer(price_discount, context=self.context, many=False).data
        return None

    def get_title(self, obj):
        if obj.product.preparation:
            return f'{obj.product.preparation.title} - {obj.product.title}'
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

    def get_quantity_discounts_str(self, obj):
        if obj.quantity_discounts.count() > 0:
            return ",".join([i.title for i in obj.quantity_discounts.all()])
        return ""

    def get_wholesaler_price_discount(self, obj):
        return models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=obj).first()

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
                return ProductImageSerializer(images, context=self.context, many=True).data
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
                    return f"EXPIRES IN A WEEK (IN {expiry_days} DAY(S)"
                elif 7 < expiry_days < 28:
                    return f"EXPIRES IN A MONTH (IN {expiry_days} DAY(S)"
                elif 28 < expiry_days < 56:
                    return f"EXPIRES 2 MONTHS (IN {expiry_days} DAY(S)"
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
    telco = serializers.SerializerMethodField(
        read_only=True)
    description = serializers.SerializerMethodField(
        read_only=True)
    provider_reference_number = serializers.SerializerMethodField(
        read_only=True)
    psp_reference_number = serializers.SerializerMethodField(
        read_only=True)
    document_number = serializers.SerializerMethodField(
        read_only=True)
    order_price_total = serializers.SerializerMethodField(
        read_only=True)
    order_discount_total = serializers.SerializerMethodField(
        read_only=True)
    order_tax_total = serializers.SerializerMethodField(
        read_only=True)
    order_items = serializers.SerializerMethodField(
        read_only=True)
    title = serializers.SerializerMethodField(
        read_only=True)
    wholesaler_title = serializers.SerializerMethodField(
        read_only=True)
    
    wholesaler_postal_address = serializers.SerializerMethodField(
        read_only=True)
    wholesaler_postal_code = serializers.SerializerMethodField(
        read_only=True)
    wholesaler_postal_town = serializers.SerializerMethodField(
        read_only=True)
    wholesaler_phone = serializers.SerializerMethodField(
        read_only=True)
    wholesaler_email = serializers.SerializerMethodField(
        read_only=True)
    payment_method_title = serializers.SerializerMethodField(
        read_only=True)
    retailer_title = serializers.SerializerMethodField(
        read_only=True)
    retailer_postal_address = serializers.SerializerMethodField(
        read_only=True)
    retailer_postal_code = serializers.SerializerMethodField(
        read_only=True)
    retailer_postal_town = serializers.SerializerMethodField(
        read_only=True)
    retailer_phone = serializers.SerializerMethodField(
        read_only=True)
    retailer_email = serializers.SerializerMethodField(
        read_only=True)
    owner_title = serializers.SerializerMethodField(
        read_only=True)
    is_paid = serializers.SerializerMethodField(
        read_only=True)

    class Meta:
        model = models.RetailerOrders
        fields = (
            "id",
            "wholesaler",
            "title",
            "payment_method",
            "document_number",
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
            "created",
            "order_items",
            'owner_title',
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
            "updated",
            "owner",
        )
        read_only_fields = ("id", "created",
                            "updated", "owner", "entity")

    def get_order_items(self, obj):
        order_items = []

        if models.RetailerOrderItems.objects.filter(
            retailer_order=obj
        ).exists():
            order_items = models.RetailerOrderItems.objects.filter(
                retailer_order=obj
            ).all()
        return RetailerOrderItemsSerializer(order_items, context=self.context, many=True).data


    def get_title(self, obj):
        return f'{obj.document_number} - {obj.wholesaler.title}'
    
    def get_description(self, obj):
        payment =None
        if models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").exists():
            payment=models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").first()
            return payment.description
        else:
            return "N/A"
    def get_provider_reference_number(self, obj):
        payment =None
        if models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").exists():
            payment=models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").first()
            return payment.provider_reference_number
        else:
            return "N/A"
    def get_telco(self, obj):
        payment =None
        if models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").exists():
            payment=models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").first()
            return payment.telco
        else:
            return "N/A"
    def get_psp_reference_number(self, obj):
        payment =None
        if models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").exists():
            payment=models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").first()
            return payment.psp_reference_number
        else:
            return "N/A"

    def get_owner_title(self, obj):
        return f'{obj.owner.first_name} {obj.owner.last_name} - {obj.owner.phone}'

    def get_retailer_title(self, obj):
        return obj.retailer.title
    def get_document_number(self, obj):
        if obj.document_number:
            return obj.document_number.document_number
        else:
            return "N/A"
    
    def get_retailer_postal_address(self, obj):
        return obj.retailer.postal_address
    
    def get_retailer_postal_code(self, obj):
        return obj.retailer.postal_code
    
    def get_retailer_postal_town(self, obj):
        return obj.retailer.postal_town
    def get_retailer_email(self, obj):
        return obj.retailer.email
    
    def get_retailer_phone(self, obj):
        return obj.retailer.phone
    
    def get_wholesaler_postal_address(self, obj):
        return obj.wholesaler.postal_address
    
    def get_wholesaler_postal_code(self, obj):
        return obj.wholesaler.postal_code
    
    def get_wholesaler_postal_town(self, obj):
        return obj.wholesaler.postal_town
    def get_wholesaler_email(self, obj):
        return obj.wholesaler.email
    
    def get_wholesaler_phone(self, obj):
        return obj.wholesaler.phone

    def get_wholesaler_title(self, obj):
        return obj.wholesaler.title

    def get_is_paid(self, obj):
        is_paid = "false"
        if models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").exists():
           return "true"
        return is_paid
    
    def get_payment_method_title(self, obj):
        payment_method_title = "N/A"
        payment=None
        
        if models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").exists():
           payment=models.RetailerOrderPayments.objects.filter(retailer_order=obj,status="SUCCESS").first()
           payment_method_title=payment.payment_method.title
        return payment_method_title


    def get_order_discount_total(self, obj):

        if models.RetailerOrderItems.objects.filter(retailer_order=obj).exists():
            order_discount_total = 0.00
            retailer_order_items = models.RetailerOrderItems.objects.filter(
                retailer_order=obj).all()
            for item in retailer_order_items:
                if item.item_price_discount_total:
                    order_discount_total = float(obj.order_discount_total)+float(item.item_price_discount_total)

            return order_discount_total
        else:
            return 0.0

    def get_order_tax_total(self, obj):

        if models.RetailerOrderItems.objects.filter(retailer_order=obj).exists():
            order_tax_total = 0.00
            retailer_order_items = models.RetailerOrderItems.objects.filter(
                retailer_order=obj).all()
            for item in retailer_order_items:
                if obj.order_tax_total:
                    order_tax_total = float(obj.order_tax_total)+float(item.item_tax_total)


            return order_tax_total
        else:
            return 0.0
        
    def get_order_price_total(self, obj):

        if models.RetailerOrderItems.objects.filter(retailer_order=obj).exists():
            order_price_total = 0.00
            retailer_order_items = models.RetailerOrderItems.objects.filter(
                retailer_order=obj).all()
            for item in retailer_order_items:
                
                order_price_total = order_price_total+float(item.item_price_total)

            obj.final_price_total=order_price_total
            obj.save()
            return order_price_total
        else:
            return 0.0
        

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
    # Setup standard relational read mappings
    price_discount_banners = WholesalerPriceDiscountBannersSerializer(many=True, read_only=True)

    entity_title = serializers.SerializerMethodField(read_only=True)
    wholesaler_receipt_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.WholesalerPriceDiscounts
        fields = (
            "id", 
            "entity", 
            "entity_title", 
            "wholesaler_receipt", 
            "wholesaler_receipt_title", 
            "title", 
            "percent", 
            "normal_price", 
            "offer_price", 
            "start", 
            "end", 
            "is_active", 
            "price_discount_banners", 
            "created", 
            "updated", 
            "owner",
        )
        read_only_fields = ("id", "created", "updated", "owner", "entity")
        extra_kwargs = {
            "price_discount_banners": {
                "required": False,
            }
        }

  

    def get_entity_title(self, obj):
        return obj.entity.title if obj.entity else None

    def get_wholesaler_receipt_title(self, obj):
        receipt = obj.wholesaler_receipt
        if receipt:
            # Extracts variables transparently via the model __getattr__ routing fallback
            preparation = getattr(receipt.product, 'preparation', None)
            title = getattr(receipt.product, 'title', '')
            return title
        return None

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
    quantity_discount_banners  = WholesalerQuantityDiscountBannersSerializer(many=True, read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    awarded_quantity_str = serializers.SerializerMethodField(read_only=True)
    limit_quantity_str = serializers.SerializerMethodField(read_only=True)
    limit_quantity_str = serializers.SerializerMethodField(read_only=True)
    wholesaler_receipt_title  = serializers.SerializerMethodField(
        read_only=True)


    class Meta:
        model = models.WholesalerQuantityDiscounts
        fields = (
            "id",
            "entity",
            "entity_title",
            "wholesaler_receipt",
            "quantity_discount_banners",
            "wholesaler_receipt_title",
            "title",
            "limit_quantity",
            "awarded_quantity",
            "awarded_quantity_str",
            "limit_quantity_str",
            "start",
            "end",
            "is_active",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = ("id", "created", "updated", "owner", "entity")
        extra_kwargs = {
                    "quantity_discount_banners": {
                        "required": False,
                    }
                }

    def get_awarded_quantity_str(self, obj):
        awarded_quantity_str = ""
        if obj.awarded_quantity:
            awarded_quantity_str = f"{obj.awarded_quantity}"
        return awarded_quantity_str

    def get_limit_quantity_str(self, obj):
        limit_quantity_str = ""
        if obj.limit_quantity:
            limit_quantity_str = f"{obj.limit_quantity}"
        return limit_quantity_str
    
    def get_entity_title(self,obj):
        return obj.entity.title
    
    def get_wholesaler_receipt_title(self,obj):
        return obj.wholesaler_receipt.product.title

    # def get_quantity_discount_banners(self,obj):
    #     arr=[]
    #     if models.WholesalerQuantityDiscountBanners.objects.filter(wholesaler_quantity_discount=obj).exists():
    #         arr= models.WholesalerQuantityDiscountBanners.objects.filter(wholesaler_quantity_discount=obj).all()
    #     return WholesalerQuantityDiscountBannersSerializer(arr, context=self.context, many=True).data

class RetailerOrderItemsSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField(
        read_only=True)
    product_title = serializers.SerializerMethodField(
        read_only=True)
    preparation_title = serializers.SerializerMethodField(
        read_only=True)
    units_per_pack = serializers.SerializerMethodField(
        read_only=True)
    product = serializers.SerializerMethodField(
        read_only=True)
    batch = serializers.SerializerMethodField(
        read_only=True)
    manufacture_date = serializers.SerializerMethodField(
        read_only=True)
    expiry_date = serializers.SerializerMethodField(
        read_only=True)
    unit_quantity = serializers.SerializerMethodField(
        read_only=True)
    retailer = serializers.SerializerMethodField(
        read_only=True)
    wholesaler = serializers.SerializerMethodField(
        read_only=True)
    facilitator = serializers.SerializerMethodField(
        read_only=True)
    images = serializers.SerializerMethodField(
        read_only=True)

    class Meta:
        model = models.RetailerOrderItems
        fields = (
            "id",
            "entity",
            "title",
            "units_per_pack",
            "retailer_order",
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
        read_only_fields = ("id", "created",
                            "updated", "owner", "entity")
    def get_images(self, obj):
        images = None
        if obj.wholesaler_receipt.product:
            if ProductImages.objects.filter(
                product=obj.wholesaler_receipt.product
            ).exists():
                images = ProductImages.objects.filter(
                    product=obj.wholesaler_receipt.product
                ).all()
            return ProductImageSerializer(images, context=self.context, many=True).data
        return None
    def get_title(self, obj):
        if obj.wholesaler_receipt.product.preparation:

            return f'{obj.wholesaler_receipt.product.preparation.title} - {obj.wholesaler_receipt.product.title}'
        else:
            return f"{obj.wholesaler_receipt.product.title}"

    def get_units_per_pack(self, obj):
        return obj.wholesaler_receipt.product.units_per_pack
    
    def get_product(self, obj):
        return obj.wholesaler_receipt.product.id
    
    def get_batch(self, obj):
        return obj.wholesaler_receipt.batch
    
    def get_manufacture_date(self, obj):
        return obj.wholesaler_receipt.manufacture_date
    
    def get_expiry_date(self, obj):
        return obj.wholesaler_receipt.expiry_date
    
    def get_unit_quantity(self, obj):
        return int(obj.total_quantity) * int(obj.wholesaler_receipt.product.units_per_pack)


    def get_product_title(self, obj):
        return obj.wholesaler_receipt.product.title
    
    def get_wholesaler(self, obj):
        if  obj.retailer_order.wholesaler:
            return obj.retailer_order.wholesaler.id
        else:
            return ""
    
    def get_retailer(self, obj):
        if obj.retailer_order.retailer:
            return obj.retailer_order.retailer.id
        else:
            return ""
    
    def get_facilitator(self, obj):
        if obj.retailer_order.facilitator:
            return obj.retailer_order.facilitator.id
        else:
            return ""

    def get_preparation_title(self, obj):
        if obj.wholesaler_receipt.product.preparation:
            return obj.wholesaler_receipt.product.preparation.title
        else:
            return ""


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
