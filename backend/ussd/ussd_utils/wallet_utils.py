import json
import time
from payments.models import UserAccounts, EntitySubscriptions,EntitySubscriptionsDailyLog,UserAccountsPayouts,UserAccountsPayins
from intergrations.jambopay.jambopay_wallet import check_wallet_pin,set_wallet_pin,get_wallet_balance,validate_wallet_pin
from core.phone_number_utils import get_telco_by_phone_number
from authentication.utils.utils import generate_reference_number
from payments.utils.payment_utils import calculate_subscriptions_retention_today
from datetime import datetime
from intergrations.jambopay.jambopay_wallet import validate_wallet_pin,set_wallet_pin,change_wallet_pin
# from intergrations.jambopay.jambopay_mobile_checkout import jambopay_mobile_checkout
from intergrations.jambopay.jambopay_wallet import get_user_jambopay_wallet_by_phone,get_wallet_balance,check_wallet_pin, set_wallet_pin, payout_from_wallet_to_airtel,jambopay_authorize_wallet_payout,validate_wallet_pin,payout_from_wallet_to_mpesa_2,payout_from_wallet_to_mpesa,payout_from_wallet_to_till,payout_from_wallet_to_paybill,payout_from_wallet_to_bank
def get_wallet_by_msisdn(msisdn):
    if UserAccounts.objects.filter(account_phone = msisdn).exists():
        account = UserAccounts.objects.filter(account_phone = msisdn).first()
        return account
from core.date_utils import get_first_and_last_days_of_month
from intergrations.jambopay import jambopay_wallet
def wallet_payout_1(splitted, msisdn):
    response = "END handle payout"
    return response

from payments.utils.user_account_payout_utils import getTotalAmount

# Manage payouts

def wallet_payout_1(splitted,msisdn):

    account = get_wallet_by_msisdn(msisdn)
    payload = {
            "account_number": account.account_number
        }

    errors, balance_json = get_wallet_balance(payload)
    if balance_json:
        balance = balance_json["balance"]
        if float(balance)<1.00:
            response="END Your balance is 0.00"
            return response
        else:
            response = f"CON Account {account}, balance: KES {balance}\n"
            response +="Enter amount to pay out: \n"
            return response
        
def get_payout_channel(channel_index,account_number):
    if channel_index==1 or channel_index==3:
        if account_number:
            user_has_account =jambopay_wallet.check_user_jambopay_profile_by_phone(account_number)
            if user_has_account==True:
                return "JambopayWalletUser"
            elif user_has_account==False:
                return "UnregisteredUser"
    elif channel_index==2:
        return "TransferToBank"
    elif channel_index==4:
        return "TillBusinessPayments"
    elif channel_index==5:
        return "TillBusinessPayments"
        
def wallet_payout_2(splitted,msisdn):
    subscriptions_amount=0.00
    amount_to_payout = float(splitted[2])
    account = get_wallet_by_msisdn(msisdn)
    if len(account.entity_subscriptions.all())>=1:
        subscriptions_amount =calculate_subscriptions_retention_today(msisdn)
    payload = {
            "account_number": account.account_number
        }

    errors, balance_json = get_wallet_balance(payload)
    if balance_json:
        balance = balance_json["balance"]
        if float(balance) < float(amount_to_payout + subscriptions_amount):
            response = f"END Account balance:  KES {balance}\n"
            response = f"END Subscriptions: KES {subscriptions_amount}, balance: KES {balance}\n"
            response +=f"Insufficient balance to payout {amount_to_payout}. Please deposit {subscriptions_amount} for your subscriptions \n"
        else:
            response = f"CON Account {account}, balance: KES {balance}\n"
            response +=f"Select payout channel: \n"
            response +="1. Airtel Money \n"
            response +="2. Bank Account \n"
            response +="3. Mpesa Number \n"
            response +="4. Paybill \n"
            response +="5. Till \n"
            response +="6. Whitelisted Accounts \n"
    return response

