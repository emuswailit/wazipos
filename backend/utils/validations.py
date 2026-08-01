import datetime
from rest_framework import exceptions


def start_and_end_date_validated(start_date, end_date):
    if start_date == None:
        raise exceptions.ValidationError("Enter start date")
    elif end_date == None:
        raise exceptions.ValidationError("Enter end date")

    elif start_date < datetime.datetime.now().date():

        raise exceptions.ValidationError(
            "Start date must be today or a future date")
    elif end_date < datetime.datetime.now().date():
        raise exceptions.ValidationError(
            "End date must be  a future date")
    elif end_date < start_date:
        raise exceptions.ValidationError(
            "End date must be after start date")

    else:
        print("Now date", datetime.datetime.now().date())
        return True


def manufacture_and_expiry_dates_validated(manufacture_date, expiry_date):
    if manufacture_date == None:
        raise exceptions.ValidationError("Enter manufacture date")
    elif expiry_date == None:
        raise exceptions.ValidationError("Enter expiry date")

    elif manufacture_date > datetime.datetime.now().date():
        raise exceptions.ValidationError(
            "Manufacture date cannot be a future date")
    elif expiry_date < datetime.datetime.now().date():
        raise exceptions.ValidationError(
            "Expiry date cannot be  a past date")
    elif expiry_date < manufacture_date:
        raise exceptions.ValidationError(
            "Expiry date must be after manufacture date")

    else:

        return True
