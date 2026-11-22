# distributors/api.py — the distributor <-> wholesaler trade (rules: distributors/services/).
#
#   POST /api/v1/distributors/staff        (a distributor's staff)
#     GetStock {q?, scope?: ALL|IN_STOCK|OUT_OF_STOCK|UNLISTED}      SaveStockLot {lot?, product, ...}
#     GetDiscounts {kind: PRICE|QUANTITY}   SavePriceDiscount {...}   SaveQuantityDiscount {...}
#     GetOrders {scope?: OPEN|DONE|ALL, q?}  GetOrder {order}
#     CreateStaffOrder {wholesaler, items: [{lot, quantity, discount?}], order_terms?, notes?, draft_id?}
#     RejectOrder {order, reason}
#     RecordPayment {order, payment_method, description?}   (cash, credit… — not mobile money)
#     RequestPayment {order, phone}                          (mobile money prompt to the buyer)
#     Fulfil {order, stage: PREPARING|PACKED|READY, package_count?, package_weight_kg?}
#     ConfirmCollection {order, code, collector_name?, collector_phone?}
#     SearchWholesalers {q}                                  (for staff orders)
#     SearchProducts {q}                                     (the product catalogue, to add stock)
#     RefreshPayment {reference}
#
#   POST /api/v1/distributors/buy          (a wholesaler's staff)
#     DiscoverDistributors {mode?: ADJACENT|ALL, latitude?, longitude?, radius_km?, search?, product?}
#     GetCatalogue {distributor, q?}
#     GetDeliveryOptions {distributor, items, collection_point?}  -> priced walking / rider / courier options
#     PlaceOrder {distributor, items: [{lot, quantity}], delivery_method?: SELF|COURIER, delivery_option?, notes?, draft_id?}
#     GetMyOrders {scope?, q?}   GetOrder {order}   CancelOrder {order}
#     PayOrder {order, phone}    RefreshPayment {reference}
#     ReceiveOrder {order, lines?: [{item, unit_selling_price}]}   -> into the wholesaler's stock

from django.db.models import Q
from rest_framework import exceptions
from rest_framework.decorators import api_view, permission_classes

from authentication.models import Entities
from core.responses import custom_errors_response, custom_success_message
from distributors.models import WholesalerOrders
from distributors.services import catalogue as cat
from distributors.services import orders as od
from distributors.services import payments as pay
from distributors.services.access import WHOLESALER_TYPES, DistributorStaff, WholesalerBuyer


def _action(request):
    action = request.data.get("action")
    if not action:
        raise exceptions.ValidationError("Action is not supplied")
    return action


def _order_result(errors, order, message, viewer):
    if errors:
        return custom_errors_response(1, "Not done", errors)
    return custom_success_message(0, message, od.order_out(order, viewer), "order")


def _payment_result(errors, payment, message):
    if errors:
        return custom_errors_response(1, "Payment not started", errors)
    return custom_success_message(0, message, pay.payment_out(payment), "payment")


