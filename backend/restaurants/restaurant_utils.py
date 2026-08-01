from authentication.validators.authentication_models_validators import validate_entity, validate_entity_branch
from authentication.models import EntityBranches
from django.contrib.gis.geos import Point
from employees.validators import employees_models_validators
from intergrations.jambopay.jp_mobile_money_checkout import jambopay_mobile_checkout
from intergrations.jambopay.jambopay_create_whitelabel_account import create_white_label_account
from payments.validators.payments_models_validators import validate_payment_method_exists
from core.date_utils import get_formatted_from_date, get_formatted_to_date
from employees.validators.employees_models_validators import validate_employee, validate_employee_by_id
from products.validators.product_models_validator import validate_product
from . import models
from rest_framework import exceptions
from employees.models import Employees
from . import restaurant_validators
from core.responses import custom_errors_response
from authentication.utils.utils import generate_document_number
from payments.models import BranchCollectionAccount, PaymentMethods, UserAccounts, EntityPSPCollectionAccount
from entitylocations.models import BodaLocations
from django.db import transaction
from authentication.utils.utils import generate_reference_number, use_reference_number
from django.db.models import Q
from django.utils import timezone
import datetime
import json
from decouple import config
from restaurants.restaurant_validators import validate_food_item, validate_bar_inventory,validate_food_order
from authentication.utils.utils import generate_reference_number, use_reference_number
from restaurants.models import BranchFoodOrderPayment, BarInventoryOrderPayment,AccomodationOrderPayments
from core.phone_number_utils import get_telco_by_phone_number
import json
from decouple import config
from intergrations.jambopay.jp_mobile_money_checkout import jambopay_mobile_checkout
from intergrations.jambopay.jambopay_wallet import get_account_by_phone, jambopay_wallet_checkout

from authentication.validators import authentication_models_validators
from utils.logging import create_log
from core.date_utils import get_yesterday,get_today,get_tommorow
from transport.models import BodabodaTrips





def get_assigned_branches(user):
    if Employees.objects.filter(user=user, entity=user.entity).exists():
        employee = Employees.objects.filter(user=user, entity=user.entity).first()
        if employee and len(employee.branches.all()) > 0:
            return employee.assigned_branches.all()
        else:
            return None
    else:
        raise exceptions.ValidationError("Update your employee status in your entity")




def get_branch_menus(data, user):
    branch_id = ""
    menus = []
    employee = validate_employee(user)
    if  not employee.current_branch:
        return exceptions.ValidationError("Employee is not set to a branch")

    if models.Menu.objects.filter(branch=employee.current_branch).exists():
        menus = models.Menu.objects.filter(branch=employee.current_branch).all()
        return menus
    else:
        return None

def get_branch_menu_items(data, user):
    branch_id = ""
    menu_items = []
    if "branch" in data and not data["branch"] == "":
        branch_id = data["branch"]
        branch = validate_entity_branch(branch_id, user)
        if models.MenuItem.objects.filter(branch=branch).exists():
            menu_items = models.MenuItem.objects.filter(branch=branch).all().order_by('title')
            return menu_items
        else:
            return None
    else:
        raise exceptions.ValidationError("Branch ID is required")



def get_branch_drinks(data, user):
    branch_id = ""
    drinks = []
    if "branch" in data and not data["branch"] == "":
        branch_id = data["branch"]
        branch = validate_entity_branch(branch_id, user)
        if models.BarInventory.objects.filter(branch=branch).exists():
            drinks = models.MenuItem.objects.filter(branch=branch).all().order_by('title')
            return drinks
        else:
            return []
    else:
        raise exceptions.ValidationError("Branch ID is required")

def get_payment_methods():
    return PaymentMethods.objects.all()


# Restaurant branches


@transaction.atomic
def make_food_order_payment(data,user):
    errors =[]
    food_order_id=None
    food_order=None
    payment_method_id=None
    food_order=None
    payment_method=None
    mobile_money_phone=None
    reference_number =None
    if not "food_order" in data or data['food_order']==None:
        errors.append("Retailer order ID is required")
        return errors,None
    else:
        food_order_id = data['food_order']
        if models.BranchFoodOrder.objects.filter(id=food_order_id).exists():
            food_order=models.BranchFoodOrder.objects.filter(id=food_order_id).first()
        else:
            errors.append("Food order for provided ID does not exist")
            return errors,None
    
    if food_order:
        if models.BranchFoodOrderItem.objects.filter(branch_food_order=food_order).exists():
            order_items =  models.BranchFoodOrderItem.objects.filter(branch_food_order=food_order).all()
    
    if not "payment_method" in data or data['payment_method']==None:
        errors.append("Payment method ID is required")
        return errors,None
    else:
        payment_method_id=data['payment_method']


    if "mobile_money_phone" in data and not data['mobile_money_phone']==None:
        mobile_money_phone=data['mobile_money_phone']

        

    if models.BranchFoodOrderPayment.objects.filter(branch_food_order=food_order,status="SUCCESS").exists():
        errors.append("Order is already paid")
        return errors,None

    if PaymentMethods.objects.filter(id=payment_method_id).exists():
        payment_method=PaymentMethods.objects.filter(id=payment_method_id).first()
    else:
        errors.append("Payment method with provided ID does not exist!")
        return errors,None

    reference_number=generate_reference_number(food_order.branch.entity,user)
    errors, food_order = process_food_order_payment(food_order, payment_method, user, mobile_money_phone, reference_number)
    if food_order:

        return [],food_order
    else:
       
        return errors,None

    # created = RetailerOrderPayments.objects.create()

def get_bodaboda_deliveries(data, user):
    bodaboda=None
    bodaboda_assigned_orders=[]
    tommorow = get_tommorow()
    today = get_today()
    if BodaLocations.objects.filter(owner=user).exists():
        bodaboda = BodaLocations.objects.filter(owner=user).first()

    if models.BranchFoodOrder.objects.filter(bodaboda=bodaboda,created__lt=tommorow,created__gte=today,status="ASSIGNED").exists():
        bodaboda_assigned_orders = models.BranchFoodOrder.objects.filter(bodaboda=bodaboda,created__lt=tommorow,created__gte=today,status="ASSIGNED").all()
     
    return bodaboda_assigned_orders  

def create_restaurant_branch(data,user):
    errors=[]
    title = ""
    sub_county_id=""
    county_id=""
    town=""
    building=""
    road=""
    description=""
    default_psp=None

    # if  PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
    #         default_psp= PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    # else:
    #     errors.append("No such payment services provider")
             
    if not "title" in data["branch_details"] or data["branch_details"]["title"]=="":
        errors.append("Title is required")
    else:
        title=data["branch_details"]["title"]
    
    if not "county" in data["branch_details"] or data["branch_details"]["county"]=="":
        errors.append("County ID is required")
    else:
        county_id= data["branch_details"]["county"]
    
    # if "sub_county" in data["branch_details"]:
    #     sub_county_id = data["branch_details"]["sub_county"]


    if "town" in data["branch_details"]:
        town = data["branch_details"]["town"]

    if "building" in data["branch_details"]:
        building = data["branch_details"]["building"]

    if "road" in data["branch_details"]:
        road = data["branch_details"]["road"]

    if "description" in data["branch_details"]:
        description = data["branch_details"]["description"]

    if EntityBranches.objects.filter(title=title.upper(),entity=user.entity).exists():
        errors.append(f"Similarly titled branch exists for {user.entity}")

    if len(errors)>0:
        return errors, None
    
    try:
        created = EntityBranches.objects.create(
            entity=user.entity,
            owner=user,
            county_id=county_id,
            title=title,
            description=description,
            town=town,
            road=road,
            building=building,
        )
        if created:
            return [], created
            # Create collecton account
            # data=data=json.dumps({
            #             "currency": "KES",
            #             "phoneNumber": user.phone, 
            #             "name": title,
            #             "description": f"Sales collection accounf for {title} branch",
            #             "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
            #             "accountType": "Individual"
            #         })

            # errors, account =create_white_label_account(data)

            # if account:
            #     BranchCollectionAccount.objects.create(
            #         branch=created,
            #         psp=default_psp,
            #         account_number=account["accountNo"],
            #         account_name=account["name"],
            #         currency=account["currency"],
            #         entity=user.entity,
            #         owner=user
            #     )
            #     return [],created
            # else:
            #     created.delete()
            #     errors.append("Collection account could not be created")
            #     return errors, None
            
    except Exception as e:
        print("Error", e)
        errors.append("An error occurred while creating branch")
        return errors, None
    
