# logistics/utils/fulfilment.py
#
# Order fulfilment after payment, before the goods leave:
#
#   PAID -> PREPARING -> PACKED -> READY -> COLLECTED      (buyer collects)
#                                        -> dispatch       (delivery: shipment legs)
#
# One Fulfilment row per order (retailer order or customer order), kept by the
# seller's staff. Dispatch is only allowed once the order is READY. The buyer
# is notified when a pickup order is ready (with its pickup code), when it is
# collected, and when a delivery order is ready to go out.

import secrets
import threading

from django.db import transaction
from django.utils import timezone

from logistics.models import Fulfilment
from logistics.utils.deliveries import _order_paid, _seller_order, delivery_requested
from utils.logging import create_log

Stage = Fulfilment.Stage

# Order status the order moves to at each stage (both order models carry these).
ORDER_STATUS = {
    Stage.PREPARING: "PROCESSING",
    Stage.PACKED: "PACKED",
    Stage.READY: "READY",
    Stage.COLLECTED: "COLLECTED",
}


# ---------------------------------------------------------------- lookups

def _link(order, kind):
    return {"customer_order": order} if kind == "customer" else {"retailer_order": order}


def fulfilment_of(order, kind, user=None, create=True):
    f = Fulfilment.objects.filter(**_link(order, kind)).first()
    if f or not create:
        return f
    seller = order.entity if kind == "customer" else order.wholesaler
    return Fulfilment.objects.create(entity=seller, owner=user, **_link(order, kind))


def _staff_user(entity, user_id, fallback):
    """A user who works for the seller (an active employee, or the caller)."""
    from django.contrib.auth import get_user_model
    from employees.models import Employees

    if not user_id or str(user_id) == str(fallback.id):
        return fallback, None
    if not Employees.objects.filter(entity=entity, user_id=user_id, is_active="true").exists():
        return None, "Pick someone who works here"
    return get_user_model().objects.filter(id=user_id).first(), None


def _ready_to_work(data, user):
    """(errors, order, kind, fulfilment) for a paid, open order of the caller's business."""
    err, order, kind = _seller_order(data, user)
    if err:
        return [err], None, None, None
    if str(order.status).upper() == "CANCELLED":
        return ["This order was cancelled"], None, None, None
    if not _order_paid(order, kind):
        return ["Prepare the order once it is paid"], None, None, None
    return [], order, kind, fulfilment_of(order, kind, user)


def is_ready_for_dispatch(order, kind):
    f = fulfilment_of(order, kind, create=False)
    return bool(f) and f.stage == Stage.READY


def _set_order_status(order, stage):
    status = ORDER_STATUS.get(stage)
    if status:
        order.status = status


# ---------------------------------------------------------------- notifications

def _buyer_contacts(order, kind):
    """(phones, push tokens, buyer name) to tell the buyer about their order."""
    phones, tokens = [], []
    if kind == "customer":
        if order.customer_phone:
            phones.append(order.customer_phone)
        for u in (order.customer, getattr(order, "user", None)):
            if u and getattr(u, "notification_token", None) and u.entity_id != order.entity_id:
                tokens.append(u.notification_token)
        name = order.customer_name or "Customer"
    else:
        retailer = order.retailer
        phone = getattr(retailer, "phone", None) or getattr(getattr(order, "owner", None), "phone", None)
        if phone:
            phones.append(phone)
        owner = getattr(order, "owner", None)
        if owner and getattr(owner, "notification_token", None):
            tokens.append(owner.notification_token)
        name = retailer.title
    return phones, list(dict.fromkeys(tokens)), name


def _order_ref(order, kind):
    doc = order.order_number if kind == "customer" else order.document_number
    return getattr(doc, "document_number", None) or order.reference_number or str(order.id)[:8]


def notify_buyer(order, kind, title, body):
    """SMS + push to the buyer, off the request thread; failures are only logged."""
    phones, tokens, _ = _buyer_contacts(order, kind)
    data = {"type": "ORDER_FULFILMENT", "kind": kind, "order": str(order.id)}

    def send():
        from core.utils import send_push_notification, send_sms

        for phone in phones:
            errs, _ = send_sms(phone, body)
            if errs:
                create_log("error", f"Fulfilment SMS failed: {errs}")
        for token in tokens:
            send_push_notification(token, title, body, data)

    if phones or tokens:
        transaction.on_commit(lambda: threading.Thread(target=send, daemon=True).start())


def _broadcast(order, kind):
    if kind == "retailer":
        from wholesalers.services.retailer_order_payments import broadcast_order

        transaction.on_commit(lambda: broadcast_order(order))


# ---------------------------------------------------------------- stages

