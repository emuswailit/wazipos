from django.urls import path
from . import views


urlpatterns = [
    path(
        "rating",
        views.ratingAPIView,
        name="rating-apiview",
    ),

]
