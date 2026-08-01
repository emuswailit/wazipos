from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView
from . import views


urlpatterns = [
    # path("providers", views.accountProvidersAPIView,
    #      name="account-providers-api-view"),
    # path("providers/branches", views.accountProviderBranchesAPIView,
    #      name="provider-branches-api-view"),
    # path("entities/accounts", views.entityAccountsAPIView,
    #      name="provider-branches-api-view"),
    path(
        "methods",
        views.PaymentMethodsCreateAPIView.as_view(),
        name=views.PaymentMethodsCreateAPIView.name,
    ),
    path(
        "payments/methods/<uuid:pk>",
        views.PaymentMethodsDetailAPIView.as_view(),
        name=views.PaymentMethodsDetailAPIView.name,
    ),


    path(
        "payment-methods/<uuid:pk>/update",
        views.PaymentMethodsUpdate.as_view(),
        name=views.PaymentMethodsUpdate.name,
    ),
    path(
        "payment-methods/<uuid:pk>/images",
        views.PaymentMethodsImagesUploadAPIView.as_view(),
        name=views.PaymentMethodsImagesUploadAPIView.name,
    ),
    path(
        "discounts/price",
        views.priceDiscountsAdminAPIView,
        name="price-discounts-admin-apiview",
    ),
    path(
        "payments/offline",
        views.offlinePaymentsAPIView,
        name="payments-offline-apiview",
    ),
    path(
        "payments/peer",
        views.peerToPeerPaymentsAPIView,
        name="payments-peer-to-peer-apiview",
    ),

        path(
        "lnm/stk",
        views.mpesaSTKPaymentsCallbackAPIView,
        name="mpesa-payments-offline-apiview",
    ),
        path(
        "lnm/paybill/validation",
        views.mpesaPaybillPaymentsValidationCallbackAPIView,
        name="mpesa-paybill-validation-apiview",
    ),
        path(
        "lnm/paybill/confirmation",
        views.mpesaPaybillPaymentsConfirmationCallbackAPIView,
        name="mpesa-paybill-validation-apiview",
    ),
    path(
        "methods/filter",
        views.paymentMethodsAPIView,
        name="payment-methods-filter-apiview",
    ),
    path(
        "discounts/quantity",
        views.quantityDiscountsAdminAPIView,
        name="quantity-discounts-admin-apiview",
    ),
    path(
        "providers",
        views.paymentProvidersAPIView,
        name="payment-providers-apiview",
    ),
    path(
        "admin",
        views.adminsPaymentsAPIView,
        name="payment-providers-apiview",
    ),
    path(
        "accounts",
        views.accountPaymentsAPIView,
        name="payment-account-apiview",
    ),

        path(
        "subscriptions/entity/create",
        views.EntitySubscriptionsCreateAPIView.as_view(),
        name=views.EntitySubscriptionsCreateAPIView.name,
    ),

        path(
        "subscriptions/entity",
        views.EntitySubscriptionsListAPIView.as_view(),
        name=views.EntitySubscriptionsListAPIView.name,
    ),

        path(
        "subscriptions/entity/<uuid:pk>/update",
        views.EntitySubscriptionsUpdateAPIView.as_view(),
        name=views.EntitySubscriptionsUpdateAPIView.name,
    ),
]
