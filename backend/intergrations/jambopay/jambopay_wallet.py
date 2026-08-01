import requests
from decouple import config
from transport.models import TicketPayment
from core.responses import custom_error_response
import json
from payments.models import PaymentMethods,EntityPSPCollectionAccount,JambopayUserProfiles
from utils.logging import create_log
from authentication.models import Entities, UserDocuments
from authentication.validators.authentication_models_validators import (
    validate_entity,
    validate_user,
)
from rest_framework import exceptions
from retailers.validators import model_validators
from retailers.models import CustomerOrderPayment
from django.db import transaction
from payments.validators import payments_models_validators


# from authentication.utils.utils import use_reference_number
token =None

def get_auth_token():
    token =None
    return token

# def get_auth_token():
#     the_data = {
#         "client_id": config("JAMBOPAY_CLIENT_ID"),
#         "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
#         "grant_type": config("JAMBOPA_GRANT_TYPE"),
#     }
#     headers = {"Content-Type": "application/x-www-form-urlencoded"}
#     # Execute the post
#     result = requests.post(config("JAMBOPAY_AUTH_URL"), data=the_data, headers=headers)
#     result_json = result.json()
#     if result_json and result_json["access_token"]:
#         return result_json["access_token"]
#     else:
#         return custom_error_response(
#             1, "Could not generate Jambopay authentication token"
#         )

# try:
#     token = get_auth_token()
# except Exception as e:
#     print(e)


def get_currencies():
    token =None
    headers = {
        "Authorization": "Bearer " + token,
    }
    result = requests.get(
        config(f"JAMBOPAY_BASE_URL") + f"/settings/currencies",
        headers=headers,
    )
    result_json = result.json()

    return [], result_json



