from ..models import DistributorReceipts, DistributorVariations
from employees.validators import employees_models_validators
from products.validators import product_models_validator
from rest_framework import exceptions
from core import validators
from authentication.validators import authentication_models_validators
from payments.validators import payments_models_validators
from distributors.validators import distributors_models_validator
from django.db.models import Q
from datetime import datetime, timedelta


def create_distributor_receipt(data, user):
    errors = []
    product_obj = None
    pack_quantity = 0
    pack_buying_price = 0.0
    pack_selling_price = 0.0
    manufacture_date = None
    expiry_date = None
    received_from_obj = None
    distributor_order_item_obj = None
    employee_obj = None
    price_discount_obj = None
    quantity_discount_obj = None
    batch = ""

    employee_obj = employees_models_validators.validate_employee(user)

    try:
        product_id = data["distributor_receipt_details"]["product"]
        if product_id == "":
            errors.append("Product ID cannot be empty")
        else:
            product_obj = product_models_validator.validate_product(product_id)
    except KeyError:
        errors.append("Product ID is required")

    try:
        pack_quantity = data["distributor_receipt_details"]["pack_quantity"]
        if pack_quantity == "":
            errors.append("Pack quantity cannot be empty")
    except KeyError:
        errors.append("Product ID is required")

    try:
        pack_buying_price = data["distributor_receipt_details"]["pack_buying_price"]
        if pack_buying_price == "":
            errors.append("Pack buying price cannot be empty")
    except KeyError:
        errors.append("Pack buying price is required")

    try:
        pack_selling_price = data["distributor_receipt_details"]["pack_selling_price"]
        if pack_selling_price == "":
            errors.append("Pack selling price cannot be empty")
    except KeyError:
        errors.append("Pack selling price is required")

    if "manufacture_date" in data["distributor_receipt_details"]:
        manufacture_date = data["distributor_receipt_details"]["manufacture_date"]
        if product_obj.preparation and manufacture_date == "":
            raise exceptions.ValidationError(
                'Manufacture date is required for pharmaceutical products')

    if "expiry_date" in data["distributor_receipt_details"]:
        expiry_date = data["distributor_receipt_details"]["expiry_date"]
        if product_obj.preparation and expiry_date == "":
            raise exceptions.ValidationError(
                'Expiry date is required for pharmaceutical products')

    if manufacture_date and expiry_date:
        if validators.end_date_is_after_start_date(manufacture_date, expiry_date):
            pass

    if "batch" in data["distributor_receipt_details"]:
        batch = data["distributor_receipt_details"]["batch"]
        if product_obj.preparation and batch == "":
            raise exceptions.ValidationError(
                'Batch is required for pharmaceutical products')

    if "received_from" in data["distributor_receipt_details"]:
        received_from_id = data["distributor_receipt_details"]["received_from"]
        if received_from_id and not received_from_id == "":
            received_from_obj = authentication_models_validators.validate_entity(
                received_from_id)
    if "distributor_order_item" in data["distributor_receipt_details"]:
        distributor_order_item_id = data["distributor_receipt_details"]["distributor_order_item"]
        if distributor_order_item_id and not distributor_order_item_id == "":
            distributor_order_item_obj = distributors_models_validator.validate_distributor_order_item(
                distributor_order_item_id)
    if "price_discount" in data["distributor_receipt_details"]:
        price_discount_id = data["distributor_receipt_details"]["price_discount"]
        if price_discount_id and not price_discount_id == "":
            price_discount_obj = payments_models_validators.validate_price_discount_exists(
                price_discount_id)
    if "quantity_discount" in data["distributor_receipt_details"]:
        quantity_discount_id = data["distributor_receipt_details"]["quantity_discount"]
        if quantity_discount_id and not quantity_discount_id == "":
            quantity_discount_obj = payments_models_validators.validate_quantity_discount_exists(
                quantity_discount_id)

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        five_minutes_ago = datetime.today()-timedelta(minutes=5)
        if DistributorReceipts.objects.filter(product=product_obj).exists():
            distributor_variation = DistributorVariations.objects.filter(
                product=product_obj
            ).first()
        else:
            distributor_variation = DistributorVariations.objects.create(
                product=product_obj, owner=user, entity=user.entity
            )

        if DistributorReceipts.objects.filter(distributor_variation=distributor_variation, entity=user.entity, product=product_obj, pack_quantity=pack_quantity, created__gte=five_minutes_ago).exists:
            raise exceptions.ValidationError(
                'Similar item has just been created few minutes ago')
        created = DistributorReceipts.objects.create(
            distributor_variation=distributor_variation,
            product=product_obj,
            received_from=received_from_obj,
            entity=user.entity,
            distributor_order_item=distributor_order_item_obj,
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


def get_distributor_receipts(user):
    distributor_receipts = []
    cheap_roles_array = []
    user_roles = user.roles.all()
    if DistributorReceipts.objects.filter(
        entity=user.entity,
    ):
        distributor_receipts = DistributorReceipts.objects.filter(
            entity=user.entity,
        ).all()
    return distributor_receipts


def update_distributor_receipt(data, user):
    errors = []
    product_obj = None
    pack_quantity = 0
    pack_buying_price = 0.0
    pack_selling_price = 0.0
    manufacture_date = None
    expiry_date = None
    received_from_obj = None
    distributor_order_item_obj = None
    employee_obj = None
    price_discount_obj = None
    quantity_discount_obj = None
    batch = "",
    distributor_receipt = None

    try:
        distributor_receipt_id = data["distributor_receipt_details"]["distributor_receipt"]
        if distributor_receipt_id == "":
            errors.append("Receipt ID cannot be empty")
        else:
            distributor_receipt = distributors_models_validator.validate_distributor_receipt(
                distributor_receipt_id)
    except KeyError:
        errors.append("Receipt ID is required")

    if "product" in data["distributor_receipt_details"]:
        product_id = data["distributor_receipt_details"]["product"]
        if product_id == "":
            errors.append("Product ID cannot be empty")
        else:
            product_obj = product_models_validator.validate_product(product_id)

    if "pack_quantity" in data["distributor_receipt_details"]:
        pack_quantity = data["distributor_receipt_details"]["pack_quantity"]
        if pack_quantity == "":
            errors.append("Pack quantity cannot be empty")

    if "pack_buying_price" in data["distributor_receipt_details"]:
        pack_buying_price = data["distributor_receipt_details"]["pack_buying_price"]
        if pack_buying_price == "":
            errors.append("Pack buying price cannot be empty")

    if "pack_selling_price" in data["distributor_receipt_details"]:
        pack_selling_price = data["distributor_receipt_details"]["pack_selling_price"]
        if pack_selling_price == "":
            errors.append("Pack selling price cannot be empty")

    if "manufacture_date" in data["distributor_receipt_details"]:
        manufacture_date = data["distributor_receipt_details"]["manufacture_date"]
        if product_obj.preparation and manufacture_date == "":
            raise exceptions.ValidationError(
                'Manufacture date is required for pharmaceutical products')

    if "expiry_date" in data["distributor_receipt_details"]:
        expiry_date = data["distributor_receipt_details"]["expiry_date"]
        if product_obj.preparation and expiry_date == "":
            raise exceptions.ValidationError(
                'Expiry date is required for pharmaceutical products')

    if manufacture_date and expiry_date:
        if validators.end_date_is_after_start_date(manufacture_date, expiry_date):
            pass

    if "batch" in data["distributor_receipt_details"]:
        batch = data["distributor_receipt_details"]["batch"]
        if product_obj.preparation and batch == "":
            raise exceptions.ValidationError(
                'Batch is required for pharmaceutical products')

    if "received_from" in data["distributor_receipt_details"]:
        received_from_id = data["distributor_receipt_details"]["received_from"]
        if received_from_id and not received_from_id == "":
            received_from_obj = authentication_models_validators.validate_entity(
                received_from_id)
    if "distributor_order_item" in data["distributor_receipt_details"]:
        distributor_order_item_id = data["distributor_receipt_details"]["distributor_order_item"]
        if distributor_order_item_id and not distributor_order_item_id == "":
            distributor_order_item_obj = distributors_models_validator.validate_distributor_order_item(
                distributor_order_item_id)
    if "price_discount" in data["distributor_receipt_details"]:
        price_discount_id = data["distributor_receipt_details"]["price_discount"]
        if price_discount_id and not price_discount_id == "":
            price_discount_obj = payments_models_validators.validate_price_discount(
                price_discount_id)
    if "quantity_discount" in data["distributor_receipt_details"]:
        quantity_discount_id = data["distributor_receipt_details"]["quantity_discount"]
        if quantity_discount_id and not quantity_discount_id == "":
            quantity_discount_obj = payments_models_validators.validate_quantity_discount(
                quantity_discount_id)

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if product_obj:
            distributor_receipt.product = product_obj
            distributor_receipt.save()
        if batch:
            distributor_receipt.batch = batch
            distributor_receipt.save()
        if pack_quantity:
            distributor_receipt.pack_quantity = pack_quantity
            distributor_receipt.save()
        if pack_quantity:
            distributor_receipt.pack_quantity = pack_quantity
            distributor_receipt.save()
        if pack_buying_price:
            distributor_receipt.pack_buying_price = pack_buying_price
            distributor_receipt.save()
        if pack_selling_price:
            distributor_receipt.pack_selling_price = pack_selling_price
            distributor_receipt.save()
        if manufacture_date:
            distributor_receipt.manufacture_date = manufacture_date
            distributor_receipt.save()
        if expiry_date:
            distributor_receipt.expiry_date = expiry_date
            distributor_receipt.save()
        if received_from_obj:
            distributor_receipt.received_from = received_from_obj
            distributor_receipt.save()
        if distributor_order_item_obj:
            distributor_receipt.distributor_order_item = distributor_order_item_obj
            distributor_receipt.save()
        if price_discount_obj:
            distributor_receipt.price_discount = price_discount_obj
            distributor_receipt.save()
        if quantity_discount_obj:
            distributor_receipt.quantity_discount = quantity_discount_obj
            distributor_receipt.save()

        return distributor_receipt


def search_distributor_receipts(data, user):
    # TODO: reference search with Q
    search_param = None
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError(
                "Search parameter cannot be empty")
        else:
            if DistributorReceipts.objects.filter(
                Q(product__title__icontains=search_param)
                | Q(product__manufacturer__title__icontains=search_param)
                | Q(product__preparation__title__icontains=search_param),
                entity=user.entity
            ).exists():

                distributor_receipts = DistributorReceipts.objects.filter(
                    Q(product__title__icontains=search_param)
                    | Q(product__manufacturer__title__icontains=search_param)
                    | Q(product__preparation__title__icontains=search_param),
                    entity=user.entity
                ).all()

                return distributor_receipts
            else:
                return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")


def search_distributor_receipts_by_wholesalers(data, user):
    distributor_obj = None
    if "distributor" in data and not data["distributor"] == "":
        distributor_obj = authentication_models_validators.validate_entity(
            data['distributor'])
    search_param = None
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError(
                "Search parameter cannot be empty")
        else:
            if DistributorReceipts.objects.filter(
                Q(product__title__icontains=search_param)
                | Q(product__manufacturer__title__icontains=search_param)
                | Q(product__preparation__title__icontains=search_param),
                entity=distributor_obj
            ).exists():

                distributor_receipts = DistributorReceipts.objects.filter(
                    Q(product__title__icontains=search_param)
                    | Q(product__manufacturer__title__icontains=search_param)
                    | Q(product__preparation__title__icontains=search_param),
                    entity=distributor_obj
                ).all()

                return distributor_receipts
            else:
                return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")


def get_distributor_receipt_by_id(data):
    distributor_id = None
    if "distributor" in data and not data["distributor"] == "":
        distributor_id = data["distributor"]
        print('dist id', distributor_id)
        distributor_obj = authentication_models_validators.validate_entity(
            distributor_id)

    if DistributorReceipts.objects.filter(
        entity=distributor_obj,
    ).exists():
        return DistributorReceipts.objects.filter(
            entity=distributor_obj,
        ).all()
    else:
        return []
