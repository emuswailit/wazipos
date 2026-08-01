
from turtle import title
from core.date_utils import get_today_date
from transport.models import Trip, Vehicles,Destinations
from django.contrib.auth import get_user_model
from payments.models import PaymentMethods, UserAccounts
from transport.transport_utils import create_batched_tickets
from transport.models import Tickets
from core.date_utils import get_formatted_from_date, get_formatted_to_date
from core.phone_number_utils import get_telco_by_phone_number
from django.db.models import Q
from transport.models import SaccoPersonnel, TicketPaymentSettlement,TicketPayment, SaccoPersonnelAccount, SaccoSubscriptionPayment
from intergrations.jambopay.jambopay_get_profile_accounts import get_jambopay_main_profile
from intergrations.jambopay.jambopay_wallet import get_user_jambopay_wallet_by_phone,get_wallet_balance,check_wallet_pin, set_wallet_pin, payout_from_wallet_to_airtel,jambopay_authorize_wallet_payout,validate_wallet_pin,payout_from_wallet_to_mpesa,payout_from_wallet_to_till,payout_from_wallet_to_paybill,payout_from_wallet_to_bank
from transport.utils.sacco_personnel_utils import create_sacco_subscription_payment
from intergrations.jambopay import jambopay_wallet
from authentication.utils.utils import generate_reference_number
from intergrations.jambopay.jambopay_create_user_profile import create_jambopay_profile
from authentication.models import Entities
import datetime
import json
User = get_user_model()
from decouple import config
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms
from payments.models import PaymentServicesProvider





def get_sacco_personnel_by_phone(msisdn):
    """Utility: Get sacco personnel by phone"""
    if User.objects.filter(phone=msisdn).exists():
        user = User.objects.filter(phone=msisdn).first()

        if SaccoPersonnel.objects.filter(user= user,is_active="true").exists():
            sacco_personnel = SaccoPersonnel.objects.filter(user= user,is_active="true").first()
            return sacco_personnel
        else:
            return None
    else:
        return None

def handle_pay_fare(splitted):
    response = "CON Enter vehicle registration number"

    return response

def get_tickets_by_phone_number(phone_number):
    tickets = None
    if Tickets.objects.filter(passenger_phone=phone_number, is_paid="true").exists():
        tickets = Tickets.objects.filter(passenger_phone=phone_number, is_paid="true").all().order_by('-created')[:5] 
        return tickets
    return None
def handle_my_tickets(splitted,phone_number):
    tickets = get_tickets_by_phone_number(phone_number)
    if tickets:
        response = f"CON Your last 5 tickets \n"
        for index, val in enumerate(tickets): 
            date = val.created.strftime("%H:%M, %b %d, %Y")     
            response +=f"{str(index+1)}.{val.document_number} - {date} - {val.payment_method.title}  \n"
    else:
        response = "CON No tickets retrieved"
    return response

def handle_ticket_details(splitted,phone_number):
    selected_ticket_index= None
    tickets = get_tickets_by_phone_number(phone_number)
    input_index = int(splitted[1])
    selected_ticket_index = input_index-1

    if tickets:
        if selected_ticket_index>=0 and selected_ticket_index < len(tickets):
            ticket = tickets[selected_ticket_index]
            date = ticket.created.strftime("%H:%M, %b %d, %Y")   
            response = f"CON {ticket.document_number} \n {ticket.destination} \n {date} \n {ticket.payment_method.title} \n PAID: {ticket.is_paid.upper()}"
            return response

        else:  
            response = f"CON Invalid input \n"
            response += f"Select ticket \n"
            for index, val in enumerate(tickets): 
                date = val.created.strftime("%H:%M, %b %d, %Y")     
                response +=f"{str(index+1)}.{val.document_number} - {date} - {val.payment_method.title}  \n"
            return response
            
        
    else:   
        response =  "CON No ticket details retrieved"
    return response



def get_trip_details_for_vehicle(registration):
    errors =[]
    vehicle = None
    destinations = None
    formatted_registration = registration.replace(" ","").strip().upper()
    trip =None
    if Vehicles.objects.filter(registration=formatted_registration).exists():
        vehicle=Vehicles.objects.filter(registration=formatted_registration).first()
        if Trip.objects.filter(vehicle=vehicle, departure_date__gte=get_today_date(),is_active="true").exists():
            trip = Trip.objects.filter(vehicle=vehicle, departure_date__gte=get_today_date(),is_active="true").first()
        
            if Destinations.objects.filter(route = trip.route).exists():
                destinations = Destinations.objects.filter(route = trip.route).all()
                return [],vehicle, trip, destinations
         
            else:
                errors.append("Trip route has no destinations")
                return errors, None, None, None
        else:
            errors.append("Trip does not exist")
            return errors, None, None, None
    else:
        errors.append("Vehicle does not exist")
        return errors, None, None, None

def handle_vehicle_registration_input(input):
    response = ""
    print("Inputtt", input)
    vehicle = None
    errors, vehicle, trip, destinations =get_trip_details_for_vehicle(input)
    if errors:
        response = "END "
        for index, val in enumerate(errors):             
            response +=f"{str(index+1)}. {val}\n"
        return response
    elif vehicle and trip and destinations:
        print("DESTS",destinations)
        response = f"CON Select destination {vehicle}\n"
        for index, val in enumerate(destinations):
                        
            response +=f"{str(index+1)}. {val.destination_from}-{val.destination_to} ({val.fare_peak})\n"
        return response
    else:
        response = f"END An error occurred \n"
        # response += "0. Back \n"
        return response

    
def handle_number_of_tickets(splitted):
    vehicle = splitted[1]
    selected_destination_index = int(splitted[-1])-1
    errors, vehicle, trip, destinations =get_trip_details_for_vehicle(vehicle)
    if selected_destination_index>=0 and selected_destination_index <=len(destinations):

        selected_destination_title= destinations[selected_destination_index].title
        selected_destination_fare= destinations[selected_destination_index].fare_peak
        response = f"CON {selected_destination_title } at KES {selected_destination_fare} \n"
        response += "Select number of seats to pay for \n"
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"

    return response

def handle_select_payment_method(splitted,phone_number):
    payment_methods=[]
    response = "CON Select payment method \n"
    payment_methods = PaymentMethods.objects.all().exclude(title="CASH")
    jambopay_wallet_balance =""
    # jambopay_wallet = get_user_jambopay_wallet_by_phone(phone_number)
    if not UserAccounts.objects.filter(account_phone=phone_number).exists():
        payment_methods = PaymentMethods.objects.all().exclude(title="CASH").exclude(title="JAMBOPAY WALLET")
    
    pm_string=""
    for index, val in enumerate(payment_methods):

            
        pm_string = f"{str(index+1)}. {val.title}\n"
        
        response += pm_string

    return response


def handle_optional_amount(splitted, phone_number):
    response = ""
    vehicle = splitted[1]
    number_of_tickets = int(splitted[3])
    selected_destination_index = int(splitted[2])-1
    errors, vehicle, trip, destinations =get_trip_details_for_vehicle(vehicle)
    if selected_destination_index>=0 and selected_destination_index <=len(destinations):
        selected_destination_title= destinations[selected_destination_index].title
        selected_destination_fare= destinations[selected_destination_index].fare_peak
        total_to_pay = number_of_tickets * float(selected_destination_fare)
        response = f"CON Enter 1 to pay KES {'{:.2f}'.format(total_to_pay)} for {number_of_tickets} x {selected_destination_title} or enter other amount"
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"

    return response

def handle_finalize_ticket(splitted,phone_number):
    selected_payment_method_index = None
    response = ""
    vehicle = splitted[1]
    number_of_tickets = int(splitted[3])
    selected_destination_index = int(splitted[2])-1
    errors, vehicle, trip, destinations =get_trip_details_for_vehicle(vehicle)

    selected_destination_fare= destinations[selected_destination_index].fare_peak
    total_to_pay = number_of_tickets * float(selected_destination_fare)
    selected_payment_method_index = int(splitted[4]) - 1
    payment_methods = PaymentMethods.objects.all().exclude(title="CASH")
    if not UserAccounts.objects.filter(account_phone=phone_number).exists():
        payment_methods = PaymentMethods.objects.all().exclude(title="CASH").exclude(title="JAMBOPAY WALLET")

    selected_payment_method_id = payment_methods[selected_payment_method_index].id

    if not splitted[5]=="1" and int(splitted[5])>1:
        
        total_to_pay = float(splitted[5])
        fare_per_ticket= total_to_pay/number_of_tickets
        print("Fare per ticket", fare_per_ticket)
        create_tickets(total_to_pay,fare_per_ticket, number_of_tickets,trip,selected_destination_index,destinations, splitted[5],phone_number, selected_payment_method_id)
        response = "END thank you for using Jambopay \n"
    else:
        
        fare_per_ticket = selected_destination_fare
        total_to_pay = number_of_tickets * float(selected_destination_fare)
        create_tickets(total_to_pay,fare_per_ticket, number_of_tickets,trip,selected_destination_index,destinations, splitted[4],phone_number,selected_payment_method_id)
            
        response = "END thank you for using Jambopay \n"

    return response


