from django.urls import path

from credit import views

urlpatterns = [
    path("", views.creditAPIView, name="credit-api-view"),
]
