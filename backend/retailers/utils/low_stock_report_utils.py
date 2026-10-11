# retailers/utils/low_stock_report_utils.py
#
# Low stock / reorder report for a retailer entity.
#
# One row per product whose current stock has fallen to or below its
# reorder target. Target is derived in priority order:
#   1. maximum_stock from RetailerVariations (if set)
#   2. avg_daily_sales × cover_days (velocity-based)
#   3. reorder_level × 2 (fallback)
#
# Each row carries a suggested order quantity rounded to pack size,
# the last known purchase price, and the wholesaler last supplied from.
#
# WHOLESALE OFFERS
# ----------------
# For every low-stock product we scan WholesalerReceipts for lots with
# stock on hand and attach the offers to the row. Any active price or
# quantity discount on those lots is captured and factored into the
# ranking.
#
# Offers are ranked per product in this priority:
#     1. Has an active price discount               (best first)
#     2. Higher price discount percentage
#     3. Has an active quantity (bonus) discount
#     4. Lower effective unit price
#
# The top offer per product becomes the "best_offer". A savings figure
# is computed against the retailer's current unit cost so the report
# can surface total achievable savings on the suggested order.
#
# Returns (errors, report_dict).

from datetime import date as date_cls, timedelta
from decimal import Decimal, ROUND_CEILING