def retrieve_user_vehicles_by_phone(phone_number):
    user = None
    telco, phone_number = get_telco_by_phone_number(phone_number)
    if User.objects.filter(phone=phone_number).exists():
        user = User.objects.filter(phone=phone_number).first()

        if SaccoPersonnel.objects.filter(user= user).exists():
            sacco_personnel = SaccoPersonnel.objects.filter(user= user).first()
            

            if Vehicles.objects.filter(administrator = sacco_personnel, entity=sacco_personnel.entity).exists():
                user_vehicles = Vehicles.objects.filter(administrator=sacco_personnel,entity=sacco_personnel.entity).all().order_by('created')
                return user_vehicles
            elif Vehicles.objects.filter(conductor = sacco_personnel,entity=sacco_personnel.entity).exists():
                conducted_vehicles=Vehicles.objects.filter(conductor = sacco_personnel,entity=sacco_personnel.entity).all()
                return conducted_vehicles
        else:
            return None
    else:
        return None
    



def retrieve_current_trip_for_vehicle(vehicle):
    if Trip.objects.filter(vehicle=vehicle,is_active="true").exists():
        return Trip.objects.filter(vehicle=vehicle,is_active="true").first()
    else:
        return None
    

def retrieve_user_conducted_vehicles_by_phone(phone_number):
    """Vehicles where user is conductor"""
    user = None
    # telco, phone_number = get_telco_by_phone_number(phone_number)

    if User.objects.filter(phone=phone_number).exists():
        user = User.objects.filter(phone=phone_number).first()

        if SaccoPersonnel.objects.filter(user= user).exists():
            sacco_personnel = SaccoPersonnel.objects.filter(user= user).first()
            print("Conductor profile found")
            

            if Vehicles.objects.filter(conductor = sacco_personnel).exists():
                user_vehicle = Vehicles.objects.filter(conductor=sacco_personnel).first()
                return user_vehicle
            
        else:
            return None
    else:
        return None

def retrieve_user_vehicles_list(phone_number):
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    if vehicles and len(vehicles)>0:
        response = f"CON Select your vehicle \n"
        for index, val in enumerate(vehicles):
            response +=f"{str(index+1)}. {val.registration}\n"
        return response
    else:
        response = f"END No administered vehicles \n" 
        return response
    

def get_vehicle_by_registration_number(registration):
    if Vehicles.objects.filter(registration=registration.upper()).exists():
        vehicle = Vehicles.objects.filter(registration=registration.upper()).first()
        return vehicle
    else:
        return None
    
def handle_vehicle_options(splitted, phone_number):
    response = None
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    selected_vehicle_index = int(splitted[1])-1
    reg =vehicles[selected_vehicle_index].registration
    
    vehicle = Vehicles.objects.filter(registration =reg).first()
    sacco_personnel = get_sacco_personnel_by_phone(phone_number)
    if vehicle: 
        response = f"CON {reg} \n"
        response += "1. Today Collection \n"
        response += "2. Wallet Balance \n"
        response += "3. Trips \n"
        if vehicle.administrator ==sacco_personnel or vehicle.conductor==sacco_personnel:
            response += "4. Subscriptions \n"
            response += "5. Crew \n"
            response += "6. Payouts \n"
            response += "7. Manage Password \n"
        return response
    else:
        response= "END Not authorized"
        return response


def get_today_ticket_payment_settlements(user, vehicle):
    qs = TicketPaymentSettlement.objects.filter(
            entity=user.entity, 
            vehicle=vehicle
        ).filter(Q(created__gte=get_formatted_from_date(data=None), created__lte=get_formatted_to_date(data=None))).all().order_by("-created")
    
    return qs

def get_today_ticket_payments(user, vehicle):
    qs = TicketPayment.objects.filter(
            entity=user.entity, 
            vehicle=vehicle,
            status="SETTLED"
        ).filter(Q(created__gte=get_formatted_from_date(data=None), created__lte=get_formatted_to_date(data=None))).all().order_by("-created")
    
    return qs

def handle_get_today_collection(splitted, phone_number):
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    reg =vehicles[selected_vehicle_index].registration
                       
    vehicle = Vehicles.objects.filter(registration =reg).first()

    if vehicle:
        balance = 0.0000
    
        today_payments = get_today_ticket_payments(vehicle.administrator.user, vehicle)
        if len(today_payments)>0:
            for stl in today_payments:
                balance += float(stl.amount)
            response = f"END Today collection: KES {round(balance, 2)} \n"
            return response
        else:          
            response = f"END No collection today\n"
            response += "0. Back \n"
            return response

    else:
        response = f"CON  {reg} not found\n"
        return response


def get_vehicle_administrator_account_and_balance (vehicle):
    """Retrieve vehicle administrator account and balance"""
    if SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).exists():
        wallet = SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).first()
        payload = {
            "account_number": wallet.account_number
        }
        errors, balance_json = get_wallet_balance(payload)
        if balance_json:
            balance = balance_json["balance"]
            # response = f"CON {reg} : Attached wallet is  {wallet.account_number} {wallet.account_name}, balance is KES {balance} \n"

            return wallet.account_number, balance
        else:
           return None, None
        
def handle_get_collector_wallet_balance(splitted, phone_number):
    response = "Get administrator wallet balance"
    user_account= None
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    reg =vehicles[selected_vehicle_index].registration
                       
    vehicle = Vehicles.objects.filter(registration =reg).first()
    if vehicle.collector:
        if UserAccounts.objects.filter(owner=vehicle.collector).exists():
            user_account =  UserAccounts.objects.filter(owner=vehicle.collector).first()
            payload = {
                    "account_number": user_account.account_number
                 }
            errors, balance_json = get_wallet_balance(payload)
            if balance_json:
                balance = balance_json["balance"]
                response = f"END {user_account.account_number} {user_account.account_name}, balance is KES {balance} \n"
                return response
            else:
                response = f"END Balance could not be retrieved"
        else:
            response = f"END Person set to collect fare has no wallet"
    else:
         response = f"END Vehicle has no person set to collect fare"

    return response


    # sacco_personnel = get_sacco_personnel_by_phone(phone_number)

    # if vehicle.administrator == sacco_personnel:
    #     wallet = SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).first()
        # payload = {
        #     "account_number": wallet.account_number
        # }
        # errors, balance_json = get_wallet_balance(payload)
        # if balance_json:
        #     balance = balance_json["balance"]
        #     response = f"END {wallet.account_number} {wallet.account_name}, balance is KES {balance} \n"
        #     return response
        # else:
        #     response = f"END Balance could not be retrieved"
    # else:
    #     response = "END Not authorized"
    #     return response

# def handle_get_administrator_wallet_balance(splitted, phone_number):
#     response = "Get administrator wallet balance"
#     selected_vehicle_index = int(splitted[1])-1
#     vehicles = retrieve_user_vehicles_by_phone(phone_number)
#     reg =vehicles[selected_vehicle_index].registration
                       
#     vehicle = Vehicles.objects.filter(registration =reg).first()
#     sacco_personnel = get_sacco_personnel_by_phone(phone_number)

#     if vehicle.administrator == sacco_personnel:
#         wallet = SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).first()
#         payload = {
#             "account_number": wallet.account_number
#         }
#         errors, balance_json = get_wallet_balance(payload)
#         if balance_json:
#             balance = balance_json["balance"]
#             response = f"END {wallet.account_number} {wallet.account_name}, balance is KES {balance} \n"
#             return response
#         else:
#             response = f"END Balance could not be retrieved"
#     else:
#         response = "END Not authorized"
#         return response



    # Trips handlers
def handle_vehicle_trips(splitted, phone_number):
    response = "Vehicle trips"
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    reg =vehicles[selected_vehicle_index].registration                
    vehicle = Vehicles.objects.filter(registration =reg).first()
    if vehicle: 
        response = f"CON {reg} \n"
        response += "1. Start Trip \n"
        response += "2. End Current Trip \n"
        response += "3. Trips \n"
        return response
    else:
        response = f"CON {reg} not found\n"
        return response 

