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
    
    # --- Shipping Rates ---
    path(
        "rates/shipping",
        views.retailersShippinRatesAPIView,
        name="entity-shipping-rates-apiview",
    ),
    path(
        "shipping/calculate",
        views.calculate_checkout_shipping,
        name="calculate-checkout-shipping",
    ),

    # --- Prescriptions ---
    path(
        "prescriptions",
        views.remoteRetailPrescriptionsAPIView,
        name="customer-orders-apiview",
    ),
    path(
        "prescriptions/create",
        views.RetailPrescriptionsCreateAPIView.as_view(),
        name=views.RetailPrescriptionsCreateAPIView.name,
    ),

    # --- Indents ---
    path(
        "indents/current/",
        views.RetailerIndentDetailView.as_view(),
        name="retailer-indent-current",
    ),
    path(
        "indents/<uuid:indent_id>/params/",
        views.RetailerIndentParamsUpdateView.as_view(),
        name="retailer-indent-params-update",
    ),
    path(
        "indents/<uuid:indent_id>/items/",
        views.RetailerIndentItemCreateView.as_view(),
        name="retailer-indent-item-create",
    ),
    path(
        'procurement/ordering', 
        views.RetailerCloseAndOrderIndentAPIView.as_view(), 
        name='inventory-prediction-ordering'
    ),

    # --- Indent Items ---
    path(
        "indent-items/<uuid:item_id>/params/",
        views.RetailerIndentItemParamsUpdateView.as_view(),
        name="retailer-indent-item-params-update",
    ),
    path(
        "indent-items/<uuid:item_id>/",
        views.RetailerIndentItemUpdateView.as_view(),
        name="retailer-indent-item-update",
    ),
    path(
        "indent-items/<uuid:item_id>/delete/",
        views.RetailerIndentItemDeleteView.as_view(),
        name="retailer-indent-item-delete",
    ),

    # --- Product Requests ---
    path(
        "product-requests",
        views.productRequestsAPIView,
        name="retailer-product-requests",
    ),
]