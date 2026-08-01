from authentication.utils.utils import get_telco_by_phone_number, generate_reference_number, use_reference_number
from .. import models
from employees.models import Employees
from intergrations.jambopay import jambopay_wallet
import json
from payments.models import UserAccounts
from utils.logging import create_log
from payments.utils.jambopay_tariff import get_tariff


def user_account_to_airtel(data,user):
    create_log("info",data)
    errors = []
    # vehicle_registration = None
    administrator = None
    pin = None
    total_amount=None
    comm_amount=None
    amount = 0.00
    airtel_account_reference = ""
    narration = "Send to Airtel Money"
    reference_number = None
    user_account = None
    payout_channel=None

    if not "pin" in data:
        errors.append("Pin is required")
        return errors, None
    else:
        pin = data["pin"]
        
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]

    # Validate airtel phone number
    if "account_number" in data and not data["account_number"]=="":
        account_number = data["account_number"]
        telco, validated_airtel_account_number = get_telco_by_phone_number(account_number)
        if telco =="AIRTELMONEY":
            pass
        else:
            errors.append(f"{account_number} is not a valid Airtel Money number")
            return errors, None
        if validated_airtel_account_number:
            user_has_account = jambopay_wallet.check_user_jambopay_profile_by_phone(validated_airtel_account_number)
            if user_has_account==True:
                payout_channel="JambopayWalletUser"
            elif user_has_account==False:
                payout_channel="UnregisteredUser"
            else:
                errors.append("User registration status not determined")
                return errors,None
    else:
        errors.append("Airtel account number is required")
        return errors, None

    if "amount" in data:
        amount= int(data['amount'])
        if amount<10:
            errors.append("You can only send amounts from KES 10.00")
            return errors,None
        total_amount = getTotalAmount(amount,payout_channel)
        comm_amount = getCommisionAmount(amount)
        print("Amount", amount)
    else:
        errors.append("Amount is required")
        return errors, None
    
    if UserAccounts.objects.filter(owner=user).exists():
        user_account = UserAccounts.objects.filter(owner=user).first()

    
    if user_account:

        result = jambopay_wallet.validate_wallet_pin(user_account.account_phone,pin)
        if "statusCode" in result:
            errors.append("Invalid wallet pin")
            return errors,None
        
        payload = { "account_number": user_account.account_number
                        }
        errors, balance_json = jambopay_wallet.get_wallet_balance(payload)
        print("balance errors", errors)
        print("balance json", balance_json)
        # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
        if balance_json and float(balance_json['balance'])> float(total_amount):
            reference_number = generate_reference_number(user.entity, user)
            if reference_number:
                payload = json.dumps({
                            "amount": amount,
                            "accountFrom": user_account.account_number, 
                            "orderId": reference_number,
                            "provider": "MOMO_B2C",
                            "payTo": {
                                "accountRef": f"{user.first_name} {user.last_name}",
                                "accountNumber":validated_airtel_account_number
                            },
                            "callBackUrl": "https://webhook.site/5a0465a2-3e53-4955-b1ab-50c805102343",
                            "narration": narration,
                             "verificationType":"PIN"
                            })
                errors, collection_to_mpesa = jambopay_wallet.payout_from_wallet_to_airtel(payload)
                print("collection_to_mpesa errors", errors)
                print("collection_to_mpesa json", balance_json)
                if collection_to_mpesa:
                    use_reference_number(reference_number)
                    if "ref" in collection_to_mpesa:
                        result = jambopay_wallet.jambopay_authorize_wallet_payout(pin,collection_to_mpesa['ref'])
                        print("authorize", result)
                        # result= jambopay_wallet.payout_commission(amount,user_account.account_number,user,pin)

                    
                        return None, collection_to_mpesa
                else:
                    return errors, None
        else:
            errors.append(f"Insufficient funds. You should be able to pay {float(total_amount)-float(amount)} transcation charge")
            return errors, None
    else:
        errors.append(f"No wallet exists for  {user.entity}")
        return errors, None

def getTotalAmount(amount,payout_channel):
    import math
    comm = math.ceil(float(amount) * 0.000)
    tariff = float(get_tariff(amount,payout_channel)) 
    total = float(amount)+float(comm)+tariff

    return total


def getCommisionAmount(amount):
    import math
    comm = math.ceil(float(amount) * 0.005)
    return comm
    
