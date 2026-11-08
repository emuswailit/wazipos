"""
JamboPay Swift SMS provider client.

This is the low-level transport only. Application code must NOT import from here:
use core.utils.send_sms / send_bulk_sms, which normalise phone numbers,
log, and call into this module.
"""

import requests
from decouple import config
from django.core.cache import cache

from utils.logging import create_log

SWIFT_TIMEOUT_SECONDS = 20
_TOKEN_CACHE_KEY = "jambopay-swift:access-token"
_DEFAULT_TOKEN_TTL_SECONDS = 5 * 60


def _fetch_token():
    """Request a new access token. Returns (errors, token)."""
    try:
        res = requests.post(
            config("JAMBOPAY_SWIFT_AUTH_URL"),
            data={
                "client_id": config("JAMBOPAY_SWIFT_CLIENT_ID"),
                "client_secret": config("JAMBOPAY_SWIFT_CLIENT_SECRET"),
                "grant_type": config("JAMBOPAY_SWIFT_GRANT_TYPE"),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=SWIFT_TIMEOUT_SECONDS,
        )
        body = res.json() or {}
    except Exception as e:
        return [f"SMS provider authentication failed: {e}"], None

    token = body.get("access_token") if isinstance(body, dict) else None
    if not token:
        return ["SMS provider did not return an access token"], None

    try:
        ttl = int(body.get("expires_in") or _DEFAULT_TOKEN_TTL_SECONDS) - 60
    except (TypeError, ValueError):
        ttl = _DEFAULT_TOKEN_TTL_SECONDS
    cache.set(_TOKEN_CACHE_KEY, token, max(ttl, 30))
    return [], token


def get_swift_auth_token(force_refresh=False):
    """Cached access token. Returns (errors, token)."""
    if not force_refresh:
        token = cache.get(_TOKEN_CACHE_KEY)
        if token:
            return [], token
    return _fetch_token()


def _parse_response(res):
    """
    Interpret a Swift send response. Returns (errors, result_json).

    Success looks like {"message_id": ..., "telco": ...}. Validation failures come
    back as {"message": ["...", ...]}; "Queued to the service" is treated as success.
    """
    try:
        body = res.json()
    except Exception:
        return [f"SMS provider returned a non-JSON response (HTTP {res.status_code})"], None
    if not body:
        return ["SMS provider returned an empty response"], None
    if not isinstance(body, dict):
        if res.status_code < 400:
            return [], body
        return [f"SMS provider error (HTTP {res.status_code})"], None

    if body.get("message_id"):
        return [], body

    msg = body.get("message")
    messages = [str(m) for m in msg] if isinstance(msg, list) else ([str(msg)] if msg else [])
    if messages and all("queued" in m.lower() for m in messages):
        return [], body
    if res.status_code >= 400 or messages:
        return messages or [f"SMS provider error (HTTP {res.status_code})"], None
    return [], body


def send_swift_sms(contact, message, callback=None):
    """
    Send one SMS to an already-normalised phone number (2547XXXXXXXX).
    Returns (errors, result_json): errors is a list of strings, empty on success.
    """
    errors, token = get_swift_auth_token()
    if errors:
        return errors, None

    payload = {
        "contact": contact,
        "message": message,
        "callback": callback or config("JAMBOPAY_SWIFT_CALLBACK_URL", default=""),
        "sender_name": config("JAMBOPAY_SWIFT_SENDER_NAME"),
    }

    for attempt in range(2):
        try:
            res = requests.post(
                config("JAMBOPAY_SWIFT_SMS_URL"),
                data=payload,
                headers={"Authorization": "Bearer " + token},
                timeout=SWIFT_TIMEOUT_SECONDS,
            )
        except Exception as e:
            return [f"SMS could not be sent: {e}"], None

        # A cached token may have been revoked or expired early: refresh once and retry.
        if res.status_code == 401 and attempt == 0:
            errors, token = get_swift_auth_token(force_refresh=True)
            if errors:
                return errors, None
            continue
        break

    errors, result = _parse_response(res)
    if errors:
        create_log("error", f"Swift SMS to {contact} failed: {errors}")
    return errors, result
