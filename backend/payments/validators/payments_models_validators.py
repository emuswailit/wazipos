from .. import models
from rest_framework import exceptions
from datetime import datetime, timedelta


def validate_price_discount_exists(id):

    if not models.PriceDiscounts.objects.filter(id=id, end__gte=datetime.today()).exists():
        raise exceptions.ValidationError(
            "Price discount for provided ID does not exist")
    else:
        return models.PriceDiscounts.objects.filter(id=id).first()


def validate_quantity_discount_exists(id):

    if not models.QuantityDiscounts.objects.filter(id=id, end__gte=datetime.today()).exists():
        raise exceptions.ValidationError(
            "Quantity discount for provided ID does not exist")
    else:
        return models.QuantityDiscounts.objects.filter(id=id).first()


def validate_payment_method_exists(id):

    if not models.PaymentMethods.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Payment method for provided ID does not exist")
    else:
        return models.PaymentMethods.objects.filter(id=id).first()

def validate_psp_exists(id):

    if not models.PaymentServicesProvider.objects.filter(id=id).exists():
        return None
    else:
        return models.PaymentServicesProvider.objects.filter(id=id).first()
def validate_psp_branch(id):

    if not models.PaymentServicesProviderBranch.objects.filter(id=id).exists():
        return None
    else:
        return models.PaymentServicesProviderBranch.objects.filter(id=id).first()

def validate_payout_account(id, user):

    if not models.PayoutAccounts.objects.filter(id=id, owner = user).exists():
        raise exceptions.ValidationError(
            "Payout account for provided ID does not exist")
    else:
        return models.PayoutAccounts.objects.filter(id=id).first()