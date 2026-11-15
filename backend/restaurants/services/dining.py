# restaurants/services/dining.py
#
# Dining service on top of the restaurants models. A restaurant is just an
# entity (entity_type "Restaurant"); its owner/staff manage it while working in
# that entity.
#
# Customers (any signed-in user):
#   browse restaurants · see the menu · order for DELIVERY (priced by the
#   logistics delivery options, dispatched by the restaurant), PICKUP, or
#   DINE_IN (a table booking: when + how many, optionally with food ordered
#   ahead) · pay by mobile money into the system till.
# Restaurant staff:
#   menu items (price, availability, section, photo) · tables · the orders
#   board: RECEIVED -> PROCESSING -> READY -> DISPATCHED/DELIVERED (delivery),
#   COMPLETED (pickup), SERVED -> COMPLETED (dine in); cancel; record cash.

import math
import secrets
from datetime import timedelta
from decimal import Decimal

from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from authentication.models import Entities
from restaurants import models as rm

RESTAURANT_TYPES = ("Restaurant",)
FOOD_KG_PER_PORTION = Decimal("0.5")
OPEN_STATUSES = ("RECEIVED", "PROCESSING", "READY", "DISPATCHED", "ASSIGNED")
SERVICE_LABELS = {"DELIVERY": "Delivery", "PICKUP": "Pickup", "DINE_IN": "Dine in"}

# Which status a restaurant may move an order to, from where, per service.
NEXT = {
    "RECEIVED": {"PROCESSING", "CANCELLED"},
    "PROCESSING": {"READY", "CANCELLED"},
    "READY": {"COMPLETED", "SERVED"},  # delivery orders leave READY by dispatch
    "SERVED": {"COMPLETED"},
}


def _q(v):
    return Decimal(v).quantize(Decimal("0.01"))


def _image_url(item, request):
    img = item.images.order_by("-created").first() if item.pk else None
    if not img or not img.image:
        return None
    f = img.thumbnail or img.image
    try:
        return request.build_absolute_uri(f.url) if request else f.url
    except Exception:
        return None


def is_restaurant_staff(user):
    return bool(getattr(user, "entity_id", None)) and user.entity.entity_type in RESTAURANT_TYPES


# ================================================================ customers

def list_restaurants(data, user):
    from entitylocations.models import Locations
    from logistics.utils.deliveries import km_between

    qs = Entities.objects.filter(entity_type__in=RESTAURANT_TYPES).order_by("title")
    q = str(data.get("q") or "").strip()
    if q:
        qs = qs.filter(title__icontains=q)
    entities = list(qs[:300])
    points = {l.entity_id: l.point for l in Locations.objects.filter(entity__in=entities, point__isnull=False)}
    here = None
    try:
        here = Point(float(data["longitude"]), float(data["latitude"]), srid=4326)
    except (KeyError, TypeError, ValueError):
        pass
    counts = {}
    for row in rm.MenuItem.objects.filter(entity__in=entities, is_available=True, price__gt=0).values("entity_id"):
        counts[row["entity_id"]] = counts.get(row["entity_id"], 0) + 1
    out = []
    for e in entities:
        p = points.get(e.id)
        out.append({
            "id": str(e.id),
            "title": e.title,
            "town": e.town,
            "road": e.road,
            "building": e.building,
            "phone": getattr(e, "phone", None),
            "description": getattr(e, "description", None),
            "latitude": p.y if p else None,
            "longitude": p.x if p else None,
            "distance_km": float(km_between(here, p)) if here and p else None,
            "menu_items": counts.get(e.id, 0),
            "delivers": bool(p),
        })
    out.sort(key=lambda r: (r["menu_items"] == 0, r["distance_km"] if r["distance_km"] is not None else 1e9, r["title"]))
    return out


def menu_item_out(item, request=None):
    return {
        "id": str(item.id),
        "title": item.title,
        "description": item.description,
        "price": str(item.price),
        "is_available": item.is_available,
        "category": item.category or (item.menu.title.title() if item.menu_id and item.menu and item.menu.title else None),
        "preparation_minutes": item.preparation_minutes,
        "image_url": _image_url(item, request),
    }


def restaurant_menu(entity_id, request=None, staff=False):
    entity = Entities.objects.filter(id=entity_id, entity_type__in=RESTAURANT_TYPES).first()
    if not entity:
        return ["Restaurant not found"], None
    items = rm.MenuItem.objects.filter(entity=entity).select_related("menu").prefetch_related("images").order_by("category", "title")
    if not staff:
        items = items.filter(is_available=True, price__gt=0)
    tables = rm.BranchTable.objects.filter(entity=entity).order_by("title")
    return [], {
        "restaurant": {"id": str(entity.id), "title": entity.title, "town": entity.town, "road": entity.road, "building": entity.building},
        "items": [menu_item_out(i, request) for i in items],
        "tables": [table_out(t) for t in tables] if staff else [],
    }