def wallet_payout_3(splitted,msisdn):
    selected_payout_channel_index = int(splitted[3])
    print("selected_payout_channel_index",selected_payout_channel_index)
    amount_to_payout = float(splitted[2])
    payout_channel=get_payout_channel(selected_payout_channel_index,None)
    total_amount = getTotalAmount(amount_to_payout,payout_channel)
    account = get_wallet_by_msisdn(msisdn)
    subscriptions_amount = 0.00
    payload = {
            "account_number": account.account_number
        }
    errors, balance_json = get_wallet_balance(payload)
    if balance_json:
        balance = balance_json["balance"]
        if balance < total_amount:
            response = "insufficient balance"
        else:
            response = f"Process payout to {selected_payout_channel_index}"
            if selected_payout_channel_index==1:
                response = "CON Pay out to Airtel \n"
                response += "Enter airtel  number"
            elif selected_payout_channel_index==2:
                response = "CON Pay out to Bank Account \n"
                response += "Enter bank account number"
            elif selected_payout_channel_index==3:
                response = "CON Pay out to Mpesa \n"
                response += "Enter mpesa number"
            elif selected_payout_channel_index==4:
                response = "CON Pay out to Paybill \n"
                response += "Enter paybill number"
            elif selected_payout_channel_index==5:
                response = "CON Pay out to Till \n"
                response += "Enter till number"
            else:
                response = "CON Invalid input \n"
                response += "0. Back at 3"
        return response
    
def wallet_payout_4(splitted,msisdn):

    selected_payout_channel_index = int(splitted[3])
    print("selected_payout_channel_index",selected_payout_channel_index)
    selected_payout_channel_number = splitted[4]
    print("selected_payout_channel_number",selected_payout_channel_number)
    amount_to_payout = float(splitted[2])
    payout_channel=get_payout_channel(selected_payout_channel_index,None)
    total_amount = getTotalAmount(amount_to_payout,payout_channel)
    account = get_wallet_by_msisdn(msisdn)
    subscriptions_amount = 0.00
    payload = {
            "account_number": account.account_number
        }
    errors, balance_json = get_wallet_balance(payload)
    if balance_json:
        balance = balance_json["balance"]

    else:
        response = "END Balance not retrieved"
        return response
    
    if selected_payout_channel_index==1:
        telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
        print("TCO",telco)
        if not telco=="AIRTELMONEY":
            response="END Not a valid Airtel Money number"
            return response
        else:
            pass

        response = f"CON Pay out to Airtel {formatted_phone_number}\n"
        response += f"Enter your wallet pin"
        return response
    elif selected_payout_channel_index==2:
        response = f"CON Pay out to bank account number {selected_payout_channel_number} \n"
        response += f"Enter bank code"
        return response
    elif selected_payout_channel_index==3:
        telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
        if not telco=="MPESA":
            response="END Not a valid Mpesa number"
            return response
        else:
            pass
        response = f"CON Pay out to Mpesa {formatted_phone_number}\n"
        response += f"Enter your wallet pin"
        return response
    elif selected_payout_channel_index==4:
        response = f"CON Pay out to Paybill {selected_payout_channel_number}\n"
        response += f"Enter account number"
        return response
    elif selected_payout_channel_index==5:
        response = f"CON Pay out to Till {selected_payout_channel_number}\n"
        response += f"Enter your wallet pin"
        return response
    else:
        response = "END Invalid input here \n"
        response += "0. Back at 4"
        return response
    