def handle_select_trip_route(splitted, phone_number):
   
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    if vehicles:
        reg =vehicles[selected_vehicle_index].registration                
        vehicle = Vehicles.objects.filter(registration =reg).first()
    
        if len(vehicle.routes.all())>0:
            response = f"CON Select route \n"
            for index, val in enumerate(vehicle.routes.all()):
                response +=f"{str(index+1)}. {val.title}\n"
            return response
        else:
            response = f"END vehicle has no routes \n" 
            
            return response
    else:
        response = f"END No vehicles for this user \n" 
        return response
   
def handle_start_trip(splitted, phone_number):
    """ Start vehicle new trip """
    selected_route_index = int(splitted[-1])-1
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    reg =vehicles[selected_vehicle_index].registration                
    vehicle = Vehicles.objects.filter(registration =reg).first()
    routes = vehicle.routes.all() 
    selected_route = routes[selected_route_index]
    thirty_minutes_ago = datetime.datetime.now() - datetime.timedelta(minutes=30)
    sacco_personnel = get_sacco_personnel_by_phone(phone_number)
    if vehicle.conductor and vehicle.conductor ==sacco_personnel:
        if Trip.objects.filter(vehicle=vehicle, route=selected_route, created__gte=thirty_minutes_ago).exists():
            response = f"END {vehicle} has an active trip created thirty minutes ago"
            return response
        else:
            trip = Trip.objects.create(entity=vehicle.entity, vehicle=vehicle,route=selected_route, departure_date =datetime.datetime.now().date(), departure_time = datetime.datetime.now().time() )
            if trip:
                response = f"END Trip for {vehicle} - {selected_route.title} created"
                return response
    else:
        response = "END Only conductor can start trip"
        return response

def handle_end_current_trip(splitted, phone_number):
    """ End most recent active trip """
    selected_route_index = int(splitted[-1])-1
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    reg =vehicles[selected_vehicle_index].registration                
    vehicle = Vehicles.objects.filter(registration =reg).first()
    sacco_personnel = get_sacco_personnel_by_phone(phone_number)
    print("Vehicle at end", vehicle)
    if vehicle.conductor and vehicle.conductor == sacco_personnel:
        if Trip.objects.filter(vehicle=vehicle, is_active="true").order_by('-created').exists():
            trip = Trip.objects.filter(vehicle=vehicle, is_active="true").order_by('-created').first()
            if trip.is_active=="true":
                trip.is_active="false"
                trip.save()
                departure_date = trip.departure_date.strftime("%b %d, %Y")  
                departure_time = trip.departure_time.strftime("%H:%M") 
                response = f"END {trip} on {departure_date} at {departure_time} for {vehicle} closed"
                return response
            else:
                response = "END Trip is already closed \n"
            return response
        else:
            response = "END No open trip to end \n"
            return response
    else:
        response = "END Only conductor can end trip"
        return response
        
def retrieve_trips_for_vehicle(vehicle):
    if Trip.objects.filter(vehicle=vehicle).exists():
        trips = Trip.objects.filter(vehicle=vehicle).all().order_by('-created')[:10]
        return trips
    else:
        return None

def handle_list_trips(splitted, phone_number):
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    reg =vehicles[selected_vehicle_index].registration                
    vehicle = Vehicles.objects.filter(registration =reg).first()
    trips = retrieve_trips_for_vehicle(vehicle)

    if trips:
        response = f"CON Select trip \n"
        for index, val in enumerate(trips):
            active = "CLOSED"
            if val.is_active=="true":
                active = "ACTIVE"
            
            departure_date = val.departure_date.strftime("%b %d, %Y")  
            departure_time = val.departure_time.strftime("%H:%M")  
            response +=f"{str(index+1)}. {val.route.title} on {departure_date} at {departure_time} - {active}\n"
        return response
    else:
        response = f"No trips to list for {vehicle}"
        return response

def display_trip_options(splitted, phone_number):
    selected_trip_index = int(splitted[-1])-1
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    reg =vehicles[selected_vehicle_index].registration                
    vehicle = Vehicles.objects.filter(registration =reg).first()
    trips = retrieve_trips_for_vehicle(vehicle)
    trip = trips[selected_trip_index]
    departure_date = trip.departure_date.strftime("%b %d, %Y")  
    departure_time = trip.departure_time.strftime("%H:%M") 
    print("trips", trips)
    response = f"CON {trip.route.title} on {departure_date} at {departure_time}  \n"
    response += "1. Trip Collection\n"
    response += "2. Close Trip \n"
    response += "0. Back \n"
    return response

def get_trip_collection(splitted, phone_number):
    selected_trip_index = int(splitted[4])-1
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    reg =vehicles[selected_vehicle_index].registration                
    vehicle = Vehicles.objects.filter(registration =reg).first()
    trips = retrieve_trips_for_vehicle(vehicle)
    trip = trips[selected_trip_index]
    print("Trip here", trip)

    if TicketPaymentSettlement.objects.filter(trip=trip).exists():
        trip_settlements = TicketPaymentSettlement.objects.filter(trip=trip).all()

        balance = 0.00
        for ts in trip_settlements:
            balance+=float(ts.amount)
        departure_date = trip.departure_date.strftime("%b %d, %Y")  
        departure_time = trip.departure_time.strftime("%H:%M")
        response = f"CON {trip.route.title} on {departure_date} at {departure_time}  \n"
        response += f"Collected: KES {balance}\n"
        response += "0. Back \n"
        return response
    else:
        response = f"No collection from this trip \n"
        response += "0. Back \n"
        return response

def handle_close_trip_from_trip_list(splitted, phone_number):
    selected_trip_index = int(splitted[4])-1
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    reg =vehicles[selected_vehicle_index].registration                
    vehicle = Vehicles.objects.filter(registration =reg).first()
    trips = retrieve_trips_for_vehicle(vehicle)
    trip = trips[selected_trip_index]
    if trip.is_active=="true":
        trip.is_active="false"
        trip.save()
        departure_date = trip.departure_date.strftime("%b %d, %Y")  
        departure_time = trip.departure_time.strftime("%H:%M") 
        response = f"{trip} on {departure_date} at {departure_time} for {vehicle} closed"
        return response
    else:
        response = "CON Trip is already closed \n"
        response += "0. Back \n"

        return response


# Subscriptions handlers
def handle_list_vehicle_subscriptions(splitted, phone_number):
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    vehicle_subscriptions = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle_subscriptions = vehicle.sacco_subscriptions.all().order_by('-created')
        print("vehicle_subscriptions",vehicle_subscriptions)
        response = f"CON Select sacco subscription \n"
        if len(vehicle_subscriptions)>0:
            for index, val in enumerate(vehicle_subscriptions):    
                response +=f"{str(index+1)}.{val.title}\n"
            return response
        else:
            response = f"CON {vehicle} has no subscriptions \n"
            response += "0. Back \n"
            return response
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
    
