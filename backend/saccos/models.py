from django.db import models
from core.models import EntityRelatedModel
from authentication.models import EntityBranches,Users,Entities
from django.utils.text import slugify
from django_advance_thumbnail import AdvanceThumbnailField
from django.core.files import File
from io import BytesIO
from PIL import Image
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator, MaxValueValidator


TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)

GENDER_CHOICES = (
    ("Female", "Female"),
    ("Male", "Male"),
    ("Other", "Other"),
)
RELATION_CHOICES = (
    ("CHILD", "CHILD"),
    ("OTHER", "OTHER"),
    ("PARENT", "PARENT"),
    ("SIBLING", "SIBLING"),
    ("SPOUSE", "SPOUSE"),
)
DOCUMENT_TYPE_CHOICES = (
    ("NationalId", "NationalId"),
    ("Passport", "Passport"),
)


 
class SaccoMsisdns(EntityRelatedModel):
    branch = models.ForeignKey(
        EntityBranches,
        related_name="saccoMsisdnBranch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    msisdn = models.CharField(max_length=20, unique=True)
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoMsisdnMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoMsisdnChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoMsisdnApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)   
    updated = models.DateTimeField(auto_now=True)

class SaccoAssetTypeOptions(models.TextChoices):
        FINANCIAL = "FINANCIAL", _("FINANCIAL")
        INTANGIBLE = "INTANGIBLE", _("INTANGIBLE")
        PHYSICAL = "PHYSICAL", _("PHYSICAL")
