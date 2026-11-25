from django.contrib import admin

from .models import Announcements, ChurchOfficials, DenominationAdmins, DivisionAdmins, ChurchProfiles, Events, Families, Groups, MemberEvents, Members, Messages, ScheduleItems


@admin.register(ChurchProfiles)
class ChurchProfilesAdmin(admin.ModelAdmin):
    list_display = ("entity", "code", "denomination", "is_listed", "sms_monthly_quota")
    search_fields = ("entity__title", "code")


@admin.register(Families)
class FamiliesAdmin(admin.ModelAdmin):
    list_display = ("number", "name", "church", "status", "area")
    list_filter = ("status",)
    search_fields = ("number", "name", "church__title")


@admin.register(Members)
class MembersAdmin(admin.ModelAdmin):
    list_display = ("first_name", "last_name", "church", "family", "role_in_family", "status", "phone")
    list_filter = ("status", "role_in_family")
    search_fields = ("first_name", "last_name", "phone", "church__title")


@admin.register(Messages)
class MessagesAdmin(admin.ModelAdmin):
    list_display = ("church", "audience_label", "recipients", "sent", "failed", "status", "created")
    list_filter = ("status",)


for m in (DenominationAdmins, DivisionAdmins, ChurchOfficials, Groups, MemberEvents, Announcements, ScheduleItems, Events):
    admin.site.register(m)
