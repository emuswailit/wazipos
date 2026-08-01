from authentication.models import Towns
from core.date_utils import generate_departure_time_intervals, generate_dates_list
from datetime import datetime
from transport.models import Journies,JourneyBookings
from payments.models import PaymentMethods
from transport.utils.bus_utils import create_journey_booking

def get_cities():
    return Towns.objects.all().order_by("title")
def get_destination_cities(origin):
    cities = get_cities()
    # Exclude origin from next listing
    cities_minus_origin = cities.exclude(id=origin.id)
    return cities_minus_origin

def get_origin_city(splitted):
    origin_city_index = int(splitted[1])-1
    origin_cities = get_cities()
    origin_city = origin_cities[origin_city_index]
    print("Orig city", origin_city)
    return origin_city

def get_destination_city(splitted):
    origin_city_index = int(splitted[1])-1
    origin_cities = get_cities()
    origin_city = origin_cities[origin_city_index]
    destination_city_index = int(splitted[2])-1
    destination_cities = get_destination_cities(origin_city)
    destination_city = destination_cities[destination_city_index]
    print("Dest city", destination_city)
    return destination_city
     
def get_selected_date(splitted):
    dates_to_list =  generate_dates_list()
    selected_date_index = int(splitted[3])-1
    selected_date = dates_to_list[selected_date_index]
    print("selected date", selected_date)
    selected_date_object = datetime.strptime(selected_date, '%Y-%m-%d').date()
    return selected_date_object



def get_journeys(splitted):
    origin_city = get_origin_city(splitted)

    destination_city = get_destination_city(splitted)

    # Selected date
    selected_date_object = get_selected_date(splitted)
    print("selected date object", selected_date_object)

    # Selected time
    times = generate_departure_time_intervals()
    selected_time_index = int(splitted[4])-1
    selected_time = times[selected_time_index]
    print("selected time", selected_time)
    splited_time = selected_time.split("-")
    print("splitted time", splited_time)

    band_from_time  = datetime.strptime(splited_time[0], '%H:%M').time()
    print("band_from_time",band_from_time)

    band_to_time  = datetime.strptime(splited_time[1], '%H:%M').time()
    print("band_to_time",band_to_time)


    if Journies.objects.filter(origin_town=origin_city,destination_town=destination_city,departure_date=selected_date_object,departure_time__gte=band_from_time, departure_time__lte=band_to_time).exists():
        journies = Journies.objects.filter(origin_town=origin_city,destination_town=destination_city,departure_date=selected_date_object,departure_time__gte=band_from_time, departure_time__lte=band_to_time).all()
        print("TF",journies)
        print("Iko trip")
        return journies
    else:
        return []
def get_selected_jouney(splitted):
    selected_journey_index = int(splitted[5])-1
    journies = get_journeys(splitted)
    selected_journey = journies[selected_journey_index]
    print("selected journey", selected_journey)
    return selected_journey


def get_available_seats(journey):
    sold_seats_array=["D",]
    if JourneyBookings.objects.filter(journey=journey, is_paid="true").exists():
        journey_tickets =JourneyBookings.objects.filter(journey=journey,is_paid="true").all()
        for ticket in journey_tickets:
            if ticket.seat and ticket.is_paid=="true":
                sold_seats_array.append(ticket.seat)


    if journey.vehicle.seats==12:
        all_seats = ["1","1X","2","3","4","5","6","7","8","9","10","11"]
        for seat in all_seats:
            for sold_seat in sold_seats_array:
                if str(seat).upper()==str(sold_seat).upper():
                    all_seats.remove(seat)
        return all_seats
    elif journey.vehicle.seats==14:
        all_seats=  ["1","1X","2","3","4","5","6","7","8","9","10","11","12","13"]
        for seat in all_seats:
            for sold_seat in sold_seats_array:
                if str(seat).upper()==str(sold_seat).upper():
                    all_seats.remove(seat)
        return all_seats
    

def get_selected_seat(splited):
    selected_seat = str(splited[6]).upper()
    print("selected_seat",selected_seat)
    return selected_seat


def get_passenger_details(splitted):
    passenger_details_str = splitted[7]
    passenger_details = passenger_details_str.split(",")
    return passenger_details

def bus_tickets_step_1(splitted,msisdn):
    response = "CON Select origin city \n"
    # Retrieve cities
    cities = get_cities()
    # List cities for selection
    for index, val in enumerate(cities):      
                response +=f"{str(index+1)}.{val.title}\n"
    return response

def bus_tickets_step_2(splitted,msisdn):
    origin_city = get_origin_city(splitted)
    destination_cities = get_destination_cities(origin_city)
    response = "CON Select destination city \n"
    for index, val in enumerate(destination_cities):      
                response +=f"{str(index+1)}.{val.title}\n"
    return response

def bus_tickets_step_3(splitted,msisdn):
    response = "CON Select travel date"
        # Generate list of dates
    dates_to_list =  generate_dates_list()

    # Display dates list
    print("Dates", dates_to_list)
    response = f"CON Select travel date \n"
    for index, val in enumerate(dates_to_list):      
            response +=f"{str(index+1)}. {val}\n"
    return response

def bus_tickets_step_4(splitted,msisdn):
    times = generate_departure_time_intervals()

   
    response = f"CON Select departure time range \n"
    for index, val in enumerate(times):      
            response +=f"{str(index+1)}.{val}\n"
    return response

def bus_tickets_step_5(splitted,msisdn):

    response = "CON Select trip \n"
    journeys = get_journeys(splitted)
    if len(journeys)>0:
        for index, val in enumerate(journeys):      
            response +=f"{str(index+1)}.{val.entity.title}-{val.departure_time}\n"
    else:
        response = "END No buses found \n"
        
    return response

def bus_tickets_step_6(splitted,msisdn):
    selected_journey = get_selected_jouney(splitted)
    selected_date = get_selected_date(splitted)
    # print("selected jani", selected_journey.available_seats)
    available_seats = get_available_seats(selected_journey)
    print("available_seats",available_seats)
    response = f"CON {selected_journey} - {selected_date}\n"
    seats_string = ", ".join(map(str,available_seats))
    response += "Enter one seat number from list below \n"
    response += seats_string
    return response

def bus_tickets_step_7(splitted,msisdn):
    selected_journey = get_selected_jouney(splitted)
    selected_date = get_selected_date(splitted)
    selected_seat =  get_selected_seat(splitted)
    response = f"CON {selected_journey} - {selected_date}\n"
    response += "Enter passenger first name, last name and ID/Passport separated by comma "
    return response

def bus_tickets_step_8(splitted,msisdn):
    splited_details= None
    payment_method = None
    selected_journey = get_selected_jouney(splitted)
    passenger_details = get_passenger_details(splitted)
    selected_seat =  get_selected_seat(splitted)
    response = f"END Booking for {passenger_details[0]} {passenger_details[1]} - {passenger_details[2]} initiated \n"
    response += "Enter pin when prompted to complete"
    if PaymentMethods.objects.filter(title="MOBILE MONEY").exists():
         payment_method =PaymentMethods.objects.filter(title="MOBILE MONEY").first()
    payload = {
            "action":"CreateTransferBooking",
            "journey_booking_details":{
                "journey":selected_journey.id,
                "first_name": passenger_details[0],
                "last_name":passenger_details[1],
                "identifier_number":passenger_details[2],
                "identifier_type":"",
                "payment_method": payment_method.id,
                "mobile_money_phone":msisdn,
                "seat":selected_seat
                
            }
  
        }
    result =create_journey_booking(payload, selected_journey.owner)
    return response

