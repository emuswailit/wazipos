# retailers/utils/product_movement_report_utils.py
#
# Product movement ledger — every IN and OUT event for one product.
#
# Sources (three queries, no double-counting):
#   RetailerReceipts        → RECEIPT (IN)
#   CustomerOrderItems      → SALE    (OUT)
#   StockAdjustments        → ADJUSTMENT / WRITE_OFF / WHOLESALER_RETURN /
#                             CUSTOMER_RETURN / INTERNAL_CORRECTION
#                             (direction determines IN vs OUT)
#
# SalesReturns and WholesalerReceiptReturns are deliberately NOT queried
# directly: each of them writes a paired StockAdjustments row with the
# matching return_intent, and the adjustment is the movement. Querying
# the source tables would double-count.
#
# Opening balance is computed with four small aggregates filtered on
# `created < from`. This avoids walking the entire history when the
# range of interest is a narrow window.
#
# Returns (errors, report_dict).

from datetime import date as date_cls, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone as tz

from authentication.models import Entities
from retailers.models import (
    CustomerOrderItems,
    RetailerReceipts,
    StockAdjustments,
)


# =====================================================================
# Constants
# =====================================================================

DEFAULT_WINDOW_DAYS = 30
MAX_WINDOW_DAYS = 730

EXCLUDED_ORDER_STATUSES = ("CANCELLED",)

ADJUSTMENT_LABELS = {
    "NONE": "ADJUSTMENT",
    "INTERNAL_CORRECTION": "CORRECTION",
    "EXPIRY_WRITE_OFF": "EXPIRY_WRITE_OFF",
    "DAMAGE_WRITE_OFF": "DAMAGE_WRITE_OFF",
    "WHOLESALER_RETURN": "WHOLESALER_RETURN",
    "CUSTOMER_RETURN": "CUSTOMER_RETURN",
}

VALID_MOVEMENT_TYPES = {
    "RECEIPT",
    "SALE",
    "ADJUSTMENT",
    "CORRECTION",
    "EXPIRY_WRITE_OFF",
    "DAMAGE_WRITE_OFF",
    "WHOLESALER_RETURN",
    "CUSTOMER_RETURN",
}


# =====================================================================
# Period resolution
# =====================================================================

def _resolve_period(data):
    """
    Returns (start_date, end_date). Both date objects, inclusive.

    Modes:
      from + to  → explicit range
      from only  → from that day through today
      neither    → last DEFAULT_WINDOW_DAYS through today
    """
    raw_from = data.get("from")
    raw_to = data.get("to")

    def parse(s):
        try:
            return date_cls.fromisoformat(str(s))
        except (TypeError, ValueError):
            raise ValueError(f"Invalid date: {s!r}. Use YYYY-MM-DD.")

    today = tz.now().date()

    if raw_from and raw_to:
        start = parse(raw_from)
        end = parse(raw_to)
        if end < start:
            raise ValueError("'to' must be on or after 'from'.")
        if (end - start).days > MAX_WINDOW_DAYS:
            raise ValueError(
                f"Range cannot exceed {MAX_WINDOW_DAYS} days."
            )
        return start, end

    if raw_from:
        start = parse(raw_from)
        if start > today:
            raise ValueError("'from' cannot be in the future.")
        if (today - start).days > MAX_WINDOW_DAYS:
            raise ValueError(
                f"Range cannot exceed {MAX_WINDOW_DAYS} days."
            )
        return start, today

    if raw_to:
        raise ValueError("'from' is required when 'to' is supplied.")

    return today - timedelta(days=DEFAULT_WINDOW_DAYS), today


def _day_bounds(d: date_cls):
    """
    Return (start, end) as timezone-aware datetimes for a full day.

    `created` on the source models is a DateTimeField; passing plain
    dates triggers naive-datetime warnings and can shift the window
    by the local UTC offset.
    """
    start = tz.make_aware(
        datetime.combine(d, time.min),
        tz.get_current_timezone(),
    )
    return start, start + timedelta(days=1)


# =====================================================================
# Opening balance
# =====================================================================

