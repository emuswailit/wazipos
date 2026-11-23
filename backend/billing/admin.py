from django.contrib import admin

from billing.models import TokenLedger, TokenWallet


@admin.register(TokenWallet)
class TokenWalletAdmin(admin.ModelAdmin):
    list_display = ("entity", "balance", "trial_ends_at", "has_topped_up", "updated")
    search_fields = ("entity__title",)
    list_filter = ("has_topped_up",)
    readonly_fields = ("balance",)


@admin.register(TokenLedger)
class TokenLedgerAdmin(admin.ModelAdmin):
    list_display = ("created", "entity", "kind", "meter", "tokens", "list_tokens", "balance_after", "order_value")
    list_filter = ("kind", "meter")
    search_fields = ("entity__title", "reference", "order_ref")
    readonly_fields = [f.name for f in TokenLedger._meta.fields]
