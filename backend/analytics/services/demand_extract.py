# analytics/services/demand_extract.py
#
# DemandFact extractor.
#
# Reads from the operational tables and writes one DemandFact row per
# (entity, product, tier, day, source_type).
#
# Sources:
#     RetailerOrderItems (status=RECEIVED)         → WHOLESALER, "order"
#     RetailerReceipts (direct, non-null supplier) → WHOLESALER, "direct_receipt"
#     CustomerOrderItems                           → RETAILER,   "customer_sale"
#     SalesReturns                                 → RETAILER,   "sales_return"
#     WholesalerReceiptReturns (status=ACCEPTED)   → WHOLESALER, "wholesaler_return"
#     StockAdjustments (expiry/damage)             → RETAILER,   "adjustment"
#
# Idempotent: for the given date, existing facts are deleted and rebuilt.
#
# ---------------------------------------------------------------------
# DESIGN NOTES
# ---------------------------------------------------------------------
#
# Date filtering
#     We filter with `__gte` / `__lt` on timezone-aware datetimes rather
#     than `__date=`. `__date` raises FieldError on DateField columns and
#     emits naive-datetime warnings on DateTimeField columns under
#     USE_TZ=True. `_day_bounds` produces aware boundaries that compare
#     cleanly against any DateTimeField.
#
# Customer sales and `is_paid`
#     `is_paid` is set only by the cashless payment webhook
#     (check_jambopay_payment_status). Cash-at-counter sales never route
#     through that flow, so they stay at is_paid="false" forever even
#     though the sale happened.
#
#     We therefore do NOT filter on `is_paid`, and we do NOT require a
#     terminal order status — the default PROCESSING status persists
#     indefinitely for walk-out sales.
#
#     The only exclusion is CANCELLED orders, which never represented a
#     sale.
#
# Wholesaler returns schema
#     WholesalerReceiptReturns was simplified. The accepted state is
#     status="ACCEPTED", the timestamp is `accepted_at` (there is no
#     `confirmed_at`), and the accepted quantity is stored in `quantity`
#     (there is no `confirmed_quantity`). Prior versions of this file
#     filtered on the old names and silently returned zero rows.

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone as tz

from analytics.models import DemandFact
from retailers.models import (
    CustomerOrderItems,
    RetailerReceipts,
    SalesReturns,
    StockAdjustments,
)
from wholesalers.models import (
    RetailerOrderItems,
    WholesalerReceiptReturns,
)


# Which StockAdjustments count as demand depletion.
# return_intent uses values from StockAdjustments.RETURN_INTENTS, and
# `direction` uses "DECREMENT" / "INCREMENT" — not "DECREASE".
ADJUSTMENT_DEMAND_INTENTS = {"EXPIRY_WRITE_OFF", "DAMAGE_WRITE_OFF"}


# =====================================================================
# Date helpers
# =====================================================================

def _day_bounds(d: date):
    """
    Return (start, end) as timezone-aware datetimes for range filtering.

    Aware boundaries compare cleanly against DateTimeField columns and
    avoid the "naive datetime" RuntimeWarning that appears when a plain
    `date` is passed to a timezone-aware DateTimeField filter.

    Usage:
        start, end = _day_bounds(fact_date)
        qs.filter(created__gte=start, created__lt=end)
    """
    start = tz.make_aware(
        datetime.combine(d, time.min),
        tz.get_current_timezone(),
    )
    end = start + timedelta(days=1)
    return start, end


# =====================================================================
# Entry point
# =====================================================================

def extract_daily_demand(fact_date: date | None = None) -> dict:
    """
    Build DemandFact rows for a single date.

    All sources are aggregated at (entity, product, tier, source_type).
    """
    fact_date = fact_date or date.today()

    buckets: dict = {}

    _extract_wholesaler_orders(fact_date, buckets)
    _extract_wholesaler_direct_receipts(fact_date, buckets)
    _extract_customer_sales(fact_date, buckets)
    _extract_sales_returns(fact_date, buckets)
    _extract_wholesaler_returns(fact_date, buckets)
    _extract_adjustments(fact_date, buckets)

    rows = [_bucket_to_fact(b, fact_date) for b in buckets.values()]

    with transaction.atomic():
        DemandFact.objects.filter(fact_date=fact_date).delete()
        if rows:
            DemandFact.objects.bulk_create(rows, batch_size=1000)

    return {
        "fact_date": fact_date.isoformat(),
        "facts_created": len(rows),
    }


# =====================================================================
# Wholesaler tier
# =====================================================================

