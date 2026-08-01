
import json

from celery import Celery
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from . import models
import requests
import time
from django.conf import settings
from rest_framework.exceptions import APIException
from payments.models import EntitySubscriptionsPayouts,UserAccounts,EntitySubscriptionsDailyLog
from core.date_utils import get_first_and_last_days_of_month
from datetime import datetime, timedelta,date
from authentication.utils.utils import generate_reference_number,use_reference_number
from intergrations.jambopay.jambopay_wallet import jambopay_wallet_checkout
from utils.logging import create_log
from payments.utils.payment_utils import get_service_charge
from utils.send_messages import send_sms
from utils.logging import create_log
from intergrations.jambopay.jambopay_wallet import get_wallet_balance
from intergrations.jambopay.jambopay_check_payment_status import jambopay_check_payment_status
import math
from decouple import config
from wifi.models import WifiSubscriptionPayments
from wholesalers.models import RetailerOrderPayments
from rest_framework import status
import json

# from datetime import datetime
# from apscheduler.schedulers.background import BackgroundScheduler
# from intergrations.jambopay_wallet import get_auth_token
# from payments.models import Payments
# import requests
# from decouple import config


# def start():
#     scheduler = BackgroundScheduler()
#     scheduler.add_job(check_jambopay_payment_status, "interval", seconds=30)
#     scheduler.start()


# def check_jambopay_payment_status():
#     token = get_auth_token()
#     print("Check payment status {}".format(datetime.now()))
#     payments = Payments.objects.filter(status="PENDING")
#     if len(payments) > 0:
#         for payment in payments:
#             print("Check payment status {}", len(payments))
#             headers = {
#                 "Authorization": "Bearer " + token,
#             }
#             print("REF", payment.psp_reference_number)
#             result = requests.get(
#                 config(f"JAMBOPAY_BASE_URL")
#                 + f"/wallet/transaction/{payment.psp_reference_number}",
#                 headers=headers,
#             )
#             result_json = result.json()
#             print("Result", result_json)
#             if result_json and result_json["status"] == "SUCCESS":
#                 payment.provider_reference_number = result_json["providerRef"]
#                 payment.status = result_json["status"]
#                 payment.save()
#             else:
#                 payment.status = result_json["status"]
#                 payment.save()

#             return result_json
#     else:
#         print("No pending payments")
app = Celery()
channel_layer = get_channel_layer()


@app.task
def process_daily_entity_subscriptions():
    print("Loggingggg")
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    installments_this_month = 0
    all_accounts = models.UserAccounts.objects.all()
    for account in all_accounts:
        subscriptions=[]
        balance =0.00
        subscriptions = account.entity_subscriptions.all()
        if len(subscriptions)<1:
            print("No subscriptions")
        else:
            payload = {
            "account_number": account.account_number
            }

            errors, balance_json =get_wallet_balance(payload)
            if balance_json and float(balance_json['balance'])>0:
                balance =float(balance_json['balance'])
                today=datetime.now()
                month =today.strftime('%B') 
                for subscription in subscriptions:
                    successful_installments_this_month = models.EntitySubscriptionsDailyLog.objects.filter(entity=account.entity,created__gte=first_day_this_month,status="SUCCESS",month=month).count()
                    if successful_installments_this_month>=subscription.total_installments:
                            print("User is fully subscribed")
                    else:
                        #Account has sufficient balance
                        if balance>=subscription.scheduled_installment_amount:
                            log = models.EntitySubscriptionsDailyLog.objects.create(entity=account.entity,entity_subscription=subscription,account_from=account,status="SUCCESS",month=month)
                            print("log",log.status)
                        else:
                            log = models.EntitySubscriptionsDailyLog.objects.create(entity=account.entity,entity_subscription=subscription,account_from=account,status="FAILED",month=month)
                            print("log",log.status)
            else:
                for subscription in subscriptions:
                    log = models.EntitySubscriptionsDailyLog.objects.create(entity=account.entity,entity_subscription=subscription,account_from=account,status="FAILED",month=month)
                    print("log",log.status)
                
                
      
