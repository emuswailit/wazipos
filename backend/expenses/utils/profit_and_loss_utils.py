# retailers/utils/profit_and_loss_utils.py
#
# Profit & loss statement for a retailer entity.
#
# Default period: current month.
# Accepts: { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }
#          or { "year": 2026, "month": 10 }
#          or { "year": 2026 }   → full year
#          or nothing            → current month
#
# Returns (errors, report_dict).

from calendar import monthrange
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
from expenses.models import EntityExpenseCategories, EntityExpenses
from retailers.models import (
    CustomerOrderItems,
    CustomerOrderPayment,
    CustomerOrders,
    RetailerReceipts,
    SalesReturns,
    StockAdjustments,
)


# =====================================================================
# Constants
# =====================================================================

ZERO = Value(
    Decimal("0.00"),
    output_field=DecimalField(max_digits=18, decimal_places=2),
)
ZERO_INT = Value(0)

EXCLUDED_ORDER_STATUSES = ("CANCELLED",)

WRITE_OFF_INTENTS = ("EXPIRY_WRITE_OFF", "DAMAGE_WRITE_OFF")

# Expense categories that roll into COGS rather than operating expenses.
# Matched case-insensitively against EntityExpenseCategories.title.
COGS_CATEGORY_TITLES = ("PACKAGING", "FREIGHT", "DELIVERY", "CLEARING")


# =====================================================================
# Period resolution
# =====================================================================

def _resolve_period(data):
    """
    Returns (start_date, end_date).

    Modes, in precedence order:
      1. from + to  → explicit range
      2. year+month → that calendar month
      3. year only  → Jan 1 → Dec 31 of that year
      4. nothing    → current month (1st → today)

    Raises ValueError on malformed input.
    """
    raw_from = data.get("from")
    raw_to = data.get("to")
    raw_year = data.get("year")
    raw_month = data.get("month")

    def parse(s):
        try:
            return date_cls.fromisoformat(str(s))
        except (TypeError, ValueError):
            raise ValueError(f"Invalid date: {s!r}. Use YYYY-MM-DD.")

    if raw_from and raw_to:
        start = parse(raw_from)
        end = parse(raw_to)
        if end < start:
            raise ValueError("'to' must be on or after 'from'.")
        return start, end

    if raw_from or raw_to:
        raise ValueError("Provide both 'from' and 'to', or neither.")

    if raw_year:
        try:
            year = int(raw_year)
        except (TypeError, ValueError):
            raise ValueError("'year' must be an integer.")

        if raw_month:
            try:
                month = int(raw_month)
            except (TypeError, ValueError):
                raise ValueError("'month' must be an integer.")
            if month < 1 or month > 12:
                raise ValueError("'month' must be between 1 and 12.")
            last = monthrange(year, month)[1]
            return (
                date_cls(year, month, 1),
                date_cls(year, month, last),
            )

        return date_cls(year, 1, 1), date_cls(year, 12, 31)

    # Default: current month to today
    today = date_cls.today()
    return date_cls(today.year, today.month, 1), today


# =====================================================================
# Base querysets
# =====================================================================

def _orders_qs(entity, start, end):
    return CustomerOrders.objects.filter(
        entity=entity,
        created__date__gte=start,
        created__date__lte=end,
    ).exclude(status__in=EXCLUDED_ORDER_STATUSES)


def _items_qs(entity, start, end):
    return CustomerOrderItems.objects.filter(
        customer_order__entity=entity,
        customer_order__created__date__gte=start,
        customer_order__created__date__lte=end,
    ).exclude(
        customer_order__status__in=EXCLUDED_ORDER_STATUSES,
    )


def _returns_qs(entity, start, end):
    return SalesReturns.objects.filter(
        entity=entity,
        created__date__gte=start,
        created__date__lte=end,
    )


def _expenses_qs(entity, start, end):
    return EntityExpenses.objects.filter(
        entity=entity,
        expense_date__gte=start,
        expense_date__lte=end,
    )


# =====================================================================
# Revenue
# =====================================================================

def _revenue(entity, start, end):
    """Accrual basis: order totals, net of sales returns."""
    orders = _orders_qs(entity, start, end)

    agg = orders.aggregate(
        gross=Coalesce(Sum("order_price_total"), ZERO),
        tax=Coalesce(Sum("order_tax_total"), ZERO),
        discount=Coalesce(Sum("order_price_discount_total"), ZERO),
        shipping=Coalesce(Sum("shipping_cost"), ZERO),
        net=Coalesce(Sum("order_net_price_total"), ZERO),
        paid=Coalesce(Sum("paid_total"), ZERO),
        orders_count=Count("id"),
    )

    returns = _returns_qs(entity, start, end)
    returns_value = returns.aggregate(
        value=Coalesce(
            Sum(
                F("quantity")
                * F("retailer_receipt__final_unit_selling_price"),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            ),
            ZERO,
        )
    )["value"] or Decimal("0.00")

    gross = agg["gross"] or Decimal("0.00")
    tax = agg["tax"] or Decimal("0.00")
    net = agg["net"] or Decimal("0.00")
    # Net revenue excludes tax — tax is collected on behalf of the
    # government and is not income.
    net_of_tax = net - tax
    net_after_returns = net_of_tax - returns_value

    return {
        "orders_count": agg["orders_count"] or 0,
        "gross_sales": str(gross),
        "tax_collected": str(tax),
        "discounts": str(agg["discount"] or "0.00"),
        "shipping_charged": str(agg["shipping"] or "0.00"),
        "net_sales": str(net_of_tax),
        "returns_value": str(returns_value),
        "net_revenue": str(net_after_returns),
        # Informational — how much of the above was actually collected
        "paid_total": str(agg["paid"] or "0.00"),
    }


