from django.contrib import admin

from .models import CreditConsents, Facilities, FloatMovements, LenderProfiles, Repayments


@admin.register(LenderProfiles)
class LenderProfilesAdmin(admin.ModelAdmin):
    list_display = ("display_name", "entity", "status", "regulator", "licence_number", "float_balance", "total_disbursed")
    list_filter = ("status", "regulator")


@admin.register(Facilities)
class FacilitiesAdmin(admin.ModelAdmin):
    list_display = ("reference", "lender", "segment", "borrower_user", "principal", "total_due", "amount_repaid", "due_date", "status")
    list_filter = ("status", "segment")
    search_fields = ("reference", "order_reference", "borrower_user__email")


@admin.register(Repayments)
class RepaymentsAdmin(admin.ModelAdmin):
    list_display = ("reference", "facility", "amount", "status", "source", "paid_at")
    list_filter = ("status", "source")


admin.site.register(FloatMovements)
admin.site.register(CreditConsents)
