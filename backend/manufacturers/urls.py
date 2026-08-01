from django.urls import path
from . import views


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




]
