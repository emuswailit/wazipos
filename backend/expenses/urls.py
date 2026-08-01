from django.urls import path
from . import views


urlpatterns = [
    # Variation retailer-receipts urls
    path(
        "wishlists",
        views.wishlistsAPIView,
        name="wishlists-apiview",
    ),
       path(
        "entity",
        views.entityExpensesAPIView,
        name="entity-expenses-apiview",
    ),

]
