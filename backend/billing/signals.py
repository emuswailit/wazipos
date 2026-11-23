# billing/signals.py — meter WaziPOS Tokens from successful order payments.
#
# Wired to the payment models (orders are paid from many code paths: tills,
# mobile money callbacks, reconcilers, credit). When a payment turns SUCCESS
# the SELLING business is charged for that order (billing.services.meter),
# after the transaction commits and never inside the payment flow's errors.
#
#   retailers.CustomerOrderPayment      shop / pharmacy sales    RETAIL_SALE
#   restaurants.FoodOrderPayment        restaurant / hotel food  FOOD_ORDER
#   restaurants.RoomBookingPayment      hotel stays              ROOM_STAY
#   wholesalers.RetailerOrderPayments   wholesaler -> retailer   WHOLESALE_SALE
#   distributors.DistributorPayments    distributor -> wholesaler DISTRIBUTOR_SALE
#   manufacturers.ManufacturerOrderPayments  manufacturer -> distributor MANUFACTURER_SALE

import logging

from django.db import transaction
from django.db.models.signals import post_save, pre_save

log = logging.getLogger(__name__)

# label: (meter, order attr on payment, seller attr on order)
WATCHED = {
    "retailers.CustomerOrderPayment": ("RETAIL_SALE", "customer_order", "entity"),
    "restaurants.FoodOrderPayment": ("FOOD_ORDER", "food_order", "entity"),
    "restaurants.RoomBookingPayment": ("ROOM_STAY", "booking", "entity"),
    "wholesalers.RetailerOrderPayments": ("WHOLESALE_SALE", "retailer_order", "wholesaler"),
    "distributors.DistributorPayments": ("DISTRIBUTOR_SALE", "wholesaler_order", "distributor"),
    "manufacturers.ManufacturerOrderPayments": ("MANUFACTURER_SALE", "order", "manufacturer"),
}


def _remember(sender, instance, **kwargs):
    if instance.pk:
        instance._bill_old_status = sender.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    else:
        instance._bill_old_status = None


def _paid(sender, instance, created, **kwargs):
    now = str(getattr(instance, "status", "") or "").upper()
    before = str(getattr(instance, "_bill_old_status", "") or "").upper()
    if now != "SUCCESS" or (not created and before == "SUCCESS"):
        return
    label = sender._meta.label
    meter_code, order_attr, seller_attr = WATCHED[label]
    pk = instance.pk

    def run():
        try:
            from billing.services import meter

            p = sender.objects.filter(pk=pk).first()
            order = getattr(p, order_attr, None) if p else None
            if not order:
                return
            seller = getattr(order, seller_attr, None) or getattr(p, "receiving_entity", None) or getattr(p, "entity", None)
            # A hotel's food orders are billed as food; its own entity type decides nothing here.
            meter(seller, meter_code, getattr(p, "amount", 0) or 0, f"{label}:{pk}", order_ref=str(order.pk))
        except Exception as e:  # never break a payment
            log.exception("token metering failed for %s %s", label, pk)
            try:
                from utils.logging import create_log

                create_log("error", f"Token metering failed for {label} {pk}: {e}")
            except Exception:
                pass

    transaction.on_commit(run)


def connect():
    from django.apps import apps

    for label in WATCHED:
        try:
            m = apps.get_model(label)
        except LookupError:
            continue
        pre_save.connect(_remember, sender=m, dispatch_uid=f"bill-status-{label}")
        post_save.connect(_paid, sender=m, dispatch_uid=f"bill-{label}")
