# restaurants/services/bar.py
#
# Drinks, billed separately from food (a bar tab).
#
# Stock is counted in BOTTLES (decimals = an open bottle). A drink sells by the
# BOTTLE at bottle_price and — for spirits like whisky — by the TOT (tot_ml out
# of a volume_ml bottle) at tot_price: a tot takes tot_ml/volume_ml of a bottle.
#
#   drinks     SaveDrink (from a Product or by name), ReceiveDrinks (+ bottles),
#              CountDrink (set the counted stock), WasteDrink (spills / breakage)
#   tabs       OpenBarTab {items}, AddToBarTab {items}, VoidBarItem, PayBarTab
#              (cash/card by staff, or M-Pesa STK), CloseBarTab, CancelBarTab
#
# Every write takes an optional draft_id: the app sends writes made offline when
# it reconnects, and a repeated draft_id returns the first result (no double
# stock movements or double tabs).

import math
import secrets
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from products.models import Products
from restaurants import models as rm

UNITS = ("BOTTLE", "TOT")


def _d(v, default="0"):
    try:
        return Decimal(str(v if v not in (None, "") else default))
    except Exception:
        return None


def _money(v):
    return Decimal(v).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _bottles(v):
    return Decimal(v).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


# ================================================================ drinks

def drink_out(d):
    stock = Decimal(d.stock_bottles or 0)
    full = int(stock) if stock > 0 else 0
    open_part = stock - full if stock > 0 else Decimal("0")
    tots_left = int((open_part * d.volume_ml) // d.tot_ml) if d.sells_tots and d.tot_ml else None
    return {
        "id": str(d.id),
        "title": d.title or (d.product.title if d.product_id else "Drink"),
        "product": str(d.product_id) if d.product_id else None,
        "category": d.category.title if d.category_id else None,
        "bar_code": d.bar_code,
        "volume_ml": d.volume_ml,
        "sells_tots": d.sells_tots,
        "tot_ml": d.tot_ml,
        "tots_per_bottle": d.tots_per_bottle(),
        "bottle_price": str(d.bottle_price),
        "tot_price": str(d.tot_price),
        "bottle_cost": str(d.bottle_cost),
        "stock_bottles": str(_bottles(stock)),
        "full_bottles": full,
        "open_bottle_tots": tots_left,
        "reorder_level": str(d.reorder_level),
        "is_low": stock <= Decimal(d.reorder_level or 0),
        "is_available": d.is_available,
        "updated": d.updated.isoformat() if d.updated else None,
    }


def list_drinks(user):
    return rm.BarInventory.objects.filter(entity=user.entity).select_related("product", "category").order_by("title")


def save_drink(data, user):
    get = lambda k: str(data.get(k) or "").strip()
    drink = None
    if get("id"):
        drink = rm.BarInventory.objects.filter(id=get("id"), entity=user.entity).first()
        if not drink:
            return ["Drink not found"], None
    elif get("draft_id"):
        done = rm.BarInventory.objects.filter(entity=user.entity, draft_id=get("draft_id")).first()
        if done:
            return [], done
    product = Products.objects.filter(id=get("product")).first() if get("product") else None
    title = get("title") or (product.title if product else "")
    if not title:
        return ["Name the drink, or pick it from the product list"], None
    # A product sold by volume in parts (products/units.py) gives the bottle and tot size.
    from products.units import sells_in_parts

    from_product = product is not None and sells_in_parts(product) and product.measure == "VOLUME"
    volume = int(_d(get("volume_ml") or (product.content_per_unit if from_product else ""), "750") or 0)
    if not 50 <= volume <= 5000:
        return ["Bottle size must be 50–5000 ml"], None
    sells_tots = str(data.get("sells_tots") if "sells_tots" in data else from_product).lower() in ("true", "1", "yes")
    tot_ml = int(_d(get("tot_ml") or (product.part_size if from_product else ""), "0") or 0)
    if sells_tots and not 10 <= tot_ml <= volume:
        return ["Enter the tot size in ml (e.g. 25, 30, 35 or 50)"], None
    bottle_price, tot_price, cost = _d(get("bottle_price")), _d(get("tot_price")), _d(get("bottle_cost"))
    if bottle_price is None or bottle_price <= 0:
        return ["Enter the bottle price"], None
    if sells_tots and (tot_price is None or tot_price <= 0):
        return ["Enter the tot price"], None
    with transaction.atomic():
        drink = drink or rm.BarInventory(entity=user.entity, owner=user, draft_id=get("draft_id") or None)
        drink.product = product or drink.product
        drink.title = title
        drink.volume_ml = volume
        drink.sells_tots = sells_tots
        drink.tot_ml = tot_ml if sells_tots else None
        drink.bottle_price = _money(bottle_price)
        drink.tot_price = _money(tot_price) if sells_tots and tot_price else Decimal("0")
        drink.bottle_cost = _money(cost or 0)
        drink.reorder_level = _d(get("reorder_level"), "0") or Decimal("0")
        if get("bar_code"):
            drink.bar_code = get("bar_code")
        if "is_available" in data:
            drink.is_available = str(data.get("is_available")).lower() in ("true", "1", "yes")
        # Legacy columns kept in step for older screens.
        drink.pack_selling_price = drink.bottle_price
        drink.pack_buying_price = drink.bottle_cost
        drink.save()
    return [], drink


def _move(drink, kind, bottles, user, reason=None, order=None, draft_id=None, unit_cost=0):
    """Apply a stock change (row-locked). bottles: signed change."""
    d = rm.BarInventory.objects.select_for_update().get(id=drink.id)
    d.stock_bottles = _bottles(Decimal(d.stock_bottles or 0) + bottles)
    d.unit_quantity = int(d.stock_bottles) if d.stock_bottles > 0 else 0
    d.save(update_fields=["stock_bottles", "unit_quantity", "updated"])
    rm.BarStockMovement.objects.create(
        entity=d.entity, owner=user, drink=d, kind=kind, bottles=_bottles(bottles), balance=d.stock_bottles,
        unit_cost=_money(unit_cost or 0), reason=(reason or "")[:200] or None, order=order, draft_id=draft_id,
    )
    return d


def _done(draft_id, entity):
    return bool(draft_id) and rm.BarStockMovement.objects.filter(entity=entity, draft_id=draft_id).exists()


def receive_drinks(data, user):
    drink = rm.BarInventory.objects.filter(id=data.get("drink"), entity=user.entity).first()
    if not drink:
        return ["Drink not found"], None
    draft = str(data.get("draft_id") or "") or None
    if _done(draft, user.entity):
        drink.refresh_from_db()
        return [], drink
    bottles = _d(data.get("bottles"))
    if bottles is None or bottles <= 0:
        return ["How many bottles came in?"], None
    cost = _d(data.get("bottle_cost"), str(drink.bottle_cost))
    with transaction.atomic():
        if cost and cost > 0:
            # Weighted average cost per bottle.
            have = max(Decimal(drink.stock_bottles or 0), Decimal("0"))
            drink.bottle_cost = _money((have * drink.bottle_cost + bottles * cost) / (have + bottles))
            drink.save(update_fields=["bottle_cost", "updated"])
        drink = _move(drink, "RECEIVE", bottles, user, reason=str(data.get("supplier") or "")[:200], draft_id=draft, unit_cost=cost or 0)
    return [], drink


def count_drink(data, user):
    """Stock count: set the bottles on hand (e.g. 11.4 = 11 full + an open bottle)."""
    drink = rm.BarInventory.objects.filter(id=data.get("drink"), entity=user.entity).first()
    if not drink:
        return ["Drink not found"], None
    draft = str(data.get("draft_id") or "") or None
    if _done(draft, user.entity):
        drink.refresh_from_db()
        return [], drink
    counted = _d(data.get("counted_bottles"))
    if counted is None or counted < 0:
        return ["Enter the bottles counted"], None
    with transaction.atomic():
        delta = counted - Decimal(drink.stock_bottles or 0)
        drink = _move(drink, "ADJUST", delta, user, reason=str(data.get("reason") or "Stock count"), draft_id=draft)
    return [], drink


def waste_drink(data, user):
    drink = rm.BarInventory.objects.filter(id=data.get("drink"), entity=user.entity).first()
    if not drink:
        return ["Drink not found"], None
    draft = str(data.get("draft_id") or "") or None
    if _done(draft, user.entity):
        drink.refresh_from_db()
        return [], drink
    bottles = _d(data.get("bottles"))
    if not bottles and data.get("tots") and drink.sells_tots and drink.tot_ml:
        bottles = Decimal(int(data["tots"]) * drink.tot_ml) / Decimal(drink.volume_ml)
    if not bottles or bottles <= 0:
        return ["How much was lost?"], None
    with transaction.atomic():
        drink = _move(drink, "WASTE", -bottles, user, reason=str(data.get("reason") or "Spilled / broken"), draft_id=draft)
    return [], drink


# ================================================================ tabs

def _tab_total(order):
    total = sum(
        (i.line_total for i in rm.BarInventoryOrderItem.objects.filter(bar_inventory_order=order, is_void=False)),
        Decimal("0"),
    )
    order.order_items_cost = _money(total)
    order.order_total = _money(total)
    order.save(update_fields=["order_items_cost", "order_total", "updated"])


def tab_paid_amount(order):
    return sum(
        (p.amount for p in rm.BarInventoryOrderPayment.objects.filter(bar_inventory_order=order, status="SUCCESS")),
        Decimal("0"),
    )


def tab_due(order):
    return max(Decimal("0"), Decimal(order.order_total or 0) - tab_paid_amount(order))


def _add_items(order, items, user, draft_id=None):
    """Validate + add a round. Returns errors (stock and prices checked)."""
    if not items:
        return ["Add at least one drink"]
    drinks = {str(d.id): d for d in rm.BarInventory.objects.filter(entity=order.entity, id__in=[str(i.get("drink") or "") for i in items])}
    lines = []
    for i in items:
        d = drinks.get(str(i.get("drink") or ""))
        unit = str(i.get("unit") or "BOTTLE").upper()
        try:
            qty = int(i.get("quantity") or 0)
        except (TypeError, ValueError):
            qty = 0
        if not d:
            return ["A drink on this round isn't in your bar list"]
        if not d.is_available:
            return [f"{d.title} is switched off"]
        if unit not in UNITS:
            return ["Sell by the bottle or by the tot"]
        if unit == "TOT" and not (d.sells_tots and d.tot_ml):
            return [f"{d.title} isn't sold by the tot"]
        if not 1 <= qty <= 200:
            return [f"Quantity for {d.title} must be 1–200"]
        per = (Decimal(d.tot_ml) / Decimal(d.volume_ml)) if unit == "TOT" else Decimal("1")
        price = d.tot_price if unit == "TOT" else d.bottle_price
        lines.append((d, unit, qty, _bottles(per * qty), price))
    # Stock check per drink (a round can have bottles and tots of the same drink).
    need = {}
    for d, _, _, used, _ in lines:
        need[d.id] = need.get(d.id, Decimal("0")) + used
    for d, *_ in lines:
        if Decimal(d.stock_bottles or 0) < need[d.id]:
            left = drink_out(d)
            return [f"Not enough {d.title}: {left['full_bottles']} bottle(s)" + (f" + {left['open_bottle_tots']} tots" if left["open_bottle_tots"] else "") + " left"]
    for d, unit, qty, used, price in lines:
        rm.BarInventoryOrderItem.objects.create(
            entity=order.entity, owner=user, bar_inventory_order=order, bar_inventory=d, quantity=qty,
            sale_unit=unit, title=f"{d.title} ({'tot' if unit == 'TOT' else 'bottle'})", unit_price=price,
            line_total=_money(price * qty), bottles_used=used,
        )
        _move(d, "SALE", -used, user, reason=f"{qty} {unit.lower()}(s)", order=order, draft_id=f"{draft_id}:{d.id}:{unit}" if draft_id else None)
    _tab_total(order)
    return []


def open_tab(data, user):
    """Open a bar tab with the first round. Returns (errors, order)."""
    draft = str(data.get("draft_id") or "").strip()
    if draft:
        done = rm.BarInventoryOrder.objects.filter(entity=user.entity, draft_id=draft).first()
        if done:
            return [], done
    table = rm.Table.objects.filter(id=data.get("table"), entity=user.entity).first() if data.get("table") else None
    with transaction.atomic():
        order = rm.BarInventoryOrder.objects.create(
            entity=user.entity, owner=user, order_origin="STAFF", status="OPEN",
            customer_name=str(data.get("customer_name") or "")[:56] or None,
            customer_phone=str(data.get("customer_phone") or "")[:56] or None,
            table=table, notes=str(data.get("notes") or "")[:300] or None,
            document_number=f"BT{timezone.now():%y%m%d}{secrets.token_hex(3).upper()}",
            draft_id=draft or secrets.token_hex(8),
        )
        errors = _add_items(order, data.get("items") or [], user, draft_id=draft or None)
        if errors:
            transaction.set_rollback(True)
            return errors, None
        # Offline / counter sale paid on the spot.
        if data.get("pay_cash"):
            err = _record(order, user, data.get("payment_method"))
            if err:
                transaction.set_rollback(True)
                return err, None
            if str(data.get("close")).lower() in ("true", "1", "yes"):
                order.status, order.closed_at, order.is_served = "CLOSED", timezone.now(), "true"
                order.save()
    return [], order


def add_to_tab(data, user):
    order = rm.BarInventoryOrder.objects.filter(id=data.get("order"), entity=user.entity).first()
    if not order:
        return ["Tab not found"], None
    if order.status != "OPEN":
        return ["This tab is closed"], None
    draft = str(data.get("draft_id") or "").strip() or None
    if draft and rm.BarStockMovement.objects.filter(entity=user.entity, draft_id__startswith=f"{draft}:").exists():
        return [], order
    with transaction.atomic():
        errors = _add_items(order, data.get("items") or [], user, draft_id=draft)
        if errors:
            transaction.set_rollback(True)
            return errors, None
    order.refresh_from_db()
    return [], order


def void_item(data, user):
    item = rm.BarInventoryOrderItem.objects.filter(id=data.get("item"), entity=user.entity).select_related("bar_inventory_order", "bar_inventory").first()
    if not item or item.is_void:
        return ["Line not found"], None
    order = item.bar_inventory_order
    if order.status != "OPEN":
        return ["Re-open is not possible: the tab is closed"], None
    with transaction.atomic():
        item.is_void = True
        item.save()
        if item.bar_inventory_id and item.bottles_used:
            _move(item.bar_inventory, "VOID", Decimal(item.bottles_used), user, reason=str(data.get("reason") or "Voided")[:200], order=order)
        _tab_total(order)
    order.refresh_from_db()
    return [], order


def _record(order, user, method_id=None):
    from payments.models import PaymentMethods

    due = tab_due(order)
    if due <= 0:
        return ["This tab is already paid"]
    method = PaymentMethods.objects.filter(id=method_id).first() if method_id else None
    method = method or PaymentMethods.objects.filter(title="CASH").first()
    if not method:
        return ["Cash isn't set up as a payment method"]
    rm.BarInventoryOrderPayment.objects.create(
        entity=order.entity, owner=user, bar_inventory_order=order, payment_method=method,
        reference_number=f"CASH{secrets.token_hex(4).upper()}", status="SUCCESS", amount=due, currency="KES",
        is_settled=True, desc=f"{method.title} at the bar",
    )
    order.is_paid, order.paid_at = "true", timezone.now()
    order.payment_method = method
    order.save(update_fields=["is_paid", "paid_at", "payment_method", "updated"])
    return []


def pay_tab(data, user):
    """Staff record cash/card; or M-Pesa STK to the customer's phone (system till)."""
    order = rm.BarInventoryOrder.objects.filter(id=data.get("order"), entity=user.entity).first()
    if not order:
        return ["Tab not found"], None, None
    if order.status == "CANCELLED":
        return ["This tab was cancelled"], None, None
    phone = str(data.get("mobile_money_phone") or "").strip()
    if not phone:
        with transaction.atomic():
            err = _record(order, user, data.get("payment_method"))
        return err, (None if err else order), None

    from authentication.utils.utils import generate_reference_number, use_reference_number
    from payments.models import PaymentMethods
    from payments.utils.system_till import push_to_system_till

    due = tab_due(order)
    if due <= 0:
        return ["This tab is already paid"], None, None
    method = PaymentMethods.objects.filter(title="MOBILE MONEY").first()
    reference = generate_reference_number(order.entity, user)
    errors, result, telco = push_to_system_till(reference, math.ceil(due), phone, description=f"Bar {order.entity.title}"[:60])
    if errors:
        return errors, None, None
    payment = rm.BarInventoryOrderPayment.objects.create(
        entity=order.entity, owner=user, bar_inventory_order=order, payment_method=method,
        reference_number=reference, psp_reference_number=str(result.get("ref") or "")[:50], status="PENDING",
        amount=math.ceil(due), currency="KES", telco_name=(telco or "")[:28], desc="Waiting for PIN entry.",
    )
    use_reference_number(reference)
    return [], order, payment


def refresh_tab_payment(data, user):
    from payments.utils.system_till import PENDING_TIMEOUT_MINUTES, fetch_transaction

    p = rm.BarInventoryOrderPayment.objects.filter(reference_number=data.get("reference"), entity=user.entity).select_related("bar_inventory_order").first()
    if not p:
        return ["Payment not found"], None
    return [], settle_tab_payment(p)


def settle_tab_payment(p):
    """Bring a pending tab payment up to date from the system till. Returns the payment."""
    from payments.utils.system_till import PENDING_TIMEOUT_MINUTES, fetch_transaction

    if p.status == "PENDING":
        if p.created < timezone.now() - timedelta(minutes=PENDING_TIMEOUT_MINUTES):
            p.status, p.desc = "FAILED", "Expired: no PIN entered."
            p.save()
        else:
            tx = fetch_transaction(p.reference_number)
            st = (tx or {}).get("status")
            if st and st != "PENDING":
                with transaction.atomic():
                    p = rm.BarInventoryOrderPayment.objects.select_for_update().get(id=p.id)
                    if p.status == "PENDING":
                        p.status = "SUCCESS" if st == "SUCCESS" else "FAILED"
                        p.desc = str(tx.get("description") or p.desc)[:256]
                        p.provider_reference_num = str(tx.get("providerRef") or "")[:50]
                        p.save()
                        order = p.bar_inventory_order
                        if p.status == "SUCCESS" and tab_due(order) <= 0:
                            order.is_paid, order.paid_at = "true", timezone.now()
                            order.save(update_fields=["is_paid", "paid_at", "updated"])
    return p


def close_tab(data, user):
    order = rm.BarInventoryOrder.objects.filter(id=data.get("order"), entity=user.entity).first()
    if not order:
        return ["Tab not found"], None
    if order.status != "OPEN":
        return ["This tab is already closed"], None
    if tab_due(order) > 0:
        return ["Take payment before closing the tab"], None
    order.status, order.closed_at, order.is_served = "CLOSED", timezone.now(), "true"
    order.save()
    return [], order


def cancel_tab(data, user):
    order = rm.BarInventoryOrder.objects.filter(id=data.get("order"), entity=user.entity).first()
    if not order:
        return ["Tab not found"], None
    if order.status != "OPEN":
        return ["Only open tabs can be cancelled"], None
    if tab_paid_amount(order) > 0:
        return ["This tab has payments; void the lines instead"], None
    with transaction.atomic():
        for item in rm.BarInventoryOrderItem.objects.filter(bar_inventory_order=order, is_void=False).select_related("bar_inventory"):
            item.is_void = True
            item.save()
            if item.bar_inventory_id and item.bottles_used:
                _move(item.bar_inventory, "VOID", Decimal(item.bottles_used), user, reason="Tab cancelled", order=order)
        order.status = "CANCELLED"
        order.save()
        _tab_total(order)
    return [], order


def tab_out(order):
    items = rm.BarInventoryOrderItem.objects.filter(bar_inventory_order=order).order_by("created")
    last = rm.BarInventoryOrderPayment.objects.filter(bar_inventory_order=order).order_by("-created").first()
    return {
        "id": str(order.id),
        "reference": order.document_number,
        "status": order.status,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "table": order.table.title if order.table_id else None,
        "notes": order.notes,
        "total": str(order.order_total or 0),
        "paid": str(tab_paid_amount(order)),
        "due": str(tab_due(order)),
        "is_paid": order.is_paid == "true",
        "items": [
            {"id": str(i.id), "drink": str(i.bar_inventory_id) if i.bar_inventory_id else None, "title": i.title, "unit": i.sale_unit,
             "quantity": i.quantity, "unit_price": str(i.unit_price), "line_total": str(i.line_total), "is_void": i.is_void,
             "created": i.created.isoformat() if i.created else None}
            for i in items
        ],
        "last_payment": {"reference": last.reference_number, "status": last.status, "description": last.desc} if last else None,
        "created": order.created.isoformat() if order.created else None,
        "draft_id": order.draft_id,
    }


def list_tabs(data, user):
    qs = rm.BarInventoryOrder.objects.filter(entity=user.entity).select_related("table").order_by("-created")
    if data.get("scope") == "done":
        return qs.exclude(status="OPEN")[:150]
    return qs.filter(status="OPEN")[:200]
