# distributors/services/orders.py
#
# A wholesaler's order on a distributor (distributors.WholesalerOrders):
#
#   SUBMITTED  placed remotely by the wholesaler's staff, or taken by the
#              distributor's staff for a wholesaler (order_origin STAFF)
#   PAID       mobile money from the buyer, or any method recorded by the
#              distributor's staff (services/payments.py); stock comes off the
#              distributor's lots once
#   PREPARING -> PACKED -> READY   the distributor's staff (logistics.Fulfilment)
#   COLLECTED  pickup: the wholesaler's collector gives the pickup code
#   DISPATCHED delivery: logistics.Shipment legs (logistics/utils/deliveries.py)
#   RECEIVED   the wholesaler books the goods into its stock (wholesalers.WholesalerReceipts)
#   REJECTED / CANCELLED  before payment only
#
# Pricing is the server's: the lot's final price (after its price discount);
# quantity discounts add free units; the distributor's staff may give a counter
# discount, never below the lot's cost.

import secrets
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from authentication.models import Entities
from distributors.models import DistributorReceipts, WholesalerOrderItems, WholesalerOrders
from distributors.services.access import DISTRIBUTOR_TYPES, WHOLESALER_TYPES, distributor_types_for, employee_of
from distributors.services.catalogue import free_quantity
from utils.logging import create_log

CENTS = Decimal("0.01")
OPEN_FOR_PAYMENT = ("SUBMITTED",)
STAGES = ("PREPARING", "PACKED", "READY")


def _money(v):
    return Decimal(v).quantize(CENTS, rounding=ROUND_HALF_UP)


def _ref():
    return "WO" + secrets.token_hex(4).upper()


def is_paid(order):
    return order.status not in ("SUBMITTED", "REJECTED", "CANCELLED") or str(order.is_paid).lower() == "true"


# ---------------------------------------------------------------- output

def item_out(i):
    lot = i.distributor_receipt
    return {
        "id": str(i.id),
        "lot": str(lot.id) if lot else None,
        "product": str(lot.product_id) if lot else None,
        "title": lot.product.title if lot else "",
        "batch": lot.batch if lot else None,
        "expiry_date": lot.expiry_date.isoformat() if lot and lot.expiry_date else None,
        "unit_of_issue": i.unit_of_issue,
        "purchased_quantity": i.purchased_quantity,
        "free_quantity": i.discount_quantity,
        "total_quantity": i.total_quantity,
        "item_price": str(i.item_price),
        "item_final_price": str(i.item_final_price),
        "item_price_discount_total": str(i.item_price_discount_total),
        "item_final_price_total": str(i.item_final_price_total),
        "is_received": i.is_received,
    }


def order_out(order, viewer="buyer"):
    from distributors.services.payments import amount_due, payment_out

    try:
        f = order.fulfilment
    except Exception:
        f = None
    out = {
        "id": str(order.id),
        "reference_number": order.reference_number,
        "status": order.status,
        "order_origin": order.order_origin,
        "order_terms": order.order_terms,
        "delivery_method": order.delivery_method,
        "distributor": str(order.distributor_id),
        "distributor_title": order.distributor.title,
        "wholesaler": str(order.wholesaler_id) if order.wholesaler_id else None,
        "wholesaler_title": order.wholesaler.title if order.wholesaler_id else "",
        "gross_price_total": str(order.gross_price_total),
        "discount_total": str(order.discount_total or 0),
        "final_price_total": str(order.final_price_total),
        "shipping_amount": str(order.shipping_amount or 0),
        "amount_due": str(amount_due(order)),
        "is_paid": is_paid(order),
        "notes": order.notes,
        "rejected_reason": order.rejected_reason,
        "created": order.created.isoformat() if order.created else None,
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        "collected_at": order.collected_at.isoformat() if order.collected_at else None,
        "received_at": order.received_at.isoformat() if order.received_at and order.status == "RECEIVED" else None,
        "items": [item_out(i) for i in order.item_wholesaler_order.select_related("distributor_receipt__product")],
        "payments": [payment_out(p) for p in order.wholesaler_order.order_by("-created")[:20]],
        "fulfilment": None,
        "shipment": _shipment_out(order, viewer),
    }
    if f:
        out["fulfilment"] = {
            "stage": f.stage,
            "package_count": f.package_count,
            "package_weight_kg": str(f.package_weight_kg) if f.package_weight_kg is not None else None,
            "ready_at": f.ready_at.isoformat() if f.ready_at else None,
            "collected_at": f.collected_at.isoformat() if f.collected_at else None,
            "collector_name": f.collector_name,
            # The buyer shows this code to collect; the seller never sees it.
            "pickup_code": f.pickup_code if viewer == "buyer" and order.delivery_method == "SELF" else None,
        }
    return out


