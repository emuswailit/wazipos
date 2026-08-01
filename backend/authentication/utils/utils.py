from datetime import datetime
from django.core.mail import EmailMessage
from rest_framework import exceptions
from intergrations.jambopay.jambopay_create_whitelabel_account import create_white_label_account
from payments.models import BranchCollectionAccount,PaymentServicesProvider, EntityPSPCollectionAccount, UserAccounts
from payments.utils.payment_utils import create_user_account
from retailers.models import  CustomerOrders,RetailerIndent
from transport.models import Tickets, TicketPaymentSettlement, TransferBookings, JourneyBookings
from wholesalers.models import WholesalerOrders,RetailerOrders
from restaurants.models import BarInventoryOrder, BranchFoodOrder, AccomodationOrder
from employees.validators import employees_models_validators
from employees.models import Employees
from ..models import YearLetters,Users
import json
import re
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms
from intergrations.jambopay.jambopay_wallet import iprs_verify


from authentication.models import (
    Agents,
    Cadres,
    Categories,
    SubCategories,
    Entities,
    Roles,
    Departments,
    Profiles,
    EntityLicences,
    EntityImages,
    Clusters,
    Plans,
    YearLetters,
    Users
)
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.db import transaction
from core.phone_number_utils import get_telco_by_phone_number
from employees.models import Employees
from authentication.validators import authentication_models_validators
from core.validators import date_is_past_now
from decouple import config
from .. import models



Users = get_user_model()





