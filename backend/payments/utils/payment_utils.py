from payments.validators import payments_models_validators
from authentication.validators.authentication_models_validators import validate_entity_branch, validate_entity, validate_user
from payments.models import PayoutAccounts, BranchCollectionAccount, PaymentServicesProvider,EntityPSPCollectionAccount,OfflinePayments
from intergrations.jambopay.jambopay_create_whitelabel_account import create_white_label_account
from intergrations.jambopay.jambopay_wallet import get_wallet_balance, check_user_jambopay_profile_by_phone,create_own_jambopay_user_profile,iprs_verify
from utils.encription import encrypt
from employees.validators.employees_models_validators import validate_entity_employee, validate_employee

# from intergrations.jambopay.jambopay_mobile_checkout import jambopay_mobile_checkout
from .. import models

import json
from core.phone_number_utils import get_telco_by_phone_number
from core.date_utils import get_first_and_last_days_of_month,get_this_week_from_iso_calendar
from datetime import datetime, timedelta
from ..models import UserAccounts,EntitySubscriptions,EntitySubscriptionsPayouts
from decouple import config
def create_payout_account(data, user):
    errors =[]
    psp = None
    psp_branch = None
    account_number = None
    account_name = None
    account_type = None
    description=None
    business_number=None
    account_code=None
    existing_account=None

    default_psp=None

    # if  PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
    #         default_psp= PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    # else:
    #     errors.append("No such payment services provider")
    # if not "payout_account_details" in data:
    #     errors.append("Payout details are required")

    # if not "psp" in data["payout_account_details"] or data["payout_account_details"]["psp"]=="" :
    #     errors.append("Payment service provider ID is required")
    # else:
    #     psp_id = data["payout_account_details"]["psp"]
    #     psp = payments_models_validators.validate_psp_exists(psp_id)
    # if "psp_branch" in data["payout_account_details"]["psp"] and not data["payout_account_details"]["psp"]=="":
    #     psp_branch_id = data["payout_account_details"]["psp"]
    #     psp_branch = payments_models_validators.validate_psp_branch(psp_branch_id)

    if not "account_number" in data["payout_account_details"] or data["payout_account_details"]["account_number"]=="":
        errors.append("Account number is required")
    else:
        account_number =  data["payout_account_details"]["account_number"]

    if not "account_name" in data["payout_account_details"] or data["payout_account_details"]["account_name"]=="":
        errors.append("Account name is required")
    else:
        account_name =  data["payout_account_details"]["account_name"]

    if not "account_type" in data["payout_account_details"] or data["payout_account_details"]["account_type"]=="":
        errors.append("Account type is required")
    else:
        account_type =  data["payout_account_details"]["account_type"]

    if "description" in data:
        description = data["payout_account_details"]["description"]

    if "business_number" in data:
        business_number = data["payout_account_details"]["business_number"]

    if "account_code" in data:
        account_code = data["payout_account_details"]["account_code"]

    if len(errors)>0:
        return errors, None
    else:
        if PayoutAccounts.objects.filter(entity=user.entity,account_number=account_number).exists():
            errors.append("An account with similar details already exists  ")
            return errors, None
        if PayoutAccounts.objects.filter(entity=user.entity,is_active="true").exists():
            existing_account = PayoutAccounts.objects.filter(entity=user.entity,is_active="true").first()

        created = PayoutAccounts.objects.create(
                                               
                                                account_name=account_name, 
                                                account_type=account_type, 
                                                description= description,
                                                account_number=account_number,
                                                account_code=account_code,
                                                business_number=business_number,
                                                owner=user,
                                               entity=user.entity)
        if existing_account:
            existing_account.is_active="false"
            existing_account.save()
            
        if created:

            return [], created
        else:
            errors.append("Account not created")
            return errors, None
        


def create_branch_collection_account(data, user):
    phone = None
    errors = []
    branch = None
    phone = None
    default_psp=None

    if  PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
            default_psp= PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    else:
        errors.append("No such payment services provider")
    

    if not "phone" in data["collection_account_details"] or data["collection_account_details"]["phone"]=="":
        errors.append("Phone number is required")
        return errors, None
    else:
        phone = data["collection_account_details"]["phone"]
    if not "branch" in data["collection_account_details"] or data["collection_account_details"]["branch"]=="":
        errors.append("Branch ID is required")
        return errors, None
    else:
        print("Branch", data["collection_account_details"]["branch"])
        branch = validate_entity_branch(data["collection_account_details"]["branch"])
        if BranchCollectionAccount.objects.filter(branch=branch).exists():
            errors.append("Account for branch already exists")
            return errors, None
    if len(errors)>0:
        return errors, None
    else:
        payload=json.dumps({
                        "currency": "KES",
                        "phoneNumber": phone, 
                        "name": branch.title,
                        "description": f"Sales collection accounf for {branch.title} branch",
                        "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                        "accountType": "Individual"
                    })

        errors, account =create_white_label_account(payload)

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
                return [], created
            else:
                return errors, None 