def update_restaurant_branch(data,user):
    errors =[]
    branch =None
    sub_county_id=""
 
    if not "branch" in data["branch_details"] or data["branch_details"]["branch"]=="":
        errors.append("Branch ID is required")
        return errors, None
    else:
        branch = restaurant_validators.validate_branch(data["branch_details"]["branch"],user)
    
    if  "county" in data["branch_details"]:
    
        branch.county_id= data["branch_details"]["county"]
        branch.save()


    if  "title" in data["branch_details"] :  
        branch.title= data["branch_details"]["title"]
        branch.save()
    
    # if "sub_county" in data["branch_details"]:
    #     sub_county_id = data["branch_details"]["sub_county"]
    #     branch.sub_county_id=sub_county_id
    #     branch.save()


    if "town" in data["branch_details"]:
        branch.town = data["branch_details"]["town"]
        branch.save()

    if "building" in data["branch_details"]:
        branch.building = data["branch_details"]["building"]
        branch.save()

    if "road" in data["branch_details"]:
        branch.road = data["branch_details"]["road"]
        branch.save()


    if "description" in data["branch_details"]:
        branch.description = data["branch_details"]["description"]
        branch.save()

    return [],branch

def get_restaurants_branches(user):
    if models.EntityBranches.objects.filter(entity=user.entity).exists():
        return models.EntityBranches.objects.filter( entity=user.entity).all()
  
    else:
        return []
    

    # Branch menus

# Branch menus

def create_branch_menu(data,user):
    errors=[]
    title = ""
    served_on=""
    served_from=""
    served_to=""
    description=""
    if not "title" in data["menu_details"] or data["menu_details"]["title"]=="":
        errors.append("Title is required")
    else:
        title=data["menu_details"]["title"]
    employee= employees_models_validators.validate_employee(user)
    if not employee.current_branch:
        errors.append(f"{user.first_name} is not set to a branch")
        return errors, None
    
    
    if "served_on" in data["menu_details"]:
        served_on = data["menu_details"]["served_on"]


    if "served_from" in data["menu_details"]:
        served_from = data["menu_details"]["served_from"]

    if "served_to" in data["menu_details"]:
        served_to = data["menu_details"]["served_to"]


    if "description" in data["menu_details"]:
        description = data["menu_details"]["description"]
    if models.Menu.objects.filter(title=title.upper(),entity=user.entity).exists():
        errors.append(f"Menu with similar title exists at {user.entity}")

    if len(errors)>0:
        return errors, None
    
    try:
        created = models.Menu.objects.create(
            entity=user.entity,
            owner=user,
            branch=employee.current_branch,
            served_on=served_on,
            title=title,
            description=description,
            served_from=served_from,
            served_to=served_to,
          
        )
        if created:
            return [],created
    except Exception as e:
        errors.append(e)
        return errors, None
    
def update_branch_menu(data,user):
    errors=[]
    title = ""
    menu=None
    served_on=""
    served_from=""
    served_to=""
    description=""
    if not "menu" in data["menu_details"] or data["menu_details"]["menu"]=="":
        errors.append("Menu ID is required")
    else:
        menu = restaurant_validators.validate_menu(data["menu_details"]["menu"])
    
    if "served_on" in data["menu_details"]:
        menu.served_on = data["menu_details"]["served_on"]
        menu.save()


    if "served_from" in data["menu_details"]:
        menu.served_from = data["menu_details"]["served_from"]
        menu.save()

    if "served_to" in data["menu_details"]:
        menu.served_to = data["menu_details"]["served_to"]
        menu.save()


    if "description" in data["menu_details"]:
        menu.description = data["menu_details"]["description"]
        menu.save()
    return [],menu
    
def get_user_branch_menus(user):
    errors=[]
    menus =[]
    employee=None
    employee=validate_employee(user)
    if models.Menu.objects.filter(entity=user.entity, branch =employee.current_branch).exists():
        menus=models.Menu.objects.filter( entity=user.entity,branch =employee.current_branch).all()
  
    return [], menus
    

    # //Menu items

# Branch menu items

def create_branch_menu_item(data,user):
    errors=[]
    title = ""
    menu=None
    branch=None
    price=0.00
    description=""
    employee = None

    employee =validate_employee(user)
    if not employee.current_branch:
        errors.append("Employee is not set to a branch")
        return errors, None

    if not "title" in data["menu_item_details"] or data["menu_item_details"]["title"]=="":
        errors.append("Title is required")
    else:
        title=data["menu_item_details"]["title"]
    
    if not "menu" in data["menu_item_details"] or data["menu_item_details"]["menu"]=="":
        errors.append("Menu ID is required")
    else:
        menu= restaurant_validators.validate_menu(data["menu_item_details"]["menu"])

    
    if "price" in data["menu_item_details"]:
        price = float(data["menu_item_details"]["price"])
        if price<=0.00:
            errors.append("Price cannot be zero and below")

    if "description" in data["menu_item_details"]:
        description = data["menu_item_details"]["description"]
    if models.MenuItem.objects.filter(title=title.upper(),branch=branch).exists():
        errors.append(f"Menu item with similar title exists at {branch}")

    if len(errors)>0:
        return errors, None
    
    
    try:
        created = models.MenuItem.objects.create(
            branch=employee.current_branch,
            entity=user.entity,
            owner=user,
            menu=menu,
            price=price,
            title=title,
            description=description,
            
          
        )
        if created:
            return [],created
    except Exception as e:
        errors.append(e)
        return errors, None
    
def update_branch_menu_item(data,user):
    errors=[]
    title = ""
    menu_item=None
    price=0.00
    description=""
    if not "menu_item" in data["menu_item_details"] or data["menu_item_details"]["menu_item"]=="":
        errors.append("Menu item ID is required")
    else:
        menu_item = restaurant_validators.validate_menu_item(data["menu_item_details"]["menu_item"])
    
    if "title" in data["menu_item_details"]:
        menu_item.title = data["menu_item_details"]["title"]
        menu_item.save()


    if "price" in data["menu_item_details"]:
        menu_item.price = float(data["menu_item_details"]["price"])
        menu_item.save()


    if "description" in data["menu_item_details"]:
        menu_item.description = data["menu_item_details"]["description"]
        menu_item.save()
    return [],menu_item
    
def get_user_branch_menu_items(user):
    employee =validate_employee(user)
    if models.MenuItem.objects.filter(entity=user.entity, branch=employee.current_branch).exists():
        return models.MenuItem.objects.filter( entity=user.entity,branch=employee.current_branch).all()
  
    else:
        return []
    
# Branch food items

def create_branch_food_item(data,user):
    errors=[]
    title = ""
    menu_item=None
    branch=None
    price=0.00
    description=""
    employee=None
    preparation_date=""
    expiry_date=""
    quantity = None

    if not "quantity" in data["food_item_details"] or data["food_item_details"]["quantity"]=="":
        errors.append("Quantity is required")
    else:
        quantity=int(data["food_item_details"]["quantity"])
    
    if not "menu_item" in data["food_item_details"] or data["food_item_details"]["menu_item"]=="":
        errors.append("Menu item ID is required")
    else:
        menu_item= restaurant_validators.validate_menu_item(data["food_item_details"]["menu_item"])

    
    if not "price" in data["food_item_details"] or data["food_item_details"]=="":
        errors.append("Price is required")
        return errors, None
    else:
        price = float(data["food_item_details"]["price"])
        if price<1:
            errors.append("Price cannot be zero and below")
            return errors, None

    if "preparation_date" in data["food_item_details"]:
        preparation_date = data["food_item_details"]["preparation_date"]

    if "expiry_date" in data["food_item_details"]:
        expiry_date = data["food_item_details"]["expiry_date"]
        
    employee = validate_employee(user)
    if  not employee.current_branch:
        return exceptions.ValidationError("Employee is not set to a branch")
    
    hour_ago = datetime.datetime.now() - datetime.timedelta(minutes=60)
    if models.BranchFoodItem.objects.filter(
                branch=employee.current_branch,
                menu_item=menu_item,
                quantity=quantity,
                owner=user,
                created__gte=hour_ago,
            ).exists():
                errors.append("Similar item has just been added a while ago")


    if len(errors)>0:
        return errors, None
    
    
    try:
        created = models.BranchFoodItem.objects.create(
            branch=employee.current_branch,
            entity=user.entity,
            owner=user,
            menu_item=menu_item,
            price=price,
            quantity=quantity,
            preparation_date=preparation_date,
            expiry_date=expiry_date,
            
        )
        if created:
            return [],created
    except Exception as e:
        errors.append(str(e))
        return errors, None
    
def update_branch_food_item(data):
    errors=[]
    quantity = ""
    food_item=None
    price=0.00
    if not "food_item" in data["food_item_details"] or data["food_item_details"]["food_item"]=="":
        errors.append("Menu item ID is required")
    else:
        food_item = restaurant_validators.validate_food_item(data["food_item_details"]["food_item"])
    
    if "quantity" in data["food_item_details"]:
        food_item.quantity = int(data["food_item_details"]["quantity"])
        food_item.save()


    if "price" in data["food_item_details"]:
        food_item.price = float(data["food_item_details"]["price"])
        food_item.save()


    if "preparation_date" in data["food_item_details"]:
        food_item.preparation_date = data["food_item_details"]["preparation_date"]
        food_item.save()


    if "expiry_date" in data["food_item_details"]:
        food_item.expiry_date = data["food_item_details"]["expiry_date"]
        food_item.save()

    return [],food_item




