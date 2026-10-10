# retailers/utils/stock_report_utils.py
#
# Stock valuation & position report for a retailer entity.
#
# One row per product (SKU), aggregating across all active receipts.
# Includes cost value, retail value, potential margin, batch count,
# nearest expiry, and last-sale date (for dead-stock detection).
#
# Returns (errors, report_dict).

from datetime import date as date_cls
from decimal import Decimal

from django.db.models import (
    Count,
    DecimalField,
    F,
    Max,
    Min,
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
)


# =====================================================================
# Constants
# =====================================================================

ZERO = Value(
    Decimal("0.00"),
    output_field=DecimalField(max_digits=18, decimal_places=2),
)

DEFAULT_DEAD_DAYS = 30
MAX_DEAD_DAYS = 365

VALID_SALE_STATUSES = (
    "COMPLETED", "DELIVERED", "RECEIVED", "PICKED", "DISPATCHED",
)


# =====================================================================
# Params
# =====================================================================

def _resolve_dead_days(data):
    raw = data.get("dead_days")
    if raw is None:
        return DEFAULT_DEAD_DAYS
    try:
        v = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_DEAD_DAYS
    if v <= 0:
        return DEFAULT_DEAD_DAYS
    return min(v, MAX_DEAD_DAYS)


# =====================================================================
# Aggregation
# =====================================================================

def _product_rows(entity):
    """
    One row per product, aggregating across all active receipts.
    """
    base = RetailerReceipts.objects.filter(
        entity=entity,
        is_active="true",
    )

    agg = (
        base.values(
            "product__id",
            "product__title",
            "product__category__id",
            "product__category__title",
            "product__sub_category__id",
            "product__sub_category__title",
        )
        .annotate(
            units=Coalesce(Sum("current_unit_quantity"), Value(0)),
            cost_value=Coalesce(
                Sum(
                    F("current_unit_quantity")
                    * (
                        Coalesce(F("unit_buying_price"), ZERO)
                        + Coalesce(
                            F("allocated_shipping_per_unit"),
                            ZERO,
                        )
                    ),
                    output_field=DecimalField(
                        max_digits=18, decimal_places=2,
                    ),
                ),
                ZERO,
            ),
            retail_value=Coalesce(
                Sum(
                    F("current_unit_quantity")
                    * F("final_unit_selling_price"),
                    output_field=DecimalField(
                        max_digits=18, decimal_places=2,
                    ),
                ),
                ZERO,
            ),
            receipt_count=Count("id"),
            nearest_expiry=Min("expiry_date"),
        )
    )

    return list(agg)


def _last_sale_map(entity):
    """
    { product_id: last_sale_date } for products with at least one
    delivered sale, all-time. Keyed by string product id.
    """
    rows = (
        CustomerOrderItems.objects
        .filter(
            customer_order__entity=entity,
            customer_order__status__in=VALID_SALE_STATUSES,
            retailer_receipt__product_id__isnull=False,
        )
        .values("retailer_receipt__product__id")
        .annotate(last_sale=Max("customer_order__created"))
    )
    return {
        str(r["retailer_receipt__product__id"]): r["last_sale"]
        for r in rows
    }


# =====================================================================
# Row shaping
# =====================================================================

def _shaped_rows(entity, dead_days):
    today = timezone.now().date()
    last_sale_map = _last_sale_map(entity)
    raw = _product_rows(entity)

    out = []
    for r in raw:
        pid = r["product__id"]
        if not pid:
            continue
        pid_str = str(pid)

        units = int(r["units"] or 0)
        if units <= 0:
            continue  # skip zero-balance products

        cost = r["cost_value"] or Decimal("0.00")
        retail = r["retail_value"] or Decimal("0.00")
        margin = retail - cost
        margin_pct = (
            (margin / retail * Decimal("100"))
            if retail > 0
            else Decimal("0.00")
        )

        nearest_expiry = r["nearest_expiry"]
        days_to_expiry = (
            (nearest_expiry - today).days
            if nearest_expiry is not None
            else None
        )

        last_sale = last_sale_map.get(pid_str)
        days_since_sale = (
            (today - last_sale.date()).days
            if last_sale is not None
            else None
        )
        is_dead = (
            days_since_sale is None
            or days_since_sale > dead_days
        )

        out.append({
            "product_id": pid_str,
            "product_title": r["product__title"] or "—",
            "category_id": (
                str(r["product__category__id"])
                if r["product__category__id"] else None
            ),
            "category": r["product__category__title"] or "UNCATEGORISED",
            "sub_category_id": (
                str(r["product__sub_category__id"])
                if r["product__sub_category__id"] else None
            ),
            "sub_category": r["product__sub_category__title"] or "",
            "units": units,
            "receipt_count": r["receipt_count"],
            "unit_cost": str(
                (cost / units).quantize(Decimal("0.01"))
            ) if units else "0.00",
            "cost_value": str(cost.quantize(Decimal("0.01"))),
            "retail_value": str(retail.quantize(Decimal("0.01"))),
            "margin": str(margin.quantize(Decimal("0.01"))),
            "margin_percent": str(margin_pct.quantize(Decimal("0.01"))),
            "nearest_expiry": (
                nearest_expiry.isoformat()
                if nearest_expiry else None
            ),
            "days_to_expiry": days_to_expiry,
            "last_sale": (
                last_sale.date().isoformat()
                if last_sale else None
            ),
            "days_since_sale": days_since_sale,
            "is_dead": is_dead,
        })

    out.sort(key=lambda x: Decimal(x["retail_value"]), reverse=True)
    return out


