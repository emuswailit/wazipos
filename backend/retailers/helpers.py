import datetime
import math
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Min
from rest_framework.exceptions import ValidationError

def get_entity_interacted_products(owner):
    """Gathers all unique Products that this Entity owner has ever interacted with across all history."""
    from products.models import Products
    from retailers.models import RetailerReceipts, OutOfStock

    r_ids = RetailerReceipts.objects.filter(owner=owner).values_list('product_id', flat=True)
    o_ids = OutOfStock.objects.filter(owner=owner, is_ordered="false").values_list('product_id', flat=True)
    return Products.objects.filter(id__in=set(list(r_ids) + list(o_ids)), active=True)


# retailers/helpers.py

# retailers/helpers.py

def calculate_single_product_metrics(product, owner, total_horizon_days, horizon_expiry_threshold, history_cutoff, max_shelf_days, lookback_days, days_to_order):
    """
    Aggregates shelf metrics, expiration calculations, and logs anomalies for one product.
    🛡️ Scans ALL historical records (No is_active flag constraints).
    📊 DUAL-TRACKS RECEIVED AND CURRENT QUANTITY TO EXTRACT LIFE VELOCITY.
    🚀 INCORPORATES DAYS_TO_ORDER DIRECTLY INTO RUNWAY TARGET CALCS.
    """
    from retailers.models import RetailerReceipts, CustomerOrderItems, OutOfStock
    import datetime
    from decimal import Decimal
    from django.db.models import Sum, Min

    today = datetime.date.today()
    
    # 📦 TRACKER 1: Sum live on-hand stock remaining across ALL lines
    p_stock = RetailerReceipts.objects.filter(owner=owner, product=product).aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    
    # 📦 TRACKER 2: Sum initial intake volume delivered historically across ALL lines
    received_stock = RetailerReceipts.objects.filter(owner=owner, product=product).aggregate(r=Sum('received_unit_quantity'))['r'] or 0
    
    # 📊 INTAKE CONSUMPTION VOLUME: Total items drained from shelves over time
    consumed_volume_historical = max(0, received_stock - p_stock)
    
    # Expiry calculation scanning across all non-depleted logs
    e_stock = RetailerReceipts.objects.filter(
        owner=owner, 
        product=product, 
        expiry_date__isnull=False, 
        expiry_date__lte=horizon_expiry_threshold, 
        expiry_date__gte=today
    ).aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    usable_stock = max(0, p_stock - e_stock)
    
    # Track the oldest batch entry arrival timestamp for shelf age indexing
    o_date = RetailerReceipts.objects.filter(owner=owner, product=product).aggregate(o=Min('created'))['o']
    age, overstayed = 0, False
    if o_date:
        if isinstance(o_date, datetime.datetime): 
            o_date = o_date.date()
        age = (today - o_date).days
        overstayed = age >= max_shelf_days
        
    # Timezone-safe start-of-day boundary assignment
    start_of_history_datetime = datetime.datetime.combine(history_cutoff, datetime.time.min)

    # Standard transaction-log velocity backup match
    sold = CustomerOrderItems.objects.filter(
        retailer_receipt__owner=owner, 
        retailer_receipt__product=product, 
        customer_order__status__in=["COMPLETED", "DELIVERED"], 
        customer_order__created__gte=start_of_history_datetime 
    ).aggregate(t=Sum('purchased_quantity'))['t'] or 0
    
    # 🚀 DUAL-QUANTITY VELOCITY MATRIX CALCULATOR:
    # Prioritizes live batch drawdown metrics (Received vs Current) over flat sales transaction records
    if consumed_volume_historical > 0 and age > 0:
        ads = Decimal(consumed_volume_historical) / Decimal(age)
    elif sold > 0:
        ads = Decimal(sold) / Decimal(lookback_days)
    else:
        ads = Decimal('0.00')
        
    # Scan for unfulfilled, un-ordered shortages created inside active lookback windows
    raw_oos = OutOfStock.objects.filter(
        product=product, 
        owner=owner, 
        is_ordered="false",  
        retailer_indent__isnull=True, 
        created__date__gte=history_cutoff
    ).aggregate(t=Sum('required_quantity'))['t'] or 0
    
    val_oos = raw_oos
    disc = False
    note = ""
    if raw_oos > 0:
        if usable_stock > 0:
            disc = True
            val_oos = 0 if usable_stock >= raw_oos else max(0, raw_oos - usable_stock)
            note = f"Discrepancy: Logged shortage for {raw_oos} units, but {usable_stock} units remain sitting on shelf."
        else:
            val_oos = raw_oos
            
    return {
        "total_physical_stock": int(p_stock), 
        "expiring_stock_hidden": int(e_stock), 
        "usable_stock_calculated": int(usable_stock), 
        "shelf_age_days": int(age), 
        "has_overstayed": bool(overstayed), 
        "avg_daily_sales": ads, 
        "validated_backlog_demand": int(val_oos), 
        "has_inventory_discrepancy": bool(disc), 
        "discrepancy_note": str(note),
        "pack_factor": 1
    }



