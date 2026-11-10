# products/consumers.py
#
# Live product catalogue for the apps (ws/products/all/?token=...).
#
# Every message is a COMPLETE, AUTHORITATIVE snapshot of the products this user may
# see (same scope as the HTTP "GetAllProducts" action). Clients replace their local
# catalogue with it, deleting anything that isn't in the snapshot.
#
#   server -> client   {"type": "products.snapshot", "reason": "...", "count": n,
#                       "server_time": "<iso>", "products": [...]}
#   client -> server   {"action": "refresh"}      -> immediate snapshot
#                      {"action": "ping"}         -> {"type": "pong"}
#
# A snapshot is sent on connect, every PRODUCTS_WS_SNAPSHOT_SECONDS (default 30 min),
# on "refresh", and whenever something sends {"type": "send_products"} to the
# "products" group (see products.tasks.load_products).

import asyncio
import json
import logging
import uuid
from decimal import Decimal

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.utils import timezone

from .product_utils import get_all_products
from .serializers import ProductsSerializer

logger = logging.getLogger(__name__)

PRODUCTS_GROUP = "products"
SNAPSHOT_SECONDS = int(getattr(settings, "PRODUCTS_WS_SNAPSHOT_SECONDS", 30 * 60))

WS_CLOSE_NOT_AUTHENTICATED = 4001


class SnapshotEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, Decimal):
            return str(obj)
        return super().default(obj)


class ProductsConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        self.snapshot_task = None
        self.send_lock = asyncio.Lock()

        if not self.user or not self.user.is_authenticated:
            # TokenAuthMiddleware records why: 4001 no token, 4002 invalid, 4003 expired.
            await self.close(code=self.scope.get("close_code") or WS_CLOSE_NOT_AUTHENTICATED)
            return

        await self.channel_layer.group_add(PRODUCTS_GROUP, self.channel_name)
        await self.accept()
        await self.send_snapshot("connect")
        self.snapshot_task = asyncio.create_task(self.periodic_snapshots())

    async def disconnect(self, close_code):
        if getattr(self, "snapshot_task", None):
            self.snapshot_task.cancel()
        await self.channel_layer.group_discard(PRODUCTS_GROUP, self.channel_name)

    async def receive_json(self, content, **kwargs):
        action = (content or {}).get("action")
        if action == "refresh":
            await self.send_snapshot("refresh")
        elif action == "ping":
            await self.send_json({"type": "pong", "server_time": timezone.now().isoformat()})

    # Group event: {"type": "send_products"} (e.g. from products.tasks.load_products)
    async def send_products(self, event):
        await self.send_snapshot(event.get("reason", "broadcast"))

    async def periodic_snapshots(self):
        try:
            while True:
                await asyncio.sleep(SNAPSHOT_SECONDS)
                await self.send_snapshot("interval")
        except asyncio.CancelledError:
            pass

    async def send_snapshot(self, reason):
        # One snapshot at a time per socket, so concurrent triggers can't interleave.
        async with self.send_lock:
            try:
                products = await self.load_products()
            except Exception:
                logger.exception("products snapshot failed for user %s", getattr(self.user, "pk", None))
                await self.send_json({"type": "products.error", "reason": reason, "message": "Could not load products."})
                return
            payload = {
                "type": "products.snapshot",
                "reason": reason,
                "count": len(products),
                "server_time": timezone.now().isoformat(),
                "products": products,
            }
            await self.send(text_data=json.dumps(payload, cls=SnapshotEncoder))

    @database_sync_to_async
    def load_products(self):
        queryset = get_all_products(self.user)
        data = ProductsSerializer(queryset, many=True, context={"request": None, "user": self.user}).data
        # Round-trip through the encoder so UUIDs / Decimals become JSON-safe.
        return json.loads(json.dumps(data, cls=SnapshotEncoder))
