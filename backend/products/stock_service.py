# products/stock_service.py
#
# The one place order stock leaves (and comes back to) receipts — whole units
# and parts alike (products/units.py).
#
#   deduct_customer_order(order)  shop sale: RetailerReceipts
#   deduct_retailer_order(order)  wholesale order: WholesalerReceipts
#   restore_customer_order(order) / restore_retailer_order(order)  (cancel)
#
# Each runs once per order: it locks the order row and stamps
# order.stock_deducted_at, so payment callbacks, reconcilers, commits and
# retries can all call it safely without double-deducting.
#
# A sale is never blocked here — payment already happened. If stock records
# say there isn't enough (an earlier miscount), what exists is taken, the
# shortfall is logged, and a stock count fixes the record.

from django.db import transaction
from django.utils import timezone

from products.units import FULL, InsufficientStock, give_back_to_receipt, line_quantity, take_from_receipt
from utils.logging import create_log


def _take_lenient(receipt, sale_unit, qty, context):
    try:
        take_from_receipt(receipt, sale_unit, qty)
    except InsufficientStock as e:
        create_log("error", f"{context}: {e} — taking what's left (receipt {receipt.id})")
        receipt.current_unit_quantity = 0
        if hasattr(receipt, "open_content"):
            receipt.open_content = 0
        receipt.save(update_fields=["current_unit_quantity", "open_content"] if hasattr(receipt, "open_content") else ["current_unit_quantity"])


def _locked(model, pk):
    return model.objects.select_for_update().get(pk=pk)


def deduct_customer_order(order):
    """Take a shop sale's lines off the shop's receipts (once). Returns True if it ran now."""
    from retailers.models import CustomerOrderItems, CustomerOrders, RetailerReceipts

    with transaction.atomic():
        order = _locked(CustomerOrders, order.pk)
        if order.stock_deducted_at:
            return False
        items = CustomerOrderItems.objects.filter(customer_order=order, retailer_receipt__isnull=False).order_by("retailer_receipt_id")
        for item in items:
            receipt = _locked(RetailerReceipts, item.retailer_receipt_id)
            unit, qty = line_quantity(item)
            if qty > 0:
                _take_lenient(receipt, unit, qty, f"Customer order {order.id}")
        order.stock_deducted_at = timezone.now()
        order.save(update_fields=["stock_deducted_at"])
    return True


def restore_customer_order(order):
    """Put a cancelled shop sale back on the shelves (only if it had been taken)."""
    from retailers.models import CustomerOrderItems, CustomerOrders, RetailerReceipts

    with transaction.atomic():
        order = _locked(CustomerOrders, order.pk)
        if not order.stock_deducted_at:
            return False
        for item in CustomerOrderItems.objects.filter(customer_order=order, retailer_receipt__isnull=False):
            receipt = _locked(RetailerReceipts, item.retailer_receipt_id)
            unit, qty = line_quantity(item)
            if qty > 0:
                give_back_to_receipt(receipt, unit, qty)
        order.stock_deducted_at = None
        order.save(update_fields=["stock_deducted_at"])
    return True


def deduct_retailer_order(order):
    """Take a wholesale order's lines off the wholesaler's receipts (once)."""
    from wholesalers.models import RetailerOrderItems, RetailerOrders, WholesalerReceipts

    with transaction.atomic():
        order = _locked(RetailerOrders, order.pk)
        if order.stock_deducted_at:
            return False
        items = RetailerOrderItems.objects.filter(retailer_order=order, wholesaler_receipt__isnull=False).order_by("wholesaler_receipt_id")
        for item in items:
            receipt = _locked(WholesalerReceipts, item.wholesaler_receipt_id)
            unit, qty = line_quantity(item)
            if qty > 0:
                _take_lenient(receipt, unit, qty, f"Retailer order {order.id}")
        order.stock_deducted_at = timezone.now()
        order.save(update_fields=["stock_deducted_at"])
    return True


def restore_retailer_order(order):
    from wholesalers.models import RetailerOrderItems, RetailerOrders, WholesalerReceipts

    with transaction.atomic():
        order = _locked(RetailerOrders, order.pk)
        if not order.stock_deducted_at:
            return False
        for item in RetailerOrderItems.objects.filter(retailer_order=order, wholesaler_receipt__isnull=False):
            receipt = _locked(WholesalerReceipts, item.wholesaler_receipt_id)
            unit, qty = line_quantity(item)
            if qty > 0:
                give_back_to_receipt(receipt, unit, qty)
        order.stock_deducted_at = None
        order.save(update_fields=["stock_deducted_at"])
    return True


def check_available(receipt, sale_unit, qty):
    """Before taking an order: is there enough? Returns an error string or None."""
    from products.units import can_take, describe

    if not can_take(receipt.current_unit_quantity or 0, getattr(receipt, "open_content", 0) or 0, receipt.product, sale_unit or FULL, qty):
        title = getattr(receipt.product, "title", "this item")
        return f"Not enough {title}: {describe(receipt.current_unit_quantity or 0, getattr(receipt, 'open_content', 0) or 0, receipt.product)} in stock"
    return None
