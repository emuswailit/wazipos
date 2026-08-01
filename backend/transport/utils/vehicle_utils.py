from email import errors
from datetime import datetime, timedelta
from authentication.validators.authentication_models_validators import validate_user
from authentication.utils.utils import generate_reference_number
from core.date_utils import get_today_date
from intergrations.jambopay.jambopay_settlement_transfer import jambopay_settlement_wallet_transfer
from intergrations.jambopay.jambopay_check_wallet_balance import check_wallet_balance
from employees.validators.employees_models_validators import validate_employee, validate_entity_employee
from intergrations.jambopay.jambopay_create_whitelabel_account import create_white_label_account
from intergrations.jambopay.jambopay_create_collection_account import jambopay_create_collection_account
from .. import models
from django.db import IntegrityError, transaction
from ..transport_validators import validate_destination, validate_route, validate_vehicle, validate_sacco_subscription,validate_sacco_personnel
from rest_framework import exceptions
import json
from decouple import config
from payments.models import UserAccounts
from django.db.models import Q
from transport.transport_validators import validate_sacco_settlement_account
from payments.validators.payments_models_validators import validate_payout_account
from authentication.models import Agents

@transaction.atomic
def create_vehicle(data, user):
    errors =[]
    title=""
    route_id=""
    seats=0 
    administrator = None
    driver = None
    conductor = None
    collector =None
    registration =""
    crewsArr=[]
    sacco_subscriptions_arr=[]
    payout_accounts_arr=[]
    psp=None
    validated_routes = []

    route =None
    if not "vehicle_details" in data:
        errors.append("Vehicle details are required")
        return errors,None

    if not "registration" in data["vehicle_details"] or data["vehicle_details"]["registration"]=="":
         errors.append("Registration number is required")
    else:
        registration =  data["vehicle_details"]["registration"]
    
    
    if not "routes" in data["vehicle_details"] or data["vehicle_details"]["routes"]=="":
         errors.append("Atleast 2 routes are required (from and to)")
    else:
        route_ids = data["vehicle_details"]["routes"]
        if len(route_ids)>0:
            for route_id in route_ids:
                route = validate_route(route_id)
                validated_routes.append(route)

    if not "administrator" in data["vehicle_details"] or data["vehicle_details"]["administrator"]=="":
         errors.append("Administrator  ID is required")
    else:
        administrator_id =  data["vehicle_details"]["administrator"]
        administrator = validate_sacco_personnel(administrator_id)

    if not "driver" in data["vehicle_details"] or data["vehicle_details"]["driver"]=="":
        #  errors.append("Administrator  ID is required")
        pass
    else:
        driver_id =  data["vehicle_details"]["driver"]
        driver = validate_sacco_personnel(driver_id)

    if not "collector" in data["vehicle_details"] or data["vehicle_details"]["collector"]=="":
        errors.append("Fare collector  ID is required")
        
    else:
        collector_id =  data["vehicle_details"]["collector"]
        collector = validate_user(driver_id)
        if not collector.entity ==user.entity:
            errors.append(f"Selected user is not a member of {user.entity}")

    if not "conductor" in data["vehicle_details"] or data["vehicle_details"]["conductor"]=="":
        #  errors.append("Administrator  ID is required")
        pass
    else:
        conductor_id =  data["vehicle_details"]["conductor"]
        conductor = validate_sacco_personnel(conductor_id)

    if "seats" in  data["vehicle_details"]:
        seats=int(data["vehicle_details"]["seats"])

    if "title" in  data["vehicle_details"]:
        title=data["vehicle_details"]["title"]

    if "crew_members" in data["vehicle_details"]:
        crew_ids = data["vehicle_details"]["crew_members"]
        for id in crew_ids:
            crew = validate_sacco_personnel(id)
                
            crewsArr.append(crew)

    if "sacco_subscriptions" in data["vehicle_details"]:
        subscription_ids = data["vehicle_details"]["sacco_subscriptions"]
        for id in subscription_ids:
            subscription = validate_sacco_subscription(id, user)
                
            sacco_subscriptions_arr.append(subscription)

    if "payout_accounts" in data["vehicle_details"]:
        payout_ids = data["vehicle_details"]["payout_accounts"]
        for id in payout_ids:
            subscription = validate_payout_account(id, user)
            payout_accounts_arr.append(subscription)

    if len(errors)>0:
        return errors, None
    else:
        try:
            vehicle = models.Vehicles.objects.create(
                seats=seats, 
                title=title, 
                registration=registration, 
                administrator=administrator, 
                entity=user.entity,
                driver=driver,
                conductor=conductor,
                owner=user,
                )
            
            if vehicle:
                if len(validated_routes)>0:
                    for route in validated_routes:
                        vehicle.routes.add(route)

                if len(crewsArr)>0:
                    for crew in crewsArr:
                        vehicle.crew_members.add(crew)

                if len(sacco_subscriptions_arr)>0:
                    for subscription in sacco_subscriptions_arr:
                        vehicle.sacco_subscriptions.add(subscription)

                return [], vehicle
            else:
                errors.append("Vehicle not created")
                return errors, None


        except IntegrityError as e:
            raise exceptions.ValidationError(f"{str(e)}")

       
