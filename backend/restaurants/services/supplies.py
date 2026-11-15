# restaurants/services/supplies.py
#
# A restaurant's own goods — food stock, cleaning materials, utilities (gas,
# charcoal), packaging — received from the product catalogue (like a retailer
# receipt) or by name, then used / issued, wasted or counted.
#
#   SearchCatalogue {q}                       products to receive from
#   GetSupplies / GetSupplyMovements {stock}
#   ReceiveSupplies {stock? | product? | title, category, unit, quantity, unit_cost, supplier_name, batch, expiry_date}
#   UseSupplies {stock, kind: ISSUE|WASTE, quantity, sale_unit: FULL|PART, reason}
#     PART: quantity is in parts (kg, tots, pieces) of an item issued in parts
#   CountSupplies {stock, counted, reason}
#
# Writes take a draft_id: offline writes are replayed on reconnect and a
# repeated draft_id is not applied twice.

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Q

from products.models import Products
from products.units import product_parts_out
from restaurants import models as rm

CATEGORIES = dict(rm.SupplyCategory.choices)


def _d(v, default="0"):
    try:
        return Decimal(str(v if v not in (None, "") else default))
    except Exception:
        return None


def _q3(v):
    return Decimal(v).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _money(v):
    return Decimal(v).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def search_catalogue(q):
    q = str(q or "").strip()
    if len(q) < 2:
        return []
    qs = Products.objects.filter(Q(title__icontains=q) | Q(bar_code__iexact=q)).order_by("title")[:30]
    return [
        {"id": str(p.id), "title": p.title, "bar_code": p.bar_code, "packaging": getattr(p, "packaging", ""), "units_per_pack": getattr(p, "units_per_pack", None), "parts": product_parts_out(p)}
        for p in qs
    ]


def _parts_view(s):
    """The stock item in products/units.py terms (it copies the product's part settings)."""
    from types import SimpleNamespace

    return SimpleNamespace(
        sold_in_parts=bool(s.measure), measure=s.measure, content_per_unit=s.content_per_unit,
        part_size=s.part_size, part_label=s.part_label, packaging=s.unit,
    )


def _copy_parts(stock, product):
    """New stock from a product sold in parts: take over its settings."""
    from products.units import sells_in_parts

    if product is not None and sells_in_parts(product):
        stock.measure = product.measure
        stock.content_per_unit = product.content_per_unit
        stock.part_size = product.part_size
        stock.part_label = product.part_label


def _parts_out(s):
    """Whole units + what's left in the opened one (quantity is in whole units, e.g. 3.46 bags)."""
    from products.units import breakdown, content_per_unit, product_parts_out, sells_in_parts

    v = _parts_view(s)
    out = product_parts_out(v)
    qty = max(Decimal(s.quantity or 0), Decimal("0"))
    full = int(qty)
    open_content = (qty - full) * content_per_unit(v) if sells_in_parts(v) else 0
    out.update(breakdown(full, open_content, v))
    return out


def stock_out(s):
    return {
        "parts": _parts_out(s),
        "id": str(s.id),
        "title": s.title,
        "product": str(s.product_id) if s.product_id else None,
        "category": s.category,
        "category_label": CATEGORIES.get(s.category, s.category),
        "unit": s.unit,
        "quantity": str(s.quantity),
        "unit_cost": str(s.unit_cost),
        "value": str(_money(Decimal(s.quantity or 0) * Decimal(s.unit_cost or 0))) if s.quantity and s.quantity > 0 else "0.00",
        "reorder_level": str(s.reorder_level),
        "is_low": Decimal(s.quantity or 0) <= Decimal(s.reorder_level or 0),
        "supplier_name": s.supplier_name,
        "batch": s.batch,
        "expiry_date": s.expiry_date.isoformat() if s.expiry_date else None,
        "bar_code": s.bar_code,
        "updated": s.updated.isoformat() if s.updated else None,
    }


def movement_out(m):
    return {"id": str(m.id), "kind": m.kind, "quantity": str(m.quantity), "balance": str(m.balance), "reason": m.reason, "created": m.created.isoformat() if m.created else None}


def list_supplies(user):
    return rm.RestaurantStock.objects.filter(entity=user.entity)


def movements(data, user):
    return rm.RestaurantStockMovement.objects.filter(entity=user.entity, stock_id=data.get("stock"))[:100]


def _apply(stock, kind, change, user, reason=None, draft_id=None, unit_cost=0):
    s = rm.RestaurantStock.objects.select_for_update().get(id=stock.id)
    s.quantity = _q3(Decimal(s.quantity or 0) + change)
    s.save(update_fields=["quantity", "updated"])
    rm.RestaurantStockMovement.objects.create(
        entity=s.entity, owner=user, stock=s, kind=kind, quantity=_q3(change), balance=s.quantity,
        unit_cost=_money(unit_cost or 0), reason=(reason or "")[:200] or None, draft_id=draft_id,
    )
    return s


def _replayed(draft, user):
    if not draft:
        return None
    m = rm.RestaurantStockMovement.objects.filter(entity=user.entity, draft_id=draft).select_related("stock").first()
    return m.stock if m else None


