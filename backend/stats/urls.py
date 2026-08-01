from . import views
from django.urls import  path



urlpatterns =[
    path("inventory/retailers/sold/",views.SoldRetailerInventorySummary.as_view(),name="sold-retail-inventory"),
    path("retailers/sales/weekly",views.RetailerSalesWeeklySummary.as_view(),name="retailer-sales-weekly"),
]