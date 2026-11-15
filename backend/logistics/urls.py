from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView
from . import views


urlpatterns = [
    path("admin", views.logisticsAdminAPIView, name="logistics=admin-api-view"),
    path("deliveries", views.deliveriesAPIView, name="logistics-deliveries-api-view"),
    path("fulfilment", views.fulfilmentAPIView, name="logistics-fulfilment-api-view"),
]
