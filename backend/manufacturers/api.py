# manufacturers/api.py — the manufacturer <-> distributor trade (rules: manufacturers/services/).
#
#   POST /api/v1/manufacturers/staff     (a manufacturer's staff)
#     Products — the source of everything sold on WaziPOS:
#       GetProductLookups   GetMyProducts {q?, scope?: ALL|ACTIVE|INACTIVE|NO_WEIGHT}
#       SaveProduct {product?, title, category, units_per_pack, weight_kg, ...}   SearchPreparations {q}
#     Production batches (stock): GetBatches {q?, product?, scope?}   SaveBatch {batch_id?, product, batch, ...}
#     Discounts: GetDiscounts {kind: PRICE|QUANTITY}   SavePriceDiscount {...}   SaveQuantityDiscount {...}
#     Orders: GetOrders {scope?, q?}  GetOrder {order}  SearchDistributors {q}
#       CreateStaffOrder {distributor, items: [{batch_id, quantity, discount?}], order_terms?, notes?}
#       RejectOrder {order, reason}   RecordPayment {order, payment_method, description?}
#       RequestPayment {order, phone}   RefreshPayment {reference}
#       Fulfil {order, stage}   ConfirmCollection {order, code, collector_name?, collector_phone?}
#     Dispatch of delivered orders: logistics DispatchOrder {distributor_purchase_order, agent, vehicle?, dispatch_office?}
#
#   POST /api/v1/manufacturers/buy       (a distributor's staff)
#     DiscoverManufacturers {mode?, latitude?, longitude?, radius_km?, search?, product?}
#     GetCatalogue {manufacturer, q?}
#     GetDeliveryOptions {manufacturer, items, collection_point?}
#     PlaceOrder {manufacturer, items: [{batch_id, quantity}], delivery_method?: SELF|COURIER, delivery_option?, notes?, draft_id?}
#     GetMyOrders {scope?, q?}  GetOrder {order}  CancelOrder {order}
#     PayOrder {order, phone}  RefreshPayment {reference}
#     ReceiveOrder {order, lines?: [{item, unit_selling_price}]}   -> into the distributor's stock

from django.db.models import Q
from rest_framework import exceptions
from rest_framework.decorators import api_view, permission_classes

from authentication.models import Entities
from core.responses import custom_errors_response, custom_success_message
from manufacturers.models import DistributorPurchaseOrders
from manufacturers.services import catalogue as cat
from manufacturers.services import orders as od
from manufacturers.services import payments as pay
from manufacturers.services import products as prod
from manufacturers.services.access import DistributorBuyer, ManufacturerStaff, distributor_types_for


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
@permission_classes([ManufacturerStaff])
def manufacturerStaffAPIView(request):
    action, data, m, user = _action(request), request.data, request.manufacturer, request.user

    # ---- products: the source
    if action == "GetProductLookups":
        return custom_success_message(0, "Lookups", prod.lookups(m), "data")
    if action == "GetMyProducts":
        return custom_success_message(0, "Products", prod.list_products(m, data), "products")
    if action == "SaveProduct":
        errors, product = prod.save_product(m, user, data)
        if errors:
            return custom_errors_response(1, "Product not saved", errors)
        return custom_success_message(0, "Product saved", prod.product_out(product), "product")
    if action == "SearchPreparations":
        return custom_success_message(0, "Preparations", prod.search_preparations(data.get("q")), "preparations")

    # ---- batches and discounts
    if action == "GetBatches":
        return custom_success_message(0, "Batches", [cat.batch_out(b) for b in cat.list_batches(m, data)], "batches")
    if action == "SaveBatch":
        errors, b = cat.save_batch(m, user, data)
        if errors:
            return custom_errors_response(1, "Batch not saved", errors)
        return custom_success_message(0, "Batch saved", cat.batch_out(b), "batch")
    if action == "GetDiscounts":
        kind = "QUANTITY" if str(data.get("kind")).upper() == "QUANTITY" else "PRICE"
        return custom_success_message(0, "Discounts", cat.list_discounts(m, kind), "discounts")
    if action in ("SavePriceDiscount", "SaveQuantityDiscount"):
        kind = "PRICE" if action == "SavePriceDiscount" else "QUANTITY"
        errors, disc = cat.save_discount(m, user, kind, data)
        if errors:
            return custom_errors_response(1, "Discount not saved", errors)
        return custom_success_message(0, "Discount saved", cat.discount_out(disc, kind), "discount")

    # ---- orders
    if action == "GetOrders":
        rows = od.orders_for(manufacturer=m, scope=data.get("scope"), q=str(data.get("q") or "").strip() or None)
        return custom_success_message(0, "Orders", [od.order_out(o, "seller") for o in rows], "orders")
    if action == "SearchDistributors":
        q = str(data.get("q") or "").strip()
        qs = Entities.objects.filter(entity_type__in=distributor_types_for(m))
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(town__icontains=q))
        return custom_success_message(0, "Distributors", [{"id": str(e.id), "title": e.title, "town": e.town, "entity_type": e.entity_type} for e in qs.order_by("title")[:30]], "distributors")
    if action == "CreateStaffOrder":
        errors, order = od.place_order(user, data, manufacturer=m)
        return _order_result(errors, order, "Order created", "seller")
    if action == "RefreshPayment":
        errors, p = pay.refresh_payment(data.get("reference"), {"manufacturer": m})
        return _payment_result(errors, p, "Payment")

    order = DistributorPurchaseOrders.objects.filter(id=data.get("order") or None, manufacturer=m).first() if data.get("order") else None
    if action in ("GetOrder", "RecordPayment", "RequestPayment") and not order:
        return custom_errors_response(1, "Not found", ["Order not found"])
    if action == "GetOrder":
        return custom_success_message(0, "Order", od.order_out(order, "seller"), "order")
    if action == "RejectOrder":
        errors, order = od.reject_order(m, user, data)
        return _order_result(errors, order, "Order rejected", "seller")
    if action == "RecordPayment":
        errors, p = pay.record_offline_payment(order, user, data.get("payment_method"), data.get("description"))
        return _payment_result(errors, p, "Payment recorded")
    if action == "RequestPayment":
        errors, p = pay.initiate_mobile_money(order, user, data.get("phone"))
        return _payment_result(errors, p, "Payment prompt sent")
    if action == "Fulfil":
        errors, order = od.fulfil(m, user, data)
        return _order_result(errors, order, "Updated", "seller")
    if action == "ConfirmCollection":
        errors, order = od.confirm_collection(m, user, data)
        return _order_result(errors, order, "Collected", "seller")
    raise exceptions.ValidationError(f"Action {action} is unknown")


