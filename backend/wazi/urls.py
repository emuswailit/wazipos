"""wazi URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
# from django.urls import re_path as url
from django.contrib import admin
from django.urls import path, include,re_path
from allauth.account.views import ConfirmEmailView
from django.conf.urls.static import static
from django.conf import settings
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from subscriptions.views import index
from authentication.views import GoogleLogin, GoogleLoginCallback, LoginPage


schema_view = get_schema_view(
    openapi.Info(
        title="Wazipos API",
        default_version="v1",
        description="backend application for wazipos",
        terms_of_service="https://www.wazipos.com/policies/terms/",
        contact=openapi.Contact(email="contact@expenses.local"),
        license=openapi.License(name="BSD License"),
    ),
    public=True,
    permission_classes=(permissions.AllowAny,),
)

urlpatterns = [
    ## Swagger out
    # Swagger
    path("", schema_view.with_ui("swagger", cache_timeout=0), name="schema-swagger-ui"),
    # path("",include("subscriptions.urls")),
    # re_path(r'^.*$', index),
    # path("", index),
    path("redoc/", schema_view.with_ui("redoc", cache_timeout=0), name="schema-redoc"),
    path("api/v1/ussd/", include("ussd.urls")),
    path("admin/", admin.site.urls),
    path("login/", LoginPage.as_view(), name="login"),
    path("api/v1/auth/", include("dj_rest_auth.urls")),
    re_path(
        "^api/v1/auth/registration/account-confirm-email/(?P<key>[-:\w]+)/$",
        ConfirmEmailView.as_view(),
        name="account_confirm_email",
    ),
     path('api/v1/auth/registration/', include('dj_rest_auth.registration.urls')),
      path("api/v1/authentication/", include("authentication.urls")),

         path("api/v1/auth/google/", GoogleLogin.as_view(), name="google_login"),
    path(
        "api/v1/auth/google/callback/",
        GoogleLoginCallback.as_view(),
        name="google_login_callback",
    ),
    path("api/v1/chats/", include("chats.urls")),
    path("api/v1/hospitals/", include("hospitals.urls")),
    path("api/v1/distributors/", include("distributors.urls")),
    path("api/v1/drugs/", include("drugs.urls")),
    path("api/v1/entitylocations/", include("entitylocations.urls")),
    path("api/v1/expenses/", include("expenses.urls")),
    path("api/v1/loyalty/", include("loyalty.urls")),
    path("api/v1/employees/", include("employees.urls")),
    path("api/v1/logistics/", include("logistics.urls")),
    path("api/v1/manufacturers/", include("manufacturers.urls")),
    path("api/v1/products/", include("products.urls")),
    path("api/v1/payments/", include("payments.urls")),
    path("api/v1/parking/", include("parking.urls")),
    path("api/v1/properties/", include("properties.urls")),
    path("api/v1/retailers/", include("retailers.urls")),
    path("api/v1/services/", include("services.urls")),
    path("api/v1/saccos/", include("saccos.urls")),
    path("api/v1/transport/", include("transport.urls")),
    path("api/v1/logistics/", include("logistics.urls")),
    path("api/v1/restaurants/", include("restaurants.urls")),
    path("api/v1/wholesalers/", include("wholesalers.urls")),
    path("hotspots/", include("hotspots.urls",namespace='hotspots')),
    path("api/v1/wifi/", include("wifi.urls")),
    path("api/v1/stats/", include("stats.urls")),
    path("__reload__/", include("django_browser_reload.urls")),
]
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# handler404 = "utils.views.error_404"
# handler500 = "utils.views.error_500"

admin.site.site_header = "Wazipos Admin"
admin.site.site_title = "Wazipos Admin Portal"
admin.site.index_title = "Welcome to the Wazipos Portal"
