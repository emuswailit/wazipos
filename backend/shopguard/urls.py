from django.urls import path

from shopguard import views

urlpatterns = [
    path("", views.shopGuardAPIView, name="shopguard-api-view"),
]
