
from properties.models import PropertyUnits
from authentication.utils.utils import get_telco_by_phone_number,generate_reference_number
from payments.models import UserAccounts
# from intergrations.jambopay.jambopay_mobile_checkout import jambopay_mobile_checkout
from properties.models  import PropertyUnitPayments
from core.date_utils import get_today
import json
def rent_1(splitted,msisdn):
    response = "CON Enter your property reference number \n"
    return response

def rent_2(splitted,msisdn):
    property_unit=None
    if not PropertyUnits.objects.filter(reference_number=splitted[1]).exists():
        response = "END Property unit with this number does not exist"
        return response
    else:
        property_unit = PropertyUnits.objects.filter(reference_number=splitted[1]).first()
        response = f"CON Enter number of months to pay for  \n"
        return response
    
def rent_3(splitted,msisdn):
    months=splitted[2]
    if not months.isdigit():
        response = "END Invalid input. Enter a valid number of months"
        return response
    if int(months)<1:
        response = "END Invalid input. Number of months should be at least 1"
        return response
    if int(months)>12:
        response = "END Invalid input. Number of months should not be more than 12"
        return response

    property_unit=None
    if not PropertyUnits.objects.filter(reference_number=splitted[1]).exists():
        response = "END Property unit with this number does not exist"
        return response
    else:
        property_unit = PropertyUnits.objects.filter(reference_number=splitted[1]).first()
        response = f"CON Pay KES {round(float(property_unit.price)* float(months),2)} rent for unit {property_unit.title} at {property_unit.property.title} \n"
        response += "Enter 1 to pay using this number or enter another phone number\n"
        return response
    
def rent_4(splitted,msisdn):
    months=splitted[2]
    if not months.isdigit():
        response = "END Invalid input. Enter a valid number of months"
        return response
    if int(months)<1:
        response = "END Invalid input. Number of months should be at least 1"
        return response
    if int(months)>12:
        response = "END Invalid input. Number of months should not be more than 12"
        return response
    

    collection_account = None
    phone_number=None
    user_input = splitted[3]
    print("Spltted", splitted)
    print("Property ref", splitted[1])
    if PropertyUnits.objects.filter(reference_number=splitted[1]).exists():
        property_unit = PropertyUnits.objects.filter(reference_number=splitted[1]).first()

        if not UserAccounts.objects.filter(owner=property_unit.entity.administrator, account_type="WALLET").exists():
            response = "END Property unit does not have a collection account"
            return response
        else:
            collection_account = UserAccounts.objects.filter(owner=property_unit.entity.administrator, account_type="WALLET").first()
            print("Collection account", collection_account)
    else:
        response = "END Property unit does not exist"
        return response
    
    if len(user_input)==1 and user_input.startswith("1"):
        user_input = msisdn
    
    if len(user_input)>1 and len(user_input)<10 or len(user_input)>13:
        response = "END Invalid phone number"
        return response
    else:
        validated_phone = get_telco_by_phone_number(user_input)
        phone_number = validated_phone[1]
    
    if phone_number is None:
        response = "END Invalid phone number"
        return response
    else:
        try:
            payload=None
            amount_to_pay = float(property_unit.price)* float(months)
            reference_number=generate_reference_number(collection_account.owner.entity,collection_account.owner)
            telco, formatted_phone_number = get_telco_by_phone_number(phone_number)
            if telco=="MPESA":
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount": int(amount_to_pay),
                    "callBackUrl": "https://webhook.site/a8c1b092-2fda-4538-ad8e-1016009301ce",
                    "accountTo":  collection_account.account_number,
                    "description": "Merchant payment",
                    "modeOfPayment": "MOBILE_MONEY",
                    "provider": "Mpesa",
                    "data": {
                        "phoneNumber": formatted_phone_number,
                        "serviceType": "TOPUP"
                    }
                    })
            elif telco=="AIRTELMONEY":
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount": amount_to_pay,
                    "callBackUrl": "https://webhook.site/a8c1b092-2fda-4538-ad8e-1016009301ce",
                    "accountTo":collection_account.account_number, 
                    "currency":"KES",
                    "description": "TOPUP",
                    "modeOfPayment": "MOBILE_MONEY",
                    "provider": "AIRTELMONEY",
                    "data": {
                        "phoneNumber": formatted_phone_number,
                        "serviceType": "TOPUP" 
                    }
                    })
            # print("Result payload", payload)
            if payload:
                errors=[]
                result_json=None
                # errors, result_json = jambopay_mobile_checkout(payload)

                if result_json:

                    created =PropertyUnitPayments.objects.create(account=collection_account,months=months,telco=telco,status="PENDING",entity=property_unit.entity, valid_from=get_today(),valid_to=property_unit.price_due_date,
                                                                property_unit=property_unit, amount=amount_to_pay,reference_number=reference_number,msisdn=formatted_phone_number,psp_reference_number=result_json["ref"])
                
                    response = f"END Payment of KES {amount_to_pay} to {collection_account.owner.first_name} {collection_account.owner.last_name} initiated. Enter pin when prompted to complete"  
                    return response  
                else:
                    response = f"END Payment not processes {errors}"
                    return response  

            else:
                response = "END No payload"
                return response
        except Exception as e:
            print("Error", str(e))
            response = "END Payment could not be processed at the moment"
            return response
    
    
