import datetime
import pytz
import json
import requests
from decouple import config
from django.contrib.gis.geos import Point
from django.db.models import Q
from django.utils import timezone
from rest_framework.response import Response
from rest_framework import exceptions, status
from authentication.models import Entities, Users
from products.models import Preparation,Products
from drugs.models import Frequency,Routes,Formulations
from employees.validators import employees_models_validators 
from core.date_utils import get_formatted_from_date, get_formatted_to_date
from django.contrib.gis.geos import fromstr
from retailers.models import CustomerOrderPayment
from products.models import ProductImages
from products.serializers import ProductImageSerializer
from wholesalers.models import WholesalerReceipts
from wholesalers.validators import wholesalers_models_validators
from intergrations.jambopay.jp_mobile_money_checkout import jambopay_mobile_checkout
from intergrations.jambopay.jambopay_wallet import get_account_by_phone
from payments.validators import payments_models_validators
from intergrations.jambopay.get_jp_token import get_auth_token
from .. import models
from authentication.validators.authentication_models_validators import (
    validate_entity,
    validate_user,
)
from retailers.validators.model_validators import (
    validate_retailer_price_discount,
    validate_retailer_quantity_discount,
)
from authentication.serializers import EntityMiniSerializer
from ..validators import model_validators
from products.models import Products
from products.validators import product_models_validator
from wazi.utils import raise_custom_exception
from django.db import IntegrityError
from ..models import CustomerOrderItems, OutOfStock, RetailerIndent, RetailerIndentItem, RetailerReceipts, RetailerVariations
from wholesalers.models import RetailerOrderItems,WholesalerPriceDiscounts,WholesalerQuantityDiscounts,WholesalerQuantityDiscountBanners,WholesalerPriceDiscountBanners,RetailerOrders,RetailerOrderPayments
from wholesalers.serializers import WholesalerPriceDiscountBannersSerializer,WholesalerQuantityDiscountBannersSerializer
from django.db.models import Q
from django.db import transaction
from ..models import CustomerOrders, ShippingAddress,OrderEstimate,BodaLocations,ProductMovement
from core.utils import titlecase, generate_reference_numbers
from payments.models import PaymentMethods, EntityPSPCollectionAccount,UserAccounts
import math
from employees.models import Employees
from ..serializers import RetailerIndentItemsSerializer
# from payments.tasks import process_mpesa_collection
from payments.validators.payments_models_validators import (
    validate_payment_method_exists,
)
from utils.logging import create_log
from .process_mpesa_utils import process_mpesa
# from .task_utils import create_monitor_and_periodic_task
from .inventory_utils import update_stock
from authentication.utils.utils import generate_reference_number, use_reference_number, get_telco_by_phone_number,generate_document_number
from intergrations.jambopay.jambopay_wallet import customer_order_payment, jambopay_wallet_checkout
from django.utils.dateparse import parse_datetime
from core.date_utils import get_yesterday,get_today,get_tommorow

class Util:
    def is_product_drug(product):
        """Admin user can only create manufacturing entities"""
        if product.preparation:
            return True
        else:
            return False


def product_and_entity_share_category(user, product):
    if user.entity.category == product.category:
        pass
    else:
        raise exceptions.ValidationError("Product is not for this entity category")


