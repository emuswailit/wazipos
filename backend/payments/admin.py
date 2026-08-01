from django.contrib import admin

# Register your models here.
from . import models

# admin.site.register(PaymentMethods)
admin.site.register(models.PaymentMethodImages)


@admin.register(models.PaymentServicesProvider)
class PaymentServicesProviderAdmin(admin.ModelAdmin):
    list_display = ( "psp_title", "psp_code","psp_country","psp_type","owner","created","updated"
                    )
    list_filter = ('psp_country',"psp_type" )
    search_fields = ('psp_title', )
    list_per_page = 100

    # This will help you to disable add functionality
    def has_add_permission(self, request):
        return True

    # This will help you to disable delete functionaliyt
    def has_delete_permission(self, request, obj=None):
        return True




@admin.register(models.PaymentServicesProviderBranch)
class PaymentServicesProviderBranchAdmin(admin.ModelAdmin):
    list_display = (
        "psp",
        "psp_branch_title",
        "psp_branch_code",
        "psp_branch_telephone",
        "psp_branch_email",
        "owner",
        "created",
    )
    list_filter = (
        "psp",
    )
    search_fields = ("psp_branch_title","psp_branch_code")

@admin.register(models.PaymentServicesProviderImage)
class PaymentServicesProviderImageAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "payment_service_provider",
        "image",
        "owner",
        "created",
    )
    list_filter = (
        "payment_service_provider",
    )
    search_fields = ("payment_service_provider",)


@admin.register(models.JambopayUserProfiles)
class JambopayUserProfilesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "psp",
        "user",
        "profile_id",
        "created",
    )
    list_filter = (
        "psp",
    )
    search_fields = ("psp_branch_title","psp_branch_code")

@admin.register(models.UserAccounts)
class UserAccountsAdmin(admin.ModelAdmin):
    list_display = (
       "account_number",
       'psp', 'psp_branch',"account_name","account_phone", "account_type",
                  "owner", "created"
    )
    list_filter = (
        "account_number",
    )
    search_fields = ("account_number",)


@admin.register(models.EntityPSPCollectionAccount)
class EntityPSPCollectionAccountAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "psp",
        "entity",
        "psp_branch",
        "entity_account_number",
        "entity_account_name",
        "account_type",
        "owner",
        "is_verified",
        "created",
    )
rch_fields = ("owner","psp_branch","entity")

@admin.register(models.PayoutAccounts)
class EntityPayoutAccountAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "account_number",
        "account_code",
        "business_number",
        "account_type",
        "account_name",
        "is_active",
        "owner",
        "is_verified",
        "created",
    )
rch_fields = ("owner","entity")


@admin.register(models.PaymentMethods)
class PaymentMethodsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "psp",
        "title",
        "is_offline",
        "description",
        "created",
    )
    list_filter = (
        "psp",
    )
    search_fields = ("title",)
@admin.register(models.BranchCollectionAccount)
class BranchCollectionAccountAdmin(admin.ModelAdmin):
    list_display = (
        "branch",
        "psp",
        "account_number",
        "account_name",
        "created",
    )
    list_filter = (
        "psp",
    )
    search_fields = ("account_number","account_name")


@admin.register(models.OfflinePayments)
class OfflinePaymentsAdmin(admin.ModelAdmin):
    list_display = (
       "accountNo",
       'ref', 'status',"checksum","providerRef", "description","amount",
               "created"
    )
    list_filter = (
        "accountNo",
    )
    search_fields = ("accountNo",)

@admin.register(models.EntitySubscriptions)
class OfflinePaymentsAdmin(admin.ModelAdmin):
    list_display = (
       "title",
       'entity', 'scheduled_installment_amount',"principal_amount","schedule", "total_installments",
               "created"
    )
    list_filter = (
        "entity",
    )
    search_fields = ("title",)

@admin.register(models.EntitySubscriptionsDailyLog)
class EntitySubscriptionsDailyLogAdmin(admin.ModelAdmin):
    list_display = (
       "entity_subscription",
       'account_from', 'status','month',
               "created"
    )
    list_filter = (
        "entity_subscription",
    )
    search_fields = ("account_from",)


@admin.register(models.UserAccountsPayouts)
class UserAccountsPayoutsAdmin(admin.ModelAdmin):
    list_display = (
       "account_from",
       'entity_subscription', 'status','reference_number',"description",
               "created"
    )
    list_filter = (
        "entity","entity_subscription"
    )
    search_fields = ("account_from",)

@admin.register(models.UserAccountsPayins)
class UserAccountsPayinsAdmin(admin.ModelAdmin):
    list_display = (

      'reference_number',"description","payin_account_number","payin_account_type","amount","narrative","ref","rrn", 'status',
               "created"
    )
    list_filter = (
        "entity",
    )
    search_fields = ("account_from",)



@admin.register(models.EntityRegistrationFeePayments)
class EntityRegistrationFeePaymentsAdmin(admin.ModelAdmin):
    list_display = (
       "entity",
       'amount','telco','msisdn', 'status','reference_number',"psp_reference_number","provider_reference_number",
               "created"
    )
    list_filter = (
        "entity","telco"
    )
    search_fields = ("msisdn",)

@admin.register(models.PeerToPeerPayments)
class PeerToPeerPaymentsAdmin(admin.ModelAdmin):
    list_display = (
       "status",
       'amount','ref', 'orderId','checksum',"description","runningBalance",
               "created"
    )

    search_fields = ("orderId",)


@admin.register(models.BankClientEntity)
class BankClientEntityAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "client_entity",
        "currency",
        "bank_account_number",
        "bank_account_name",
        "created",
        "updated"
    )
    list_filter = (
        "client_entity",
    )
    search_fields = ("client_entity",)

@admin.register(models.BankFacility)
class BankFacilityAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        # "facility_client",
        "retailer_order",
        "loan_amount",
        "created",
        "updated"
    )
    # list_filter = (
    #     # "facility_client",
    # )
    # search_fields = ("",)    