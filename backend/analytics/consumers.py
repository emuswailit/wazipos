# analytics/consumers.py

import json
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from core.utils import UUIDEncoder

from analytics.models import InventoryAlert, InventoryMetricSnapshot
from analytics.serializers import (
    InventoryAlertListSerializer,
    InventoryMetricSnapshotSerializer,
)

# analytics/consumers.py — near the top




def _json_safe(data):
    """
    Round-trip through json using the project's UUIDEncoder to coerce
    UUID / Decimal / date / datetime into JSON-safe primitives.
    """
    return json.loads(json.dumps(data, cls=UUIDEncoder))

# =====================================================================
# Alerts consumer
# =====================================================================

class AnalyticsAlertsConsumer(AsyncJsonWebsocketConsumer):
    GROUP_NAME = "analytics-alerts"

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)

        if not self.user.is_authenticated:
            await self.close()
            return

        if not getattr(self.user, "entity_id", None):
            await self.close()
            return

        self.entity_id = str(self.user.entity_id)

        await self.channel_layer.group_add(
            self.GROUP_NAME,
            self.channel_name,
        )
        await self.accept()

        # Initial snapshot
        await self.push_snapshot()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.GROUP_NAME,
            self.channel_name,
        )

    # Group event handler — the task sends:
    #   { "type": "send.analytics.alerts" }
    async def send_analytics_alerts(self, event):
        await self.push_snapshot()

    async def push_snapshot(self):
        payload = await self.get_analytics_alerts()
        await self.send_json({
            "analytics_alerts": payload,
        })

    @database_sync_to_async
    def get_analytics_alerts(self):
        qs = (
            InventoryAlert.objects
            .filter(entity_id=self.entity_id, is_active=True)
            .select_related("product", "entity")
            .order_by("-severity", "-detected_at")[:50]
        )
        data = InventoryAlertListSerializer(
            qs,
            many=True,
            context={"request": None},
        ).data
        return json.loads(json.dumps(data, cls=UUIDEncoder))


# =====================================================================
# Overview consumer
# =====================================================================

class AnalyticsOverviewConsumer(AsyncJsonWebsocketConsumer):
    GROUP_NAME = "analytics-overview"

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)

        if not self.user.is_authenticated:
            await self.close()
            return

        if not getattr(self.user, "entity_id", None):
            await self.close()
            return

        self.entity_id = str(self.user.entity_id)

        await self.channel_layer.group_add(
            self.GROUP_NAME,
            self.channel_name,
        )
        await self.accept()

        # Initial snapshot
        await self.push_snapshot()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.GROUP_NAME,
            self.channel_name,
        )

    # Group event handler — the task sends:
    #   { "type": "send.analytics.overview" }
    async def send_analytics_overview(self, event):
        await self.push_snapshot()

    async def push_snapshot(self):
        payload = await self.get_analytics_overview()
        await self.send_json({
            "analytics_overview": payload,
        })

    @database_sync_to_async
    def get_analytics_overview(self):
        latest_date = (
            InventoryMetricSnapshot.objects
            .filter(entity_id=self.entity_id)
            .order_by("-snapshot_date")
            .values_list("snapshot_date", flat=True)
            .first()
        )
        if not latest_date:
            return []

        qs = (
            InventoryMetricSnapshot.objects
            .filter(
                entity_id=self.entity_id,
                snapshot_date=latest_date,
            )
            .select_related("entity")
        )
        data = InventoryMetricSnapshotSerializer(
            qs,
            many=True,
            context={"request": None},
        ).data
        return json.loads(json.dumps(data, cls=UUIDEncoder))


# analytics/consumers.py — APPEND

from analytics.realtime import (
    wholesaler_requests_group,
    retailer_requests_group,
    retailer_orders_group,
)


# =====================================================================
# Wholesaler product requests
# =====================================================================

