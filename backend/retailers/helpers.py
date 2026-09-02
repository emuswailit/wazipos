import datetime
import math
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Min
from rest_framework.exceptions import ValidationError

from products.models import Products
from retailers.models import RetailerReceipts, CustomerOrderItems, OutOfStock, RetailerIndent, RetailerIndentItem
from wholesalers.models import WholesalerReceipts, WholesalerPriceDiscounts, WholesalerQuantityDiscounts
import datetime
import math
from decimal import Decimal
from django.db.models import Sum, Min
from rest_framework.exceptions import ValidationError





def find_wholesaler_procurement_offers(product, final_quantity_units, today):
    """Scans live wholesale promotions catalog matching unit parameters directly."""
    # 🚀 FIX: Inlined wholesale model lookups directly here to reveal the namespace to Python cleanly
    from wholesalers.models import WholesalerReceipts, WholesalerPriceDiscounts

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




# retailers/helpers.py
import datetime
from decimal import Decimal
from django.db.models import Sum, Min

# 🚀 FIX: Move model lookups inside functions to completely bypass circular import locks
def get_entity_interacted_products(owner):
    """Gathers all unique Products that this Entity owner has ever interacted with."""
    from products.models import Products
    from retailers.models import RetailerReceipts, OutOfStock

    r_ids = RetailerReceipts.objects.filter(owner=owner, is_active="true").values_list('product_id', flat=True)
    o_ids = OutOfStock.objects.filter(owner=owner, is_ordered="false").values_list('product_id', flat=True)
    return Products.objects.filter(id__in=set(list(r_ids) + list(o_ids)), active=True)


def calculate_single_product_metrics(product, owner, total_horizon_days, horizon_expiry_threshold, history_cutoff, max_shelf_days, lookback_days):
    """Aggregates shelf metrics, expiration calculations, and logs anomalies for one product."""
    from retailers.models import RetailerReceipts, CustomerOrderItems, OutOfStock

    today = datetime.date.today()
    p_stock = RetailerReceipts.objects.filter(owner=owner, product=product, is_active="true").aggregate(t=Sum('current_unit_quantity'))['t'] or 0
    # ... keep rest of function body identical ...

def sync_or_create_active_indent(entity, user, v):
    """
    Locates or atomic-initializes the active open draft indent document header.
    Automatically synchronizes all four parameter coefficients directly onto the DB entry row.
    """
    with transaction.atomic():
        active_indent = RetailerIndent.objects.filter(
            entity=entity,
            owner=user,
            is_open="true"
        ).first()

        if active_indent:
            active_indent.order_days = int(v['days_to_order'])
            active_indent.lead_time = int(v['lead_time_days'])
            active_indent.lookback_days = int(v.get('lookback_window', 30))
            active_indent.max_shelf_days = int(v.get('max_shelf_days', 90))
            active_indent.save()
        else:
            active_indent = RetailerIndent.objects.create(
                entity=entity,
                owner=user,
                order_days=int(v['days_to_order']),
                lead_time=int(v['lead_time_days']),
                lookback_days=int(v.get('lookback_window', 30)),
                max_shelf_days=int(v.get('max_shelf_days', 90)),
                is_open="true"
            )
        
        # Flush out stale child rows before running fresh calculation overlays
        RetailerIndentItem.objects.filter(retailer_indent=active_indent, entity=entity).delete()
        return active_indent


def rebuild_indent_item_row(entity, user, active_indent, product, final_quantity_units, unit_cost, proposed_offers, today):
    """
    Atomic item synchronizer that logs individual rows under the active parent indent header,
    mapping target wholesale catalogs and matching promotional discount structures dynamically.
    """
    if final_quantity_units <= 0:
        return None

    target_receipt = None
    p_disc = None
    q_disc = None
    
    if proposed_offers:
        try:
            target_receipt = WholesalerReceipts.objects.get(id=proposed_offers["wholesaler_receipt_id"])
            p_disc = WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=target_receipt, is_active="true", start__lte=today, end__gte=today).first()
            q_disc = WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=target_receipt, is_active="true", start__lte=today, end__gte=today).first()
        except WholesalerReceipts.DoesNotExist:
            pass

    gross_subtotal = Decimal(final_quantity_units) * Decimal(unit_cost)

    return RetailerIndentItem.objects.create(
        entity=entity,
        owner=user,
        retailer_indent=active_indent,
        wholesale_receipt=target_receipt,
        wholesaler_price_discount=p_disc,
        wholesaler_quantity_discount=q_disc,
        predicted_purchase_units=final_quantity_units,
        final_pack_price=unit_cost,
        item_gross_total_amount=gross_subtotal,
        item_net_total_amount=gross_subtotal
    )