def get_user_account_payins_today():
    
    qs = models.UserAccountsPayins.objects.filter(
            status="INITIATED"
        ).all().order_by("-created")

    return qs

def update_entity_subscription_installments(payment):
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    today=datetime.now()
    month =today.strftime('%B') 
    successfull_installments = EntitySubscriptionsDailyLog.objects.filter(month=month,created__gte=first_day_this_month,status="SUCCESS",entity_subscription=payment.entity_subscription).count() 

    if successfull_installments >=payment.entity_subscription.total_installments:
        return
    else:
        pending_subscriptions = payment.entity_subscription.total_installments
        payable_subscriptions = int(math.floor(float(payment.amount)/float(payment.entity_subscription.scheduled_installment_amount)))
        print("payable_subscriptions",payable_subscriptions)
        if payable_subscriptions<pending_subscriptions:
            for x in range(payable_subscriptions):
                created =EntitySubscriptionsDailyLog.objects.create(entity=payment.entity,status="SUCCESS",entity_subscription=payment.entity_subscription,month=month,account_from=payment.account)
                delete =EntitySubscriptionsDailyLog.objects.filter(entity=payment.entity,status="FAILED",entity_subscription=payment.entity_subscription,month=month,account_from=payment.account).first()
                delete.delete()

        else:
            for x in range(pending_subscriptions):
                created =EntitySubscriptionsDailyLog.objects.create(entity=payment.entity,status="SUCCESS",entity_subscription=payment.entity_subscription,month=month,account_from=payment.account)
            if EntitySubscriptionsDailyLog.objects.filter(entity=payment.entity,status="FAILED",entity_subscription=payment.entity_subscription,month=month,account_from=payment.account).exists():
                deletes =EntitySubscriptionsDailyLog.objects.filter(entity=payment.entity,status="FAILED",entity_subscription=payment.entity_subscription,month=month,account_from=payment.account).all()
                for x in range(deletes.count()):
                    x.delete()
                    
@app.task
def check_user_account_pay_in_status():
    payment =None

   
    payments = get_user_account_payins_today()
    
    if len(payments) > 0:
        for payment in payments:
          
            errors, result_json= jambopay_check_payment_status(payment.ref)
            print("errors",errors)
            print("result_json",result_json)
            if result_json and result_json["status"] == "SUCCESS":
               
                payment.provider_reference_number = result_json["providerRef"]
                payment.status = result_json["status"]
                payment.description = result_json["description"]
                payment.save()
                
                if payment.entity_subscription:
                    update_entity_subscription_installments(payment)
                
            elif result_json and result_json["status"]=="FAILED":
                print("RESULT JSON",result_json)
                payment.status="FAILED"
                payment.description=result_json['description']
                payment.save()

            else:

                return errors
       
    
    else:
        print("No pending user account to sync")

@app.task
def check_entity_registration_fee_payment_status():
    print("Checking entity registration fee payments ")
    # token = get_auth_token()
    token=None
    entity_registration_fee_payments = models.EntityRegistrationFeePayments.objects.filter(status="INITIATED").all()
    if len(entity_registration_fee_payments) > 0 and token:
        for payment in entity_registration_fee_payments:
            
            headers = {
                "Authorization": "Bearer " + token,
            }
            print("REF", payment.psp_reference_number)
            result = requests.get(
                config(f"JAMBOPAY_BASE_URL")
                + f"/wallet/transaction/{payment.psp_reference_number}",
                headers=headers,
            )
            result_json = result.json()
            print("Result", result_json)
            if result_json and result_json["status"] == "SUCCESS":
                payment.provider_reference_number = result_json["providerRef"]
                payment.status = result_json["status"]
                payment.save()
                payment.entity.registration_fee_paid="true"
                payment.entity.is_subscribed=True
                payment.entity.save()
            else:
                payment.status = result_json["status"]
                payment.save()

            return result_json
    else:
        print("No pending entity registration fee payments")