def _extract_wholesaler_orders(fact_date, buckets):
    """
    Retailer orders where the parent order status is RECEIVED.
    Seller = the wholesaler. Buyer = the retailer.
    """
    day_start, day_end = _day_bounds(fact_date)

    lines = (
        RetailerOrderItems.objects
        .filter(
            retailer_order__status="RECEIVED",
            created__gte=day_start,
            created__lt=day_end,
        )
        .select_related(
            "retailer_order",
            "wholesaler_receipt",
            "wholesaler_receipt__product",
        )
    )

    for line in lines:
        receipt = line.wholesaler_receipt
        if not receipt:
            continue

        seller_id = line.retailer_order.wholesaler_id
        buyer_id = line.retailer_order.retailer_id
        product_id = receipt.product_id

        qty = Decimal(str(line.total_quantity or 0))
        revenue = Decimal(str(
            line.item_net_price_total or line.item_final_price_total or 0
        ))

        _add_bucket(
            buckets,
            entity_id=seller_id,
            product_id=product_id,
            tier="WHOLESALER",
            source_type="order",
            buyer_entity_id=buyer_id,
            qty=qty,
            revenue=revenue,
            line_count=1,
            batch=getattr(receipt, "batch", None),
        )


def _extract_wholesaler_direct_receipts(fact_date, buckets):
    """
    RetailerReceipts created without an order line and with a known
    supplier. These represent stock that arrived at the retailer from
    a known wholesaler outside the normal order flow.
    """
    day_start, day_end = _day_bounds(fact_date)

    receipts = (
        RetailerReceipts.objects
        .filter(
            retailer_order_item__isnull=True,
            received_from__isnull=False,
            is_active="true",
            created__gte=day_start,
            created__lt=day_end,
        )
        .select_related("product")
    )

    for r in receipts:
        qty = Decimal(str(r.received_unit_quantity or 0))
        revenue = Decimal(str(
            (r.unit_buying_price or 0) * (r.received_unit_quantity or 0)
        ))

        _add_bucket(
            buckets,
            entity_id=r.received_from_id,
            product_id=r.product_id,
            tier="WHOLESALER",
            source_type="direct_receipt",
            buyer_entity_id=r.entity_id,
            qty=qty,
            revenue=revenue,
            line_count=1,
            batch=r.batch,
        )


# =====================================================================
# Retail tier
# =====================================================================

def _extract_customer_sales(fact_date, buckets):
    """
    Customer sales that represent realised demand.

    Counts every customer order line created that day except for
    cancelled orders.

    Deliberately does NOT filter on `is_paid`:
        is_paid is only set by the cashless payment webhook. Cash sales
        taken at the counter never generate a CustomerOrderPayment, so
        they remain is_paid="false" forever — yet they are real demand.

    Deliberately does NOT filter on `status`:
        new orders default to PROCESSING and may never advance, because
        the shop has no workflow that moves walk-out sales to DELIVERED
        or COMPLETED. Requiring a terminal status would exclude them.

    The only exclusion is CANCELLED orders.
    """
    day_start, day_end = _day_bounds(fact_date)

    lines = (
        CustomerOrderItems.objects
        .filter(created__gte=day_start, created__lt=day_end)
        .exclude(customer_order__status="CANCELLED")
        .select_related(
            "customer_order",
            "retailer_receipt",
            "retailer_receipt__product",
        )
    )

    for line in lines:
        receipt = line.retailer_receipt
        if not receipt:
            continue

        qty = Decimal(str(line.total_quantity or 0))
        revenue = Decimal(str(
            line.item_net_price_total or line.item_price_total or 0
        ))

        _add_bucket(
            buckets,
            entity_id=line.customer_order.entity_id,
            product_id=receipt.product_id,
            tier="RETAILER",
            source_type="customer_sale",
            buyer_entity_id=None,
            qty=qty,
            revenue=revenue,
            line_count=1,
            batch=getattr(receipt, "batch", None),
        )


def _extract_sales_returns(fact_date, buckets):
    """
    Customer returns. Reduce net demand at the retailer tier.
    Recorded as a negative-quantity fact on the return date.
    """
    day_start, day_end = _day_bounds(fact_date)

    returns = (
        SalesReturns.objects
        .filter(
            created__gte=day_start,
            created__lt=day_end,
        )
        .select_related("retailer_receipt", "retailer_receipt__product")
    )

    for r in returns:
        receipt = r.retailer_receipt
        if not receipt:
            continue

        qty = -Decimal(str(r.quantity or 0))

        _add_bucket(
            buckets,
            entity_id=receipt.entity_id,
            product_id=receipt.product_id,
            tier="RETAILER",
            source_type="sales_return",
            buyer_entity_id=None,
            qty=qty,
            revenue=Decimal("0"),
            line_count=1,
            batch=getattr(receipt, "batch", None),
        )


