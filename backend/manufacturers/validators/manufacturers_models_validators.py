from .. import models
from rest_framework import exceptions


def existing_manufacturer_variation(id):

    if not models.ManufacturerVariations.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Manufacturer variation for provided ID does not exist")
    else:
        return models.ManufacturerVariations.objects.filter(id=id).first()
