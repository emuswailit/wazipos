# manufacturers/services/orders.py
#
# A distributor's order on a manufacturer (manufacturers.DistributorPurchaseOrders):
#
#   SUBMITTED  placed remotely by the distributor's staff, or taken by the
#              manufacturer's staff for a distributor (order_origin STAFF)
#   PAID       mobile money from the buyer, or any method recorded by the
#              manufacturer's staff (payments.py); stock comes off the batches once
#   PREPARING -> PACKED -> READY   the manufacturer's staff (logistics.Fulfilment)
#   COLLECTED  pickup: the distributor's collector gives the pickup code; the
#              manufacturer's goods share is then due (payments.OrderPayouts)
#   DISPATCHED delivery: logistics.Shipment legs, the manufacturer allocates its own
#              fleet or a WaziPOS rider / courier at dispatch; the goods share is due
#              once they leave with the delivery person
#   RECEIVED   the distributor books the goods into its stock (distributors.DistributorReceipts)
#   REJECTED / CANCELLED  before payment only
#
# Pricing is the server's: the batch's final price (after its price discount);
# quantity discounts add free units; the manufacturer's staff may give a counter
# discount, never below the batch's production cost.

import secrets
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from authentication.models import Entities
from manufacturers.models import DistributorPurchaseOrderItems, DistributorPurchaseOrders, ManufacturerBatches
from manufacturers.services.access import DISTRIBUTOR_TYPES, distributor_types_for, employee_of, manufacturer_types_for
from manufacturers.services.catalogue import free_quantity

CENTS = Decimal("0.01")
STAGES = ("PREPARING", "PACKED", "READY")
CLOSED = ("RECEIVED", "REJECTED", "CANCELLED")
DISTRIBUTOR_UNITS = {"Pack", "Piece", "Box", "Carton", "Strip", "Bottle", "Tube", "Sachet"}


def _money(v):
    return Decimal(v).quantize(CENTS, rounding=ROUND_HALF_UP)


def _ref():
    return "PO" + secrets.token_hex(4).upper()


def is_paid(order):
    return bool(order.is_paid) or order.status not in ("SUBMITTED", "REJECTED", "CANCELLED")


# ---------------------------------------------------------------- output

def item_out(i):
    b = i.batch
    return {
        "id": str(i.id),
        "batch_id": str(b.id),
        "product": str(b.product_id),
        "title": b.product.title,
        "batch": b.batch,
        "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
        "unit_of_issue": i.unit_of_issue,
        "packs_per_unit": b.packs_per_unit,
        "purchased_quantity": i.purchased_quantity,
        "free_quantity": i.free_quantity,
        "total_quantity": i.total_quantity,
        "item_price": str(i.item_price),
        "item_final_price": str(i.item_final_price),
        "item_discount_total": str(i.item_discount_total),
        "item_total": str(i.item_total),
        "is_received": i.is_received,
    }


def _shipment_out(order, viewer):
    try:
        sh = order.shipment
    except Exception:
        return None
    legs = list(sh.legs.select_related("agent__user", "provider", "destination_collection_point").order_by("sequence"))
    return {
        "id": str(sh.id), "method": sh.method, "status": sh.status, "total_cost": str(sh.total_cost),
        "tracking_number": sh.tracking_number,
        "collection_point": sh.destination_collection_point.title if sh.destination_collection_point_id else None,
        "delivery_code": sh.delivery_code if viewer == "buyer" else None,
        "delivered_at": sh.delivered_at.isoformat() if sh.delivered_at else None,
        "legs": [{
            "id": str(l.id), "kind": l.kind, "mode": l.mode, "status": l.status,
            "provider_title": l.provider.title if l.provider_id else None,
            "agent_name": " ".join(x for x in (l.agent.user.first_name, l.agent.user.last_name) if x) if l.agent_id else None,
            "to_title": l.destination_collection_point.title if l.destination_collection_point_id else None,
            "distance_km": str(l.distance_km), "cost": str(l.cost) if viewer == "seller" else None,
        } for l in legs],
    }


