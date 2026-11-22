# distributors/services/catalogue.py
#
# What a distributor sells to wholesalers:
#   stock lots (DistributorReceipts): quantity in units of receipt, buying price
#     (never shown to buyers), list price, final price after an active price
#     discount, listed or not;
#   price discounts: a lower price for a period (offer price, or percent off);
#   quantity discounts: buy N, get M free (repeating);
#   discovery: distributors a wholesaler may buy from — near them or anywhere,
#     by name or by a product they stock — and one distributor's catalogue.

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from authentication.models import Entities
from distributors.models import DistributorPriceDiscounts, DistributorQuantityDiscounts, DistributorReceipts
from distributors.services.access import DISTRIBUTOR_TYPES, distributor_types_for, employee_of

UNITS = {"Pack", "Piece", "Box", "Carton", "Strip", "Bottle", "Tube", "Sachet"}


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


def _day(v, label, errors, required=True):
    if v in (None, ""):
        if required:
            errors.append(f"Pick the {label}")
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except Exception:
        errors.append(f"Pick a valid {label}")
        return None


# ---------------------------------------------------------------- output

def active_quantity_discount(lot, today=None):
    today = today or timezone.localdate()
    return lot.quantity_discounts.filter(is_active=True, start__lte=today, end__gte=today).order_by("-start", "-created").first()


def lot_out(lot, for_buyer=False):
    qd = active_quantity_discount(lot)
    out = {
        "id": str(lot.id),
        "distributor": str(lot.entity_id),
        "product": str(lot.product_id),
        "title": lot.product.title,
        "bar_code": lot.bar_code or lot.product.bar_code,
        "unit_of_receipt": lot.unit_of_receipt,
        "units_per_pack": getattr(lot.product, "units_per_pack", None),
        "current_unit_quantity": lot.current_unit_quantity,
        "unit_selling_price": str(lot.unit_selling_price),
        "final_unit_selling_price": str(lot.final_unit_selling_price or lot.unit_selling_price),
        "discount_unit_selling_price": str(lot.discount_unit_selling_price),
        "batch": lot.batch,
        "expiry_date": lot.expiry_date.isoformat() if lot.expiry_date else None,
        "quantity_discount": (
            {"id": str(qd.id), "title": qd.title, "limit_quantity": qd.limit_quantity, "awarded_quantity": qd.awarded_quantity, "end": qd.end.isoformat()}
            if qd else None
        ),
    }
    if not for_buyer:
        out.update({
            "received_unit_quantity": lot.received_unit_quantity,
            "unit_buying_price": str(lot.unit_buying_price),
            "manufacture_date": lot.manufacture_date.isoformat() if lot.manufacture_date else None,
            "is_listed": lot.is_listed,
            "description": lot.description,
            "created": lot.created.isoformat() if lot.created else None,
        })
    return out


# ---------------------------------------------------------------- stock (distributor staff)

def list_stock(distributor, data):
    qs = DistributorReceipts.objects.filter(entity=distributor).select_related("product").order_by("product__title", "expiry_date")
    q = str(data.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(product__title__icontains=q) | Q(bar_code__iexact=q) | Q(batch__iexact=q))
    scope = str(data.get("scope") or "ALL").upper()
    if scope == "IN_STOCK":
        qs = qs.filter(current_unit_quantity__gt=0)
    elif scope == "OUT_OF_STOCK":
        qs = qs.filter(current_unit_quantity__lte=0)
    elif scope == "UNLISTED":
        qs = qs.filter(is_listed=False)
    return qs[:2000]