@transaction.atomic
def create_own_jambopay_user_profile(user):
    errors=[]
    token = get_auth_token()
    payload = {
        "firstName": user.first_name,
        "lastName": user.last_name,
        "identityNumber": data.identifier_number,
        "identityType": data.identifier_type,
        "phoneNumber": user.phone,
        "gender": user.gender,
        "dateOfBirth": user.date_of_birth.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "county": "N/A",
        "physicalAddress": "N/A",
        "email": user.email,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    result = requests.post(
        config("JAMBOPAY_BASE_URL") + "/wallet/profile", data=payload, headers=headers
    )
    profile = result.json()
    if "firstName" in profile and "lastName" in profile and "identityNumber" in profile:
        user.is_jp_profile_updated = True
        user.save()

        return [], profile
    else:
        
        for i in profile["message"]:
            errors.append(i)
        return errors, None



@transaction.atomic
def create_jambopay_user_profile(data, admin):
    errors = []
    # Only admins can create user profiles
    # if not admin.is_staff:
    #     errors.append("Not authorized")
    #     return errors, None
    # Check if user ID is supplied and retrive user from db
    if "user" in data:
        user = validate_user(data["user"])
        if JambopayUserProfiles.objects.filter(user=user).exists():
            errors.append("User has already created a profile at Jambopay")
            return errors, None
        # Check if user is verified
        if not user.is_verified:
            errors.append("User is not verified")
            return errors, None
    else:
        errors.append("User ID is required")
        return errors, None

    document = None

    # if UserDocuments.objects.filter(is_verified="true", owner=user).exists():
    #     document = UserDocuments.objects.filter(is_verified="true", owner=user).first()
    # else:
    #     errors.append("User has no verified KYC documents")
    #     return errors, None
    token = get_auth_token()
    payload = {
        "firstName": user.first_name,
        "lastName": user.last_name,
        "identityNumber": user.identifier_number,
        "identityType": user.identifier_type,
        "phoneNumber": user.phone,
        "gender": user.gender,
        "dateOfBirth": user.date_of_birth.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "county": "N/A",
        "physicalAddress": "N/A",
        "email": user.email,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    result = requests.post(
        config("JAMBOPAY_BASE_URL") + "/wallet/profile", data=payload, headers=headers
    )
    profile = result.json()
    if "firstName" in profile and "lastName" in profile and "identityNumber" in profile:
        user.is_jp_profile_updated = True
        user.save()
        # User profile succesfully created
        # created = JambopayUserProfiles.objects.create(
        #     psp_id=data["psp"],
        #     user=user,
        #     profile_id=profile["id"]
        # )
        return [], profile
    else:
        
        for i in profile["message"]:
            errors.append(i)
        return errors, None
    

def check_user_jambopay_profile_by_phone(phone):
    errors =[]
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    query_params = {"phoneNumber": phone, "key2": "value2"}
    result = requests.get(
        config("JAMBOPAY_BASE_URL") + "/wallet/account",
        params=query_params,
        headers=headers,
    )

    profile = result.json()
    print("Profile resp", profile)

    if "data" in profile and len(profile["data"])>0:
        return True
    else:
        return False

def get_user_jambopay_profile_admin(data, user):
    token = get_auth_token()
    errors = []
    if not user.is_staff:
        errors.append("Not authorized")
        return errors, None
    if not "user" in data:
        errors.append("User ID is required")
        return errors, None
    query_user = validate_user(data["user"])
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    query_params = {"phoneNumber": query_user.phone, "key2": "value2"}
    result = requests.get(
        config("JAMBOPAY_BASE_URL") + "/wallet/account",
        params=query_params,
        headers=headers,
    )

    profile = result.json()
    print("Profile resp", profile)
    if "count" in profile and "data" in profile:
        tenant_accounts=[]
        print("DATA",profile["data"])
        for item in profile["data"]:
            print("Item ", item)
            print("Item number tenant ", item["tenant"])
            if item["tenant"]["phoneNumber"]=="25472217348":
                tenant_accounts.append(item)
        if len(tenant_accounts)>0:
            print("Create local account")

        else:

            print("No account, create remote")
            create_user_jambopay_profile_account(data,user)
        # for (item, index)  in enumerate(profile["data"]):
        #     # print(f"{str(index+1)}: ", item.accountNumber)
        #     if item['tenant']['phoneNumber']=="254722217348":
        #         print("there is an account item",item)
        #     else:
        #         print("Item different")
        return [], profile["data"]
    else:   
        data ={
            "action":"CreatePaymentServiceProviderProfile",
            "user":query_user.id,
            "psp":data['psp']
        }
        created_profile=create_jambopay_user_profile(data,user)
        if created_profile:

            # Create account for newly created profile
            create_user_jambopay_profile_account(data,user)
            print("Just created",created_profile)
            return [],created_profile
        else:
            for i in profile["message"]:
                errors.append(i)
            return errors, None


def get_wallet_balance(data):
    token = get_auth_token()
    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }
    data=json.dumps({
        "accountNo": data['account_number']
    })
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/balance",
            data=data,
            headers=headers,
        )
    result_json=result.json()
    if "message" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],result_json



def get_user_jambopay_profile_self(user,psp):
    token = get_auth_token()
    errors = []
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    query_params = {"phoneNumber": user.phone, "key2": "value2"}
    result = requests.get(
        config("JAMBOPAY_BASE_URL") + "/wallet/account",
        params=query_params,
        headers=headers,
    )
    profile = result.json()
    # print("Profile resp", profile)
    if "count" in profile and "data" in profile:

        for account in profile["data"]:
            if account['name']==user.entity.title and account['tenant']['identityNumber']=="21613803":
                if EntityPSPCollectionAccount.objects.filter(entity=user.entity).exists():
                    pass
                else:
                    created = EntityPSPCollectionAccount.objects.create(entity=user.entity,psp=psp,account_number=account["accountNo"],account_type="WALLET",is_verified=True)
       
                return [], account
            else:

                errors, account =create_whitelabel_account(user,psp)
                if account:
                    return [], account
                else:
                    for i in ["me"]:
                        errors.append(i)
                    return errors, None
                # Craete new entity whitelabel account 
            
                # return ["The user has no Wazipos tenancy wallet"], None
    else:
        
        # Craete user profile and account
        errors, profile = create_whitelabel_profile(user)
        if profile:
            errors, account =create_whitelabel_account(user,psp)
            if account:
                return [], account
            else:
                return errors, None


        else:
            for i in profile["message"]:
                errors.append(i)
            return errors, None



