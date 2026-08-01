from core.responses import custom_errors_response
from rest_framework import exceptions
from .. import models
from django.db import transaction
from retailers.models import RetailerReceipts
from authentication.validators import authentication_models_validators
from products.validators import product_models_validator
from employees.validators import employees_models_validators




@transaction.atomic
def create_wholesaler_invoice(data, user):
    employee = employees_models_validators.validate_employee(user)
    source_entity = None
    product = None
    invoice_number = ""
    wholesaler_invoice = None
    errors = []
    try:
        invoice = data["invoice"]
    except KeyError:
        errors.append("Invoice details are required")
    try:
        source_entity_id = data["invoice"]["source_entity"]
        if source_entity_id:
            source_entity = authentication_models_validators.validate_entity(
                source_entity_id
            )
        print(source_entity_id, source_entity_id)
    except KeyError:
        errors.append("Invoice details are required")
    try:
        invoice_number = data["invoice"]["invoice_number"]
        if models.WholesalerInvoices.objects.filter(
            invoice_number=invoice_number, source_entity=source_entity
        ).exists():
            raise exceptions.ValidationError(
                f"Invoice from {source_entity} with invoice number {invoice_number} already exists"
            )
    except KeyError:
        errors.append("Invoice number is required")

    try:
        items = data["invoice"]["items"]
        for item in items:
            product_id = item["product"]
            if product_id:
                product = product_models_validator.validate_product(product_id)

    except KeyError:
        errors.append("Items are required")
    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        try:
            wholesaler_invoice = models.WholesalerInvoices.objects.create(
                source_entity=source_entity,
                invoice_number=invoice_number,
                owner=user,
                entity=user.entity,
            )
            if wholesaler_invoice:
                for item in items:
                    wholesaler_invoice_item = (
                        models.WholesalerInvoiceItems.objects.create(
                            wholesaler_invoice=wholesaler_invoice,
                            product=product,
                            purchased_unit_quantity=int(
                                item["purchased_unit_quantity"]
                            ),
                            bonus_unit_quantity=int(item["bonus_unit_quantity"]),
                            pack_buying_price=float(item["pack_buying_price"]),
                            pack_selling_price=float(item["pack_selling_price"]),
                            percent_discount=float(item["percent_discount"]),
                            manufacture_date=item["manufacture_date"],
                            expiry_date=item["expiry_date"],
                            batch=item["batch"],
                            entity=user.entity,
                            owner=user,
                        )
                    )

                    retailer_receipt = RetailerReceipts.objects.create(
                        product=product,
                        received_from=source_entity,
                        manufacture_date=item["manufacture_date"],
                        expiry_date=item["expiry_date"],
                        batch=item["batch"],
                        pack_price_discount=float(item["percent_discount"]),
                        pack_buying_price=float(item["pack_buying_price"]),
                        pack_selling_price=float(item["pack_selling_price"]),
                        unit_quantity=int(item["bonus_unit_quantity"])
                        + int(item["purchased_unit_quantity"]),
                        owner=user,
                        entity=user.entity,
                        employee=employee,
                    )
                print("invoice", wholesaler_invoice)
                return wholesaler_invoice
            else:
                return None

        except Exception as e:
            raise exceptions.ValidationError(e)