def start_preparing(data, user):
    """Seller: someone starts picking the order. "preparer" = an employee (default: caller)."""
    errors, order, kind, f = _ready_to_work(data, user)
    if errors:
        return errors, None
    if f.stage not in (Stage.PENDING, Stage.PREPARING):
        return ["This order is already past preparation"], None
    preparer, err = _staff_user(f.entity, data.get("preparer"), user)
    if err:
        return [err], None
    now = timezone.now()
    with transaction.atomic():
        f.stage = Stage.PREPARING
        f.prepared_by = preparer
        f.preparing_at = f.preparing_at or now
        f.notes = (data.get("notes") or f.notes or "")[:300] or None
        f.save()
        _set_order_status(order, Stage.PREPARING)
        if kind == "retailer":
            order.processed_by = preparer
        order.save()
        _broadcast(order, kind)
    return [], f


def mark_packed(data, user):
    """Seller: the goods are packed. "packer" (employee), "package_count", "package_weight_kg"."""
    errors, order, kind, f = _ready_to_work(data, user)
    if errors:
        return errors, None
    if f.stage not in (Stage.PENDING, Stage.PREPARING, Stage.PACKED):
        return ["This order is already packed and ready"], None
    packer, err = _staff_user(f.entity, data.get("packer"), user)
    if err:
        return [err], None
    try:
        count = max(1, int(data.get("package_count") or 1))
    except (TypeError, ValueError):
        return ["Enter the number of packages"], None
    weight = data.get("package_weight_kg")
    if weight not in (None, ""):
        try:
            weight = round(float(weight), 2)
            if weight < 0:
                raise ValueError
        except (TypeError, ValueError):
            return ["Enter a valid package weight"], None
    else:
        weight = None
    now = timezone.now()
    with transaction.atomic():
        if not f.prepared_by_id:
            f.prepared_by = packer
            f.preparing_at = f.preparing_at or now
        f.stage = Stage.PACKED
        f.packed_by = packer
        f.packed_at = now
        f.package_count = count
        f.package_weight_kg = weight
        f.save()
        _set_order_status(order, Stage.PACKED)
        order.is_packed = "true"
        order.packed_by = packer
        order.packed_at = now
        order.save()
        _broadcast(order, kind)
    return [], f


def mark_ready(data, user):
    """Seller: packed goods are at the counter (pickup) or the dispatch bay (delivery)."""
    errors, order, kind, f = _ready_to_work(data, user)
    if errors:
        return errors, None
    if f.stage != Stage.PACKED:
        return ["Pack the order first"], None
    pickup = not delivery_requested(order)
    now = timezone.now()
    with transaction.atomic():
        f.stage = Stage.READY
        f.ready_by = user
        f.ready_at = now
        if pickup and not f.pickup_code:
            f.pickup_code = f"{secrets.randbelow(10**6):06d}"
        f.save()
        _set_order_status(order, Stage.READY)
        order.save()
        _broadcast(order, kind)

    ref, seller = _order_ref(order, kind), f.entity.title
    if pickup:
        notify_buyer(
            order, kind, "Order ready for collection",
            f"Your order {ref} is ready for collection at {seller}. "
            f"Pickup code {f.pickup_code}. Give it only when you collect the goods.",
        )
    else:
        notify_buyer(order, kind, "Order packed", f"Your order {ref} from {seller} is packed and will be dispatched shortly.")
    return [], f


def confirm_collection(data, user):
    """
    Seller: the buyer (or someone they sent) collected a pickup order.
    "collector_name", "collector_phone", "collector_id_number", "pickup_code".
    The code is required for customer orders, optional for retailer orders.
    """
    errors, order, kind, f = _ready_to_work(data, user)
    if errors:
        return errors, None
    if delivery_requested(order):
        return ["This order is for delivery; dispatch it instead"], None
    if f.stage == Stage.COLLECTED:
        return ["This order was already collected"], None
    if f.stage != Stage.READY:
        return ["Mark the order ready before handing it over"], None
    name = str(data.get("collector_name") or "").strip()
    if not name:
        return ["Enter who collected the order"], None
    code = str(data.get("pickup_code") or "").strip()
    if kind == "customer" and not code:
        return ["Enter the customer's pickup code"], None
    if code and code != f.pickup_code:
        return ["That pickup code is wrong"], None

    now = timezone.now()
    with transaction.atomic():
        f.stage = Stage.COLLECTED
        f.collector_name = name[:256]
        f.collector_phone = str(data.get("collector_phone") or "").strip()[:32] or None
        f.collector_id_number = str(data.get("collector_id_number") or "").strip()[:64] or None
        f.code_verified = bool(code)
        f.handed_over_by = user
        f.collected_at = now
        f.save()
        _set_order_status(order, Stage.COLLECTED)
        order.delivered_at = order.delivered_at or now
        order.save()
        _broadcast(order, kind)

    notify_buyer(
        order, kind, "Order collected",
        f"Your order {_order_ref(order, kind)} from {f.entity.title} was collected by {f.collector_name}"
        f"{' (' + f.collector_phone + ')' if f.collector_phone else ''} on {timezone.localtime(now):%d %b %Y %H:%M}.",
    )
    return [], f


