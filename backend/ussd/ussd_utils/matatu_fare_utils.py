from transport.models import Vehicles, Trip, Destinations
from payments.models import PaymentMethods,UserAccounts
from transport.transport_utils import create_batched_tickets

def get_matatu_details_by_registration(splitted):
    registration = splitted[1]
    formatted_registration = registration.replace(" ","").strip().upper()
    if Vehicles.objects.filter(registration=formatted_registration).exists():
        vehicle=Vehicles.objects.filter(registration=formatted_registration).first()
        return vehicle
    else:
        return None
    
def get_matatu_details_by_till(splitted):
    till = splitted[1]
    formatted_till = till.replace(" ","").strip().upper()
    print("fortill", formatted_till)
    if UserAccounts.objects.filter(account_number=formatted_till).exists():
        account=UserAccounts.objects.filter(account_number=formatted_till).first()
        print("account", account)
        if  Vehicles.objects.filter(collector=account.owner).exists():
            vehicle=Vehicles.objects.filter(collector=account.owner).first()
        return vehicle, account
    else:
        return None, None
    
def get_current_vehicle_trip(vehicle):
    trip = None
    if Trip.objects.filter(vehicle=vehicle, is_active="true").exists():
        trip = Trip.objects.filter(vehicle=vehicle, is_active="true").first()
        return trip
    else:
        return None
    
def get_route_destinations(route):
    if Destinations.objects.filter(route=route).exists():
        destinations = Destinations.objects.filter(route=route).all()
        return destinations
    else:
        return None
    
    # Pay matatu fare using number plate
# def pay_matatu_fare_1(splitted,msisdn):
#     response = "CON Enter vehicle plate number \n"
#     return response


# def pay_matatu_fare_2(splitted,msisdn):
#     vehicle = get_matatu_details(splitted)
#     if vehicle:
#         current_trip = get_current_vehicle_trip(vehicle)
#         if current_trip:
#             destinations = get_route_destinations(current_trip.route)
#             response = f"CON {vehicle.registration}: {vehicle.entity.title} \n"
#             response += f"{current_trip.route.title} \n"
#             response += f"Select origin/destination \n"
#             if len(destinations)>0:
#                 for index, val in enumerate(destinations):             
#                     response +=f"{str(index+1)}. {val.title}\n"
#         else:
#             response +="Vehicle has no active trip"
#     else:
#         response = "No such vehicle"
#     return response

# def pay_matatu_fare_3(splitted,msisdn):
#     vehicle = get_matatu_details(splitted)
#     response = f"CON {vehicle.registration}: {vehicle.entity.title} \n"
#     response +="Enter commuter first name, last name and ID/Passport separated by comma"
#     return response



def get_passenger_details(splitted,):
    passenger_details_str = splitted[3]
    passenger_details = passenger_details_str.split(",")
    return passenger_details


# def pay_matatu_fare_3(splitted,msisdn):
#     selected_destination_index = int(splitted[2])-1
#     destinations= None
#     vehicle = get_matatu_details(splitted)
#     current_trip = get_current_vehicle_trip(vehicle)
#     if current_trip:
#             destinations = get_route_destinations(current_trip.route)
#     selected_destination = destinations[selected_destination_index]
#     print("selected_destination",selected_destination)
#     response = f"CON {vehicle.registration}: {vehicle.entity.title} \n"
#     response += f"Important for insurance purposes \n"
#     response +="Enter commuter first name, last name and ID/Passport separated by comma"
#     return response