# =====================================================================
# Returns at wholesaler tier
# =====================================================================

def _extract_wholesaler_returns(fact_date, buckets):
    """
    Retailer → wholesaler returns that have been accepted back by the
    wholesaler. Negative demand at the wholesaler tier.

    Schema note: after the model simplification, the accepted state is
    status="ACCEPTED", the timestamp is `accepted_at`, and the accepted
    quantity lives in `quantity` — not `confirmed_at` / `confirmed_quantity`.
    """
    day_start, day_end = _day_bounds(fact_date)

    returns = (
        WholesalerReceiptReturns.objects
        .filter(
            status="ACCEPTED",
            accepted_at__gte=day_start,
            accepted_at__lt=day_end,
        )
        .select_related("product")
    )

    for r in returns:
        qty = -Decimal(str(r.quantity or 0))
        if qty == 0:
            continue

        _add_bucket(
            buckets,
            entity_id=r.wholesaler_entity_id,
            product_id=r.product_id,
            tier="WHOLESALER",
            source_type="wholesaler_return",
            buyer_entity_id=r.retailer_entity_id,
            qty=qty,
            revenue=Decimal("0"),
            line_count=1,
            batch=None,
        )


# =====================================================================
# Adjustments
# =====================================================================

def _extract_adjustments(fact_date, buckets):
    """
    Retail-side stock adjustments for expiry and damage.
    Treated as depletion (negative demand) at the retailer tier.

    `direction` on StockAdjustments uses "DECREMENT" / "INCREMENT",
    not "DECREASE". Prior versions filtered on "DECREASE" and matched
    zero rows.
    """
    day_start, day_end = _day_bounds(fact_date)

    adjustments = (
        StockAdjustments.objects
        .filter(
            return_intent__in=ADJUSTMENT_DEMAND_INTENTS,
            direction="DECREMENT",
            created__gte=day_start,
            created__lt=day_end,
            retailer_receipt__isnull=False,
        )
        .select_related("retailer_receipt", "retailer_receipt__product")
    )

    for a in adjustments:
        receipt = a.retailer_receipt
        if not receipt:
            continue

        qty = -Decimal(str(a.quantity or 0))

        _add_bucket(
            buckets,
            entity_id=receipt.entity_id,
            product_id=receipt.product_id,
            tier="RETAILER",
            source_type="adjustment",
            buyer_entity_id=None,
            qty=qty,
            revenue=Decimal("0"),
            line_count=1,
            batch=getattr(receipt, "batch", None),
        )


# =====================================================================
# Bucket helpers
# =====================================================================

def _add_bucket(
    buckets: dict,
    entity_id,
    product_id,
    tier: str,
    source_type: str,
    buyer_entity_id,
    qty: Decimal,
    revenue: Decimal,
    line_count: int,
    batch=None,
):
    key = (entity_id, product_id, tier, source_type)
    b = buckets.get(key)
    if b is None:
        b = {
            "entity_id": entity_id,
            "product_id": product_id,
            "tier": tier,
            "source_type": source_type,
            "buyer_entity_id": buyer_entity_id,
            "quantity": Decimal("0"),
            "gross_quantity": Decimal("0"),
            "return_quantity": Decimal("0"),
            "gross_revenue": Decimal("0"),
            "net_revenue": Decimal("0"),
            "line_count": 0,
            "batch": batch,
        }
        buckets[key] = b

    b["quantity"] += qty
    if qty >= 0:
        b["gross_quantity"] += qty
        b["gross_revenue"] += revenue
    else:
        b["return_quantity"] += abs(qty)
    b["net_revenue"] += revenue
    b["line_count"] += line_count


def _bucket_to_fact(b: dict, fact_date: date) -> DemandFact:
    qty = b["quantity"]
    rev = b["net_revenue"]
    unit_price = (rev / qty) if qty > 0 else None

    return DemandFact(
        entity_id=b["entity_id"],
        fact_date=fact_date,
        tier=b["tier"],
        source_type=b["source_type"],
        product_id=b["product_id"],
        buyer_entity_id=b["buyer_entity_id"],
        batch=b["batch"],
        quantity=qty,
        gross_quantity=b["gross_quantity"],
        return_quantity=b["return_quantity"],
        gross_revenue=b["gross_revenue"],
        net_revenue=rev,
        unit_price_avg=unit_price,
        order_line_count=b["line_count"],
    )