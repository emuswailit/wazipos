# payments/utils/system_till.py
#
# Collect mobile money into the central WaziPOS till (WAZIPOS_SYSTEM_TILL),
# the pattern subscriptions use (subscriptions/views.py InitiateSubscriptionPayment):
#   1. STK push with accountTo = the system till, orderId = our reference;
#   2. a PENDING payment row is stored and the client follows it on a
#      status WebSocket that polls JamboPay every few seconds;
#   3. a Celery task reconciles anything the socket missed and expires stale
#      PENDING payments.
# Money owed to a third party (e.g. a wholesaler) is then paid out from the
# till to that party's active PayoutAccount.

import json

import requests
from decouple import config

from core.phone_number_utils import get_telco_by_phone_number
from utils.logging import create_log

# Payments left PENDING longer than this are treated as abandoned.
PENDING_TIMEOUT_MINUTES = 30

_CALLBACK_URLS = {
    "MPESA": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
    "AIRTELMONEY": "https://webhook.site/55963e0b-b692-42b6-a682-0223eaf7fbff",
}


def get_jambopay_token():
    """Returns (error, token)."""
    try:
        res = requests.post(
            config("JAMBOPAY_AUTH_URL1"),
            data={
                "client_id": config("JAMBOPAY_CLIENT_ID"),
                "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
                "grant_type": config("JAMBOPA_GRANT_TYPE"),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=20,
        )
        token = (res.json() or {}).get("access_token")
    except Exception as e:
        return f"JamboPay sign-in failed: {e}", None
    if not token:
        return "JamboPay did not issue a token", None
    return None, token


def push_to_system_till(order_id, amount, phone, description="TOPUP"):
    """
    STK push of `amount` from `phone` into the system till.
    Returns (errors, result_json, telco); result_json carries JamboPay's "ref".
    """
    system_till = config("WAZIPOS_SYSTEM_TILL", default=None)
    if not system_till:
        return ["System till number is not configured"], None, None

    try:
        telco, formatted_phone = get_telco_by_phone_number(phone)
    except Exception as e:
        return [f"Invalid phone number: {e}"], None, None

    base = {
        "orderId": order_id,
        "callBackUrl": _CALLBACK_URLS.get(telco, _CALLBACK_URLS["MPESA"]),
        "accountTo": system_till,
        "description": description,
        "modeOfPayment": "MOBILE_MONEY",
        "data": {"phoneNumber": formatted_phone, "serviceType": "TOPUP"},
    }
    if telco == "MPESA":
        payload = {**base, "amount": int(amount), "provider": "Mpesa"}
    elif telco == "AIRTELMONEY":
        payload = {**base, "amount": str(int(amount)), "provider": "AIRTELMONEY", "currency": "KES"}
    else:
        return [f"Unsupported mobile network: {telco}"], None, telco

    error, token = get_jambopay_token()
    if error:
        return [error], None, telco

    try:
        res = requests.post(
            config("JAMBOPAY_BASE_URL") + "/checkout/express",
            data=json.dumps(payload),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "Accept": "*/*"},
            timeout=30,
        )
        result_json = res.json()
        create_log("info", f"System till push {order_id}: {result_json}")
    except Exception as e:
        return [f"JamboPay checkout failed: {e}"], None, telco

    if not result_json or "ref" not in result_json:
        message = (result_json or {}).get("message") if isinstance(result_json, dict) else None
        return [message or "Payment request was not accepted by JamboPay"], None, telco
    return [], result_json, telco


def fetch_transaction(order_id, token=None):
    """
    Current JamboPay state of a payment pushed with `order_id`.
    Returns a dict with at least "status" (upper-case), or None.
    """
    if token is None:
        error, token = get_jambopay_token()
        if error:
            create_log("error", error)
            return None
    try:
        res = requests.get(
            config("JAMBOPAY_BASE_URL") + f"/wallet/transaction/{order_id}",
            headers={"Authorization": f"Bearer {token}", "Accept": "*/*"},
            timeout=20,
        )
        if res.status_code != 200:
            return None
        data = res.json() or {}
    except Exception as e:
        create_log("error", f"JamboPay status check failed for {order_id}: {e}")
        return None
    data["status"] = str(data.get("status", "")).upper()
    return data