class SaccoAssets(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Sacco's Assets"

    branch = models.ForeignKey(
        EntityBranches,
        related_name="saccoAssetBranch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    assetTitle = models.CharField(max_length=256)
    assetDescription = models.TextField(null=True,blank=True)
    assetType = models.CharField(
        verbose_name=_("Sacco Asset Type"),
        choices=SaccoAssetTypeOptions.choices,
        max_length=20,
    )
    administrator = models.ForeignKey(
        "employees.Employees",
        related_name="saccoAssetAdministrator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    currentValue = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )
    depreciationRate = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )
    
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )

    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoAssetMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoAssetChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoAssetApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class SaccoALiabilityTypeOptions(models.TextChoices):
        CURRENT = "CURRENT", _("CURRENT")
        NON_CURRENT = "NON_CURRENT", _("NON_CURRENT")
   
       

class SaccoLiabilities(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Sacco's Liabilities"

    branch = models.ForeignKey(
        EntityBranches,
        related_name="saccoLiabilityBranch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    assetTitle = models.CharField(max_length=256)
    assetDescription = models.TextField(null=True,blank=True)
    assetType = models.CharField(
        verbose_name=_("Sacco Lability Type"),
        choices=SaccoALiabilityTypeOptions.choices,
        max_length=20,
    )
    administrator = models.ForeignKey(
        "employees.Employees",
        related_name="saccoLiabilityAdministrator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    currentAmount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )

    
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )

    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoLiabilityMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoLiabilityChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoLiabilityApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    dateDue=models.DateField(null=True,blank=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class SaccoAccountTypeOptions(models.TextChoices):
        COLLECTION = "COLLECTION", _("COLLECTION")
        PAYOUT = "PAYOUT", _("PAYOUT")

class SaccoAccounts(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Sacco's Accounts"

    branch = models.ForeignKey(
        EntityBranches,
        related_name="saccoAccountBranch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    accountType = models.CharField(
        verbose_name=_("Sacco Account Type"),
        choices=SaccoAccountTypeOptions.choices,
        max_length=20,
    )
    accountDescription = models.CharField(
    null=True,blank=True,
        max_length=256,
    )
    administrator = models.ForeignKey(
        "employees.Employees",
        related_name="employeeAccountAdministrator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    currentBalance = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )
    minimumBalance = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )
    currency = models.CharField(max_length=10)
    accountNumber = models.CharField(max_length=10)
    accountName = models.CharField(max_length=256)
    accountPhone = models.CharField(max_length=56)
    
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    signatories=models.ManyToManyField("employees.Employees")

    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoAccountMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoAccountChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoAccountApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Tellers(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Tellers"
    branch = models.ForeignKey(
        EntityBranches,
        related_name="tellerBranch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    employee = models.ForeignKey(
        "employees.Employees",
        related_name="tellerEmployee",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    floatLimit = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )

    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="tellerMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="tellerChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="tellerApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Cashiers(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Tellers"
    branch = models.ForeignKey(
        EntityBranches,
        related_name="cashierBranch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    employee = models.ForeignKey(
        "employees.Employees",
        related_name="cashierEmployee",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    floatLimit = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )

    owner = models.ForeignKey(
        Users,
        related_name="teller_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="cashierMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="cashierChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="cashierApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

def member_photo_upload_to(instance, filename):
    title = instance.id
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename

def member_signature_upload_to(instance, filename):
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

class MemberPhotos(EntityRelatedModel):
    """Member Photos"""

    member = models.ForeignKey(
        "Members", related_name="member_images", on_delete=models.CASCADE
    )
    photo = models.ImageField(upload_to=member_photo_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/members/photos",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Member Photos"

class MemberSignatures(EntityRelatedModel):
    """Member Signatures"""

    member = models.ForeignKey(
        "Members", related_name="member_signatures", on_delete=models.CASCADE
    )
    signature = models.ImageField(upload_to=member_signature_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/members/signatures",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Member Photos"

class Members(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Members"

    branch = models.ForeignKey(
        EntityBranches,
        related_name="memberBranch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    isBBFMember = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    photos = models.ManyToManyField(MemberPhotos, related_name="photos", blank=True)
    signatures = models.ManyToManyField(MemberSignatures, related_name="signatures", blank=True)
    user = models.ForeignKey(
        Users,
        related_name="memberUser",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    internalCreditScore = models.IntegerField(
                      validators=[MinValueValidator(250),
                                  MaxValueValidator(900)],default=250)
    externalCreditScore = models.IntegerField(
                      validators=[MinValueValidator(250),
                                  MaxValueValidator(900)],default=250)
    occupation = models.CharField(max_length=120,null=True,blank=True)
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    def save(self, *args, **kwargs):
        self.occupation = self.occupation.upper()
        super(Members, self).save(*args, **kwargs)
    def __str__(self):
        return f"{self.user.first_name} {self.user.last_name} - {self.user.phone}"

class NextOfKins(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Members"

    member = models.ForeignKey(
        Members,
        related_name="nextOfKinMember",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    email = models.EmailField(max_length=100)
    phone = models.CharField(max_length=24,)
    relation = models.CharField(max_length=100, choices=RELATION_CHOICES)
    firstName = models.CharField(max_length=256)
    lastName = models.CharField(max_length=256)
    phone = models.CharField(max_length=256)
    identifierType = models.CharField(
        max_length=50, choices=DOCUMENT_TYPE_CHOICES, default="false"
    )
    identifierNumber = models.CharField(max_length=50,null=True, blank=True)
    gender = models.CharField(max_length=100, choices=GENDER_CHOICES)

    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="nextOfKinMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="nextOfKinChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="nextOfKinApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Referees(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Members"

    member = models.ForeignKey(
        Members,
        related_name="refereeMember",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    email = models.EmailField(max_length=100,unique=True)
    phone = models.CharField(max_length=24,)
    firstName = models.CharField(max_length=256)
    lastName = models.CharField(max_length=256)
    phone = models.CharField(max_length=256)
    identifierType = models.CharField(
        max_length=50, choices=DOCUMENT_TYPE_CHOICES, default="false"
    )
    identifierNumber = models.CharField(max_length=50,null=True, blank=True)
    gender = models.CharField(max_length=100, choices=GENDER_CHOICES)

    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="refereeMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="refereeChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="refereeApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Recruiters(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Members"

    member = models.ForeignKey(
        Members,
        related_name="recruiterMember",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    recruiter = models.ForeignKey(
        "employees.Employees",
        related_name="recruitingEmployee",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="recruiterMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="recruiterChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="recruiterApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class MemberAccountNatureOptions(models.TextChoices):
        INDIVIDUAL = "INDIVIDUAL", _("INDIVIDUAL")
        GROUP = "GROUP", _("GROUP")

class MemberAccountTypeOptions(models.TextChoices):
        FIXED = "FIXED DEPOSIT", _("FIXED DEPOSIT")
        SAVINGS = "SAVINGS ACCOUNT", _("SAVINGS ACCOUNT")
        SHARES = "SHARES DEPOSITS", _("SHARES DEPOSITS")
        TERM = "TERM DEPOSITS", _("TERM DEPOSITS")


def member_account_document_upload_to(instance, filename):
    title = instance.id
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename

class MemberAccountDocuments(EntityRelatedModel):
    """Member account"""

    memberAccount = models.ForeignKey(
        "MemberAccounts", related_name="memberAccountDocumentsAccount", on_delete=models.CASCADE
    )
    photo = models.ImageField(upload_to=member_account_document_upload_to)
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/members/accounts/documents",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Member Account Documents"

class MemberAccounts(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Member's Accounts"

    branch = models.ForeignKey(
        EntityBranches,
        related_name="memberAccountBranch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    accountNature = models.CharField(
        verbose_name=_("Account Nature"),
        choices=MemberAccountNatureOptions.choices,
        max_length=20,
    )
    accountType = models.CharField(
        verbose_name=_("Account Type"),
        choices=MemberAccountTypeOptions.choices,
        max_length=20,
    )
    accountAdministrator = models.ForeignKey(
        Members,
        related_name="memberAccountAdminisrator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    memberAccountDocuments = models.ManyToManyField(MemberAccountDocuments, related_name="memberAccountDocuments", blank=True)
    currentBalance = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )
    minimumBalance = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )
    currency = models.CharField(max_length=10)
    accountNumber = models.CharField(max_length=10)
    accountName = models.CharField(max_length=256)
    accountPhone = models.CharField(max_length=56)
    
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    signatories=models.ManyToManyField(Members)

    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class MemberAccountTransactionTypeOptions(models.TextChoices):
        DEPOSIT = "DEPOSIT", _("DEPOSIT")
        WITHDRAWAL = "WITHDRAWAL", _("WITHDRAWAL")
        
class MemberAccountTransactionStatusOptions(models.TextChoices):
        FAILED = "FAILED", _("FAILED")
        INITIATED = "INITIATED", _("DEPOSIT")
        PENDING = "PENDING", _("PENDING")
        SUCCESS = "SUCCESS", _("SUCCESS")

class DestinationAccountTypeOptions(models.TextChoices):
        AIRTEL = "AIRTEL", _("AIRTEL")
        MPESA = "MPESA", _("MPESA")
        MEMBER = "MEMBER", _("MEMBER")
        PAYBILL = "PAYBILL", _("PAYBILL")
        SACCO = "SACCO", _("SACCO")
        TILL = "TILL", _("TILL")
class OriginAccountTypeOptions(models.TextChoices):
        ACCOUNT = "ACCOUNT", _("ACCOUNT")
        FOSA = "FOSA", _("FOSA")
        MOBILE = "MOBILE", _("MOBILE")

class MemberAccountTransactions(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Member's Account Transactions"

    branch = models.ForeignKey(
        EntityBranches,
        related_name="memberTransactionBranch",
        on_delete=models.CASCADE,
    )
    MemberAccount = models.ForeignKey(
        MemberAccounts,
        related_name="memberBranch",
        on_delete=models.CASCADE,
        
    )
    memberAccountTo = models.ForeignKey(
        MemberAccounts,
        related_name="transactionMemberAccountTo",
        on_delete=models.CASCADE,
        null=True,
        blank=True
        
    )
    saccoAccountTo = models.ForeignKey(
        SaccoAccounts,
        related_name="transactionSaccoAccountTo",
        on_delete=models.CASCADE,
        null=True,
        blank=True
        
    )
    transactionAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    externalAccountToNumber = models.CharField(max_length=50,null=True, blank=True)
    externalAccountToRef = models.CharField(max_length=50,null=True, blank=True)
    externalBankCode = models.CharField(max_length=50,null=True, blank=True)

    transactionType = models.CharField(
        verbose_name=_("Account Nature"),
        choices=MemberAccountTransactionTypeOptions.choices,
        max_length=50,
    )
    transactionStatus = models.CharField(
        verbose_name=_("Transaction Status"),
        choices=MemberAccountTransactionStatusOptions.choices,
        max_length=50,
        default="INITIATED"
    )
    destinationAccountType = models.CharField(
        verbose_name=_("Destination Account Type"),
        choices=DestinationAccountTypeOptions.choices,
        max_length=50,
    )
    originAccountType = models.CharField(
        verbose_name=_("Origin Account Type"),
        choices=OriginAccountTypeOptions.choices,
        max_length=50,
    )

    referenceNumber = models.CharField(max_length=50,null=True, blank=True)
    narrative = models.CharField(max_length=256,null=True, blank=True)

    madeBy = models.ForeignKey(
        Users,
        related_name="memberAccountTransactionMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountTransactionChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountTransactionApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class MemberAccountNominees(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Member's Accounts Nominees"

    memberAccount = models.ForeignKey(
        MemberAccounts,
        related_name="nomineedAccount",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )


    firstName = models.CharField(max_length=256)
    lastName = models.CharField(max_length=256)
    phone = models.CharField(max_length=256)
  
    identifierType = models.CharField(
        max_length=50, choices=DOCUMENT_TYPE_CHOICES, default="false"
    )
    identifierNumber = models.CharField(max_length=50,null=True, blank=True)
    gender = models.CharField(max_length=100, choices=GENDER_CHOICES)
    relation = models.CharField(max_length=100, choices=RELATION_CHOICES)

    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )

    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountNomineeMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountNomineeChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountNomineeApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class MemberAccountATMCards(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Member's Accounts ATM Cards"

    memberAccount = models.ForeignKey(
        MemberAccounts,
        related_name="ATMCardAccount",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    cardNumber = models.CharField(max_length=256)
    expiryDate = models.DateField()
    issueDate = models.DateField()
    collectionDate = models.DateField()
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountATMCardsMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountATMCardsChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="memberAccountATMCardsApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Guarantors(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Loan Application Guarantors"
    member = models.ForeignKey(
        Members,
        related_name="guarantorMember",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    loan = models.ForeignKey(
        "saccos.LoanApplications",
        related_name="GuarantoLoan",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )

    guaranteedAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="guarantorMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="guarantorChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="guarantorApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class SaccoProducts(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Products"
    interestRate = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    maximumPeriodIMonths=models.IntegerField()
    title = models.CharField(max_length=256)
    description = models.CharField(max_length=256)
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoProductMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoProductChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="saccoProductApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    checked = models.DateTimeField(null=True,blank=True)
    approved= models.DateTimeField(null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(SaccoProducts, self).save(*args, **kwargs)

class Collaterals(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Loan Collaterals"
    member = models.ForeignKey(
        Members,
        related_name="loanAplicationMember",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    loanApplication = models.ForeignKey(
        "saccos.LoanApplications",
        related_name="loanAplicationCollateral",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256)
    description = models.TextField()
    currentValue = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="collateralMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="collateralChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="collateralApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Collaterals, self).save(*args, **kwargs)

class LoanApplicationStatusOptions(models.TextChoices):
        APPROVED = "APPROVED", _("APPROVED")
        CANCELLED = "CANCELLED", _("CANCELLED")
        PROCESSING = "PROCESSING", _("PROCESSING")
        REJECTED = "REJECTED", _("REJECTED")

class LoanApplications(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Loan Applications"
    branch = models.ForeignKey(
        EntityBranches,
        related_name="loanApplicationBranch",
        on_delete=models.CASCADE,
    
    )
    memberAccount = models.ForeignKey(
        MemberAccounts,
        related_name="loanApplicationAccount",
        on_delete=models.CASCADE,
    
    )
    status = models.CharField(
        verbose_name=_("Loan Application Status"),
        choices=LoanApplicationStatusOptions.choices,
        max_length=20,
        default="PROCESSING"
    )
    product = models.ForeignKey(
        SaccoProducts,
        related_name="loanProduct",
        on_delete=models.CASCADE,
    )
    loanReason = models.CharField(max_length=256)
    
    outstandingLoansCount=models.IntegerField()
    outstandingLoansValue = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    amountApplied = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    totalDeposits = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    grossSalary = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    totalSalaryDeductions = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    netSalary = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    guarantors = models.ManyToManyField(Guarantors)
    collaterals = models.ManyToManyField(Collaterals)
    rejectionReason = models.CharField(max_length=256)
    cancellatonReason = models.CharField(max_length=256)
    registeredBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanApplicationMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    appraisedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanApplicationAppraiser",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanApplicationApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class SaccoCharges(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Sacco Charges" 
    saccoProduct = models.ForeignKey(
        SaccoProducts,
        related_name="saccoChargeProduct",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256)
    description = models.TextField(max_length=256)
    rate = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )  
    amount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )      
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanChargeMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanChargeChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanChargeApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Loans(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Loan Applications"
    branch = models.ForeignKey(
        EntityBranches,
        related_name="loanBranch",
        on_delete=models.CASCADE,
    
    )
    loanApplication = models.ForeignKey(
        LoanApplications,
        related_name="loanAplicationForLoan",
        on_delete=models.CASCADE,
    )
    creditAccount = models.ForeignKey(
        MemberAccounts,
        related_name="loanPayoutAccount",
        on_delete=models.CASCADE,
    
    )
    loanOfficer = models.ForeignKey(
        "employees.Employees",
        related_name="loanLoanOfficer",
        on_delete=models.CASCADE,
    
    )
    amountApplied = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    amountApproved = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    amountDisbursed = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    currentInterest = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    netPayable = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    totalCharges = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    startDate = models.DateField(auto_now_add=True)
    loanTerm = models.IntegerField()
    saccoCharges = models.ManyToManyField(SaccoCharges)
    isActive = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class LoanDefferments(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Loan Defferments" 
    loan = models.ForeignKey(
        Loans,
        related_name="loanToDeffer",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    deferFrom = models.DateField()  
    deferTo = models.DateField()  
    deffermentReason = models.CharField(max_length=256)     
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanDeffermentMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanDeffermentChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanDeffermentApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class LoanInterestCapitalizations(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Loan Interest Capitalization" 
    loan = models.ForeignKey(
        Loans,
        related_name="loanToCapitalizeInterest",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    initialPrincipalBalance = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    ) 
    interestAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    ) 
    finalPrincipalAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )     
    finalInterestRate = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    saccoCharges = models.ManyToManyField(SaccoCharges)  
    amountDisbursed = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )   
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="interestCapitalizationMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="interestCapitalizationChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="interestCapitalizationApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class LoanRepaymentTypeOptions(models.TextChoices):
    EARLY = "EARLY", _("EARLY")
    LATE = "LATE", _("LATE")
    PARTIAL = "PARTIAL", _("PARTIAL")
    TIMELY = "TIMELY", _("TIMELY")

class LoanRepaymentScheduleOptions(models.TextChoices):
    BALLOON = "BALLOON", _("BALLOON")
    SCHEDULED = "SCHEDULED", _("SCHEDULED")

class LoanRepayments(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Loan Repayments" 
    loan = models.ForeignKey(
        Loans,
        related_name="loanToRepay",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="loanRepaymentTransaction",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    repaymentType = models.CharField(
        verbose_name=_("Loan Repayment Type"),
        choices=LoanRepaymentTypeOptions.choices,
        max_length=20,
    )
    repaymentchedule = models.CharField(
        verbose_name=_("Loan Repayment Schedule"),
        choices=LoanRepaymentScheduleOptions.choices,
        max_length=20,
    )
    repaymentAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    madeBy = models.ForeignKey(
        Users,
        related_name="loanRepaymentMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanRepaymentChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="loanRepaymentApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class Dividends(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Dividends" 
    narrative = models.CharField(max_length=256)

    rate = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    periodFrom=models.DateField()
    periodTo=models.DateField()
    totalApplyingShares= models.IntegerField()
    totalPayableDividend = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
        )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="dividendMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="dividendChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="dividendApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class DividendPayouts(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Dividends Payouts" 
    dividend = models.ForeignKey(
        Dividends,
        related_name="payoutDividend",
        on_delete=models.CASCADE,
       
    )
    payoutAccount = models.ForeignKey(
        MemberAccounts,
        related_name="dividendPayoutAccount",
        on_delete=models.CASCADE,
    
    )
    dividendAmount = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    deductableAccruedInterest = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    netPayableDividend = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="dividendPayoutMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="dividendPayoutChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="dividendPayoutApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class AdvancesAgainstDepositInterests(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Advances Against Interest On Deposits" 
    memberAccount = models.ForeignKey(
        MemberAccounts,
        related_name="depositMemberAccount",
        on_delete=models.CASCADE,
       
    )

    interestRate = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    advancibleAmount = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    interestOnAdvance = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    netAdvanceAmount = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="advanceAgainstDepositInterestPayoutMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="advanceAgainstDepositInterestPayoutChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="advanceAgainstDepositInterestPayoutApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class AdvancesAgainstDepositInterestPayouts(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Advances Against Interest On Deposits" 
    advancesAgainstDepositInterests = models.ForeignKey(
        AdvancesAgainstDepositInterests,
        related_name="depositMemberAccount",
        on_delete=models.CASCADE,
       
    )
    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="dividendPayoutTransction",
        on_delete=models.CASCADE,
       
    )

    amount = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="advancesInterestPayoutMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="advancesInterestPayoutChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="advancesInterestPayoutApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class AdvancesAgainstDepositInterestChargesCollections(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Advances Against Interest On Deposits Charges" 
    advancesAgainstDepositInterests = models.ForeignKey(
        AdvancesAgainstDepositInterests,
        related_name="advancesAgainstDepositInterestsCollection",
        on_delete=models.CASCADE,
       
    )
    amount = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="collectionTransaction",
        on_delete=models.CASCADE,
       
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="advancesInterestCollectionMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="advancesInterestCollectionChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="advancesInterestCollectionApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class FixedDeposits(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Fixed Deposits" 
    
    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="fixedDepositTransaction",
        on_delete=models.CASCADE,
    
    )

    interestRate = models.DecimalField(
    max_digits=5, decimal_places=2, null=True, blank=True
    )
    fixedDepositAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    guaranteedLoans=models.ManyToManyField(Guarantors)
    depositDate = models.DateField()
    maturityDate = models.DateField()
    isCancelled = models.CharField(
    max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    isRolledOver = models.CharField(
    max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    rollOverDate = models.DateField()
    cancellationDate = models.DateField(null=True,blank=True)
    madeBy = models.ForeignKey(
        Members,
        related_name="fixedDepositMaker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="fixedDepositChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="fixedDepositApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class BankersChequesDeposits(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Fixed Deposits" 
    
    teller = models.ForeignKey(
        Tellers,
        related_name="bankersChequeDepositTeller",
        on_delete=models.CASCADE,
    
    )
    chequeNumber = models.CharField(max_length=50,null=True, blank=True)
 
    chequeAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    drawerDetails = models.CharField(max_length=50,null=True, blank=True)
    drawerBank = models.ForeignKey(
        Entities,
        related_name="bankersChequeDrawerBank",
        on_delete=models.CASCADE,
    
    )
    payeeDetails = models.CharField(max_length=50,null=True, blank=True)
    payeeAccount = models.ForeignKey(
        MemberAccounts,
        related_name="bankersChequeDepositPayeeAccount",
        on_delete=models.CASCADE,
    
    )
    depositDate = models.DateField()
    maturityDate = models.DateField()
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="bankersChequeDepositedBy",
        on_delete=models.CASCADE,
    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="bankersChequeDepositChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="bankersChequeDepositApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class BankersChequePayouts(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Banker's Cheques Payments" 
    
    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="bankersChequePaymentTransaction",
        on_delete=models.CASCADE,
    
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="bankersChequePayoutMaker",
        on_delete=models.CASCADE,

    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="bankersChequePayoutChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="bankersChequePayoutApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class BankersChequeChargesCollection(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Banker's Cheques Payments" 
    
    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="bankersChequeChargesCollectionTransaction",
        on_delete=models.CASCADE,
    
    )

    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="bankersChequeChargesCollectionMaker",
        on_delete=models.CASCADE,
           null=True,
        blank=True,

    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="bankersChequeChargesCollectionChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="bankersChequeChargesCollectionApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class CashierFloats(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Cashier Floats" 
    
    floatAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="cashierFloatMaker",
        on_delete=models.CASCADE,
           null=True,
        blank=True,

    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="cashierFloatChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="cashierFloatApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class TellerFloats(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Cashier Floats"
    cashierFloat = models.ForeignKey(
        CashierFloats,
        related_name="tellerFloatCashierFloat",
        on_delete=models.CASCADE,
    ) 
    
    floatAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    requisitionDate = models.DateField()
    approvalDate = models.DateField()
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="tellerFloatMaker",
        on_delete=models.CASCADE,
           null=True,
        blank=True,

    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="tellerFloatChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="tellerFloatApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class TellerFloatTransfers(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Cashier Floats"
    tellerFloatTransferFrom = models.ForeignKey(
        Tellers,
        related_name="tellerFloatTransfersFrom",
        on_delete=models.CASCADE,
    ) 
    tellerFloatTransferTo = models.ForeignKey(
        Tellers,
        related_name="tellerFloatTransfersTo",
        on_delete=models.CASCADE,
    ) 
    
    floatTransferAmount = models.DecimalField(
    max_digits=14, decimal_places=2, null=True, blank=True
    )
    requisitionDate = models.DateField()
    approvalDate = models.DateField()
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="tellerFloatTransferMaker",
        on_delete=models.CASCADE,
           null=True,
        blank=True,

    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="tellerFloatTransferChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="tellerFloatTransferApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class CounterCashWithdrawals(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Counter Cash Withdrawals"

    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="counterCashWithdrawalTransaction",
        on_delete=models.CASCADE,
    ) 
    teller = models.ForeignKey(
        Tellers,
        related_name="counterCashWithdrawalTeller",
        on_delete=models.CASCADE,
    ) 
    requiresApproval = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="counterCashWithdrawalMaker",
        on_delete=models.CASCADE,
           null=True,
        blank=True,

    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="counterCashWithdrawalChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="counterCashWithdrawalApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class CounterCashWithdrawalChargesCollections(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Counter Cash Withdrawals Charges Collections"

    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="counterCashWithdrawalChargesCollection",
        on_delete=models.CASCADE,
    ) 

    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="counterCashWithdrawalChargesCollectionsMaker",
        on_delete=models.CASCADE,
           null=True,
        blank=True,

    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="counterCashWithdrawalChargesCollectionsChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="counterCashWithdrawalChargesCollectionsApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class CounterCashDeposits(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Counter Cash Withdrawals"

    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="counterCashDepositTransaction",
        on_delete=models.CASCADE,
    ) 
    teller = models.ForeignKey(
        Tellers,
        related_name="counterCashDepositTeller",
        on_delete=models.CASCADE,
    ) 
    requiresApproval = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    madeBy = models.ForeignKey(
        "employees.Employees",
        related_name="counterCashDepositMaker",
        on_delete=models.CASCADE,
           null=True,
        blank=True,

    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="counterCashDepositChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="counterCashDepositApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class TransactionChannelOptions(models.TextChoices):
        AGENCY = "AGENCY", _("AGENCY")
        BANK = "BANK", _("BANK")
        MOBILE = "MOBILE", _("MOBILE")

class RemoteCashDeposits(EntityRelatedModel):  
    class Meta:
        verbose_name_plural = "Counter Cash Withdrawals"

    transaction = models.ForeignKey(
        MemberAccountTransactions,
        related_name="RemoteDepositTransaction",
        on_delete=models.CASCADE,
    ) 
    transactionChannel = models.CharField(
        verbose_name=_("Remote Deposit Channel"),
        choices=TransactionChannelOptions.choices,
        max_length=50,
    )
    requiresApproval = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    madeBy = models.ForeignKey(
        Members,
        related_name="remteDepositMaker",
        on_delete=models.CASCADE,
           null=True,
        blank=True,

    )
    checkedBy = models.ForeignKey(
        "employees.Employees",
        related_name="remteDepositChecker",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    approvedBy = models.ForeignKey(
        "employees.Employees",
        related_name="remteDepositApprover",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