def _shipment_out(order, viewer):
    try:
        sh = order.shipment
    except Exception:
        return None
    legs = list(sh.legs.select_related("agent__user", "provider", "destination_collection_point").order_by("sequence"))
    return {
        "id": str(sh.id),
        "method": sh.method,
        "status": sh.status,
        "total_cost": str(sh.total_cost),
        "tracking_number": sh.tracking_number,
        "collection_point": sh.destination_collection_point.title if sh.destination_collection_point_id else None,
        # The buyer gives this to the last deliverer to prove delivery.
        "delivery_code": sh.delivery_code if viewer == "buyer" else None,
        "delivered_at": sh.delivered_at.isoformat() if sh.delivered_at else None,
        "legs": [{
            "id": str(l.id),
            "kind": l.kind,
            "mode": l.mode,
            "status": l.status,
            "provider_title": l.provider.title if l.provider_id else None,
            "agent_name": " ".join(x for x in (l.agent.user.first_name, l.agent.user.last_name) if x) if l.agent_id else None,
            "to_title": l.destination_collection_point.title if l.destination_collection_point_id else None,
            "distance_km": str(l.distance_km),
            "cost": str(l.cost) if viewer == "seller" else None,
        } for l in legs],
    }


def orders_for(*, distributor=None, wholesaler=None, scope="OPEN", q=None):
    qs = WholesalerOrders.objects.select_related("distributor", "wholesaler").order_by("-created")
    if distributor is not None:
        qs = qs.filter(distributor=distributor)
    if wholesaler is not None:
        qs = qs.filter(wholesaler=wholesaler)
    qs = qs.filter(wholesaler__isnull=False)  # legacy rows without a buyer are not shown
    scope = str(scope or "OPEN").upper()
    if scope == "OPEN":
        qs = qs.exclude(status__in=["RECEIVED", "REJECTED", "CANCELLED"])
    elif scope == "DONE":
        qs = qs.filter(status__in=["RECEIVED", "REJECTED", "CANCELLED"])
    if q:
        qs = qs.filter(Q(reference_number__icontains=q) | Q(wholesaler__title__icontains=q) | Q(distributor__title__icontains=q))
    return qs[:500]


# ---------------------------------------------------------------- placing