def order_out(order, viewer="buyer"):
    from manufacturers.services.payments import amount_due, payment_out

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
        "manufacturer": str(order.manufacturer_id),
        "manufacturer_title": order.manufacturer.title,
        "distributor": str(order.distributor_id),
        "distributor_title": order.distributor.title,
        "gross_price_total": str(order.gross_price_total),
        "discount_total": str(order.discount_total),
        "final_price_total": str(order.final_price_total),
        "shipping_amount": str(order.shipping_amount),
        "amount_due": str(amount_due(order)),
        "is_paid": is_paid(order),
        "notes": order.notes,
        "rejected_reason": order.rejected_reason,
        "created": order.created.isoformat() if order.created else None,
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        "collected_at": order.collected_at.isoformat() if order.collected_at else None,
        "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
        "received_at": order.received_at.isoformat() if order.received_at else None,
        "items": [item_out(i) for i in order.items.select_related("batch__product")],
        "payments": [payment_out(p) for p in order.payments.all()[:20]],
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
            "pickup_code": f.pickup_code if viewer == "buyer" and order.delivery_method == "SELF" else None,
        }
    return out


def orders_for(*, manufacturer=None, distributor=None, scope="OPEN", q=None):
    qs = DistributorPurchaseOrders.objects.select_related("manufacturer", "distributor").order_by("-created")
    if manufacturer is not None:
        qs = qs.filter(manufacturer=manufacturer)
    if distributor is not None:
        qs = qs.filter(distributor=distributor)
    scope = str(scope or "OPEN").upper()
    if scope == "OPEN":
        qs = qs.exclude(status__in=CLOSED)
    elif scope == "DONE":
        qs = qs.filter(status__in=CLOSED)
    if q:
        qs = qs.filter(Q(reference_number__icontains=q) | Q(distributor__title__icontains=q) | Q(manufacturer__title__icontains=q))
    return qs[:500]


# ---------------------------------------------------------------- placing

def _lines(wanted, manufacturer, staff):
    batches = {str(b.id): b for b in ManufacturerBatches.objects.select_related("product").filter(id__in=list(wanted.keys()), entity=manufacturer)}
    lines, gross, discount = [], Decimal("0"), Decimal("0")
    for bid, w in wanted.items():
        b = batches.get(bid)
        if not b:
            return ["An item is not made by this manufacturer"], None, 0, 0
        if not staff and (not b.is_listed or not b.product.active):
            return [f"{b.product.title} ({b.batch}) is not on sale"], None, 0, 0
        qty = w["quantity"]
        if qty < b.minimum_order_quantity:
            return [f"{b.product.title}: order at least {b.minimum_order_quantity} {b.unit_of_issue}"], None, 0, 0
        if b.expiry_date and b.expiry_date <= timezone.localdate():
            return [f"{b.product.title} batch {b.batch} has expired"], None, 0, 0
        free = free_quantity(b, qty)
        if b.current_quantity < qty + free:
            return [f"Only {b.current_quantity} {b.unit_of_issue} of {b.product.title} ({b.batch}) left"], None, 0, 0
        list_price = Decimal(b.unit_price or 0)
        price = Decimal(b.final_unit_price or 0) or list_price
        if price <= 0:
            return [f"{b.product.title} has no price set"], None, 0, 0
        line_gross = list_price * qty
        line_total = price * qty - min(w["discount"], price * qty)
        if staff and b.unit_cost and line_total < Decimal(b.unit_cost) * qty:
            return [f"{b.product.title}: the discount takes the price below production cost (KES {b.unit_cost} each)"], None, 0, 0
        lines.append((b, qty, free, list_price, line_total))
        gross += line_gross
        discount += line_gross - line_total
    return [], lines, gross, discount


