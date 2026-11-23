from django.urls import path

from billing import views

urlpatterns = [
    path("", views.billingAPIView, name="billing"),
]