# =====================================================================
# COGS
# =====================================================================

def _cogs(entity, start, end):
    """
    Perpetual COGS — cost of goods that left the shelf during the
    period. Derived from sales lines and returns, valued at the
    receipt's landed cost (purchase price + allocated shipping).
    """
    items = _items_qs(entity, start, end)

    sold_cost = items.aggregate(
        value=Coalesce(
            Sum(
                F("total_quantity")
                * (
                    Coalesce(F("retailer_receipt__unit_buying_price"), ZERO)
                    + Coalesce(
                        F("retailer_receipt__allocated_shipping_per_unit"),
                        ZERO,
                    )
                ),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            ),
            ZERO,
        ),
        qty=Coalesce(Sum("total_quantity"), ZERO),
    )

    returns = _returns_qs(entity, start, end)
    returned_cost = returns.aggregate(
        value=Coalesce(
            Sum(
                F("quantity")
                * (
                    Coalesce(F("retailer_receipt__unit_buying_price"), ZERO)
                    + Coalesce(
                        F("retailer_receipt__allocated_shipping_per_unit"),
                        ZERO,
                    )
                ),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            ),
            ZERO,
        ),
        qty=Coalesce(Sum("quantity"), ZERO_INT),
    )

    sold = sold_cost["value"] or Decimal("0.00")
    returned = returned_cost["value"] or Decimal("0.00")
    net_cogs = sold - returned

    return {
        "sold_cost": str(sold),
        "returned_cost": str(returned),
        "net_cogs": str(net_cogs),
        "units_sold": str(sold_cost["qty"] or "0"),
        "units_returned": str(returned_cost["qty"] or 0),
    }


# =====================================================================
# Operating expenses
# =====================================================================

def _expenses_by_category(entity, start, end):
    """
    Group expenses by category. Any category whose title matches a
    COGS_CATEGORY_TITLES entry is returned separately so the caller
    can roll it into COGS instead of operating expenses.
    """
    rows = (
        _expenses_qs(entity, start, end)
        .values(
            "expense_category__id",
            "expense_category__title",
        )
        .annotate(
            total=Coalesce(Sum("amount"), ZERO),
            count=Count("id"),
        )
        .order_by("-total")
    )

    cogs_rows = []
    opex_rows = []
    for r in rows:
        title = (r["expense_category__title"] or "UNCATEGORISED").upper()
        entry = {
            "category_id": (
                str(r["expense_category__id"])
                if r["expense_category__id"] else None
            ),
            "category": title,
            "amount": str(r["total"] or "0.00"),
            "count": r["count"],
        }
        if title in COGS_CATEGORY_TITLES:
            cogs_rows.append(entry)
        else:
            opex_rows.append(entry)

    return cogs_rows, opex_rows


def _payment_fees(entity, start, end):
    """Transaction charges on successful customer payments."""
    rows = (
        CustomerOrderPayment.objects
        .filter(
            customer_order__entity=entity,
            status="SUCCESS",
            created__date__gte=start,
            created__date__lte=end,
        )
        .aggregate(
            fees=Coalesce(Sum("transaction_charge"), ZERO),
            count=Count("id"),
        )
    )
    return {
        "fees": str(rows["fees"] or "0.00"),
        "transactions": rows["count"] or 0,
    }


