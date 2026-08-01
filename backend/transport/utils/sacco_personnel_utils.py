from authentication.validators.authentication_models_validators import validate_user, validate_role
from transport.transport_validators import validate_sacco_personnel, validate_vehicle, validate_sacco_subscription
from intergrations.jambopay.jambopay_create_whitelabel_account import create_white_label_account
from ..models import SaccoPersonnel, SaccoPersonnelAccount, SaccoSubscriptionPayment, SaccoSubscriptionSettlement
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms
from payments.validators.payments_models_validators import validate_payment_method_exists
import datetime
from datetime import timedelta
import json
from decouple import config
import calendar
from core.date_utils import get_first_and_last_days_of_month
from authentication.utils.utils import generate_reference_number

from core.phone_number_utils import get_telco_by_phone_number
# from intergrations.jambopay.jambopay_mobile_checkout import jambopay_mobile_checkout
from intergrations.jambopay.jambopay_wallet import get_wallet_balance, initiate_jambopay_settlement
def create_sacco_personnel(data, user):
    errors=[]
    basic_salary=0.00
    house_allowance =0.00
    tenure =""
    personnel_type = ""
    hire_date=""
    retire_date=""
    roles_arr = []
    is_active = None
    input_user=None
    agent = None

    if not "personnel_type" in data["sacco_personnel_details"]:
        errors.append("Personnel type is  required")
    else:
        personnel_type=data["sacco_personnel_details"]["personnel_type"]
    
    if not "tenure" in data["sacco_personnel_details"]:
        errors.append("Terms is  required")
    
    if not "user" in data["sacco_personnel_details"] or data["sacco_personnel_details"]["user"]=="":
        errors.append("Sacco personnel ID is required")

    else:
        input_user = validate_user(data["sacco_personnel_details"]["user"])
        if SaccoPersonnel.objects.filter(user=input_user, entity=input_user.entity).exists():
            errors.append("User is already registered as personnel")
        else:
            pass

    
    if "basic_salary" in data["sacco_personnel_details"]:
        basic_salary= float(data["sacco_personnel_details"]["basic_salary"])
    
    if "is_active" in data["sacco_personnel_details"]:
        is_active= data["sacco_personnel_details"]["is_active"]
    
    if "tenure" in data["sacco_personnel_details"]:
        tenure= data["sacco_personnel_details"]["tenure"]

    if "personnel_type" in data["sacco_personnel_details"]:
        personnel_type= data["sacco_personnel_details"]["personnel_type"]

    if "basic_salary" in data["sacco_personnel_details"]:
        house_allowance= float(data["sacco_personnel_details"]["house_allowance"])

    if "hire_date" in data["sacco_personnel_details"]:
        hire_date= data["sacco_personnel_details"]["hire_date"]
    
    if "retire_date" in data["sacco_personnel_details"]:
        retire_date= data["sacco_personnel_details"]["retire_date"]
    # if "agent" in data["sacco_personnel_details"]:
    #     agent_id= data["sacco_personnel_details"]["agent"]
    #     if Agents.objects.filter(id =agent_id).exists():
    #         agent= Agents.objects.filter(id =agent_id)

    if "roles" in data["sacco_personnel_details"]:
        role_ids = data["sacco_personnel_details"]["roles"]
        for id in role_ids:
            role = validate_role(id, user)
                
            roles_arr.append(role)
    
    if len(errors)>0:
        return errors, None
    else:
        try:

            created = SaccoPersonnel.objects.create(
                user=input_user,
                personnel_type = personnel_type,
                tenure = tenure,
                basic_salary=basic_salary,
                house_allowance=house_allowance,
                hire_date=hire_date,
                retire_date=retire_date,
                entity=user.entity,
                is_active = is_active,
                owner=user,
                agent=agent
                )
            if created:
                for role in roles_arr:
                    created.roles.add(role)

                # data=json.dumps({
                #         "currency": "KES",
                #         "phoneNumber": f"{created.user.phone}", 
                #         "name": f"{user.first_name} {user.last_name} WALLET",
                #         "description": f"Sacco personnel account for {user.first_name} {user.last_name}",
                #         "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                #         "accountType": "Individual"
                #     })

                # errors, account =create_white_label_account(data)
                # if account:
                #     try:
                #         if PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
                #             psp=PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
                #             # sacco_personnel_account = SaccoPersonnelAccount.objects.create(
                #             #     sacco_personnel=created,
                #             #     psp=psp,
                #             #     account_number=account["accountNo"],
                #             #     account_name=account["name"],
                #             #     currency=account["currency"],
                #             #     entity=user.entity,
                #             #     owner=user
                #             # )
                #             user_account = UserAccounts.objects.create(
                #                 psp=psp,
                #                 account_number=account["accountNo"],
                #                 account_name=account["name"],
                #                 account_phone=created.user.phone,
                #                 account_type="WALLET",
                #                 currency=account["currency"],
                #                 entity=user.entity,
                #                 owner=user
                #             )
                #             if user_account:
                #                 message = f"Your wallet account number {user_account.account_number} has been created at JAMBOPAY. Your can dial *615*50# on your phone number {created.user.phone} to set your pin"

                #                 payload = {
                #                         "contact" : created.user.phone,
                #                         "message" : message,
                #                         "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                #                         "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                #                     }
        
                #                 errors, sent = send_swift_sms(payload)
                #                 print("It is created")
                #                 return [], created
                #             else:
                #                 created.delete()
                #                 errors.append("Sacco personnel not created")
                #                 return errors, None
                #         else:
                #             errors.append("PSP not existing")
                #             created.delete()
                #             return errors, None
                #     except Exception as e:
                #         errors.append(str(e))
                #         return errors, None
                # else:
                #     errors.append("Creating  wallet failed")
                #     return errors, None
                    
        except Exception as e:
            print("Error", e)
            return ["Error while creating crew member"], None