def verify_order_data(data):
    errors = []
    if not "payment_method" in data:
        errors.append("Payment method is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return data

def check_order_has_items(order):
    order_items = CustomerOrderItems.objects.filter(customer_order=order)
    if order_items.count() < 1:
        order.delete()
        raise exceptions.ValidationError(
            "Order has no items. Please create a new order"
        )
    else:
        return


def check_order_item_details(item):
    if not item["purchased_quantity"]:
        raise exceptions.ValidationError("Purchased quantity is required")
    if item["purchased_quantity"] < 1:
        raise exceptions.ValidationError("Purchased quantity  cannot be less than 1")
    if not item["total_quantity"]:
        raise exceptions.ValidationError("Total quantity is required")
    if item["total_quantity"] < item["purchased_quantity"]:
        raise exceptions.ValidationError(
            "Total quantity  cannot be less than purchased quantity"
        )
    if item["net_price"] == 0:
        raise exceptions.ValidationError("Net price cannot be zero")

    if not item["retailer_receipt"]:
        raise exceptions.ValidationError("Item ID is required")
    else:
        if (
            RetailerReceipts.objects.filter(
                id=item["retailer_receipt"], current_unit_quantity__gte=0
            ).count()
            > 0
        ):
            receipt = RetailerReceipts.objects.filter(
                id=item["retailer_receipt"], current_unit_quantity__gte=0
            ).first()
            if receipt.current_unit_quantity < item["total_quantity"]:
                raise exceptions.ValidationError(
                    f"Insufficient quantity, quantity {receipt.current_unit_quantity} available"
                )
        else:
            raise exceptions.ValidationError("Item not available")

    # Price checks
    if not item["item_price"]:
        raise exceptions.ValidationError("Item price is required")

    if not item["net_price"]:
        raise exceptions.ValidationError("Net price is required")

    return


def custom_error_message(message):
    errors_messages = []
    errors_messages.append("An error occurred!")
    return Response(
        data={
            "response_code": 1,
            "response_message": f"{message}",
            "errors": errors_messages,
        },
        status=status.HTTP_200_OK,
    )


# def adjust_stock_inventory(order, payment):
#     """Adjust item stockinventory"""
#     order_items = CustomerOrderItems.objects.filter(customer_order=order)

#     # Reject transaction if order has no items
#     if len(order_items) > 1:
#         raise exceptions.ValidationError("Order has no items")
#     for order_item in order_items:
#         # Adjust unit quantity
#         order_item.retailer_receipt.current_unit_quantity = (
#             order_item.retailer_receipt.current_unit_quantity - order_item.total_quantity
#         )
#         # Adjust  pack quantity
#         order_item.retailer_receipt.pack_quantity = (
#             math.floor(
#                 order_item.retailer_receipt.current_unit_quantity - order_item.total_quantity
#             )
#             / order_item.retailer_receipt.product.unitsPerPack
#         )
#         order_item.retailer_receipt.save()
#     # Update order as paid
#     order.is_paid = True
#     order.retailer_payment = payment
#     order.save()
#     return


@transaction.atomic
def create_retailer_receipts(item, retailer_order_obj, user):
    errors = []
    try:
        receipt = RetailerReceipts.objects.create(
            product=item.wholesaler_receipt.product,
            received_from=retailer_order_obj.wholesaler,
            entity=user.entity,
            owner=user,
            retailer_order=retailer_order_obj,
            retailer_order_item=item,
            wholesaler_receipt=item.wholesaler_receipt,
            unit_buying_price=item.item_final_price or item.item_net_price,
            unit_selling_price=(
                item.intended_retail_unit_price
                or item.item_final_price
                or item.item_net_price
            ),
            received_unit_quantity=item.total_quantity,
            current_unit_quantity=item.total_quantity,
            units_per_pack=item.wholesaler_receipt.product.units_per_pack,
            unit_of_receipt=item.unit_of_issue or "Pack",
            batch=item.wholesaler_receipt.batch,
            manufacture_date=item.wholesaler_receipt.manufacture_date,
            expiry_date=item.wholesaler_receipt.expiry_date,
            in_placement=False,
        )

        if item.is_received != "true":
            item.is_received = "true"
            item.save(update_fields=["is_received", "updated"])

        return receipt
    except IntegrityError as e:
        errors.append(str(e))
        raise_custom_exception(errors)
def confirm_item_in_retailer_order(receipt, retailer_order_obj):
    retailer_order_item_obj = None
    errors = []

    # if not receipt['product']:
    #     errors.append("Product ID is required")

    if not receipt["retailer_order_item"]:
        errors.append("Order item ID is required")
    else:
        if RetailerOrderItems.objects.filter(
            id=receipt["retailer_order_item"]
        ).exists():
            retailer_order_item_obj = RetailerOrderItems.objects.filter(
                id=receipt["retailer_order_item"]
            ).first()
            if retailer_order_item_obj.retailer_order != retailer_order_obj:
                errors.append(
                    f"{retailer_order_item_obj} : This item is not in the selected order"
                )
            else:
                print("Iko sawa", retailer_order_item_obj)

        else:
            errors.append("No item was found in the order for the entered ID")
    if not receipt["unit_selling_price"]:
        errors.append("Pack selling price is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return

        # new start


def get_retailer_receipts_for_entity(data, user):
    retailer_receipts = None
    entity = None
    entity_id = None
    if "entity" in data:
        entity_id = data["entity"]
    if entity_id:
        entity = validate_entity(entity_id)

    if entity:
        if RetailerReceipts.objects.filter(
            entity=entity,
        ).exists():
            return RetailerReceipts.objects.filter(
                entity=entity,
            ).all()

        else:
            raise exceptions.ValidationError(
                "No items were retrived for the selected entity"
            )
def get_products( customerOrderItem):
        
        return customerOrderItem.retailer_receipt.product

def get_products_from_os( outOfStocks):
        return outOfStocks.product

def get_wholesale_offers_for_product(product):
    wholesaler_offerings = []

    receipts = (
        WholesalerReceipts.objects
        .filter(product=product, current_unit_quantity__gte=0)
        .order_by("-unit_selling_price")[:3]
    )

    for receipt in receipts:
        price_discount = {}
        quantity_discount = {}
        price_discount_banners = []
        quantity_discount_banners = []

        wpd = WholesalerPriceDiscounts.objects.filter(
            wholesaler_receipt=receipt, is_active="true",
        ).first()
        if wpd:
            for banner in WholesalerPriceDiscountBanners.objects.filter(
                wholesaler_price_discount=wpd,
            ):
                price_discount_banners.append(
                    {"banner": banner.price_discount_banner.url}
                )
            price_discount = {
                "id": wpd.id,
                "title": wpd.title,
                "percent": wpd.percent,
                "normal_price": wpd.normal_price,
                "offer_price": wpd.offer_price,
                "is_active": wpd.is_active,
                "start": wpd.start,
                "end": wpd.end,
                "banners": price_discount_banners,
            }

        wqd = WholesalerQuantityDiscounts.objects.filter(
            wholesaler_receipt=receipt, is_active="true",
        ).first()
        if wqd:
            for banner in WholesalerQuantityDiscountBanners.objects.filter(
                wholesaler_quantity_discount=wqd,
            ):
                quantity_discount_banners.append(
                    {"banner": banner.quantity_discount_banner.url}
                )
            quantity_discount = {
                "id": wqd.id,
                "title": wqd.title,
                "limit_quantity": wqd.limit_quantity,
                "awarded_quantity": wqd.awarded_quantity,
                "is_active": wqd.is_active,
                "start": wqd.start,
                "end": wqd.end,
                "banners": quantity_discount_banners,
            }

        wholesaler_offerings.append({
            "wholesale_inventory_id": receipt.id,
            "wholesale_id": (
                receipt.received_from.id if receipt.received_from else None
            ),
            "wholesale_title": (
                receipt.received_from.title if receipt.received_from else ""
            ),
            "current_unit_quantity": receipt.current_unit_quantity,
            "unit_selling_price": receipt.unit_selling_price,
            "final_unit_selling_price": receipt.final_unit_selling_price,
            "recommended_retail_price": receipt.recommended_retail_price,
            "price_discount": price_discount,
            "quantity_discount": quantity_discount,
            "manufacture_date": receipt.manufacture_date,
            "expiry_date": receipt.expiry_date,
        })

    return wholesaler_offerings

def get_unique_products(item):
    return item.product


def get_current_balance(product):
    total = (
        RetailerReceipts.objects
        .filter(product=product, current_unit_quantity__gte=0)
        .aggregate(total=Sum("current_unit_quantity"))["total"]
    ) or 0
    return total


def generate_order_estimates(data,user, request):
    all =[]
    retailer_indent=None
    lead_time=None
    order_days=None

    products=None

    if "order_days" in data and not data['order_days']==None:
        order_days = int(data['order_days'])
    else:
        raise exceptions.ValidationError("order days is required")
    
    if "lead_time_days" in data and not data['lead_time_days']==None:
        lead_time = int(data['lead_time_days'])
    else:
        raise exceptions.ValidationError("Lead time days is required")

    total_order_days = order_days+ lead_time

    # Retrieve or create retail indent

    if RetailerIndent.objects.filter(entity=user.entity,is_open="true",owner=user).exists():
        retailer_indent =  RetailerIndent.objects.filter(entity=user.entity,is_open="true",owner=user).first()
        retailer_indent.lead_time=lead_time
        retailer_indent.order_days=total_order_days
        retailer_indent.save()
    else:
        indent_number = generate_document_number(user.entity,user,"INDENT")
        retailer_indent= RetailerIndent.objects.create(indent_number=indent_number,entity=user.entity,is_open="true",order_days=total_order_days,owner=user,lead_time=lead_time)
  


    # order_days=data['order_days']
    customer_order_items=[]
    out_of_sock_items=[]
    todays_date=datetime.datetime.today()
    days_ago =  todays_date - datetime.timedelta(days=int(data["order_days"]))
    print("days a go", days_ago)
    order_estimates = []
    total_sold =0
   
    products_from_sales=[]
    final =[]
    products_from_os = []


    total_out_of_stock=0


    if OutOfStock.objects.filter(entity=user.entity, created__gte=days_ago).exists():
        out_of_stocks = OutOfStock.objects.filter(entity=user.entity, created__gte=days_ago)
        print(" os",out_of_stocks)
        products_from_os = list(set(map(get_products_from_os, out_of_stocks)))
        print("PRODS FROM OS", products_from_os)
    else:
        print("No os")

    if CustomerOrderItems.objects.filter(entity=user.entity, created__gte=days_ago,created__lte=todays_date).exists():
        customer_order_items = CustomerOrderItems.objects.filter(entity=user.entity, created__gte=days_ago,created__lte=todays_date)
       
        products_from_sales = list(set(map(get_products, customer_order_items)))
        print("filtered1", products_from_sales)

    products=list(set(products_from_os+products_from_sales))
    print("Total products", products)



    if not products==None and len(products)>0:
        print("PRODS ZIKO", products)
        add_to_order= True
        required_estimate=0
        for prod in products:
            quantity = 0
            average_sold=0
            add_to_order_str =""
            images =[]
            quantity_estimate=0
            current_balance = get_current_balance(prod)
            print("current balance", current_balance)
            
            
            for coi in customer_order_items:
                if coi.retailer_receipt.product==prod:
                    quantity+=coi.purchased_quantity
            print("quantity SOLD", quantity)
            average_sold=round(quantity/order_days,2)
            print("average sold", average_sold)

            quantity_estimate = int(average_sold* total_order_days)
            print("quantity estimate", quantity_estimate)

            # Required from sales

            if quantity_estimate < current_balance:
                # No need to order
                quantity_estimate = 0
                print("No need to order")
            else:
                quantity_estimate = quantity_estimate - current_balance
                print("quantity estimate after current balance", quantity_estimate)
   


            all =OrderEstimate.objects.all()


    
            if OrderEstimate.objects.filter(product=prod,is_ordered="false").exists():
                order_estimate = OrderEstimate.objects.filter(product=prod,is_ordered="false").first()
            
                
                order_estimate.sold_quantity=quantity
                order_estimate.current_quantity = current_balance
                order_estimate.required_estimate =quantity_estimate
                order_estimate.average_sold_daily = average_sold
                order_estimate.retailer_indent=retailer_indent
                order_estimate.save()


            else:
                OrderEstimate.objects.create(
                    entity=user.entity,
                    product=prod, 
                    retailer_indent= retailer_indent,
                    sold_quantity=quantity,
                    average_sold_daily=average_sold,
                    required_estimate=quantity_estimate,
                    current_quantity=get_current_balance(prod),
                    is_ordered="false",
                    owner=user
                    
                    )
                    

               # Required fro out of stock items
            out_of_sock_items = OutOfStock.objects.filter(entity=user.entity, product= prod, is_ordered="false", created__gte=days_ago)

            product_os_quantity_collated = 0

            for os in out_of_sock_items:
                product_os_quantity_collated += os.required_quantity

            if product_os_quantity_collated < get_current_balance(prod):
                # No need to order
                product_os_quantity_collated = 0
            else:
                product_os_quantity_collated = product_os_quantity_collated - get_current_balance(prod)

            if OrderEstimate.objects.filter(product=prod,is_ordered="false",retailer_indent=retailer_indent).exists():
                order_estimate = OrderEstimate.objects.filter(product=prod,is_ordered="false",retailer_indent=retailer_indent).first()
                order_estimate.current_quantity = get_current_balance(prod)
                order_estimate.required_estimate =order_estimate.required_estimate+product_os_quantity_collated
                order_estimate.save()

            else:
                created= OrderEstimate.objects.create(
                    entity=user.entity,
                    product=os.product, 
                    retailer_indent= retailer_indent,
                    current_quantity=get_current_balance(prod),
                    required_estimate=product_os_quantity_collated,
                    is_ordered="false",
                    owner=user
                    
                    )
      
                
            # zeros = OrderEstimate.objects.filter(required_estimate__lt=1,retailer_indent=retailer_indent).all()
            # for zero in zeros:
            #     zero.delete()

            unindenteds = OrderEstimate.objects.filter(retailer_indent=None).all()
            for unindented in unindenteds:
                unindented.delete()

            all =OrderEstimate.objects.filter(retailer_indent=retailer_indent).all()

            for order_estimate in all:
                to_update = None
                if RetailerIndentItem.objects.filter(retailer_indent=retailer_indent,wholesale_receipt__product=order_estimate.product).exists():
                    to_update = RetailerIndentItem.objects.filter(retailer_indent=retailer_indent,wholesale_receipt__product=order_estimate.product).first()
                    to_update.required_quantity = order_estimate.required_estimate
                    to_update.save()




            return all
    else:
     
        return []

def retrieve_product_wholesale_offers(data,user):
    product = None
    errors =[]
    
    if not "product" in data or data["product"]=="":
        errors.append("Product ID is required")
        return errors, None
    else:
        product = product_models_validator.validate_product(data["product"])
        
    if WholesalerReceipts.objects.filter(product=product,pack_quantity__gte=1).exists():
        return [], WholesalerReceipts.objects.filter(product=product,pack_quantity__gte=1).all()
    else:
        return errors,[]



def get_retailer_receipts(user):
    retailer_receipts = []
    cheap_roles_array = []
    user_roles = user.roles.all()
    ### Updates
    if RetailerReceipts.objects.filter( Q(current_unit_quantity__gte=1) ,entity=user.entity):
        retailer_receipts = RetailerReceipts.objects.filter( Q(current_unit_quantity__gte=1),entity=user.entity).order_by("expiry_date")

    # for role in user_roles:
    #     cheap_roles_array.append(role.value)

    # if "RETAIL_SUPER_ADMIN" in cheap_roles_array:
    #     retailer_receipts = RetailerReceipts.objects.filter(
    #         entity=user.entity,
    #     )
    # elif "WHOLESALE_SUPER_ADMIN" in cheap_roles_array:
    #     retailer_receipts = RetailerReceipts.objects.filter(wholesaler=user.entity)

    return retailer_receipts


def get_product_movement(data, user):
    if not data.get("product"):
        raise exceptions.ValidationError("Product ID is required")

    product = product_models_validator.validate_product(data["product"])
    from_date = get_formatted_from_date(data)
    to_date = get_formatted_to_date(data)

    receipts_in_range = RetailerReceipts.objects.filter(
        product=product, entity=user.entity,
        created__gte=from_date, created__lte=to_date,
    )
    items_in_range = CustomerOrderItems.objects.filter(
        retailer_receipt__product=product, entity=user.entity,
        created__gte=from_date, created__lte=to_date,
    )

    ProductMovement.objects.filter(
        product=product, entity=user.entity, owner=user,
    ).delete()

    for receipt in receipts_in_range:
        ProductMovement.objects.create(
            product=product,
            transaction_date=receipt.created,
            quantity=receipt.current_unit_quantity,
            direction="RECEIPT",
            retailer_receipt=receipt,
            customer_order_item=None,
            owner=receipt.owner,
            entity=user.entity,
        )

    for item in items_in_range:
        ProductMovement.objects.create(
            product=product,
            transaction_date=item.created,
            quantity=item.total_quantity,
            direction="ISSUE",
            retailer_receipt=None,
            customer_order_item=item,
            owner=item.owner,
            entity=user.entity,
        )

    movements = ProductMovement.objects.filter(
        product=product, entity=user.entity, owner=user,
    ).order_by("transaction_date")

    total_receipts = Decimal("0.00")
    total_issues = Decimal("0.00")
    for pm in movements:
        if pm.direction == "RECEIPT":
            total_receipts += Decimal(str(pm.quantity))
        else:
            total_issues += Decimal(str(pm.quantity))
        pm.balance = total_receipts - total_issues
        pm.save(update_fields=["balance"])

    return movements.order_by("-transaction_date")


def get_retailer_receipts_by_catgory(data, user):
    entity_id = None
    entity = None

    retailer_receipts = []
    try:
        entity_id = data["entity"]
        if entity_id == "":
            raise exceptions.ValidationError("Entity ID is should be a valid UUID")
        else:
            entity = validate_entity(entity_id)
    except KeyError:
        raise exceptions.ValidationError("Entity ID is required")

    try:
        category = data["category"]
        if category == "":
            raise exceptions.ValidationError("Category ID is should be a valid UUID")
        else:
            retailer_receipts = RetailerReceipts.objects.filter(
                entity=entity, product__category_id=category
            )
    except KeyError:
        raise exceptions.ValidationError("Category ID is required")

    return retailer_receipts


def get_retailer_receipt_details(data, user):
    try:
        retailer_receipt_id = data["retailer_receipt"]
        if RetailerReceipts.objects.filter(id=retailer_receipt_id).exists():
            retailer_receipt = RetailerReceipts.objects.get(id=retailer_receipt_id)

            return retailer_receipt

    except KeyError:
        raise exceptions.ValidationError("Retailer receipt ID is required")


def search_receipts(data, user):
    # TODO: reference search with Q
    search_param = None
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError("Search parameter cannot be empty")
        else:
            if RetailerReceipts.objects.filter(
                Q(product__title__icontains=search_param)
                | Q(product__manufacturer__title__icontains=search_param)
                | Q(product__preparation__title__icontains=search_param),
                entity=user.entity,
            ).exists():
                retailer_receipts = (
                    RetailerReceipts.objects.filter(
                        Q(product__title__icontains=search_param)
                        | Q(product__manufacturer__title__icontains=search_param)
                        | Q(product__preparation__title__icontains=search_param),
                        entity=user.entity,
                    )
                    .all()
                    .order_by("expiry_date")
                )

                return retailer_receipts
            else:
                return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")

def search_receipts_by_customer(data, user):
    # TODO: reference search with Q
    search_param = None
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError("Search parameter cannot be empty")
        else:
            if RetailerReceipts.objects.filter(
                Q(product__title__icontains=search_param)
                | Q(product__manufacturer__title__icontains=search_param)
                | Q(product__preparation__title__icontains=search_param),current_unit_quantity__gte=1
            
            ).exists():
                retailer_receipts = (
                    RetailerReceipts.objects.filter(
                        Q(product__title__icontains=search_param)
                        | Q(product__manufacturer__title__icontains=search_param)
                        | Q(product__preparation__title__icontains=search_param),current_unit_quantity__gte=1
                       
                    )
                    .all()
                    .order_by("unit_selling_price")[:4]
                )

                return retailer_receipts
            else:
                return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")

def validate_retailer_receipt_data(data, user):
    errors = []
    product = None
    received_from_obj = None

    employee = Employees.objects.filter(
        user=user, entity=user.entity, is_active="true",
    ).first()
    if not employee:
        return custom_error_message(
            f"You are not an active employee at "
            f"{titlecase(user.entity.title)}"
        )

    details = data.get("retailer_receipt_details", {})

    received_unit_quantity = details.get("received_unit_quantity")
    if received_unit_quantity in (None, "", 0, "0"):
        errors.append("Received unit quantity is required")
    else:
        try:
            if int(received_unit_quantity) < 1:
                errors.append("Unit quantity must be at least 1")
        except (TypeError, ValueError):
            errors.append("Unit quantity must be an integer")

    product_id = details.get("product")
    if not product_id:
        errors.append("Product ID is required")
    else:
        product = Products.objects.filter(id=product_id).first()
        if not product:
            raise exceptions.ValidationError(
                "Product with supplied ID does not exist"
            )

    if product and product.preparation:
        if not details.get("manufacture_date"):
            errors.append("Manufacture date is required")
        if not details.get("expiry_date"):
            errors.append("Expiry date is required")

    draft_id = details.get("draft_id")
    if draft_id:
        existing = RetailerReceipts.objects.filter(
            draft_id=draft_id, entity=user.entity,
        ).first()
        if existing:
            return [], existing

    unit_selling_price = details.get("unit_selling_price")
    if unit_selling_price in (None, ""):
        errors.append("Unit selling price is required")

    received_from_id = details.get("received_from")
    if received_from_id:
        received_from_obj = validate_entity(received_from_id)

    if errors:
        raise exceptions.ValidationError(errors)


@transaction.atomic
def create_retailer_receipt_directly(data, user):
    errors = []
    details = data.get("retailer_receipt_details", {})

    draft_id = details.get("draft_id")
    if draft_id:
        existing = RetailerReceipts.objects.filter(draft_id=draft_id).first()
        if existing:
            return [], existing

    employee = Employees.objects.filter(
        user=user, entity=user.entity, is_active="true",
    ).first()
    if not employee:
        errors.append(
            f"You are not an active employee at "
            f"{titlecase(user.entity.title)}"
        )
        return errors, None

    manufacture_date = details.get("manufacture_date") or None
    expiry_date = details.get("expiry_date") or None

    received_from = None
    received_from_id = details.get("received_from")
    if received_from_id:
        received_from = validate_entity(received_from_id)

    retailer_order_item = None
    roi_id = details.get("retailer_order_item")
    if roi_id:
        retailer_order_item = RetailerOrderItems.objects.filter(
            id=roi_id,
        ).first()
        if retailer_order_item:
            if retailer_order_item.is_received == "true":
                errors.append("Item is already received into inventory")
                return errors, None
            if retailer_order_item.retailer_order.status != "RECEIVED":
                errors.append(
                    "Order status for this item is not yet set to RECEIVED"
                )
                return errors, None

    received_unit_quantity = _to_int(
        details.get("received_unit_quantity")
    )
    unit_selling_price = _to_decimal(details.get("unit_selling_price"))
    unit_price_discount = _to_decimal(details.get("unit_price_discount"))
    unit_buying_price = _to_decimal(details.get("unit_buying_price"))
    unit_of_receipt = details.get("unit_of_receipt") or "Piece"

    product_id = details.get("product")
    product = Products.objects.filter(id=product_id).first()
    if not product:
        errors.append("Product with supplied ID does not exist")
        return errors, None

    batch = details.get("batch") or None
    bar_code = details.get("bar_code") or ""

    a_minute_ago = datetime.datetime.now() - datetime.timedelta(minutes=1)
    if RetailerReceipts.objects.filter(
        product_id=product_id,
        received_unit_quantity=received_unit_quantity,
        created__gte=a_minute_ago,
    ).exists():
        errors.append("You added a similar item less than a minute ago")
        return errors, None

    try:
        created = RetailerReceipts.objects.create(
            unit_of_receipt=unit_of_receipt,
            product=product,
            received_from=received_from,
            entity=user.entity,
            owner=user,
            received_unit_quantity=received_unit_quantity,
            current_unit_quantity=received_unit_quantity,
            manufacture_date=manufacture_date,
            expiry_date=expiry_date,
            batch=batch,
            bar_code=bar_code,
            employee=employee,
            draft_id=draft_id,
            retailer_order_item=retailer_order_item,
            unit_buying_price=unit_buying_price,
            unit_selling_price=unit_selling_price,
            units_per_pack=product.units_per_pack,
            unit_price_discount=unit_price_discount,
        )

        if retailer_order_item:
            retailer_order_item.is_received = "true"
            retailer_order_item.save(update_fields=["is_received", "updated"])

        return [], created
    except Exception as e:
        errors.append(str(e))
        return errors, None


def validate_retailer_receipt_update_data(data):
    receipt = None

    errors = []
    try:
        retailer_receipt = data["retailer_receipt"]
        if RetailerReceipts.objects.filter(id=data["retailer_receipt"]).exists():
            receipt = RetailerReceipts.objects.filter(
                id=data["retailer_receipt"]
            ).first()

        else:
            errors.append("Retailer receipt for given ID does not exist")

    except KeyError:
        errors.append("Retailer receipt ID is required")
    # try:
    #     retailer_receipt_details = data["retailer_receipt_details"]

    # except KeyError:
    #     errors.append("Retailer receipt details are required")
    # try:
    #     received_from = data["retailer_receipt_details"]["received_from"]
    #     if data["retailer_receipt_details"]["received_from"] == "":
    #         errors.append("Received from must be valid UUID")

    # except KeyError:
    #     errors.append("Product ID is required")

    # try:
    #     pack_quantity = data["retailer_receipt_details"]["pack_quantity"]
    #     if data["retailer_receipt_details"]["pack_quantity"] == "":
    #         errors.append("Pack quantity cannot be empty")

    # except KeyError:
    #     errors.append("Pack quantity is required")
    # if "loose_units_quantity" in data["retailer_receipt_details"]:
    #     if receipt:
    #         try:
    #             loose_units_quantity = data["retailer_receipt_details"][
    #                 "loose_units_quantity"
    #             ]
    #             if data["retailer_receipt_details"]["loose_units_quantity"] == "":
    #                 errors.append("Unit quantity cannot be empty")

    #             if (
    #                 int(data["retailer_receipt_details"]["loose_units_quantity"])
    #                 >= receipt.product.units_per_pack
    #             ):
    #                 errors.append(
    #                     "Loose units cannot be equal to or more than a full pack size"
    #                 )

    #         except KeyError:
    #             errors.append("Unit quantity is required")
    # try:
    #     pack_buying_price = data["retailer_receipt_details"]["pack_buying_price"]
    #     if data["retailer_receipt_details"]["pack_buying_price"] == "":
    #         errors.append("Pack buying price cannot be empty")

    # except KeyError:
    #     errors.append("Pack buying price is required")

    # try:
    #     unit_selling_price = data["retailer_receipt_details"]["unit_selling_price"]
    #     if data["retailer_receipt_details"]["unit_selling_price"] == "":
    #         errors.append("Pack selling price cannot be empty")

    # except KeyError:
    #     errors.append("Pack selling price is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


@transaction.atomic
def update_retailer_receipt_directly(data, user):
    details = data.get("retailer_receipt_details", {})
    receipt = RetailerReceipts.objects.filter(
        id=data["retailer_receipt"]
    ).first()
    if not receipt:
        raise exceptions.ValidationError("Retailer receipt not found")

    changed = []

    if details.get("current_unit_quantity"):
        receipt.current_unit_quantity = _to_int(
            details["current_unit_quantity"]
        )
        changed.append("current_unit_quantity")

    if details.get("unit_of_receipt"):
        receipt.unit_of_receipt = details["unit_of_receipt"]
        changed.append("unit_of_receipt")

    if details.get("received_from"):
        receipt.received_from = validate_entity(details["received_from"])
        changed.append("received_from")

    if details.get("unit_selling_price"):
        receipt.unit_selling_price = _to_decimal(
            details["unit_selling_price"]
        )
        changed.append("unit_selling_price")

    if details.get("unit_buying_price"):
        receipt.unit_buying_price = _to_decimal(
            details["unit_buying_price"]
        )
        changed.append("unit_buying_price")

    if details.get("unit_price_discount"):
        receipt.unit_price_discount = _to_decimal(
            details["unit_price_discount"]
        )
        changed.append("unit_price_discount")

    if details.get("batch"):
        receipt.batch = details["batch"]
        changed.append("batch")

    if details.get("bar_code"):
        bar_code = details["bar_code"]
        if not receipt.product.bar_code:
            receipt.product.bar_code = bar_code
            receipt.product.save(update_fields=["bar_code"])
        receipt.bar_code = bar_code
        changed.append("bar_code")

    if details.get("manufacture_date"):
        receipt.manufacture_date = details["manufacture_date"]
        changed.append("manufacture_date")

    if details.get("expiry_date"):
        receipt.expiry_date = details["expiry_date"]
        changed.append("expiry_date")

    if details.get("is_active"):
        receipt.is_active = details["is_active"]
        changed.append("is_active")

    if changed:
        changed.append("final_unit_selling_price")
        changed.append("updated")
        receipt.save(update_fields=changed)

    return receipt


def get_user_own_orders(user, data):
    # today = timezone.now().date()
    # from_date = timezone.now().date()
    # to_date = timezone.now().date()
    today = datetime.date.today()
    tommorow=today+ datetime.timedelta(days=1)
    from_date = datetime.date.today()
    to_date = datetime.date.today()
    qs = []
    if (
        "filters" in data
        and "from_date" in data["filters"]
        and "to_date" in data["filters"]
    ):
        from django.utils.dateparse import parse_datetime

        from_date = parse_datetime(data["filters"]["from_date"]).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        to_date = parse_datetime(data["filters"]["to_date"] + " 23:59:59").strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        print(f"formatted_datetime from: {from_date}")
        print(f"formatted_datetime to: {to_date}")

        qs = CustomerOrders.objects.filter(entity=user.entity).filter(
            Q(created__gte=from_date, created__lte=to_date)
        ).order_by("-created")

    else:
        qs = CustomerOrders.objects.filter(entity=user.entity).filter(
            Q(created__gte=today,created__lt=tommorow)
        ).order_by("-created")
    return qs

    # return CustomerOrders.objects.filter(entity=user.entity)




# v2: Customer orders
def get_entity_orders(user, data):
    # today = timezone.now().date()
    # from_date = timezone.now().date()
    # to_date = timezone.now().date()
    today = datetime.date.today()
    tommorow=today+ datetime.timedelta(days=1)
    from_date = datetime.date.today()
    to_date = datetime.date.today()
    qs = []
    if (
        "filters" in data
        and "from_date" in data["filters"]
        and "to_date" in data["filters"]
    ):
        from django.utils.dateparse import parse_datetime

        from_date = parse_datetime(data["filters"]["from_date"]).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        to_date = parse_datetime(data["filters"]["to_date"] + " 23:59:59").strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        print(f"formatted_datetime from: {from_date}")
        print(f"formatted_datetime to: {to_date}")

        qs = CustomerOrders.objects.filter(entity=user.entity).filter(
            Q(created__gte=from_date, created__lte=to_date)
        ).order_by("-created")

    else:
        qs = CustomerOrders.objects.filter(entity=user.entity).filter(
            Q(created__gte=today,created__lt=tommorow)
        ).order_by("-created")
    return qs

    # return CustomerOrders.objects.filter(entity=user.entity)


def get_employee_orders(data, user):
    try:
        if Employees.objects.filter(user=user, entity=user.entity).exists():
            employee = Employees.objects.filter(user=user, entity=user.entity,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).first()
            return CustomerOrders.objects.filter(employee=employee, entity=user.entity,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))
        else:
            raise exceptions.ValidationError(
                "Employee  with given ID does not exist in your entity"
            )
    except KeyError:
        raise exceptions.ValidationError(
            "An error occurred while retrieving employee orders"
        )


def get_own_orders(data, user):
   
    try:
        if CustomerOrders.objects.filter(user=user).exists():
            return (
                CustomerOrders.objects.filter(owner=user,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).all().order_by("created")[:20]
            )
        else:
            return []
    except KeyError:
        raise exceptions.ValidationError(
            "An error occurred while retrieving employee orders"
        )


def get_user_orders(user):
    return CustomerOrders.objects.filter(entity=user.entity, owner=user)


def get_customer_orders(data, user):
    try:
        customer_id = data["customer"]
        print("data", customer_id)
        if Users.objects.filter(id=customer_id).exists():
            return CustomerOrders.objects.filter(customer_id=customer_id)
        else:
            raise exceptions.ValidationError("User for provided ID does not exist")
    except KeyError:
        raise exceptions.ValidationError("Customer ID is required")
    



    
def get_bodaboda_deliveries(data, user):
    bodaboda=None
    bodaboda_assigned_orders=[]
    tommorow = get_tommorow()
    today = get_today()
    if BodaLocations.objects.filter(owner=user).exists():
        bodaboda = BodaLocations.objects.filter(owner=user).first()

    if CustomerOrders.objects.filter(bodaboda=bodaboda,created__lt=tommorow,created__gte=today,status="ASSIGNED").exists():
        bodaboda_assigned_orders = CustomerOrders.objects.filter(bodaboda=bodaboda,created__lt=tommorow,created__gte=today,status="ASSIGNED").all()
     
    return bodaboda_assigned_orders
    
def get_customer_order_payments(data, user):
    if  CustomerOrderPayment.objects.filter(receiving_entity=user.entity,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).exists():
        return CustomerOrderPayment.objects.filter(receiving_entity=user.entity,created__gte=get_formatted_from_date(data),  created__lte=get_formatted_to_date(data)).all()
    else:
        return []

def get_customer_order_settlements(data, user):
    qs = []

    print("from date",get_formatted_from_date(data))
    print("to date",get_formatted_to_date(data))
    return qs

    # if  CustomerOrderSettlement.objects.filter(entity=user.entity,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).exists():
    #     return CustomerOrderSettlement.objects.filter(entity=user.entity,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).all()
    # else:
    #     return qs




def validate_customer_order_data(data, user):
    
    errors = []
    retailer_receipt = None
    order_origin = None
    employee=None

    employee = employees_models_validators.validate_employee(user)
    try:
        customer_order = data["customer_order_details"]
        if customer_order == {}:
            errors.append("Customer order details is empty")
    except KeyError:
        errors.append("Customer order details are required")

    except KeyError:
        errors.append("Reeference number is required")
    try:
        order_origin = data["customer_order_details"]["order_origin"]
        if order_origin == "":
            errors.append("Order origin cannot be empty")

    except KeyError:
        errors.append("Order origin is required")



    # try:
    #     order_tax_total = data["customer_order_details"]["order_tax_total"]
    # except KeyError:
    #     errors.append("Order tax amount is required. Default is 0")
    # try:
    #     order_price_total = data["customer_order_details"]["order_price_total"]
    # except KeyError:
    #     errors.append("Order price total is required")
    # try:
    #     order_price_discount_total = data["customer_order_details"]["order_price_discount_total"]
    # except KeyError:
    #     errors.append("Order discount total is required. Default is 0")
    # try:
    #     order_net_price_total = data["customer_order_details"]["order_net_price_total"]
    # except KeyError:
    #     errors.append("Order net price total is required.")

    # try:
    #     employee = data["customer_order_details"]["employee_id"]
    #     if employee == "":
    #         errors.append("Employee ID must be a valid ID")
    #     else:
    #         if Employees.objects.filter(id=employee).exists():
    #             pass
    #         else:
    #             errors.append("Employee does not exist ")
    # except KeyError:
    #     errors.append("Employee ID is required.")
    try:
        order_items = data["customer_order_details"]["order_items"]
        if order_origin == "STAFF" and len(order_items) < 1:
            errors.append("No order items in the order")

        for item in order_items:
            try:
                retailer_receipt_id = item["retailer_receipt"]
                if RetailerReceipts.objects.filter(id=retailer_receipt_id).exists():
                    retailer_receipt = RetailerReceipts.objects.filter(
                        id=retailer_receipt_id
                    ).first()

                    # if retailer_receipt.current_unit_quantity<int(item["purchased_quantity"]):
                    #     errors.append("Required quantity is more thatn available quantity")

                else:
                    raise exceptions.ValidationError(
                        "Retailer receipt for supplied ID does not exist"
                    )
            except KeyError:
                errors.append("Retailer receipt is required.")
            # try:
            #     purchased_quantity = item["purchased_quantity"]
            #     if int(purchased_quantity) < 1:
            #         errors.append("Purchased quantity must be greater than 1")
            # except KeyError:
            #     errors.append("Item purchased quantity is required.")

    except KeyError:
        errors.append("Order items are required.")
    # try:
    #     purchased_quantity = data["customer_order_details"]["order_items"][
    #         "purchased_quantity"
    #     ]
    # except KeyError:
    #     errors.append("Order item purchased quantity is required.")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


@transaction.atomic
def create_estimate_indent(data, user):
    errors = []
    order_days = data.get("order_days")
    lead_time = data.get("lead_time")
    indent_items = data.get("indent_items")

    if not order_days:
        errors.append(
            "Number of days the order inventory is projected to last "
            "is required"
        )
        return errors, None
    if lead_time is None:
        errors.append("Lead time is required")
        return errors, None
    if not indent_items:
        errors.append("Add indent items")
        return errors, None

    header_errors, indent = create_retailer_indent(
        {
            "order_days": order_days,
            "lead_time": lead_time,
        },
        user,
    )
    if header_errors:
        return header_errors, None

    for entry in indent_items:
        item_errors, item = create_retailer_indent_item(
            {
                "retailer_indent": indent.id,
                "wholesale_receipt": entry.get("offer_id"),
                "required_quantity": entry.get("required_estimate"),
            },
            user,
        )
        if item_errors:
            errors.extend(item_errors)

    return errors, indent


from decimal import Decimal, InvalidOperation

from django.db import transaction



@transaction.atomic
def create_retailer_indent(data, user):
    """
    Create or update the retailer's open indent.

    Accepts an optional set of header config values. Fields not
    provided fall back to the model defaults on create, or are
    left untouched on update.

    Note: the aggregates on RetailerIndent (total_cost,
    total_revenue, total_profit, average_lead_time_days,
    over_budget, ...) are not set here. They're populated by
    the prediction run and by the post_save signal on items.
    """
    errors = []

    # ---- Required: order_days ----
    order_days = data.get("order_days")
    if order_days is None:
        errors.append(
            "Number of days the order inventory is projected "
            "to last is required"
        )
        return errors, None

    try:
        order_days = int(order_days)
    except (TypeError, ValueError):
        errors.append("order_days must be an integer")
        return errors, None

    if order_days <= 0:
        errors.append("order_days must be greater than zero")
        return errors, None

    # ---- Required: lead_time ----
    lead_time = data.get("lead_time")
    if lead_time is None:
        errors.append("Lead time is required")
        return errors, None

    try:
        lead_time = int(lead_time)
    except (TypeError, ValueError):
        errors.append("lead_time must be an integer")
        return errors, None

    if lead_time < 0:
        errors.append("lead_time must be zero or greater")
        return errors, None

    # ---- Optional header config ----
    # Only applied when present in `data`. On create, missing
    # values fall through to the model's defaults. On update,
    # missing values keep their current value.
    optional_updates = {}

    if "budget_amount" in data:
        raw = data.get("budget_amount")
        if raw in (None, "",):
            optional_updates["budget_amount"] = None
        else:
            try:
                optional_updates["budget_amount"] = Decimal(
                    str(raw)
                )
            except (TypeError, ValueError, InvalidOperation):
                errors.append(
                    "budget_amount must be a valid number"
                )
                return errors, None

    if "budget_enforced" in data:
        raw = data.get("budget_enforced")
        # Accept bool or string "true"/"false"
        if isinstance(raw, bool):
            optional_updates["budget_enforced"] = (
                "true" if raw else "false"
            )
        else:
            s = str(raw).strip().lower()
            if s in ("true", "false"):
                optional_updates["budget_enforced"] = s
            else:
                errors.append(
                    "budget_enforced must be true or false"
                )
                return errors, None

    if "pricing_percentage" in data:
        raw = data.get("pricing_percentage")
        if raw in (None, ""):
            optional_updates["pricing_percentage"] = Decimal(
                "0.00"
            )
        else:
            try:
                optional_updates["pricing_percentage"] = Decimal(
                    str(raw)
                )
            except (TypeError, ValueError, InvalidOperation):
                errors.append(
                    "pricing_percentage must be a valid number"
                )
                return errors, None

    if "is_open" in data:
        raw = data.get("is_open")
        if isinstance(raw, bool):
            optional_updates["is_open"] = (
                "true" if raw else "false"
            )
        else:
            s = str(raw).strip().lower()
            if s in ("true", "false"):
                optional_updates["is_open"] = s
            else:
                errors.append(
                    "is_open must be true or false"
                )
                return errors, None

    # ---- Find the retailer's existing open indent ----
    existing = (
        RetailerIndent.objects
        .filter(
            owner=user,
            entity=user.entity,
            is_open="true",
        )
        .order_by("-created")
        .first()
    )

    if existing:
        existing.lead_time = lead_time
        existing.order_days = order_days

        for field, value in optional_updates.items():
            setattr(existing, field, value)

        # Save with explicit update_fields so the aggregates
        # computed elsewhere are not overwritten with stale
        # in-memory values.
        existing.save(update_fields=[
            "lead_time",
            "order_days",
            *optional_updates.keys(),
        ])

        return [], existing

    # ---- Create ----
    # `indent_number` is auto-generated by RetailerIndent.save(),
    # so we don't need generate_document_number here unless your
    # numbering scheme lives outside the model.
    created = RetailerIndent.objects.create(
        owner=user,
        entity=user.entity,
        is_open="true",
        order_days=order_days,
        lead_time=lead_time,
        **optional_updates,
    )

    return [], created


def get_wholesaler_from_indent_item(indent_item):
    return indent_item.wholesale_receipt.entity

def get_indent_items_for_wholesaler(wholesale,indent_items):
    wholesaler_items =[]

    for item in indent_items:
        
        if item.wholesale_receipt.entity==wholesale:
            wholesaler_items.append(item)

    
    return wholesaler_items


@transaction.atomic
def close_retailer_indent(data, user):
    from wholesalers.models import RetailerOrders, RetailerOrderItems

    errors = []
    indent_id = data.get("indent")
    if not indent_id:
        errors.append("Indent ID is required")
        return errors, None

    indent = RetailerIndent.objects.filter(id=indent_id).first()
    if not indent:
        errors.append("Indent with provided ID does not exist")
        return errors, None

    if indent.is_open == "false":
        errors.append("Indent is already closed")
        return errors, None

    indent_items = list(
        RetailerIndentItem.objects
        .filter(retailer_indent=indent)
        .select_related(
            "wholesale_receipt__received_from",
            "wholesaler_price_discount",
            "wholesaler_quantity_discount",
        )
    )
    if not indent_items:
        errors.append("Indent has no items")
        return errors, None

    by_wholesaler = {}
    for item in indent_items:
        if not item.wholesale_receipt:
            errors.append(f"Item {item.id} has no receipt")
            continue
        wid = item.wholesale_receipt.received_from_id
        if wid is None:
            errors.append(
                f"Receipt {item.wholesale_receipt_id} has no wholesaler"
            )
            continue
        by_wholesaler.setdefault(wid, []).append(item)

    for wid, group in by_wholesaler.items():
        document_number = generate_document_number(
            user.entity, user, "RETAILERORDER",
        )
        order = RetailerOrders.objects.create(
            document_number=document_number,
            owner=user,
            retailer=indent.entity,
            wholesaler_id=wid,
            entity=user.entity,
            status="SUBMITTED",
            order_origin="RETAILER",
        )

        for indent_item in group:
            qd = indent_item.wholesaler_quantity_discount
            if (
                qd is not None
                and (qd.limit_quantity or 0) > 0
                and (qd.awarded_quantity or 0) > 0
            ):
                blocks = indent_item.required_quantity // qd.limit_quantity
                discount_quantity = blocks * qd.awarded_quantity
            else:
                discount_quantity = 0

            est = indent_item.profit_estimate or {}
            cost_unit = _q(est.get("cost_per_unit") or 0)
            sell_unit = _q(est.get("sell_per_unit") or 0)
            purchased_qty = int(indent_item.required_quantity or 0)

            RetailerOrderItems.objects.create(
                retailer_order=order,
                retailer_indent_item=indent_item,
                wholesaler_receipt=indent_item.wholesale_receipt,
                purchased_quantity=purchased_qty,
                discount_quantity=discount_quantity,
                total_quantity=purchased_qty + discount_quantity,
                unit_of_issue=getattr(
                    indent_item.wholesale_receipt,
                    "unit_of_receipt", "Pack",
                ),
                item_price=cost_unit,
                item_price_total=_q(cost_unit * purchased_qty),
                item_final_price=cost_unit,
                item_final_price_total=_q(cost_unit * purchased_qty),
                item_net_price=cost_unit,
                item_net_price_total=_q(cost_unit * purchased_qty),
                intended_retail_unit_price=sell_unit,
                intended_retail_unit_price_source=est.get(
                    "pricing_source", "markup",
                ),
                entity=indent.entity,
                owner=user,
            )

    indent.is_open = "false"
    indent.save(update_fields=["is_open", "updated"])
    return [], indent


@transaction.atomic
def remove_retailer_indent_item(data, user):
    errors=[]
    retailer_indent = None
    indent_items =[]
    if "retailer_indent" in data and not data["retailer_indent"]=="":
        if RetailerIndent.objects.filter(id=data["retailer_indent"]).exists():
            retailer_indent=RetailerIndent.objects.filter(id=data["retailer_indent"]).first()
    else:
        errors.append("Indent ID is required")

    if "retailer_indent_item" in data and not data["retailer_indent_item"]=="":
        if RetailerIndentItem.objects.filter(id=data["retailer_indent_item"], retailer_indent=retailer_indent).exists():
            item_to_delete = RetailerIndentItem.objects.filter(id=data["retailer_indent_item"],retailer_indent=retailer_indent).first()
            item_to_delete.delete()

            indent_items= RetailerIndentItem.objects.filter(retailer_indent=retailer_indent).all()
    else:
        errors.append("Indent item ID is required")
    
    return errors,indent_items

def create_retail_indent(user):
   
    indent_number = generate_document_number(user.entity, user,"INDENT")
    created = RetailerIndent.objects.create(
        indent_number=indent_number,
        owner=user, 
        is_open ="true",
        order_days=30,
        lead_time=7,
        entity=user.entity
    )
    return created

from decimal import Decimal, InvalidOperation

from django.db import transaction

from retailers import models as retailers_models
from retailers.models import (
    IndentItemSource,
    RetailerIndent,
    RetailerIndentItem,
)
from wholesalers import (
    models as wholesalers_models,
    validators as wholesalers_models_validators,
)


@transaction.atomic
def create_retailer_indent_item(data, user):
    from retailers.models import IndentItemSource

    errors = []

    retailer_indent = None
    raw_indent_id = data.get("retailer_indent")
    if not raw_indent_id:
        errors.append("Indent ID is required")
    else:
        retailer_indent = RetailerIndent.objects.filter(
            id=raw_indent_id,
        ).first()
        if retailer_indent is None or retailer_indent.is_open == "false":
            retailer_indent = _create_open_indent(user)

    wholesale_receipt = None
    raw_receipt_id = data.get("wholesale_receipt")
    if not raw_receipt_id:
        errors.append("Wholesale product ID is required")
    else:
        wholesale_receipt = (
            wholesalers_models_validators.validate_wholesaler_receipt(
                raw_receipt_id
            )
        )
        if wholesale_receipt is None:
            errors.append("Wholesale product not found")

    required_quantity = None
    raw_qty = data.get("required_quantity")
    if raw_qty in (None, 0, "0", ""):
        errors.append("Quantity is required")
    else:
        required_quantity = _to_int(raw_qty)
        if required_quantity <= 0:
            errors.append("Quantity must be greater than zero")

    source = IndentItemSource.MANUAL
    raw_source = data.get("source") or data.get("indenting_criteria")
    if raw_source:
        raw_source = str(raw_source).upper()
        valid_sources = {c[0] for c in IndentItemSource.choices}
        if raw_source in valid_sources:
            source = raw_source
        else:
            errors.append(
                f"source must be one of {sorted(valid_sources)}"
            )

    wholesaler_price_discount = None
    raw_pd = data.get("wholesaler_price_discount")
    if raw_pd:
        wholesaler_price_discount = (
            wholesalers_models_validators
            .validate_wholesaler_price_discount(raw_pd)
        )
        if wholesaler_price_discount is None:
            errors.append("Price discount not found")

    wholesaler_quantity_discount = None
    raw_qd = data.get("wholesaler_quantity_discount")
    if raw_qd:
        wholesaler_quantity_discount = (
            wholesalers_models_validators
            .validate_wholesaler_quantity_discount(raw_qd)
        )
        if wholesaler_quantity_discount is None:
            errors.append("Quantity discount not found")

    campaign_item = None
    raw_campaign_item = data.get("campaign_item")
    if raw_campaign_item:
        try:
            from campaigns.models import WholesalerCampaignItem
            campaign_item = WholesalerCampaignItem.objects.filter(
                id=raw_campaign_item
            ).first()
        except ImportError:
            campaign_item = None

    if errors:
        return errors, None

    existing = RetailerIndentItem.objects.filter(
        wholesale_receipt=wholesale_receipt,
        retailer_indent=retailer_indent,
        entity=user.entity,
    ).first()

    if existing:
        existing.required_quantity = required_quantity
        existing.source = source
        existing.wholesaler_price_discount = wholesaler_price_discount
        existing.wholesaler_quantity_discount = wholesaler_quantity_discount
        if campaign_item is not None:
            existing.campaign_item = campaign_item
        existing.save()
        return [], existing

    created = RetailerIndentItem.objects.create(
        owner=user,
        entity=user.entity,
        retailer_indent=retailer_indent,
        wholesale_receipt=wholesale_receipt,
        required_quantity=required_quantity,
        source=source,
        wholesaler_price_discount=wholesaler_price_discount,
        wholesaler_quantity_discount=wholesaler_quantity_discount,
        campaign_item=campaign_item,
    )
    return [], created


# =====================================================================
# Helper — a fresh open indent for the current user
# =====================================================================

def _create_open_indent(user):
    """
    Reuse an existing open indent if one is already there;
    otherwise create a new one. Kept separate so the item
    service doesn't duplicate the logic the header service
    owns.
    """
    existing = (
        RetailerIndent.objects
        .filter(
            owner=user,
            entity=user.entity,
            is_open="true",
        )
        .order_by("-created")
        .first()
    )
    if existing:
        return existing

    return RetailerIndent.objects.create(
        owner=user,
        entity=user.entity,
        is_open="true",
        # Reasonable defaults if the caller hasn't set config.
        # If your RetailerIndent model already carries a
        # `lead_time` default of 0 and `order_days` default
        # of 30, you can drop these two lines.
        lead_time=0,
        order_days=getattr(user.entity, "order_days", 30) or 30,
    )

@transaction.atomic
def update_out_of_stock_item(data, user):
    errors=[]
    product=None
    required_quantity=None
    customer = None
    customer_phone = None
    customer_name = None
    is_special_order=False

    out_of_stock_item = None
    if not "out_of_stock_item_id" in data or data["out_of_stock_item_id"]=="":
        errors.append("Out of stock item ID is required")
        return errors, None
    else:
        if OutOfStock.objects.filter(id=data["out_of_stock_item_id"]).exists():
            out_of_stock_item=OutOfStock.objects.filter(id=data["out_of_stock_item_id"]).first()
        else:
            errors.append("No item with provided ID found")
            return errors,None
    if  "product" in data:
        product = product_models_validator.validate_product(data["product"])
        out_of_stock_item.product=product
        out_of_stock_item.save()
    if  "required_quantity" in data:
        out_of_stock_item.required_quantity = int(data["required_quantity"])
        out_of_stock_item.save()

    if  "customer_name" in data:
        out_of_stock_item.customer_name = data["customer_name"]
        out_of_stock_item.save()

    if  "unit_of_issue" in data:
        out_of_stock_item.unit_of_issue = data["unit_of_issue"]
        out_of_stock_item.save()

    if  "customer_phone" in data:
        out_of_stock_item.customer_phone = data["customer_phone"]
        out_of_stock_item.save()
    print("out_of_stock_item",out_of_stock_item)

    if  "is_special_order" in data:
        out_of_stock_item.is_special_order = data["is_special_order"]
        out_of_stock_item.save()
    print("out_of_stock_item",out_of_stock_item)
    return [], out_of_stock_item


def update_wholesaler_stock(retailer_order):
    retailer_order_items = RetailerOrderItems.objects.filter(
        retailer_order=retailer_order,
    )
    for roi in retailer_order_items:
        wholesaler_receipt = WholesalerReceipts.objects.filter(
            id=roi.wholesaler_receipt_id,
        ).first()
        if wholesaler_receipt:
            wholesaler_receipt.current_unit_quantity = max(
                0,
                (wholesaler_receipt.current_unit_quantity or 0)
                - roi.total_quantity,
            )
            wholesaler_receipt.save(
                update_fields=["current_unit_quantity"]
            )



def process_retailer_order_payment(retailer_order,payment_method,user,mobile_money_phone):
    retailer_order_payment=None
    
    if RetailerOrderPayments.objects.filter(retailer_order=retailer_order.id).exists():
        retailer_order_payment= RetailerOrderPayments.objects.filter(retailer_order=retailer_order.id).first()
    
    amount= int(retailer_order.final_price_total+ retailer_order.shipping_amount)
    print("amount", amount)

    errors = []
    administrator_account = None
    reference_number = generate_reference_number(retailer_order.retailer,user)
    if payment_method.title=="CASH":
        print("At cash")

        # Cash payments
        try:
            retailer_order_payment = RetailerOrderPayments.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="SUCCESS",
                amount=retailer_order.final_price_total+retailer_order.shipping_amount,
                entity_id=retailer_order.entity.id,
                currency="KES",
                owner=user,
                retailer_order = retailer_order,
               
            )
        
            if retailer_order_payment:
                print("Created")
                # print("payment", customer_order_payment)
                update_wholesaler_stock(retailer_order)
                retailer_order.is_paid="true"
                retailer_order.save()
                retailer_order.payment=retailer_order_payment
                use_reference_number(reference_number)
                return [], retailer_order
            else:
                print("Not Created")
                errors.append("Error while creating customer order payment")
                return errors, None
        except Exception as e:
            errors.append(str(e))
            return errors, None

    elif payment_method.title=="MOBILE MONEY":
        
       
        if not UserAccounts.objects.filter(owner = retailer_order.wholesaler.administrator).exists():
            errors.append("Entity has no collection account")
            return errors, None
        else:
            administrator_account =  UserAccounts.objects.filter(owner = retailer_order.wholesaler.administrator).first()
            print("entity_collection_account",administrator_account)
      
            payload = None
            telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)

        

            if telco=="MPESA":
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount": amount,
                    "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                    "accountTo":  administrator_account.account_number,
                    "description": "Merchant payment",
                    "modeOfPayment": "MOBILE_MONEY",
                    "provider": "Mpesa",
                    "data": {
                        "phoneNumber": formatted_phone_number,
                        "serviceType": "TOPUP"
                    }
                    })
           
            elif telco=="AIRTELMONEY":
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount":  amount,
                    "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                    "accountTo":administrator_account.account_number, 
                    "currency":"KES",
                    "description": "TOPUP",
                    "modeOfPayment": "MOBILE_MONEY",
                    "provider": "AIRTELMONEY",
                    "data": {
                        "phoneNumber": formatted_phone_number,
                        "serviceType": "TOPUP" 
                    }
            
                    })
        
            errors, result_json = jambopay_mobile_checkout(payload)
            if result_json:
                create_log("error",f"Errors at payment 2:{errors}")  
                retailer_order_payment = RetailerOrderPayments.objects.create(
                    payment_method=payment_method,
                    reference_number=reference_number,
                    status="INITIATED",
                    amount=float(retailer_order.final_price_total+ retailer_order.shipping_amount),
                    entity=retailer_order.retailer,
                    currency="KES",
                    owner=user,
                    retailer_order = retailer_order,
                    psp_reference_number= result_json["ref"],
                    telco= telco
                )
                use_reference_number(reference_number)
                if retailer_order_payment:
                    retailer_order.payment=retailer_order_payment
                    retailer_order.save()
                    return [], retailer_order
                else:
                    errors.append("Customer order payment not created")
                    return errors, None
            else: 
                create_log("error",f"Errors at payment:{errors}")  
                return errors, None
    elif payment_method.title=="JAMBOPAY WALLET":
        if not UserAccounts.objects.filter(owner = retailer_order.wholesaler.administrator).exists():
            errors.append("Entity adminisrator has no collection account")
            return errors, None
        else:
            administrator_account =  UserAccounts.objects.filter(owner = retailer_order.wholesaler.administrator).first()

        errors, wallet = get_account_by_phone(mobile_money_phone)
        if wallet:
            data ={
                        "orderId": reference_number,
                        "amount":  int(retailer_order.order_price_total+ retailer_order.shipping_amount),
                        "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
                        "accountTo": administrator_account.account_number,
                        "description": "Customer order payment",
                        "modeOfPayment": "WALLET_AS_SERVICE",
                        "provider": "JAMBOPAY",
                        "data": {
                                "serviceType": "MERCHANTPAYMENT",
                                "accountNo": wallet
                        }
                        }
            response = jambopay_wallet_checkout(data)

            if not "statusCode" in response and  "ref" in response:
                retailer_order_payment = RetailerOrderPayments.objects.create(
                    payment_method=payment_method,
                    reference_number=reference_number,
                    status="PENDING",
                    amount=float(retailer_order.final_price_total+ retailer_order.shipping_amount),
                    entity=user.entity,
                    currency="KES",
                    owner=user,
                    retailer_order = retailer_order,
            
                )
                use_reference_number(reference_number)
                if retailer_order_payment:
                
                    return [], retailer_order
                else:
                    errors.append("Ticket payment not created")
                    return errors, [], None
            else:
                # errors.append( str(response))
                return errors, None, None

        else:
            errors.append("No wallet for provided mobile phone")
            return errors, None
    else:
        errors.append("Unsupported payment method")
        return errors, None,None