# def pay_matatu_fare_4(splitted, msisdn):
    payment_method = None
    passenger_details = get_passenger_details(splitted)
    selected_destination_index = int(splitted[2])-1
    vehicle = get_matatu_details_by_registration(splitted)
    current_trip = get_current_vehicle_trip(vehicle)
    if current_trip:
            destinations = get_route_destinations(current_trip.route)
    selected_destination = destinations[selected_destination_index]

    if PaymentMethods.objects.filter(title="MOBILE MONEY").exists():
        payment_method =PaymentMethods.objects.filter(title="MOBILE MONEY").first()

    data = {
        "action": "CreateBatchedTickets",
        "mobile_money_phone": msisdn,
        "jambopay_wallet_phone": "",
        "payment_method": payment_method.id,
        "tickets": [
            {
                "trip": current_trip.id,
                "route": current_trip.route.id,
                "seat": "",
                "first_name": passenger_details[0],
                "last_name": passenger_details[1],
                "destination": selected_destination.id,
                "identifier_type": "NationalId",
                "identifier_number": passenger_details[2],
                "vehicle": vehicle.id,
                "passenger_phone": msisdn
            }
        ]
    }

    result = create_batched_tickets(data, vehicle.owner)
    print("result", result)
    response = f"END Payment for {vehicle.registration}: {vehicle.entity.title} initiated\n "
    response += "Enter pin to complete transaction when propted"
    return response




# Pay matatu fare using user account

def pay_matatu_fare1_1(splitted,msisdn):
    response = "CON Enter till number \n"
    return response

def pay_matatu_fare1_2(splitted,msisdn):
    vehicle, account = get_matatu_details_by_till(splitted)
    if vehicle and account:
        current_trip = get_current_vehicle_trip(vehicle)
        if current_trip:
            destinations = get_route_destinations(current_trip.route)
            response = f"CON {vehicle.registration}: {vehicle.entity.title} \n"
            response += f"{current_trip.route.title} \n"
            response += f"Select origin/destination \n"
            if len(destinations)>0:
                for index, val in enumerate(destinations):             
                    response +=f"{str(index+1)}. {val.title}\n"
        else:
            response ="END Vehicle has no active trip"
    else:
        response = "END No such vehicle"
    return response

def pay_matatu_fare1_3(splitted,msisdn):
    selected_destination_index = int(splitted[2])-1
    destinations= None
    vehicle,account = get_matatu_details_by_till(splitted)
    current_trip = get_current_vehicle_trip(vehicle)
    if current_trip:
            destinations = get_route_destinations(current_trip.route)
    selected_destination = destinations[selected_destination_index]
    print("selected_destination",selected_destination)
    response = f"CON {vehicle.registration}: {vehicle.entity.title} \n"
    response += f"Important for insurance purposes \n"
    response +="Enter commuter first name, last name and ID/Passport separated by comma"
    return response


def pay_matatu_fare1_4(splitted, msisdn):
    payment_method = None
    passenger_details = get_passenger_details(splitted)
    selected_destination_index = int(splitted[2])-1
    vehicle, account = get_matatu_details_by_till(splitted)
    current_trip = get_current_vehicle_trip(vehicle)
    if current_trip:
        destinations = get_route_destinations(current_trip.route)
        selected_destination = destinations[selected_destination_index]

        if PaymentMethods.objects.filter(title="MOBILE MONEY").exists():
            payment_method =PaymentMethods.objects.filter(title="MOBILE MONEY").first()

            data = {
                "action": "CreateBatchedTickets",
                "mobile_money_phone": msisdn,
                "jambopay_wallet_phone": "",
                "payment_method": payment_method.id,
                "tickets": [
                    {
                        "trip": current_trip.id,
                        "route": current_trip.route.id,
                        "seat": "",
                        "first_name": passenger_details[0],
                        "last_name": passenger_details[1],
                        "destination": selected_destination.id,
                        "identifier_type": "NationalId",
                        "identifier_number": passenger_details[2],
                        "vehicle": vehicle.id,
                        "passenger_phone": msisdn
                    }
                ]
            }
            try:
                result = create_batched_tickets(data, vehicle.owner)
                print("result", result)
                if result:
                    response = f"END Payment for {vehicle.registration}: {vehicle.entity.title} initiated\n "
                    response += "Enter pin to complete transaction when propted"
                    return response
                else:
                    response =  "END An error occurred. Please try again"
                    return response
            except Exception as e:
                response = str(e)
                return response
    else:
        response= "END No trip details"
        return response


