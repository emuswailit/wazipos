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


from .models import Adverts, JobApplications


@admin.register(Adverts)
class AdvertsAdmin(admin.ModelAdmin):
    list_display = ("title", "entity", "employment_type", "status", "vacancies", "filled", "closes", "applications_count", "created")
    list_filter = ("status", "employment_type")
    search_fields = ("title", "entity__title", "share_code")


@admin.register(JobApplications)
class JobApplicationsAdmin(admin.ModelAdmin):
    list_display = ("applicant", "advert", "status", "years_experience", "created")
    list_filter = ("status",)
    search_fields = ("applicant__email", "advert__title", "phone")
