from email import errors
from rest_framework import exceptions
from products.validators import product_models_validator
from authentication.validators import authentication_models_validators
from distributors.validators import distributors_models_validator
from employees.validators import employees_models_validators
from retailers.models import RetailerReceipts
from ..models import WholesalerReceipts, WholesalerVariations, WholesalerPriceDiscounts, WholesalerQuantityDiscounts
from core import validators
from ..validators import wholesalers_models_validators
from django.db.models import Q
import datetime
from django.utils import timezone
import pytz
from django.db import models



def create_wholesaler_receipt(data, user):
    errors = []
    product_obj = None
    received_unit_quantity = 0
    unit_of_receipt=None
    manufacture_date = None
    expiry_date = None
    received_from_obj = None
    wholesaler_order_item_obj = None
    employee_obj = None
    batch = None

    employee_obj = employees_models_validators.validate_employee(user)

    try:
        product_id = data["wholesaler_receipt_details"]["product"]
        if product_id == "":
            errors.append("Product ID cannot be empty")
        else:
            # Check product exists
            product_obj = product_models_validator.validate_product(product_id)
            # Check if product is among authorized entity categories
            # entity_categories = user.entity.categories.all()
            # if product_obj.category not in entity_categories:
            #     errors.append(
            #         f'{product_obj.title} in not under any of your authorized categories')
    except KeyError:
        errors.append("Product ID is required")

    try:
        received_unit_quantity = data["wholesaler_receipt_details"]["received_unit_quantity"]
        if received_unit_quantity == "":
            errors.append("Unit quantity cannot be empty")

    except KeyError:
        errors.append("Quantity is required")

    try:
        unit_buying_price = data["wholesaler_receipt_details"]["unit_buying_price"]
        if unit_buying_price == "":
            errors.append("Unit buying price cannot be empty")
   
    except KeyError:
        errors.append("Unit buying price is required")

    try:
        unit_selling_price = data["wholesaler_receipt_details"]["unit_selling_price"]
        if unit_selling_price == "":
            errors.append("Unit selling price cannot be empty")
    except KeyError:
        errors.append("Unit selling price is required")
    
    try:
        unit_of_receipt = data["wholesaler_receipt_details"]["unit_of_receipt"]
        if unit_of_receipt == "":
            errors.append("Unit of receipt cannot be empty")
    except KeyError:
        errors.append("Unit of receipt is required")

    try:
        if "manufacture_date" in data["wholesaler_receipt_details"] and not data["wholesaler_receipt_details"]["manufacture_date"]=="":
            manufacture_date = data["wholesaler_receipt_details"]["manufacture_date"]
            if product_obj.preparation and manufacture_date == "":
                raise exceptions.ValidationError(
                    'Manufacture date is required for pharmaceutical products')
    except KeyError:
        errors.append("Manufacture date is required for pharmaceuticals is required")

    try:
        if "expiry_date" in data["wholesaler_receipt_details"] and not data["wholesaler_receipt_details"]["manufacture_date"]=="":
            expiry_date = data["wholesaler_receipt_details"]["expiry_date"]
            if product_obj.preparation and expiry_date == "":
                raise exceptions.ValidationError(
                    'Expiry date is required for pharmaceutical products')
    except KeyError:
        print("Unit selling price is required")


    if "batch" in data["wholesaler_receipt_details"]:
        batch = data["wholesaler_receipt_details"]["batch"]



    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if WholesalerVariations.objects.filter(product=product_obj).exists():
            wholesaler_variation = WholesalerVariations.objects.filter(
                product=product_obj
            ).first()
        else:
            wholesaler_variation = WholesalerVariations.objects.create(
                product=product_obj, owner=user, entity=user.entity
            )
        a_minute_ago = datetime.datetime.now(pytz.timezone(
            'UTC')) - datetime.timedelta(minutes=1)
        print('a_minute_ago', a_minute_ago)
        # print('created ago', item.created)

        if WholesalerReceipts.objects.filter(product=product_obj, batch=batch, received_unit_quantity=received_unit_quantity, created__gte=a_minute_ago).exists():
            item = WholesalerReceipts.objects.filter(
                product=product_obj, batch=batch, received_unit_quantity=received_unit_quantity, created__gte=a_minute_ago).first()

            # print('a_minute_ago', a_minute_ago)
            print('created ago', item.created)
            raise exceptions.ValidationError(
                f'You added similar item 1 minutes ago i.e at {item.created}')
        created = WholesalerReceipts.objects.create(
            wholesaler_variation=wholesaler_variation,
            product=product_obj,
            received_from=received_from_obj,
            entity=user.entity,
            wholesaler_order_item=wholesaler_order_item_obj,
            batch=batch,
            manufacture_date=manufacture_date,
            expiry_date=expiry_date,
            received_unit_quantity=received_unit_quantity,
            current_unit_quantity=received_unit_quantity,
            unit_of_receipt=unit_of_receipt,
            unit_buying_price=unit_buying_price,
            unit_selling_price=unit_selling_price,
            final_unit_selling_price=unit_selling_price,
            employee=employee_obj,
            owner=user
        )

        if created:
            return created
        else:
            return