def user_account_to_mpesa_payout(data,user):
    create_log("info",data)
    user_account = None
    account_ref = None
    errors = []
    employee = None
    amount = 0.00
    total_amount=None
    comm_amount=None
    account_number = None
    narration = "Send to Mpesa"
    pin =None
    payout_channel=None
    

    # Validate mpesa phone number
    if "account_number" in data and not data["account_number"]=="":
        account_number = data["account_number"]
        telco, validated_mpesa_account_number = get_telco_by_phone_number(account_number)
        if telco =="MPESA":
            pass
        else:
            errors.append(f"{account_number} is not a valid mpesa number")
            return errors, None
        if validated_mpesa_account_number:
            user_has_account = jambopay_wallet.check_user_jambopay_profile_by_phone(validated_mpesa_account_number)
            if user_has_account==True:
                payout_channel="JambopayWalletUser"
            elif user_has_account==False:
                payout_channel="UnregisteredUser"
            else:
                errors.append("User registration status not determined")
                return errors,None
        
    else:
        errors.append("Mpesa account number is required")
        return errors, None

    
    if "amount" in data:
        amount= int(data['amount'])
        if amount<10:
            errors.append("You can only send amounts from KES 10.00")
            return errors,None
        total_amount = getTotalAmount(amount,payout_channel)
        comm_amount = getCommisionAmount(amount)
        print("Amount", amount)
    else:
        errors.append("Amount is required")
        return errors, None
    
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]

    if "pin" in data and not data["pin"]=="":
        pin = data["pin"]
       
    else:
        errors.append("Pin is required")


    
    if UserAccounts.objects.filter(owner=user).exists():
        user_account = UserAccounts.objects.filter(owner=user).first()

    if user_account:
        result = jambopay_wallet.validate_wallet_pin(user_account.account_phone,pin)
        if "statusCode" in result:
            errors.append("Invalid wallet pin")
            return errors,None

        payload = { "account_number": user_account.account_number
                        }
        errors, balance_json = jambopay_wallet.get_wallet_balance(payload)


        # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
        if balance_json and float(balance_json['balance'])>total_amount:
            reference_number = generate_reference_number(user.entity, user)
            payload = json.dumps({
                        "amount": amount,                
                        "accountFrom": user_account.account_number, 
                        "orderId": reference_number,
                        "provider": "MOMO_B2C",
                        "payTo": {
                            "accountRef": f"{user.first_name} {user.last_name}",
                            "accountNumber":validated_mpesa_account_number
                        },
                        "callBackUrl": "https://webhook.site/5a0465a2-3e53-4955-b1ab-50c805102343",
                        "narration": narration,
                         "verificationType":"PIN"

                        })
            errors, collection_to_mpesa = jambopay_wallet.payout_from_wallet_to_mpesa_2(payload)
            print("collection_to_mpesa",collection_to_mpesa)
            print("collection_to_mpesa errors",errors)
            use_reference_number(reference_number)
            if collection_to_mpesa:
                if "ref" in collection_to_mpesa:
                    result = jambopay_wallet.jambopay_authorize_wallet_payout(pin,collection_to_mpesa['ref'])
                    if result:
                        print("AT authorize MPESA PAYOUT", result)
                        if result=="OK":
                            pass
                            # result= jambopay_wallet.payout_commission(amount,user_account.account_number,user,pin)
                        else:
                            errors.append("Authorization failed")
                            return errors,None

                        
                    else:
                        print("No authorization result")
                    
                    

                
                    return [], collection_to_mpesa
            else:
                return errors, None
            
        else:
            errors.append(f"Insufficient funds. You should be able to pay {float(total_amount)-float(amount)} transcation charge")
            return errors, None
    else:
        errors.append(f"No wallet exists for user")
        return errors, None


