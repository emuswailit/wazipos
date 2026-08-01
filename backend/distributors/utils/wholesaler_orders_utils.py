from employees.validators import employees_models_validators
from authentication.validators import authentication_models_validators
from rest_framework import exceptions
from ..validators import distributors_models_validator
from ..models import WholesalerOrders, WholesalerOrderItems
from django.db import transaction
from datetime import datetime, timedelta
from distributors.validators import distributors_models_validator


@transaction.atomic
def create_wholesaler_order(data, user):
    errors = []
    distributor_obj = None
    order_terms = None
    draft_id = None
    shipping_amount = 0.0
    distributor_receipt_obj = None

    employee_obj = employees_models_validators.validate_employee(user)

    try:
        distributor_id = data["wholesaler_order_details"]["distributor"]
        if distributor_id == "":
            errors.append("Distributor ID cannot be empty")
        else:
            distributor_obj = authentication_models_validators.validate_entity(
                distributor_id)
    except KeyError:
        errors.append("Distributor ID is required")

    try:
        draft_id = data["wholesaler_order_details"]["draft_id"]
        if draft_id == "":
            errors.append("Draft ID cannot be empty")
    except KeyError:
        errors.append("Draft ID is required")

    try:
        order_terms = data["wholesaler_order_details"]["order_terms"]
        if order_terms == "":
            errors.append("Order terms cannot be empty")
    except KeyError:
        errors.append("Order terms is required")

    if "shipping_amount" in data["wholesaler_order_details"]:
        shipping_amount = data["wholesaler_order_details"]["shipping_amount"]

    if "order_gross_price_total" in data["wholesaler_order_details"]:
        order_gross_price_total = data["wholesaler_order_details"]["order_gross_price_total"]

    if "order_discount_total" in data["wholesaler_order_details"]:
        order_discount_total = data["wholesaler_order_details"]["order_discount_total"]

    if "order_net_price_total" in data["wholesaler_order_details"]:
        order_net_price_total = data["wholesaler_order_details"]["order_net_price_total"]

    try:
        order_items = data["wholesaler_order_details"]["order_items"]
        if len(order_items) < 1:
            errors.append("Order items cannot be empty")

        else:
            for item in order_items:
                distributor_receipt_obj = None
                purchased_quantity = 0

                try:
                    purchased_quantity = item["purchased_quantity"]
                    if purchased_quantity == "":
                        errors.append("Purchased quantity cannot be empty")

                except KeyError:
                    errors.append("Purchased quatity is required")
                try:
                    total_quantity = item["total_quantity"]
                    if total_quantity == "":
                        errors.append("Total quantity cannot be empty")

                except KeyError:
                    errors.append("Total quatity is required")

                if "discount_quantity" in item:
                    discount_quantity = item["discount_quantity"]
                    if discount_quantity == "":
                        errors.append("Discount quantity cannot be empty")

                try:
                    distributor_receipt_id = item["distributor_receipt"]
                    if distributor_receipt_id == "":
                        errors.append("Distributor receipt cannot be empty")
                    else:
                        distributor_receipt_obj = distributors_models_validator.validate_distributor_receipt(
                            distributor_receipt_id, total_quantity)
                except KeyError:
                    errors.append("Order items is required")
    except KeyError:
        errors.append("Order terms is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        # five_minutes_ago = datetime.now() - timedelta(minutes=5)
        # if WholesalerOrders.objects.filter(draft_id=draft_id, distributor=distributor_obj, created__gte=five_minutes_ago, owner=user).exists():
        #     raise exceptions.ValidationError(
        #         "You created a similar order within less than 5 minutes ago")
        created = WholesalerOrders.objects.create(
            distributor=distributor_obj,
            order_terms=order_terms,
            draft_id=draft_id,
            shipping_amount=shipping_amount,
            owner=user,
            entity=user.entity,
            employee=employee_obj)

        if created:
            for item in order_items:
                order_item = WholesalerOrderItems.objects.create(
                    wholesaler_order=created,
                    purchased_quantity=item['purchased_quantity'],
                    total_quantity=item['total_quantity'],
                    discount_quantity=item['discount_quantity'],
                    item_gross_price=item['item_gross_price'],
                    item_net_price=item['item_net_price'],
                    item_discount=item['item_discount'],
                    distributor_receipt_id=item['distributor_receipt'],
                    owner=user,
                    entity=user.entity

                )
            return created


def get_user_wholesaler_orders(data, user):
    if 'distributor' in data and not data['distributor'] == "":
        distributor_id = data['distributor']
        print('id', distributor_id)
        if WholesalerOrders.objects.filter(owner=user, distributor_id=distributor_id, entity=user.entity).exists():
            return WholesalerOrders.objects.filter(owner=user, distributor_id=distributor_id, entity=user.entity).all()
        else:
            return []


def get_entity_wholesaler_orders(data, user):
    if 'distributor' in data and not data['distributor'] == "":
        distributor_id = data['distributor']
        if WholesalerOrders.objects.filter(entity=user.entity, distributor_id=distributor_id).exists():
            return WholesalerOrders.objects.filter(entity=user.entity, distributor_id=distributor_id).all()
        else:
            return []