def update_wholesaler_receipt(data, user):
    errors = []
    product_obj = None
    received_unit_quantity = 0
    current_unit_quantity = 0
    pack_buying_price = 0.0
    pack_selling_price = 0.0
    manufacture_date = None
    expiry_date = None
    received_from_obj = None
    wholesaler_order_item_obj = None
    employee_obj = None
    wholesaler_price_discount_obj = None
    wholesaler_quantity_discount_obj = None
    loose_units_quantity = 0.00
    qty_discounts=[]

    wholesaler_receipt = None

    try:
        wholesaler_receipt_id = data["wholesaler_receipt_details"]["wholesaler_receipt"]
        if wholesaler_receipt_id == "":
            errors.append("Receipt ID cannot be empty")
        else:
            wholesaler_receipt = wholesalers_models_validators.validate_wholesaler_receipt(
                wholesaler_receipt_id)
    except KeyError:
        errors.append("Receipt ID is required")

    if "product" in data["wholesaler_receipt_details"]:
        product_id = data["wholesaler_receipt_details"]["product"]
        if product_id == "":
            errors.append("Product ID cannot be empty")
        else:
            product_obj = product_models_validator.validate_product(product_id)

            wholesaler_receipt.product=product_obj
            wholesaler_receipt.save()

    if "received_unit_quantity" in data["wholesaler_receipt_details"]:
        received_unit_quantity = data["wholesaler_receipt_details"]["received_unit_quantity"]

        wholesaler_receipt.current_unit_quantity=int(received_unit_quantity)
        wholesaler_receipt.save()

    if "unit_buying_price" in data["wholesaler_receipt_details"]:
        unit_buying_price = data["wholesaler_receipt_details"]["unit_buying_price"]
        wholesaler_receipt.unit_buying_price=float(unit_buying_price)
        wholesaler_receipt.save()

    if "unit_selling_price" in data["wholesaler_receipt_details"]:
        unit_selling_price = data["wholesaler_receipt_details"]["unit_selling_price"]
        wholesaler_receipt.unit_selling_price=float(unit_selling_price)
        wholesaler_receipt.save()

    if "manufacture_date" in data["wholesaler_receipt_details"]:
        manufacture_date = data["wholesaler_receipt_details"]["manufacture_date"]
        
   

    if "expiry_date" in data["wholesaler_receipt_details"]:
        expiry_date = data["wholesaler_receipt_details"]["expiry_date"]


    if manufacture_date and expiry_date:
        if validators.end_date_is_after_start_date(manufacture_date, expiry_date):
            pass
        else:
            wholesaler_receipt.manufacture_date=manufacture_date
            wholesaler_receipt.expiry_date=expiry_date
            wholesaler_receipt.save()

    if "batch" in data["wholesaler_receipt_details"]:
        batch = data["wholesaler_receipt_details"]["batch"]
        wholesaler_receipt.batch=batch
        wholesaler_receipt.save()


    if "received_from" in data["wholesaler_receipt_details"]:
        received_from_id = data["wholesaler_receipt_details"]["received_from"]
        if received_from_id and not received_from_id == "":
            received_from_obj = authentication_models_validators.validate_entity(
                received_from_id)
            wholesaler_receipt.received_from=received_from_obj
            wholesaler_receipt.save()
            

    return wholesaler_receipt


def get_wholesaler_receipts(user):
    wholesaler_receipts = []
    cheap_roles_array = []
    user_roles = user.roles.all()
    if WholesalerReceipts.objects.filter(
        entity=user.entity,
    ):
        wholesaler_receipts = WholesalerReceipts.objects.filter(
            entity=user.entity,current_unit_quantity__gte=1
        ).all()
    return wholesaler_receipts

def get_wholesaler_receipt_with_analytics(data,user):
    errors =[]
    wholesaler = None
    retailer = None
    order_days = 0
    wholesaler_receipts = []
    if not "order_days" in data or int(data["order_days"])==0:
       raise exceptions.ValidationError("Order days are required")
    else:
        order_days = int(data["order_days"])
    if not "wholesaler_id" in data or data["wholesaler_id"] == "":
       raise exceptions.ValidationError("Wholesaler ID is required")

    else:
        wholesaler = authentication_models_validators.validate_entity(
            data['wholesaler_id'])
        
    if not "retailer_id" in data or data["retailer_id"] == "":
        raise exceptions.ValidationError("Retailer ID is required")
    else:
        retailer = authentication_models_validators.validate_entity(
            data['retailer_id'])

    if WholesalerReceipts.objects.filter(
        entity=wholesaler,pack_quantity__gte=1
    ).exists():
        wholesaler_receipts = WholesalerReceipts.objects.filter(
            entity=wholesaler,pack_quantity__gte=1
        ).all()
    return wholesaler_receipts