def wallet_payout_5(splitted,msisdn):
    from payments.utils.user_account_payout_utils import getTotalAmount
    wallet_pin = splitted[5]
    print("pin at 5", wallet_pin)
    amount_to_payout = float(splitted[2])
    total_amount_to_payout=getTotalAmount(amount_to_payout)
    selected_payout_channel_index = int(splitted[3])
    selected_payout_channel_number = splitted[4]
    account = get_wallet_by_msisdn(msisdn)
    payload = {
            "account_number": account.account_number
        }
    errors, balance_json = get_wallet_balance(payload)
    if balance_json:
        balance = balance_json["balance"]
    else:
        response = "END Balance could not be retrieved"
        return response
    reference_number = generate_reference_number(account.owner.entity, account.owner)
    print("reference number at 5", reference_number)
    if selected_payout_channel_index==1:
        result = validate_wallet_pin(msisdn, wallet_pin)
        if result and "statusCode" in result and result["statusCode"]==400:
            message =result["message"][0]
            response = F"END Invalid pin"
            return response
        else:
            pass
        
        telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
        print("telco at T",telco)

        account_ref = f"{account.owner.first_name} {account.owner.last_name}"
        errors, result = payout_from_wallet_to_airtel(account.account_number, account_ref, formatted_phone_number,amount_to_payout,reference_number)
        print("errors at airtel", errors)
        print("result at airtel", result)

        
        jambopay_authorize_wallet_payout(wallet_pin, result["ref"])
    


        response = f"END Pay out {amount_to_payout} to Airtel {formatted_phone_number}\n"
        response += f"Payout processed. Please await sms confirmation"
        return response
    elif selected_payout_channel_index==2:
        response = f"CON Pay out to bank account number {selected_payout_channel_number}\n"
        response += "Enter wallet pin"
        return response
    elif selected_payout_channel_index==3:
        result = validate_wallet_pin(msisdn, wallet_pin)
        if result and "statusCode" in result and result["statusCode"]==400:
            message =result["message"][0]
            response = F"END Invalid pin"
            return response
        else:
            pass

        telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
        account_ref = f"{account.owner.first_name} {account.owner.last_name}"
        # errors, result = payout_from_wallet_to_mpesa(account.account_number, account_ref, formatted_phone_number,amount_to_payout,reference_number,account.owner,wallet_pin)
        errors, result = payout_from_wallet_to_mpesa_2(amount_to_payout,account.account_number,account.owner,wallet_pin)
        print("errors at mpesa", errors)
        print("result at mpesa", result)

        if result and "ref" in result:
            jambopay_authorize_wallet_payout(wallet_pin, result["ref"])

        


        response = f"END Pay out {amount_to_payout} to Mpesa {formatted_phone_number}\n"
        response += f"Payout processed. Please await sms confirmation"
        return response
    elif selected_payout_channel_index==4:
        response = f"CON Pay out to Paybill {selected_payout_channel_number}\n"
        response += "Enter wallet pin"
        return response
    elif selected_payout_channel_index==5:
        result = validate_wallet_pin(msisdn, wallet_pin)
        if result and "statusCode" in result and result["statusCode"]==400:
            message =result["message"][0]
            response = F"END Invalid pin"
            return response
        else:
            pass
        errors, result = payout_from_wallet_to_till(account, selected_payout_channel_number,amount_to_payout,reference_number)
        jambopay_authorize_wallet_payout(wallet_pin, result["ref"])
        response = f"END Pay out {amount_to_payout} to Till {selected_payout_channel_number}\n"
        response += f"Payout processed. Please await sms confirmation"
        return response
    else:
        response = "CON Invalid input \n"
        response += "0. Back"
        return response