# Poll transaction for status
def poll_external_transaction_status(payment,entity, token):
    """
    Polls an external payment gateway API up to 60 times.
    Returns the final status dictionary or raises an exception if it times out.
    """
    # if WifiSubscriptionPayments.objects.filter(payout_reference_number=reference_number,entity=entity).exists():
    #     payment = WifiSubscriptionPayments.objects.get(payout_reference_number=reference_number,entity=entity)
    # else:
    #     raise APIException(
    #         detail=f"No payment found with reference number {reference_number} for entity {entity.title}.",
    #         code=status.HTTP_404_NOT_FOUND
    #     )
    max_attempts = 60
    attempt = 0
    delay_seconds = 3  # Time to wait between each poll

    while attempt < max_attempts:
        attempt += 1
        try:
            # response = requests.get(url, headers=headers, timeout=5)
            headers = {
                "Authorization": "Bearer " + token,
            }
            
            result = requests.get(
                config(f"JAMBOPAY_BASE_URL")
                + f"/wallet/transaction/{payment.payout_reference_number}",
                headers=headers,
                timeout=5
            )
            result_json = result.json()
            create_log("info",f"Polling result {result_json}")
            if result_json and "status" in result_json and result_json["status"] == "SUCCESS":
                payment.provider_reference_number = result_json["providerRef"]
                payment.status = result_json["status"]
                payment.save()
                payment.is_settled="true"
                payment.entity.save()
                create_log("info",f"poll_external_transaction_status: {payment.entity.title} payment successful")   
            else:
                payment.status = result_json["status"] if "status" in result_json else "FAILED"
                payment.is_settled="false"
                payment.save()
                create_log("error",f"poll_external_transaction_status: {payment.entity.title} payment failed")

            return result_json
                    
        except requests.RequestException as e:
            # Log the error but keep trying until max_attempts is reached
            print(f"Attempt {attempt} failed with network error: {e}")

        # Wait before the next attempt, unless it was the last one
        if attempt < max_attempts:
            time.sleep(delay_seconds)

    # If the loop finishes without returning, the polling timed out
    raise APIException(
        detail="Transaction verification timed out after 60 attempts.",
        code=status.HTTP_504_GATEWAY_TIMEOUT
    )

def payout_entity_amount(payment,entity,payout_amount,token,payout_account):
    reference_number=None
    payload=None

    reference_number = generate_reference_number(entity, entity.owner)
    
    headers = {
        
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "Accept": "*/*",
    }
    if payout_account.account_type=="BANK":
        payload = {
            "amount": int(payout_amount),
            "accountFrom": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
            "orderId": reference_number,
            "provider": "BANK",
            "payTo": {
                "accountRef": payout_account.account_number,
                "accountNumber":payout_account.account_number,
                "bankCode": payout_account.account_code,
            },
            "callBackUrl": "https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31",
            "narration": "Commision payout to bank",
          
        }
    
    elif payout_account.account_type=="MOBILE":
        payload = json.dumps({
            "amount": int(payout_amount),
            "accountFrom": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
            "orderId": reference_number,
            "provider": "MOMO_B2C",
            "payTo": {
                "accountRef": payout_account.account_number,
                "accountNumber":payout_account.account_number,
                
            },
            "callBackUrl": "https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31",
            "narration": "Commision payout to mobile money",
          
        })

    elif payout_account.account_type=="PAYBILL":
        payload = json.dumps({
            "amount": int(payout_amount),
            "accountFrom": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
            "orderId": reference_number,
            "provider": "MOMO_B2B",
            "payTo": {
                "accountRef": payout_account.account_number,
                "accountNumber":payout_account.account_number,
                
            },
            "callBackUrl": "https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31",
            "narration": "Commision payout to paybill",
           
        })
    elif payout_account.account_type=="TILL":
        payload = json.dumps({
            "amount": int(payout_amount),
            "accountFrom": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
            "orderId": reference_number,
            "provider": "MOMO_B2B",
            "payTo": {
            
                "accountNumber":payout_account.account_number,
                
            },
            "callBackUrl": "https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31",
            "narration": "Commision payout to till",
           
        })
    create_log("info",f"payout_commission_amount: Initiating commission payout to {entity.title} amount {commission_amount}: data: {payload}")
    result = requests.post(
        config("JAMBOPAY_BASE_URL") + "/payout",
        data=payload,
        headers=headers,
    )
    result_json=result.json()
    create_log("info",f"result_json {result_json}")
    if result_json and result_json['ref']:
        payment.payout_reference_number=result_json['orderId']
        payment.payout_amount=payout_amount
        payment.save()
        result= poll_external_transaction_status(payment, entity, token)
        # headers = {
        #     "Content-Type": "application/json",
        #     "Authorization": "Bearer " + token,
        #     "Accept": "*/*",
        # }
        # payload = {
        #     "otp": config("WAZIPOS_PO_KEY"),
        #     "ref": result_json['ref']
        # }
        # result = requests.get(
        #     config("JAMBOPAY_BASE_URL") + "/wallet/transaction/" + reference_number,
        #     data=payload,
        #     headers=headers,
        # )
        # result_json=result.json()
        # create_log("info",f"Payout result {result_json}")
        if result and result['status']=="SUCCESS":
            create_log("info",f"payout_commission_amount: {entity.title} commission payout successful")
            return result
        else:
            create_log("error",f"payout_commission_amount: {entity.title} commission payout failed")
            return result


