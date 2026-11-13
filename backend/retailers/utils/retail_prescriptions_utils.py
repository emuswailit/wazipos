from .. import models
from employees.validators import employees_models_validators
from authentication.validators import authentication_models_validators
from datetime import date
from ..validators import model_validators
from products.models import Products, Preparation
from drugs.models import Routes,Frequency
from core.date_utils import get_today
from retailers.models import RetailerReceipts
from products.validators import product_models_validator
from django.db import transaction
from utils.logging import create_log
from authentication.utils.utils import generate_reference_number, use_reference_number, get_telco_by_phone_number,generate_document_number
from .retailer_utils import process_customer_order_payment
# Quotation-based flow (see prescription_flow.py). Re-exported under the names the views use.
from .prescription_flow import (  # noqa: F401
    _present,
    create_prescription_item as create_retail_prescription_item,
    forward_for_quotation,
    get_all_prescriptions,
    get_inventory_for_item as get_related_inventory_for_product,
    get_pharmacy_prescriptions as get_entity_retail_prescriptions,
    get_wholesale_sources,
    mark_prescription_digitized,
    pay_quotation,
    preview_checkout,
    remove_quote_line,
    remove_prescription_item as remove_retail_prescription_item,
    search_pharmacies,
    submit_quotation,
    update_prescription_item as update_retail_prescription_item,
)
from .prescription_schedule import confirm_administration, get_medication_schedule  # noqa: F401
from payments.validators import payments_models_validators
from core.constants import EntityType 

@transaction.atomic
def make_prescription_order_payment(data,user):
    errors =[]
    prescription = None
    customer_order = None
    mobile_money_phone = None
    customer_order_items =[]
    payment_method = None
    formatted_phone_number = None
    telco = None

    if not "payment_method" in data or data["payment_method"]=="":
        errors.append("Payment method is required")
        return errors,None
    else:
        payment_method = payments_models_validators.validate_payment_method_exists(data["payment_method"])
    # Remote prescription purchases are paid by mobile money only.
    if not payment_method or payment_method.title != "MOBILE MONEY":
        errors.append("Prescription purchases are paid by mobile money")
        return errors, None

    if not "mobile_money_phone" in data or data["mobile_money_phone"]=="":
        errors.append("Mobile money phone number is required")
        return errors,None
    else:
        mobile_money_phone = data["mobile_money_phone"]
        telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)

    if not "prescription" in data or data["prescription"]=="":
        errors.append("Prescription ID is required")
        return errors,None
    else:
        if models.Prescriptions.objects.filter(id=data["prescription"]).exists():
            prescription = models.Prescriptions.objects.filter(id=data["prescription"]).first()
        else:
            errors.append("Prescription with provided ID does not exist")
            return errors, None
    if models.CustomerOrders.objects.filter(prescription=prescription,status="PROCESSING").exists():
        customer_order=models.CustomerOrders.objects.filter(prescription=prescription,status="PROCESSING").first()
        if models.CustomerOrderItems.objects.filter(customer_order=customer_order).exists():
            customer_order_items =models.CustomerOrderItems.objects.filter(customer_order=customer_order).all()
        else:
            errors.append("Prescription order has no items added")
            return errors, None

        if customer_order:
            reference_number=generate_reference_number(customer_order.entity,user)
            errors, order_updated = process_customer_order_payment(customer_order.entity,customer_order,payment_method,user,formatted_phone_number,customer_order_items )

            if order_updated:
                return [],order_updated
            else:
                return errors, None
    else:
        errors.append("No open order exists for given prescription")
        return errors,None
    