def wallet_payout_6(splitted,msisdn):
    wallet_pin = splitted[6]
    amount_to_payout = float(splitted[2])
    selected_payout_channel_index = int(splitted[3])
    selected_payout_channel_number = splitted[4]
    print("selected_payout_channel_number: paybill",selected_payout_channel_number)
    account = get_wallet_by_msisdn(msisdn)
    payload = {
            "account_number": account.account_number
        }
    errors, balance_json = get_wallet_balance(payload)
    if balance_json:
        balance = balance_json["balance"]
    else:
        response = "END Balance could not be retrieved"
        return response
    reference_number = generate_reference_number(account.owner.entity, account.owner)
    if selected_payout_channel_index==1:
        response = "END Invalid option"
    elif selected_payout_channel_index==2:
        result = validate_wallet_pin(msisdn, wallet_pin)
        if result and "statusCode" in result and result["statusCode"]==400:
            message =result["message"][0]
            response = F"END Invalid pin"
            return response
        else:
            pass
        bank_code = splitted[5]
        print("bank code",bank_code)
        account_ref = f"{account.owner.first_name} {account.owner.last_name} "
        errors, result = payout_from_wallet_to_bank(account.account_number, selected_payout_channel_number, account_ref, amount_to_payout, bank_code, reference_number)
        print("errors at mpesa", errors)
        print("result at mpesa", result)

        
        jambopay_authorize_wallet_payout(wallet_pin, result["ref"])
    
        response = f"END Pay out to bank account number {selected_payout_channel_number} code {bank_code}\n"
        response += "Payout bank processed. Please await sms confirmation"
        return response
    elif selected_payout_channel_index==3:
        response = "END Invalid option"
        return response
    elif selected_payout_channel_index==4:
        result = validate_wallet_pin(msisdn, wallet_pin)
        if result and "statusCode" in result and result["statusCode"]==400:
            message =result["message"][0]
            response = F"END Invalid pin"
            return response
        else:
            pass
        paybill_account_number = splitted[5]
        print("paybill_account_number",paybill_account_number)
        errors, result = payout_from_wallet_to_paybill(account.account_number, paybill_account_number, selected_payout_channel_number, amount_to_payout, reference_number)

        
        jambopay_authorize_wallet_payout(wallet_pin, result["ref"])

        response = f"END Pay out to Paybill {selected_payout_channel_number} Account: {paybill_account_number}\n"
        response += "Payout paybill processed. Please await sms confirmation"
        return response
    elif selected_payout_channel_index==5:
        response = "END Invalid option"
    else:
        response = "CON Invalid input \n"
        response += "0. Back"
        return response
    


#mManage password
def wallet_manage_pin_1(splitted, msisdn):
        
        account = get_wallet_by_msisdn(msisdn)
        response = f"CON Manage pin for account {account.account_number}\n"
        response +="1. Password status \n"
        response +="2. Set password \n"
        response +="3. Change password \n"
        return response

def check_password_status_1(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)
    errors, result_json = check_wallet_pin(msisdn)

    if result_json:
        if result_json["status"]==True:
            resp = "Pin is set for your wallet"
        else:
            resp = "Pin is not set for your wallet"

        response = f"END Password status for account {account}\n"
        response +=resp
        return response
    else:
        response = f"END Password status for account {account}\n"
        for index, val in enumerate(errors):      
            response +=f"{val}\n" 
        return response


def set_password_1(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)
    response = f"CON Set pin for account {account}\n"
    response +="Enter memorable 4 digit pin"
    return response

def set_password_2(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)
    response = f"CON Set pin for account {account}\n"
    response +="Confirm your 4 digit pin"
    return response

def set_password_3(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)
    entry_1 = splitted[4]
    # entry_2 = splitted[5]

    if not entry_1.isnumeric():
        response = f"END Set pin for account {account}\n"
        response ="Pin can oly be numbers."
        return response
        
    else:
        errors, result = set_wallet_pin(msisdn,entry_1)
        if result:
            response = f"END Set pin for account {account}\n"
            response +=f"Pin is sucessfuly set as {entry_1}\n"
            response +="Your pin is your secret. Dont share with anyone\n"
            return response
        elif errors:
            response = f"END Set pin for account {account}\n"
            for index, val in enumerate(errors):      
                response +=f"{val}\n" 
            return response

def change_password_1(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)
    response = f"CON Change pin for account {account}\n"
    response +="Enter current pin"
    return response

def change_password_2(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)
    response = f"CON Change pin for account {account}\n"
    response +="Enter new pin"
    return response

def change_password_3(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)
    response = f"CON Change pin for account {account}\n"
    response +="Confirm new pin"
    return response


def change_password_4(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)
    if not splitted[4] ==splitted[5]:
        response = f"END New pin not matching"
        return response
    else:
        json_resp = validate_wallet_pin(msisdn,splitted[3])
        print("resp",json_resp)
        if "status" in json_resp and json_resp['status']==True:
            print("resp",json_resp) 
            change_pin_response= change_wallet_pin(msisdn,splitted[4])
            print("change_pin_response",change_pin_response)
            if  not "statusCode" in change_pin_response:
                print("change_pin_response",change_pin_response)
                response = f"EN Change pin for account {account}\n"
                response +="Pin sucessfully changed"
                return response
            else:
                response =f"END Pin change failed"
                return response

        else:
            response ="END You entered wrong old pin. Please try again"
            return response



