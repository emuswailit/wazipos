# wholesalers/utils/return_utils.py

from datetime import timedelta

from django.db.models import Q, F
from django.utils import timezone

from retailers.models import RetailerReceipts
from wholesalers.models import WholesalerReceiptReturns
from wholesalers.services.return_confirmation import (
    confirm_return as confirm_return_service,
)
from wholesalers.services.return_management import (
    create_return as create_return_service,
    update_return as update_return_service,
    delete_return as delete_return_service,
    reject_return as reject_return_service,
    settle_return as settle_return_service,
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

    Creates both records atomically:
      - StockAdjustments (retailer ledger decrement)
      - WholesalerReceiptReturns (wholesaler queue, PENDING_CONFIRMATION)
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


def create_return(data, user):
    """
    Wholesaler-initiated return.

    Payload:
    {
        "action": "CreateReturn",
        "wholesaler_entity": "<uuid>",
        "retailer_entity": "<uuid>",
        "product": "<uuid>",
        "quantity": <int>,
        "reason": "<enum>",
        "justification": "<string max 256>",
        "retailer_receipt": "<uuid>",        # optional
        "wholesaler_receipt": "<uuid>",      # optional
        "return_type": "<enum>",             # optional
        "unit_price_paid": "<decimal>",      # optional
        "unit_price_refunded": "<decimal>",  # optional
        "restocking_fee_percent": "<decimal>"  # optional
    }
    """
    required = [
        "wholesaler_entity", "retailer_entity", "product",
        "quantity", "reason", "justification",
    ]
    errors = {f: "This field is required." for f in required if not data.get(f)}
    if errors:
        return errors, None

    try:
        ret = create_return_service(data, user)
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None


def get_entity_returns(data, user):
    """
    List returns scoped to the caller's entity.

    Payload:
    {
        "action": "ListReturns",
        "status": "<enum: PENDING_CONFIRMATION | CONFIRMED | SETTLED |
                          REJECTED | CANCELLED>",     # optional
        "reason": "<enum>",                             # optional
        "return_type": "<enum>",                        # optional
        "confirmation_outcome": "<enum: PENDING | TAKE_BACK | WRITE_OFF |
                                         PARTIAL_TAKE_BACK>",  # optional
        "wholesaler_entity": "<uuid>",                  # optional
        "retailer_entity": "<uuid>",                    # optional
        "search": "<string>"                            # optional
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
    if data.get("confirmation_outcome"):
        qs = qs.filter(confirmation_outcome=data["confirmation_outcome"])
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
    """
    return _get_return_or_none(data.get("return_id"), user)


def update_return(data, user):
    """
    Update a PENDING_CONFIRMATION return.

    Payload:
    {
        "action": "UpdateReturn",
        "return_id": "<uuid>",
        "justification": "<string max 256>",           # optional
        "reference_number": "<string max 100>",        # optional
        "return_type": "<enum>",                       # optional
        "unit_price_refunded": "<decimal>",            # optional
        "restocking_fee_percent": "<decimal 0-100>"    # optional
    }

    Only PENDING_CONFIRMATION returns can be edited. Whitelisted fields
    only — any other field is rejected.
    """
    ret, errors = _get_return_or_none(data.get("return_id"), user)
    if errors:
        return errors, None

    if not _is_party(user, ret):
        return {"detail": "You are not a party to this return."}, None

    if ret.status != "PENDING_CONFIRMATION":
        return {
            "status": "Only PENDING_CONFIRMATION returns can be edited.",
        }, None

    try:
        ret = update_return_service(ret, data, user)
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None


def delete_return(data, user):
    """
    Delete a PENDING_CONFIRMATION return.

    Payload:
    {
        "action": "DeleteReturn",
        "return_id": "<uuid>"
    }

    Only PENDING_CONFIRMATION returns. Use CancelReturn for other states.
    """
    ret, errors = _get_return_or_none(data.get("return_id"), user)
    if errors:
        return errors, None

    if not _is_party(user, ret):
        return {"detail": "You are not a party to this return."}, None

    if ret.status != "PENDING_CONFIRMATION":
        return {
            "status": (
                "Only PENDING_CONFIRMATION returns can be deleted. "
                "Use CancelReturn for other states."
            ),
        }, None

    try:
        delete_return_service(ret, user)
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None


# =====================================================================
# State transitions
# =====================================================================

def confirm_return(data, user):
    """
    Wholesaler confirms physical receipt of a return.

    Payload (full take-back):
    {
        "action": "ConfirmReturn",
        "return_id": "<uuid>",
        "outcome": "TAKE_BACK",
        "notes": "<string>"   # optional
    }

    Payload (full write-off):
    {
        "action": "ConfirmReturn",
        "return_id": "<uuid>",
        "outcome": "WRITE_OFF",
        "notes": "<string>"   # optional
    }

    Payload (partial take-back):
    {
        "action": "ConfirmReturn",
        "return_id": "<uuid>",
        "outcome": "PARTIAL_TAKE_BACK",
        "confirmed_quantity": <int>,
        "written_off_quantity": <int>,
        "notes": "<string>"   # optional
    }
    confirmed_quantity + written_off_quantity MUST equal the return's
    total quantity.
    """
    ret, errors = _get_return_or_none(data.get("return_id"), user)
    if errors:
        return errors, None

    if not _is_wholesaler_side(user, ret):
        return {"detail": "Only the receiving wholesaler may confirm."}, None

    if ret.status != "PENDING_CONFIRMATION":
        return {
            "status": f"Cannot confirm a return in status {ret.status}.",
        }, None

    outcome = data.get("outcome")
    if not outcome:
        return {"outcome": "This field is required."}, None

    if outcome == "TAKE_BACK":
        confirmed = ret.quantity
        written_off = 0
    elif outcome == "WRITE_OFF":
        confirmed = 0
        written_off = ret.quantity
    elif outcome == "PARTIAL_TAKE_BACK":
        try:
            confirmed = int(data.get("confirmed_quantity", 0))
            written_off = int(data.get("written_off_quantity", 0))
        except (TypeError, ValueError):
            return {"outcome": "Quantities must be integers."}, None

        if confirmed <= 0 or written_off <= 0:
            return {
                "outcome": (
                    "PARTIAL_TAKE_BACK requires confirmed_quantity and "
                    "written_off_quantity to both be greater than zero."
                ),
            }, None

        if confirmed + written_off != ret.quantity:
            return {
                "outcome": (
                    f"Split ({confirmed}+{written_off}) must equal "
                    f"return quantity ({ret.quantity})."
                ),
            }, None
    else:
        return {"outcome": f"Unknown outcome: {outcome}."}, None

    try:
        ret = confirm_return_service(
            return_obj=ret,
            outcome=outcome,
            confirmed_quantity=confirmed,
            written_off_quantity=written_off,
            by_user=user,
            notes=data.get("notes", ""),
        )
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

    The retailer's ledger adjustment stays in place — the retailer
    physically shipped the goods. Dispute resolution is a financial
    matter handled outside this API.
    """
    ret, errors = _get_return_or_none(data.get("return_id"), user)
    if errors:
        return errors, None

    if not _is_wholesaler_side(user, ret):
        return {"detail": "Only the receiving wholesaler may reject."}, None

    if ret.status != "PENDING_CONFIRMATION":
        return {
            "status": "Only PENDING_CONFIRMATION returns can be rejected.",
        }, None

    try:
        ret = reject_return_service(ret, data.get("reason", ""), user)
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None


def settle_return(data, user):
    """
    Mark a CONFIRMED return as financially settled.

    Payload (original terms):
    {
        "action": "SettleReturn",
        "return_id": "<uuid>",
        "notes": "<string>"   # optional
    }

    Payload (override refund at settle time):
    {
        "action": "SettleReturn",
        "return_id": "<uuid>",
        "unit_price_refunded": "<decimal>",            # optional
        "restocking_fee_percent": "<decimal 0-100>",   # optional
        "notes": "<string>"                            # optional
    }

    Only the receiving wholesaler may settle. Return must be CONFIRMED.
    Overrides are typically used when the final refund was negotiated
    after physical inspection.
    """
    ret, errors = _get_return_or_none(data.get("return_id"), user)
    if errors:
        return errors, None

    if not _is_wholesaler_side(user, ret):
        return {"detail": "Only the receiving wholesaler may settle."}, None

    if ret.status != "CONFIRMED":
        return {"status": "Only CONFIRMED returns can be settled."}, None

    try:
        ret = settle_return_service(ret, data, user)
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None


def cancel_return(data, user):
    """
    Cancel a PENDING_CONFIRMATION return. Either party may cancel while
    pre-confirmation. Once confirmed, use a compensating return instead.

    Payload:
    {
        "action": "CancelReturn",
        "return_id": "<uuid>",
        "reason": "<string>"   # optional
    }
    """
    ret, errors = _get_return_or_none(data.get("return_id"), user)
    if errors:
        return errors, None

    if not _is_party(user, ret):
        return {"detail": "You are not a party to this return."}, None

    if ret.status != "PENDING_CONFIRMATION":
        return {
            "status": "Only PENDING_CONFIRMATION returns can be cancelled.",
        }, None

    try:
        ret = cancel_return_service(ret, data.get("reason", ""), user)
        return {}, ret
    except Exception as e:
        return {"detail": str(e)}, None


# =====================================================================
# Reconciliation
# =====================================================================

def get_stale_returns(data, user):
    """
    Returns stuck in PENDING_CONFIRMATION beyond N days.

    Payload:
    {
        "action": "GetStaleReturns",
        "days": <int>   # optional, default 7
    }

    These are goods that left the retailer's shelf but the wholesaler
    hasn't acknowledged. Signal of supply chain friction or lost stock.
    """
    try:
        days = int(data.get("days", 7))
    except (TypeError, ValueError):
        days = 7

    cutoff = timezone.now() - timedelta(days=days)
    return _scoped_returns(user).filter(
        status="PENDING_CONFIRMATION",
        created__lt=cutoff,
    ).order_by("created")


def get_return_mismatches(data, user):
    """
    Returns where the paired StockAdjustment's quantity doesn't match
    the return's quantity — a data integrity signal.

    Payload:
    {
        "action": "GetReturnMismatches"
    }

    Every paired pair should match (the service creates both atomically
    with the same quantity). A mismatch indicates a bug, a partial
    failure, or manual DB tampering.
    """
    qs = _scoped_returns(user)
    return (
        qs.filter(initiating_adjustment__isnull=False)
        .exclude(initiating_adjustment__quantity=F("quantity"))
        .order_by("-created")
    )