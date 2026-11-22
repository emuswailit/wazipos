from django.urls import path
from . import api, views


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

    # The distributor <-> wholesaler trade (distributors/api.py, services/).
    path("staff", api.distributorStaffAPIView, name="distributor-staff-apiview"),
    path("buy", api.wholesalerBuyAPIView, name="distributor-buy-apiview"),

]
