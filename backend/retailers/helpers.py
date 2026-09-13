import datetime
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Min

# retailers/helpers.py

"""
Pure helpers for the inventory prediction pipeline.

No DB access, no async, no Channels. Everything here is a
function of its arguments, which makes it easy to test and
easy to reuse outside the consumer.
"""

import datetime
import decimal
import json
import uuid
from datetime import timedelta
from decimal import Decimal

import numpy as np
import pandas as pd
from django.utils import timezone
from sklearn.linear_model import LinearRegression


# =========================================================
# JSON encoder
# =========================================================

class UUIDEncoder(json.JSONEncoder):
    """Encoder for UUID / date / datetime / Decimal."""

    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return str(obj)
        return super().default(obj)


# =========================================================
# Daily series
# =========================================================

def combine_daily(sales_rows, oos_rows):
    """
    Merge sales and out-of-stock rows into a flat list of
    { d: date, q: int } dicts.
    """
    combined = []

    for r in sales_rows:
        dt = r["customer_order__created"]
        if dt is None:
            continue
        combined.append({
            "d": dt.date() if hasattr(dt, "date") else dt,
            "q": int(r["purchased_quantity"] or 0),
        })

    for r in oos_rows:
        dt = r["created"]
        if dt is None:
            continue
        combined.append({
            "d": dt.date() if hasattr(dt, "date") else dt,
            "q": int(r["required_quantity"] or 0),
        })

    return combined


# =========================================================
# Demand estimation
# =========================================================

def estimate_daily_demand(sales_rows, oos_rows):
    """
    Estimate daily demand from history.

    Strategy:
      - 3+ months of history → linear regression on monthly totals
      - 1–2 months          → simple average over the elapsed window
      - 0 events            → None (caller drops the product)

    Returns:
      float  → daily demand estimate
      None   → not enough signal
    """
    daily = combine_daily(sales_rows, oos_rows)

    if len(daily) < 1:
        return None

    df = pd.DataFrame(daily)
    df["d"] = pd.to_datetime(df["d"])
    df.set_index("d", inplace=True)

    monthly = df.resample("ME")["q"].sum().reset_index()

    # ---- Path A: regression ----
    if len(monthly) >= 3:
        monthly["idx"] = np.arange(len(monthly))

        model = LinearRegression().fit(
            monthly[["idx"]].values,
            monthly["q"].values,
        )

        next_total = max(
            0,
            float(
                model.predict(
                    np.array([[len(monthly)]])
                )[0]
            ),
        )
        return next_total / 30.4

    # ---- Path B: simple average over elapsed window ----
    total_units = float(monthly["q"].sum())

    first_date = df.index.min().date()
    today = timezone.now().date()
    span_days = max(1, (today - first_date).days)

    daily_rate = total_units / span_days

    return max(daily_rate, 0.01)


# =========================================================
# Safety stock
# =========================================================

def estimate_safety_stock(sales_rows, oos_rows):
    """
    Weekly stddev / 7 × z(95%) = 1.65.
    Returns 0 when there's less than two weeks of history.
    """
    daily = combine_daily(sales_rows, oos_rows)
    if len(daily) < 2:
        return 0

    df = pd.DataFrame(daily)
    df["d"] = pd.to_datetime(df["d"])
    df.set_index("d", inplace=True)

    weekly = df.resample("W")["q"].sum()
    if len(weekly) < 2 or pd.isna(weekly.std()):
        return 0

    return int(round((weekly.std() / 7) * 1.65))


# =========================================================
# Profit
# =========================================================

def compute_profit(
    receipt,
    quantity,
    final_unit_price,
    pricing_percentage,
):
    """
    Compute tentative profit for a single line.

    Selling price priority:
      1. receipt.recommended_retail_price (if set)
      2. cost × (1 + pricing_percentage/100)

    Returns a dict with per-unit and total figures.
    """
    cost_per_unit = Decimal(str(final_unit_price or 0))

    if receipt and receipt.recommended_retail_price:
        sell_per_unit = Decimal(
            str(receipt.recommended_retail_price)
        )
        pricing_source = "recommended_retail_price"
    else:
        markup = (
            Decimal(str(pricing_percentage or 30))
            / Decimal("100")
        )
        sell_per_unit = cost_per_unit * (
            Decimal("1") + markup
        )
        pricing_source = "retailer_markup"

    profit_per_unit = sell_per_unit - cost_per_unit

    total_cost = cost_per_unit * Decimal(str(quantity))
    total_revenue = sell_per_unit * Decimal(str(quantity))
    total_profit = total_revenue - total_cost

    margin_percent = Decimal("0")
    if sell_per_unit > 0:
        margin_percent = (
            profit_per_unit / sell_per_unit
        ) * Decimal("100")

    return {
        "cost_per_unit": float(cost_per_unit),
        "sell_per_unit": float(sell_per_unit),
        "pricing_source": pricing_source,
        "profit_per_unit": float(
            round(profit_per_unit, 2)
        ),
        "margin_percent": float(
            round(margin_percent, 2)
        ),
        "total_cost": float(round(total_cost, 2)),
        "total_revenue": float(
            round(total_revenue, 2)
        ),
        "total_profit": float(
            round(total_profit, 2)
        ),
    }


