from ..models import UserAccounts
from .. import models
from authentication.models import Entities
import requests
from decouple import config
import json
from utils.logging import create_log

from intergrations.jambopay.jambopay_wallet import get_wallet_balance
def retrieve_user_account_status(data,user):
    errors=[]
    user_account=None
    token =None
    if not user == user.entity.administrator:
        errors.append("You are not authorised to view account details.")
        return errors, None
    if not UserAccounts.objects.filter(owner=user.entity.administrator).exists():
        errors.append("No collection account is set for this entity")
        return errors,None
    else:
        user_account= UserAccounts.objects.filter(owner=user.entity.administrator).first()

    if user_account:
        auth_data = {
            "client_id": config("JAMBOPAY_CLIENT_ID"),
            "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
            "grant_type": config("JAMBOPA_GRANT_TYPE"),
        }
        auth_res = requests.post(config("JAMBOPAY_AUTH_URL1"), data=auth_data, headers={"Content-Type": "application/x-www-form-urlencoded"})
        token = auth_res.json().get("access_token")
        
        data=json.dumps({
            "accountNo": user_account.account_number
        })
        if token:
            headers = {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token,
                
            }
            result = requests.post(
                    config("JAMBOPAY_BASE_URL") + "/wallet/balance",
                    data=data,
                    headers=headers,
                )
            result_json=result.json()
            create_log("info",f"Balance result: {result_json}")
            if "message" in result_json:
                for i in result_json["message"]:
                    errors.append(i)
                return errors, None
            else :
                return [],result_json
    
def retrieve_user_account_balance(data,user):
    errors=[]
    if UserAccounts.objects.filter(owner=user).exists():
        account = UserAccounts.objects.filter(owner=user).first()
        payload = {
            "account_number": account.account_number
        }
        errors, balance_json = get_wallet_balance(payload)
        if balance_json:
            
            return [], balance_json
        else:
           return errors, None
    else:
        errors.append("You have no payments account in the system")
        return errors,None
    
def create_entity_banking_account(data, user):
    errors =[]
    bank = None

    if not "bank" in data:
        errors.append("Bank not specified")
        return errors, None
    else:
        if Entities.objects.filter(id=data["bank"],entity_type="BANK").exists():
            bank = Entities.objects.filter(id=data["bank"],entity_type="BANK").first()
    if not "bank_account_number" in data:
        errors.append("Bank account number not specified")
        return errors, None
    if not "bank_account_name" in data:
        errors.append("Bank account name not specified")
        return errors, None
    # if not "currency" in data:
    #     errors.append("Currency not specified")
    #     return errors, None
    
    if models.BankClientEntity.objects.filter(
        bank=data["bank"], 
        bank_account_number=data["bank_account_number"]
    ).exists():
        errors.append("Banking account already exists for this entity")
        return errors, None
    
    created = models.BankClientEntity.objects.create(
        bank=bank,
        bank_account_number=data["bank_account_number"],
        bank_account_name=data["bank_account_name"],
        currency=data["currency"],
        entity=user.entity,
        client_entity=user.entity,
        is_verified="false",
        owner=user
    )
    if created:
        return [], created
    else:
        errors.append("Failed to create banking account")
        return errors, None
    

    
    
def  get_entity_banking_account(data, user):
    errors = []
    bank = None
    if "bank" not in data:
        errors = ["Bank not specified"]
        return errors, None
    else:
        if not Entities.objects.filter( id=data["bank"],entity_type="BANK").exists():
            errors = ["No bank exists with provided ID"]
            return errors, None
        else:
            if models.Entities.objects.filter(id=data["bank"],entity_type="BANK").exists():
                bank = models.Entities.objects.filter(id=data["bank"],entity_type="BANK").first()

            else:
                errors.append("Bank not verified or does not exist")
                return errors, None
  
    if models.BankClientEntity.objects.filter(client_entity=user.entity,bank=bank).exists():
        account = models.BankClientEntity.objects.filter(client_entity=user.entity, bank=bank).first()

        return errors, account
    else:
        errors.append("No banking account found for this entity")
        return errors, None
