
from .. import models
from rest_framework import exceptions


def validate_distributor_order_item(id):

    if not models.DistributorOrderItems.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Distributor order item with provided ID does not exist")
    else:
        return models.DistributorOrderItems.objects.filter(id=id).first()


def validate_distributor_receipt(id, total_quantity):
    distributor_receipt = None
    if not models.DistributorReceipts.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Distributor receipt for provided ID does not exist")
    else:
        distributor_receipt = models.DistributorReceipts.objects.filter(
            id=id).first()
        if distributor_receipt.pack_quantity < total_quantity:
            raise exceptions.ValidationError(
                f"{distributor_receipt.product.title} {distributor_receipt.product.units_per_pack}'s : Only {distributor_receipt.pack_quantity} available")
