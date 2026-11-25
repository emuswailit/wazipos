from django.urls import path

from churches import views

urlpatterns = [
    path("", views.churchAPIView, name="church-api-view"),
    path("public", views.publicChurchAPIView, name="church-public-api-view"),
]
