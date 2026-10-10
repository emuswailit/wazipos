# wholesalers/utils/return_utils.py

from django.db.models import Q

from retailers.models import RetailerReceipts
from wholesalers.models import WholesalerReceiptReturns
from wholesalers.services.return_management import (
    accept_return as accept_return_service,
    reject_return as reject_return_service,
    cancel_return as cancel_return_service,
)
from retailers.services.wholesaler_return import (
    initiate_wholesaler_return as initiate_return_service,
)


# =====================================================================
# Internal helpers
# =====================================================================

def _scoped_returns(user):
    """
    Base queryset for returns, scoped to the user's entity.

    - Platform staff: unrestricted.
    - Everyone else: returns where the user's entity is either the
      wholesaler or the retailer.
    """
    qs = WholesalerReceiptReturns.objects.select_related(
        "product",
        "retailer_entity", "wholesaler_entity",
        "wholesaler_receipt", "retailer_receipt",
        "retailer_order", "retailer_order_item",
        "initiating_adjustment",
    )
    if user.is_staff:
        return qs

    entity_id = getattr(user, "entity_id", None)
    if not entity_id:
        return qs.none()

    return qs.filter(
        Q(wholesaler_entity_id=entity_id) | Q(retailer_entity_id=entity_id)
    )


def _get_return_or_none(return_id, user):
    """Fetch a scoped return by ID. Returns (obj, errors)."""
    if not return_id:
        return None, {"return_id": "This field is required."}
    try:
        ret = _scoped_returns(user).get(pk=return_id)
    except WholesalerReceiptReturns.DoesNotExist:
        return None, {"return_id": "Return not found."}
    return ret, {}


def _is_wholesaler_side(user, ret):
    return user.is_staff or ret.wholesaler_entity_id == getattr(
        user, "entity_id", None
    )


def _is_party(user, ret):
    if user.is_staff:
        return True
    entity_id = getattr(user, "entity_id", None)
    return entity_id in (ret.wholesaler_entity_id, ret.retailer_entity_id)


# =====================================================================
# Lifecycle actions
# =====================================================================

def initiate_return(data, user):
    """
    Retailer-initiated return.

    Payload:
    {
        "action": "InitiateReturn",
        "retailer_receipt": "<uuid>",
        "quantity": <int>,
        "reason": "<enum: EXPIRED | NEAR_EXPIRY | DAMAGED | WRONG_ITEM |
                          SHORT_DATED | QUALITY | OVER_ORDERED | RECALL | OTHER>",
        "justification": "<string max 256>",
        "return_type": "<enum: REFUND | EXCHANGE | REPLACEMENT>",   # optional
        "unit_price_refunded": "<decimal>",                          # optional
        "restocking_fee_percent": "<decimal 0-100>"                  # optional
    }

    Creates both records atomically via the service:
      - StockAdjustments (retailer ledger decrement)
      - WholesalerReceiptReturns (wholesaler queue, status=PENDING)

    No stock moves on accept/reject beyond what initiate already did.
    """
    errors = {}

    receipt_id = data.get("retailer_receipt")
    quantity = data.get("quantity")
    reason = data.get("reason")
    justification = data.get("justification")

    if not receipt_id:
        errors["retailer_receipt"] = "This field is required."
    if not quantity:
        errors["quantity"] = "This field is required."
    if not reason:
        errors["reason"] = "This field is required."
    if not justification:
        errors["justification"] = "This field is required."

    if errors:
        return errors, None

    try:
        receipt = RetailerReceipts.objects.get(pk=receipt_id)
    except RetailerReceipts.DoesNotExist:
        return {"retailer_receipt": "Receipt not found."}, None

    if not user.is_staff and receipt.entity_id != getattr(user, "entity_id", None):
        return {"retailer_receipt": "Receipt does not belong to your entity."}, None

    try:
        ret = initiate_return_service(
            retailer_receipt=receipt,
            quantity=int(quantity),
            reason=reason,
            justification=justification,
            return_type=data.get("return_type", "REFUND"),
            unit_price_refunded=data.get("unit_price_refunded"),
            restocking_fee_percent=data.get("restocking_fee_percent"),
            by_user=user,
        )
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None


