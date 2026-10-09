from django.urls import path
from . import views


urlpatterns = [
    path(
        "entity",
        views.entityExpensesAPIView,
        name="entity-expenses-apiview",
    ),
]