def update_sacco_personnel(data, user):
    errors = []
    sacco_personnel = None

    if not "sacco_personnel" in data["sacco_personnel_details"] or data["sacco_personnel_details"]["sacco_personnel"]=="":
        errors.append("Sacco personnel ID is required")
        return errors, None
    else:
    
        sacco_personnel = validate_sacco_personnel(data["sacco_personnel_details"]["sacco_personnel"])

    if "basic_salary" in data["sacco_personnel_details"]:
        basic_salary= data["sacco_personnel_details"]["basic_salary"]
        sacco_personnel.basic_salary=basic_salary
        sacco_personnel.save()

    if "hire_date" in data["sacco_personnel_details"]:
        hire_date= data["sacco_personnel_details"]["hire_date"]
        sacco_personnel.hire_date=hire_date
        sacco_personnel.save()

    if "retire_date" in data["sacco_personnel_details"]:
        retire_date= data["sacco_personnel_details"]["retire_date"]
        sacco_personnel.retire_date=retire_date
        sacco_personnel.save()
    
    if "house_allowance" in data["sacco_personnel_details"]:
        house_allowance= data["sacco_personnel_details"]["house_allowance"]
        sacco_personnel.house_allowance=house_allowance
        sacco_personnel.save()

    if "tenure" in data["sacco_personnel_details"]:
        tenure= data["sacco_personnel_details"]["tenure"]
        sacco_personnel.tenure=tenure
        sacco_personnel.save()

    if "personnel_type" in data["sacco_personnel_details"]:
        personnel_type= data["sacco_personnel_details"]["personnel_type"]
        sacco_personnel.personnel_type=personnel_type
        sacco_personnel.save()

    if "is_active" in data["sacco_personnel_details"]:
        is_active= data["sacco_personnel_details"]["is_active"]
        sacco_personnel.is_active=is_active
        sacco_personnel.save()
    if "roles" in data["sacco_personnel_details"]:
        role_ids = data["sacco_personnel_details"]["roles"]
        for id in role_ids:
            role = validate_role(id, user)
                
            sacco_personnel.roles.add(role)
            sacco_personnel.user.allowed_roles.add(role)
            sacco_personnel.user.roles.add(role)
    return [], sacco_personnel    

def get_sacco_personnel(user):
    return SaccoPersonnel.objects.filter(entity=user.entity).all()

def get_sacco_personnel_by_owner(user):
    return SaccoPersonnel.objects.filter(entity=user.entity,owner=user).all()