def _lines(entity, raw_items):
    """[(menu_item, qty)] for this restaurant, validated."""
    errors, lines = [], []
    ids = [str(i.get("menu_item") or "") for i in raw_items or []]
    found = {str(m.id): m for m in rm.MenuItem.objects.filter(id__in=ids, entity=entity)}
    for raw in raw_items or []:
        item = found.get(str(raw.get("menu_item") or ""))
        try:
            qty = int(raw.get("quantity") or 0)
        except (TypeError, ValueError):
            qty = 0
        if not item:
            errors.append("An item on your order is no longer on the menu")
        elif not item.is_available or item.price <= 0:
            errors.append(f"{(item.title or 'An item').title()} isn't available right now")
        elif not 1 <= qty <= 50:
            errors.append(f"Choose between 1 and 50 of {(item.title or 'each item').title()}")
        else:
            lines.append((item, qty))
    return errors, lines


def _food_kg(lines):
    return sum((FOOD_KG_PER_PORTION * q for _, q in lines), Decimal("0")) or FOOD_KG_PER_PORTION


def food_delivery_options(data):
    """Priced delivery options from the restaurant to the customer."""
    from logistics.utils.deliveries import delivery_location_errors, delivery_options, entity_point

    entity = Entities.objects.filter(id=data.get("entity"), entity_type__in=RESTAURANT_TYPES).first()
    if not entity:
        return ["Restaurant not found"], [], Decimal("0")
    errors = delivery_location_errors(entity)
    if errors:
        return errors, [], Decimal("0")
    try:
        dest = Point(float(data["destination_longitude"]), float(data["destination_latitude"]), srid=4326)
    except (KeyError, TypeError, ValueError):
        return ["Share where to deliver"], [], Decimal("0")
    errors, lines = _lines(entity, data.get("items"))
    if errors:
        return errors, [], Decimal("0")
    kg = _food_kg(lines)
    return [], delivery_options(entity, entity_point(entity), dest, kg), kg


def place_order(data, user):
    """Returns (errors, order)."""
    from logistics.utils.deliveries import _create_quoted_shipment, entity_point

    entity = Entities.objects.filter(id=data.get("entity"), entity_type__in=RESTAURANT_TYPES).first()
    if not entity:
        return ["Restaurant not found"], None
    service = str(data.get("service_type") or "").upper()
    if service not in SERVICE_LABELS:
        return ["Choose delivery, pickup or dine in"], None
    errors, lines = _lines(entity, data.get("items"))
    if service != "DINE_IN" and not lines:
        errors.append("Add something from the menu")
    if errors:
        return errors, None

    reservation_at, party_size = None, None
    if service == "DINE_IN":
        reservation_at = parse_datetime(str(data.get("reservation_at") or ""))
        if not reservation_at:
            return ["Pick the date and time you'll come in"], None
        if timezone.is_naive(reservation_at):
            reservation_at = timezone.make_aware(reservation_at)
        now = timezone.now()
        if reservation_at < now - timedelta(minutes=5) or reservation_at > now + timedelta(days=30):
            return ["Book a time from now up to 30 days ahead"], None
        try:
            party_size = int(data.get("party_size") or 0)
        except (TypeError, ValueError):
            party_size = 0
        if not 1 <= party_size <= 50:
            return ["How many people? (1–50)"], None

    chosen, kg, dest = None, Decimal("0"), None
    if service == "DELIVERY":
        errs, options, kg = food_delivery_options({**data, "entity": str(entity.id)})
        if errs:
            return errs, None
        chosen = next((o for o in options if o["key"] == str(data.get("delivery_option") or "")), None)
        if not chosen:
            return ["That delivery option is no longer available; choose again"], None
        dest = Point(float(data["destination_longitude"]), float(data["destination_latitude"]), srid=4326)

    items_cost = sum((item.price * qty for item, qty in lines), Decimal("0"))
    shipping = chosen["total"] if chosen else Decimal("0")
    staff = getattr(user, "entity_id", None) == entity.id
    with transaction.atomic():
        order = rm.BranchFoodOrder.objects.create(
            entity=entity,
            owner=user,
            customer=None if staff else user,
            customer_name=str(data.get("customer_name") or "")[:56] or None,
            customer_phone=str(data.get("customer_phone") or "")[:56] or None,
            document_number=f"FO{timezone.now():%y%m%d}{secrets.token_hex(3).upper()}",
            order_origin="STAFF" if staff else "CUSTOMER",
            order_channel=str(data.get("order_channel") or "WEB")[:20],
            service_type=service,
            delivery_method="DELIVERY" if service == "DELIVERY" else "PICKUP",
            party_size=party_size,
            reservation_at=reservation_at,
            notes=str(data.get("notes") or "")[:300] or None,
            status="RECEIVED",
            order_items_cost=_q(items_cost),
            shipping_cost=_q(shipping),
            order_total=_q(items_cost + shipping),
            origin_point=entity_point(entity),
            destination_point=dest,
            draft_id=str(data.get("draft_id") or "")[:256] or None,
        )
        for item, qty in lines:
            rm.BranchFoodOrderItem.objects.create(
                entity=entity, owner=user, branch_food_order=order, menu_item=item,
                title=item.title, quantity=qty, unit_price=item.price, line_total=_q(item.price * qty),
            )
        if chosen:
            _create_quoted_shipment(
                seller=entity, user=user, chosen=chosen, kg=kg, origin=entity_point(entity), destination=dest,
                recipient_name=order.customer_name, recipient_phone=order.customer_phone, food_order=order,
            )
    _notify_restaurant(order)
    return [], order


