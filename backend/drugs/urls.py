from django.urls import path
from . import views


urlpatterns = [
    path("bodysystems", views.body_systems_api_view, name="bodysystems-api-view"),
    path("drugclasses", views.drug_classes_api_view, name="drugclasses-api-view"),
    path("drugsubclasses", views.drug_sub_classes_api_view,
         name="drugsubclasses-api-view"),
    path("formulations", views.formulations_api_view,
         name="generics-api-view"),
    path("generics", views.generics_api_view,
         name="generics-api-view"),
    path("frequencies", views.frequencies_api_view,
         name="frequencies-api-view"),
    path("routes", views.routes_api_view,
         name="routes-api-view"),
    path("preparations", views.preparations_api_view,
         name="preparations-api-view"),
]
