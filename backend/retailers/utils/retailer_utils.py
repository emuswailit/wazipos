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


def create_retailer_receipts(item, retailer_order_obj, user):
    errors = []
    try:
        retailer_receipt = RetailerReceipts.objects.create(
            unit_selling_price=item.wholesaler_receipt.unit_selling_price,
            pack_buying_price=item.item_price,
            pack_quantity=item.total_quantity,
            current_unit_quantity=item.total_quantity
            * item.wholesaler_receipt.product.units_per_pack,
            entity=user.entity,
            owner=user,
            product=item.wholesaler_receipt.product,
            retailer_order=retailer_order_obj,
           
        )

        return retailer_receipt
    except IntegrityError as e:
        errors.append(e)

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

def get_wholesale_offers_for_product(prod):
    wholesaler_offerings=[]
    if WholesalerReceipts.objects.filter(product = prod,pack_quantity__gte=0).exists():
            wholesaler_inventory = WholesalerReceipts.objects.filter(product = prod,pack_quantity__gte=0).all().order_by('-unit_selling_price')[:3]
            if len(wholesaler_inventory)>0:

                for wi  in wholesaler_inventory:
                    price_discount=[]
                    quantity_discount=[]
                    price_discount_banners =[]
                    quantity_discount_banners =[]
                    if WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=wi,is_active="true").exists():
                        wpd=WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=wi,is_active="true").first()
                        if WholesalerPriceDiscountBanners.objects.filter(wholesaler_price_discount=wpd).exists():
                            price_discount_banners_qs = WholesalerPriceDiscountBanners.objects.filter(wholesaler_price_discount=wpd).all()
                            for pdbq in price_discount_banners_qs:
                                banner ={
                                    "banner": pdbq.price_discount_banner.url
                                }

                                price_discount_banners.append(banner)
  
                        price_discount={

                            "id":wpd.id,
                            "title":wpd.title,
                            "percent":wpd.percent,
                            "normal_price":wpd.normal_price,
                            "offer_price":wpd.offer_price,
                            "is_active":wpd.is_active,
                            "start":wpd.start,
                            "end":wpd.end,
                            "banners": price_discount_banners
                        }
                    if WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=wi,is_active="true").exists():
                        wqd=WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=wi,is_active="true").first()
                       
                        if WholesalerQuantityDiscountBanners.objects.filter(wholesaler_quantity_discount=wqd).exists():
                            quantity_discount_banners_qs = WholesalerQuantityDiscountBanners.objects.filter(wholesaler_quantity_discount=wqd).all()
                            for pdbq in quantity_discount_banners_qs:
                                banner1 ={
                                    "banner": pdbq.quantity_discount_banner.url
                                }

                                quantity_discount_banners.append(banner1)

                        quantity_discount={

                            "id":wqd.id,
                            "title":wqd.title,
                            "percent":wqd.percent,
                            "limit_quantity":wqd.limit_quantity,
                            "awarded_quantity":wqd.awarded_quantity,
                            "is_active":wqd.is_active,
                            "start":wqd.start,
                            "end":wqd.end,
                            "banners": quantity_discount_banners
                        }
                
                    # stringified =""
                    # if  wi.quantity_discounts.count()>0:
                    #     for i in wi.quantity_discounts.all():
                    #         stringified = stringified + i.title + ","
                    wiObj = {
                        "wholesale_inventory_id": wi.id,
                        "wholesale_id": wi.entity.id,
                        "wholesale_title": wi.entity.title,
                        "pack_quantity":wi.pack_quantity,
                        "unit_selling_price":wi.unit_selling_price,
                        "price_discount":price_discount,
                        "quantity_discount":quantity_discount,
                        "manufacture_date":wi.manufacture_date,
                        "expiry_date":wi.expiry_date
                    }
                    wholesaler_offerings.append(wiObj)
                    


    return wholesaler_offerings

def get_unique_products(item):
    return item.product


def get_current_balance(prod):
    quantity =0
    if RetailerReceipts.objects.filter(product=prod,current_unit_quantity__gte=0).exists():
        with_stock = RetailerReceipts.objects.filter(product=prod,current_unit_quantity__gte=0).all()
        for i in with_stock:
            quantity = quantity + i.current_unit_quantity
    return quantity


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


def get_product_movement(data,user):
    product_entries = []
    product_id=None
    product=None
    from_date = None
    to_date = None
    retailer_receipts_in_range=[]
    customer_order_items_in_range=[]
    product_movements=[]

    if "product" in data and not data["product"]==None:
        product_id = data["product"]
        product = product_models_validator.validate_product(product_id)
    else:
        raise exceptions.ValidationError("Product ID is required")
    
    if RetailerReceipts.objects.filter(product=product,entity=user.entity,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).exists():
        retailer_receipts_in_range=RetailerReceipts.objects.filter(product=product,entity=user.entity, created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).all()
        
    if CustomerOrderItems.objects.filter(retailer_receipt__product=product,entity=user.entity,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).exists():
        customer_order_items_in_range=CustomerOrderItems.objects.filter(retailer_receipt__product=product,entity=user.entity,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).all()
        
    if ProductMovement.objects.filter(product=product,entity=user.entity,owner=user).exists():
        product_movements=ProductMovement.objects.filter(product=product,entity=user.entity,owner=user).all()
        for pm in product_movements:
            pm.delete()
    if len(retailer_receipts_in_range)>0:

        for rrir in retailer_receipts_in_range:

            movement= ProductMovement.objects.create(product=product,transaction_date=rrir.created,quantity=rrir.current_unit_quantity,direction="RECEIPT",retailer_receipt=rrir,customer_order_item=None,owner=rrir.owner,entity=user.entity)

    if len(customer_order_items_in_range)>0:
 

        for coiir in customer_order_items_in_range:
            movement= ProductMovement.objects.create(product=product,transaction_date=coiir.created,quantity=coiir.total_quantity,direction="ISSUE",retailer_receipt=None,customer_order_item=coiir,owner=coiir.owner,entity=user.entity)


    if  ProductMovement.objects.filter(product=product,entity=user.entity,owner=user).exists():
        total_receipts =0
        total_issues=0
        product_movements=ProductMovement.objects.filter(product=product,entity=user.entity,owner=user).all().order_by("transaction_date")

        for pm in product_movements:
            balance=0
            if pm.direction=="RECEIPT":
                total_receipts=total_receipts+pm.quantity
                print("total_receipts")
                print(total_receipts)
            elif pm.direction=="ISSUE":
                total_issues=total_issues+pm.quantity
                print("total_issues")
                print(total_issues)
            balance=total_receipts-total_issues
            pm.balance=balance
            pm.save()
        return product_movements.order_by("-transaction_date")
    else:
        return []



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

