# manufacturers/services/catalogue.py
#
# What a manufacturer sells to distributors:
#   production batches (ManufacturerBatches) of its OWN products only: batch number,
#     manufacture / expiry dates, unit of issue (carton, box...) and how many packs it
#     holds, quantity produced / left, production cost (never shown to buyers), list
#     price, final price after an active price discount, minimum order, listed or not;
#   price discounts (offer price or percent off, never below cost) and quantity
#     discounts (buy N, get M free, repeating);
#   discovery: manufacturers a distributor may buy from — near or anywhere, by name
#     or by a product they make — and one manufacturer's catalogue.

from datetime import date, timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone

from authentication.models import Entities
from manufacturers.models import UNIT_CHOICES, ManufacturerBatches, ManufacturerPriceDiscounts, ManufacturerQuantityDiscounts
from manufacturers.services.access import manufacturer_types_for

UNITS = {u for u, _ in UNIT_CHOICES}


def _dec(v, label, errors, minimum=Decimal("0")):
    try:
        d = Decimal(str(v if v not in (None, "") else "x"))
    except Exception:
        errors.append(f"Enter the {label}")
        return None
    if d < minimum:
        errors.append(f"The {label} can't be below {minimum}")
        return None
    return d


def _int(v, label, errors, minimum=0):
    try:
        n = int(str(v))
    except Exception:
        errors.append(f"Enter the {label}")
        return None
    if n < minimum:
        errors.append(f"The {label} must be at least {minimum}")
        return None
    return n


def _day(v, label, errors, required=False):
    if v in (None, ""):
        if required:
            errors.append(f"Pick the {label}")
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except Exception:
        errors.append(f"Pick a valid {label}")
        return None


def active_quantity_discount(batch, today=None):
    today = today or timezone.localdate()
    return batch.quantity_discounts.filter(is_active=True, start__lte=today, end__gte=today).order_by("-start", "-created").first()