def receive(data, user):
    get = lambda k: str(data.get(k) or "").strip()
    draft = get("draft_id") or None
    done = _replayed(draft, user)
    if done:
        return [], done
    qty = _d(get("quantity"))
    if qty is None or qty <= 0:
        return ["How much came in?"], None
    cost = _d(get("unit_cost"), "0")
    if cost is None or cost < 0:
        return ["Enter a valid cost"], None
    stock = rm.RestaurantStock.objects.filter(id=get("stock"), entity=user.entity).first() if get("stock") else None
    product = Products.objects.filter(id=get("product")).first() if get("product") else None
    if not stock:
        title = get("title") or (product.title if product else "")
        if not title:
            return ["Pick the product, or name what you received"], None
        category = get("category").upper() or "FOOD"
        if category not in CATEGORIES:
            return ["Pick a category"], None
        # Same product / name already in stock: add to it.
        existing = rm.RestaurantStock.objects.filter(entity=user.entity).filter(
            Q(product=product) if product else Q(title__iexact=title, product__isnull=True)
        ).first()
        stock = existing
    with transaction.atomic():
        if not stock:
            stock = rm.RestaurantStock.objects.create(
                entity=user.entity, owner=user, product=product, title=(get("title") or product.title)[:256],
                category=get("category").upper() or "FOOD", unit=get("unit")[:32] or "unit",
                reorder_level=_d(get("reorder_level"), "0") or 0, bar_code=(product.bar_code if product else get("bar_code")) or None,
                draft_id=draft,
            )
            _copy_parts(stock, product)
        # Weighted-average cost.
        have = max(Decimal(stock.quantity or 0), Decimal("0"))
        if cost and cost > 0:
            stock.unit_cost = _money((have * Decimal(stock.unit_cost or 0) + qty * cost) / (have + qty))
        if get("supplier_name"):
            stock.supplier_name = get("supplier_name")[:120]
        if get("batch"):
            stock.batch = get("batch")[:64]
        if get("expiry_date"):
            stock.expiry_date = get("expiry_date")
        stock.save()
        stock = _apply(stock, "RECEIVE", qty, user, reason=get("supplier_name") or "Received", draft_id=draft, unit_cost=cost)
    return [], stock


def use(data, user):
    get = lambda k: str(data.get(k) or "").strip()
    draft = get("draft_id") or None
    done = _replayed(draft, user)
    if done:
        return [], done
    stock = rm.RestaurantStock.objects.filter(id=get("stock"), entity=user.entity).first()
    if not stock:
        return ["Item not found"], None
    kind = get("kind").upper() or "ISSUE"
    if kind not in ("ISSUE", "WASTE"):
        return ["Choose used or wasted"], None
    qty = _d(get("quantity"))
    if qty is None or qty <= 0:
        return ["How much?"], None
    if get("sale_unit").upper() == "PART":
        # Issued in parts (3 kg off a 50 kg bag): convert to a fraction of a unit.
        from products.units import content_per_unit, fmt, part_label, part_size, sells_in_parts

        v = _parts_view(stock)
        if not sells_in_parts(v):
            return [f"{stock.title} isn't issued in parts — set its part size first"], None
        parts = qty
        qty = _q3(parts * part_size(v) / content_per_unit(v))
        if qty <= 0:
            return ["That's too small to record"], None
        if not get("reason"):
            data = {**data, "reason": f"{fmt(parts)} {part_label(v)}"}
            get = lambda k: str(data.get(k) or "").strip()
    if qty > Decimal(stock.quantity or 0):
        return [f"Only {stock.quantity} {stock.unit} on hand — count the stock if that's wrong"], None
    with transaction.atomic():
        stock = _apply(stock, kind, -qty, user, reason=get("reason") or ("Kitchen use" if kind == "ISSUE" else "Spoilt"), draft_id=draft)
    return [], stock


def count(data, user):
    get = lambda k: str(data.get(k) or "").strip()
    draft = get("draft_id") or None
    done = _replayed(draft, user)
    if done:
        return [], done
    stock = rm.RestaurantStock.objects.filter(id=get("stock"), entity=user.entity).first()
    if not stock:
        return ["Item not found"], None
    counted = _d(get("counted"))
    if counted is None or counted < 0:
        return ["Enter the quantity counted"], None
    with transaction.atomic():
        stock = _apply(stock, "ADJUST", counted - Decimal(stock.quantity or 0), user, reason=get("reason") or "Stock count", draft_id=draft)
    return [], stock


def update_item(data, user):
    """Edit name / category / unit / reorder level."""
    get = lambda k: str(data.get(k) or "").strip()
    stock = rm.RestaurantStock.objects.filter(id=get("stock"), entity=user.entity).first()
    if not stock:
        return ["Item not found"], None
    if get("title"):
        stock.title = get("title")[:256]
    if get("category").upper() in CATEGORIES:
        stock.category = get("category").upper()
    if get("unit"):
        stock.unit = get("unit")[:32]
    if get("reorder_level"):
        stock.reorder_level = _d(get("reorder_level"), "0") or 0
    if "sold_in_parts" in data:
        # Issued in parts: same form fields as a product (products/units_admin.py).
        from products.units_admin import apply_parts_settings

        v = _parts_view(stock)
        errors = apply_parts_settings(v, data)
        if errors:
            return errors, None
        if v.sold_in_parts:
            stock.measure, stock.content_per_unit, stock.part_size, stock.part_label = v.measure, v.content_per_unit, v.part_size, v.part_label
        else:
            stock.measure, stock.content_per_unit, stock.part_size, stock.part_label = None, 0, 0, None
    stock.save()
    return [], stock