@transaction.atomic
def create_vehicle_by_agent(data, user):
    errors =[]
    title=""
    route_id=""
    seats=0 
    administrator = None
    driver = None
    conductor = None
    registration =""
    crewsArr=[]
    sacco_subscriptions_arr=[]
    payout_accounts_arr=[]
    psp=None
    validated_routes = []
    agent = None

    route =None
    if not "vehicle_details" in data:
        errors.append("Vehicle details are required")
        return errors,None

    if not "registration" in data["vehicle_details"] or data["vehicle_details"]["registration"]=="":
         errors.append("Registration number is required")
    else:
        registration =  data["vehicle_details"]["registration"]
    
    
    if not "routes" in data["vehicle_details"] or data["vehicle_details"]["routes"]=="":
         errors.append("Atleast 2 routes are required (from and to)")
    else:
        route_ids = data["vehicle_details"]["routes"]
        if len(route_ids)>0:
            for route_id in route_ids:
                route = validate_route(route_id)
                validated_routes.append(route)

    if not "administrator_id" in data["vehicle_details"] or data["vehicle_details"]["administrator_id"]=="":
         errors.append("Administrator  ID is required")
    else:
        administrator_id =  data["vehicle_details"]["administrator_id"]
        administrator = validate_sacco_personnel(administrator_id)

    if not "driver_id" in data["vehicle_details"] or data["vehicle_details"]["driver_id"]=="":
        #  errors.append("Administrator  ID is required")
        pass
    else:
        driver_id =  data["vehicle_details"]["driver_id"]
        driver = validate_sacco_personnel(driver_id)

    if not "conductor_id" in data["vehicle_details"] or data["vehicle_details"]["conductor_id"]=="":
        #  errors.append("Administrator  ID is required")
        pass
    else:
        conductor_id =  data["vehicle_details"]["conductor_id"]
        conductor = validate_sacco_personnel(conductor_id)
    if not "agent_id" in data["vehicle_details"] or data["vehicle_details"]["agent_id"]=="":
        errors.append("Administrator  ID is required")
        return errors, None
    else:
        agent_id =  data["vehicle_details"]["agent_id"]
        if Agents.objects.filter(id=agent_id).exists():
            agent = Agents.objects.filter(id=agent_id).first()

    if "seats" in  data["vehicle_details"]:
        seats=int(data["vehicle_details"]["seats"])

    if "title" in  data["vehicle_details"]:
        title=data["vehicle_details"]["title"]

    if "crew_members" in data["vehicle_details"]:
        crew_ids = data["vehicle_details"]["crew_members"]
        for id in crew_ids:
            crew = validate_sacco_personnel(id)
                
            crewsArr.append(crew)

    if "sacco_subscriptions" in data["vehicle_details"]:
        subscription_ids = data["vehicle_details"]["sacco_subscriptions"]
        for id in subscription_ids:
            subscription = validate_sacco_subscription(id, user)
                
            sacco_subscriptions_arr.append(subscription)

    if "payout_accounts" in data["vehicle_details"]:
        payout_ids = data["vehicle_details"]["payout_accounts"]
        for id in payout_ids:
            subscription = validate_payout_account(id, user)
            payout_accounts_arr.append(subscription)

    if len(errors)>0:
        return errors, None
    else:
        try:
            vehicle = models.Vehicles.objects.create(
                seats=seats, 
                title=title, 
                registration=registration, 
                administrator=administrator, 
                entity=user.entity,
                driver=driver,
                conductor=conductor,
                owner=user,
                agent=agent
                )
            
            if vehicle:
                if len(validated_routes)>0:
                    for route in validated_routes:
                        vehicle.routes.add(route)

                if len(crewsArr)>0:
                    for crew in crewsArr:
                        vehicle.crew_members.add(crew)

                if len(sacco_subscriptions_arr)>0:
                    for subscription in sacco_subscriptions_arr:
                        vehicle.sacco_subscriptions.add(subscription)

                return [], vehicle
            else:
                errors.append("Vehicle not created")
                return errors, None


        except IntegrityError as e:
            raise exceptions.ValidationError(f"{str(e)}")

       
