from .. import models
from django.db.models import Q
from core.date_utils import get_formatted_from_date, get_formatted_to_date, get_today_date
from transport.transport_validators import validate_transfer
from payments.validators import payments_models_validators
from transport.models import TransferBookings
from core.phone_number_utils import get_telco_by_phone_number
from authentication.utils.utils import generate_reference_number, generate_document_number
# from intergrations.jambopay.jambopay_mobile_checkout import jambopay_mobile_checkout
import json
from payments.models import EntityPSPCollectionAccount

def get_entity_transfers(user, data):


    qs = models.Transfers.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by('-created')

   
    return qs
def get_entity_transfer_points(user, data):
    qs = models.TransferPoints.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by('title')

   
    return qs

def get_entity_transfer_points(user, data):
    qs = models.TransferPoints.objects.filter(
            entity=user.entity, 
        ).all().order_by('title')

   
    return qs


def create_transfer_booking(data, user):
    errors = []
    payment_method=None
    print("Create booking")
    transfer = None
    first_name =""
    last_name = ""
    identifier_number =""
    collection_account = "1233716"
    payload=""
    telco=""
    if not "transfer" in data["transfer_booking_details"] or  data["transfer_booking_details"]["transfer"]=="":
        errors.append("Transfer is required")
    else:
        transfer = validate_transfer(data["transfer_booking_details"]["transfer"])
        if EntityPSPCollectionAccount.objects.filter(entity=transfer.entity).exists():
            collection_account = EntityPSPCollectionAccount.objects.filter(entity=transfer.entity).first()
        else:
            pass
            # errors.append("Entity has no colletion account")

    if not "first_name" in data["transfer_booking_details"] or  data["transfer_booking_details"]["first_name"]=="":
        errors.append("First name is required")
    else:
        first_name =data["transfer_booking_details"]["first_name"]

    if not "last_name" in data["transfer_booking_details"] or  data["transfer_booking_details"]["last_name"]=="":
        errors.append("Last name is required")
    else:
        last_name =data["transfer_booking_details"]["last_name"]

    if not "identifier_number" in data["transfer_booking_details"] or  data["transfer_booking_details"]["identifier_number"]=="":
        errors.append("National ID or passport number is required")
    else:
        identifier_number = data["transfer_booking_details"]["identifier_number"]

    if  "payment_method" in data["transfer_booking_details"] and not  data["transfer_booking_details"]["payment_method"]=="":
        payment_method = payments_models_validators.validate_payment_method_exists(data["transfer_booking_details"]["payment_method"])

    if   "mobile_money_phone" in data["transfer_booking_details"] and not  data["transfer_booking_details"]["mobile_money_phone"]=="":
        telco, mobile_money_phone=get_telco_by_phone_number (data["transfer_booking_details"]["mobile_money_phone"])
        print("TC", telco)
    if len(errors)>0:
        return errors, None
    else:
        reference_number=generate_reference_number(transfer.entity,transfer.owner)
        if telco=="MPESA":

            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(transfer.transfer_fare),
                "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                "accountTo":  collection_account,
                "description": "Merchant payment",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": mobile_money_phone,
                    "serviceType": "MERCHANTPAYMENT"
                }
                })
        elif telco=="AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": transfer.transfer_fare,
                "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                "accountTo":collection_account, 
                "currency":"KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": mobile_money_phone,
                    "serviceType": "MERCHANTPAYMENT" 
                }
                })
        print("Result payload", payload)
        errors=[]
        result_json=None
        # errors, result_json = jambopay_mobile_checkout(payload)
        print("Result json", result_json)
        print("Result errors", errors)
        if result_json and "rrn" in result_json:
            document_number = generate_document_number(transfer.entity, user,"TRANSFER")

            try:
                booking = TransferBookings.objects.create(transfer=transfer, 
                                                          entity = transfer.entity,
                                                    first_name=first_name,
                                                    last_name=last_name,
                                                    telco=telco,
                                                    status ="PENDING",
                                                    amount=transfer.transfer_fare,
                                                    payment_method=payment_method,
                                                    mobile_money_phone=mobile_money_phone,
                                                    identifier_number=identifier_number,
                                                    payment_narrative=result_json["rrn"],
                                                    payment_reference=result_json["ref"],
                                                    reference_number=reference_number,
                                                    document_number=document_number,
                                                    owner=transfer.owner
                                                    )
                if booking:
                    print("Created", booking)
                    return [],booking
            except Exception as e:
                print("No created")
                errors.append(str(e))
                return errors, None
        else:
            return errors, None
def get_transfer_bookings(user, data):


    qs = models.TransferBookings.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by('-created')

   
    return qs