# =====================================================================
# Filters
# =====================================================================

def _apply_filters(rows, data):
    category = data.get("category")
    if category:
        rows = [r for r in rows if r["category_id"] == category]

    sub_category = data.get("sub_category")
    if sub_category:
        rows = [
            r for r in rows if r["sub_category_id"] == sub_category
        ]

    search = (data.get("search") or "").strip().lower()
    if search:
        rows = [
            r for r in rows
            if search in r["product_title"].lower()
            or search in r["category"].lower()
        ]

    if data.get("dead_only"):
        rows = [r for r in rows if r["is_dead"]]

    if data.get("expiring_within"):
        try:
            w = int(data["expiring_within"])
        except (TypeError, ValueError):
            w = None
        if w and w > 0:
            rows = [
                r for r in rows
                if r["days_to_expiry"] is not None
                and r["days_to_expiry"] <= w
            ]

    return rows


# =====================================================================
# Rollups
# =====================================================================

def _kpi(rows):
    total_units = sum(r["units"] for r in rows)
    cost = sum(
        (Decimal(r["cost_value"]) for r in rows), Decimal("0.00")
    )
    retail = sum(
        (Decimal(r["retail_value"]) for r in rows), Decimal("0.00")
    )
    margin = retail - cost

    margin_pct = (
        (margin / retail * Decimal("100"))
        if retail > 0
        else Decimal("0.00")
    )

    return {
        "sku_count": len(rows),
        "batch_count": sum(r["receipt_count"] for r in rows),
        "total_units": total_units,
        "cost_value": str(cost.quantize(Decimal("0.01"))),
        "retail_value": str(retail.quantize(Decimal("0.01"))),
        "potential_margin": str(margin.quantize(Decimal("0.01"))),
        "margin_percent": str(margin_pct.quantize(Decimal("0.01"))),
        "dead_sku_count": sum(1 for r in rows if r["is_dead"]),
        "expiring_within_30": sum(
            1 for r in rows
            if r["days_to_expiry"] is not None
            and 0 <= r["days_to_expiry"] <= 30
        ),
        "already_expired": sum(
            1 for r in rows
            if r["days_to_expiry"] is not None
            and r["days_to_expiry"] < 0
        ),
    }


def _category_rollup(rows):
    bucket = {}
    for r in rows:
        key = r["category_id"] or "UNCATEGORISED"
        entry = bucket.setdefault(key, {
            "category_id": r["category_id"],
            "category": r["category"],
            "sku_count": 0,
            "units": 0,
            "cost_value": Decimal("0.00"),
            "retail_value": Decimal("0.00"),
        })
        entry["sku_count"] += 1
        entry["units"] += r["units"]
        entry["cost_value"] += Decimal(r["cost_value"])
        entry["retail_value"] += Decimal(r["retail_value"])

    out = []
    for entry in bucket.values():
        cost = entry["cost_value"]
        retail = entry["retail_value"]
        margin = retail - cost
        margin_pct = (
            (margin / retail * Decimal("100"))
            if retail > 0
            else Decimal("0.00")
        )
        out.append({
            "category_id": entry["category_id"],
            "category": entry["category"],
            "sku_count": entry["sku_count"],
            "units": entry["units"],
            "cost_value": str(cost.quantize(Decimal("0.01"))),
            "retail_value": str(retail.quantize(Decimal("0.01"))),
            "margin": str(margin.quantize(Decimal("0.01"))),
            "margin_percent": str(
                margin_pct.quantize(Decimal("0.01"))
            ),
        })

    out.sort(key=lambda x: Decimal(x["retail_value"]), reverse=True)
    return out


# =====================================================================
# Entry point
# =====================================================================

def get_stock_report(data, user):
    """
    Build a stock valuation & position report.

    Payload:
    {
        "action": "GetStockReport",
        "dead_days": 30,             # optional, default 30, max 365
        "category": "<uuid>",        # optional
        "sub_category": "<uuid>",    # optional
        "search": "<string>",        # optional
        "dead_only": false,          # optional
        "expiring_within": 30,       # optional
        "entity_id": "<uuid>"        # staff only
    }
    """
    dead_days = _resolve_dead_days(data)

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

    # ---- Compute ----
    all_rows = _shaped_rows(entity, dead_days)
    filtered_rows = _apply_filters(all_rows, data)

    kpi = _kpi(filtered_rows)
    categories = _category_rollup(filtered_rows)

    report = {
        "period": {
            "as_of": timezone.now().date().isoformat(),
            "dead_days": dead_days,
        },
        "filters": {
            "category": data.get("category"),
            "sub_category": data.get("sub_category"),
            "search": data.get("search"),
            "dead_only": bool(data.get("dead_only")),
            "expiring_within": data.get("expiring_within"),
        },
        "entity": {
            "id": str(entity.id),
            "title": entity.title,
        },
        "kpi": kpi,
        "category_rollup": categories,
        "products": filtered_rows,
    }

    return {}, report