def update_branch_food_order(data,user):
    errors=[]
    food_order_id = None
    food_order = None
    bodaboda = None
    if not "food_order" in data or data["food_order"]=="":
        errors.append("Food order ID is required")
        return errors, None
    else:
        food_order_id = data["food_order"]
        food_order = validate_food_order(food_order_id)


    if food_order.status =="COMPLETED":
        errors.append("Order is already completed and closed")
        return errors, None
    
    if food_order.status =="CANCELLED":
        errors.append("Order is already cancelled and closed")
        return errors, None
    
    
    if "status" in data and not data["status"]=="":
        food_order.status= data["status"]
        food_order.save()

    if "bodaboda" in data and not data["bodaboda"]=="":
        if not models.BranchFoodOrderPayment.objects.filter(branch_food_order=food_order,status="SUCCESS").exists():
            errors.append("Order has not been paid for")
            return errors, None
        if not food_order.delivery_method=="DELIVERY":
            errors.append("Order not marked for deleivery")
            return errors, None
        if not food_order.shipping_cost>0:
            errors.append("Order has no shipping funds allocated")
            return errors, None
        
        if BodaLocations.objects.filter(id=data["bodaboda"]).exists():
            bodaboda= BodaLocations.objects.filter(id=data["bodaboda"]).first()

            if BodabodaTrips.objects.filter(food_order=food_order,is_cancelled="false").exists():
                boda_trip = BodabodaTrips.objects.filter(food_order=food_order,is_cancelled="false").first()

                errors.append("Active Bodaboda trip for this order already exists")
                return errors, None
            else:
                   
                try:
                    boda_trip = BodabodaTrips.objects.create(   
                        entity=user.entity,
                        owner=user,
                        boda=bodaboda.boda,
                        food_order=food_order,
                        fare=food_order.shipping_cost,
                        status="REQUESTED",
                        origin_point=food_order.destination_point,
                        destination_point=food_order.origin_point,
                        
                    )
                    boda_trip.save()
                    if boda_trip:
                        food_order.bodaboda = bodaboda
                        food_order.save()
                        return [], food_order
                except Exception as e:
                    errors.append(f"An error occurred while creating boda trip: {str(e)}")
                    return errors, None
                
        else:
            errors.append("Bodaboda with provided ID does not exist")
            return errors, None
            





    
def get_user_branch_food_items(user):
    employee =validate_employee(user)
    if models.BranchFoodItem.objects.filter(entity=user.entity, branch=employee.current_branch).exists():
        return models.BranchFoodItem.objects.filter( entity=user.entity,branch=employee.current_branch).all()
  
    else:
        return []
    
def get_branch_food_items(data,user):
    branch =validate_entity_branch(data["entity_branch"])
    if models.BranchFoodItem.objects.filter(entity=user.entity, branch=employee.current_branch).exists():
        return models.BranchFoodItem.objects.filter( entity=user.entity,branch=employee.current_branch).all()
  
    else:
        return []
    


# Branch Tables 

def create_branch_table(data,user):
    errors=[]
    title = ""
    branch=None
    seats=0
    attendant=None
    description=""

    if not "title" in data["table_details"] or data["table_details"]["title"]=="":
        errors.append("Title is required")
    else:
        title=data["table_details"]["title"]
    
    employee = employees_models_validators.validate_employee(user)
    # if not "attendant" in data["table_details"] or data["table_details"]["attendant"]=="":
    #     errors.append("Employee ID is required")
    # else:
    #     attendant=validate_employee_by_id(data["table_details"]["attendant"],user)


    
    if "seats" in data["table_details"]:
        seats = int(data["table_details"]["seats"])
        if seats<=0:
            errors.append("Number of seats cannot be zero and below")

    if "description" in data["table_details"]:
        description = data["table_details"]["description"]

    # if "attendant" in data["table_details"] and not "attendant" in data["table_details"]=="":
    #         attendant=validate_employee_by_id(data["table_details"]["attendant"],user)


    if models.BranchTable.objects.filter(title=title.upper(),branch=branch).exists():
        errors.append(f"Table with similar title exists at {branch}")
    else:
        pass

    if len(errors)>0:
        return errors, None
    
    
    try:
        created = models.BranchTable.objects.create(
            entity=user.entity,
            owner=user,
            branch=employee.current_branch,
            attendant=employee,
            seats=seats,
            title=title,
            description=description, 
     
        )
        if created:
            return [],created
    except Exception as e:
        print("ww",e)
        errors.append(str(e))
        return errors, None 

def update_branch_table(data,user):
    errors=[]

    branch_table=None
    employee=None

    if not "branch_table" in data["table_details"] or data["table_details"]["branch_table"]=="":
        errors.append("Table ID is required")
    else:
        branch_table = restaurant_validators.validate_branch_table(data["table_details"]["branch_table"])
    
    if "title" in data["table_details"]:
        branch_table.title = data["table_details"]["title"]
        branch_table.save()

    if "employee" in data["table_details"] and not  data["table_details"]["employee"]=="":
        employee= validate_employee_by_id(data["table_details"]["employee"],user)
        branch_table.employee = employee
        branch_table.save()


    if "seats" in data["table_details"]:
        branch_table.seats = int(data["table_details"]["seats"])
        branch_table.save()


    if "description" in data["table_details"]:
        branch_table.description = data["table_details"]["description"]
        branch_table.save()
    
    
    return [],branch_table
    
def get_user_branch_tables(user):
    employee = validate_employee(user)
    if  not employee.current_branch:
        return exceptions.ValidationError("Employee is not set to a branch")
    if models.BranchTable.objects.filter(entity=user.entity, branch=employee.current_branch).exists():
        return models.BranchTable.objects.filter( entity=user.entity,branch=employee.current_branch).all()
  
    else:
        return []

# Branch Room 

def create_branch_room(data,user):
    errors=[]
    title = ""
    branch=None
    price=0.00
    attendant=None
    description="",
    free_wifi="true",
    free_parking="false",
    free_cancellation="true",
    is_available="true",
    occupancy=1,

    employee = validate_employee(user)
    if  not employee.current_branch:
        return exceptions.ValidationError("Employee is not set to a branch")
    if not employee.current_branch:
        errors.append("You are not set to an entity branch")
        return errors, None

    if not "title" in data["room_details"] or data["room_details"]["title"]=="":
        errors.append("Title is required")
    else:
        title=data["room_details"]["title"]
    
    if not "attendant" in data["room_details"] or data["room_details"]["attendant"]=="":
        errors.append("Employee ID is required")
    else:
        attendant=validate_employee_by_id(data["room_details"]["attendant"],user)


    if "price" in data["room_details"]:
        seats = int(data["room_details"]["seats"])
        if seats<=0:
            errors.append("Number of seats cannot be zero and below")
    if "description" in data["room_details"]:
        description = data["room_details"]["description"]

    if "occupancy" in data["room_details"]:
        occupancy = int(data["room_details"]["occupancy"])

    if "is_available" in data["room_details"]:
        is_available = data["room_details"]["is_available"]

    if "free_wifi" in data["room_details"]:
        free_wifi = data["room_details"]["free_wifi"]


    if "free_parking" in data["room_details"]:
        free_parking = data["room_details"]["free_parking"]


    if "free_cancellation" in data["room_details"]:
        free_cancellation = data["room_details"]["free_cancellation"]




    if models.BranchRoom.objects.filter(title=title.upper(),branch=branch).exists():
        errors.append(f"Room with similar title exists at {branch}")
    else:
        pass

    if len(errors)>0:
        return errors, None
    
    
    try:
        created = models.BranchRoom.objects.create(
            entity=user.entity,
            owner=user,
            branch=employee.current_branch,
            attendant=attendant,
            price=price,
            is_available=is_available,
            free_cancellation=free_cancellation,
            free_parking=free_parking,
            free_wifi=free_wifi,
            description=description,
            occupancy=occupancy 
     
        )
        if created:
            return [],created
    except Exception as e:
        errors.append(str(e))
        return errors, None 

def update_branch_room(data,user):
    errors=[]

    room=None
    employee=None

    if not "room" in data["room_details"] or data["room_details"]["id"]=="":
        errors.append("Table ID is required")
    else:
        room = restaurant_validators.validate_room(data["room_details"]["id"])
    
    if "title" in data["table_details"]:
        room.title = data["room_details"]["title"]
        room.save()

    if "attendant" in data["room_details"] and not  data["room_details"]["attendant"]=="":
        attendant= validate_employee_by_id(data["room_details"]["attendant"],user)
        room.attendant = attendant
        room.save()


    if "price" in data["room_details"]:
        room.price = float(data["room_details"]["price"])
        room.save()


    if "description" in data["room_details"]:
        room.description = data["room_details"]["description"]
        room.save()

    if "free_parking" in data["room_details"]:
        room.free_parking = data["room_details"]["free_parking"]
        room.save()

    if "free_cancellation" in data["room_details"]:
        room.free_cancellation = data["room_details"]["free_cancellation"]
        room.save()

    if "free_wifi" in data["room_details"]:
        room.free_wifi = data["room_details"]["free_wifi"]
        room.save()
    
    
    return [],room
    
