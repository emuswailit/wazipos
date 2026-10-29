# subscriptions/routing.py

from django.urls import path
from . import consumers

subscriptions_websocket_urlpatterns = [
    # Handles live subscription updates and the new hourly push loop
    path("ws/subscriptions/status/", consumers.SubscriptionConsumer.as_asgi()),
    
    # Handles live tracking of a specific M-Pesa/JamboPay payment
    path("ws/subscriptions/payment/<str:reference_number>/", consumers.SubscriptionPaymentConsumer.as_asgi()),
]