def my_orders(user):
    return rm.BranchFoodOrder.objects.filter(customer=user).select_related("entity").order_by("-created")[:100]


def cancel_my_order(data, user):
    order = rm.BranchFoodOrder.objects.filter(id=data.get("food_order"), customer=user).first()
    if not order:
        return ["Order not found"], None
    if order.status != "RECEIVED" or order.is_paid == "true":
        return ["The restaurant has started on this order; call them to change it"], None
    order.status = "CANCELLED"
    order.save()
    return [], order


# ================================================================ payments (system till)

def amount_due(order):
    paid = sum(
        (p.amount for p in rm.BranchFoodOrderPayment.objects.filter(branch_food_order=order, status="SUCCESS")),
        Decimal("0"),
    )
    return max(Decimal("0"), Decimal(order.order_total or 0) - paid)


def _mark_paid(order):
    if order.is_paid != "true" and amount_due(order) <= 0:
        order.is_paid = "true"
        order.paid_at = timezone.now()
        order.save(update_fields=["is_paid", "paid_at", "updated"])


def pay_mobile_money(data, user):
    """STK push for what's due. Returns (errors, payment)."""
    from authentication.utils.utils import generate_reference_number, use_reference_number
    from payments.models import PaymentMethods
    from payments.utils.system_till import push_to_system_till

    order = rm.BranchFoodOrder.objects.filter(id=data.get("food_order")).select_related("entity").first()
    if not order or user.id not in (order.customer_id, order.owner_id) and getattr(user, "entity_id", None) != order.entity_id:
        return ["Order not found"], None
    if order.status == "CANCELLED":
        return ["This order was cancelled"], None
    due = amount_due(order)
    if due <= 0:
        _mark_paid(order)
        return ["This order is already paid"], None
    phone = str(data.get("mobile_money_phone") or "").strip()
    if not phone:
        return ["Enter the M-Pesa phone number to charge"], None
    method = PaymentMethods.objects.filter(title="MOBILE MONEY").first()
    if not method:
        return ["Mobile money isn't set up"], None
    reference = generate_reference_number(order.entity, user)
    errors, result, telco = push_to_system_till(reference, math.ceil(due), phone, description=f"Food {order.entity.title}"[:60])
    if errors:
        return errors, None
    payment = rm.BranchFoodOrderPayment.objects.create(
        entity=order.entity, owner=user, branch_food_order=order, payment_method=method,
        reference_number=reference, psp_reference_number=str(result.get("ref") or "")[:50],
        status="PENDING", description="Waiting for PIN entry.", amount=math.ceil(due), currency="KES", telco_name=(telco or "")[:28],
    )
    use_reference_number(reference)
    return [], payment


