# subscriptions/routing.py
from django.urls import path
from . import consumers

subscriptions_websocket_urlpatterns = [
    path("ws/subscriptions/status/", consumers.SubscriptionConsumer.as_asgi()),
    path("ws/subscriptions/payment/<str:reference_number>/", consumers.SubscriptionPaymentConsumer.as_asgi()),
]