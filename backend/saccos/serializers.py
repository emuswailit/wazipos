from rest_framework import serializers, exceptions,status
from . import models
from authentication.models import Users,UserDocuments
from authentication.serializers import UserDocumentsSerializer
from core.responses import custom_error_response
from core.phone_number_utils import get_telco_by_phone_number

class SaccoAccountsSerializer(serializers.ModelSerializer):
    branchTitle = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.SaccoAccounts
        fields = (
            "id",
            "branch",
            "branchTitle",
            "accountDescription",
            "accountType",
            "administrator",
            "currentBalance",
            "minimumBalance",
            "accountNumber",
            "accountName",
            "accountPhone",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")
    def get_branchTitle(self,obj):
        if obj.branch:
            return f"{obj.branch.title}"
        else:
            return "No Branch Assigned" 

class TellersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Tellers
        fields = (
            "id",
            "branch",
            "employee",
            "floatLimit",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class CashiersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Cashiers
        fields = (
            "id",
            "branch",
            "employee",
            "floatLimit",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")


class MemberPhotosSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MemberPhotos
        fields = (
            "id",
            "member",
            "photo",
            "thumbnail",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class MemberSignaturesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MemberSignatures
        fields = (
            "id",
            "member",
            "signature",
            "thumbnail",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class SaccoUserSerializer(serializers.ModelSerializer): 
    password = serializers.CharField(max_length=68, min_length=6, write_only=True)
    documents = UserDocumentsSerializer(many=True,read_only=True)
    signatures = MemberSignaturesSerializer(many=True,read_only=True)
    photos = MemberPhotosSerializer(many=True,read_only=True)

    class Meta:
        model = models.Users
        fields = [
            "id",
            "entity",
            "country",
            "first_name",
            "last_name",
            "identifier_type",
            "identifier_number",
            "gender",
            "owner",
            "documents",
            "signatures",
            "photos",
            "date_of_birth",
            "phone_otp_verified",
            "is_jp_profile_updated",
            "email",
            "phone",
            "password",
        ]


    def get_documents(self, obj):
      
        documents =UserDocuments.objects.filter(owner=obj)

        return UserDocumentsSerializer(documents, context=self.context, many=True).data
    
    def get_signatures(self, obj):
        signatures=[]
        if models.MemberSignatures.objects.filter(member__user=obj).exists():
      
            signatures =models.MemberSignatures.objects.filter(member__user=obj).all()

        return MemberSignaturesSerializer(signatures, context=self.context, many=True).data

    
    def get_photos(self, obj):
        photos=[]

        if models.MemberPhotos.objects.filter(member__user=obj).exists():
      
            photos =models.MemberPhotos.objects.filter(member__user=obj)

        return MemberPhotosSerializer(photos, context=self.context, many=True).data

    def validate(self, attrs):
        error_messages=[]

        phone = attrs.get(
            "phone", "")

        identifier_number = attrs.get(
            "identifier_number", "")
        
        identifier_type = attrs.get(
            "identifier_type", "")
        
        email = attrs.get(
            "email", "")
        
        email = attrs.get(
            "email", "")

        identifier_type = attrs.get(
            "identifier_type", "")

        # if not identifier_number.isdecimal():
        #     raise serializers.ValidationError(
        #         "The national ID should contain only numeric characters"
        #     )
        if not phone or  phone == "":
            raise exceptions.ValidationError(
                    "Phone number is required is required"
                )
        else:
            telco, phone_number = get_telco_by_phone_number(phone)
            print("the phone",phone_number)
            print("the telco",telco)
            if phone_number:
                if Users.objects.filter(phone=phone_number).exists():
                    raise exceptions.ValidationError(
                    "Phone number is already exists"
                )
            else:
                raise exceptions.ValidationError(
                    "Phone number not found in kenya"
                )
        

        if not email or  email == "":
            raise exceptions.ValidationError(
                    "Email is required is required"
                )
        if not identifier_type or  identifier_type == "":
            raise exceptions.ValidationError(
                    "Identifier type is required"
                )
        if not identifier_number or  identifier_number == "":
            raise exceptions.ValidationError(
                    "The identifier number is required"
                )
        else:
            if models.Users.objects.filter(identifier_number=identifier_number).count() > 0:

                raise serializers.ValidationError(
                    "The identifier number provided is already in use"
                )

                # raise serializers.ValidationError(
                #     "The phone number provided is already in use"
                # )
        if models.Users.objects.filter(email=email).count() > 0:
            """gdgd"""
            raise serializers.ValidationError(
                "The email address provided is already in use"
            )

        return attrs

    def create(self, validated_data):
        user = None
        created = None

        if "user" in self.context:
            user = self.context.get("user")
            if user:
                if user.is_staff and not "entity" in validated_data:
                    raise exceptions.ValidationError("Entity ID is required")
                else:
                    entity = validated_data.get("entity", None)
                    created = models.Users.objects.create_user(
                        **validated_data
                    )
                    return created
            else:
                created = models.Users.objects.create_user(
                     **validated_data
                )
                return created
        else:
            created = models.Users.objects.create_user(**validated_data)
            return created

class MembersSerializer(serializers.ModelSerializer):
    firstName=serializers.SerializerMethodField(read_only=True)
    lastName=serializers.SerializerMethodField(read_only=True)
    dateOfBirth=serializers.SerializerMethodField(read_only=True)
    gender=serializers.SerializerMethodField(read_only=True)
    photos = MemberPhotosSerializer(many=True, read_only=True)
    signatures = MemberSignaturesSerializer(many=True, read_only=True)
    class Meta:
        model = models.Members
        fields = (
            "id",
            "firstName",
            "lastName",
            "gender",
            "dateOfBirth",
            "signatures",
            "photos",
            "isBBFMember",
            "user",
            "occupation",
            "internalCreditScore",
            "externalCreditScore",
            "occupation",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

    def get_firstName(self,obj):
        return obj.user.first_name
    
    def get_lastName(self,obj):
        return obj.user.last_name
    
    def get_dateOfBirth(self,obj):
        return obj.user.date_of_birth
    
    def get_gender(self,obj):
        return obj.user.gender

class NextOfKinsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.NextOfKins
        fields = (
            "id",
            "member",
            "relation",
            "firstName",
            "lastName",
            "identifierType",
            "identifierNumber",
            "gender",
            "phone",
            "email",
            "isActive",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")
class RefereesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Referees
        fields = (
            "id",
            "member",
            "relation",
            "firstName",
            "lastName",
            "identifierType",
            "identifierNumber",
            "gender",
             "phone",
            "email",
            "isActive",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class RecruitersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Recruiters
        fields = (
            "id",
            "member",
            "recruiter",
            "employee",
            "isActive",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class MembersAccountsSerializer(serializers.ModelSerializer):
    branchTitle=serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.MemberAccounts
        fields = (
            "id",
            "branch",
            "branchTitle",
            "accountType",
            "currency",
            "accountAdministrator",
            "accountNature",
            "currentBalance",
            "minimumBalance",
            "accountNumber",
            "accountName",
            "accountPhone",
            "signatories",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")
    def get_branchTitle(self,obj):
        return obj.branch.title
        
class MemberAccountTransactionsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MemberAccountTransactions
        fields = (
            "id",
            "branch",
            "memberAccount",
            "memberAccountTo",
            "saccoAccountTo",
            "externalAccountToNumber",
            "externalAccountToRef",
            "externalBankCode",
            "transactionType",
            "destinationAccountType",
            "referenceNumber",
            "transactionAmount",
            "narrative",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class MemberAccountNomineesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MemberAccountNominees
        fields = (
            "id",
            "branch",
            "memberAccount",
            "firstName",
            "lastName",
            "phone",
            "identifierType",
            "identifierNumber",
            "gender",
            "relation",
            "isActive",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class MemberAccountATMCardsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MemberAccountATMCards
        fields = (
            "id",
            "branch",
            "memberAccount",
            "cardNumber",
            "expiryDate",
            "issueDate",
            "collectionDate",
            "isActive",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class GuarantorsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Guarantors
        fields = (
            "id",
            "branch",
            "member",
            "loan",
            "guaranteedAmount"
            "isActive",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class SaccoProductsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SaccoProducts
        fields = (
            "id",
            "title",
            "description",
            "isActive",
            "maximumPeriodIMonths",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class CollateralsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Collaterals
        fields = (
            "id",
            "branch",
            "title",
            "description",
            "isActive",
            "currentValue",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class LoanApplicationsSerializer(serializers.ModelSerializer):
    memberAccountName =serializers.SerializerMethodField(read_only=True)
    productTitle =serializers.SerializerMethodField(read_only=True)
    branchTitle =serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.LoanApplications
        fields = (
            "id",
            "branch",
            "branchTitle",
            "memberAccount",
            "memberAccountName",
            "productTitle",
            "product",
            "isActive",
            "loanReason",
            "status",
            "outstandingLoansCount",
            "outstandingLoansValue",
            "grossSalary",
            "totalSalaryDeductions",
            "netSalary",
            "guarantors",
            "amountApplied",
            "collaterals",
            "isActive",
            "cancellatonReason",
            "registeredBy",
            "appraisedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")
    def get_memberAccountName(self,obj):
        return f"{obj.memberAccount.accountName}"
    
    def get_productTitle(self,obj):
        return f"{obj.product.title}"
    
    def get_branchTitle(self,obj):
        return f"{obj.branch.title}"
    
class SaccoChargesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SaccoCharges
        fields = (
            "id",
            "title",
            "description",
            "rate",
            "amount",
            "isActive",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class LoansSerializer(serializers.ModelSerializer):
    branchTitle =serializers.SerializerMethodField(read_only=True)
    loanOfficerTitle =serializers.SerializerMethodField(read_only=True)
    accountName =serializers.SerializerMethodField(read_only=True)
    creditAccountTitle =serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.Loans
        fields = (
            "id",
            "branch",
            "branchTitle",
            "accountName",
            "loanApplication",
            "creditAccountTitle",
            "creditAccount",
            "loanOfficerTitle",
            "loanOfficer",
            "loanOfficerTitle",
            "amountApplied",
            "amountApproved",
            "amountDisbursed",
            "netPayable",
            "totalCharges",
            "startDate",
            "loanTerm",
            "saccoCharges",
            "currentInterest",
            "isActive",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")
    def get_branchTitle(self,obj):
        return f"{obj.branch.title}"
    
    def get_loanOfficerTitle(self,obj):
        return f"{obj.loanOfficer.user.first_name} {obj.loanOfficer.user.last_name}"
    
    def get_accountName(self,obj):
        return f"{obj.loanApplication.memberAccount.accountName}"
    
    def get_creditAccountTitle(self,obj):
        return f"{obj.creditAccount.accountNumber} - {obj.creditAccount.accountName}"

class LoanDeffermentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.LoanDefferments
        fields = (
            "id",
            "branch",
            "loan",
            "deferFrom",
            "deferTo",
            "deffermentReason",
            "isActive",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")


class LoanDeffermentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.LoanDefferments
        fields = (
            "id",
            "branch",
            "loan",
            "deferFrom",
            "deferTo",
            "deffermentReason",
            "isActive",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class LoanInterestCapitalizationsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.LoanInterestCapitalizations
        fields = (
            "id",
            "branch",
            "loan",
            "initialPrincipalBalance",
            "interestAmount",
            "finalPrincipalAmount",
            "finalInterestRate",
            "saccoCharges",
            "aountDisbursed",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class LoanRepaymentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.LoanRepayments
        fields = (
            "id",
            "branch",
            "loan",
            "repaymentType",
            "repaymentchedule",
            "repaymentAmount",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class DividendsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Dividends
        fields = (
            "id",
            "branch",
            "narrative",
            "rate",
            "periodFrom",
            "periodTo",
            "totalApplyingShares",
            "totalPayableDividend",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class DividendPayoutsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.DividendPayouts
        fields = (
            "id",
            "branch",
            "dividend",
            "payoutAccount",
            "deductableAccruedInterest",
            "netPayableDividend",
            "totalApplyingShares",
            "totalPayableDividend",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")
class AdvancesAgainstDepositInterestsPayoutsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.AdvancesAgainstDepositInterests
        fields = (
            "id",
            "branch",
            "memberAccount",
            "interestRate",
            "advancibleAmount",
            "interestOnAdvance",
            "netAdvanceAmount",
            "totalPayableDividend",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")
class AdvancesAgainstDepositInterestPayoutsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.AdvancesAgainstDepositInterestPayouts
        fields = (
            "id",
            "branch",
            "advancesAgainstDepositInterests",
            "transaction",
            "amount",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class AdvancesAgainstDepositInterestChargesCollectionsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.AdvancesAgainstDepositInterestChargesCollections
        fields = (
            "id",
            "branch",
            "advancesAgainstDepositInterests",
            "transaction",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")

class FixedDepositsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.FixedDeposits
        fields = (
            "id",
            "branch",
            "transaction",
            "interestRate",
            "fixedDepositAmount",
            "guaranteedLoans",
            "depositDate",
            "maturityDate",
            "isCancelled",
            "isRolledOver",
            "rollOverDate",
            "cancellationDate",
            "interestRate",
            "madeBy",
            "checkedBy",
            "approvedBy",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("created", "updated","entity")