def create_user_account_admin(data,user):
    user=None
    errors = []
    if "user" in data and not data["user"]=="":
        user = validate_user(data["user"])
    else:
        errors.append("User ID is required")
        return errors, None

    if models.UserAccounts.objects.filter(owner=user).exists():
        errors.append("User account already exists")
        return errors,None
    
    if  PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
            default_psp= PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    else:
        errors.append("No such payment services provider")
    if user.phone:
        telco,phone_number = get_telco_by_phone_number(user.phone)
    else:
        errors.append("User has no phone number")
        return errors, None
    if phone_number is None:
        errors.append("Phone number could not be resolved")
        return errors,None
    payload=json.dumps({
                    "currency": "KES",
                    "phoneNumber": phone_number, 
                    "name":f"{user.first_name} {user.last_name}",
                    "description": f"User account  for {user.first_name} {user.last_name}",
                    "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                    "accountType": "Individual"
                })

    errors, account =create_white_label_account(payload)

    if account:
        created=UserAccounts.objects.create(
            psp=default_psp,
            account_number=account["accountNo"],
            account_name=account["name"],
            account_type="WALLET",
            account_phone=phone_number,
            currency=account["currency"],
            entity=user.entity,
            owner=user,
        )
        if created:
            return [], created
        else:
            return errors, None 
    else:
        return errors, None
            
def create_user_account(data, user):
    account_phone = None
    errors = []
    default_psp=None
    entity = None
    identifier_type=""
    identifier_number =""
    profile = None

    if UserAccounts.objects.filter(owner=user).exists():
        errors.append(f"Account already exists for {user}")
        return errors,None

    if  PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
            default_psp= PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    else:
        errors.append("No such payment services provider")

    if "identifier_type" in data and not data["identifier_type"]=="":
        identifier_type = data["identifier_type"]
    else:
        errors.append("Identifier type is required")
        return errors, None
    
    if "identifier_number" in data and not data["identifier_number"]=="":
        identifier_number = data["identifier_number"]
    else:
        errors.append("Identifier number is required")
        return errors, None
    
    errors,result = iprs_verify(identifier_number)
    print("iprs resilt", result)
    print("iprs errors", errors)

    if result and "idNumber" in result:
        user.identifier_number = identifier_number
        user.identifier_type = identifier_type
        user.save()
        if result["gender"]=="F":
            user.gender = "Female"
            user.save()
        elif result["gender"]=="M":
            user.gender = "Male"
            user.save()
    else:
        return errors, None
                    

    exists = check_user_jambopay_profile_by_phone(user.phone)
    print("at exist ", exists)
    if exists:
        profile=exists

    else:
        created = create_own_jambopay_user_profile(user)
        print("at created ", created)
        if created:
            profile=created

    if profile:
        if len(errors)>0:
            return errors, None
        else:
            payload=json.dumps({
                            "currency": "KES",
                            "phoneNumber": user.phone, 
                            "name":f"{user.first_name} {user.last_name}",
                            "description": f"User account  for {user.first_name} {user.last_name}",
                            "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                            "accountType": "Individual"
                        })

            errors, account =create_white_label_account(payload)

            if account:
                created=UserAccounts.objects.create(
                    psp=default_psp,
                    account_number=account["accountNo"],
                    account_name=account["name"],
                    account_type="WALLET",
                    account_phone=user.phone,
                    currency=account["currency"],
                    entity=user.entity,
                    owner=user,
                )
                if created:
                    return [], created
                else:
                    return errors, None 
            else:
                return errors, None
    else:
        errors.append("Jambopay details missing or could not be created")
        return errors, None