def wallet_subscriptions_1(splitted, msisdn):
    response = f"CON Wallet Subscriptions \n"
    response +="1. Available Subscriptions \n"
    response +="2. My Subscriptions \n"
    return response



# Opt Out


def wallet_opt_out_1(splitted, msisdn):
    response = "END handle wallet opt out"
    return response

# Subscriptions
def get_entity_subscriptions(msisdn):
    account = get_wallet_by_msisdn(msisdn)
    subscriptions = EntitySubscriptions.objects.filter(entity=account.owner.entity,is_active="true").all()
    return subscriptions

def all_subscriptions(splitted, msisdn):
    response = f"CON Select subscriptions to view options\n"
    subscriptions = get_entity_subscriptions(msisdn)
    if len(subscriptions)>0:
        
        for index, val in enumerate(subscriptions):
                        
            response +=f"{str(index+1)}. {val.title}-{val.scheduled_installment_amount} - ({val.schedule})\n"
        return response
    else:
        response ="END Your entity has no subscriptions set"
        return response

def all_subscriptions_subscription_options(splitted, msisdn):
    
    subscriptions = get_entity_subscriptions(msisdn)
    selected_subscription_index =int(splitted[3])-1
    
    selected_subscription = subscriptions[selected_subscription_index]
    response = f"CON {selected_subscription.title} \n"
    if selected_subscription:
        response =f"CON You selected {selected_subscription.title} at {selected_subscription.scheduled_installment_amount} {selected_subscription.schedule}\n"
        response +="1. Join Now \n"
        
        return response
    else:
        response =f"No subscription selected"

def all_subscriptions_join_pin(splitted,msisdn):
    subscriptions = get_entity_subscriptions(msisdn)
    selected_subscription_index =int(splitted[3])-1
    
    selected_subscription = subscriptions[selected_subscription_index]
    if selected_subscription:
        response= f"CON Join {selected_subscription.title} \n"
        response += f"Enter your pin to confirm"
        return response
    else:
        response = "END No such subscription"

def all_subscriptions_join(splitted, msisdn):
    
    validation = validate_wallet_pin(msisdn, splitted[-1])
    if "status" in validation and validation['status']==True:
        response = f"CON New subscription\n"
        account = get_wallet_by_msisdn(msisdn)
        subscriptions = get_entity_subscriptions(msisdn)
        selected_subscription_index =int(splitted[3])-1
        selected_subscription = subscriptions[selected_subscription_index]
        if selected_subscription in account.entity_subscriptions.all():
            response =f"END You are already subscribed to {selected_subscription.title}"
            return response
        else:
            account.entity_subscriptions.add(selected_subscription)
            account.save()
            response =f"END You successfully joined {selected_subscription.title} at {selected_subscription.scheduled_installment_amount} {selected_subscription.schedule}\n"
            return response
    else:
        response =f"END Pin validation in failed"
        return response

def my_subscriptions(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)
    response =f"CON Select subscription to view options\n"
    if len(account.entity_subscriptions.all())>0:
        for index, val in enumerate(account.entity_subscriptions.all()):
                        
            response +=f"{str(index+1)}. {val.title}-{val.scheduled_installment_amount}({val.schedule})\n"
        return response
    else:
        response = "END you have no subscriptions"
    return response


def my_subscriptions_2(splitted, msisdn):
    account = get_wallet_by_msisdn(msisdn)

    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1
    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]
        response = f"CON {selected_subscription.title} \n"
        response +="1. Installments Status \n"
        response +="2. Pay Pending Installments \n"
        response +="3. Pay All Installments \n"
        response +="4. Pay Out \n"
        response +="5. Quit \n"
        return response
    else:
        response="END Invalid choice"
        return response

