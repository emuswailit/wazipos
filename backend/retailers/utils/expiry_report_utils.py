# retailers/utils/expiry_report_utils.py
#
# Expiry & near-expiry report for a retailer entity.
#
# Lists every active receipt with a non-null expiry_date within the
# requested window, bucketed by days-until-expiry. Default window:
# 90 days. Already-expired batches are always included.
#
# Returns (errors, report_dict).

from datetime import date as date_cls, timedelta
from decimal import Decimal

from django.db.models import DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from authentication.models import Entities
from retailers.models import RetailerReceipts


# =====================================================================
# Constants
# =====================================================================

ZERO = Value(
    Decimal("0.00"),
    output_field=DecimalField(max_digits=18, decimal_places=2),
)

DEFAULT_WINDOW_DAYS = 90
MAX_WINDOW_DAYS = 365

# Bucket definitions: (key, label, min_days, max_days).
# min/max are inclusive; None means unbounded.
BUCKETS = [
    ("EXPIRED", "Already expired", None, -1),
    ("0_7",     "Expires in 0–7 days", 0, 7),
    ("8_30",    "Expires in 8–30 days", 8, 30),
    ("31_60",   "Expires in 31–60 days", 31, 60),
    ("61_90",   "Expires in 61–90 days", 61, 90),
    ("91_PLUS", "Expires in 91+ days", 91, None),
]

BUCKET_BY_KEY = {b[0]: b for b in BUCKETS}


# =====================================================================
# Helpers
# =====================================================================

def _resolve_window(data):
    """Return window in days — integer, clamped to MAX_WINDOW_DAYS."""
    raw = data.get("days")
    if raw is None:
        return DEFAULT_WINDOW_DAYS
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_WINDOW_DAYS
    if days <= 0:
        return DEFAULT_WINDOW_DAYS
    return min(days, MAX_WINDOW_DAYS)


def _bucket_of(days_until_expiry):
    """Return the bucket key for a given days-until-expiry value."""
    for key, _label, lo, hi in BUCKETS:
        if lo is not None and days_until_expiry < lo:
            continue
        if hi is not None and days_until_expiry > hi:
            continue
        # A row falls in exactly one bucket.
        if key == "EXPIRED":
            if days_until_expiry < 0:
                return key
            continue
        if key == "91_PLUS":
            if days_until_expiry >= 91:
                return key
            continue
        if lo <= days_until_expiry <= hi:
            return key
    return "91_PLUS"


# =====================================================================
# Query
# =====================================================================

def _base_qs(entity, window_days):
    today = timezone.now().date()
    cutoff = today + timedelta(days=window_days)
    return (
        RetailerReceipts.objects
        .filter(
            entity=entity,
            is_active="true",
            expiry_date__isnull=False,
            current_unit_quantity__gt=0,
            expiry_date__lte=cutoff,
        )
        .select_related("product", "received_from")
        .order_by("expiry_date", "product__title")
    )


def _apply_filters(qs, data):
    # Bucket filter requires post-processing — see _rows().
    product_id = data.get("product")
    if product_id:
        qs = qs.filter(product_id=product_id)

    wholesaler_id = data.get("wholesaler")
    if wholesaler_id:
        qs = qs.filter(received_from_id=wholesaler_id)

    search = (data.get("search") or "").strip()
    if search:
        qs = qs.filter(
            Q(product__title__icontains=search)
            | Q(batch__icontains=search)
            | Q(supplier_invoice__icontains=search)
        )

    return qs


def _rows(entity, data, window_days, bucket_filter):
    today = timezone.now().date()
    qs = _apply_filters(_base_qs(entity, window_days), data)

    rows = []
    for r in qs:
        days_until = (r.expiry_date - today).days
        bucket_key = _bucket_of(days_until)

        if bucket_filter and bucket_filter != bucket_key:
            continue

        unit_cost = (
            (r.unit_buying_price or Decimal("0.00"))
            + (r.allocated_shipping_per_unit or Decimal("0.00"))
        )
        qty = int(r.current_unit_quantity or 0)
        cost_value = unit_cost * qty
        retail_value = (r.final_unit_selling_price or Decimal("0.00")) * qty

        rows.append({
            "id": str(r.id),
            "product_id": str(r.product_id) if r.product_id else None,
            "product_title": r.product.title if r.product else "—",
            "batch": r.batch or "",
            "supplier_invoice": r.supplier_invoice or "",
            "expiry_date": r.expiry_date.isoformat(),
            "days_until_expiry": days_until,
            "bucket": bucket_key,
            "quantity": qty,
            "unit_cost": str(unit_cost.quantize(Decimal("0.01"))),
            "cost_value": str(cost_value.quantize(Decimal("0.01"))),
            "retail_value": str(retail_value.quantize(Decimal("0.01"))),
            "wholesaler_id": (
                str(r.received_from_id) if r.received_from_id else None
            ),
            "wholesaler_title": (
                r.received_from.title if r.received_from else ""
            ),
        })

    return rows


