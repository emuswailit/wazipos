from authentication.models import Towns
from transport.models import TransferPoints, Transfers
from datetime import timedelta, date, datetime
from core.phone_number_utils import get_telco_by_phone_number
from core.date_utils import generate_departure_time_intervals, generate_dates_list
from transport.utils.transfers_utils import create_transfer_booking
from payments.models import PaymentMethods
import json

def get_cities():
    return Towns.objects.all().order_by("title")

def get_transfer_points_for_city(city):
    if TransferPoints.objects.filter(city=city).exists():
        return TransferPoints.objects.filter(city=city).all().order_by("title")
    else:
        return []

def get_selected_city_by_index(index):
    cities = get_cities()
    selected_city=cities[index]
    return selected_city
         


def get_origin_transfer_point(point_index, city):
     transfer_points = get_transfer_points_for_city(city)
     origin_transfer_point =transfer_points[point_index]
     return origin_transfer_point
     

def transfers_1(splitted,msisdn):
    response = "CON Select city \n"
    # Retrieve cities
    cities = get_cities()
    # List cities for selection
    for index, val in enumerate(cities):      
                response +=f"{str(index+1)}.{val.title}\n"
    return response
    
def get_destination_transfer_points(origin_transfer_point,selected_city):
    transfer_points = get_transfer_points_for_city(selected_city)
    # Exclude origin from next listing
    transfer_points_minus_origin = transfer_points.exclude(id=origin_transfer_point.id)
    return transfer_points_minus_origin
     
     

def transfers_2(splitted,msisdn):
    """ Select origin : n*n """
    transfer_points =[]
    selected_city_index = int(splitted[1])-1
    selected_city = get_selected_city_by_index(selected_city_index)
    if selected_city:
        transfer_points = get_transfer_points_for_city(selected_city)
        
    print("selected city", selected_city)
    print("transfer_points", transfer_points)
    if len(transfer_points)>0:
        ##Display transfer points for user to select
        response = f"CON {selected_city.title.upper()}: Transfer from \n"
        for index, val in enumerate(transfer_points):      
                response +=f"{str(index+1)}.{val.title.upper()}\n"
    else:
        response = f"END No transfer points set for {selected_city}"

    return response

def transfers_3(splitted,msisdn):
    """ Select dstination : n*n*n """
    transfer_points =[]
    selected_city_index = int(splitted[1])-1
    selected_city = get_selected_city_by_index(selected_city_index)

    selected_origin_transfer_point_index =int(splitted[1])-1

    origin_transfer_point = get_origin_transfer_point(selected_origin_transfer_point_index, selected_city)

    destination_transfer_points = get_destination_transfer_points(origin_transfer_point,selected_city)
       
        
    print("selected city", selected_city)
    print("transfer_points", transfer_points)
    if len(destination_transfer_points)>0:
        ##Display transfer points for user to select
        response = f"CON {selected_city.title.upper()}: Transfer to \n"
        for index, val in enumerate(destination_transfer_points):      
                response +=f"{str(index+1)}.{val.title.upper()}\n"
    else:
        response = f"END No transfer points set for {selected_city}"

    return response

def transfers_4(splitted,msisdn):
    """ Select transfer date """

    # Retrieve city details
    selected_city_index = int(splitted[1])-1
    selected_city = get_selected_city_by_index(selected_city_index)

    # Generate list of dates
    dates_to_list =  generate_dates_list()

    # Display dates list
    print("Dates", dates_to_list)
    response = f"CON {selected_city.title.upper()}: Select transfer date \n"
    for index, val in enumerate(dates_to_list):      
            response +=f"{str(index+1)}. {val}\n"
    return response

def transfers_5(splitted,msisdn):
    # Retrieve city details
    selected_city_index = int(splitted[1])-1
    selected_city = get_selected_city_by_index(selected_city_index)

    times = generate_departure_time_intervals()
    response = f"CON {selected_city.title.upper()}: Select departure time range \n"
    for index, val in enumerate(times):      
            response +=f"{str(index+1)}.{val}\n"
    return response

