# intergrations/jambopay/get_jp_token.py — THE JamboPay token for the older integration code.
#
# get_auth_token() returns a bearer token string, or None when JamboPay can't be
# reached. It doesn't sign in by itself: it uses the one cached token from
# payments.utils.system_till.get_jambopay_token (shared by gunicorn, Daphne and
# Celery through Redis, renewed shortly before it expires), so the many callers in
# jambopay_wallet.py, jp_mobile_money_checkout.py, retailers/tasks.py … don't each
# sign in to JamboPay.
#
# After a 401 from JamboPay, call invalidate_auth_token() and ask again.
# Never call it at import time (no network calls while Django is loading).


def get_auth_token():
    """Cached JamboPay bearer token (str), or None."""
    from payments.utils.system_till import get_jambopay_token  # lazy: no import cycles

    error, token = get_jambopay_token()
    if error:
        try:
            from utils.logging import create_log

            create_log("error", f"JamboPay token: {error}")
        except Exception:
            pass
        return None
    return token


def invalidate_auth_token():
    """JamboPay rejected the token (HTTP 401): the next get_auth_token() signs in again."""
    from payments.utils.system_till import invalidate_jambopay_token

    invalidate_jambopay_token()
