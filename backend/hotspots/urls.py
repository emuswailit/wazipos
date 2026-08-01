from django.urls import path
from . import views

app_name = 'hotspots'
urlpatterns = [

     path('login/', views.hotspot_login_view, name='login'),
     path('trial/', views.hotspot_trial_view, name='trial'),
     path('check-payment/', views.check_payment_status_api, name='check_payment_api'),
     path('payment-failed/', views.payment_failed_view, name='payment_failed'),
]