from django.urls import path
from . import views


urlpatterns = [
    # Variation retailer-receipts urls
    path(
        "",
        views.wifiAPIView,
        name="wifi-apiview",
    ),
    

]