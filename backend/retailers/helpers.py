import datetime
import math
from decimal import Decimal
from collections import defaultdict
from django.db.models import Sum, Min
from rest_framework.exceptions import ValidationError

# --- Core Database App Imports ---
from authentication.models import Entities
from products.models import Products
from retailers.models import RetailerReceipts, CustomerOrderItems, OutOfStock, RetailerOrders, RetailerOrderItems
from wholesalers.models import WholesalerReceipts, WholesalerPriceDiscounts, WholesalerQuantityDiscounts


def get_entity_interacted_products(owner):
    """Gathers all unique Products that this Entity owner has ever interacted with."""
    r_ids = RetailerReceipts.objects.filter(owner=owner, is_active="true").values_list('product_id', flat=True)
    o_ids = OutOfStock.objects.filter(owner=owner, is_ordered="false").values_list('product_id', flat=True)
    return Products.objects.filter(id__in=set(list(r_ids) + list(o_ids)), active=True)

def calculate_single_product_metrics(product, owner, total_horizon_days, horizon_expiry_threshold, history_cutoff, max_shelf_days, lookback):
    """Aggregates shelf metrics, expiration calculations, and logs anomalies for one product."""
    today = datetime.date.today()
    factor = int(product.units_per_pack) if product.units_per_pack else 1
    
    p_stock = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true").aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    
    # Updated reference to use horizon_expiry_threshold
    e_stock = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true", expiry_date__isnull=False, expiry_date__lte=horizon_expiry_threshold, expiry_date__gte=today).aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    usable_stock = max(0, p_stock - e_stock)
    
    o_date = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true").aggregate(o=Min('created'))['o']
    age, overstayed = 0, False
    if o_date:
        if isinstance(o_date, datetime.datetime): 
            o_date = o_date.date()
        age = (today - o_date).days
        overstayed = age >= max_shelf_days # Updated to match max_shelf_days
        
    # Updated reference to use history_cutoff
    sold = CustomerOrderItems.objects.filter(retailer_receipt__owner=owner, retailer_receipt__product=product, customer_order__status__in=["COMPLETED", "DELIVERED"], customer_order__created__date__gte=history_cutoff).aggregate(t=Sum('purchased_quantity'))['t'] or 0
    ads = Decimal(sold) / Decimal(lookback)
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

def find_wholesaler_procurement_offers(product, packs, today):
    """Scans the live wholesale catalog to match active multi-tier vendor promotions."""
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
                
                if 0 < packs < q.limit_quantity:
                    hint = f"Upsell Hint: Increase your order by {q.limit_quantity - packs} Packs to unlock {q.awarded_quantity} free Packs!"
                    target = q.limit_quantity
                elif packs >= q.limit_quantity:
                    hint = f"Deal Activated: Your pack order qualifications grant you {(packs // q.limit_quantity) * q.awarded_quantity} free Packs!"
                    target = packs
                else:
                    hint = "No adjustments needed."
                    target = packs
                    
                proc_opts.append({
                    "limit_quantity_tier": q.limit_quantity, 
                    "awarded_quantity": q.awarded_quantity, 
                    "predicted_requirement_packs": packs, 
                    "optimized_recommendation_packs": target, 
                    "action_guidance": hint
                })
        else:
            q_promos.append("No active bulk promotions.")
            proc_opts.append({
                "limit_quantity_tier": 0, 
                "awarded_quantity": 0, 
                "predicted_requirement_packs": packs, 
                "optimized_recommendation_packs": packs, 
                "action_guidance": "No adjustments needed."
            })
            
        if packs > 0 or p_disc or q_discs.exists():
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


def group_checkout_items_by_wholesaler(items):
    groups = defaultdict(list)
    ignored = 0
    
    for entry in items:
        try: 
            qty = int(entry.get('purchased_quantity', 0))
        except (TypeError, ValueError): 
            raise ValidationError("purchased_quantity must be a valid whole integer.")
            
        # 🟢 FIX 1 & 2: Restored standard conditional loop check criteria
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


def create_retailer_order_group(retailer_entity, wholesaler_id, grouped_items, validated_data, request_user):
    """
    Creates a single parent RetailerOrders record per wholesaler and appends its child line items.
    All operational terms and types are omitted here to be selected later at payment.
    """
    wholesaler_entity = Entities.objects.get(id=wholesaler_id)
    
    # 🟢 REMOVED: order_terms, order_type, and delivery_method are gone
    parent_order = RetailerOrders.objects.create(
        retailer=retailer_entity,
        wholesaler=wholesaler_entity,
        status='SUBMITTED',
        order_origin='RETAILER',
        owner=request_user
    )

    gross_total, discount_total, final_total = Decimal('0.00'), Decimal('0.00'), Decimal('0.00')

    for record in grouped_items:
        receipt = record['w_receipt']
        quantity = record['purchased_quantity']
        
        base_price = receipt.unit_selling_price
        
        if receipt.final_unit_selling_price > 0:
            final_unit_price = receipt.final_unit_selling_price
        else:
            final_unit_price = base_price
            
        unit_discount = receipt.discount_unit_selling_price

        line_price_total = base_price * Decimal(quantity)
        line_final_total = final_unit_price * Decimal(quantity)
        line_discount_total = unit_discount * Decimal(quantity)
        
        gross_total += line_price_total
        discount_total += line_discount_total
        final_total += line_final_total

        RetailerOrderItems.objects.create(
            retailer_order=parent_order,
            wholesaler_receipt=receipt,
            purchased_quantity=quantity,
            total_quantity=quantity,
            item_price=base_price,
            item_price_total=line_price_total,
            item_final_price=final_unit_price,
            item_final_price_total=line_final_total,
            item_price_discount=unit_discount,
            item_price_discount_total=line_discount_total,
            unit_of_issue=receipt.unit_of_receipt,
            owner=request_user
        )

        receipt.current_unit_quantity -= quantity
        receipt.save(update_fields=['current_unit_quantity'])

        OutOfStock.objects.filter(product=receipt.product, owner=request_user, is_ordered="false").update(is_ordered="true")

    parent_order.order_gross_price_total = gross_total
    parent_order.order_discount_total = discount_total
    parent_order.final_price = final_total
    parent_order.final_price_total = final_total
    parent_order.save(update_fields=['order_gross_price_total', 'order_discount_total', 'final_price', 'final_price_total'])

    return {
        "retailer_order_id": parent_order.id,
        "wholesaler_title": wholesaler_entity.title,
        "final_price_total": float(parent_order.final_price_total)
    }