def update_payout_account(data, user):
    errors =[]
    payout_account = None
    
    # Deactivate all other active accounts
    if not "payout_account_id" in data or data["payout_account_id"]=="":
        errors.append("Payout account ID is required")
        return errors, None
    else:
        payout_account_id = data["payout_account_id"]
        if models.PayoutAccounts.objects.filter(id=payout_account_id).exists():
            payout_account = models.PayoutAccounts.objects.filter(id=payout_account_id).first()
    
    
    
    if  "account_name" in data["payout_account_details"] and not  data["payout_account_details"]["account_name"]=="":
        payout_account.account_name =  data["payout_account_details"]["account_name"]
    
    if  "status" in data["payout_account_details"] and not  data["payout_account_details"]["status"]=="":
        payout_account.is_active =  data["payout_account_details"]["status"]



    if len(errors)>0:
        return errors, None
    else:
        payout_account.save()
        return [], payout_account

def retrieve_bar_collection(days_ago,branch_collection_account):
    entity_collection= []
    
    today = datetime.today()
    
    for x in range(days_ago):
        qs= []
        total_day_bar_collection=0.00
        this_date = today - timedelta(days = x)
        
        # qs = models.BarOrderPaymentSettlement.objects.filter(created__date=this_date,branch_collection_account=branch_collection_account).all()
        print("qs", qs)
        for i in qs:
            total_day_bar_collection = total_day_bar_collection + float(i.amount)
        else:
            print("No match")

        entity_collection.append({"value":total_day_bar_collection,"number":len(qs),"date":f"{this_date.date()}"})

    return entity_collection

def retrieve_branch_collection_account_data(user):
    errors = []
    data= {}
    employee = None
    employee = validate_employee(user)
    user_account = None
    if UserAccounts.objects.filter(owner = user).exists():
        user_account = UserAccounts.objects.filter(owner = user).first()

        payload = {
            "account_number": user_account.account_number
        }
        errors, balance_json = get_wallet_balance(payload)
        days_ago = 7

        data = {
            "acccount_details":{
                "account_name":user_account.account_name,
                "account_number":user_account.account_number,
                "account_phone":user_account.account_phone,
                "current_balance":balance_json["balance"]
            },
            # "entity_collection": retrieve_bar_collection(days_ago,user_account),
     
            
        }
        return [], data
    else:
        errors.append("Account for this entity does not exist")
        return errors, data
    

def check_jambopay_profile_exists_by_phone(data):
    errors =[]
    if not "phone" in data or data["phone"]=="":
        errors.append("Phone number is srequired")
        return errors, None
    else:
        exists = check_user_jambopay_profile_by_phone(data["phone"])


        return  exists
    


def create_offline_payment(data):
    errors =[]
    status = None
    ref =None
    amount = None
    checksum =None
    accountNo=None
    orderId=None
    providerRef=None
    description=""

    if not "status" in data or data["status"]=="":
        errors.append("status is required")
        return errors, None
    else:
        status = data["status"]

    if not "ref" in data or data["ref"]=="":
        errors.append("ref is required")
        return errors, None
    else:
        ref = data["ref"]

    if not "amount" in data or data["amount"]==None:
        errors.append("amount is required")
        return errors, None
    else:
        amount = data["amount"]

    if not "checksum" in data or data["checksum"]=="":
        errors.append("checksum is required")
        return errors, None
    else:
        checksum = data["checksum"]


    if not "accountNo" in data or data["accountNo"]=="":
        errors.append("accountNo is required")
        return errors, None
    else:
        accountNo = data["accountNo"]

    if not "orderId" in data or data["orderId"]=="":
        errors.append("orderId is required")
        return errors, None
    else:
        orderId = data["orderId"]


    if not "providerRef" in data or data["providerRef"]=="":
        errors.append("providerRef is required")
        return errors, None
    else:
        providerRef = data["providerRef"]

    if "description" in data:
        description = data["description"]

    if OfflinePayments.objects.filter(ref=ref,orderId=orderId).exists():
        errors.append(f"Similar entry already exists")
        return errors, None
    else:
        try:
            offline_payment = OfflinePayments.objects.create(status=status,providerRef=providerRef,orderId=orderId,accountNo=accountNo,amount=amount,ref=ref,description=description,checksum=checksum)
            if offline_payment:
                return [],offline_payment
        except Exception as e:
            errors.append(str(e))
            return errors,None
        
def create_peer_to_peer_payment(data):
    created = models.PeerToPeerPayments.objects.create(
        status=data['status'], 
        amount=data['amount'],
        description=data['description'],
        ref=data['ref'],
        orderId=data['orderId'],
        providerRef=data['providerRef'],
        runningBalance=data['runningBalance'],
        checksum=data['checksum'],
        
        )
    return [],created

