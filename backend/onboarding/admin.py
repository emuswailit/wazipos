from django.contrib import admin

from onboarding.models import EntityApprovals


@admin.register(EntityApprovals)
class EntityApprovalsAdmin(admin.ModelAdmin):
    list_display = ("entity", "status", "submitted_at", "decided_at", "decided_by", "submissions")
    list_filter = ("status",)
    search_fields = ("entity__title", "entity__owner__email", "entity__owner__phone")
    readonly_fields = ("checklist", "created", "updated")
