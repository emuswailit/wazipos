from parking.models import ParkingEvent
from intergrations.bitmos import bitmos_parking_payments

def get_parking_details(splitted):

    parking_event = None
    registration = splitted[1]
    formatted_registration = registration.replace(" ","").strip().upper()
    if ParkingEvent.objects.filter(plate_number=formatted_registration,is_active="true").exists():
        parking_event=ParkingEvent.objects.filter(plate_number=formatted_registration, is_active="true").first()
        return parking_event
    else:
        return None

def parking_1(splitted,msisdn):
    response = "CON Enter vehicle plate number \n"
    return response


def parking_2(splitted,msisdn):
    parking_event = None
    registration = splitted[1]
    formatted_registration = registration.replace(" ","").strip().upper()
    parking = bitmos_parking_payments.check_vehicle_parked(formatted_registration)
    print("parking", parking)
    if parking and "registration_number" in parking:
        response = f"CON Pay KES {parking['parking_fee']} for {parking['registration_number']} parking lasting {parking['parked_duration_hours']} hours\n"
        response +="1. Accept \n"
        response +="2. Cancel \n "
    else:
        response =f"END No parking details retrieved for {splitted[1]}"
    return response

def parking_3(splitted,msisdn):
    registration = splitted[1]
    formatted_registration = registration.replace(" ","").strip().upper()
    payment = bitmos_parking_payments.pay_vehicle_parking(formatted_registration, msisdn)
    print("payment", payment)
    if payment and "checkout_id" in payment:
        response = f"END Pay  for {formatted_registration} succesfully initiated. Enter pin when prompted to complete transaction.\n"
    else:
        response =f"END No parking details retrieved for {splitted[1]}"
    return response