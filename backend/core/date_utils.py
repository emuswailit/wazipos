from django.utils.dateparse import parse_datetime
from django.utils import timezone
from datetime import date, datetime, timedelta
import calendar
from dateutil.relativedelta import relativedelta
import dateutil.parser

# def get_formatted_from_date(data=None):
#     formatted_from_date = parse_datetime(str(timezone.now().date())).strftime(
#             "%Y-%m-%d %H:%M:%S"
#         )
    
#     if data and "from_date" in data:
#         print("Data here", data)
#         formatted_from_date = parse_datetime(data["from_date"]).strftime(
#             "%Y-%m-%d %H:%M:%S"
#         )
#     else:
#         print("No data at..")
#     print("formatted_from_date",formatted_from_date)
#     return formatted_from_date

def get_formatted_from_date(data=None):
    formatted_from_date = dateutil.parser.parse(str(timezone.now().date())).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
    
    if data and "from_date" in data:
        print("Data here", data)
        formatted_from_date = dateutil.parser.parse(data["from_date"]).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
    else:
        print("No data at..")
    print("formatted_from_date",formatted_from_date)
    return formatted_from_date

def get_formatted_to_date(data=None):
    
   
    if data and "to_date" in data:
        formatted_to_date = dateutil.parser.parse(data["to_date"] + " 23:59:59").strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        print("formatted_to_date1",formatted_to_date)
    else:
        formatted_to_date = dateutil.parser.parse(str(timezone.now().date())+ " 23:59:59").strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        print("formatted_to_date2",formatted_to_date)
    return formatted_to_date

# def get_formatted_to_date(data=None):
    
   
#     if data and "to_date" in data:
#         formatted_to_date = parse_datetime(data["to_date"] + " 23:59:59").strftime(
#             "%Y-%m-%d %H:%M:%S"
#         )
#         print("formatted_to_date1",formatted_to_date)
#     else:
#         formatted_to_date = parse_datetime(str(timezone.now().date())+ " 23:59:59").strftime(
#             "%Y-%m-%d %H:%M:%S"
#         )
#         print("formatted_to_date2",formatted_to_date)
#     return formatted_to_date


def get_today_date():
    formatted_today_date = parse_datetime(str(timezone.now().date())).strftime(
            "%Y-%m-%d"
        )
    
    return formatted_today_date

def get_date_from_string(date_str):
    date_from_string  = parse_datetime(date_str).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
    
    return date_from_string

def get_beginning_of_month(given_date=None):
    if not given_date:
        given_date = date.today()

    return date(given_date.year, given_date.month,1)


def get_first_and_last_days_of_month(given_date):
   
    first_day, days_count = calendar.monthrange(given_date.year, given_date.month)
    first_day = given_date + relativedelta(day=1)
    last_day = given_date + relativedelta(day=days_count)
    print("first", first_day.date())
    print("last", last_day.date())
    print("days", days_count)

    return first_day.date(), last_day.date(), days_count

def date_is_past(input_date):
    try:
        date = datetime.strptime(input_date, '%Y-%m-%d')
    except ValueError as msg:
        print(msg)
    else:
        return  date.date() < datetime.now().date()
    
def date_input_is_today(input_date):
    print("today",datetime.today())
    try:
        date = datetime.strptime(input_date, '%Y-%m-%d')
    except ValueError as msg:
        print(msg)
    else:
        return  date.date() == datetime.now().date()
    

def time_is_past_for_today(input_time):
    arr = input_time.split(":")
    print("arr", arr)
    try:
        now = datetime.now()
        input_time = now.replace(hour=int(arr[0]), minute=int(arr[1]), second=0, microsecond=0)

    except ValueError as msg:
        print(msg)
    else:
        return  input_time < now
def generate_dates_list():
    number_of_days_bookable =7
    dates_to_list =[]
    today = datetime.today()
    for x in range(number_of_days_bookable):
        this_date = today + timedelta(days = x)
        dates_to_list.append(f"{this_date.date()}")
    return dates_to_list
 
def generate_departure_time_intervals():
    times = []
         # 6 to 9
    band1= "06:00-08:59"
    times.append(band1)
    # Band2

    band2 ="09:00-11:59"
    times.append(band2)

    # Band3
    band3 ="12:00-14:59"
    times.append(band3)

    # band4
    band4 = "15:00-17:59"
    times.append(band4)

    # band5
    band5 = "18:00-20:59"
    times.append(band5)


    # band6
    band6 = "21:00-23:59"
    times.append(band6)

    # band7
    band7 = "00:00-02:59"
    times.append(band7)

    # band8
    band8 = "03:00-05:59"
    times.append(band8)

    return times

def get_first_day_of_current_month():
    first_day_of_the_current_month = timezone.now().replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
    return first_day_of_the_current_month


def get_this_week_from_iso_calendar():
    date = datetime.datetime.today()
    week = date.strftime("%V")
    return week

def get_age_in_years(birth_date):
  
    birthdate = datetime.strptime(birth_date, '%Y-%m-%d').date()
    today = date.today()
    age = relativedelta(today, birthdate).years
    return age


def get_yesterday():
    # Get today's date
    today = date.today()
    print("Today is: ", today)
    
    # Get 2 days earlier
    yesterday = today - timedelta(days = 2)
    return yesterday
def get_tommorow():
    # Get today's date
    today = date.today()
    print("Today is: ", today)
    
    # Get tommorow
    tommorow = today + timedelta(days = 1)
    return tommorow


def get_today():
    # Get today's date
    today = date.today()
    print("Today is: ", today)
    

    return today

