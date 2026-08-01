from django.contrib import admin
from . import models

# Register your models here.

@admin.register(models.Dials)
class USSDDialsAdmin(admin.ModelAdmin):
    list_display = (
        "session",
        "msisdn",
        "all_input",
        "last_input",
        "level",
        "created",
        "updated"
    )
    list_filter = (
        "msisdn",
       
    )
    search_fields = ("msisdn",)