def user_account_to_bank(data, user):
    errors = []
    user_account=None
    bank_account = None
    bank_code = None
    amount = 0.00
    vehicle_registration = None
    employee= None
    administrator = None
    reference_number = None
    narration = "Wallet account withdrawal to bank"
    account_reference= ""
    pin=None
    payout_channel="TransferToBank"


    if "account_number" in data and not data["account_number"]=="":
        account_number = data["account_number"]
    else:
        errors.append("Bank account is required")
        return errors, None
    
    if "bank_code" in data and not data["bank_code"]=="":
        bank_code = data["bank_code"]
    else:
        errors.append("Bank account is required")
        return errors, None
    
    if "amount" in data:
        amount= int(data['amount'])
        if amount<10:
            errors.append("You can only send amounts from KES 10.00")
            return errors,None
        total_amount = getTotalAmount(amount,payout_channel)
        comm_amount = getCommisionAmount(amount)
        print("Amount", amount)
    else:
        errors.append("Amount is required")
        return errors, None
    
    if "pin" in data:
        pin = data["pin"]
    else:
        errors.append("Pin  is required")
        return errors, None
    
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]

    if "account_reference" in data and not data["account_reference"]=="":
        account_reference = data["account_reference"]

    if UserAccounts.objects.filter(owner=user).exists():
        user_account = UserAccounts.objects.filter(owner=user).first()



    if user_account:
        result = jambopay_wallet.validate_wallet_pin(user_account.account_phone,pin)
        if "statusCode" in result:
            errors.append("Invalid wallet pin")
            return errors,None

        payload = { "account_number": user_account.account_number
                        }
        errors, balance_json = jambopay_wallet.get_wallet_balance(payload)

        # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
        if balance_json and float(balance_json['balance'])> total_amount:
            reference_number = generate_reference_number(user.entity, user)
            if reference_number:
                payload = json.dumps({
                    "amount": amount,
                    "accountFrom": user_account.account_number,
                    "orderId": reference_number,
                    "provider": "BANK",
                    "payTo": {
                        "accountRef": account_reference,
                        "accountNumber": account_number,
                        "bankCode": bank_code
                    },
                    "callBackUrl": "https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31",
                    "narration": f"{narration}",
                    "verificationType":"PIN"
                })

                errors, collection_to_mpesa = jambopay_wallet.payout_from_wallet_to_bank_2(payload)
                use_reference_number(reference_number)
                if collection_to_mpesa:
                    if "ref" in collection_to_mpesa:
                        result = jambopay_wallet.jambopay_authorize_wallet_payout(pin,collection_to_mpesa['ref'])
                        print("authorize", result)
                        # result= jambopay_wallet.payout_commission(amount,user_account.account_number,user,pin)
                
                    return None, collection_to_mpesa
                else:
                    return errors, None
                
        else:
            errors.append(f"Insufficient funds. You should be able to pay {float(total_amount)-float(amount)} transcation charge")
            return errors, None
    else:
        errors.append("No collection account for this administrator")
        return errors, None

    
def user_account_to_till(data, user):
    errors = []
    till_number = None
    amount = 0.00
    total_amount=None
    comm_amount=0.00
    user_account = None
    employee= None
    reference_number = None
    narration = "Wallet to MPesa Till NO."
    user_account = None
    pin =None
    payout_channel="TillBusinessPayments"
   

    if "account_number" in data and not data["account_number"]=="":
        account_number = data["account_number"]
    else:
        errors.append("Till number is required")
        return errors, None
    
    
    if "amount" in data:
        amount= int(data['amount'])
        if amount<10:
            errors.append("You can only send amounts from KES 10.00")
            return errors,None
        total_amount = getTotalAmount(amount,payout_channel)
        comm_amount = getCommisionAmount(amount)
        print("Amount", amount)
    else:
        errors.append("Amount is required")
        return errors, None
    
    if "pin" in data:
        pin = data["pin"]
    else:
        errors.append("Pin  is required")
        return errors, None
    
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]

    if UserAccounts.objects.filter(owner=user).exists():
        user_account = UserAccounts.objects.filter(owner=user).first()

    if user_account:

        result = jambopay_wallet.validate_wallet_pin(user_account.account_phone,pin)
        if "statusCode" in result:
            errors.append("Invalid wallet pin")
            return errors,None
        payload = { "account_number": user_account.account_number
                        }
        errors, balance_json = jambopay_wallet.get_wallet_balance(payload)
        print("errors balance", errors)
        print("balance_json balance", balance_json)
        # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
        if balance_json and float(balance_json['balance'])> total_amount:
            print("BALANE", balance_json)
            reference_number = generate_reference_number(user.entity, user)
            print("leff ", reference_number)
            if reference_number:
                payload = json.dumps({
                    "amount": amount,
                    "accountFrom": user_account.account_number,
                    "orderId": reference_number,
                    "provider": "MOMO_B2B",
                    "payTo": {
                        "accountNumber": account_number 
                    },
                    "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cbt",
                    "narration": narration,
                     "verificationType":"PIN"
                    })

                errors, collection_to_mpesa = jambopay_wallet.payout_from_wallet_to_till(payload)
                use_reference_number(reference_number)
                if collection_to_mpesa:
                    if "ref" in collection_to_mpesa:
                        result = jambopay_wallet.jambopay_authorize_wallet_payout(pin,collection_to_mpesa['ref'])
                        print("authorize", result)
                        # result= jambopay_wallet.payout_commission(amount,user_account.account_number,user,pin)
                
                    return None, collection_to_mpesa
                else:
                    return errors, None
                
        else:
            errors.append(f"Insufficient funds. You should be able to pay {float(total_amount)-float(amount)} transcation charge")
            return errors, None
    else:
        errors.append("No collection account for this administrator")
        return errors, None


