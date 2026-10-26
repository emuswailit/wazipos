# urls.py

from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    
    # 🌟 Point to the dispatcher view
    path(
        "entity/", 
        views.subscriptionsDispatcherAPIView, 
        name="entity-subscriptions"
    ),
]