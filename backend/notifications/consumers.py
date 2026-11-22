# notifications/consumers.py
#
# ws/notifications/alerts/?token=<jwt> — the signed-in person's live alerts while the
# app is connected: new orders, payments received, payouts (the same events that are
# emailed / texted / pushed by core/notify.py). The app shows them at once (a banner,
# or a local notification on phones) and hides the matching push while connected,
# so nobody is alerted twice.
#
# Close codes: 4001 = not signed in.

from channels.generic.websocket import AsyncJsonWebsocketConsumer


def alerts_group(user_id):
    return f"alerts-user-{user_id}"


class AlertsConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=self.scope.get("close_code") or 4001)
            return
        self.group = alerts_group(user.pk)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "alerts.ready"})

    async def disconnect(self, close_code):
        group = getattr(self, "group", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Keep-alive from the app.
        if content.get("type") == "ping":
            await self.send_json({"event": "pong"})

    async def alert_created(self, event):
        await self.send_json({"event": "alert", "alert": event.get("alert", {})})
