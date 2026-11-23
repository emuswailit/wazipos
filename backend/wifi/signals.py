# wifi/signals.py — push WiFi payment changes live (wifi/payments.broadcast).
#   a payment saved (created, status changed)      -> its live state
#   its payout row saved (DUE / PROCESSING / PAID) -> the payment with payout state
from django.db import transaction
from django.db.models.signals import post_save


def _payment_saved(sender, instance, **kwargs):
    from wifi.payments import broadcast

    pk = instance.pk
    transaction.on_commit(lambda: broadcast(pk))


def _payout_saved(sender, instance, **kwargs):
    if instance.order_kind != "wifi_payment":
        return
    from wifi.payments import broadcast

    pk = instance.order_id
    transaction.on_commit(lambda: broadcast(pk))


def connect():
    from payments.models import OrderPayouts
    from wifi.models import WifiSubscriptionPayments

    post_save.connect(_payment_saved, sender=WifiSubscriptionPayments, dispatch_uid="wifi-payment-live")
    post_save.connect(_payout_saved, sender=OrderPayouts, dispatch_uid="wifi-payout-live")
