from django.contrib import admin

from . import models


@admin.register(models.EntityExpenseCategories)
class EntityExpenseCategoriesAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "description",
        "is_recurrent",
        "recurrence_period",
        "created",
        "updated",
    )
    list_filter = (
        "is_recurrent",
        "recurrence_period",
        "title",
    )
    search_fields = ("title",)


@admin.register(models.EntityExpenses)
class EntityExpensesAdmin(admin.ModelAdmin):
    list_display = (
        "draft_id",
        "expense_category",
        "expense_date",
        "amount",
        "description",
        "created",
        "updated",
    )
    list_filter = (
        "expense_category",
        "expense_date",
        "created",
        "updated",
    )
    search_fields = ("draft_id", "description")