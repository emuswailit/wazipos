from .. import models
from django.db import IntegrityError, transaction
from ..transport_validators import validate_destination, validate_charge
from rest_framework import exceptions

@transaction.atomic
def create_charge(data, user):
    errors =[]
    title=""
    description =""
    destination=None
    price=0.00

    route =None
    if not "charge_details" in data:
        errors.append("Charge details are required")
        return errors,None

    if not "destination_id" in data["charge_details"] or data["charge_details"]["destination_id"]=="":
         errors.append("Destination ID is required")
    else:
        destination =  validate_destination(data["charge_details"]["destination_id"])

    if not "title" in data["charge_details"] or data["charge_details"]["title"]=="":
         errors.append("Charge title is  required")
    else:
        title =  data["charge_details"]["title"]
    
    
    if not "price" in data["charge_details"] or data["charge_details"]["price"]=="":
         errors.append("Charge price is required")
    else:
        price =  data["charge_details"]["price"]

    if "description" in  data["charge_details"]:
        description=data["charge_details"]["description"]

    if len(errors)>0:
        return errors, None
    else:
        try:
            charge = models.Charges.objects.create(
                destination=destination, 
                title=title, 
                description=description, 
                entity=user.entity,owner=user,
                price=price
                )
            return [], charge
        except IntegrityError as e:
            raise exceptions.ValidationError(f"Charge for {user.entity} titled '{title}' already  exists for destination {destination}")

@transaction.atomic
def update_charge(data, user):
    errors =[]
    title=""
    destination =None
    description =""
    price=0.00
    if not "charge_details" in data:
        errors.append("Charge details are required")
        return errors,None
    
    if not "charge_id" in data["charge_details"] or data["charge_details"]["charge_id"]=="":
         errors.append("Charge ID are required")
         return errors, None
    else:
        charge = validate_charge( data["charge_details"]["charge_id"],user)

    if "price" in  data["charge_details"]:
        price=float(data["charge_details"]["price"])
        charge.price=price
        charge.save()

    if "title" in  data["charge_details"]:
        title=data["charge_details"]["title"]
        charge.title=title
        charge.save()


    if "destination_id" in  data["charge_details"]:
        # Ensure route exists
        destination=validate_destination(data["charge_details"]["destination_id"])
        charge.destination=destination
        charge.save()

    if "description" in  data["charge_details"]:
        description=data["charge_details"]["description"]
        charge.description=description
        charge.save()

    if len(errors)>0:
        return errors, None
    else:
        return [], charge
    


def get_entity_charges(user):
    charges = []
    if models.Charges.objects.filter(entity=user.entity).exists():
        charges = models.Charges.objects.filter(entity=user.entity).all()
        return charges
    else:
        return None