def get_entity_returns(data, user):
    """
    List returns scoped to the caller's entity.

    Payload:
    {
        "action": "ListReturns",
        "status": "<enum: PENDING | ACCEPTED | REJECTED | CANCELLED>",  # optional
        "reason": "<enum>",                                             # optional
        "return_type": "<enum>",                                        # optional
        "wholesaler_entity": "<uuid>",                                  # optional
        "retailer_entity": "<uuid>",                                    # optional
        "search": "<string>"                                            # optional
    }

    Minimal payload:
    {
        "action": "ListReturns"
    }

    Response is paginated (DRF PageNumberPagination).
    """
    qs = _scoped_returns(user)

    if data.get("status"):
        qs = qs.filter(status=data["status"])
    if data.get("reason"):
        qs = qs.filter(reason=data["reason"])
    if data.get("return_type"):
        qs = qs.filter(return_type=data["return_type"])
    if data.get("wholesaler_entity"):
        qs = qs.filter(wholesaler_entity_id=data["wholesaler_entity"])
    if data.get("retailer_entity"):
        qs = qs.filter(retailer_entity_id=data["retailer_entity"])

    search = data.get("search")
    if search:
        qs = qs.filter(
            Q(product__title__icontains=search)
            | Q(justification__icontains=search)
            | Q(reference_number__icontains=search)
        )

    return qs.order_by("-created")


def get_return_details(data, user):
    """
    Retrieve one return by ID.

    Payload:
    {
        "action": "GetReturnDetails",
        "return_id": "<uuid>"
    }

    Returns (obj, errors). NOTE the inverted tuple order relative to
    the other handlers — matches the dispatcher's unpack for this
    action only.
    """
    return _get_return_or_none(data.get("return_id"), user)


def accept_return(data, user):
    """
    Wholesaler accepts the return.

    Payload:
    {
        "action": "AcceptReturn",
        "return_id": "<uuid>",
        "unit_price_refunded": "<decimal>",            # optional override
        "restocking_fee_percent": "<decimal 0-100>",   # optional override
        "notes": "<string>"                            # optional
    }

    Transitions PENDING -> ACCEPTED. The retailer-side StockAdjustment
    was already written at initiate; accept does not touch it. Any
    wholesaler-side inventory move is written by the service.
    """
    ret, errors = _get_return_or_none(data.get("return_id"), user)
    if errors:
        return errors, None

    if not _is_wholesaler_side(user, ret):
        return {"detail": "Only the receiving wholesaler may accept."}, None

    if ret.status != "PENDING":
        return {
            "status": f"Cannot accept a return in status {ret.status}.",
        }, None

    try:
        ret = accept_return_service(ret, data, user)
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None


def reject_return(data, user):
    """
    Wholesaler rejects the return.

    Payload:
    {
        "action": "RejectReturn",
        "return_id": "<uuid>",
        "reason": "<string>"   # optional
    }

    Transitions PENDING -> REJECTED. No stock move on either side.
    The retailer's initiating adjustment stays in place because the
    goods physically left the retailer. If the wholesaler needs to
    reconcile their own books later, they use the regular manual
    stock-adjustment flow.
    """
    ret, errors = _get_return_or_none(data.get("return_id"), user)
    if errors:
        return errors, None

    if not _is_wholesaler_side(user, ret):
        return {"detail": "Only the receiving wholesaler may reject."}, None

    if ret.status != "PENDING":
        return {
            "status": "Only PENDING returns can be rejected.",
        }, None

    try:
        ret = reject_return_service(ret, data.get("reason", ""), user)
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None


def cancel_return(data, user):
    """
    Cancel a PENDING return. Either party may cancel pre-decision.

    Payload:
    {
        "action": "CancelReturn",
        "return_id": "<uuid>",
        "reason": "<string>"   # optional
    }

    Transitions PENDING -> CANCELLED. The service reverses the
    retailer-side initiating adjustment.
    """
    ret, errors = _get_return_or_none(data.get("return_id"), user)
    if errors:
        return errors, None

    if not _is_party(user, ret):
        return {"detail": "You are not a party to this return."}, None

    if ret.status != "PENDING":
        return {
            "status": "Only PENDING returns can be cancelled.",
        }, None

    try:
        ret = cancel_return_service(ret, data.get("reason", ""), user)
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None