def place_order(user, data, *, wholesaler=None, distributor=None):
    """
    Wholesaler staff (remote): PlaceOrder {distributor, items: [{lot, quantity}], delivery_method?, notes?, draft_id?}
    Distributor staff:         CreateStaffOrder {wholesaler, items: [{lot, quantity, discount?}], order_terms?, notes?, draft_id?}
    Returns (errors, order).
    """
    staff = distributor is not None
    errors = []
    if staff:
        wholesaler = Entities.objects.filter(id=data.get("wholesaler") or None, entity_type__in=WHOLESALER_TYPES).first() if data.get("wholesaler") else None
        if not wholesaler:
            return ["Pick the wholesaler"], None
        if distributor.entity_type not in distributor_types_for(wholesaler):
            return [f"{wholesaler.title} can't buy from this type of distributor"], None
    else:
        distributor = Entities.objects.filter(id=data.get("distributor") or None, entity_type__in=distributor_types_for(wholesaler)).first() if data.get("distributor") else None
        if not distributor:
            return ["Pick the distributor"], None

    draft = str(data.get("draft_id") or "").strip() or None
    if draft:
        done = WholesalerOrders.objects.filter(draft_id=draft, distributor=distributor, wholesaler=wholesaler).first()
        if done:
            return [], done

    method = str(data.get("delivery_method") or "SELF").upper()
    if method in ("PICKUP",):
        method = "SELF"
    if method not in ("SELF", "COURIER"):
        errors.append("Choose pickup or delivery")
    if method == "COURIER" and staff:
        errors.append("Staff orders are collected; the wholesaler chooses delivery when ordering remotely")
    terms = str(data.get("order_terms") or "CASH").upper()
    if terms not in ("CASH", "CREDIT"):
        errors.append("Terms must be cash or credit")
    if not staff and terms != "CASH":
        errors.append("Orders placed remotely are paid in cash (mobile money)")

    # One line per lot.
    wanted = {}
    for row in data.get("items") or []:
        lot_id = str(row.get("lot") or "")
        try:
            qty = int(str(row.get("quantity")))
        except Exception:
            qty = 0
        if not lot_id or qty < 1:
            errors.append("Every line needs a product and a quantity of at least 1")
            continue
        prev = wanted.get(lot_id, {"quantity": 0, "discount": Decimal("0")})
        disc = Decimal("0")
        if staff and row.get("discount") not in (None, ""):
            try:
                disc = max(Decimal(str(row["discount"])), Decimal("0"))
            except Exception:
                errors.append("Discounts must be amounts")
        wanted[lot_id] = {"quantity": prev["quantity"] + qty, "discount": prev["discount"] + disc}
    if not wanted:
        errors.append("Add at least one product")
    if errors:
        return errors, None

    lots = {str(l.id): l for l in DistributorReceipts.objects.select_related("product").filter(id__in=list(wanted.keys()), entity=distributor)}
    lines = []
    gross = discount = Decimal("0")
    for lot_id, w in wanted.items():
        lot = lots.get(lot_id)
        if not lot:
            return ["An item is not sold by this distributor"], None
        if not staff and not lot.is_listed:
            return [f"{lot.product.title} is not on sale"], None
        qty = w["quantity"]
        free = free_quantity(lot, qty)
        if lot.current_unit_quantity < qty + free:
            return [f"Only {lot.current_unit_quantity} {lot.unit_of_receipt} of {lot.product.title} in stock"], None
        list_price = Decimal(lot.unit_selling_price or 0)
        price = Decimal(lot.final_unit_selling_price or 0) or list_price
        if price <= 0:
            return [f"{lot.product.title} has no price set"], None
        line_gross = list_price * qty
        line_total = price * qty - min(w["discount"], price * qty)
        if staff and lot.unit_buying_price and line_total < Decimal(lot.unit_buying_price) * qty:
            return [f"{lot.product.title}: the discount takes the price below cost (KES {lot.unit_buying_price} each)"], None
        lines.append((lot, qty, free, list_price, line_total))
        gross += line_gross
        discount += line_gross - line_total

    # Delivery: the buyer's chosen option (walking / rider / courier + the office they
    # collect from) is priced in logistics now and its fee added to what's due.
    chosen = kg = None
    if method == "COURIER":
        from logistics.utils import deliveries as dl

        plan_errors, chosen, kg = dl.plan_wholesaler_order_delivery(
            distributor, wholesaler, [(lot, qty + free) for lot, qty, free, _, _ in lines], data.get("delivery_option"),
        )
        if plan_errors:
            return plan_errors, None

    with transaction.atomic():
        order = WholesalerOrders.objects.create(
            entity=wholesaler, owner=user, distributor=distributor, wholesaler=wholesaler,
            employee=employee_of(user, distributor if staff else wholesaler),
            reference_number=_ref(), draft_id=draft, order_terms=terms, delivery_method=method,
            order_origin="STAFF" if staff else "WHOLESALER", status="SUBMITTED",
            gross_price_total=_money(gross), discount_total=_money(discount), final_price_total=_money(gross - discount),
            items_price_total=_money(gross), net_price_total=_money(gross - discount),
            final_amount_total=_money(gross - discount), shipping_amount=Decimal("0"),
            notes=str(data.get("notes") or "")[:300],
            is_paid="false", is_delivered="false", is_processed="false", is_packed="false", is_received="false", is_approved="false",
        )
        for lot, qty, free, list_price, total in lines:
            WholesalerOrderItems.objects.create(
                entity=wholesaler, owner=user, wholesaler_order=order, distributor_receipt=lot,
                purchased_quantity=qty, discount_quantity=free, total_quantity=qty + free,
                unit_of_issue=lot.unit_of_receipt, item_price=_money(list_price),
                item_final_price=_money(total / qty), item_price_discount_total=_money(list_price * qty - total),
                item_final_price_total=_money(total), item_gross_price=_money(list_price * qty), item_net_price=_money(total),
                item_pending_amount=_money(total),
            )
        if chosen:
            from logistics.utils import deliveries as dl

            dl.attach_wholesaler_order_shipment(order, chosen, kg, user)
            order.shipping_amount = chosen["total"]
            order.save(update_fields=["shipping_amount", "updated"])
    return [], order


