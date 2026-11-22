# payments/utils/collection.py
#
# THE rule for money on WaziPOS: every pay-in (STK push, wallet checkout, card)
# lands in ONE JamboPay account — WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT — and
# leaves it only as a JamboPay payout to the payee's verified payout account
# (payments.PayoutAccounts for businesses, payments.UserPayoutAccounts for
# people), through the payout ledger (payments/utils/order_payouts.py).
# Never send a buyer's money to a seller's wallet, a till of their own, or any
# other account directly.

from decouple import config
from django.core.exceptions import ImproperlyConfigured


def collection_account():
    """The WaziPOS JamboPay collection account every pay-in goes to."""
    account = str(config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT", default="") or "").strip()
    if not account:
        raise ImproperlyConfigured("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT is not set")
    return account


def jambopay_callback_url():
    """
    Where JamboPay posts payment / payout results: our own endpoint
    (payments/views.py jambopayCallbackAPIView), never a third-party test site.
    Override with JAMBOPAY_CALLBACK_URL; otherwise built from API_URL.
    Payment status is still confirmed by asking JamboPay (fetch_transaction).
    """
    explicit = str(config("JAMBOPAY_CALLBACK_URL", default="") or "").strip()
    if explicit:
        return explicit
    base = str(config("API_URL", default="https://api.wazipos.co.ke") or "").rstrip("/")
    return f"{base}/api/v1/payments/jambopay/callback"
