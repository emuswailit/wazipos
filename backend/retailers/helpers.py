import datetime
from decimal import Decimal
from django.db.models import Sum, Min
from retailers.models import RetailerReceipts, CustomerOrderItems, OutOfStock

from products.models import Products
from retailers.models import RetailerReceipts, OutOfStock

def get_entity_interacted_products(owner):
    """
    Gathers all unique Products that this Entity owner has ever interacted with.
    Scans active inventory records and active out-of-stock backlogs.
    """
    r_ids = RetailerReceipts.objects.filter(owner=owner, is_active="true").values_list('product_id', flat=True)
    o_ids = OutOfStock.objects.filter(owner=owner, is_ordered="false").values_list('product_id', flat=True)
    return Products.objects.filter(id__in=set(list(r_ids) + list(o_ids)), active=True)


def calculate_single_product_metrics(product, owner, total_horizon_days, horizon_expiry_threshold, history_cutoff, max_shelf_days, lookback_days):
    """
    Aggregates shelf metrics, expiration calculations, and logs anomalies for one product.
    """
    today = datetime.date.today()
    factor = int(product.units_per_pack) if product.units_per_pack else 1
    
    p_stock = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true").aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    e_stock = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true", expiry_date__isnull=False, expiry_date__lte=horizon_expiry_threshold, expiry_date__gte=today).aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    usable_stock = max(0, p_stock - e_stock)
    
    o_date = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true").aggregate(o=Min('created'))['o']
    age, overstayed = 0, False
    if o_date:
        if isinstance(o_date, datetime.datetime): 
            o_date = o_date.date()
        age = (today - o_date).days
        overstayed = age >= max_shelf_days
        
    sold = CustomerOrderItems.objects.filter(retailer_receipt__owner=owner, retailer_receipt__product=product, customer_order__status__in=["COMPLETED", "DELIVERED"], customer_order__created__date__gte=history_cutoff).aggregate(t=Sum('purchased_quantity'))['t'] or 0
    ads = Decimal(sold) / Decimal(lookback_days)
    raw_oos = OutOfStock.objects.filter(product=product, owner=owner, is_ordered="false").aggregate(t=Sum('required_quantity'))['t'] or 0
    
    val_oos, disc, note = 0, False, ""
    if raw_oos > 0:
        if usable_stock > 0:
            disc = True
            val_oos = 0 if usable_stock >= raw_oos else max(0, raw_oos - usable_stock)
            note = f"Discrepancy: Logged out of stock for {raw_oos} units, but {usable_stock} usable units are available." if usable_stock >= raw_oos else f"Discrepancy: Logged out of stock for {raw_oos} units, but only {usable_stock} units exist."
        else: 
            val_oos = raw_oos
            
    return {"pack_factor": factor, "total_physical_stock": p_stock, "expiring_stock_hidden": e_stock, "usable_stock_calculated": usable_stock, "shelf_age_days": age, "has_overstayed": overstayed, "avg_daily_sales": ads, "raw_backlog_demand": raw_oos, "validated_backlog_demand": val_oos, "has_inventory_discrepancy": disc, "discrepancy_note": note}



from wholesalers.models import WholesalerReceipts, WholesalerPriceDiscounts, WholesalerQuantityDiscounts

def find_wholesaler_procurement_offers(product, final_quantity_packs, today):
    """
    Scans the live wholesale catalog to match active multi-tier vendor promotions.
    """
    offers = []
    receipts = WholesalerReceipts.objects.filter(product=product, current_unit_quantity__gt=0, in_placement='true').select_related('received_from')
    
    for r in receipts:
        name = r.received_from.title if r.received_from else "Unknown Wholesaler"
        p_disc = WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=r, is_active="true", start__lte=today, end__gte=today).first()
        price = r.final_unit_selling_price if p_disc else r.unit_selling_price
        p_txt = f"Promo Offer: Save {p_disc.percent}%! Pack price dropped to {p_disc.offer_price}" if p_disc else f"Standard Pack Price: {r.unit_selling_price}"
        
        q_discs = WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=r, is_active="true", start__lte=today, end__gte=today)
        q_promos, proc_opts = [], []
        
        if q_discs.exists():
            for q in q_discs:
                q_promos.append(f"Volume Deal: Buy {q.limit_quantity} Packs, get {q.awarded_quantity} Packs completely FREE!")
                
                if 0 < final_quantity_packs < q.limit_quantity:
                    hint = f"Upsell Hint: Increase your order by {q.limit_quantity - final_quantity_packs} Packs to unlock {q.awarded_quantity} free Packs!"
                    target = q.limit_quantity
                elif final_quantity_packs >= q.limit_quantity:
                    hint = f"Deal Activated: Your pack order qualifications grant you {(final_quantity_packs // q.limit_quantity) * q.awarded_quantity} free Packs!"
                    target = final_quantity_packs
                else:
                    hint = "No adjustments needed."
                    target = final_quantity_packs
                    
                proc_opts.append({
                    "limit_quantity_tier": q.limit_quantity, 
                    "awarded_quantity": q.awarded_quantity, 
                    "predicted_requirement_packs": final_quantity_packs, 
                    "optimized_recommendation_packs": target, 
                    "action_guidance": hint
                })
        else:
            q_promos.append("No active bulk promotions.")
            proc_opts.append({
                "limit_quantity_tier": 0, 
                "awarded_quantity": 0, 
                "predicted_requirement_packs": final_quantity_packs, 
                "optimized_recommendation_packs": final_quantity_packs, 
                "action_guidance": "No adjustments needed."
            })
            
        if final_quantity_packs > 0 or p_disc or q_discs.exists():
            offers.append({
                "wholesaler_receipt_id": r.id, 
                "supplier_name": name, 
                "batch": r.batch, 
                "available_wholesaler_packs": r.current_unit_quantity, 
                "pack_pricing": {
                    "unit_selling_price": float(r.unit_selling_price), 
                    "final_unit_selling_price": float(price), 
                    "is_discounted": p_disc is not None
                }, 
                "promotions": {
                    "price_promotion_details": p_txt, 
                    "quantity_promotion_details": q_promos
                }, 
                "procurement_optimization": proc_opts
            })
            
    return offers