@transaction.atomic
def make_retailer_order_payment(data,user):
    errors =[]
    retailer_order_id=None
    payment_method_id=None
    retailer_order=None
    payment_method=None
    mobile_money_phone=None
    reference_number =None
    if not "retailer_order" in data or data['retailer_order']==None:
        errors.append("Retailer order ID is required")
        return errors,None
    else:
        retailer_order_id = data['retailer_order']
        if RetailerOrders.objects.filter(id=retailer_order_id).exists():
            retailer_order=RetailerOrders.objects.filter(id=retailer_order_id).first()
        else:
            errors.append("Retailer order for provided ID does not exist")
            return errors,None
    
    
    
    if not "payment_method" in data or data['payment_method']==None:
        errors.append("Payment method ID is required")
        return errors,None
    else:
        payment_method_id=data['payment_method']


    if "mobile_money_phone" in data and not data['mobile_money_phone']==None:
        mobile_money_phone=data['mobile_money_phone']

        

    if RetailerOrderPayments.objects.filter(retailer_order=retailer_order_id,status="SUCCESS").exists():
        errors.append("Order is already paid")
        return errors,None

    if PaymentMethods.objects.filter(id=payment_method_id).exists():
        payment_method=PaymentMethods.objects.filter(id=payment_method_id).first()
    else:
        errors.append("Payment method with provided ID does not exist!")
        return errors,None

    errors,retailer_order = process_retailer_order_payment(retailer_order,payment_method,user,mobile_money_phone)
    if retailer_order:

        return [],retailer_order
    else:
       
        return errors,None

    # created = RetailerOrderPayments.objects.create()

    