def create_user_jambopay_profile_account(data, user):
    query_user = None
    query_entity=None
    profile = None
    errors = []
    if "psp" in data and not data["psp"]=="":
            psp = payments_models_validators.validate_psp_exists(data["psp"])

    # if not user.is_staff:
    #     errors.append("Not authorised")
    #     return errors, None
        
    if not "entity" in data or data["entity"] == "":
        errors.append("Entity ID is required")
        return errors, None
    else:
        query_entity = validate_entity(data["entity"])
    if EntityPSPCollectionAccount.objects.filter(entity=query_entity).exists():
        errors.append("Entity already has a Jambopay account")
        return errors, None
        
    
    if not "user" in data or data["user"] == "":
        errors.append("User ID is required")
        return errors, None
    else:
        query_user = validate_user(data["user"])

    if not "currency" in data or data["currency"] == "":
        errors.append("Currency is required")
        return errors, None
    
    if not query_entity.owner==query_user:
        errors.append("Selected user is not owner of selected entity")
        return errors, None
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }
    data=json.dumps({
        "currency": "KES",
        "phoneNumber": query_user.phone, 
        "name": query_entity.title,
        "description": "Nachao Account",
        "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
        "accountType": "Individual"
    })
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/account",
            data=data,
            headers=headers,
        )
    result_json=result.json()
    if "accountNo" in result_json:
        created=EntityPSPCollectionAccount.objects.create(
            entity=query_entity,
            psp=psp,
            account_number=result_json["accountNo"],
            owner=query_user,
            account_type=result_json["accountType"],
        )

        
        return [], result_json
    else:
        if "message" in result_json:
            for m in result_json["message"]:
                errors.append(m)

            return errors, None


@transaction.atomic
def create_whitelabel_profile(user):
    errors = []
 
    # Check if user ID is supplied and retrive user from db
    if "user" in data:
        user = validate_user(data["user"])
        if JambopayUserProfiles.objects.filter(user=user).exists():
            errors.append("User has already created a profile at Jambopay")
            return errors, None
        # Check if user is verified
        if not user.is_verified:
            errors.append("User is not verified")
            return errors, None
    else:
        errors.append("User ID is required")
        return errors, None

    document = None

    if UserDocuments.objects.filter(is_verified="true", owner=user).exists():
        document = UserDocuments.objects.filter(is_verified="true", owner=user).first()
    else:
        errors.append("User has no verified KYC documents")
        return errors, None
    token = get_auth_token()
    data = {
        "firstName": user.first_name,
        "lastName": user.last_name,
        "identityNumber": document.document_number,
        "identityType": document.document_type,
        "phoneNumber": user.phone,
        "gender": user.gender,
        "dateOfBirth": user.date_of_birth.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "county": user.county.title,
        "physicalAddress": user.constituency.title,
        "email": user.email,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    result = requests.post(
        config("JAMBOPAY_BASE_URL") + "/wallet/profile", data=data, headers=headers
    )
    profile = result.json()
    if "firstName" in profile and "lastName" in profile and "identityNumber" in profile:
        # User profile succesfully created
        created = JambopayUserProfiles.objects.create(
            psp_id=data["psp"],
            user=user,
            profile_id=profile["id"]
        )
        return [], profile
    else:
        
        for i in profile["message"]:
            errors.append(i)
        return errors, None

def create_whitelabel_account(user,psp):
    errors =[]
    token = get_auth_token()
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }
    data=json.dumps({
        "currency": "KES",
        "phoneNumber": user.phone, 
        "name": user.entity.title,
        "description": "Nachao Account",
        "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
        "accountType": "Individual"
    })
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/account",
            data=data,
            headers=headers,
        )
    result_json=result.json()
    if "accountNo" in result_json:
        created=EntityPSPCollectionAccount.objects.create(
            entity=user.entity,
            psp=psp,
            account_number=result_json["accountNo"],
            owner=user,
            account_type=result_json["accountType"],
        )

        
        return [], result_json
    else:
        if "message" in result_json:
            for m in result_json["message"]:
                errors.append(m)

            return errors, None

