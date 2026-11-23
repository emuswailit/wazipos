from django.contrib import admin

from .models import Claims, Policies


@admin.register(Policies)
class PoliciesAdmin(admin.ModelAdmin):
    list_display = ("policy_number", "product", "plan", "holder", "status", "premium", "cover_amount", "starts_at", "ends_at")
    list_filter = ("product", "status")
    search_fields = ("policy_number", "holder__email", "subject_id", "pay_reference")


@admin.register(Claims)
class ClaimsAdmin(admin.ModelAdmin):
    list_display = ("claim_number", "policy", "incident", "loss_amount", "payable_estimate", "approved_amount", "status", "created")
    list_filter = ("status", "incident")
    search_fields = ("claim_number", "policy__policy_number", "claimant__email")
