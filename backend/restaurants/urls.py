from django.urls import path
from . import views


urlpatterns = [
 
    path(
        "orders",
        views.restaurantsAPIView,
        name="restaurant-apiview",
    ),
    path(
        "admin",
        views.restaurantsAdminAPIView,
        name="restaurant-admin-apiview",
    ),
    path("login/", views.LoginAPIView.as_view(), name="login"),

    path(
        "menuitem/create",
        views.MenuItemCreateAPIView.as_view(),
        name=views.MenuItemCreateAPIView.name,
    ),
    path(
        "menuitem/<uuid:pk>/update",
        views.MenuItemUpdateAPIView.as_view(),
        name=views.MenuItemUpdateAPIView.name,
    ),

    path(
        "room/create",
        views.BranchRoomCreateAPIView.as_view(),
        name=views.BranchRoomCreateAPIView.name,
    ),
    path(
        "room/<uuid:pk>/update",
        views.BranchRoomUpdateAPIView.as_view(),
        name=views.BranchRoomUpdateAPIView.name,
    ),
]
