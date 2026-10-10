# retailers/utils/daily_retailer_report.py
#
# Daily sales report — retailer side.
#
# Aggregations across CustomerOrders / CustomerOrderItems / SalesReturns /
# RetailerReceipts / CustomerOrderPayment. Default period is today;
# from/to ranges are accepted via `_resolve_period`.
#
# Returns (errors, report_dict). The view wraps the dict with
# custom_success_message.

from datetime import date as date_cls
from decimal import Decimal

from django.db.models import (
    Count,
    DecimalField,
    F,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce

from authentication.models import Entities
from retailers.models import (
    CustomerOrderItems,
    CustomerOrderPayment,
    CustomerOrders,
    RetailerReceipts,
    SalesReturns,
)


# =====================================================================
# Constants
# =====================================================================

ZERO = Value(
    Decimal("0.00"),
    output_field=DecimalField(max_digits=18, decimal_places=2),
)
ZERO_INT = Value(0)

EXCLUDED_STATUSES = ("CANCELLED",)


# =====================================================================
# Period resolution
# =====================================================================

def _resolve_period(data):
    """
    Returns (start_date, end_date) — both date objects.

    Modes, in precedence order:
      1. from + to  → explicit range
      2. from only  → that day through today
      3. date       → single day
      4. neither    → today (daily default)

    Raises ValueError on malformed input.
    """
    raw_from = data.get("from")
    raw_to = data.get("to")
    raw_date = data.get("date")

    def parse(s):
        try:
            return date_cls.fromisoformat(str(s))
        except (TypeError, ValueError):
            raise ValueError(f"Invalid date: {s!r}. Use YYYY-MM-DD.")

    today = date_cls.today()

    if raw_from and raw_to:
        start = parse(raw_from)
        end = parse(raw_to)
        if end < start:
            raise ValueError("'to' must be on or after 'from'.")
        return start, end

    if raw_from:
        start = parse(raw_from)
        if start > today:
            raise ValueError("'from' cannot be in the future.")
        return start, today

    if raw_to:
        raise ValueError("'from' is required when 'to' is supplied.")

    if raw_date:
        d = parse(raw_date)
        return d, d

    return today, today


# =====================================================================
# Base querysets
# =====================================================================

def _base_orders(entity, start, end, include_cancelled):
    qs = CustomerOrders.objects.filter(
        entity=entity,
        created__date__gte=start,
        created__date__lte=end,
    )
    if not include_cancelled:
        qs = qs.exclude(status__in=EXCLUDED_STATUSES)
    return qs


def _base_items(entity, start, end, include_cancelled):
    qs = CustomerOrderItems.objects.filter(
        customer_order__entity=entity,
        customer_order__created__date__gte=start,
        customer_order__created__date__lte=end,
    )
    if not include_cancelled:
        qs = qs.exclude(customer_order__status__in=EXCLUDED_STATUSES)
    return qs


def _base_returns(entity, start, end):
    return SalesReturns.objects.filter(
        entity=entity,
        created__date__gte=start,
        created__date__lte=end,
    )


# =====================================================================
# Sections
# =====================================================================

def _kpi(entity, start, end, include_cancelled):
    orders = _base_orders(entity, start, end, include_cancelled)

    agg = orders.aggregate(
        orders_count=Count("id"),
        gross=Coalesce(Sum("order_price_total"), ZERO),
        tax=Coalesce(Sum("order_tax_total"), ZERO),
        discount=Coalesce(Sum("order_price_discount_total"), ZERO),
        shipping=Coalesce(Sum("shipping_cost"), ZERO),
        net=Coalesce(Sum("order_net_price_total"), ZERO),
        paid=Coalesce(Sum("paid_total"), ZERO),
        balance_due=Coalesce(Sum("balance_due"), ZERO),
    )

    items = _base_items(entity, start, end, include_cancelled)
    units_sold = items.aggregate(
        total=Coalesce(Sum("total_quantity"), ZERO),
    )["total"]

    returns = _base_returns(entity, start, end)
    returns_agg = returns.aggregate(
        count=Count("id"),
        quantity=Coalesce(Sum("quantity"), ZERO_INT),
    )

    # Value the returns using the receipt's current selling price.
    # SalesReturns stores no price snapshot — this is the closest
    # available figure without a model change. See notes below.
    returns_value = (
        returns
        .filter(retailer_receipt__isnull=False)
        .aggregate(
            value=Coalesce(
                Sum(
                    F("quantity")
                    * F("retailer_receipt__final_unit_selling_price"),
                    output_field=DecimalField(
                        max_digits=18, decimal_places=2,
                    ),
                ),
                ZERO,
            )
        )["value"]
        or Decimal("0.00")
    )

    # Stock on hand — all-time snapshot, not period-scoped.
    stock = RetailerReceipts.objects.filter(
        entity=entity, is_active="true",
    ).aggregate(
        units=Coalesce(Sum("current_unit_quantity"), ZERO_INT),
        value=Coalesce(
            Sum(
                F("current_unit_quantity")
                * F("final_unit_selling_price"),
                output_field=DecimalField(
                    max_digits=18, decimal_places=2,
                ),
            ),
            ZERO,
        ),
    )

    return {
        "orders_count": agg["orders_count"] or 0,
        "gross_sales": str(agg["gross"] or "0.00"),
        "tax_total": str(agg["tax"] or "0.00"),
        "discount_total": str(agg["discount"] or "0.00"),
        "shipping_total": str(agg["shipping"] or "0.00"),
        "net_sales": str(agg["net"] or "0.00"),
        "paid_total": str(agg["paid"] or "0.00"),
        "balance_due_total": str(agg["balance_due"] or "0.00"),
        "units_sold": str(units_sold or "0.00"),
        "returns_count": returns_agg["count"] or 0,
        "units_returned": str(returns_agg["quantity"] or 0),
        "returns_value": str(returns_value),
        "net_after_returns": str(
            (agg["net"] or Decimal("0.00")) - returns_value
        ),
        "receipts_on_hand_units": stock["units"] or 0,
        "receipts_on_hand_value": str(stock["value"] or "0.00"),
    }


def _origin_counts(entity, start, end, include_cancelled):
    rows = (
        _base_orders(entity, start, end, include_cancelled)
        .values("order_origin")
        .annotate(
            orders_count=Count("id"),
            net=Coalesce(Sum("order_net_price_total"), ZERO),
            paid=Coalesce(Sum("paid_total"), ZERO),
        )
        .order_by("order_origin")
    )
    return [
        {
            "order_origin": r["order_origin"],
            "orders_count": r["orders_count"],
            "net": str(r["net"] or "0.00"),
            "paid": str(r["paid"] or "0.00"),
        }
        for r in rows
    ]


def _channel_counts(entity, start, end, include_cancelled):
    rows = (
        _base_orders(entity, start, end, include_cancelled)
        .values("order_channel")
        .annotate(
            orders_count=Count("id"),
            net=Coalesce(Sum("order_net_price_total"), ZERO),
        )
        .order_by("-net")
    )
    return [
        {
            "order_channel": r["order_channel"],
            "orders_count": r["orders_count"],
            "net": str(r["net"] or "0.00"),
        }
        for r in rows
    ]


def _payment_breakdown(entity, start, end, include_cancelled):
    """
    Declared payment method — what the customer chose at order time.
    """
    rows = (
        _base_orders(entity, start, end, include_cancelled)
        .values(
            "selected_payment_method__id",
            "selected_payment_method__title",
        )
        .annotate(
            orders_count=Count("id"),
            gross=Coalesce(Sum("order_price_total"), ZERO),
            net=Coalesce(Sum("order_net_price_total"), ZERO),
            paid=Coalesce(Sum("paid_total"), ZERO),
        )
        .order_by("-net")
    )
    return [
        {
            "payment_method_id": (
                str(r["selected_payment_method__id"])
                if r["selected_payment_method__id"] else None
            ),
            "payment_method_title": (
                r["selected_payment_method__title"] or "Unspecified"
            ),
            "orders_count": r["orders_count"],
            "gross": str(r["gross"] or "0.00"),
            "net": str(r["net"] or "0.00"),
            "paid": str(r["paid"] or "0.00"),
        }
        for r in rows
    ]


def _collections_breakdown(entity, start, end):
    """
    Actual money collected — sourced from CustomerOrderPayment where
    status == SUCCESS. Deliberately NOT filtered by `include_cancelled`:
    a cancelled order that was already paid still represents cash that
    landed, which is the correct accounting for a collections view.
    """
    rows = (
        CustomerOrderPayment.objects
        .filter(
            customer_order__entity=entity,
            status="SUCCESS",
            created__date__gte=start,
            created__date__lte=end,
        )
        .values("payment_method__id", "payment_method__title")
        .annotate(
            transactions=Count("id"),
            collected=Coalesce(Sum("amount"), ZERO),
        )
        .order_by("-collected")
    )
    return [
        {
            "payment_method_id": (
                str(r["payment_method__id"])
                if r["payment_method__id"] else None
            ),
            "payment_method_title": (
                r["payment_method__title"] or "Unspecified"
            ),
            "transactions": r["transactions"],
            "collected": str(r["collected"] or "0.00"),
        }
        for r in rows
    ]


def _origin_payment_breakdown(entity, start, end, include_cancelled):
    """
    Nested: per origin, a summary plus a payment-method list.
    One query, reshaped in Python.
    """
    rows = (
        _base_orders(entity, start, end, include_cancelled)
        .values(
            "order_origin",
            "selected_payment_method__id",
            "selected_payment_method__title",
        )
        .annotate(
            orders_count=Count("id"),
            net=Coalesce(Sum("order_net_price_total"), ZERO),
            paid=Coalesce(Sum("paid_total"), ZERO),
        )
    )

    bucket = {}
    for r in rows:
        origin = r["order_origin"] or "UNKNOWN"
        entry = bucket.setdefault(origin, {
            "order_origin": origin,
            "summary": {
                "orders_count": 0,
                "net": Decimal("0.00"),
                "paid": Decimal("0.00"),
            },
            "methods": [],
        })
        entry["summary"]["orders_count"] += r["orders_count"]
        entry["summary"]["net"] += r["net"] or Decimal("0.00")
        entry["summary"]["paid"] += r["paid"] or Decimal("0.00")
        entry["methods"].append({
            "payment_method_id": (
                str(r["selected_payment_method__id"])
                if r["selected_payment_method__id"] else None
            ),
            "payment_method_title": (
                r["selected_payment_method__title"] or "Unspecified"
            ),
            "orders_count": r["orders_count"],
            "net": str(r["net"] or "0.00"),
            "paid": str(r["paid"] or "0.00"),
        })

    out = []
    for entry in bucket.values():
        entry["summary"]["net"] = str(entry["summary"]["net"])
        entry["summary"]["paid"] = str(entry["summary"]["paid"])
        entry["methods"].sort(
            key=lambda m: Decimal(m["net"]), reverse=True,
        )
        out.append(entry)

    out.sort(key=lambda e: Decimal(e["summary"]["net"]), reverse=True)
    return out


def _product_breakdown(entity, start, end, include_cancelled):
    """
    One row per product that either sold or was returned during the
    period, plus its current stock snapshot.
    """

    # ---- Sold ----
    sales_rows = (
        _base_items(entity, start, end, include_cancelled)
        .values(
            "retailer_receipt__product__id",
            "retailer_receipt__product__title",
        )
        .annotate(
            sold_quantity=Coalesce(Sum("total_quantity"), ZERO),
            gross_value=Coalesce(Sum("item_price_total"), ZERO),
            net_value=Coalesce(Sum("item_net_price_total"), ZERO),
            order_count=Count("customer_order", distinct=True),
        )
    )

    # ---- Returned ----
    return_rows = (
        _base_returns(entity, start, end)
        .values(
            "retailer_receipt__product__id",
            "retailer_receipt__product__title",
        )
        .annotate(
            returned_quantity=Coalesce(Sum("quantity"), ZERO_INT),
            return_count=Count("id"),
        )
    )

    # ---- Stock snapshot (all-time, not period-scoped) ----
    stock_rows = (
        RetailerReceipts.objects
        .filter(entity=entity, is_active="true")
        .values("product__id", "product__title")
        .annotate(
            current_stock=Coalesce(Sum("current_unit_quantity"), ZERO_INT),
            stock_value=Coalesce(
                Sum(
                    F("current_unit_quantity")
                    * F("final_unit_selling_price"),
                    output_field=DecimalField(
                        max_digits=18, decimal_places=2,
                    ),
                ),
                ZERO,
            ),
        )
    )

    by_id = {}

    def _ensure(pid, title):
        if pid not in by_id:
            by_id[pid] = {
                "product_id": str(pid),
                "product_title": title or "—",
                "sold_quantity": Decimal("0.00"),
                "gross_value": Decimal("0.00"),
                "net_value": Decimal("0.00"),
                "order_count": 0,
                "returned_quantity": 0,
                "return_count": 0,
                "net_quantity": Decimal("0.00"),
                "current_stock": 0,
                "stock_value": Decimal("0.00"),
            }
        return by_id[pid]

    for r in sales_rows:
        pid = r["retailer_receipt__product__id"]
        if not pid:
            continue
        p = _ensure(pid, r["retailer_receipt__product__title"])
        p["sold_quantity"] = r["sold_quantity"] or Decimal("0.00")
        p["gross_value"] = r["gross_value"] or Decimal("0.00")
        p["net_value"] = r["net_value"] or Decimal("0.00")
        p["order_count"] = r["order_count"]

    for r in return_rows:
        pid = r["retailer_receipt__product__id"]
        if not pid:
            continue
        p = _ensure(pid, r["retailer_receipt__product__title"])
        p["returned_quantity"] = r["returned_quantity"] or 0
        p["return_count"] = r["return_count"]

    for r in stock_rows:
        pid = r["product__id"]
        if pid in by_id:
            by_id[pid]["current_stock"] = r["current_stock"] or 0
            by_id[pid]["stock_value"] = r["stock_value"] or Decimal("0.00")

    out = []
    for p in by_id.values():
        p["net_quantity"] = (
            p["sold_quantity"] - Decimal(str(p["returned_quantity"]))
        )
        out.append({
            **p,
            "sold_quantity": str(p["sold_quantity"]),
            "gross_value": str(p["gross_value"]),
            "net_value": str(p["net_value"]),
            "net_quantity": str(p["net_quantity"]),
            "stock_value": str(p["stock_value"]),
        })

    out.sort(key=lambda x: Decimal(x["net_value"]), reverse=True)
    return out


def _totals(product_rows):
    sold_q = sum(
        (Decimal(r["sold_quantity"]) for r in product_rows),
        Decimal("0.00"),
    )
    gross_v = sum(
        (Decimal(r["gross_value"]) for r in product_rows),
        Decimal("0.00"),
    )
    net_v = sum(
        (Decimal(r["net_value"]) for r in product_rows),
        Decimal("0.00"),
    )
    ret_q = sum(
        (Decimal(str(r["returned_quantity"])) for r in product_rows),
        Decimal("0.00"),
    )
    stock_q = sum((r["current_stock"] for r in product_rows), 0)
    stock_v = sum(
        (Decimal(r["stock_value"]) for r in product_rows),
        Decimal("0.00"),
    )
    return {
        "sold_quantity": str(sold_q),
        "gross_value": str(gross_v),
        "net_value": str(net_v),
        "returned_quantity": str(ret_q),
        "current_stock": stock_q,
        "stock_value": str(stock_v),
    }


# =====================================================================
# Entry point
# =====================================================================

def get_daily_sales_report(data, user):
    """
    Build the daily sales report.

    Returns (errors, report_dict). On success, errors is {} and the
    dict is fully populated. On failure, errors is a dict suitable
    for custom_errors_response and the report is None.

    Payload keys:
        action              required (dispatcher reads it; not used here)
        date                optional single-day  YYYY-MM-DD
        from                optional range start YYYY-MM-DD
        to                  optional range end   YYYY-MM-DD
                            (must accompany `from`)
        entity_id           optional, staff only
        include_cancelled   optional bool, default False

    Period precedence:
        from + to > from only > date > today.
    """
    try:
        start, end = _resolve_period(data)
    except ValueError as e:
        return {"date": str(e)}, None

    # ---- Scope resolution ----
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

    include_cancelled = bool(data.get("include_cancelled", False))

    products = _product_breakdown(
        entity, start, end, include_cancelled,
    )

    report = {
        "period": {
            "from": start.isoformat(),
            "to": end.isoformat(),
            "days": (end - start).days + 1,
        },
        "entity": {
            "id": str(entity.id),
            "title": entity.title,
        },
        "filters": {
            "include_cancelled": include_cancelled,
        },
        "kpi": _kpi(entity, start, end, include_cancelled),
        "origin_counts": _origin_counts(
            entity, start, end, include_cancelled,
        ),
        "channel_counts": _channel_counts(
            entity, start, end, include_cancelled,
        ),
        "payment_breakdown": _payment_breakdown(
            entity, start, end, include_cancelled,
        ),
        "collections_breakdown": _collections_breakdown(
            entity, start, end,
        ),
        "origin_payment_breakdown": _origin_payment_breakdown(
            entity, start, end, include_cancelled,
        ),
        "product_breakdown": products,
        "totals": _totals(products),
    }

    return {}, report