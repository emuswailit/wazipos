from django.urls import path
from . import views


urlpatterns = [
    path(
        "receipts/staff",
        views.distributorReceiptsStaffAPIView,
        name="distributor-receipts-staff-apiview",
    ),
    path(
        "receipts",
        views.distributorReceiptsOpenAPIView,
        name="distributor-receipts-open-apiview",
    ),

    path(
        "wholesalers/orders",
        views.wholesalerOrdersAPIView,
        name="wholesaler-orders-apiview",
    ),

]