@transaction.atomic
def make_customer_order_payment(data, user):
    errors = []
    customer_order = None
    payment_method = None
    mobile_money_phone = None

    customer_order_id = data.get("customer_order")
    if not customer_order_id:
        errors.append("Customer order ID is required")
        return errors, None

    customer_order = CustomerOrders.objects.filter(
        id=customer_order_id,
    ).first()
    if not customer_order:
        errors.append("Customer order for provided ID does not exist")
        return errors, None

    payment_method_id = data.get("payment_method")
    if not payment_method_id:
        errors.append("Payment method ID is required")
        return errors, None

    payment_method = PaymentMethods.objects.filter(
        id=payment_method_id,
    ).first()
    if not payment_method:
        errors.append("Payment method with provided ID does not exist")
        return errors, None

    if data.get("mobile_money_phone"):
        mobile_money_phone = data["mobile_money_phone"]

    if CustomerOrderPayment.objects.filter(
        customer_order=customer_order,
        status="SUCCESS",
        is_validated=True,
    ).exists():
        errors.append("Order is already paid")
        return errors, None

    if not CustomerOrderItems.objects.filter(
        customer_order=customer_order,
    ).exists():
        errors.append("Order has no items")
        return errors, None

    order_items = CustomerOrderItems.objects.filter(
        customer_order=customer_order,
    )

    errors, customer_order = process_customer_order_payment(
        customer_order.entity,
        customer_order,
        payment_method,
        user,
        mobile_money_phone,
        order_items,
    )

    if customer_order:
        return [], customer_order
    return errors, None


