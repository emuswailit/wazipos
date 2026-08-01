from .. import models
from authentication.utils.utils import generate_reference_number
from authentication.validators import authentication_models_validators
def create_property(data, user):
    errors =[]
    title =""


    country ="b4d0e91b-1600-4e1d-b147-f3f1c7e2f35f"
    # Function implementation to create a property
    if not "title" in data or not data["title"]:
        errors.append ("Title is required")
        return errors,None
    else:
        title =data.get("title","").upper().strip()


    if not "county" in data or  data["county"]=="":
        errors.append ("County is required")
        return errors,None

    if not "street_address" in data or not data["street_address"]:
        errors.append ("Street address is required")
        return errors,None

    if not "town" in data or data["town"]=="":
        errors.append ("Town is required")
        return errors,None

    if not "property_type" in data or data["property_type"]=="":
        errors.append ("Property type is required")
        return errors,None
    
    if not "disposal_type" in data or data["disposal_type"]=="":
        errors.append ("Disposal type is required")
        return errors,None
    

    if models.Property.objects.filter(title=title,entity=user.entity).exists():
        errors.append("Property with this title already exists")
        return errors,None
    
    if len(errors)>0:
        return errors,None
    try:
        created = models.Property.objects.create(
            entity=user.entity,
            user=user,
            title=title,
            description=data.get("description",""),
            country_id=country,
            county_id=data["county"],
            town=data["town"],
            street_address=data["street_address"],
            estate=data["estate"],
            postal_code=data.get("postal_code",""),
            plot_area=data.get("plot_area",0.0),
            property_type=data["property_type"],
            disposal_type=data["disposal_type"],
            number_of_units=data.get("number_of_units",1),
            total_floors=data.get("total_floors",1),
            is_published=data.get("is_published","true"),
          
           
        )
        return errors, created
    except Exception  as e:
        errors.append(str(e))
        return errors, None

    
    

def update_property(data, user):
    errors =[]
    property_instance = None
    if not "property_id" in data or not data["property_id"]:
        errors.append ("Property id is required")
        return errors,None

    try:
        property_instance = models.Property.objects.get(id=data["property_id"],entity=user.entity)
    except models.Property.DoesNotExist:
        errors.append("Property does not exist")
        return errors,None

    if "title" in data and data["title"]:
        if models.Property.objects.filter(title=data["title"],entity=user.entity).exclude(id=property_instance.id).exists():
            errors.append("Property with this title already exists")
            return errors,None
        property_instance.title = data["title"]
    
    if "description" in data:
        property_instance.description = data["description"]
    
    if "country" in data and not data["country"]=="":
        property_instance.country_id = data["country"]
    
    if "county" in data and not data["county"]=="":
        property_instance.county_id = data["county"]
    
    if "town" in data and not data["town"]=="":
        property_instance.town = data["town"]
    
    if "street_address" in data and not data["street_address"]=="":
        property_instance.street_address = data["street_address"]
    
    if "estate" in data and not data["estate"]=="":
        property_instance.estate = data["estate"]
    
    if "postal_code" in data:
        property_instance.postal_code = data["postal_code"]
    
    if "plot_area" in data:
        property_instance.plot_area = data["plot_area"]
    
    if "property_type" in data:
        property_instance.property_type = data["property_type"]
    
    if "number_of_units" in data:
        property_instance.number_of_units = data["number_of_units"]
    
    if "total_floors" in data:
        property_instance.total_floors = data["total_floors"]
    
    if "is_published" in data:
        property_instance.is_published = data["is_published"]
    
    if len(errors)>0:
        return errors,None
    try:
        property_instance.save()
        return errors, property_instance
    except Exception  as e:
        errors.append(str(e))
        return errors, None
    


def get_property_details(data,user):
    property =None
    errors =[]
    if "property_id" in data and not data["property_id"]=="":
        if models.Property.objects.filter(id=data['property_id']).exists():
            property= models.Property.objects.filter(id=data['property_id']).first()
            return [],property
        else:
            errors.append("Property with provided ID does not exist")
            return errors, None
        
    else:
        errors.append("Propert ID is required")
        return errors, None
    