# Validate data
def validate_retailer_receipt_data(data, user):
    errors = []
    product = None
    bar_code = ""
    received_from_id = (None,)
    received_from_obj = None
    employee = (None,)
    manufacture_date = None
    expiry_date = None

    received_unit_quantity=None
    batch =None

    if Employees.objects.filter(
        user=user, entity=user.entity, is_active="true"
    ).exists():
        employee = Employees.objects.filter(
            user=user, entity=user.entity, is_active="true"
        ).first()
    else:
        return custom_error_message( f"You are not an active employee at {titlecase(user.entity.title)}")
        # raise exceptions.ValidationError(
        #     f"You are not an active employee at {titlecase(user.entity.title)}"
        # )


    try:
        received_unit_quantity = data["retailer_receipt_details"]["received_unit_quantity"]
        if data["retailer_receipt_details"]["received_unit_quantity"] == "" or int(data["retailer_receipt_details"]["received_unit_quantity"])<1:
            errors.append("Unit quantity cannot be empty")
    except KeyError:
        errors.append("Received unit quantity is required")

    try:
        product_id = data["retailer_receipt_details"]["product"]
        if product_id == "":
            errors.append("Product ID cannot be empty")
        if Products.objects.filter(id=product_id).exists():
            product = Products.objects.filter(id=product_id).first()
            if not product.category in user.entity.categories.all():
                raise exceptions.ValidationError(
                    f"{product.title} is not under any of your authorized categories"
                )
        else:
            raise exceptions.ValidationError("Product with supplied ID does not exist")

    except KeyError:
        errors.append("Product ID is required")
    if product.preparation:
        try:
            manufacture_date = data["retailer_receipt_details"]["manufacture_date"]
            if data["retailer_receipt_details"]["manufacture_date"] == "":
                errors.append("Manufacture date cannot be empty")
        except KeyError:
            errors.append("Manufacture date is required is required")

        try:
            expiry_date = data["retailer_receipt_details"]["expiry_date"]
            if data["retailer_receipt_details"]["expiry_date"] == "":
                errors.append("Expiry date cannot be empty")
        except KeyError:
            errors.append("Expiry date is required is required")

    # if "loose_units_quantity" in data["retailer_receipt_details"]:
    #     loose_units_quantity = data["retailer_receipt_details"]["loose_units_quantity"]

    #     if int(loose_units_quantity) > 0:
    #         if int(loose_units_quantity) >= int(product.units_per_pack):
    #             errors.append(
    #                 "Loose units cannot be equal to or more than a full pack size"
    #             )
    #     else:
    #         pass
    # else:
    #     pass

    # try:
    #     pack_quantity = data["retailer_receipt_details"]["pack_quantity"]
    #     if data["retailer_receipt_details"]["pack_quantity"] == "":
    #         errors.append("Pack quantity cannot be empty")

    # except KeyError:
    #     errors.append("Pack quantity is required")

 
    


    try:
        unit_selling_price = data["retailer_receipt_details"]["unit_selling_price"]
        if data["retailer_receipt_details"]["unit_selling_price"] == "":
            errors.append("Unit selling price cannot be empty")

    except KeyError:
        errors.append("Unit selling price is required")


    if "received_from" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["received_from"]=="":
        received_from_id = data["retailer_receipt_details"]["received_from"]
        if not received_from_id == "":
            received_from_obj = validate_entity(received_from_id)
    else:
        pass

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_retailer_receipt_directly(data, user):
    errors =[]
    manufacture_date = None
    expiry_date = None
    received_from_id = None
    received_from = None
    employee = None
    bar_code=""
    retailer_order_item=None
    unit_of_receipt=None
    unit_selling_price=0
    batch=None
    unit_price_discount=0
    final_unit_selling_price=0.00
    if Employees.objects.filter(
        user=user, entity=user.entity, is_active="true"
    ).exists():
        employee = Employees.objects.filter(
            user=user, entity=user.entity, is_active="true"
        ).first()
        print("employee", employee.id)
    else:
        errors.append( f"You are not an active employee at {titlecase(user.entity.title)}")
        return errors,None
        # return custom_error_message( f"You are not an active employee at {titlecase(user.entity.title)}")
        # raise exceptions.ValidationError(
        #     f"You are not an active employee at {user.entity.title}"
        # )

    if ("manufacture_date" in data["retailer_receipt_details"] and
        data["retailer_receipt_details"]["manufacture_date"]
        and not data["retailer_receipt_details"]["manufacture_date"] == ""
    ):
        manufacture_date = data["retailer_receipt_details"]["manufacture_date"]

    if ("expiry_date" in data["retailer_receipt_details"] and
        data["retailer_receipt_details"]["expiry_date"]
        and not data["retailer_receipt_details"]["expiry_date"] == ""
    ):
        expiry_date = data["retailer_receipt_details"]["expiry_date"]
    


    if "received_from" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["received_from"]=="":
        received_from_id = data["retailer_receipt_details"]["received_from"]
        if not received_from_id == "":
            received_from = validate_entity(received_from_id)

    if "retailer_order_item" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["retailer_order_item"]=="":
        retailer_order_item_id = data["retailer_receipt_details"]["retailer_order_item"]
        if RetailerOrderItems.objects.filter(id=retailer_order_item_id).exists():
            retailer_order_item=RetailerOrderItems.objects.filter(id=retailer_order_item_id).first()

            # Check if order item is already received
            if retailer_order_item and retailer_order_item.is_received=="true":
                errors.append("Item is already received into inventory")
                return errors,None
            if not retailer_order_item.retailer_order.status=="RECEIVED":
                errors.append("Order status for this item is not yet set to RECEIVED ")
                return errors,None
    
    
    if "received_unit_quantity" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["received_unit_quantity"]=="":
        received_unit_quantity = int(data["retailer_receipt_details"]["received_unit_quantity"])
    
    

       
    if "unit_selling_price" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["unit_selling_price"]=="":
        unit_selling_price = float(data["retailer_receipt_details"]["unit_selling_price"] )
    
    if ("unit_price_discount" in data["retailer_receipt_details"] and
        data["retailer_receipt_details"]["unit_price_discount"]
        and not data["retailer_receipt_details"]["unit_price_discount"] == ""
    ):
        unit_price_discount = float(data["retailer_receipt_details"]["unit_price_discount"])

        final_unit_selling_price=unit_selling_price-unit_price_discount
    else:
        final_unit_selling_price=unit_selling_price
   
    if "unit_of_receipt" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["unit_of_receipt"]=="":
        unit_of_receipt = data["retailer_receipt_details"]["unit_of_receipt"]  
    

    product_id = data["retailer_receipt_details"]["product"]
    if Products.objects.filter(id=product_id).exists():
        product = Products.objects.get(id=product_id)
    if "batch" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["batch"]=="":
        batch = data["retailer_receipt_details"]["batch"]
    
    if "bar_code" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["bar_code"]=="":
        bar_code = data["retailer_receipt_details"]["bar_code"]



    try:

        a_minute_ago = datetime.datetime.now() - datetime.timedelta(minutes=1)
        #     print("a_minute_ago", a_minute_ago)
            # print('created ago', item.created)

        if RetailerReceipts.objects.filter(
            product_id=product_id,
            received_unit_quantity=received_unit_quantity,
            created__gte=a_minute_ago,
        ).exists():

            errors.append(
                f"You added similar item 1 minutes ago"
            )

            return errors,None
        else:
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
                retailer_order_item=retailer_order_item,
                unit_selling_price=unit_selling_price,
                units_per_pack=product.units_per_pack,
                unit_price_discount=unit_price_discount,
                final_unit_selling_price=final_unit_selling_price,
       
                
            )

            if created:
                if retailer_order_item:
                    retailer_order_item.is_received="true"
                    retailer_order_item.save()

                return [], created

    except Exception as e:
        errors.append(str(e))
        return errors,None


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
    retailer_receipt = None
    current_unit_quantity = 0
    bar_code = None
    batch = None
    received_from = None
    unit_buying_price = 0.00
    unit_selling_price = 0.00
    manufacture_date = ""
    expiry_date = ""
    quantity_discount = None
    is_active = None
    unit_of_receipt = None
    unit_price_discount = 0.00
    final_unit_selling_price = 0.00

    if "is_active" in data["retailer_receipt_details"]:
        if data["retailer_receipt_details"]["is_active"]:
            is_active = data["retailer_receipt_details"]["is_active"]
    if "current_unit_quantity" in data["retailer_receipt_details"]:
        if data["retailer_receipt_details"]["current_unit_quantity"]:
            current_unit_quantity = int(data["retailer_receipt_details"]["current_unit_quantity"])

    if "received_from" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["received_from"]=="":
        if data["retailer_receipt_details"]["received_from"]:
            received_from_id = data["retailer_receipt_details"]["received_from"]
            received_from = validate_entity(received_from_id)


    if "unit_selling_price" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["unit_selling_price"]=="":
        if data["retailer_receipt_details"]["unit_selling_price"]:
            unit_selling_price = float(data["retailer_receipt_details"]["unit_selling_price"])
    

    if "unit_buying_price" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["unit_buying_price"]=="":
        if data["retailer_receipt_details"]["unit_buying_price"]:
            unit_buying_price = float(data["retailer_receipt_details"]["unit_buying_price"])

    if "batch" in data["retailer_receipt_details"]:
        if data["retailer_receipt_details"]["batch"]:
            batch = data["retailer_receipt_details"]["batch"]

    if "bar_code" in data["retailer_receipt_details"]:
        if data["retailer_receipt_details"]["bar_code"]:
            bar_code = data["retailer_receipt_details"]["bar_code"]

    if "unit_price_discount" in data["retailer_receipt_details"] and not data["retailer_receipt_details"]["unit_price_discount"]=="":
        if data["retailer_receipt_details"]["unit_price_discount"]:
            unit_price_discount = float(data["retailer_receipt_details"]["unit_price_discount"])

    if "manufacture_date" in data["retailer_receipt_details"]:
        if data["retailer_receipt_details"]["manufacture_date"]:
            manufacture_date = data["retailer_receipt_details"]["manufacture_date"]
    if "expiry_date" in data["retailer_receipt_details"]:
        if data["retailer_receipt_details"]["expiry_date"]:
            expiry_date = data["retailer_receipt_details"]["expiry_date"]

    if "unit_of_receipt" in data["retailer_receipt_details"]:
        if data["retailer_receipt_details"]["unit_of_receipt"]:
            unit_of_receipt = data["retailer_receipt_details"]["unit_of_receipt"]
    try:
        if RetailerReceipts.objects.filter(id=data["retailer_receipt"]).exists():
            print("Retailer receipt iko")
            retailer_receipt = RetailerReceipts.objects.get(id=data["retailer_receipt"])

            if current_unit_quantity and current_unit_quantity>0:
                retailer_receipt.current_unit_quantity = current_unit_quantity
                retailer_receipt.save()
              
      
            if unit_of_receipt:
                retailer_receipt.unit_of_receipt = unit_of_receipt
                retailer_receipt.save()


            if received_from:
                retailer_receipt.received_from = received_from
                retailer_receipt.save()


            if unit_selling_price:
                retailer_receipt.unit_selling_price = unit_selling_price
                retailer_receipt.save()
                
            if unit_buying_price:
                retailer_receipt.unit_buying_price = unit_buying_price
                retailer_receipt.save()
            
            if unit_price_discount:
                retailer_receipt.unit_price_discount = unit_price_discount
                retailer_receipt.final_unit_selling_price = retailer_receipt.unit_selling_price - unit_price_discount
                retailer_receipt.save()

            if batch:
                retailer_receipt.batch = batch
                retailer_receipt.save()

            if bar_code:
                if not retailer_receipt.product.bar_code:
                    retailer_receipt.product.bar_code = bar_code
                    retailer_receipt.product.save()
                retailer_receipt.bar_code=bar_code
                retailer_receipt.save()


            if manufacture_date:
                retailer_receipt.manufacture_date = manufacture_date
                retailer_receipt.save()
            if expiry_date:
                retailer_receipt.expiry_date = expiry_date
                retailer_receipt.save()


            # Fire notification to followers
            if quantity_discount:
                retailer_receipt.quantity_discount_id = quantity_discount
                retailer_receipt.save()
            if is_active:
                retailer_receipt.is_active = is_active
                retailer_receipt.save()
            return retailer_receipt
    except Exception as e:
        raise exceptions.ValidationError(e)


