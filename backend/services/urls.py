from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView
from . import views


urlpatterns = [
  
    path("open", views.servicesOpenAPIView, name="services-open-api-view"),
    path("admin", views.servicesAdminAPIView, name="services-admin-api-view"),

]
