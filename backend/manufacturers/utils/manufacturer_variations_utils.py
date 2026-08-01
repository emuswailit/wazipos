
from ..models import ManufacturerVariations
from ..validators import manufacturers_models_validators
from employees.validators import employees_models_validators
from products.validators import product_models_validator
from rest_framework import exceptions
from core import validators
from payments.validators import payments_models_validators
from django.db.models import Q


def create_manufacturer_variation(data, user):
    errors = []
    product_obj = None
    pack_quantity = 0
    batch = ""
    pack_selling_price = 0.0
    manufacture_date = None
    expiry_date = None
    employee_obj = None

    employee_obj = employees_models_validators.validate_employee(user)

    try:
        product_id = data["manufacturer_variation_details"]["product"]
        if product_id == "":
            errors.append("Product ID cannot be empty")
        else:
            product_obj = product_models_validator.validate_product(product_id)
    except KeyError:
        errors.append("Product ID is required")

    try:
        pack_quantity = data["manufacturer_variation_details"]["pack_quantity"]
        if pack_quantity == "":
            errors.append("Pack quantity cannot be empty")
    except KeyError:
        errors.append("Product ID is required")
    try:
        is_active = data["manufacturer_variation_details"]["is_active"]
        if is_active == "":
            errors.append("Activity status cannot be empty")
    except KeyError:
        errors.append("Activity status is required")

    try:
        pack_selling_price = data["manufacturer_variation_details"]["pack_selling_price"]
        if pack_selling_price == "":
            errors.append("Pack selling price cannot be empty")
    except KeyError:
        errors.append("Pack selling price is required")

    try:
        batch = data["manufacturer_variation_details"]["batch"]
        if batch == "":
            errors.append("Batch cannot be empty")
    except KeyError:
        errors.append("Batch is required")

    if "manufacture_date" in data["manufacturer_variation_details"]:
        manufacture_date = data["manufacturer_variation_details"]["manufacture_date"]
        if product_obj and product_obj.preparation and manufacture_date == "":
            raise exceptions.ValidationError(
                'Manufacture date is required for pharmaceutical products')

    if "expiry_date" in data["manufacturer_variation_details"]:
        expiry_date = data["manufacturer_variation_details"]["expiry_date"]
        if product_obj and product_obj.preparation and expiry_date == "":
            raise exceptions.ValidationError(
                'Expiry date is required for pharmaceutical products')

    if manufacture_date and expiry_date:
        if validators.end_date_is_after_start_date(manufacture_date, expiry_date):
            pass

    if "price_discount" in data["manufacturer_variation_details"]:
        price_discount_id = data["manufacturer_variation_details"]["price_discount"]
        if price_discount_id and not price_discount_id == "":
            price_discount_obj = payments_models_validators.validate_price_discount_exists(
                price_discount_id)
    if "quantity_discount" in data["manufacturer_variation_details"]:
        quantity_discount_id = data["manufacturer_variation_details"]["quantity_discount"]
        if quantity_discount_id and not quantity_discount_id == "":
            quantity_discount_obj = payments_models_validators.validate_quantity_discount_exists(
                quantity_discount_id)

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:

        created = ManufacturerVariations.objects.create(
            wholesaler_variation=wholesaler_variation,
            product=product_obj,
            received_from=received_from_obj,
            entity=user.entity,
            wholesaler_order_item=wholesaler_order_item_obj,
            batch=batch,
            manufacture_date=manufacture_date,
            expiry_date=expiry_date,
            pack_quantity=pack_quantity,
            pack_buying_price=pack_buying_price,
            pack_selling_price=pack_selling_price,
            employee=employee_obj,
            quantity_discount=quantity_discount_obj,
            price_discount=price_discount_obj,
            owner=user
        )

        if created:
            return created
        else:
            return