def pay_entity_registration_fee(data, user):
    errors = []
    if not "entity" in data or data["entity"] == "":
        errors.append("Entity ID is required")
        return errors, None

    entity = validate_entity(data["entity"])
    if not entity.plan:
        errors.append("Entity has no plan")
        return errors, None
    # reference_number = generate_reference_number(entity, user)
    token = get_auth_token()
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }
    if reference_number:
        data = json.dumps(
            {
                "orderId": f"{reference_number}",
                "amount": f"{float(entity.plan.registration_fee)}",
                "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                "accountTo": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                "description": "Merchant payment",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "serviceType": config("JAMBOPAY_SERVICE_TYPE_1"),
                    "phoneNumber": f"{user.phone}",
                },
            }
        )

        result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/checkout/express",
            data=data,
            headers=headers,
        )
        result_json = result.json()
        print("RESULT JSON", result_json)
        payment_method = PaymentMethods.objects.filter(title="MPESA").first()
        default_entity = Entities.objects.filter(entity_type="DEFAULT").first()
        # payment = CustomerOrderPayment.objects.create(
        #     paying_entity=entity,
        #     receiving_entity=default_entity,
        #     payment_method=payment_method,
        #     reference_number=reference_number,
        #     psp_reference_number=result_json["ref"],
        #     provider_reference_number="",
        #     amount=float(entity.plan.registration_fee),
        #     narration="REGISTRATION",
        #     currency=result_json["currency"],
        #     owner=user,
        #     entity=default_entity,
        #     status="PENDING",
        # )
        return errors, result_json
    else:
        return errors, None



@transaction.atomic
def customer_order_payment(data,user):
    print("DaTA",data)
    payment_method=None
    default_entity=None
    payment_method=None
    if Entities.objects.filter(entity_type="DEFAULT").exists():
        default_entity=Entities.objects.filter(entity_type="DEFAULT").first()
    query_entity=None
    query_order=None
    phone_number=""
    errors=[""]
    payment =None
    psp_id=""
    if not "phone_number" in data or data["phone_number"] == "":
        errors.append("Phone number required")
        return errors, None
    else:
        phone_number = data["phone_number"]
    
    if not "payment_method" in data or data["payment_method"] == "":
        errors.append("Payment method ID required")
        return errors, None
    else:
        payment_method = data["payment_method"]

    if not "entity" in data or data["entity"] == "":
        errors.append("Entity ID is required")
        return errors, None
    else:
        query_entity = validate_entity(data["entity"])
    if not "psp" in data or data["psp"] == "":
        errors.append("PSP ID is required")
        return errors, None
    else:
        psp_id = data["psp"]
    
    if not "order" in data or data["order"] == "":
        errors.append("Order ID is required")
        return errors, None
    else:
        query_order=model_validators.validate_customer_order(data["order"])

    token = get_auth_token()
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }
    print("Order total",int(query_order.order_net_price_total))
    data = json.dumps({
        "orderId": query_order.document_number,
        "amount": int(query_order.order_net_price_total),
        "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
        "accountTo":  config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
        "description": "Merchant payment",
        "modeOfPayment": "MOBILE_MONEY",
        "provider": "Mpesa",
        "data": {
            "phoneNumber": phone_number,
            "serviceType": "MERCHANTPAYMENT"
        }
        })
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/checkout/express",
            data=data,
            headers=headers,
        )


    result_json=result.json()
    if "ref" in result_json:
        return [], result_json
    else:
        if "message" in result_json:
            for m in result_json["message"]:
                errors.append(m)
            return errors, None



def initiate_jambopay_settlement(data):
    errors =[]
    settlement=None

    token = get_auth_token()
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/transaction/transfer",
            data=data,
            headers=headers,
        )


    result_json=result.json()
    print("settlement result",result_json)
    if "ref" in result_json:
        settlement=result_json
        return [], settlement
    elif result_json["message"]:
        for m in result_json["message"]:
            errors.append(m)
        return errors, None


    # if len(errors)>0:
    #     return errors, None
    # else:
    #     return [], settlement