def payout_commission_amount(payment,entity,commission_amount,token):
    reference_number = generate_reference_number(entity, entity.owner)
    
    headers = {
        
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "Accept": "*/*",
    }
    payload = {
            "amount": int(commission_amount),
            "accountFrom": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
            "orderId": reference_number,
            "provider": "BANK",
            "payTo": {
                "accountRef": config("WAZIPOS_COMMISSION_PAYOUT_ACCOUNT"),
                "accountNumber":config("WAZIPOS_COMMISSION_PAYOUT_ACCOUNT"),
                "bankCode": config("WAZIPOS_COMMISSION_PAYOUT_BANK_CODE"),
            },
            "callBackUrl": "https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31",
            "narration": "Commision payout to bank",
          
        }
    result_json = requests.post(
        config("JAMBOPAY_BASE_URL") + "/payout",
        data=payload,
        headers=headers,
    ) 
    if result_json and result_json['ref']:

        result= poll_external_transaction_status(payment, entity, token)
        if result and result['status']=="SUCCESS":
            payment.commission_paid="true"
            payment.commission_amount=commission_amount
            payment.save()
            create_log("info",f"payout_commission_amount: {entity.title} commission payout successful")
            return result
        else:
            create_log("error",f"payout_commission_amount: {entity.title} commission payout failed")
            return result

