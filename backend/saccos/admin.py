from django.contrib import admin
from . import models

# Register your models here.
@admin.register(models.Members)
class MembersAdmin(admin.ModelAdmin):
    list_display = (
        "isActive",
        "branch",
        "user",
        "user_details",
        "updated",
        "created",
    )
    def user_details(self,obj):
        return f"{obj.user.first_name} {obj.user.last_name}"
    

    
@admin.register(models.MemberAccounts)
class MemberAccountsAdmin(admin.ModelAdmin):
    list_display = (
        "isActive",
        "branch",
        "accountAdministrator",
        "accountNature",
        "accountType",
        "accountNumber",
        "accountName",
        "accountPhone",
        "updated",
        "created",
    )

    
@admin.register(models.SaccoMsisdns)
class SaccoMsisdnsAdmin(admin.ModelAdmin):
    list_display = (
        "isActive",
        "branch",
        "msisdn",
        "updated",
        "created",
    )