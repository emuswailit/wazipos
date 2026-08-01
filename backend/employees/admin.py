from django.contrib import admin

from .models import Employees


class EmployeesAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "entity",
        "owner",
        "created",
        "updated",
    )


admin.site.register(Employees, EmployeesAdmin)
