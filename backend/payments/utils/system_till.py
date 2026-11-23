from payments.utils.collection import jambopay_callback_url  # JamboPay callbacks: our own endpoint
# payments/utils/system_till.py
#
# Collect mobile money into the WaziPOS JamboPay collection account
# (WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT, payments/utils/collection.py) — every
# pay-in on the platform lands there:
#   1. STK push with accountTo = the collection account, orderId = our reference;
#   2. a PENDING payment row is stored and the client follows it on a
#      status WebSocket that polls JamboPay every few seconds;
#   3. a Celery task reconciles anything the socket missed and expires stale
#      PENDING payments.
# Money owed to anyone (sellers, riders, couriers, agents, staff...) is then paid
# out from the collection account to their payout account through the payout
# ledger (payments/utils/order_payouts.py) — never transferred wallet to wallet.

import json

import requests
from decouple import config

from core.phone_number_utils import get_telco_by_phone_number
from utils.logging import create_log

# Payments left PENDING longer than this are treated as abandoned.
PENDING_TIMEOUT_MINUTES = 30

_CALLBACK_URLS = {
    "MPESA": jambopay_callback_url(),
    "AIRTELMONEY": jambopay_callback_url(),
}


# ---------------------------------------------------------------- JamboPay token (cached)
#
# One JamboPay sign-in serves every caller until shortly before it expires, instead
# of a sign-in per request / poll / payout. Shared by all processes (gunicorn,
# Daphne, Celery) through Redis; an in-process copy covers Redis being down.
# Callers that get HTTP 401 call invalidate_jambopay_token() and ask again.

import threading
import time

_TOKEN_KEY = "wazipos:jambopay:token"
_TOKEN_MARGIN = 120          # renew this many seconds before JamboPay's expiry
_TOKEN_DEFAULT_TTL = 25 * 60  # when JamboPay doesn't say how long it lasts
_token_lock = threading.Lock()
_local = {"token": None, "until": 0.0}
_redis_client = None


def _redis():
    """The Redis already used by Celery / Channels, or None."""
    global _redis_client
    if _redis_client is None:
        try:
            import redis

            url = config("JAMBOPAY_TOKEN_REDIS_URL", default=config("CELERY_BROKER_URL", default="redis://127.0.0.1:6379/0"))
            _redis_client = redis.Redis.from_url(url, socket_timeout=2, socket_connect_timeout=2)
        except Exception:
            _redis_client = False
    return _redis_client or None


def _cached_token():
    now = time.time()
    if _local["token"] and _local["until"] > now:
        return _local["token"]
    r = _redis()
    if r is not None:
        try:
            raw = r.get(_TOKEN_KEY)
            ttl = r.ttl(_TOKEN_KEY)
            if raw:
                token = raw.decode() if isinstance(raw, bytes) else str(raw)
                _local["token"], _local["until"] = token, now + max(30, ttl if ttl and ttl > 0 else 60)
                return token
        except Exception:
            pass
    return None


def _store_token(token, expires_in):
    try:
        life = int(expires_in) if expires_in else _TOKEN_DEFAULT_TTL
    except (TypeError, ValueError):
        life = _TOKEN_DEFAULT_TTL
    ttl = max(60, life - _TOKEN_MARGIN)
    _local["token"], _local["until"] = token, time.time() + ttl
    r = _redis()
    if r is not None:
        try:
            r.set(_TOKEN_KEY, token, ex=ttl)
        except Exception:
            pass


def invalidate_jambopay_token():
    """JamboPay rejected the token (HTTP 401): forget it everywhere."""
    _local["token"], _local["until"] = None, 0.0
    r = _redis()
    if r is not None:
        try:
            r.delete(_TOKEN_KEY)
        except Exception:
            pass


def get_jambopay_token(force=False):
    """Returns (error, token). Cached; signs in to JamboPay only when needed."""
    if not force:
        token = _cached_token()
        if token:
            return None, token
    with _token_lock:
        if not force:
            token = _cached_token()  # another thread may have just signed in
            if token:
                return None, token
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
            body = res.json() or {}
            token = body.get("access_token")
        except Exception as e:
            return f"JamboPay sign-in failed: {e}", None
        if not token:
            return "JamboPay did not issue a token", None
        _store_token(token, body.get("expires_in"))
        return None, token


def jambopay_token_or_none(context=""):
    """The cached token, or None (logged) — for code that only needs the token."""
    error, token = get_jambopay_token()
    if error:
        create_log("error", f"{context + ': ' if context else ''}{error}")
    return token


def push_to_system_till(order_id, amount, phone, description="TOPUP"):
    """
    STK push of `amount` from `phone` into the WaziPOS collection account.
    Returns (errors, result_json, telco); result_json carries JamboPay's "ref".
    """
    from payments.utils.collection import collection_account

    try:
        system_till = collection_account()
    except Exception as e:
        return [str(e)], None, None
    return push_to_account(system_till, order_id, amount, phone, description)


def push_to_account(account_to, order_id, amount, phone, description="TOPUP"):
    """
    STK push of `amount` from `phone` straight into `account_to` (a JamboPay wallet).
    Used where money must not pass through WaziPOS, e.g. loan repayments that go
    directly to the lender's own wallet. Same return shape as push_to_system_till.
    """
    system_till = str(account_to or "").strip()
    if not system_till:
        return ["No account to pay into"], None, None

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
        if res.status_code == 401:
            # Token expired early / revoked: sign in again once.
            invalidate_jambopay_token()
            error, token = get_jambopay_token(force=True)
            if error:
                create_log("error", error)
                return None
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
