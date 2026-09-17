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
     path(
        "ws/analytics/alerts/",
        consumers.AnalyticsAlertsConsumer.as_asgi(),
    ),
    path(
        "ws/analytics/overview/",
        consumers.AnalyticsOverviewConsumer.as_asgi(),
    ),

    # Product request streams
    path(
        "ws/analytics/wholesaler/product-requests/",
        consumers.WholesalerProductRequestsConsumer.as_asgi(),
    ),
    path(
        "ws/analytics/retailer/product-requests/",
        consumers.RetailerProductRequestsConsumer.as_asgi(),
    ),

    # Retailer order stream
    path(
        "ws/analytics/retailer/orders/",
        consumers.RetailerOrdersConsumer.as_asgi(),
    ),
]