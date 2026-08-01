from authentication.validators.authentication_models_validators import validate_entity, validate_town,validate_user
from intergrations.jambopay.jambopay_wallet import jambopay_authorize_transaction, jambopay_wallet_checkout, initiate_jambopay_settlement
from core.date_utils import get_formatted_from_date, get_formatted_to_date
# from intergrations.jambopay.jambopay_mobile_checkout import jambopay_mobile_checkout
from authentication.utils.utils import generate_document_number
from payments.validators.payments_models_validators import validate_payment_method_exists
from core.phone_number_utils import get_telco_by_phone_number
from . import models
from rest_framework import exceptions
from employees.models import Employees
from . import transport_validators
from payments.models import PaymentMethods, PaymentServicesProvider, UserAccounts
from django.db import transaction
from authentication.utils.utils import  generate_reference_number, use_reference_number
from django.db.models import Q
from django.utils import timezone
from transport.transport_validators import validate_destination, validate_route, validate_trip, validate_vehicle, validate_sacco_settlement_account
from decouple import config
import json
from intergrations.jambopay.jambopay_create_whitelabel_account import create_white_label_account
from core.time_utils import it_is_route_peak
from intergrations.jambopay.jambopay_wallet import get_wallet_balance,payout_from_wallet_to_mpesa_2,payout_from_wallet_to_bank,payout_from_wallet_to_bank_2, payout_from_wallet_to_paybill,payout_from_wallet_to_airtel,jambopay_check_wallet_payment_status,jambopay_authorize_wallet_payout
def create_ticket_item(items):
    created_tickets = []
    rejected_tickets = []
    errors = []
    for item in items:
        ref = item["reference_number"]
        if models.LegacyTickets.objects.filter(reference_number=ref).exists():
            rejected_tickets.append(item)
        else:
            try:
                created = models.LegacyTickets.objects.create(
                    item_name=item["cargo_name"],
                    from_city=item["from_city"],
                    to_city=item["to_city"],
                    travel_date=item["travel_date"],
                    selected_vehicle=item["selected_vehicle"],
                    selected_seat=item["selected_seat"],
                    seater=item["seater"],
                    selected_ticket_type=item["selected_ticket_type"],
                    payment_method=item["payment_method"],
                    phone_number=item["phone_number"],
                    id_number=item["id_number"],
                    passenger_name=item["passenger_name"],
                    email_address=item["email_address"],
                    amount_charged=item["amount_charged"],
                    insurance_charge=item["insurance_charge"],
                    reference_number=item["reference_number"],
                    quantity=item["quantity"],
                    served_by=item["served_by"],
                    entity_id="4b1d9e77-848e-48cc-9e45-b1bee1dd6769",
                )
                created_tickets.append(item)
            except Exception as e:
                errors.append(e)

    return created_tickets, rejected_tickets, errors


def get_assigned_routes(user):
    if Employees.objects.filter(user=user, entity=user.entity).exists():
        employee = Employees.objects.filter(user=user, entity=user.entity).first()
        if employee and len(employee.assigned_routes.all()) > 0:
            return employee.assigned_routes.all()
        else:
            return None
    else:
        raise exceptions.ValidationError("Update your employee status in your entity")

def get_entity_routes(user):
    if models.OperationRoutes.objects.filter(entity=user.entity).exists():
        return models.OperationRoutes.objects.filter(entity=user.entity).all()
    else:
        return []




@transaction.atomic
def create_single_ticket(data, user):
    errors=[]
    chrg = None
    route=None
    vehicle = None
    seat="FREE SEATING"
    trip =None
    mobile_money_phone=""
    destination=None
    first_name=""
    last_name=""
    passenger_phone=""
    identifier_number=""
    identifier_type=""
    payment_method=None
    ticket=None
    
    try:
        amount =0.00
        
        
        reference_number = transport_validators.validate_reference_number(
            data["ticket"]["reference_number"]
        )


        if "trip" in data["ticket"]:
            trip = validate_trip(data["ticket"]["trip"])

        if "route" in data["ticket"]:
            route = validate_route(data["ticket"]["route"])
        
        
        if not "vehicle" in data["ticket"] or  data["ticket"]["vehicle"]=="":
            errors.append("Vehicle is required")
            return errors, None
        else:
            vehicle = validate_vehicle(data["ticket"]["vehicle"])
        
        if not "destination" in data["ticket"] or  data["ticket"]["destination"]=="":
            errors.append("Vehicle is required")
            return errors, None
        else:
            destination = validate_destination(data["ticket"]["destination"])

        if not "payment_method" in data["ticket"]:
            errors.append("Payment method  is required")
            return errors, None
        else:
            payment_method= validate_payment_method_exists(data["ticket"]["payment_method"])

        
        if "mobile_money_phone" in data and "payment_method" in data["ticket"] and not data["ticket"]["payment_method"]=="":
            payment_method= validate_payment_method_exists(data["ticket"]["payment_method"])
            if payment_method and payment_method.title=="MOBILE MONEY" and not data["ticket"]["mobile_money_phone"]:
                errors.append("Customer phone number is required for payment purposes")
                return errors, None
            else:
                mobile_money_phone=data["ticket"]["mobile_money_phone"]
        # else:
        #     errors.append("Mobile money phone is required")
        if "seat" in data["ticket"]:
            seat = data["ticket"]["seat"]
        if "first_name" in data["ticket"]:
            first_name = data["ticket"]["first_name"]
        if "last_name" in data["ticket"]:
            last_name = data["ticket"]["last_name"]

        if "customer_name" in data["ticket"]:
            first_name = data["ticket"]["customer_phone"]
        
        if "customer_phone" in data["ticket"]:
            passenger_phone = data["ticket"]["customer_phone"]
        if "identifier_number" in data["ticket"]:
            identifier_number = data["ticket"]["identifier_number"]
        if "identifier_type" in data["ticket"]:
            identifier_type = data["ticket"]["identifier_type"]
        
        if "passenger_phone" in data["ticket"]:
            passenger_phone = data["ticket"]["passenger_phone"]



        reference_number = data["ticket"]["reference_number"]
        if not reference_number or reference_number=="":
            reference_number=generate_reference_number(vehicle.entity,user)
        if models.Tickets.objects.filter(reference_number=reference_number).exists():
            ticket = models.Tickets.objects.filter(
                reference_number=reference_number
            ).first()
            use_reference_number(reference_number)
            return [],ticket
            # errors.append("Reference number already in use")
            return errors,None
        else:
            from datetime import date
            ticket = models.Tickets.objects.create(
                reference_number=reference_number,
                route=route,
                vehicle=vehicle,
                destination=destination,
                payment_method=payment_method,
                entity=vehicle.entity,
                owner=user,
                seat=seat,
                trip=trip,
                first_name=first_name,
                last_name=last_name,
                passenger_phone=passenger_phone,
                fare=destination.fare,
                identifier_type=identifier_type,
                identifier_number=identifier_number,
                mobile_money_phone=mobile_money_phone,
             
            )
            use_reference_number(reference_number)
            if "items" in data["ticket"]:
                items = data["ticket"]["items"]
                if len(items) > 0:
                    items_amount=0.00
                    for item in items:
                        if item["charge"]:
                            chrg_obj = models.Charges.objects.get(id=item["charge"])
                            ticket_item = models.TicketItems.objects.create(
                                ticket=ticket,
                                charge=chrg_obj,
                                quantity=item["quantity"],
                                entity=user.entity,
                                owner=user,
                            )

                            items_amount = amount + int(item["quantity"])*float(chrg_obj.price)
                    ticket.fare=items_amount 
                    ticket.save()       

            if "passengers" in data["ticket"]:
                pax = data["ticket"]["passengers"]
                if len(pax) > 0:
                    for item in pax:
                        passenger = models.Passengers.objects.create(
                            first_name=item["first_name"],
                            last_name=item["last_name"],
                            date_of_birth=item["date_of_birth"],
                            gender=item["gender"],
                            entity=user.entity,
                        )

            if payment_method.title=="MOBILE MONEY":
                
                data = json.dumps({
                    "orderId": ticket.reference_number,
                    "amount": int(amount),
                    "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                    "accountTo":  config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                    "description": "Merchant payment",
                    "modeOfPayment": "MOBILE_MONEY",
                    "provider": "Mpesa",
                    "data": {
                        "phoneNumber": mobile_money_phone,
                        "serviceType": "MERCHANTPAYMENT"
                    }
                    })
                errors=[]
                result_json=None
                # errors, result_json = jambopay_mobile_checkout(data)
                if result_json:
                    ticket_payment=models.TicketPayment.objects.create(
                        payment_method=ticket.payment_method,
                        reference_number=ticket.reference_number,
                        psp_reference_number=result_json["ref"],
                        currency=result_json["currency"],
                        amount=amount,
                        status="PENDING",
                        entity=user.entity,
                        owner=user
                    )

                    if ticket_payment:
                        ticket_payment.tickets.add(ticket)
                        return [], ticket
                    else:
                        errors.append("Ticket payment not created")
                        return errors, None
            
            if payment_method.title=="CASH":
                # Cash payments
                ticket_payment = models.TicketPayment.objects.create(
                
                    payment_method=payment_method,
                    reference_number=ticket.reference_number,
                    status="SUCCESS",
                    amount=amount,
                    entity=user.entity,
                    currency="KES",
                    owner=user
                )
                ticket_payment.tickets.add(ticket)
            return [], ticket
    except Exception as e:
        raise exceptions.ValidationError(e)