def refresh_payment(data, user):
    """Poll the system till for a pending payment. Returns (errors, payment)."""
    from payments.utils.system_till import PENDING_TIMEOUT_MINUTES, fetch_transaction

    payment = rm.BranchFoodOrderPayment.objects.filter(reference_number=data.get("reference")).select_related("branch_food_order").first()
    if not payment:
        return ["Payment not found"], None
    order = payment.branch_food_order
    if user.id not in (order.customer_id, order.owner_id) and getattr(user, "entity_id", None) != order.entity_id:
        return ["Payment not found"], None
    if payment.status == "PENDING":
        if payment.created < timezone.now() - timedelta(minutes=PENDING_TIMEOUT_MINUTES):
            payment.status, payment.description = "FAILED", "Payment expired (no PIN entered)."
            payment.save()
        else:
            tx = fetch_transaction(payment.reference_number)
            status = (tx or {}).get("status")
            if status and status != "PENDING":
                with transaction.atomic():
                    payment = rm.BranchFoodOrderPayment.objects.select_for_update().get(id=payment.id)
                    if payment.status == "PENDING":
                        payment.status = "SUCCESS" if status == "SUCCESS" else "FAILED"
                        payment.description = str(tx.get("description") or payment.description)[:50]
                        payment.provider_reference_num = str(tx.get("providerRef") or "")[:50]
                        payment.save()
                        if payment.status == "SUCCESS":
                            _mark_paid(order)
    return [], payment


def record_cash(data, user):
    """Restaurant staff take cash / card at the counter. Returns (errors, order)."""
    from payments.models import PaymentMethods

    order = rm.BranchFoodOrder.objects.filter(id=data.get("food_order"), entity=user.entity).first()
    if not order:
        return ["Order not found"], None
    due = amount_due(order)
    if due <= 0:
        return ["This order is already paid"], None
    method = PaymentMethods.objects.filter(id=data.get("payment_method")).first() or PaymentMethods.objects.filter(title="CASH").first()
    if not method:
        return ["Pick a payment method"], None
    rm.BranchFoodOrderPayment.objects.create(
        entity=order.entity, owner=user, branch_food_order=order, payment_method=method,
        reference_number=f"CASH{secrets.token_hex(4).upper()}", status="SUCCESS",
        description=f"{method.title} at the restaurant"[:50], amount=due, currency="KES", is_settled=True,
    )
    _mark_paid(order)
    order.refresh_from_db()
    return [], order


# ================================================================ restaurant staff

def table_out(t):
    return {"id": str(t.id), "title": t.title, "seats": t.seats, "description": t.description, "is_available": t.is_available}


def save_menu_item(data, files, user):
    get = lambda k: str(data.get(k) or "").strip()
    item = None
    if get("id"):
        item = rm.MenuItem.objects.filter(id=get("id"), entity=user.entity).first()
        if not item:
            return ["Menu item not found"], None
    title = get("title")
    if not title:
        return ["Give the dish a name"], None
    try:
        price = _q(get("price") or "0")
    except Exception:
        return ["Enter a valid price"], None
    if price <= 0:
        return ["Enter the price"], None
    clash = rm.MenuItem.objects.filter(entity=user.entity, title__iexact=title, menu__isnull=True)
    if item:
        clash = clash.exclude(id=item.id)
    if clash.exists():
        return ["A dish with this name is already on your menu"], None
    prep = get("preparation_minutes")
    with transaction.atomic():
        item = item or rm.MenuItem(entity=user.entity, owner=user)
        item.title = title
        item.description = get("description")[:256] or None
        item.category = get("category")[:64] or None
        item.price = price
        item.preparation_minutes = int(prep) if prep.isdigit() else None
        if "is_available" in data:
            item.is_available = str(data.get("is_available")).lower() in ("true", "1", "yes")
        item.save()
        image = files.get("image") if files else None
        if image:
            img = rm.MenuItemImages.objects.create(entity=user.entity, owner=user, menu_item=item, image=image)
            item.images.add(img)
    return [], item


def save_table(data, user):
    get = lambda k: str(data.get(k) or "").strip()
    table = None
    if get("id"):
        table = rm.BranchTable.objects.filter(id=get("id"), entity=user.entity).first()
        if not table:
            return ["Table not found"], None
    if not get("title"):
        return ["Name the table, e.g. T1 or Terrace 2"], None
    try:
        seats = int(get("seats") or 0)
    except ValueError:
        seats = 0
    if not 1 <= seats <= 100:
        return ["How many seats? (1–100)"], None
    table = table or rm.BranchTable(entity=user.entity, owner=user)
    table.title = get("title")
    table.seats = seats
    table.description = get("description")[:48] or None
    if "is_available" in data:
        table.is_available = str(data.get("is_available")).lower() in ("true", "1", "yes")
    table.save()
    return [], table


def restaurant_orders(data, user):
    qs = rm.BranchFoodOrder.objects.filter(entity=user.entity).select_related("branch_table").order_by("-created")
    if data.get("scope") == "done":
        return qs.exclude(status__in=OPEN_STATUSES)[:200]
    return qs.filter(status__in=OPEN_STATUSES)[:300]