def get_user_branch_rooms(user):
    employee = validate_employee(user)
    if  not employee.current_branch:
        return exceptions.ValidationError("Employee is not set to a branch")
    if models.BranchRoom.objects.filter(entity=user.entity, branch=employee.current_branch).exists():
        return models.BranchRoom.objects.filter( entity=user.entity,branch=employee.current_branch).all()
  
    else:
        return []

# Branch Drinks
    
def create_bar_inventory(data,user):
    errors=[]

    # branch=None
    product=None
    source_id=""
    batch=""
    bar_code=""
    manufacture_date=None
    expiry_date=None
    supplier=None
    pack_quantity=0
    pack_buying_price=0.00
    pack_selling_price=0.00
    
    # if not "branch" in data["inventory_details"] or data["inventory_details"]["branch"]=="":
    #     errors.append("Branch ID is required")
    # else:
    #     branch=validate_entity_branch(data["inventory_details"]["branch"])
    employee = validate_employee(user)
    if  not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    if not "product" in data["inventory_details"] or data["inventory_details"]["product"]=="":
        errors.append("Product ID is required")
    else:
        product=validate_product(data["inventory_details"]["product"])
        print('product',product)
    
    if not "pack_quantity" in data["inventory_details"] or data["inventory_details"]["pack_quantity"]=="":
        errors.append("Pack quantity is required")
    else:
        pack_quantity = int(data["inventory_details"]["pack_quantity"])
        if pack_quantity<=0:
            errors.append("Received quantity cannot be zero or less")

    if "supplier" in data["inventory_details"] and not data["inventory_details"]["supplier"]=="":
        source_id =data["inventory_details"]["supplier"]
        if not source_id=="":
            supplier = validate_entity(source_id)
        else:
            pass

    if "pack_buying_price" in data["inventory_details"]:
        pack_buying_price = float(data["inventory_details"]["pack_buying_price"])
        if pack_buying_price<=0.00:
            errors.append("Pack buying price cannot be zero or less")

    if "pack_selling_price" in data["inventory_details"]:
        pack_selling_price = float(data["inventory_details"]["pack_selling_price"])
        if pack_selling_price<=0.00:
            errors.append("Pack selling price cannot be zero or less")

    if "batch" in data["inventory_details"]:
        batch = data["inventory_details"]["batch"]

    if "bar_code" in data["inventory_details"]:
        bar_code = data["inventory_details"]["bar_code"]

    if "manufacture_date" in data["inventory_details"]:
        manufacture_date = data["inventory_details"]["manufacture_date"]
    if "expiry_date" in data["inventory_details"]:
        expiry_date = data["inventory_details"]["expiry_date"]
    hour_ago = datetime.datetime.now() - datetime.timedelta(minutes=60)
    if models.BarInventory.objects.filter(
                branch=employee.current_branch,
                product=product,
                pack_quantity=pack_quantity,
                owner=user,
                created__gte=hour_ago,
            ).exists():
                errors.append("Similar transaction happened within last hour")

    if len(errors)>0:
        return errors, None
    
    try:
        created = models.BarInventory.objects.create(
            entity=user.entity,
            owner=user,
            branch=employee.current_branch,
            product=product,
            supplier=supplier,
            pack_quantity=pack_quantity,
            pack_buying_price=pack_buying_price,
            pack_selling_price=pack_selling_price,
            batch=batch,
            bar_code=bar_code,
            manufacture_date=manufacture_date,
            expiry_date=expiry_date    
          
        )
        if created:
            return [],created
        else:
            print("Not created")
    except Exception as e:
        print("Create drink error: ",str(e))
        errors.append(f"Error while creating branch : {str(e)}")
        return errors, None
    
def update_bar_inventory(data,user):
    errors=[]
    drink=None
    unit_buying_price=0.00
    unit_selling_price=0.00
    if not "id" in data["inventory_details"] or data["inventory_details"]["id"]=="":
        errors.append("Drink ID is required")
    else:
        bar_inventory = restaurant_validators.validate_bar_inventory(data["inventory_details"]["id"])
    
    if "pack_buying_price" in data["inventory_details"]:
        bar_inventory.pack_buying_price = float(data["inventory_details"]["pack_buying_price"])
        bar_inventory.unit_buying_price = float(float(data["inventory_details"]["pack_buying_price"])/float(bar_inventory.product.units_per_pack))
        bar_inventory.save()

    if "pack_selling_price" in data["inventory_details"]:
        bar_inventory.pack_selling_price = float(data["inventory_details"]["pack_selling_price"])
        bar_inventory.unit_selling_price = float(float(data["inventory_details"]["pack_selling_price"])/float(bar_inventory.product.units_per_pack))
        bar_inventory.save()

    if "pack_quantity" in data["inventory_details"]:
        bar_inventory.pack_quantity = float(data["inventory_details"]["pack_quantity"])
        bar_inventory.save()
    if "manufacture_date" in data["inventory_details"]:
        bar_inventory.manufacture_date = data["inventory_details"]["manufacture_date"]
        bar_inventory.save()
    if "expiry_date" in data["inventory_details"]:
        bar_inventory.expiry_date = data["inventory_details"]["expiry_date"]
        bar_inventory.save()
    if "bar_code" in data["inventory_details"]:
        bar_inventory.bar_code = data["inventory_details"]["bar_code"]
        bar_inventory.save()
    if "batch" in data["inventory_details"]:
        bar_inventory.batch = data["inventory_details"]["batch"]
        bar_inventory.save()


    if "supplier" in data["inventory_details"]:
        supplier_obj = validate_entity(data["inventory_details"]["supplier"])
        if supplier_obj:
            bar_inventory.supplier= supplier_obj
            bar_inventory.save()

    return [],bar_inventory
     
def get_branch_bar_inventory(user):
    errors=[]
    drinks = []
    employee=None
    employee = validate_employee(user)
    if  not employee.current_branch:
        errors.append("Employee is not set to a branch")
        return errors, None

    if models.BarInventory.objects.filter(entity=user.entity,branch=employee.current_branch,pack_quantity__gte=1).exists():
        drinks =models.BarInventory.objects.filter(entity=user.entity,branch=employee.current_branch,pack_quantity__gt=1).all()
  
    return [], drinks



def process_food_order_payment(branch_food_order, payment_method,user,mobile_money_phone,reference_number):
   
    errors = []

    if not branch_food_order.branch.administrator:
        errors.append("This business is not set up to receive remote paymenst")
        return errors, None
    
    if payment_method.title=="CASH":
        # cash_document_number=generate_document_number(vehicle.entity, user, "FARE")    
   
        # Cash payments
        food_order_payment = BranchFoodOrderPayment.objects.create(
            payment_method=payment_method,
            reference_number=reference_number,
            status="SUCCESS",
            amount=branch_food_order.order_items_cost+ branch_food_order.shipping_cost,
            entity=user.entity,
            currency="KES",
            owner=user,
            branch_food_order = branch_food_order,
        )
        if food_order_payment:
            order_items =  models.BranchFoodOrderItem.objects.filter(branch_food_order=branch_food_order).all()
            for item in order_items:
                    print("aAdjust by",item.quantity)
                    item.branch_food_item.quantity=item.branch_food_item.quantity - int(item.quantity)
                    item.branch_food_item.save()
                    print("aAdjusted item",item.branch_food_item)
                    print("aAdjusted item qty",item.branch_food_item.quantity)

            return [], branch_food_order
        else:
            errors.append("Error while creating food order payment")
            return errors, None

    elif payment_method.title=="MOBILE MONEY":
        administrator_account=None
        # if not EntityPSPCollectionAccount.objects.filter(entity = branch_food_order.entity).exists():
        #     errors.append("Entity has no collection account")
        #     return errors, None
        # else:
        #     entity_collection_account =  EntityPSPCollectionAccount.objects.filter(entity = branch_food_order.entity).first()
        if not UserAccounts.objects.filter(owner = branch_food_order.branch.administrator).exists():
            errors.append("Branch admin has no collection account")
            return errors, None
        else:
            administrator_account =  UserAccounts.objects.filter(owner = branch_food_order.branch.administrator).first()
            print("entity_collection_account",administrator_account)
      
        payload = None
        telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
        create_log("info",f"At food order payment : telco={telco} phone: {formatted_phone_number}")
        
   
        print("BFO", branch_food_order.entity)
        print("FPHOME", formatted_phone_number)

        print("Mobile Money",reference_number)

        if telco=="MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(branch_food_order.order_items_cost+ branch_food_order.shipping_cost),
                "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                "accountTo": administrator_account.account_number,
                "description": "Merchant payment",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP"
                }
                })
        elif telco=="AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(branch_food_order.order_items_cost+ branch_food_order.shipping_cost),
                "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                "accountTo":administrator_account.account_number, 
                "currency":"KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP" 
                }
                })
        create_log("info",f"Payload at payment: {payload}", )
        errors, result_json = jambopay_mobile_checkout(payload)
        print("Ikoooo result_json", result_json)
        print("Ikoooo errors", errors)
        if result_json:
            print("Ikoooo rs", result_json)
            food_order_payment = BranchFoodOrderPayment.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="PENDING",
                amount=float(result_json["orderAmount"]),
                entity=user.entity,
                currency="KES",
                owner=user,
                branch_food_order = branch_food_order,
                psp_reference_number= result_json["ref"],
             
            )
            use_reference_number(reference_number)

            return [], branch_food_order

        else:
            return errors, None
    elif payment_method.title=="JAMBOPAY WALLET":
        if not UserAccounts.objects.filter(owner = branch_food_order.entity.administrator).exists():
            errors.append("Entity admin has no collection account")
            return errors, None
        else:
            administrator_account =  UserAccounts.objects.filter(owner = branch_food_order.entity.administrator).first()
            print("entity_collection_account",administrator_account)
        # if not models.BranchCollectionAccount.objects.filter(branch = branch_food_order.branch).exists():
        #     errors.append("Branch has no collection account")
        #     return errors, None
        # else:
        #     branch_collection_account =  models.BranchCollectionAccount.objects.filter(branch = branch_food_order.branch).first()


        errors, wallet = get_account_by_phone(mobile_money_phone)
        if wallet:
            data ={
                        "orderId": reference_number,
                        "amount":  int(branch_food_order.order_items_cost+ branch_food_order.shipping_cost),
                        "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
                        "accountTo": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                        "description": "Test_Wallet Checkout",
                        "modeOfPayment": "WALLET_AS_SERVICE",
                        "provider": "JAMBOPAY",
                        "data": {
                                "serviceType": "TOPUP",
                                "accountNo": administrator_account.account_number
                        }
                        }
            response = jambopay_wallet_checkout(data)

            if not "statusCode" in response and  "ref" in response:
                food_order_payment = BranchFoodOrderPayment.objects.create(
                    payment_method=payment_method,
                    reference_number=reference_number,
                    status="PENDING",
                    amount=branch_food_order.order_items_cost+ branch_food_order.shipping_cost,
                    entity=user.entity,
                    currency="KES",
                    owner=user,
                    branch_food_order = branch_food_order,
                )
                use_reference_number(reference_number)
                if food_order_payment:
                
                    return [], branch_food_order
                else:
                    errors.append("Ticket payment not created")
                    return errors, [], None
            else:
                # errors.append( str(response))
                return errors, None, None

        else:
            errors.append("No wallet for provided mobile phone")
            return errors, None
