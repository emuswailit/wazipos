# retailers/services/product_requests.py
#
# Product requests dispatcher.
#
# All product-request actions funnel through `product_requests_dispatch`,
# which resolves the caller's role and routes to a handler. Every handler
# returns one of:
#
#     ("success", message, payload, payload_key)
#     ("error",   message, errors)
#
# The view `productRequestsAPIView` wraps whichever tuple comes back in
# the project's standard response envelope.
#
# -----------------------------------------------------------------------
# ACTION MAP (request payloads are shown for each handler below)
#
#   CreateRequest              — retailer creates a new request
#   GetMyRequests              — retailer fetches their own requests
#   GetWholesalerTaggedRequests— wholesaler fetches requests targeting them
#   GetRequestDetails          — either side fetches one request
#   CreateOffer                — wholesaler submits an offer on a line
#   WithdrawOffer              — wholesaler retracts a submitted offer
#   ConfirmOffers              — retailer confirms one or more offers
#   CancelRequest              — retailer cancels an entire request
#   CancelRequestItem          — retailer cancels a single line
#   Respond                    — wholesaler accepts / rejects lines
# -----------------------------------------------------------------------

from __future__ import annotations

from retailers.models import RetailerProductRequest
from retailers.services.product_requests_respond import (
    wholesaler_respond_to_request,
)


# =========================================================
# Role resolution
# =========================================================

# =========================================================
# Role resolution
# =========================================================

# Canonical role strings returned by _resolve_role. Handlers compare
# against these, so changing the strings means updating the guards
# in handle_respond and any other role-restricted handler.
ROLE_RETAILER = "retailer"
ROLE_WHOLESALER = "wholesaler"
ROLE_UNKNOWN = "unknown"


