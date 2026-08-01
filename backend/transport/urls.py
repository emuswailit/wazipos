from django.urls import path
from . import views


urlpatterns = [
    # Legacy tickets
    path(
        "tickets/legacy",
        views.legacyTicketsAPIView,
        name="legacy-tickets-apiview",
    ),
    path(
        "ticketing",
        views.transportAPIView,
        name="transport-apiview",
    ),
    path("login/", views.LoginAPIView.as_view(), name="login"),

        path(
        "subscriptions/create",
        views.SubscriptionCreateAPIView.as_view(),
        name=views.SubscriptionCreateAPIView.name,
    ),

        path(
        "subscriptions/<uuid:pk>/update", views.SubscriptionUpdate.as_view(), name=views.SubscriptionUpdate.name
    ),
        path(
        "bodaboda",
        views.bodabodaAPIView,
        name="bodaboda-apiview",
    ),
]
