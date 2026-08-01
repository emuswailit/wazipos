import pyotp
import requests
import json
import http
from rest_framework import exceptions
from ..signals import generate_key
from core import generate_token_utils
from authentication.models import Users
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms
from decouple import config

from . import utils
from utils.logging import create_log
from intergrations.jambopay.jambopay_create_user_profile import create_jambopay_profile
from intergrations.jambopay.jambopay_get_profile_accounts import get_jambopay_main_profile
from payments.models import UserAccounts,PaymentServicesProvider
from authentication.models import Entities

# from intergrations.jambopay_wallet import create_jambopay_user_profile


def create_user_jambopay_wallet_account(user_obj):
    print("USER AT VERIFY",user_obj)
    print("USER ENTITY AT VERIFY",user_obj.entity)
    psp =None
    errors =[]
    default_entity=None

    if Entities.objects.filter(title="WAZIPOS",entity_type="DEFAULT").exists():
        default_entity=Entities.objects.filter(title="WAZIPOS",entity_type="DEFAULT").first()
        print("DEFAULT ENTITY",default_entity)
    
    
    if PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
        psp = PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
    else:
        errors.append("Payment service provider named Jambopay not found")
        return errors, None

    
    errors, profile = get_jambopay_main_profile(user_obj.phone)
    if profile:
        print("User already has profile",profile)
        user_obj.is_jp_profile_updated = True
        user_obj.save()
        
        account = UserAccounts.objects.create(
            psp=psp, 
            account_number=profile["data"][0]["accountNo"],
            account_name=f"{user_obj.first_name} {user_obj.last_name}",
            account_type="WALLET",
            account_ownership="INDIVIDUAL",
            owner=user_obj,
            entity=default_entity
            )
        return errors, account
    else:
        cty = "toUpdate"
        if user_obj.county:
            cty = user_obj.county.title
        # Create new profile
        print("User has no wallet profile, try creating...")

        profile_data = {
                "firstName": user_obj.first_name,
                "lastName": user_obj.last_name,
                "identityNumber": user_obj.identifier_number,
                "identityType": user_obj.identifier_type,
                "phoneNumber": user_obj.phone,
                "gender": user_obj.gender,
                "dateOfBirth":user_obj.date_of_birth,
                "county": cty,
                "physicalAddress": cty,
                "email": user_obj.email
                }
        print("data at create", profile_data)

        errors, profile = create_jambopay_profile(profile_data)
        print("Create new user profile",profile)
        if profile:
            user_obj.is_jp_profile_updated = True
            user_obj.save()

            account = UserAccounts.objects.create(
            psp=psp, 
            account_number=profile["data"][0]["accountNo"],
            account_name=f"{user_obj.first_name} {user_obj.last_name}",
            account_type="WALLET",
            account_ownership="INDIVIDUAL",
            owner=user_obj,
                entity=default_entity
            )

            return errors, account
    

def send_password(user, password):
   
    # Phone number must be international and start with a plus '+'
    user_phone_number = user.phone
    url = "https://api.jambopay.co.ke/v1/payments/sms"
    token = generate_token_utils.generate_token()

    data = {
        "action": "Send",
        "callback_url": "https://webhook.site/3",
        "sms": [
            {
                "sender_name": "WAZIPOS-CT",
                "msisdn": f"{user.phone}",
                "message": f"Your Wazipos secret is {password}",
            }
        ],
    }

    result = requests.post(
        f"{url}",
        json=data,
        headers={"Accept": "application/json", "Access-Token": f"{token}"},
    )

    print("result5", result.json())

    result_json = result.json()
    if result_json["response_code"] == 0:
        return True
    else:
        return False

def send_new_password(user):
    from core.utils import  generate_password
    generated_password = generate_password()
    print("generated_password",generated_password.upper())
    create_log("info",f"pw change : {user.phone} : {generated_password}")
    user.set_password(generated_password)
    user.save()
    message =f"Your Wazipos secret is {generated_password} .Keep it yor secret. Do NOT share with any person"
    payload = {
            "contact" : user.phone,
            "message" : message,
            "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
            "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
        }

    errors, sent = send_swift_sms(payload)
    return user

