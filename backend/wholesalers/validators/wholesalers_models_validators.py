from .. import models
from payments.models import PriceDiscounts, QuantityDiscounts
from rest_framework import exceptions


def validate_wholesaler_price_discount(id):
    print('idee', id)

    if not PriceDiscounts.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Wholesaler price discount for this user does not exist")
    else:
        return PriceDiscounts.objects.filter(id=id).first()


def validate_wholesaler_quantity_discount(id):

    if not QuantityDiscounts.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Wholesaler quantity discount for this user does not exist")
    else:
        return QuantityDiscounts.objects.filter(id=id).first()


def validate_wholesaler_receipt(id):

    if not models.WholesalerReceipts.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Wholesaler receipt for provided ID does not exist")
    else:
        return models.WholesalerReceipts.objects.filter(id=id).first()


def validate_wholesaler_receipt_inventory(id, total_quantity):
    wholesaler_receipt = None
    if not models.WholesalerReceipts.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Wholesaler receipt for provided ID does not exist")
    else:
        wholesaler_receipt = models.WholesalerReceipts.objects.filter(
            id=id).first()
        if wholesaler_receipt.current_unit_quantity < total_quantity:
            raise exceptions.ValidationError(
                f"Not enough quantity of {wholesaler_receipt.product.title} available")
        else:
            return


def validate_retailer_order_is_users(id, user):

    if not models.RetailerOrders.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Retailer order for provided ID does not exist")
    else:
        return models.RetailerOrders.objects.filter(id=id).first()


def validate_retailer_order_item_is_users(id, user):

    if not models.RetailerOrderItems.objects.filter(id=id, owner=user).exists():
        raise exceptions.ValidationError(
            "Retailer order item for provided ID does not exist")
    else:
        return models.RetailerOrderItems.objects.filter(id=id, owner=user).first()