def save_lot(distributor, user, data):
    """
    SaveStockLot {lot?, product, received_unit_quantity (new lots), current_unit_quantity?
    (a count, existing lots), unit_of_receipt, unit_buying_price, unit_selling_price,
    batch?, manufacture_date?, expiry_date?, is_listed?, description?, draft_id?}.
    """
    from products.models import Products

    errors = []
    lot = None
    if data.get("lot"):
        lot = DistributorReceipts.objects.filter(id=data["lot"], entity=distributor).first()
        if not lot:
            return ["Stock lot not found"], None
    elif data.get("draft_id"):
        done = DistributorReceipts.objects.filter(entity=distributor, draft_id=data["draft_id"]).first()
        if done:
            return [], done

    product = lot.product if lot else Products.objects.filter(id=data.get("product") or None).first() if data.get("product") else None
    if not product:
        errors.append("Pick the product")
    unit = str(data.get("unit_of_receipt") or (lot.unit_of_receipt if lot else "Pack"))
    if unit not in UNITS:
        errors.append("Pick a valid unit")
    buying = _dec(data.get("unit_buying_price", lot.unit_buying_price if lot else None), "buying price", errors)
    selling = _dec(data.get("unit_selling_price", lot.unit_selling_price if lot else None), "selling price", errors)
    if buying is not None and selling is not None and selling <= 0:
        errors.append("Set a selling price above 0")
    received = current = None
    if lot is None:
        received = _int(data.get("received_unit_quantity"), "quantity received", errors, 1)
    elif data.get("current_unit_quantity") not in (None, ""):
        current = _int(data.get("current_unit_quantity"), "quantity in stock", errors, 0)
    expiry = _day(data.get("expiry_date"), "expiry date", errors, required=False)
    made = _day(data.get("manufacture_date"), "manufacture date", errors, required=False)
    if product and getattr(product, "preparation_id", None) and lot is None and not expiry:
        errors.append("Medicines need an expiry date")
    if errors:
        return errors, None

    with transaction.atomic():
        if lot is None:
            lot = DistributorReceipts(
                entity=distributor, owner=user, product=product, employee=employee_of(user, distributor),
                received_unit_quantity=received, current_unit_quantity=received, draft_id=data.get("draft_id") or None,
                pack_quantity=received, is_drug=bool(getattr(product, "preparation_id", None)),
            )
        elif current is not None:
            lot.current_unit_quantity = current
        lot.unit_of_receipt = unit
        lot.unit_buying_price = buying
        lot.unit_selling_price = selling
        lot.pack_buying_price, lot.pack_selling_price = buying, selling
        if "batch" in data:
            lot.batch = str(data.get("batch") or "")[:100] or None
        if "expiry_date" in data:
            lot.expiry_date = expiry
        if "manufacture_date" in data:
            lot.manufacture_date = made
        if "is_listed" in data:
            lot.is_listed = str(data.get("is_listed")).lower() in ("true", "1", "yes")
        if "description" in data:
            lot.description = str(data.get("description") or "")[:300]
        lot.save()
        lot.sync_price_from_discounts()
    return [], lot


# ---------------------------------------------------------------- discounts (distributor staff)

def discount_out(d, kind):
    lot = d.distributor_receipt
    row = {
        "id": str(d.id),
        "kind": kind,
        "lot": str(lot.id),
        "title": d.title,
        "product_title": lot.product.title,
        "start": d.start.isoformat(),
        "end": d.end.isoformat(),
        "is_active": d.is_active,
        "running": d.is_active and d.start <= timezone.localdate() <= d.end,
    }
    if kind == "PRICE":
        row.update({"percent": str(d.percent), "normal_price": str(d.normal_price), "offer_price": str(d.offer_price)})
    else:
        row.update({"limit_quantity": d.limit_quantity, "awarded_quantity": d.awarded_quantity})
    return row


def list_discounts(distributor, kind):
    model = DistributorPriceDiscounts if kind == "PRICE" else DistributorQuantityDiscounts
    return [discount_out(d, kind) for d in model.objects.filter(entity=distributor).select_related("distributor_receipt__product")[:1000]]


def save_discount(distributor, user, kind, data):
    """
    SavePriceDiscount {discount?, lot, title, percent? | offer_price?, start, end, is_active?}
    SaveQuantityDiscount {discount?, lot, title, limit_quantity, awarded_quantity, start, end, is_active?}
    """
    errors = []
    model = DistributorPriceDiscounts if kind == "PRICE" else DistributorQuantityDiscounts
    d = None
    if data.get("discount"):
        d = model.objects.filter(id=data["discount"], entity=distributor).first()
        if not d:
            return ["Discount not found"], None
    lot = d.distributor_receipt if d else DistributorReceipts.objects.filter(id=data.get("lot") or None, entity=distributor).first() if data.get("lot") else None
    if not lot:
        errors.append("Pick the stock lot")
    title = str(data.get("title") or (d.title if d else "")).strip()
    if not title:
        errors.append("Give the discount a title")
    start = _day(data.get("start", d.start.isoformat() if d else None), "start date", errors)
    end = _day(data.get("end", d.end.isoformat() if d else None), "end date", errors)
    if start and end and end < start:
        errors.append("The end date must be on or after the start")
    fields = {}
    if kind == "PRICE" and lot:
        price = Decimal(lot.unit_selling_price or 0)
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
            if offer is not None and lot.unit_buying_price and offer < Decimal(lot.unit_buying_price):
                errors.append(f"The offer is below the lot's cost (KES {lot.unit_buying_price})")
            fields = {"percent": percent, "normal_price": price, "offer_price": offer}
    elif kind == "QUANTITY":
        limit = _int(data.get("limit_quantity", d.limit_quantity if d else None), "quantity to buy", errors, 1)
        awarded = _int(data.get("awarded_quantity", d.awarded_quantity if d else None), "quantity given free", errors, 1)
        fields = {"limit_quantity": limit, "awarded_quantity": awarded}
    if errors:
        return errors, None
    with transaction.atomic():
        if d is None:
            d = model(entity=distributor, owner=user, distributor_receipt=lot)
        d.title, d.start, d.end = title[:200], start, end
        for k, v in fields.items():
            setattr(d, k, v)
        if "is_active" in data:
            d.is_active = str(data.get("is_active")).lower() in ("true", "1", "yes")
        d.save()
        lot.sync_price_from_discounts()
    return [], d