# =========================================================
# Quantity discount bonus
# =========================================================

def compute_bonus_quantity(quantity, discount):
    """
    Returns (total_quantity, bonus_quantity, full_blocks).

    Formula: floor(qty / limit) × awarded
    """
    if not discount or not discount.limit_quantity:
        return quantity, 0, 0

    full_blocks = quantity // discount.limit_quantity
    bonus = full_blocks * discount.awarded_quantity

    return quantity + bonus, bonus, full_blocks


# =========================================================
# Lead time
# =========================================================

def resolve_lead_time(
    learned_per_sku_supplier,
    learned_per_sku,
    learned_per_supplier,
    indent_lead_override,
):
    """
    Priority chain:

      1. per_sku_supplier  — this SKU, this supplier
      2. per_sku           — this SKU, any supplier
      3. per_supplier      — this supplier, any SKU
      4. indent_override   — user-set value on the indent
      5. default           — (5, 2) cold start

    Each `learned_*` argument is either a dict
    {"mean": float, "stddev": float, "samples": int} or None.
    """
    learned = learned_per_sku_supplier
    source = "per_sku_supplier"

    if not learned:
        learned = learned_per_sku
        source = "per_sku"

    if not learned:
        learned = learned_per_supplier
        source = "per_supplier"

    if indent_lead_override and indent_lead_override > 0:
        return (
            int(indent_lead_override),
            int(round(learned["stddev"])) if learned else 2,
            "indent_override",
        )

    if not learned:
        return (5, 2, "default")

    return (
        max(1, int(round(learned["mean"]))),
        max(0, int(round(learned["stddev"]))),
        source,
    )


# =========================================================
# Lead time summary
# =========================================================

def compute_lead_time_summary(compiled):
    """
    Weighted average lead time across predictions, weighted by
    line cost (qty × unit price).
    """
    if not compiled:
        return {
            "average_lead_time_days": 0.0,
            "average_variance_days": 0.0,
            "min_lead_time_days": 0,
            "max_lead_time_days": 0,
            "item_count": 0,
        }

    lead_days_list = []
    variance_list = []
    weights = []

    for p in compiled:
        metrics = p.get("calculated_metrics", {})
        lead_days_list.append(
            metrics.get("supplier_lead_time_days", 0)
        )
        variance_list.append(
            metrics.get("supplier_delay_days", 0)
        )

        suggested = (
            p.get("order_suggestion", {})
            .get("suggested_order_quantity", 0) or 0
        )
        unit_price = (
            p.get("order_suggestion", {})
            .get("supplier", {})
            .get("unit_price") or 0
        )
        weights.append(suggested * unit_price)

    total_weight = sum(weights) or 1

    avg_lead = sum(
        d * w for d, w in zip(lead_days_list, weights)
    ) / total_weight
    avg_var = sum(
        v * w for v, w in zip(variance_list, weights)
    ) / total_weight

    return {
        "average_lead_time_days": round(avg_lead, 2),
        "average_variance_days": round(avg_var, 2),
        "min_lead_time_days": min(lead_days_list),
        "max_lead_time_days": max(lead_days_list),
        "item_count": len(lead_days_list),
    }


# =========================================================
# Urgency sort
# =========================================================

def sort_by_urgency(predictions):
    """
    Lower ratio = more urgent.
    ratio = days_of_stock_left / lead_time
    """
    def key(p):
        metrics = p.get("calculated_metrics", {})
        daily = metrics.get("average_daily_demand", 0) or 0
        lead = metrics.get("supplier_lead_time_days", 5) or 5
        stock = (
            p.get("current_stock_status", {})
            .get("good_usable_units", 0) or 0
        )
        if daily <= 0:
            return 999
        days_left = stock / daily
        return days_left / max(lead, 1)

    return sorted(predictions, key=key)


