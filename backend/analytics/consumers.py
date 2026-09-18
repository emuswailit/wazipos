# analytics/consumers.py

import datetime
import decimal
import json
import uuid

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db.models import Prefetch

from core.utils import UUIDEncoder

from analytics.models import InventoryAlert, InventoryMetricSnapshot
from analytics.realtime import (
    retailer_requests_group,
    wholesaler_requests_group,
)
from analytics.serializers import (
    InventoryAlertListSerializer,
    InventoryMetricSnapshotSerializer,
)


# =====================================================================
# JSON helpers
# =====================================================================

def _json_safe(data):
    """
    Round-trip through json using the project's UUIDEncoder to coerce
    UUID / Decimal / date / datetime into JSON-safe primitives.

    Prefer this over the recursive version below: it keeps the
    project's canonical encoder in one place.
    """
    return json.loads(json.dumps(data, cls=UUIDEncoder))


# =====================================================================
# Alerts consumer
# =====================================================================

class AnalyticsAlertsConsumer(AsyncJsonWebsocketConsumer):
    GROUP_NAME = "analytics-alerts"

    async def connect(self):
        self.user = self.scope["user"]

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

        await self.push_snapshot()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.GROUP_NAME,
            self.channel_name,
        )

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

        await self.push_snapshot()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.GROUP_NAME,
            self.channel_name,
        )

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


# =====================================================================
# Retailer product requests
# =====================================================================

class RetailerProductRequestsConsumer(AsyncJsonWebsocketConsumer):
    """
    Retailer-side live feed.

    Events:
        initial              — snapshot of the retailer's own requests
        new_offer            — a wholesaler offered on one of their lines
        request_updated      — status change
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

        await self.channel_layer.group_add(
            self.group_name, self.channel_name
        )
        await self.accept()

        initial = await self._get_my_requests()
        await self.send_json(_json_safe({
            "event": "initial",
            "requests": initial,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name, self.channel_name
            )

    async def new_offer(self, event):
        await self.send_json(_json_safe({
            "event": "new_offer",
            "payload": event.get("payload", {}),
        }))

    async def request_updated(self, event):
        await self.send_json(_json_safe({
            "event": "request_updated",
            "payload": event.get("payload", {}),
        }))

    @database_sync_to_async
    def _get_my_requests(self):
        from retailers.models import (
            RetailerProductRequest,
            RetailerProductRequestItem,
            RetailerProductRequestItemWholesaler,
        )
        from retailers.serializers import (
            RetailerProductRequestListSerializer,
        )

        qs = (
            RetailerProductRequest.objects
            .filter(entity=self.user.entity)
            .select_related("entity")
            .prefetch_related(
                Prefetch(
                    "items",
                    queryset=RetailerProductRequestItem.objects
                        .select_related("product")
                        .prefetch_related(
                            Prefetch(
                                "target_pairs",
                                queryset=RetailerProductRequestItemWholesaler
                                    .objects
                                    .filter(is_active=True)
                                    .select_related("wholesaler"),
                                to_attr="active_target_pairs",
                            ),
                        ),
                ),
            )
            .order_by("-created")[:50]
        )
        return RetailerProductRequestListSerializer(
            qs, many=True
        ).data


# =====================================================================
# Wholesaler product requests
# =====================================================================

class WholesalerProductRequestsConsumer(AsyncJsonWebsocketConsumer):
    """
    Wholesaler-side live feed.

    Events:
        initial              — snapshot of requests visible to this
                               wholesaler, containing only items they
                               were tagged on
        new_request          — a new request was published with at
                               least one line tagged to this
                               wholesaler
        retailer_confirmed   — the retailer confirmed offers on one of
                               their offers
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

        await self.channel_layer.group_add(
            self.group_name, self.channel_name
        )
        await self.accept()

        try:
            initial = await self._get_open_requests()
        except Exception as exc:  # noqa: BLE001
            print(
                "[WholesalerProductRequestsConsumer] "
                "initial snapshot failed:",
                exc,
            )
            initial = []

        await self.send_json(_json_safe({
            "event": "initial",
            "requests": initial,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name, self.channel_name
            )

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

    @database_sync_to_async
    def _get_open_requests(self):
        from retailers.models import (
            RetailerProductRequest,
            RetailerProductRequestItem,
            RetailerProductRequestOffer,
        )
        from retailers.serializers import (
            WholesalerFacingListSerializer,
        )

        entity_id = self.user.entity_id

        # Only items where this wholesaler has an active target pair.
        # Without this, the wholesaler would see every item on every
        # visible request.
        tagged_items_qs = (
            RetailerProductRequestItem.objects
            .filter(
                target_pairs__wholesaler_id=entity_id,
                target_pairs__is_active=True,
            )
            .select_related("product")
            .prefetch_related(
                Prefetch(
                    "offers",
                    queryset=RetailerProductRequestOffer.objects.filter(
                        wholesaler_id=entity_id,
                    ),
                    to_attr="my_offers_cache",
                ),
            )
            .distinct()
        )

        # Requests with at least one tagged item and a visible status.
        visible_requests_qs = (
            RetailerProductRequest.objects
            .filter(
                status__in=[
                    RetailerProductRequest.Status.PUBLISHED,
                    RetailerProductRequest.Status.ACKNOWLEDGED,
                    RetailerProductRequest.Status.PARTIALLY_FULFILLED,
                ],
                items__in=tagged_items_qs,
            )
            .select_related("entity")
            .prefetch_related(
                Prefetch(
                    "items",
                    queryset=tagged_items_qs,
                    to_attr="tagged_items",
                ),
            )
            .distinct()
            .order_by("-created")[:50]
        )

        return WholesalerFacingListSerializer(
            visible_requests_qs,
            many=True,
            context={"wholesaler_id": entity_id},
        ).data


# =====================================================================
# Retailer orders
# =====================================================================

class RetailerOrdersConsumer(AsyncJsonWebsocketConsumer):
    """
    Retailer-side live feed of order updates.

    Events:
        initial     — snapshot of the retailer's recent orders
        committed   — a wholesaler committed an order
        rejected    — a wholesaler rejected an order
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

        from analytics.realtime import retailer_orders_group
        self.group_name = retailer_orders_group(self.entity_id)

        await self.channel_layer.group_add(
            self.group_name, self.channel_name
        )
        await self.accept()

        initial = await self._get_recent_orders()
        await self.send_json(_json_safe({
            "event": "initial",
            "orders": initial,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name, self.channel_name
            )

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

    @database_sync_to_async
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