# Food orders

@transaction.atomic
def create_single_food_order(data, user):
    errors =[]
    entity=None
    customer =None
    customer_name=""
    customer_phone=""
    payment_method = None
    reference_number = None
    branch_table=None
    order_item = None
    employee = None
    origin_latitude=None
    origin_longitude=None
    origin_point = None
    destination_latitude = None
    destination_longitude=None
    destination_point=None
    farness=None
    city_name=None
    branch=None

    order_origin = "STAFF"
    order_items_cost = 0.00
    shipping_cost=0.00
    delivery_method=None
    mobile_money_phone_number = None



    if not "payment_method" in data["branch_food_order"]:
        errors.append("Payment method ID is required")
        return errors, None
    else:
        payment_method = validate_payment_method_exists(data["branch_food_order"]["payment_method"])
    
        # if payment_method and not payment_method.title =="CASH" and not data["branch_food_order"]["mobile_money_phone_number"] or data["branch_food_order"]["mobile_money_phone_number"]=="":
        #     errors.append("Mobile money number is required")
        #     return errors, None
        # else:
        #     mobile_money_phone_number= data["branch_food_order"]["mobile_money_phone_number"]

        #     print("PM", payment_method)

    if "mobile_money_phone_number" in data["branch_food_order"] and not  data["branch_food_order"]["mobile_money_phone_number"]=="":
        mobile_money_phone_number = data["branch_food_order"]["mobile_money_phone_number"]
    
    if "branch_table" in data["branch_food_order"] and not data["branch_food_order"]["branch_table"]=="":
 
        branch_table = restaurant_validators.validate_branch_table(data["branch_food_order"]["branch_table"])

    if "order_origin" in data["branch_food_order"] and not data["branch_food_order"]["order_origin"]=="":
 
        order_origin =data["branch_food_order"]["order_origin"]

    if "customer_name" in data["branch_food_order"] and not data["branch_food_order"]["customer_name"]=="":
 
        customer_name =data["branch_food_order"]["customer_name"]

    if "customer_phone" in data["branch_food_order"] and not data["branch_food_order"]["customer_phone"]=="":
 
        customer_phone =data["branch_food_order"]["customer_phone"]


    
    if order_origin == "CUSTOMER" and "entity_branch_id" in data["branch_food_order"]:
        entity_branch_id = data["branch_food_order"]["entity_branch_id"]
        branch = validate_entity_branch(entity_branch_id)
    
    if order_origin=="STAFF":
        employee = validate_employee(user)
        if not employee.current_branch:
            errors.append("Employee is not set to a branch")
            return errors, None
        branch = employee.current_branch
        entity=employee.entity

    if order_origin == "CUSTOMER" and "entity_id" in data["branch_food_order"]:
        entity_id = data["branch_food_order"]["entity_id"]
        entity = validate_entity(entity_id)
  

    if order_origin == "STAFF" and "user_id" in data["branch_food_order"]:
        customer = authentication_models_validators.validate_user(data['branch_food_order']['user_id'])
    else:
        customer = user

    if "origin_latitude" in data['branch_food_order'] and not  data['branch_food_order']["origin_latitude"]=="":
        origin_latitude = float(data['branch_food_order']['origin_latitude'])

    if "origin_longitude" in data['branch_food_order'] and not  data['branch_food_order']["origin_longitude"]=="":
        origin_longitude =  float(data['branch_food_order']['origin_longitude'])

    if origin_latitude and origin_longitude:
        origin_point = Point(origin_longitude, origin_latitude, srid=4326)

    if "destination_latitude" in data['branch_food_order'] and not  data['branch_food_order']["destination_latitude"]=="":
        destination_latitude = float(data['branch_food_order']['destination_latitude'])

    if "destination_longitude" in data['branch_food_order']  and not  data['branch_food_order']["destination_longitude"]=="":
        destination_longitude =  float(data['branch_food_order']['destination_longitude'])

    if destination_latitude and destination_longitude:
        destination_point = Point(destination_longitude, destination_latitude, srid=4326)

    if "farness" in data['branch_food_order']  and not  data['branch_food_order']["farness"]=="":
        farness = float(data['branch_food_order']['farness'])

    if "city_name" in data['branch_food_order']  and not  data['branch_food_order']["city_name"]=="":
        city_name = data['branch_food_order']['city_name']
    
    if "delivery_method" in data["branch_food_order"]:
        delivery_method = data["branch_food_order"]["delivery_method"]
    else:
       errors.append("Delivery method is required")
    
    if delivery_method == "DELIVERY":
        if "shipping_cost" in data["branch_food_order"]:
            shipping_cost = float(data["branch_food_order"]["shipping_cost"])
    else:
        shipping_cost = 0.00


    if "items" in data["branch_food_order"] and not len(data["branch_food_order"]["items"])<1:
        order_items = data["branch_food_order"]["items"]
    else:
        errors.append("Order has no items")
        return errors, None


    for item in order_items:
        branch_food_item = validate_food_item(item["branch_food_item"])

        items_cost = float(branch_food_item.price) * float(item["quantity"])
        order_items_cost = float(order_items_cost)+float(items_cost)
   

    document_number = generate_document_number(entity, user,"FOOD")
    branch_food_order = models.BranchFoodOrder.objects.create(
        document_number=document_number,
    branch=branch,
        branch_table=branch_table,
        payment_method_id=data["branch_food_order"]["payment_method"],
        entity=entity,
        order_items_cost= order_items_cost,
        owner=user,
        order_origin=order_origin,
        destination_point=destination_point,
        origin_point=origin_point,
        city_name=city_name,
        farness=farness,
        customer=customer,
        shipping_cost=shipping_cost,
        delivery_method= delivery_method,
        customer_name=f"{customer.first_name} {customer.last_name}" if customer else customer_name,
        customer_phone=customer.phone if customer else customer_phone,
        
    )

    if branch_food_order:
        print("bfo",branch_food_order)

        for item in order_items:
            branch_food_item = validate_food_item(item["branch_food_item"])
            order_item = models.BranchFoodOrderItem.objects.create(
                    branch_food_order=branch_food_order,
                    branch_food_item=branch_food_item,
                    quantity=int(item["quantity"]),
                    entity=entity,
                    owner=user,
                )
            print("Just created", order_item.branch_food_item)
                # if order_item:
                #     print("Adjusting food qty")
                #     branch_food_item.quantity=branch_food_item.quantity - order_item.quantity
                #     branch_food_item.save()
                #     print("oi",order_item)
            
            # print("errors1", errors)
            # print("order1", order)

            
            
        reference_number =generate_reference_number(entity, user)
        errors, order = process_food_order_payment(branch_food_order, payment_method, user, mobile_money_phone_number, reference_number)
        print("errors", errors)
        print("order2", order)
        return errors, order
            # return ["ERROR HERE"], None
    else:
        errors.append("Order not created")
        return errors, None
    
    # if "reference_number" in data["branch_food_order"] and not data["branch_food_order"]["reference_number"]=="":
    #     reference_number = data["branch_food_order"]["reference_number"] 
    # else:
    #     reference_number=generate_reference_number(user.entity,user)
    # print("RN", reference_number)

    
    # else:
    #     print("Sawa")
    
 

    # try:
    #     branch_food_order = None


            


            
    #         for item in order_items:
    #             item_quantity=int(item["quantity"])
    #             if not item["branch_food_item"]=="":
    #                 branch_food_item = models.BranchFoodItem.objects.get(id=item["branch_food_item"])
    #                 order_item = models.BranchFoodOrderItem.objects.create(
    #                     branch_food_order=branch_food_order,
    #                     branch_food_item=branch_food_item,
    #                     quantity=item_quantity,
    #                     entity=user.entity,
    #                     owner=user,
    #                 )

    #                 if order_item:
    #                     print("Adjusting food qty")
    #                     branch_food_item.quantity=branch_food_item.quantity - item_quantity
    #                     branch_food_item.save()

            # if branch_food_order:
            #     print("Ammmm gere", branch_food_order)
            #     errors, order = process_food_order_payment(branch_food_order, payment_method,mobile_money_phone_number)
            #     print("Ammmm gere2", errors)
            #     print("Ammmm gere3", order)
            #     return errors, order
            # else:
            #     errors.append("Food order could not be created")
            #     return errors, None
          
            

    # except Exception as e:
    #     errors.append(str(e))
    #     return errors, None
    
    # else:
    #     try:
    #         branch_food_order = None
    #         branch_table=None
    #         mobile_money_phone_number=""
    #         branch_collection_account=None
    #         amount =0.00
            
    #         if not "branch_table" in data["branch_food_order"] or data["branch_food_order"]["branch_table"]=="":
    #             errors.append("Table ID is required")
    #             return errors, None
    #         else:
    #             branch_table = restaurant_validators.validate_branch_table(data["branch_food_order"]["branch_table"])

    #         if BranchCollectionAccount.objects.filter(branch=employee.current_branch).exists():
    #             branch_collection_account=BranchCollectionAccount.objects.filter(branch=employee.current_branch).first()
    #         else:
    #             errors.append(f"No collection account exists for this {employee.current_branch}")
    #             return errors, None

    #         if not "mobile_money_phone_number" in data["branch_food_order"] or data["branch_food_order"]["mobile_money_phone_number"]=="":
    #             errors.append("Mobile money phone number is required for non cash payments")
    #             return errors, None
    #         else:
    #             mobile_money_phone_number=data["branch_food_order"]["mobile_money_phone_number"]

    #         # Calculate amout prior
    #         if "items" in data["branch_food_order"]:
    #             items = data["branch_food_order"]["items"]
    #             for item in items:
    #                 branch_food_item = models.BranchFoodItem.objects.get(id=item["branch_food_item"])
    #                 if branch_food_item:
    #                     amount= amount + (float(branch_food_item.price)* float(item["quantity"]))
            
    
    #         reference_number = generate_reference_number(user.entity,user)
           
    #         branch_food_order = models.BranchFoodOrder.objects.create(
    #             reference_number=reference_number,
    #             branch=employee.current_branch,
    #             branch_table=branch_table,
    #             payment_method=payment_method,
    #             entity=user.entity,
    #             owner=user,
    #         )
    #         use_reference_number(reference_number)
    #         if "items" in data["branch_food_order"]:
    #             items = data["branch_food_order"]["items"]
    #             if len(items) > 0:
    #                 for item in items:
    #                     if not item["branch_food_item"]=="":
    #                         branch_food_item = models.BranchFoodItem.objects.get(id=item["branch_food_item"])
    #                         order_item = models.BranchFoodOrderItem.objects.create(
    #                             branch_food_order=branch_food_order,
    #                             branch_food_item=branch_food_item,
    #                             quantity=int(item["quantity"]),
    #                             entity=user.entity,
    #                             owner=user,
    #                         )
    #                     else:
    #                         raise exceptions.ValidationError("Food item  ID is required")

    #         if branch_food_order:
    #             return [], branch_food_order
    #         # if branch_food_order and branch_collection_account and mobile_money_phone_number:
    #             # data = json.dumps({
    #             #     "orderId": branch_food_order.reference_number,
    #             #     "amount": int(amount),
    #             #     "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
    #             #     "accountTo":  config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
    #             #     "description": "Merchant payment",
    #             #     "modeOfPayment": "MOBILE_MONEY",
    #             #     "provider": "Mpesa",
    #             #     "data": {
    #             #         "phoneNumber": mobile_money_phone_number,
    #             #         "serviceType": "MERCHANTPAYMENT"
    #             #     }
    #             #     })

    #             # errors, result_json = jambopay_mobile_checkout(data)
    #             # if result_json:
    #             #     print("JSON", result_json)
    #             #     try:
    #             #         food_order_payment=models.BranchFoodOrderPayment.objects.create(
    #             #             branch_collection_account=branch_collection_account,
    #             #             payment_method=branch_food_order.payment_method,
    #             #             reference_number=branch_food_order.reference_number,
    #             #             psp_reference_number=result_json["ref"],
    #             #             currency=result_json["currency"],
    #             #             amount=amount,
    #             #             status="PENDING",
    #             #             entity=user.entity,
    #             #             owner=user
    #             #         )
    #             #         if food_order_payment:
    #             #             return [], branch_food_order
    #             #         else:
    #             #             branch_food_order.delete()
    #             #             errors.append("Food order payment not created")
    #             #             return errors, None
    #             #     except Exception as e:
    #             #         print("Rroor",e)
    #     except Exception as e:
    #         print("Error at food order", str(e))
    #         raise exceptions.ValidationError(e)