def get_account_by_phone(phone_number):
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    query_params = {"phoneNumber": phone_number, "key2": "value2"}
    result = requests.get(
        config("JAMBOPAY_BASE_URL") + "/wallet/account",
        params=query_params,
        headers=headers,
    )

    result_json = result.json()

    print("At get acc by phone",result_json)
    if "statusCode" in result_json and result_json["statusCode"]==400:
        errors = []
        for msg in result_json["message"]:
            errors.append(msg)
        return errors, None

    elif "data" in result_json:
        for acc in result_json["data"]:
            print("Def",acc["isDefault"])
            if acc["isDefault"]==True:
                print("Iko", acc["accountNo"])
                return [], acc["accountNo"]

def jambopay_wallet_checkout(data):
    token = get_auth_token()
    print("dataa",data)

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }
    data=json.dumps(data)
   
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/checkout/express",
            data=data,
            headers=headers,
        )
    print("res", result)
    result_json=result.json()
    return result_json
  
def jambopay_authorize_transaction(otp, ref):
    token = get_auth_token()
    data = {
        "otp": otp,
        "ref": ref,  
        "verificationType":"PIN"
        }

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }
    data=json.dumps(data)
   
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/transaction/authorize",
            data=data,
            headers=headers,
        )
   
    result_json=result.json()
    print("res", result_json)
    return result_json

def jambopay_authorize_wallet_payout(otp, ref):
    
    errors = []
    token = get_auth_token()
    payload = json.dumps({
        "otp": otp,
        "ref": ref,
        "verificationType":"PIN"
        })

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }

    try:
        requests.post(
                config("JAMBOPAY_BASE_URL") + "/payout/authorize",
                data=payload,
                headers=headers,
            )
        print("At authorize payout",otp+ref)
        return "OK"
    except Exception as e:
        print("Error", str(e))
        return "ERROR"
    # return result
    # result_json=result.json()
    # print("rs", result)
    # if "message" in result_json:
    #     for i in result_json["message"]:
    #         errors.append(i)
    #     return errors, None
    # else :
    #     return [],result_json 

# def jambopay_authorize_wallet_payout(data):
#     token = get_auth_token()

#     headers = {
#         "Content-Type": "application/json",
#         "Authorization": "Bearer " + token,
#     }
#     result = requests.post(
#             config("JAMBOPAY_BASE_URL") + "/payout/authorize",
#             data=data,
#             headers=headers,
#         )
   
#     result_json=result.json()
#     print("res", result_json)
#     return result_json

def payout_commission(amount,account_from,user,pin):
    from authentication.utils.utils import generate_reference_number
    import math
    commision_percent =0.5
    commission_amount = math.ceil(amount * commision_percent/100)
    reference_number = generate_reference_number(user.entity,user)
    # token = get_auth_token()
    token =None
    payload = json.dumps({
    "callbackUrl": config("PEER_TO_PEER_TRANSFER_CALLBACK"),
    "amount": commission_amount,
    "accountTo": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
    "accountFrom":account_from, 
    "orderId": reference_number,
    "verificationType":"PIN",
  
    })

    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/transaction/transfer",
            data=payload,
            headers=headers,
        )
    result_json=result.json()
    print("payout comm", result_json)

    if result_json and "ref" in result_json:
        payload1 = json.dumps({
        "otp": pin,
        "ref": result_json['ref'], 
        "verificationType":"PIN"
        })
        result1 = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/transaction/authorize",
            data=payload1,
            headers=headers,
        )
        result_json1=result1.json()
        print("commision", result_json1)


    # print("waalet to airtel result", result_json)
    # if "message" in result_json:
    #     for i in result_json["message"]:
    #         errors.append(i)
    #     return errors, None
    # else :
    #     return [],result_json

def jambopay_check_wallet_payment_status(psp_reference_number):
    errors = []
    description = "NA"
    headers = {
        "Authorization": "Bearer " + token,
    }
    result = requests.get(
        config(f"JAMBOPAY_BASE_URL") + f"/wallet/transaction/{psp_reference_number}",
        headers=headers,
    )
    result_json = result.json()

      
    return result_json