def pay_matatu_fare2_1(splitted,msisdn):
    response = "CON Enter displayed till number \n"
    return response

def pay_matatu_fare2_2(splitted,msisdn):
    vehicle, account = get_matatu_details_by_till(splitted)
    if vehicle and account:
        current_trip = get_current_vehicle_trip(vehicle)
        if current_trip:
            destinations = get_route_destinations(current_trip.route)
            response = f"CON {vehicle.registration}: {vehicle.entity.title} \n"
            response += f"{current_trip.route.title} \n"
            response += f"Select origin/destination \n"
            if len(destinations)>0:
                for index, val in enumerate(destinations):             
                    response +=f"{str(index+1)}. {val.title}\n"
        else:
            response ="END Vehicle has no active trip"
    else:
        response = "END No such vehicle"
    return response


def pay_matatu_fare2_3(splitted,msisdn):
    selected_destination_index = int(splitted[2])-1
    destinations= None
    vehicle,account = get_matatu_details_by_till(splitted)
    current_trip = get_current_vehicle_trip(vehicle)
    if current_trip:
            destinations = get_route_destinations(current_trip.route)
    selected_destination = destinations[selected_destination_index]
    print("selected_destination",selected_destination)
    response = f"CON {vehicle.registration}: {vehicle.entity.title} \n"
    response +="Enter number of tickets to pay for"
    return response

# def pay_matatu_fare2_3(splitted,msisdn):
#     selected_destination_index = int(splitted[2])-1
#     destinations= None
#     vehicle,account = get_matatu_details_by_till(splitted)
#     current_trip = get_current_vehicle_trip(vehicle)
#     if current_trip:
#             destinations = get_route_destinations(current_trip.route)
#     selected_destination = destinations[selected_destination_index]
#     print("selected_destination",selected_destination)
#     response = f"CON {vehicle.registration}: {vehicle.entity.title} \n"
#     response += f"Important for insurance purposes \n"
#     response +="Enter commuter first name, last name and ID/Passport separated by comma"
#     return response


def pay_matatu_fare2_4(splitted, msisdn):
    payment_method = None
    number_of_tickets = int(splitted[3])
    selected_destination_index = int(splitted[2])-1
    vehicle, account = get_matatu_details_by_till(splitted)
    current_trip = get_current_vehicle_trip(vehicle)
    if current_trip:
        destinations = get_route_destinations(current_trip.route)
        selected_destination = destinations[selected_destination_index]

        if PaymentMethods.objects.filter(title="MOBILE MONEY").exists():
            payment_method =PaymentMethods.objects.filter(title="MOBILE MONEY").first()
            tickets = []
            for x in range(number_of_tickets):
                ticket = {
                        "trip": current_trip.id,
                        "route": current_trip.route.id,
                        "seat": "",
                        "first_name": "N/A",
                        "last_name": "N/A",
                        "destination": selected_destination.id,
                        "identifier_type": "NationalId",
                        "identifier_number": "N/A",
                        "vehicle": vehicle.id,
                        "passenger_phone": msisdn
                    }
                tickets.append(ticket)
            data = {
                "action": "CreateBatchedTickets",
                "mobile_money_phone": msisdn,
                "jambopay_wallet_phone": "",
                "payment_method": payment_method.id,
                "tickets": tickets
            }

            print("data", data)
            try:
                result = create_batched_tickets(data, vehicle.owner)
                print("result", result)
                if result:
                    response = f"END Payment for {vehicle.registration}: {vehicle.entity.title} initiated\n "
                    response += "Enter pin to complete transaction when propted"
                    return response
                else:
                    response =  "END An error occurred. Please try again"
                    return response
            except Exception as e:
                response = str(e)
                return response
    else:
        response= "END No trip details"
        return response