# @transaction.atomic
# def close_indent(data,user):
#     retailer_indent_id =""
#     retailer_indent =None
#     employee = None
#     retailer_orders =[]
    
#     errors =[]
#     if Employees.objects.filter(user=user,entity=user.entity).exists():
#         employee = Employees.objects.filter(user=user,entity=user.entity).first()
#     else:
#         errors.append("Not an employee")

#     if not "retailer_indent" in data or data["retailer_indent"]=="":
#         errors.append("Retailer Indent is required")
#         return errors,[]
#     else:
#         retailer_indent_id=data["retailer_indent"]

#     if RetailerIndent.objects.filter(id=retailer_indent_id,owner=user).exists():
#         retailer_indent  =  RetailerIndent.objects.filter(id=retailer_indent_id,owner=user).first()

#     if retailer_indent.is_open=="false":
#         errors.append("Retailer indent is closed")
#         return errors, None

#     if RetailerIndentItem.objects.filter(retailer_indent_id=retailer_indent_id).exists():
#         items =  RetailerIndentItem.objects.filter(retailer_indent_id=retailer_indent_id).all()

#         wholesalers = list(set(map(get_wholesalers,items)))
       

#         for wholesaler in wholesalers:
#             retailer_order=None
#             wholesaler_indent_items=[]
#             wholesaler_indent_items = RetailerIndentItem.objects.filter(wholesale_receipt__entity=wholesaler,retailer_indent=retailer_indent).all()
#             if len(wholesaler_indent_items)>0:
#                 reference_number = generate_reference_number(user.entity,user)
#                 retailer_order = RetailerOrders.objects.create(wholesaler=wholesaler, retailer=user.entity,entity=user.entity,owner=user,employee=employee, reference_number=reference_number )
                