def get_user_jambopay_wallet_by_phone(phoneNUmber):
    jp_wallet = None
    errors=[]
    token = get_auth_token()
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    query_params = {"phoneNumber": phoneNUmber, "key2": "value2"}
    result = requests.get(
        config("JAMBOPAY_BASE_URL") + "/wallet/account",
        params=query_params,
        headers=headers,
    )

    profile = result.json()
    if "count" in profile and "data" in profile:
        tenant_accounts=[]
        # print("DATA",profile["data"])
        for account in profile["data"]:
            print("Item ", account)
            print("Item number tenant ", account["tenant"])
            if account["tenant"]["firstName"]=="Jambopay":
                tenant_accounts.append(account)
                jp_wallet = account
                
        # if len(tenant_accounts)>0:
        #     return [], tenant_accounts

    return jp_wallet

def payout_from_wallet_to_mpesa(account_from, account_ref, account_number, amount, reference_number,user,pin):
    
    token = get_auth_token()

    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }
    payload = json.dumps({
        "amount": amount,
        "accountFrom": account_from,
        "orderId": reference_number,
        "provider": "MOMO_B2C",
        "payTo": {
            "accountRef": account_ref,
            "accountNumber": account_number
        },
        "callBackUrl": "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
        "narration": "Send Money to MPesa",
        "verificationType":"PIN"
        })

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/payout",
            data=payload,
            headers=headers,
        )
    result_json=result.json()

    print("waalet to mpesa result", result_json)
    if "message" in result_json:
       
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        # payout_commission(amount,account_from,user,pin)
        return [],result_json
    
def payout_from_wallet_to_mpesa_2(data):
    
    token = get_auth_token()

    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }


    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/payout",
            data=data,
            headers=headers,
        )
    result_json=result.json()

    print("waalet to mpesa result", result_json)
    if "message" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        # payout_commission(amount,account_from,user,pin)
        return [],result_json

def payout_from_wallet_to_bank(account_from, account_number, account_ref, amount, bank_code, reference_number):
    
    token = get_auth_token()
    payload = json.dumps({
        "amount": amount,
        "accountFrom": account_from,
        "orderId": reference_number,
        "provider": "BANK",
        "payTo": {
            "accountRef": account_ref,
            "accountNumber":account_number,
            "bankCode": bank_code,
        },
        "callBackUrl": "https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31",
        "narration": "Wallet account withdrawal to bank",
        "verificationType":"PIN"
   
    })
    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/payout",
            data=payload,
            headers=headers,
        )
    result_json=result.json()

    print("waalet to bank result", result_json)
    if "message" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],result_json
def payout_from_wallet_to_bank_2(payload):
    
    token = get_auth_token()

    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/payout",
            data=payload,
            headers=headers,
        )
    result_json=result.json()

    print("waalet to bank result", result_json)
    if "message" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],result_json
    
def payout_from_wallet_to_till(account_from, account_number, amount, reference_number):
    
    token = get_auth_token()
    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }

    payload = json.dumps({
        "amount": amount,
        "accountFrom": account_from,
        "orderId":reference_number,
        "provider": "MOMO_B2B",
        "payTo": {
            "accountNumber": account_number
        },
        "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cbt",
        "narration": "Wallet to MPesa Till NO.",  
        "verificationType":"PIN"
        })

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/payout",
            data=payload,
            headers=headers,
        )
    result_json=result.json()

    print("waalet to bank result", result_json)
    if "message" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],result_json
    
def payout_from_wallet_to_paybill(payload):
    
    token = get_auth_token()

    # payload = json.dumps({
    #         "amount": amount,
    #         "accountFrom": account_from,
    #         "orderId": reference_number,
    #         "provider": "MOMO_B2B",
    #         "payTo": {
    #             "accountRef": account_number,
    #             "accountNumber": paybill_number
    #         },
    #         "callBackUrl": "https://webhook.site/7a311d8a-7c1b-4195-8640-e95e5ad616b3",
    #         "narration": "Wallet account withdrawal to pay bill",
    #           "verificationType":"PIN"
    #     })
    # print("payload at paybill", payload)
    # errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/payout",
            data=payload,
            headers=headers,
        )
    result_json=result.json()
    print("result at paybill", result_json)

    if "message" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],result_json

