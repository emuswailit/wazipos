from django.urls import path
from . import views


urlpatterns = [
    
  
       path(
        "",
        views.propertiesAPIView,
        name="properties-apiview",
    ),
        path(
        "<uuid:pk>/update",
        views.PropertyUpdateAPIView.as_view(),
        name=views.PropertyUpdateAPIView.name,
    ),
    path(
        "create",
        views.PropertyCreateAPIView.as_view(),
        name=views.PropertyCreateAPIView.name,
    ),
        path(
        "units/<uuid:pk>/update",
        views.PropertyUnitUpdateAPIView.as_view(),
        name=views.PropertyUnitUpdateAPIView.name,
    ),
    path(
        "units/create",
        views.PropertyUnitCreateAPIView.as_view(),
        name=views.PropertyUnitCreateAPIView.name,
    ),
    path(
        "tenants/create",
        views.PropertyUnitTenantCreateAPIView.as_view(),
        name=views.PropertyUnitTenantCreateAPIView.name,
    ),        path(
        "tenants/<uuid:pk>/update",
        views.PropertyUnitTenantUpdateAPIView.as_view(),
        name=views.PropertyUnitTenantUpdateAPIView.name,
    ),
]