def create_property_unit(data, user):
    errors =[]
    title =""
    floor =0
    bedrooms =0
    bathrooms =0
    area =0.0
    price=0.0
    price_due_date =None

    # Function implementation to create a property unit
    if not "property_id" in data or not data["property_id"]:
        errors.append ("Property id is required")
        return errors,None
    property_instance = None
    try:
        property_instance = models.Property.objects.get(id=data["property_id"],entity=user.entity)
    except models.Property.DoesNotExist:
        errors.append("Property does not exist")
        return errors,None
    
    if not "title" in data or not data["title"]:
        errors.append ("Unit number is required")
        return errors,None
    else:
        title =data.get("title","").upper().strip()

    if not "price" in data or  float(data["price"])<1:
        errors.append ("Price is required and must be greater than zero")
        return errors,None
    else:
        price =float(data["price"])

    if "price_due_date" in data and not data["price_due_date"]=="":
        price_due_date =data["price_due_date"]

    if models.PropertyUnits.objects.filter(property=property_instance,title=title).exists():
        errors.append(f"Property unit with this unit number already exists at {property_instance.title}")
        return errors,None
    
    if not "price" in data or data["price"]<1:
        errors.append ("Price is required")
        return errors,None
    
    if "floor" in data:
        floor = data["floor"]

    if "bedrooms" in data:
        bedrooms = int(data["bedrooms"])

    if "bathrooms" in data:
        bathrooms = int(data["bathrooms"])

    if "area" in data:
        area = float(data["area"])

    if len(errors)>0:
        return errors,None
    try:
        reference_number = generate_reference_number(user.entity,user)
        created = models.PropertyUnits.objects.create(
            entity=user.entity,
            owner=user,
            property=property_instance,
            title=title,
            floor=floor,
            disposal_type=data.get("disposal_type","FOR_RENT"),
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            area=area,
            price=price,
            price_due_date=price_due_date,
            is_available=data.get("is_available","false"),
            description=data.get("description",""),
            reference_number=reference_number,
        )
        return errors, created
    except Exception  as e:
        errors.append(str(e))
        return errors, None
    
def update_property_unit(data, user):
    errors =[]
    property_unit_instance = None
    if not "property_unit_id" in data or not data["property_unit_id"]:
        errors.append ("Property unit id is required")
        return errors,None

    try:
        property_unit_instance = models.PropertyUnits.objects.get(id=data["property_unit_id"],entity=user.entity)
    except models.PropertyUnits.DoesNotExist:
        errors.append("Property unit does not exist")
        return errors,None

    if "property_id" in data and not data["property_id"]=="":
        try:
            property_instance = models.Property.objects.get(id=data["property_id"],entity=user.entity)
            property_unit_instance.property = property_instance
        except models.Property.DoesNotExist:
            errors.append("Property does not exist")
            return errors,None
    
    if "unit_title" in data and data["unit_title"]:
        if models.PropertyUnits.objects.filter(property=property_unit_instance.property,unit_title=data["unit_title"]).exclude(id=property_unit_instance.id).exists():
            errors.append("Property unit with this unit number already exists")
            return errors,None
        property_unit_instance.unit_title = data["unit_title"]
    
    if "floor" in data:
        property_unit_instance.floor = data["floor"]
    
    if "unit_type" in data:
        property_unit_instance.unit_type = data["unit_type"]
    
    if "bedrooms" in data:
        property_unit_instance.bedrooms = data["bedrooms"]
    
    if "bathrooms" in data:
        property_unit_instance.bathrooms = data["bathrooms"]
    
    if "area" in data:
        property_unit_instance.area = data["area"]
    
    if "rent_amount" in data:
        property_unit_instance.rent_amount = data["rent_amount"]
    
    if "is_occupied" in data:
        property_unit_instance.is_occupied = data["is_occupied"]
    
    if "description" in data:
        property_unit_instance.description = data["description"]
    
    if len(errors)>0:
        return errors,None
    try:
        property_unit_instance.save()
        return errors, property_unit_instance
    except Exception  as e:
        errors.append(str(e))
        return errors, None
 

def create_property_unit_tenant(data,user):
    errors =[]
    user = None
    property_unit=None
    lease_start = None
    lease_end = None
    if "user_id" in data and not data['user_id']=="":
        user =authentication_models_validators.validate_user(data['user_id'])
    else:
        errors.append("User ID is required")

    if "property_unit_id" in data and not data['property_unit_id']=="":
        if models.PropertyUnits.objects.filter(id=data['property_unit_id']).exists():
            property_unit = models.PropertyUnits.objects.filter(id=data['property_unit_id']).first()

        else:
            errors.append("No property unit with provided ID exists")
    else:
        errors.append("Property unit ID is required")

    if not "lease_start" in data or data["lease_start"]=="":
        errors.append("Lease start date is required")
    else:
        lease_start = data["lease_start"]

    if "lease_end" in data and not data["lease_end"]=="":
        lease_end = data["lease_end"]

    if models.PropertyUnitTenants.objects.filter(property_unit=property_unit,tenant=user,is_active="true").exists():
        errors.append("Selected user has an active tenancy in this property unit")

    if len(errors)>0:
        return errors,None

    try:
        created = models.PropertyUnitTenants.objects.create(
            entity=property_unit.entity,
            property_unit=property_unit, 
            tenant = user, 
            lease_start=lease_start,
            lease_end=lease_end)
        if created:
            return [],created
        
    except Exception as e:
        errors.append(str(e))
        return errors,None