#                 for indent_item in wholesaler_indent_items:
#                     if WholesalerPriceDiscounts.objects.filter(wholesale_receipt= indent_item.wholesale_receipt).exists():
                  
#                     created_item = RetailerOrderItems.objects.create(
#                         retailer_order=retailer_order,
#                         wholesaler_receipt=indent_item.wholesale_receipt,
#                         entity =retailer_order.entity,
#                         purchased_quantity=indent_item.required_quantity,
#                         owner =user,
                       
#                         )
                
#                 retailer_orders.append(retailer_order)

#         retailer_indent.is_open="false"
#         retailer_indent.save()
#         return [],retailer_orders
#     else:
#         errors.append("No indent items")   
#         return errors,[]

@transaction.atomic
def create_out_of_stock_item(data, user):
    errors=[]
    product=None
    required_quantity=None
    customer = None
    customer_phone = None
    customer_name = None
    unit_of_receipt="Piece"
    is_special_order=False
    if not "product" in data:
        errors.append("Product ID is required")
    else:
        product = product_models_validator.validate_product(data["product"])
        
    if not "required_quantity" in data:
        errors.append("Quantity required")
    else:
        required_quantity=int(data["required_quantity"])

    if "customer" in data:
        customer =   validate_user(data["customer"]) 
        customer_name=customer.first_name + " "+ customer.last_name
        customer_phone= customer.phone

    if "customer_name" in data:
        customer_name=data["customer_name"]

    if "unit_of_receipt" in data:
        unit_of_receipt=data["unit_of_receipt"]

    if "customer_phone" in data:
        customer_phone=data["customer_phone"]

    if "is_special_order" in data:
        is_special_order=data["is_special_order"]

    if len(errors)>0:
        return errors, None
    else:
        # Check current item inventory before saving item as out of stock
        if not is_special_order:
            if RetailerReceipts.objects.filter(product=product, current_unit_quantity__gte=required_quantity,entity=user.entity).exists():
                item = RetailerReceipts.objects.filter(product=product, current_unit_quantity__gte=required_quantity,entity=user.entity).first()
                errors.append(f"Quantity {item.current_unit_quantity} of {item.product.title} is available at {user.entity.title.upper()}")
                return errors, None
        # Avoid repeated entry of similart transaction within 2 minutes
        two_minutes_ago = datetime.datetime.now() - datetime.timedelta(minutes=2)
        if OutOfStock.objects.filter(product=product, required_quantity=required_quantity, created__gte=two_minutes_ago).exists():
            errors.append("A similar entry was done in under 2 minutes ago")
            return errors, None
        created = OutOfStock.objects.create(product=product, 
                                            owner=user, 
                                            required_quantity=required_quantity,
                                            is_special_order=is_special_order,
                                            customer=customer, 
                                            unit_of_receipt=unit_of_receipt,
                                            customer_name=customer_name,
                                            customer_phone=customer_phone,
                                            entity=user.entity)
        return [],created


def retrieve_retailer_orders(user):
    items =[]
    if RetailerOrders.objects.filter(entity=user.entity).exists():
        items= RetailerOrders.objects.filter(entity=user.entity).all().order_by("-created")
    return items

def retrieve_retailer_order_items(data):
    order_id=None
    items =[]
    if not "order" in data or data['order']==None:
        raise exceptions.ValidationError("Order ID is required")
    else:
        order_id= data['order']
        if RetailerOrderItems.objects.filter(retailer_order__id=order_id).exists():
            items =RetailerOrderItems.objects.filter(retailer_order__id=order_id).all()
    return items

def retrieve_out_of_stock_items(user):
    items =[]
    if OutOfStock.objects.filter(entity=user.entity).exists():
        items= OutOfStock.objects.filter(entity=user.entity).all()
    return items

def retrieve_retailer_indents(user):
    """Retrieve retailer indents for entity by admin, order by date created, limit to 5"""
    items =[]
    if RetailerIndent.objects.filter(entity=user.entity,owner=user).exists():
        items= RetailerIndent.objects.filter(entity=user.entity,owner=user).order_by("-created").all()[:10]
    
    return items

def get_wholesalers(item):
    return item.wholesale_receipt.entity


# def retrieve_retailer_indent_items(data):
#     items =[]
#     if not "retailer_indent" in data or data["retailer_indent"]=="":
#         raise exceptions.ValidationError("Indent ID is required")
#     else:
#         retailer_indent_id=data["retailer_indent"]
#         if RetailerIndentItem.objects.filter(retailer_indent_id=retailer_indent_id).exists():
#             items =  RetailerIndentItem.objects.filter(retailer_indent_id=retailer_indent_id).all()
#     return items
    


def retrieve_retailer_indent_items(data):
    arr ={}
    errors=[]
    retailer_indent_id=None
    wholesaler_items=[]
    items =[]
    if not "retailer_indent" in data or data["retailer_indent"]=="":
        raise exceptions.ValidationError("Indent ID is required")
    else:
        retailer_indent_id=data["retailer_indent"]
        if RetailerIndentItem.objects.filter(retailer_indent_id=retailer_indent_id).exists():
            items =  RetailerIndentItem.objects.filter(retailer_indent_id=retailer_indent_id).all()

            wholesalers = list(set(map(get_wholesalers,items)))
            create_log("warning",wholesalers)
            arr =[]
            value =0.00
            for wholesaler in wholesalers:
                if RetailerIndentItem.objects.filter(retailer_indent_id=retailer_indent_id,wholesale_receipt__entity=wholesaler).exists():
                    wholesaler_items =  RetailerIndentItem.objects.filter(retailer_indent_id=retailer_indent_id,wholesale_receipt__entity=wholesaler).all()
                    for item in wholesaler_items:
                        value+=float(item.wholesale_receipt.unit_selling_price)*float(item.required_quantity)
                    ent={
                        "wholesaler":EntityMiniSerializer(wholesaler, context={"request": None}, many=False).data,
                        "items":  RetailerIndentItemsSerializer(wholesaler_items, context={"request": None}, many=True).data,
                        "value":value,
                        "count":len(wholesaler_items)
                    }
                    arr.append(ent)
            create_log("warning",ent)
            return arr
        else:
            return []


def get_order_price_total(customer_order):
    total = (
        CustomerOrderItems.objects
        .filter(customer_order=customer_order)
        .aggregate(total=Sum("item_net_price_total"))["total"]
    ) or Decimal("0.00")

    if customer_order.shipping_cost and customer_order.shipping_cost > 0:
        total += Decimal(str(customer_order.shipping_cost))

    return _q(total)

from decimal import Decimal
from django.db.models import Sum
from django.utils import timezone

from ..models import CustomerOrderPayment


def _q(value):
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))

def _to_decimal(value, default="0.00"):
    if value in (None, ""):
        return Decimal(default)
    try:
        return Decimal(str(value))
    except (TypeError, ValueError, InvalidOperation):
        return Decimal(default)
def _to_int(value, default=0):
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
    
def recompute_order_payment_state(customer_order):
    paid_total = (
        CustomerOrderPayment.objects
        .filter(customer_order=customer_order, status="SUCCESS")
        .aggregate(total=Sum("amount"))["total"]
    ) or Decimal("0.00")

    paid_total = _q(paid_total)
    owed = _q(customer_order.order_net_price_total or 0)
    balance = _q(max(Decimal("0.00"), owed - paid_total))

    was_paid = customer_order.is_paid == "true"
    now_paid = balance <= Decimal("0.00")

    customer_order.paid_total = paid_total
    customer_order.balance_due = balance
    customer_order.is_paid = "true" if now_paid else "false"

    if now_paid and customer_order.paid_at is None:
        customer_order.paid_at = timezone.now()
    elif not now_paid:
        customer_order.paid_at = None

    customer_order.save(update_fields=[
        "paid_total", "balance_due", "is_paid", "paid_at", "updated",
    ])

    return now_paid and not was_paid