from collections import defaultdict
from rest_framework.exceptions import ValidationError
from wholesalers.models import WholesalerReceipts

def group_checkout_items_by_wholesaler(items):
    """
    Groups checkout selections cleanly by distinct Wholesaler ID keys.
    """
    groups = defaultdict(list)
    ignored = 0
    
    for entry in items:
        try: 
            qty = int(entry.get('purchased_quantity', 0))
        except (TypeError, ValueError): 
            raise ValidationError("purchased_quantity must be a valid whole integer.")
            
        if qty <= 0: 
            ignored += 1
            continue
            
        try: 
            r = WholesalerReceipts.objects.select_for_update().get(id=entry.get('wholesaler_receipt_id'))
        except WholesalerReceipts.DoesNotExist: 
            raise ValidationError(f"Wholesaler stock record ID {entry.get('wholesaler_receipt_id')} missing.")
            
        if r.current_unit_quantity < qty: 
            raise ValidationError(f"Insufficient stock for {r.product.title}. Available: {r.current_unit_quantity}")
            
        if not r.received_from: 
            raise ValidationError(f"Wholesaler receipt {r.id} missing wholesaler mapping.")
            
        groups[r.received_from.id].append({"w_receipt": r, "purchased_quantity": qty})
        
    return groups, ignored

from decimal import Decimal
from authentication.models import Entities
from retailers.models import RetailerOrders, RetailerOrderItems, OutOfStock

def create_retailer_order_group(retailer_entity, wholesaler_id, grouped_items, validated_data, request_user):
    """
    Creates a parent Supplier transaction row and generates child items inside a ledger.
    """
    w_entity = Entities.objects.get(id=wholesaler_id)
    order = RetailerOrders.objects.create(
        retailer=retailer_entity, 
        wholesaler=w_entity, 
        status='SUBMITTED', 
        order_origin='RETAILER', 
        owner=request_user
    )
    gross, disc, final = Decimal('0.00'), Decimal('0.00'), Decimal('0.00')
    
    for item in grouped_items:
        r, qty = item['w_receipt'], item['purchased_quantity']
        bp = r.unit_selling_price
        
        if r.final_unit_selling_price > 0:
            fp = r.final_unit_selling_price
        else:
            fp = bp
            
        ud = r.discount_unit_selling_price
        g_l = bp * Decimal(qty)
        f_l = fp * Decimal(qty)
        d_l = ud * Decimal(qty)
        gross += g_l; disc += d_l; final += f_l
        
        RetailerOrderItems.objects.create(
            retailer_order=order, 
            wholesaler_receipt=r, 
            purchased_quantity=qty, 
            total_quantity=qty, 
            item_price=bp, 
            item_price_total=g_l, 
            item_final_price=fp, 
            item_final_price_total=f_l, 
            item_price_discount=ud, 
            item_price_discount_total=d_l, 
            unit_of_issue=r.unit_of_receipt, 
            owner=request_user
        )
        r.current_unit_quantity -= qty
        r.save(update_fields=['current_unit_quantity'])
        OutOfStock.objects.filter(product=r.product, owner=request_user, is_ordered="false").update(is_ordered="true")
        
    order.order_gross_price_total = gross
    order.order_discount_total = disc
    order.final_price = final
    order.final_price_total = final
    order.save(update_fields=['order_gross_price_total', 'order_discount_total', 'final_price', 'final_price_total'])
    
    return {
        "retailer_order_id": order.id, 
        "wholesaler_title": w_entity.title, 
        "final_price_total": float(order.final_price_total)
    }
