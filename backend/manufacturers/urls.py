from django.urls import path
from . import api, views


urlpatterns = [
    # # Manufactutrer urls
    path(
        "variations/staff",
        views.manufacturerVariationsStaffAPIView,
        name="manufacturer-variations-staff-api-view",
    ),
    path(
        "variations",
        views.manufacturerVariationsAPIView,
        name="manufacturer-variations-api-view",
    ),

    # The manufacturer <-> distributor trade (manufacturers/api.py, services/).
    path("staff", api.manufacturerStaffAPIView, name="manufacturer-staff-apiview"),
    path("buy", api.distributorBuyAPIView, name="manufacturer-buy-apiview"),




]