@transaction.atomic
def update_vehicle(data, user):
    errors =[]
    title=""
    is_active=""
    administrator=""
    conductor_id = None
    driver_id = None
    administrator_id = None
    route =None
    description =""
    crewsArr=[]
    routesArr =[]
    sacco_subscriptions_arr = []
    payout_accounts_arr = []
    if not "vehicle_details" in data:
        errors.append("Vehicle details are required")
        return errors,None
    
    if not "id" in data["vehicle_details"] or data["vehicle_details"]["id"]=="":
         errors.append("Vehicle ID are required")
         return errors, None
    else:
   
        vehicle = validate_vehicle( data["vehicle_details"]["id"])

    if "seats" in  data["vehicle_details"] :
        seats=int(data["vehicle_details"]["seats"])
        vehicle.seats=seats
        vehicle.save()


    if "administrator" in  data["vehicle_details"] and not data["vehicle_details"]["administrator"]=="":
        administrator_id = data["vehicle_details"]["administrator"]
        if administrator_id:
            administrator=validate_sacco_personnel(administrator_id)
            vehicle.administrator=administrator
            vehicle.save()

    if "driver" in  data["vehicle_details"]  and not data["vehicle_details"]["driver"]=="":
        driven_vehicles=None
        driver_id = data["vehicle_details"]["driver"]
        if driver_id:
            driver=validate_sacco_personnel(driver_id)
            if models.Vehicles.objects.filter(driver=driver).exists():
                # Revoke all other conducting roles
                driven_vehicles = models.Vehicles.objects.filter(driver=driver).all()
                for veh in driven_vehicles:
                    veh.driver= None
                    veh.save()
            vehicle.driver=driver
            vehicle.save()

    if "conductor" in  data["vehicle_details"]  and not data["vehicle_details"]["conductor"]=="":
        conducted_vehicles=None
        conductor_id = data["vehicle_details"]["conductor"]
        if conductor_id:
            conductor=validate_sacco_personnel(conductor_id)
            if models.Vehicles.objects.filter(conductor=conductor).exists():
                # Revoke all other conducting roles
                conducted_vehicles = models.Vehicles.objects.filter(conductor=conductor).all()
                for veh in conducted_vehicles:
                    veh.conductor= None
                    veh.save()
            vehicle.conductor=conductor
            vehicle.save()


    if "collector" in  data["vehicle_details"]  and not data["vehicle_details"]["collector"]=="":
        collector_id = data["vehicle_details"]["collector"]
        if collector_id:
            collector=validate_user(collector_id)
            if UserAccounts.objects.filter(owner=collector).exists():
                account =UserAccounts.objects.filter(owner=collector).first()
            else:
                 errors.append(f"User has no existing wallet account")
                 
            if not vehicle.entity == collector.entity:
                errors.append(f"User is not set as a member of {vehicle.entity}")
            else:
                vehicle.collector=collector
                vehicle.save()
                           

    if "title" in  data["vehicle_details"]  and not data["vehicle_details"]["title"]=="":
        title=data["vehicle_details"]["title"]
        vehicle.title=title
        vehicle.save()

    if "is_active" in  data["vehicle_details"]:
        is_active=data["vehicle_details"]["is_active"]
        vehicle.is_active=is_active
        vehicle.save()

    # if "crew_members" in data["vehicle_details"]:
    #     vehicle.crew_members.clear()
    #     crew_ids = data["vehicle_details"]["crew_members"]
    #     for id in crew_ids:
    #         crew = validate_sacco_personnel(id)      
    #         crewsArr.append(crew)

    if "routes" in data["vehicle_details"]:
        vehicle.routes.clear()
        route_ids = data["vehicle_details"]["routes"]
        for id in route_ids:
            route = validate_route(id)      
            routesArr.append(route)

    if "sacco_subscriptions" in data["vehicle_details"]:
        vehicle.sacco_subscriptions.clear()
        sacco_subscription_ids = data["vehicle_details"]["sacco_subscriptions"]
        for id in sacco_subscription_ids:
            sacco_subscription = validate_sacco_subscription(id,user)      
            sacco_subscriptions_arr.append(sacco_subscription)

    if "payout_accounts" in data["vehicle_details"]:
        vehicle.payout_accounts.clear()
        payout_account_ids = data["vehicle_details"]["payout_accounts"]
        for id in payout_account_ids:
            payout_account = validate_payout_account(id,user)      
            payout_accounts_arr.append(payout_accounts_arr)
    
    # Update crew
    if len(crewsArr)>0:
        vehicle.crew_members.clear()         
        for item in crewsArr:
            vehicle.crew_members.add(item)

    # Update routes
    if len(routesArr)>0:
        vehicle.routes.clear()        
        for route in routesArr:
            vehicle.routes.add(route)

    # Update subscriptions
    if len(sacco_subscriptions_arr)>0: 
        vehicle.sacco_subscriptions.clear()        
        for subscription in sacco_subscriptions_arr:
            vehicle.sacco_subscriptions.add(subscription)
   
    # Update payout accounts
    if len(payout_accounts_arr)>0: 
        vehicle.payout_accounts.clear()        
        for payout_account in payout_accounts_arr:
            vehicle.payout_accounts.add(payout_account)

    if len(errors)>0:
        return errors, None
    else:
        return [], vehicle
    


