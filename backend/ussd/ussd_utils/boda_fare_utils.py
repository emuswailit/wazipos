
from transport.models import Vehicles, SaccoPersonnelAccount,TicketPayment, SaccoPersonnel
from authentication.utils.utils import generate_reference_number
from core.phone_number_utils import get_telco_by_phone_number
import json
# from intergrations.jambopay.jambopay_mobile_checkout import jambopay_mobile_checkout
from payments.models import PaymentMethods, UserAccounts

def get_matatu_details(splitted):
    registration = splitted[1]
    formatted_registration = registration.replace(" ","").strip().upper()
    if Vehicles.objects.filter(registration=formatted_registration).exists():
        vehicle=Vehicles.objects.filter(registration=formatted_registration).first()
        return vehicle
    else:
        return None

def pay_boda_fare_1(splitted,msisdn):
    # response = "CON Enter motocycle/tuktuk registration \n"
    response = "CON Enter motocycle/tuktuk till number \n"
    return response

def pay_boda_fare_2(splitted,msisdn):
    account=None
    if not UserAccounts.objects.filter(account_number=splitted[1]).exists():
        response = "END Account with this number does not exist"
        return response
    else:
        account = UserAccounts.objects.filter(account_number=splitted[1]).first()

        if SaccoPersonnel.objects.filter(user=account.owner).exists():
            sacco_personnel =  SaccoPersonnel.objects.filter(user=account.owner).first()
            if Vehicles.objects.filter(driver = sacco_personnel).exists():
                response = "CON Enter amount to payee"
                return response
            else:
                response = f"END No vehicle is set by user"
                return response
        else:
            response = f"END Not in sacco"
            return response

    # if SaccoPersonnel.objects.filter(user=account.owner).exists():
    #     sacco_personnel =  SaccoPersonnel.objects.filter(user=account.owner).first()
    #     if sacco_personnel:
    #         if Vehicles.objects.filter(driver = sacco_personnel).exists():
    #             vehicle = Vehicles.objects.filter(driver = sacco_personnel).first()
    #             response = f"CON Pay {account.owner.first_name} {account.owner.last_name} \n"
    #             response += "Enter amount to pay"
    #             return response
    #     else:
    #         response = "END Not registered with sacco"
    #         return response   
    # else:
    #     response = "END User has not set a vehicle"
    #     return response
            
    

def pay_boda_fare_3(splitted,msisdn):
    payload=None
    vehicle =None
    if PaymentMethods.objects.filter(title="MOBILE MONEY").exists():
        payment_method =PaymentMethods.objects.filter(title="MOBILE MONEY").first()
    else:
        response = "END Check payment methods"
        return response
    collection_account = None
    
    if not UserAccounts.objects.filter(account_number=splitted[1]).exists():
        response = "END Account with this number does not exist"
        return response
    else:
        collection_account = UserAccounts.objects.filter(account_number=splitted[1]).first()

        if SaccoPersonnel.objects.filter(user=collection_account.owner).exists():
            sacco_personnel =  SaccoPersonnel.objects.filter(user=collection_account.owner).first()
            if Vehicles.objects.filter(driver = sacco_personnel).exists():
                vehicle = Vehicles.objects.filter(driver = sacco_personnel).first()
                # response = f"END User vehicle vehicle {vehicle}"
                # return response
        else:
            response = "END User has not set a vehicle"
            return response
    # vehicle = get_matatu_details(splitted)
    # if vehicle and vehicle.administrator:
    #     if SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).exists():
    #         collection_account= SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).first()
    #     else:
    #         response = "END Vehicle not set up to receive funds"
    #         return response
    # else:
    #     response = "END No vehicle found with this registration"
    #     return response
    if vehicle:
        amount_to_pay = round(float(splitted[2]),2)
        reference_number=generate_reference_number(collection_account.owner.entity,collection_account.owner)
        telco, formatted_phone_number = get_telco_by_phone_number(msisdn)
        if telco=="MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(amount_to_pay),
                "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                "accountTo":  collection_account.account_number,
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
                "amount": amount_to_pay,
                "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                "accountTo":collection_account.account_number, 
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
            result_json =None
            # errors, result_json = jambopay_mobile_checkout(payload)

            if result_json:

                created =TicketPayment.objects.create(telco=telco,status="PENDING",payment_method=payment_method,owner=vehicle.owner,entity=vehicle.entity, 
                                                            vehicle=vehicle, amount=amount_to_pay,reference_number=reference_number,msisdn=formatted_phone_number,psp_reference_number=result_json["ref"])
            
                response = f"END Payment of KES {amount_to_pay} to {collection_account.owner.first_name} {collection_account.owner.last_name} initiated. Enter pin when prompted to complete"  
                return response  
            else:
                response = f"END Payment not processes {errors}"
                return response  

        else:
            response = "END No payload"
            return response
    else:
        response = "END No vehicle"
        return response