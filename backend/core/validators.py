import datetime
from rest_framework import exceptions
import datetime
import pytz
from django.core.exceptions import ValidationError
from django.core.validators import validate_email


def date_is_past_now(date):
    yesterday = datetime.datetime.now(datetime
                                      .timezone(datetime
                                                .timedelta(hours=-8))) - datetime.timedelta(days=1)

    date = datetime.datetime.strptime(date, "%Y-%m-%d")
    date = pytz.utc.localize(date)
    #Yesterday and back
    if date <= yesterday:
        return True
    else:
        return False


def end_date_is_after_start_date(start_date="", end_date=""):
    if not start_date:
        raise exceptions.ValidationError('Enter start date')
    if not end_date:
        raise exceptions.ValidationError('Enter end date')
    start_date = datetime.datetime.strptime(start_date, "%Y-%m-%d")
    end_date = datetime.datetime.strptime(end_date, "%Y-%m-%d")
    if end_date > start_date:
        return True
    else:
        raise exceptions.ValidationError('Check your dates')
    



def check_email_validity(email_address):
        print("entered", email_address)
        try:
            email =    validate_email(email_address)
            if email:
                print("is email valid", email)
                return email_address
            else:
                return None
        except ValidationError as e:
            print("At validate emil",e)
            return None