def my_subscriptions_installments_status(splitted, msisdn):
    response=""
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    account = get_wallet_by_msisdn(msisdn)
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1
    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]
        response= f"END {selected_subscription}\n"
        successful_instalments = EntitySubscriptionsDailyLog.objects.filter(month=month,created__gte=first_day_this_month,status="SUCCESS",entity_subscription=selected_subscription).count() 
        if successful_instalments>0:
            pending_installments=selected_subscription.total_installments-successful_instalments
            response += f"END You have {successful_instalments} succesful installments worthy KES {float(successful_instalments)*float(selected_subscription.scheduled_installment_amount)}. {pending_installments} installments worthy KES {float(pending_installments)*float(selected_subscription.scheduled_installment_amount)} to go \n"
            return response
        else:
            response+="END You have no installment yet"
            return response
    else:
        response="END Invalid choice"
        return response
    
def my_subscriptions_pay_pending_installments_1(splitted, msisdn):
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    account = get_wallet_by_msisdn(msisdn)
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1
    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]
        pending_installments = EntitySubscriptionsDailyLog.objects.filter(month=month,created__gte=first_day_this_month,status="FAILED",entity_subscription=selected_subscription).count() 
        if pending_installments>0:
            pending_installments_value =(float(pending_installments)*float(selected_subscription.scheduled_installment_amount))+ (float(pending_installments)*float(selected_subscription.service_charge))
            response = f"CON {selected_subscription.title} \n"
            response +=f"Pay KES {pending_installments_value} for pending {pending_installments} installments \n"
            response +="Reply with 1 to pay using this phone number or enter new number"
            return response
    else:
        response="END Invalid choice"
        return response
    
def my_subscriptions_pay_pending_installments_2(splitted, msisdn):
    phone_number = msisdn
    formatted_phone_number=None
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    account = get_wallet_by_msisdn(msisdn)
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1

    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]
        pending_installments = EntitySubscriptionsDailyLog.objects.filter(month=month,created__gte=first_day_this_month,status="FAILED",entity_subscription=selected_subscription).count() 
        if pending_installments>0:
            pending_installments_value =(float(pending_installments)*float(selected_subscription.scheduled_installment_amount))+ (float(pending_installments)*float(selected_subscription.service_charge))

        else:
            response="END You have no pending installments"
            return response
        
    if not splitted[-1] =="1":
        phone_number=splitted[-1]
    else:
        pass
    telco, formatted_phone_number=get_telco_by_phone_number(phone_number)
    reference_number=generate_reference_number(account.entity,account.owner)
    if telco=="MPESA":
        payload = json.dumps({
            "orderId": reference_number,
            "amount": int(pending_installments_value),
            "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
            "accountTo":  account.account_number,
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
            "amount": int(pending_installments_value),
            "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
            "accountTo":account.account_number, 
            "currency":"KES",
            "description": "TOPUP",
            "modeOfPayment": "MOBILE_MONEY",
            "provider": "AIRTELMONEY",
            "data": {
                "phoneNumber": formatted_phone_number,
                "serviceType": "MERCHANTPAYMENT" 
            }
            })
    # print("Result payload", payload)
    if payload:
        errors=[]
        result_json=None
        # errors, result_json = jambopay_mobile_checkout(payload)
        if  result_json:
            created = UserAccountsPayins.objects.create(
                entity_subscription=selected_subscription,
                account=account,
                reference_number=reference_number,
                payin_account_number = formatted_phone_number,
                payin_account_type=telco,
                rrn=result_json['rrn'],
                ref=result_json['ref'],
                status="INITIATED",
                narrative="SUBSCRIPTION",
                amount=pending_installments_value,
                entity=account.entity,
                owner=account.owner
            )
            response=f"END Payment has been initiated on {formatted_phone_number}. Enter pin when prompted to complete"
            return response
        else:
            response="END Payment process failed. Please try again"
            return response
        
        
def my_subscription_opt_out_1(splitted,msisdn):
    account = get_wallet_by_msisdn(msisdn)
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1
    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]  
        response = f"CON Opt out of {selected_subscription}\n"
        response +="Enter pin to confirm"
        return response
    else:
        response = "END Invalid choice"
        return response

