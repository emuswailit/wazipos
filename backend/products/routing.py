from django.urls import re_path,path

from . import consumers

products_websocket_urlpatterns = [

    path("ws/products/all/",consumers.ProductsConsumer.as_asgi()),
]