def handle_list_subscription_options(splitted, phone_number):
    selected_vehicle_index = int(splitted[1])-1
    vehicle_subscriptions = []
    selected_subscription_index = int(splitted[3])-1
    print("sspo", selected_subscription_index)
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle_subscriptions = vehicle.sacco_subscriptions.all().order_by('-created')
        print("vehicle_subscriptions",vehicle_subscriptions)
        response = f"CON Select sacco subscription \n"
        if len(vehicle_subscriptions)>0:
            selected_subscription = vehicle_subscriptions[selected_subscription_index]
            response = f"CON Select {selected_subscription.title.lower()} option:\n"
            response += "1. Subscription status\n"
            response += "2. Pay now \n"
            response += "0. Back \n"
            return response
        else:
            response = f"CON {vehicle} has no subscriptions \n"
            response += "0. Back \n"
            return response
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
def check_subscription_status(splitted, phone_number):
    selected_vehicle_index = int(splitted[1])-1
    selected_subscription_index = int(splitted[3])-1
    vehicle_subscriptions = []
    print("Selected subsc",splitted[3])
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
   
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle_subscriptions = vehicle.sacco_subscriptions.all().order_by('-created')
        if len(vehicle_subscriptions)>0:
            selected_subscription = vehicle_subscriptions[selected_subscription_index]
            print("Sel sub", selected_subscription)
            date_now = datetime.datetime.now().date()
            if SaccoSubscriptionPayment.objects.filter(sacco_subscription=selected_subscription, valid_to__gte=date_now, status="SETTLED").exists():
                valid_subscriptions = SaccoSubscriptionPayment.objects.filter(sacco_subscription=selected_subscription, valid_to__gte=date_now, status="SETTLED").all()
                print("se Sub at stat", selected_subscription)
                response = f"CON Valid subscriptions: {len(valid_subscriptions)}\n"         
                for index, val in enumerate(valid_subscriptions):   
                    valid_to_date = val.valid_to.strftime("%b %d, %Y")   
                    response +=f"{str(index+1)}.{val.reference_number} - EXP: {valid_to_date}\n"
                return response
           
            else:
                print("No payments bus")
                response = f"CON No valid subscriptions \n"
                response += "0. Back \n"
                return response
        else:
            response = f"CON {vehicle} has no subscriptions \n"
            response += "0. Back \n"
            return response
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
def pay_sacco_subscription(splitted, phone_number):
    selected_vehicle_index = int(splitted[1])-1
    selected_subscription_index = int(splitted[3])-1
    vehicle_subscriptions = []
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle_subscriptions = vehicle.sacco_subscriptions.all().order_by('-created')
        if len(vehicle_subscriptions)>0:
            selected_subscription = vehicle_subscriptions[selected_subscription_index]
            payment_methods = PaymentMethods.objects.all().exclude(title="CASH")
            response = f"CON PAY {selected_subscription.title}:\n"
            response += "Select payment method \n"
            for index, val in enumerate(payment_methods):      
                response +=f"{str(index+1)}.{val.title}\n"
            return response
        else:
            response = f"CON {vehicle} has no subscriptions \n"
            response += "0. Back \n"
            return response
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
def finalize_subscription_payment(splitted, phone_number):
    selected_payment_method_index = int(splitted[-1])-1
    selected_vehicle_index = int(splitted[1])-1
    selected_subscription_index = int(splitted[3])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    vehicle_subscriptions = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle_subscriptions = vehicle.sacco_subscriptions.all().order_by('-created')
        if len(vehicle_subscriptions)>0:
            selected_subscription = vehicle_subscriptions[selected_subscription_index]
            payment_methods = PaymentMethods.objects.all().exclude(title="CASH")
            selected_payment_method = payment_methods[selected_payment_method_index]
            print("selected_payment_method",selected_payment_method)

            data = {
                    "action":"CreateSaccoSubscriptionPayment",
                    "sacco_subscription_payment_details":{
                        "vehicle":vehicle.id,
                        "sacco_subscription":selected_subscription.id,
                        "payment_method":selected_payment_method.id,
                        "mobile_money_phone_number": "254722217348"
                    }
                }
            errors, subscription_payment = create_sacco_subscription_payment(data, vehicle.administrator.user)
            if subscription_payment:
                response = f"CON Enter pin to complete transaction\n"
                return response
            else:
                response = f"Subscription payment not created \n"
                for index, val in enumerate(errors):      
                    response +=f"{str(index+1)}.{val}\n"
                return response
        else:
            response = f"CON {vehicle} has no subscriptions \n"
            response += "0. Back \n"
            return response
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
    
# Crew handlers
def handle_show_vehicle_crew_options(splitted, phone_number):
    response = f"CON Select crew option"
    response += "1. View crew\n"
    response += "2. Add Crew Trip \n"
    response += "0. Back \n"
    return response


def handle_show_vehicle_crew_options(splitted, phone_number):
    """List all vehicle crew"""
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle_crew = vehicle.crew_members.all().order_by('-created')
        response = f"CON {vehicle} crew members \n"
        response += "1. View crew members\n"
        response += "2. Add crew member \n"
        response += "0. Back \n"
        return response
    
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
    
def handle_list_vehicle_crew(splitted, phone_number):
    """List all vehicle crew"""
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle_crew = vehicle.crew_members.all().order_by('-created')
        print("vehicle_crew",vehicle_crew)
        response = f"CON Select crew member \n"
        if len(vehicle_crew)>0:
            for index, val in enumerate(vehicle_crew):    
                response +=f"{str(index+1)}.{val.user.first_name} {val.user.last_name} - {val.personnel_type}\n"
            return response
        else:
            response = f"CON {vehicle} has no crew \n"
            response += "0. Back \n"
            return response
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
    
def show_selected_crew_member_details(splitted, phone_number):
    """Diplay crew member details"""
    selected_vehicle_index = int(splitted[1])-1
    selected_crew_member_index = int(splitted[-1])-1
    print("selected_crew_member_index",selected_crew_member_index)
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle_crew = vehicle.crew_members.all().order_by('-created')
        selected_crew = vehicle_crew[selected_crew_member_index]
        print("vehicle_crew",vehicle_crew)
        response = f"CON Crew member details \n"
        response += f"{selected_crew.user.first_name} {selected_crew.user.last_name} \n"
        response += f"{selected_crew.personnel_type} \n"
        return response


    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
    
def handle_add_vehicle_crew(splitted, phone_number):
    """Add crew member"""
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle_crew = vehicle.crew_members.all().order_by('-created')
        print("vehicle_crew",vehicle_crew)
        response = f"CON Add crew member \n"
        response = f"CON Enter crew phone number \n"

        return response
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"

def handle_get_sacco_personnel_to_add_crew(splitted, phone_number):
    """Add crew member"""
    crew_phone_number = splitted[-1]
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
       
        sacco_pers = get_sacco_personnel_by_phone_number(crew_phone_number)
        if sacco_pers:
            # vehicle.crew_members.add(sacco_pers)
            # response = f"CON {sacco_pers} added to {vehicle} as crew \n"
            #  response = f"CON user phone {sacco_pers.user.first_name}"
        # vehicle_crew = vehicle.crew_members.all().order_by('-created')
        # print("vehicle_crew",vehicle_crew)
            response = f"CON{sacco_pers} found \n. Select crew type \n"
            response += f"1. CONDUCTOR \n"
            response += f"2. DRIVER \n"
            return response
        else:
            response = f"CON {crew_phone_number}: Sacco employee not found \n"
            response += "0. Back \n"
            return response

    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
    

def get_sacco_personnel_by_phone_number(phone_number):
    telco, formatted_phone_number = get_telco_by_phone_number(phone_number) 
    pers = None
    if SaccoPersonnel.objects.filter(user__phone=formatted_phone_number).exists():
        pers = SaccoPersonnel.objects.filter(user__phone=formatted_phone_number).first()
    return pers

def handle_select_crew_type(splitted, phone_number):
    """Add crew member"""
    crew_type=""
    sacco_personnel = None
    crew_phone_number = splitted[4]
    crew_type_index = int(splitted[5])
    if crew_type_index == 1:
        crew_type = "CONDUCTOR"
    elif crew_type_index == 2:
        crew_type = "DRIVER"
    else:
        response = f"CON Invalid input.\n Select crew type \n"
        response += f"0. Back \n"
       
        return response
    sacco_personnel = get_sacco_personnel_by_phone_number(crew_phone_number)
    if sacco_personnel:
        print("sacco_personnel", sacco_personnel)
    else:
        response = f"CON No user with this phone in sacco"
        return response
    print("crew_phone_number",crew_phone_number)
    print("crew_type",crew_type)
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(phone_number)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        vehicle.crew_members.add(sacco_personnel)
        response = f"CON {sacco_personnel} added to {vehicle} as crew \n"
        return response
    else:
        response = "CON Invalid input \n"
        response += "0. Back \n"
        return response
    
def handle_vehicle_collection_payouts_1(splitted, msisdn):
    """ 4*1*6 : Request amount """
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]

        account, balance = get_vehicle_administrator_account_and_balance(vehicle)

        response = f"CON {vehicle}: Acc.{account}, balance: KES {balance}\n"
        response +="Enter amount to pay out: \n"

        return response
    
def handle_vehicle_collection_payouts_2(splitted, msisdn):
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    amount_to_payout = float(splitted[3])
    subscriptions_amount = 0.00
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]

        account, balance = get_vehicle_administrator_account_and_balance(vehicle)

       
        if float(balance) < float(amount_to_payout + subscriptions_amount):
            response = f"END {vehicle}: Acc.{account}, balance: KES {balance}\n"
            response +=f"Insufficient balance to payout {amount_to_payout}  \n"
        else:
            response = f"CON {vehicle}: Acc.{account}, balance: KES {balance}\n"
            response +=f"Select payout channel: \n"
            response +="1. Airtel Money \n"
            response +="2. Bank Account \n"
            response +="3. Mpesa Number \n"
            response +="4. Paybill \n"
            response +="5. Till \n"
            response +="6. Whitelisted Accounts \n"
        return response
    