def payout_from_wallet_to_airtel(payload):
    
    token = get_auth_token()
    # payload = json.dumps({
    #     "amount": amount,
    #     "accountFrom": account_from,
    #     "orderId": reference_number,
    #     "provider": "MOMO_B2C",
    #     "payTo": {
    #         "accountRef": account_ref,
    #         "accountNumber": account_number,
    #     },
    #     "callBackUrl": "https://webhook.site/c49b13e2-eb9f-47ee-a673-e60ae6b92737",
    #     "narration": "Payout to Airtel Money",
    #       "verificationType":"PIN"
    #     })
    print("waalet to airtel data", payload)
    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/payout",
            data=payload,
            headers=headers,
        )
    result_json=result.json()

    print("waalet to airtel result", result_json)
    if "message" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],result_json
    


def check_wallet_pin(phoneNumber):
    token = get_auth_token()
    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }
    data=json.dumps({
        "phoneNumber":phoneNumber
    })
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/pin/check",
            data=data,
            headers=headers,
        )
    result_json=result.json()
    print("rs", result_json)
    if "message" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],result_json    
    
def set_wallet_pin(phoneNumber, pin):
    token = get_auth_token()
    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }
    data=json.dumps({
        "phoneNumber": phoneNumber,
        "pin": pin
        })
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/pin/set",
            data=data,
            headers=headers,
        )
    result_json=result.json()
    if "message" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],result_json  
    
def validate_wallet_pin(phoneNumber, pin):
    token = get_auth_token()
    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }
    data=json.dumps({
        "phoneNumber": phoneNumber,
        "pin": pin
        })
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/pin/validate",
            data=data,
            headers=headers,
        )
    result_json=result.json()
    if "statusCode" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],result_json["message"]



def change_wallet_pin(phoneNumber, pin):
    token = get_auth_token()
    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }
    data=json.dumps({
        "phoneNumber": phoneNumber,
        "pin": pin
        })
    result = requests.patch(
            config("JAMBOPAY_BASE_URL") + "/pin/update",
            data=data,
            headers=headers,
        )
    result_json=result.json()
    create_log("error",result_json)
    if "statusCode" in result_json:
        for i in result_json["message"]:
            errors.append(i)
        return errors, None
    else :
        return [],"Pin updated succesfully"  

def iprs_verify(idNumber):
    token = get_auth_token()
    errors=[]
    headers = {
        "Content-Type": "application/json",
         "Authorization": "Bearer " + token,
        
    }
    data=json.dumps({
    "idNumber": idNumber
    })
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/iprs/verify",
            data=data,
            headers=headers,
        )
    result_json=result.json()
    print("rj at iprs", result_json)
    if 'statusCode' in result_json and "message" in result_json:
        errors=result_json["message"]
        return errors, None
    else:
        return [], result_json


def mpesa_checkout(amount,phone_number, reference_number):
    errors =[]
    token = get_auth_token()
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }
    
    data = json.dumps({
        "orderId": reference_number,
        "amount": amount,
        "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
        "accountTo":  config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
        "description": "Merchant payment",
        "modeOfPayment": "MOBILE_MONEY",
        "provider": "Mpesa",
        "data": {
            "phoneNumber": phone_number,
            "serviceType": "MERCHANTPAYMENT"
        }
        })
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/checkout/express",
            data=data,
            headers=headers,
        )


    result_json=result.json()
    if "ref" in result_json:
        return [], result_json
    else:
        if "message" in result_json:
            for m in result_json["message"]:
                errors.append(m)
            return errors, None


def create_white_label_account(account_name,account_type, description, phone):
    errors =[]
    token = get_auth_token()
    payload=json.dumps({
                    "currency": "KES",
                    "phoneNumber": phone, 
                    "name": account_name,
                    "description": description,
                    "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                    "accountType":account_type
                })
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/account",
            data=payload,
            headers=headers,
        )
    result_json=result.json()
    if "accountNo" in result_json:
        
        return [], result_json
    else:
        if "message" in result_json:
            for m in result_json["message"]:
                errors.append(m)

            return errors, None