# wifi/hotspot_urls.py — the captive portal routers send customers to (formerly the
# `hotspots` app). Mounted at /hotspots/ with namespace "hotspots" in wazi/urls.py:
# routers in the field point at /hotspots/login/, so the path and names must not change.

from django.urls import path

from . import hotspot_views as views

app_name = 'hotspots'
urlpatterns = [

     path('login/', views.hotspot_login_view, name='login'),
     path('trial/', views.hotspot_trial_view, name='trial'),
     path('check-payment/', views.check_payment_status_api, name='check_payment_api'),
     path('payment-failed/', views.payment_failed_view, name='payment_failed'),
]