# New beginnings

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
def create_estimate_indent(data,user):

    errors=[]
    lead_time=None
    order_days=None
    indent_items=None
    retailer_indent=None
    discount_quantity=0.00
    price_discount=0.00
   

    if not "order_days" in data or data["order_days"]==None:
        errors.append("Number of days the order inventory is projected to last is required")
        return errors, None
    else:
        order_days=data['order_days']


    if not "lead_time" in data or data["lead_time"]==None:
        errors.append("Lead time is required")
        return errors, None
    else:
        lead_time = data['lead_time']

    if not "indent_items" in data or data["indent_items"]==[]:
        errors.append("Add indent items")
        return errors, None
    else:
        indent_items = data["indent_items"]



    indent_number = generate_document_number(user.entity, user,"INDENT")
    retailer_indent = RetailerIndent.objects.create(
            indent_number=indent_number,
            owner=user, 
            is_open ="true",
            order_days=order_days,
            lead_time=lead_time,
            entity=user.entity
            )
    

    for item in indent_items:
        print(indent_items)
        created = RetailerIndentItem.objects.create(owner=user,
    
                                        wholesale_receipt_id=item['offer_id'], 
                                        required_quantity =item['required_estimate'], 
                                        total_quantity =item['required_estimate'], 
                                        retailer_indent=retailer_indent,
                                       entity=user.entity)
    
        
    if RetailerIndentItem.objects.filter(retailer_indent=retailer_indent).exists():
            indent_items =RetailerIndentItem.objects.filter(retailer_indent=retailer_indent).all()

            create_log("info", f"Indent items: {indent_items}")

            unique_wholesalers= list(set(map(get_wholesaler_from_indent_item, indent_items)))
            print("unique_wholesalers",unique_wholesalers)

            for wholesaler in unique_wholesalers:
                unique_wholesale_items = get_indent_items_for_wholesaler(wholesaler,indent_items)
                print("unique_wholesale_items",unique_wholesale_items)
                if len(unique_wholesale_items)>0:
                    document_number = generate_document_number(user.entity,user,"RETAILERORDER")
                    retailer_order = RetailerOrders.objects.create(document_number=document_number,owner=user,retailer=retailer_indent.entity,wholesaler=wholesaler,entity=user.entity,status="SUBMITTED",order_origin="RETAILER")
                    if retailer_order:
                        for item in unique_wholesale_items:
                            if WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=item.wholesale_receipt).exists():
                                quantity_discounts = WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=item.wholesale_receipt).all()

                                for qd in quantity_discounts:
                                    #TODO: Refine the price discount code
                                    if int(item.required_quantity) < int(qd.limit_quantity):
                                        if (int(item.required_quantity) % int(qd.limit_quantity)) <qd.limit_quantity:
                                            discount_quantity=qd.awarded_quantity

                            if WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=item.wholesale_receipt).exists():
                                price_discount =WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=item.wholesale_receipt).first()
                            
                            
                            created_item = RetailerOrderItems.objects.create(
                                retailer_order=retailer_order,
                                wholesaler_receipt=item.wholesale_receipt,
                                purchased_quantity=item.required_quantity,
                                entity =retailer_indent.entity,
                                discount_quantity=discount_quantity,
                                total_quantity=item.required_quantity+ discount_quantity,
                                item_price_total=float(item.required_quantity)*float(item.wholesale_receipt.unit_selling_price),
                                owner =user,
                                item_net_price =float(item.wholesale_receipt.unit_selling_price)
                                )
                            
                        

                    else:
                        errors.append("Retailer order not created")
                        return errors,None
    return [], retailer_indent





@transaction.atomic
def create_retailer_indent(data, user):
    errors=[]
    lead_time=None
    order_days=None
    existing = None

    if not "order_days" in data or data["order_days"]==None:
        errors.append("Number of days the order inventory is projected to last is required")
        return errors, None
    else:
        order_days=data['order_days']


    if not "lead_time" in data or data["lead_time"]==None:
        errors.append("Lead time is required")
        return errors, None
    else:
        lead_time = data['lead_time']

    order_days=data["order_days"]
    if RetailerIndent.objects.filter(owner=user,is_open="true",entity=user.entity).exists():
        existing = RetailerIndent.objects.filter(owner=user,is_open="true",entity=user.entity).first()
        existing.lead_time= lead_time
        existing.order_days= order_days
        existing.save()
        
        return [], existing
    else:
        indent_number = generate_document_number(user.entity, user,"INDENT")
        created = RetailerIndent.objects.create(
            indent_number=indent_number,
            owner=user, 
            is_open ="true",
            order_days=order_days,
            lead_time=lead_time,
            entity=user.entity
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
    from wholesalers.models import RetailerOrders,RetailerOrderItems,WholesalerQuantityDiscounts
    errors=[]
    indent_id =None
    indent=None
    indent_items =None
    discount_quantity=0.00
    unique_wholesalers =[]
    if not "indent" in data or data["indent"]==None:
        errors.append("Indent ID is required")
        return errors, None
    else:
        indent_id= data["indent"]
    if RetailerIndent.objects.filter(id=indent_id).exists():
        indent =RetailerIndent.objects.filter(id=indent_id).first()
        if indent.is_open=="false":
            errors.append("Indent is already closed")
            return errors,None
        



        if RetailerIndentItem.objects.filter(retailer_indent=indent).exists():
            indent_items =RetailerIndentItem.objects.filter(retailer_indent=indent).all()
    
            unique_wholesalers= list(set(map(get_wholesaler_from_indent_item, indent_items)))
            create_log("info",f"Wholesalers{unique_wholesalers}")

            for wholesaler in unique_wholesalers:
                unique_wholesale_items = get_indent_items_for_wholesaler(wholesaler,indent_items)
                print("unique_wholesale_items",unique_wholesale_items)
                if len(unique_wholesale_items)>0:
                    document_number = generate_document_number(user.entity,user,"RETAILERORDER")
                    retailer_order = RetailerOrders.objects.create(document_number=document_number,owner=user,retailer=indent.entity,wholesaler=wholesaler,entity=user.entity,status="SUBMITTED",order_origin="RETAILER")
                    if retailer_order:
                        for item in unique_wholesale_items:
                            if WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=item.wholesale_receipt).exists():
                                quantity_discounts = WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=item.wholesale_receipt).all()

                                for qd in quantity_discounts:
                                    #TODO: Refine the price discount code
                                    if int(item.required_quantity) < int(qd.limit_quantity):
                                        if (int(item.required_quantity) % int(qd.limit_quantity)) <qd.limit_quantity:
                                            discount_quantity=qd.awarded_quantity

                            if WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=item.wholesale_receipt).exists():
                                price_discount =WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=item.wholesale_receipt).first()
                            
                            
                            created_item = RetailerOrderItems.objects.create(
                                retailer_order=retailer_order,
                                wholesaler_receipt=item.wholesale_receipt,
                                purchased_quantity=item.required_quantity,
                                entity =indent.entity,
                                discount_quantity=discount_quantity,
                                total_quantity=item.required_quantity+ discount_quantity,
                                item_price_total=float(item.required_quantity)*float(item.wholesale_receipt.unit_selling_price),
                                owner =user,
                                item_net_price =float(item.wholesale_receipt.unit_selling_price)
                                )
                            
                        

                    else:
                        errors.append("Retailer order not created")
                        return errors,None
                    
       
            indent.is_open="false"
            indent.save()
            return [],indent
    
        else:
            errors.append("Indent has no items")
            return errors,None
    
    else:
        errors.append("Indent with provided ID does not exist()")
        return errors,None




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

