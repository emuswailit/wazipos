# wifi/routing.py — live WiFi payments (wifi/consumers.py).
from django.urls import path

from wifi import consumers

wifi_websocket_urlpatterns = [
    path("ws/wifi/payments/", consumers.WifiPaymentsConsumer.as_asgi()),
    path("ws/wifi/payment/<str:psp_reference>/", consumers.WifiPaymentStatusConsumer.as_asgi()),
]
