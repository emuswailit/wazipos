from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView
from . import views


urlpatterns = [
    path("admin", views.logisticsAdminAPIView, name="logistics=admin-api-view"),
]
