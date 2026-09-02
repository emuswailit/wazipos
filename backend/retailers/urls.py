from django.urls import path
from . import views


urlpatterns = [
    # Variation retailer-receipts urls
    path(
        "receipts/super-admin",
        views.retailerReceiptsSuperAdminAPIView,
        name="retailer-receipts-super-admin-apiview",
    ),
    path(
        "receipts/admin",
        views.retailerReceiptsAdminAPIView,
        name="retailer-receipts-admin-apiview",
    ),
    path(
        "receipts/joint",
        views.retailerReceiptsJointAPIView,
        name="retailer-receipts-joint-apiview",
    ),
    path(
        "orders/client",
        views.clientOrdersAPIView,
        name="client-orders-apiview",
    ),
    path(
        "invoices",
        views.retailerInvoicesAPIView,
        name="retailer-invoices-apiview",
    ),
    path(
        "orders",
        views.customerOrdersAPIView,
        name="customer-orders-staff-apiview",
    ),
    path(
        "orders/staff",
        views.customerOrdersStaffAPIView,
        name="customer-orders-staff-apiview",
    ),
    path(
        "orders/admin",
        views.customerOrdersAdminAPIView,
        name="customer-orders-apiview",
    ),
    path(
        "rates/shipping",
        views.retailersShippinRatesAPIView,
        name="entity-shipping-rates-apiview",
    ),

    path(
        "prescriptions",
        views.remoteRetailPrescriptionsAPIView,
        name="customer-orders-apiview",
    ),
    # Price Discounts urls
    path(
        "prescriptions/create",
        views.RetailPrescriptionsCreateAPIView.as_view(),
        name=views.RetailPrescriptionsCreateAPIView.name,
    ),
      # Phase 1: The Dynamic Simulation Playground (GET)
    # Retailer sends: ?days_to_order=30&lead_time_days=5&max_shelf_days=90
    path(
        'procurement/predictions', 
        views.VendorPurchasePredictionAPIView.as_view(), 
        name='inventory-prediction-simulator'
    ),
      # Phase 2: The Final Order Execution Lock (POST)
    # Retailer passes the selected payload array to turn recommendations into real DB rows
 
    # path(
    #     "discounts/price/<uuid:pk>",
    #     views.RetailerPriceDiscountsDetail.as_view(),
    #     name=views.RetailerPriceDiscountsDetail.name,
    # ),
    # path(
    #     "discounts/price/<uuid:pk>/update",
    #     views.RetailerPriceDiscountsDetail.as_view(),
    #     name=views.RetailerPriceDiscountsDetail.name,
    # ),
    # path(
    #     "discounts/price/create",
    #     views.RetailerPriceDiscountsCreate.as_view(),
    #     name=views.RetailerPriceDiscountsCreate.name,
    # ),
    # # Quantity Discounts urls
    # path(
    #     "discounts/quantity",
    #     views.RetailerQuantityDiscountsList.as_view(),
    #     name=views.RetailerQuantityDiscountsList.name,
    # ),
    # path(
    #     "discounts/quantity/<uuid:pk>",
    #     views.RetailerQuantityDiscountsDetail.as_view(),
    #     name=views.RetailerQuantityDiscountsDetail.name,
    # ),
    # path(
    #     "discounts/quantity/<uuid:pk>/update",
    #     views.RetailerQuantityDiscountsUpdate.as_view(),
    #     name=views.RetailerQuantityDiscountsUpdate.name,
    # ),
    # path(
    #     "discounts/quantity/create",
    #     views.RetailerQuantityDiscountsCreate.as_view(),
    #     name=views.RetailerQuantityDiscountsCreate.name,
    # ),
]
