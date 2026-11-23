from django.contrib import admin

from . import models


class EntityTitleMixin:
    """Shows the business (entity) each row belongs to, sortable and searchable by its title."""

    list_select_related = ("entity",)

    @admin.display(description="Entity", ordering="entity__title")
    def entity_title(self, obj):
        return obj.entity.title if obj.entity_id else "—"


@admin.register(models.WifiRouters)
class WifiRoutersAdmin(EntityTitleMixin, admin.ModelAdmin):
    list_display = (
        "id",
        "entity_title",
        "title",
        "location",
        "description",
        "owner",
        "created",
    )
    search_fields = ("entity__title", "title", "nas_id")


@admin.register(models.WifiTarrifs)
class WifiTarrifsAdmin(EntityTitleMixin, admin.ModelAdmin):
    list_display = (
        "id",
        "entity_title",
        "title",
        "duration",
        "length",
        "price",
        "owner",
        "created",
    )
    search_fields = ("entity__title", "title")


@admin.register(models.WifiSubscriptions)
class WifiSubscriptionsAdmin(EntityTitleMixin, admin.ModelAdmin):
    list_display = (
        "id",
        "entity_title",
        "mac_address",
        "username",
        "password",
        "valid_from",
        "valid_to",
        "owner",
        "created",
    )
    search_fields = ("entity__title", "mac_address", "username")


@admin.register(models.WifiSubscriptionPayments)
class WifiSubscriptionPaymentsAdmin(EntityTitleMixin, admin.ModelAdmin):
    list_display = (
        "id",
        "entity_title",
        "amount",
        "account",
        "is_settled",
        "description",
        "reference_number",
        "telco",
        "provider_reference_number",
        "psp_reference_number",
        "status",
        "created",
    )
    search_fields = ("entity__title", "reference_number", "psp_reference_number", "provider_reference_number")
