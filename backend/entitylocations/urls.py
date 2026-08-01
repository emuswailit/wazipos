from django.urls import path
from . import views


urlpatterns = [
    path(
        "locations",
        views.locationsAPIView,
        name="locations-api-view",
    ),
    path(
        "locations/filters",
        views.locations_filters_api_view,
        name="locations-filters-api-view",
    ),
    path(
        "locations/filters/staff",
        views.locations_filters_api_view_staff,
        name="locations-filters-api-view-staff",
    ),

        path(
        "locations/bodaboda",
        views.bodaLocationsAPIView,
        name="boda-locations-api-view",
    ),
        path(
        "locations/wifi",
        views.wifiLocationsAPIView,
        name="wifi-locations-api-view",
    ),
        path(
        "locations/properties",
        views.propertiesLocationsAPIView,
        name="properties-locations-api-view",
    ),

]
