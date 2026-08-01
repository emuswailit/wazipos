
from . import logistics_models_validators
from .. import models
from authentication.validators import authentication_models_validators
from products.validators import product_models_validator
from core.date_utils import get_today
def create_entity_store(data,user):
    errors=[]
    title =None
    organization_store=None
    organization_sub_store=None
    if not "title" in data or data["title"]=="":
        errors.append("Title is required")
        return errors,None
    else:
        title = data["title"]
        if models.EntityStore.objects.filter(title=title.upper(),entity=user.entity).exists():
            errors.append(f"Entity store with similar title already exists at {user.entity}")
            return errors, None
    if "organization_store" in data and not data["organization_store"]=="":
        organization_store = logistics_models_validators.validate_organization_store(data["organization_store"])
    else:
        pass

    if "organization_sub_store" in data and not data["organization_sub_store"]=="":
        organization_sub_store = logistics_models_validators.validate_organization_sub_store(data["organization_sub_store"])
    else:
        pass

    if len(errors)>0:
        return errors,None
    else:
        try:
            created = models.EntityStore.objects.create(
                organization_store=organization_store,
                organization_sub_store=organization_sub_store,
                title=title,
                entity=user.entity,
                owner = user

            )
            if created:
                return [], created
        except Exception as e:
            errors.append(str(e))
            return errors,None
        

def create_entity_sub_store(data,user):
    errors=[]
    title =None
    entity_store=None
    department=None
   
    if not "title" in data or data["title"]=="":
        errors.append("Title is required")
        return errors,None
    else:
        title = data["title"]
        if models.EntitySubStore.objects.filter(title=title.upper(),entity=user.entity).exists():
            errors.append(f"Entity sub store with similar title already exists at {user.entity}")
            return errors, None
    if "entity_store" in data and not data["entity_store"]=="":
        entity_store = logistics_models_validators.validate_entity_store(data["entity_store"])
    else:
        pass

    if "department" in data and not data["department"]=="":
        department = authentication_models_validators.validate_department(data["department",user])
    else:
        pass

    if len(errors)>0:
        return errors,None
    else:
        try:
            created = models.EntitySubStore.objects.create(
                entity_store=entity_store,
                department=department,
                title=title,
                entity=user.entity,
                owner = user

            )
            if created:
                return [], created
        except Exception as e:
            errors.append(str(e))
            return errors,None
        

def update_entity_store(data,user):
    errors=[]
    entity_store = None
    if not "entity_store" in data or data["entity_store"]=="":
        errors.append("Entity store ID is required")
        return errors,None
    else:
        errors, entity_store = logistics_models_validators.validate_entity_store(data["entity_store"])
    if entity_store:
        if "description" in data and not data["description"]=="":
            entity_store.description= data["description"]
            entity_store.save()

        return [],entity_store
    else:
        return errors,None

def update_entity_sub_store(data,user):
    errors=[]
    entity_sub_store = None
    if not "entity_sub_store" in data or data["entity_sub_store"]=="":
        errors.append("Entity sub store ID is required")
        return errors,None
    else:
        errors, entity_sub_store = logistics_models_validators.validate_entity_sub_store(data["entity_sub_store"])

        if entity_sub_store:

            if "description" in data and not data["description"]=="":
                entity_sub_store.description= data["description"]
                entity_sub_store.save()

            if "entity_store" in data and not data["entity_store"]=="":
                errors, entity_store = logistics_models_validators.validate_entity_store(data["entity_store"])
                if entity_store:
                    entity_sub_store.entity_store=entity_store
                    entity_sub_store.save()
                else:
                    return errors, None


            return [], entity_sub_store
        else:
            return errors,None
        
