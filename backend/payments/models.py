from django.db import models,transaction
import math
import uuid
from core.models import EntityRelatedModel
from django.contrib.auth import get_user_model
from authentication.models import Entities, Countries,EntityBranches
from django.utils.translation import gettext_lazy as _
from encrypted_model_fields.fields import EncryptedCharField
from django_advance_thumbnail import AdvanceThumbnailField
from django.core.files import File
from io import BytesIO
from PIL import Image
from django.utils.text import slugify


Users = get_user_model()

TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)



class PaymentServicesProviderImage(models.Model):
    owner = models.ForeignKey(
        Users,
        related_name="psp_image_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    payment_service_provider = models.ForeignKey(
        "PaymentServicesProvider", on_delete=models.CASCADE, null=True, blank=True
    )
    image = models.FileField(upload_to="psp_image_uploads")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.payment_service_provider.psp_title}'s photos"


class PaymentServicesProvider(models.Model):
    ACCOUNT_PROVIDER_TYPE = (
        ("FINTECH", "FINTECH"),
        ("BANK", "BANK"),
        ("SACCO", "SACCO"),
        ("TELCO", "TELCO"),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    psp_title = models.CharField(
        max_length=256,
    )
    psp_code = models.CharField(
        max_length=256,null=True,blank=True
    )
    psp_country = models.ForeignKey(Countries, on_delete=models.CASCADE)
    psp_type = models.CharField(
        max_length=50,
        choices=ACCOUNT_PROVIDER_TYPE,
    )
    owner = models.ForeignKey(
        Users,
        related_name="account_provider_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    images = models.ManyToManyField(
        PaymentServicesProviderImage,
        related_name="images",blank=True
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.psp_title:
            self.psp_title = self.psp_title.upper()
        super(PaymentServicesProvider, self).save(*args, **kwargs)

    def __str__(self) -> str:
        return self.psp_title
    


class PaymentServicesProviderBranch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    psp = models.ForeignKey(PaymentServicesProvider, on_delete=models.CASCADE)
    psp_branch_title = models.CharField(max_length=256, null=True, blank=True)
    psp_branch_code = models.CharField(max_length=48, null=True, blank=True)
    psp_branch_telephone = models.CharField(max_length=48, null=True, blank=True)
    psp_branch_email = models.CharField(max_length=256, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="psp_branch_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.psp_branch_title:
            self.psp_branch_title = self.psp_branch_title.upper()
        super(PaymentServicesProviderBranch, self).save(*args, **kwargs)


class EntityPSPCollectionAccount(EntityRelatedModel):
    ACCOUNT_TYPE = (
        ("BANK ACCOUNT", "BANK ACCOUNT"),
        ("PAYBILL", "PAYBILL"),
        ("SACCO ACCOUNT", "SACCO ACCOUNT"),
        ("TILL", "TILL"),
        ("WALLET", "WALLET"),
    )
    psp = models.ForeignKey(PaymentServicesProvider, on_delete=models.CASCADE)
    # account_administrator = models.ForeignKey("employees.Employees",related_name="collection_account_administrator", on_delete=models.CASCADE, null=True, blank=True)
    psp_branch = models.ForeignKey(
        PaymentServicesProviderBranch, on_delete=models.CASCADE, null=True, blank=True
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    currency = models.CharField(max_length=10)
    entity_account_number = models.CharField(max_length=256)
    entity_account_name = models.CharField(max_length=256)
    entity_account_phone = models.CharField(max_length=30, null=True, blank=True)
    account_type = models.CharField(
        max_length=50,
        choices=ACCOUNT_TYPE,
    )
    owner = models.ForeignKey(
        Users,
        related_name="entity_collection_account_creator2",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="entity_collection_account_verifier1",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural="Entity Collection Accounts"

    def __str__(self) -> str:
        return str(self.entity_account_number)

class PayoutAccounts(EntityRelatedModel):
    """Entity payout account. This can be payouts to wholesaler bank accounts, wallets and paybills"""
    ACCOUNT_TYPE = (
        ("BANK", "BANK"),
        ("MOBILE", "MOBILE"),
        ("PAYBILL", "PAYBILL"),
        ("SACCO", "SACCO"),
        ("TILL", "TILL"),
        ("WALLET", "WALLET"),
    )
    account_entity = models.ForeignKey(Entities,related_name="payout_receiving_entity", on_delete=models.CASCADE,null=True, blank=True)
    # psp = models.ForeignKey(PaymentServicesProvider, on_delete=models.CASCADE)
    # psp_branch = models.ForeignKey(
    #     PaymentServicesProviderBranch, on_delete=models.CASCADE, null=True, blank=True
    # )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    account_name = models.CharField(max_length=140)
    account_code = models.CharField(max_length=140,null=True,blank=True)
    account_number = models.CharField(max_length=140)
    business_number = models.CharField(max_length=140,null=True,blank=True)
    description =models.CharField(max_length=256, null=True, blank=True)
    account_type = models.CharField(
        max_length=50,
        choices=ACCOUNT_TYPE,
    )
    owner = models.ForeignKey(
        Users,
        related_name="entity_payout_account_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="entity_payout_account_verifier",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.entity.title} - {self.account_number}"

    def save(self, *args, **kwargs):
        # Enforce rule only if this specific account is being set to "true"
        if self.is_active == "true":
            # Protect database integrity against simultaneous requests
            with transaction.atomic():
                # Filter down to only accounts belonging to this specific entity,
                # while excluding the current account instance itself
                other_entity_accounts = PayoutAccounts.objects.filter(
                    entity=self.entity
                ).exclude(
                    pk=self.pk
                )
                
                # Turn off only the active accounts under this exact entity
                other_entity_accounts.filter(is_active="true").update(is_active="false")
                
        # Call the parent save method to commit changes
        super().save(*args, **kwargs)

class EntityPSPSettlementAccount(models.Model):
    ACCOUNT_TYPE = (
        ("BANK ACCOUNT", "BANK ACCOUNT"),
        ("PAYBILL", "PAYBILL"),
        ("SACCO ACCOUNT", "SACCO ACCOUNT"),
        ("TILL", "TILL"),
        ("WALLET", "WALLET"),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entities, on_delete=models.CASCADE)
    psp = models.ForeignKey(PaymentServicesProvider,related_name="settlement_account_psp", on_delete=models.CASCADE)
    psp_branch = models.ForeignKey(
        PaymentServicesProviderBranch,related_name="settlement_account_psp_branch", on_delete=models.CASCADE, null=True, blank=True
    )
    account_code = models.CharField(max_length=10,blank=True)
    account_number = models.CharField(max_length=10)
    account_type = models.CharField(
        max_length=50,
        choices=ACCOUNT_TYPE,
    )
    owner = models.ForeignKey(
        Users,
        related_name="entity_settlement_account_creator3",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="entity_settlement_account_verifier4",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class JambopayUserProfiles(models.Model):
    class Meta:
        verbose_name_plural="User PSP Profiles"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    psp = models.ForeignKey(PaymentServicesProvider, on_delete=models.CASCADE)
    profile_id = models.UUIDField()
    user = models.ForeignKey(
        Users,
        related_name="psp_profile_user",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        Users,
        related_name="psp_profile_verifier",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class PaymentMethodImages(EntityRelatedModel):
    owner = models.ForeignKey(
        "authentication.Users",
        related_name="image_payment_method",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    payment_method = models.ForeignKey(
        "PaymentMethods", on_delete=models.CASCADE, null=True, blank=True
    )
    image = models.FileField(upload_to="payment_method_image_uploads")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Payment Method Images"

    def __str__(self):
        return f"{self.owner.first_name}'s photos"


class PaymentMethods(EntityRelatedModel):
    # TODO : Create views and urls for this model
    """
    Model for all payment methods
    """
    title = models.CharField(max_length=120, unique=True)
    psp = models.ForeignKey(PaymentServicesProvider, on_delete=models.CASCADE,null=True,blank=True)
    description = models.TextField()
    images = models.ManyToManyField(
        PaymentMethodImages,
        related_name="images",blank=True
    )
    is_offline = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    created = models.DateField(auto_now_add=True)
    updated = models.DateField(auto_now=True)
    owner = models.ForeignKey("authentication.Users", on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Payment Methods"

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(PaymentMethods, self).save(*args, **kwargs)


class PriceDiscounts(EntityRelatedModel):
    title = models.CharField(max_length=100)
    percent = models.DecimalField(max_digits=4, decimal_places=2)
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="retail_price_discount_owner", on_delete=models.CASCADE
    )

    def __str__(self):
        return f"{self.title}"


class QuantityDiscounts(EntityRelatedModel):
    title = models.CharField(max_length=200)
    limit_quantity = models.IntegerField(default=0)
    awarded_quantity = models.IntegerField(default=0)
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="retail_quantity_discount_owner", on_delete=models.CASCADE
    )

    # def __str__(self):
    #     return f"{self.title}"


# Entity Branch models
    
# class EntityCollectionAccount(EntityRelatedModel):
#     ACCOUNT_TYPE = (
#         ("BANK ACCOUNT", "BANK ACCOUNT"),
#         ("PAYBILL", "PAYBILL"),
#         ("SACCO ACCOUNT", "SACCO ACCOUNT"),
#         ("TILL", "TILL"),
#         ("WALLET", "WALLET"),
#     )

#     psp = models.ForeignKey(PaymentServicesProvider,related_name="entity_account_psp", on_delete=models.CASCADE)
#     psp_branch = models.ForeignKey(
#         PaymentServicesProviderBranch,related_name="entity_account_psp_branch", on_delete=models.CASCADE, null=True, blank=True
#     )
#     currency = models.CharField(max_length=10)
#     account_number = models.CharField(max_length=10)
#     account_name = models.CharField(max_length=256)
#     account_type = models.CharField(
#         max_length=50,
#         choices=ACCOUNT_TYPE,
#     )
#     owner = models.ForeignKey(
#         Users,
#         related_name="entity_collection_account_created_by",
#         on_delete=models.CASCADE,
#         null=True,
#         blank=True,
#     )

#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)

#     class Meta:
#         verbose_name_plural="Entity Collection Accounts"
#     def __str__(self):
#         return f"{self.account_number} -{self.account_name}"
    
    
class BranchCollectionAccount(EntityRelatedModel):
    ACCOUNT_TYPE = (
        ("BANK ACCOUNT", "BANK ACCOUNT"),
        ("PAYBILL", "PAYBILL"),
        ("SACCO ACCOUNT", "SACCO ACCOUNT"),
        ("TILL", "TILL"),
        ("WALLET", "WALLET"),
    )
    branch = models.ForeignKey(EntityBranches,related_name="account_branch", on_delete=models.CASCADE)
    psp = models.ForeignKey(PaymentServicesProvider,related_name="branch_account_psp", on_delete=models.CASCADE)
    psp_branch = models.ForeignKey(
        PaymentServicesProviderBranch,related_name="brance_account_psp_branch", on_delete=models.CASCADE, null=True, blank=True
    )
    currency = models.CharField(max_length=10)
    account_number = models.CharField(max_length=10)
    account_name = models.CharField(max_length=256)
    account_type = models.CharField(
        max_length=50,
        choices=ACCOUNT_TYPE,
    )
    owner = models.ForeignKey(
        Users,
        related_name="retaurant_branch_account_created_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural="Entity Branch Collection Accounts"
    def __str__(self):
        return f"{self.account_number} -{self.account_name}"

class ScheduleOptions(models.TextChoices):
    ANNUALY = "ANNUALLY", _("ANNUALLY")
    DAILY = "DAILY", _("DAILY")
    MONTHLY = "MONTHLY", _("MONTHLY")
    ONCE = "ONCE", _("ONCE")
    WEEKLY = "WEEKLY", _("WEEKLY")
    
def entity_subscription_image_upload_to(instance, filename):
    title = instance.id
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename

def compress_image(image):
    im = Image.open(image)
    if im.mode != 'RGB':
        im = im.convert('RGB')
    im_io = BytesIO()
    im.save(im_io, 'jpeg', quality=70,optimize=True)
    new_image = File(im_io, name=image.name)
    return new_image


class EntitySubscriptionsBanners(EntityRelatedModel):
    """Model for uploading subscription image"""

    subscription = models.ForeignKey(
        "EntitySubscriptions", related_name="entity_subscription_banners", on_delete=models.CASCADE
    )
    banner = models.ImageField(upload_to=entity_subscription_image_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="banner",
        upload_to="thumbnails/transport/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Subscription Banners"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.banner:
            banner = self.banner
            if (
                banner.size > 0.1 * 1024 * 1024
            ):  # if size greater than 300kb then it will send to compress banner function
                self.banner = compress_image(banner)
        super(EntitySubscriptionsBanners, self).save(*args, **kwargs)

    def __str__(self):
        return self.subscription.title
        
class AccountTypeOptions(models.TextChoices):
    AIRTELMONEY = "AIRTELMONEY", _("AIRTELMONEY")
    BANK = "BANK", _("BANK")
    MPESA = "MPESA", _("MPESA")
    PAYBILL = "PAYBILL", _("PAYBILL")
    TILL = "TILL", _("TILL")
   
class EntitySubscriptions(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Subscriptions"
        unique_together=("entity","title")

    title = models.CharField(max_length=256,)
    banking_partner= models.ForeignKey(PaymentServicesProvider,related_name="entity_subscription_banking_partner", on_delete=models.CASCADE,null=True, blank=True)
    product_partner= models.ForeignKey(Entities,related_name="entity_subscription_product_partner", on_delete=models.CASCADE,null=True, blank=True)
    principal_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    interest_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    repayment_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    interest_rate = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    total_installments = models.IntegerField()
    scheduled_installment_amount = models.DecimalField(max_digits=10, decimal_places=2,default=0.00)
    service_charge = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=48, null=True, blank=True)
    mandatory = models.CharField(
        max_length=10, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    account_to = models.ForeignKey(
        "payments.UserAccounts",
        related_name="entity_subscription_owner",
        on_delete=models.CASCADE,
            null=True,
        blank=True,

    )
    owner = models.ForeignKey(
        Users,
        related_name="entity_subscription_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    banners = models.ManyToManyField(EntitySubscriptionsBanners, related_name="banners", blank=True)
    schedule = models.CharField(
        verbose_name=_("Schedule"),
        choices=ScheduleOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )

    payout_account_type = models.CharField(
        verbose_name=_("Payout Account Type"),
        choices=AccountTypeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    payout_account_number = models.CharField(max_length=100)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        # Compute daily installment
        self.scheduled_installment_amount=math.ceil((float(self.principal_amount)+float(self.service_charge))/float(self.total_installments))
        # Apply mandatory subscriptions to all entity wallet holders
        all_wallets =UserAccounts.objects.filter(entity=self.entity)
        if self.mandatory=="true":
            for wallet in all_wallets:
                wallet.entity_subscriptions.add(self)
        super(EntitySubscriptions, self).save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.title} - {self.schedule}"
    
class AccountOwnershipOptions(models.TextChoices):
    CORPORATE = "CORPORATE", _("CORPORATE")
    INDIVIDUAL = "INDIVIDUAL", _("INDIVIDUAL")


class UserAccounts(EntityRelatedModel):
    ACCOUNT_TYPE = (
        ("BANK ACCOUNT", "BANK ACCOUNT"),
        ("PAYBILL", "PAYBILL"),
        ("SACCO ACCOUNT", "SACCO ACCOUNT"),
        ("TILL", "TILL"),
        ("WALLET", "WALLET"),
    )

    psp = models.ForeignKey(PaymentServicesProvider,related_name="user_account_psp", on_delete=models.CASCADE)
    psp_branch = models.ForeignKey(
        PaymentServicesProviderBranch,related_name="user_account_psp_branch", on_delete=models.CASCADE, null=True, blank=True
    )
    currency = models.CharField(max_length=10)
    account_number = models.CharField(max_length=10)
    account_name = models.CharField(max_length=256)
    account_phone = models.CharField(max_length=56)
    account_type = models.CharField(
        max_length=50,
        choices=ACCOUNT_TYPE,
    )
    account_ownership = models.CharField(
        verbose_name=_("Account Ownership"),
        choices=AccountOwnershipOptions.choices,
        max_length=100,
        default=AccountOwnershipOptions.INDIVIDUAL
    )
    entity_subscriptions = models.ManyToManyField(EntitySubscriptions, related_name="user_accounts_entity_subscriptions", blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="user_account_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural="User Accounts"
    def __str__(self):
        return f"{self.account_number} -{self.account_name}"
    


class StatusOptions(models.TextChoices):
    INITIATED = "INITIATED", _("INITIATED")
    SUCCESS = "SUCCESS", _("SUCCESS")
    FAILED = "FAILED", _("FAILED")
    PENDING = "PENDING", _("PENDING")
    SETTLED = "SETTLED", _("SETTLED")

class NarrativeOptions(models.TextChoices):
    SUBSCRIPTION = "SUBSCRIPTION", _("SUBSCRIPTION")
    INVOICE = "INVOICE", _("INVOICE")
    CHARGE = "CHARGE", _("CHARGE")


class UserAccountsPayouts(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "User Account Payouts"

    entity_subscription = models.ForeignKey(
        EntitySubscriptions,
        related_name="payout_subscription",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    ) 
    account_from = models.ForeignKey(
        UserAccounts,
        related_name="payout_account_from",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    payout_account_type = models.CharField(
        verbose_name=_("Payout Account Type"),
        choices=AccountTypeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    payout_account_number = models.CharField(max_length=100)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    narrative = models.CharField(
        verbose_name=_("Status"),
        choices=NarrativeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    ref =models.TextField(null=True,blank=True)
    order_id =models.TextField(null=True,blank=True)
    otp_to =models.TextField(null=True,blank=True)
    description =models.TextField(null=True,blank=True)
    reference_number =models.TextField(null=True,blank=True)
    validity_days=models.IntegerField(default=0)
    valid_from= models.DateField(null=True,blank=True)
    valid_to= models.DateField(null=True,blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="payout_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True) 

class UserAccountsPayins(EntityRelatedModel):
    entity_subscription = models.ForeignKey(
        EntitySubscriptions,
        related_name="payin_subscription",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural = "User Account Pay Ins"
    account = models.ForeignKey(
        UserAccounts,
        related_name="payin_account",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    account_from = models.ForeignKey(
        UserAccounts,
        related_name="payin_account_from",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    payin_account_type = models.CharField(
        verbose_name=_("Pay In Account Type"),
        choices=AccountTypeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    payin_account_number = models.CharField(max_length=100)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    narrative = models.CharField(
        verbose_name=_("Narrative"),
        choices=NarrativeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    ref =models.TextField(null=True,blank=True)
    rrn =models.TextField(null=True,blank=True)
    psp_reference_number =models.TextField(null=True,blank=True)
    order_id =models.TextField(null=True,blank=True)
    otp_to =models.TextField(null=True,blank=True)
    description =models.TextField(null=True,blank=True)
    reference_number =models.TextField(null=True,blank=True)
    validity_days=models.IntegerField(default=0)
    valid_from= models.DateField(null=True,blank=True)
    valid_to= models.DateField(null=True,blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="payin_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True) 


class EntitySubscriptionsPayouts(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Subscriptions Payments"

    entity_subscription = models.ForeignKey(
        EntitySubscriptions,
        related_name="entity_subscription_payment_subscription",
        on_delete=models.CASCADE,
    )
    account_from = models.ForeignKey(
        UserAccounts,
        related_name="entity_subscription_payment_account_from",
        on_delete=models.CASCADE,
    )
    account_to = models.ForeignKey(
        UserAccounts,
        related_name="entity_subscription_payment_account_to",
        on_delete=models.CASCADE,
    )
    owner = models.ForeignKey(
        Users,
        related_name="entity_subscription_payment_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    psp_reference_number = models.CharField(max_length=120, null=False, blank=False)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
        default="INITIATED"
    )

   

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.entity_subscription.title}"

class EntitySubscriptionsDailyLog(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Daily Log"

    entity_subscription = models.ForeignKey(
        EntitySubscriptions,
        related_name="daily_log_entity_subscription",
        on_delete=models.CASCADE,
    )             
    account_from = models.ForeignKey(
        UserAccounts,
        related_name="daily_log_user_account",
        on_delete=models.CASCADE,
    )

    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )

    month = models.CharField(
            verbose_name=_("Subscription Month"),
            max_length=50,
        )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.entity_subscription.title}"

class NarrativeOptions(models.TextChoices):
    COMMISION = "COMMISION", _("COMMISION")
    REGISTRATION = "REGISTRATION", _("REGISTRATION")

class EntityRegistrationFeePayments(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Entity Registration Fee Payments"
    account_from = models.ForeignKey(
        UserAccounts,
        related_name="payment_account_from",
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    provider_reference_number = models.CharField(max_length=56)             
    psp_reference_number = models.CharField(max_length=56)             
    reference_number = models.CharField(max_length=56)             
    telco = models.CharField(max_length=56)             
    msisdn = models.CharField(max_length=24)             
    narrative = models.CharField(
        verbose_name=_("Status"),
        choices=NarrativeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        related_name="entity_registration_fee_payment_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.entity.title}"
    

class TransferTo(models.TextChoices):
    OtherJambopayWalletUsers = "OtherJambopayWalletUsers", _("OtherJambopayWalletUsers")
    UnregisteredUsers = "UnregisteredUsers", _("UnregisteredUsers")
    WithdrawAtJambopayAgent = "WithdrawAtJambopayAgent", _("WithdrawAtJambopayAgent")
    BankAccount = "BankAccount", _("BankAccount")
    JambopayTill = "JambopayTill", _("JambopayTill")

class PeerToPeerPayments(models.Model):
    class Meta:
        verbose_name_plural = "Peer To Peer Payments"
          
    status = models.CharField(max_length=56)             
    amount = models.CharField(max_length=56)             
    ref = models.CharField(max_length=112)             
    orderId = models.CharField(max_length=112)             
    description = models.CharField(max_length=256)             
    providerRef = models.CharField(max_length=24)             
    runningBalance = models.CharField(max_length=24)             
    checksum = models.CharField(max_length=256)             
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

# class JambopayTarrifs(models.Model):
#     id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
#     min_amount = models.DecimalField(max_digits=9, decimal_places=2)
#     max_amount = models.DecimalField(max_digits=9, decimal_places=2)
#     transfer_to = models.CharField(
#         verbose_name=_("Transfer To"),
#         choices=TransferTo.choices,
#         max_length=50,
#     )
#     charge = models.DecimalField(max_digits=9, decimal_places=2)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)
#     owner = models.ForeignKey(
#         Users, related_name="tarrif_added_by", on_delete=models.CASCADE
#     )

class TransferTo(models.TextChoices):
    B2B = "B2B", _("B2B")
    B2C = "B2C", _("B2C")

class PSPChoices(models.TextChoices):
    AIRTEL = "AIRTEL", _("AIRTEL")
    BANK = "BANK", _("BANK")
    JAMBOPAY = "JAMBOPAY", _("JAMBOPAY")
    MPESA = "MPESA", _("MPESA")



class JambopayTarrifs(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    min_amount = models.DecimalField(max_digits=9, decimal_places=2)
    max_amount = models.DecimalField(max_digits=9, decimal_places=2)
    psp = models.CharField(
        verbose_name=_("Payment Service Provider"),
        choices=PSPChoices.choices,
        max_length=50,
        null=True,
        blank=True
    )
    transfer_to = models.CharField(
        verbose_name=_("Transfer To"),
        choices=TransferTo.choices,
        max_length=50,
    )
    charge = models.DecimalField(max_digits=9, decimal_places=2)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users, related_name="tarrif_added_by", on_delete=models.CASCADE
    )


class BankClientEntity(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Bank Client Entities"
    bank = models.ForeignKey(
        Entities,
        related_name="bank",
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    client_entity = models.ForeignKey(
        Entities,
        related_name="client_entity",
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    currency = models.CharField(max_length=10)
    bank_account_number = models.CharField(max_length=256)
    is_verified= models.CharField(
        max_length=256, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    bank_account_name = models.CharField(max_length=256)
    verified_by = models.ForeignKey(
        Users,
        related_name="bank_client_verified_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    owner =  models.ForeignKey(
        Users,
        related_name="bank_client_owner",
        on_delete=models.CASCADE,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class BankFacility(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Bank Facilities" 
    # facility_client = models.ForeignKey(
    #     "wholesalers.RetailerOrders",
    #     related_name="bank_facility_retailer_order",
    #     on_delete=models.CASCADE,
    #     null=True,
    #     blank=True
    # )
    retailer_order = models.ForeignKey(
        BankClientEntity,
        related_name="bank_facility_client",
        on_delete=models.CASCADE,
    )
    online_collection = models.DecimalField(max_digits=12, decimal_places=2,default=0.00 )
    offline_collection = models.DecimalField(max_digits=12, decimal_places=2,default=0.00)
    cash_collection = models.DecimalField(max_digits=12, decimal_places=2,default=0.00)
    loan_amount = models.DecimalField(max_digits=12, decimal_places=2)
    active_loans = models.IntegerField()
    repaid_loans = models.IntegerField()
    loan_term = models.IntegerField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    is_approved = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    approved_by =  models.ForeignKey(
        Users,
        related_name="bank_facility_approver",
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    owner  = models.ForeignKey(
        Users,
        related_name="bank_facility_owner",
        on_delete=models.CASCADE,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)



class OfflinePayments(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(max_length=20)
    ref = models.CharField(max_length=256)
    checksum = models.CharField(max_length=256)
    orderId = models.CharField(max_length=256)
    accountNo = models.CharField(max_length=112)
    providerRef = models.CharField(max_length=112)
    description = models.TextField(null=True,blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        memberAccount = None
        if self.accountNo:
            if "saccos.MemberAccounts".objects.filter(accountNumber=self.accountNo).exists():
                memberAccount="saccos.MemberAccounts".objects.filter(accountNumber=self.accountNo).first()
                created ="saccos.MemberAccountTransactions".objects.create(
                    memberAccount=memberAccount,
                    branch = memberAccount.branch,
                    transactionType = "DEPOSIT",
                    originAccountType="MOBILE",
                    transactionStatus=self.status,
                    referenceNumber=self.providerRef,
                    transactionAmount=self.amount,
                    

                )

        super(PaymentServicesProvider, self).save(*args, **kwargs)
