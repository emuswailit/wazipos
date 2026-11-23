from django.urls import path

from insurance import views

urlpatterns = [
    path("", views.insuranceAPIView, name="insurance-api-view"),
]
