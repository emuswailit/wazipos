# analytics/realtime.py — APPEND

import json

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def _safe(data):
    from core.utils import UUIDEncoder
    return json.loads(json.dumps(data, cls=UUIDEncoder))


# =====================================================================
# Group naming
# =====================================================================

def wholesaler_requests_group(wholesaler_id) -> str:
    """A wholesaler's incoming product request stream."""
    return f"wholesaler_{wholesaler_id}_product_requests"


def retailer_requests_group(retailer_id) -> str:
    """A retailer's own product request updates."""
    return f"retailer_{retailer_id}_product_requests"


def retailer_orders_group(retailer_id) -> str:
    """A retailer's order stream — commits, rejections."""
    return f"retailer_{retailer_id}_orders"


# =====================================================================
# Product request pushes
# =====================================================================

def push_new_product_request(wholesaler_ids: list, payload: dict) -> None:
    """Fan out a new product request to N wholesalers."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    safe = _safe(payload)

    for wid in wholesaler_ids:
        async_to_sync(channel_layer.group_send)(
            wholesaler_requests_group(str(wid)),
            {
                "type": "new_product_request",
                "payload": safe,
            },
        )


def push_request_response(retailer_id: str, payload: dict) -> None:
    """Notify a retailer that a wholesaler responded to their request."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        retailer_requests_group(str(retailer_id)),
        {
            "type": "request_response",
            "payload": _safe(payload),
        },
    )


def push_offer_adjusted(retailer_id: str, payload: dict) -> None:
    """Notify a retailer that an offer quantity was reduced."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        retailer_requests_group(str(retailer_id)),
        {
            "type": "offer_adjusted",
            "payload": _safe(payload),
        },
    )


def push_retailer_confirmation(wholesaler_id: str, payload: dict) -> None:
    """Notify a wholesaler that the retailer confirmed some offers."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        wholesaler_requests_group(str(wholesaler_id)),
        {
            "type": "retailer_confirmed",
            "payload": _safe(payload),
        },
    )


# =====================================================================
# Order pushes
# =====================================================================

def push_order_committed(retailer_id: str, payload: dict) -> None:
    """Notify a retailer that their order was committed."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        retailer_orders_group(str(retailer_id)),
        {
            "type": "order_committed",
            "payload": _safe(payload),
        },
    )


def push_order_rejected(retailer_id: str, payload: dict) -> None:
    """Notify a retailer that their order was rejected."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        retailer_orders_group(str(retailer_id)),
        {
            "type": "order_rejected",
            "payload": _safe(payload),
        },
    )