@transaction.atomic
def create_retailer_indent_item(data, user):
    errors=[]
    required_quantity=None
    retailer_indent =None
    indenting_criteria=None
    wholesale_receipt = None
    wholesaler_price_discount=None
    wholesaler_quantity_discount=None

    if not "retailer_indent" in data or data["retailer_indent"]=="":
        errors.append("Indent  ID is required")

    else:
       
        if RetailerIndent.objects.filter(id=data["retailer_indent"]).exists():
            retailer_indent = RetailerIndent.objects.filter(id=data["retailer_indent"]).first()
            if retailer_indent.is_open=="false":
                retailer_indent=create_retail_indent(user)  
        else:
            retailer_indent=create_retail_indent(user)
            
    
    if not "wholesale_receipt" in data or data["wholesale_receipt"]=="":
        errors.append("Wholesale product ID is required")
       
    else:
        wholesale_receipt=wholesalers_models_validators.validate_wholesaler_receipt(data["wholesale_receipt"])
    
    
    if not "required_quantity" in data or data["required_quantity"]==0:
        errors.append("Quantity is required")  
       
    else:
        required_quantity=data["required_quantity"]  

    if "indenting_criteria" in data:
        indenting_criteria=data["indenting_criteria"]

    # if  "wholesaler_price_discount" in data and  not data["wholesaler_price_discount"]=="":
    #     wholesaler_price_discount= wholesalers_models_validators.validate_wholesaler_price_discount(data["wholesaler_price_discount"])

    # if  "wholesaler_quantity_discount" in data and  not data["wholesaler_quantity_discount"]=="":
    #     wholesaler_quantity_discount= wholesalers_models_validators.validate_wholesaler_quantity_discount(data["wholesaler_quantity_discount"])
        
    
    if len(errors)>0:
        return errors, None
    else:
        # If a similar product is in indent then update quantity
        if RetailerIndentItem.objects.filter(
                                                    wholesale_receipt=wholesale_receipt, 
                                                    retailer_indent=retailer_indent,
                                                    entity=user.entity).exists():
            rii= RetailerIndentItem.objects.filter(owner=user,
                                                    wholesale_receipt=wholesale_receipt, 

                                                    retailer_indent=retailer_indent,
                                                    entity=user.entity).first()
            rii.required_quantity=required_quantity
            rii.save()
            print("Updated indent items", rii)
            return [], rii
        else:
            created = RetailerIndentItem.objects.create(owner=user,
                
                                                    wholesale_receipt=wholesale_receipt, 
                                                    required_quantity =required_quantity, 
                                                    retailer_indent=retailer_indent,
                                                    wholesaler_price_discount=wholesaler_price_discount,
                                                    wholesaler_quantity_discount=wholesaler_quantity_discount,
                                                    indenting_criteria=indenting_criteria,entity=user.entity)
            print("Created new indent items", created)
            return [], created

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
    retailer_order_items = RetailerOrderItems.objects.filter(retailer_order=retailer_order).all()
    for roi in retailer_order_items:
        wholesaler_receipt = WholesalerReceipts.objects.filter(id=roi.wholesaler_receipt.id).first()
        if wholesaler_receipt:
            wholesaler_receipt.pack_quantity=wholesaler_receipt.pack_quantity-roi.total_quantity
            wholesaler_receipt.save()

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
def make_customer_order_payment(data,user):
    errors =[]
    customer_order_id=None
    customer_order=None
    payment_method_id=None
    customer_order=None
    payment_method=None
    mobile_money_phone=None
    reference_number =None
    order_items =[]
    if not "customer_order" in data or data['customer_order']==None:
        errors.append("Retailer order ID is required")
        return errors,None
    else:
        customer_order_id = data['customer_order']
        if CustomerOrders.objects.filter(id=customer_order_id).exists():
            customer_order=CustomerOrders.objects.filter(id=customer_order_id).first()
        else:
            errors.append("Customer order for provided ID does not exist")
            return errors,None
    
    if customer_order:
        if CustomerOrderItems.objects.filter(customer_order=customer_order).exists():
            order_items =  CustomerOrderItems.objects.filter(customer_order=customer_order).all()
    
    if not "payment_method" in data or data['payment_method']==None:
        errors.append("Payment method ID is required")
        return errors,None
    else:
        payment_method_id=data['payment_method']


    if "mobile_money_phone" in data and not data['mobile_money_phone']==None:
        mobile_money_phone=data['mobile_money_phone']

        

    if CustomerOrderPayment.objects.filter(customer_order=customer_order,status="SUCCESS",is_validated=True).exists():
        errors.append("Order is already paid")
        return errors,None
    else:
        customer_order_payments = CustomerOrderPayment.objects.filter(customer_order=customer_order).all()
        for payment in customer_order_payments:
            payment.is_validated=True
            payment.save()

    if PaymentMethods.objects.filter(id=payment_method_id).exists():
        payment_method=PaymentMethods.objects.filter(id=payment_method_id).first()
    else:
        errors.append("Payment method with provided ID does not exist!")
        return errors,None

    reference_number=generate_reference_number(customer_order.entity,user)
    errors,customer_order = process_customer_order_payment(customer_order.entity,customer_order,payment_method,user,mobile_money_phone,order_items)
    if customer_order:

        return [],customer_order
    else:
       
        return errors,None

    # created = RetailerOrderPayments.objects.create()

    



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
    customer_order_items =[]
    order_price_total =0.00
    if models.CustomerOrderItems.objects.filter(customer_order=customer_order).exists():
        customer_order_items= models.CustomerOrderItems.objects.filter(customer_order=customer_order).all()
        for item in customer_order_items:
            if item.retailer_receipt.unit_price_discount:
                order_price_total+=float(item.purchased_quantity)*(float(item.retailer_receipt.unit_selling_price)-float(item.retailer_receipt.unit_price_discount))
            else:
                order_price_total+=float(item.purchased_quantity)*float(item.retailer_receipt.unit_selling_price)
    else:
        return 0.00
         
    if customer_order.shipping_cost and customer_order.shipping_cost>0.00:
        order_price_total+=customer_order.shipping_cost
    return order_price_total



# Process customer order payment
def process_customer_order_payment(entity,customer_order, payment_method,user,mobile_money_phone, order_items):
    
    customer_order.selected_payment_method=payment_method
    customer_order.save()
    reference_number = generate_reference_number(customer_order.entity,user)

    errors = []
    administrator_account = None
    if payment_method.title=="CASH":

        # Cash payments
        try:
            customer_order_payment = CustomerOrderPayment.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="SUCCESS",
                amount=customer_order.order_net_price_total+customer_order.shipping_cost,
                entity=user.entity,
                currency="KES",
                owner=user,
                customer_order = customer_order,
                is_validated=True
            )
        
            if customer_order_payment:
                print("Created")
                # print("payment", customer_order_payment)
                update_stock(customer_order)
                customer_order.status="COMPLETE"

                customer_order.save()
                return [], customer_order
            else:
                customer_order.delete()
                print("Not Created")
                errors.append("Error while creating customer order payment")
                return errors, None
        except Exception as e:
            errors.append(str(e))
            return errors, None
    elif payment_method.title=="CREDIT":
        update_stock(customer_order)
        customer_order.status="DEFERRED"
        customer_order.payment_method=payment_method
        customer_order.reference_number=reference_number
        customer_order.save()
        return [], customer_order

   

    elif payment_method.title=="MOBILE MONEY":
        amount = get_order_price_total(customer_order)
        print("AMT", amount)
        print("MOMO")
       
        if not UserAccounts.objects.filter(owner = entity.administrator).exists():
            errors.append("Entity admin has no collection account")
            return errors, None
        else:
            administrator_account =  UserAccounts.objects.filter(owner = entity.administrator).first()
            print("entity_collection_account",administrator_account)
      
            payload = None
            telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
          
            if telco=="MPESA":
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount": int(customer_order.order_price_total+ customer_order.shipping_cost),
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
                create_log("info",f"create customer order by customer {payload}")
            elif telco=="AIRTELMONEY":
                amount = customer_order.order_price_total+ customer_order.shipping_cost
                print("AMT", amount)
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount":  str(int(amount)),
                    "callBackUrl": "https://webhook.site/55963e0b-b692-42b6-a682-0223eaf7fbff",
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
            create_log("info",f"just before checkout {payload}")
            # token = get_auth_token()
            the_data = {
                "client_id": config("JAMBOPAY_CLIENT_ID"),
                "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
                "grant_type": config("JAMBOPA_GRANT_TYPE"),
            }
            headers = {"Content-Type": "application/x-www-form-urlencoded"}
            # Execute the post
            result = requests.post(config("JAMBOPAY_AUTH_URL1"), data=the_data, headers=headers)
            result_json = result.json()
            token =None
            if result_json and result_json["access_token"]:
                token= result_json["access_token"]
   
            if token:
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
                result_json=result.json()
                create_log("info",f"result_json {result_json}")

                if result_json:
                    
                    print("Ikoooo")
                    customer_order_payment = CustomerOrderPayment.objects.create(
                        payment_method=payment_method,
                        reference_number=reference_number,
                        status="PENDING",
                        amount=float(customer_order.order_price_total+ customer_order.shipping_cost),
                        entity=entity,
                        currency="KES",
                        owner=user,
                        customer_order = customer_order,
                        administrator_account=administrator_account,
                        psp_reference_number= result_json["ref"],
                        telco= telco
                    )
                    use_reference_number(reference_number)
                    if customer_order_payment:
                        return [], customer_order
                    else:
                        errors.append("Customer order payment not created")
                        return errors, None
                else:
                    create_log("info",f"from jp errors {errors}")
                    errors.append("Payment failed")
                    return errors, None
            else:
               
                errors.append("Token not generated")
                return errors, None
    elif payment_method.title=="JAMBOPAY WALLET":
        if not UserAccounts.objects.filter(owner = user.entity.administrator).exists():
            errors.append("Entity adminisrator has no collection account")
            return errors, None
        else:
            administrator_account =  UserAccounts.objects.filter(owner = user.entity.administrator).first()

        errors, wallet = get_account_by_phone(mobile_money_phone)
        if wallet:
            data ={
                        "orderId": reference_number,
                        "amount":  int(customer_order.order_price_total+ customer_order.shipping_cost),
                        "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
                        "accountTo": administrator_account.account_number,
                        "description": "Customer order payment",
                        "modeOfPayment": "WALLET_AS_SERVICE",
                        "provider": "JAMBOPAY",
                        "data": {
                                "serviceType": "TOPUP",
                                "accountNo": wallet
                        }
                        }
            response = jambopay_wallet_checkout(data)

            if not "statusCode" in response and  "ref" in response:
                customer_order_payment = CustomerOrderPayment.objects.create(
                    payment_method=payment_method,
                    reference_number=reference_number,
                    status="PENDING",
                    amount=float(customer_order.order_price_total+ customer_order.shipping_cost),
                    entity=user.entity,
                    currency="KES",
                    owner=user,
                    customer_order = customer_order,
                    entity_collection_account=administrator_account
                )
                use_reference_number(reference_number)
                if customer_order_payment:
                    customer_order.reference_number=reference_number
                    customer_order.payment=customer_order_payment
                    customer_order.save()
                
                    return [], customer_order
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
def create_express_customer_order_data(data,user):
    errors=[]
    customer_order=None
    customer=None
    payment_method=None
    order_origin=None
    order_channel=None
    payment_account_number=None
    customer_order_items=[]
    customer_name=None
    customer_phone=None
    due_date=None
    if not "customer_order_items" in data or data['customer_order_items']==[]:
        errors.append("Customer order items are required")
        return errors,None
    else:
        customer_order_items =data['customer_order_items']
        print("Order items",customer_order_items)
        for customer_order_item in customer_order_items:
            retailer_receipt =None
            retailer_receipt =None
            
            if RetailerReceipts.objects.filter(id=customer_order_item['product']).exists():
                retailer_receipt= RetailerReceipts.objects.filter(id=customer_order_item['product']).first()
                print("ddfd",retailer_receipt)
                if int(retailer_receipt.current_unit_quantity)<int(customer_order_item['quantity']):
                    errors.append(f"{retailer_receipt.product.title} has only {retailer_receipt.current_unit_quantity} units left whereas {customer_order_item['quantity']} units are required")
                    return errors, None
            else:
                errors.append("Product with provided product ID does not exist")
                return errors, None

    if "customer" in data:
        if Users.objects.filter(id=data['customer']).exists():
            customer = Users.objects.filter(id=data['customer']).first()
    if "customer_name" in data:
        customer_name= data['customer_name']

    if "customer_phone" in data:
        customer_phone= data['customer_phone']

    if "due_date" in data:
        due_date= data['due_date']

    if "payment_method" in data:
        if PaymentMethods.objects.filter(id=data['payment_method']).exists():
            payment_method = PaymentMethods.objects.filter(id=data['payment_method']).first()
            if payment_method.title =="MOBILE MONEY" and not "payment_account_number" in data:
                errors.append("Mobile money phone number is required")
                return errors, None
            else:
                payment_account_number=data['payment_account_number']

    if "order_origin" in data:
        order_origin = data['order_origin']

    if "order_channel" in data:
        order_channel = data['order_channel']

    if len(errors)>0:
        return errors,None

    try:
        order_number = generate_document_number(user.entity, user,"CUSTOMERORDER")
        customer_order = CustomerOrders.objects.create(
            user=customer,
            owner=user,
            selected_payment_method=payment_method,
            entity=user.entity,
            order_origin = order_origin,
            order_channel=order_channel,
            order_number=order_number,
            customer_name=customer_name,
            customer_phone=customer_phone,
            due_date=due_date
        )

        if customer_order and customer_order_items:
            retailer_receipt = None
            discount_quantity = 0
            for item in customer_order_items:
                if RetailerReceipts.objects.filter(id=item['product']).exists():
                    retailer_receipt =RetailerReceipts.objects.filter(id=item['product']).first()
                    customer_irder_item =CustomerOrderItems.objects.create(
                        unit_of_issue=retailer_receipt.unit_of_receipt,
                        item_price=float(retailer_receipt.unit_selling_price),
                        item_price_total=float(item['quantity'])*float(retailer_receipt.unit_selling_price),
                        quantity=float(item['quantity']),
                        item_price_discount=float(item['discount']),
                        total_quantity=int(item['quantity']) + int(discount_quantity),
                        purchased_quantity=int(item['quantity']),
                        retailer_receipt=retailer_receipt,
                        customer_order=customer_order,
                        owner=user,
                        entity=user.entity,
                )

            order_items=CustomerOrderItems.objects.filter(customer_order=customer_order).all()
            create_log("info", f"Customer order created {customer_order}")
            create_log("info", f"Customer order created items{order_items}")
       
            errors, order_created = process_customer_order_payment(user.entity,customer_order,payment_method,user,payment_account_number, order_items )    
            if order_created:
                return [],order_created
            else:
                return errors,customer_order

        else:
            errors.append("Order could not be created")
            return errors, None


        return errors, None
    except Exception as e:
        errors.append(str(e))
        return errors,None

