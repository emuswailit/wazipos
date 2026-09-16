# analytics/services/demand_extract.py

"""
DemandFact extractor.

Reads from the operational tables and writes one DemandFact row per
(entity, product, tier, day, source_type).

Sources:
    RetailerOrderItems (status=RECEIVED)     → WHOLESALER, "order"
    RetailerReceipts (direct, non-null supplier) → WHOLESALER, "direct_receipt"
    CustomerOrderItems (is_paid=true)        → RETAILER,   "customer_sale"
    SalesReturns                             → RETAILER,   "sales_return"
    WholesalerReceiptReturns                 → WHOLESALER, "wholesaler_return"
    StockAdjustments (expiry/damage)         → RETAILER,   "adjustment"

Idempotent: for the given date, existing facts are deleted and rebuilt.
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum

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


# Which StockAdjustments count as demand depletion
ADJUSTMENT_DEMAND_INTENTS = {"EXPIRY_WRITE_OFF", "DAMAGE_WRITE_OFF"}


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
    lines = (
        RetailerOrderItems.objects
        .filter(
            retailer_order__status="RECEIVED",
            created=fact_date,
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
        revenue = Decimal(str(line.item_net_price_total or line.item_final_price_total or 0))

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
    receipts = (
        RetailerReceipts.objects
        .filter(
            retailer_order_item__isnull=True,
            received_from__isnull=False,
            is_active="true",
            created__date=fact_date,
        )
        .select_related("product")
    )

    for r in receipts:
        qty = Decimal(str(r.received_unit_quantity or 0))
        # Direct receipts have no list price. Use buying price as
        # a rough revenue substitute if needed; else zero.
        revenue = Decimal(str(
            (r.unit_buying_price or 0) * (r.received_unit_quantity or 0)
        ))

        _add_bucket(
            buckets,
            entity_id=r.received_from_id,       # the supplier (seller)
            product_id=r.product_id,
            tier="WHOLESALER",
            source_type="direct_receipt",
            buyer_entity_id=r.entity_id,        # the retailer
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
    Customer sales where the parent order is_paid="true".
    Seller = the retailer entity. Buyer = None (customer isn't an entity).
    """
    lines = (
        CustomerOrderItems.objects
        .filter(
            customer_order__is_paid="true",
            created__date=fact_date,
        )
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
        revenue = Decimal(str(line.item_net_price_total or line.item_price_total or 0))

        _add_bucket(
            buckets,
            entity_id=line.customer_order.entity_id,  # the retailer
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
    returns = (
        SalesReturns.objects
        .filter(created__date=fact_date)
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
    Retailer → wholesaler returns that have been received back.
    Negative demand at the wholesaler tier.
    """
    returns = (
        WholesalerReceiptReturns.objects
        .filter(
            status__in=["CONFIRMED", "SETTLED"],
            confirmed_at__date=fact_date,
        )
        .select_related("product")
    )

    for r in returns:
        qty = -Decimal(str(r.confirmed_quantity or 0))
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
            batch=getattr(r, "batch", None),
        )


# =====================================================================
# Adjustments
# =====================================================================

def _extract_adjustments(fact_date, buckets):
    """
    Retail-side stock adjustments for expiry and damage.
    Treated as depletion (negative demand) at the retailer tier.
    """
    adjustments = (
        StockAdjustments.objects
        .filter(
            return_intent__in=ADJUSTMENT_DEMAND_INTENTS,
            direction="DECREASE",
            created__date=fact_date,
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