@transaction.atomic
def create_batched_tickets(data, user):
    tickets = None
    created = []
    vehicle=None
    destination=None
    payment_method=None
    jambopay_wallet_phone=""
    wallet =""
    mobile_money_phone =""
    seat =""
    origin = ""
    errors =[]
    ticket_document_number = None
    fare = None
    collection_account = None


    if not "payment_method" in data or  data["payment_method"]=="":
        errors.append("Payment method ID is required")
        return errors, None, None
    else:
        payment_method = validate_payment_method_exists(data["payment_method"])
    if payment_method.title =="MOBILE MONEY" and  data["mobile_money_phone"]=="":
        errors.append("Mobile money number is required ")
        return errors, None, None
    else:
        if 'mobile_money_phone' in data:
            mobile_money_phone = data["mobile_money_phone"]

    if "tickets" in data:
        destination=None
        tickets = data["tickets"] 
        created_tickets =[]  
        ticket_total_fare=0.00

        for ticket in tickets:
            if "fare" in ticket and not ticket["fare"]=="":
                ticket_total_fare= ticket_total_fare + float(ticket["fare"])
            else:
                if "destination" in ticket and not ticket["destination"] =="":
                    destination=validate_destination(ticket["destination"])
                    if it_is_route_peak(destination.route):
                        ticket_total_fare=ticket_total_fare + float(destination.fare_peak)
                    else:
                        ticket_total_fare=ticket_total_fare + float(destination.fare)
                

    if "tickets" in data:
        tickets = data["tickets"] 
        created_tickets =[]  
           
        for item in tickets:
            
            if not "destination" in item or  item["destination"]=="":
                errors.append("Destination is required")
                return errors, None, None
            else:
                destination = validate_destination(item["destination"])



            if  "fare" in item and not  item["fare"]=="":
                fare =float(item["fare"])
            else:
                if it_is_route_peak(destination.route):
                    fare = destination.fare_peak
                else:
                    fare =destination.fare
            
            if not "trip" in item or  item["trip"]=="":
                errors.append("Trip ID is required")
                return errors, None,None
            else:
                trip = validate_trip(item["trip"])


            if not "vehicle" in item or  item["vehicle"]=="":
                errors.append("Vehicle is required")
                return errors, None, None
            else:
                vehicle = validate_vehicle(item["vehicle"])
                if not vehicle.collector:
                    errors.append("This vehicle has no set collector")
                else:
                    if UserAccounts.objects.filter(owner=vehicle.collector).exists():
                        collection_account = UserAccounts.objects.filter(owner=vehicle.collector).first()
                    else:
                        errors.append("Vehicle has no ready collection account")
                        return errors

            if "seat" in item:
                seat =item["seat"]
            if "origin" in item:
                origin =item["origin"]
            
            if "reference_number" in item and not item["reference_number"]=="":
                reference_number = transport_validators.validate_reference_number(
                    item["reference_number"]
                )
            else:
                reference_number=generate_reference_number(vehicle.entity,user)
                ticket_document_number = generate_document_number(vehicle.entity, user,"TICKET")
                try:
                    created = models.Tickets.objects.create(
                        reference_number=reference_number,
                        route_id=item["route"],
                        vehicle_id=item["vehicle"],
                        destination=destination,
                        payment_method=payment_method,
                        entity=vehicle.entity,
                        owner=user,
                        seat=seat,
                        trip=trip,
                        origin = origin,
                        first_name=item["first_name"],
                        last_name=item["last_name"],
                        passenger_phone=item["passenger_phone"],
                        fare=float(fare),
                        identifier_type=item["identifier_type"],
                        identifier_number=item["identifier_number"],
                        mobile_money_phone=mobile_money_phone,
                        document_number= ticket_document_number
                    )

                    if created:
                        created_tickets.append(created)
                        use_reference_number(reference_number)
                    else:
                        pass
                        
                except Exception as e:
                        errors.append(str(e))
                        return errors,[], None



        if len(created_tickets)==len(tickets): 
              
            if payment_method.title=="CASH":
                # cash_document_number=generate_document_number(vehicle.entity, user, "FARE")    
                reference_number=generate_reference_number(vehicle.entity,user)
                # Cash payments
                ticket_payment = models.TicketPayment.objects.create(
                    payment_method=payment_method,
                    reference_number=reference_number,
                    status="SUCCESS",
                    amount=ticket_total_fare,
                    entity=user.entity,
                    currency="KES",
                    owner=user,
                    trip = trip,
                    vehicle = vehicle
                )
                if ticket_payment:
                    for ticket in created_tickets:
                        ticket_payment.tickets.add(ticket)
                       
                return [], created_tickets, None
            
            if payment_method.title=="MOBILE MONEY":
                payload = None
                # mobile_money_document_number = generate_document_number(vehicle.entity, user,"FARE")
                # if models.VehicleCollectionAccount.objects.filter(vehicle=vehicle).exists():
                #     vehicle_collection_account=models.VehicleCollectionAccount.objects.filter(vehicle=vehicle).first()
                telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
                
                reference_number=generate_reference_number(vehicle.entity, user)
            
                if telco=="MPESA":
                    # payload = json.dumps({
                    #     "orderId": reference_number,
                    #     "amount": int(ticket_total_fare),
                    #     "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                    #     "accountTo":  config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                    #     "description": "Merchant payment",
                    #     "modeOfPayment": "MOBILE_MONEY",
                    #     "provider": "Mpesa",
                    #     "data": {
                    #         "phoneNumber": formatted_phone_number,
                    #         "serviceType": "MERCHANTPAYMENT"
                    #     }
                    #     })
                    payload = json.dumps({
                        "orderId": reference_number,
                        "amount": int(ticket_total_fare),
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
                    # payload = json.dumps({
                    #     "orderId": reference_number,
                    #     "amount": ticket_total_fare,
                    #     "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                    #     "accountTo":config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"), 
                    #     "currency":"KES",
                    #     "description": "TOPUP",
                    #     "modeOfPayment": "MOBILE_MONEY",
                    #     "provider": "AIRTELMONEY",
                    #     "data": {
                    #         "phoneNumber": formatted_phone_number,
                    #         "serviceType": "MERCHANTPAYMENT" 
                    #     }
                    #     })
                    payload = json.dumps({
                        "orderId": reference_number,
                        "amount": ticket_total_fare,
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
                errors=[]
                result_json=None
                # errors, result_json = jambopay_mobile_checkout(payload)
                if result_json:
        
                    ticket_payment=models.TicketPayment.objects.create(
                        reference_number=reference_number,
                        payment_method=payment_method,
                        psp_reference_number=result_json["ref"],
                        currency=result_json["currency"],
                        amount=ticket_total_fare,
                        status="PENDING",
                        entity=vehicle.entity,
                        owner=vehicle.owner,
                        trip = trip,
                        vehicle = vehicle
                       
                    )
                    use_reference_number(reference_number)
                    if ticket_payment:
                        for ticket in created_tickets:
                            ticket_payment.tickets.add(ticket)
                        return [], created_tickets,result_json["ref"]
                    else:
                        errors.append("Ticket payment not created")
                        return errors, [], None
                else:
          
                    return errors,[], None
                    

            if payment_method.title=="JAMBOPAY WALLET":
                wallet_document_number=generate_document_number(vehicle.entity, user, "FARE")    
                reference_number=generate_reference_number(vehicle.entity, user)
                errors.append("Jambopay payment method")
                if not "jambopay_wallet_phone" in data or data["jambopay_wallet_phone"]=="":
                    errors.append("Jambopay wallet number s required")
                    return errors, None, None
                else:
                    jambopay_wallet_phone = data["jambopay_wallet_phone"]
                    if UserAccounts.objects.filter(account_phone=jambopay_wallet_phone).exists():
                        wallet =  UserAccounts.objects.filter(account_phone=jambopay_wallet_phone).first()
                    # errors, wallet = get_account_by_phone(jambopay_wallet_phone)
                
                       
                        data ={
                                        "orderId": reference_number,
                                        "amount": ticket_total_fare,
                                        "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
                                        "accountTo": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                                        "description": "Test_Wallet Checkout",
                                        "modeOfPayment": "WALLET_AS_SERVICE",
                                        "provider": "JAMBOPAY",
                                        "data": {
                                                "serviceType": "MERCHANTPAYMENT",
                                                "accountNo": wallet.account_number
                                        }
                                        }
                        response = jambopay_wallet_checkout(data)
                
                        if not "statusCode" in response and  "ref" in response:
                            ticket_payment=models.TicketPayment.objects.create(
                            payment_method=payment_method,
                            reference_number=reference_number,
                            psp_reference_number=response["ref"],
                            currency=response["currency"],
                            amount=ticket_total_fare,
                            status="PENDING",
                            entity=user.entity,
                            owner=user,
                            trip = trip,
                            vehicle = vehicle

                                )
                            use_reference_number(reference_number)
                            if ticket_payment:
                                for ticket in created_tickets:
                                    ticket_payment.tickets.add(ticket)
                                return [], created_tickets, response["ref"]
                            else:
                                errors.append("Ticket payment not created")
                                return errors, [], None
                        else:
                            # errors.append( str(response))
                            return errors, None, None

                    else:
                        errors.append("No wallet for provided mobile phone")
                        return errors, None, None
        
    else:
        raise exceptions.ValidationError("No tickets in request") 


def get_route_destinations(data, user):
    route_id = ""
    destinations = []
    if "route" in data and not data["route"] == "":
        route_id = data["route"]
        route = transport_validators.validate_route(route_id)
        if models.Destinations.objects.filter(route=route).exists():
            destinations = models.Destinations.objects.filter(route=route).all()
            return destinations
        else:
            return None
    else:
        raise exceptions.ValidationError("Route ID is required")


def get_payment_methods():
    return PaymentMethods.objects.all()

def get_vehicle_subscriptions(user):
    return models.SaccoSubscription.objects.filter(entity=user.entity)


def get_vehicle_subscription_payments(user):
    return models.SaccoSubscriptionPayment.objects.filter(entity=user.entity).order_by('-created')


def get_user_tickets(user, data):
    if "route" in data and not data["route"] == "":
        route_id = data["route"]
        if route_id:
            route = validate_route(route_id)
    else:
        raise exceptions.ValidationError("Route is required")
    today = timezone.now().date()
    from_date = timezone.now().date()
    to_date = timezone.now().date()
    qs = []
    if (
        "filters" in data
        and data["filters"]
        and "from_date" in data["filters"]
        and "to_date" in data["filters"]
    ):
        qs = models.Tickets.objects.filter(
            entity=user.entity, owner=user, route=route
        ).filter(Q(created__gte=today))
        # from django.utils.dateparse import parse_datetime

        # from_date = parse_datetime(data["filters"]["from_date"]).strftime(
        #     "%Y-%m-%d %H:%M:%S"
        # )

        # to_date = parse_datetime(data["filters"]["to_date"] + " 23:59:59").strftime(
        #     "%Y-%m-%d %H:%M:%S"
        # )
 

        # qs = models.Tickets.objects.filter(
        #     entity=user.entity, owner=user, route=route
        # ).filter(Q(created__gte=from_date, created__lte=to_date))


    else:
        qs = models.Tickets.objects.filter(
            entity=user.entity, owner=user, route=route
        ).filter(Q(created__gte=today))
    return qs

def get_user_tickets_by_id(data):
    user = None
    if "user" in data and not data["user"] == "":
        user = validate_user(data['user'])
        print("User",data['user'])
    else:
        raise exceptions.ValidationError("User ID is required")
    today = timezone.now().date()
    from_date = timezone.now().date()
    to_date = timezone.now().date()
    qs = []
    if (
        "filters" in data
        and data["filters"]
        and "from_date" in data["filters"]
        and "to_date" in data["filters"]
    ):
        qs = models.Tickets.objects.filter(
            entity=user.entity, owner=user,
        ).filter(Q(created__gte=today))
        # from django.utils.dateparse import parse_datetime

        # from_date = parse_datetime(data["filters"]["from_date"]).strftime(
        #     "%Y-%m-%d %H:%M:%S"
        # )

        # to_date = parse_datetime(data["filters"]["to_date"] + " 23:59:59").strftime(
        #     "%Y-%m-%d %H:%M:%S"
        # )
 

        # qs = models.Tickets.objects.filter(
        #     entity=user.entity, owner=user, route=route
        # ).filter(Q(created__gte=from_date, created__lte=to_date))


    else:
        qs = models.Tickets.objects.filter(
            entity=user.entity, owner=user
        ).filter(Q(created__gte=today))
    return qs
def get_entity_tickets(user, data):
    # if "entity" in data and not data["entity"] == "":
    #     entity_id = data["entity"]
    #     if entity_id:
    #         entity = validate_entity(entity_id)
    # else:
    #     raise exceptions.ValidationError("Entity ID is required")

    qs = models.Tickets.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by("-created")

   
    return qs

def get_entity_ticket_payments(user, data):
   

    qs = models.TicketPayment.objects.filter(
            entity=user.entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by("-created")

   
    return qs

def get_entity_ticket_payment_settlements(user, data):
    qs = models.TicketPaymentSettlement.objects.filter(
            entity=user.entity, 
            status="SUCCESS"
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by("-created")

    return qs

def get_entity_ticket_count(data,user):
    if "entity" in data and not data["entity"] == "":
        entity_id = data["entity"]
        if entity_id:
            entity = validate_entity(entity_id)
    else:
        raise exceptions.ValidationError("Entity ID is required")

    count = models.Tickets.objects.filter(
            entity=entity, 
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).count()

   
    return count


def jp_authorize_transaction(data):
    otp = ""
    ref = ""
    errors =[]
    if not "otp" in data:
        errors.append("OTP is required")
    else:
        otp = data["otp"]

    if not "ref" in data:
        errors.append("Ref is required")
    else:
        ref = data["ref"]

    response = jambopay_authorize_transaction(otp,ref)
  
    if "statusCode" in response:
        
        return response['message'], None
    else:
       
        return [], response

def get_sacco_settlement_accounts(user):
    administrator = None
    accounts = []
    if models.SaccoPersonnel.objects.filter(user=user).exists():
        administrator = models.SaccoPersonnel.objects.filter(user=user).first()
        if models.SaccoSettlementAccount.objects.filter(entity=user.entity,administrator=administrator).exists():
            accounts =models.SaccoSettlementAccount.objects.filter(entity=user.entity,administrator=administrator).all()
    return accounts





@transaction.atomic
def update_sacco_settlement_account(data, user):
    errors = []
    sacco_settlement_account = None
    is_active = None

    if not "sacco_settlement_account_details" in data:
        errors.append("Sacco settlement account details to update are required")

    if not "sacco_settlement_account" in data["sacco_settlement_account_details"]:
        errors.append("Settlement account ID is required")
    else:
        sacco_settlement_account_id = data["sacco_settlement_account_details"]["sacco_settlement_account"]
        sacco_settlement_account = validate_sacco_settlement_account(sacco_settlement_account_id)


    if len(errors)>0:
        return errors, None
    else:
        if "is_active" in data["sacco_settlement_account_details"]:
            is_active = data["sacco_settlement_account_details"]["is_active"]
            sacco_settlement_account.is_active=is_active
            sacco_settlement_account.save()

        if "description" in data["sacco_settlement_account_details"]:
            description = data["sacco_settlement_account_details"]["description"]
            sacco_settlement_account.description=description
            sacco_settlement_account.save()

        return [], sacco_settlement_account


@transaction.atomic
def create_sacco_settlement_account(data, user):
    administrator_id = None
    administrator = None
    account_phone_number = None
    errors = []
    account_name = None
    description = None

    if not "account_name" in data["sacco_settlement_account_details"]:
        errors.append("Account name is required")
        return errors, None
    else:
        account_name = data["sacco_settlement_account_details"]["account_name"]

    if not "administrator_id" in data["sacco_settlement_account_details"]:
        errors.append("Administrator ID is required")
        return errors, None
        

    if  data["sacco_settlement_account_details"]["administrator_id"] == "":
        errors.append("Administrator ID cannot be empty")
        return errors, None
    else:
        administrator_id = data["sacco_settlement_account_details"]["administrator_id"]

    if models.SaccoPersonnel.objects.filter(id=administrator_id).exists():
        administrator = models.SaccoPersonnel.objects.filter(id=administrator_id).first()
        account_phone_number = administrator.user.phone
    
    else:
        errors.append("Sacco personnel with provided number does not exist")
        return errors, None
    

    # if not "account_phone_number" in data["sacco_settlement_account_details"]:
    #     errors.append("Account phone number is required")
    #     return errors, None

    # if  data["sacco_settlement_account_details"]["account_phone_number"] == "":
    #     errors.append("Account phone number cannot be empty")
    #     return errors, None
    # else:
        

    if models.SaccoSettlementAccount.objects.filter(account_phone_number= account_phone_number, account_name=account_name).exists():
        errors.append("Settlement account with this phone number already exists")
        return errors, None
    if "description" in   data["sacco_settlement_account_details"]:
        description =   data["sacco_settlement_account_details"]["description"]
    
    if len(errors)>0:
        return errors, None
    else:
        data=json.dumps({
                "currency": "KES",
                "phoneNumber": account_phone_number, 
                "name": account_name,
                "description": f"Sacco settlement account for {user.entity.title}",
                "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                "accountType": "Individual"
            })

        errors, account =create_white_label_account(data)

        if account:
            try:
                if PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
                        psp=PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
                        sacco_settlement_account = models.SaccoSettlementAccount.objects.create(
                                    administrator= administrator,
                                    account_phone_number=account_phone_number,
                                    psp=psp,
                                    account_number=account["accountNo"],
                                    account_name=account["name"],
                                    currency=account["currency"],
                                    entity=user.entity,
                                    owner=user,
                                    description= description
                                )
                        if sacco_settlement_account:
                            return [], sacco_settlement_account
                        else:
                            errors.append("Not created")
                            return errors, None
            except Exception as e:
                errors.append(str(e))
                return errors, None
        else:
            return errors, None


def get_unsynced_today_ticket_payments():
    qs = models.TicketPayment.objects.filter(
            is_settled=False, 
            status="SUCCESS"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs

def get_unsynced_today_sacco_subscription_payments():
    qs = models.SaccoSubscriptionPayment.objects.filter(
            is_settled=False, 
            status="SUCCESS"
        ).all().order_by("-created").exclude(payment_method__title="JAMBOPAY WALLET")

    return qs
@transaction.atomic           
def create_cashless_ticket_settlement(utp, account):
    data =  json.dumps({
        "callbackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
        "amount": str(utp.amount),
        "accountTo": account.account_number,
        "accountFrom":config("WAZIPOS_JAMBOPAY_PAYOUT_ACCOUNT"),
        "orderId": generate_reference_number(account.sacco_personnel.entity,account.sacco_personnel.user),
        
        })

    errors, result_json = initiate_jambopay_settlement(data)
    if result_json and result_json["ref"]:
        created = models.TicketPaymentSettlement.objects.create(
            administrator = utp.vehicle.administrator,
            sacco_personnel_account = account,
            vehicle = utp.vehicle,
            trip = utp.trip,
            status ="SUCCESS",
            psp_reference_number = result_json["ref"],
            account_from = result_json["accountFrom"],
            account_to = result_json["accountTo"],
            amount = float( result_json["amount"]),
            entity=utp.vehicle.entity,
            ticket_payment = utp

        )

        if created:
            utp.is_settled = True
            utp.status = "SETTLED"
            utp.save()

# @transaction.atomic           
def create_sacco_subscription_settlement(usp, account,reference_number):
    # reference_number = generate_reference_number(account.entity,account.owner),
    data =  json.dumps({
        "callbackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
        "amount": str(usp.amount),
        "accountTo": account.account_number,
        "accountFrom":config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
        "orderId": reference_number
        
        })

    errors, result_json = initiate_jambopay_settlement(data)
    if result_json and result_json["ref"]:
        created = models.SaccoSubscriptionSettlement.objects.create(
            sacco_subscription_payment = usp,
            sacco_settlement_account = account,
            status ="SUCCESS",
            psp_reference_number = result_json["ref"],
            account_from = result_json["accountFrom"],
            account_to = result_json["accountTo"],
            amount = float( result_json["amount"]),
            entity=usp.sacco_subscription.entity,
            reference_number = reference_number
        )

        if created:
            use_reference_number(reference_number)
            usp.is_settled = True
            usp.status = "SETTLED"
            usp.save()
def get_administrator_account(administrator):
    if models.SaccoPersonnelAccount.objects.filter(sacco_personnel=administrator, is_active="true").exists():
        return models.SaccoPersonnelAccount.objects.filter(sacco_personnel=administrator, is_active="true").first()
    else:
        return None
    
def get_vehicle_wallet_balance(data,user):
    errors = []
    vehicle_registration = None
    vehicle = None
    sacco_personnel = None
    vehicle_wallet = None
    if "vehicle_registration" in data:
        vehicle_registration = data["vehicle_registration"]
    else:
        errors.append("Vehicle registration number is required")
        return errors, None

    if models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").exists():
        vehicle=models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").first()
    else:
        errors.append("No vehicle exists with this registration number")
        return errors, None
    if models.SaccoPersonnel.objects.filter(user=user, is_active="true").exists():
       sacco_personnel = models.SaccoPersonnel.objects.filter(user=user, is_active="true").first() 

    if vehicle.administrator == sacco_personnel:
        if models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").exists():
            vehicle_wallet = models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").first()
        
            payload = { "account_number": vehicle_wallet.account_number
                            }
            errors, balance_json = get_wallet_balance(payload)
            if balance_json:
                balance = {"account_number":vehicle_wallet.account_number,
                           "balance":balance_json["balance"]} 
                return [], balance
            else:
                return errors, None
        else:
            errors.append(f"No wallet exists for  {vehicle}")
            return errors, None
    else:
        errors.append(f"You are not the administrator of {vehicle}")
        return errors, None
    

def get_vehicle_wallet_settlements(data,user):
    errors = []
    vehicle_registration = None
    sacco_personnel = None

    if "vehicle_registration" in data:
        vehicle_registration = data["vehicle_registration"]
    else:
        errors.append("Vehicle registration number is required")
        return errors, None
    if models.SaccoPersonnel.objects.filter(user=user, is_active="true").exists():
       sacco_personnel = models.SaccoPersonnel.objects.filter(user=user, is_active="true").first() 
    if models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").exists():
        vehicle=models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").first()
    else:
        errors.append("No vehicle exists with this registration number")
        return errors, None

    if vehicle.administrator == sacco_personnel:
        if models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").exists():
            vehicle_wallet = models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").first()
            
            if models.TicketPaymentSettlement.objects.filter().filter(Q(sacco_personnel_account=vehicle_wallet, vehicle=vehicle, created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).exists():
                settlements = models.TicketPaymentSettlement.objects.filter(Q(sacco_personnel_account=vehicle_wallet, vehicle=vehicle, created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all()
                return None, settlements
            else:
                return None, None
        else:
            errors.append(f"No wallet exists for  {vehicle}")
            return errors, None
    else:
        errors.append(f"You are not the administrator of {vehicle}")
        return errors, None
    

def get_vehicle_conductor(data,user):
    vehicle_registration = None
    vehicle = None
    crew = None
    conductor = None
    driver = None

    if "vehicle_registration" in data:
        vehicle_registration = data["vehicle_registration"]   
    else:
        errors.append("Vehicle registration number is required")
        return errors, None
    
    if models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true", entity=user.entity).exists():
        vehicle=models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true", entity=user.entity).first()
        if vehicle.conductor:
            return None, vehicle.conductor
        else:
            return None
    else:
        errors.append("No vehicle exists with this registration number")
        return errors, None
    
def get_vehicle_driver(data,user):
    vehicle_registration = None
    vehicle = None
    crew = None
    conductor = None
    driver = None

    if "vehicle_registration" in data:
        vehicle_registration = data["vehicle_registration"]   
    else:
        errors.append("Vehicle registration number is required")
        return errors, None
    
    if models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true", entity=user.entity).exists():
        vehicle=models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true", entity=user.entity).first()
        if vehicle.driver:
            return None, vehicle.driver
        else:
            return None
    else:
        errors.append("No vehicle exists with this registration number")
        return errors, None

def vehicle_collection_to_airtel(data,user):
    errors = []
    vehicle_registration = None
    sacco_personnel = None
    amount = 0.00
    airtel_account_number = None
    airtel_account_reference = ""
    narration = "Send to Airtel Money"
    reference_number = None
  

    if "vehicle_registration" in data:
        vehicle_registration = data["vehicle_registration"]
    else:
        errors.append("Vehicle registration number is required")
        return errors, None
    
    if "amount" in data:
        amount = data["amount"]
    else:
        errors.append("Amount  is required")
        return errors, None
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]

    # Validate mpesa phone number
    if "airtel_account_number" in data:
        airtel_account_number = data["airtel_account_number"]
        telco, validated_airtel_account_number = get_telco_by_phone_number(airtel_account_number)
        if telco =="AIRTELMONEY":
            pass
        else:
            errors.append(f"{airtel_account_number} is not a valid Airtel Money number")
            return errors, None
    else:
        errors.append("Airtel account number is required")
        return errors, None
    

    if "airtel_account_reference" in data:
        airtel_account_reference = data["airtel_account_reference"]
    
    
    if models.SaccoPersonnel.objects.filter(user=user, is_active="true").exists():
       sacco_personnel = models.SaccoPersonnel.objects.filter(user=user, is_active="true").first() 
    if models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").exists():
        vehicle=models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").first()
    else:
        errors.append("No vehicle exists with this registration number")
        return errors, None

    if vehicle.administrator == sacco_personnel:
        if models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").exists():
            vehicle_wallet = models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").first()
            payload = { "account_number": vehicle_wallet.account_number
                            }
            errors, balance_json = get_wallet_balance(payload)
  

            # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
            if balance_json and float(balance_json['balance'])> float(amount):
                reference_number = generate_reference_number(vehicle.entity, user)
                print("THE REF",reference_number)
                if reference_number:
                    payload = json.dumps({
                                "amount": amount,
                                "accountFrom": "1000922", 
                                "orderId": reference_number,
                                "provider": "MOMO_B2C",
                                "payTo": {
                                    "accountRef": airtel_account_reference,
                                    "accountNumber":validated_airtel_account_number
                                },
                                "callBackUrl": "https://webhook.site/5a0465a2-3e53-4955-b1ab-50c805102343",
                                "narration": narration
                                })
                    errors, collection_to_mpesa = payout_from_wallet_to_airtel(payload)
                    
                    if collection_to_mpesa:
                        use_reference_number(reference_number)
                    
                        return None, collection_to_mpesa
                    else:
                        return errors, None
            else:
                errors.append("insufficient balance")
                return errors, None
        else:
            errors.append(f"No wallet exists for  {vehicle}")
            return errors, None
    else:
        errors.append(f"You are not the administrator of {vehicle}")
        return errors, None
    
def vehicle_collection_to_mpesa(data,user):
    account_from = None
    account_ref = None
    errors = []
    vehicle_registration = None
    sacco_personnel = None
    amount = 0.00
    mpesa_account_number = None
    mpesa_account_reference = ""
    narration = "Send to Mpesa"
    wallet_pin =None
  

    if "vehicle_registration" in data:
        vehicle_registration = data["vehicle_registration"]
    else:
        errors.append("Vehicle registration number is required")
        return errors, None
    
    if "amount" in data:
        amount = data["amount"]
    else:
        errors.append("Amount  is required")
        return errors, None
    
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]

    if "pin" in data and not data["pin"]=="":
        wallet_pin = data["pin"]
    else:
        errors.append("Pin is required")

    # Validate mpesa phone number
    if "mpesa_account_number" in data:
        mpesa_account_number = data["mpesa_account_number"]
        telco, validated_mpesa_account_number = get_telco_by_phone_number(mpesa_account_number)
        if telco =="MPESA":
            pass
        else:
            errors.append(f"{mpesa_account_number} is not a valid mpesa number")
            return errors, None
    else:
        errors.append("Mpesa account number is required")
        return errors, None
    

    if "mpesa_account_reference" in data:
        mpesa_account_reference = data["mpesa_account_reference"]
    
    
    if models.SaccoPersonnel.objects.filter(user=user, is_active="true").exists():
       sacco_personnel = models.SaccoPersonnel.objects.filter(user=user, is_active="true").first() 
    
    if models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").exists():
        vehicle=models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").first()
        if vehicle.collector:
            if UserAccounts.objects.filter(owner=vehicle.collector).exists():
                account_from = UserAccounts.objects.filter(owner=vehicle.collector).exists()
            # if models.SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator, is_active="true").exists():
            #     collection_account = models.SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator, is_active="true").first()
            # account_ref= f"{vehicle.administrator.user.first_name} {vehicle.administrator.user.first_name}"
    else:
        errors.append("No vehicle exists with this registration number")
        return errors, None

    if vehicle.collector == sacco_personnel.user:
        if models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").exists():
            vehicle_wallet = models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").first()
            payload = { "account_number": vehicle_wallet.account_number
                            }
            errors, balance_json = get_wallet_balance(payload)
  

            # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
            if balance_json and float(balance_json['balance'])> float(amount):
                reference_number = generate_reference_number(vehicle.entity, user)
                payload = json.dumps({
                            "amount": amount,
                            "accountFrom": "1000922", 
                            "orderId": reference_number,
                            "provider": "MOMO_B2C",
                            "payTo": {
                                "accountRef": mpesa_account_reference,
                                "accountNumber":validated_mpesa_account_number
                            },
                            "callBackUrl": "https://webhook.site/5a0465a2-3e53-4955-b1ab-50c805102343",
                            "narration": narration,
    
                            })
                errors, collection_to_mpesa = payout_from_wallet_to_mpesa_2(payload,amount,account_from,user,wallet_pin)
                use_reference_number(reference_number)
                if collection_to_mpesa:
                   
                    return None, collection_to_mpesa
                else:
                    return errors, None
            else:
                errors.append("insufficient balance")
                return errors, None
        else:
            errors.append(f"No wallet exists for  {vehicle}")
            return errors, None
    else:
        errors.append(f"You are not the administrator of {vehicle}")
        return errors, None

def vehicle_collection_to_bank(data, user):
    errors = []
    bank_account = None
    bank_code = None
    amount = 0.00
    vehicle_registration = None
    sacco_personnel= None
    vehicle = None
    reference_number = None
    narration = "Wallet account withdrawal to bank"
    account_reference= ""

    if "vehicle_registration" in data:
        vehicle_registration = data["vehicle_registration"]
    else:
        errors.append("Vehicle registration number is required")
        return errors, None

    if "bank_account" in data and not data["bank_account"]=="":
        bank_account = data["bank_account"]
    else:
        errors.append("Bank account is required")
        return errors, None
    
    if "bank_code" in data and not data["bank_code"]=="":
        bank_code = data["bank_code"]
    else:
        errors.append("Bank account is required")
        return errors, None
    
    if "amount" in data:
        amount = data["amount"]
    else:
        errors.append("Amount  is required")
        return errors, None
    
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]

    if "account_reference" in data and not data["account_reference"]=="":
        account_reference = data["account_reference"]

    if models.SaccoPersonnel.objects.filter(user=user, is_active="true").exists():
       sacco_personnel = models.SaccoPersonnel.objects.filter(user=user, is_active="true").first() 
    
    if models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").exists():
        vehicle=models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").first()
    else:
        errors.append("No vehicle exists with this registration number")
        return errors, None

    if vehicle.administrator == sacco_personnel:
        if models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").exists():
            vehicle_wallet = models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").first()
            payload = { "account_number": vehicle_wallet.account_number
                            }
            errors, balance_json = get_wallet_balance(payload)
  

            # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
            if balance_json and float(balance_json['balance'])> float(amount):
                reference_number = generate_reference_number(vehicle.entity, user)
                if reference_number:
                    payload = json.dumps({
                        "amount": amount,
                        "accountFrom": vehicle_wallet.account_number,
                        "orderId": reference_number,
                        "provider": "BANK",
                        "payTo": {
                            "accountRef": account_reference,
                            "accountNumber": bank_account,
                            "bankCode": bank_code
                        },
                        "callBackUrl": "https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31",
                        "narration": f"{narration}",
                        "verificationType":"OTP"
                    })

                    errors, collection_to_mpesa = payout_from_wallet_to_bank_2(payload)
                    use_reference_number(reference_number)
                    if collection_to_mpesa:
                    
                        return None, collection_to_mpesa
                    else:
                        return errors, None
                    
            else:
                errors.append("Insufficeient amount")
                return errors, None
        else:
            errors.append("No collection account for this administrator")
            return errors, None
    else:
        errors.append("Please check if you are the vehicle administrator")
        return errors, None
    
def vehicle_collection_to_till(data, user):
    errors = []
    till_number = None
    amount = 0.00
    vehicle_registration = None
    sacco_personnel= None
    vehicle = None
    reference_number = None
    narration = "Wallet to MPesa Till NO."
   
    if "vehicle_registration" in data:
        vehicle_registration = data["vehicle_registration"]
    else:
        errors.append("Vehicle registration number is required")
        return errors, None

    if "till_number" in data and not data["till_number"]=="":
        till_number = data["till_number"]
    else:
        errors.append("Till number is required")
        return errors, None
    
    
    if "amount" in data:
        amount = data["amount"]
    else:
        errors.append("Amount  is required")
        return errors, None
    
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]


    if models.SaccoPersonnel.objects.filter(user=user, is_active="true").exists():
       sacco_personnel = models.SaccoPersonnel.objects.filter(user=user, is_active="true").first() 
    
    if models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").exists():
        vehicle=models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").first()
    else:
        errors.append("No vehicle exists with this registration number")
        return errors, None

    if vehicle.administrator == sacco_personnel:
        if models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").exists():
            vehicle_wallet = models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").first()
            payload = { "account_number": vehicle_wallet.account_number
                            }
            errors, balance_json = get_wallet_balance(payload)
  

            # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
            if balance_json and float(balance_json['balance'])> float(amount):
                print("BALANE", balance_json)
                reference_number = generate_reference_number(vehicle.entity, user)
                print("leff ", reference_number)
                if reference_number:
                    payload = json.dumps({
                        "amount": amount,
                        "accountFrom": "1000922",
                        "orderId": reference_number,
                        "provider": "MOMO_B2B",
                        "payTo": {
                            "accountNumber": till_number 
                        },
                        "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cbt",
                        "narration": narration
                        })

                    errors, collection_to_mpesa = payout_from_wallet_to_bank(payload)
                    use_reference_number(reference_number)
                    if collection_to_mpesa:
                    
                        return None, collection_to_mpesa
                    else:
                        return errors, None
                    
            else:
                errors.append("Reference generation error")
                return errors, None
        else:
            errors.append("No collection account for this administrator")
            return errors, None
    else:
        errors.append("Please check if you are the vehicle administrator")
        return errors, None
    
def vehicle_collection_to_paybill(data, user):
    errors = []
    paybill_number = None
    account_number = None
    amount = 0.00
    vehicle_registration = None
    sacco_personnel= None
    vehicle = None
    reference_number = None
    narration = "Wallet to MPesa Paybill NO."
   
    if "vehicle_registration" in data:
        vehicle_registration = data["vehicle_registration"]
    else:
        errors.append("Vehicle registration number is required")
        return errors, None

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
    
    
    if "amount" in data:
        amount = data["amount"]
    else:
        errors.append("Amount  is required")
        return errors, None
    
    if "narration" in data and not data["narration"]=="":
        narration = data["narration"]


    if models.SaccoPersonnel.objects.filter(user=user, is_active="true").exists():
       sacco_personnel = models.SaccoPersonnel.objects.filter(user=user, is_active="true").first() 
    
    if models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").exists():
        vehicle=models.Vehicles.objects.filter(registration = vehicle_registration.upper(), is_active="true").first()
    else:
        errors.append("No vehicle exists with this registration number")
        return errors, None

    if vehicle.administrator == sacco_personnel:
        if models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").exists():
            vehicle_wallet = models.SaccoPersonnelAccount.objects.filter(sacco_personnel=sacco_personnel, is_active="true").first()
            payload = { "account_number": vehicle_wallet.account_number
                            }
            errors, balance_json = get_wallet_balance(payload)
  

            # Add ttarrif amount to this check, balance should be gretaer than amount to send plus tariff charge: 
            if balance_json and float(balance_json['balance'])> float(amount):
                reference_number = generate_reference_number(vehicle.entity, user)
                if reference_number:
                    payload = json.dumps({
                        "amount": amount,
                        "accountFrom": "100922",
                        "orderId": reference_number,
                        "provider": "MOMO_B2B",
                        "payTo": {
                            "accountRef": account_number,
                            "accountNumber": paybill_number,
                        },
                        "callBackUrl": "https://webhook.site/7a311d8a-7c1b-4195-8640-e95e5ad616b3",
                        "narration": narration
                    })

                    errors, collection_to_mpesa = payout_from_wallet_to_paybill(payload)
                    use_reference_number(reference_number)
                    if collection_to_mpesa:
                    
                        return None, collection_to_mpesa
                    else:
                        return errors, None
                    
            else:
                errors.append("Reference generation error")
                return errors, None
        else:
            errors.append("No collection account for this administrator")
            return errors, None
    else:
        errors.append("Please check if you are the vehicle administrator")
        return errors, None
    


def check_jambopay_transaction_status(data):
    ref = None
    errors=[]
    if "ref" in data:
        ref = data["ref"]
    else:
        errors.append("Ref is required")
    status = jambopay_check_wallet_payment_status(ref)
    if status:
        return [], status
    else:
        errors.append("Jambopay error at check trx status")
        return errors, None
    


def jp_authorize_payout(data):
    otp = ""
    ref = ""
    errors =[]
    if not "otp" in data:
        errors.append("OTP is required")
    else:
        otp = data["otp"]

    if not "ref" in data:
        errors.append("Ref is required")
    else:
        ref = data["ref"]
  
    response = jambopay_authorize_wallet_payout(otp,ref)
 
    return [], response
    # if "statusCode" in response:
    #     return response['message'], None
    # else:
        
       
    #     return [], response


def create_transfer_point(data, user):
    errors =[]
    town = None
    transfer_point = None
    title = None
    abbreviation = ""
    is_active=None

    if not "town" in data["transfer_point_details"] or data["transfer_point_details"]["town"]=="":
        errors.append("Town ID is required")
    else:
        town = validate_town(data["transfer_point_details"]["town"])
    
    if not "title" in data["transfer_point_details"] or data["transfer_point_details"]["title"]=="":
        errors.append("Title is required")
    else:
        title = data["transfer_point_details"]["title"]
        if models.TransferPoints.objects.filter(title=title,city=town).exists():
            errors.append(f"Transfer point with name {title} already exists for {town} Town")
    
    if "abbreviation"  in  data["transfer_point_details"] and not     data["transfer_point_details"]["abbreviation"]=="":
        abbreviation=  data["transfer_point_details"]["abbreviation"]

    if "is_active"  in  data["transfer_point_details"] and not     data["transfer_point_details"]["is_active"]=="":
        is_active=  data["transfer_point_details"]["is_active"]

    if len(errors)>0:
        return errors, None
    else:
        try:
            transfer_point = models.TransferPoints.objects.create(city=town,is_active=is_active, abbreviation=abbreviation,owner=user, title=title, entity=user.entity,)
            return [], transfer_point
        except Exception as e:
            errors.append(str(e))
            return errors, None


def update_transfer_point(data, user):
    errors =[]
    town = None
    transfer_point = None
    title = None
    abbreviation = ""

    if not "transfer_point_id" in data["transfer_point_details"] or data["transfer_point_details"]["transfer_point_id"]=="":
        errors.append("Transfer point ID  is required")
        return errors, None
    else:
        transfer_point = transport_validators.validate_transfer_point(data["transfer_point_details"]["transfer_point_id"])

    if  "town" in data["transfer_point_details"] and not data["transfer_point_details"]["town"]=="":
       town = validate_town(data["transfer_point_details"]["town"])
       transfer_point.city = town
       transfer_point.save()
    
        
    if  "title" in data["transfer_point_details"] and not data["transfer_point_details"]["title"]=="":
        transfer_point.title =  data["transfer_point_details"]["title"]
        transfer_point.save()

    if "abbreviation"  in  data["transfer_point_details"] and not     data["transfer_point_details"]["abbreviation"]=="":
        abbreviation=  data["transfer_point_details"]["abbreviation"]
        transfer_point.abbreviation=abbreviation
        transfer_point.save()

    if "is_active"  in  data["transfer_point_details"] and not     data["transfer_point_details"]["is_active"]=="":
        is_active=  data["transfer_point_details"]["is_active"]
        transfer_point.is_active=is_active
        transfer_point.save()
    
    transfer_point.owner= user
    transfer_point.save()

    if len(errors)>0:
        return errors, None
    else:
        return  [], transfer_point
    

def create_transfer(data, user):
    """ Create transfer"""
    errors =[]
    transfer = None
    origin_transfer_point = None
    destination_transfer_point = None
    vehicle = None
    driver = None
    transfer_fare=0.00
    transfer_date = None
    reporting_time = None
    departure_time = None
    official_pick_up_point = None
    town = None



    if  not "town" in data["transfer_details"] or data["transfer_details"]["town"]=="":
        errors.append("Town is required")
    else:
       town = validate_town(data["transfer_details"]["town"])

    if  "origin_transfer_point" in data["transfer_details"] and not data["transfer_details"]["origin_transfer_point"]=="":
       origin_transfer_point = transport_validators.validate_transfer_point(data["transfer_details"]["origin_transfer_point"])

    if  "destination_transfer_point" in data["transfer_details"] and not data["transfer_details"]["destination_transfer_point"]=="":
       destination_transfer_point = transport_validators.validate_transfer_point(data["transfer_details"]["destination_transfer_point"])
    
    if origin_transfer_point == destination_transfer_point or destination_transfer_point==origin_transfer_point:
        errors.append("Origin cannot be same as departure point")
    
    
    if  "driver" in data["transfer_details"] and not data["transfer_details"]["driver"]=="":
       driver = transport_validators.validate_sacco_personnel(data["transfer_details"]["driver"])


    if  "vehicle" in data["transfer_details"] and not data["transfer_details"]["vehicle"]=="":
       vehicle = transport_validators.validate_vehicle(data["transfer_details"]["vehicle"])
    
        
    if  not "transfer_fare" in data["transfer_details"] or data["transfer_details"]["transfer_fare"]=="":
        errors.append("Transfer fare is required")
    else:
        transfer_fare =  data["transfer_details"]["transfer_fare"]

    if not "transfer_date"  in  data["transfer_details"] or   data["transfer_details"]["transfer_date"]=="":
        errors.append("Transfer date is required")
    else:
        transfer_date=  data["transfer_details"]["transfer_date"]
            
    if not "reporting_time"  in  data["transfer_details"] or  data["transfer_details"]["reporting_time"]=="":
        errors.append("Reporting time is required")
    else:
        reporting_time=  data["transfer_details"]["reporting_time"]

    if not "departure_time"  in  data["transfer_details"] or  data["transfer_details"]["departure_time"]=="":
        errors.append("Departure time is required")
    else:
        departure_time=  data["transfer_details"]["departure_time"]

    if "official_pick_up_point"  in  data["transfer_details"] and not     data["transfer_details"]["official_pick_up_point"]=="":
        official_pick_up_point=  data["transfer_details"]["official_pick_up_point"]

    if len(errors)>0:
        return errors, None
    else:
        try:
            transfer = models.Transfers.objects.create(origin_transfer_point=origin_transfer_point,
                                                       town=town,
                                                             destination_transfer_point=destination_transfer_point,
                                                             transfer_fare=transfer_fare,
                                                             transfer_date=transfer_date,
                                                             reporting_time=reporting_time,
                                                             departure_time=departure_time,
                                                             vehicle=vehicle,
                                                             driver=driver,
                                                             owner=user, 
                                                             official_pick_up_point=official_pick_up_point, 
                                                             entity=user.entity,)
            return [], transfer
        except Exception as e:
            errors.append(str(e))
            return errors, None


def update_transfer(data, user):
    errors =[]
    origin_transfer_point = None
    destination_transfer_point = None
    transfer = None
    town=None

    if not "transfer_id" in data["transfer_details"] or data["transfer_details"]["transfer_id"]=="":
        errors.append("Transfer ID  is required")
        return errors, None
    else:
        transfer = transport_validators.validate_transfer(data["transfer_details"]["transfer_id"])

    if  "origin_transfer_point" in data["transfer_details"] and not data["transfer_details"]["origin_transfer_point"]=="":
       origin_transfer_point = transport_validators.validate_transfer_point(data["transfer_details"]["origin_transfer_point"])
       transfer.origin_transfer_point = origin_transfer_point
       transfer.save()
    if  "town" in data["transfer_details"] and not data["transfer_details"]["town"]=="":
       town = validate_town(data["transfer_details"]["town"])
       transfer.town = town
       transfer.save()

    if  "destination_transfer_point" in data["transfer_details"] and not data["transfer_details"]["destination_transfer_point"]=="":
       destination_transfer_point = transport_validators.validate_transfer_point(data["transfer_details"]["destination_transfer_point"])
       transfer.destination_transfer_point = destination_transfer_point
       transfer.save()

    if  "vehicle" in data["transfer_details"] and not data["transfer_details"]["vehicle"]=="":
       vehicle = transport_validators.validate_vehicle(data["transfer_details"]["vehicle"])
       transfer.vehicle = vehicle
       transfer.save()

    if  "driver" in data["transfer_details"] and not data["transfer_details"]["driver"]=="":
       driver = transport_validators.validate_sacco_personnel(data["transfer_details"]["driver"])
       transfer.driver = driver
       transfer.save()
    
        
    if  "transfer_fare" in data["transfer_details"] and not data["transfer_details"]["transfer_fare"]=="":
        transfer.transfer_fare =  data["transfer_details"]["transfer_fare"]
        transfer.save()


    if "transfer_date"  in  data["transfer_details"] and not     data["transfer_details"]["transfer_date"]=="":
        transfer_date=  data["transfer_details"]["transfer_date"]
        transfer.transfer_date=transfer_date
        transfer.save()


    if "reporting_time"  in  data["transfer_details"] and not     data["transfer_details"]["reporting_time"]=="":
        reporting_time=  data["transfer_details"]["reporting_time"]
        transfer.reporting_time=reporting_time
        transfer.save()


    if "reporting_time"  in  data["transfer_details"] and not     data["transfer_details"]["reporting_time"]=="":
        reporting_time=  data["transfer_details"]["reporting_time"]
        transfer.reporting_time=reporting_time
        transfer.save()


    if "official_pick_up_point"  in  data["transfer_details"] and not     data["transfer_details"]["official_pick_up_point"]=="":
        official_pick_up_point=  data["transfer_details"]["official_pick_up_point"]
        transfer.official_pick_up_point=official_pick_up_point
        transfer.save()
    

    if len(errors)>0:
        return errors, None
    else:
        return  [], transfer
    

def create_journey(data, user):
    """ Create transfer"""
    errors =[]
    driver = None
    journey_fare = 0.00
    departure_date = None
    vehicle = None
    driver = None
    drivers_arr=[]
    conductor = None
    conductors_arr= []
    conductors = []
    reporting_time = None
    departure_time = None
    expected_arrival_date =None
    expected_arrival_time=None
    official_pick_up_point = None
    origin_town = None
    destination_town=None



    if  "origin_town" in data["journey_details"] and not data["journey_details"]["origin_town"]=="":
       origin_town = validate_town(data["journey_details"]["origin_town"])

    if  "destination_town" in data["journey_details"] and not data["journey_details"]["destination_town"]=="":
       destination_town = validate_town(data["journey_details"]["destination_town"])

    if  "drivers" in data["journey_details"] and not data["journey_details"]["drivers"]==[]:
        drivers = validate_town(data["journey_details"]["drivers"])

        if len(drivers)>0:
            for driver_id in drivers:
                driver = transport_validators.validate_sacco_personnel(driver_id)
                drivers_arr.append(driver)

    if  "conductors" in data["journey_details"] and not data["journey_details"]["conductors"]==[]:
        conductors = validate_town(data["journey_details"]["conductors"])

        if len(conductors)>0:
            for conductor_id in conductors:
                conductor = transport_validators.validate_sacco_personnel(conductor_id)
                conductors_arr.append(conductor)
    
        
    if  not "journey_fare" in data["journey_details"] and not data["journey_details"]["journey_fare"]=="":
        errors.append("Journey fare is required")
    else:
        journey_fare =  data["journey_details"]["journey_fare"]

    if  not "departure_date" in data["journey_details"] or  data["journey_details"]["departure_date"]=="":
        errors.append("Departure date is required")
    else:
        departure_date =  data["journey_details"]["departure_date"]


    if  not "reporting_time" in data["journey_details"] or  data["journey_details"]["reporting_time"]=="":
        errors.append("Reporting time is required")
    else:
        reporting_time =  data["journey_details"]["reporting_time"]

    if  not "departure_time" in data["journey_details"] or  data["journey_details"]["departure_time"]=="":
        errors.append("Departure time is required")
    else:
        departure_time =  data["journey_details"]["departure_time"]


    if  "expected_arrival_date" in data["journey_details"] and not data["journey_details"]["expected_arrival_date"]=="":
        expected_arrival_date =  data["journey_details"]["expected_arrival_date"]
        
    if  "expected_arrival_time" in data["journey_details"] and not data["journey_details"]["expected_arrival_time"]=="":
        expected_arrival_time =  data["journey_details"]["expected_arrival_time"]

    if  "official_pick_up_point" in data["journey_details"] and not data["journey_details"]["official_pick_up_point"]=="":
        official_pick_up_point =  data["journey_details"]["official_pick_up_point"]

    if  not "vehicle" in data["journey_details"] or data["journey_details"]["vehicle"]=="":
       errors.append("Please assign vehicle to journey")
    else:
       vehicle = validate_vehicle(data["journey_details"]["vehicle"])


    if len(errors)>0:
        return errors, None
    else:
        try:
            journey = models.Journies.objects.create(origin_town=origin_town,
                                                             destination_town=destination_town,
                                                             journey_fare=journey_fare,
                                                             departure_date=departure_date,
                                                             reporting_time=reporting_time,
                                                             departure_time=departure_time,
                                                             expected_arrival_date=expected_arrival_date,
                                                             expected_arrival_time=expected_arrival_time,
                                                             vehicle=vehicle,
                                                             owner=user, 
                                                             official_pick_up_point=official_pick_up_point, 
            
           
                                                                                                                entity=user.entity,)
            if len(drivers_arr) > 0:
                for d in drivers_arr:
                    journey.drivers.add(d)

            if len(conductors_arr) > 0:
                for c in conductors_arr:
                    journey.conductors.add(c)
            return [], journey
        except Exception as e:
            errors.append(str(e))
            return errors, None


def update_journey(data, user):
    errors =[]
    origin_town = None
    destination_town = None
    transfer = None

    if not "journey_id" in data["journey_details"] or data["journey_details"]["journey_id"]=="":
        errors.append("Transfer ID  is required")
        return errors, None
    else:
        transfer = transport_validators.validate_journey(data["journey_details"]["journey_id"])

    if  "origin_town" in data["journey_details"] and not data["journey_details"]["origin_town"]=="":
       origin_town = validate_town(data["journey_details"]["origin_town"])
       transfer.origin_town = origin_town
       transfer.save()

    if  "destination_town" in data["journey_details"] and not data["journey_details"]["destination_town"]=="":
       destination_town = validate_town(data["journey_details"]["destination_town"])
       transfer.destination_town = destination_town
       transfer.save()

    if  "vehicle" in data["journey_details"] and not data["journey_details"]["vehicle"]=="":
       vehicle = transport_validators.validate_vehicle(data["journey_details"]["vehicle"])
       transfer.vehicle = vehicle
       transfer.save()

    if  "driver" in data["journey_details"] and not data["journey_details"]["driver"]=="":
       driver = transport_validators.validate_sacco_personnel(data["journey_details"]["driver"])
       transfer.driver = driver
       transfer.save()
    
        
    if  "journey_fare" in data["journey_details"] and not data["journey_details"]["journey_fare"]=="":
        transfer.journey_fare =  data["journey_details"]["journey_fare"]
        transfer.save()


    if "departure_date"  in  data["journey_details"] and not     data["journey_details"]["departure_date"]=="":
        departure_date=  data["journey_details"]["departure_date"]
        transfer.departure_date=departure_date
        transfer.save()


    if "reporting_time"  in  data["journey_details"] and not     data["journey_details"]["reporting_time"]=="":
        reporting_time=  data["journey_details"]["reporting_time"]
        transfer.reporting_time=reporting_time
        transfer.save()


    if "reporting_time"  in  data["journey_details"] and not     data["journey_details"]["reporting_time"]=="":
        reporting_time=  data["journey_details"]["reporting_time"]
        transfer.reporting_time=reporting_time
        transfer.save()


    if "official_pick_up_point"  in  data["journey_details"] and not     data["journey_details"]["official_pick_up_point"]=="":
        official_pick_up_point=  data["journey_details"]["official_pick_up_point"]
        transfer.official_pick_up_point=official_pick_up_point
        transfer.save()

    if "is_active"  in  data["journey_details"] and not     data["journey_details"]["is_active"]=="":
        is_active=  data["journey_details"]["is_active"]
        transfer.is_active=is_active
        transfer.save()
    

    if len(errors)>0:
        return errors, None
    else:
        return  [], transfer


