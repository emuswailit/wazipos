from django.urls import path

from notifications import consumers

notifications_websocket_urlpatterns = [
    # Live alerts while the app is connected (orders, payments, payouts).
    path("ws/notifications/alerts/", consumers.AlertsConsumer.as_asgi()),
]
