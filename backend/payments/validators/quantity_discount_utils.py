from rest_framework import exceptions


import datetime
from core import utils, validators
from ..validators import quantity_discount_utils
from ..models import PriceDiscounts, QuantityDiscounts


def get_retailer_quantity_discounts(user):
    return QuantityDiscounts.objects.filter(entity=user.entity, end__gte=datetime.datetime.today()).all()


def create_quantity_discount(data, user):
    errors = []
    title = None
    limit_quantity = 0.00
    awarded_quantity = 0.00
    start = None
    end = None
    is_active = None
    try:
        quantity_discount_details = data["quantity_discount_details"]
        if quantity_discount_details == {}:
            errors.append("Price discount details is empty")
    except KeyError:
        errors.append("Price discount details are required")

    try:
        title = data["quantity_discount_details"]["title"]
    except KeyError:
        errors.append("Discount title is required.")
    try:
        limit_quantity = data["quantity_discount_details"]["limit_quantity"]
        if limit_quantity == "":
            errors.append("Limit quantity is required")
    except KeyError:
        errors.append("Limit quantity is required.")
    try:
        is_active = data["quantity_discount_details"]["is_active"]
        if is_active == "":
            errors.append("Activity status is required")
    except KeyError:
        errors.append("Activity status is required.")

    try:
        awarded_quantity = data["quantity_discount_details"]["awarded_quantity"]
        if awarded_quantity == "":
            errors.append("Awarded quantity is required")

    except KeyError:
        errors.append("Awareded quantity is required.")

    try:
        start = data["quantity_discount_details"]["start"]
        if start == "":
            errors.append("Provide start date")
        elif validators.date_is_past_now(start):
            errors.append('Start date cannot be past date')

    except KeyError:
        errors.append("Start date is required.")
    try:
        end = data["quantity_discount_details"]["end"]
        if end == "":
            errors.append("Provide end date")
        elif validators.date_is_past_now(end):
            errors.append('End date cannot be past date')

    except KeyError:
        errors.append("End date is required.")
    if start and end:
        if not validators.end_date_is_after_start_date(start, end):
            errors.append("End date cannot come before start date")

    if QuantityDiscounts.objects.filter(entity=user.entity, title=title,limit_quantity=limit_quantity, awarded_quantity=awarded_quantity, end__gte=datetime.datetime.today()).exists():
        errors.append(
            f"Similar quantity discount is running at {utils.titlecase(user.entity.title)}")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        created = QuantityDiscounts.objects.create(
            title=title,
            limit_quantity=int(limit_quantity),
            awarded_quantity=int(awarded_quantity),
            start=start,
            end=end,
            owner=user, entity=user.entity,
            is_active=is_active
        )

        return created


def update_quantity_discount(data, user):
    errors = []
    title = None
    limit_quantity = None
    awarded_quantity = None
    start = None
    end = None
    quantity_discount = None
    is_active = None
    try:
        quantity_discount_details = data["quantity_discount_details"]
        if quantity_discount_details == {}:
            errors.append("Price discount details is empty")

    except KeyError:
        errors.append("Price discount details are required")
    if "id" in data["quantity_discount_details"]:
        discount_id = data["quantity_discount_details"]["id"]
        if QuantityDiscounts.objects.filter(id=discount_id).exists():
            quantity_discount = QuantityDiscounts.objects.filter(
                id=discount_id).first()
        else:
            raise exceptions.ValidationError(
                'Quantity discount with given ID does not exist')
    else:
        raise exceptions.ValidationError('Quantity discount ID is required')

    if "title" in data["quantity_discount_details"]:
        title = data["quantity_discount_details"]["title"]

    if "limit_quantity" in data["quantity_discount_details"]:
        limit_quantity = data["quantity_discount_details"]["limit_quantity"]
    if "awarded_quantity" in data["quantity_discount_details"]:
        awarded_quantity = data["quantity_discount_details"]["awarded_quantity"]

    if "start" in data["quantity_discount_details"]:
        start = data["quantity_discount_details"]["start"]
        if validators.date_is_past_now(start):
            errors.append('Start date cannot be past date')

    if "end" in data["quantity_discount_details"]:
        end = data["quantity_discount_details"]["end"]
        if validators.date_is_past_now(end):
            errors.append('End date cannot be past date')
    if "is_active" in data["quantity_discount_details"]:
        is_active = data["quantity_discount_details"]["is_active"]

    if start and end:
        if not validators.end_date_is_after_start_date(start, end):
            errors.append("End date cannot come before start date")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if title:
            quantity_discount.title = title
            quantity_discount.save()
        if limit_quantity:
            quantity_discount.limit_quantity = limit_quantity
            quantity_discount.save()
        if awarded_quantity:
            quantity_discount.awarded_quantity = awarded_quantity
            quantity_discount.save()
        if start:
            quantity_discount.start = start
            quantity_discount.save()
        if end:
            quantity_discount.end = end
            quantity_discount.save()
        if is_active:
            quantity_discount.is_active = is_active
            quantity_discount.save()
        return quantity_discount
