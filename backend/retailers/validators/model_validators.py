from .. import models
from rest_framework import exceptions


def validate_retailer_price_discount(id):
    if id == "":
        raise exceptions.ValidationError('Price discount ID is required')

    if not models.PriceDiscounts.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Price discount with provided ID does not exist")
    else:
        return models.PriceDiscounts.objects.filter(id=id).first()


def validate_retailer_quantity_discount(id):
    if id == "":
        raise exceptions.ValidationError('Quantity discount ID is required')

    if not models.QuantityDiscounts.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            "Quantity discount with provided ID does not exist")
    else:
        return models.QuantityDiscounts.objects.filter(id=id).first()

def validate_customer_order(entity_id):
    if not models.Cus.objects.filter(id=entity_id).exists():
        raise exceptions.ValidationError("Entity with the supplied ID does not exist")
    else:
        return models.Entities.objects.filter(id=entity_id).first()

def validate_customer_order(customer_order_id):
    if not models.CustomerOrders.objects.filter(id=customer_order_id).exists():
        return None
    else:
        return models.CustomerOrders.objects.filter(id=customer_order_id).first()

def validate_retailer_receipt(customer_order_id):
    errors=[]
    if not models.RetailerReceipts.objects.filter(id=customer_order_id).exists():
        errors.append("Retailer receipt with provied ID does not exist")
        return errors, None
    else:
        return errors, models.CustomerOrders.objects.filter(id=customer_order_id).first()
    

def validate_retailer_receipt_for_entity(retailer_receipt_id,entity_id):
    errors=[]
    if not models.RetailerReceipts.objects.filter(id=retailer_receipt_id,entity_id=entity_id).exists():
        errors.append("Retailer receipt with provied ID does not exist")
        return errors, None
    else:
        return errors, models.RetailerReceipts.objects.filter(id=retailer_receipt_id,entity_id=entity_id).first()
    

def validate_retail_prescription(retail_prescription_id,entity_id):
    errors=[]
    if not models.Prescriptions.objects.filter(id=retail_prescription_id,entity_id=entity_id).exists():
        errors.append("Retail prescription with provied ID does not exist")
        return errors, None
    else:
        return errors, models.Prescriptions.objects.filter(id=retail_prescription_id,entity_id=entity_id).first()