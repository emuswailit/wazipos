# retailers/routing.py

from django.urls import path
from . import consumers

retailers_websocket_urlpatterns = [
    # Inventory & Indents
    path("ws/retailers/inventory/", consumers.RetailerInventoryConsumer.as_asgi()),
    path("ws/retailers/indents/", consumers.RetailerIndentsConsumer.as_asgi()),
    path("ws/requisitions/retailers/", consumers.RetailerRequisitionsConsumer.as_asgi()),
    path("ws/retailers/inventory/shopping/", consumers.ShopInventoryConsumer.as_asgi()),
    path("ws/retailers/discounts/", consumers.WholesaleDiscountsConsumer.as_asgi()),
    
    # Out of Stocks & Offers
    path("ws/retailers/out-of-stocks/", consumers.RetailerOutOfStocksConsumer.as_asgi()),
    path("ws/retailers/offers/", consumers.RetailerReceiptsConsumer.as_asgi()),
    
    # Customer Orders
    path("ws/retailers/orders/notification/", consumers.CustomerOrderNotificationsConsumer.as_asgi()),
    path("ws/retailers/orders/list/", consumers.CustomerOrdersConsumer.as_asgi()),
    path("ws/retailers/orders/user/", consumers.UserOrdersConsumer.as_asgi()),
    path("ws/retailers/orders/details/<str:order_id>/", consumers.OrderDetailsConsumer.as_asgi()),
    
    # Prescriptions & Dashboard
    path("ws/retailers/prescriptions/user/", consumers.UserPrescriptionsConsumer.as_asgi()),
    path("ws/retailers/dashboard/", consumers.RetailerDashboardsConsumer.as_asgi()),
    path("ws/retailers/products/requests/", consumers.RetailerProductRequestsConsumer.as_asgi()),

    # ------------------------------------------------------------------ #
    # Live tracking & Payment Status
    # ------------------------------------------------------------------ #
    
    # Bodaboda Delivery
    path("ws/retailers/orders/bodaboda/assigned/", consumers.BodabodaAssignedOrdersConsumer.as_asgi()),
    path("ws/bodaboda/location/", consumers.BodaLocationConsumer.as_asgi()),
    path("ws/retailers/orders/tracking/<str:order_id>/", consumers.OrderTrackingConsumer.as_asgi()),
    path(
        "ws/retailers/orders/payment/<str:reference_number>/",
        consumers.CustomerOrderPaymentConsumer.as_asgi(),
    ),

]