@transaction.atomic
def create_or_update_prescription_order_item(data,user):
    errors=[]
    prescription_item = None
    prescription=None
    required_quantity =0
    customer_order = None


    if not "required_quantity" in data or data["required_quantity"]=="":
        errors.append("Required quantity cannot be empty")
        return errors, None
    else:
        required_quantity = int(data["required_quantity"])

    if not "prescription_item" in data or data["prescription_item"]=="":
        errors.append("Prescription item ID is required")
        return errors, None
    else:
        if models.PrescriptionItems.objects.filter(id = data["prescription_item"]).exists():
            prescription_item = models.PrescriptionItems.objects.filter(id = data["prescription_item"]).first()
            

            if not prescription_item.required_unit_quantity:
                errors.append("Prescription item has no required quantity")
                return errors, None
            elif not prescription_item.retailer_receipt:
                errors.append("Prescription item has no assigned stock item")
                return errors, None
            elif prescription_item.retailer_receipt.current_unit_quantity<1:
                errors.append("Stock item assigned to this item has sold out.")
                return errors, None
            
            if not models.CustomerOrders.objects.filter(prescription=prescription_item.prescription,owner=user,status="PROCESSING").exists():
                try:
                    order_number = generate_document_number(prescription_item.entity, user,"CUSTOMERORDER")
                    reference_number=generate_reference_number(user.entity,user)
                    customer_order = models.CustomerOrders.objects.create(
                        prescription=prescription_item.prescription,
                        entity=prescription_item.entity,
                        owner=user,
                        origin_point =prescription_item.prescription.origin_point,
                        destination_point = prescription_item.prescription.origin_point,
                        order_number=order_number,
                        reference_number=reference_number,
                        order_type="PRESCRIPTION",
                        status="PROCESSING",
                        user=user
                        )
                except Exception as e:
                    create_log("error",f"Error creating customer order: {str(e)}")  
                    errors.append(str(e))
                    return errors,None
            else:
                if models.CustomerOrders.objects.filter(prescription=prescription_item.prescription,owner=user,status="PROCESSING").exists():
                    customer_order = models.CustomerOrders.objects.filter(prescription=prescription_item.prescription,owner=user,status="PROCESSING").first()   
                else:
                    create_log("error","Haikovi customer order")
                    errors.append("Haikovi customer order")
                    return errors, None
            
            if customer_order:
                if models.CustomerOrderItems.objects.filter(customer_order=customer_order,retailer_receipt=prescription_item.retailer_receipt).exists():
                    create_log("info","Existing customer order item")
                    existing =models.CustomerOrderItems.objects.filter(customer_order=customer_order,retailer_receipt=prescription_item.retailer_receipt).first()
                    existing.quantity = required_quantity
                    existing.purchased_quantity = required_quantity
                    existing.total_quantity = required_quantity
                    existing.save()
                    prescription_item.current_order_unit_quantity=required_quantity
                    prescription_item.save()
                    return [], prescription_item.prescription
                else:
                    create_log("info","Creating new customer order item")
                    try:
                        customer_order_item = models.CustomerOrderItems.objects.create(
                            customer_order=customer_order,
                            retailer_receipt=prescription_item.retailer_receipt,
                            unit_of_issue = prescription_item.unit_of_issue,
                            purchased_quantity=required_quantity,
                            total_quantity=required_quantity,
                            quantity=required_quantity,
                            owner =user,
                            entity=customer_order.entity,
                            item_price=prescription_item.retailer_receipt.unit_selling_price,
                            item_price_total=float(float(required_quantity)*float(prescription_item.retailer_receipt.unit_selling_price))
                            )
                        if customer_order_item:
                            create_log("info","Customer order item created")
                            prescription_item.current_order_unit_quantity=required_quantity
                            prescription_item.save()
                            return [],prescription_item.prescription
                        else:
                            create_log("error","Error creating customer order item")
                            errors.append("Error creating customer order item")
                            return errors, None
                    except Exception as e:
                        create_log("error",f"Error creating customer order item: {str(e)}") 
                        errors.append(str(e))
                        return errors, None
            else:
                errors.append("Error establishing order")
                return errors, None
        
        else:
            errors.append("No prescription item found with provided ID")
            return errors, None
        


def get_user_retail_prescriptions(data, user):
    """Get retail prescriptions for user"""
    if models.Prescriptions.objects.filter(owner=user).exists():
        return models.Prescriptions.objects.filter(owner=user).all()
    else:
        return []
    
def update_retail_prescription_item_administration(data,user):
    administration=None
    errors=[]
    if  "retail_prescription_item_administration" in data or data["retail_prescription_item_administration"]=="":
        if models.HospitalPrescriptionItemAdministrations.objects.filter(id=data["retail_prescription_item_administration"]).exists():
            administration=models.HospitalPrescriptionItemAdministrations.objects.filter(id=data["retail_prescription_item_administration"]).first()

            if "comment" in data and not data["comment"]=="":
                administration.comment=data["comment"]
            if "is_administered" in data and not data["is_administered"]=="":
                administration.is_administered=data["is_administered"]
                administration.save()
            return [],administration.retail_prescription_item
        
        else:
            errors.append("Item not found")
            return errors, None
    else:
        errors.append("Administration ID ire required")
        return errors, None

def get_retail_prescription_details(data,user):
    errors =[]
    prescription=None
    if not "prescription" in data or data["prescription"]=="":
        errors.append("Prescription ID is requied")
        return errors, None
    else:
        if models.Prescriptions.objects.filter(id=data["prescription"]).exists():
            prescription =models.Prescriptions.objects.filter(id=data["prescription"]).first()
            return [],prescription
        else:
            errors.append("No prescription for provided ID")
            return errors, None

def update_retail_prescription(data,user):
    processed_by =None
    prescription=None
    errors=[]
    if "prescription" in data and not data['prescription']=="":
       errors, prescription = model_validators.validate_retail_prescription(data['prescription'],user.entity)
       if not prescription and errors:
           return errors,None
    else:
        errors.append("Retail prescription ID is required")
        return errors, None
           
    if "processed_by" in data and not data['processed_by']=="":
        user = authentication_models_validators.validate_user(data['processed_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            prescription.processed_by=employee
            prescription.save()

    if "reported_by" in data and not data['reported_by']=="":
        user = authentication_models_validators.validate_user(data['reported_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            prescription.reported_by=employee
            prescription.save()
    


    if "is_closed" in data and not data["is_closed"]=="":
       
        if models.PrescriptionItems.objects.filter(prescription=prescription).count()>0:
            if prescription.is_closed=="false":
                prescription.is_closed="true"
                prescription.status="QUEUING"
                prescription.save()
            else:
                errors.append("Prescription is already closed")
                return errors,None
        else:
            errors.append("Prescription has no added items thus cannot be closed.")
            return errors,None

    return errors,prescription


# ---------------------------------------------------------------------------
# Digitizing done -> customer notified; customer forwards unpriced items.
# ---------------------------------------------------------------------------
