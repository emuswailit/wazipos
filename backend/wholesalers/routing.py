from django.urls import re_path,path

from . import consumers

wholesalers_websocket_urlpatterns = [
    path("ws/wholesalers/inventory/",consumers.WholesalerInventoryConsumer.as_asgi()),
      path("ws/wholesalers/orders/list/",consumers.RetailerOrdersConsumer.as_asgi()),
      path("ws/wholesalers/orders/filtered/",consumers.FilteredRetailerOrdersConsumer.as_asgi()),
      path("ws/wholesalers/products/requests",consumers.RetailerProductRequestsConsumer.as_asgi()),
]