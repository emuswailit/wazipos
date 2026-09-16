# analytics/urls.py

from django.urls import path

from analytics import views

urlpatterns = [
    path(
        "",
        views.analyticsAPIView,
        name="analytics-inventory-apiview",
    ),
]