@api_view(["POST"])
@permission_classes([DistributorStaff])
def distributorStaffAPIView(request):
    action, data, d, user = _action(request), request.data, request.distributor, request.user

    if action == "SearchProducts":
        # The whole product catalogue (a new distributor may not have categories yet).
        from products.models import Products

        q = str(data.get("q") or "").strip()
        rows = []
        if len(q) >= 2:
            for p in Products.objects.filter(Q(title__icontains=q) | Q(bar_code__iexact=q)).order_by("title")[:30]:
                rows.append({"id": str(p.id), "title": p.title, "bar_code": p.bar_code, "units_per_pack": getattr(p, "units_per_pack", None), "is_drug": bool(getattr(p, "preparation_id", None))})
        return custom_success_message(0, "Products", rows, "products")
    if action == "GetStock":
        return custom_success_message(0, "Stock", [cat.lot_out(l) for l in cat.list_stock(d, data)], "stock")
    if action == "SaveStockLot":
        errors, lot = cat.save_lot(d, user, data)
        if errors:
            return custom_errors_response(1, "Stock not saved", errors)
        return custom_success_message(0, "Stock saved", cat.lot_out(lot), "lot")

    if action == "GetDiscounts":
        kind = "QUANTITY" if str(data.get("kind")).upper() == "QUANTITY" else "PRICE"
        return custom_success_message(0, "Discounts", cat.list_discounts(d, kind), "discounts")
    if action in ("SavePriceDiscount", "SaveQuantityDiscount"):
        kind = "PRICE" if action == "SavePriceDiscount" else "QUANTITY"
        errors, disc = cat.save_discount(d, user, kind, data)
        if errors:
            return custom_errors_response(1, "Discount not saved", errors)
        return custom_success_message(0, "Discount saved", cat.discount_out(disc, kind), "discount")

    if action == "GetOrders":
        rows = od.orders_for(distributor=d, scope=data.get("scope"), q=str(data.get("q") or "").strip() or None)
        return custom_success_message(0, "Orders", [od.order_out(o, "seller") for o in rows], "orders")
    if action == "SearchWholesalers":
        q = str(data.get("q") or "").strip()
        qs = Entities.objects.filter(entity_type__in=WHOLESALER_TYPES)
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(town__icontains=q))
        return custom_success_message(0, "Wholesalers", [{"id": str(e.id), "title": e.title, "town": e.town, "entity_type": e.entity_type} for e in qs.order_by("title")[:30]], "wholesalers")
    if action == "CreateStaffOrder":
        errors, order = od.place_order(user, data, distributor=d)
        return _order_result(errors, order, "Order created", "seller")
    if action == "RefreshPayment":
        errors, p = pay.refresh_payment(data.get("reference"), {"distributor": d})
        return _payment_result(errors, p, "Payment")

    order = WholesalerOrders.objects.filter(id=data.get("order") or None, distributor=d).first() if data.get("order") else None
    if action in ("GetOrder", "RecordPayment", "RequestPayment") and not order:
        return custom_errors_response(1, "Not found", ["Order not found"])
    if action == "GetOrder":
        return custom_success_message(0, "Order", od.order_out(order, "seller"), "order")
    if action == "RejectOrder":
        errors, order = od.reject_order(d, user, data)
        return _order_result(errors, order, "Order rejected", "seller")
    if action == "RecordPayment":
        errors, p = pay.record_offline_payment(order, user, data.get("payment_method"), data.get("description"))
        return _payment_result(errors, p, "Payment recorded")
    if action == "RequestPayment":
        errors, p = pay.initiate_mobile_money(order, user, data.get("phone"))
        return _payment_result(errors, p, "Payment prompt sent")
    if action == "Fulfil":
        errors, order = od.fulfil(d, user, data)
        return _order_result(errors, order, "Updated", "seller")
    if action == "ConfirmCollection":
        errors, order = od.confirm_collection(d, user, data)
        return _order_result(errors, order, "Collected", "seller")

    raise exceptions.ValidationError(f"Action {action} is unknown")


@api_view(["POST"])
@permission_classes([WholesalerBuyer])
def wholesalerBuyAPIView(request):
    action, data, w, user = _action(request), request.data, request.wholesaler, request.user

    if action == "DiscoverDistributors":
        return custom_success_message(0, "Distributors", cat.discover(w, data), "distributors")
    if action == "GetCatalogue":
        errors, distributor, rows = cat.catalogue(w, data.get("distributor"), data)
        if errors:
            return custom_errors_response(1, "Not found", errors)
        return custom_success_message(0, "Catalogue", {"distributor": {"id": str(distributor.id), "title": distributor.title, "town": distributor.town}, "lots": rows}, "data")
    if action == "GetDeliveryOptions":
        # Before ordering: walking delivery / rider / courier for this distance, each priced;
        # courier options list the offices near you ("collection_point" re-prices for one).
        from logistics.views import _option_out

        errors, options, kg = od.delivery_options(w, data)
        if errors:
            return custom_errors_response(1, "No delivery options", errors)
        return custom_success_message(0, "Delivery options", {"options": [_option_out(o) for o in options], "chargeable_weight_kg": str(kg)}, "data")
    if action == "PlaceOrder":
        errors, order = od.place_order(user, data, wholesaler=w)
        return _order_result(errors, order, "Order placed", "buyer")
    if action == "GetMyOrders":
        rows = od.orders_for(wholesaler=w, scope=data.get("scope"), q=str(data.get("q") or "").strip() or None)
        return custom_success_message(0, "Orders", [od.order_out(o, "buyer") for o in rows], "orders")
    if action == "RefreshPayment":
        errors, p = pay.refresh_payment(data.get("reference"), {"wholesaler_order__wholesaler": w})
        return _payment_result(errors, p, "Payment")

    order = WholesalerOrders.objects.filter(id=data.get("order") or None, wholesaler=w).first() if data.get("order") else None
    if action in ("GetOrder", "PayOrder") and not order:
        return custom_errors_response(1, "Not found", ["Order not found"])
    if action == "GetOrder":
        return custom_success_message(0, "Order", od.order_out(order, "buyer"), "order")
    if action == "CancelOrder":
        errors, order = od.cancel_order(w, user, data)
        return _order_result(errors, order, "Order cancelled", "buyer")
    if action == "PayOrder":
        # Buyers pay by mobile money only (payment-method rules).
        errors, p = pay.initiate_mobile_money(order, user, data.get("phone"))
        return _payment_result(errors, p, "Check your phone and enter your PIN")
    if action == "ReceiveOrder":
        errors, order = od.receive_order(w, user, data)
        return _order_result(errors, order, "Received into your stock", "buyer")

    raise exceptions.ValidationError(f"Action {action} is unknown")
