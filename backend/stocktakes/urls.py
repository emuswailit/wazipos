# stocktakes/urls.py — /api/v1/stocktakes/ (see stocktakes/views.py)

from django.urls import path

from stocktakes import views

urlpatterns = [
    path("agent", views.agentStockTakesAPIView, name="stocktakes-agent-apiview"),
    path("stocktaker", views.stocktakerAPIView, name="stocktakes-stocktaker-apiview"),
    path("vendor", views.vendorStockTakesAPIView, name="stocktakes-vendor-apiview"),
    path("admin", views.adminStockTakesAPIView, name="stocktakes-admin-apiview"),
]