def place_order(user, data, *, distributor=None, manufacturer=None):
    """
    Distributor staff (remote): PlaceOrder {manufacturer, items: [{batch_id, quantity}], delivery_method?, delivery_option?, notes?, draft_id?}
    Manufacturer staff:         CreateStaffOrder {distributor, items: [{batch_id, quantity, discount?}], order_terms?, notes?, draft_id?}
    """
    staff = manufacturer is not None
    errors = []
    if staff:
        distributor = Entities.objects.filter(id=data.get("distributor") or None, entity_type__in=DISTRIBUTOR_TYPES).first() if data.get("distributor") else None
        if not distributor:
            return ["Pick the distributor"], None
        if distributor.entity_type not in distributor_types_for(manufacturer):
            return [f"{distributor.title} can't buy this manufacturer's products"], None
    else:
        manufacturer = Entities.objects.filter(id=data.get("manufacturer") or None, entity_type__in=manufacturer_types_for(distributor)).first() if data.get("manufacturer") else None
        if not manufacturer:
            return ["Pick the manufacturer"], None

    draft = str(data.get("draft_id") or "").strip() or None
    if draft:
        done = DistributorPurchaseOrders.objects.filter(draft_id=draft, manufacturer=manufacturer, distributor=distributor).first()
        if done:
            return [], done

    method = str(data.get("delivery_method") or "SELF").upper()
    method = "SELF" if method == "PICKUP" else method
    if method not in ("SELF", "COURIER"):
        errors.append("Choose pickup or delivery")
    if method == "COURIER" and staff:
        errors.append("Staff orders are collected; the distributor chooses delivery when ordering remotely")
    terms = str(data.get("order_terms") or "CASH").upper()
    if terms not in ("CASH", "CREDIT"):
        errors.append("Terms must be cash or credit")
    if not staff and terms != "CASH":
        errors.append("Orders placed remotely are paid in cash (mobile money)")

    wanted = {}
    for row in data.get("items") or []:
        bid = str(row.get("batch_id") or row.get("batch") or "")
        try:
            qty = int(str(row.get("quantity")))
        except Exception:
            qty = 0
        if not bid or qty < 1:
            errors.append("Every line needs a product and a quantity of at least 1")
            continue
        prev = wanted.get(bid, {"quantity": 0, "discount": Decimal("0")})
        disc = Decimal("0")
        if staff and row.get("discount") not in (None, ""):
            try:
                disc = max(Decimal(str(row["discount"])), Decimal("0"))
            except Exception:
                errors.append("Discounts must be amounts")
        wanted[bid] = {"quantity": prev["quantity"] + qty, "discount": prev["discount"] + disc}
    if not wanted:
        errors.append("Add at least one product")
    if errors:
        return errors, None
    errors, lines, gross, discount = _lines(wanted, manufacturer, staff)
    if errors:
        return errors, None

    chosen = kg = None
    if method == "COURIER":
        from logistics.utils import deliveries as dl

        plan_errors, chosen, kg = dl.plan_purchase_order_delivery(
            manufacturer, distributor, [(b, qty + free) for b, qty, free, _, _ in lines], data.get("delivery_option"),
        )
        if plan_errors:
            return plan_errors, None

    with transaction.atomic():
        order = DistributorPurchaseOrders.objects.create(
            entity=distributor, owner=user, manufacturer=manufacturer, distributor=distributor,
            employee=employee_of(user, manufacturer if staff else distributor),
            reference_number=_ref(), draft_id=draft, order_terms=terms, delivery_method=method,
            order_origin="STAFF" if staff else "DISTRIBUTOR", status="SUBMITTED",
            gross_price_total=_money(gross), discount_total=_money(discount), final_price_total=_money(gross - discount),
            notes=str(data.get("notes") or "")[:300],
        )
        for b, qty, free, list_price, total in lines:
            DistributorPurchaseOrderItems.objects.create(
                order=order, batch=b, unit_of_issue=b.unit_of_issue, purchased_quantity=qty, free_quantity=free,
                total_quantity=qty + free, item_price=_money(list_price), item_final_price=_money(total / qty),
                item_discount_total=_money(list_price * qty - total), item_total=_money(total),
            )
        if chosen:
            from logistics.utils import deliveries as dl

            dl.attach_purchase_order_shipment(order, chosen, kg, user)
            order.shipping_amount = chosen["total"]
            order.save(update_fields=["shipping_amount", "updated"])
    _notify(order, "seller", f"New order {order.reference_number} from {distributor.title}: KES {order.final_price_total:,.0f}.")
    return [], order