# @transaction.atomic
# def create_customer_order(data, user):
#     create_log("info",f"{user.phone} - {data}")
#     errors=[]
#     draft_id=None
#     payment_account_number = None
#     payment_method_id = None
#     payment_method = None
#     delivery_method = ""
#     order_channel = "WEB"
#     order_origin = ""
#     reference_number = None
#     customer_order=None
#     customer = None
#     employee_id = None
#     employee = None
#     order_tax_total = 0.00
#     order_price_discount_total = 0.00
#     order_net_price_total = 0.00
#     order_price_total = 0.00
#     created = None
#     customer_id = None
#     customer_phone = ""
#     customer_name = ""
#     collection_account_number = None
#     entity = user.entity
#     due_date=datetime.datetime.today()
#     if data and "draft_id" in data["customer_order_details"] and not data['customer_order_details']['draft_id']==None:
#         draft_id = data["customer_order_details"]["draft_id"]
#         if CustomerOrders.objects.filter(draft_id=draft_id,owner=user).exists():
#             customer_order = CustomerOrders.objects.filter(draft_id=draft_id,owner=user,entity=entity).first()
#             errors.append("Similar draft order has been created.")
#             return errors,None
#         else:
#             draft_id = data["customer_order_details"]["draft_id"]

#     if data and "customer_phone" in data["customer_order_details"]:
#         customer_phone = data["customer_order_details"]["customer_phone"]
    
    
#     if data and "customer_name" in data["customer_order_details"]:
#         customer_name = data["customer_order_details"]["customer_name"]

#     if "due_date" in data["customer_order_details"]:
#         due_date = data["customer_order_details"]["due_date"]

#     if "payment_method_id" in data["customer_order_details"]:
#         payment_method_id = data["customer_order_details"]["payment_method_id"]
#         if payment_method_id == "" or not payment_method_id:
#             errors.append("Payment method ID is required")
#             return errors,None
#         else:
#             payment_method = validate_payment_method_exists(payment_method_id)
#             print("PM",payment_method.title)
#     else:
#         errors.append("Payment method is required")
#         return errors,None

#     if  payment_method.title=="CASH" or payment_method.title=="CREDIT":
#         """Payment account number not required for cash transactions"""
#         pass
#     else:
#         if not "payment_account_number" in data["customer_order_details"] or data["customer_order_details"]["payment_account_number"] =="":
#             errors.append("Payment account is required for non cash orders")
#             return errors,None
#         else:
#             payment_account_number=data["customer_order_details"]["payment_account_number"]

#             if not user.entity.administrator:
#                 errors.append("No administrator is set to receive funds")
#                 return errors, None
            
#             else:
#                 if UserAccounts.objects.filter(owner = user.entity.administrator).exists():
#                     collection_account_number =  UserAccounts.objects.filter(owner = user.entity.administrator).first()
#                 else:
#                     errors.append("Admin has no collection account")
#                     return errors, None
                

#     employee=employees_models_validators.validate_employee(user)


#     if user.is_staff:
#         raise exceptions.ValidationError("Not authorized for staff users")
#     if "customer_id" in data["customer_order_details"] and not data["customer_order_details"]["customer_id"]=="":
#         customer_id = data["customer_order_details"]["customer_id"]
#         if Users.objects.filter(id=customer_id).exists():
#             customer = Users.objects.filter(id=customer_id).first()
#             if customer:
#                 customer_name=f"{customer.first_name} {customer.last_name}"
#                 customer_phone=f"{customer.phone}"
#         else:
#             errors.append("Customer for the given ID does not exist")
#     else:
#         pass
#         # if payment_method.title=="CREDIT":
#         #     errors.append("Customer is mandatory for credit payment optiom")

#     if "order_origin" in data["customer_order_details"]:
#         order_origin = data["customer_order_details"]["order_origin"]
#         if order_origin == "STAFF":
#             delivery_method = "PICKUP"
#     if "order_channel" in data["customer_order_details"]:
#         order_channel = data["customer_order_details"]["order_channel"]

#     try:
#         order_number = generate_document_number(employee.entity, user,"CUSTOMERORDER")
#         print("Order number", order_number)
#         order_created = CustomerOrders.objects.create(
#             draft_id=draft_id,
#             reference_number=reference_number,
#             customer_name=customer_name,
#             customer_phone=customer_phone,
#             order_origin=order_origin,
#             order_tax_total=order_tax_total,
#             order_price_total=order_price_total,
#             order_price_discount_total=order_price_discount_total,
#             order_net_price_total=order_net_price_total,
#             delivery_method=delivery_method,
#             owner=user,
#             entity=entity,
#             order_number=order_number,
#             payment_account_number=payment_account_number,
#             customer=customer,
#             selected_payment_method=payment_method,
#             employee=employee,
#             order_channel=order_channel,
#             due_date=due_date
          
#         )
#         if order_created:
#             create_log("info","Order created")
           
#             discount_quantity = 0.00
#             item_price_total = 0.0
#             item_tax_total = 0.0
#             final_unit_quantity=0
#             bulk_quantity=0.00
#             current_unit_quantity=0.00
#             item_counter_price_discount_amount = 0.0
#             item_counter_price_discount = 0.0
#             order_items = data["customer_order_details"]["order_items"]

#             for item in order_items:
#                 item_price = 0.00
#                 retailer_receipt = None
#                 unit_of_issue = None
#                 item_tax = 0.00

#                 item_price_discount = 0.00
#                 item_net_price = 0.00
#                 discount_quantity = 0.00
#                 item_price_total = 0.0
#                 item_tax_total = 0.0
#                 final_unit_quantity=0

#                 purchased_quantity = float(item["purchased_quantity"])
#                 retailer_receipt_id = item["retailer_receipt"]
#                 unit_of_issue = item["unit_of_issue"]
                

           

#                 if  retailer_receipt_id:
#                     if  RetailerReceipts.objects.filter(id=retailer_receipt_id).exists():
                
#                         retailer_receipt = RetailerReceipts.objects.filter(
#                         id=retailer_receipt_id
#                     ).first()
                    
