# subscriptions/routing.py

from django.urls import path
from . import consumers

subscriptions_websocket_urlpatterns = [
    # Admin listens to this to see live payment status / subscription renewals
    path(
        "ws/subscriptions/status/", 
        consumers.SubscriptionStatusConsumer.as_asgi()
    ),
    
    # Optional: If you want to track a specific payment flow (STK push success/fail)
    path(
        "ws/subscriptions/payment/<str:reference_number>/", 
        consumers.SubscriptionPaymentConsumer.as_asgi()
    ),
]