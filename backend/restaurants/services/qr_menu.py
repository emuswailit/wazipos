# restaurants/services/qr_menu.py
#
# Walk-in ordering: food and drinks on one order pad.
#
#   Guests (no sign-in) scan the restaurant's QR code (authentication
#   GenerateQRCode, purpose RESTAURANT_MENU) which opens the public menu page:
#     POST /restaurants/menu   GetMenu {entity, table?}
#                              PlaceOrder {entity, table?, service, customer_name,
#                                          customer_phone, notes, items, drinks, token?}
#                              GetOrder {token}
#                              PayOrder {token, bill: FOOD|DRINKS, mobile_money_phone}
#                              RefreshPayment {token, reference}
#   Staff serve walk-ins at the counter with the same pad (the restaurant POS):
#     POST /restaurants/dining PlaceWalkInOrder {...same lines...}
#                              PayWalkInOrder {token, payment_method? | mobile_money_phone}
#                              RefreshWalkInPayment {token, reference}
#
# Food goes on a FoodOrder (the kitchen's orders board), drinks on a bar tab
# (BarInventoryOrder — stock leaves as bottles / tots, see services/bar.py).
# The two share one token (their draft_id), which is how a guest follows and
# pays the order without an account. Guests pay by mobile money or pay the
# waiter; staff record any method on the board / the tab.

import math
import secrets
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from authentication.models import Entities
from restaurants import models as rm
from restaurants.services import bar as b
from restaurants.services import dining as d

GUEST_MAX_PER_LINE = 20
SERVICES = {"DINE_IN": "Eat here", "PICKUP": "Take away"}


def restaurant(entity_id):
    return Entities.objects.filter(id=entity_id, entity_type__in=d.RESTAURANT_TYPES).first() if entity_id else None


def _table(entity, table_id):
    try:
        return rm.Table.objects.filter(id=table_id, entity=entity).first() if table_id else None
    except Exception:  # not a UUID
        return None


def _drink_out(dr):
    """A drink as guests see it: prices and whether it can be served, never stock or cost."""
    full = b.drink_out(dr)
    stock = Decimal(dr.stock_bottles or 0)
    tot = (Decimal(dr.tot_ml) / Decimal(dr.volume_ml)) if dr.sells_tots and dr.tot_ml and dr.volume_ml else None
    return {
        "id": full["id"],
        "title": full["title"],
        "category": full["category"],
        "volume_ml": dr.volume_ml,
        "sells_tots": bool(dr.sells_tots and dr.tot_ml and Decimal(dr.tot_price or 0) > 0),
        "tot_ml": dr.tot_ml,
        "bottle_price": full["bottle_price"],
        "tot_price": full["tot_price"],
        "bottle_available": stock >= 1,
        "tot_available": bool(tot and stock >= tot),
    }


def menu(entity_id, table_id=None, request=None):
    """Returns (errors, menu): the restaurant, its food and its drinks."""
    errors, food = d.restaurant_menu(entity_id, request)
    if errors:
        return errors, None
    entity = restaurant(entity_id)
    drinks = rm.BarInventory.objects.filter(entity=entity, is_available=True, bottle_price__gt=0).select_related("product", "category").order_by("title")
    table = _table(entity, table_id)
    return [], {
        "restaurant": {**food["restaurant"], "phone": getattr(entity, "phone", None)},
        "table": {"id": str(table.id), "title": table.title} if table else None,
        "items": food["items"],
        "drinks": [x for x in (_drink_out(dr) for dr in drinks) if x["bottle_available"] or x["tot_available"]],
        "services": [{"value": k, "label": v} for k, v in SERVICES.items()],
    }