def handle_vehicle_collection_payouts_3(splitted, msisdn):
    """ 4*1*6*amount*n : Select payout method"""
    selected_payout_channel_index = int(splitted[4])
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]

        account, balance = get_vehicle_administrator_account_and_balance(vehicle)
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
            response += "0. Back"
        # response = f"CON {vehicle}: Acc.{account}, balance: KES {balance}\n"
        # response +="Payout to: \n"
        # response +="1. Airtel Money \n"
        # response +="2. Bank Account \n"
        # response +="3. Mpesa Number \n"
        # response +="4. Paybill \n"
        # response +="5. Till \n"
        return response
    
def handle_vehicle_collection_payouts_4(splitted, msisdn):
    selected_payout_channel_index = int(splitted[4])
    selected_payout_channel_number = splitted[5]
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]

        account, balance = get_vehicle_administrator_account_and_balance(vehicle)
        response = f"Process payout to {selected_payout_channel_index}"
        if selected_payout_channel_index==1:
           
            telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
            response = f"CON Pay out to Airtel {formatted_phone_number}\n"
            response += f"Enter your wallet pin"
        elif selected_payout_channel_index==2:
            response = f"CON Pay out to bank account number {selected_payout_channel_number} \n"
            response += f"Enter bank code"
        elif selected_payout_channel_index==3:
            telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
            response = f"CON Pay out to Mpesa {formatted_phone_number}\n"
            response += f"Enter your wallet pin"
        elif selected_payout_channel_index==4:
            response = f"CON Pay out to Paybill {selected_payout_channel_number}\n"
            response += f"Enter account number"
        elif selected_payout_channel_index==5:
            response = f"CON Pay out to Till {selected_payout_channel_number}\n"
            response += f"Enter your wallet pin"
        else:
            response = "END Invalid input here \n"
            response += "0. Back"
        # response = f"CON {vehicle}: Acc.{account}, balance: KES {balance}\n"
        # response +="Payout to: \n"
        # response +="1. Airtel Money \n"
        # response +="2. Bank Account \n"
        # response +="3. Mpesa Number \n"
        # response +="4. Paybill \n"
        # response +="5. Till \n"
        return response
    
def handle_vehicle_collection_payouts_5(splitted, msisdn):
    """ 4*1*6*100*4*paybill*accountnumber*pin """
    reference_number = None
    selected_payout_channel_index = int(splitted[4])
    selected_payout_channel_number = splitted[5]
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    amount_to_payout = splitted[3]
    wallet_pin = splitted[6]



    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        reference_number = generate_reference_number(vehicle.entity, vehicle.administrator.user)

        account, balance = get_vehicle_administrator_account_and_balance(vehicle)
        print("account", account)
        response = f"Process payout to {selected_payout_channel_index}"
        if selected_payout_channel_index==1:
            result = validate_wallet_pin(msisdn, wallet_pin)
            if result and "statusCode" in result and result["statusCode"]==400:
                message =result["message"][0]
                response = F"END Invalid pin"
                return response
            else:
                pass
           
            telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
            account_ref = f"{vehicle.administrator.user.first_name} {vehicle.administrator.user.last_name}"
            errors, result = payout_from_wallet_to_airtel(account, account_ref, formatted_phone_number,amount_to_payout,reference_number)
            print("errors at airtel", errors)
            print("result at airtel", result)

          
            jambopay_authorize_wallet_payout(wallet_pin, result["ref"])
       


            response = f"END Pay out {amount_to_payout} to Airtel {formatted_phone_number}\n"
            response += f"Payout processed. Please await sms confirmation"
        elif selected_payout_channel_index==2:
            response = f"CON Pay out to bank account number {selected_payout_channel_number}\n"
            response += "Enter wallet pin"
        elif selected_payout_channel_index==3:
            result = validate_wallet_pin(msisdn, wallet_pin)
            if result and "statusCode" in result and result["statusCode"]==400:
                message =result["message"][0]
                response = F"END Invalid pin"
                return response
            else:
                pass

            telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
            account_ref = f"{vehicle.administrator.user.first_name} {vehicle.administrator.user.last_name}"
            errors, result = payout_from_wallet_to_mpesa(account, account_ref, formatted_phone_number,amount_to_payout,reference_number,vehicle.administrator.user,wallet_pin)
            print("errors at mpesa", errors)
            print("result at mpesa", result)

          
            jambopay_authorize_wallet_payout(wallet_pin, result["ref"])

            


            response = f"END Pay out {amount_to_payout} to Mpesa {formatted_phone_number}\n"
            response += f"Payout processed. Please await sms confirmation"

        elif selected_payout_channel_index==4:
            response = f"CON Pay out to Paybill {selected_payout_channel_number}\n"
            response += "Enter wallet pin"
        elif selected_payout_channel_index==5:
            result = validate_wallet_pin(msisdn, wallet_pin)
            if result and "statusCode" in result and result["statusCode"]==400:
                message =result["message"][0]
                response = F"END Invalid pin"
                return response
            else:
                pass
            errors, result = payout_from_wallet_to_till(account, selected_payout_channel_number,amount_to_payout,reference_number)
            print("errors at mpesa", errors)
            print("result at mpesa", result)

          
            jambopay_authorize_wallet_payout(wallet_pin, result["ref"])
          


            response = f"END Pay out {amount_to_payout} to Till {selected_payout_channel_number}\n"
            response += f"Payout processed. Please await sms confirmation"
        else:
            response = "CON Invalid input \n"
            response += "0. Back"
        return response
    
def handle_vehicle_collection_payouts_6(splitted, msisdn):
    """ 4*1*6*100*4*paybill*accountnumber*pin """
    reference_number = None
    selected_payout_channel_index = int(splitted[4])
    selected_payout_channel_number = splitted[5]
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    print("splitted", splitted)
    amount_to_payout = splitted[3]
    wallet_pin = splitted[7]


    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        reference_number = generate_reference_number(vehicle.entity, vehicle.administrator.user)

        account, balance = get_vehicle_administrator_account_and_balance(vehicle)
        print("account", account)
        response = f"Process payout to {selected_payout_channel_index}"
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
            bank_code = splitted[6]
            account_ref = f"{vehicle.administrator.user.first_name} {vehicle.administrator.user.last_name} -{vehicle.registration}"
            errors, result = payout_from_wallet_to_bank(account, selected_payout_channel_number, account_ref, amount_to_payout, bank_code, reference_number)
            print("errors at mpesa", errors)
            print("result at mpesa", result)

          
            jambopay_authorize_wallet_payout(wallet_pin, result["ref"])
     
            response = f"END Pay out to bank account number {selected_payout_channel_number} code {bank_code}\n"
            response += "Payout bank processed. Please await sms confirmation"
        elif selected_payout_channel_index==3:
            response = "END Invalid option"

        elif selected_payout_channel_index==4:
            result = validate_wallet_pin(msisdn, wallet_pin)
            if result and "statusCode" in result and result["statusCode"]==400:
                message =result["message"][0]
                response = F"END Invalid pin"
                return response
            else:
                pass
            paybill_account_number = splitted[6]
            errors, result = payout_from_wallet_to_paybill(account, paybill_account_number, selected_payout_channel_number, amount_to_payout, reference_number)

          
            jambopay_authorize_wallet_payout(wallet_pin, result["ref"])
 
            response = f"END Pay out to Paybill {selected_payout_channel_number} Account: {paybill_account_number}\n"
            response += "Payout paybill processed. Please await sms confirmation"
        elif selected_payout_channel_index==5:
            response = "END Invalid option"
        else:
            response = "CON Invalid input \n"
            response += "0. Back"
        return response
    