def get_entity_vehicles(user):
    vehicles = []
    if models.Vehicles.objects.filter(entity=user.entity).exists():
        vehicles = models.Vehicles.objects.filter(entity=user.entity).all()
        return vehicles
    else:
        return None

def get_user_vehicles(user):
    vehicles = []
    if models.Vehicles.objects.filter(owner=user, entity=user.entity).exists():
        vehicles = models.Vehicles.objects.filter(owner=user,entity=user.entity).all()
        return vehicles
    else:
        return None
    

def search_vehicle_by_registration(data):
    errors =[]
    registration =""
    if not "registration" in data or data["registration"]=="":
        errors.append("Vehicle registration number is required")
        return errors, None
    else:
        registration = data["registration"]
   
    if models.Vehicles.objects.filter(
            Q(registration__iexact=registration.upper())
        ).exists():
        vehicle = models.Vehicles.objects.filter(
            Q(registration__iexact=registration.upper())
        ).first()
        return [], vehicle
    else:
        return ["No vehicle with supplied registration number in the system"], None
    
def get_trip_details(data):
    errors =[]
    trip =""
    if not "trip" in data or data["trip"]=="":
        errors.append("Trip ID is required")
        return errors, None
    else:
        trip = data["trip"]
   
    if models.Trip.objects.filter(
           id=trip
        ).exists():
        trip = models.Trip.objects.filter(
           id=trip
        ).first()
        return [], trip
    else:
        return ["No trip with supplied ID in the system"], None