def _write_offs(entity, start, end):
    """
    Inventory written off (expiry, damage). Valued at landed cost.
    """
    rows = (
        StockAdjustments.objects
        .filter(
            entity=entity,
            created__date__gte=start,
            created__date__lte=end,
            return_intent__in=WRITE_OFF_INTENTS,
            direction="DECREMENT",
        )
        .aggregate(
            cost=Coalesce(
                Sum(
                    F("quantity")
                    * (
                        Coalesce(
                            F("retailer_receipt__unit_buying_price"),
                            ZERO,
                        )
                        + Coalesce(
                            F(
                                "retailer_receipt__allocated_shipping_per_unit"
                            ),
                            ZERO,
                        )
                    ),
                    output_field=DecimalField(
                        max_digits=18, decimal_places=2,
                    ),
                ),
                ZERO,
            ),
            quantity=Coalesce(Sum("quantity"), ZERO_INT),
        )
    )

    by_intent = (
        StockAdjustments.objects
        .filter(
            entity=entity,
            created__date__gte=start,
            created__date__lte=end,
            return_intent__in=WRITE_OFF_INTENTS,
            direction="DECREMENT",
        )
        .values("return_intent")
        .annotate(
            cost=Coalesce(
                Sum(
                    F("quantity")
                    * (
                        Coalesce(
                            F("retailer_receipt__unit_buying_price"),
                            ZERO,
                        )
                        + Coalesce(
                            F(
                                "retailer_receipt__allocated_shipping_per_unit"
                            ),
                            ZERO,
                        )
                    ),
                    output_field=DecimalField(
                        max_digits=18, decimal_places=2,
                    ),
                ),
                ZERO,
            ),
            quantity=Coalesce(Sum("quantity"), ZERO_INT),
        )
    )

    return {
        "total_cost": str(rows["cost"] or "0.00"),
        "total_quantity": rows["quantity"] or 0,
        "breakdown": [
            {
                "reason": r["return_intent"],
                "cost": str(r["cost"] or "0.00"),
                "quantity": r["quantity"] or 0,
            }
            for r in by_intent
        ],
    }


# =====================================================================
# Stock snapshot (informational)
# =====================================================================

def _stock_position(entity):
    """
    All-time snapshot of current stock. Not period-scoped — it's the
    balance-sheet side, not the P&L side. Included so the reader can
    eyeball inventory value alongside the P&L.
    """
    agg = RetailerReceipts.objects.filter(
        entity=entity, is_active="true",
    ).aggregate(
        units=Coalesce(Sum("current_unit_quantity"), ZERO_INT),
        cost_value=Coalesce(
            Sum(
                F("current_unit_quantity")
                * (
                    Coalesce(F("unit_buying_price"), ZERO)
                    + Coalesce(F("allocated_shipping_per_unit"), ZERO)
                ),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            ),
            ZERO,
        ),
        retail_value=Coalesce(
            Sum(
                F("current_unit_quantity")
                * F("final_unit_selling_price"),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            ),
            ZERO,
        ),
    )
    return {
        "units": agg["units"] or 0,
        "cost_value": str(agg["cost_value"] or "0.00"),
        "retail_value": str(agg["retail_value"] or "0.00"),
    }


# =====================================================================
# Entry point
# =====================================================================

def get_profit_and_loss(data, user):
    """
    Build a P&L statement for the caller's entity.

    Payload:
    {
        "action": "GetProfitAndLoss",
        "from": "YYYY-MM-DD",   # optional
        "to":   "YYYY-MM-DD",   # required if `from` given
        "year": 2026,           # optional
        "month": 10,            # optional (requires `year`)
        "entity_id": "<uuid>"   # staff only
    }

    Period precedence:
        from + to > year + month > year > current month.
    """
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

    # ---- Compute sections ----
    revenue = _revenue(entity, start, end)
    cogs = _cogs(entity, start, end)

    cogs_expenses, opex_rows = _expenses_by_category(entity, start, end)
    fees = _payment_fees(entity, start, end)
    write_offs = _write_offs(entity, start, end)

    # ---- Roll COGS-side expense categories into COGS ----
    cogs_expense_total = sum(
        (Decimal(r["amount"]) for r in cogs_expenses),
        Decimal("0.00"),
    )
    net_cogs = Decimal(cogs["net_cogs"]) + cogs_expense_total

    net_revenue = Decimal(revenue["net_revenue"])
    gross_profit = net_revenue - net_cogs

    # ---- Operating expenses ----
    opex_total = sum(
        (Decimal(r["amount"]) for r in opex_rows),
        Decimal("0.00"),
    )
    payment_fees = Decimal(fees["fees"])
    write_off_total = Decimal(write_offs["total_cost"])
    total_opex = opex_total + payment_fees + write_off_total

    net_profit = gross_profit - total_opex

    gross_margin = (
        (gross_profit / net_revenue * Decimal("100"))
        if net_revenue > 0
        else Decimal("0.00")
    )
    net_margin = (
        (net_profit / net_revenue * Decimal("100"))
        if net_revenue > 0
        else Decimal("0.00")
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
        "revenue": revenue,
        "cogs": {
            **cogs,
            "expense_categories": cogs_expenses,
            "expense_categories_total": str(cogs_expense_total),
            "total": str(net_cogs),
        },
        "gross_profit": str(gross_profit),
        "gross_margin_percent": str(
            gross_margin.quantize(Decimal("0.01"))
        ),
        "operating_expenses": {
            "categories": opex_rows,
            "categories_total": str(opex_total),
            "payment_fees": fees,
            "inventory_write_offs": write_offs,
            "total": str(total_opex),
        },
        "net_profit": str(net_profit),
        "net_margin_percent": str(
            net_margin.quantize(Decimal("0.01"))
        ),
        "stock_position": _stock_position(entity),
    }

    return {}, report