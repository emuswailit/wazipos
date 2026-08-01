from rest_framework import exceptions
from .. import models


def validate_product(id):

    if not models.Products.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Product for supplied ID does not exist")
    else:
        return models.Products.objects.filter(id=id).first()
def validate_service(id):

    if not models.EntityServices.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Service for supplied ID does not exist")
    else:
        return models.EntityServices.objects.filter(id=id).first()

