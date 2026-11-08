import datetime
import pyotp
import requests
import json
import http
from rest_framework import exceptions
from ..signals import generate_key
from core import generate_token_utils
from authentication.models import Users
from core.utils import send_sms
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
    errors, _sent = send_sms(user.phone, f"Your Wazipos secret is {password}")
    return not errors

def send_new_password(user):
    from core.utils import  generate_password
    generated_password = generate_password()
    print("generated_password",generated_password.upper())
    create_log("info",f"pw change : {user.phone} : {generated_password}")
    user.set_password(generated_password)
    user.save()
    message =f"Your Wazipos secret is {generated_password} .Keep it yor secret. Do NOT share with any person"
    errors, sent = send_sms(user.phone, message)
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

    errors, _sent = send_sms(user.phone, f"Wazipos verification code is {time_otp}")
    return not errors

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
    errors, sent = send_sms(user.phone, message)
    print("errrors",errors)
    print("sent",sent)
    if not errors:
        return None, user
    else:
        return ["An error occurred"],None

# ==========================================================
# Customer order payment reminders (utils SendSMS action)
# ==========================================================

REMINDER_COOLDOWN = datetime.timedelta(hours=12)  # at most one reminder per order every 12 hours


def send_customer_order_payment_reminder(customer_order_id, user):
    """
    Send an SMS reminding the customer to pay the balance of an overdue, unpaid
    CREDIT order.

    The message is built here, not taken from the client, so this endpoint can't be
    used to send arbitrary SMS. The order row is locked while sending and the send
    time is stored on the order, so double taps or several workers can't send twice
    inside the cooldown. Returns (errors, result).
    """
    from django.db import transaction
    from django.db.models import Sum
    from django.utils import timezone
    from retailers.models import CustomerOrders, CustomerOrderPayment
    from core.utils import normalize_phone

    if not customer_order_id:
        return ["customer_order is required"], None

    with transaction.atomic():
        try:
            # Lock first (plain row, no outer joins), then load the relations we need.
            CustomerOrders.objects.select_for_update().only("id").get(id=customer_order_id)
            order = CustomerOrders.objects.select_related(
                "entity", "order_number", "selected_payment_method"
            ).get(id=customer_order_id)
        except Exception:  # DoesNotExist, or a malformed id
            return ["Customer order not found"], None

        if not user.is_staff and order.entity_id != getattr(user, "entity_id", None):
            return ["You can only send reminders for your own orders"], None

        method = (order.selected_payment_method.title if order.selected_payment_method else "").strip().upper()
        if method != "CREDIT":
            return ["Reminders can only be sent for CREDIT orders"], None
        if str(order.is_paid).lower() == "true":
            return ["This order is already paid"], None
        if not order.due_date:
            return ["This order has no due date"], None

        today = timezone.localdate()
        if order.due_date >= today:
            return [f"This order is not overdue yet (due {order.due_date:%d %b %Y})"], None

        if not order.customer_phone:
            return ["This order has no customer phone number"], None
        phone_number = normalize_phone(order.customer_phone)
        if not phone_number:
            return [f"Invalid customer phone number: {order.customer_phone}"], None

        now = timezone.now()
        last_sent = order.last_payment_reminder_at
        if last_sent and now - last_sent < REMINDER_COOLDOWN:
            next_at = timezone.localtime(last_sent + REMINDER_COOLDOWN)
            return [f"A reminder was already sent for this order. You can send another after {next_at:%d %b %Y %H:%M}"], None

        # Same balance the order serializer reports (payment_summary.balance_due).
        owed = float(order.order_net_price_total if order.order_net_price_total is not None else order.order_price_total or 0)
        paid = float(
            CustomerOrderPayment.objects.filter(customer_order=order, status="SUCCESS")
            .aggregate(total=Sum("amount"))["total"] or 0
        )
        balance = round(max(0.0, owed - paid), 2)
        if balance <= 0:
            return ["This order has no outstanding balance"], None

        order_ref = order.order_number.document_number if order.order_number else str(order.id)[:8]
        name = (order.customer_name or "Customer").strip().split(" ")[0].title()
        days_overdue = (today - order.due_date).days
        balance_text = "balance" if paid > 0 else "payment"

        message = (
            f"Dear {name}, your {balance_text} of KES {balance:,.2f} to {order.entity.title} "
            f"for order {order_ref} was due on {order.due_date:%d %b %Y} "
            f"({days_overdue} day{'s' if days_overdue != 1 else ''} ago). "
            f"Please pay at your earliest convenience. Thank you."
        )

        errors, _result = send_sms(phone_number, message)
        if errors:
            create_log("error", f"Payment reminder for order {order.id} failed: {errors}")
            return errors, None

        # update() rather than save(): don't run save() side effects or bump `updated`.
        CustomerOrders.objects.filter(pk=order.pk).update(last_payment_reminder_at=now)

    create_log("info", f"Payment reminder sent for order {order.id} to {phone_number} by user {user.id}")
    return [], {
        "customer_order": str(order.id),
        "phone_number": phone_number,
        "message": message,
        "sent_at": now.isoformat(),
        "next_reminder_at": (now + REMINDER_COOLDOWN).isoformat(),
        "balance_due": balance,
        "days_overdue": days_overdue,
    }