def handle_payout_to_airtel_or_mpesa_numbers(splitted, msisdn):
    selected_payout_channel_index = int(splitted[3])
    selected_payout_channel_number = splitted[4]
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    vehicle_crew = []
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]
        account, balance = get_vehicle_administrator_account_and_balance(vehicle)
        # response = f"Process payout to {selected_payout_channel_index}"
        if selected_payout_channel_index==1:
           
            telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
            wallet_pin = splitted[5]

            payload = {
                        "amount": "10",
                        "accountFrom": "1003382",
                        "orderId": "330aa468-e2erere18-4f70-a77d-3a8d70677",
                        "provider": "MOMO_B2C",
                        "payTo": {
                            "accountRef": "Albert Musembi",
                            "accountNumber": "0786918440"
                        },
                        "callBackUrl": "https://webhook.site/c49b13e2-eb9f-47ee-a673-e60ae6b92737",
                        "narration": "Payout to Airtel Money"
                    }
            response = f"CON Pay out to Airtel {formatted_phone_number} pin {wallet_pin}\n"
            # response += f"Enter your wallet pin"
        elif selected_payout_channel_index==2:
            response = "END Pay out to Bank Account is not supported on USSD \n"
            # response += f"Bank : {selected_payout_channel_number}"
        elif selected_payout_channel_index==3:
            telco, formatted_phone_number = get_telco_by_phone_number(selected_payout_channel_number)
            response = f"Pay out to Mpesa {formatted_phone_number}\n"
            response += f"Enter your wallet pin"
        elif selected_payout_channel_index==4:
            response = "Pay out to Paybill \n"
            response += f"Paybill : {selected_payout_channel_number}"
        elif selected_payout_channel_index==5:
            response = "Pay out to Till \n"
            response += f"Till : {selected_payout_channel_number}"
        else:
            response = "CON Invalid input \n"
            response += "0. Back"
        # response = f"CON {vehicle}: Acc.{account}, balance: KES {balance}\n"
        # response +="Payout to: \n"
        # response +="1. Airtel Money \n"
        # response +="2. Bank Account \n"
        # response +="3. Mpesa Number \n"
        # response +="4. Paybill \n"
        # response +="5. Till \n"
        return response
    


def handle_manage_password(splitted, msisdn):
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
   
    if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
        vehicle = vehicles[selected_vehicle_index]

        account, balance = get_vehicle_administrator_account_and_balance(vehicle)

        response = f"CON {vehicle}:Manage pin for account {account}\n"
        response +="1. Password status \n"
        response +="2. Set password \n"
        response +="3. Change password \n"
        return response

def check_wallet_has_set_password(splitted, msisdn):
    """ 4*1*7*1 : Check wallet pin status"""
    resp = None
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    if vehicles:
        if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
            vehicle = vehicles[selected_vehicle_index]

            account, balance = get_vehicle_administrator_account_and_balance(vehicle)
            errors, result_json = check_wallet_pin(msisdn)
            if result_json:
                if result_json["status"]==True:
                    resp = "Pin is set for your wallet"
                else:
                    resp = "Pin is not set for your wallet"

                response = f"END {vehicle}:Password status for account {account}\n"
                response +=resp
                return response
            else:
                response = f"END {vehicle}:Password status for account {account}\n"
                for index, val in enumerate(errors):      
                    response +=f"{val}\n" 
                return response
    else:  
        response = f"END No vehicles for this user \n" 
        return response
    
def set_wallet_pin_step1(splitted, msisdn):
    """ 4*1*7*2 : Enter pin"""
    resp = None
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    if vehicles:
        if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
            vehicle = vehicles[selected_vehicle_index]

            account, balance = get_vehicle_administrator_account_and_balance(vehicle)

            response = f"CON {vehicle}: Set pin for account {account}\n"
            response +="Enter memorable 4 digit pin"
            return response

    else:  
        response = f"END No vehicles for this user \n" 
        return response
    
def set_wallet_pin_step2(splitted, msisdn):
    """ 4*1*7*2 : Confirm pin """
    response = None
    selected_vehicle_index = int(splitted[1])-1
    vehicles = retrieve_user_vehicles_by_phone(msisdn)
    if vehicles:
        if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
            vehicle = vehicles[selected_vehicle_index]

            account, balance = get_vehicle_administrator_account_and_balance(vehicle)

            print("splitted", splitted)
            entry_1 = splitted[4]
            # entry_2 = splitted[5]

            if not entry_1.isnumeric():
                response = f"END {vehicle}: Set pin for account {account}\n"
                response ="Pin can oly be numbers."
                return response
                
            else:
                errors, result = set_wallet_pin(msisdn,entry_1)
                if result:
                    response = f"END{vehicle}: Set pin for account {account}\n"
                    response +=f"Pin is sucessfuly set as {entry_1}\n"
                    response +="Your pin is your secret. Dont share with anyone\n"
                    return response
                elif errors:
                    response = f"END{vehicle}: Set pin for account {account}\n"
                    for index, val in enumerate(errors):      
                        response +=f"{val}\n" 
                    return response
    else:  
        response = f"END No vehicles for this user \n" 
        return response



def handle_deactivate_vehicle(splitted, phone_number):
    """DEcativate vehicle"""
    response  = "DEactivate vehicle"
    return response

# def handle_list_subscription_options(splitted, phone_number):
#     selected_vehicle_index = int(splitted[1])-1
#     vehicles = retrieve_user_vehicles_by_phone(phone_number)
#     if selected_vehicle_index>=0 and selected_vehicle_index<=len(vehicles):
#         vehicle = vehicles[selected_vehicle_index]
#         response = f"CON Select sacco subscription \n"
#         if len(vehicle.sacco_subscriptions.all())>0:
#             for index, val in enumerate(vehicle.sacco_subscriptions.all()):    
#                 response +=f"{str(index+1)}.{val.title}\n"
#             return response
#         else:
#             response = f"CON {vehicle} has no subscriptions \n"
#             response += "0. Back \n"
#             return response

def handle_my_wallet(splitted):
    response = "CON Wallet"

    return response

# def retrieve_wallet_details(phone_number):
#     jambopay_wallet = get_user_jambopay_wallet_by_phone(phone_number)
#     if jambopay_wallet:
#         account_number = jambopay_wallet["accountNo"]
#         account_name = jambopay_wallet["name"]
#         description = jambopay_wallet["description"]
#         balance = jambopay_wallet["currentBalance"]
#         print("Wallet details", jambopay_wallet)
#         response = f"Account No: {account_number} \n"
#         response += f"Account Name: {account_name} \n"
#         response += f"Description: {description} \n"
#         response += f"Balance: {balance} \n"
#         return response
#     else:
#         response = f" CON No wallet details retrieved \n"
#     return response

def retrieve_wallet_details(phone_number):
    if UserAccounts.objects.filter(account_phone=phone_number,account_type="WALLET" ).exists():
        wallet = UserAccounts.objects.filter(account_phone=phone_number,account_type="WALLET" ).first()
        payload = {
            "account_number": wallet.account_number
        }
        errors, balance_json = get_wallet_balance(payload)
        if balance_json:
            balance = balance_json["balance"]

        response = f"CON Wallet account number {wallet.account_number} current balance {balance} \n"
        response +="1. Payout \n"
        response +="2. Manage Pin \n"
        response +="3. Subscriptions \n"
        response +="4. Opt out \n"


    else:
        response = "CON No account retrieved. \nEnter your national ID number to create account"
    return response


def send_sms(user):
    message = f"Your cashless wallet has been created at JAMBOPAY."

    payload = {
                    "contact" : user.phone,
                    "message" : message,
                    "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                    "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                }
        
    errors, sent = send_swift_sms(payload)

def create_user_account(user, wallet):
    if UserAccounts.objects.filter(account_phone = user.phone, account_type="WALLET").exists():
        return None
    else:
        if PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").exists():
            default_psp =  PaymentServicesProvider.objects.filter(psp_title="JAMBOPAY").first()
            account = UserAccounts.objects.create(
                psp=default_psp,
                account_name = wallet["name"],
                account_number = wallet["accountNo"],
                account_phone = user.phone,
                account_type = "WALLET",
                currency="KES",
                owner = user,
                entity=user.entity
            )
            if account:
                return account
def send_internal_sms():
    pass            