def get_user_food_orders(user, data):
    # employee = validate_employee(user)
    # if not employee.current_branch:
    #     raise exceptions.ValidationError("Employee is not set to a branch")
    
    
    qs = models.BranchFoodOrder.objects.filter(
        order_origin="CUSTOMER"
    ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)))

    return qs

# Bar inventory orders
def process_bar_order_payment(bar_order, payment_method,user,mobile_money_phone,reference_number):
    print("bo", bar_order)
    errors = []
    entity_collection_account = None
    if payment_method.title=="CASH":

        # Cash payments
        bar_order_payment = BarInventoryOrderPayment.objects.create(
            payment_method=payment_method,
            reference_number=reference_number,
            status="SUCCESS",
            amount=bar_order.order_items_cost+ bar_order.shipping_cost,
            entity=user.entity,
            currency="KES",
            owner=user,
            bar_inventory_order = bar_order,
        
        )
        if bar_order_payment:
            use_reference_number(reference_number)

            if models.BarInventoryOrderItem.objects.filter(bar_inventory_order=bar_order).exists():
                order_items = models.BarInventoryOrderItem.objects.filter(bar_inventory_order=bar_order).all()
                for item in order_items:
                    item.bar_inventory.unit_quantity = item.bar_inventory.pack_quantity - item.quantity
                    item.bar_inventory.pack_quantity = int(item.bar_inventory.pack_quantity - item.quantity)/int(item.bar_inventory.product.units_per_pack)
                    item.bar_inventory.save()
    
            return [], bar_order
        else:
            errors.append("Error while creating food order payment")
            return errors, None

    elif payment_method.title=="MOBILE MONEY":
        print("bao", bar_order.branch)
        # if not models.BranchCollectionAccount.objects.filter(branch = bar_order.branch).exists():
        #     errors.append("Branch has no collection account")
        #     return errors, None
        # else:
        #     branch_collection_account =  models.BranchCollectionAccount.objects.filter(branch = bar_order.branch).first()
        if not EntityPSPCollectionAccount.objects.filter(entity = bar_order.entity).exists():
            errors.append("Entity has no collection account")
            return errors, None
        else:
            entity_collection_account =  EntityPSPCollectionAccount.objects.filter(entity = bar_order.entity).first()


        payload = None
        telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
        
   
        print("BFO", bar_order.entity)

        print("Mobile Money",reference_number)

        if telco=="MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(bar_order.order_items_cost+ bar_order.shipping_cost),
                "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                "accountTo": entity_collection_account.entity_account_number,
                "description": "Merchant payment",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "MERCHANTPAYMENT"
                }
                })
            print("PL", payload)
        elif telco=="AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(bar_order.order_items_cost+ bar_order.shipping_cost),
                "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                "accountTo":config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"), 
                "currency":"KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "MERCHANTPAYMENT" 
                }
        
                })
        print("Ikoooo Pl",payload)
        errors, result_json = jambopay_mobile_checkout(payload)
        print("errors", errors)
        print("result_json", result_json)
        if result_json:
            print("Ikoooo")
            bar_order_payment = BarInventoryOrderPayment.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="PENDING",
                amount=bar_order.order_items_cost+ bar_order.shipping_cost,
                entity=user.entity,
                currency="KES",
                owner=user,
                bar_inventory_order = bar_order,
                entity_collection_account=entity_collection_account,
                psp_reference_number= result_json["ref"],
                telco_name= telco
            )
            use_reference_number(reference_number)
            if bar_order_payment:
                return [], bar_order
            else:
                errors.append("Bar order payment not created")
                return errors, None


        else:
            return errors, None
    elif payment_method.title=="JAMBOPAY WALLET":
        # if not models.BranchCollectionAccount.objects.filter(branch = bar_order.branch).exists():
        #     errors.append("Branch has no collection account")
        #     return errors, None
        # else:
        #     branch_collection_account =  models.BranchCollectionAccount.objects.filter(branch = bar_order.branch).first()
        if not EntityPSPCollectionAccount.objects.filter(entity = bar_order.entity).exists():
            errors.append("Entity has no collection account")
            return errors, None
        else:
            entity_collection_account =  EntityPSPCollectionAccount.objects.filter(entity = bar_order.entity).first()


        errors, wallet = get_account_by_phone(mobile_money_phone)
        if wallet:
            data ={
                        "orderId": reference_number,
                        "amount":  int(bar_order.order_items_cost+ bar_order.shipping_cost),
                        "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
                        "accountTo": entity_collection_account.entity_account_number,
                        "description": "Test_Wallet Checkout",
                        "modeOfPayment": "WALLET_AS_SERVICE",
                        "provider": "JAMBOPAY",
                        "data": {
                                "serviceType": "MERCHANTPAYMENT",
                                "accountNo": wallet
                        }
                        }
            response = jambopay_wallet_checkout(data)

            if not "statusCode" in response and  "ref" in response:
                food_order_payment = BranchFoodOrderPayment.objects.create(
                    payment_method=payment_method,
                    reference_number=reference_number,
                    status="PENDING",
                    amount=bar_order.order_items_cost+ bar_order.shipping_cost,
                    entity=user.entity,
                    currency="KES",
                    owner=user,
                    bar_order = bar_order,
                    branch_collection_account=branch_collection_account
                )
                use_reference_number(reference_number)
                if food_order_payment:
                
                    return [], bar_order
                else:
                    errors.append("Ticket payment not created")
                    return errors, [], None
            else:
                # errors.append( str(response))
                return errors, None, None

        else:
            errors.append("No wallet for provided mobile phone")
            return errors, None
