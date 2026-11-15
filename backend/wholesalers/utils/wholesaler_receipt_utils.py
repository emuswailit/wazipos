from email import errors
from rest_framework import exceptions
from products.validators import product_models_validator
from authentication.validators import authentication_models_validators
from distributors.validators import distributors_models_validator
from employees.validators import employees_models_validators
from retailers.models import RetailerReceipts
from ..models import WholesalerReceipts,  WholesalerPriceDiscounts, WholesalerQuantityDiscounts
from core import validators
from ..validators import wholesalers_models_validators
from django.db.models import Q
import datetime
import pytz




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
    draft_id=None
    try:
        draft_id = data["wholesaler_receipt_details"]["draft_id"]
        if draft_id and not draft_id== "":
            if WholesalerReceipts.objects.filter(draft_id=draft_id).exists():
                errors.append("Order with similar draft ID is already synced")
                return errors, None
        
   
    except KeyError:
        errors.append(f"Draft ID is required")

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
            # Sold in parts: price of one part (products/units.py)
            part_selling_price=data["wholesaler_receipt_details"].get("part_selling_price") or 0,
            employee=employee_obj,
            owner=user
        )

        if created:
            return created
        else:
            return


def update_wholesaler_receipt(data, user):
    """
    Edit one of the caller's own receipts (offline edits are pushed here).
    received_unit_quantity: the stock received; current stock moves by the
    difference (so sales since then are kept). current_unit_quantity: an
    explicit stock count, when sent.
    """
    details = data.get("wholesaler_receipt_details") or {}
    receipt_id = str(details.get("wholesaler_receipt") or "").strip()
    if not receipt_id:
        raise exceptions.ValidationError("Receipt ID is required")
    wholesaler_receipt = WholesalerReceipts.objects.filter(id=receipt_id, entity=user.entity).first()
    if not wholesaler_receipt:
        raise exceptions.ValidationError("Receipt for provided ID does not exist")

    def _int(value, label):
        try:
            n = int(float(value))
        except (TypeError, ValueError):
            raise exceptions.ValidationError(f"Enter a valid {label}")
        if n < 0:
            raise exceptions.ValidationError(f"{label.capitalize()} can't be negative")
        return n

    def _money(value, label):
        try:
            return float(value)
        except (TypeError, ValueError):
            raise exceptions.ValidationError(f"Enter a valid {label}")

    if details.get("product") not in (None, ""):
        wholesaler_receipt.product = product_models_validator.validate_product(details["product"])

    if details.get("received_unit_quantity") not in (None, ""):
        received = _int(details["received_unit_quantity"], "received quantity")
        delta = received - int(wholesaler_receipt.received_unit_quantity or 0)
        wholesaler_receipt.received_unit_quantity = received
        wholesaler_receipt.current_unit_quantity = max(0, int(wholesaler_receipt.current_unit_quantity or 0) + delta)

    if details.get("current_unit_quantity") not in (None, ""):
        wholesaler_receipt.current_unit_quantity = _int(details["current_unit_quantity"], "stock quantity")

    if details.get("unit_buying_price") not in (None, ""):
        wholesaler_receipt.unit_buying_price = _money(details["unit_buying_price"], "buying price")

    if details.get("unit_selling_price") not in (None, ""):
        wholesaler_receipt.unit_selling_price = _money(details["unit_selling_price"], "selling price")

    # Sold in parts: part price, and a count of what's left in the opened unit.
    if details.get("part_selling_price") not in (None, ""):
        wholesaler_receipt.part_selling_price = _money(details["part_selling_price"], "part price")

    if details.get("open_content") not in (None, ""):
        from products.units import D, content_per_unit

        open_content = D(details["open_content"])
        cap = content_per_unit(wholesaler_receipt.product)
        if open_content < 0 or (cap > 0 and open_content >= cap):
            raise exceptions.ValidationError("What's left in the opened unit must be less than a whole unit")
        wholesaler_receipt.open_content = open_content

    manufacture_date = details.get("manufacture_date") or None
    expiry_date = details.get("expiry_date") or None
    if manufacture_date and expiry_date:
        if not validators.end_date_is_after_start_date(manufacture_date, expiry_date):
            raise exceptions.ValidationError("Expiry date must be after the manufacture date")
        wholesaler_receipt.manufacture_date = manufacture_date
        wholesaler_receipt.expiry_date = expiry_date
    elif expiry_date:
        wholesaler_receipt.expiry_date = expiry_date

    if "batch" in details:
        wholesaler_receipt.batch = details.get("batch") or None

    if details.get("received_from"):
        wholesaler_receipt.received_from = authentication_models_validators.validate_entity(details["received_from"])

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