def get_sacco_drivers(user):
    return SaccoPersonnel.objects.filter(entity=user.entity, personnel_type="DRIVER").all()

def create_sacco_subscription_payment(data, user):
    errors = []
    vehicle = None
    sacco_subscription = None
    telco_name = ""
    valid_from = None
    valid_to = None
    validity_days = None
    next_valid_from = None
    next_valid_to = None

    print("Create sacco subscription payment")
    if "vehicle" in data["sacco_subscription_payment_details"]:
        vehicle_id = data["sacco_subscription_payment_details"]["vehicle"]
        vehicle = validate_vehicle(vehicle_id)

    if "sacco_subscription" in data["sacco_subscription_payment_details"]:
        sacco_subscription_id = data["sacco_subscription_payment_details"]["sacco_subscription"]
        sacco_subscription = validate_sacco_subscription(sacco_subscription_id,user)

    if "payment_method" in data["sacco_subscription_payment_details"]:
        payment_method_id = data["sacco_subscription_payment_details"]["payment_method"]
        payment_method = validate_payment_method_exists(payment_method_id)

    if "mobile_money_phone_number" in data["sacco_subscription_payment_details"]:
        mobile_money_phone_number = data["sacco_subscription_payment_details"]["mobile_money_phone_number"]
        telco_name, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone_number)
        print ("telco name", telco_name)
        print ("formatted phone", formatted_phone_number)

    today = datetime.datetime.now()
    if SaccoSubscriptionPayment.objects.filter(vehicle=vehicle, sacco_subscription= sacco_subscription, valid_to__gte=today,status="SETTLED").exists():
        current_sacco_subscription_payment = SaccoSubscriptionPayment.objects.filter(vehicle=vehicle, sacco_subscription= sacco_subscription, valid_to__gte=today, status="SETTLED").order_by('-created').first()
 

        # Create next schedule payment
        if current_sacco_subscription_payment.sacco_subscription.schedule == "DAILY":
            """ Create next day payment"""
            valid_from = current_sacco_subscription_payment.valid_from + timedelta(days=1)
            valid_to = current_sacco_subscription_payment.valid_to + timedelta(days=1)
            validity_days = 1
            reference_number = generate_reference_number(vehicle.entity,user)
        if current_sacco_subscription_payment.sacco_subscription.schedule == "WEEKLY":
            """ Create next week payment"""
            valid_from = current_sacco_subscription_payment.valid_from + timedelta(days=7)
            valid_to = current_sacco_subscription_payment.valid_to + timedelta(days=7)
            validity_days = 7
            reference_number = generate_reference_number(vehicle.entity,user)
        if current_sacco_subscription_payment.sacco_subscription.schedule == "ANNUALLY":
            """ Create next week payment"""
            valid_from = current_sacco_subscription_payment.valid_from + timedelta(days=365)
            valid_to = current_sacco_subscription_payment.valid_to + timedelta(days=365)
            validity_days = 365
            reference_number = generate_reference_number(vehicle.entity,user)
        elif current_sacco_subscription_payment.sacco_subscription.schedule == "MONTHLY":
            """ Create next month payment : add one day to expiry date and use date to generate values for next month"""
            # current_valid_to_month = current_sacco_subscription_payment.valid_to.month
            # print("current_valid_to_month",current_valid_to_month)
            # next_valid_from = current_sacco_subscription_payment.valid_from + timedelta(days=1)
            next_valid_to_plus_one_day = current_sacco_subscription_payment.valid_to + timedelta(days=1)
            valid_from, valid_to,validity_days = get_first_and_last_days_of_month(datetime.datetime(next_valid_to_plus_one_day.year,next_valid_to_plus_one_day.month,next_valid_to_plus_one_day.day))
    
            print ("next_valid_from",valid_from)
            print ("next_valid_to",valid_to)
            print ("next_validity_days",validity_days)
            reference_number = generate_reference_number(vehicle.entity,user)
            # return [f"vbcvvf {sacco_subscription}"], None
        if payment_method.title =="MOBILE MONEY":
            payload = None
            if telco_name == "AIRTELMONEY":
                payload = json.dumps({
                        "orderId": reference_number,
                        "amount": str(int(sacco_subscription.amount)),
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
            elif telco_name == "MPESA":
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount": str(int(sacco_subscription.amount)),
                    "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                    "accountTo":  config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                    "description": "Merchant payment",
                    "modeOfPayment": "MOBILE_MONEY",
                    "provider": "Mpesa",
                    "data": {
                        "phoneNumber": formatted_phone_number,
                        "serviceType": "MERCHANTPAYMENT"
                    }
                    })
            errors=[]
            result_json=None
            # errors, result_json = jambopay_mobile_checkout(payload)
            if result_json:
                created = SaccoSubscriptionPayment.objects.create(
                vehicle=vehicle, 
                sacco_subscription=sacco_subscription, 
                valid_from=valid_from, 
                valid_to=valid_to, 
                validity_days=validity_days,
                reference_number = reference_number,
                entity= vehicle.entity,
                payment_method=payment_method,
                psp_reference_number = result_json["ref"],
                currency = result_json["currency"],
                amount = sacco_subscription.amount,
                status = "INITIATED",
                owner =user)
                return [], created
            else:
                print("Errors at mobile money",errors )

           
        elif payment_method.title == "JAMBOPAY WALLET":
            administrato_wallet = None
            wallet_balance = 0.00
            print("Jambopay Wallet", vehicle.administrator)
            if SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).exists():
                administrato_wallet = SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).first()
                print("Admin wallet", administrato_wallet)
                payload = {
                    "account_number": administrato_wallet.account_number
                }
                errors, wallet_balance = get_wallet_balance(payload)
                if wallet_balance:
                    if float(wallet_balance["balance"])> float(sacco_subscription.amount):
                        print("Sufficient Balance ", wallet_balance["balance"])
                        data =  json.dumps({
                                "callbackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                                "amount": str(sacco_subscription.amount),
                                "accountTo": sacco_subscription.sacco_settlement_account.account_number,
                                "accountFrom":administrato_wallet.account_number,
                                "orderId": generate_reference_number(vehicle.entity,vehicle.administrator.user),
                                
                                })
                        print("data at settle",data)

                        errors, result_json = initiate_jambopay_settlement(data)
                        print("resut at transfer", result_json)
                        if result_json:
                            created = SaccoSubscriptionPayment.objects.create(
                                vehicle=vehicle, 
                                sacco_subscription=sacco_subscription, 
                                valid_from=valid_from, 
                                valid_to=valid_to, 
                                validity_days=validity_days,
                                reference_number = reference_number,
                                entity= vehicle.entity,
                                payment_method=payment_method,
                                psp_reference_number = result_json["ref"],
                                amount = sacco_subscription.amount,
                                status = "INITIATED",
                                owner =user)
                            if created:
                                #     created = SaccoSubscriptionSettlement.objects.create(
                                #         sacco_subscription_payment = created,
                                #         sacco_settlement_account = sacco_subscription.sacco_settlement_account,
                                #         status ="SUCCESS",
                                #         psp_reference_number = result_json["ref"],
                                #         account_from = result_json["accountFrom"],
                                #         account_to = result_json["accountTo"],
                                #         amount = float( result_json["amount"]),
                                #         entity=vehicle.entity,
                                #         reference_number = created.reference_number
                                #  )

                                return [], created

            else:
                errors.append("Administrator has no wallet")
                return errors, None


        else:
            errors.append("No current subscription")
            return errors, None
        
        # errors.append(f"You have a current subscription expiring {current_sacco_subscription_payment.valid_to}")
        # return errors, None
            
    else:
        if sacco_subscription.schedule=="MONTHLY":
            valid_from, valid_to,validity_days = get_first_and_last_days_of_month(datetime.datetime.today())
            print("valid to first", valid_from)
            print("valid to last", valid_to)
            print("validity days", validity_days)
        elif sacco_subscription.schedule=="DAILY":
            valid_from = datetime.date.today()
            valid_to = datetime.date.today()
            validity_days = 1
        elif sacco_subscription.schedule=="WEEKLY":
            valid_from = datetime.date.today()
            valid_to = datetime.date.today()+ timedelta(days=7)
            validity_days = 7
        elif sacco_subscription.schedule=="ANNUALLY":
            today = datetime.datetime.today()
            valid_from = datetime.date(today.year,1,1)
            valid_to = datetime.date(today.year,12,31)
            validity_days = 365


        reference_number = generate_reference_number(vehicle.entity,user)
        if payment_method.title =="MOBILE MONEY":
            payload = None
            if telco_name == "AIRTELMONEY":
                payload = json.dumps({
                        "orderId": reference_number,
                        "amount": str(int(sacco_subscription.amount)),
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
            elif telco_name == "MPESA":
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount": str(int(sacco_subscription.amount)),
                    "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                    "accountTo":  config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                    "description": "Merchant payment",
                    "modeOfPayment": "MOBILE_MONEY",
                    "provider": "Mpesa",
                    "data": {
                        "phoneNumber": formatted_phone_number,
                        "serviceType": "MERCHANTPAYMENT"
                    }
                    })
            errors=[]
            result_json=None
            # errors, result_json = jambopay_mobile_checkout(payload)
            if result_json:
                created = SaccoSubscriptionPayment.objects.create(
                vehicle=vehicle, 
                sacco_subscription=sacco_subscription, 
                valid_from=valid_from, 
                valid_to=valid_to, 
                validity_days=validity_days,
                reference_number = reference_number,
                entity= vehicle.entity,
                payment_method=payment_method,
                psp_reference_number = result_json["ref"],
                currency = result_json["currency"],
                amount = sacco_subscription.amount,
                status = "INITIATED",
                owner =user)
                return [], created
            else:
                print("Errors at mobile money",errors )

           
        elif payment_method.title == "JAMBOPAY WALLET":
            administrato_wallet = None
            wallet_balance = 0.00
            print("Jambopay Wallet", vehicle.administrator)
            if SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).exists():
                administrato_wallet = SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).first()
                print("Admin wallet", administrato_wallet)
                payload = {
                    "account_number": administrato_wallet.account_number
                }
                errors, wallet_balance = get_wallet_balance(payload)
                if wallet_balance:
                    if float(wallet_balance["balance"])> float(sacco_subscription.amount):
                        print("Sufficient Balance ", wallet_balance["balance"])
                        data =  json.dumps({
                                "callbackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                                "amount": str(sacco_subscription.amount),
                                "accountTo": sacco_subscription.sacco_settlement_account.account_number,
                                "accountFrom":administrato_wallet.account_number,
                                "orderId": generate_reference_number(vehicle.entity,vehicle.administrator.user),
                                
                                })
                        print("data at settle",data)

                        errors, result_json = initiate_jambopay_settlement(data)
                        print("resut at transfer", result_json)
                        if result_json:
                            created = SaccoSubscriptionPayment.objects.create(
                                vehicle=vehicle, 
                                sacco_subscription=sacco_subscription, 
                                valid_from=valid_from, 
                                valid_to=valid_to, 
                                validity_days=validity_days,
                                reference_number = reference_number,
                                entity= vehicle.entity,
                                payment_method=payment_method,
                                psp_reference_number = result_json["ref"],
                                amount = sacco_subscription.amount,
                                status = "INITIATED",
                                owner =user)
                            if created:
                                #     created = SaccoSubscriptionSettlement.objects.create(
                                #         sacco_subscription_payment = created,
                                #         sacco_settlement_account = sacco_subscription.sacco_settlement_account,
                                #         status ="SUCCESS",
                                #         psp_reference_number = result_json["ref"],
                                #         account_from = result_json["accountFrom"],
                                #         account_to = result_json["accountTo"],
                                #         amount = float( result_json["amount"]),
                                #         entity=vehicle.entity,
                                #         reference_number = created.reference_number
                                #  )

                                return ["Err"], None

            else:
                errors.append("Administrator has no wallet")
                return errors, None


        else:
            errors.append("No current subscription")
            return errors, None
    
def get_sacco_personnel_profile(user):
    sacco_personnel_profile = None
    if SaccoPersonnel.objects.filter(user=user).exists():
        sacco_personnel_profile = SaccoPersonnel.objects.filter(user=user).first()
    return sacco_personnel_profile