from rest_framework import serializers
from . import models
from utils.encription import decrypt


# class AccountProviderSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = models.AccountProvider
#         fields = ("id", "account_provider_title", "account_provider_code",
#                   'country', 'account_provider_type', "owner", "created", "updated")

#         read_only_fields = ("id", "created", "updated",)


class PaymentServicesProviderBranchSerializer(serializers.ModelSerializer):
    psp_title=serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.PaymentServicesProviderBranch
        fields = ("id", "psp","psp_title", "psp_branch_title", 'psp_branch_code', "psp_branch_telephone", 'psp_branch_email',
                  "owner", "created", "updated")

        read_only_fields = ("id",  "created", "updated",)
    def get_psp_title(self,obj):
        if obj.psp:
            return obj.psp.psp_title   

class BranchCollectionAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.BranchCollectionAccount
        fields = ("id", "entity", "branch",  'psp', 'psp_branch',"business_number","account_number", "account_type",
                  "owner", "created", "updated")

        read_only_fields = ("id",  "created", "updated",)

class UserAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.UserAccounts
        fields = "__all__"

        read_only_fields = ("id","created","updated" )

class EntityRegistrationFeePaymentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.EntityRegistrationFeePayments
        fields = "__all__"

        read_only_fields = ("id","created","updated" )

class PeerToPeerPaymentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PeerToPeerPayments
        fields = "__all__"

        read_only_fields = ("id","created","updated" )

class PaymentServicesProviderImageSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.PaymentServicesProviderImage
        fields = ("id", "payment_service_provider", "owner", "image", "created", "updated")

        read_only_fields = ("id", "payment_service_provider", "created", "updated", "owner")



class PaymentServicesProviderSerializer(serializers.ModelSerializer):
    images = PaymentServicesProviderImageSerializer(many=True, read_only=True, required=False)
    class Meta:
        ordering = ["title"]
        model = models.PaymentServicesProvider
        fields = ("id", "psp_title","psp_country", "owner", "psp_code","images", "created", "updated")

        read_only_fields = ("id", "created", "updated", "owner")


class PaymentMethodImagesSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.PaymentMethodImages
        fields = ("id", "payment_method", "owner", "image", "created", "updated")

        read_only_fields = ("id", "payment_method", "created", "updated", "user")


class PaymentMethodsSerializer(serializers.ModelSerializer):
    images = PaymentMethodImagesSerializer(many=True, read_only=True, required=False)
    """Payments serializer"""

    class Meta:
        model = models.PaymentMethods
        fields = ("id", "title", "description","is_active","is_offline", "created","psp", "images", "updated")
        read_only_fields = ("id", "created", "updated")
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }


        
class EntityPSPCollectionAccountSerializer(serializers.ModelSerializer):
    images = PaymentMethodImagesSerializer(many=True, read_only=True, required=False)
    psp_title = serializers.SerializerMethodField(read_only=True)
    """Payment service provider accounts for entities"""

    class Meta:
        model = models.EntityPSPCollectionAccount
        fields = ("id", 
                  "entity", 
                  "psp",
                  "psp_title","psp_branch","account_administrator","account_type","entity_account_number","entity_account_name","entity_account_phone","owner", 
                  "created","psp", "images", "updated")
        read_only_fields = ("id", "created", "updated")
    def get_psp_title(self,obj):
        if obj.psp:
            return obj.psp.psp_title



class PayoutAccountsSerializer(serializers.ModelSerializer):
    entity_title = serializers.SerializerMethodField(read_only=True)
    owner_title = serializers.SerializerMethodField(read_only=True)
    """Payout account serializer"""

    class Meta:
        model = models.PayoutAccounts
        fields = ("id", "entity",
                  "entity_title",
                  "account_entity", 
                  "account_type",
                  "is_active",
                  "account_code",
                  "account_name",
                  "account_number","business_number","owner", 
                  "owner_title",
                  "created", "updated")
        read_only_fields = ("id", "created", "updated")
  
    def get_entity_title(self,obj):
        if obj.entity:
            return obj.entity.title
        
    def get_owner_title(self,obj):
        if obj.owner:
            return f"{obj.owner.first_name} {obj.owner.last_name}"
            

class PriceDiscountsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PriceDiscounts
        fields = (
            "id",
            "entity",
            "title",
            "percent",
            "start",
            "end",
            "is_active",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = ("id", "created", "updated", "owner", "entity")

# class JambopayUserProfileAccountSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = models.JambopayUserProfileAccount
#         fields = (
#             "id",
#             "entity",
#             "tenant_id",
#             "account_number",
#             "name",
#             "account_type",
#             "account_type",
#             "description",
#             "is_active",
#             "created",
#             "updated",
#             "owner",
#         )
#         read_only_fields = ("id", "created", "updated", "owner", "entity")


class QuantityDiscountsSerializer(serializers.ModelSerializer):
    awarded_quantity_str = serializers.SerializerMethodField(read_only=True)
    limit_quantity_str = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.QuantityDiscounts
        fields = (
            "id",
            "entity",
            "title",
            "limit_quantity",
            "awarded_quantity",
            "awarded_quantity_str",
            "limit_quantity_str",
            "start",
            "end",
            "is_active",
            "created",
            "updated",
            "owner",
        )
        read_only_fields = ("id", "created", "updated", "owner", "entity")

    def get_awarded_quantity_str(self, obj):
        awarded_quantity_str = ""
        if obj.awarded_quantity:
            awarded_quantity_str = f"{obj.awarded_quantity}"
        return awarded_quantity_str

    def get_limit_quantity_str(self, obj):
        limit_quantity_str = ""
        if obj.limit_quantity:
            limit_quantity_str = f"{obj.limit_quantity}"
        return limit_quantity_str


class OfflinePaymentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.OfflinePayments
        fields = ("id", "status", 'ref', 'checksum',"accountNo","providerRef","description", "amount",
                  "created", "updated")

        read_only_fields = ("id",  "created", "updated",)




class EntitySubscriptionsBannersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.EntitySubscriptionsBanners
        fields = (
            "id",
            "banner",
            "thumbnail",
            "owner",
            "subscription",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("subscription", "thumbnail", "owner", "entity")
       
class EntitySubscriptionsSerializer(serializers.ModelSerializer):
    entity_title = serializers.SerializerMethodField(read_only=True)
    banners = EntitySubscriptionsBannersSerializer(many=True, read_only=True)
    class Meta:
        model = models.EntitySubscriptions
        fields = (
            "id",
            "title",
            "entity",
            "entity_title",
            "product_partner",
            "banking_partner",
            "principal_amount",
            "interest_amount",
            "interest_rate",
            "repayment_amount",
            "total_installments",
            "scheduled_installment_amount",
            "schedule",
            "mandatory",
            "description",
            "is_active",
            "owner",
            "banners",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "scheduled_installment_amount", "created", "updated", "entity", "id")

        extra_kwargs = {
            "banners": {
                "required": False,
            }
        }
    
    def get_entity_title(self, obj):
        return obj.entity.title
    


class UserAccountsPayoutsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.UserAccountsPayouts
        fields = (
            "id",
            "entity_subscription",
            "entity_subscription_title",
            "account_from",
            "account_to",
            "status",
            "currency",
            "amount",
            "valid_from",
            "valid_to",
            "is_valid",
            "narrative",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    def get_sacco_subscription_title(self,obj):
        return obj.sacco_subscription.title
    
    def get_schedule(self,obj):
        return obj.sacco_subscription.schedule
    
    def get_is_valid(self,obj):
        today = datetime.today()
        if  models.SaccoSubscriptionPayment.objects.filter(id=obj.id,valid_to__gte=datetime.now(),status="SETTLED").exists():
            return "TRUE"
        else:
            return "FALSE"


class UserAccountsPayinsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.UserAccountsPayins
        fields ="__all__"
        read_only_fields = ("owner", "created", "updated", "id")



class BankClientEntitySerializer(serializers.ModelSerializer):
    """Bank client entity serializer"""
    class Meta:
        model = models.BankClientEntity
        fields = ("id", "entity", "client_entity", "currency", "bank_account_number",
                  "bank_account_name", "owner", "created", "updated")

        read_only_fields = ("id", "created", "updated")


class BankFacilitySerializer(serializers.ModelSerializer):
    """Bank facility serializer"""
    retailer_order = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = models.BankFacility
        fields = ("id",  "retailer_order", "loan_amount", "created", "updated")

        read_only_fields = ("id", "created", "updated")

        verbose_name = "Bank Facility"
        verbose_name_plural = "Bank Facilities"
    
    def get_retailer_order(self, obj):
        if obj.retailer_order:
            return obj.retailer_order.id
        return None
    