def transfers_6(splitted,msisdn):
    selected_city_index = int(splitted[1])-1
    selected_city = get_selected_city_by_index(selected_city_index)
    print("selected city", selected_city)

    # Origin transfer points
    selected_origin_transfer_point_index =int(splitted[1])-1

    origin_transfer_point = get_origin_transfer_point(selected_origin_transfer_point_index, selected_city)
    print ("origin at 6", origin_transfer_point)

    # Destination transfer points
    destination_transfer_points = get_destination_transfer_points(origin_transfer_point,selected_city)
    print("destination transfer points at 6", destination_transfer_points)

    selected_destination_transfer_point_index =int(splitted[1])-1
    destination_transfer_point = destination_transfer_points[selected_destination_transfer_point_index]
    print ("destination at 6", destination_transfer_point)

    # Selected date
    dates_to_list =  generate_dates_list()
    selected_date_index = int(splitted[4])-1
    selected_date = dates_to_list[selected_date_index]
    print("selected date", selected_date)

    selected_date_object = datetime.strptime(selected_date, '%Y-%m-%d').date()
    print("selected date object", selected_date_object)

    # Selected time
    times = generate_departure_time_intervals()
    selected_time_index = int(splitted[5])-1
    selected_time = times[selected_time_index]
    print("selected time", selected_time)
    splited_time = selected_time.split("-")
    print("splitted time", splited_time)

    band_from_time  = datetime.strptime(splited_time[0], '%H:%M').time()
    print("band_from_time",band_from_time)

    band_to_time  = datetime.strptime(splited_time[1], '%H:%M').time()
    print("band_to_time",band_to_time)
    response = "CON Select transfer \n"
    # Search transfers
    if Transfers.objects.filter(town=selected_city,transfer_date=selected_date_object,departure_time__gte=band_from_time, departure_time__lte=band_to_time).exists():
        transfers = Transfers.objects.filter(town=selected_city,transfer_date=selected_date_object).all()
        print("TF",transfers)
        print("Iko trip")
        for index, val in enumerate(transfers):      
            response +=f"{str(index+1)}.{val.entity.title}-{val.departure_time} -KES {val.transfer_fare} \n"

    else:
        response = "END No transfers found \n"
        print("Hakuna trip") 

  
    return response

def transfers_7(splitted,msisdn):
    response = "CON Enter passenger names and ID or passport separated by comma"
    return response

def transfers_8(splitted,msisdn):
    payment_method= None
    selected_transfer = None
    selected_city_index = int(splitted[1])-1
    selected_city = get_selected_city_by_index(selected_city_index)
    print("selected city", selected_city)

    # Origin transfer points
    selected_origin_transfer_point_index =int(splitted[1])-1

    origin_transfer_point = get_origin_transfer_point(selected_origin_transfer_point_index, selected_city)
    print ("origin at 6", origin_transfer_point)

    # Destination transfer points
    destination_transfer_points = get_destination_transfer_points(origin_transfer_point,selected_city)
    print("destination transfer points at 6", destination_transfer_points)

    selected_destination_transfer_point_index =int(splitted[1])-1
    destination_transfer_point = destination_transfer_points[selected_destination_transfer_point_index]
    print ("destination at 6", destination_transfer_point)

    # Selected date
    dates_to_list =  generate_dates_list()
    selected_date_index = int(splitted[4])-1
    selected_date = dates_to_list[selected_date_index]
    print("selected date", selected_date)

    selected_date_object = datetime.strptime(selected_date, '%Y-%m-%d').date()
    print("selected date object", selected_date_object)

    # Selected time
    times = generate_departure_time_intervals()
    selected_time_index = int(splitted[5])-1
    selected_time = times[selected_time_index]
    print("selected time", selected_time)
    splited_time = selected_time.split("-")
    print("splitted time", splited_time)

    band_from_time  = datetime.strptime(splited_time[0], '%H:%M').time()
    print("band_from_time",band_from_time)

    band_to_time  = datetime.strptime(splited_time[1], '%H:%M').time()
    print("band_to_time",band_to_time)
   
    # Search transfers
    selected_transfer_index = int(splitted[6])-1
    if Transfers.objects.filter(town=selected_city,transfer_date=selected_date_object,departure_time__gte=band_from_time, departure_time__lte=band_to_time).exists():
        transfers = Transfers.objects.filter(town=selected_city,transfer_date=selected_date_object).all()
        print("TF",transfers)
        print("Iko trip")
        selected_transfer = transfers[selected_transfer_index]
        print("selected transfer", selected_transfer)
        # for index, val in enumerate(transfers):      
        #     response +=f"{str(index+1)}.{val.entity.title}-{val.departure_time}\n"
    telco, phone_number = get_telco_by_phone_number(msisdn)
    print("telco", telco)
    passenger_details = splitted[7]
    response = f"END {selected_transfer} \n"
    splited_details = passenger_details.split(",")
    response += f"Book for {splited_details[0]} {splited_details[1]} - {splited_details[2]} initiated"
    response +="Please enter pin when prompted to complete"
    if PaymentMethods.objects.filter(title="MOBILE MONEY").exists():
         payment_method =PaymentMethods.objects.filter(title="MOBILE MONEY").first()
    payload = {
            "action":"CreateTransferBooking",
            "transfer_booking_details":{
                "transfer":selected_transfer.id,
                "first_name": splited_details[0],
                "last_name":splited_details[1],
                "identifier_number":splited_details[2],
                "identifier_type":"",
                "payment_method": payment_method.id,
                "mobile_money_phone":msisdn
                
            }
  
        }
    result =create_transfer_booking(payload, selected_transfer.owner)
    print("result", result)
    return response




