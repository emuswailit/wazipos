from django.urls import re_path,path

from . import consumers

wholesalers_websocket_urlpatterns = [
    path("wholesalers/inventory/",consumers.WholesalerInventoryConsumer.as_asgi())
]