# =========================================================
# Line cost
# =========================================================

def line_cost(prediction):
    """
    Cost of a single prediction line: qty × unit_price.
    Returns a Decimal so totals stay precise.
    """
    suggested = (
        prediction.get("order_suggestion", {})
        .get("suggested_order_quantity", 0) or 0
    )
    unit_price = (
        prediction.get("order_suggestion", {})
        .get("supplier", {})
        .get("unit_price") or 0
    )
    return Decimal(str(suggested)) * Decimal(str(unit_price))


# =========================================================
# Budget
# =========================================================

def apply_budget(predictions, budget_amount, enforce):
    """
    Greedy pass: keep lines (already sorted by urgency)
    until the budget is spent.

    When `enforce` is False, all lines are kept and the
    budget is advisory only.

    Returns (included, excluded).
    """
    if (
        budget_amount is None
        or budget_amount <= 0
        or not enforce
    ):
        return predictions, []

    included = []
    excluded = []
    running = Decimal("0")

    for p in predictions:
        cost = line_cost(p)
        if running + cost <= budget_amount:
            included.append(p)
            running += cost
        else:
            excluded.append(p)

    return included, excluded

def get_entity_interacted_products(owner):
    from products.models import Products
    from retailers.models import RetailerReceipts, OutOfStock, RetailerOrderItems
    r_ids = RetailerReceipts.objects.filter(owner=owner).values_list('product_id', flat=True)
    o_ids = OutOfStock.objects.filter(owner=owner, is_ordered="false").values_list('product_id', flat=True)
    interacted_product_ids = set(list(r_ids) + list(o_ids))
    active_ordered_product_ids = RetailerOrderItems.objects.filter(retailer_order__owner=owner, is_received="false").values_list('wholesaler_receipt__product_id', flat=True)
    final_eligible_ids = interacted_product_ids - set(list(active_ordered_product_ids))
    return Products.objects.filter(id__in=final_eligible_ids, active=True)

def calculate_single_product_metrics(product, owner, total_horizon_days, horizon_expiry_threshold, history_cutoff, max_shelf_days, lookback_days, days_to_order):
    from retailers.models import RetailerReceipts, CustomerOrderItems, OutOfStock
    today = datetime.date.today()
    p_stock = RetailerReceipts.objects.filter(owner=owner, product=product).aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    received_stock = RetailerReceipts.objects.filter(owner=owner, product=product).aggregate(r=Sum('received_unit_quantity'))['r'] or 0
    consumed_volume_historical = max(0, received_stock - p_stock)
    e_stock = RetailerReceipts.objects.filter(owner=owner, product=product, expiry_date__isnull=False, expiry_date__lte=horizon_expiry_threshold, expiry_date__gte=today).aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    usable_stock = max(0, p_stock - e_stock)
    o_date = RetailerReceipts.objects.filter(owner=owner, product=product).aggregate(o=Min('created'))['o']
    age, overstayed = 0, False
    if o_date:
        if isinstance(o_date, datetime.datetime): o_date = o_date.date()
        age = (today - o_date).days
        overstayed = age >= max_shelf_days
    start_of_history_datetime = datetime.datetime.combine(history_cutoff, datetime.time.min)
    sold = CustomerOrderItems.objects.filter(retailer_receipt__owner=owner, retailer_receipt__product=product, customer_order__status__in=["COMPLETED", "DELIVERED"], customer_order__created__gte=start_of_history_datetime).aggregate(t=Sum('purchased_quantity'))['t'] or 0
    if consumed_volume_historical > 0 and age > 0: ads = Decimal(consumed_volume_historical) / Decimal(age)
    elif sold > 0: ads = Decimal(sold) / Decimal(lookback_days)
    else: ads = Decimal('0.00')
    raw_oos = OutOfStock.objects.filter(product=product, owner=owner, is_ordered="false", retailer_indent__isnull=True, created__date__gte=history_cutoff).aggregate(t=Sum('required_quantity'))['t'] or 0
    val_oos, disc, note = raw_oos, False, ""
    if raw_oos > 0:
        if usable_stock > 0:
            disc = True
            val_oos = 0 if usable_stock >= raw_oos else max(0, raw_oos - usable_stock)
            note = f"Discrepancy: Shortage for {raw_oos} units, but {usable_stock} units remain sitting on shelf."
        else: val_oos = raw_oos
    return {"total_physical_stock": int(p_stock), "expiring_stock_hidden": int(e_stock), "usable_stock_calculated": int(usable_stock), "shelf_age_days": int(age), "has_overstayed": bool(overstayed), "avg_daily_sales": ads, "validated_backlog_demand": int(val_oos), "has_inventory_discrepancy": bool(disc), "discrepancy_note": str(note), "pack_factor": 1}