#                     # if retailer_receipt.is_bulky=="true":
#                     #     print("Am at is bulky")
#                     #     if unit_of_issue=="KILOGRAM"or unit_of_issue=="LITRE" :
#                     #         print("Am at KG")
#                     #         bulk_quantity=float(item["purchased_quantity"])
#                     #     elif unit_of_issue=="GRAM" or unit_of_issue=="MILLILITRE":
#                     #         print("Am at GM")
#                     #         bulk_quantity=float(float(item["purchased_quantity"])/1000)
#                     #     final_unit_quantity=bulk_quantity
#                     #     print("final_unit_quantity att bulky",final_unit_quantity)
#                     # elif retailer_receipt.is_bulky=="false":
#                     #     print("Am at not is bulky")
#                     #     current_unit_quantity=float(item["purchased_quantity"])
#                     #     print("final_unit_quantity at not bulky",final_unit_quantity)
#                     #     final_unit_quantity=current_unit_quantity


#                     # Calculate item tax
#                     if retailer_receipt.final_unit_selling_price and retailer_receipt.final_unit_selling_price>0:
#                         item_price = float(retailer_receipt.final_unit_selling_price)
#                         item_price_total = float(
#                             float(retailer_receipt.final_unit_selling_price)
#                             * float(final_unit_quantity)
#                         )
#                         print("item_price_total",item_price_total)
#                         if retailer_receipt.product.is_vatable:
#                             item_tax = float(retailer_receipt.final_unit_selling_price) * float(
#                                 0.16
#                             )

#                             item_tax_total = float(item_tax) * final_unit_quantity
#                             print("item_tax_total",item_tax_total)
#                     else:

#                         item_price = float(retailer_receipt.unit_selling_price)
#                         item_price_total = float(
#                             float(retailer_receipt.unit_selling_price)
#                             * float(final_unit_quantity)
#                         )
#                         print("item_price_total",item_price_total)
#                         if retailer_receipt.product.is_vatable:
#                             item_tax = float(retailer_receipt.final_unit_selling_price) * float(
#                                 0.16
#                             )

#                             item_tax_total = float(item_tax) * final_unit_quantity
#                             print("item_tax_total",item_tax_total)
#                     # total_quantity = int(purchased_quantity) + int(discount_quantity)
#                     # # if retailer_receipt.current_unit_quantity < total_quantity:
#                     # #     raise exceptions.ValidationError(
#                     # #         f"Insufficient stocks. Only {retailer_receipt.current_unit_quantity} available"
#                     # #     )
#                     # print("total_quantity",total_quantity)
#                 else:
#                     errors.append("Item does not exist in inventory")
                    
#                     return errors,None

#                 item_created = CustomerOrderItems.objects.create(
#                     unit_of_issue=unit_of_issue,
#                     item_price=item_price,
#                     item_price_total=item_price_total,
#                     quantity=float(final_unit_quantity),
#                     item_tax=item_tax,
#                     item_tax_total=item_tax_total,
#                     item_price_discount=retailer_receipt.unit_price_discount,
#                     # item_price_discount_total=float(retailer_receipt.unit_price_discount)
#                     # * float(final_unit_quantity),
#                     total_quantity=int(final_unit_quantity) + int(discount_quantity),
#                     purchased_quantity=int(final_unit_quantity),
#                     retailer_receipt=retailer_receipt,
#                     customer_order=order_created,
#                     owner=user,
#                     entity=user.entity,
#                 )
#                 create_log("info", f" order item created {item_created}")
#             items = CustomerOrderItems.objects.filter(customer_order=order_created)

#             for item in items:
    
            
     
#                 order_tax_total = order_tax_total + float(item.item_tax_total)
#                 order_price_total = order_price_total + float(item.item_price_total)
#                 print("order_tax_total2",order_tax_total)
#                 print("order_price_total2",order_price_total)

#                 order_created.order_price_discount_total = float(order_created.order_price_discount_total)+float(item.retailer_receipt.unit_price_discount)
#                 order_created.order_tax_total = order_tax_total
#                 # order_created.order_net_price_total = order_net_price_total
#                 order_created.order_price_total = (
#                     order_price_total + order_created.shipping_cost
#                 )

#                 order_created.save()
#                 print("order_updated",order_created)
#             order_items=CustomerOrderItems.objects.filter(customer_order=order_created).all()
       
#             create_log("info", f" to processing payment")
#             errors, order_created = process_customer_order_payment(user.entity,order_created,payment_method,user,payment_account_number, order_items )
       
          
  
#             return [],order_created
#         else:
#             print("Order not created")
#             errors.append("Error while creating customer order")
#             return errors,None

        
#     except Exception as e:
#         create_log("error",str(e))
#         return errors, None


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
    errors=[]
    customer_name = None
    customer_phone = None
    entity = None
    order_number = None
    payment_account_number = None
    payment_method_id = None
    payment_method = None
    delivery_method = None
    order_origin = None
    shipping_cost = 0.00
    origin_latitude =0.00
    origin_longitude =0.00
    destination_latitude=0.00
    destination_longitude=0.00
    farness =0.00
    origin_point =None
    destination_point =None
    draft_id =None
    recipient_name =None
    recipient_phone =None
    customer=None
    order_tax_total=0.00
    order_price_discount_total=0.00
    order_net_price_total=0.00

    order_items =[]

    if not "customer_order_details" in data or data['customer_order_details']=="":
        errors.append("No order details")
        return errors, None


    # Order origin
    if "order_origin" in data["customer_order_details"]:
        order_origin = data["customer_order_details"]["order_origin"]

        if order_origin=="CUSTOMER":
            customer=user
    
    if "draft_id" in data["customer_order_details"]:
        draft_id = data["customer_order_details"]["draft_id"]
    else:
        errors.append("Draft ID is required")
  
    
    if "farness" in data["customer_order_details"] and not data["customer_order_details"]['farness']=="":
        farness = data["customer_order_details"]["farness"]

    if "origin_latitude" in data["customer_order_details"] and not data["customer_order_details"]['origin_latitude']=="":
        origin_latitude = data["customer_order_details"]["origin_latitude"]
    
    if "entity" in data["customer_order_details"]:
        entity_id = data["customer_order_details"]["entity"]
        if Entities.objects.filter(id=entity_id).exists():
            entity = Entities.objects.filter(id=entity_id).first()
        else:
            errors.append("Retailer with proovided ID does not exist")
    else:
        entity= user.entity

 

    if "origin_longitude" in data["customer_order_details"] and not data["customer_order_details"]['origin_longitude']=="":
        origin_longitude = data["customer_order_details"]["origin_longitude"]

    if origin_latitude and origin_longitude:
        origin_point = Point(origin_longitude, origin_latitude, srid=4326)
        origin_point = fromstr(f"POINT({origin_longitude} {origin_latitude})", srid=4326)

    if "destination_latitude" in data["customer_order_details"] and not data["customer_order_details"]['destination_latitude']=="":
        destination_latitude = data["customer_order_details"]["destination_latitude"]

    if "destination_longitude" in data["customer_order_details"]and not data["customer_order_details"]['destination_latitude']=="":
        destination_longitude = data["customer_order_details"]["destination_longitude"]
    
    if destination_latitude and destination_longitude:
        destination_point = Point(destination_longitude, destination_latitude, srid=4326)
        destination_point = fromstr(f"POINT({destination_longitude} {destination_latitude})", srid=4326)

    if "recipient_name" in data["customer_order_details"]:
        recipient_name = data["customer_order_details"]["recipient_name"]

    if "recipient_phone" in data["customer_order_details"]:
        recipient_phone = data["customer_order_details"]["recipient_phone"]

    if "payment_account_number" in data["customer_order_details"]:
        payment_account_number = data["customer_order_details"]["payment_account_number"]
    
    if "shipping_cost" in data["customer_order_details"]:
        shipping_cost = data["customer_order_details"]["shipping_cost"]
    else:
        shipping_cost=0.00

    # Payment method
    if "payment_method" in data["customer_order_details"]:
        payment_method_id = data["customer_order_details"]["payment_method"]
        payment_method=payments_models_validators.validate_payment_method_exists(payment_method_id)
    else:
        errors.append("Payment method is required")

    if "delivery_method" in data["customer_order_details"]:
        delivery_method = data["customer_order_details"]["delivery_method"]
    else:
        errors.append("Delivery method is required")



    if not "order_items" in data["customer_order_details"] or len(data["customer_order_details"]["order_items"])<1:
        errors.append("Order has no items")
        return errors, None
    else:
        order_items = data["customer_order_details"]["order_items"]
        create_log("info",f"Data items: {order_items}")
        for item in order_items:
            retailer_receipt=None
            purchased_quantity=0

            if item['purchased_quantity'] and int(item['purchased_quantity'])>0:
                purchased_quantity=int(item['purchased_quantity'])
            
            if  item['retailer_receipt'] and not item['retailer_receipt']=="":
                if models.RetailerReceipts.objects.filter(id=item['retailer_receipt'],current_unit_quantity__gte=0).exists():
                    retailer_receipt = models.RetailerReceipts.objects.filter(id=item['retailer_receipt'],current_unit_quantity__gte=0).first()

                    if retailer_receipt.current_unit_quantity<purchased_quantity:
                        errors.append(f"Only {retailer_receipt.current_unit_quantity} available" )
                        return errors,None
                else:
                    errors.append("Item with provided ID does not exist in inventory")
                    return errors,None
            else:
                errors.append("Product ID is required")
                return errors,None




    if len(errors)>0:
        return errors,None
    else:
        order_number = generate_document_number(entity, user,"CUSTOMERORDER") 

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

        create_log("info",f"Customer order: {order_created}")

        if order_created:
            create_log("info",f"Data items: {order_created}")
            final_price_total= 0.00
            order_net_price_total=0.00
            for item in order_items:
                
                discount_quantity=0.00
                item_price_total=0.00
                item_net_price_total=0.00
                item_net_price=0.00
                item_price_discount=0.00
                item_tax=0.00
                item_tax_total=0.00
                item_price_discount_total=0.00
                final_unit_selling_price=float(item['final_unit_selling_price'])
                
                
                purchased_quantity=item['purchased_quantity']
                final_price_total+=final_unit_selling_price*float(purchased_quantity)
                unit_of_issue=item['unit_of_issue']
                item_price_total=float(purchased_quantity)*float(final_unit_selling_price)
                if "discount_quantity" in item:
                    discount_quantity=item['discount_quantity']
                create_log("info", "I reached here 2")
                if "item_price_discount" in item:
                   
                    item_price_discount=item['item_price_discount']
                    item_price_discount_total=float(item_price_discount)- float(purchased_quantity)
                    item_net_price=float(final_unit_selling_price)- float(discount_quantity)
                    item_net_price_total=float(item_net_price)*float(purchased_quantity)
                   
                else:
                    item_net_price=float(final_unit_selling_price)
                    item_net_price_total=float(item_net_price)*float(purchased_quantity)
                    
                order_net_price_total+=item_net_price_total
                order_price_discount_total+=item_price_discount_total
                

                retailer_receipt = models.RetailerReceipts.objects.filter(id=item['retailer_receipt'],current_unit_quantity__gte=purchased_quantity).first()
                if retailer_receipt.product.is_vatable:
                    item_tax= float(final_unit_selling_price) *01.16
                    item_tax_total=float(item_tax )* float(purchased_quantity)

                order_tax_total+=item_tax_total

                create_log("info", "I reached here 3")
                item_created = CustomerOrderItems.objects.create(
                    item_price=float(final_unit_selling_price),
                    item_tax=float(item_tax),
                    item_price_discount=float(item_price_discount),
                    discount_quantity=float(discount_quantity),
                    item_price_discount_total=float(item_price_discount_total),
                    item_net_price_total=float(float(final_unit_selling_price)-float(item_price_discount))*float(purchased_quantity)
                    * float(purchased_quantity),
                    item_price_total=float(final_unit_selling_price)*float(purchased_quantity),
                    total_quantity=float(purchased_quantity) + float(discount_quantity),
                    purchased_quantity=float(purchased_quantity),
                    retailer_receipt=retailer_receipt,
                    customer_order=order_created,
                    item_tax_total=float(item_tax_total),
                    owner=user,
                    entity=user.entity,
                    unit_of_issue=unit_of_issue,
                    item_net_price=float(item_net_price),
                )
            order_created.order_price_total=float(final_price_total)
            order_created.order_net_price_total=order_net_price_total
            order_created.order_price_discount_total=order_price_discount_total
            order_created.order_tax_total=order_tax_total
            order_created.save()
            create_log("info",f"Customer order item: {item_created}")
            errors, order_created = process_customer_order_payment(entity,order_created,payment_method,user,payment_account_number, order_items )
            return errors,order_created
        else:
            errors.append("Order could not be created")
            return errors,None  
    except Exception as e:
        errors.append(str(e))
        return errors, None