# ---------------------------------------------------------------- queue

def _summary(order, kind, f, shipment):
    from retailers.models import CustomerOrderItems
    from wholesalers.models import RetailerOrderItems

    if kind == "customer":
        items = CustomerOrderItems.objects.filter(customer_order=order).count()
        total = (order.order_net_price_total or order.order_price_total or 0) + (order.shipping_cost or 0)
        buyer, phone = order.customer_name or "Walk-in customer", order.customer_phone
    else:
        items = RetailerOrderItems.objects.filter(retailer_order=order).count()
        total = (order.final_price_total or 0) + (order.shipping_amount or 0)
        buyer, phone = order.retailer.title, getattr(order.retailer, "phone", None)
    return {
        "kind": kind,
        "order_id": str(order.id),
        "reference": _order_ref(order, kind),
        "buyer": buyer,
        "buyer_phone": phone,
        "items": items,
        "total": str(total),
        "order_status": order.status,
        "fulfilment_method": "DELIVERY" if delivery_requested(order) else "PICKUP",
        "shipment_status": shipment.status if shipment else None,
        "stage": f.stage if f else Stage.PENDING,
        "created": order.created.isoformat() if getattr(order, "created", None) else None,
        "fulfilment": fulfilment_out(f),
    }


def _user_name(u):
    if not u:
        return None
    return " ".join(x for x in (u.first_name, u.last_name) if x).strip() or getattr(u, "phone", None) or u.email


def fulfilment_out(f, for_buyer=False):
    if not f:
        return None
    out = {
        "id": str(f.id),
        "stage": f.stage,
        "prepared_by_name": _user_name(f.prepared_by),
        "preparing_at": f.preparing_at,
        "packed_by_name": _user_name(f.packed_by),
        "packed_at": f.packed_at,
        "package_count": f.package_count,
        "package_weight_kg": str(f.package_weight_kg) if f.package_weight_kg is not None else None,
        "ready_at": f.ready_at,
        "collector_name": f.collector_name,
        "collector_phone": f.collector_phone,
        "collector_id_number": f.collector_id_number,
        "code_verified": f.code_verified,
        "handed_over_by_name": _user_name(f.handed_over_by),
        "collected_at": f.collected_at,
        "notes": f.notes,
    }
    # The pickup code is the buyer's secret: the seller types what the buyer says.
    if for_buyer and f.stage == Stage.READY:
        out["pickup_code"] = f.pickup_code
    return out


def fulfilment_queue(user, kind, scope="open"):
    """
    Seller's paid orders. scope "open": still to prepare / pack / hand over or
    dispatch. "done": collected or out for delivery (latest 100).
    """
    from logistics.models import Shipment, ShipmentStatus
    from retailers.models import CustomerOrders
    from wholesalers.models import RetailerOrders

    if kind == "customer":
        from django.db.models import Q

        qs = CustomerOrders.objects.filter(entity=user.entity, is_paid__iexact="true").select_related("order_number")
        # Counter sales (staff-made pickup orders) leave with the customer at once;
        # prescription orders made by staff still wait for the patient.
        qs = qs.exclude(
            Q(order_origin="STAFF") & ~Q(order_type="PRESCRIPTION") & ~Q(delivery_method__in=["DELIVERY", "COURIER"])
        )
    else:
        qs = RetailerOrders.objects.filter(wholesaler=user.entity, is_paid__iexact="true").select_related("retailer", "document_number")
    qs = qs.exclude(status__iexact="CANCELLED").order_by("-created")[:400]
    orders = list(qs)

    link = "customer_order_id" if kind == "customer" else "retailer_order_id"
    ids = [o.id for o in orders]
    fulfilments = {
        getattr(f, link): f
        for f in Fulfilment.objects.filter(**{f"{link}__in": ids}).select_related("prepared_by", "packed_by", "handed_over_by")
    }
    shipments = {getattr(s, link): s for s in Shipment.objects.filter(**{f"{link}__in": ids})}

    rows = []
    for o in orders:
        f, s = fulfilments.get(o.id), shipments.get(o.id)
        stage = f.stage if f else Stage.PENDING
        dispatched = bool(s) and s.status not in (ShipmentStatus.QUOTED,)
        received = bool(getattr(o, "received_at", None))
        done = stage == Stage.COLLECTED or dispatched or received or str(o.status).upper() in ("DELIVERED", "COMPLETED", "RECEIVED")
        if (scope == "done") == done:
            rows.append(_summary(o, kind, f, s))
    return rows[:100] if scope == "done" else rows