def update_status(data, user):
    """Restaurant moves an order along. Returns (errors, order)."""
    order = rm.BranchFoodOrder.objects.filter(id=data.get("food_order"), entity=user.entity).first()
    if not order:
        return ["Order not found"], None
    new = str(data.get("status") or "").upper()
    if new not in NEXT.get(order.status, set()):
        return [f"An order that is {order.status.lower()} can't move to {new.lower() or 'that'}"], None
    if order.service_type == "DELIVERY" and new in ("PROCESSING",) and order.is_paid != "true":
        return ["Start delivery orders once they are paid"], None
    if new == "SERVED" and order.service_type != "DINE_IN":
        return ["Only dine-in orders are served at a table"], None
    if new == "COMPLETED" and order.service_type == "DELIVERY":
        return ["Delivery orders complete when the delivery is confirmed"], None
    if new == "COMPLETED" and order.service_type == "PICKUP" and order.is_paid != "true":
        return ["Take payment before handing the order over"], None
    if data.get("table") and order.service_type == "DINE_IN":
        order.branch_table = rm.BranchTable.objects.filter(id=data["table"], entity=user.entity).first()
    now = timezone.now()
    order.status = new
    if new == "READY":
        order.ready_at = now
    if new in ("COMPLETED",):
        order.completed_at = now
        order.is_served = "true"
    if new == "SERVED":
        order.is_served = "true"
    order.save()
    _notify_customer(order)
    return [], order


# ================================================================ output + notifications

def order_out(order, request=None, for_customer=False):
    from logistics.models import Shipment

    items = rm.BranchFoodOrderItem.objects.filter(branch_food_order=order).select_related("menu_item")
    shipment = Shipment.objects.filter(food_order=order).first()
    last_payment = rm.BranchFoodOrderPayment.objects.filter(branch_food_order=order).order_by("-created").first()
    return {
        "id": str(order.id),
        "reference": order.document_number,
        "restaurant": str(order.entity_id),
        "restaurant_title": order.entity.title if order.entity_id else None,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "service_type": order.service_type,
        "status": order.status,
        "is_paid": order.is_paid == "true",
        "items": [
            {"title": (i.title or (i.menu_item.title if i.menu_item_id else "Item")), "quantity": i.quantity, "unit_price": str(i.unit_price), "line_total": str(i.line_total)}
            for i in items
        ],
        "items_cost": str(order.order_items_cost or 0),
        "shipping_cost": str(order.shipping_cost or 0),
        "total": str(order.order_total or 0),
        "amount_due": str(amount_due(order)),
        "party_size": order.party_size,
        "reservation_at": order.reservation_at.isoformat() if order.reservation_at else None,
        "table": order.branch_table.title if order.branch_table_id else None,
        "notes": order.notes,
        "has_delivery": bool(shipment),
        "shipment_status": shipment.status if shipment else None,
        "last_payment": {
            "reference": last_payment.reference_number, "status": last_payment.status, "description": last_payment.description,
        } if last_payment else None,
        "created": order.created.isoformat() if order.created else None,
        "ready_at": order.ready_at.isoformat() if order.ready_at else None,
    }


def _push(user, title, body, data=None):
    from core.utils import send_push_notification

    if user and getattr(user, "notification_token", None):
        try:
            send_push_notification(user.notification_token, title, body, data or {})
        except Exception:
            pass


def _notify_customer(order):
    msgs = {
        "PROCESSING": "is being prepared",
        "READY": "is ready" + (" — come and collect it" if order.service_type == "PICKUP" else ""),
        "SERVED": "has been served. Enjoy!",
        "CANCELLED": "was cancelled by the restaurant",
        "COMPLETED": "is complete. Thank you!",
    }
    if order.customer_id and order.status in msgs:
        _push(order.customer, order.entity.title, f"Your order {order.document_number} {msgs[order.status]}", {"type": "FOOD_ORDER", "order": str(order.id)})


def _notify_restaurant(order):
    """Tell the restaurant owner a new order / booking came in (push)."""
    kind = {"DINE_IN": "table booking", "DELIVERY": "delivery order", "PICKUP": "pickup order"}.get(order.service_type, "order")
    when = f" for {timezone.localtime(order.reservation_at):%a %d %b %H:%M} ({order.party_size} people)" if order.reservation_at else ""
    _push(order.entity.owner if order.entity_id else None, "New " + kind, f"{order.document_number}{when} · KES {order.order_total}", {"type": "FOOD_ORDER", "order": str(order.id)})
