from django.contrib import admin
from . import models

# Register your models here.
@admin.register(models.LaboratoryServices)
class LaboratoryServicesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "sample",
        "sample_handling_temparature",
        "other_requirements",
        "cause_for_rejection",
        "description",
        "time_to_result_unit",
        "time_to_result",
        "created",
    )
    list_filter = ( "title",)
    search_fields = ("title",)

@admin.register(models.RadiologyServices)
class RadiologyServicesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "description",
        "created",
    )
    list_filter = ( "title",)
    search_fields = ("title",)

@admin.register(models.PhysiotherapyServices)
class PhysiotherapyServicesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "description",
        "created",
    )
    list_filter = ( "title",)
    search_fields = ("title",)