from django.db.models import (
    Count,
    DecimalField,
    F,
    Max,
    Q,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from authentication.models import Entities
from retailers.models import (
    CustomerOrderItems,
    RetailerReceipts,
    RetailerVariations,
)
from wholesalers.models import (
    WholesalerPriceDiscounts,
    WholesalerQuantityDiscounts,
    WholesalerReceipts,
)


# =====================================================================
# Typed zero constants
#
# `Value(0)` is an IntegerField. Coalescing it against a Sum over a
# DecimalField makes Django refuse to compile with "Expression
# contains mixed types". Give each fallback the right type explicitly.
# =====================================================================

ZERO_DEC = Value(
    Decimal("0.00"),
    output_field=DecimalField(max_digits=18, decimal_places=2),
)
ZERO_INT = Value(0)


# =====================================================================
# Constants
# =====================================================================

DEFAULT_LOOKBACK_DAYS = 30
DEFAULT_COVER_DAYS = 30
DEFAULT_OFFERS_PER_PRODUCT = 5
MAX_OFFERS_PER_PRODUCT = 20
MAX_WINDOW_DAYS = 180

EXCLUDED_ORDER_STATUSES = ("CANCELLED",)

URGENCY_META = {
    "OUT":       {"label": "Out of stock", "rank": 0},
    "CRITICAL":  {"label": "Critical",     "rank": 1},
    "WARNING":   {"label": "Warning",      "rank": 2},
    "SOON":      {"label": "Running low",  "rank": 3},
}


# =====================================================================
# Params
# =====================================================================

def _clamped_int(data, key, default, max_value):
    raw = data.get(key)
    if raw is None:
        return default
    try:
        v = int(raw)
    except (TypeError, ValueError):
        return default
    if v <= 0:
        return default
    return min(v, max_value)


# =====================================================================
# Velocity
# =====================================================================

def _sales_velocity_map(entity, lookback_days):
    """
    { product_id: {units, last_sale} } for the lookback window.

    `total_quantity` is a DecimalField — use ZERO_DEC as the Coalesce
    fallback so Django can compile the aggregate.
    """
    cutoff = timezone.now().date() - timedelta(days=lookback_days)

    rows = (
        CustomerOrderItems.objects
        .filter(
            customer_order__entity=entity,
            customer_order__created__date__gte=cutoff,
            retailer_receipt__product_id__isnull=False,
        )
        .exclude(customer_order__status__in=EXCLUDED_ORDER_STATUSES)
        .values("retailer_receipt__product__id")
        .annotate(
            units=Coalesce(Sum("total_quantity"), ZERO_DEC),
            last_sale=Max("customer_order__created"),
        )
    )

    return {
        str(r["retailer_receipt__product__id"]): {
            "units": float(r["units"] or 0),
            "last_sale": r["last_sale"],
        }
        for r in rows
    }


def _last_sale_map_all_time(entity):
    """{ product_id: last_sale_datetime } — used when velocity is 0."""
    rows = (
        CustomerOrderItems.objects
        .filter(
            customer_order__entity=entity,
            retailer_receipt__product_id__isnull=False,
        )
        .exclude(customer_order__status__in=EXCLUDED_ORDER_STATUSES)
        .values("retailer_receipt__product__id")
        .annotate(last_sale=Max("customer_order__created"))
    )
    return {
        str(r["retailer_receipt__product__id"]): r["last_sale"]
        for r in rows
    }


# =====================================================================
# Stock snapshot per product
# =====================================================================

def _stock_map(entity):
    """
    { product_id: {units, pack, receipt_count} }
    Aggregates active receipts per product.
    """
    rows = (
        RetailerReceipts.objects
        .filter(entity=entity, is_active="true")
        .values("product__id")
        .annotate(
            units=Coalesce(Sum("current_unit_quantity"), ZERO_INT),
            pack=Max("units_per_pack"),
            receipt_count=Count("id"),
        )
    )
    return {
        str(r["product__id"]): {
            "units": int(r["units"] or 0),
            "pack": max(1, int(r["pack"] or 1)),
            "receipt_count": r["receipt_count"],
        }
        for r in rows
        if r["product__id"]
    }


def _variation_map(entity):
    """{ product_id: variation } for this entity."""
    rows = RetailerVariations.objects.filter(entity=entity)
    return {str(v.product_id): v for v in rows}


def _last_purchase_map(entity, product_ids):
    """Latest non-zero purchase price + wholesaler per product."""
    if not product_ids:
        return {}

    rows = (
        RetailerReceipts.objects
        .filter(
            entity=entity,
            product_id__in=product_ids,
            unit_buying_price__gt=0,
        )
        .order_by("product_id", "-created")
        .values(
            "product_id",
            "unit_buying_price",
            "received_from_id",
            "received_from__title",
        )
    )

    out = {}
    for r in rows:
        pid = str(r["product_id"])
        if pid in out:
            continue
        out[pid] = {
            "price": r["unit_buying_price"] or Decimal("0.00"),
            "wholesaler_id": (
                str(r["received_from_id"])
                if r["received_from_id"] else None
            ),
            "wholesaler_title": r["received_from__title"] or "",
        }
    return out


# =====================================================================
# Wholesale offers
# =====================================================================

def _is_current_discount(discount, today):
    """
    True when today falls inside the discount's active window.

    Field names on the wholesaler discount models are not guaranteed
    to match the retailer-side convention (`start_date` / `end_date`).
    Accept either spelling; a missing date field means "always current".
    """
    start = (
        getattr(discount, "start_date", None)
        or getattr(discount, "start", None)
    )
    end = (
        getattr(discount, "end_date", None)
        or getattr(discount, "end", None)
    )
    if start and today < start:
        return False
    if end and today > end:
        return False
    return True


def _load_wholesale_offers(product_ids, today):
    """
    Return { product_id: [offer_dict, ...] } for all wholesaler lots
    carrying stock of any of the given products.

    Three queries total regardless of product count.
    """
    if not product_ids:
        return {}

    # NOTE: WholesalerReceipts has no `is_active` field (that flag lives
    # on RetailerReceipts). Availability is implied by
    # `current_unit_quantity > 0`, which is the only test we need here.
    receipts = list(
        WholesalerReceipts.objects
        .filter(
            product_id__in=product_ids,
            current_unit_quantity__gt=0,
        )
        .select_related("entity", "product")
    )
    if not receipts:
        return {}

    receipt_ids = [r.id for r in receipts]

    # ---- Price discounts ----
    try:
        raw_price_discounts = list(
            WholesalerPriceDiscounts.objects
            .filter(
                wholesaler_receipt_id__in=receipt_ids,
                is_active="true",
            )
        )
    except Exception:
        raw_price_discounts = []

    price_by_receipt = {}
    for d in raw_price_discounts:
        if not _is_current_discount(d, today):
            continue
        rid = d.wholesaler_receipt_id
        current = price_by_receipt.get(rid)
        if current is None or float(d.percent or 0) > float(current.percent or 0):
            price_by_receipt[rid] = d

    # ---- Quantity discounts ----
    try:
        raw_qty_discounts = list(
            WholesalerQuantityDiscounts.objects
            .filter(
                wholesaler_receipt_id__in=receipt_ids,
                is_active="true",
            )
        )
    except Exception:
        raw_qty_discounts = []

    qty_by_receipt = {}
    for d in raw_qty_discounts:
        if not _is_current_discount(d, today):
            continue
        rid = d.wholesaler_receipt_id
        current = qty_by_receipt.get(rid)
        if current is None or int(d.awarded_quantity or 0) > int(current.awarded_quantity or 0):
            qty_by_receipt[rid] = d

    # ---- Assemble per product ----
    by_product: dict = {}
    for r in receipts:
        base_price = r.unit_selling_price or Decimal("0.00")
        pd = price_by_receipt.get(r.id)
        qd = qty_by_receipt.get(r.id)

        effective_price = base_price
        price_discount_payload = None
        if pd is not None:
            effective_price = (
                pd.offer_price if pd.offer_price is not None
                else base_price
            )
            price_discount_payload = {
                "id": str(pd.id),
                "title": pd.title or "",
                "percent": str(pd.percent or "0"),
                "normal_price": str(pd.normal_price or "0"),
                "offer_price": str(pd.offer_price or "0"),
            }

        quantity_discount_payload = None
        if qd is not None:
            quantity_discount_payload = {
                "id": str(qd.id),
                "title": qd.title or "",
                "limit_quantity": int(qd.limit_quantity or 0),
                "awarded_quantity": int(qd.awarded_quantity or 0),
            }

        expiry = r.expiry_date
        days_to_expiry = (
            (expiry - today).days if expiry is not None else None
        )

        offer = {
            "receipt_id": str(r.id),
            "product_id": str(r.product_id),
            "wholesaler_id": str(r.entity_id) if r.entity_id else None,
            "wholesaler_title": (
                r.entity.title if r.entity else "Unknown"
            ),
            "batch": r.batch or "",
            "expiry_date": expiry.isoformat() if expiry else None,
            "days_to_expiry": days_to_expiry,
            "available_units": int(r.current_unit_quantity or 0),
            "pack_size": max(1, int(r.units_per_pack or 1)),
            "unit_price": str(base_price.quantize(Decimal("0.01"))),
            "effective_unit_price": str(
                effective_price.quantize(Decimal("0.01"))
            ),
            "price_discount": price_discount_payload,
            "quantity_discount": quantity_discount_payload,
            "has_discount": bool(
                price_discount_payload or quantity_discount_payload
            ),
            "recommended_retail_price": (
                str(r.recommended_retail_price.quantize(Decimal("0.01")))
                if getattr(r, "recommended_retail_price", None)
                else None
            ),
        }
        by_product.setdefault(str(r.product_id), []).append(offer)

    return by_product


def _rank_offers(offers, suggested_quantity, current_unit_cost):
    """
    Sort offers per product and attach savings figures.

    Priority:
        1. Has an active price discount
        2. Larger price discount percentage
        3. Has an active quantity (bonus) discount
        4. Lower effective price
    """
    if not offers:
        return []

    current_cost = Decimal(str(current_unit_cost or 0))
    qty_needed = int(suggested_quantity or 0)

    def price_percent(o):
        pd = o.get("price_discount")
        if not pd:
            return 0.0
        try:
            return float(pd["percent"])
        except (TypeError, ValueError):
            return 0.0

    def sort_key(o):
        return (
            0 if o["price_discount"] else 1,
            -price_percent(o),
            0 if o["quantity_discount"] else 1,
            Decimal(o["effective_unit_price"]),
        )

    ranked = sorted(offers, key=sort_key)

    out = []
    for o in ranked:
        effective = Decimal(o["effective_unit_price"])
        savings_per_unit = (
            current_cost - effective if current_cost > 0 else Decimal("0")
        )
        savings_total = savings_per_unit * qty_needed
        o["savings_per_unit"] = str(
            savings_per_unit.quantize(Decimal("0.01"))
        )
        o["savings_on_suggested"] = str(
            savings_total.quantize(Decimal("0.01"))
        )
        o["covers_suggested"] = (
            qty_needed > 0
            and int(o["available_units"] or 0) >= qty_needed
        )
        out.append(o)

    return out


def _enrich_with_offers(rows, offers_by_product, offers_per_product):
    """Attach ranked wholesale offers + best_offer + savings to each row."""
    for r in rows:
        pid = r["product_id"]
        raw = offers_by_product.get(pid, [])

        ranked = _rank_offers(
            raw,
            suggested_quantity=r["suggested_quantity"],
            current_unit_cost=r["unit_cost"],
        )

        r["wholesale_offers"] = ranked[:offers_per_product]
        r["wholesale_offer_count"] = len(ranked)

        if ranked:
            best = ranked[0]
            r["best_offer"] = {
                "receipt_id": best["receipt_id"],
                "wholesaler_id": best["wholesaler_id"],
                "wholesaler_title": best["wholesaler_title"],
                "effective_unit_price": best["effective_unit_price"],
                "has_discount": best["has_discount"],
                "covers_suggested": best["covers_suggested"],
                "savings_per_unit": best["savings_per_unit"],
                "savings_on_suggested": best["savings_on_suggested"],
            }
            r["best_offer_savings_on_suggested"] = best[
                "savings_on_suggested"
            ]
        else:
            r["best_offer"] = None
            r["best_offer_savings_on_suggested"] = "0.00"

    return rows


# =====================================================================
# Row builder
# =====================================================================

def _round_up_to_pack(qty, pack):
    if pack <= 1:
        return int(qty)
    packs = (Decimal(qty) / Decimal(pack)).to_integral_value(
        rounding=ROUND_CEILING,
    )
    return int(packs * pack)


def _urgency_of(current, danger, days_of_cover, lead_time):
    if current <= 0:
        return "OUT"
    if danger > 0 and current <= danger:
        return "CRITICAL"
    if days_of_cover is not None:
        if lead_time > 0 and days_of_cover <= lead_time:
            return "CRITICAL"
        if days_of_cover <= 7:
            return "CRITICAL"
        if days_of_cover <= 21:
            return "WARNING"
    return "SOON"


def _build_rows(entity, data, lookback_days, cover_days,
                include_zero_velocity, only_danger):

    stock = _stock_map(entity)
    variations = _variation_map(entity)
    velocity = _sales_velocity_map(entity, lookback_days)
    last_sale_all = _last_sale_map_all_time(entity)

    today = timezone.now().date()
    rows = []

    for pid_str, s in stock.items():
        current = s["units"]
        if current < 0:
            continue

        variation = variations.get(pid_str)
        reorder_level = (
            int(variation.reorder_level or 0) if variation else 0
        )
        danger_stock = (
            int(variation.danger_stock or 0) if variation else 0
        )
        maximum_stock = (
            int(variation.maximum_stock or 0) if variation else 0
        )
        lead_time = (
            int(variation.lead_time or 0) if variation else 0
        )

        v = velocity.get(pid_str, {"units": 0.0, "last_sale": None})
        avg_daily = v["units"] / float(lookback_days) if lookback_days else 0

        if avg_daily <= 0 and not include_zero_velocity:
            continue

        if maximum_stock > 0:
            target = maximum_stock
        elif avg_daily > 0:
            target = int(avg_daily * cover_days) + 1
        elif reorder_level > 0:
            target = reorder_level * 2
        else:
            continue

        trigger = reorder_level if reorder_level > 0 else target
        if current > trigger and current >= target:
            continue

        shortfall = max(target - current, 0)
        if shortfall <= 0:
            continue

        suggested_qty = _round_up_to_pack(shortfall, s["pack"])

        days_of_cover = (
            (current / avg_daily) if avg_daily > 0 else None
        )

        last_sale = v["last_sale"] or last_sale_all.get(pid_str)
        days_since_sale = (
            (today - last_sale.date()).days
            if last_sale is not None else None
        )

        if only_danger:
            if danger_stock <= 0:
                continue
            if current > danger_stock:
                continue

        rows.append({
            "product_id": pid_str,
            "current_stock": current,
            "pack": s["pack"],
            "receipt_count": s["receipt_count"],
            "reorder_level": reorder_level,
            "danger_stock": danger_stock,
            "maximum_stock": maximum_stock,
            "lead_time_days": lead_time,
            "target_stock": target,
            "shortfall": shortfall,
            "suggested_quantity": suggested_qty,
            "avg_daily_sales": round(avg_daily, 2),
            "days_of_cover": (
                round(days_of_cover, 1)
                if days_of_cover is not None else None
            ),
            "sales_lookback": round(v["units"], 2),
            "last_sale": last_sale.date().isoformat()
                if last_sale else None,
            "days_since_sale": days_since_sale,
            "urgency": _urgency_of(
                current, danger_stock, days_of_cover, lead_time,
            ),
            "is_out_of_stock": current <= 0,
            "is_danger": danger_stock > 0 and current <= danger_stock,
        })

    return rows


# =====================================================================
# Enrichment
# =====================================================================

def _enrich(entity, rows):
    """Attach product meta, cost, wholesaler."""
    if not rows:
        return []

    product_ids = [r["product_id"] for r in rows]

    from products.models import Products

    products = (
        Products.objects
        .filter(id__in=product_ids)
        .select_related("category", "sub_category")
    )
    pmap = {str(p.id): p for p in products}

    last_purchase = _last_purchase_map(entity, product_ids)

    out = []
    for r in rows:
        pid = r["product_id"]
        p = pmap.get(pid)
        if p is None:
            continue

        lp = last_purchase.get(pid, {})
        unit_cost = lp.get("price") or Decimal("0.00")
        line_cost = unit_cost * r["suggested_quantity"]

        out.append({
            **r,
            "product_title": p.title or "—",
            "category_id": str(p.category_id) if p.category_id else None,
            "category": p.category.title if p.category else "UNCATEGORISED",
            "sub_category_id": (
                str(p.sub_category_id) if p.sub_category_id else None
            ),
            "sub_category": p.sub_category.title if p.sub_category else "",
            "unit_cost": str(unit_cost.quantize(Decimal("0.01"))),
            "line_cost": str(line_cost.quantize(Decimal("0.01"))),
            "last_wholesaler_id": lp.get("wholesaler_id"),
            "last_wholesaler_title": lp.get("wholesaler_title") or "",
        })

    return out


def _apply_filters(rows, data):
    category = data.get("category")
    if category:
        rows = [r for r in rows if r["category_id"] == category]

    wholesaler = data.get("wholesaler")
    if wholesaler:
        rows = [
            r for r in rows
            if r["last_wholesaler_id"] == wholesaler
        ]

    search = (data.get("search") or "").strip().lower()
    if search:
        rows = [
            r for r in rows
            if search in r["product_title"].lower()
            or search in r["category"].lower()
        ]

    return rows


def _sort_rows(rows):
    def key(r):
        rank = URGENCY_META[r["urgency"]]["rank"]
        cover = r["days_of_cover"]
        cover_sort = cover if cover is not None else 9999
        return (rank, cover_sort, r["product_title"])
    return sorted(rows, key=key)


# =====================================================================
# Rollups
# =====================================================================

def _kpi(rows):
    total_units = sum(r["suggested_quantity"] for r in rows)
    total_cost = sum(
        (Decimal(r["line_cost"]) for r in rows), Decimal("0.00")
    )
    total_savings = sum(
        (Decimal(r.get("best_offer_savings_on_suggested", "0"))
         for r in rows),
        Decimal("0.00"),
    )

    with_offers = sum(
        1 for r in rows if r.get("wholesale_offer_count", 0) > 0
    )
    with_discounted_offers = sum(
        1 for r in rows
        if any(
            o.get("has_discount")
            for o in r.get("wholesale_offers", [])
        )
    )
    with_cheaper_offer = sum(
        1 for r in rows
        if r.get("best_offer")
        and Decimal(r["best_offer"]["savings_per_unit"]) > 0
    )

    return {
        "reorder_count": len(rows),
        "out_of_stock_count": sum(
            1 for r in rows if r["is_out_of_stock"]
        ),
        "critical_count": sum(
            1 for r in rows if r["urgency"] == "CRITICAL"
        ),
        "warning_count": sum(
            1 for r in rows if r["urgency"] == "WARNING"
        ),
        "soon_count": sum(
            1 for r in rows if r["urgency"] == "SOON"
        ),
        "estimated_total_units": total_units,
        "estimated_total_cost": str(
            total_cost.quantize(Decimal("0.01"))
        ),
        "zero_velocity_count": sum(
            1 for r in rows if r["avg_daily_sales"] <= 0
        ),
        "products_with_offers": with_offers,
        "products_with_discounted_offers": with_discounted_offers,
        "products_with_cheaper_offer": with_cheaper_offer,
        "estimated_savings_on_orders": str(
            total_savings.quantize(Decimal("0.01"))
        ),
    }


def _urgency_rollup(rows):
    bucket = {k: {"count": 0, "cost": Decimal("0.00")}
              for k in URGENCY_META}
    for r in rows:
        b = bucket[r["urgency"]]
        b["count"] += 1
        b["cost"] += Decimal(r["line_cost"])

    out = []
    for key in ("OUT", "CRITICAL", "WARNING", "SOON"):
        meta = URGENCY_META[key]
        b = bucket[key]
        out.append({
            "key": key,
            "label": meta["label"],
            "count": b["count"],
            "estimated_cost": str(
                b["cost"].quantize(Decimal("0.01"))
            ),
        })
    return out


def _category_rollup(rows):
    bucket = {}
    for r in rows:
        key = r["category_id"] or "UNCATEGORISED"
        entry = bucket.setdefault(key, {
            "category_id": r["category_id"],
            "category": r["category"],
            "count": 0,
            "total_units": 0,
            "total_cost": Decimal("0.00"),
        })
        entry["count"] += 1
        entry["total_units"] += r["suggested_quantity"]
        entry["total_cost"] += Decimal(r["line_cost"])

    out = [
        {
            "category_id": e["category_id"],
            "category": e["category"],
            "count": e["count"],
            "total_units": e["total_units"],
            "total_cost": str(
                e["total_cost"].quantize(Decimal("0.01"))
            ),
        }
        for e in bucket.values()
    ]
    out.sort(key=lambda x: Decimal(x["total_cost"]), reverse=True)
    return out


def _wholesaler_groups(rows):
    """
    Group by the best offer's wholesaler when available; fall back to
    last-known wholesaler otherwise. Makes the whole section
    purchase-order-ready.
    """
    groups = {}
    for r in rows:
        best = r.get("best_offer")
        if best:
            wh_id = best.get("wholesaler_id")
            wh_title = best.get("wholesaler_title")
        else:
            wh_id = r["last_wholesaler_id"]
            wh_title = r["last_wholesaler_title"]

        key = wh_id or "__unassigned__"
        g = groups.setdefault(key, {
            "wholesaler_id": wh_id,
            "wholesaler_title": wh_title or "Unassigned",
            "line_count": 0,
            "total_units": 0,
            "total_cost": Decimal("0.00"),
            "total_savings": Decimal("0.00"),
            "products": [],
        })
        g["line_count"] += 1
        g["total_units"] += r["suggested_quantity"]
        g["total_cost"] += Decimal(r["line_cost"])
        g["total_savings"] += Decimal(
            r.get("best_offer_savings_on_suggested", "0")
        )
        g["products"].append({
            "product_id": r["product_id"],
            "product_title": r["product_title"],
            "current_stock": r["current_stock"],
            "suggested_quantity": r["suggested_quantity"],
            "unit_cost": r["unit_cost"],
            "line_cost": r["line_cost"],
            "urgency": r["urgency"],
            "has_best_offer": bool(best),
            "best_offer_wholesaler": (
                best.get("wholesaler_title") if best else None
            ),
            "best_offer_price": (
                best.get("effective_unit_price") if best else None
            ),
            "best_offer_has_discount": (
                best.get("has_discount") if best else False
            ),
            "savings_on_line": r.get(
                "best_offer_savings_on_suggested", "0.00"
            ),
        })

    out = []
    for g in groups.values():
        g["products"].sort(
            key=lambda p: (
                URGENCY_META[p["urgency"]]["rank"],
                p["product_title"],
            )
        )
        g["total_cost"] = str(g["total_cost"].quantize(Decimal("0.01")))
        g["total_savings"] = str(
            g["total_savings"].quantize(Decimal("0.01"))
        )
        out.append(g)

    out.sort(
        key=lambda g: (
            g["wholesaler_id"] is None,
            -Decimal(g["total_cost"]),
        )
    )
    return out


# =====================================================================
# Entry point
# =====================================================================

def get_low_stock_report(data, user):
    """
    Build a low-stock / reorder report.

    Payload:
    {
        "action": "GetLowStockReport",
        "lookback_days": 30,             # optional, default 30, max 180
        "cover_days": 30,                # optional, default 30, max 180
        "category": "<uuid>",            # optional
        "wholesaler": "<uuid>",          # optional
        "search": "<string>",            # optional
        "only_danger": false,            # optional
        "include_zero_velocity": false,  # optional
        "include_offers": true,          # optional, default true
        "offers_per_product": 5,         # optional, default 5, max 20
        "entity_id": "<uuid>"            # staff only
    }
    """
    lookback_days = _clamped_int(
        data, "lookback_days", DEFAULT_LOOKBACK_DAYS, MAX_WINDOW_DAYS,
    )
    cover_days = _clamped_int(
        data, "cover_days", DEFAULT_COVER_DAYS, MAX_WINDOW_DAYS,
    )
    offers_per_product = _clamped_int(
        data, "offers_per_product",
        DEFAULT_OFFERS_PER_PRODUCT, MAX_OFFERS_PER_PRODUCT,
    )
    include_zero_velocity = bool(data.get("include_zero_velocity", False))
    only_danger = bool(data.get("only_danger", False))
    include_offers = bool(data.get("include_offers", True))

    # ---- Scope ----
    if user.is_staff:
        entity_id = data.get("entity_id") or getattr(
            user, "entity_id", None,
        )
        if not entity_id:
            return {
                "entity_id": "This field is required for staff.",
            }, None
        entity = Entities.objects.filter(pk=entity_id).first()
        if entity is None:
            return {"entity_id": "Entity not found."}, None
    else:
        entity = getattr(user, "entity", None)
        if entity is None:
            return {"detail": "Caller has no entity."}, None

    # ---- Build rows ----
    raw = _build_rows(
        entity, data, lookback_days, cover_days,
        include_zero_velocity, only_danger,
    )
    enriched = _enrich(entity, raw)
    filtered = _apply_filters(enriched, data)

    # ---- Attach wholesale offers ----
    if include_offers and filtered:
        product_ids = [r["product_id"] for r in filtered]
        today = timezone.now().date()
        offers_by_product = _load_wholesale_offers(product_ids, today)
        filtered = _enrich_with_offers(
            filtered, offers_by_product, offers_per_product,
        )
    else:
        for r in filtered:
            r["wholesale_offers"] = []
            r["wholesale_offer_count"] = 0
            r["best_offer"] = None
            r["best_offer_savings_on_suggested"] = "0.00"

    sorted_rows = _sort_rows(filtered)

    report = {
        "period": {
            "as_of": timezone.now().date().isoformat(),
            "lookback_days": lookback_days,
            "cover_days": cover_days,
        },
        "filters": {
            "category": data.get("category"),
            "wholesaler": data.get("wholesaler"),
            "search": data.get("search"),
            "only_danger": only_danger,
            "include_zero_velocity": include_zero_velocity,
            "include_offers": include_offers,
        },
        "entity": {
            "id": str(entity.id),
            "title": entity.title,
        },
        "kpi": _kpi(sorted_rows),
        "urgency_rollup": _urgency_rollup(sorted_rows),
        "category_rollup": _category_rollup(sorted_rows),
        "wholesaler_groups": _wholesaler_groups(sorted_rows),
        "products": sorted_rows,
    }

    return {}, report