def place(data, entity, user=None):
    """
    Food and/or drinks for a walk-in. user: the staff member taking the order,
    or None for a guest ordering from the QR menu. Returns (errors, token).
    """
    get = lambda k: str(data.get(k) or "").strip()
    staff = user is not None
    token = get("token") or get("draft_id")
    if token and (rm.FoodOrder.objects.filter(entity=entity, draft_id=token).exists() or rm.BarInventoryOrder.objects.filter(entity=entity, draft_id=token).exists()):
        return [], token  # already placed (retry / offline replay)
    token = token or secrets.token_urlsafe(18)

    raw_food = [i for i in (data.get("items") or []) if isinstance(i, dict)]
    raw_drinks = [i for i in (data.get("drinks") or []) if isinstance(i, dict)]
    if not raw_food and not raw_drinks:
        return ["Add something to your order"], None
    service = get("service").upper() or "DINE_IN"
    if service not in SERVICES:
        return ["Eat here or take away?"], None
    name, phone = get("customer_name")[:56], get("customer_phone")[:56]
    if not staff:
        if len(name) < 2:
            return ["Tell us your name so we can bring your order"], None
        if len("".join(c for c in phone if c.isdigit())) < 9:
            return ["Enter your phone number"], None
        for i in raw_food + raw_drinks:
            try:
                if int(i.get("quantity") or 0) > GUEST_MAX_PER_LINE:
                    return [f"For more than {GUEST_MAX_PER_LINE} of one item, please ask a waiter"], None
            except (TypeError, ValueError):
                return ["Check the quantities on your order"], None
    table = _table(entity, data.get("table"))
    notes = get("notes")[:280]

    errors, lines = d._lines(entity, raw_food) if raw_food else ([], [])
    if errors:
        return errors, None

    food_order = tab = None
    with transaction.atomic():
        if lines:
            cost = sum((item.price * qty for item, qty in lines), Decimal("0"))
            food_order = rm.FoodOrder.objects.create(
                entity=entity, owner=user, customer=None,
                customer_name=name or None, customer_phone=phone or None,
                document_number=f"FO{timezone.now():%y%m%d}{secrets.token_hex(3).upper()}",
                order_origin="STAFF" if staff else "CUSTOMER",
                order_channel=(get("order_channel") or "WEB")[:20],
                service_type=service,
                delivery_method="PICKUP",
                table=table,
                party_size=None,
                reservation_at=None,  # here now, not a booking
                notes=notes or None,
                description="Walk-in (counter)" if staff else "QR menu",
                status="RECEIVED",
                order_items_cost=d._q(cost), shipping_cost=Decimal("0"), order_total=d._q(cost),
                draft_id=token,
            )
            for item, qty in lines:
                rm.FoodOrderItem.objects.create(
                    entity=entity, owner=user, food_order=food_order, menu_item=item,
                    title=item.title, quantity=qty, unit_price=item.price, line_total=d._q(item.price * qty),
                )
        if raw_drinks:
            tab = rm.BarInventoryOrder.objects.create(
                entity=entity, owner=user, order_origin="STAFF" if staff else "CUSTOMER", status="OPEN",
                customer_name=name or None, customer_phone=phone or None, table=table,
                notes=(notes or ("" if staff else "QR menu"))[:300] or None,
                document_number=f"BT{timezone.now():%y%m%d}{secrets.token_hex(3).upper()}",
                draft_id=token,
            )
            errors = b._add_items(tab, raw_drinks, user, draft_id=token)
            if errors:
                transaction.set_rollback(True)
                return errors, None
    _notify(entity, food_order, tab, table, staff)
    return [], token


def _notify(entity, food_order, tab, table, staff):
    """Push to the restaurant owner when a guest orders from the QR menu."""
    if staff:
        return
    parts = [x for x in (food_order.document_number if food_order else None, tab.document_number if tab else None) if x]
    total = Decimal(food_order.order_total or 0 if food_order else 0) + Decimal(tab.order_total or 0 if tab else 0)
    where = f" · {table.title}" if table and table.title else ""
    d._push(entity.owner, "New QR menu order", f"{' + '.join(parts)}{where} · KES {total}", {"type": "FOOD_ORDER", "order": str(food_order.id) if food_order else ""})


def _orders(token, entity=None):
    if not token:
        return None, None
    food = rm.FoodOrder.objects.filter(draft_id=token).select_related("entity", "table")
    tabs = rm.BarInventoryOrder.objects.filter(draft_id=token).select_related("entity", "table")
    if entity is not None:
        food, tabs = food.filter(entity=entity), tabs.filter(entity=entity)
    return food.first(), tabs.first()


def status(token, entity=None):
    """Returns (errors, {token, restaurant, food_order, tab, total, due}) for a walk-in order."""
    food, tab = _orders(str(token or "").strip(), entity)
    if not food and not tab:
        return ["Order not found"], None
    ent = (food or tab).entity
    food_out = d.order_out(food) if food else None
    tab_out = b.tab_out(tab) if tab else None
    if tab_out:
        tab_out["items"] = [i for i in tab_out["items"] if not i["is_void"]]
    total = Decimal(food.order_total or 0 if food else 0) + Decimal(tab.order_total or 0 if tab else 0)
    due = (d.amount_due(food) if food and food.status != "CANCELLED" else Decimal("0")) + (b.tab_due(tab) if tab and tab.status != "CANCELLED" else Decimal("0"))
    return [], {
        "token": token,
        "restaurant": {"id": str(ent.id), "title": ent.title},
        "table": (food or tab).table.title if (food or tab).table_id else None,
        "food_order": food_out,
        "tab": tab_out,
        "total": str(total),
        "due": str(due),
    }


