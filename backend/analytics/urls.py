# analytics/urls.py

from django.urls import path

from analytics import views
from analytics.access_logs import accessLogsAPIView

urlpatterns = [
    path(
        "",
        views.analyticsAPIView,
        name="analytics-inventory-apiview",
    ),
    # Admins: who called the API (IP, user, action). See analytics/access_logs.py.
    path("access-logs", accessLogsAPIView, name="analytics-access-logs-apiview"),
]