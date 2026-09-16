# analytics/routing.py

from django.urls import path

from analytics import consumers


analytics_websocket_urlpatterns = [
    path(
        "ws/analytics/alerts/",
        consumers.AnalyticsAlertsConsumer.as_asgi(),
    ),
    path(
        "ws/analytics/overview/",
        consumers.AnalyticsOverviewConsumer.as_asgi(),
    ),
]