def delivery_options(distributor, data):
    """GetDeliveryOptions {manufacturer, items: [{batch_id, quantity}], collection_point?} -> (errors, options, kg)."""
    from logistics.utils import deliveries as dl

    m = Entities.objects.filter(id=data.get("manufacturer") or None, entity_type__in=manufacturer_types_for(distributor)).first() if data.get("manufacturer") else None
    if not m:
        return ["Pick the manufacturer"], [], 0
    qty = {}
    for row in data.get("items") or []:
        bid = str(row.get("batch_id") or row.get("batch") or "")
        try:
            qty[bid] = qty.get(bid, 0) + max(int(str(row.get("quantity"))), 1)
        except Exception:
            continue
    batches = ManufacturerBatches.objects.select_related("product").filter(id__in=list(qty.keys()), entity=m)
    lines = [(b, qty[str(b.id)] + free_quantity(b, qty[str(b.id)])) for b in batches]
    if not lines:
        return ["Add products first"], [], 0
    return dl.purchase_order_delivery_options(m, distributor, lines, data.get("collection_point") or None)


# ---------------------------------------------------------------- notifications

def _notify(order, side, body):
    """Push to the other side's super admins (best effort)."""
    from django.db import transaction as tx

    def send():
        from authentication.models import Users
        from core.utils import send_push_notification

        entity = order.manufacturer if side == "seller" else order.distributor
        for u in Users.objects.filter(roles__entity=entity, roles__value__endswith="SuperAdmin").distinct():
            if u.notification_token:
                send_push_notification(u.notification_token, f"Order {order.reference_number}", body, {"type": "purchase_order", "order": str(order.id)})

    tx.on_commit(send)


# ---------------------------------------------------------------- rejecting / cancelling

def cancel_order(distributor, user, data):
    order = DistributorPurchaseOrders.objects.filter(id=data.get("order") or None, distributor=distributor).first() if data.get("order") else None
    if not order:
        return ["Order not found"], None
    if order.status != "SUBMITTED" or is_paid(order):
        return ["Only unpaid orders can be cancelled"], None
    order.status, order.cancelled_at = "CANCELLED", timezone.now()
    order.save(update_fields=["status", "cancelled_at", "updated"])
    return [], order


def reject_order(manufacturer, user, data):
    order = DistributorPurchaseOrders.objects.filter(id=data.get("order") or None, manufacturer=manufacturer).first() if data.get("order") else None
    if not order:
        return ["Order not found"], None
    if order.status != "SUBMITTED" or is_paid(order):
        return ["Only unpaid orders can be rejected"], None
    reason = str(data.get("reason") or "").strip()
    if not reason:
        return ["Say why the order is rejected"], None
    order.status, order.rejected_reason, order.rejected_at = "REJECTED", reason[:300], timezone.now()
    order.save(update_fields=["status", "rejected_reason", "rejected_at", "updated"])
    _notify(order, "buyer", f"{order.manufacturer.title} rejected order {order.reference_number}: {reason}")
    return [], order


# ---------------------------------------------------------------- paid

def mark_paid(order):
    """Successful payments cover the order: paid, stock off the batches once, fulfilment opened."""
    from logistics.models import Fulfilment

    with transaction.atomic():
        order = DistributorPurchaseOrders.objects.select_for_update().get(id=order.id)
        if order.status == "SUBMITTED":
            order.status = "PAID"
        order.is_paid = True
        order.paid_at = order.paid_at or timezone.now()
        if not order.stock_deducted_at:
            for i in order.items.all():
                ManufacturerBatches.objects.filter(id=i.batch_id).update(current_quantity=F("current_quantity") - i.total_quantity)
            order.stock_deducted_at = timezone.now()
        order.save()
        Fulfilment.objects.get_or_create(
            distributor_purchase_order=order,
            defaults={"entity": order.manufacturer, "pickup_code": f"{secrets.randbelow(10**6):06d}"},
        )
    _notify(order, "seller", f"Order {order.reference_number} from {order.distributor.title} is paid. Prepare it.")
    return order