def update_manufacturer_variation(data, user):
    errors = []
    product_obj = None
    pack_quantity = 0
    pack_buying_price = 0.0
    pack_selling_price = 0.0
    manufacture_date = None
    expiry_date = None
    wholesaler_order_item_obj = None
    employee_obj = None
    price_discount_obj = None
    quantity_discount_obj = None
    wholesaler_receipt = None

    try:
        manufacturer_variation_id = data["manufacturer_variation_details"]["wholesaler_receipt"]
        if manufacturer_variation_id == "":
            errors.append("Receipt ID cannot be empty")
        else:
            wholesaler_receipt = manufacturers_models_validators.existing_manufacturer_variation(
                manufacturer_variation_id)
    except KeyError:
        errors.append("Manufacturer variation ID is required")

    if "product" in data["manufacturer_variation_details"]:
        product_id = data["manufacturer_variation_details"]["product"]
        if product_id == "":
            errors.append("Product ID cannot be empty")
        else:
            product_obj = product_models_validator.validate_product(product_id)

    if "pack_quantity" in data["manufacturer_variation_details"]:
        pack_quantity = data["manufacturer_variation_details"]["pack_quantity"]
        if pack_quantity == "":
            errors.append("Pack quantity cannot be empty")

    if "pack_selling_price" in data["manufacturer_variation_details"]:
        pack_selling_price = data["manufacturer_variation_details"]["pack_selling_price"]
        if pack_selling_price == "":
            errors.append("Pack selling price cannot be empty")

    if "manufacture_date" in data["manufacturer_variation_details"]:
        manufacture_date = data["manufacturer_variation_details"]["manufacture_date"]
        if product_obj and product_obj.preparation and manufacture_date == "":
            raise exceptions.ValidationError(
                'Manufacture date is required for pharmaceutical products')

    if "expiry_date" in data["manufacturer_variation_details"]:
        expiry_date = data["manufacturer_variation_details"]["expiry_date"]
        if product_obj and product_obj.preparation and expiry_date == "":
            raise exceptions.ValidationError(
                'Expiry date is required for pharmaceutical products')

    if manufacture_date and expiry_date:
        if validators.end_date_is_after_start_date(manufacture_date, expiry_date):
            pass

    if "batch" in data["manufacturer_variation_details"]:
        batch = data["manufacturer_variation_details"]["batch"]
        if product_obj and product_obj.preparation and batch == "":
            raise exceptions.ValidationError(
                'Batch is required for pharmaceutical products')

    if "price_discount" in data["manufacturer_variation_details"]:
        price_discount_id = data["manufacturer_variation_details"]["price_discount"]
        if price_discount_id and not price_discount_id == "":
            price_discount_obj = payments_models_validators.validate_price_discount_exists(
                price_discount_id)
    if "quantity_discount" in data["manufacturer_variation_details"]:
        quantity_discount_id = data["manufacturer_variation_details"]["quantity_discount"]
        if quantity_discount_id and not quantity_discount_id == "":
            quantity_discount_obj = payments_models_validators.validate_quantity_discount_exists(
                quantity_discount_id)

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if product_obj:
            wholesaler_receipt.product = product_obj
            wholesaler_receipt.save()
        if pack_quantity:
            wholesaler_receipt.pack_quantity = pack_quantity
            wholesaler_receipt.save()
        if pack_quantity:
            wholesaler_receipt.pack_quantity = pack_quantity
            wholesaler_receipt.save()
        if pack_buying_price:
            wholesaler_receipt.pack_buying_price = pack_buying_price
            wholesaler_receipt.save()
        if pack_selling_price:
            wholesaler_receipt.pack_selling_price = pack_selling_price
            wholesaler_receipt.save()
        if manufacture_date:
            wholesaler_receipt.manufacture_date = manufacture_date
            wholesaler_receipt.save()
        if expiry_date:
            wholesaler_receipt.expiry_date = expiry_date
            wholesaler_receipt.save()
        if wholesaler_order_item_obj:
            wholesaler_receipt.wholesaler_order_item = wholesaler_order_item_obj
            wholesaler_receipt.save()
        if price_discount_obj:
            wholesaler_receipt.price_discount = price_discount_obj
            wholesaler_receipt.save()
        if quantity_discount_obj:
            wholesaler_receipt.quantity_discount = quantity_discount_obj
            wholesaler_receipt.save()

        return wholesaler_receipt


def get_manufacturer_variations(user):
    manufacturer_variations = []
    cheap_roles_array = []
    user_roles = user.roles.all()
    if ManufacturerVariations.objects.filter(
        entity=user.entity,
    ):
        manufacturer_variations = ManufacturerVariations.objects.filter(
            entity=user.entity,
        ).all()
    return manufacturer_variations


def search_manufacturer_variations(data, user):
    # TODO: reference search with Q
    search_param = None
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError(
                "Search parameter cannot be empty")
        else:
            if ManufacturerVariations.objects.filter(
                Q(product__title__icontains=search_param)
                | Q(batch__icontains=search_param)
                | Q(product__preparation__title__icontains=search_param),
                entity=user.entity
            ).exists():

                manufacturer_variations = ManufacturerVariations.objects.filter(
                    Q(product__title__icontains=search_param)
                    | Q(batch__icontains=search_param)
                    | Q(product__preparation__title__icontains=search_param),
                    entity=user.entity
                ).all()

                return manufacturer_variations
            else:
                return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")
