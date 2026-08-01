# from django.contrib import admin
from django.contrib.gis import admin
# Suppose location is the name of app :)
from entitylocations import models


@admin.register(models.Locations)
class LocationAdmin(admin.OSMGeoAdmin):
    point_zoom = 10
    fields = ('entity', 'country','farness' )


@admin.register(models.BodaLocations)
class BodaLocationsAdmin(admin.OSMGeoAdmin):
    point_zoom = 10
    fields = ('entity', 'country','farness',"point","boda" )
