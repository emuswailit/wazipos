from django.contrib import admin

from .models import Products, ProductImages

admin.site.register(ProductImages)


@admin.register(Products)
class ProductsAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "category",
        "sub_category",
        "preparation",
        "packaging",
        "manufacturer",
        "units_per_pack",
        "is_pom"
    )
    list_filter = ("title",)
    search_fields = ("title",)
    list_per_page = 50

    # This will help you to disbale add functionality
    def has_add_permission(self, request):
        return True

    # This will help you to disable delete functionaliyt
    def has_delete_permission(self, request, obj=None):
        return True

