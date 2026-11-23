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
    list_filter = ("status", "is_settled")
    actions = ("check_and_pay_out",)

    @admin.action(description="Check with JamboPay, connect the device and queue the owner's payout")
    def check_and_pay_out(self, request, queryset):
        from wifi.payments import payout_of, resolve

        done = []
        for p in queryset.select_related("entity", "tariff")[:200]:
            try:
                status = resolve(p)
                row = payout_of(p)
                done.append(f"{p.reference_number}: {status}, payout {row.status if row else 'none'}")
            except Exception as e:
                done.append(f"{p.reference_number}: failed — {e}")
        try:
            from payments.tasks import process_order_payouts

            process_order_payouts.delay()
        except Exception:
            pass
        self.message_user(request, " · ".join(done)[:2000] or "Nothing selected")
