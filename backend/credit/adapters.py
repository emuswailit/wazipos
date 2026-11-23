# credit/adapters.py — how WaziPOS Credit pays each kind of order.
#
# A loan pays an order by booking a SUCCESS payment on it (method MOBILE MONEY,
# reference = the loan reference, telco WAZIPOS_CREDIT) through the same code that
# books a real mobile-money payment. So the order is marked paid, stock moves, the
# fulfilment opens, and the seller is paid onward by the payout ledger exactly as for
# an M-Pesa payment — from the lender's float, which sits in the collection account.
#
#   kind         order model                      buyer                 seller
#   retailer     wholesalers.RetailerOrders        retailer (entity)     wholesaler
#   wholesaler   distributors.WholesalerOrders     wholesaler (entity)   distributor
#   customer     retailers.CustomerOrders          customer (user)       entity (the shop)
#   food         restaurants.FoodOrder             customer (user)       entity (restaurant)

from decimal import Decimal

from django.apps import apps
from django.db import transaction
from django.db.models import Sum

MODELS = {
    "retailer": "wholesalers.RetailerOrders",
    "wholesaler": "distributors.WholesalerOrders",
    "customer": "retailers.CustomerOrders",
    "food": "restaurants.FoodOrder",
}
SEGMENT = {"retailer": "RETAILER_B2B", "wholesaler": "WHOLESALER_B2B", "customer": "CUSTOMER", "food": "FOOD"}
CLOSED = {"CANCELLED", "REJECTED", "VOIDED"}


class AdapterError(Exception):
    pass


def get_order(kind, order_id):
    model = MODELS.get(kind)
    if not model:
        raise AdapterError("Unknown order type")
    order = apps.get_model(model).objects.filter(pk=order_id).first()
    if not order:
        raise AdapterError("That order doesn't exist")
    if str(getattr(order, "status", "") or "").upper() in CLOSED:
        raise AdapterError("This order is closed")
    return order


def _mm_method():
    from payments.models import PaymentMethods

    return PaymentMethods.objects.filter(title__iexact="MOBILE MONEY").first()


def amount_due(kind, order):
    if kind == "retailer":
        from wholesalers.services.retailer_order_payments import amount_due as due

        return Decimal(str(due(order)))
    if kind == "wholesaler":
        from distributors.services.payments import amount_due as due

        return Decimal(str(due(order)))
    if kind == "food":
        from restaurants.services.dining import amount_due as due

        return Decimal(str(due(order)))
    if kind == "customer":
        from retailers.models import CustomerOrderPayment

        paid = CustomerOrderPayment.objects.filter(customer_order=order, status="SUCCESS").aggregate(t=Sum("amount"))["t"] or Decimal("0")
        owed = Decimal(str(order.order_net_price_total or 0))
        return max(Decimal("0"), owed - Decimal(str(paid)))
    raise AdapterError("Unknown order type")


def buyer(kind, order):
    """(user, entity) who owes: businesses borrow as their entity; people as themselves."""
    if kind == "retailer":
        return None, order.retailer
    if kind == "wholesaler":
        return None, order.wholesaler
    return getattr(order, "customer", None), None


def buyer_phone(kind, order):
    """Where a consent code goes when the seller's staff offer credit (walk-in customers)."""
    if kind == "customer":
        return getattr(order, "customer_phone", None) or getattr(order, "recipient_phone", None)
    if kind == "food":
        return getattr(order, "customer_phone", None)
    return None


def seller(kind, order):
    if kind == "retailer":
        return order.wholesaler
    if kind == "wholesaler":
        return order.distributor
    return order.entity


def reference(order):
    return str(getattr(order, "reference_number", None) or getattr(order, "order_number", None) or getattr(order, "reference", None) or str(order.pk)[:8].upper())[:64]


def settle(kind, order, facility, user):
    """Book the lender's payment on the order (call inside the loan's transaction)."""
    amount = facility.principal
    ref = facility.reference
    note = f"WaziPOS Credit - {facility.lender.display_name}"[:120]
    method = _mm_method()

    if kind == "retailer":
        from wholesalers.models import RetailerOrderPayments
        from wholesalers.services import retailer_order_payments as rop

        payment = RetailerOrderPayments.objects.create(
            retailer_order=order, payment_method=method, pay_in_reference_number=ref, psp_reference_number=ref,
            status="SUCCESS", description=note, amount=amount, entity=order.retailer, currency="KES", telco="WAZIPOS_CREDIT",
            owner=user, is_paid="false", is_settled="false",
        )
        rop._complete(payment)
        if hasattr(order, "facilitator_id"):
            order.facilitator = facility.lender.entity  # the field this order type kept for its financier
            order.save(update_fields=["facilitator", "updated"])
        transaction.on_commit(lambda: rop.broadcast_order(order))
        return payment

    if kind == "wholesaler":
        from distributors.models import DistributorPayments
        from distributors.services import payments as dp

        payment = DistributorPayments.objects.create(
            entity=order.wholesaler, owner=user, distributor=order.distributor, wholesaler_order=order,
            payment_method=method, pay_in_reference_number=ref, reference=ref, psp_reference_number=ref,
            status="SUCCESS", description=note, amount=amount, telco="WAZIPOS_CREDIT", currency="KES",
            is_paid=True, is_settled=False, payout_account=dp._active_payout_account(order.distributor), payout_amount=amount,
        )
        dp._covered(order)
        return payment

    if kind == "customer":
        from retailers.models import CustomerOrderPayment
        from retailers.utils.inventory_utils import update_stock
        from retailers.utils.retailer_utils import recompute_order_payment_state

        payment = CustomerOrderPayment.objects.create(
            customer_order=order, payment_method=method, reference_number=ref, psp_reference_number=ref, provider_reference_number=ref,
            description=note, telco="WAZIPOS_CREDIT", currency="KES", status="SUCCESS", amount=amount,
            receiving_entity=order.entity, owner=user, is_validated=False,
        )
        if recompute_order_payment_state(order):
            update_stock(order)
        return payment

    if kind == "food":
        from restaurants.models import FoodOrderPayment
        from restaurants.services.dining import _mark_paid

        payment = FoodOrderPayment.objects.create(
            food_order=order, payment_method=method, reference_number=ref, psp_reference_number=ref, provider_reference_num=ref,
            currency="KES", description=note[:50], desc=note, telco_name="WAZIPOS_CREDIT", status="SUCCESS", amount=amount, owner=user,
        )
        _mark_paid(order)
        return payment

    raise AdapterError("Unknown order type")


def paid_orders_90d(kind, user, entity):
    """Recent paid orders by this buyer — part of the WaziScore."""
    from datetime import timedelta

    from django.utils import timezone

    since = timezone.now() - timedelta(days=90)
    model = apps.get_model(MODELS[kind])
    try:
        if kind == "retailer":
            return model.objects.filter(retailer=entity, is_paid="true", created__gte=since).count()
        if kind == "wholesaler":
            return model.objects.filter(wholesaler=entity, created__gte=since).exclude(status__in=("SUBMITTED", "REJECTED", "CANCELLED")).count()
        return model.objects.filter(customer=user, is_paid="true", created__gte=since).count()
    except Exception:
        return 0