# ---------------------------------------------------------------- fulfilment (manufacturer staff)

def fulfil(manufacturer, user, data):
    """Fulfil {order, stage: PREPARING|PACKED|READY, package_count?, package_weight_kg?}."""
    order = DistributorPurchaseOrders.objects.filter(id=data.get("order") or None, manufacturer=manufacturer).first() if data.get("order") else None
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
        order.save(update_fields=["status", "updated"])
    if stage == "READY":
        _notify(order, "buyer", f"Order {order.reference_number} is ready" + (" for collection." if order.delivery_method == "SELF" else "; it will be dispatched."))
    return [], order


def confirm_collection(manufacturer, user, data):
    """ConfirmCollection {order, code, collector_name?, collector_phone?}: pickup orders; the goods share is then due."""
    order = DistributorPurchaseOrders.objects.filter(id=data.get("order") or None, manufacturer=manufacturer).first() if data.get("order") else None
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
        order.status, order.collected_at = "COLLECTED", now
        order.save(update_fields=["status", "collected_at", "updated"])
        from payments.utils.order_payouts import release_vendor

        release_vendor("manufacturer", order, None, "Collected by the distributor")
    return [], order


# ---------------------------------------------------------------- receiving (the distributor)

def receive_order(distributor, user, data):
    """
    ReceiveOrder {order, lines?: [{item, unit_selling_price}]}: once collected or delivered,
    book every line into the distributor's stock (DistributorReceipts) in packs when a unit
    of issue holds several, costed at what was paid (free units lower the unit cost).
    """
    from distributors.models import DistributorReceipts

    order = DistributorPurchaseOrders.objects.filter(id=data.get("order") or None, distributor=distributor).select_related("manufacturer").first() if data.get("order") else None
    if not order:
        return ["Order not found"], None
    if order.status == "RECEIVED":
        return ["Already received"], None
    delivered = order.status == "COLLECTED" or (order.delivery_method == "COURIER" and bool(order.delivered_at))
    if not delivered:
        return ["Receive it once it has been collected or delivered"], None
    prices = {str(l.get("item")): l.get("unit_selling_price") for l in (data.get("lines") or [])}
    employee = employee_of(user, distributor)
    now = timezone.now()
    with transaction.atomic():
        for i in order.items.select_related("batch__product").filter(is_received=False):
            b = i.batch
            packs = max(int(b.packs_per_unit or 1), 1)
            if packs > 1:
                unit, qty = "Pack", i.total_quantity * packs
            else:
                unit, qty = (b.unit_of_issue if b.unit_of_issue in DISTRIBUTOR_UNITS else "Pack"), i.total_quantity
            cost = _money(Decimal(i.item_total) / max(qty, 1))
            try:
                sell = Decimal(str(prices.get(str(i.id)) or 0))
            except Exception:
                sell = Decimal("0")
            DistributorReceipts.objects.create(
                entity=distributor, owner=user, employee=employee, product=b.product, received_from=order.manufacturer,
                batch=b.batch, manufacture_date=b.manufacture_date, expiry_date=b.expiry_date,
                received_unit_quantity=qty, current_unit_quantity=qty, pack_quantity=qty, unit_of_receipt=unit,
                unit_buying_price=cost, unit_selling_price=sell, final_unit_selling_price=sell,
                pack_buying_price=cost, pack_selling_price=sell, is_listed=sell > 0,
                description=f"From {order.manufacturer.title}, order {order.reference_number}"[:300],
            )
            i.is_received, i.received_at = True, now
            i.save(update_fields=["is_received", "received_at"])
        order.status, order.received_at, order.received_by = "RECEIVED", now, user
        order.save()
    return [], order