def process_customer_order_payment(entity, customer_order, payment_method, user,
                                   mobile_money_phone, order_items):
    customer_order.selected_payment_method = payment_method
    customer_order.save(update_fields=[
        "selected_payment_method", "updated",
    ])

    reference_number = generate_reference_number(customer_order.entity, user)

    errors = []
    administrator_account = None

    if payment_method.title == "CASH":
        try:
            CustomerOrderPayment.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="SUCCESS",
                amount=customer_order.order_net_price_total or Decimal("0.00"),
                entity=user.entity,
                currency="KES",
                owner=user,
                customer_order=customer_order,
                is_validated=True,
            )
            recompute_order_payment_state(customer_order)
            customer_order.status = "COMPLETE"
            customer_order.save(update_fields=["status", "updated"])
            use_reference_number(reference_number)
            return [], customer_order
        except Exception as e:
            errors.append(str(e))
            return errors, None

    elif payment_method.title == "CREDIT":
        customer_order.payment_method = payment_method
        customer_order.reference_number = reference_number
        customer_order.status = "DEFERRED"
        customer_order.save(update_fields=[
            "payment_method", "reference_number", "status", "updated",
        ])
        return [], customer_order

    elif payment_method.title == "MOBILE MONEY":
        if not UserAccounts.objects.filter(
            owner=entity.administrator,
        ).exists():
            errors.append("Entity admin has no collection account")
            return errors, None

        administrator_account = UserAccounts.objects.filter(
            owner=entity.administrator,
        ).first()

        telco, formatted_phone_number = get_telco_by_phone_number(
            mobile_money_phone
        )

        amount = int(customer_order.order_net_price_total or 0)

        payload = None
        if telco == "MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": amount,
                "callBackUrl": (
                    "https://webhook.site/"
                    "7911487f-fc9e-46b0-a812-3adfa008375c"
                ),
                "accountTo": administrator_account.account_number,
                "description": "Merchant payment",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })
            create_log(
                "info",
                f"create customer order by customer {payload}",
            )
        elif telco == "AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": str(amount),
                "callBackUrl": (
                    "https://webhook.site/"
                    "55963e0b-b692-42b6-a682-0223eaf7fbff"
                ),
                "accountTo": administrator_account.account_number,
                "currency": "KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })
        else:
            errors.append(f"Unsupported telco: {telco}")
            return errors, None

        create_log("info", f"just before checkout {payload}")

        the_data = {
            "client_id": config("JAMBOPAY_CLIENT_ID"),
            "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
            "grant_type": config("JAMBOPA_GRANT_TYPE"),
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        result = requests.post(
            config("JAMBOPAY_AUTH_URL1"), data=the_data, headers=headers,
        )
        result_json = result.json()
        token = result_json.get("access_token") if result_json else None

        if not token:
            errors.append("Token not generated")
            return errors, None

        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            "Accept": "*/*",
        }
        result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/checkout/express",
            data=payload,
            headers=headers,
        )
        result_json = result.json()
        create_log("info", f"result_json {result_json}")

        if not result_json or "ref" not in result_json:
            create_log("info", f"from jp errors {errors}")
            errors.append("Payment failed")
            return errors, None

        try:
            CustomerOrderPayment.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="PENDING",
                amount=customer_order.order_net_price_total or Decimal("0.00"),
                entity=entity,
                currency="KES",
                owner=user,
                customer_order=customer_order,
                administrator_account=administrator_account,
                psp_reference_number=result_json["ref"],
                telco=telco,
            )
            use_reference_number(reference_number)
            return [], customer_order
        except Exception as e:
            errors.append(str(e))
            return errors, None

    elif payment_method.title == "JAMBOPAY WALLET":
        if not UserAccounts.objects.filter(
            owner=user.entity.administrator,
        ).exists():
            errors.append("Entity administrator has no collection account")
            return errors, None

        administrator_account = UserAccounts.objects.filter(
            owner=user.entity.administrator,
        ).first()

        errors, wallet = get_account_by_phone(mobile_money_phone)
        if not wallet:
            errors.append("No wallet for provided mobile phone")
            return errors, None

        amount = int(customer_order.order_net_price_total or 0)

        data = {
            "orderId": reference_number,
            "amount": amount,
            "callBackUrl": (
                "https://webhook.site/"
                "931bef21-de22-43bc-a45b-7e12999ac9cb"
            ),
            "accountTo": administrator_account.account_number,
            "description": "Customer order payment",
            "modeOfPayment": "WALLET_AS_SERVICE",
            "provider": "JAMBOPAY",
            "data": {
                "serviceType": "TOPUP",
                "accountNo": wallet,
            },
        }
        response = jambopay_wallet_checkout(data)

        if "statusCode" in response or "ref" not in response:
            errors.append("Wallet checkout failed")
            return errors, None

        try:
            customer_order_payment = CustomerOrderPayment.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="PENDING",
                amount=customer_order.order_net_price_total or Decimal("0.00"),
                entity=user.entity,
                currency="KES",
                owner=user,
                customer_order=customer_order,
                entity_collection_account=administrator_account,
            )
            use_reference_number(reference_number)
            customer_order.reference_number = reference_number
            customer_order.payment = customer_order_payment
            customer_order.save(update_fields=[
                "reference_number", "payment", "updated",
            ])
            return [], customer_order
        except Exception as e:
            errors.append(str(e))
            return errors, None

    else:
        errors.append("Unsupported payment method")
        return errors, None



# @transaction.atomic
# def update_stock(items):
#     current_unit_quantity = 0
#     sold_packs = 0
#     loose = 0
#     for item in items:
#         # sold_packs = item.total_quantity % item.retailer_receipt.product.units_per_pack
#         current_unit_quantity = item.retailer_receipt.current_unit_quantity
#         item.retailer_receipt.current_unit_quantity = (
#             current_unit_quantity - item.total_quantity
#         )

#         # packs_updated = (
#         #     int(current_unit_quantity - item.total_quantity)
#         #     / item.retailer_receipt.product.units_per_pack
#         # )

#         # try:
#         #     item.retailer_receipt.pack_quantity = packs_updated
#         #     item.retailer_receipt.save()
#         # except Exception as e:
#         #     print("Error", e)

#         item.retailer_receipt.save()
#     return True

@transaction.atomic
def create_express_customer_order_data(data, user):
    errors = []
    customer_order = None
    customer = None
    payment_method = None
    order_origin = None
    order_channel = None
    payment_account_number = None
    customer_order_items = []
    customer_name = None
    customer_phone = None
    due_date = None

    if not data.get("customer_order_items"):
        errors.append("Customer order items are required")
        return errors, None

    customer_order_items = data["customer_order_items"]

    for entry in customer_order_items:
        receipt_id = entry.get("product")
        if not RetailerReceipts.objects.filter(id=receipt_id).exists():
            errors.append("Product with provided product ID does not exist")
            return errors, None

        retailer_receipt = RetailerReceipts.objects.filter(
            id=receipt_id,
        ).first()
        if int(retailer_receipt.current_unit_quantity) < int(
            entry["quantity"]
        ):
            errors.append(
                f"{retailer_receipt.product.title} has only "
                f"{retailer_receipt.current_unit_quantity} units left "
                f"whereas {entry['quantity']} units are required"
            )
            return errors, None

    if data.get("customer"):
        customer = Users.objects.filter(id=data["customer"]).first()

    if data.get("customer_name"):
        customer_name = data["customer_name"]

    if data.get("customer_phone"):
        customer_phone = data["customer_phone"]

    if data.get("due_date"):
        due_date = data["due_date"]

    if data.get("payment_method"):
        payment_method = PaymentMethods.objects.filter(
            id=data["payment_method"],
        ).first()
        if payment_method.title == "MOBILE MONEY" and not data.get(
            "payment_account_number"
        ):
            errors.append("Mobile money phone number is required")
            return errors, None
        payment_account_number = data.get("payment_account_number")

    if data.get("order_origin"):
        order_origin = data["order_origin"]

    if data.get("order_channel"):
        order_channel = data["order_channel"]

    if errors:
        return errors, None

    try:
        order_number = generate_document_number(
            user.entity, user, "CUSTOMERORDER",
        )
        customer_order = CustomerOrders.objects.create(
            user=customer,
            owner=user,
            selected_payment_method=payment_method,
            entity=user.entity,
            order_origin=order_origin,
            order_channel=order_channel,
            order_number=order_number,
            customer_name=customer_name,
            customer_phone=customer_phone,
            due_date=due_date,
        )

        if not customer_order or not customer_order_items:
            errors.append("Order could not be created")
            return errors, None

        for entry in customer_order_items:
            retailer_receipt = RetailerReceipts.objects.filter(
                id=entry["product"],
            ).first()
            if not retailer_receipt:
                continue

            purchased_qty = _to_int(entry.get("quantity"))
            discount_quantity = _to_int(entry.get("discount_quantity"))
            final_unit = _to_decimal(
                retailer_receipt.final_unit_selling_price
                or retailer_receipt.unit_selling_price
            )
            discount_unit = _to_decimal(entry.get("discount"))

            item_price_total = _q(final_unit * purchased_qty)
            item_price_discount_total = _q(discount_unit * purchased_qty)
            item_net_price = _q(final_unit - discount_unit)
            item_net_price_total = _q(item_net_price * purchased_qty)

            if retailer_receipt.product.is_vatable:
                item_tax = _q(final_unit * Decimal("0.16"))
                item_tax_total = _q(item_tax * purchased_qty)
            else:
                item_tax = Decimal("0.00")
                item_tax_total = Decimal("0.00")

            CustomerOrderItems.objects.create(
                unit_of_issue=retailer_receipt.unit_of_receipt,
                customer_order=customer_order,
                retailer_receipt=retailer_receipt,
                purchased_quantity=purchased_qty,
                discount_quantity=discount_quantity,
                total_quantity=purchased_qty + discount_quantity,
                quantity=purchased_qty,
                item_price=final_unit,
                item_price_total=item_price_total,
                item_price_discount=discount_unit,
                item_price_discount_total=item_price_discount_total,
                item_net_price=item_net_price,
                item_net_price_total=item_net_price_total,
                item_tax=item_tax,
                item_tax_total=item_tax_total,
                owner=user,
                entity=user.entity,
            )

        customer_order.recalculate()

        order_items = CustomerOrderItems.objects.filter(
            customer_order=customer_order,
        )

        errors, order_created = process_customer_order_payment(
            user.entity,
            customer_order,
            payment_method,
            user,
            payment_account_number,
            order_items,
        )
        if order_created:
            return [], order_created
        return errors, customer_order

    except Exception as e:
        errors.append(str(e))
        return errors, None

