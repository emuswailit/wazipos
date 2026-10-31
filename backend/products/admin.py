from django.contrib import admin
from django import forms
from .models import Products, ProductImages
# 🌟 Import your EntityType Enum (adjust the import path if it's located elsewhere)
from authentication.models import EntityType 

admin.site.register(ProductImages)


# 🌟 Custom Form to override the allowed_entities field
class ProductsAdminForm(forms.ModelForm):
    allowed_entities = forms.MultipleChoiceField(
        choices=EntityType.choices(),
        widget=forms.SelectMultiple(attrs={'size': '12'}),
        required=False,
        help_text="Select the entities allowed to sell this product."
    )

    class Meta:
        model = Products
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Pre-select the current values when editing an existing product
        if self.instance and self.instance.pk and self.instance.allowed_entities:
            self.initial['allowed_entities'] = self.instance.allowed_entities


@admin.register(Products)
class ProductsAdmin(admin.ModelAdmin):
    # 🌟 Attach the custom form
    form = ProductsAdminForm

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
    list_filter = ("title", "is_pom")
    search_fields = ("title", "bar_code")
    list_per_page = 50

    # This will help you to disable add functionality (set to False to disable)
    def has_add_permission(self, request):
        return True

    # This will help you to disable delete functionality (set to False to disable)
    def has_delete_permission(self, request, obj=None):
        return True