def _resolve_role(user) -> str:
    """
    Determine the caller's product-requests role.

    Reads the JWT-decoded `user.roles` array. Each entry may carry
    any of:
        - level:        'wholesaler' | 'retailer' | ... (case-insensitive)
        - entity_type:  'wholesaler' | 'retailer' | ...
        - value:        free-form role identifier (e.g.
                        'GeneralWholesalerSuperAdmin')

    Wholesaler wins ties: a user who has both a retailer and a
    wholesaler role is treated as a wholesaler for product-request
    purposes, because a wholesaler responding on behalf of a retailer
    would be a data leak.

    Returns one of ROLE_RETAILER, ROLE_WHOLESALER, ROLE_UNKNOWN.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return ROLE_UNKNOWN

    # Some deployments surface a single role as a scalar field on the
    # user rather than an array. Handle both.
    raw_roles = getattr(user, "roles", None)

    if raw_roles is None:
        # Fall back to a single-role shape if present.
        single = (
            getattr(user, "role", None)
            or getattr(user, "role_level", None)
            or getattr(user, "entity_type", None)
        )
        if single:
            return _classify_role_string(single)
        return ROLE_UNKNOWN

    # Normalize: accept list, tuple, or a QuerySet of role objects.
    if not isinstance(raw_roles, (list, tuple)):
        try:
            raw_roles = list(raw_roles)
        except TypeError:
            return ROLE_UNKNOWN

    saw_retailer = False

    for entry in raw_roles:
        # Each entry may be a dict (decoded JWT) or a model instance.
        if isinstance(entry, dict):
            candidates = (
                entry.get("level"),
                entry.get("entity_type"),
                entry.get("value"),
                entry.get("title"),
            )
        else:
            candidates = (
                getattr(entry, "level", None),
                getattr(entry, "entity_type", None),
                getattr(entry, "value", None),
                getattr(entry, "title", None),
            )

        for candidate in candidates:
            if not candidate:
                continue
            role = _classify_role_string(candidate)
            if role == ROLE_WHOLESALER:
                return ROLE_WHOLESALER
            if role == ROLE_RETAILER:
                saw_retailer = True

    return ROLE_RETAILER if saw_retailer else ROLE_UNKNOWN


def _classify_role_string(raw) -> str:
    """
    Map a role-ish string to one of the canonical values.

    Matches on substring so 'GeneralWholesalerSuperAdmin',
    'WHOLESALER', 'wholesaler_admin', and 'Wholesale' all classify
    the same way. Retailer matches only when it isn't already a
    wholesaler token.
    """
    if not raw:
        return ROLE_UNKNOWN

    s = str(raw).strip().lower()

    if not s:
        return ROLE_UNKNOWN

    # Check wholesaler first — 'wholesaler' contains no 'retailer',
    # but the reverse isn't true, so order matters less here than it
    # looks. Still, keep the order for clarity.
    if "wholesal" in s:
        return ROLE_WHOLESALER

    if "retail" in s:
        return ROLE_RETAILER

    return ROLE_UNKNOWN


# =========================================================
# Handlers
# =========================================================

def handle_create_request(user, data, role):
    """
    Retailer creates a new product request.

    Sample payload:
        {
            "action": "CreateRequest",
            "urgency": "medium",                       # optional, default "medium"
            "note": "Please supply asap",              # optional
            "items": [
                {
                    "product_id": "db635cbd-bc49-4d37-9655-e70fa11fe21d",
                    "requested_quantity": 21,
                    "urgency": "medium",               # optional, per line
                    "note": "",                        # optional, per line
                    "target_wholesaler_ids": [
                        "10df5e17-7c55-44f9-b762-ed5dfda323b7",
                        "165f2dd8-f092-42c9-afa1-f32260bc11f7"
                    ]
                }
            ]
        }

    Expected success payload (key "request"):
        {
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "request_number": "PR0000000002"
        }

    TODO: paste the original implementation.
    """
    raise NotImplementedError("handle_create_request not merged yet.")


def handle_get_my_requests(user, data, role):
    """
    Retailer fetches their own product requests.

    Sample payload:
        {
            "action": "GetMyRequests",
            "status": "PUBLISHED",                     # optional filter
            "page": 1,                                 # optional
            "page_size": 20                            # optional
        }

    Expected success payload (key "requests"):
        {
            "requests": [ ... RetailerProductRequest shapes ... ]
        }

    TODO: paste the original implementation.
    """
    raise NotImplementedError("handle_get_my_requests not merged yet.")


def handle_get_wholesaler_tagged_requests(user, data, role):
    """
    Wholesaler fetches requests where their entity is a target.

    Sample payload:
        {
            "action": "GetWholesalerTaggedRequests",
            "status": "PUBLISHED",                     # optional filter
            "urgency": "high",                         # optional filter
            "page": 1,
            "page_size": 20
        }

    Expected success payload (key "requests"):
        {
            "requests": [ ... RetailerProductRequest shapes ... ]
        }

    TODO: paste the original implementation.
    """
    raise NotImplementedError(
        "handle_get_wholesaler_tagged_requests not merged yet."
    )


def handle_get_request_details(user, data, role):
    """
    Fetch details for a single request (either role).

    Sample payload:
        {
            "action": "GetRequestDetails",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf"
        }

    Expected success payload (key "request"):
        {
            "request": { ... full RetailerProductRequest with items ... }
        }

    TODO: paste the original implementation.
    """
    raise NotImplementedError(
        "handle_get_request_details not merged yet."
    )


def handle_create_offer(user, data, role):
    """
    Wholesaler submits an offer on a specific request line.

    Sample payload:
        {
            "action": "CreateOffer",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "line_id": "9d2dafa2-bdf6-48c7-94c2-f3accb636e9c",
            "offered_quantity": 21,
            "offered_unit_price": 8.00,
            "note": ""
        }

    Expected success payload (key "offer"):
        {
            "offer_id": "…",
            "status": "PENDING"
        }

    TODO: paste the original implementation.
    """
    raise NotImplementedError("handle_create_offer not merged yet.")


def handle_withdraw_offer(user, data, role):
    """
    Wholesaler withdraws a previously submitted offer.

    Sample payload:
        {
            "action": "WithdrawOffer",
            "offer_id": "…"
        }

    Expected success payload (key "offer"):
        {
            "offer_id": "…",
            "status": "WITHDRAWN"
        }

    TODO: paste the original implementation.
    """
    raise NotImplementedError("handle_withdraw_offer not merged yet.")


def handle_confirm_offers(user, data, role):
    """
    Retailer confirms one or more offers on their request.

    Sample payload:
        {
            "action": "ConfirmOffers",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "confirmations": [
                { "offer_id": "…", "response_note": "" }
            ],
            "declinations": [
                { "offer_id": "…", "reason": "out of budget" }
            ],
            "note": ""
        }

    Expected success payload (key "request"):
        {
            "request_id": "…",
            "confirmed_offer_count": 1,
            "declined_offer_count": 1
        }

    TODO: paste the original implementation.
    """
    raise NotImplementedError("handle_confirm_offers not merged yet.")


def handle_cancel_request(user, data, role):
    """
    Retailer cancels an entire request.

    Sample payload:
        {
            "action": "CancelRequest",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "reason": "no longer needed"                # optional
        }

    Expected success payload (key "request"):
        {
            "request_id": "…",
            "status": "CANCELLED"
        }

    TODO: paste the original implementation.
    """
    raise NotImplementedError("handle_cancel_request not merged yet.")


def handle_cancel_request_item(user, data, role):
    """
    Retailer cancels a single line on a request.

    Sample payload:
        {
            "action": "CancelRequestItem",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "item_id": "9d2dafa2-bdf6-48c7-94c2-f3accb636e9c",
            "reason": "duplicate"                       # optional
        }

    Expected success payload (key "request"):
        {
            "request_id": "…",
            "cancelled_item_id": "…"
        }

    TODO: paste the original implementation.
    """
    raise NotImplementedError(
        "handle_cancel_request_item not merged yet."
    )


def handle_respond(user, data, role):
    """
    Wholesaler responds to a request with accepted / rejected lines.

    Sample payload:
        {
            "action": "Respond",
            "request_id": "a54de545-4d19-4f7c-b796-0372a7c5bbbf",
            "note": "",
            "accepted_lines": [
                {
                    "item_id": "9d2dafa2-bdf6-48c7-94c2-f3accb636e9c",
                    "receipt_id": "<wholesaler_receipt.remote_id>"
                    # or, alternatively:
                    # "receipt": { ... full receipt payload ... }
                }
            ],
            "rejected_lines": [
                { "item_id": "…" }
            ]
        }

    Rules enforced by the backend:
        - at least one line must be accepted or rejected
        - every accepted line requires exactly one of
          `receipt_id` or `receipt` (not both)
        - every item_id must belong to this request
        - a line cannot appear in both accepted_lines and rejected_lines

    Expected success payload (key "response"):
        {
            "response_id": "…",
            "offered_line_count": 1,
            "rejected_line_count": 0
        }

    Error payloads are of the form:
        {
            "response_code": 1,
            "message": "Invalid accepted line",
            "errors": { "accepted_lines": "Each line requires item_id." }
        }

    Refactored from the original `elif action == "Respond":` block:
    same business logic, adapted to the (user, data, role) signature
    and the tuple return shape.
    """
    if role != "wholesaler":
        return (
            "error",
            "Only wholesalers can respond to requests",
            {},
        )

    request_id = data.get("request_id")
    if not request_id:
        return (
            "error",
            "Response could not be recorded",
            {"request_id": "This field is required."},
        )

    try:
        req = RetailerProductRequest.objects.get(id=request_id)
    except RetailerProductRequest.DoesNotExist:
        return (
            "error",
            "Request not found",
            {"request_id": "Not found."},
        )

    accepted_lines = data.get("accepted_lines", [])
    rejected_lines = data.get("rejected_lines", [])
    note = data.get("note", "")

    if not accepted_lines and not rejected_lines:
        return (
            "error",
            "Response must accept or reject at least one line",
            {},
        )

    # -------- Validate each accepted line --------
    for payload in accepted_lines:
        item_id = payload.get("item_id")
        if not item_id:
            return (
                "error",
                "Invalid accepted line",
                {"accepted_lines": "Each line requires item_id."},
            )

        has_receipt_id = bool(payload.get("receipt_id"))
        has_receipt_payload = isinstance(
            payload.get("receipt"), dict
        )

        if has_receipt_id and has_receipt_payload:
            return (
                "error",
                "Invalid accepted line",
                {
                    "accepted_lines":
                        "Provide either receipt_id or receipt, not both."
                },
            )
        if not has_receipt_id and not has_receipt_payload:
            return (
                "error",
                "Invalid accepted line",
                {
                    "accepted_lines":
                        "Each accepted line requires receipt_id or receipt."
                },
            )

        if not req.items.filter(id=item_id).exists():
            return (
                "error",
                "Line not found on this request",
                {
                    "accepted_lines":
                        f"Item {item_id} does not belong to this request."
                },
            )

    # -------- Validate rejections --------
    for payload in rejected_lines:
        if not payload.get("item_id"):
            return (
                "error",
                "Invalid rejected line",
                {"rejected_lines": "Each line requires item_id."},
            )
        if not req.items.filter(
            id=payload["item_id"]
        ).exists():
            return (
                "error",
                "Line not found on this request",
                {
                    "rejected_lines":
                        f"Item {payload['item_id']} does not belong to this request."
                },
            )

    # -------- Overlap check --------
    accepted_ids = {p["item_id"] for p in accepted_lines}
    rejected_ids = {p["item_id"] for p in rejected_lines}
    if accepted_ids & rejected_ids:
        return (
            "error",
            "A line cannot be both accepted and rejected",
            {"overlap": list(accepted_ids & rejected_ids)},
        )

    # -------- Apply --------
    try:
        response_obj = wholesaler_respond_to_request(
            request_obj=req,
            wholesaler_entity=user.entity,
            accepted_lines=accepted_lines,
            rejected_lines=rejected_lines,
            response_note=note,
            by_user=user,
        )
    except ValueError as e:
        return (
            "error",
            "Response could not be recorded",
            {"detail": str(e)},
        )

    # -------- Notify the retailer --------
    # Lazy import to avoid a circular dependency between
    # retailers.services and analytics.realtime.
    from analytics.realtime import push_request_response

    push_request_response(
        str(req.entity_id),
        {
            "request_id": str(req.id),
            "request_number": req.request_number,
            "wholesaler_id": str(user.entity_id),
            "wholesaler_title": user.entity.title,
            "offered_line_count": response_obj.offered_line_count,
            "rejected_line_count": response_obj.rejected_line_count,
            "note": note,
        },
    )

    return (
        "success",
        "Response recorded",
        {
            "response_id": str(response_obj.id),
            "offered_line_count": response_obj.offered_line_count,
            "rejected_line_count": response_obj.rejected_line_count,
        },
        "response",
    )


# =========================================================
# Dispatcher
# =========================================================

def product_requests_dispatch(user, data):
    """
    Route a product-requests action.

    Returns a 4-tuple:
        ("success", message, payload, payload_key)
        ("error", message, errors)
    """
    action = data.get("action")
    if not action:
        return ("error", "Action is not supplied", {})

    role = _resolve_role(user)

    handlers = {
        "CreateRequest": handle_create_request,
        "GetMyRequests": handle_get_my_requests,
        "GetWholesalerTaggedRequests":
            handle_get_wholesaler_tagged_requests,
        "GetRequestDetails": handle_get_request_details,
        "CreateOffer": handle_create_offer,
        "WithdrawOffer": handle_withdraw_offer,
        "ConfirmOffers": handle_confirm_offers,
        "CancelRequest": handle_cancel_request,
        "CancelRequestItem": handle_cancel_request_item,
        "Respond": handle_respond,   # ← newly registered
    }

    handler = handlers.get(action)
    if handler is None:
        return ("error", f"Action {action} is unknown", {})

    return handler(user, data, role)