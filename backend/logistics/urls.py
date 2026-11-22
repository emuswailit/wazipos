from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView
from . import views


urlpatterns = [
    path("admin", views.logisticsAdminAPIView, name="logistics=admin-api-view"),
    path("deliveries", views.deliveriesAPIView, name="logistics-deliveries-api-view"),
    path("delivery-providers", views.deliveryProvidersAdminAPIView, name="logistics-delivery-providers-api-view"),
    path("courier", views.courierAPIView, name="logistics-courier-api-view"),
    path("fulfilment", views.fulfilmentAPIView, name="logistics-fulfilment-api-view"),
]
