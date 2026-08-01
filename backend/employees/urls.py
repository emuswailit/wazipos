from django.urls import path
from . import views


urlpatterns = [
    path("admin", views.employeesAdminAPIView, name="employees-admin-api-view"),
    path("joint", views.employeesJointAPIView, name="employees-joint-api-view"),
    path("designations", views.designationsAPIView, name="designations-api-view"),
    path("adverts", views.advertsAPIView, name="adverts-api-view"),
]
