# wholesalers/services/commit_order.py

"""
Commit a retailer order, locking inventory.

The wholesaler marks the order committed with a commit_type:
  - CASH: paid upfront
  - CREDIT: credit terms approved
  - PLACEMENT: consignment
  - FACILITY: financed by a third party

On commit:
  - Receipts are locked (select_for_update)
  - Availability is verified per line
  - current_unit_quantity is decremented
  - The order is marked committed
  - The post_save signal on WholesalerReceipts rebalances other pending offers
"""

from django.db import transaction
from django.utils import timezone

from wholesalers.models import (
    RetailerOrders,
    WholesalerReceipts,
)


VALID_COMMIT_TYPES = {"CASH", "CREDIT", "PLACEMENT", "FACILITY"}

VALID_PRECOMMIT_STATUSES = {"SUBMITTED", "PROCESSING", "APPROVED"}


@transaction.atomic
def commit_order(
    order: RetailerOrders,
    commit_type: str,
    by_user,
    note: str = "",
) -> RetailerOrders:
    """
    Commit a retailer order, reserving inventory.

    Raises ValueError on any precondition failure.
    """
    if commit_type not in VALID_COMMIT_TYPES:
        raise ValueError(
            f"Invalid commit_type {commit_type!r}. "
            f"Must be one of {sorted(VALID_COMMIT_TYPES)}."
        )

    if order.is_committed == "true":
        raise ValueError("Order is already committed.")

    if order.status not in VALID_PRECOMMIT_STATUSES:
        raise ValueError(
            f"Cannot commit order in status {order.status}."
        )

    items = list(
        order.retailer_order
        .select_related("wholesaler_receipt")
    )

    if not items:
        raise ValueError("Order has no items.")

    # Sort receipt IDs to prevent deadlocks between concurrent commits
    receipt_ids = sorted({
        item.wholesaler_receipt_id
        for item in items
        if item.wholesaler_receipt_id
    })

    locked_receipts = {}
    for rid in receipt_ids:
        receipt = (
            WholesalerReceipts.objects
            .select_for_update()
            .get(id=rid)
        )
        locked_receipts[rid] = receipt

    # Verify availability per line
    for item in items:
        if not item.wholesaler_receipt_id:
            raise ValueError(
                f"Item {item.id} has no wholesaler receipt attached."
            )
        receipt = locked_receipts[item.wholesaler_receipt_id]
        need = int(item.purchased_quantity or 0)
        have = int(receipt.current_unit_quantity or 0)
        if have < need:
            raise ValueError(
                f"Receipt {receipt.id} has only {have} units available "
                f"but {need} are needed."
            )

    # Decrement receipts. The signal on WholesalerReceipts fires after each
    # save and rebalances other pending offers against the same receipt.
    for item in items:
        receipt = locked_receipts[item.wholesaler_receipt_id]
        receipt.current_unit_quantity = (
            (receipt.current_unit_quantity or 0)
            - int(item.purchased_quantity or 0)
        )
        receipt.save(update_fields=["current_unit_quantity"])

    # Mark the order
    now = timezone.now()
    order.is_committed = "true"
    order.commit_type = commit_type
    order.committed_at = now
    order.committed_by_entity = (
        by_user.entity if by_user and getattr(by_user, "entity_id", None) else None
    )
    order.committed_by_user = by_user
    order.commit_note = note

    if order.status == "SUBMITTED":
        order.status = "APPROVED"
        order.is_approved = "true"
        order.approved_at = now
        order.approved_by = by_user

    order.save()

    return order