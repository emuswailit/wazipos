from django.urls import path
from . import views


urlpatterns = [
    path("admin", views.adminParkingAPIView, name="parking-api-view"),
]