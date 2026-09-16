import requests
from decouple import config
import re
import random
import string
import datetime
from rest_framework import exceptions



"""
Pure helpers for the inventory prediction pipeline.

No DB access, no async, no Channels. Everything here is a
function of its arguments, which makes it easy to test and
easy to reuse outside the consumer.
"""

import datetime
import decimal
import json
import uuid
from datetime import timedelta
from decimal import Decimal

import numpy as np
import pandas as pd
from django.db import transaction
from django.db.models import Min, Sum
from django.utils import timezone
from sklearn.linear_model import LinearRegression


# =========================================================
# JSON encoder
# =========================================================

class UUIDEncoder(json.JSONEncoder):
    """Encoder for UUID / date / datetime / Decimal."""

    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return str(obj)
        return super().default(obj)



# core/utils.py

from decimal import Decimal, ROUND_HALF_UP


def _q(value, places=2):
    """
    Quantize a value to `places` decimal places using half-up rounding.
    Returns Decimal("0.00") for None or invalid input.
    Used for money/quantity rounding throughout the app.
    """
    if value is None:
        return Decimal("0.00")
    try:
        if not isinstance(value, Decimal):
            value = Decimal(str(value))
    except Exception:
        return Decimal("0.00")
    quantizer = Decimal("1").scaleb(-places)
    return value.quantize(quantizer, rounding=ROUND_HALF_UP)

def random_string_generator(size=10, chars=string.ascii_lowercase + string.digits):
    return "".join(random.choice(chars) for _ in range(size))


def generate_password(size=8, chars=string.ascii_lowercase + string.digits):
    return "".join(random.choice(chars) for _ in range(size))


def date_is_current_or_future(date):
    current_date = datetime.datetime.now()
    print(current_date)
    entered_date = datetime.datetime.strptime(date, "%YYYY-%mm-%dd")
    print(entered_date)
    if current_date > entered_date:
        return False
    else:
        return True


def from_and_to_dates_valid(entered_from, entered_to):
    from_date = datetime.datetime.strptime(entered_from, "%YYYY-%mm-%dd")
    to_date = datetime.datetime.strptime(entered_to, "%YYYY-%mm-%dd")
    if from_date > to_date:
        return False
    else:
        return True


def titlecase(s):
    return re.sub(r"[A-Za-z]+('[A-Za-z]+)?", lambda word: word.group(0).capitalize(), s)


def generate_token():
    token_data = {
        "action": config("TOKEN_ACTION"),
        "consumer_code": config("TOKEN_CONSUMER_CODE"),
        "consumer_key": config("TOKEN_CONSUMER_KEY"),
        "consumer_secret": config("TOKEN_CONSUMER_SECRET"),
    }
    result = requests.post(
        f'{config("TOKEN_URL")}',
        json=token_data,
        headers={"Accept": "application/json", "Api-Key": f'{config("TOKEN_API_KEY")}'},
    )
    result_json = result.json()

    token = result_json["access_token"]
    if token:
        return token
    else:
        raise exceptions.ValidationError("Could not generate token")


def generate_reference_numbers():
    token = generate_token()

    if token:
        token_data = {
            "action": config("REFERENCE_NUMBERS_ACTION"),
            "developer_username": config("REFERENCE_NUMBER_DEVELOPER_USERNAME"),
            "developer_api_key": config("REFERENCE_NUMBER_DEVELOPER_APIKEY"),
            "limit": int(config("REFERENCE_NUMBER_LIMIT")),
        }
        result = requests.put(
            f'{config("REFERENCE_NUMBER_URL")}',
            json=token_data,
            headers={"Accept": "application/json", "Access-Token": f"{token}"},
        )
        result_json = result.json()
        print("refs", result_json["reference_numbers"][0]["name"])
        return result_json["reference_numbers"][0]["name"]

    else:
        raise exceptions.ValidationError("Could not generate token")


# def generate_bulk_reference_numbers(data):
#     token = generate_token()

#     if token:
#         token_data = {
#             "action": config('REFERENCE_NUMBERS_ACTION'),
#             "developer_username": config('REFERENCE_NUMBER_DEVELOPER_USERNAME'),
#             "developer_api_key": config('REFERENCE_NUMBER_DEVELOPER_APIKEY'),
#             "limit": data['limit']
#         }
#         result = requests.put(f'{config("REFERENCE_NUMBER_URL")}', json=token_data,
#                               headers={'Accept': 'application/json', 'Access-Token': f'{token}'})
#         result_json = result.json()

#         return result_json

#     else:
#         raise exceptions.ValidationError('Could not generate token')