def filter_all_vehicle_by_registration(data):
    vehicles =[]
    registration =""
    if not "registration" in data or data["registration"]=="":
        errors.append("Vehicle registration number is required")
        return errors, None
    else:
        registration = data["registration"]
   
    if models.Vehicles.objects.filter(
            Q(registration__icontains=registration.upper())
        ).exists():
        vehicles = models.Vehicles.objects.filter(
            Q(registration__icontains=registration.upper())
        ).all()
    return vehicles
  
    
def filter_entity_vehicle_by_registration(data,user):
    vehicles =[]
    registration =""
    if not "registration" in data or data["registration"]=="":
        errors.append("Vehicle registration number is required")
        return errors, None
    else:
        registration = data["registration"]
   
    if models.Vehicles.objects.filter(entity=user.entity).filter(
            Q(registration__icontains=registration.upper())
        ).exists():
        vehicles = models.Vehicles.objects.filter(entity=user.entity).filter(
            Q(registration__icontains=registration.upper())
        ).all()
    return vehicles
 


# def get_vehicle_collection_account(data,user):
#     errors=[]
#     registration =""
#     vehicle =None

#     if not "registration" in data or data["registration"]=="":
#         errors.append("Vehicle registration number is required")
#         return errors, None
#     else:
#         registration=data["registration"]
#         if models.Vehicles.objects.filter(registration=registration,entity=user.entity).exists():
#             vehicle = models.Vehicles.objects.filter(registration=registration,entity=user.entity).exists()
#         else:
#             errors.append("No vehicle with provided registration exists")
#             return errors, None


#         if models.VehicleCollectionAccount.objects.filter(account_name=registration, entity=user.entity).exists():
#             collection_account= models.VehicleCollectionAccount.objects.filter(account_name=registration,entity=user.entity).first()
#             return [], collection_account
#         else:
#             errors.append(f"Account for vehicle {registration} not found ")
#             return errors, None

        
@transaction.atomic
def create_vehicle_sacco_subscription(data,user):
    errors =[]
    title=""
    amount=0.00
    description=""
    schedule=""
    is_active="true"
    per_crew="false",
    sacco_settlement_account = None

    if not "subscription_details" in data:
        errors.append("Subscription details are required")
        return errors,None
    
    if not "sacco_settlement_account" in data["subscription_details"] or data["subscription_details"]["sacco_settlement_account"] =="" :
        errors.append("Sacco settlement account is required")
    else:
        sacco_settlement_account_id = data["subscription_details"]["sacco_settlement_account"]
        print("SSA")
        sacco_settlement_account = validate_sacco_settlement_account(sacco_settlement_account_id)


    if not "title" in data["subscription_details"]  or data["subscription_details"]["title"]=="":
        errors.append("Title is required")
    else:
        title =data["subscription_details"]["title"]

    if models.SaccoSubscription.objects.filter(title=title.upper(),entity=user.entity).exists():
        errors.append(f"Subscription with similar title exists for {user.entity}")
        return errors,None

    
    if not "amount" in data["subscription_details"]:
        errors.append("Amount is required")
    else:
        amount = float(data["subscription_details"]["amount"])
    


    if  "description" in data["subscription_details"]:
        description = data["subscription_details"]["description"]

    if  "schedule" in data["subscription_details"]:
        schedule = data["subscription_details"]["schedule"]

    if  "is_active" in data["subscription_details"]:
        is_active = data["subscription_details"]["is_active"]

    if  "per_crew" in data["subscription_details"]:
        per_crew = data["subscription_details"]["per_crew"]

    if len(errors)>0:
        return errors, None
    else:
        created= models.SaccoSubscription.objects.create(
            entity=user.entity,
            amount=amount,
            title=title,
            schedule=schedule,
            description=description,
            owner=user,
            per_crew=per_crew,
            is_active = is_active,
            sacco_settlement_account=sacco_settlement_account
        )
        if created:
            data=json.dumps({
                    "currency": "KES",
                    "phoneNumber": user.phone, 
                    "name": f"{created.title} - {created.entity.title}",
                    "description": "Nachao Account",
                    "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                    "accountType": "Individual"
                })
            errors, result_json=create_white_label_account(data)
            if result_json:
                created.account_number=result_json["accountNo"]
                created.account_name= f"{created.title} - {created.entity.title}"
                created.save()
            return [], created
        else:
            errors.append("Subscription could not be created")
            return errors, None