class WholesalerProductRequestsConsumer(AsyncJsonWebsocketConsumer):
    """
    Live feed of incoming retailer product requests for a wholesaler.

    On connect: snapshot of open requests in the wholesaler's scope.
    Group messages:
        new_product_request — a new request has been created
        retailer_confirmed  — the retailer confirmed offers
    """

    async def connect(self):
        self.user = self.scope["user"]

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return
        if not getattr(self.user, "entity_id", None):
            await self.close(code=4003)
            return

        self.entity_id = str(self.user.entity_id)
        self.group_name = wholesaler_requests_group(self.entity_id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        initial = await self._get_open_requests()
        await self.send_json(_json_safe({
            "event": "initial",
            "requests": initial,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def new_product_request(self, event):
        await self.send_json(_json_safe({
            "event": "new_request",
            "payload": event.get("payload", {}),
        }))

    async def retailer_confirmed(self, event):
        await self.send_json(_json_safe({
            "event": "retailer_confirmed",
            "payload": event.get("payload", {}),
        }))

    @sync_to_async
    def _get_open_requests(self):
        from retailers.models import RetailerProductRequest
        from retailers.serializers import RetailerProductRequestListSerializer

        qs = (
            RetailerProductRequest.objects
            .filter(status__in=["OPEN", "ACKNOWLEDGED", "PARTIALLY_FULFILLED"])
            .select_related("entity")
            .order_by("-created")[:50]
        )
        return RetailerProductRequestListSerializer(qs, many=True).data


# =====================================================================
# Retailer product requests
# =====================================================================

class RetailerProductRequestsConsumer(AsyncJsonWebsocketConsumer):
    """
    Live feed of the retailer's own product request updates.

    On connect: snapshot of the retailer's requests.
    Group messages:
        request_response — a wholesaler responded to one of the requests
        offer_adjusted   — an offer quantity was reduced (rebalance)
    """

    async def connect(self):
        self.user = self.scope["user"]

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return
        if not getattr(self.user, "entity_id", None):
            await self.close(code=4003)
            return

        self.entity_id = str(self.user.entity_id)
        self.group_name = retailer_requests_group(self.entity_id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        initial = await self._get_my_requests()
        await self.send_json(_json_safe({
            "event": "initial",
            "requests": initial,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def request_response(self, event):
        await self.send_json(_json_safe({
            "event": "response",
            "payload": event.get("payload", {}),
        }))

    async def offer_adjusted(self, event):
        await self.send_json(_json_safe({
            "event": "offer_adjusted",
            "payload": event.get("payload", {}),
        }))

    @sync_to_async
    def _get_my_requests(self):
        from retailers.models import RetailerProductRequest
        from retailers.serializers import RetailerProductRequestListSerializer

        qs = (
            RetailerProductRequest.objects
            .filter(entity_id=self.entity_id)
            .select_related("entity")
            .order_by("-created")[:50]
        )
        return RetailerProductRequestListSerializer(qs, many=True).data


# =====================================================================
# Retailer orders
# =====================================================================

class RetailerOrdersConsumer(AsyncJsonWebsocketConsumer):
    """
    Live feed of the retailer's order updates.

    On connect: snapshot of the retailer's recent orders.
    Group messages:
        order_committed — a wholesaler committed an order
        order_rejected  — a wholesaler rejected an order
    """

    async def connect(self):
        self.user = self.scope["user"]

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return
        if not getattr(self.user, "entity_id", None):
            await self.close(code=4003)
            return

        self.entity_id = str(self.user.entity_id)
        self.group_name = retailer_orders_group(self.entity_id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        initial = await self._get_recent_orders()
        await self.send_json(_json_safe({
            "event": "initial",
            "orders": initial,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def order_committed(self, event):
        await self.send_json(_json_safe({
            "event": "committed",
            "payload": event.get("payload", {}),
        }))

    async def order_rejected(self, event):
        await self.send_json(_json_safe({
            "event": "rejected",
            "payload": event.get("payload", {}),
        }))

    @sync_to_async
    def _get_recent_orders(self):
        from wholesalers.models import RetailerOrders
        from wholesalers.serializers import RetailerOrdersSerializer

        qs = (
            RetailerOrders.objects
            .filter(retailer_id=self.entity_id)
            .select_related("wholesaler", "retailer")
            .order_by("-created")[:20]
        )
        return RetailerOrdersSerializer(qs, many=True).data