def my_subscription_opt_out_2(splitted,msisdn):
    account = get_wallet_by_msisdn(msisdn)
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1
    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]  
        json_resp = validate_wallet_pin(msisdn,splitted[-1])
        print("resp",json_resp)
        if "status" in json_resp and json_resp['status']==True:
            account.entity_subscriptions.remove(selected_subscription)
            response ="END You have opted out succesfully"
            return response
        else:
            response = "END You have entered wrong pin"
            return response

     


def my_subscriptions_pay_all_installments_1(splitted, msisdn):
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    account = get_wallet_by_msisdn(msisdn)
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1
    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]
        successfull_installments = EntitySubscriptionsDailyLog.objects.filter(month=month,created__gte=first_day_this_month,status="SUCCESS",entity_subscription=selected_subscription).count() 
        pending_installments = selected_subscription.total_installments - successfull_installments
        if pending_installments>0:
            pending_installments_value =(float(pending_installments)*float(selected_subscription.scheduled_installment_amount))+ (float(pending_installments)*float(selected_subscription.service_charge))
            response = f"CON {selected_subscription.title} \n"
            response +=f"Pay KES {pending_installments_value} for {pending_installments} installments \n"
            response +="Reply with 1 to pay using this phone number or enter another"
            return response
    else:
        response="END Invalid choice"
        return response
    
def my_subscriptions_pay_all_installments_2(splitted, msisdn):
    phone_number = msisdn
    formatted_phone_number=None
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    account = get_wallet_by_msisdn(msisdn)
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1

    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]
        successful_installments = EntitySubscriptionsDailyLog.objects.filter(month=month,created__gte=first_day_this_month,status="SUCCESS",entity_subscription=selected_subscription).count() 
        pending_installments = selected_subscription.total_installments - successful_installments
        
        if pending_installments>0:
            pending_installments_value =(float(pending_installments)*float(selected_subscription.scheduled_installment_amount))+ (float(pending_installments)*float(selected_subscription.service_charge))

    if not splitted[-1] =="1":
        phone_number=splitted[-1]
    else:
        phone_number=msisdn
    telco, formatted_phone_number=get_telco_by_phone_number(phone_number)
    print("telco",telco)
    print("formatted_phone_number",formatted_phone_number)
    reference_number=generate_reference_number(account.entity,account.owner)
    if telco=="MPESA":
        payload = json.dumps({
            "orderId": reference_number,
            "amount": int(pending_installments_value),
            "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
            "accountTo":  account.account_number,
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
            "amount": int(pending_installments_value),
            "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
            "accountTo":account.account_number, 
            "currency":"KES",
            "description": "TOPUP",
            "modeOfPayment": "MOBILE_MONEY",
            "provider": "AIRTELMONEY",
            "data": {
                "phoneNumber": formatted_phone_number,
                "serviceType": "MERCHANTPAYMENT" 
            }
            })
    # print("Result payload", payload)
    if payload:
        errors=[]
        result_json=None
        # errors, result_json = jambopay_mobile_checkout(payload)
        print("errors",errors)
        print("result_json",result_json)
        if  result_json:
            created = UserAccountsPayins.objects.create(
                entity_subscription=selected_subscription,
                account=account,
                reference_number=reference_number,
                payin_account_number = formatted_phone_number,
                payin_account_type=telco,
                rrn=result_json['rrn'],
                ref=result_json['ref'],
                status="INITIATED",
                narrative="SUBSCRIPTION",
                amount=pending_installments_value,
                entity=account.entity,
                owner=account.owner
            )
            response=f"END Payment has been initiated on {formatted_phone_number}. Enter pin when prompted to complete"
            return response
        else:
            response="END Payment process failed. Please try again"
            return response
        