# Entity store ledger
def create_entity_store_receipt(data,user):
    errors=[]
    entity_store=None
    product=None
    source_organization_store=None
    source_organization_sub_store=None
    received_pack_quantity =None
    pack_buying_price =None
    pack_selling_price =None
    batch=None
    manufacture_date=None
    expiry_date=None

    if not "received_pack_quantity" in data or data["received_pack_quantity"]=="":
        errors.append("Pack quantity is required")
        return errors,None
    else:
        received_pack_quantity = data["received_pack_quantity"]

    if not "pack_buying_price" in data or data["pack_buying_price"]=="":
        errors.append("Pack buying price is required")
        return errors,None
    else:
        pack_buying_price = data["pack_buying_price"]

    if not "pack_selling_price" in data or data["pack_selling_price"]=="":
        errors.append("Pack selling price is required")
        return errors,None
    else:
        pack_selling_price = data["pack_selling_price"]


    if "manufacture_date" in data and not data["manufacture_date"]=="":
        manufacture_date = data["manufacture_date"]

    if "expiry_date" in data and not data["expiry_date"]=="":
        expiry_date = data["expiry_date"]

    if "batch" in data and not data["batch"]=="":
        batch = data["batch"]


    if not "entity_store" in data or  data["entity_store"]=="":
       errors.append("Store ID is required")
    else:
        errors, entity_store = logistics_models_validators.validate_entity_store(data["entity_store"])

    


    if not "product" in data or data["product"]=="":
       errors.append("Product ID is required")
    else:
        product = product_models_validator.validate_product(data["product"])

    if "source_organization_store" in data and not data["source_organization_store"]=="":
        errors, source_organization_store = logistics_models_validators.validate_organization_store(data["source_organization_store"])
    else:
        pass
    if "source_organization_sub_store" in data and not data["source_organization_sub_store"]=="":
        errors, source_organization_sub_store = logistics_models_validators.validate_organization_sub_store(data["source_organization_sub_store"])
    else:
        pass
    if "source_entity" in data and not data["source_entity"]=="":
        source_organization_sub_store = authentication_models_validators.validate_entity(data["source_entity"])
    else:
        pass

    if models.EntityStoreReceipts.objects.filter(
        entity_store=entity_store,
               
                product=product,
                received_pack_quantity=received_pack_quantity,created__gte=get_today()
    ).exists():
        errors.append("Similar product was received in stock today")

    if len(errors)>0:
        return errors,None
    else:
        try:        
            created = models.EntityStoreReceipts.objects.create(
                entity_store=entity_store,
                source_organization_sub_store=source_organization_sub_store,
                source_organization_store=source_organization_store,
                received_pack_quantity=received_pack_quantity,
                current_pack_quantity=received_pack_quantity,
                pack_buying_price=pack_buying_price,
                pack_selling_price=pack_selling_price,
                unit_buying_price = float(pack_buying_price)/float(product.units_per_pack),
                unit_selling_price = float(pack_selling_price)/float(product.units_per_pack),
                manufacture_date=manufacture_date,
                expiry_date=expiry_date,
                product=product,
                batch=batch,
                entity=user.entity,
                owner = user

            )
            if created:
                return [], created
        except Exception as e:
            errors.append(str(e))
            return errors,None

def update_entity_store_receipt(data,user):
    errors=[]
    entity_store_receipt = None
    if not "entity_store_receipt" in data or data["entity_store_receipt"]=="":
        errors.append("Item  ID is required")
        return errors,None
    else:
        errors, entity_store_receipt = logistics_models_validators.validate_entity_store_receipt(data["entity_store_receipt"])
    if entity_store_receipt:
        if "pack_quantity" in data and not data["pack_quantity"]=="":
            entity_store_receipt.pack_quantity= int(data["pack_quantity"])
            entity_store_receipt.save()

        if "pack_buying_price" in data and not data["pack_buying_price"]=="":
            entity_store_receipt.pack_buying_price= float(data["pack_buying_price"])
            entity_store_receipt.save()

        if "pack_selling_price" in data and not data["pack_selling_price"]=="":
            entity_store_receipt.pack_selling_price= float(data["pack_selling_price"])
            entity_store_receipt.save()

        if "manufacture_date" in data and not data["manufacture_date"]=="":
            entity_store_receipt.manufacture_date= data["manufacture_date"]
            entity_store_receipt.save()

        if "expiry_date" in data and not data["expiry_date"]=="":
            entity_store_receipt.expiry_date= data["expiry_date"]
            entity_store_receipt.save()

        if "batch" in data and not data["batch"]=="":
            entity_store_receipt.batch= data["batch"]
            entity_store_receipt.save()

        return [],entity_store_receipt
    else:
        return errors,None


## Entity sub store receipts

