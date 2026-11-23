# wifi/consumers.py — live WiFi payments.
#
# ws/wifi/payments/?token=<jwt>      hotspot owner's admins (their business) and
#                                    WaziPOS admins (every business). On connect:
#                                    {"event": "wifi.snapshot", "payments": [...]}
#                                    then {"event": "wifi.payment", "payment": {...}}
#                                    on every status / connection / payout change.
#                                    Send {"type": "recheck", "payment_id": "..."} to
#                                    check one with the gateway now, {"type": "ping"}
#                                    to keep alive.
# ws/wifi/payment/<psp_reference>/   the captive portal waiting for one payment (no
#                                    sign-in): {"event": "wifi.status",
#                                    "status": "PENDING" | "SUCCESS" | "FAILED"}.
#
# Close codes: 4001 not signed in · 4003 not allowed · 4004 payment not found.

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from wifi import payments as wp


class WifiPaymentsConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=self.scope.get("close_code") or 4001)
            return
        self.groups_joined, entity = await self._groups(user)
        if not self.groups_joined:
            await self.close(code=4003)
            return
        for g in self.groups_joined:
            await self.channel_layer.group_add(g, self.channel_name)
        await self.accept()
        await self.send_json({"event": "wifi.snapshot", "payments": await self._snapshot(user, entity)})

    @database_sync_to_async
    def _groups(self, user):
        groups = []
        if user.is_superuser or user.is_staff:
            groups.append(wp.ADMIN_GROUP)
        entity = getattr(user, "entity", None)
        if entity is not None and wp.can_watch(user, entity) and not (user.is_superuser or user.is_staff):
            groups.append(wp.entity_group(entity.pk))
        return groups, entity

    @database_sync_to_async
    def _snapshot(self, user, entity):
        return wp.recent(None if (user.is_superuser or user.is_staff) else entity, limit=50)

    async def disconnect(self, close_code):
        for g in getattr(self, "groups_joined", None) or []:
            await self.channel_layer.group_discard(g, self.channel_name)

    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if kind == "ping":
            await self.send_json({"event": "pong"})
        elif kind == "recheck" and content.get("payment_id"):
            data = await database_sync_to_async(wp.recheck)(self.scope["user"], content["payment_id"])
            if data is None:
                await self.send_json({"event": "wifi.error", "message": "Payment not found"})
            else:
                await self.send_json({"event": "wifi.payment", "payment": data})

    async def wifi_payment(self, event):
        await self.send_json({"event": "wifi.payment", "payment": event.get("payment", {})})


class WifiPaymentStatusConsumer(AsyncJsonWebsocketConsumer):
    """The portal page for one payment. Reveals only PENDING / SUCCESS / FAILED."""

    async def connect(self):
        self.ref = str(self.scope["url_route"]["kwargs"].get("psp_reference") or "")
        status = await self._status()
        if status is None:
            await self.close(code=4004)
            return
        self.group = wp.payment_group(self.ref)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "wifi.status", "status": status})

    @database_sync_to_async
    def _status(self):
        p = wp.WifiSubscriptionPayments.objects.filter(psp_reference_number=self.ref).first()
        return wp.portal_status(p) if p else None

    async def disconnect(self, close_code):
        if getattr(self, "group", None):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"event": "pong"})

    async def wifi_status(self, event):
        await self.send_json({"event": "wifi.status", "status": event.get("status", "PENDING")})