def delivery_options(wholesaler, data):
    """GetDeliveryOptions {distributor, items: [{lot, quantity}], collection_point?} -> (errors, options, kg)."""
    from logistics.utils import deliveries as dl

    distributor = Entities.objects.filter(id=data.get("distributor") or None, entity_type__in=distributor_types_for(wholesaler)).first() if data.get("distributor") else None
    if not distributor:
        return ["Pick the distributor"], [], 0
    qty = {}
    for row in data.get("items") or []:
        try:
            qty[str(row.get("lot"))] = qty.get(str(row.get("lot")), 0) + max(int(str(row.get("quantity"))), 1)
        except Exception:
            continue
    lots = DistributorReceipts.objects.select_related("product").filter(id__in=list(qty.keys()), entity=distributor)
    lines = [(l, qty[str(l.id)] + free_quantity(l, qty[str(l.id)])) for l in lots]
    if not lines:
        return ["Add products first"], [], 0
    return dl.wholesaler_order_delivery_options(distributor, wholesaler, lines, data.get("collection_point") or None)


# ---------------------------------------------------------------- rejecting / cancelling

def cancel_order(wholesaler, user, data):
    order = WholesalerOrders.objects.filter(id=data.get("order") or None, wholesaler=wholesaler).first() if data.get("order") else None
    if not order:
        return ["Order not found"], None
    if order.status != "SUBMITTED" or is_paid(order):
        return ["Only unpaid orders can be cancelled"], None
    order.status = "CANCELLED"
    order.cancelled_at = timezone.now()
    order.save(update_fields=["status", "cancelled_at", "updated"])
    return [], order


def reject_order(distributor, user, data):
    order = WholesalerOrders.objects.filter(id=data.get("order") or None, distributor=distributor).first() if data.get("order") else None
    if not order:
        return ["Order not found"], None
    if order.status != "SUBMITTED" or is_paid(order):
        return ["Only unpaid orders can be rejected"], None
    reason = str(data.get("reason") or "").strip()
    if not reason:
        return ["Say why the order is rejected"], None
    order.status = "REJECTED"
    order.rejected_reason = reason[:300]
    order.rejected_at = timezone.now()
    order.save(update_fields=["status", "rejected_reason", "rejected_at", "updated"])
    return [], order


# ---------------------------------------------------------------- paid

def mark_paid(order):
    """Successful payments cover the order (payments.py): paid, stock off the lots once, fulfilment opened."""
    from logistics.models import Fulfilment

    with transaction.atomic():
        order = WholesalerOrders.objects.select_for_update().get(id=order.id)
        if order.status in ("SUBMITTED",):
            order.status = "PAID"
        order.is_paid = "true"
        order.paid_at = order.paid_at or timezone.now()
        if not order.stock_deducted_at:
            for i in order.item_wholesaler_order.select_related("distributor_receipt"):
                if i.distributor_receipt_id:
                    DistributorReceipts.objects.filter(id=i.distributor_receipt_id).update(
                        current_unit_quantity=F("current_unit_quantity") - i.total_quantity,
                    )
            order.stock_deducted_at = timezone.now()
        order.save()
        Fulfilment.objects.get_or_create(
            wholesaler_order=order,
            defaults={"entity": order.distributor, "pickup_code": f"{secrets.randbelow(10**6):06d}"},
        )
    return order


# ---------------------------------------------------------------- fulfilment (distributor staff)

def fulfil(distributor, user, data):
    """Fulfil {order, stage: PREPARING|PACKED|READY, package_count?, package_weight_kg?}."""
    order = WholesalerOrders.objects.filter(id=data.get("order") or None, distributor=distributor).first() if data.get("order") else None
    if not order:
        return ["Order not found"], None
    if not is_paid(order):
        return ["The order isn't paid yet"], None
    stage = str(data.get("stage") or "").upper()
    if stage not in STAGES:
        return ["Unknown stage"], None
    f = order.fulfilment
    now = timezone.now()
    if stage == "PREPARING" and f.stage == "PENDING":
        f.stage, f.prepared_by, f.preparing_at = "PREPARING", user, now
    elif stage == "PACKED" and f.stage in ("PENDING", "PREPARING"):
        f.stage, f.packed_by, f.packed_at = "PACKED", user, now
        try:
            f.package_count = max(1, int(data.get("package_count") or f.package_count or 1))
        except (TypeError, ValueError):
            return ["Enter the number of packages"], None
        if data.get("package_weight_kg") not in (None, ""):
            try:
                f.package_weight_kg = Decimal(str(data["package_weight_kg"]))
            except Exception:
                return ["Enter the weight in kg"], None
    elif stage == "READY" and f.stage in ("PREPARING", "PACKED"):
        f.stage, f.ready_by, f.ready_at = "READY", user, now
    else:
        return [f"The order is {f.stage.lower()}; it can't move to {stage.lower()}"], None
    with transaction.atomic():
        f.save()
        order.status = stage
        if stage == "PACKED":
            order.is_packed, order.packed_at, order.packed_by = "true", now, user
        order.save()
    return [], order