def create_entity_sub_store_receipt(data,user):
    errors=[]
    entity_store_issue=None
    pack_quantity =None
    pack_buying_price =None
    pack_selling_price =None
    entity_sub_store=None
    source_entity_store=None
    product=None
    batch=None
    manufacture_date=None
    expiry_date=None
   
    if not "pack_quantity" in data or data["pack_quantity"]=="":
        errors.append("Pack quantity is required")
        return errors,None
    else:
        pack_quantity = data["pack_quantity"]
        print("pqty",pack_quantity)

    if not "pack_buying_price" in data or data["pack_buying_price"]=="":
        errors.append("Pack buying price is required")
        return errors,None
    else:
        pack_buying_price = data["pack_buying_price"]

    if not "pack_selling_price" in data or data["pack_selling_price"]=="":
        errors.append("Pack selling price is required")
        return errors,None
    else:
        pack_selling_price = data["pack_selling_price"]



    if "source_entity" in data and not data["source_entity"]=="":
        source_entity = authentication_models_validators.validate_entity(data["source_entity"])
    else:
        pass

    if "source_entity_store" in data and not data["source_entity_store"]=="":
        errors, source_entity_store = logistics_models_validators.validate_entity_store(data["source_entity_store"])
    else:
        pass
    if "entity_store_issue" in data and not data["entity_store_issue"]=="":
        errors, entity_store_issue = logistics_models_validators.validate_entity_store_issue(data["entity_store_issue"])
    else:
        pass

    if not "entity_sub_store" in data or  data["entity_sub_store"]=="":
       errors.append("Store ID is required")
    else:
        errors, entity_sub_store = logistics_models_validators.validate_entity_sub_store(data["entity_sub_store"])
        print("ESS",entity_sub_store)

    
    if not "product" in data or data["product"]=="":
       errors.append("Product ID is required")
    else:
        product = product_models_validator.validate_product(data["product"])
        print("pdct", product)

    if "manufacture_date" in data and not data["manufacture_date"]=="":
        manufacture_date = data["manufacture_date"]

    if "expiry_date" in data and not data["expiry_date"]=="":
        expiry_date = data["expiry_date"]

    if "batch" in data and not data["batch"]=="":
        batch = data["batch"]
    print("tdy",get_today())
    if models.EntitySubStoreReceipts.objects.filter(
        entity_sub_store=entity_sub_store,
                product=product,
                received_pack_quantity=pack_quantity,
                created__gte=get_today()
    ).exists():
        errors.append("Similar product was received in stock today")

    if len(errors)>0:
        return errors,None
    else:
        try:        
            created = models.EntitySubStoreReceipts.objects.create(
                entity_sub_store=entity_sub_store,
                source_entity_store=source_entity_store,
                received_pack_quantity=pack_quantity,
                pack_buying_price=pack_buying_price,
                pack_selling_price=pack_selling_price,
                unit_buying_price = float(pack_buying_price)/float(product.units_per_pack),
                unit_selling_price = float(pack_selling_price)/float(product.units_per_pack),
                manufacture_date=manufacture_date,
                expiry_date=expiry_date,
                product=product,
                batch=batch,
                entity=user.entity,
                owner = user

            )
            if created:
                return [], created
        except Exception as e:
            errors.append(str(e))
            return errors,None

def update_entity_sub_store_receipt(data,user):
    errors=[]
    entity_sub_store_receipt = None
    if not "entity_sub_store_receipt" in data or data["entity_sub_store_receipt"]=="":
        errors.append("Item  ID is required")
        return errors,None
    else:
        errors, entity_sub_store_receipt = logistics_models_validators.validate_entity_sub_store_receipt(data["entity_sub_store_receipt"])
    if entity_sub_store_receipt:
        if "pack_quantity" in data and not data["pack_quantity"]=="":
            entity_sub_store_receipt.pack_quantity= int(data["pack_quantity"])
            entity_sub_store_receipt.save()

        if "pack_buying_price" in data and not data["pack_buying_price"]=="":
            entity_sub_store_receipt.pack_buying_price= float(data["pack_buying_price"])
            entity_sub_store_receipt.save()

        if "pack_selling_price" in data and not data["pack_selling_price"]=="":
            entity_sub_store_receipt.pack_selling_price= float(data["pack_selling_price"])
            entity_sub_store_receipt.save()

        if "manufacture_date" in data and not data["manufacture_date"]=="":
            entity_sub_store_receipt.manufacture_date= data["manufacture_date"]
            entity_sub_store_receipt.save()

        if "expiry_date" in data and not data["expiry_date"]=="":
            entity_sub_store_receipt.expiry_date= data["expiry_date"]
            entity_sub_store_receipt.save()

        if "batch" in data and not data["batch"]=="":
            entity_sub_store_receipt.batch= data["batch"]
            entity_sub_store_receipt.save()

        return [],entity_sub_store_receipt
    else:
        return errors,None