def free_quantity(lot, quantity):
    """Units given free for buying `quantity` under the lot's running quantity discount."""
    qd = active_quantity_discount(lot)
    if not qd or not qd.limit_quantity:
        return 0
    return (int(quantity) // qd.limit_quantity) * qd.awarded_quantity


# ---------------------------------------------------------------- discovery (wholesalers)

def _in_stock(qs):
    return qs.filter(is_listed=True, current_unit_quantity__gt=0)


def discover(wholesaler, data):
    """
    DiscoverDistributors {mode: ADJACENT|ALL, latitude?, longitude?, radius_km?, search?, product?}
    -> distributors this wholesaler may buy from, with distance and stock counts.
    """
    from logistics.utils.deliveries import entity_point, km_between
    from django.contrib.gis.geos import Point

    types = distributor_types_for(wholesaler)
    qs = Entities.objects.filter(entity_type__in=types, is_active=True)
    search = str(data.get("search") or "").strip()
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(town__icontains=search) | Q(entity_code__iexact=search))
    product = str(data.get("product") or "").strip()
    lots = _in_stock(DistributorReceipts.objects.filter(entity__in=qs))
    matches = {}
    if product:
        hit = lots.filter(Q(product__title__icontains=product) | Q(bar_code__iexact=product))
        for eid, title in hit.values_list("entity_id", "product__title")[:2000]:
            matches.setdefault(eid, set()).add(title)
        qs = qs.filter(id__in=list(matches.keys()))
    counts = dict(lots.values("entity_id").annotate(n=Count("product", distinct=True)).values_list("entity_id", "n"))

    here = None
    try:
        here = Point(float(data["longitude"]), float(data["latitude"]), srid=4326)
    except (KeyError, TypeError, ValueError):
        here = entity_point(wholesaler)
    try:
        radius = Decimal(str(data.get("radius_km") or 50))
    except Exception:
        radius = Decimal("50")
    rows = []
    for e in qs[:500]:
        p = entity_point(e)
        km = km_between(here, p) if here and p else None
        if str(data.get("mode") or "ALL").upper() == "ADJACENT" and (km is None or km > radius):
            continue
        rows.append({
            "id": str(e.id),
            "title": e.title,
            "entity_type": e.entity_type,
            "town": e.town,
            "road": e.road,
            "phone": getattr(e, "phone", None),
            "distance_km": float(km) if km is not None else None,
            "products_in_stock": counts.get(e.id, 0),
            "matches": sorted(matches.get(e.id, []))[:10],
        })
    rows.sort(key=lambda r: (r["distance_km"] is None, r["distance_km"] or 0, r["title"]))
    return rows[:200]


def catalogue(wholesaler, distributor_id, data):
    """GetCatalogue {distributor, q?} -> the distributor's listed, in-stock lots (buyer view)."""
    d = Entities.objects.filter(id=distributor_id or None, entity_type__in=distributor_types_for(wholesaler)).first() if distributor_id else None
    if not d:
        return ["Distributor not found"], None, []
    qs = _in_stock(DistributorReceipts.objects.filter(entity=d)).select_related("product").order_by("product__title", "expiry_date")
    q = str(data.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(product__title__icontains=q) | Q(bar_code__iexact=q))
    return [], d, [lot_out(l, for_buyer=True) for l in qs[:1000]]
