from rest_framework import exceptions

from ..models import PriceDiscounts
import datetime
from core import utils, validators


def get_retailer_price_discounts(user):
    return PriceDiscounts.objects.filter(entity=user.entity, end__gte=datetime.datetime.today()).all()


def create_price_discount(data, user):
    errors = []
    title = None
    percent = 0.00
    start = None
    end = None
    is_active = None
    try:
        price_discount_details = data["price_discount_details"]
        if price_discount_details == {}:
            errors.append("Price discount details is empty")
    except KeyError:
        errors.append("Price discount details are required")

    try:
        title = data["price_discount_details"]["title"]
    except KeyError:
        errors.append("Discount title is required.")
    try:
        is_active = data["price_discount_details"]["is_active"]
    except KeyError:
        errors.append("DActivity status is required.")
    try:
        percent = data["price_discount_details"]["percent"]
        if percent == "":
            errors.append("Provide discount percentage")

    except KeyError:
        errors.append("Percentage is required.")

    try:
        start = data["price_discount_details"]["start"]
        if start == "":
            errors.append("Provide start date")
        elif validators.date_is_past_now(start):
            errors.append('Start date cannot be past date')

    except KeyError:
        errors.append("Start date is required.")
    try:
        end = data["price_discount_details"]["end"]
        if end == "":
            errors.append("Provide end date")
        elif validators.date_is_past_now(end):
            errors.append('End date cannot be past date')

    except KeyError:
        errors.append("End date is required.")
    if start and end:
        if not validators.end_date_is_after_start_date(start, end):
            errors.append("End date cannot come before start date")

    if PriceDiscounts.objects.filter(entity=user.entity, title=title, end__gte=datetime.datetime.today()).exists():
        errors.append(
            f"Similar discount is running at {utils.titlecase(user.entity.title)}")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        created = PriceDiscounts.objects.create(
            title=title,
            percent=float(percent),
            start=start,
            end=end,
            owner=user, entity=user.entity,
            is_active=is_active
        )

        return created


def update_price_discount(data, user):
    errors = []
    title = None
    percent = None
    start = None
    end = None
    price_discount = None
    is_active = None
    try:
        price_discount_details = data["price_discount_details"]
        if price_discount_details == {}:
            errors.append("Price discount details is empty")

    except KeyError:
        errors.append("Price discount details are required")
    if "id" in data["price_discount_details"]:
        discount_id = data["price_discount_details"]["id"]
        if PriceDiscounts.objects.filter(id=discount_id).exists():
            price_discount = PriceDiscounts.objects.filter(
                id=discount_id).first()
        else:
            raise exceptions.ValidationError(
                'Price discount with given ID does not exist')
    else:
        raise exceptions.ValidationError('Price discount ID is required')

    if "title" in data["price_discount_details"]:
        title = data["price_discount_details"]["title"]

    if "percent" in data["price_discount_details"]:
        percent = data["price_discount_details"]["percent"]

    if "start" in data["price_discount_details"]:
        start = data["price_discount_details"]["start"]
        if validators.date_is_past_now(start):
            errors.append('Start date cannot be past date')

    if "end" in data["price_discount_details"]:
        end = data["price_discount_details"]["end"]
        if validators.date_is_past_now(end):
            errors.append('End date cannot be past date')
    if "is_active" in data["price_discount_details"]:
        is_active = data["price_discount_details"]["is_active"]

    if start and end:
        if not validators.end_date_is_after_start_date(start, end):
            errors.append("End date cannot come before start date")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if title:
            price_discount.title = title
            price_discount.save()
        if percent:
            price_discount.percent = percent
            price_discount.save()
        if start:
            price_discount.start = start
            price_discount.save()
        if end:
            price_discount.end = end
            price_discount.save()
        if is_active:
            price_discount.is_active = is_active
            price_discount.save()

        return price_discount