def _opening_balance(receipt_ids, product_id, entity, from_dt):
    """
    Sum of every movement before `from_dt`, so the running balance
    starts at the correct value.

    Four small aggregates, none of which scale with history length.
    """
    receipts_before = (
        RetailerReceipts.objects
        .filter(
            product_id=product_id,
            entity=entity,
            created__lt=from_dt,
        )
        .aggregate(total=Sum("received_unit_quantity"))["total"]
        or 0
    )

    sales_before = (
        CustomerOrderItems.objects
        .filter(
            retailer_receipt_id__in=receipt_ids,
            created__lt=from_dt,
        )
        .exclude(customer_order__status__in=EXCLUDED_ORDER_STATUSES)
        .aggregate(total=Sum("total_quantity"))["total"]
        or 0
    )

    adj_out_before = (
        StockAdjustments.objects
        .filter(
            retailer_receipt_id__in=receipt_ids,
            created__lt=from_dt,
            direction="DECREMENT",
        )
        .aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    adj_in_before = (
        StockAdjustments.objects
        .filter(
            retailer_receipt_id__in=receipt_ids,
            created__lt=from_dt,
            direction="INCREMENT",
        )
        .aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    return (
        int(receipts_before)
        - int(sales_before)
        - int(adj_out_before)
        + int(adj_in_before)
    )


# =====================================================================
# Movements collection
# =====================================================================

def _receipt_movements(receipts, start_dt, end_dt):
    """One IN movement per RetailerReceipt created in the window."""
    out = []
    for r in receipts:
        if not (start_dt <= r.created <= end_dt):
            continue
        qty = int(r.received_unit_quantity or 0)
        if qty == 0:
            continue
        out.append({
            "datetime": r.created,
            "date": r.created.date().isoformat(),
            "type": "RECEIPT",
            "direction": "IN",
            "quantity": qty,
            "reference": (
                r.supplier_invoice
                or (r.batch and f"Batch {r.batch}")
                or "Stock receipt"
            ),
            "batch": r.batch or "",
            "expiry_date": (
                r.expiry_date.isoformat() if r.expiry_date else None
            ),
            "note": "",
            "user_id": str(r.owner_id) if r.owner_id else None,
            "source_id": str(r.id),
            "source_type": "RetailerReceipt",
            "receipt_id": str(r.id),
        })
    return out


def _sale_movements(sales, start_dt, end_dt):
    """One OUT movement per CustomerOrderItem in the window."""
    out = []
    for item in sales:
        if not (start_dt <= item.created <= end_dt):
            continue
        qty = int(item.total_quantity or 0)
        if qty == 0:
            continue

        order = item.customer_order
        ref = (
            f"Order {order.reference_number}"
            if order and order.reference_number
            else f"Order {str(order.id)[:8]}"
            if order else "Sale"
        )

        out.append({
            "datetime": item.created,
            "date": item.created.date().isoformat(),
            "type": "SALE",
            "direction": "OUT",
            "quantity": qty,
            "reference": ref,
            "batch": getattr(item.retailer_receipt, "batch", "") or "",
            "expiry_date": None,
            "note": "",
            "user_id": str(item.owner_id) if item.owner_id else None,
            "source_id": str(item.id),
            "source_type": "CustomerOrderItem",
            "receipt_id": str(item.retailer_receipt_id),
            "order_id": str(order.id) if order else None,
        })
    return out


def _adjustment_movements(adjustments, start_dt, end_dt):
    """One movement per StockAdjustment in the window."""
    out = []
    for a in adjustments:
        if not (start_dt <= a.created <= end_dt):
            continue
        qty = int(a.quantity or 0)
        if qty == 0:
            continue

        intent = a.return_intent or "NONE"
        label = ADJUSTMENT_LABELS.get(intent, "ADJUSTMENT")
        direction = "IN" if a.direction == "INCREMENT" else "OUT"

        out.append({
            "datetime": a.created,
            "date": a.created.date().isoformat(),
            "type": label,
            "direction": direction,
            "quantity": qty,
            "reference": (
                a.justification or label.replace("_", " ").title()
            ),
            "batch": getattr(a.retailer_receipt, "batch", "") or "",
            "expiry_date": None,
            "note": a.justification or "",
            "user_id": str(a.owner_id) if a.owner_id else None,
            "source_id": str(a.id),
            "source_type": "StockAdjustment",
            "receipt_id": str(a.retailer_receipt_id),
            "return_intent": intent,
        })
    return out


# =====================================================================
# Running balance
# =====================================================================

def _attach_running_balance(movements, opening):
    """Walk sorted movements and compute the running balance."""
    balance = opening
    for m in movements:
        if m["direction"] == "IN":
            balance += m["quantity"]
        else:
            balance -= m["quantity"]
        m["balance_after"] = balance
    return balance


def _daily_summary(movements, opening):
    """Collapse movements into one row per date."""
    if not movements:
        return []

    by_date: dict = {}
    for m in movements:
        d = m["date"]
        entry = by_date.setdefault(d, {"in": 0, "out": 0})
        if m["direction"] == "IN":
            entry["in"] += m["quantity"]
        else:
            entry["out"] += m["quantity"]

    out = []
    balance = opening
    for d in sorted(by_date.keys()):
        entry = by_date[d]
        balance += entry["in"] - entry["out"]
        out.append({
            "date": d,
            "in": entry["in"],
            "out": entry["out"],
            "net": entry["in"] - entry["out"],
            "balance": balance,
        })
    return out


# =====================================================================
# Enrichment
# =====================================================================

def _receipt_breakdown(receipts):
    """Per-batch summary."""
    out = []
    for r in receipts:
        received = int(r.received_unit_quantity or 0)
        current = int(r.current_unit_quantity or 0)
        sold = received - current
        if received == 0 and current == 0:
            continue
        out.append({
            "receipt_id": str(r.id),
            "batch": r.batch or "",
            "expiry_date": (
                r.expiry_date.isoformat() if r.expiry_date else None
            ),
            "received": received,
            "sold": max(0, sold),
            "current": current,
            "is_active": r.is_active == "true",
        })
    out.sort(key=lambda x: x["expiry_date"] or "9999-12-31")
    return out


# =====================================================================
# Entry point
# =====================================================================

def get_product_movement_report(data, user):
    """
    Build a product movement ledger.

    Payload:
    {
        "action": "GetProductMovementReport",
        "product": "<uuid>",             # required
        "from": "YYYY-MM-DD",            # optional
        "to": "YYYY-MM-DD",              # optional
        "retailer_receipt": "<uuid>",    # optional — narrow to one lot
        "movement_types": ["SALE", ...], # optional — filter
        "entity_id": "<uuid>"            # staff only
    }

    Returns an empty report (not an error) when the product has no
    receipts for the entity. The frontend picker sources from the
    global catalog, so tapping a product this entity has never
    stocked is a normal action and should render a clean
    "no movements" state.
    """
    product_id = data.get("product")
    if not product_id:
        return {"product": "This field is required."}, None

    try:
        start, end = _resolve_period(data)
    except ValueError as e:
        return {"period": str(e)}, None

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

    # ---- Movement type filter ----
    raw_types = data.get("movement_types")
    type_filter = None
    if raw_types:
        if not isinstance(raw_types, (list, tuple)):
            return {"movement_types": "Must be a list."}, None
        type_filter = {str(t).upper() for t in raw_types}
        invalid = type_filter - VALID_MOVEMENT_TYPES
        if invalid:
            return {
                "movement_types": (
                    f"Unknown type(s): {', '.join(sorted(invalid))}."
                ),
            }, None

    # ---- Load the product ----
    from products.models import Products

    product = Products.objects.filter(pk=product_id).first()
    if product is None:
        return {"product": "Product not found."}, None

    product_title = (
        product.product_name()
        if hasattr(product, "product_name")
        else product.title
    )

    # ---- Load receipts for this product + entity ----
    receipt_qs = RetailerReceipts.objects.filter(
        entity=entity,
        product_id=product_id,
    ).select_related("owner")

    receipt_filter = data.get("retailer_receipt")
    if receipt_filter:
        receipt_qs = receipt_qs.filter(pk=receipt_filter)

    receipts = list(receipt_qs)

    # ---- Empty report if no receipts ----
    # The picker is catalog-driven; this is a normal outcome.
    if not receipts:
        return {}, {
            "period": {
                "from": start.isoformat(),
                "to": end.isoformat(),
                "days": (end - start).days + 1,
            },
            "entity": {"id": str(entity.id), "title": entity.title},
            "product": {
                "id": str(product.id),
                "title": product_title,
                "category": (
                    product.category.title if product.category else None
                ),
                "current_stock": 0,
                "receipt_count": 0,
            },
            "filters": {
                "retailer_receipt": receipt_filter,
                "movement_types": (
                    sorted(type_filter) if type_filter else None
                ),
            },
            "kpi": {
                "opening_balance": 0,
                "closing_balance": 0,
                "total_in": 0,
                "total_out": 0,
                "net_change": 0,
                "movement_count": 0,
                "receipts_count": 0,
                "sales_count": 0,
                "adjustments_count": 0,
            },
            "movements": [],
            "daily_summary": [],
            "receipt_breakdown": [],
        }

    receipt_ids = [r.id for r in receipts]

    # ---- Opening balance ----
    from_start, _ = _day_bounds(start)
    opening = _opening_balance(
        receipt_ids=receipt_ids,
        product_id=product_id,
        entity=entity,
        from_dt=from_start,
    )

    # ---- Movements in window ----
    _, to_end = _day_bounds(end)

    receipt_movements = _receipt_movements(
        receipts, from_start, to_end,
    )

    sales_qs = (
        CustomerOrderItems.objects
        .filter(
            retailer_receipt_id__in=receipt_ids,
            created__gte=from_start,
            created__lt=to_end,
        )
        .exclude(customer_order__status__in=EXCLUDED_ORDER_STATUSES)
        .select_related("customer_order", "retailer_receipt")
    )
    sale_movements = _sale_movements(
        list(sales_qs), from_start, to_end,
    )

    adj_qs = (
        StockAdjustments.objects
        .filter(
            retailer_receipt_id__in=receipt_ids,
            created__gte=from_start,
            created__lt=to_end,
        )
        .select_related("retailer_receipt")
    )
    adj_movements = _adjustment_movements(
        list(adj_qs), from_start, to_end,
    )

    # ---- Merge + filter + sort ----
    all_movements = receipt_movements + sale_movements + adj_movements

    if type_filter:
        all_movements = [
            m for m in all_movements if m["type"] in type_filter
        ]

    type_order = {"RECEIPT": 0}
    all_movements.sort(
        key=lambda m: (m["datetime"], type_order.get(m["type"], 1)),
    )

    # ---- Running balance ----
    closing = _attach_running_balance(all_movements, opening)

    # ---- Rollups ----
    total_in = sum(
        m["quantity"] for m in all_movements if m["direction"] == "IN"
    )
    total_out = sum(
        m["quantity"] for m in all_movements if m["direction"] == "OUT"
    )

    counts = {
        "receipts": sum(
            1 for m in all_movements if m["type"] == "RECEIPT"
        ),
        "sales": sum(
            1 for m in all_movements if m["type"] == "SALE"
        ),
        "adjustments": sum(
            1 for m in all_movements
            if m["source_type"] == "StockAdjustment"
        ),
    }

    live_current = sum(
        int(r.current_unit_quantity or 0) for r in receipts
    )

    report = {
        "period": {
            "from": start.isoformat(),
            "to": end.isoformat(),
            "days": (end - start).days + 1,
        },
        "entity": {"id": str(entity.id), "title": entity.title},
        "product": {
            "id": str(product.id),
            "title": product_title,
            "category": (
                product.category.title if product.category else None
            ),
            "current_stock": live_current,
            "receipt_count": len(receipts),
        },
        "filters": {
            "retailer_receipt": receipt_filter,
            "movement_types": (
                sorted(type_filter) if type_filter else None
            ),
        },
        "kpi": {
            "opening_balance": opening,
            "closing_balance": closing,
            "total_in": total_in,
            "total_out": total_out,
            "net_change": total_in - total_out,
            "movement_count": len(all_movements),
            "receipts_count": counts["receipts"],
            "sales_count": counts["sales"],
            "adjustments_count": counts["adjustments"],
        },
        "movements": [
            {
                **m,
                "datetime": m["datetime"].isoformat(),
                "signed_quantity": (
                    m["quantity"] if m["direction"] == "IN"
                    else -m["quantity"]
                ),
            }
            for m in all_movements
        ],
        "daily_summary": _daily_summary(all_movements, opening),
        "receipt_breakdown": _receipt_breakdown(receipts),
    }

    return {}, report