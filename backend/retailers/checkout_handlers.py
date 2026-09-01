from decimal import Decimal
from collections import defaultdict
from rest_framework.exceptions import ValidationError

# --- Core Model Dependencies ---
from authentication.models import Entities
from retailers.models import RetailerOrders, RetailerOrderItems, OutOfStock
from wholesalers.models import WholesalerReceipts


def group_checkout_items_by_wholesaler(items_data):
    """
    Groups checkout entries by Wholesaler ID.
    Rigorously validates integer type conversions and ignores zero-quantity recommendations.
    """
    wholesaler_groups = defaultdict(list)
    ignored_items_count = 0

    for entry in items_data:
        try:
            quantity = int(entry.get('purchased_quantity', 0))
        except (TypeError, ValueError):
            raise ValidationError("purchased_quantity must be a valid whole integer.")
        
        # Standard structural check (completely replacing the broken line)
        # 🟢 THE CORRECT FIXED CHECK:
        # Check if an offer price has been populated on the wholesale batch
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
        "order_terms": parent_order.order_terms,
        "final_price_total": float(parent_order.final_price_total)
    }