def guest_pay(data):
    """A guest pays one bill (FOOD or DRINKS) by mobile money. Returns (errors, payment_out)."""
    from authentication.utils.utils import generate_reference_number, use_reference_number
    from payments.models import PaymentMethods
    from payments.utils.system_till import push_to_system_till

    food, tab = _orders(str(data.get("token") or "").strip())
    bill = str(data.get("bill") or "").upper() or ("FOOD" if food else "DRINKS")
    order = food if bill == "FOOD" else tab
    if not order:
        return ["Order not found"], None
    if order.status == "CANCELLED":
        return ["This order was cancelled"], None
    due = d.amount_due(order) if bill == "FOOD" else b.tab_due(order)
    if due <= 0:
        return ["This is already paid"], None
    phone = str(data.get("mobile_money_phone") or "").strip()
    if not phone:
        return ["Enter the M-Pesa phone number to charge"], None
    method = PaymentMethods.objects.filter(title="MOBILE MONEY").first()
    if not method:
        return ["Mobile money isn't set up; please pay the waiter"], None
    entity = order.entity
    actor = entity.owner  # reference numbers belong to the restaurant
    if not actor:
        return ["This restaurant can't take mobile money here yet; please pay the waiter"], None
    reference = generate_reference_number(entity, actor)
    errors, result, telco = push_to_system_till(reference, math.ceil(due), phone, description=f"{'Food' if bill == 'FOOD' else 'Bar'} {entity.title}"[:60])
    if errors:
        return errors, None
    common = dict(
        entity=entity, owner=None, payment_method=method, reference_number=reference,
        psp_reference_number=str(result.get("ref") or "")[:50], status="PENDING",
        amount=math.ceil(due), currency="KES", telco_name=(telco or "")[:28],
    )
    if bill == "FOOD":
        p = rm.FoodOrderPayment.objects.create(food_order=order, description="Waiting for PIN entry.", **common)
        out = {"bill": bill, "reference": p.reference_number, "status": p.status, "description": p.description}
    else:
        p = rm.BarInventoryOrderPayment.objects.create(bar_inventory_order=order, desc="Waiting for PIN entry.", **common)
        out = {"bill": bill, "reference": p.reference_number, "status": p.status, "description": p.desc}
    use_reference_number(reference)
    return [], out


def guest_refresh_payment(data):
    """Poll a guest's pending payment (it must belong to the order behind the token)."""
    food, tab = _orders(str(data.get("token") or "").strip())
    reference = str(data.get("reference") or "").strip()
    if not reference or (not food and not tab):
        return ["Payment not found"], None
    p = rm.FoodOrderPayment.objects.filter(reference_number=reference, food_order=food).select_related("food_order").first() if food else None
    if p:
        p = d.settle_payment(p)
        return [], {"bill": "FOOD", "reference": p.reference_number, "status": p.status, "description": p.description}
    p = rm.BarInventoryOrderPayment.objects.filter(reference_number=reference, bar_inventory_order=tab).select_related("bar_inventory_order").first() if tab else None
    if p:
        p = b.settle_tab_payment(p)
        return [], {"bill": "DRINKS", "reference": p.reference_number, "status": p.status, "description": p.desc}
    return ["Payment not found"], None


# ---------------------------------------------------------------- POS: staff take payment

