from django.urls import path
from . import views


urlpatterns = [
    path(
        "receipts/staff",
        views.wholesalerReceiptsStaffAPIView,
        name="wholesaler-receipts-staff-apiview",
    ),
    path(
        "receipts",
        views.wholesalerReceiptsAPIView,
        name="wholesaler-receipts-apiview",
    ),
    path(
        "retailers/orders",
        views.retailerOrdersAPIView,
        name="retailer-orders-apiview",
    ),
    path(
        "retailers/orders/staff",
        views.retailerOrdersStaffAPIView,
        name="retailer-orders-staff-apiview",
    ),

    path(
        "discounts/price/<uuid:pk>/update",
        views.WholesalerPriceDiscountUpdateAPIView.as_view(),
        name=views.WholesalerPriceDiscountUpdateAPIView.name,
    ),
    path(
        "discounts/price/create",
        views.WholesalerPriceDiscountsCreateAPIView.as_view(),
        name=views.WholesalerPriceDiscountsCreateAPIView.name,
    ),
    path(
        "discounts/quantity/<uuid:pk>/update",
        views.WholesalerQuantityDiscountUpdateAPIView.as_view(),
        name=views.WholesalerQuantityDiscountUpdateAPIView.name,
    ),
    path(
        "discounts/quantity/create",
        views.WholesalerQuantityDiscountsCreateAPIView.as_view(),
        name=views.WholesalerQuantityDiscountsCreateAPIView.name,
    ),
]