# =====================================================================
# Aggregation
# =====================================================================

def _bucket_summary(rows):
    summary = {
        key: {
            "key": key,
            "label": label,
            "batches": 0,
            "units": 0,
            "cost_value": Decimal("0.00"),
            "retail_value": Decimal("0.00"),
        }
        for key, label, _lo, _hi in BUCKETS
    }

    for row in rows:
        b = summary[row["bucket"]]
        b["batches"] += 1
        b["units"] += row["quantity"]
        b["cost_value"] += Decimal(row["cost_value"])
        b["retail_value"] += Decimal(row["retail_value"])

    out = []
    for key, label, _lo, _hi in BUCKETS:
        b = summary[key]
        out.append({
            "key": b["key"],
            "label": b["label"],
            "batches": b["batches"],
            "units": b["units"],
            "cost_value": str(b["cost_value"].quantize(Decimal("0.01"))),
            "retail_value": str(
                b["retail_value"].quantize(Decimal("0.01"))
            ),
        })
    return out


def _kpi(rows, buckets):
    total_batches = len(rows)
    total_units = sum(r["quantity"] for r in rows)
    cost_value = sum(
        (Decimal(r["cost_value"]) for r in rows), Decimal("0.00")
    )
    retail_value = sum(
        (Decimal(r["retail_value"]) for r in rows), Decimal("0.00")
    )

    expired = next((b for b in buckets if b["key"] == "EXPIRED"), None)
    urgent = next((b for b in buckets if b["key"] == "0_7"), None)

    return {
        "total_batches": total_batches,
        "total_units": total_units,
        "cost_value_at_risk": str(cost_value.quantize(Decimal("0.01"))),
        "retail_value_at_risk": str(
            retail_value.quantize(Decimal("0.01"))
        ),
        "expired_batches": expired["batches"] if expired else 0,
        "expired_units": expired["units"] if expired else 0,
        "expired_cost_value": expired["cost_value"] if expired else "0.00",
        "urgent_batches": urgent["batches"] if urgent else 0,
        "urgent_units": urgent["units"] if urgent else 0,
        "urgent_cost_value": urgent["cost_value"] if urgent else "0.00",
    }


def _wholesaler_summary(rows):
    bucket = {}
    for r in rows:
        key = r["wholesaler_id"] or "UNKNOWN"
        entry = bucket.setdefault(key, {
            "wholesaler_id": r["wholesaler_id"],
            "wholesaler_title": r["wholesaler_title"] or "Unspecified",
            "batches": 0,
            "units": 0,
            "cost_value": Decimal("0.00"),
        })
        entry["batches"] += 1
        entry["units"] += r["quantity"]
        entry["cost_value"] += Decimal(r["cost_value"])

    out = []
    for entry in bucket.values():
        out.append({
            "wholesaler_id": entry["wholesaler_id"],
            "wholesaler_title": entry["wholesaler_title"],
            "batches": entry["batches"],
            "units": entry["units"],
            "cost_value": str(
                entry["cost_value"].quantize(Decimal("0.01"))
            ),
        })
    out.sort(key=lambda x: Decimal(x["cost_value"]), reverse=True)
    return out


# =====================================================================
# Entry point
# =====================================================================

def get_expiry_report(data, user):
    """
    Build an expiry / near-expiry report.

    Payload:
    {
        "action": "GetExpiryReport",
        "days": 90,               # optional, default 90, max 365
        "bucket": "0_7",          # optional, filter to one bucket
        "product": "<uuid>",      # optional
        "wholesaler": "<uuid>",   # optional
        "search": "<string>",     # optional
        "entity_id": "<uuid>"     # staff only
    }
    """
    window_days = _resolve_window(data)

    bucket_filter = data.get("bucket")
    if bucket_filter and bucket_filter not in BUCKET_BY_KEY:
        return {"bucket": f"Unknown bucket: {bucket_filter}."}, None

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

    # ---- Rows and aggregations ----
    rows = _rows(entity, data, window_days, bucket_filter)
    buckets = _bucket_summary(rows)
    kpi = _kpi(rows, buckets)
    wholesalers = _wholesaler_summary(rows)

    report = {
        "period": {
            "as_of": timezone.now().date().isoformat(),
            "window_days": window_days,
        },
        "filters": {
            "bucket": bucket_filter,
            "product": data.get("product"),
            "wholesaler": data.get("wholesaler"),
            "search": data.get("search"),
        },
        "entity": {
            "id": str(entity.id),
            "title": entity.title,
        },
        "kpi": kpi,
        "buckets": buckets,
        "wholesaler_breakdown": wholesalers,
        "receipts": rows,
    }

    return {}, report