def validate_order_payment_method_data(data):
    errors = []

    try:
        customer_order = data["customer_order"]
        if customer_order == {}:
            errors.append("Customer order ID is required")
    except KeyError:
        errors.append("Customer order details are required")

    try:
        payment_method_id = data["payment_method"]
    except KeyError:
        errors.append("Payment method ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


@transaction.atomic
def re_initiate_order_payment(data, user):
    reference_number = None
    customer_order = None

    if not "new_reference_number" in data:
        raise exceptions.ValidationError("New  reference number is required")
    else:
        new_reference_number = data["new_reference_number"]

    if not "reference_number" in data:
        raise exceptions.ValidationError("Order reference number is required")
    else:
        reference_number = data["reference_number"]

        if CustomerOrders.objects.filter(reference_number=reference_number).exists():
            customer_order = CustomerOrders.objects.filter(
                reference_number=reference_number
            ).first()

            if not customer_order.payment:
                customer_order.order_number = new_reference_number
                customer_order.save()
                # process_mpesa_collection(
                #     customer_order.payment_account_number,
                #     customer_order.reference_number,
                #     customer_order.order_price_total,
                # )
            else:
                raise exceptions.ValidationError("Order already paid for")

@transaction.atomic
def create_customer_order(data, user):
    errors = []

    customer = None
    entity = None
    order_number = None
    payment_account_number = None
    payment_method = None
    delivery_method = None
    order_origin = None
    shipping_cost = Decimal("0.00")
    origin_latitude = None
    origin_longitude = None
    destination_latitude = None
    destination_longitude = None
    farness = Decimal("0.00")
    origin_point = None
    destination_point = None
    draft_id = None
    recipient_name = None
    recipient_phone = None

    order_items = []

    if not data.get("customer_order_details"):
        errors.append("No order details")
        return errors, None

    details = data["customer_order_details"]

    order_origin = details.get("order_origin")
    if not order_origin:
        errors.append("Order origin is required")
        return errors, None

    if order_origin == "CUSTOMER":
        customer = user

    draft_id = details.get("draft_id")
    if not draft_id:
        errors.append("Draft ID is required")

    if details.get("farness") not in (None, ""):
        farness = _to_decimal(details["farness"])

    if details.get("origin_latitude") not in (None, ""):
        origin_latitude = details["origin_latitude"]
    if details.get("origin_longitude") not in (None, ""):
        origin_longitude = details["origin_longitude"]

    if origin_latitude and origin_longitude:
        origin_point = fromstr(
            f"POINT({origin_longitude} {origin_latitude})", srid=4326,
        )

    if details.get("destination_latitude") not in (None, ""):
        destination_latitude = details["destination_latitude"]
    if details.get("destination_longitude") not in (None, ""):
        destination_longitude = details["destination_longitude"]

    if destination_latitude and destination_longitude:
        destination_point = fromstr(
            f"POINT({destination_longitude} {destination_latitude})",
            srid=4326,
        )

    recipient_name = details.get("recipient_name")
    recipient_phone = details.get("recipient_phone")

    entity_id = details.get("entity")
    if entity_id:
        entity = Entities.objects.filter(id=entity_id).first()
        if not entity:
            errors.append("Retailer with provided ID does not exist")
    else:
        entity = user.entity

    payment_account_number = details.get("payment_account_number")

    if details.get("shipping_cost") not in (None, ""):
        shipping_cost = _to_decimal(details["shipping_cost"])

    payment_method_id = details.get("payment_method")
    if not payment_method_id:
        errors.append("Payment method is required")
    else:
        payment_method = (
            payments_models_validators.validate_payment_method_exists(
                payment_method_id
            )
        )

    delivery_method = details.get("delivery_method")
    if not delivery_method:
        errors.append("Delivery method is required")

    order_items = details.get("order_items")
    if not order_items:
        errors.append("Order has no items")
        return errors, None

    create_log("info", f"Data items: {order_items}")

    for item in order_items:
        purchased_quantity = _to_int(item.get("purchased_quantity"))
        if purchased_quantity <= 0:
            errors.append("Purchased quantity must be greater than zero")
            return errors, None

        retailer_receipt_id = item.get("retailer_receipt")
        if not retailer_receipt_id:
            errors.append("Product ID is required")
            return errors, None

        retailer_receipt = models.RetailerReceipts.objects.filter(
            id=retailer_receipt_id, current_unit_quantity__gte=0,
        ).first()
        if not retailer_receipt:
            errors.append(
                "Item with provided ID does not exist in inventory"
            )
            return errors, None

        if retailer_receipt.current_unit_quantity < purchased_quantity:
            errors.append(
                f"Only {retailer_receipt.current_unit_quantity} available"
            )
            return errors, None

        if item.get("final_unit_selling_price") in (None, ""):
            errors.append("Final unit selling price is required")
            return errors, None

    if errors:
        return errors, None

    order_number = generate_document_number(
        entity, user, "CUSTOMERORDER",
    )

    try:
        order_created = CustomerOrders.objects.create(
            order_number=order_number,
            payment_account_number=payment_account_number,
            customer_name=f"{user.first_name} {user.last_name}",
            customer_phone=f"{user.phone}",
            order_origin=order_origin,
            delivery_method=delivery_method,
            shipping_cost=shipping_cost,
            draft_id=draft_id,
            selected_payment_method=payment_method,
            owner=user,
            user=user,
            entity=entity,
            customer=customer,
            origin_point=origin_point,
            destination_point=destination_point,
            recipient_name=recipient_name,
            recipient_phone=recipient_phone,
            farness=farness,
        )

        create_log("info", f"Customer order: {order_created}")

        if not order_created:
            errors.append("Order could not be created")
            return errors, None

        for item in order_items:
            purchased_qty = _to_int(item["purchased_quantity"])
            discount_quantity = _to_int(item.get("discount_quantity"))
            final_unit = _to_decimal(item["final_unit_selling_price"])
            discount_unit = _to_decimal(item.get("item_price_discount"))

            retailer_receipt = models.RetailerReceipts.objects.filter(
                id=item["retailer_receipt"],
                current_unit_quantity__gte=purchased_qty,
            ).first()
            if not retailer_receipt:
                errors.append(
                    f"Receipt {item['retailer_receipt']} no longer "
                    f"available for the requested quantity"
                )
                return errors, None

            item_price_total = _q(final_unit * purchased_qty)
            item_price_discount_total = _q(discount_unit * purchased_qty)
            item_net_price = _q(final_unit - discount_unit)
            item_net_price_total = _q(item_net_price * purchased_qty)

            if retailer_receipt.product.is_vatable:
                item_tax = _q(final_unit * Decimal("0.16"))
                item_tax_total = _q(item_tax * purchased_qty)
            else:
                item_tax = Decimal("0.00")
                item_tax_total = Decimal("0.00")

            CustomerOrderItems.objects.create(
                customer_order=order_created,
                retailer_receipt=retailer_receipt,
                unit_of_issue=retailer_receipt.unit_of_receipt,
                purchased_quantity=purchased_qty,
                discount_quantity=discount_quantity,
                total_quantity=purchased_qty + discount_quantity,
                quantity=purchased_qty,
                item_price=final_unit,
                item_price_total=item_price_total,
                item_price_discount=discount_unit,
                item_price_discount_total=item_price_discount_total,
                item_net_price=item_net_price,
                item_net_price_total=item_net_price_total,
                item_tax=item_tax,
                item_tax_total=item_tax_total,
                entity=user.entity,
                owner=user,
            )

        order_created.recalculate()

        errors, order_created = process_customer_order_payment(
            entity,
            order_created,
            payment_method,
            user,
            payment_account_number,
            order_items,
        )
        return errors, order_created

    except Exception as e:
        errors.append(str(e))
        return errors, None

    
            

@transaction.atomic
def update_customer_order(data, user):
    errors = []
    customer_order = None
    payment_method = None
    delivery_method = None
    shipping_cost = None
    bodaboda = None
    status = None

    details = data.get("customer_order_details")
    if not details:
        errors.append("Customer order details are required")
        return errors, None

    customer_order_id = details.get("customer_order")
    if not customer_order_id:
        errors.append("Customer order ID is required")
        return errors, None

    customer_order = CustomerOrders.objects.filter(
        id=customer_order_id,
    ).first()
    if not customer_order:
        errors.append("Customer order with provided ID does not exist")
        return errors, None

    if details.get("payment_method"):
        payment_method = PaymentMethods.objects.filter(
            id=details["payment_method"],
        ).first()
        if not payment_method:
            errors.append("Payment method with provided ID does not exist")
            return errors, None

    if details.get("delivery_method"):
        delivery_method = details["delivery_method"]

    if details.get("shipping_cost") not in (None, ""):
        shipping_cost = _to_decimal(details["shipping_cost"])

    if details.get("bodaboda"):
        bodaboda = BodaLocations.objects.filter(
            owner_id=details["bodaboda"],
        ).first()
        if not bodaboda:
            errors.append("Boda boda does not exist")
            return errors, None

    if details.get("status"):
        status = details["status"]

    changed = []

    if shipping_cost is not None:
        customer_order.shipping_cost = shipping_cost
        changed.append("shipping_cost")

    if payment_method is not None:
        customer_order.selected_payment_method = payment_method
        changed.append("selected_payment_method")

    if delivery_method is not None:
        customer_order.delivery_method = delivery_method
        changed.append("delivery_method")

    if bodaboda is not None and customer_order.delivery_method == "DELIVERY":
        customer_order.bodaboda = bodaboda
        changed.append("bodaboda")

    if status is not None:
        customer_order.status = status
        changed.append("status")

    if changed:
        changed.append("updated")
        customer_order.save(update_fields=changed)

        if "shipping_cost" in changed or "selected_payment_method" in changed:
            customer_order.recalculate()

    return [], customer_order



def get_title(self,item):
    return item.title

def get_customer_order_items(data, user):
    qs = CustomerOrderItems.objects.filter(entity=user.entity)
    today = timezone.now().date()

    if (
        "filters" in data
        and "from_date" in data["filters"]
        and "to_date" in data["filters"]
    ):
        from_date = parse_datetime(
            data["filters"]["from_date"]
        ).strftime("%Y-%m-%d")
        to_date = parse_datetime(
            data["filters"]["to_date"]
        ).strftime("%Y-%m-%d")
        return qs.filter(created__gte=from_date, created__lte=to_date)

    return qs.filter(created__gte=today)

def retrieve_open_indent(user):
    indent =None
    errors =[]
    if RetailerIndent.objects.filter(owner=user,entity=user.entity,is_open="true").exists():
        indent = RetailerIndent.objects.filter(owner=user,entity=user.entity,is_open="true").first()
        return [],indent
    else:
        errors.append("No open indent")
        return errors,None
        

def create_purchases_return(data,user):
    errors =[]
    retailer_receipt =None
    retailer_order=None
    quantity =None
    retailer_order_item =None
    if not "retailer_receipt" in data or data["retailer_receipt"]=="":
        errors.append("Retailer receipt ID is required")
        return errors, None
    else:
        if models.RetailerReceipts.objects.filter(id=data["retailer_receipt"]).exists():
            retailer_receipt = models.RetailerReceipts.objects.filter(id=data["retailer_receipt"]).first()
        else:
            errors.append("No product with provided ID")
            return errors, None
    if not "retailer_order" in data or data["retailer_order"]=="":
        """check"""
        errors.append("Retailer order ID is required")
        return errors, None
    else:
        if RetailerOrders.objects.filter(id=data["retailer_order"],retailer=user.entity).exists():
            retailer_order =RetailerOrders.objects.filter(id=data["retailer_order"],retailer=user.entity).first()
        else:
            errors.append("No retailer order with provided ID")
            return errors, None

    if retailer_receipt and retailer_order:
        if not RetailerOrderItems.objects.filter(retailer_order=retailer_order,wholesaler_receipt__product=retailer_receipt.product).exists():
            errors.append("This product was not in the selected requisition")
            return errors,None
    
        else:
            retailer_order_item = RetailerOrderItems.objects.filter(retailer_order=retailer_order,wholesaler_receipt__product=retailer_receipt.product).first()
      
        
    else:
        errors.append("Iko shida")
        """Chandgdgdgdg"""
        return errors,None



    if not "quantity" in data or data["quantity"]=="":
        errors.append("Quantity is required")
        return errors, None
    else:
        quantity = data["quantity"]==""

        if quantity > retailer_receipt.current_unit_quantity:
            errors.append(f"Only {retailer_receipt.current_unit_quantity} are currently in inventory")
            return errors, None
        
        if quantity >retailer_order_item.total_quantity:
            errors.append(f"Original order had {retailer_order_item.total_quantity}units. You are are returning {quantity}")
            return errors, None
        
    if not "justification" in data or data["justification"]=="":
        errors.append("Justification is required")
        return errors, None
    

    try:
        created = models.PurchasesReturns.objects.create(
            entity=user.entity,
            owner=user,
            retailer_receipt=retailer_receipt,
            retailer_order=retailer_order,
            quantity=data["quantity"],
            justification=data["justification"]
        )

        if created:
            create_log("info", f"{created} was created")
            retailer_receipt.current_unit_quantity=retailer_receipt.current_unit_quantity-1
            retailer_receipt.save()
        
            return [], created
        else:
            errors.append("Failed to create")
            return errors, None


    except Exception as e:
        errors.append(str(e))
        return errors, None
    

def create_sales_return(data,user):
    errors =[]
    retailer_receipt =None
    customer_receipt =None
    customer_order_item =None
    quantity =None
    if not "retailer_receipt" in data or data["retailer_receipt"]=="":
        errors.append("Retailer receipt ID is required")
        return errors, None
    else:
        if models.RetailerReceipts.objects.filter(id=data["retailer_receipt"]).exists():
            retailer_receipt = models.RetailerReceipts.objects.filter(id=data["retailer_receipt"]).first()
        else:
            errors.append("No product with provided ID")
            return errors, None
    
    if not "customer_order" in data or data["customer_order"]=="":
        errors.append("Retailer receipt ID is required")
        return errors, None
    else:
        if models.CustomerOrders.objects.filter(id=data["customer_order"]).exists():
            customer_order = models.CustomerOrders.objects.filter(id=data["customer_order"]).first()

            if not CustomerOrderItems.objects.filter(customer_order=customer_order,retailer_receipt=retailer_receipt).exists():
                errors.append("This product was not in the selected order")
                return errors,None
            else:
                customer_order_item = CustomerOrderItems.objects.filter(customer_order=customer_order,retailer_receipt=retailer_receipt).first()    
        else:
            errors.append("No product with provided ID")
            return errors, None
    
    
    if not "quantity" in data or data["quantity"]=="":
        errors.append("Quantity is required")
        return errors, None

    else:
        quantity = data["quantity"]


        if int(quantity)>int(customer_order_item.purchased_quantity):
            errors.append(f"Original order had {customer_order_item.purchased_quantity} units. You are are returning {quantity}")
            return errors, None

    if not "justification" in data or data["justification"]=="":
        errors.append("Justification is required")
        return errors, None
    
    try:
        created = models.SalesReturns.objects.create(
            entity=user.entity,
            owner=user,
            retailer_receipt=retailer_receipt,
            customer_order=customer_order,
            quantity=data["quantity"],
            justification=data["justification"]
        )

        if created:
            return [], created


    except Exception as e:
        errors.append(str(e))
        return errors, None
    
def create_stock_adjustment(data,user):
    errors =[]
    retailer_receipt =None
    if not "retailer_receipt" in data or data["retailer_receipt"]=="":
        errors.append("Retailer receipt ID is required")
        return errors, None
    else:
        if models.RetailerReceipts.objects.filter(id=data["retailer_receipt"]).exists():
            retailer_receipt = models.RetailerReceipts.objects.filter(id=data["retailer_receipt"]).first()
        else:
            errors.append("No product with provided ID")
            return errors, None
    
    if not "quantity" in data or data["quantity"]=="":
        errors.append("Quantity is required")
        return errors, None

    if not "justification" in data or data["justification"]=="":
        errors.append("Justification is required")
        return errors, None
    
    if not "direction" in data or data["direction"]=="":
        errors.append("Adjustment direction is required")
        return errors, None
    
    if data["direction"] not in ["INCREMENT","DECREMENT"]:
        errors.append("Invalid adjustment direction")
        return errors, None
    if data["direction"] == "DECREMENT":
        if int(data["quantity"])>int(retailer_receipt.current_unit_quantity):
            errors.append(f"Only {retailer_receipt.current_unit_quantity} are currently in inventory")
            return errors, None
    
    try:
        created = models.StockAdjustments.objects.create(
            entity=user.entity,
            owner=user,
            retailer_receipt=retailer_receipt,
            quantity=data["quantity"],
            justification=data["justification"],
            direction=data["direction"]
        )

        if created:
            if created.direction =="INCREMENT":
                retailer_receipt.current_unit_quantity=int(retailer_receipt.current_unit_quantity)+int(data["quantity"])
                retailer_receipt.save()
            elif created.direction =="DECREMENT":
                retailer_receipt.current_unit_quantity=int(retailer_receipt.current_unit_quantity)-int(data["quantity"])
                retailer_receipt.save()
            else:
                pass
            return [], created


    except Exception as e:
        errors.append(str(e))
        return errors, None

def search_customer_orders(data,user):
    # TODO: reference search with Q
    """ Filter with Q  """
    search_param = None
    errors=[]
    retailer_orders=[]
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError(
                "Search parameter cannot be empty")
        else:
            if CustomerOrders.objects.filter(
                Q(order_number__document_number__icontains=search_param)
              ,
                entity=user.entity
            ).exists():

                customer_orders = CustomerOrders.objects.filter(
                    Q(order_number__document_number__icontains=search_param)
                ,
                    entity=user.entity
                ).all()

                return customer_orders
            else:
                return []
            
    except Exception as e:
        errors.append(str(e))
        raise exceptions.ValidationError(errors)