def create_wallet_1(splitted, msisdn):
    user = None
    gender = None
    national_id = None
    print("splitted", splitted[1])
    response = None
    if len(splitted[1])>1:
        # This should be national id
        national_id = splitted[1]
        print("national Id", national_id)
        if UserAccounts.objects.filter(account_phone = msisdn, account_type="WALLET").exists():
            wallet = UserAccounts.objects.filter(account_phone = msisdn, account_type="WALLET").first()
            payload = {
            "account_number": wallet.account_number
              }
            errors, balance_json = get_wallet_balance(payload)
            if balance_json:
                balance = balance_json["balance"]
                response = f"Your account number {wallet.account_number} has a balance of {balance}"
                return response
        else:
            errors, result = jambopay_wallet.iprs_verify(national_id)
        # result = {'id': 0, 'dob': '18-05-1980', 'dod': None, 'firstName': 'LONNAH', 'gender': 'F', 'idNumber': '22028153', 'idType': 0, 'lastName': 'OBELAH', 'middleName': 'MAGUNIA', 'pin': None, 'serialNumber': '0', 'requestId': '6b227c75-71d3-461f-899c-52c0107dcca7'}
        # print("iprs", result)
   

            if result and "idNumber" in result:
                if result["gender"]=="F":
                    gender = "Female"
                elif result["gender"]=="M":
                    gender = "Male"
            
            
                date_object = datetime.datetime.strptime(result["dob"], '%d-%m-%Y').date()

                dob_str= date_object.strftime("%Y-%m-%d")
                print("date of birth", dob_str)
                default_entity = Entities.objects.get(
                        entity_type="DEFAULT", title="WAZIPOS"
                    )
                if User.objects.filter(phone=msisdn).exists():
                    user =User.objects.filter(phone=msisdn).first()
                    print("user exists", user)
                else:
                    user = User.objects.create(country_id="b4d0e91b-1600-4e1d-b147-f3f1c7e2f35f",gender=gender, password=result["idNumber"],entity=default_entity,date_of_birth =dob_str, first_name=result["firstName"],middle_name=result["middleName"],phone=msisdn, email=f"{msisdn}@wazipos.com", identifier_number=result["idNumber"],identifier_type="NationalId", last_name=result["lastName"])
                    user.save()
                    print("New user created", user)
                    if user:

                        errors, profile = get_jambopay_main_profile(msisdn)
                        print ("errors at check main accounts", errors)
                        print ("accounts at check main profile", profile)
                        if profile:
                            user.is_jp_profile_updated = True
                            user.save()
                            account_name = f"{user.first_name} {user.last_name} wallet"
                            account_type = "Individual"
                            description = "Cashless wallet"
                            errors, wallet = jambopay_wallet.create_white_label_account(account_name,account_type, description, msisdn)
                            print("errors at create wallet", errors)
                            print("wallet at create wallet", wallet)
                            if wallet:
                                account = create_user_account(user, wallet)
                                if account:
                                    response = "END Your wallet has been created."
                                    return response
                                else:
                                    response = "END Account creation failed"
                                    return response

                            else:
                                response = "END Wallet creation failed"
                                return response

                        else:
                            profile_data = {
                                "firstName": user.first_name,
                                "lastName": user.last_name,
                                "identityNumber": user.identifier_number,
                                "identityType": user.identifier_type,
                                "phoneNumber": user.phone,
                                "gender": user.gender,
                                "dateOfBirth":dob_str,
                                "county": "toUpdate",
                                "physicalAddress": "toUpdate",
                                "email": user.email
                                }
                            print("data at create", profile_data)

                            errors, profile = create_jambopay_profile(profile_data)
                            print("errors at create", errors)
                            print("profile at create", profile)
                            if profile:
                                user.is_jp_profile_updated = True
                                user.save()
                                account_name = f"{user.first_name} {user.last_name} wallet"
                                account_type = "Individual"
                                description = "Cashless wallet"
                                errors, wallet = jambopay_wallet.create_white_label_account(account_name,account_type, description, msisdn)
                                print("errors at create wallet2", errors)
                                print("wallet at create wallet2", wallet)
                                
                                if wallet:
                                    create_user_account(user, wallet)
                                    send_sms(user)
                                    response = "END Your wallet has been created."
                                    return response      
                                else:
                                    response = "END Wallet could not be created"
                                    return response
                            else:
                                print("No profile 2")
                                response = "END Profile could not be created"
                                return response
                            
                    else:
                        print("No user")
            else:
                response = "END Verification of details failed. Please try again later"
                send_internal_sms()
                return response
    else:
        pass
        # print("splitted", splitted)
        # if splitted[1]=="1":
        #     print()
        #     response = "CON Manage pin \n"
        #     response +="1. Password status \n"
        #     response +="2. Set password \n"
        #     response +="3. Change password \n"

        # elif splitted[1]=="2":
        #      response = "Top up wallet \n"

        # return response
    

    return response

def handle_my_vehicles(splitted):
    response = "CON My Vehicles"
    return response

# def generate_step_1_response_1(phoneNumber):

#     wazipos_profile = None

#     # Check Jambopay walle exists
#     errors, jambopay_profile = get_jambopay_main_profile(phoneNumber)
#     if jambopay_profile:
#         print("JPF",jambopay_profile )
#     # print("Jambopay wallet check", jambopay_profile)

#     # Check user is in Jambopay
#     if User.objects.filter(phone=phoneNumber).exists():
#         wazipos_profile = User.objects.filter(phone=phoneNumber).first()
#         print("Wazipos user", wazipos_profile)

#     if not wazipos_profile and not jambopay_profile:
#         response = "CON Welcome \n"
#         response += "1. Pay Fare \n"
#         response += "2. My Tickets \n"
#         response += "3. Create Wallet \n"

#         return response
#     elif jambopay_profile and not wazipos_profile:
#         jp_name = jambopay_profile["firstName"]
#         response = f"CON Welcome, {jp_name}\n"
#         response += "1. Pay Fare \n"
#         response += "2. My Tickets \n"
#         response += "3. My Wallet \n"
#         return response
#     elif wazipos_profile:
#         # jp_name = jambopay_profile["firstName"]
#         if SaccoPersonnel.objects.filter(user= wazipos_profile).exists():
#            sacco_personnel = SaccoPersonnel.objects.filter(user= wazipos_profile).first()
#            print("Sacco pers found")
#            if Vehicles.objects.filter(administrator=sacco_personnel).exists() or  Vehicles.objects.filter(conductor=sacco_personnel).exists():
#                 response = f"CON Welcome, {sacco_personnel.user.first_name}\n"
#                 response += "1. Pay Fare \n"
#                 response += "2. My Tickets \n"
#                 response += "3. My Wallet \n"
#                 response += "4. My Vehicles \n"
#                 response += "5. Sell Ticket \n"
#                 return response
#            else:
#                 response = f"CON Welcome, {sacco_personnel.user.first_name}\n"
#                 response += "1. Pay Fare \n"
#                 response += "2. My Tickets \n"
#                 response += "3. My Wallet \n"
#                 return response
#         else:
#             response = F"CON Welcome, {wazipos_profile.first_name}\n"
#             response += "1. Pay Fare \n"
#             response += "2. My Tickets \n"
#             response += "3. Create Wallet \n"
#             return response
#     else:
#         response = "CON No category"    
#         return response  


def generate_step_1_response_1(msisdn):
    user = None
    if User.objects.filter(phone=msisdn).exists():
        user = User.objects.filter(phone=msisdn).first()
        if SaccoPersonnel.objects.filter(user= user).exists():
            sacco_personnel = SaccoPersonnel.objects.filter(user= user).first()
            if UserAccounts.objects.filter(account_phone=msisdn, account_type="WALLET").exists():
                response = f"CON Welcome to Jambopay, {sacco_personnel.user.first_name}\n"
                response += "1. Pay Matatu Fare \n"
                response += "2. Bus Tickets \n"
                response += "3. Pay Boda/Tuktuk Fare \n"
                response += "4. Pay Rent \n"
                response += "5. Pay Parking Fees \n"
                response += "6. My Wallet \n"
                response += "7. My Vehicles \n"
                response += "8. Create Ticket \n"
                return response
            else:
                response = f"CON Welcome to Jambopay, {sacco_personnel.user.first_name}\n"
                response += "1. Pay Matatu Fare \n"
                response += "2. Bus Tickets\n"
                response += "3. Pay Boda/Tuktuk Fare \n"
                response += "4. Pay Rent \n"
                response += "5. Pay Parking Fees \n"
                response += "6. My Wallet \n"
                response += "7. My Vehicles \n"
                response += "8. Create Ticket \n"
                return response
        else:
            if UserAccounts.objects.filter(account_phone=msisdn, account_type="WALLET").exists():
                response = f"CON Welcome to Jambopay, {user.first_name}\n"
                response += "1. Pay Matatu Fare \n"
                response += "2. Bus Tickets \n"
                response += "3. Pay Boda/Tuktuk Fare \n"
                response += "4. Pay Rent \n"
                response += "5. Pay Parking Fees \n"
                response += "6. My Wallet \n"
            else:
                response = f"CON Welcome to Jambopay, {user.first_name}\n"
                response = f"CON Welcome to Jambopay, {user.first_name}\n"
                response += "1. Pay Matatu Fare \n"
                response += "2. Bus Tickets \n"
                response += "3. Pay Boda/Tuktuk Fare \n"
                response += "4. Pay Rent \n"
                response += "5. Pay Parking Fees \n"
                response += "6. Create Wallet \n"
            return response

    else:
        response = F"CON Welcome to Jambopay\n"
        response += "1. Pay Matatu Fare \n"
        response += "2. Bus Tickets \n"
        response += "3. Pay Boda/Tuktuk Fare \n"
        response += "4. Train/Airport Transfers \n"
        response += "5. Pay Parking Fees \n"
        response += "6. Create Wallet \n"
        return response
 



