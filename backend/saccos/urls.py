from django.urls import path
from . import views

urlpatterns = [
    # Variation retailer-receipts urls
    path(
        "staff",
        views.saccoStaffAPIView,
        name="sacco-staff-apiview",
    ),
    path(
        "member",
        views.saccoMemberAPIView,
        name="sacco-apiview",
    ),

 path("members/register", views.SaccoUserRegisterView.as_view(), name="corporate-register"),

]