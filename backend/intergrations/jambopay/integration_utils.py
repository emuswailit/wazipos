from django.db import IntegrityError
from payments.validators.payments_models_validators import validate_psp_exists
from payments.models import PayoutAccounts
from rest_framework import exceptions

def create_payout_account(data,user):
    errors =[]
    psp_id=""
    psp=None
    account_number=""
    account_type=""
    account_code=""
    business_number=""
    title=""

    if not "psp" in data or data["psp"]=="":
        errors.append("Payment services provider ID is required")
    else:
        psp_id=data["psp"]
        psp = validate_psp_exists(psp_id)


    if not "title" in data or data["title"]=="":
        errors.append("Account title is required")
    else:
        title=data["title"]

    if not "account_number" in data or data["account_number"]=="":
        errors.append("Account number is required")
    else:
        account_number=data["account_number"]

    if not "account_type" in data or data["account_type"]=="":
        errors.append("Account type is required")
    else:
        account_type=data["account_type"]

    if "account_code" in data and data["account_code"]!="":
        account_code=data["account_code"]

    if "business_number" in data and data["business_number"]!="":
        business_number=data["business_number"]

    if len(errors)>0:
        return errors, None
    else:
        try:
            created =PayoutAccounts.objects.create(psp=psp,
                                                    title=title, 
                                                    account_number=account_number, 
                                                    account_type=account_type,
                                                    business_number=business_number,
                                                    account_code=account_code,
                                                    owner=user,entity=user.entity)
            return [],created
        except IntegrityError as e:
            raise exceptions.ValidationError("An account with similar details already exists")