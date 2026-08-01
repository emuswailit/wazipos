from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView
from . import views


urlpatterns = [
    # path("slots/admin", views.slotsAdminAPIView, name="slots-admin-api-view"),
    path("slots", views.slotsAPIView, name="slots-api-view"),
    path("staff", views.hospitalStaffAPIView, name="slots-api-view"),
    path("open", views.openHospitalsAPIView, name="open-hospital-api-view"),
    path("inpatient", views.hospitalInpatientStaffAPIView, name="inpatient-api-view"),
    path("prescription/item/doses",views.DrugAdministrationRoutine.as_view(),name="hospitals-prescription-items"),
]
