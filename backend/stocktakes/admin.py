from django.contrib import admin

from stocktakes import models


class AssignmentsInline(admin.TabularInline):
    model = models.StockTakeAssignments
    extra = 0
    readonly_fields = ("onboarder", "days_worked", "daily_rate", "payout_status", "paid_at", "paid_by")


@admin.register(models.StockTakes)
class StockTakesAdmin(admin.ModelAdmin):
    list_display = ("entity", "agent", "kind", "starts_on", "ends_on", "fee", "status", "is_paid")
    list_filter = ("status", "kind", "is_paid")
    search_fields = ("entity__title",)
    inlines = [AssignmentsInline]


@admin.register(models.StockTakeCounts)
class StockTakeCountsAdmin(admin.ModelAdmin):
    list_display = ("stock_take", "title", "book_quantity", "counted_quantity", "decision", "created")
    list_filter = ("kind", "decision")
    search_fields = ("title", "stock_take__entity__title")
