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

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from core.phone_number_utils import get_telco_by_phone_number
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms
from utils.logging import create_log

# NOTE: numpy / pandas / scikit-learn / ORM imports that used to sit here were never
# used in this module. They were removed because every app now imports core.utils
# for messaging, and pandas / scikit-learn aren't in requirements.txt.


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


# =========================================================
# General Helpers
# =========================================================

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


# =========================================================
# 🌟 NEW FUNCTION: Password Generation & Notifications
# =========================================================

def generate_and_send_user_credentials(user, action="created"):
    """
    Generates a random password for a user, saves it, 
    and sends the credentials via Email and SMS.
    Returns (password, errors_list).
    """
    errors = []
    password = generate_password()
    user.set_password(password)
    user.save()

    # 1. Send Email
    if user.email:
        if action == "reset":
            email_body = f"Your Wazipos password has been reset. Your new password is {password}. Please do not share your password."
            email_subject = "Wazipos Password Reset"
        else:
            email_body = f"Your Wazipos account has been created. Your password is {password}. Please do not share your password."
            email_subject = "Successful Wazipos Account Creation"

        email_data = {
            "email_body": email_body,
            "to_email": user.email,
            "email_subject": email_subject,
        }
        email_errors, _sent = send_email(email_data)
        errors.extend(f"Email dispatch failed: {e}" for e in email_errors)

    # 2. Send SMS (Optional for reset, but usually good practice)
    if user.phone:
        if action == "reset":
            message = f"Your Wazipos password has been reset. New password: {password}. Do not share."
        else:
            message = f"Wazipos password is {password}. Do not share your password with any other person."
        sms_errors, _sent = send_sms(user.phone, message)
        errors.extend(f"SMS dispatch failed: {e}" for e in sms_errors)

    return password, errors

# =========================================================
# Date & String Validators
# =========================================================

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


# =========================================================
# Token & Reference Generators
# =========================================================

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

# =========================================================
# Messaging: SMS, push notifications and email
#
# The single entry point for outbound messages in this project:
#
#     from core.utils import send_sms, send_bulk_sms, send_push_notification, send_email
#
#     errors, result = send_sms(user.phone, "Your code is 1234")
#     errors, sent = send_email(to=user.email, subject="Welcome", body="...")
#
# Every function returns (errors, result) and never raises, so a provider outage
# can't break the flow that triggered the message; callers decide whether a failed
# send matters. Don't call intergrations.jambopay_swift or django.core.mail directly.
# =========================================================

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
PUSH_TIMEOUT_SECONDS = 15
MAX_SMS_LENGTH = 918  # 6 concatenated GSM-7 parts


def normalize_phone(phone):
    """
    Convert a Kenyan phone number to 2547XXXXXXXX / 2541XXXXXXXX.

    Accepts '0712 345 678', '+254712345678', '254712345678' and '712345678'.
    Returns None if the number can't be understood.
    """
    if phone is None:
        return None
    digits = re.sub(r"\D", "", str(phone))
    if digits.startswith("254") and len(digits) == 12:
        number = digits
    elif digits.startswith("0") and len(digits) == 10:
        number = "254" + digits[1:]
    elif len(digits) == 9 and digits[0] in "17":
        number = "254" + digits
    else:
        return None
    return number if number[3] in "17" else None


def send_sms(phone, message, callback=None):
    """
    Send one SMS. Returns (errors, result); errors is empty on success and result
    holds the provider response (message_id, telco, ...).
    """
    number = normalize_phone(phone)
    if not number:
        return [f"Invalid phone number: {phone}"], None
    message = (message or "").strip()
    if not message:
        return ["SMS message is empty"], None
    if len(message) > MAX_SMS_LENGTH:
        return [f"SMS message is too long ({len(message)} characters, max {MAX_SMS_LENGTH})"], None

    try:
        errors, result = send_swift_sms(number, message, callback)
    except Exception as e:  # never let a provider bug break the caller
        errors, result = [f"SMS could not be sent: {e}"], None

    if errors:
        create_log("error", f"SMS to {number} failed: {errors}")
        return errors, None
    create_log("info", f"SMS sent to {number}")
    return [], result


def send_bulk_sms(phones, message, callback=None):
    """
    Send the same SMS to several numbers (duplicates are sent once).
    Returns (errors, results): errors are prefixed with the number they belong to;
    results maps each successfully sent number to the provider response.
    """
    errors, results, seen = [], {}, set()
    for phone in phones or []:
        number = normalize_phone(phone) or phone
        if number in seen:
            continue
        seen.add(number)
        errs, result = send_sms(number, message, callback)
        if errs:
            errors.extend(f"{phone}: {e}" for e in errs)
        else:
            results[number] = result
    return errors, results


def send_push_notification(expo_token, title, body, data=None):
    """Send an Expo push notification. Returns (errors, result)."""
    if not expo_token:
        return ["Push token is missing"], None
    payload = {"to": expo_token, "title": title, "body": body}
    if data:
        payload["data"] = data
    try:
        res = requests.post(EXPO_PUSH_URL, json=payload, timeout=PUSH_TIMEOUT_SECONDS)
        result = res.json()
    except Exception as e:
        create_log("error", f"Push notification failed: {e}")
        return [f"Push notification could not be sent: {e}"], None
    if res.status_code >= 400 or (isinstance(result, dict) and result.get("errors")):
        create_log("error", f"Push notification rejected: {result}")
        return [f"Push notification rejected (HTTP {res.status_code})"], None
    return [], result


def _from_address():
    sender = getattr(settings, "DEFAULT_FROM_EMAIL", "") or ""
    if "@" not in sender:  # e.g. DEFAULT_FROM_EMAIL set to the SMTP host name
        sender = getattr(settings, "EMAIL_HOST_USER", "") or sender
    return sender or None


def send_email(data=None, *, to=None, subject=None, body=None, html_body=None,
               cc=None, bcc=None, reply_to=None, attachments=None):
    """
    Send one email. `to` may be a single address or a list.
    `attachments` is a list of (filename, content, mimetype) tuples.
    The legacy dict form still works:
        send_email({"to_email": ..., "email_subject": ..., "email_body": ...})
    Returns (errors, sent).
    """
    if data:
        to = to or data.get("to_email")
        subject = subject or data.get("email_subject")
        body = body or data.get("email_body")
        html_body = html_body or data.get("email_html")

    recipients = [to] if isinstance(to, str) else [a for a in (to or []) if a]
    recipients = [a.strip() for a in recipients if a and a.strip()]
    if not recipients:
        return ["Email recipient is required"], False
    if not subject:
        return ["Email subject is required"], False

    try:
        email = EmailMultiAlternatives(
            subject=subject,
            body=body or "",
            from_email=_from_address(),
            to=recipients,
            cc=cc,
            bcc=bcc,
            reply_to=[reply_to] if isinstance(reply_to, str) else reply_to,
        )
        if html_body:
            email.attach_alternative(html_body, "text/html")
        for attachment in attachments or []:
            email.attach(*attachment)
        email.send()
    except Exception as e:
        create_log("error", f"Email '{subject}' to {recipients} failed: {e}")
        return [f"Email could not be sent: {e}"], False

    create_log("info", f"Email '{subject}' sent to {recipients}")
    return [], True
