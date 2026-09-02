import datetime
from decimal import Decimal
from django.db.models import Sum, Min
from products.models import Products
from retailers.models import RetailerReceipts, CustomerOrderItems, OutOfStock
from wholesalers.models import WholesalerReceipts, WholesalerPriceDiscounts, WholesalerQuantityDiscounts

def get_entity_interacted_products(owner):
    """Gathers all unique Products that this Entity owner has ever interacted with."""
    r_ids = RetailerReceipts.objects.filter(owner=owner, is_active="true").values_list('product_id', flat=True)
    o_ids = OutOfStock.objects.filter(owner=owner, is_ordered="false").values_list('product_id', flat=True)
    return Products.objects.filter(id__in=set(list(r_ids) + list(o_ids)), active=True)

def calculate_single_product_metrics(product, owner, total_horizon_days, horizon_expiry_threshold, history_cutoff, max_shelf_days, lookback_days):
    """Aggregates inventory quantities, shelf age, and sales volumes strictly in Units."""
    today = datetime.date.today()
    
    p_stock = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true").aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    e_stock = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true", expiry_date__isnull=False, expiry_date__lte=horizon_expiry_threshold, expiry_date__gte=today).aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    usable_stock = max(0, p_stock - e_stock)
    
    o_date = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true").aggregate(o=Min('created'))['o']
    age, overstayed = 0, False
    if o_date:
        if isinstance(o_date, datetime.datetime): o_date = o_date.date()
        age = (today - o_date).days
        overstayed = age >= max_shelf_days
        
    sold = CustomerOrderItems.objects.filter(
        retailer_receipt__owner=owner, 
        retailer_receipt__product=product, 
        customer_order__status__in=["COMPLETED", "DELIVERED"], 
        customer_order__created__date__gte=history_cutoff
    ).aggregate(t=Sum('purchased_quantity'))['t'] or 0
    
    ads = Decimal(sold) / Decimal(lookback_days)
    raw_oos = OutOfStock.objects.filter(product=product, owner=owner, is_ordered="false").aggregate(t=Sum('required_quantity'))['t'] or 0
    
    val_oos = raw_oos
    disc = False
    note = ""
    if raw_oos > 0 and usable_stock > 0:
        disc = True
        val_oos = 0 if usable_stock >= raw_oos else max(0, raw_oos - usable_stock)
        note = f"Discrepancy: Logged out of stock for {raw_oos} units, but {usable_stock} units are available."
            
    return {"total_physical_stock": p_stock, "expiring_stock_hidden": e_stock, "usable_stock_calculated": usable_stock, "shelf_age_days": age, "has_overstayed": overstayed, "avg_daily_sales": ads, "validated_backlog_demand": val_oos, "has_inventory_discrepancy": disc, "discrepancy_note": note}

def find_wholesaler_procurement_offers(product, final_quantity_units, today):
    """Scans live wholesale promotions catalog matching unit parameters directly."""
    receipts = WholesalerReceipts.objects.filter(product=product, current_unit_quantity__gt=0, in_placement='true').select_related('received_from')
    
    r = receipts.first()
    if not r:
        return None
        
    name = r.received_from.title if r.received_from else "Unknown Wholesaler"
    p_disc = WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=r, is_active="true", start__lte=today, end__gte=today).first()
    price = r.final_unit_selling_price if p_disc else r.unit_selling_price
    p_txt = f"Promo Offer: Save {p_disc.percent}%! Unit price dropped to {p_disc.offer_price}" if p_disc else f"Standard Unit Price: {r.unit_selling_price}"
    
    return {
        "wholesaler_receipt_id": str(r.id), 
        "supplier_name": name, 
        "batch": r.batch, 
        "available_wholesaler_units": r.current_unit_quantity, 
        "unit_pricing": {
            "unit_selling_price": float(r.unit_selling_price), 
            "final_unit_selling_price": float(price), 
            "is_discounted": p_disc is not None
        }, 
        "promotions": {"price_promotion_details": p_txt, "quantity_promotion_details": []}
    }
