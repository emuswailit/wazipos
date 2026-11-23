from django.urls import path

from onboarding import views

urlpatterns = [
    path("", views.onboardingAPIView, name="onboarding"),
]