# Food orders
@transaction.atomic
def create_bar_inventory_order(data, user):
    errors = []
    reference_number=""
    bar_inventory_order = None
    branch =None
    entity_collection_account=None
    payment_method=None
    branch_table=None
    mobile_money_phone_number="",
    quantity=0
    amount =0.00
    order_items_cost=0.00
    employee =None
    order_origin = None

    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not currently set to branch")
    else:
        branch=employee.current_branch

    if  "branch_table" in data["bar_inventory_order"] and not data["bar_inventory_order"]["branch_table"]=="":
        branch_table= restaurant_validators.validate_branch_table(data["bar_inventory_order"]["branch_table"])
    else:
        pass

    if  "order_origin" in data["bar_inventory_order"] and not data["bar_inventory_order"]["order_origin"]=="":
        order_origin= data["bar_inventory_order"]["order_origin"]
    else:
        pass
       
    if not "payment_method" in data["bar_inventory_order"] or data["bar_inventory_order"]["payment_method"]=="":
        errors.append("Payment method ID is required")
        return errors, None
    else:
        payment_method= validate_payment_method_exists(data["bar_inventory_order"]["payment_method"])

    if not payment_method.title=="CASH":
        if EntityPSPCollectionAccount.objects.filter(entity=employee.entity).exists():
            entity_collection_account=EntityPSPCollectionAccount.objects.filter(entity=employee.entity).first()
        else:
            errors.append("No collection account exists for this entity")
            return errors, None

        if not "mobile_money_phone_number" in data["bar_inventory_order"] or data["bar_inventory_order"]["mobile_money_phone_number"]=="":
            errors.append("Mobile money phone number is required for non cash payments")
            return errors, None
        else:
            mobile_money_phone_number=data["bar_inventory_order"]["mobile_money_phone_number"]
            
                
    # else:
    #     pass
    

    # if "quantity" in data["bar_inventory_order"]:
    #     quantity= int(item["quantity"])
    #     if quantity <=0:
    #         errors.append("Quantity cannot be zero or less")
    #         return errors, None

    if "items" in data["bar_inventory_order"] and not len(data["bar_inventory_order"]["items"])<1:
        order_items = data["bar_inventory_order"]["items"]


        for item in order_items:
            print("item", item)
            bar_inventory_item = validate_bar_inventory(item["id"])
            items_cost = float(bar_inventory_item.pack_selling_price) * float(item["quantity"])
            order_items_cost = float(order_items_cost)+float(items_cost)
            print(" oa", order_items_cost)
    else:
        errors.append("Order has no items")
        return errors, None
    if "items" in data["bar_inventory_order"]:
        items = data["bar_inventory_order"]["items"]
        if len(items)<1:
            errors.append("No items in the order")
            return errors, None
        else:
            for item in items:
                if models.BarInventory.objects.filter(id=item["id"]).exists():
                    bar_inventory = models.BarInventory.objects.filter(id=item["id"]).first()
                    if bar_inventory:
                        if item["quantity"]>bar_inventory.pack_quantity:
                            errors.append(f"Insufficient quantity in stock. Only {bar_inventory.pack_quantity} available")
                            return errors, None

                        if(float(item["quantity"])<=0.00):
                            errors.append(f"Quantity of {bar_inventory.product.title} is 0")
                            return errors,None
                        amount= amount + (float(bar_inventory.unit_selling_price)* float(item["quantity"]))
                else:
                    errors.append("No item with the given ID exists")
                    return errors, None
        
        
    try:
        document_number = generate_document_number(branch.entity, user,"DRINKS")
        bar_inventory_order = models.BarInventoryOrder.objects.create(
            document_number=document_number,
            branch=employee.current_branch,
            branch_table=branch_table,
            payment_method=payment_method,
            entity=user.entity,
            order_items_cost=order_items_cost,
            order_origin=order_origin,
            owner=user,
        )
           
        if "items" in data["bar_inventory_order"]:
            items = data["bar_inventory_order"]["items"]
            if len(items) > 0:
                for item in items: 
                    item_quantity=int(item["quantity"])
                    bar_inventory = models.BarInventory.objects.get(id=item["id"])
                    drinks_order_item = models.BarInventoryOrderItem.objects.create(
                        bar_inventory_order=bar_inventory_order,
                        bar_inventory=bar_inventory,
                        quantity=item_quantity,
                        entity=user.entity,
                        owner=user,
                    )
                    print("Deducting inventory")
                    # Subtract sold quantity:
                    # bar_inventory.pack_quantity=bar_inventory.pack_quantity - item_quantity
                    # bar_inventory.unit_quantity=bar_inventory.unit_quantity - int(item_quantity* bar_inventory.product.units_per_pack)
                    # bar_inventory.save()
                    
        if bar_inventory_order:
            reference_number =generate_reference_number(employee.entity, user)
            errors, order = process_bar_order_payment(bar_inventory_order, payment_method, user, mobile_money_phone_number, reference_number)
            return errors, order
      
    except Exception as e:
        raise exceptions.ValidationError(e)

def get_bar_inventory_orders(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.BarInventoryOrder.objects.filter(
            entity=user.entity,is_paid="true",order_origin="CUSTOMER"
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by("-created")

    return qs

def get_online_bar_inventory_orders(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.BarInventoryOrder.objects.filter(
            entity=user.entity, branch=employee.current_branch,order_origin="CUSTOMER",
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by("-created")
    return qs

def get_bar_inventory_order_payments(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.BarInventoryOrderPayment.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)))

    return qs


def get_food_order_payments(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.BranchFoodOrderPayment.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)))

    return qs

def get_accommodation_order_payments(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.AccomodationOrderPayments.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)))

    return qs

def get_accommodation_payment_settlements(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.AccommodationOrderPaymentSettlement.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)))

    return qs

def get_bar_order_payment_settlements(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.BarOrderPaymentSettlement.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)))

    return qs
def get_food_order_payment_settlements(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.FoodOrderPaymentSettlement.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)))

    return qs