def my_subscription_pay_out_1(splitted,msisdn):
    selected_subscription=None
    amount_to_payout=0.00
    service_charge=0.00
    balance=0.00
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    account = get_wallet_by_msisdn(msisdn)
   
    payload = {
            "account_number": account.account_number
        }

    errors, balance_json = get_wallet_balance(payload)
    if balance_json:
        balance = balance_json["balance"]
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1
    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]
        amount_to_payout = selected_subscription.principal_amount
        service_charge= selected_subscription.service_charge
       
    successfull_installments = EntitySubscriptionsDailyLog.objects.filter(month=month,created__gte=first_day_this_month,status="SUCCESS",entity_subscription=selected_subscription).count() 
    if successfull_installments==selected_subscription.total_installments and balance>(amount_to_payout+service_charge):
       
       
        if selected_subscription.payout_account_type =="AIRTELMONEY" or selected_subscription.payout_account_type =="MPESA" or selected_subscription.payout_account_type =="TILL": 
            response = f"CON Payout KES {amount_to_payout} for {selected_subscription}. Transaction fee of {service_charge} shall apply  \n"
            response +="Enter pin to confirm"
            return response
        elif selected_subscription.payout_account_type =="PAYBILL":
            response =f"CON Pay KES {amount_to_payout} for {selected_subscription} to Paybill {selected_subscription.payout_account_number} \n"
            response +="Enter your account number (National ID)"
            return response
        else:
            response="END subscription payout account is not set"
            return response

    else:
        response=f"END You only have {successfull_installments}. Pay up all subscriptions to continue"
        return response

def my_subscription_pay_out_2(splitted,msisdn):
    selected_subscription=None
    amount_to_payout=0.00
    service_charge=0.00
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    account = get_wallet_by_msisdn(msisdn)
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    pin_or_account_number=splitted[-1]
    selected_subscription_index = int(splitted[3])-1
    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]

        if len(pin_or_account_number)==4:
            json_resp = validate_wallet_pin(msisdn,splitted[-1])
            if "status" in json_resp and json_resp['status']==True:
                response=f"CON Transaction has been initiated"
                return response
                
            else:
                response = "END You have entered wrong pin"
                return response 
        else:
            response ="CON Enter pin to complete transaction" 
            return response
def create_user_account_payout(account,reference_number,result,payout_account_number,payout_account_type,narrative,selected_subscription):
    created =UserAccountsPayouts.objects.create(
        account_from=account,
        reference_number=reference_number,
        ref=result["ref"],
        payout_account_number=payout_account_number,
        payout_account_type=payout_account_type,
        entity_subscription=selected_subscription,
        narrative=narrative,
        owner=account.owner,
        entity=account.entity

    )

    return created

def my_subscription_pay_out_paybill(splitted,msisdn):
    print("Heere")
    selected_subscription=None
    amount_to_payout=0.00
    service_charge=0.00
    first_day_this_month, last_day_this_month, days_in_month = get_first_and_last_days_of_month(datetime.now())
    account = get_wallet_by_msisdn(msisdn)
    today=datetime.now()
    month =today.strftime('%B') 
    subscriptions = account.entity_subscriptions.all()
    selected_subscription_index = int(splitted[3])-1
    pin_or_account_number=splitted[-1]
    if selected_subscription_index< len(subscriptions):
        selected_subscription = subscriptions[selected_subscription_index]

        if len(pin_or_account_number)==4:
            json_resp = validate_wallet_pin(msisdn,splitted[-1])
            if "status" in json_resp and json_resp['status']==True:
                created=None
                reference_number = generate_reference_number(account.owner.entity, account.owner)
                errors,result=jambopay_wallet.payout_from_wallet_to_paybill(account.account_number,splitted[6],selected_subscription.payout_account_number,int(selected_subscription.principal_amount),reference_number)
                
                if result and "ref" in result:
                    jambopay_wallet.jambopay_authorize_wallet_payout(pin_or_account_number,result["ref"])

                    created = create_user_account_payout(account,reference_number,result,selected_subscription.payout_account_number,selected_subscription.payout_account_type,"SUBSCRIPTION",selected_subscription)

                    time.sleep(5)
                    status = jambopay_wallet.jambopay_check_wallet_payment_status(result["ref"])
                    if status and "status" in status:
                        created.status=status['status']
                        created.description=status['description']
                        created.save()

                        response=f"END {status['description']}"
                        return response
                
            else:
                response = "END You have entered wrong pin"
                return response 
        else:
            response ="CON Enter pin to complete transaction" 
            return response