def calculate_subscriptions_retention_today(msisdn):
    account = None
    amount_to_retain = 0.00
    entity_subscription_payments_so_far =0
    entity_subscription_payment_this_week=None
    entity_subscription_payment_this_month=None
    if UserAccounts.objects.filter(account_phone=msisdn).exists():
       account = UserAccounts.objects.filter(account_phone=msisdn).first()

    
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
   
    
    entity_subscriptions = account.entity_subscriptions.all()
    for subscription in entity_subscriptions:
        if subscription.schedule=="DAILY":
            entity_subscription_payments_so_far = EntitySubscriptionsPayouts.objects.filter(created__gte=first_day_this_month).count()
            if entity_subscription_payments_so_far==subscription.total_installments:
                amount_to_retain+=0.00
            elif  entity_subscription_payments_so_far<subscription.total_installments:
                amount_to_retain+=float(subscription.scheduled_installment_amount)
               
        elif subscription.schedule=="WEEKLY":
             entity_subscription_payment_this_week = EntitySubscriptionsPayouts.objects.filter(created__week=get_this_week_from_iso_calendar).count()
             if entity_subscription_payment_this_week<1:
                amount_to_retain+=subscription.scheduled_installment_amount
                 
        elif subscription.schedule=="MONTHLY":
            entity_subscription_payment_this_month = EntitySubscriptionsPayouts.objects.filter(created__gte=first_day_this_month,created__lt=last_day_this_month).count()
            if entity_subscription_payment_this_month<1:
                amount_to_retain+=subscription.scheduled_installment_amount

    return amount_to_retain


def get_service_charge(amount):
    percentage = 0.5
    return amount*percentage/100

def get_user_account_payins(user):
    user_account=None
    payins =[]
    today = datetime.today()
    if models.UserAccounts.objects.filter(owner=user).exists():
        user_account=models.UserAccounts.objects.filter(owner=user).first()
    if models.UserAccountsPayins.objects.filter(account_from=user_account).exists():
        payins=models.UserAccountsPayins.objects.filter(account_from=user_account,created__gte=today).all()

    return payins

def get_user_account_payouts(user):
    user_account=None
    payins =[]
    today = datetime.today()
    if models.UserAccounts.objects.filter(owner=user).exists():
        user_account=models.UserAccounts.objects.filter(owner=user).first()
    if models.UserAccountsPayouts.objects.filter(account_from=user_account).exists():
        payins=models.UserAccountsPayouts.objects.filter(account_from=user_account,created__gte=today).all()

    return payins


def create_entity_registration_fee_payment(user,data):
    from authentication.utils.utils import get_telco_by_phone_number,generate_reference_number,use_reference_number
    errors=[]
    mobile_money_phone=None
    if user.entity.registration_fee <1:
        errors.append("Fee amount error")
        return errors,None
    if models.EntityRegistrationFeePayments.objects.filter(entity=user.entity,status="SUCCESS").exists():
        errors.append(f"{user.entity} is already paid up")
        return errors,None

    
    if not "mobile_money_number" in data or data['mobile_money_number']=="":
        errors.append("Paying phone number is required")
        return errors,None
    else:
        mobile_money_phone=data['mobile_money_number']
        reference_number = generate_reference_number(user.entity,user)
        telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
        
    

        if telco=="MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(user.entity.registration_fee),
                "callBackUrl": "https://api.wazipos.com/api/v1/payments/payments/offline",
                "accountTo":  config('WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT'),
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
                "amount": int(user.entity.registration_fee),
                "callBackUrl": "https://api.wazipos.com/api/v1/payments/payments/offline",
                "accountTo":config('WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT'),
                "currency":"KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "MERCHANTPAYMENT" 
                }
        
                })
    
        errors=[]
        result_json=None
        # errors, result_json = jambopay_mobile_checkout(payload)
        if result_json:
            created = models.EntityRegistrationFeePayments.objects.create(
                reference_number=reference_number,
                status="INITIATED",
                amount=float(user.entity.registration_fee),
                entity=user.entity,
                owner=user,
                psp_reference_number= result_json["ref"],
                telco= telco,
                msisdn=mobile_money_phone
            )
            use_reference_number(reference_number)
            if created:
                return [], created
            else:
                errors.append("Entity registration fee payment not created")
                return errors, None
            
        else:
            errors.append("An error occurred")
            return errors,None


            


