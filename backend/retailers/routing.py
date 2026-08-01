from django.urls import re_path,path

from . import consumers

retailers_websocket_urlpatterns = [

    path("ws/retailers/inventory/predictions/",consumers.InventoryPredictionsConsumer.as_asgi()),
    path("ws/retailers/inventory/",consumers.RetailerInventoryConsumer.as_asgi()),
    path("ws/retailers/inventory/shopping/",consumers.ShopInventoryConsumer.as_asgi()),
    path("ws/retailers/discounts/",consumers.WholesaleDiscountsConsumer.as_asgi()),
    path("ws/retailers/out-of-stocks/",consumers.RetailerOutOfStocksConsumer.as_asgi()),
    path("ws/retailers/offers/",consumers.RetailerReceiptsConsumer.as_asgi()),
    path("ws/retailers/orders/notification/",consumers.CustomerOrderNotificationsConsumer.as_asgi()),
    path("ws/retailers/orders/list/",consumers.CustomerOrdersConsumer.as_asgi()),
    path("ws/retailers/orders/user/",consumers.UserOrdersConsumer.as_asgi()),
    path("ws/retailers/orders/details/<str:order_id>/",consumers.OrderDetailsConsumer.as_asgi()),
    path("ws/retailers/prescriptions/user/",consumers.UserPrescriptionsConsumer.as_asgi()),
    # path("ws/retailers/orders/notifications/",consumers.CustomerOrderNotificationConsumer.as_asgi()),
    path("ws/retailers/orders/bodaboda/assigned/",consumers.BodabodaAssignedOrdersConsumer.as_asgi()),
    path("ws/retailers/dashboard/",consumers.RetailerDashboardsConsumer.as_asgi())
]