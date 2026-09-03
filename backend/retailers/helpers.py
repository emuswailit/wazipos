import datetime
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Min

def get_entity_interacted_products(owner):
    from products.models import Products
    from retailers.models import RetailerReceipts, OutOfStock, RetailerOrderItems
    r_ids = RetailerReceipts.objects.filter(owner=owner).values_list('product_id', flat=True)
    o_ids = OutOfStock.objects.filter(owner=owner, is_ordered="false").values_list('product_id', flat=True)
    interacted_product_ids = set(list(r_ids) + list(o_ids))
    active_ordered_product_ids = RetailerOrderItems.objects.filter(retailer_order__owner=owner, is_received="false").values_list('wholesale_receipt__product_id', flat=True)
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
            q_disc = WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=target_receipt, is_active="true", min_quantity__lte=final_quantity_units).order_by('-min_quantity').first()
        except WholesalerReceipts.DoesNotExist: pass
    final_pack_price = base_unit_price - (base_unit_price * Decimal(str(p_disc.percent)) / Decimal('100.00')) if p_disc else base_unit_price
    item_gross_total_amount = Decimal(str(final_quantity_units)) * base_unit_price
    item_net_total_amount = Decimal(str(final_quantity_units)) * final_pack_price
    if q_disc: total_quantity = final_quantity_units + int((final_quantity_units / q_disc.purchase_trigger) * q_disc.bonus_quantity)
    return RetailerIndentItem.objects.create(entity=entity, owner=user, retailer_indent=active_indent, wholesaler_receipt=target_receipt, wholesaler_price_discount=p_disc, wholesaler_quantity_discount=q_disc, required_quantity=final_quantity_units, total_quantity=total_quantity, final_pack_price=final_pack_price, item_gross_total_amount=item_gross_total_amount, item_net_total_amount=item_net_total_amount, indenting_criteria="VELOCITY_RUNWAY")