@app.task
def process_wifi_payments():
    create_log("info", "Process Wifi Payments Task: Started processing wifi payments")
    unsettled_payments=[]
    token = None

    if WifiSubscriptionPayments.objects.filter(is_settled="false",status="SUCCESS",amount__gte=10).exists():
        unsettled_payments = WifiSubscriptionPayments.objects.filter(is_settled="false",status="SUCCESS",amount__gte=10).all()
        #Generate token here
        the_data = {
                "client_id": config("JAMBOPAY_CLIENT_ID"),
                "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
                "grant_type": config("JAMBOPA_GRANT_TYPE"),
            }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
            # Execute the post
        result = requests.post(config("JAMBOPAY_AUTH_URL1"), data=the_data, headers=headers)
        result_json = result.json()

        token = result_json['access_token']
        for payment in unsettled_payments:
            if  models.PayoutAccounts.objects.filter(entity=payment.entity).exists():
                payout_account = models.PayoutAccounts.objects.get(entity=payment.entity)
            else:
                    create_log("error",f"Process Wifi Payments Task: {payment.entity.title} has no payout account")
                    return None
            
            if not payout_account:
                create_log("error",f"Process Wifi Payments Task: {payment.entity.title} has no payout account")
                return None
            if not payment.entity.commission_percentage:
                create_log("error",f"Process Wifi Payments Task: {payment.entity.title} has no commission percentage set")
                return None
            commission_amount = payment.amount * (payment.entity.commission_percentage/100)
            payout_amount = payment.amount - commission_amount
            if payout_amount>9.0 and payout_amount<10.0:
                payout_amount=10
            entity_payout_json = payout_entity_amount(payment, payment.entity,payout_amount, token,payout_account)
            # entity_result_json = payout_entity_amount(payout_amount, token,payout_account)
            if entity_payout_json and entity_payout_json['status']=="SUCCESS":
                payment.is_settled="true"
                payment.save()
                create_log("info",f"Process Wifi Payments Task: {payment.entity.title} commission payout successful")
                
                commission_payout_json = payout_commission_amount(payment, payment.entity,commission_amount, token)
                if commission_payout_json and commission_payout_json['status']=="SUCCESS":
                    payment.commission_paid="true"
                    payment.commission_amount=commission_amount
                    payment.save()
                    create_log("info",f"Process Wifi Payments Task: {payment.entity.title} commission payout successful")
                
                return None
            else:
                create_log("error",f"Process Wifi Payments Task: {payment.entity.title} commission payout failed")
                return None
         
    else:
        create_log("info", "No unsettled wifi payments")


@app.task
def process_retailer_order_payments():
    unsettled_payments =[]
    token=None

    if RetailerOrderPayments.objects.filter(is_settled="false",status="SUCCESS",amount__gte=10).exists():
        unsettled_payments = RetailerOrderPayments.objects.filter(is_settled="false",status="SUCCESS",amount__gte=10).all()
        #Generate token here
        the_data = {
                "client_id": config("JAMBOPAY_CLIENT_ID"),
                "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
                "grant_type": config("JAMBOPA_GRANT_TYPE"),
            }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
            # Execute the post
        result = requests.post(config("JAMBOPAY_AUTH_URL1"), data=the_data, headers=headers)
        result_json = result.json()

        token = result_json['access_token']
        for payment in unsettled_payments:
            if  models.PayoutAccounts.objects.filter(entity=payment.entity).exists():
                payout_account = models.PayoutAccounts.objects.get(entity=payment.entity)
            else:
                    create_log("error",f"Process Retailer Order Payments Task: {payment.entity.title} has no payout account")
                    return None
            
            if not payout_account:
                create_log("error",f"Process Retailer Order Payments Task: {payment.entity.title} has no payout account")
                return None
            if not payment.entity.commission_percentage:
                create_log("error",f"Process Retailer Order Payments Task: {payment.entity.title} has no commission percentage set")
                return None
            
            
            commission_amount = payment.amount * (payment.entity.commission_percentage/100)
            entity_amount = payment.amount - commission_amount
            if entity_amount>9.0 and entity_amount<10.0:
                # entity_amount=10
                create_log("info",f"Process Retailer Order Payments Task: {payment.entity.title} entity amount {entity_amount} is less than 10" )
                return None

            
            entity_payout_json = payout_entity_amount(payment, payment.entity,commission_amount, token,payout_account)
            # entity_result_json = payout_entity_amount(entity_amount, token,payout_account)
            if entity_payout_json and entity_payout_json['status']=="SUCCESS":
                payment.is_settled="true"
                payment.save()
                create_log("info",f"Process Retailer Order Payments Task: {payment.entity.title} commission payout successful")
                
                commission_payout_json = payout_commission_amount(payment, payment.entity,commission_amount, token)
                if commission_payout_json and commission_payout_json['status']=="SUCCESS":
                    payment.commission_paid="true"
                    payment.commission_amount=commission_amount
                    payment.save()
                    create_log("info",f"Process Retailer Order Payments Task: {payment.entity.title} commission payout successful")    
                    return None
            else:
                create_log("error",f"Process Retailer Order Payments Task: {payment.entity.title} commission payout failed")
                return None