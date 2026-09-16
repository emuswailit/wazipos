# analytics/consumers.py

import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from core.utils import UUIDEncoder

from analytics.models import InventoryAlert, InventoryMetricSnapshot
from analytics.serializers import (
    InventoryAlertListSerializer,
    InventoryMetricSnapshotSerializer,
)


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