def free_quantity(batch, quantity):
    qd = active_quantity_discount(batch)
    if not qd or not qd.limit_quantity:
        return 0
    return (int(quantity) // qd.limit_quantity) * qd.awarded_quantity


def batch_out(b, for_buyer=False):
    qd = active_quantity_discount(b)
    p = b.product
    out = {
        "id": str(b.id),
        "manufacturer": str(b.entity_id),
        "product": str(b.product_id),
        "title": p.title,
        "packaging": p.packaging,
        "bar_code": p.bar_code,
        "units_per_pack": p.units_per_pack,
        "is_drug": bool(p.preparation_id),
        "batch": b.batch,
        "manufacture_date": b.manufacture_date.isoformat() if b.manufacture_date else None,
        "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
        "unit_of_issue": b.unit_of_issue,
        "packs_per_unit": b.packs_per_unit,
        "current_quantity": b.current_quantity,
        "unit_price": str(b.unit_price),
        "final_unit_price": str(b.final_unit_price or b.unit_price),
        "discount_unit_price": str(b.discount_unit_price),
        "minimum_order_quantity": b.minimum_order_quantity,
        "quantity_discount": (
            {"id": str(qd.id), "title": qd.title, "limit_quantity": qd.limit_quantity, "awarded_quantity": qd.awarded_quantity, "end": qd.end.isoformat()}
            if qd else None
        ),
    }
    if not for_buyer:
        out.update({
            "produced_quantity": b.produced_quantity,
            "unit_cost": str(b.unit_cost),
            "is_listed": b.is_listed,
            "description": b.description,
            "created": b.created.isoformat() if b.created else None,
        })
    return out


# ---------------------------------------------------------------- batches (manufacturer staff)

def list_batches(manufacturer, data):
    qs = ManufacturerBatches.objects.filter(entity=manufacturer).select_related("product").order_by("product__title", "expiry_date")
    q = str(data.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(product__title__icontains=q) | Q(product__bar_code__iexact=q) | Q(batch__iexact=q))
    if data.get("product"):
        qs = qs.filter(product_id=data["product"])
    scope = str(data.get("scope") or "ALL").upper()
    if scope == "IN_STOCK":
        qs = qs.filter(current_quantity__gt=0)
    elif scope == "OUT_OF_STOCK":
        qs = qs.filter(current_quantity__lte=0)
    elif scope == "UNLISTED":
        qs = qs.filter(is_listed=False)
    elif scope == "EXPIRING":
        qs = qs.filter(current_quantity__gt=0, expiry_date__isnull=False, expiry_date__lte=timezone.localdate() + timedelta(days=90))
    return qs[:2000]


def save_batch(manufacturer, user, data):
    """
    SaveBatch {batch_id?, product, batch, produced_quantity (new), current_quantity? (a count),
    unit_of_issue, packs_per_unit, unit_cost, unit_price, manufacture_date?, expiry_date?,
    minimum_order_quantity?, is_listed?, description?, draft_id?}.
    """
    from products.models import Products

    errors = []
    b = None
    if data.get("batch_id"):
        b = ManufacturerBatches.objects.filter(id=data["batch_id"], entity=manufacturer).first()
        if not b:
            return ["Batch not found"], None
    elif data.get("draft_id"):
        done = ManufacturerBatches.objects.filter(entity=manufacturer, draft_id=data["draft_id"]).first()
        if done:
            return [], done
    product = b.product if b else Products.objects.filter(id=data.get("product") or None, manufacturer=manufacturer).first() if data.get("product") else None
    if not product:
        errors.append("Pick one of your products")
    number = str(data.get("batch") if "batch" in data else (b.batch if b else "")).strip()
    if not number:
        errors.append("Enter the batch number")
    unit = str(data.get("unit_of_issue") or (b.unit_of_issue if b else "Carton"))
    if unit not in UNITS:
        errors.append("Pick a valid unit")
    packs = _int(data.get("packs_per_unit", b.packs_per_unit if b else 1), "packs per unit", errors, 1)
    cost = _dec(data.get("unit_cost", b.unit_cost if b else 0), "production cost", errors)
    price = _dec(data.get("unit_price", b.unit_price if b else None), "selling price", errors)
    if price is not None and price <= 0:
        errors.append("Set a selling price above 0")
    if cost is not None and price is not None and cost > 0 and price < cost:
        errors.append("The selling price is below the production cost")
    produced = current = None
    if b is None:
        produced = _int(data.get("produced_quantity"), "quantity produced", errors, 1)
    elif data.get("current_quantity") not in (None, ""):
        current = _int(data.get("current_quantity"), "quantity in stock", errors, 0)
    made = _day(data.get("manufacture_date"), "manufacture date", errors)
    expiry = _day(data.get("expiry_date"), "expiry date", errors)
    if product and product.preparation_id and (expiry or (b.expiry_date if b else None)) is None:
        errors.append("Medicines need an expiry date")
    if made and expiry and expiry <= made:
        errors.append("The expiry date must be after the manufacture date")
    moq = _int(data.get("minimum_order_quantity", b.minimum_order_quantity if b else 1), "minimum order", errors, 1)
    if errors:
        return errors, None
    try:
        with transaction.atomic():
            if b is None:
                b = ManufacturerBatches(
                    entity=manufacturer, owner=user, product=product, produced_quantity=produced,
                    current_quantity=produced, draft_id=data.get("draft_id") or None,
                )
            elif current is not None:
                b.current_quantity = current
            b.batch = number[:100]
            b.unit_of_issue, b.packs_per_unit, b.unit_cost, b.unit_price, b.minimum_order_quantity = unit, packs, cost, price, moq
            if "manufacture_date" in data or b._state.adding:
                b.manufacture_date = made
            if "expiry_date" in data or b._state.adding:
                b.expiry_date = expiry
            if "is_listed" in data:
                b.is_listed = str(data.get("is_listed")).lower() in ("true", "1", "yes")
            if "description" in data:
                b.description = str(data.get("description") or "")[:300]
            b.save()
            b.sync_price_from_discounts()
    except IntegrityError:
        return [f"Batch {number.upper()} of this product already exists"], None
    return [], b


# ---------------------------------------------------------------- discounts

def discount_out(d, kind):
    b = d.batch
    row = {
        "id": str(d.id), "kind": kind, "batch_id": str(b.id), "lot": str(b.id), "batch": b.batch, "title": d.title,
        "product_title": b.product.title, "start": d.start.isoformat(), "end": d.end.isoformat(),
        "is_active": d.is_active, "running": d.is_active and d.start <= timezone.localdate() <= d.end,
    }
    if kind == "PRICE":
        row.update({"percent": str(d.percent), "normal_price": str(d.normal_price), "offer_price": str(d.offer_price)})
    else:
        row.update({"limit_quantity": d.limit_quantity, "awarded_quantity": d.awarded_quantity})
    return row


def list_discounts(manufacturer, kind):
    model = ManufacturerPriceDiscounts if kind == "PRICE" else ManufacturerQuantityDiscounts
    return [discount_out(d, kind) for d in model.objects.filter(entity=manufacturer).select_related("batch__product")[:1000]]


def save_discount(manufacturer, user, kind, data):
    """SavePriceDiscount {discount?, batch_id, title, percent?|offer_price?, start, end, is_active?} / SaveQuantityDiscount {... limit_quantity, awarded_quantity}."""
    errors = []
    model = ManufacturerPriceDiscounts if kind == "PRICE" else ManufacturerQuantityDiscounts
    d = None
    if data.get("discount"):
        d = model.objects.filter(id=data["discount"], entity=manufacturer).first()
        if not d:
            return ["Discount not found"], None
    b = d.batch if d else ManufacturerBatches.objects.filter(id=data.get("batch_id") or None, entity=manufacturer).first() if data.get("batch_id") else None
    if not b:
        errors.append("Pick the batch")
    title = str(data.get("title") or (d.title if d else "")).strip()
    if not title:
        errors.append("Give the discount a title")
    start = _day(data.get("start", d.start.isoformat() if d else None), "start date", errors, True)
    end = _day(data.get("end", d.end.isoformat() if d else None), "end date", errors, True)
    if start and end and end < start:
        errors.append("The end date must be on or after the start")
    fields = {}
    if kind == "PRICE" and b:
        price = Decimal(b.unit_price or 0)
        offer = _dec(data.get("offer_price") or 0, "offer price", errors)
        percent = _dec(data.get("percent") or 0, "percent", errors)
        if offer is not None and percent is not None:
            if offer <= 0 and percent <= 0:
                errors.append("Enter an offer price or a percent off")
            if offer > 0 and offer >= price:
                errors.append(f"The offer price must be below the list price (KES {price})")
            if percent >= 100:
                errors.append("The percent must be below 100")
            if offer <= 0 and percent > 0:
                offer = (price * (Decimal("100") - percent) / Decimal("100")).quantize(Decimal("0.01"))
            if b.unit_cost and offer < Decimal(b.unit_cost):
                errors.append(f"The offer is below the production cost (KES {b.unit_cost})")
            fields = {"percent": percent, "normal_price": price, "offer_price": offer}
    elif kind == "QUANTITY":
        fields = {
            "limit_quantity": _int(data.get("limit_quantity", d.limit_quantity if d else None), "quantity to buy", errors, 1),
            "awarded_quantity": _int(data.get("awarded_quantity", d.awarded_quantity if d else None), "quantity given free", errors, 1),
        }
    if errors:
        return errors, None
    with transaction.atomic():
        if d is None:
            d = model(entity=manufacturer, owner=user, batch=b)
        d.title, d.start, d.end = title[:200], start, end
        for k, v in fields.items():
            setattr(d, k, v)
        if "is_active" in data:
            d.is_active = str(data.get("is_active")).lower() in ("true", "1", "yes")
        d.save()
        b.sync_price_from_discounts()
    return [], d


# ---------------------------------------------------------------- discovery (distributors)

def _on_sale(qs):
    return qs.filter(is_listed=True, current_quantity__gt=0, product__active=True)


def discover(distributor, data):
    """DiscoverManufacturers {mode: ADJACENT|ALL, latitude?, longitude?, radius_km?, search?, product?}."""
    from django.contrib.gis.geos import Point

    from logistics.utils.deliveries import entity_point, km_between

    qs = Entities.objects.filter(entity_type__in=manufacturer_types_for(distributor), is_active=True)
    search = str(data.get("search") or "").strip()
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(town__icontains=search) | Q(entity_code__iexact=search))
    batches = _on_sale(ManufacturerBatches.objects.filter(entity__in=qs))
    product = str(data.get("product") or "").strip()
    matches = {}
    if product:
        for eid, title in batches.filter(Q(product__title__icontains=product) | Q(product__bar_code__iexact=product)).values_list("entity_id", "product__title")[:2000]:
            matches.setdefault(eid, set()).add(title)
        qs = qs.filter(id__in=list(matches.keys()))
    counts = dict(batches.values("entity_id").annotate(n=Count("product", distinct=True)).values_list("entity_id", "n"))
    try:
        here = Point(float(data["longitude"]), float(data["latitude"]), srid=4326)
    except (KeyError, TypeError, ValueError):
        here = entity_point(distributor)
    try:
        radius = Decimal(str(data.get("radius_km") or 100))
    except Exception:
        radius = Decimal("100")
    rows = []
    for e in qs[:500]:
        p = entity_point(e)
        km = km_between(here, p) if here and p else None
        if str(data.get("mode") or "ALL").upper() == "ADJACENT" and (km is None or km > radius):
            continue
        rows.append({
            "id": str(e.id), "title": e.title, "entity_type": e.entity_type, "town": e.town, "road": e.road,
            "phone": getattr(e, "phone", None), "distance_km": float(km) if km is not None else None,
            "products_in_stock": counts.get(e.id, 0), "matches": sorted(matches.get(e.id, []))[:10],
        })
    rows.sort(key=lambda r: (r["distance_km"] is None, r["distance_km"] or 0, r["title"]))
    return rows[:200]


def catalogue(distributor, manufacturer_id, data):
    """GetCatalogue {manufacturer, q?}: the manufacturer's batches on sale (buyer view)."""
    m = Entities.objects.filter(id=manufacturer_id or None, entity_type__in=manufacturer_types_for(distributor)).first() if manufacturer_id else None
    if not m:
        return ["Manufacturer not found"], None, []
    qs = _on_sale(ManufacturerBatches.objects.filter(entity=m)).select_related("product").order_by("product__title", "expiry_date")
    q = str(data.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(product__title__icontains=q) | Q(product__bar_code__iexact=q))
    return [], m, [batch_out(b, for_buyer=True) for b in qs[:1000]]