@api_view(["POST"])
@permission_classes([DistributorBuyer])
def distributorBuyAPIView(request):
    action, data, d, user = _action(request), request.data, request.distributor, request.user

    if action == "DiscoverManufacturers":
        return custom_success_message(0, "Manufacturers", cat.discover(d, data), "manufacturers")
    if action == "GetCatalogue":
        errors, m, rows = cat.catalogue(d, data.get("manufacturer"), data)
        if errors:
            return custom_errors_response(1, "Not found", errors)
        return custom_success_message(0, "Catalogue", {"manufacturer": {"id": str(m.id), "title": m.title, "town": m.town}, "batches": rows}, "data")
    if action == "GetDeliveryOptions":
        from logistics.views import _option_out

        errors, options, kg = od.delivery_options(d, data)
        if errors:
            return custom_errors_response(1, "No delivery options", errors)
        return custom_success_message(0, "Delivery options", {"options": [_option_out(o) for o in options], "chargeable_weight_kg": str(kg)}, "data")
    if action == "PlaceOrder":
        errors, order = od.place_order(user, data, distributor=d)
        return _order_result(errors, order, "Order placed", "buyer")
    if action == "GetMyOrders":
        rows = od.orders_for(distributor=d, scope=data.get("scope"), q=str(data.get("q") or "").strip() or None)
        return custom_success_message(0, "Orders", [od.order_out(o, "buyer") for o in rows], "orders")
    if action == "RefreshPayment":
        errors, p = pay.refresh_payment(data.get("reference"), {"order__distributor": d})
        return _payment_result(errors, p, "Payment")

    order = DistributorPurchaseOrders.objects.filter(id=data.get("order") or None, distributor=d).first() if data.get("order") else None
    if action in ("GetOrder", "PayOrder") and not order:
        return custom_errors_response(1, "Not found", ["Order not found"])
    if action == "GetOrder":
        return custom_success_message(0, "Order", od.order_out(order, "buyer"), "order")
    if action == "CancelOrder":
        errors, order = od.cancel_order(d, user, data)
        return _order_result(errors, order, "Order cancelled", "buyer")
    if action == "PayOrder":
        # Buyers pay by mobile money only.
        errors, p = pay.initiate_mobile_money(order, user, data.get("phone"))
        return _payment_result(errors, p, "Check your phone and enter your PIN")
    if action == "ReceiveOrder":
        errors, order = od.receive_order(d, user, data)
        return _order_result(errors, order, "Received into your stock", "buyer")
    raise exceptions.ValidationError(f"Action {action} is unknown")