def send_sms_messages(data, user):
    errors = []
    message = None
    contacts = []
    callback_url = None

    print ("data", data)
    if not user.is_staff:
        errors.append("No sent")

    if "calback_url" in data:
        callback_url = data["callback_url"]
    if not "message" in data:
        errors.append("Message id required")
    else:
        message = data["message"]

    if not "contacts" in data or len(data["contacts"])<1:
        errors.append("Contacts are  required")
    else:
        contacts = data["contacts"]

    for contact in contacts:
        telco, phone_number = get_telco_by_phone_number(contact)
        if phone_number:
            payload = {
                    "contact" : phone_number,
                    "message" : message,
                    "callback" : callback_url,
                    "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                }
        
            errors, sent = send_swift_sms(payload)
    # if sent:
    #     return [], sent
    if len(errors)>0:
        return errors, False   

def validate_user_roles_data(data, owner):
    user_obj = None
    role_obj = None
    errors = []
    if not "user" in data or not data["user"]:
        errors.append("User ID is required")
    else:
        user = data["user"]
        if Users.objects.filter(id=user).exists():
            user_obj = Users.objects.get(id=user)
            if user_obj.entity != owner.entity:
                errors.append("User is not switched to your entity")

    if not "roles" in data:
        errors.append("Roles are required")
    else:
        roles = data["roles"]
        if len(roles) > 0 and user_obj:
            for role in roles:
                if Roles.objects.filter(id=role, entity=owner.entity).exists():
                    role_obj = Roles.objects.get(id=role)
                    if role_obj.entity != user_obj.entity:
                        errors.append(
                            f"User and role must be for the same company. Consider switching user to the this company"
                        )
                else:
                    errors.append(
                        f"Role for supplied is not available for {owner.entity.title}"
                    )

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return data


class Util:
    @staticmethod
    def send_email(data):
        email = EmailMessage(
            subject=data["email_subject"],
            body=data["email_body"],
            to=[
                data["to_email"],
            ],
        )
        email.send()

    def admin_can_create_entity(user, entity_type):
        """Admin user can only create manufacturing entities"""
        if entity_type != "MANUFACTURING" and user.is_staff:
            return True
        else:
            return False

    def entity_has_valid_licence(entity):
        """Check if entity has valid and current licence"""
        if EntityLicences.objects.filter(entity=entity).count() > 0:
            return True
        else:
            return False

    def update_user_entity_and_roles(pk, entity, roles, request):
        errors = []
        if Entities.objects.filter(id=entity).exists():
            entity_obj = Entities.objects.filter(id=entity).first()
        else:
            raise exceptions.ValidationError("Entity for supplied ID does not exist")
        user = Users.objects.get(id=pk)
        # user.entity = entity_obj

        # Check for permissions: admin can onlywork in their facility
        if not request.user.is_staff:
            if request.user.entity != entity_obj:
                raise exceptions.ValidationError("Not authorized")

        for role in roles:
            if Roles.objects.filter(id=role).exists():
                role_obj = Roles.objects.get(id=role)
                print("ROLES", role)
                if role_obj.entity.id == entity_obj.id:
                    user.roles.add(role_obj)
                else:
                    errors.append(
                        f"Supplied role does not belong to {entity_obj.title}"
                    )
        if len(errors) > 0:
            raise exceptions.ValidationError(errors)
        else:
            user.save()
            return user


def admin_can_create_entity(user, entity_type):
    """Admin user can only create manufacturing entities"""
    if entity_type != "MANUFACTURING" and user.is_staff:
        return True
    else:
        return False


def create_super_admin_role(instance):
    super_admin_role = None
    cluster = None
    # Dynamically retrieve the super admin role depending on entity type and add to the entity owner

    if Clusters.objects.filter(value="SuperAdmin").exists():
        cluster= Clusters.objects.filter(value="SuperAdmin").first()
        role_value= f"{instance.entity_type}{cluster.value}"
        role_title= str(re.sub(r'([A-Z])', r' \1', instance.entity_type).strip()+" "+ re.sub(r'([A-Z])', r' \1', cluster.title).strip())
        if not Roles.objects.filter(value=role_value,cluster=cluster,title=role_title, entity=instance, owner=instance.owner).exists():
            admin_role= Roles.objects.create(value=role_value,cluster=cluster,title=role_title, entity=instance, owner=instance.owner)   
            instance.owner.roles.add(admin_role)
            
        return instance
    else:
        return instance




def add_default_role_to_user(user):
    default_role = Roles.objects.filter(value="CLIENT").first()
    if default_role:
        user.allowed_roles.add(default_role.id)
        user.save()
        return user
    else:
        raise exceptions.ValidationError("Default role is not configured")


def add_admin_role_to_user(user):
    admin_role = Roles.objects.filter(value="ADMIN").first()
    if admin_role:
        user.allowed_roles.add(admin_role.id)
        user.save()
        return user
    else:
        raise exceptions.ValidationError("Admin role is not configured")


# Categories


def get_all_categories():
    return Categories.objects.exclude(title="DEFAULT")


def get_all_sub_categories():
    return SubCategories.objects.all()


def get_category_sub_categories(data):
    category = None

    if data["category"]:
        category_id = data["category"]
        if Categories.objects.filter(id=category_id).exists():
            category = Categories.objects.filter(id=category_id).first()
            if SubCategories.objects.filter(category=category).exists():
                return SubCategories.objects.filter(category=category).all()
            else:
                return []
        else:
            raise exceptions.ValidationError("No category for supplied ID")
    else:
        raise exceptions.ValidationError("Category ID is required")


def get_user_entity_categories(user):
    return user.entity.categories.all()


# users
def get_all_users(user):
    if user.is_staff:
        return Users.objects.all()
    else:
        return Users.objects.filter(entity=user.entity)


# Entities


def get_all_entities(user):
    entities = []
    entities = Entities.objects.all().exclude(entity_type="DEFAULT")
    # entities = Entities.objects.all().exclude(
    #     entity_type='DEFAULT').order_by("-created")[:10]
    return entities


def get_all_plans():
    plans = []
    plans = models.Plans.objects.all()
    return plans


def get_user_entities(user):
    entities = []
    # Retrieve user's own entities
    if Entities.objects.filter(owner=user).exists():
        entities = Entities.objects.filter(owner=user)


    # else:

    #     # Retrieve entities where user is employed
    #     if Employees.objects.filter(user=user).exists():
    #         employments = Employees.objects.filter(user=user).all()
    #         for employment in employments:
    #             entities.append(employment.entity)
    return entities

def update_user_details(data, user):
    errors = []
    if "first_name" in data and not data["first_name"]=="":
        user.first_name = data["first_name"]
    else:
        errors.append("First name is required")
    
    if "last_name" in data and not data["last_name"]=="":
        user.last_name = data["last_name"]
    else:
        errors.append("Last name is required")

    if "middle_name" in data and not data["middle_name"]=="":
        user.middle_name = data["middle_name"]

    if "marital_status" in data and not data["marital_status"]=="":
        user.marital_status = data["marital_status"]

    if "education_level" in data and not data["education_level"]=="":
        user.education_level = data["education_level"]


    return [],user

    

def update_user_password(data,user):
    pw = None
    new_pw=None

    errors =[]
    if "password" in data and not data["password"]=="":
        pw=data["password"]
    else:
        errors.append("Password is required")
        return errors, None
        
    if "new_password" in data and not data["new_password"]=="":
        new_pw = data["new_password"] 
    else:
        errors.append("Nw password is required")   
        return errors, None

    if  not user.check_password(raw_password=pw):
        errors.append("You entered wrong current password")
        return errors, None
    
    else:
        user.set_password(new_pw)
        user.save()
        return [],user
    
def verify_iprs(data,user):
 
    errors =[]

    if user.iprs_verified=="true":
        errors.append("You are already verified")
        return errors,None
    
    idNumber=None
    if not "id_number" in data or data['id_number']=="":
        errors.append("ID number is required")
        return errors, None
    else:
        idNumber=data['id_number']
    process_iprs_payment()

    errors, result = iprs_verify(idNumber)

    if result:

        if str(result['firstName']).strip()==str(user.first_name).strip() and  str(result['lastName']).strip()==str(user.last_name).strip:
            user.middle_name=str(result['middleName']).strip()
            user.first_name=str(result['firstName']).strip()
            user.last_name=str(result['lastName']).strip()
            user.iprs_verified="true"
            user.identifier_type="NationalId"
            user.identifier_number=idNumber
            user.save()
        else:
            errors.append("User names and ID names are not matching")
            return errors,None
        
        return[],user
    else:
        
        return errors,None


    



def get_entity_followers(user):
   
    # Only the owner of an entity can pull data on followers

    return user.entity.followers.all()

def get_entity_users(user):
    # Only the owner of an entity can pull data on followers
    if Users.objects.filter(entity=user.entity).exists():
        return Users.objects.filter(entity=user.entity).all()
    else:
        return []
def get_entity_users_admin(user, data):
    errors =[]
    entity = None
    if not user.is_staff:
        raise exceptions.ValidationError("Not authrized")

    if not "entity" in data or data["entity"]=="":
        raise exceptions.ValidationError("Entity ID is required")
       
    else:
        entity =authentication_models_validators.validate_entity(data["entity"])

    # Only the owner of an entity can pull data on followers
    if Users.objects.filter(entity=entity).exists():
        return Users.objects.filter(entity=entity).all()
    else:
        return []

def search_manufacturers(data, user):
    return Entities.objects.filter(
        Q(title__icontains=data["searchQuery"]) & Q(entity_type__iexact="MANUFACTURING")
    )


def search_distributors(data, user):
    return Entities.objects.filter(
        Q(title__icontains=data["searchQuery"]) & Q(entity_type__iexact="DISTRIBUTION")
    )


def search_retailers(data):
    return Entities.objects.filter(
        Q(title__icontains=data["search_param"]) & Q(entity_type__iexact="RETAIL")
    )


def search_wholesalers(data, user):
    return Entities.objects.filter(
        Q(title__icontains=data["searchQuery"]) & Q(entity_type__iexact="WHOLESALE")
    )


def get_user_favorite_entities(user):
    if user.is_staff:
        raise exceptions.ValidationError("Not allowed")
    entities = []

    entities = user.favorite_entities.all()

    return entities

def get_facilitator_entities(user):
    
    entities = []
    if Entities.objects.filter(entity_type="BANK").exists():
        entities = Entities.objects.filter(entity_type="BANK").all()

    return entities


def get_retail_entities(user):
    entities=[]
    if user.is_staff:
        entities = Entities.objects.filter(entity_type="RETAIL").all()
    else:
        entities= Entities.objects.filter(entity_type="RETAIL", is_verified="true")
    return entities


def get_agent_entities(user):
    entities =[]

    if Agents.objects.filter(user=user,is_active=True).exists():
        agent = Agents.objects.filter(user=user,is_active=True).first()
            
        entities = Entities.objects.filter(
            Q(title__iexact="WAZIPOS") | Q(agent=agent),
            is_verified="true",
        )
    return entities

def get_wholesale_entities(user):
    wholesales=[]
    wholesale_categories=[]
    wholesalers_in_category=[]
    user_entity_categories =user.entity.categories.all()
    if user.is_staff:
        wholesalers_in_category = Entities.objects.filter(entity_type="WHOLESALE").all()
    else:
        wholesales = Entities.objects.filter(entity_type="WHOLESALE", is_verified="true")
        
        for wholesale in wholesales:
            wholesale_categories = wholesale.categories.all()
            print("wholesale_categories", wholesale_categories)
            for user_entity_category in user_entity_categories:
                if user_entity_category in wholesale_categories:
                    if not wholesale in wholesalers_in_category:
                        wholesalers_in_category.append(wholesale)


    return wholesalers_in_category


def get_distributor_entities(user):
    entities = Entities.objects.filter(entity_type="DISTRIBUTION", is_verified="true")
    return entities


def get_manufacturer_entities(user):
    entities = Entities.objects.filter(entity_type="MANUFACTURING", is_verified="true")
    return entities


def get_banks():
    entities = Entities.objects.filter(entity_type="BANK", is_verified="true")
    return entities


def get_banks_and_telcos():
    entities = Entities.objects.filter(
        Q(entity_type__iexact="BANK") | Q(entity_type__iexact="TELCO"),
        is_verified="true",
    )
    return entities


def get_telcos():
    entities = Entities.objects.filter(entity_type="TELCO", is_verified="true")
    return entities


def get_entity_details(data, user):
    try:
        entity_id = data["entity"]
        if Entities.objects.filter(id=entity_id).exists():
            entity = Entities.objects.get(id=entity_id)

            return entity

    except KeyError:
        raise exceptions.ValidationError("Entity ID is required")


def search_entities(data, user):
    # TODO: reference search with Q
    searchQuery = None
    try:
        searchQuery = data["searchQuery"]
        if data["searchQuery"] == "":
            raise exceptions.ValidationError("Search parameter cannot be empty")
        else:
            if Entities.objects.filter(Q(title__icontains=searchQuery)).exists():
                retailer_receipts = Entities.objects.filter(
                    Q(title__icontains=searchQuery)
                ).all()

                return retailer_receipts
            else:
                return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")


def get_employer_entities(user):
    # Retrieve employer entities
    employers = []

    if Employees.objects.filter(user=user).exists():
        employments = Employees.objects.filter(user=user).all()
        for employment in employments:
            employers.append(employment.entity)
        return employers
    else:
        raise exceptions.ValidationError("You are not employed by any entity")


def validate_create_category_data(data, user):
    if not user.is_staff:
        raise exceptions.ValidationError("Admins only")
    errors = []
    try:
        category_details = data["category_details"]

    except KeyError:
        raise exceptions.ValidationError("Category details are required")
    try:
        title = data["category_details"]["title"]
        if title == "":
            errors.append("Title cannot be empty")
        if Categories.objects.filter(
            title=title.upper(),
        ).exists():
            raise exceptions.ValidationError(f"Category called {title} already exists")

    except KeyError:
        errors.append("Category title is required")
    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def validate_create_sub_category_data(data, user):
    if not user.is_staff:
        raise exceptions.ValidationError("Admins only")
    errors = []
    try:
        sub_category_details = data["sub_category_details"]

    except KeyError:
        raise exceptions.ValidationError("Category details are required")
    try:
        title = data["sub_category_details"]["title"]
        if data["sub_category_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if Categories.objects.filter(
            title=title,
        ).exists():
            raise exceptions.ValidationError(
                f"Sub category called {title} already exists"
            )

    except KeyError:
        errors.append("Sub category title is required")
    try:
        category_id = data["sub_category_details"]["category"]
        if data["sub_category_details"]["category"] == "":
            errors.append("Category ID cannot be empty")
        if not Categories.objects.filter(
            id=category_id,
        ).exists():
            raise exceptions.ValidationError(f"Category for supplied ID does not exist")

    except KeyError:
        errors.append("Category ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return

def create_town(data, user):
    errors =[]
    town = None
    county = None
    title = None
    abbreviation = ""

    if not "county" in data["town_details"] or data["town_details"]["county"]=="":
        errors.append("County ID is required")
    else:
        county = authentication_models_validators.validate_county(data["town_details"]["county"])
    if not "title" in data["town_details"] or data["town_details"]["title"]=="":
        errors.append("Title is required")
    else:
        title = data["town_details"]["title"]
        if models.Towns.objects.filter(title=title,county=county).exists():
            errors.append(f"Town name {title} already exists for {county} County")
    if "abbreviation"  in  data["town_details"] and not     data["town_details"]["abbreviation"]=="":
        abbreviation=  data["town_details"]["abbreviation"]

    if len(errors)>0:
        return errors, None
    else:
        try:
            town = models.Towns.objects.create(county=county,abbreviation=abbreviation, title=title, entity=user.entity,)
            return [], town
        except Exception as e:
            errors.append(str(e))
            return errors, None


def update_town(data, user):
    errors =[]
    town = None
    county = None
    title = None
    abbreviation = ""

    if not "town_id" in data["town_details"] or data["town_details"]["town_id"]=="":
        errors.append("Town ID  is required")
        return errors, None
    else:
        town = authentication_models_validators.validate_town(data["town_details"]["town_id"])

    if  "county" in data["town_details"] and not data["town_details"]["county"]=="":
       county = authentication_models_validators.validate_county(data["town_details"]["county"])
       town.county = county
       town.save()
    
        
    if  "title" in data["town_details"] and not data["town_details"]["title"]=="":
        town.title =  data["town_details"]["title"]
        town.save()

    if "abbreviation"  in  data["town_details"] and not     data["town_details"]["abbreviation"]=="":
        abbreviation=  data["town_details"]["abbreviation"]
        town.abbreviation=abbreviation
        town.save()

    if len(errors)>0:
        return errors, None
    else:
        return  [], town


def create_category(data, user):
    description = ""
    icon_category = ""
    icon = ""
    if "description" in data["category_details"]:
        description = data["category_details"]["description"]
        
    if "icon_category" in data["category_details"]:
        icon_category = data["category_details"]["icon_category"]

    if "icon" in data["category_details"]:
        icon = data["category_details"]["icon"]

    try:
        created = Categories.objects.create(
            title=data["category_details"]["title"],
            icon_category=icon_category,
            icon=icon,
            description=description,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_category_details(data, user):
    try:
        category_id = data["category_id"]
        if Categories.objects.filter(id=category_id).exists():
            category = Categories.objects.get(id=category_id)

            return category
        else:
            raise exceptions.ValidationError(
                "Category with the supplied ID does not exist"
            )

    except KeyError:
        raise exceptions.ValidationError("Category ID is required")


def create_sub_category(data, user):
    description = ""
    if data["sub_category_details"]["description"]:
        description = data["sub_category_details"]["description"]

    try:
        created = SubCategories.objects.create(
            title=data["sub_category_details"]["title"],
            category_id=data["sub_category_details"]["category"],
            description=description,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def validate_create_local_entity_data(data, user):
    errors = []
    country = None
    county = None
    organization = None
    title = ""
    # Only verified users can create entities
    # if user.is_staff:
    #     raise exceptions.ValidationError("Not authorized")



    try:
        entity_details = data["entity_details"]

    except KeyError:
        errors.append("Entity details are required")
    try:
        title = data["entity_details"]["title"]
        if data["entity_details"]["title"] == "":
            errors.append("Title cannot be empty")

    except KeyError:
        errors.append("Entity title is required")

    try:
        entity_type = data["entity_details"]["entity_type"]
        if data["entity_details"]["entity_type"] == "":
            errors.append("Entity type cannot be empty")
        # if data["entity_details"]["entity_type"] == "RETAIL" and user.is_staff:
        #     errors.append("Staff user cannot create retail entity")

    except KeyError:
        errors.append("Entity type is required")

    try:
        entity_ownership = data["entity_details"]["entity_ownership"]
        if data["entity_details"]["entity_ownership"] == "":
            errors.append("Entity ownership cannot be empty")

    except KeyError:
        errors.append("Entity ownership is required")

    try:
        town = data["entity_details"]["town"]
        if data["entity_details"]["town"] == "":
            errors.append("Town name cannot be empty")

    except KeyError:
        errors.append("Town name is required")

    try:
        road = data["entity_details"]["road"]
        if data["entity_details"]["road"] == "":
            errors.append("Road name cannot be empty")

    except KeyError:
        errors.append("Road name is required")
    
    try:
        building = data["entity_details"]["building"]
        if data["entity_details"]["building"] == "":
            errors.append("Building name cannot be empty")

    except KeyError:
        errors.append("Building name is required")
    # try:
    #     plan = data["entity_details"]["plan"]
    #     if data["entity_details"]["plan"] == "":
    #         errors.append("Plan ID cannot be empty")

    # except KeyError:
    #     errors.append("Plan ID is required")

    if Entities.objects.filter(title=title, country=user.country).exists():
        errors.append(
            "Entity with this title already exists in the system for your country"
        )
    if len(errors) > 0:
        return errors
    else:
        return []


def validate_create_international_entity_data(data):
    errors = []
    title = None
    country_id = None
    entity_code = None
    try:
        entity_details = data["entity_details"]

    except KeyError:
        errors.append("Entity details are required")

    # if 'entity_type' in data['entity_details'] and data['entity_details']["entity_type"] == 'BANK':
    #     if not 'entity_code' in data['entity_details'] or data['entity_details']["entity_code"] == "":
    #         errors.append('Entity code is required for banks')
    #     else:
    #         entity_code = data['entity_details']["entity_code"]
    # else:
    #     pass

    if "country" in data["entity_details"]:
        country_id = data["entity_details"]["country"]
    else:
        errors.append("Country ID is required")
    try:
        title = data["entity_details"]["title"]
        if data["entity_details"]["title"] == "":
            errors.append("Title cannot be empty")

    except KeyError:
        errors.append("Entity title is required")

    try:
        entity_type = data["entity_details"]["entity_type"]
        if data["entity_details"]["entity_type"] == "":
            errors.append("Entity type cannot be empty")

    except KeyError:
        errors.append("Entity type is required")

    try:
        entity_ownership = data["entity_details"]["entity_ownership"]
        if data["entity_details"]["entity_ownership"] == "":
            errors.append("Entity ownership cannot be empty")

    except KeyError:
        errors.append("Entity ownership is required")

    if country_id and title:
        if Entities.objects.filter(title=title.upper(), country_id=country_id).exists():
            raise exceptions.ValidationError(
                f"Entity called {title} already exists in selected country"
            )

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return

@transaction.atomic
def create_local_entity(data, user):
    is_verified = "false"
    is_active = False
    organization=None
    # latitude = None
    # longitude = None
    # if 'latitude' in data['entity_details'] and data['entity_details']['latitude']:
    #     latitude = latitude = None
    # if 'longitude' in data['entity_details'] and data['entity_details']['longitude']:
    #     longitude = longitude = None
    if user.is_staff:
        is_verified = "true"
        is_active = True

    if "organization" in data and not data["organization"]=="":
        organization = authentication_models_validators.validate_organization(data["organization"])

    try:
        created = Entities.objects.create(
            title=data["entity_details"]["title"],
            entity_type=data["entity_details"]["entity_type"],
            entity_ownership=data["entity_details"]["entity_ownership"],
            entity_level=data["entity_details"]["entity_level"],
            road=str(data["entity_details"]["road"]).upper(),
            building=str(data["entity_details"]["building"]).upper(),
            town=str(data["entity_details"]["town"]).upper(),
            county_id=data["entity_details"]["county"],
            country_id=data["entity_details"]["country"],
            owner=user,
            is_active = is_active,
            is_verified = is_verified,
            organization=organization
        )
        if created:
            # if data["entity_details"]["identifier_document_number"]:
            #     user.identifier_document_number = data["entity_details"]["identifier_document_number"]
            #     user.save()
            if (
                "categories" in data["entity_details"]
                and data["entity_details"]["categories"]
            ):
                for id in data["entity_details"]["categories"]:
                    if Categories.objects.filter(id=id).exists():
                        category = Categories.objects.filter(id=id).first()
                        created.categories.add(category)
            employee = Employees.objects.create(
                entity=created, user=created.owner, is_active = "true", owner=user
            )

            return created

        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def create_local_entity_by_agent(data, user):
    title =None
    entity_type =None
    entity_ownership =None
    entity_ =None
    road = None
    building = None
    town = None
    county = None
    county_obj=None
    country = None
    country_obj=None
    owner = None
    owner_obj = None
    agent = None
    latitude = None
    longitude = None
    errors = []
    created = None
    employee = None

    if not "title" in data["entity_details"] or data["entity_details"]["title"]=="":
        errors.append("Title is require")
        return errors, None
    else:
        title=data["entity_details"]["title"]

    if not "entity_type" in data["entity_details"] or data["entity_details"]["entity_type"]=="":
        errors.append("Entity type is required")
        return errors, None
    else:
        entity_type=data["entity_details"]["entity_type"]
        
    if not "entity_ownership" in data["entity_details"] or data["entity_details"]["entity_ownership"]=="":
        errors.append("Entity ownership is required ")
        return errors, None
    else:
        entity_ownership=str(data["entity_details"]["entity_ownership"]).upper()

    if not "entity_level" in data["entity_details"] or data["entity_details"]["entity_level"]=="":
        errors.append("Entity ownership is required ")
        return errors, None
    else:
        entity_level=data["entity_details"]["entity_level"]


    if not "road" in data["entity_details"] or data["entity_details"]["road"]=="":
        errors.append("TRoad name is required")
        return errors, None
    else:
        road=str(data["entity_details"]["road"]).upper()

    if not "building" in data["entity_details"] or data["entity_details"]["building"]=="":
        errors.append("Building name is required")
        return errors, None
    else:
        building=str(data["entity_details"]["building"]).upper()
        
    if not "town" in data["entity_details"] or data["entity_details"]["town"]=="":
        errors.append("Town name is required")
        return errors, None
    else:
        town=str(data["entity_details"]["town"]).upper()


    if  "county" in data["entisty_details"]:
        county=data["entity_details"]["county"]

    if not "country" in data["entity_details"] or data["entity_details"]["country"]=="":
        errors.append("Country is required")
        return errors, None
    else:
        country=data["entity_details"]["country"]

    if not "agent" in data["entity_details"] or data["entity_details"]["agent"]=="":
        errors.append("Agent ID is required")
        return errors, None
    else:
        agent=data["entity_details"]["agent"]

    if not "owner" in data["entity_details"] or data["entity_details"]["owner"]=="":
        errors.append("Owner ID is required")
        return errors, None
    else:
        owner=data["entity_details"]["owner"]

    try:
        created = Entities.objects.create(
            title=title,
            entity_type=entity_type,
            entity_ownership=entity_ownership,
            entity_level=entity_level,
            road=road,
            building=building,
            town=town,
            county_id=county,
            country_id=country,
            owner_id=owner,
            agent_id=agent,
            is_active = True,
            is_verified = True
        )
        if created:
# Set default roless
            if Clusters.objects.filter(value="ADMIN").count() > 0:
                cluster = Clusters.objects.filter(value="ADMIN").first()
                role_to_add = Roles.objects.create(
                level=created.entity_type,
                title=f"{created.entity_type} SUPER ADMIN",
                value=f"{created.entity_type}_SUPER_ADMIN",
                entity=created,
                cluster=cluster,
                owner=created.owner,

                )
                created.owner.roles.add(role_to_add)
                created.owner.allowed_roles.add(role_to_add)
                # Set default categories
            if (
                "categories" in data["entity_details"]
                and data["entity_details"]["categories"]
            ):
                for id in data["entity_details"]["categories"]:
                    if Categories.objects.filter(id=id).exists():
                        category = Categories.objects.filter(id=id).first()
                        created.categories.add(category)
            # Add owner as default employee
            employee = Employees.objects.create(entity=created,user=created.owner, is_active = "true",owner=user)
            if employee:
                data = {
                "action":"CreateEntityCollectionAccount",
                "collection_account_details":{
                    "administrator":employee.id,
                    "entity": created.id
                }
            }
                
                # Create collection account
                errors, collection_account = create_user_account(data, employee.user)
                # Send sms
                if collection_account:
                    message = f"Your account number {collection_account.entity_account_number} has been created at MOBITICKET. Your can dial *615*50# on your phone number {collection_account.entity_account_phone} to set your pin"

                    payload = {
                            "contact" : created.owner.phone,
                            "message" : message,
                            "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                            "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                        }

                    errors, sent = send_swift_sms(payload)
                    return [], created
                else:
                    employee.delete()
                    created.delete()
                    return errors, None
            else:
                 return ["Employee creation failed"], None

              

        else:
            return ["An error occurred"], None
    except Exception as e:
        errors.append(str(e))
        return errors, None
        # raise exceptions.ValidationError(e)
    


def create_international_entity(data, user):
    entity_code = None
    categories = []
    phone1=None
    phone2=None
    phone3=None
    

    if "phone1" in data["entity_details"] and not  data["entity_details"]["phone1"]=="":
        phone1=data["entity_details"]["phone1"]

    if "phone2" in data["entity_details"] and not  data["entity_details"]["phone2"]=="":
        phone2=data["entity_details"]["phone2"]


    if "phone3" in data["entity_details"] and not  data["entity_details"]["phone3"]=="":
        phone3=data["entity_details"]["phone3"]
    
    if "categories" in data["entity_details"]:
        if data["entity_details"]["categories"]:
            categories = data["entity_details"]["categories"]

    # if "entity_code" in data["entity_details"]:
    #     entity_code = data["entity_details"]["entity_code"]
    try:
        created = Entities.objects.create(
            title=data["entity_details"]["title"],
            bank_code=data["entity_details"]["bank_code"],
            entity_type=data["entity_details"]["entity_type"],
            entity_ownership=data["entity_details"]["entity_ownership"],
            entity_level=data["entity_details"]["entity_level"],
            country_id=data["entity_details"]["country"],
            owner=user,
            is_verified="true",
            entity_code=entity_code,
            phone1=phone1,
            phone2=phone2,
            phone3=phone3
        )
        if created:
            if len(categories) > 0:
                for cat in categories:
                    category = authentication_models_validators.verify_category_exists(cat)
                    created.categories.add(category)
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def update_entity(data, user):
    entity = None

    try:
        entity_id = data["entity"]
        if data["entity"] == "":
            raise exceptions.ValidationError("Entity ID must be valid UUID")
        if Entities.objects.filter(id=entity_id).exists():
            entity = Entities.objects.get(id=entity_id)
            if user.is_staff:
                pass
            elif user == entity.owner:
                pass
            else:
                raise exceptions.ValidationError("Not authorized")

    except KeyError:
        raise exceptions.ValidationError("Entity ID is required")

    title = None
    entity_type = None
    entity_ownership = None
    entity_level = None
    town = ""
    road = ""
    building = ""
    county = ""
    country = ""
    categories = []

    if "title" in data["entity_details"]:
        if data["entity_details"]["title"]:
            title = data["entity_details"]["title"]
    if "entity_type" in data["entity_details"] and not data["entity_details"]["entity_type"]=="":
        
        entity_type = data["entity_details"]["entity_type"]
        entity.entity_type=entity_type
        entity.save()
    if "entity_level" in data["entity_details"] and not data["entity_details"]["entity_level"]=="":
        
        entity_level = data["entity_details"]["entity_level"]
        entity.entity_level=entity_level
        entity.save()

    if "entity_ownership" in data["entity_details"] and not data["entity_details"]["entity_ownership"]=="":
        entity_ownership = data["entity_details"]["entity_ownership"]
        entity.entity_ownership = entity_ownership
        entity.save()

    if "town" in data["entity_details"]:
        if data["entity_details"]["town"]:
            town = data["entity_details"]["town"]

    if "road" in data["entity_details"]:
        if data["entity_details"]["road"]:
            road = data["entity_details"]["road"]

    if "building" in data["entity_details"]:
        if data["entity_details"]["building"]:
            building = data["entity_details"]["building"]
    if "county" in data["entity_details"]:
        if data["entity_details"]["county"]:
            county = data["entity_details"]["county"]
    if "country" in data["entity_details"]:
        if data["entity_details"]["country"]:
            country = data["entity_details"]["country"]
    if "categories" in data["entity_details"]:
        if data["entity_details"]["categories"]:
            categories = data["entity_details"]["categories"]

    try:
        if title:
            entity.title = title
            entity.save()
        if town:
            entity.town = town
            entity.save()
        if road:
            entity.road = road
            entity.save()
        if building:
            entity.building = building
            entity.save()
        if county:
            entity.county_id = county
            entity.save()
        if country:
            entity.country_id = country
            entity.save()
        if len(categories) > 0:
            entity.categories.clear()
            for cat in categories:
                category = authentication_models_validators.verify_category_exists(cat)
                entity.categories.add(category)
        return entity
    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def update_category(data, user):
    icon_category = ""
    icon = ""
    description = ""
    if user.is_staff:
        pass
    else:
        raise exceptions.ValidationError("Not authorized")
    category = None

    try:
        category_id = data["category_details"]["category"]
        if data["category_details"]["category"] == "":
            raise exceptions.ValidationError("Category ID must be valid UUID")
        if Categories.objects.filter(id=category_id).exists():
            category = Categories.objects.get(id=category_id)

    except KeyError:
        raise exceptions.ValidationError("Category ID is required")

    title = None
    description = None

    if "title" in data["category_details"]:
        if data["category_details"]["title"]:
            title = data["category_details"]["title"]
    if "description" in data["category_details"]:
        if data["category_details"]["description"]:
            description = data["category_details"]["description"]

    if "icon" in data["category_details"]:
        if data["category_details"]["icon"]:
            icon = data["category_details"]["icon"]
    if "icon_category" in data["category_details"]:
        if data["category_details"]["icon_category"]:
            icon_category = data["category_details"]["icon_category"]

    try:
        if title:
            category.title = title
            category.save()
        if description and not description == "":
            category.description = description
            category.save()
        if icon_category:
            category.icon_category = icon_category
            category.save()
        if icon:
            category.icon = icon
            category.save()

        return category
    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def update_sub_category(data, user):
    if user.is_staff:
        pass
    else:
        raise exceptions.ValidationError("Not authorized")
    sub_category = None

    try:
        sub_category_id = data["sub_category_details"]["sub_category"]
        if data["sub_category_details"]["sub_category"] == "":
            raise exceptions.ValidationError("Sub category ID must be valid UUID")
        if SubCategories.objects.filter(id=sub_category_id).exists():
            sub_category = SubCategories.objects.get(id=sub_category_id)

    except KeyError:
        raise exceptions.ValidationError("Sub category ID is required")

    title = None
    description = None
    category = None

    if "title" in data["sub_category_details"]:
        if data["sub_category_details"]["title"]:
            title = data["sub_category_details"]["title"]
    if "category" in data["sub_category_details"]:
        if data["sub_category_details"]["category"]:
            category_id = data["sub_category_details"]["category"]
            if not Categories.objects.filter(id=category_id).exists():
                raise exceptions.ValidationError("Category for given ID does not exist")
            else:
                category = Categories.objects.filter(id=category_id).first()
    if "description" in data["sub_category_details"]:
        if data["sub_category_details"]["description"]:
            description = data["sub_category_details"]["description"]

    try:
        if title:
            sub_category.title = title
            sub_category.save()
        # if category:
        #     sub_category.category = category
        #     sub_category.save()
        if description:
            sub_category.description = description
            sub_category.save()

        return sub_category
    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def entity_assign_categories(data, user):
    entity = None
    categories = None

    try:
        
        print("data here", data)
        if "entity" in data and not data["entity"] == "":
            entity_id = data["entity"]
            print("EID", entity_id)
        else:
            raise Exception("Entity ID must be valid UUID")
        if Entities.objects.filter(id=entity_id).exists():
            entity = Entities.objects.get(id=entity_id)
            if not entity.is_verified:
                raise Exception("Entity is not yet verified")
        else:
            raise exceptions.ValidationError("Entity with provided ID does not exist")

    except Exception as e:
        raise exceptions.ValidationError(e)
    try:
        categories = data["categories"]
        if data["categories"] == []:
            entity.categories.clear()
            return entity
        else:
            # Clear all current categories
            entity.categories.clear()
            for category_id in categories:
                print("category_id", category_id)
                if Categories.objects.filter(id=category_id).exists():
                    category = Categories.objects.get(id=category_id)
                    print("category", category)
                    entity.categories.add(category)
                    entity.save()

                else:
                    pass
            if entity.categories.count() > 0:
                return entity
            else:
                return

    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def verify_entity_licence(data, user):
    licence = None
    licence_id = None
    entity_id = None
    entity = None
    valid_from = None
    valid_to = None
    errors = []
    """Verify entity licence"""
    try:
        licence_details = data["licence_details"]

    except KeyError:
        errors.append("Licence details are required")
    try:
        licence_id = data["licence_details"]["licence"]
        if data["licence_details"]["licence"] == "":
            errors.append("Licence ID cannot be empty")
        print("lid", licence_id)

    except KeyError:
        errors.append("Licence ID is required")
    # try:
    #     valid_from = data["licence_details"]["valid_from"]
    #     if data["licence_details"]["valid_from"] == "":
    #         errors.append("Valid from date cannot be empty")

    # except KeyError:
    #     errors.append("Valid from date is required")
    # try:
    #     valid_to = data["licence_details"]["valid_to"]
    #     if data["licence_details"]["valid_to"] == "":
    #         errors.append("Valid to date cannot be empty")

    # except KeyError:
    #     errors.append("Valid to date is required")
    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if EntityLicences.objects.filter(id=licence_id).exists():
            licence = EntityLicences.objects.filter(id=licence_id).first()

            if licence.is_verified == "true":
                raise exceptions.ValidationError("Licence is already verified")
            else:
                licence.is_verified = "true"
                licence.verified_by = user
                licence.save()
                return licence
        else:
            raise exceptions.ValidationError("No licence matches given details")


@transaction.atomic
def delete_entity(data, user):
    entity = None
    entity_id = None

    errors = []
    """Delete entity """

    try:
        entity_id = data["entity"]
        if data["entity"] == "":
            errors.append("Entity ID cannot be empty")

    except KeyError:
        errors.append("Entity ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if Entities.objects.filter(id=entity_id).exists():
            entity = Entities.objects.filter(id=entity_id).first()
        else:
            raise exceptions.ValidationError("No entity matches given details")

        entity.delete()
        return


@transaction.atomic
def delete_entity_licence(data, user):
    licence = None
    licence_id = None
    entity_id = None
    entity = None
    valid_from = None
    valid_to = None
    errors = []
    """Delete entity licence"""

    try:
        licence_details = data["licence_details"]

    except KeyError:
        errors.append("Licence details are required")
    try:
        licence_id = data["licence_details"]["licence"]
        if data["licence_details"]["licence"] == "":
            errors.append("Licence ID cannot be empty")

    except KeyError:
        errors.append("Licence ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if EntityLicences.objects.filter(id=licence_id).exists():
            licence = EntityLicences.objects.filter(id=licence_id).first()
        else:
            raise exceptions.ValidationError("No licence matches given details")

        licence.delete()
        return


@transaction.atomic
def delete_entity_image(data, user):
    image = None
    image_id = None
    entity_id = None
    entity = None
    valid_from = None
    valid_to = None
    errors = []
    """Delete entity image"""

    try:
        image_details = data["image_details"]

    except KeyError:
        errors.append("Picture details are required")
    try:
        image_id = data["image_details"]["image"]
        if data["image_details"]["image"] == "":
            errors.append("Picture ID cannot be empty")

    except KeyError:
        errors.append("Picture ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if EntityImages.objects.filter(id=image_id).exists():
            image = EntityImages.objects.filter(id=image_id).first()
        else:
            raise exceptions.ValidationError("No entity picture matches given details")

        image.delete()
        return


def update_entity_categories(data):
    entity = None
    categoriesArr = []
    if "entity" in data and data["entity"] != "":
        entity_id = data["entity"]
        entity = authentication_models_validators.entity_has_verified_licences(
            entity_id
        )
    if "categories" in data:
        categories = data["categories"]
        for category in categories:
            category_obj = authentication_models_validators.verify_category_exists(
                category
            )
            entity.categories.add(category_obj)






@transaction.atomic
def verify_entity_branch(data, user):
    errors=[]
    entity=None
    branch=None
    default_psp=None

    if  PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
            default_psp= PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    else:
        errors.append("No such payment services provider")

    if not user.is_staff:
        errors.append("Not permitted")
        return errors, None
    if "entity" in data and not data["entity"]=="":
        entity=authentication_models_validators.validate_entity(data["entity"])
    else:
        errors.append("Entity ID is required")

    if not "branch" in data or data["branch"]=="":
        errors.append("Branch ID is required")
        return errors, None
    else:
        branch=authentication_models_validators.validate_entity_branch(data["branch"])
       
    
    # Is entity verified?
    if not entity.is_verified=="true":
        errors.append(f"{entity} is not verified")
        return errors, None
    # Is owner verified?
    if not entity.owner.is_verified=="true":
        errors.append(f"{entity} owner is not verified")
        return errors, None
    
    
    if not branch.entity==entity:
        errors.append("Branch does not belong to entered entity")
        return errors, None

    # if branch.is_verified=="true":
    #     errors.append("branch is already verified")
    #     return errors, None
    
    if len(errors)>0:
        return errors, None
    else:
        if BranchCollectionAccount.objects.filter(branch=branch).exists():
            branch.is_verified="true"
            branch.save()
            return [],branch
        else:
            data=json.dumps({
                        "currency": "KES",
                        "phoneNumber": branch.owner.phone, 
                        "name": branch.title,
                        "description": f"Sales collection accounf for {branch.title} branch",
                        "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                        "accountType": "Individual"
                    })

            errors, account =create_white_label_account(data)

            if account:
                created=BranchCollectionAccount.objects.create(
                    branch=branch,
                    psp=default_psp,
                    account_number=account["accountNo"],
                    account_name=account["name"],
                    currency=account["currency"],
                    entity=user.entity,
                    owner=user
                )
                if created:
                    branch.is_verified=="true"
                    branch.save()
                    return [], branch
                else:
                    return errors, None
                


@transaction.atomic
def verify_entity(data, user):
    errors = []
    entity = None
    default_psp=None
    if not "entity" in data or data["entity"] == "":
        errors.append("Entity ID must be valid UUID")
        return errors, None
    else:
        entity_id = data["entity"]
        entity = authentication_models_validators.validate_entity(entity_id) 
        try:
            entity = authentication_models_validators.entity_has_verified_licences(
                    entity.id
                )
            if "categories" in data:
                categories = data["categories"]
                for category in categories:
                    category_obj = authentication_models_validators.verify_category_exists(
                        category
                    )
                    entity.categories.add(category_obj)
            if entity:
                entity.is_verified = "true"
                entity.verified_by = user
                entity.save()
                entity.owner.entity = entity
                entity = create_super_admin_role(entity)
                entity.owner.save()

                return [], entity

            #     if len(categoriesArr) > 0:
            #         for cat in categoriesArr:
            #             entity.categories.add(cat)
                

                
            # entity = create_super_admin_role(entity)
            # default_psp =PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
            # print("PSP", default_psp)
            # if EntityPSPCollectionAccount.objects.filter(entity=entity,psp=default_psp).exists():
            #     print("Existing PSP Account")
            #     return [], entity
            # else:
            #     print("Create PSP Account")
            #     if models.UserDocuments.objects.filter(owner=entity.owner).exists():
                    # document = models.UserDocuments.objects.filter(owner=entity.owner).first()
                    # data = {
                    #         "firstName": entity.owner.first_name,
                    #         "lastName": entity.owner.last_name,
                    #         "identityNumber": document.document_number,
                    #         "identityType": document.document_type,
                    #         "phoneNumber": entity.owner.phone,
                    #         "gender": entity.owner.gender,
                    #         "dateOfBirth": entity.owner.date_of_birth.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    #         "county": entity.owner.county.title,
                    #         "physicalAddress": entity.owner.constituency.title,
                    #         "email": entity.owner.email,
                    #     }
                    # print(entity.owner.phone)
                
                    # errors, profile= create_jambopay_profile(data)
                    # if profile:
                    #     print("profile",profile)
                    #     data=json.dumps({
                    #                 "currency": "KES",
                    #                 "phoneNumber": entity.owner.phone, 
                    #                 "name": entity.title,
                    #                 "description": f"Sales collection accounf for {entity.title}",
                    #                 "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                    #                 "accountType": "Individual"
                    #             })

                    #     errors, account =create_white_label_account(data)
                    #     if account:
                    #         print("Profile exists")
                    #         created =  EntityPSPCollectionAccount.objects.create(
                                                            
                    #             psp=default_psp,
                    #             account_number=account["accountNo"],
                    #             account_name=account["name"],
                    #             account_type="WALLET",
                    #             entity=entity,
                    #             owner=user

                    #         )

                    #         if created:
                    #             return [], entity
                    #         else:
                    #             return ["Collection account not created"], None
                    # else:
                    #     for e in errors:
                    #         if e=="A Profile with given phone number already exist":
                    #             data=json.dumps({
                    #                 "currency": "KES",
                    #                 "phoneNumber": entity.owner.phone, 
                    #                 "name": entity.title,
                    #                 "description": f"Sales collection accounf for {entity.title}",
                    #                 "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                    #                 "accountType": "Individual"
                    #             })

                    #             errors, account =create_white_label_account(data)
                    #             if account:
                    #                 print("Profile exists")
                    #                 created =  EntityPSPCollectionAccount.objects.create(
                                                                
                    #                     psp=default_psp,
                    #                     account_number=account["accountNo"],
                    #                     account_name=account["name"],
                    #                     account_type="WALLET",
                    #                     entity=entity,
                    #                     owner=user

                    #                 )

                    #                 if created:
                    #                     return [], entity
                    #                 else:
                    #                     return ["Collection account not created"], None

                    #     # return errors, None
                    #     # errors, accounts=get_jambopay_profile_accounts(data)
                    #     # if accounts:
                    #     #     print("Accounts",accounts)
                    #     # else:
                    #     #     return errors, None
                
                    # if len(errors)>0:
                    #     return errors, None
                    # else:
                    #     pass


                # data = entity.owner.phone
                # errors, accounts=get_jambopay_profile_accounts(data)

                
                #     return errors, None
                # return ["No account"], None
            # else:
            #     
            #     if accounts:
            #         pass
            #     else:
            #         return errors, None

            # return entity

        except KeyError:
            raise exceptions.ValidationError("Entity ID is required")

@transaction.atomic
def update_entity_administrator(data, user):
    errors = []
    current_collection_account = None
    entity = None
    employee = None
    user = None

    if   not "user" in data or data["user"]=="":
        errors.append("User ID is required")
        return errors, None
    else:
        if Users.objects.filter(id=data["user"]).exists():
            user =  Users.objects.filter(id=data["user"]).first()
        else:
            errors.append("User with provided ID does not exist")
            return errors, None

        if user:
            if Employees.objects.filter(user=entity.administrator).exists():
                employee = Employees.objects.filter(user=entity.administrator).first()
            else:
                errors.append(f"User is not an employee at {entity.title}")
                return errors, None




    if entity.administrator:
        if entity.administrator==employee.user:
            errors.append(f"{entity.administrator} is already set as administrator at {entity}")
            return errors, None
        
    if UserAccounts.objects.filter(user=user).exists():
        entity.administrator = user
        entity.save()
    else:
        errors.append("User has no valid wallet account")
        return errors, None



    
@transaction.atomic
def create_corporate_employee(data, user):
    errors = []
    entity = None
    user_to_employ = None
    hire_date = None
    if not "entity" in data or data["entity"]=="":
        errors.append("Entity ID is required")
       
    else:
        entity =authentication_models_validators.validate_entity(data["entity"])
    if not "user" in data or data["user"]=="":
        errors.append("User ID is required")
      
    else:
        user_to_employ =authentication_models_validators.validate_user(data["user"])
    if not "hire_date" in data or data["hire_date"]=="":
        errors.append("Hire date is required")
        
    else:
        hire_date = data["hire_date"]

    if len(errors)>0:
        return errors, None
    else:
        if Employees.objects.filter(user=user_to_employ, entity=entity).exists():
            errors.append(f"{user} is already an employee at {entity}")
            return errors, None
        else:
            try:
                created = Employees.objects.create(user=user_to_employ,entity=entity, owner=user, hire_date=hire_date)
                if created:
                    return [], created
            except Exception as e:
                errors.append(str(e))
                return errors, None
            
def get_organizations(user):
    return models.Organizations.objects.all()

def create_corporate_organization(data, user):
    errors = []
    title = None
    country_id = None
    organization_type = None
    country=None
    contact1=None
    contact2=None
    contact3=None
    email=None

    if "country" in data and not data["country"]=="":
        country_id = data["country"]
        if country_id:
            errors, country = authentication_models_validators.validate_country(country_id)
            if errors and not country:
                return errors, None 
            else:
                print("Coutry",country)
        else:
            errors.append("Country ID is required")
    else:
        errors.append("Country ID is required")
        return errors, None

    if "title" in data and not data["title"]==None:
        title = data["title"]
       
        if models.Organizations.objects.filter(country=country,title=title.upper()).exists():
            errors.append(f"Organization with similar name exists in {country}")
            return errors, None
    else:
        errors.append("Title is required")
        return errors,None

    if "organization_type" in data and not data["organization_type"]=="":
        organization_type = data["organization_type"]
    else:
        errors.append("Organization type is required")

    if "email" in data and not data["email"]=="":
        email = data["email"]
    else:
        errors.append("Email address is required")

    if "contact1" in data and not data["contact1"]=="":
        contact1 = data["contact1"]

    if "contact2" in data and not data["contact2"]=="":
        contact2 = data["contact2"]

    if "contact3" in data and not data["contact3"]=="":
        contact3 = data["contact3"]

    if len(errors)>0:
        return errors, None
    else:
        try:
            created = models.Organizations.objects.create(
                country=country, 
                title=title,
                organization_type=organization_type,
                contact1=contact1,
                contact2=contact2,
                contact3=contact3,
                email=email
                )
            return [], created
        except Exception as e:
            errors.append(str(e))
            return errors,None
        

def create_corporate_wallet(data, user):
    account_phone = None
    errors = []
    default_psp=None
    employee = None

    if  PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
            default_psp= PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    else:
        errors.append("No such payment services provider")
    
    
    if not "entity" in data or data["entity"]=="":
        errors.append("Entity ID is required")
       
    else:
        entity =authentication_models_validators.validate_entity(data["entity"])
        if EntityPSPCollectionAccount.objects.filter(entity=entity).exists():
            errors.append("Entity already has a collection account")
            return errors, None

    if entity.administrator:
        if Employees.objects.filter(user=entity.administrator).exists():
            employee = Employees.objects.filter(user=entity.administrator).first()
            account_phone = entity.administrator.phone
        else:
            errors.append(f"Not an employee at {entity}")
            return errors, None
    
        if len(errors)>0:
            return errors, None
        else:
            payload=json.dumps({
                            "currency": "KES",
                            "phoneNumber": account_phone, 
                            "name": entity.title,
                            "description": f"Sales collection accounf for {entity.title} ",
                            "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                            "accountType": "Individual"
                        })

            errors, account =create_white_label_account(payload)

            if account:
                created=EntityPSPCollectionAccount.objects.create(
                    psp=default_psp,
                    administrator= employee,
                    account_number=account["accountNo"],
                    account_name=account["name"],
                    account_phone=account_phone,
                    currency=account["currency"],
                    entity=entity,
                    owner=user
                )
                if created:
                    return [], created
                else:
                    return errors, None 
            else:
                return errors, None
            
    else:
        errors.append("Entity has no administrator")
        return errors, None

def get_entity_employees(data):
    errors =[]
    entity = None
    employees =[]

    if not "entity" in data or data["entity"]=="":
        errors.append("Entity ID is required")
       
    else:
        entity =authentication_models_validators.validate_entity(data["entity"])

        if Employees.objects.filter(entity=entity,is_active="true").exists():
            employees = Employees.objects.filter(entity=entity,is_active="true").all()
       
    return employees

def remove_favorite_entity(data, user):
    try:
        # Admins are not allowed
        if user.is_staff:
            raise Exception("Not authorized")
        entity_id = data["entity"]
        if data["entity"] == "":
            raise exceptions.ValidationError("Entity ID must be valid UUID")
        if Entities.objects.filter(id=entity_id).exists():
            entity = Entities.objects.get(id=entity_id)
            # Check user has favs
            if user.favorite_entities.count() > 0:
                # Check entity is in favs
                if entity in user.favorite_entities.all():
                    # Remove entity from favs and save
                    user.favorite_entities.remove(entity)
                    user.save()

                else:
                    raise Exception("Entity is not in favorites")

            else:
                raise Exception("You have no favorites")

            return entity
        else:
            raise Exception("No such entity exists for given details")

    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def switch_to_entity(data, user):
    errors = []
    entity = None
    entity_id = ("",)
    try:
        # Admins are not allowed
        if user.is_staff:
            errors.append("Not authorized")
        if data["entity"] == "":
            errors.append("Entity ID must be valid UUID")
        else:
            entity_id = data["entity"]

        if not Entities.objects.filter(id=entity_id).exists():
            errors.append("Entity with supplied ID does not exist!")
        else:
            entity = Entities.objects.filter(id=entity_id).first()
            if user.entity==entity:
                errors.append(f"You are already switched to {entity.title.capitalize()}")
                return errors, None
            
            if not entity.owner ==user:
                errors.append("You can only switch into your own entity")
                return errors,None



        if len(errors)>0:
            return errors,None

        if Entities.objects.filter(id=entity_id, owner=user).exists():
            entity = Entities.objects.get(id=entity_id, owner=user)
            # Check if user is already set to entity
            if user.entity == entity:
                errors.append("You are already switched to this entity")

            # Update user entity and save
            user.entity = entity
            user.save()
           


            # Update user employments status to be active only on current entity
            if Employees.objects.filter(user=user).exists():
                employers = Employees.objects.filter(user=user).all()
                for employer in employers:
                    if employer.entity == user.entity:
                        employer.active = True
                        employer.save()
                    else:
                        employer.active = "yes"
                        employer.save()
            else:
                errors.append(
                    f"Switching to {entity} not permitted: neither an employee nor owner"
                )
            return errors,entity

    except Exception as e:
        errors.append(str(e))
        return errors,None


def follow_entity(data, user):
    entity_id = None
    entity = None
    if user.is_staff:
        raise exceptions.ValidationError("Staff users not allowed")
    if not "entity" in data or data["entity"] == "":
        raise exceptions.ValidationError("Entity ID is required")
    else:
        entity_id = data["entity"]
        entity = authentication_models_validators.validate_entity(entity_id)
        # if not entity.entity_type == "RETAIL" or not  not entity.entity_type == "TRANSPORT":
        #     raise exceptions.ValidationError("Only retail entities can be followed")
        if user in entity.followers.all():
            raise exceptions.ValidationError(
                f"You are already following {entity.title}"
            )

        try:
            entity.followers.add(user)
            return entity
        except Exception as e:
            raise exceptions.ValidationError(e)


def add_user_to_entity(data, logged_in_user):
    errors = []
    employee_id = None
    employee = None
    entity_id = None
    entity = None
    roles = []
    employee = None
    user = None
    try:
        entity_id = data["entity"]
        if Entities.objects.filter(id=entity_id, owner=logged_in_user).exists():
            entity = Entities.objects.filter(id=entity_id, owner=logged_in_user).first()
        else:
            errors.append("No entity you own with the given ID exists")
    except KeyError:
        errors.append("Entity ID is required")
    try:
        user_id = data["user"]
        if Users.objects.filter(id=user_id).exists():
            user = Users.objects.filter(id=user_id).first()
            if Employees.objects.filter(user=user).exists():
                employee = Employees.objects.filter(user=user).first()
            else:
                errors.append("Employee with given ID does not exist")
        else:
            errors.append("No user with the given ID exists")
    except KeyError:
        errors.append("User ID is required")
    try:
        roles = []
        roles = data["roles"]
        if len(roles) < 1:
            errors.append("Add one or more roles for this user")
    except KeyError:
        errors.append("Roles for user are required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        # Change user entity
        employee.user.entity = entity
        employee.user.save()

        employee.entity = entity
        employee.save()
        # Add roles
        for role_id in roles:
            if Roles.objects.filter(id=role_id).exists():
                role = Roles.objects.filter(id=role_id).first()
                employee.user.roles.add(role)

        return Profiles.objects.filter(owner=employee.user).first()


def remove_employee_from_entity(data, logged_in_user):
    errors = []
    employee_id = None
    employee = None
    user = None
    user_id = None
    entity_id = None
    entity = None

    employee = None
    default_entity = Entities.objects.filter(entity_type="DEFAULT").first()
    try:
        entity_id = data["entity"]
        if Entities.objects.filter(id=entity_id, owner=logged_in_user).exists():
            entity = Entities.objects.filter(id=entity_id, owner=logged_in_user).first()
        else:
            errors.append("Not authorized")
    except KeyError:
        errors.append("Entity ID is required")
    try:
        user_id = data["user"]

        if Users.objects.filter(id=user_id).exists():
            user = Users.objects.filter(id=user_id).first()
            if Employees.objects.filter(user=user).exists():
                employee = Employees.objects.filter(
                    user=user,
                ).first()
            else:
                errors.append("Employee with given ID does not exist")
        else:
            errors.append("No employee with the given ID exists")
    except KeyError:
        errors.append("User ID is required")
    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        # Change user entity
        employee.user.entity = default_entity
        employee.user.save()

        # Strip roles
        for role in employee.user.roles.all():
            if role.entity == entity:
                employee.user.roles.remove(role)
        return employee.user


# Users
# def get_entity_followers(user):
#     users = []
#     user_favorites = []
#     customers = []
#     users = Users.objects.all()

#     return user.entity.followers.all()


def validate_user_data(data):
    errors = []
    try:
        entity_details = data["entity_details"]

    except KeyError:
        errors.append("Entity details are required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_user(data, user):
    try:
        created = Users.objects.create(title=data["entity_details"]["title"])
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def search_users(data, user):
    # Staff users can search through alll users in the system
  
    return Users.objects.filter(
        Q(first_name__icontains=data["searchQuery"])
        | Q(phone__icontains=data["searchQuery"])
        | Q(last_name__icontains=data["searchQuery"])
    ).distinct()

# def search_users(data, user):
#     # Staff users can search through alll users in the system
#     if user.is_staff:
#         return Users.objects.filter(
#             Q(first_name__icontains=data["searchQuery"])
#             | Q(phone__icontains=data["searchQuery"])
#             | Q(last_name__icontains=data["searchQuery"])
#         ).distinct()
#     else:
#         # Other users can only search through users who follow their current entity
#         if user.entity.followers:
#             return (
#                 user.entity.followers.all()
#                 .filter(
#                     Q(first_name__icontains=data["searchQuery"])
#                     | Q(phone__icontains=data["searchQuery"])
#                     | Q(last_name__icontains=data["searchQuery"])
#                 )
#                 .distinct()
#             )
#         else:
#             return []

def users_pending_verification(user):
    ready_users = []
    if user.is_staff:
        users = Users.objects.all()
        for entity in users:
            if len(entity.documents.all()) > 0 and entity.is_verified == "false":
                ready_users.append(user)

        return ready_users


def entities_pending_verification(user):
    ready_entities = []
    if user.is_staff:
        entities = Entities.objects.all()
        for entity in entities:
            if len(entity.licences.all()) > 0 and entity.is_verified == "false":
                ready_entities.append(entity)

        return ready_entities


def search_entity_followers(data, user):
    print("user id", user.entity)
    print("user favs", user.favorite_entities.all)

    return (
        user.entity.followers.all()
        .filter(
            Q(first_name__icontains=data["searchQuery"])
            | Q(last_name__icontains=data["searchQuery"])
            | Q(phone__icontains=data["searchQuery"]),
        )
        .distinct()
    )


def get_user_profile(data, user):
    try:
        user_id = data["user"]
        if Profiles.objects.filter(owner_id=user_id).exists():
            user = Profiles.objects.get(owner_id=user_id)

            return user

    except KeyError:
        raise exceptions.ValidationError("User ID is required")


# Cadres


def get_cadres():
    return models.Cadres.objects.all()


def get_cadre_details(data, user):
    cadre = None
    try:
        cadre_id = data["cadre_id"]
        if Cadres.objects.filter(id=cadre_id).exists():
            cadre = Cadres.objects.get(id=cadre_id)

            return cadre

    except KeyError:
        raise exceptions.ValidationError("Cadre ID is required")


def validate_dependant_data(data, user):
    errors = []
    try:
        dependant_details = data["dependant_details"]
    except KeyError:
        errors.append("Dependant details are required")
    try:
        first_name = data["dependant_details"]["first_name"]
    except KeyError:
        errors.append("First name is required")
    try:
        gender = data["dependant_details"]["gender"]
    except KeyError:
        errors.append("Gender is required")
    try:
        last_name = data["dependant_details"]["last_name"]
    except KeyError:
        errors.append("Last name is required")
    try:
        relationship = data["dependant_details"]["relationship"]
    except KeyError:
        errors.append("Relationship to main user is required")
    try:
        date_of_birth = data["dependant_details"]["date_of_birth"]
        if date_of_birth and not date_of_birth == "":
            if date_is_past_now(date_of_birth):
                print("Yes")
            else:
                errors.append("Date of birth cannot be a future date")

    except KeyError:
        errors.append("Date of birth is required")
    try:
        user_id = data["dependant_details"]["user"]
        if user_id and not user_id == "":
            user = authentication_models_validators.validate_user(user_id)

    except KeyError:
        errors.append("User ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_dependant(data, user):
    errors=[]
    religion = None
    marital_status=None
    county=None
    sub_county=None
    location=None
    sub_location=None
    village=None
    sub_location_name=None
    village_name=None
    location_name=None
    user_from_id=None
    relationship=None
    identifier_number=None
    identifier_type=None

    if not "user_id" in data["dependant_details"] or data["dependant_details"]["user_id"]=="":
        errors.append("User ID is required")
    else:
        user_from_id=authentication_models_validators.validate_user(data["dependant_details"]["user_id"])

    if not "marital_status" in data["dependant_details"] or data["dependant_details"]["marital_status"]=="":
        errors.append("marital status is required")
    else:
        marital_status=data["dependant_details"]["marital_status"]

    if not "relationship" in data["dependant_details"] or data["dependant_details"]["relationship"]=="":
        errors.append("Relationship to user is required")
    else:
        relationship=data["dependant_details"]["relationship"]

    if "identifier_type" in data["dependant_details"] and data["dependant_details"]["identifier_type"]=="":
        identifier_type=data["dependant_details"]["identifier_type"]

    if "identifier_number" in data["dependant_details"] and data["dependant_details"]["identifier_number"]=="":
        identifier_number=data["dependant_details"]["identifier_number"]
    
    if  "religion" in data["dependant_details"] and not data["dependant_details"]["religion"]=="":
 
        religion = data["dependant_details"]["religion"]

    if not "county" in data["dependant_details"] or data["dependant_details"]["county"]=="":
        errors.append("County ID is required")
    else:
        county = authentication_models_validators.validate_county(data["dependant_details"]['county'])
    
    if  "sub_county" in data["dependant_details"] and not data["dependant_details"]["sub_county"]=="":
        sub_county = authentication_models_validators.validate_sub_county(data["dependant_details"]['sub_county'])

    

    if "location" in data["dependant_details"] and not  data["dependant_details"]["location"]=="":
        location = authentication_models_validators.validate_location(data['location'])

    if "sub_location" in data["dependant_details"] and not  data["sub_location"]=="":
        sub_location = authentication_models_validators.validate_sub_location(data["dependant_details"]['sub_location'])
    
    if "village" in data["dependant_details"] and not  data["dependant_details"]["village"]=="":
        village = authentication_models_validators.validate_village(data["dependant_details"]['village'])

    if "village_name" in data["dependant_details"] and not  data["dependant_details"]["village_name"]=="":
        village_name = data["dependant_details"]['village_name']

    if "location_name" in data["dependant_details"] and not  data["dependant_details"]["location_name"]=="":
        location_name = data["dependant_details"]['location_name']

    if "sub_location_name" in data["dependant_details"] and not  data["dependant_details"]["sub_location_name"]=="":
        sub_location_name = data["dependant_details"]['sub_location_name']

    if len(errors)>0:
        return errors,None
    else:
        try:
            created = models.Dependants.objects.create(
                first_name=data["dependant_details"]["first_name"],
                last_name=data["dependant_details"]["last_name"],
                middle_name=data["dependant_details"]["middle_name"],
                gender=data["dependant_details"]["gender"],
                date_of_birth=data["dependant_details"]["date_of_birth"],
                user=user_from_id,
                owner=user,
                sub_county=sub_county,
                county=county,
                location=location,
                sub_location=sub_location,
                village=village,
                religion=religion,
                marital_status=marital_status,
                village_name=village_name,
                location_name=location_name,
                sub_location_name=sub_location_name,
                relationship=relationship,
                identifier_type=identifier_type,
                identifier_number=identifier_number
            )
            if created:
                return [], created
        except Exception as e:
            errors.append(str(e))
            return errors, None


def get_dependant_details(data, user):
    cadre = None
    try:
        dependant_id = data["dependant_id"]
        if models.Dependants.objects.filter(id=dependant_id).exists():
            dependant = models.Dependants.objects.get(id=dependant_id)

            return dependant

    except KeyError:
        raise exceptions.ValidationError("Cadre ID is required")


def validate_cadre_data(data, user):
    errors = []
    try:
        cadre_details = data["cadre_details"]
    except KeyError:
        errors.append("Cadre details are required")
    try:
        title = data["cadre_details"]["title"]
    except KeyError:
        errors.append("Cadre title is required")

    try:
        cluster_id = data["cadre_details"]["cluster"]
        if Clusters.objects.filter(id=cluster_id).exists():
            pass
        else:
            errors.append("No cluster with the given ID exists")
    except KeyError:
        errors.append("Cluster is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_cadre(data, user):
    cluster_id = data["cadre_details"]["cluster"]
    cluster = Clusters.objects.filter(id=cluster_id).first()
    description = None
    level = user.entity.entity_type
    value = f"{level}_{cluster.value}"
    if "description" in data["cadre_details"]:
        if data["cadre_details"]["description"]:
            description = data["cadre_details"]["description"]

    try:
        created = Cadres.objects.create(
            title=data["cadre_details"]["title"],
            cluster_id=data["cadre_details"]["cluster"],
            description=description,
            owner=user,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def update_cadre(data, user):
    if not user.is_staff:
        raise exceptions.ValidationError("Not authorized")
    cadre = None
    title = None
    description = None
    cluster = None

    try:
        cadre_id = data["cadre_details"]["id"]
        if data["cadre_details"]["id"] == "":
            raise exceptions.ValidationError("Cadre ID must be valid UUID")
        if Cadres.objects.filter(id=cadre_id).exists():
            cadre = Cadres.objects.get(id=cadre_id)

        else:
            raise exceptions.ValidationError("Cadre for supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Cadre ID is required")

    if "title" in data["cadre_details"]:
        if data["cadre_details"]["title"]:
            title = data["cadre_details"]["title"]
    if "cluster" in data["cadre_details"]:
        if data["cadre_details"]["cluster"]:
            cluster = data["cadre_details"]["cluster"]
    if "description" in data["cadre_details"]:
        if data["cadre_details"]["description"]:
            description = data["cadre_details"]["description"]

    try:
        if title:
            cadre.title = title
            cadre.save()
        if title:
            cadre.cluster_id = cluster
            cadre.save()
        if description:
            cadre.description = description
            cadre.save()

        return cadre
    except Exception as e:
        raise exceptions.ValidationError(e)


# Update dependant
@transaction.atomic
def update_dependant(data, user):
    dependant_id = None
    dependant = None
    first_name = None
    middle_name = None
    last_name = None
    gender = None
    relationship = None
    date_of_birth = None
    religion=None
    village_name=None
    sub_location_name=None
    location_name=None

    try:
        dependant_id = data["dependant_details"]["id"]
        if dependant_id == "":
            raise exceptions.ValidationError("Dependant ID must be valid UUID")
        else:
            dependant = authentication_models_validators.validate_dependant(
                dependant_id
            )
            # if not dependant.owner == user or not dependant.user == user:
            #     raise exceptions.ValidationError("Not authorized")
    except KeyError:
        raise exceptions.ValidationError("Dependant ID is required")

    if "first_name" in data["dependant_details"]:
        if data["dependant_details"]["first_name"]:
            first_name = data["dependant_details"]["first_name"]
    if "middle_name" in data["dependant_details"]:
        if data["dependant_details"]["middle_name"]:
            middle_name = data["dependant_details"]["middle_name"]
    if "date_of_birth" in data["dependant_details"]:
        if data["dependant_details"]["date_of_birth"]:
            date_of_birth = data["dependant_details"]["date_of_birth"]
    if "gender" in data["dependant_details"]:
        if data["dependant_details"]["gender"]:
            gender = data["dependant_details"]["gender"]
    if "relationship" in data["dependant_details"]:
        if data["dependant_details"]["relationship"]:
            relationship = data["dependant_details"]["relationship"]
            
    if "religion" in data["dependant_details"]:
        if data["dependant_details"]["religion"]:
            religion = data["dependant_details"]["religion"]
            dependant.religion=religion
            dependant.save()

    if "village_name" in data["dependant_details"]:
        if data["dependant_details"]["village_name"]:
            village_name = data["dependant_details"]["village_name"]
            dependant.village_name=village_name
            dependant.save()

    if "sub_location_name" in data["dependant_details"]:
        if data["dependant_details"]["sub_location_name"]:
            sub_location_name = data["dependant_details"]["sub_location_name"]
            dependant.sub_location_name=sub_location_name
            dependant.save()

    if "location_name" in data["dependant_details"]:
        if data["dependant_details"]["location_name"]:
            location_name = data["dependant_details"]["location_name"]
            dependant.location_name=location_name
            dependant.save()

    if "county" in data["dependant_details"]:
        if data["dependant_details"]["county"]:
            print("CTY",data["dependant_details"]["county"])
            county = authentication_models_validators.validate_county(data["dependant_details"]["county"])
            dependant.county=county
            dependant.save()

    if "sub_county" in data["dependant_details"]:
        if data["dependant_details"]["sub_county"]:
            sub_county = authentication_models_validators.validate_sub_county(data["dependant_details"]["sub_county"])
            dependant.sub_county=sub_county
            dependant.save()

    try:
        if first_name:
            dependant.first_name = first_name
            dependant.save()
        if middle_name:
            dependant.middle_name = middle_name
            dependant.save()
        if last_name:
            dependant.last_name = last_name
            dependant.save()
        if gender:
            dependant.gender = gender
            dependant.save()
        if relationship:
            dependant.relationship = relationship
            dependant.save()
        if date_of_birth:
            dependant.date_of_birth = date_of_birth
            dependant.save()

        return dependant
    except Exception as e:
        raise exceptions.ValidationError(e)


# Departments


def get_entity_departments(data, user):
    entity_id = None
    if "entity" in data:
        entity_id = data["entity"]
    entity = authentication_models_validators.validate_entity(entity_id)
    return models.Departments.objects.filter(entity=entity)


# def validate_department_data(data, user):
#     errors = []

#     try:
#         department_details = data["department_details"]
#     except KeyError:
#         errors.append("Department details are required")
#     try:
#         title = data["department_details"]["title"]
#         if models.Departments.objects.filter(title=title).exists():
#             raise exceptions.ValidationError("Department with same tite already exists")
#     except KeyError:
#         errors.append("Department title is required")

#     if len(errors) > 0:
#         raise exceptions.ValidationError(errors)
#     else:
#         return


def create_department(data, user):
    errors =[]
    description = None
    department_type = None
    title =None
    if "title" in data and not data["title"]=="":
        title = data["title"]
        if models.Departments.objects.filter(title=title.upper(),entity=user.entity).exists():
            errors.append(f"Department with similar title exists at {user.entity}")
            return errors,None
            
    else:
        errors.append("Title is required")
        return errors,None

    if "description" in data and not data["description"]=="":
        description = data["description"]

    if "department_type" in data and not data["department_type"]=="":
        department_type = data["department_type"]

    try:
        created = models.Departments.objects.create(
            title=data["title"],
            description=description,
            owner=user,
            department_type=department_type,
            entity=user.entity,
        )
        if created:
            return [], created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)

def update_department(data,user):
    department_id=None
    department =None
    errors =[]
    if "department" in data and not data["department"]=="":
        department_id=data["department"]
        department = authentication_models_validators.validate_department(department_id,user)

        if department:
            if "description" in data and not data["description"]=="":
                department.description = data["description"]
                department.save()

            if "title" in data and not data["title"]=="":
                department.title = data["title"]
                department.save()

            return department
        else:
            return None


#  Roles


def get_entity_roles(data, user):
    roles = []
    try:
        if Roles.objects.filter(entity=user.entity).exists():
            return Roles.objects.filter(entity=user.entity).all()
        else:
            raise exceptions.ValidationError("No roles exist for your entity")

    except KeyError:
        raise exceptions.ValidationError("Entity ID is required")
    
def get_entity_roles_by_id(data, user):
    
    roles = []
    entity_id = None
    entity=None
    if not "entity" in data or data["entity"]=="":
        raise exceptions.ValidationError("Entity ID is required")
        
    else:
        entity_id = data["entity"]
        entity = authentication_models_validators.validate_entity(entity_id)
    try:
        if Roles.objects.filter(entity_id=entity).exists():
            return Roles.objects.filter(entity=entity).all()
        else:
            raise exceptions.ValidationError("No roles exist for your entity")

    except KeyError:
        raise exceptions.ValidationError("Entity ID is required")

def get_plans(data, user):
    plans = []
    try:
        if Plans.objects.all().count()>0:
            return Plans.objects.all()
        else:
            raise exceptions.ValidationError("No plans in database")

    except KeyError:
        raise exceptions.ValidationError("Entity ID is required")


# def validate_role_data(data, user):
#     errors = []
#     if not user.entity.is_verified:
#         raise exceptions.ValidationError("Entity is not verified")
#     try:
#         role_details = data["role_details"]
#     except KeyError:
#         errors.append("Role details are required")
#     try:
#         title = data["role_details"]["title"]
#     except KeyError:
#         errors.append("Role title is required")

#     try:
#         cluster_id = data["role_details"]["cluster"]
#         if Clusters.objects.filter(id=cluster_id).exists():
#             pass
#         else:
#             errors.append("No cluster with the given ID exists")
#     except KeyError:
#         errors.append("Cluster is required")

#     if len(errors) > 0:
#         raise exceptions.ValidationError(errors)
#     else:
#         return []


def create_entity_role(data, user):
    errors=[]
    entity = None
    cluster_id=None
    cluster=None
    title=None
    level = None

    if not "title" in data["role_details"] or data["role_details"]["title"]== "":
        errors.append("Title is required")
        return errors, None
    
    else:
        title = data["role_details"]["title"]
        if Roles.objects.filter(title=title.upper(),entity=user.entity).exists():
            errors.append(f"Role with similar title already exists for {user.entity}")
            return errors,None


    if not "cluster" in data["role_details"] or data["role_details"]["cluster"]== "":
        errors.append("Cluster ID is required")
        return errors, None
    else:
        cluster_id = data["role_details"]["cluster"]
        if Clusters.objects.filter(id=cluster_id).exists():
            cluster =Clusters.objects.filter(id=cluster_id).first()
        
    level = user.entity.entity_type
    value = f"{level}{cluster.value.capitalize()}"
    if "description" in data["role_details"]:
        description = data["role_details"]["description"]

    try:
        created = Roles.objects.create(
            title=data["role_details"]["title"],
            value=value,
            level=level,
            cluster_id=data["role_details"]["cluster"],
            description=description,
            owner=user,
            entity=user.entity,
        )
        if created:
            return [], created
        else:
            return ["Role not created"], None
    except Exception as e:
        errors.append(str(e))
        return errors, None


@transaction.atomic
def update_role(data, user):
    role = None
    title=""
    description=""
    errors = []

    try:
        role_id = data["role_details"]["id"]
        if data["role_details"]["id"] == "":
            errors.append("Role ID is required")
            return errors, None
        if Roles.objects.filter(id=role_id).exists():
            role = Roles.objects.get(id=role_id)

            if "title" in data["role_details"]:
                title =  data["role_details"]["title"]
                role.title=title
                role.save()
            
            if "description" in data["role_details"]:
                description =  data["role_details"]["description"]
                role.description=description
                role.save()

            return [],role
        
        else:
           errors.append("Role for supplied ID does not exist")
           return errors,None

    except KeyError:
        raise exceptions.ValidationError("Role ID is required")




# @transaction.atomic
# def update_department(data, user):
#     role = None

#     try:
#         department_id = data["department_details"]["id"]
#         if data["department_details"]["id"] == "":
#             raise exceptions.ValidationError("Department ID must be valid UUID")
#         if Departments.objects.filter(id=department_id).exists():
#             role = Departments.objects.get(id=department_id)
#             if user.is_staff:
#                 pass
#             elif user == role.owner:
#                 pass
#             else:
#                 raise exceptions.ValidationError("Not authorized")
#         else:
#             raise exceptions.ValidationError(
#                 "Department for supplied ID does not exist"
#             )

#     except KeyError:
#         raise exceptions.ValidationError("Department ID is required")

#     title = None
#     description = None

#     if "title" in data["department_details"]:
#         if data["department_details"]["title"]:
#             title = data["department_details"]["title"]
#     if "description" in data["department_details"]:
#         if data["department_details"]["description"]:
#             description = data["department_details"]["description"]

#     try:
#         if title:
#             role.title = title
#             role.save()
#         if description:
#             role.description = description
#             role.save()

#         return role
#     except Exception as e:
#         raise exceptions.ValidationError(e)


def get_countries():
    return models.Countries.objects.all()

def get_postal_offices():
    return models.PostalAddresses.objects.all()


def get_country_details(data):
    try:
        country_id = data["country"]
        if models.Countries.objects.filter(id=country_id).exists():
            country = models.Countries.objects.get(id=country_id)

            return country
    except KeyError:
        raise exceptions.ValidationError("Country ID is required")


# Counties
def get_clusters():
    return models.Clusters.objects.all()


def get_cluster_details(data):
    try:
        cluster_id = data["cluster"]
        if models.Clusters.objects.filter(id=cluster_id).exists():
            cluster = models.Clusters.objects.get(id=cluster_id)

            return cluster
    except KeyError:
        raise exceptions.ValidationError("County ID is required")


# Counties
def get_counties():
    return models.Counties.objects.all()

def get_sub_counties(data):
    return models.SubCounties.objects.filter(county_id=data['county'])


def get_county_details(data):
    try:
        county_id = data["county"]
        if models.Counties.objects.filter(id=county_id).exists():
            county = models.Counties.objects.get(id=county_id)

            return county
    except KeyError:
        raise exceptions.ValidationError("County ID is required")


# Contituencies
def get_constituencies():
    return models.Constituencies.objects.all()


def get_constituency_details(data):
    try:
        constituency_id = data["constituency"]
        if models.Constituencies.objects.filter(id=constituency_id).exists():
            county = models.Constituencies.objects.get(id=constituency_id)

            return county
    except KeyError:
        raise exceptions.ValidationError("County ID is required")


def get_county_constituencies(data):
    constituencies = []
    try:
        county_id = data["county"]
        print("cid", county_id)
        if models.Constituencies.objects.filter(county_id=county_id).exists():
            constituencies = models.Constituencies.objects.filter(county_id=county_id)
            return constituencies
    except KeyError:
        raise exceptions.ValidationError("County ID is required")


def get_user_documents(data, user):
    user = None

    try:
        user_id = data["user_id"]
        if models.Users.objects.filter(id=user_id).exists():
            user = models.Users.objects.get(id=user_id)

            if models.UserDocuments.objects.filter(owner=user).exists():
                return models.UserDocuments.objects.filter(owner=user).all()
            else:
                raise exceptions.ValidationError("No documents exist for selected user")
        else:
            raise exceptions.ValidationError("No user exists with the supplied ID")

    except KeyError:
        raise exceptions.ValidationError("User ID is required")
    
def get_entity_documents(data, user):
    user = None

    try:
        entity_id = data["entity_id"]
        if models.Entities.objects.filter(id=entity_id).exists():
            entity = models.Entities.objects.get(id=entity_id)

            if models.EntityDocuments.objects.filter(entity=entity).exists():
                return models.EntityDocuments.objects.filter(entity=entity).all()
            else:
                raise exceptions.ValidationError("No documents exist for selected entity")
        else:
            raise exceptions.ValidationError("No entity exists with the supplied ID")

    except KeyError:
        raise exceptions.ValidationError("Entity ID is required")


@transaction.atomic
def verify_document(data, user):
    if not user.is_staff:
        raise exceptions.ValidationError("Not authorized")
    """Verify user KYC documents and if more than 2 documents are verified then verify the user"""
    document = None

    try:
        document_id = data["document_id"]
        if document_id == "":
            raise exceptions.ValidationError("Document ID must be valid ID")
        if models.UserDocuments.objects.filter(id=document_id).exists():
            document = models.UserDocuments.objects.get(id=document_id)
            if document.is_verified == "true":
                raise exceptions.ValidationError("Document is already verified")
            else:
                document.is_verified = "true"
                document.verified_by = user
                document.save()
                return document
        else:
            raise exceptions.ValidationError("Document for supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Document ID is required")


@transaction.atomic
def verify_user(data, user):
    default_psp= PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    errors = []
    now = datetime.now()
    user_to_verify = None
    if not user.is_staff:
        errors.append("Not authorized")
        return errors, None
        # custom_errors_response(1, "User not verified", ["Staff only action"])
    if not "user" in data or not data["user"]:
        errors.append("User ID is required")
        return errors, None
        # raise exceptions.ValidationError("User ID is required")
    else:
        user_to_verify = authentication_models_validators.validate_user(data["user"])
        # if not user_to_verify.county:
        #     errors.append("User has not updated county details")
        # if not user_to_verify.constituency:
        #     errors.append("User has not updated constituency details")
        if not models.UserDocuments.objects.filter(
            owner=user_to_verify, is_verified="true"
        ).exists():
            errors.append("User has no verified KYC documents")
        if len(errors) > 0:
            raise exceptions.ValidationError(errors)
        else:
            user_document = (
                authentication_models_validators.user_has_verified_kyc_documents(
                    user_to_verify
                )
            )

            if user_document:
                user_to_verify.is_verified="true"
                user_to_verify.iprs_verified="true"
                user_to_verify.save()
                return [], user_to_verify
            #     user_to_verify.is_verified = "true"
            #     user_to_verify.verified_by = user
            #     user_to_verify.verified_at = now.strftime("%YYYY/%MM/%DD %H:%M:%S")
            #     user_to_verify.save()
            #     if JambopayUserProfiles.objects.filter(user=user_to_verify).exists():
            #         return [],user_to_verify
            #     else:
            #         data = {
            #                 "firstName": user_to_verify.first_name,
            #                 "lastName": user_to_verify.last_name,
            #                 "identityNumber": user_to_verify.identifier_number,
            #                 "identityType": user_to_verify.identifier_type,
            #                 "phoneNumber": user_to_verify.phone,
            #                 "gender": user_to_verify.gender,
            #                 "dateOfBirth": user_to_verify.date_of_birth.strftime("%Y-%m-%dT%H:%M:%S%z"),
            #                 "county": user_to_verify.county.title,
            #                 "physicalAddress": user_to_verify.county.title,
            #                 "email": user_to_verify.email,
            #             }

            #         errors, result_json =create_jambopay_profile(data)
            #         if result_json:
                        
            #             created = JambopayUserProfiles.objects.create(user=user_to_verify,psp=default_psp)
            #             return [], user_to_verify
            #         else:
            #             return errors, None

            # else:
            #     errors.append("User has no verified KYC documents")


@transaction.atomic
def delete_document(data, user):
    # if not user.is_staff:
    #     raise exceptions.ValidationError('Not authorized')
    """Delete user KYC document"""
    document = None

    try:
        document_id = data["document_id"]
        if document_id == "":
            raise exceptions.ValidationError("Document ID must be valid ID")
        if models.UserDocuments.objects.filter(id=document_id).exists():
            document = models.UserDocuments.objects.get(id=document_id)
            if document.is_verified == "true":
                raise exceptions.ValidationError("Document is already verified")

            # Only admin or document owner can delete document
            if user.is_staff:
                document.delete()
            elif user == document.owner:
                document.delete()
            else:
                raise exceptions.ValidationError("Not authorized")

            return
        else:
            raise exceptions.ValidationError("Document for supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Document ID is required")


@transaction.atomic
def delete_image(data, user):
    """Delete user image"""
    image = None

    try:
        image_id = data["image_id"]
        if image_id == "":
            raise exceptions.ValidationError("Image ID must be valid ID")
        if models.UserImages.objects.filter(id=image_id).exists():
            image = models.UserImages.objects.get(id=image_id)
            # Only admin or owner can delete image
            if image.owner == user:
                image.delete()
            elif user.is_staff:
                image.delete()

            else:
                raise exceptions.ValidationError("Not authorized")

            return
        else:
            raise exceptions.ValidationError("Image for supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Image ID is required")



def generate_document_number(entity, user,document):
    if not user:
        print("No provided user at doc")
        user = Users.objects.filter(phone="254733217348").first()
        # entity = user.entity
        print("Use admin", user)

    year = None
    year_letter = ""
    count = 1
    month = None
    document_number = ""
    first_month_letter  = ""
    first_document_letter  = ""
    formatted_count = ""
    if document == "CUSTOMERORDER":
        if CustomerOrders.objects.filter(entity=entity).exists():
            count = CustomerOrders.objects.filter(entity=entity).count()
            count = count +1 
    if document == "RETAILERORDER":
        if RetailerOrders.objects.filter(entity=entity).exists():
            count = RetailerOrders.objects.filter(entity=entity).count()
            count = count +1 
    if document == "INVOICE":
        if WholesalerOrders.objects.filter(entity=entity).exists():
            count = WholesalerOrders.objects.filter(entity=entity).count()
            count = count +1 
    if document == "TICKET":
        if Tickets.objects.filter(entity=entity).exists():
            count = Tickets.objects.filter(entity=entity).count()
            count = count +1 
    if document == "DRINKS":
        if BarInventoryOrder.objects.filter(entity=entity).exists():
            count = BarInventoryOrder.objects.filter(entity=entity).count()
            count = count +1 
    if document == "FOOD":
        if BranchFoodOrder.objects.filter(entity=entity).exists():
            count = BranchFoodOrder.objects.filter(entity=entity).count()
            count = count +1 
    if document == "ACCOMMODATION":
        if AccomodationOrder.objects.filter(entity=entity).exists():
            count = AccomodationOrder.objects.filter(entity=entity).count()
            count = count +1 
    # if document == "FARE":
    #     if TicketPayment.objects.filter(entity=entity).exists():
    #         count = TicketPayment.objects.filter(entity=entity).count()
    #         count = count +1 
    if document == "SETTLEMENT":
        if TicketPaymentSettlement.objects.filter(entity=entity).exists():
            count = TicketPaymentSettlement.objects.filter(entity=entity).count()
            count = count +1 
    if document == "CUSTOMER":
        if CustomerOrders.objects.filter(entity=entity).exists():
            count = CustomerOrders.objects.filter(entity=entity).count()
            count = count +1 

    if document == "TRANSFER":
        if TransferBookings.objects.filter(entity=entity).exists():
            count = TransferBookings.objects.filter(entity=entity).count()
            count = count +1 

    if document == "JOURNEY":
        if JourneyBookings.objects.filter(entity=entity).exists():
            count = JourneyBookings.objects.filter(entity=entity).count()
            count = count +1 

    if document == "INDENT":
        if RetailerIndent.objects.filter(entity=entity).exists():
            count = RetailerIndent.objects.filter(entity=entity).count()
            count = count +1 

    time_now = datetime.now()
    year_str = time_now.strftime("%Y")
    if YearLetters.objects.filter(year=year_str).exists():
        year_letter=YearLetters.objects.filter(year=year_str).first()
    first_document_letter= document[0]
    formatted_count = str(count).zfill(8) 
    document_number = entity.entity_code+year_letter.letter+first_document_letter+formatted_count
  
    obj = models.DocumentNumbers.objects.create(
            document_number=document_number, owner=user, entity=entity
        )
    print("Doc Num", obj.document_number)
    return obj

@transaction.atomic
def generate_reference_number(entity, user):
    print("ENTITY AT GEN", entity)
    print("user AT GEN", user)
    if not user:
        print("No provided user")
        user = Users.objects.filter(phone="254733217348").first()
        entity = user.entity
    references_count = 0
    if not entity:
        raise exceptions.ValidationError(
            "Generate referennce number: entity is required"
        )
    obj = None
    prefix = ""
    if entity and len(entity.title) > 3:
        """Create new reference number"""
        # prefix = entity.title[:3]
        prefix = entity.entity_code
        if models.ReferenceNumbers.objects.filter(entity=entity).exists():
            references_count = models.ReferenceNumbers.objects.filter(entity=entity).count()
        print("COUNT", references_count)

        ref = str(references_count + 1).zfill(5)
        my_ref = prefix + ref
        obj = models.ReferenceNumbers.objects.create(
            reference_number=my_ref, owner=user, entity=entity
        )
        return obj.reference_number
    

    # if models.ReferenceNumbers.objects.filter(entity=entity, is_used=False).exists():
    #     """Retrieve existing unused token"""
    #     top_ref = models.ReferenceNumbers.objects.filter(
    #         entity=entity, is_used=False, owner=user
    #     ).first()
    #     return top_ref.reference_number
    # else:
    #     if entity and len(entity.title) > 2:
    #         """Create new reference number"""
    #         prefix = entity.title[:2]
    #         if models.ReferenceNumbers.objects.filter(entity=entity).exists():
    #             references_count = models.ReferenceNumbers.objects.filter(entity=entity).count()

    #         ref = str(references_count + 1).zfill(8)
    #         my_ref = prefix + ref
    #         obj = models.ReferenceNumbers.objects.create(
    #             reference_number=my_ref, owner=user, entity=entity
    #         )
    #         return obj.reference_number



@transaction.atomic
def generate_batch_reference_number(data, user):
    references_count = 0
    reference_numbers = []
    entity = None
    limit = 0
    if not data["entity"]:
        raise exceptions.ValidationError(
            "Generate referennce number: entity is required"
        )

    else:
        entity = authentication_models_validators.validate_entity(data["entity"])
    if not "limit" in data or not data["limit"]:
        raise exceptions.ValidationError("Limit is required")
    else:
        limit = int(data["limit"])

    prefix = ""
    if entity and len(entity.title) > 3:
        for x in range(limit):
            prefix = entity.title[:3]
            
            references_count = models.ReferenceNumbers.objects.all().count()
            ref = str(references_count + 1).zfill(7)
            my_ref = prefix + ref
            obj = models.ReferenceNumbers.objects.create(reference_number=my_ref, owner=user, entity=entity)
            reference_numbers.append({"id": x + 1, "name": obj.reference_number})
        return reference_numbers

    # if models.ReferenceNumbers.objects.filter(
    #     entity=entity, is_used=False, owner=user
    # ).exists():
    #     print("Refs ziko")
    #     refs = models.ReferenceNumbers.objects.filter(
    #         entity=entity, is_used=False, owner=user
    #     ).all()
    #     for index, ref in enumerate(refs):
    #         reference_numbers.append({"id": index + 1, "name": ref.reference_number})
    #     return reference_numbers
    # else:
    #     print("Refs haziko")
    #     if entity and len(entity.title) > 2:
    #         for x in range(limit):
    #             prefix = entity.title[:2]
    #             if models.ReferenceNumbers.objects.filter(entity=entity).exists():
    #                 references_count = models.ReferenceNumbers.objects.filter(entity=entity).count()
    #                 ref = str(references_count + 1).zfill(8)
    #                 my_ref = prefix + ref
    #                 if models.ReferenceNumbers.objects.filter(
    #                     reference_number=my_ref
    #                 ).exists():
    #                     print(f"Ref existing....{my_ref}")
    #                     pass

    #                 else:
    #                     obj = models.ReferenceNumbers.objects.create(
    #                         reference_number=my_ref, owner=user, entity=entity
    #                     )
    #                     reference_numbers.append(
    #                         {"id": x + 1, "name": obj.reference_number}
    #                     )
    #         return reference_numbers


def use_reference_number(reference_number):
    if models.ReferenceNumbers.objects.filter(
        reference_number=reference_number
    ).exists():
        ref = models.ReferenceNumbers.objects.filter(
            reference_number=reference_number
        ).first()
        ref.is_used = True
        ref.save()
    return None



def create_user_account(user):
    errors=[]
    data=json.dumps({
        "currency": "KES",
        "phoneNumber": f"{user.phone}", 
        "name": f"{user.first_name} {user.last_name} WALLET",
        "description": f"Sacco personnel account for {user.first_name} {user.last_name}",
        "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
        "accountType": "Individual"
    })

    errors, account =create_white_label_account(data)
    if account:
        try:
            if PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
                psp=PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()

                user_account = UserAccounts.objects.create(
                    psp=psp,
                    account_number=account["accountNo"],
                    account_name=account["name"],
                    account_phone=user.phone,
                    account_type="WALLET",
                    currency=account["currency"],
                    entity=user.entity,
                    owner=user
                )
                if user_account:
                    print("fdfdfdf",user_account)
                    message = f"Your wallet account number {user_account.account_number} has been created at JAMBOPAY. Your can dial *615*50# on your phone number {user_account.account_phone} to set your pin"
                 
                    payload = {
                            "contact" : user.phone,
                            "message" : message,
                            "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                            "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                        }

                    errors, sent = send_swift_sms(payload)
                    print("AT MESSAGE",errors)
                    print("AT MESSAGE",sent)
                    return [], user
            else:
                print("noooo")
                errors.append("Sacco personnel not created")
                return errors, None
             
        except Exception as e:
            errors.append(str(e))
            return errors, None
       