def update_vehicle_sacco_subscription(data,user):
    errors =[]
    title=""
    amount=0.00
    subscription=None
    is_active =""
    per_crew = ""
    sacco_settlement_account = None
    if not "subscription_details" in data:
        errors.append("Subscription details are required")
        return errors,None
    
    if not "subscription_id" in data["subscription_details"] or data["subscription_details"]["subscription_id"]=="":
        errors.append("Subscription ID  is required")
        return errors, None
    else:
        print("subscription_details","iko")
        subscription=validate_sacco_subscription(data["subscription_details"]["subscription_id"], user)
        
    
    if  "title" in data["subscription_details"]:
        title =data["subscription_details"]["title"]
        subscription.title=title
        subscription.save()
    
    
    if  "amount" in data["subscription_details"]:
        amount = float(data["subscription_details"]["amount"])
        subscription.amount=amount
        subscription.save()

    if "description" in data["subscription_details"]:
        description = data["subscription_details"]["description"]
        subscription.description=description
        subscription.save()

    if "schedule" in data["subscription_details"]:
        schedule = data["subscription_details"]["schedule"]
        subscription.schedule=schedule
        subscription.save()
    
    if  "is_active" in data["subscription_details"]:
        is_active = data["subscription_details"]["is_active"]
        subscription.is_active=is_active
        subscription.save()

    if  "per_crew" in data["subscription_details"]:
        per_crew = data["subscription_details"]["per_crew"]
        subscription.per_crew=per_crew
        subscription.save()

    if  "sacco_settlement_account" in data["subscription_details"]:
        sacco_settlement_account_id = data["subscription_details"]["sacco_settlement_account"]
        sacco_settlement_account = validate_sacco_settlement_account(sacco_settlement_account_id)
        subscription.sacco_settlement_account=sacco_settlement_account
        subscription.save()


    if len(errors)>0:
        return errors, None
    else:
        return [], subscription