def get_wholesaler_price_discounts_by_id(data):
    wholesaler_obj = None
    if "wholesaler" in data and not data["wholesaler"] == "":
        wholesaler_obj = authentication_models_validators.validate_entity(
            data['wholesaler'])

    if WholesalerPriceDiscounts.objects.filter(
        entity=wholesaler_obj,
    ).exists():
        return WholesalerPriceDiscounts.objects.filter(
            entity=wholesaler_obj,
        ).all()
    else:
        return []
def get_wholesaler_price_discounts(user):


    if WholesalerPriceDiscounts.objects.filter(
        entity=user.entity,
    ).exists():
        return WholesalerPriceDiscounts.objects.filter(
            entity=user.entity,
        ).all()
    else:
        return []

def get_wholesaler_quantity_discounts(user):


    if WholesalerQuantityDiscounts.objects.filter(
        entity=user.entity,
    ).exists():
        return WholesalerQuantityDiscounts.objects.filter(
            entity=user.entity,
        ).all()
    else:
        return []
    

def get_wholesaler_quantity_discounts_by_id(data):
    wholesaler_obj = None
    if "wholesaler" in data and not data["wholesaler"] == "":
        wholesaler_obj = authentication_models_validators.validate_entity(
            data['wholesaler'])

    if WholesalerQuantityDiscounts.objects.filter(
        entity=wholesaler_obj,
    ).exists():
        return WholesalerQuantityDiscounts.objects.filter(
            entity=wholesaler_obj,
        ).all()
    else:
        return []
    
def get_wholesaler_receipt_by_id(data):
    wholesaler_obj = None
    if "wholesaler" in data and not data["wholesaler"] == "":
        wholesaler_obj = authentication_models_validators.validate_entity(
            data['wholesaler'])

    if WholesalerReceipts.objects.filter(
        entity=wholesaler_obj,
    ).exists():
        return WholesalerReceipts.objects.filter(
            entity=wholesaler_obj,
        ).all()
    else:
        return []
    
def get_wholesaler_receipt_by_id_and_discount(data):
    errors=[]
    wholesaler_obj = None
    discount_type=None
    if "wholesaler" in data and not data["wholesaler"] == "":
        wholesaler_obj = authentication_models_validators.validate_entity(
            data['wholesaler'])
        
    if "discount_type" in data and not data["discount_type"] == "":
        discount_type=data["discount_type"]
        if discount_type=="PRICE":
            items =[]
            if WholesalerReceipts.objects.filter(
                entity=wholesaler_obj,
            ).exclude(wholesaler_price_discount=None).exists():
                items = WholesalerReceipts.objects.filter(
                    entity=wholesaler_obj,
                ).exclude(wholesaler_price_discount=None), []

            return items,[]
            
        elif discount_type=="QUANTITY":
            all_items=[]
            items =[]
            all_items = WholesalerReceipts.objects.filter(
                entity=wholesaler_obj,
            ).all()
            if len(all_items)>0:
                for i in all_items:
                    if len(i.quantity_discounts.all())>0:
                        items.append(i)
            return items, []
        else:
            errors.append("Discounty type unknown")
            return None, errors
    else:
        errors.append("Discount type IS required")
        return None, errors



def search_wholesaler_receipts(data, user):
    # TODO: reference search with Q
    search_param = None
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError(
                "Search parameter cannot be empty")
        else:
            if WholesalerReceipts.objects.filter(
                Q(product__title__icontains=search_param)
                | Q(product__manufacturer__title__icontains=search_param)
                | Q(product__preparation__title__icontains=search_param),
                entity=user.entity
            ).exists():

                wholesaler_receipts = WholesalerReceipts.objects.filter(
                    Q(product__title__icontains=search_param)
                    | Q(product__manufacturer__title__icontains=search_param)
                    | Q(product__preparation__title__icontains=search_param),
                    entity=user.entity
                ).all()

                return wholesaler_receipts
            else:
                return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")


def search_wholesaler_receipts_by_id(data):
    if "wholesaler" in data and not data["wholesaler"] == "":
        wholesaler_obj = authentication_models_validators.validate_entity(
            data['wholesaler'])
    search_param = None
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError(
                "Search parameter cannot be empty")
        else:
            if WholesalerReceipts.objects.filter(
                Q(product__title__icontains=search_param)
                | Q(product__manufacturer__title__icontains=search_param)
                | Q(product__preparation__title__icontains=search_param),
                entity=wholesaler_obj
            ).exists():

                wholesaler_receipts = WholesalerReceipts.objects.filter(
                    Q(product__title__icontains=search_param)
                    | Q(product__manufacturer__title__icontains=search_param)
                    | Q(product__preparation__title__icontains=search_param),
                    entity=wholesaler_obj
                ).all()

                return wholesaler_receipts
            else:
                return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")
    
def get_wholesale_receipt_details(data, user):
    try:
        wholesale_receipt_id = data["id"]
        if WholesalerReceipts.objects.filter(id=wholesale_receipt_id).exists():
            product = WholesalerReceipts.objects.get(id=wholesale_receipt_id)

            return product

    except KeyError:
        raise exceptions.ValidationError("Product ID is required")