# def process_mpesa(payment_account_number, reference_number, amount):
#     print('Creating payment for order..', reference_number)
#     print('Creating payment for order..amount', amount)

#     token_data = {
#         "action": config('TOKEN_ACTION'),
#         "consumer_code": config('TOKEN_CONSUMER_CODE'),
#         "consumer_key": config('TOKEN_CONSUMER_KEY'),
#         "consumer_secret": config('TOKEN_CONSUMER_SECRET')
#     }
#     result = requests.post(f'{config("TOKEN_URL")}', json=token_data,
#                            headers={'Accept': 'application/json', 'Api-Key': f'{config("TOKEN_API_KEY")}'})
#     result_json = result.json()

#     token = result_json['access_token']

#     if token:
#         transaction_data = {
#             "action": "ProcessCollection",
#             "channel_id": 37,
#             "amount": round(amount),
#             "account_number": payment_account_number,
#             "msisdn": payment_account_number,
#             "reference_number": reference_number,
#             "narration": f"Customer Order {reference_number}",
#             "result_url": "https://webhook.site/3a9b9c43-c2c7-417e",
#             "metadata": {
#                 "key0": "value0",
#                 "key1": "value1"
#             },
#             "show_qr_code": 1
#         }
#         payment_result = requests.post(f'{config("TRANSACTION_URL")}', json=transaction_data,
#                                        headers={'Accept': 'application/json', 'Access-Token': f'{token}'})
#         payment_result_json = payment_result.json()
#         print("mpesa payment", payment_result_json)

#         if payment_result_json:
#             return payment_result_json
#         else:
#             return None


# @transaction.atomic
# def create_customer_order_by_customer(data, user):
#     create_log("info",f"{user.phone} - {data}")
#     errors=[]
#     customer = None
#     entity_id = None
#     entity = None
#     order_tax_total = 0.00
#     order_price_discount_total = 0.00
#     order_net_price_total = 0.00
#     order_price_total = 0.00
#     order_created = None
#     user_id = None
#     reference_number = None
#     payment_account_number = None
#     payment_method_id = None
#     delivery_method = None
#     order_origin = None
#     shipping_cost = 0.00
#     origin_latitude =None
#     destination_latitude=None
#     longitude =None
#     farness =None
#     origin_point =None
#     destination_point =None
#     draft_id =None
#     recipient_name =None
#     recipient_phone =None


#     # Order origin
#     if "order_origin" in data["customer_order_details"]:
#         order_origin = data["customer_order_details"]["order_origin"]
#     else:
#         raise exceptions.ValidationError("Order origin is required")
    
#     if "draft_id" in data["customer_order_details"]:
#         draft_id = data["customer_order_details"]["draft_id"]
#     else:
#         raise exceptions.ValidationError("Draft ID is required")
    
#     if "recipient_name" in data["customer_order_details"]:
#         recipient_name = data["customer_order_details"]["recipient_name"]

#     if "recipient_phone" in data["customer_order_details"]:
#         recipient_phone = data["customer_order_details"]["recipient_phone"]


#     # Payment method
#     if "payment_method" in data["customer_order_details"]:
#         payment_method_id = data["customer_order_details"]["payment_method"]
#         payment_method=payments_models_validators.validate_payment_method_exists(payment_method_id)
#     else:
#         raise exceptions.ValidationError("Payment method is required")

#     if "delivery_method" in data["customer_order_details"]:
#         delivery_method = data["customer_order_details"]["delivery_method"]
#     else:
#         raise exceptions.ValidationError("Delivery method is required")

#     # if delivery_method == "DELIVERY":
#     #     if (
#     #         not "shipping_address" in data["customer_order_details"]
#     #         or not data["customer_order_details"]["shipping_address"]
#     #     ):
#     #         raise exceptions.ValidationError(
#     #             "Delivery address is required for delivery orders"
#     #         )
#     # else:
#     #     pass
#     if delivery_method == "DELIVERY":
#         if "shipping_cost" in data["customer_order_details"]:
#             shipping_cost = float(data["customer_order_details"]["shipping_cost"])
#     else:
#         shipping_cost = 0.00

#     if order_origin == "CUSTOMER":
#         """All customer orders must not be payable in cash"""
#         if not payment_method.title=="CASH":
#             if not "payment_account_number" in data["customer_order_details"]:
#                 errors.append("Payment account number is required")
#                 return errors, None
#             else:
#                 payment_account_number = data["customer_order_details"][
#                     "payment_account_number"
#                 ]
#                 if payment_account_number and not payment_account_number == "":
#                     payment_account_number = data["customer_order_details"][
#                         "payment_account_number"
#                     ]

#                 else:
#                     errors.append("No cash payment for online orders")
#                     return errors, None
                
#         else:
#             errors.append("Unsupported payment method")
#             return errors, None

#     if order_origin == "CUSTOMER" and "entity_id" in data["customer_order_details"]:
#         entity_id = data["customer_order_details"]["entity_id"]
#         entity = validate_entity(entity_id)


#     if order_origin == "CUSTOMER" and "user_id" in data["customer_order_details"]:
#         customer = user
#     elif order_origin == "STAFF" and "user_id" in data["customer_order_details"]:
#         # User ID required for staff orders
#         user_id = data["customer_order_details"]["user_id"]
#         customer = validate_user(user_id)

#         # Prohibit staff from creating orders for self

#         if customer == user:
#             errors.append("Creating order for self not permitted")
#             return errors, None
#     else:
#         errors.append("User ID is required")
#         return errors, None
    
#     if "origin_latitude" in data['customer_order_details']:
#         origin_latitude = float(data['customer_order_details']['origin_latitude'])

#     if "origin_longitude" in data['customer_order_details']:
#         origin_longitude =  float(data['customer_order_details']['origin_longitude'])

#     if origin_latitude and origin_longitude:
#         # origin_point = Point(origin_longitude, origin_latitude, srid=4326)
#         origin_point = fromstr(f"POINT({origin_longitude} {origin_latitude})", srid=4326)

#     if "destination_latitude" in data['customer_order_details']:
#         destination_latitude = float(data['customer_order_details']['destination_latitude'])

#     if "destination_longitude" in data['customer_order_details']:
#         destination_longitude =  float(data['customer_order_details']['destination_longitude'])

#     if destination_latitude and destination_longitude:
#         # destination_point = Point(destination_longitude, destination_latitude, srid=4326)
#         destination_point = fromstr(f"POINT({destination_longitude} {destination_latitude})", srid=4326)