def user_account_to_paybill(data, user):
    errors = []
    paybill_number = None
    account_number = None
    amount = 0.00
    total_amount=0.00
    comm_amount=0.00
    vehicle_registration = None
    sacco_personnel= None
    vehicle = None
    reference_number = None
    narration = "Wallet to MPesa Paybill NO."
    user_account =None
    pin =None
    payout_channel="TillBusinessPayments"
   

    if "paybill_number" in data and not data["paybill_number"]=="":
        paybill_number = data["paybill_number"]
    else:
        errors.append("Paybill number is required")
        return errors, None
    
    if "account_number" in data and not data["account_number"]=="":
        account_number = data["account_number"]
    else:
        errors.append("Account number is required")
        return errors, None
    
    if "pin" in data and not data["pin"]=="":
        pin = data["pin"]
    else:
        errors.append("Pin is required")
        return errors, None
    
    
    if "amount" in data:
        amount= int(data['amount'])
        if amount<10:
            errors.append("You can only send amounts from KES 10.00")
            return errors,None
        total_amount = getTotalAmount(amount,payout_channel)
        comm_amount = getCommisionAmount(amount)
        print("Amount", amount)
    else:
        errors.append("Amount is required")
        return errors, None

    
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]
    
    if UserAccounts.objects.filter(owner=user).exists():
        user_account = UserAccounts.objects.filter(owner=user).first()

    if user_account:

        result = jambopay_wallet.validate_wallet_pin(user_account.account_phone,pin)
        if "statusCode" in result:
            errors.append("Invalid wallet pin")
            return errors,None

        payload = { "account_number": user_account.account_number
                        }
        errors, balance_json = jambopay_wallet.get_wallet_balance(payload)
  

        # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
        if balance_json and float(balance_json['balance'])> float(total_amount):
            reference_number = generate_reference_number(user.entity, user)
            if reference_number:
                payload = json.dumps({
                    "amount": amount,
                    "accountFrom": user_account.account_number,
                    "orderId": reference_number,
                    "provider": "MOMO_B2B",
                    "payTo": {
                        "accountRef": account_number,
                        "accountNumber": paybill_number,
                    },
                    "callBackUrl": "https://webhook.site/7a311d8a-7c1b-4195-8640-e95e5ad616b3",
                    "narration": narration,
                     "verificationType":"PIN"
                })

                errors, collection_to_mpesa = jambopay_wallet.payout_from_wallet_to_paybill(payload)
                use_reference_number(reference_number)
                if collection_to_mpesa:
                    if "ref" in collection_to_mpesa:
                        result = jambopay_wallet.jambopay_authorize_wallet_payout(pin,collection_to_mpesa['ref'])
                        print("authorize", result)
                        # result= jambopay_wallet.payout_commission(amount,user_account.account_number,user,pin)
                
                        return None, collection_to_mpesa
                else:
                    return errors, None
                
        else:
            errors.append(f"Insufficient funds. You should be able to pay {float(total_amount)-float(amount)} transcation charge")
            return errors, None
    else:
        errors.append("No collection account for this administrator")
        return errors, None


def check_user_account_pin_status(user):
    errors = []
    if UserAccounts.objects.filter(owner=user).exists():
        user_account = UserAccounts.objects.filter(owner=user).first()
        errors, result = jambopay_wallet.check_wallet_pin(user_account.account_phone)
        print("result", result)
        if result and "status" in result:
            if result["status"]==True:
                return [], "Pin is set"
            else:
                return [], "Pin is not set"
        elif result["status"]==False:
            return [], "Pin is not set"
            
        else:
            errors.append("Pin status no established. Please try again")
            return errors, None
    else:
        errors.append("User has no wallet account")
        return errors, None
    
def set_user_account_pin(user,data):
    
    errors = []
    if not "pin" in data:
        errors.append("Pin is required")
        return errors, None
    else:
        pin = data['pin']

    if UserAccounts.objects.filter(owner=user).exists():
        user_account = UserAccounts.objects.filter(owner=user).first()
        errors, result = jambopay_wallet.set_wallet_pin(user_account.account_phone, pin)
        print("result", result)
        if result and "status" in result:
            if result["status"]==True:
                return [], "Pin is set successfully"
            else:
                return errors, "Pin is not set"
            
        else:
            return errors, None
    else:
        errors.append("User has no wallet account")
        return errors, None
    

def change_user_account_pin(user,data):
    current_pin=None
    new_pin=None
    
    errors = []
    if not "current_pin" in data:
        errors.append("Current pin is required")
        return errors, None
    else:
        current_pin = data['current_pin']
       

    if not "new_pin" in data:
        errors.append("New pin is required")
        return errors, None
    else:
        new_pin = data['new_pin']

    if UserAccounts.objects.filter(owner=user).exists():
        user_account = UserAccounts.objects.filter(owner=user).first()
        errors, result= jambopay_wallet.validate_wallet_pin(user_account.account_phone, current_pin)
        if errors:
            return errors, None
        else:
            pass
        
        errors, result = jambopay_wallet.change_wallet_pin(user_account.account_phone, new_pin)
        create_log("error", result)
        if errors:
            return errors, None
        else:
            return [], "Pin is changed successfully"
    else:
        errors.append("User has no wallet account")
        return errors, None