@transaction.atomic
def create_vehicle_subscription_payment(data,user):
    errors =[]
    subscription=None
    vehicle = None
    amount =0.00
    psp= None
    validity_days =0
    validity_expiry_date=""

    if not "subscription" in data or data["subscription"]=="":
        errors.append("Subscription ID is required")
        return errors, None
    else:
        subscription = validate_sacco_subscription( data["subscription"],user)

    if subscription.schedule=="DAILY":
        validity_days=1
        validity_expiry_date = datetime.now() + timedelta(days=validity_days)
    elif subscription.schedule=="WEEKLY":
        validity_days=7
        validity_expiry_date = datetime.now() + timedelta(days=validity_days)
    elif subscription.schedule=="MONTHLY":
        validity_days=30
        validity_expiry_date = datetime.now() + timedelta(days=validity_days)
    elif subscription.schedule=="BIANNUALLY":
        validity_days=182
        validity_expiry_date = datetime.now() + timedelta(days=validity_days)
    elif subscription.schedule=="ANNUALLY":
        validity_days=365
        validity_expiry_date = datetime.now() + timedelta(days=validity_days)
    
    
    if not "vehicle" in data or data["vehicle"]=="":
        errors.append("Vehicle ID is required")
        return errors, None
    else:
        vehicle = validate_vehicle( data["vehicle"])

    if subscription.per_crew=="true":
        amount = float(subscription.amount)* float(len(vehicle.crew_member))

    else:
        amount =float(subscription.amount)

    if models.VehicleCollectionAccount.objects.filter(vehicle=vehicle).exists():
        vehicle_collection_account = models.VehicleCollectionAccount.objects.filter(vehicle=vehicle).first()

        data =  {
                    "accountNo":vehicle_collection_account.account_number 
                    }
        errors, balance =check_wallet_balance(data)
        reference_number = generate_reference_number(vehicle.entity, user)
        print("my entity",vehicle.entity)
        if float(balance)>amount:
            data = json.dumps({
                    "callbackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
                    "amount": str(amount),
                    "accountTo": vehicle_collection_account.account_number,
                    "accountFrom":subscription.account_number,
                    "orderId": reference_number
                    
                })
            errors, response_json =jambopay_settlement_wallet_transfer(data)
            print("Resp",response_json)

            if response_json:
                if models.SaccoSubscriptionPayment.objects.filter(validity_expiry_date__gte=get_today_date()).exists():
                    errors.append(f"A valid subscription exists for ")
                    return errors, None
                try:
                    created = models.SaccoSubscriptionPayment.objects.create(
                        vehicle=vehicle,
                        sacco_subscription= subscription,
                        amount=amount,
                        account_from=vehicle_collection_account.account_number,
                        account_to=subscription.account_number,
                        reference_number=reference_number,
                        validity_days=validity_days,
                        validity_expiry_date=validity_expiry_date,
                        entity=subscription.entity

                    )
                    if created:
                        return [], created
                except Exception as e:
                    print("err",e)
                    errors.append(e)
                    return errors, None
                
            else:
                return errors, None
                

        else:
            errors.append(f"Insufficient balance to pay {amount} for {vehicle.registration} subscription. Your current balance for account {vehicle_collection_account.account_number} is {balance}")
            return errors, None


    else:
        errors.append("No collection account")
        return errors, None
    #     data=json.dumps({
    #                 "currency": "KES",
    #                 "phoneNumber": user.phone, 
    #                 "name": f"{vehicle.registration} - collection account",
    #                 "description": "Nachao Account",
    #                 "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
    #                 "accountType": "Individual"
    #             })
    #     if PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
    #             psp=PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    #     errors, result_json =create_white_label_account(data)
    #     if result_json:
    #             result_json = models.VehicleCollectionAccount.objects.create(
    #                 vehicle= vehicle,
    #                 account_name=f"{vehicle.registration} - collection account",
    #                 account_number =result_json["accountNo"],
    #                 currency=result_json["currency"],
    #                 psp = psp,
    #                 entity=user.entity

    #             )
    #     # errors.append("Vehicle has no collection account")
    #     # return errors, None
    # try:
    #     created = models.SaccoSubscriptionPayment.objects.create(
    #                     vehicle=vehicle,
    #                     sacco_subscription= subscription,
    #                     amount=amount,
    #                     account_from=vehicle_collection_account.account_number,
    #                     account_to=subscription.account_number,
    #                     reference_number=reference_number,
    #                     validity_days=validity_days,
    #                     validity_expiry_date=validity_expiry_date,
    #                     entity=subscription.entity

    #                 )
    #     if created:
    #         return [], created
    # except Exception as e:
    #     print("err",e)
    #     errors.append(e)
    #     return errors, None