def find_wholesaler_procurement_offers(product, final_quantity_units, today):
    """Scans live wholesale configurations to resolve current promotion rules."""
    from wholesalers.models import WholesalerReceipts, WholesalerPriceDiscounts
    receipts = WholesalerReceipts.objects.filter(product=product, current_unit_quantity__gt=0, in_placement='true').select_related('received_from')
    r = receipts.first()
    if not r: return None
    name = r.received_from.title if r.received_from else "Unknown Wholesaler"
    p_disc = WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=r, is_active="true", start__lte=today, end__gte=today).first()
    price = r.final_unit_selling_price if p_disc else r.unit_selling_price
    p_txt = f"Promo Offer: Save {p_disc.percent}%! Price dropped to {p_disc.offer_price}" if p_disc else f"Standard Price: {r.unit_selling_price}"
    return {
        "wholesaler_receipt_id": str(r.id), "supplier_name": name, "batch": r.batch, "available_wholesaler_units": r.current_unit_quantity,
        "unit_pricing": { "unit_selling_price": float(r.unit_selling_price), "final_unit_selling_price": float(price), "is_discounted": p_disc is not None },
        "promotions": { "price_promotion_details": p_txt, "quantity_promotion_details": [] }
    }


def sync_or_create_active_indent(entity, user, v):
    """Locates or initializes active open internal indent document tracking parameters."""
    from retailers.models import RetailerIndent, RetailerIndentItem
    with transaction.atomic():
        active_indent = RetailerIndent.objects.filter(entity=entity, owner=user, is_open="true").first()
        if active_indent:
            active_indent.order_days = int(v['days_to_order'])
            active_indent.lead_time = int(v['lead_time_days'])
            active_indent.lookback_days = int(v.get('lookback_window', 30))
            active_indent.max_shelf_days = int(v.get('max_shelf_days', 90))
            active_indent.save()
        else:
            active_indent = RetailerIndent.objects.create(entity=entity, owner=user, order_days=int(v['days_to_order']), lead_time=int(v['lead_time_days']), lookback_days=int(v.get('lookback_window', 30)), max_shelf_days=int(v.get('max_shelf_days', 90)), is_open="true")
        RetailerIndentItem.objects.filter(retailer_indent=active_indent, entity=entity).delete()
        return active_indent


def rebuild_indent_item_row(entity, user, active_indent, product, final_quantity_units, unit_cost, proposed_offers, today):
    """Populates individual rows under the active parent indent configuration header rules."""
    from retailers.models import RetailerIndentItem
    from wholesalers.models import WholesalerReceipts, WholesalerPriceDiscounts, WholesalerQuantityDiscounts
    if final_quantity_units <= 0: return None
    target_receipt, p_disc, q_disc, bonus_units = None, None, None, 0
    actual_pack_price = Decimal(str(unit_cost))
    if proposed_offers:
        try:
            target_receipt = WholesalerReceipts.objects.get(id=proposed_offers["wholesaler_receipt_id"])
            p_disc = WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=target_receipt, is_active="true", start__lte=today, end__gte=today).first()
            if p_disc: actual_pack_price = Decimal(str(p_disc.offer_price))
            elif target_receipt.final_unit_selling_price > 0: actual_pack_price = Decimal(str(target_receipt.final_unit_selling_price))
            q_disc = WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=target_receipt, is_active="true", start__lte=today, end__gte=today).first()
            if q_disc and q_disc.limit_quantity > 0 and final_quantity_units >= q_disc.limit_quantity:
                bonus_units = (final_quantity_units // q_disc.limit_quantity) * q_disc.awarded_quantity
        except WholesalerReceipts.DoesNotExist: pass
    gross_subtotal = Decimal(final_quantity_units) * actual_pack_price
    return RetailerIndentItem.objects.create(entity=entity, owner=user, retailer_indent=active_indent, wholesale_receipt=target_receipt, wholesaler_price_discount=p_disc, wholesaler_quantity_discount=q_disc, required_quantity=final_quantity_units, total_quantity=(final_quantity_units + bonus_units), final_pack_price=actual_pack_price, item_gross_total_amount=gross_subtotal, item_net_total_amount=gross_subtotal)