def confirm_collection(distributor, user, data):
    """ConfirmCollection {order, code, collector_name?, collector_phone?}: pickup orders only."""
    order = WholesalerOrders.objects.filter(id=data.get("order") or None, distributor=distributor).first() if data.get("order") else None
    if not order:
        return ["Order not found"], None
    if order.delivery_method != "SELF":
        return ["This order is delivered, not collected"], None
    f = order.fulfilment if is_paid(order) else None
    if not f or f.stage != "READY":
        return ["The order isn't ready for collection"], None
    if str(data.get("code") or "").strip() != (f.pickup_code or ""):
        return ["The pickup code is wrong"], None
    now = timezone.now()
    with transaction.atomic():
        f.stage, f.code_verified, f.handed_over_by, f.collected_at = "COLLECTED", True, user, now
        f.collector_name = str(data.get("collector_name") or "")[:256] or None
        f.collector_phone = str(data.get("collector_phone") or "")[:32] or None
        f.save()
        order.status = "COLLECTED"
        order.collected_at = now
        order.save(update_fields=["status", "collected_at", "updated"])
        # Collected = released to the buyer: the distributor's goods share is due.
        from payments.utils.order_payouts import release_vendor

        release_vendor("wholesaler", order, None, "Collected by the wholesaler")
    return [], order


# ---------------------------------------------------------------- receiving (the wholesaler)

def receive_order(wholesaler, user, data):
    """
    ReceiveOrder {order, lines?: [{item, unit_selling_price}]}: once collected (or delivered),
    book every line into the wholesaler's stock (WholesalerReceipts), priced at what was paid
    per unit (free units lower the unit cost). Selling prices can be set now or later.
    """
    from wholesalers.models import WholesalerReceipts

    order = WholesalerOrders.objects.filter(id=data.get("order") or None, wholesaler=wholesaler).select_related("distributor").first() if data.get("order") else None
    if not order:
        return ["Order not found"], None
    delivered = order.status == "COLLECTED" or (order.delivery_method == "COURIER" and _delivered(order))
    if order.status == "RECEIVED":
        return ["Already received"], None
    if not delivered:
        return ["Receive it once it has been collected or delivered"], None
    prices = {str(l.get("item")): l.get("unit_selling_price") for l in (data.get("lines") or [])}
    employee = employee_of(user, wholesaler)
    now = timezone.now()
    with transaction.atomic():
        for i in order.item_wholesaler_order.select_related("distributor_receipt__product").filter(is_received=False):
            lot = i.distributor_receipt
            units = max(i.total_quantity, 1)
            cost = _money(Decimal(i.item_final_price_total) / units)
            try:
                sell = Decimal(str(prices.get(str(i.id)) or 0))
            except Exception:
                sell = Decimal("0")
            WholesalerReceipts.objects.create(
                entity=wholesaler, owner=user, employee=employee, product=lot.product, received_from=order.distributor,
                wholesaler_order_item=i, batch=lot.batch, manufacture_date=lot.manufacture_date, expiry_date=lot.expiry_date,
                received_unit_quantity=i.total_quantity, current_unit_quantity=i.total_quantity,
                unit_of_receipt=lot.unit_of_receipt, unit_buying_price=cost, unit_selling_price=sell,
                final_unit_selling_price=sell, in_placement="false",
                description=f"From {order.distributor.title}, order {order.reference_number}"[:300],
            )
            i.is_received = True
            i.received_at = now
            i.save(update_fields=["is_received", "received_at", "updated"])
        order.status = "RECEIVED"
        order.is_received, order.received_at, order.received_by = "true", now, user
        order.save()
    return [], order


def _delivered(order):
    try:
        return bool(order.shipment.delivered_at)
    except Exception:
        return False