def send_sms_code(user):
    print("User at code", user)
    time_otp = None
    if user.phone_otp_verified == "true":
        raise exceptions.ValidationError("Phone number is already OTP verified")
    # Time based otp

    if user.key:
        time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
        time_otp = time_otp.now()
        print("User has key", user.key)
    else:
        print("User no key")
        user.key = generate_key()
        print("New generated  key", user.key)
        user.save()
        time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
        time_otp = time_otp.now()

    print("OTP", time_otp)
    # Phone number must be international and start with a plus '+'
    user_phone_number = user.phone
    url = "https://api.jambopay.co.ke/v1/payments/sms"
    token = generate_token_utils.generate_token()
    create_log("info", f"OTP : {user.phone} : {time_otp}")

    data = {
        "action": "Send",
        "callback_url": "https://webhook.site/3",
        "sms": [
            {
                "sender_name": "WAZIPOS-CT",
                "msisdn": f"{user.phone}",
                "message": f"Wazipos verification code id {time_otp}",
            }
        ],
    }

    result = requests.post(
        f"{url}",
        json=data,
        headers={"Accept": "application/json", "Access-Token": f"{token}"},
    )

    print("result5", result.json())

    result_json = result.json()
    if result_json["response_code"] == 0:
        return True
    else:
        return False

    # result_data =
    # print('user_phone_number', user_phone_number)
    # client.messages.create(
    #     body="Your verification code is "+time_otp,
    #     from_=twilio_phone,
    #     to=user_phone_number
    # )
    # return Response(status=200)


def verify_otp(user, data):
    if user.phone_otp_verified == "true":
        raise exceptions.ValidationError("User is phone number already verified")

    validate = None
    otp = data["otp"]
    print("OTP", otp)
    try:
        validate = user.authenticate(int(otp))
        print("Validate",validate)
        if validate:
            user.phone_otp_verified = "true"
            user.save()

            #TODO Create jambopay wallet after OTP verification success
            return True

        else:
            print("OTP  vefification  failed", user)
            return False
    except Exception as e:
        print("Should print")
        print("error at verify otp", str(e))


def verify_corporate_user_otp(data):
    user =None
    otp = None
    errors =[]
    validate = None
    if "phone" in data and not data["phone"]=="":
        if Users.objects.filter(phone=data["phone"]).exists():
            user = Users.objects.filter(phone=data["phone"]).first()
            if user.phone_otp_verified=="true":
                print("at OTP",user.phone_otp_verified)
                errors.append("Phone number is already OTP verified")
                return errors,None
        else:
            errors.append("User with provided phone number does not exists")
            return errors,None
            
    else:
        errors.append("Phone number is required")
        return errors, None

    if "otp" in data and not data["otp"]=="":
        otp = data["otp"]
    else:
        errors.append("OTP is required") 
        return errors, None

    try:
        validate = user.authenticate(int(otp))
        print("Validate",validate)
        if validate:
            user.phone_otp_verified = "true"
            user.is_verified="true"
            user.is_profile_verified=True   
            user.save()

            #TODO Create jambopay wallet after OTP verification success
            
            if  user.entity.entity_type=="HOSPITAL":
                return [], user
            else:
                errors, account= create_user_jambopay_wallet_account(user)
                # errors,user = utils.create_user_account(user)
                # print("at create acc",errors)
                # print("at create acc",user)
                if account:
                    new_user=send_new_password(user)
                    if new_user:
  
                        return [], user
                    else:
                        errors.append("Error occurred while sending sms")
                        return errors,new_user
                else:
                    return errors, None
        else:
            errors.append("OTP not verified")
            return errors, None
    except Exception as e:
        print("Should print")
        print("error at verify otp", str(e))
        return str(e), None


def generate_otp(user):
    time_otp = None
    if user.phone_otp_verified == "true":
        raise exceptions.ValidationError("Phone number is already OTP verified")
    # Time based otp

    if user.key:
        time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
        time_otp = time_otp.now()
        print("User has key", user.key)
    else:
        print("User no key")
        user.key = generate_key()
        print("New generated  key", user.key)
        user.save()
    time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
    time_otp = time_otp.now()

    return time_otp


def send_corporate_user_sms_code(data):
    errors =[]
    user = None
    if "phone" in data and not data["phone"]=="":
        if Users.objects.filter(phone=data["phone"]).exists():
            user = Users.objects.filter(phone=data["phone"]).first()
        else:
            errors.append("User with provided phone number not found")
            return errors,None
    else:
        errors.append("Phone number is required")
        return errors, None

    time_otp = None
    if user.phone_otp_verified == "true":
        errors.append("Phone number is already OTP verified")
        return errors, None
    # Time based otp
    else:
        if user.key:
            time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
            time_otp = time_otp.now()
            print("User has key", user.key)
        else:
            print("User no key")
            user.key = generate_key()
            print("New generated  key", user.key)
            user.save()
    time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
    time_otp = time_otp.now()
    message =f"Mobiticket verification code id {time_otp}"
    payload = {
            "contact" : user.phone,
            "message" : message,
            "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
            "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
        }

    errors, sent = send_swift_sms(payload)
    print("errrors",errors)
    print("sent",sent)
    if sent or errors[0]==['Queued to the service']:
        return None, user
    else:
        return ["An error occurred"],None