def find_wholesaler_procurement_offers(product, final_quantity_units, today):
    from wholesalers.models import WholesalerReceipts, WholesalerPriceDiscounts
    receipts = WholesalerReceipts.objects.filter(product=product, current_unit_quantity__gt=0, in_placement='true').select_related('received_from')
    r = receipts.first()
    if not r: return None
    name = r.received_from.title if r.received_from else "Unknown Wholesaler"
    p_disc = WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=r, is_active="true", start__lte=today, end__gte=today).first()
    price = r.final_unit_selling_price if p_disc else r.unit_selling_price
    p_txt = f"Promo Offer: Save {p_disc.percent}%! Price dropped to {p_disc.offer_price}" if p_disc else f"Standard Price: {r.unit_selling_price}"
    return {"wholesaler_receipt_id": str(r.id), "supplier_name": name, "batch": r.batch, "available_wholesaler_units": r.current_unit_quantity, "unit_pricing": { "unit_selling_price": float(r.unit_selling_price), "final_unit_selling_price": float(price), "is_discounted": p_disc is not None }, "promotions": { "price_promotion_details": p_txt, "quantity_promotion_details": [] }}

def sync_or_create_active_indent(entity, user, v):
    from retailers.models import RetailerIndent, RetailerIndentItem
    with transaction.atomic():
        active_indent = RetailerIndent.objects.filter(entity=entity, owner=user, is_open="true").first()
        if active_indent:
            active_indent.order_days = int(v['days_to_order'])
            active_indent.lead_time = int(v['lead_time_days'])
            active_indent.lookback_days = int(v.get('lookback_window', 30))
            active_indent.max_shelf_days = int(v.get('max_shelf_days', 90))
            active_indent.save()
        else: active_indent = RetailerIndent.objects.create(entity=entity, owner=user, order_days=int(v['days_to_order']), lead_time=int(v['lead_time_days']), lookback_days=int(v.get('lookback_window', 30)), max_shelf_days=int(v.get('max_shelf_days', 90)), is_open="true")
        RetailerIndentItem.objects.filter(retailer_indent=active_indent, entity=entity).delete()
        return active_indent

def rebuild_indent_item_row(entity, user, active_indent, product, final_quantity_units, unit_cost, proposed_offers, today):
    from retailers.models import RetailerIndentItem
    from wholesalers.models import WholesalerReceipts, WholesalerPriceDiscounts, WholesalerQuantityDiscounts
    if final_quantity_units <= 0: return None
    target_receipt, p_disc, q_disc, total_quantity = None, None, None, final_quantity_units
    base_unit_price = Decimal(str(unit_cost))
    if proposed_offers:
        try:
            target_receipt = WholesalerReceipts.objects.get(id=proposed_offers["wholesaler_receipt_id"])
            base_unit_price = Decimal(str(proposed_offers["unit_pricing"]["unit_selling_price"]))
            if proposed_offers["unit_pricing"]["is_discounted"]: p_disc = WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=target_receipt, is_active="true", start__lte=today, end__gte=today).first()
            q_disc = WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=target_receipt, is_active="true", limit_quantity__lte=final_quantity_units).order_by('-limit_quantity').first()
        except WholesalerReceipts.DoesNotExist: pass
    final_pack_price = base_unit_price - (base_unit_price * Decimal(str(p_disc.percent)) / Decimal('100.00')) if p_disc else base_unit_price
    item_gross_total_amount = Decimal(str(final_quantity_units)) * base_unit_price
    item_net_total_amount = Decimal(str(final_quantity_units)) * final_pack_price
    if q_disc: total_quantity = final_quantity_units + int((final_quantity_units / q_disc.purchase_trigger) * q_disc.bonus_quantity)
    return RetailerIndentItem.objects.create(entity=entity, owner=user, retailer_indent=active_indent, wholesale_receipt=target_receipt, wholesaler_price_discount=p_disc, wholesaler_quantity_discount=q_disc, required_quantity=final_quantity_units, total_quantity=total_quantity, final_pack_price=final_pack_price, item_gross_total_amount=item_gross_total_amount, item_net_total_amount=item_net_total_amount, indenting_criteria="VELOCITY_RUNWAY")