def handle_retrieve_conductor_vehicle_and_trip_details(splitted, msisdn):
    conducted_vehicle =retrieve_user_conducted_vehicles_by_phone(msisdn)
    if conducted_vehicle:
        current_trip = retrieve_current_trip_for_vehicle(conducted_vehicle)
        print ("Current trip", current_trip.route)
        # destinations = current_trip.route_details.destinations
        response = f"CON New Ticket: {conducted_vehicle}\n"
        response += f"{current_trip.route} \n"
        response += f"Select destination \n"

        destinations = []
        destinations = Destinations.objects.filter(route=current_trip.route).all().order_by("title")
        for index, val in enumerate(destinations):
                        
            response +=f"{str(index+1)}. {val.destination_from}-{val.destination_to} ({val.fare_peak})\n"
        return response
    else:
        response = "END Not attached to vehicle"
        return response

def request_number_of_seats_to_pay(splitted,msisdn):
    selected_destination_index = int(splitted[-1])-1
    conducted_vehicle =retrieve_user_conducted_vehicles_by_phone(msisdn)
    if conducted_vehicle:
        current_trip = retrieve_current_trip_for_vehicle(conducted_vehicle)
        print ("Current trip", current_trip.route)
        destinations = Destinations.objects.filter(route=current_trip.route).all().order_by("title")
        selected_destination = destinations[selected_destination_index]
        response = f"CON New Ticket: {conducted_vehicle}\n"
        response += f"{selected_destination} \n"
        response += f"Enter number of tickets to sell \n"
        return response
    
def handle_select_payment_method_conductor(splitted,msisdn):
    selected_destination_index = int(splitted[1])-1
    conducted_vehicle =retrieve_user_conducted_vehicles_by_phone(msisdn)
    if conducted_vehicle:
        current_trip = retrieve_current_trip_for_vehicle(conducted_vehicle)
        print ("Current trip", current_trip.route)
        destinations = Destinations.objects.filter(route=current_trip.route).all().order_by("title")
        selected_destination = destinations[selected_destination_index]

        payment_methods = PaymentMethods.objects.all().exclude(title="CASH").order_by("title")
        response = f"CON New Ticket: {conducted_vehicle}\n"
        response += f"{selected_destination} \n"
        response += f"Select payment method \n"
        for index, val in enumerate(payment_methods):      
                response +=f"{str(index+1)}.{val.title}\n"
        return response
    
def handle_enter_mobile_money_phone_number(splitted,msisdn):
    selected_destination_index = int(splitted[1])-1
    number_of_tickets = int(splitted[2])
    # selected_payment_method_index = int(splitted[3])-1
    conducted_vehicle =retrieve_user_conducted_vehicles_by_phone(msisdn)
    if conducted_vehicle:
        current_trip = retrieve_current_trip_for_vehicle(conducted_vehicle)
        print ("Current trip", current_trip.route)
        destinations = Destinations.objects.filter(route=current_trip.route).all().order_by("title").order_by("title")
        selected_destination = destinations[selected_destination_index]
        to_pay = float(number_of_tickets * selected_destination.fare_peak)
        # payment_methods = PaymentMethods.objects.all().exclude(title="CASH").order_by("title")
        # selected_payment_method = payment_methods[selected_payment_method_index]
        # response = f"CON New Ticket: {conducted_vehicle}\n"
        response = f"CON {selected_destination} \n"
        response += f"{number_of_tickets} tickets x KES {selected_destination.fare_peak} fare =  KES {to_pay} \n"
        response += f"Enter phone number to pay or enter 1 to pay with this phone number \n"
      
        return response
    
def handle_finalize_conductor_ticket(splitted,msisdn):
    selected_destination_index = int(splitted[1])-1
    mobile_money_phone_number = None
    number_of_tickets = int(splitted[2])
    selected_payment_method_index = int(splitted[3])-1
    selected_payment_number = splitted[4]
    if selected_payment_number=="1":
        mobile_money_phone_number = msisdn
    else:
        telco, number = get_telco_by_phone_number(selected_payment_number)
        if number:
            mobile_money_phone_number = number
    conducted_vehicle =retrieve_user_conducted_vehicles_by_phone(msisdn)
    if conducted_vehicle and mobile_money_phone_number:
        trip = retrieve_current_trip_for_vehicle(conducted_vehicle)
        print ("Current trip", trip.route)
        destinations = Destinations.objects.filter(route=trip.route).all().order_by("title").order_by("title")
        selected_destination = destinations[selected_destination_index]
        fare_per_ticket = selected_destination.fare_peak
        total_to_pay = float(number_of_tickets * selected_destination.fare_peak)
        payment_methods = PaymentMethods.objects.all().exclude(title="CASH").order_by("title")
        selected_payment_method = payment_methods[selected_payment_method_index]
        response = create_tickets(total_to_pay,fare_per_ticket, number_of_tickets,trip,selected_destination_index,destinations,mobile_money_phone_number,mobile_money_phone_number, selected_payment_method.id)
        # response = f"CON New Ticket: {conducted_vehicle}\n"
        # response = f"{selected_destination} \n"
        # response += f"{number_of_tickets} tickets x KES {selected_destination.fare_peak} fare =  KES {total_to_pay} \n"
        # response += f"Enter pin wnen prompted to complete transaction. Thank your from Jambopay \n"
      
        return response
    else:
        response = "END an error occurred"





# def get_trip_by_vehicle_registration(reg):
#     errors =[]
#     vehicle = None

    
#     if Vehicles.objects.filter(registration=reg.upper()).exists():
#         vehicle=Vehicles.objects.filter(registration=reg.upper()).first()
#         print("Vehicle at USSD found", vehicle)

#     else:
#         errors.append(f"{reg} not found \n")
#         return errors, None,None
    
#     if Trip.objects.filter(vehicle=vehicle, departure_date__gte=get_today_date(),is_active="true").exists():
#         trip = Trip.objects.filter(vehicle=vehicle, departure_date__gte=get_today_date(),is_active="true").first()
        
#         if Destinations.objects.filter(route = trip.route).exists():
#             destinations = Destinations.objects.filter(route = trip.route).all()
#         return [], trip, destinations
#     else:
#         errors.append(f"No trip found  for {vehicle.registration} \n")
#         return errors, None, None
    
def create_tickets(total_to_pay,fare_per_ticket, number_of_tickets,trip,selected_index,destinations,last_input,phone_number, selected_payment_method_id):
    user = None
    drafts_array=[]
    if not phone_number==None:
        if User.objects.filter(phone=phone_number).exists():
            user = User.objects.filter(phone=phone_number).first()
            print("User existing", user)
    else:
        pass
        # user = User.objects.create(phone = phone_number, email=f"{phone_number}@wazipos.com", first_name = phone_number, last_name = phone_number)
        # print("User not existing", user)


    for i in range(int(number_of_tickets)):
        draft = {
           
            "fare": float(fare_per_ticket),
            "first_name": "",
            "identifier_number": "",
            "identifier_type": "",
            "last_name": "",
            "passenger_phone": phone_number,
            "reference_number": "",
            "route": str(trip.route.id),
            "seat": "",
            "trip": str(trip.id),
            "vehicle": str(trip.vehicle.id),
            "destination": destinations[selected_index].id,
            "origin":"USSD"
        }
        print("Draft",draft)
        drafts_array.append(draft)
    print("At builsdd", phone_number)     

    obj = {
            "action": "CreateBatchedTickets",
            "mobile_money_phone": phone_number,
            "jambopay_wallet_phone":phone_number,
            "payment_method": selected_payment_method_id,
            "tickets": drafts_array
            
        }
    print("Draft obj",obj)
    errors, respo, other= create_batched_tickets(obj, trip.vehicle.owner) 
    print("Draft resp",respo)
    print("Draft errors",errors)
    if errors:
        response ="END "
        for index, val in enumerate(errors):      
            response +=f"{val}\n" 
        return response
    else:
        response =  f"END Enter pin wnen prompted to complete transaction. Thank you from Jambopay"
        return response
        

