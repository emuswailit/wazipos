"""
DB-writing services for the inventory prediction pipeline.

Reads live in `retailers/helpers.py`. Anything that mutates
the database belongs here, so the write path is easy to find
and easy to reason about.
"""

from decimal import Decimal

from django.db import transaction


# =========================================================
# Persist a single indent item
# =========================================================

def persist_prediction_item(
    entity, user, indent, prediction, today,
    lead_days, lead_var, lead_source,
):
    """
    Create a RetailerIndentItem from a prediction dict.

    The model's recalculate() derives every pricing field
    (final_supplier_unit_selling_price, total_quantity,
    bonus_*, profit_estimate). The caller supplies only the
    inputs.

    Returns the created item, or None if the prediction has no
    usable product / quantity / supplier.
    """
    from products.models import Products
    from retailers.helpers import (
        resolve_active_price_discount,
        resolve_active_quantity_discount,
    )
    from retailers.models import (
        IndentItemSource,
        RetailerIndentItem,
    )
    from wholesalers.models import WholesalerReceipts

    product_id = prediction.get("product_id")
    if not product_id:
        return None

    product = Products.objects.filter(id=product_id).first()
    if not product:
        return None

    suggestion = prediction.get("order_suggestion", {})
    supplier_info = suggestion.get("supplier", {})

    quantity = int(suggestion.get("suggested_order_quantity", 0) or 0)
    if quantity <= 0:
        return None

    # Resolve the receipt the suggestion targeted, if any. The
    # prediction payload carries the supplier id, not the receipt
    # id, so we re-resolve here.
    target_receipt = None
    supplier_id = supplier_info.get("id")
    if supplier_id:
        target_receipt = (
            WholesalerReceipts.objects
            .filter(
                product=product,
                received_from_id=supplier_id,
                current_unit_quantity__gt=0,
            )
            .order_by("final_unit_selling_price")
            .first()
        )

    p_disc = resolve_active_price_discount(target_receipt, today)
    q_disc = resolve_active_quantity_discount(
        target_receipt, quantity, today,
    )

    item = RetailerIndentItem(
        entity=entity,
        owner=user,
        retailer_indent=indent,
        wholesale_receipt=target_receipt,
        wholesaler_price_discount=p_disc,
        wholesaler_quantity_discount=q_disc,
        required_quantity=quantity,
        source=IndentItemSource.PREDICTION,
        lead_time_days=lead_days,
        lead_time_variance_days=lead_var,
        lead_time_source=lead_source,
    )
    item.recalculate()
    item.save(recalculate=False)
    return item


# =========================================================
# Sync the indent
# =========================================================

def sync_prediction_indent(
    entity, user, indent, cycle_days, compiled, today,
):
    """
    Replace PREDICTION-sourced items on the indent with the
    current run's items, then roll up header totals.

    Steps:
      1. Set the indent's cycle length.
      2. Delete all existing PREDICTION-sourced items.
      3. Apply the budget filter to the compiled predictions.
      4. Persist each included prediction as an indent item.
      5. Recalculate header totals (the model owns the rollup).
      6. Assemble a budget summary dict for the payload.

    Returns (indent, budget_info).
    """
    from retailers.helpers import apply_budget
    from retailers.models import (
        IndentItemSource,
        RetailerIndentItem,
    )

    with transaction.atomic():
        indent.order_days = cycle_days
        indent.save(update_fields=["order_days", "updated"])

        RetailerIndentItem.objects.filter(
            retailer_indent=indent,
            entity=entity,
            source=IndentItemSource.PREDICTION,
        ).delete()

        budget_amount = (
            Decimal(str(indent.budget_amount))
            if indent.budget_amount else None
        )
        budget_enforced = indent.budget_enforced == "true"

        included, excluded = apply_budget(
            compiled, budget_amount, budget_enforced,
        )

        for p in included:
            metrics = p.get("calculated_metrics", {})
            persist_prediction_item(
                entity=entity,
                user=user,
                indent=indent,
                prediction=p,
                today=today,
                lead_days=metrics.get("supplier_lead_time_days", 0),
                lead_var=metrics.get("supplier_delay_days", 0),
                lead_source=metrics.get(
                    "supplier_lead_time_source", "default",
                ),
            )

        indent.recalculate()

        total_cost = Decimal(str(indent.total_cost or 0))
        total_revenue = Decimal(str(indent.total_revenue or 0))
        total_profit = Decimal(str(indent.total_profit or 0))

        budget_info = None
        if budget_amount is not None:
            budget_info = {
                "amount": float(budget_amount),
                "enforced": budget_enforced,
                "used": float(total_cost),
                "remaining": float(
                    max(Decimal("0"), budget_amount - total_cost)
                ),
                "over_budget": total_cost > budget_amount,
                "included_count": len(included),
                "excluded_count": len(excluded),
                "projected_revenue": float(total_revenue),
                "projected_profit": float(total_profit),
            }

    return indent, budget_info

def finalize_order_items(order, received=True):
    """
    Set is_received on all of an order's items.

    Call this from wherever `order.status` transitions to a
    terminal state (RECEIVED, COMPLETED, CANCELLED).

    received=True  → mark as received (default for RECEIVED/COMPLETED)
    received=False → leave unreceived (for CANCELLED; the items
                     never arrived, but the order is closed so the
                     pipeline should stop treating them as pending)
    """
    from retailers.models import RetailerOrderItems

    flag = "true" if received else "false"
    RetailerOrderItems.objects.filter(
        retailer_order=order,
    ).update(is_received=flag)