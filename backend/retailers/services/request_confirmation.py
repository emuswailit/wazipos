# retailers/services/request_confirmation.py

"""
Retailer confirms or declines offers on a product request.

Commitment path
---------------
The indent is the sole commitment path. Confirming an offer
produces a RetailerIndentItem on the retailer's open indent. No
order is created here — the indent → order conversion belongs to
the ordering flow.

Offer status
------------
  OFFERED                → wholesaler submitted, awaiting retailer
  CONFIRMED              → retailer confirmed; indent item exists
  DECLINED_BY_RETAILER   → retailer declined
  DECLINED_BY_WHOLESALER → wholesaler refused the line
  WITHDRAWN / CANCELLED  → retired by the wholesaler or system
  FULFILLED              → downstream order created from the indent

Confirming leaves an offer at CONFIRMED. FULFILLED is set by the
downstream flow that converts the indent into an order.

Transaction shape
-----------------
The whole service runs in a single `transaction.atomic()` block.

Validation happens in a staging pass before any write. On any
validation failure the function raises ValueError and the
transaction rolls back with no partial state. This replaces the
prior implementation, which wrote a WITHDRAWN status and then
raised inside the same transaction — silently rolling the write
back.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from authentication.models import Entities
from retailers.models import (
    IndentItemSource,
    RetailerIndent,
    RetailerIndentItem,
    RetailerProductRequestItem,
    RetailerProductRequestOffer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result object
# ---------------------------------------------------------------------------

@dataclass
class ConfirmationResult:
    """
    Outcome of a confirm/decline batch.

    `items_added` counts new RetailerIndentItems created by this call.
    `items_already_present` counts offers that already had an indent
    item (idempotent re-confirmation). `indent_id` is None when the
    batch had no confirmations.
    """

    indent_id: str | None = None
    created_new_indent: bool = False
    confirmed_offer_count: int = 0
    declined_offer_count: int = 0
    items_added: int = 0
    items_already_present: int = 0
    # Diagnostic list of (offer_id, reason) pairs for offers that were
    # staged but skipped. Currently always empty because the service
    # is all-or-nothing; present so future partial-success behavior
    # can populate it without changing the return shape.
    skipped: list[tuple[str, str]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _lock_or_create_open_indent(entity_id, *, owner):
    """
    Return (indent, created) for the entity's open indent.

    Concurrency: `select_for_update()` on a filter that matches zero
    rows locks nothing, so two concurrent calls for the same entity
    with no open indent would both create one. Locking the entity
    row first serialises the read-then-create.
    """
    Entities.objects.select_for_update().filter(pk=entity_id).first()

    indent = (
        RetailerIndent.objects
        .select_for_update()
        .filter(entity_id=entity_id, is_open="true")
        .order_by("-created")
        .first()
    )
    if indent is not None:
        return indent, False

    return (
        RetailerIndent.objects.create(
            entity_id=entity_id,
            is_open="true",
            owner=owner,
        ),
        True,
    )


def _stage_confirmations(request_obj, confirmations, note):
    """
    Validate every confirmation entry against the request and return
    a list of (offer, response_note) tuples ready to write.

    Raises ValueError on any invalid entry. No DB writes.
    """
    staged: list[tuple[RetailerProductRequestOffer, str]] = []

    for payload in confirmations or []:
        offer_id = payload.get("offer_id")
        if not offer_id:
            raise ValueError("Each confirmation requires offer_id.")

        offer = (
            RetailerProductRequestOffer.objects
            .select_related("request_item", "wholesaler_receipt")
            .filter(id=offer_id)
            .first()
        )
        if offer is None:
            raise ValueError(f"Offer {offer_id} not found.")
        if offer.request_item.request_id != request_obj.id:
            raise ValueError(f"Offer {offer.id} is not on this request.")
        if offer.status != RetailerProductRequestOffer.Status.OFFERED:
            raise ValueError(
                f"Offer {offer.id} is not in OFFERED state "
                f"(currently {offer.status})."
            )

        receipt = offer.wholesaler_receipt
        if receipt is None:
            raise ValueError(f"Offer {offer.id} has no receipt attached.")

        qty = offer.offered_quantity or 0
        if qty <= 0:
            raise ValueError(
                f"Offer {offer.id} has a non-positive quantity ({qty})."
            )
        if (receipt.current_unit_quantity or 0) < qty:
            # All-or-nothing: the batch fails cleanly and can be
            # resubmitted after the wholesaler adjusts the offer. The
            # offer is deliberately NOT marked WITHDRAWN here — that
            # write would be rolled back by the raise anyway, and it
            # isn't the retailer's call to make.
            raise ValueError(
                f"Offer {offer.id} no longer available — only "
                f"{receipt.current_unit_quantity} units remain, "
                f"but {qty} were offered."
            )

        staged.append(
            (offer, payload.get("response_note") or note or "")
        )

    return staged


def _stage_declinations(request_obj, declinations, note):
    """
    Validate every declination entry and return a list of
    (offer, reason) tuples ready to write. No DB writes.
    """
    staged: list[tuple[RetailerProductRequestOffer, str]] = []

    for payload in declinations or []:
        offer_id = payload.get("offer_id")
        if not offer_id:
            raise ValueError("Each declination requires offer_id.")

        offer = (
            RetailerProductRequestOffer.objects
            .select_related("request_item")
            .filter(id=offer_id)
            .first()
        )
        if offer is None:
            raise ValueError(f"Offer {offer_id} not found.")
        if offer.request_item.request_id != request_obj.id:
            raise ValueError(f"Offer {offer.id} is not on this request.")
        if offer.status != RetailerProductRequestOffer.Status.OFFERED:
            raise ValueError(
                f"Offer {offer.id} is not in OFFERED state "
                f"(currently {offer.status})."
            )

        staged.append(
            (offer, payload.get("reason") or note or "")
        )

    return staged


def _enforce_oversell_guard(staged_confirms):
    """
    Reject the batch if any line's confirmed total (existing +
    staged) would exceed `requested_quantity`.

    Scoped to touched lines only so a 100-line request does not pay
    100 aggregates per call. Runs before any write.
    """
    staged_by_line: dict[str, int] = {}
    for offer, _ in staged_confirms:
        staged_by_line[offer.request_item_id] = (
            staged_by_line.get(offer.request_item_id, 0)
            + (offer.offered_quantity or 0)
        )

    if not staged_by_line:
        return

    lines_by_id = {
        line.id: line
        for line in (
            RetailerProductRequestItem.objects
            .filter(id__in=staged_by_line.keys())
            .select_related("product")
        )
    }

    for line_id, staged_qty in staged_by_line.items():
        line = lines_by_id.get(line_id)
        if line is None:
            # Line was deleted between staging and guard. Skip; the
            # FK write will fail naturally if anything references it.
            continue

        existing = int(
            line.offers
            .filter(status__in=[
                RetailerProductRequestOffer.Status.CONFIRMED,
                RetailerProductRequestOffer.Status.FULFILLED,
            ])
            .aggregate(total=Sum("offered_quantity"))["total"] or 0
        )
        projected = existing + staged_qty
        if projected > line.requested_quantity:
            raise ValueError(
                f"Line {line.id} ({line.product.title}): "
                f"confirming {staged_qty} more would total "
                f"{projected}, exceeding requested "
                f"{line.requested_quantity}."
            )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

@transaction.atomic
def retailer_confirm_offers(
    request_obj,
    confirmations,
    declinations,
    note: str = "",
    *,
    by_user,
):
    """
    Apply a retailer's confirm / decline decisions to a request.

    Parameters
    ----------
    request_obj : RetailerProductRequest
        The request being acted on. Must already belong to the caller's
        entity — the caller is responsible for that ownership check.
    confirmations : list[{"offer_id": str, "response_note": str|None}]
    declinations : list[{"offer_id": str, "reason": str|None}]
    note : str
        Free-text batch note. Used as the fallback for per-entry
        response_note / reason when those are blank.
    by_user : Users
        Required keyword-only. Used for `RetailerIndent.owner` and
        `RetailerIndentItem.owner`.

    Returns
    -------
    ConfirmationResult

    Raises
    ------
    ValueError
        On any validation failure. The whole service runs in a single
        transaction, so a raise rolls back every write — no partial
        state.
    """
    if by_user is None:
        raise ValueError("by_user is required to confirm offers.")

    now = timezone.now()

    # ------------------------------------------------------------------
    # 1. Stage — validate everything before touching the DB.
    # ------------------------------------------------------------------
    staged_confirms = _stage_confirmations(
        request_obj, confirmations, note,
    )
    staged_declines = _stage_declinations(
        request_obj, declinations, note,
    )

    # ------------------------------------------------------------------
    # 2. Oversell guard — before any write.
    # ------------------------------------------------------------------
    _enforce_oversell_guard(staged_confirms)

    # ------------------------------------------------------------------
    # 3. Apply the staged decisions. Offers stay at CONFIRMED after a
    #    confirm; FULFILLED is set later by the downstream flow that
    #    converts the indent item into an order.
    # ------------------------------------------------------------------
    for offer, response_note in staged_confirms:
        offer.status = RetailerProductRequestOffer.Status.CONFIRMED
        offer.retailer_confirmed_at = now
        offer.retailer_response_note = response_note
        # refresh_parent=False so we don't recompute the item and the
        # request once per offer; we do it once below.
        offer.save(
            update_fields=[
                "status",
                "retailer_confirmed_at",
                "retailer_response_note",
                "updated",
            ],
        )

    for offer, reason in staged_declines:
        offer.status = (
            RetailerProductRequestOffer.Status.DECLINED_BY_RETAILER
        )
        offer.retailer_confirmed_at = now
        offer.retailer_response_note = reason
        offer.save(
            update_fields=[
                "status",
                "retailer_confirmed_at",
                "retailer_response_note",
                "updated",
            ],
        )

    result = ConfirmationResult(
        confirmed_offer_count=len(staged_confirms),
        declined_offer_count=len(staged_declines),
    )

    # ------------------------------------------------------------------
    # 4. Indent assembly — only when there is at least one
    #    confirmation. A pure-declination batch skips this entirely.
    # ------------------------------------------------------------------
    if staged_confirms:
        indent, created_new_indent = _lock_or_create_open_indent(
            request_obj.entity_id, owner=by_user,
        )
        result.indent_id = str(indent.id)
        result.created_new_indent = created_new_indent

        for offer, _ in staged_confirms:
            _, created = RetailerIndentItem.objects.get_or_create(
                retailer_indent=indent,
                product_request_offer=offer,
                defaults={
                    "entity_id": request_obj.entity_id,
                    "source": IndentItemSource.PRODUCT_REQUEST,
                    "product_request": request_obj,
                    "wholesale_receipt": offer.wholesaler_receipt,
                    "required_quantity": offer.offered_quantity,
                    "total_quantity": offer.offered_quantity,
                    "supplier_unit_selling_price": offer.offered_unit_price,
                    "final_supplier_unit_selling_price": (
                        offer.offered_unit_price
                    ),
                    "manufacture_date": offer.manufacture_date,
                    "expiry_date": offer.expiry_date,
                    "owner": by_user,
                },
            )
            if created:
                result.items_added += 1
            else:
                result.items_already_present += 1

        indent.recalculate(save=True)

    # ------------------------------------------------------------------
    # 5. Roll up touched lines, then the request.
    #    `refresh_parent=False` on the item save keeps this to a single
    #    aggregate query on the request rather than one per line.
    # ------------------------------------------------------------------
    touched_line_ids = (
        {offer.request_item_id for offer, _ in staged_confirms}
        | {offer.request_item_id for offer, _ in staged_declines}
    )
    for line in (
        RetailerProductRequestItem.objects
        .filter(id__in=touched_line_ids)
    ):
        # Item.save() with refresh_parent=False skips the per-item
        # parent recalc. We recompute the request once below.
        line.save(refresh_parent=False)

    request_obj.recalculate(save=True)

    logger.info(
        "retailer_confirm_offers: request=%s confirmed=%s declined=%s "
        "indent=%s items_added=%s items_existing=%s",
        request_obj.pk,
        result.confirmed_offer_count,
        result.declined_offer_count,
        result.indent_id,
        result.items_added,
        result.items_already_present,
    )

    return result