#     if "farness" in data['customer_order_details']:
#         farness = float(data['customer_order_details']['farness'])

#     if "city_name" in data['customer_order_details']:
#         city_name = data['customer_order_details']['city_name']


#     try:
#         order_number = generate_document_number(entity, user,"CUSTOMERORDER")
#         # reference_number=generate_reference_number(entity,user)
#         order_created = CustomerOrders.objects.create(
#             reference_number=reference_number,
#             order_number=order_number,
#             payment_account_number=payment_account_number,
#             customer_name=f"{user.first_name} {user.last_name}",
#             customer_phone=f"{user.phone}",
#             order_origin=order_origin,
#             delivery_method=delivery_method,
#             shipping_cost=shipping_cost,
#             order_tax_total=order_tax_total,
#             order_price_total=order_price_total,
#             draft_id=draft_id,
#             selected_payment_method=payment_method,
#             order_price_discount_total=order_price_discount_total,
#             order_net_price_total=order_net_price_total,
#             owner=user,
#             user=user,
#             entity=entity,
#             customer=customer,
#             origin_point=origin_point,
#             destination_point=destination_point,
#             farness=farness,
#             city_name=city_name,
#             recipient_name=recipient_name,
#             recipient_phone=recipient_phone
#         )
#         if order_created:
#             # use_referenc e_number(reference_number)
#             print("Order created", order_created)
#             order_items = data["customer_order_details"]["customerOrderItems"]

#             for item in order_items:
#                 retailer_receipt = None
#                 errors, retailer_receipt = model_validators.validate_retailer_receipt_for_entity(item["productID"],entity_id)
#                 print("Errors at order item",errors)
#                 print("Reaceipt at order item",retailer_receipt)
                
#                 item_price = None
#                 unit_of_issue=None
               
#                 item_tax = 0.00
#                 item_price_discount = 0.00
#                 item_net_price = 0.00
#                 discount_quantity = 0.00
#                 item_price_total = 0.0
#                 item_tax_total = 0.0
#                 purchased_quantity = int(item["productQuantity"])
#                 retailer_receipt_id = item["productID"]
#                 unit_of_issue = item["unit_of_issue"]
                

                
#                 if  retailer_receipt:
#                     retailer_receipt = RetailerReceipts.objects.filter(
#                         id=retailer_receipt_id, entity=entity
#                     ).first()

#                     # Calculate item tax
#                     item_price = float(retailer_receipt.unit_selling_price)

#                     item_price_total = float(retailer_receipt.unit_selling_price) * int(
#                         purchased_quantity
#                     )

#                     if retailer_receipt.product.is_vatable:
#                         item_tax = float(retailer_receipt.unit_selling_price) * float(
#                             0.16
#                         )

#                         item_tax_total = float(item_tax) * int(purchased_quantity)

          

        

#                 else:
#                     errors.append("Item does not exist in inventory")
#                     return errors,None

#                 item_created = CustomerOrderItems.objects.create(
#                     item_price=item_price,
#                     item_price_total=item_price_total,
#                     item_tax=item_tax,
#                     item_tax_total=item_tax_total,
#                     item_price_discount=item_price_discount,
#                     item_price_discount_total=item_price_discount
#                     * float(purchased_quantity),
#                     item_net_price=item_net_price,
#                     discount_quantity=discount_quantity,
#                     item_net_price_total=float(item_net_price)
#                     * float(purchased_quantity),
#                     total_quantity=float(purchased_quantity) + float(discount_quantity),
#                     purchased_quantity=purchased_quantity,
#                     retailer_receipt=retailer_receipt,
#                     customer_order=order_created,
#                     owner=user,
#                     entity=user.entity,
#                 )
#                 if item_created:
#                     print("Order item created",item_created)
                   
#                     pass
#                 else:
#                    pass
#             items = CustomerOrderItems.objects.filter(customer_order=order_created)

#             for item in items:
#                 order_price_discount_total = order_price_discount_total + float(
#                     item.item_price_discount_total
#                 )
#                 order_tax_total = order_tax_total + float(item.item_tax_total)
#                 order_net_price_total = order_net_price_total + float(
#                     item.item_net_price_total
#                 )
#                 order_price_total = order_price_total + float(item.item_price_total)

#             order_created.order_price_discount_total = order_price_discount_total
#             order_created.order_tax_total = order_tax_total
#             order_created.order_net_price_total = order_net_price_total
#             order_created.order_price_total = (
#                 order_price_total
#             )
#             order_created.save()
#             print("Createddd",order_created)



#             # Delivery address
#             try:
#                 if (
#                     order_created.delivery_method == "DELIVERY"
#                     and "shipping_address" in data["customer_order_details"]
#                 ):
#                     shipping_address = data["customer_order_details"][
#                         "shipping_address"
#                     ]

#                     if shipping_address:
#                         print("shipping_address", shipping_address)
#                         created_delivery_address = ShippingAddress.objects.create(
#                             customer_order_id=order_created.id,
#                             contact_person_name=data["customer_order_details"][
#                                 "shipping_address"
#                             ]["contact_person_name"],
#                             contact_person_phone=data["customer_order_details"][
#                                 "shipping_address"
#                             ]["contact_person_phone"],
#                             estate=data["customer_order_details"]["shipping_address"][
#                                 "estate"
#                             ],
#                             road=data["customer_order_details"]["shipping_address"][
#                                 "road"
#                             ],
#                             city=data["customer_order_details"]["shipping_address"][
#                                 "city"
#                             ],
#                             country_id=data["customer_order_details"][
#                                 "shipping_address"
#                             ]["country"],
#                             county_id=data["customer_order_details"][
#                                 "shipping_address"
#                             ]["county"],
#                             owner=user,
#                             entity=user.entity,
#                         )
#                     else:
#                         raise exceptions.ValidationError("Shipping address not saved")
#                 else:
#                     pass
#             except Exception as e:
#                 raise exceptions.ValidationError(
#                     "Error while saving shipping address" + f"{e}"
#                 )

           
#             errors, order_created=process_customer_order_payment(entity,order_created,payment_method,user,payment_account_number, order_items )
#             return errors, order_created
#         else:
#             print("lastly")
#             return ["errror at fail"],None
#     except Exception as e:
#         errors.append("Create order error: "+ str(e))
#         return errors, None


def update_customer_order(data, user):
    customer_order = None
    payment_method = None
    delivery_method = None
    shipping_cost = None
    contact_person_name = None
    contact_person_phone = None
    city = None
    bodaboda = None
    status = None
    errors=[]

    if "customer_order" in data["customer_order_details"]:
        customer_order_id = data["customer_order_details"]["customer_order"]
        if CustomerOrders.objects.filter(id=customer_order_id).exists():
            customer_order = CustomerOrders.objects.filter(id=customer_order_id).first()
    else:
        errors.append("ID is required")
        return errors,None
    

    if "payment_method" in data["customer_order_details"]:
        payment_method_id = data["customer_order_details"]["payment_method"]
        if PaymentMethods.objects.filter(id=payment_method_id).exists():
            payment_method = PaymentMethods.objects.filter(id=payment_method_id).first()

    if "bodaboda" in data["customer_order_details"]:
        bodaboda_id = data["customer_order_details"]["bodaboda"]
        if BodaLocations.objects.filter(owner_id=bodaboda_id).exists():
            bodaboda = BodaLocations.objects.filter(owner_id=bodaboda_id).first()
        else:
            errors.append("Boda boda does not exist")
            return errors, None

    # if "shipping_cost" in data["customer_order_details"]:
    #     shipping_cost = data["customer_order_details"]["shipping_cost"]

    # if "shipping_cost" in data["customer_order_details"]:
    #     shipping_cost = data["customer_order_details"]["shipping_cost"]

    if "status" in data["customer_order_details"]:
        status = data["customer_order_details"]["status"]

    if customer_order:
        if shipping_cost:
            customer_order.shipping_cost = float(shipping_cost)
            customer_order.save()

        if payment_method:
            customer_order.payment_method = payment_method
            customer_order.save()

        if delivery_method:
            customer_order.delivery_method = delivery_method.title
            customer_order.save()

        if bodaboda and customer_order.delivery_method=="DELIVERY":
            customer_order.bodaboda = bodaboda
            customer_order.save()
            # if ShippingAddress.objects.filter(customer_order=customer_order).exists():
            #     customer_order.bodaboda = bodaboda
            #     customer_order.save()
            # else:
            #     errors.append("Order is for pick up")
            #     create_log("error", str(errors))

        if status:
            customer_order.status = status
            customer_order.save()

        return  [],customer_order
    else:
        errors.append("Not found")
        return errors,None

def get_title(self,item):
    return item.title

def get_customer_order_items(data, user):
    qs = []
    today = timezone.now().date()
    from_date = timezone.now().date()
    to_date = timezone.now().date()
    if (
        "filters" in data
        and "from_date" in data["filters"]
        and "to_date" in data["filters"]
    ):
       

        from_date = parse_datetime(data["filters"]["from_date"]).strftime("%Y-%m-%d")

        to_date = parse_datetime(data["filters"]["to_date"]).strftime("%Y-%m-%d")

        qs = CustomerOrderItems.objects.filter(
            Q(entity=user.entity, created__gte=from_date, created__lte=to_date)
        ).all()

    else:
        if (
            CustomerOrderItems.objects.filter(entity=user.entity)
            .filter(Q(created__gte=today))
            .exists()
        ):
            qs = (
                CustomerOrderItems.objects.filter(entity=user.entity)
                .filter(Q(created__gte=today))
                .all()
            )

            # final ={}
            # titles = list(set(map(self.get_title,qs)))
            # print(titles)

    return qs



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
