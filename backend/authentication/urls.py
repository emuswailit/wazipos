from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from django.contrib.auth import views as auth_views


urlpatterns = [
    # path(
    #     "accounts/collection",
    #     views.collectionAccountsAPIView,
    #     name="accounts-collection-api-view",
    # ),
    # path(
    #     "accounts/settlement",
    #     views.settlementAccountsAPIView,
    #     name="accounts-settlement-api-view",
    # ),
    
    path("categories", views.categoriesAPIView, name="categories-api-view"),
    path("clusters", views.clustersAPIView, name="clusters-api-view"),
    path("countries", views.countriesAPIView, name="countries-api-view"),
    path("counties", views.countiesAPIView, name="counties-api-view"),
    path("postal/offices", views.postalAddressesAPIView, name="counties-api-view"),
    path("constituencies", views.constituenciesAPIView, name="constituencies-api-view"),
    path("departments", views.departmentsAPIView, name="departments-api-view"),
    path("entities/admin", views.entitiesAdminAPIView, name="entities-admin-api-view"),
    path("entities", views.entitiesAPIView, name="entities-api-view"),
    path(
        "entities/<uuid:pk>/licences",
        views.EntityLicencesUploadAPIView.as_view(),
        name=views.EntityLicencesUploadAPIView.name,
    ),
    path(
        "entities/<uuid:pk>/images",
        views.EntityImagesUploadAPIView.as_view(),
        name=views.EntityImagesUploadAPIView.name,
    ),
    path(
        "entities/<uuid:pk>/logos",
        views.EntityLogosUploadAPIView.as_view(),
        name=views.EntityLogosUploadAPIView.name,
    ),
    path(
        "entities/create", views.EntitiesCreateAPIView.as_view(), name="entity-create"
    ),
    path(
        "entities/create/agent", views.EntitiesCreateByAgentAPIView.as_view(), name="entity-create-agent"
    ),
#    path('google/login/', views.GoogleLogin.as_view(), name='google_login'),
#     path('users/me/', views.UserMe.as_view(), name='user_detail'),
    path("roles", views.rolesAPIView, name="roles-api-view"),
    path("sms", views.smsAPIView, name="sms-api-view"),
    path("plans", views.plansAPIView, name="plans-api-view"),
    path("cadres", views.cadresAPIView, name="cadres-api-view"),
    path("dependants", views.dependantsAPIView, name="dependants-api-view"),
    path("users", views.usersAPIView, name="users-api-view"),
    path("users/reference", views.sequenceAPIView, name="users-api-view"),
    path("users/admin", views.adminUsersAPIView, name="admin-users-api-view"),
    path("agents", views.agentsOnlyAPIView, name="agent-users-api-view"),
    path("documents", views.documentsAPIView, name="documents-api-view"),
    path("images", views.imagesAPIView, name="images-api-view"),
    # path("kyc", views.kycApiView, name="kyc-view"),
    path("register", views.SelfRegisterView.as_view(), name="self-register"),
    path("register/entity", views.EntityRegisterView.as_view(), name="self-register"),
    path("register/corporate", views.CorporateRegisterView.as_view(), name="corporate-register"),
    path("register/simple", views.SimpleRegisterView.as_view(), name="simple-register"),
    path("login/", views.LoginAPIView.as_view(), name="login"),
    path("secret/", views.SendPasswordAPIView.as_view(), name="secret"),
    path("secret/email", views.SendEmailPasswordAPIView.as_view(), name="secret-email"),
    path("otp/resend/", views.SendOTPAPIView.as_view(), name="login"),
    path("otp/verify/", views.VerifyOTPAPIView.as_view(), name="login"),
    path("shop-front/", views.ShopFrontAPIView.as_view(), name="login"),
    path("email-verify/", views.VerifyEmail.as_view(), name="email-verify"),
    path("token/refresh", TokenRefreshView.as_view(), name="token-refresh"),
    path(
        "request-reset-email",
        views.RequestPasswordResetEmail.as_view(),
        name="request-reset-email",
    ),
    path(
        "password-reset-confirm/<uidb64>/<token>",
        views.PasswordTokenCheckAPI.as_view(),
        name="password-reset-confirm",
    ),
    path(
        "password-reset-complete",
        views.SetNewPasswordAPIView.as_view(),
        name="password-reset-complete",
    ),
    path(
        "users/<uuid:pk>/documents",
        views.UserDocumentsUploadAPIView.as_view(),
        name=views.UserDocumentsUploadAPIView.name,
    ),
    path(
        "users/<uuid:pk>/images",
        views.UserImagesUploadAPIView.as_view(),
        name=views.UserImagesUploadAPIView.name,
    ),
    path(
        "entities/<uuid:pk>/documents",
        views.EntityDocumentUploadAPIView.as_view(),
        name=views.EntityDocumentUploadAPIView.name,
    ),
    path(
        "users/<uuid:pk>/update", views.UserUpdate.as_view(), name=views.UserUpdate.name
    ),
    path("users/<uuid:pk>", views.UserDetail.as_view(), name=views.UserDetail.name),
    path("add-entity/", views.add_entity, name="add-entity"),
    path("register-user/", views.register_user, name="register-user"),
    # path("entity-admin/", views.entity_admin, name="entity-admin"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("login-user/", views.login_user, name="login-user"),
]