def staff_pay(data, user):
    """
    Counter payment for a walk-in order — food and drinks together.
    {token, payment_method?, mobile_money_phone?}
      mobile_money_phone: one M-Pesa prompt for everything due (the food and the
        drinks payments share its reference); follow it with staff_refresh.
      otherwise: recorded as paid now with the method picked (cash by default).
    Returns (errors, {status, reference?, description?}).
    """
    from authentication.utils.utils import generate_reference_number, use_reference_number
    from payments.models import PaymentMethods
    from payments.utils.system_till import push_to_system_till

    entity = user.entity
    food, tab = _orders(str(data.get("token") or "").strip(), entity)
    if not food and not tab:
        return ["Order not found"], None
    food_due = d.amount_due(food) if food and food.status != "CANCELLED" else Decimal("0")
    tab_due = b.tab_due(tab) if tab and tab.status != "CANCELLED" else Decimal("0")
    if food_due + tab_due <= 0:
        return ["This order is already paid"], None

    phone = str(data.get("mobile_money_phone") or "").strip()
    if not phone:
        method = PaymentMethods.objects.filter(id=data.get("payment_method")).first() if data.get("payment_method") else None
        method = method or PaymentMethods.objects.filter(title="CASH").first()
        if not method:
            return ["Pick a payment method"], None
        title = str(method.title or "").upper()
        if title == "CREDIT":
            return ["Credit isn't taken at the counter — leave the order unpaid instead"], None
        if title == "MOBILE MONEY":
            return ["Enter the customer's M-Pesa number"], None
        with transaction.atomic():
            if food_due > 0:
                errors, _ = d.record_cash({"food_order": str(food.id), "payment_method": str(method.id)}, user)
                if errors:
                    transaction.set_rollback(True)
                    return errors, None
            if tab_due > 0:
                errors = b._record(tab, user, str(method.id))
                if errors:
                    transaction.set_rollback(True)
                    return errors, None
        return [], {"status": "SUCCESS", "reference": None, "description": f"Paid by {method.title.title()}"}

    method = PaymentMethods.objects.filter(title="MOBILE MONEY").first()
    if not method:
        return ["Mobile money isn't set up"], None
    amount = math.ceil(food_due + tab_due)
    reference = generate_reference_number(entity, user)
    errors, result, telco = push_to_system_till(reference, amount, phone, description=f"{entity.title}"[:60])
    if errors:
        return errors, None
    common = dict(
        entity=entity, owner=user, payment_method=method, reference_number=reference,
        psp_reference_number=str(result.get("ref") or "")[:50], status="PENDING", currency="KES", telco_name=(telco or "")[:28],
    )
    # One prompt (rounded up to a whole shilling), recorded against each bill for exactly what it owes.
    if food_due > 0:
        rm.FoodOrderPayment.objects.create(food_order=food, description="Waiting for PIN entry.", amount=food_due, **common)
    if tab_due > 0:
        rm.BarInventoryOrderPayment.objects.create(bar_inventory_order=tab, desc="Waiting for PIN entry.", amount=tab_due, **common)
    use_reference_number(reference)
    return [], {"status": "PENDING", "reference": reference, "description": "Waiting for the customer to enter their PIN."}


def staff_refresh(data, user):
    """Follow a counter M-Pesa prompt: settles the food and drinks payments behind its reference."""
    food, tab = _orders(str(data.get("token") or "").strip(), user.entity)
    reference = str(data.get("reference") or "").strip()
    if not reference or (not food and not tab):
        return ["Payment not found"], None
    states, description = [], ""
    fp = rm.FoodOrderPayment.objects.filter(reference_number=reference, food_order=food).select_related("food_order").first() if food else None
    if fp:
        fp = d.settle_payment(fp)
        states.append(fp.status)
        description = fp.description
    tp = rm.BarInventoryOrderPayment.objects.filter(reference_number=reference, bar_inventory_order=tab).select_related("bar_inventory_order").first() if tab else None
    if tp:
        tp = b.settle_tab_payment(tp)
        states.append(tp.status)
        description = description or tp.desc
    if not states:
        return ["Payment not found"], None
    status_ = "PENDING" if "PENDING" in states else ("SUCCESS" if all(x == "SUCCESS" for x in states) else "FAILED")
    return [], {"status": status_, "reference": reference, "description": description}


# ---------------------------------------------------------------- QR code

def menu_url(entity, table=None, base_url=None):
    """The public page a QR code opens: <web app>/menu/<restaurant>?table=<table>."""
    from decouple import config

    base = str(base_url or "").strip().rstrip("/")
    if not base.startswith(("https://", "http://")):
        base = str(config("WEB_APP_URL", default="https://wazipos.co.ke")).rstrip("/")
    url = f"{base}/menu/{entity.id}"
    return f"{url}?table={table.id}" if table else url


def qr_target(data, user):
    """For GenerateQRCode {purpose: RESTAURANT_MENU, table?, base_url?}. Returns (errors, url, label)."""
    if not d.is_restaurant_staff(user):
        return ["Switch to your restaurant to make its menu QR code"], None, None
    table = None
    if data.get("table"):
        table = _table(user.entity, data.get("table"))
        if not table:
            return ["Table not found"], None, None
    label = f"{user.entity.title}{' · ' + table.title if table and table.title else ''}"
    return [], menu_url(user.entity, table, data.get("base_url")), label