# Accommodation orders
def process_accomodation_order_payment(accommodation_order, payment_method,user,mobile_money_phone,reference_number):
    errors = []
    branch_collection_account = None
    if payment_method.title=="CASH":
        # cash_document_number=generate_document_number(vehicle.entity, user, "FARE")    
   
        # Cash payments
        accommodation_order_payment = AccomodationOrderPayments.objects.create(
            payment_method=payment_method,
            reference_number=reference_number,
            status="SUCCESS",
            amount=accommodation_order.order_items_cost,
            entity=user.entity,
            currency="KES",
            owner=user,
            accommodation_order = accommodation_order,
            
        )
        if accommodation_order_payment:
            return [], accommodation_order
        else:
            errors.append("Error while creating food order payment")
            return errors, None

    elif payment_method.title=="MOBILE MONEY":
        if not models.BranchCollectionAccount.objects.filter(branch = accommodation_order.branch).exists():
            errors.append("Branch has no collection account")
            return errors, None
        else:
            branch_collection_account =  models.BranchCollectionAccount.objects.filter(branch = accommodation_order.branch).first()

      
        payload = None
        telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
        
   
        print("BFO", accommodation_order.entity)

        print("Mobile Money",reference_number)

        if telco=="MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(accommodation_order.order_items_cost),
                "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                "accountTo":  config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                "description": "Merchant payment",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "MERCHANTPAYMENT"
                }
                })
        elif telco=="AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(accommodation_order.order_items_cost),
                "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                "accountTo":config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"), 
                "currency":"KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "MERCHANTPAYMENT" 
                }
                })
        errors, result_json = jambopay_mobile_checkout(payload)
        if result_json:
            print("Ikoooo")
            food_order_payment = AccomodationOrderPayments.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="PENDING",
                amount=accommodation_order.order_items_cost,
                entity=user.entity,
                currency="KES",
                owner=user,
                accommodation_order = accommodation_order,
                telco=telco,
                branch_collection_account=branch_collection_account,
                   psp_reference_number= result_json["ref"],
            )
            use_reference_number(reference_number)

            return [], accommodation_order

        else:
            return errors, None
    elif payment_method.title=="JAMBOPAY WALLET":
        if not models.BranchCollectionAccount.objects.filter(branch = accommodation_order.branch).exists():
            errors.append("Branch has no collection account")
            return errors, None
        else:
            branch_collection_account =  models.BranchCollectionAccount.objects.filter(branch = accommodation_order.branch).first()



        errors, wallet = get_account_by_phone(mobile_money_phone)
        if wallet:
            data ={
                        "orderId": reference_number,
                        "amount":  int(accommodation_order.order_items_cost),
                        "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
                        "accountTo": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                        "description": "Test_Wallet Checkout",
                        "modeOfPayment": "WALLET_AS_SERVICE",
                        "provider": "JAMBOPAY",
                        "data": {
                                "serviceType": "MERCHANTPAYMENT",
                                "accountNo": wallet
                        }
                        }
            response = jambopay_wallet_checkout(data)

            if not "statusCode" in response and  "ref" in response:
                food_order_payment = AccomodationOrderPayments.objects.create(
                    payment_method=payment_method,
                    reference_number=reference_number,
                    status="PENDING",
                    amount=accommodation_order.order_items_cost+ accommodation_order.shipping_cost,
                    entity=user.entity,
                    currency="KES",
                    owner=user,
                    accommodation_order = accommodation_order,
                    branch_collection_account=branch_collection_account
                )
                use_reference_number(reference_number)
                if food_order_payment:
                
                    return [], accommodation_order
                else:
                    errors.append("Accommodation payment not created")
                    return errors, [], None
            else:
                # errors.append( str(response))
                return errors, None, None

        else:
            errors.append("No wallet for provided mobile phone")
            return errors, None

def create_branch_accommodation_order(user,data):
    errors=[]
    employee = validate_employee(user)
    accommodation_order=None
    rooms=[]
    payment_method = []
    branch_collection_account=None
    mobile_money_phone_number=""
    order_items_cost =0.00

    if BranchCollectionAccount.objects.filter(branch=employee.current_branch).exists():
        branch_collection_account=BranchCollectionAccount.objects.filter(branch=employee.current_branch).first()
    else:
        errors.append(f"{employee.current_branch} has no collection account.")   
        return errors, None 
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    if not "rooms" in data["branch_rooms_order"] or data["branch_rooms_order"]["rooms"]==[]:
        errors.append("No rooms are selected")
    else:
        rooms =  data["branch_rooms_order"]["rooms"]
        for room in rooms:
            print("ID", room)
            order_items_cost = order_items_cost + float(room["price"])

    for room_data in rooms:
        room_obj=restaurant_validators.validate_room(room_data["id"])
        if not "checkin_date" in room_data or room_data["checkin_date"]=="":
            errors.append(f"Check check in date of {room_obj}")
        
        if not "checkout_date" in room_data or room_data["checkout_date"]=="":
            errors.append(f"Check check out date of {room_obj}")
        
        if not "guests" in room_data or len(room_data["guests"])<room_obj.occupancy:
            errors.append(f"Details of {room_obj.occupancy} guest(s) required for room {room_obj}")
        
        if  "guests" in room_data and len(room_data["guests"])> room_obj.occupancy:
            errors.append(f"Not more than {room_obj.occupancy} guest(s) can occupy room {room_obj}")

        # Check guest details are fully entered
    for room_data in rooms:     
        if  "guests" in room_data and len(room_data["guests"])==room_obj.occupancy:
            room_obj = restaurant_validators.validate_room(room_data["id"])
            for guest in enumerate(room_data["guests"]):
                print("guest",guest[1]["first_name"])
                if not "first_name" in guest[1] or guest[1]["first_name"]=="":
                    errors.append(f"Enter first name for guest {guest[0]+1} at room {room_obj}")
                
                if not "last_name" in guest[1] or guest[1]["last_name"]=="":
                    errors.append(f"Enter last name for guest {guest[0]+1} at room {room_obj}")
                
                if not "identifier_type" in guest[1] or guest[1]["identifier_type"]=="":
                    errors.append(f"Enter identifier type for guest {guest[0]+1} at room {room_obj}")
                
                if not "identifier_number" in guest[1] or guest[1]["identifier_number"]=="":
                    errors.append(f"Enter identifier number for guest {guest[0]+1} at room {room_obj}")
                
                if not "age_type" in guest[1] or guest[1]["age_type"]=="":
                    errors.append(f"Enter age type for guest {guest[0]+1} at room {room_obj}")
                    
            if len(errors)>0:      
                return errors,None


    if not "payment_method" in data["branch_rooms_order"] or data["branch_rooms_order"]["payment_method"]=="":
        errors.append("Payment method is required")
    else:
        payment_method= validate_payment_method_exists(data["branch_rooms_order"]["payment_method"])

        if not payment_method.title=="CASH":
            if not "mobile_money_phone_number" in data["branch_rooms_order"] or data["branch_rooms_order"]["mobile_money_phone_number"]=="":
                errors.append("Mobile money phone number is required for non cash payments")
                return errors, None
            else:
                mobile_money_phone_number=data["branch_rooms_order"]["mobile_money_phone_number"]
    room_bookings=[]
    for room_data in rooms:
        branch_guests =[]
        if  "guests" in room_data and len(room_data["guests"])==room_obj.occupancy:
            room_obj = restaurant_validators.validate_room(room_data["id"])
            for guest in room_data["guests"]:
                guest = models.BranchGuest.objects.create(
                    entity=employee.entity,
                    branch=employee.current_branch,
                    first_name=guest["first_name"],
                    last_name=guest["last_name"],
                    identifier_type=guest["identifier_type"],
                    identifier_number=guest["identifier_number"],
                    age_type=guest["age_type"],
                    gender=guest["gender"],
                    nationality_id=guest["nationality"],
                    phone=guest["phone"],
                    owner=user
              
                )
                branch_guests.append(guest)

        
        branch_room=restaurant_validators.validate_room(room_data["id"])
        if branch_room.is_available=="true":
            room_booking = models.BranchRoomBooking.objects.create(
                branch_room=branch_room,
                checkin_date=room_data["checkin_date"],
                checkout_date=room_data["checkout_date"],
                owner =user,
                entity=employee.entity,
                branch=employee.current_branch
            )
            if room_booking:
                for guest in branch_guests:
                    room_booking.branch_guest.add(guest)

                room_bookings.append(room_booking)

        else:
            errors.append(f"Room {branch_room}is already booked")
            return errors, None
    
    if len(room_bookings)>0:
        
        accommodation_order_total_amount=0.00
        date_format = '%Y-%m-%d'
        try:
            document_number = generate_document_number(employee.entity, user,"ACCOMMODATION")
            accommodation_order=models.AccomodationOrder.objects.create(
                document_number=document_number,
                branch_collection_account=branch_collection_account,
                branch=employee.current_branch,
                payment_method=payment_method,
                owner=user,
                entity=employee.entity,
                order_items_cost=order_items_cost
            )
            if accommodation_order:
                for room_booking in room_bookings:
                    accommodation_order.room_bookings.add(room_booking)

            reference_number =generate_reference_number(employee.entity, user)
            errors, order = process_accomodation_order_payment(accommodation_order, payment_method, user, mobile_money_phone_number, reference_number)     
            return errors, order
        except Exception as e:
            errors.append(str(e))


def get_branch_accommodation_orders(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.AccomodationOrder.objects.filter(
            entity=user.entity, owner=user, branch=employee.current_branch
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)))

    return qs

def get_branch_room_bookings(user, data):
    employee = validate_employee(user)
    if not employee.current_branch:
        raise exceptions.ValidationError("Employee is not set to a branch")
    
    qs = []

    qs = models.BranchRoomBooking.objects.filter(
            entity=user.entity, owner=user, branch=employee.current_branch
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)))

    return qs