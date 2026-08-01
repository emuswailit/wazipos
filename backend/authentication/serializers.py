from rest_framework import serializers, exceptions

from intergrations.jambopay.jambopay_get_profile_accounts import get_jambopay_profile_accounts
from intergrations.jambopay.jambopay_wallet import get_wallet_balance, check_user_jambopay_profile_by_phone
from employees.models import Employees
from . import models
from utils.logging import create_log
from rest_framework.validators import UniqueTogetherValidator, UniqueValidator
from django.db import transaction
from utils.validations import start_and_end_date_validated
from datetime import datetime
from utils.send_messages import send_message
from .utils import utils
from loyalty.models import Rating

from authentication.models import Users,Agents
from core.responses import custom_error_response
from django.conf import settings
from django.utils.encoding import (
    DjangoUnicodeDecodeError,
    force_str,
    smart_bytes,
    smart_str,
)
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.http import urlsafe_base64_encode
from django.contrib.auth.tokens import PasswordResetTokenGenerator


class IdentityDocumentsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.IdentityDocuments
        fields = ("id", "document", "owner", "created", "updated")

        read_only_fields = (
            "id",
            "created",
            "updated",
        )


class EntityLicencesSerializer(serializers.ModelSerializer):
    is_valid = serializers.SerializerMethodField(read_only=True)
    # entity_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        ordering = ["-id"]
        model = models.EntityLicences
        fields = (
            "id",
            "entity",
            "owner",
            "licence",
            "thumbnail",
            "is_verified",
            "licence_type",
            "licence_number",
            "is_valid",
            "valid_from",
            "valid_to",
            "is_valid",
            "verified_by",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "entity",
            "created",
            "licence",
            "updated",
            "user",
            "verified_by",
        )

    def validate(self, attrs):
        valid_from = attrs.get("valid_from", None)
        valid_to = attrs.get("valid_to", None)
        if start_and_end_date_validated(valid_from, valid_to):
            return super().validate(attrs)

    def create(self, validated_data):
        user = self.context.get("user")
        entity_type = validated_data.get("entity_type", None)
        if user.is_staff:
            if entity_type == "MANUFACTURING":
                created = models.Entities.objects.create(
                    is_verified=True, is_licenced=True, **validated_data
                )
                return created
            elif entity_type == "RETAIL":
                raise exceptions.ValidationError("Not authorized")
        else:
            created = models.Entities.objects.create(**validated_data)
            return created

    # @transaction.atomic
    # def update(self, instance, validated_data):
    #     """
    #     Admin user verifies entity licence
    #     """
    #     user = self.context.get("user")

    #     if instance.is_verified == True:
    #         raise exceptions.ValidationError("Licence is already verified")

    #     if not "valid_from" in validated_data:
    #         raise exceptions.ValidationError("Please enter valid from date")

    #     if not "valid_to" in validated_data:
    #         raise exceptions.ValidationError("Please enter valid to date")
    #     updated = super().update(instance, validated_data)
    #     updated.verified_by = user
    #     updated.is_verified = True
    #     updated.save()

    #     # Update entity too as verified
    #     updated.entity.is_verified = True
    #     updated.entity.is_licenced = True
    #     updated.entity.save()

    #     utils.create_super_admin_role(updated.entity)

    #     return updated

    def get_is_valid(self, obj):
        """
        Return licence is valid if valid to date is greater than today and the licence is verified
        """
        return obj.is_verified


class DepartmentsSerializer(serializers.ModelSerializer):
    """
    Departments serializer
    """

    class Meta:
        model = models.Departments
        fields = (
            "id",
            "entity",
            "title",
            "department_type",
            "description",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("id", "entity", "owner", "created", "updated")


class ProfilePhotosSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.ProfilePhotos
        fields = ("id", "photo", "owner", "created", "updated")

        read_only_fields = (
            "id",
            "created",
            "updated",
        )


# Masomo manenoz

# Primary school attended and certificates


class PrimaryCertificatesSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.PrimaryCertificates
        fields = ("id", "owner", "certificate", "primary_school", "created", "updated")

        read_only_fields = ("id", "created", "updated", "primary_school")


class PrimarySchoolsSerializer(serializers.ModelSerializer):
    primary_certificates = PrimaryCertificatesSerializer(many=True, read_only=True)
    owner_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.PrimarySchools
        fields = [
            "id",
            "owner",
            "school_title",
            "start",
            "end",
            "marks_attained",
            "marks_possible",
            "primary_certificates",
            "is_verified",
            "verified_by",
            "owner_details",
            "created",
            "updated",
        ]
        read_only_fields = (
            "id",
            "owner",
            "is_verified",
            "verified_by",
            "owner_details",
        )
        extra_kwargs = {
            "primary_certificates": {
                "required": False,
            }
        }

    def get_owner_details(self, obj):
        owner = models.Users.objects.get(id=obj.owner.id)
        return GenericUserSerializer(
            owner,
            context=self.context,
        ).data

    def create(self, validated_data):
        start = validated_data.get("start", None)
        end = validated_data.get("end", None)
        user = self.context.get("user")
        # End date should always be greater than start date
        if end < start:
            raise exceptions.ValidationError(f"End date cannot be before start date")

        if start > end:
            raise exceptions.ValidationError(f"Start date cannot be after end date")
        if (
            models.PrimarySchools.objects.filter(
                start__range=(start, end),
                end__range=(start, end),
                owner=user,
            ).count()
            > 0
        ):
            slots = models.PrimarySchools.objects.filter(
                start__range=(start, end),
                end__range=(start, end),
                owner=user,
            ).first()
            raise exceptions.ValidationError(
                f"You already indicated that you were in {slots.school_title} between {slots.start} and {slots.end}"
            )
        return super().create(validated_data)


# Secondary schools attended and certificates


class SecondaryCertificatesSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.SecondaryCertificates
        fields = (
            "id",
            "owner",
            "certificate",
            "secondary_school",
            "created",
            "updated",
        )

        read_only_fields = ("id", "created", "updated", "secondary_school")


class SecondarySchoolsSerializer(serializers.ModelSerializer):
    secondary_certificates = SecondaryCertificatesSerializer(many=True, read_only=True)
    owner_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.SecondarySchools
        fields = [
            "id",
            "school_title",
            "start",
            "end",
            "grade_attained",
            "secondary_certificates",
            "is_verified",
            "verified_by",
            "owner_details",
            "created",
            "updated",
        ]
        read_only_fields = (
            "id",
            "owner",
            "is_verified",
            "verified_by",
            "owner_details",
        )
        extra_kwargs = {
            "secondary_certificates": {
                "required": False,
            }
        }

    def get_owner_details(self, obj):
        owner = models.Users.objects.get(id=obj.owner.id)
        return GenericUserSerializer(
            owner,
            context=self.context,
        ).data


# Colleges attended and diplomas attained


class CollegeTranscriptsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.CollegeTranscripts
        fields = ("id", "owner", "transcript", "college", "created", "updated")

        read_only_fields = ("id", "created", "updated", "college")


class CollegesSerializer(serializers.ModelSerializer):
    college_transcripts = CollegeTranscriptsSerializer(many=True, read_only=True)
    owner_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Colleges
        fields = [
            "id",
            "college_title",
            "certificate_title",
            "certificate_type",
            "grade_attained",
            "gpa_attained",
            "start",
            "end",
            "college_transcripts",
            "is_verified",
            "verified_by",
            "owner_details",
            "created",
            "updated",
        ]
        read_only_fields = (
            "id",
            "owner",
            "is_verified",
            "verified_by",
            "owner_details",
        )
        extra_kwargs = {
            "college_transcripts": {
                "required": False,
            }
        }

    def get_owner_details(self, obj):
        owner = models.Users.objects.get(id=obj.owner.id)
        return GenericUserSerializer(
            owner,
            context=self.context,
        ).data


# Universities attended and diplomas attained


class CountriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Countries
        fields = (
            "id",
            "currency_name",
            "currency_symbol",
            "flag_png",
            "flag_svg",
            "flag_alt",
            "country_code",
            "iso_code_two",
            "iso_code_three",
            "title",
            "description",
        )
        read_only_fields = ("id",)

class PostalOfficesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PostalAddresses
        fields = (
            "id",
            "post_office",
            "postal_code",

        )
        read_only_fields = ("id",)   


class CountiesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Counties
        fields = (
            "id",
            "county_code",
            "country",
            "title",
            "description",
        )
        read_only_fields = ("id",)

class SubCountiesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SubCounties
        fields = "__all__"
        read_only_fields = ("id",)

class TownsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Towns
        fields = (
            "id",
            "county",
            "is_city",
            "title",
            "abbreviation",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

class ConstituenciesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Constituencies
        fields = (
            "id",
            "constituency_code",
            "county",
            "title",
            "description",
        )
        read_only_fields = ("id",)


class EntityDocumentsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.EntityDocuments
        fields = ("id", "entity", "owner", "document","reference","title","description", "created", "updated")

        read_only_fields = ("id", "entity", "created", "updated", "user")

class EntityImagesSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.EntityImages
        fields = ("id", "entity", "owner", "image", "created", "updated")

        read_only_fields = ("id", "entity", "created", "updated", "user")



class EntityLogosSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.EntityLogos
        fields = ("id", "entity", "owner", "logo", "created", "updated")

        read_only_fields = ("id", "entity", "created", "updated", "user")


class UserDocumentsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.UserDocuments
        fields = (
            "id",
            "owner",
            "document",
            "thumbnail",
            "document_number",
            "document_type",
            "is_verified",
            "is_valid",
            "verified_by",
            "created",
            "updated",
        )
        read_only_fields = (
            "id",
            "entity",
            "created",
            "document",
            "updated",
            "user",
            "verified_by",
        )


class SubCategoriesSerializer(serializers.ModelSerializer):
    category_title = serializers.SerializerMethodField(read_only=True)
    """
    Categories serializer
    """

    class Meta:
        model = models.SubCategories
        fields = (
            "id",
            "category",
            "title",
            "description",
            "category_title",
            "created",
            "updated",
        )
        read_only_fields = ("id", "created", "updated")

    def get_category_title(self, obj):
        return obj.category.title


class CategoriesSerializer(serializers.ModelSerializer):
    subcategories = serializers.SerializerMethodField()
    """
    Categories serializer
    """

    class Meta:
        model = models.Categories
        fields = (
            "id",
            "icon",
            "icon_category",
            "category_class",
            "title",
            "description",
            "created",
            "updated",
            "subcategories",
        )
        read_only_fields = ("id", "subcategories", "created", "updated")

    def get_subcategories(self, obj):
        subcategories = None
        subcategories = models.SubCategories.objects.filter(category=obj)
        # if subcategories:
        #     return SubCategoriesSerializer(
        #         subcategories, context=self.context, many=True
        #     ).data
        # else:
        #     return None
        return SubCategoriesSerializer(
            subcategories, context=self.context, many=True
        ).data


class PlansSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Plans

        fields = [
            "id",
            "title",
            "registration_fee",
            "owner",
            "subscription",
            "subscription_frequency",
            "duration_in_days",
            "updated",
            "created",
        ]


class EntityMiniSerializer(serializers.ModelSerializer):
    images = EntityImagesSerializer(many=True, read_only=True, required=False)
    plan_title = serializers.SerializerMethodField()

    class Meta:
        model = models.Entities

        fields = [
            "id",
            "entity_code",
            "bank_code",
            "title",
            "administrator",
            "owner",
            "registration",
            "phone",
            "phone1",
            "phone2",
            "phone3",
            "email",
            "entity_type",
            "entity_ownership",
            "town",
            "postal_address",
            "country",
            "county",
            "is_verified",
            "road",
            "building",
            "plan",
            "plan_title",
            "images",
        ]

    def get_plan_title(self, obj):
        if obj.plan:
            return f"{obj.plan.title}"
        else:
            return ""


class EntitySerializer(serializers.ModelSerializer):
    categories_array = serializers.SerializerMethodField(read_only=True)
    country_title = serializers.SerializerMethodField()
    county_title = serializers.SerializerMethodField()
    constituency_title = serializers.SerializerMethodField()
    plan_title = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()

    # is_favorite = serializers.SerializerMethodField()
    # is_current = serializers.SerializerMethodField()
    departments = serializers.SerializerMethodField()
    # branches = serializers.SerializerMethodField()
    # entity_code = serializers.SerializerMethodField(read_only=True)
    images = EntityImagesSerializer(many=True, read_only=True, required=False)
    logos = EntityLogosSerializer(many=True, read_only=True, required=False)
    licences = EntityLicencesSerializer(many=True, read_only=True, required=False)
    owner_details = serializers.SerializerMethodField()

    class Meta:
        model = models.Entities

        fields = [
            "id",
            "entity_code",
            "bank_code",
            "title",
            "rating",
            "administrator",
            "owner",
            "registration",
            "phone",
            "phone1",
            "phone2",
            "phone3",
            "email",
            "entity_type",
            "entity_ownership",
            "categories",
            # "is_favorite",
            # "is_current",
            "town",
            "country",
            "county",
            "constituency",
            "road",
            "building",
            "images",
            "logos",
            "licences",
            # "branches",
            "owner",
            "is_subscribed",
            "is_verified",
            "trial_from",
            "trial_to",
            "registration_fee",
            "commission_percentage",
            "registration_fee_paid",
            "offer_trial",
            "created",
            "updated",
            "departments",
            "description",
            "categories_array",
            "owner_details",
            "country_title",
            "county_title",
            "constituency_title",
            "plan",
            "plan_title",
            "postal_address",
            "postal_code",
            "postal_town",
        
        ]
        read_only_fields = [
            "is_subscribed",
            "offer_trial",
            "owner",
            "rating",
            "categories_array",
            "entity_code"
        ]
        extra_kwargs = {
            "licences": {
                "required": False,
            }
        }

        extra_kwargs = {
            "images": {
                "required": False,
            },
              "logos": {
                "required": False,
            },
        }

    def get_categories_array(self, obj):
        categories = obj.categories.all()
        if categories.count() > 0:
            return CategoriesSerializer(
                categories, context=self.context, many=True
            ).data
        else:
            return None
    # def get_entity_code(self,obj):
    #     if not obj.entity_code:
    #         code = obj.generate_entity_code()
    #         obj.entity_code = code
    #         obj.save()
    #         return code
    #     else:
    #         obj.entity_code = ""
    #         obj.save()
    #         obj.entity_code = obj.generate_entity_code()
    #         obj.save()
    #         return obj.entity_code

    # def get_current_licences(self, obj):
    #     licences = obj.licences.all()
    #     if licences.count() > 0:
    #         return EntityLicencesSerializer(
    #             licences, context=self.context, many=True
    #         ).data
    #     else:
    #         return None

    def validate(self, attrs):
        user = self.context.get("user")
        entity_type = attrs.get("entity_type", "")

        if utils.admin_can_create_entity(user, entity_type):
            raise exceptions.ValidationError(
                f"Admin users not allowed to create facility of type: {entity_type}"
            )
        return attrs

    def get_rating(self, obj):
        rating = 0
        reviewsCount = 0
        ratings = 0
        reviews = None
        if Rating.objects.filter(entity=obj).exists():
            reviewsCount = Rating.objects.filter(entity=obj).count()
            reviews = Rating.objects.filter(entity=obj).all()

            for review in reviews:
                ratings += review.rating
            rating = ratings / reviewsCount

        return rating

    # def get_is_licenced(self, obj):
    #     return (
    #         models.EntityLicences.objects.filter(
    #             entity=obj, is_verified=True, valid_to__gte=datetime.today()
    #         ).count()
    #         > 0
    #     )

    # def get_is_favorite(self, obj):
    #     user_favorites = []
    #     user = self.context["request"].user

    #     user_favorites = user.favorite_entities.all()
    #     if obj in user_favorites:
    #         return "true"
    #     else:
    #         return "false"

    # def get_is_current(self, obj):
    #     user = self.context["request"].user

    #     if obj == user.entity:
    #         return "true"
    #     else:
    #         return "false"

    def get_owner_details(self, obj):
        if obj.owner:
            return f"{obj.owner.first_name} {obj.owner.last_name}- {obj.owner.phone}"
        else:
            return ""

    def get_county_title(self, obj):
        if obj.county:
            return f"{obj.county.title}"
        else:
            return ""
    
    def get_constituency_title(self, obj):
        if obj.constituency:
            return f"{obj.constituency.title}"
        else:
            return ""

    def get_plan_title(self, obj):
        if obj.plan:
            return f"{obj.plan.title}"
        else:
            return ""

    def get_country_title(self, obj):
        if obj.country:
            return f"{obj.country.title}"
        else:
            return ""

    # def get_country_details(self, obj):
    #     return CountriesSerializer(obj.country, context=self.context, many=False).data

    # def get_county_details(self, obj):
    #     if obj.county:
    #         return CountiesSerializer(obj.county, context=self.context, many=False).data
    #     else:
    #         return None

    def get_current_licence(self, obj):
        curr_licence = None
        if (
            models.EntityLicences.objects.filter(
                entity=obj, is_verified=True, valid_to__gte=datetime.today()
            ).count()
            > 0
        ):
            curr_licence = models.EntityLicences.objects.filter(
                entity=obj, is_verified=True, valid_to__gte=datetime.today()
            ).first()
            return EntityLicencesSerializer(
                curr_licence, context=self.context, many=False
            ).data

    # def create(self, validated_data):
    #     created = None
    #     user = self.context.get("user")
    #     title = validated_data.get("title", None)
    #     owner_id = validated_data.get("owner", None)
    #     categories = validated_data.pop("categories", None)

    #     if user and title:
    #         if models.Entities.objects.filter(title=title.upper(),owner_id=owner_id).count() > 0:
    #             raise exceptions.ValidationError(f"Entity named {title} already exists")
    #     created = models.Entities.objects.create(**validated_data)
    #     created.categories.set(categories)

    #     # RESERVE ALLOTMENT OF ROLES UNTIL FACILITY IS VERIFIED
    #     # if created:
    #     #     role = models.Roles.objects.create(entity_id=created.id, level=created.entity_type,
    #     #                                        title=f"{created.entity_type} SUPER ADMIN", value=f"{created.entity_type}_SUPER_ADMIN")
    #     #     user.roles.add(role)

    #     # If user is not admin, switch them to this facility
    #     if not user.is_staff:
    #         pass
    #         # user.entity = created
    #     else:
    #         # Automatically verify entities created by admin
    #         user.entity.is_verified = True
    #         user.entity.save()
    #     user.save()
    #     return created

    def get_isSelected(self, obj):
        user_pk = self.context.get("user_pk")

    def get_departments(self, obj):
        departments = None
        departments = models.Departments.objects.filter(entity=obj)
        if departments:
            return DepartmentsSerializer(
                departments, context=self.context, many=True
            ).data
        else:
            return None

    # def get_branches(self, obj):
    #     branches = []
    #     if  models.EntityBranches.objects.filter(entity=obj).exists():
    #         branches = models.EntityBranches.objects.filter(entity=obj)
    #         return EntityBranchSerializer(
    #             branches, context=self.context, many=True
    #         ).data
    #     else:
    #         return []


class ClustersSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Clusters
        fields = (
            "id",
            "entity",
            "title",
            "value",
        )
        read_only_fields = ("id",)


class RolesSerializer(serializers.ModelSerializer):
    cluster_title = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Roles
        fields = [
            "id",
            "entity",
            "entity_title",
            "cluster",
            "title",
            "cluster_title",
            "description",
            "level",
            "value",
            "owner",
      
        ]
        read_only_fields = ["level", "entity", "id", "cluster_details"]

    def get_entity_title(self, obj):
        return obj.entity.title
    def get_cluster_title(self, obj):
        return obj.cluster.title


    # def create(self, validated_data):
    #     entity = None
    #     created = None
    #     level = None
    #     value = None
    #     title = validated_data.pop("title", None)
    #     user = self.context.get("user")

    #     if user.is_staff:
    #         # Use user from input
    #         entity = validated_data.get("entity", None)
    #     else:
    #         # Use logged on user
    #         entity = self.context.get("entity")

    #     cluster = validated_data.pop("cluster", None)
    #     description = validated_data.pop("description", None)
    #     if entity:
    #         if (
    #             models.Roles.objects.filter(entity=entity, title__iexact=title).count()
    #             > 0
    #         ):
    #             role = models.Roles.objects.filter(
    #                 entity=entity, title__icontains=title
    #             ).first
    #             raise exceptions.ValidationError(
    #                 f"{role.title} already exists in your entity"
    #             )
    #         else:
    #             try:
    #                 if entity and cluster:
    #                     level = entity.entity_type
    #                     value = f"{level}_{cluster.value}"
    #                     created = models.Roles.objects.create(
    #                         level=level,
    #                         value=value,
    #                         entity=entity,
    #                         cluster=cluster,
    #                         title=title,
    #                         description=description,
    #                     )
    #                     if created:
    #                         return created
    #                     else:
    #                         raise exceptions.ValidationError(
    #                             "Role could not be created"
    #                         )
    #                 else:
    #                     raise exceptions.ValidationError("Role could not be created")

    #             except Exception as e:
    #                 raise exceptions.ValidationError(f"Error: {e}")

    # def update(self, instance, validated_data):
    #     # title = validated_data.get("title", instance.title)
    #     # instance.title = title
    #     # instance.save()

    #     title = validated_data.get("title", instance.title)
    #     description = validated_data.get("description", instance.description)
    #     instance.description = description
    #     instance.title = title
    #     instance.save()

    #     return instance


class CadresSerializer(serializers.ModelSerializer):
    cadre_title = serializers.SerializerMethodField(read_only=True)
    cluster_details = serializers.SerializerMethodField(read_only=True)
    cluster_title = serializers.SerializerMethodField(read_only=True)
    """Cadres serializer"""

    class Meta:
        model = models.Cadres
        fields = (
            "id",
            "cluster",
            "cluster_title",
            "title",
            "description",
            "cluster_details",
            "cadre_title",
        )
        read_only_fields = ("id", "created", "cluster_details", "updated")
        validators = [
            UniqueTogetherValidator(
                queryset=models.Cadres.objects.all(), fields=["title"]
            )
        ]

    def create(self, validated_data):
        title = validated_data.get("title", None)
        if title:
            if models.Cadres.objects.filter(title__iexact=title.upper()).exists():
                raise exceptions.ValidationError(
                    "Cadre with similar title already exists"
                )

        return super().create(validated_data)

    # def update(self, instance, validated_data):
    #     role = validated_data.get('role', None)
    #     if role:
    #         if models.Profiles.objects.filter(cadre=instance).count() > 0:
    #             affected_profiles = models.Profiles.objects.filter(
    #                 cadre=instance).all()
    #     return super().update(instance, validated_data)

    def get_cluster_details(self, obj):
        if models.Clusters.objects.filter(id=obj.cluster.id).exists():
            cluster = models.Clusters.objects.filter(id=obj.cluster.id).first()
            return ClustersSerializer(cluster, context=self.context, many=False).data
        else:
            return None

    def get_cadre_title(self, obj):
        cadre_title = ""
        if obj:
            cadre_title = obj.title
        return cadre_title

    def get_cluster_title(self, obj):
        if obj.cluster:
            return obj.cluster.title
        else:
            return ""


class UserImageSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.UserImages
        fields = ("id", "owner", "image", "thumbnail", "created", "updated")

        read_only_fields = ("id", "thumbnail", "created", "updated", "user")
        # extra_kwargs = {'user': {'required': False}}


class RegisterSerializer(serializers.ModelSerializer):
    images = UserImageSerializer(many=True, read_only=True)
    entity = serializers.CharField(read_only=True)
    password = serializers.CharField(max_length=68, min_length=6, write_only=True)

    class Meta:
        model = models.Users
        fields = [
            "id",
            "entity",
            "country",
            "county",
            "accepted_terms",
            "first_name",
            "middle_name",
            "last_name",
            "identifier_type",
            "identifier_number",
            "gender",
            "registration_method",
            "images",
            "notification_token",
            "owner",
            "favorite_entities",
            "date_of_birth",
            "email",
            "phone",
            "password",
            "is_profile_updated",
        ]
        read_only_fields = (
            "is_profile_verified",
            "is_profile_updated",
            "favorite_entities",
        )
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }

    def get_images(self, obj):
        # user = models.Users.objects.get(email=obj["email"])
        images = models.UserImages.objects.filter(owner=obj)

        return UserImageSerializer(images, context=self.context, many=True).data

    def validate(self, attrs):
        phone = attrs.get(
            "phone", "")
        email = attrs.get(
            "email", "")
        document_number = attrs.get(
            "document_number", "")

        # if not document_number.isdecimal():
        #     raise serializers.ValidationError(
        #         "The national ID should contain only numeric characters"
        #     )
        # if not document_number == "":
        #     if models.Users.objects.filter(document_number=document_number).count() > 0:
        #         return custom_error_response(1,"The identifier number provided is already in use")
        #         # raise serializers.ValidationError(
        #         #     "The identifier number provided is already in use"
        #         # )
        #     if models.Users.objects.filter(phone=phone).count() > 0:
        #         return custom_error_response(1,"The phone number provided is already in use")
        #         # raise serializers.ValidationError(
        #         #     "The phone number provided is already in use"
        #         # )
        # if models.Users.objects.filter(email=email).count() > 0:
        #     return custom_error_response(1,"The email address provided is already in use")
        #     # raise serializers.ValidationError(
        #     #     "The email address provided is already in use"
        #     # )

        return attrs

    # def create(self, validated_data):
    #     user = None
    #     created = None

    #     if "user" in self.context:
    #         user = self.context.get("user")
    #         if user:
    #             if user.is_staff and not "entity" in validated_data:
    #                 raise exceptions.ValidationError("Entity ID is required")
    #             else:
    #                 entity = validated_data.get("entity", None)
    #                 created = models.Users.objects.create_user(
    #                     entity=user.entity, **validated_data
    #                 )
    #                 return created
    #         else:
    #             created = models.Users.objects.create_user(
    #                 entity=user.entity, **validated_data
    #             )
    #             return created
    #     else:
    #         created = models.Users.objects.create_user(**validated_data)
    #         return created
class SimpleUsersSerializer(serializers.ModelSerializer):

    class Meta:
        model = models.Users
        fields = ["id","entity","roles_string","identifier_type","identifier_number", "email","phone","registration_method", "first_name","last_name","roles","is_active","is_staff",]
    def validate(self, data):
        
        print("Data",data)
        email = data.get('email', None)
        if models.Users.objects.filter(email=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        
        if not data.get('first_name'):
            raise serializers.ValidationError("First name is required.")
        
    
        if not data.get('last_name'):
            raise serializers.ValidationError("Last name is required.")
        

        
        return data
    def get_roles(self, obj):
        return RolesSerializer(obj.roles.all(), context=self.context, many=True).data
class EntityRegisterSerializer(serializers.ModelSerializer): 
    entity = serializers.CharField(read_only=True)
    password = serializers.CharField(max_length=68, min_length=6, write_only=True)

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
            "date_of_birth",
            "email",
            "phone",
            "password",
        ]


    def get_images(self, obj):
        # user = models.Users.objects.get(email=obj["email"])
        images = models.UserImages.objects.filter(owner=obj)

        return UserImageSerializer(images, context=self.context, many=True).data

    def validate(self, attrs):
        phone = attrs.get(
            "phone", "")
        email = attrs.get(
            "email", "")
        document_number = attrs.get(
            "document_number", "")

        # if not document_number.isdecimal():
        #     raise serializers.ValidationError(
        #         "The national ID should contain only numeric characters"
        #     )
        if not document_number == "":
            if models.Users.objects.filter(document_number=document_number).count() > 0:
                return custom_error_response(1,"The identifier number provided is already in use")
                # raise serializers.ValidationError(
                #     "The identifier number provided is already in use"
                # )
            if models.Users.objects.filter(phone=phone).count() > 0:
                return custom_error_response(1,"The phone number provided is already in use")
                # raise serializers.ValidationError(
                #     "The phone number provided is already in use"
                # )
        if models.Users.objects.filter(email=email).count() > 0:
            return custom_error_response(1,"The email address provided is already in use")
            # raise serializers.ValidationError(
            #     "The email address provided is already in use"
            # )

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
                        entity=user.entity, **validated_data
                    )
                    return created
            else:
                created = models.Users.objects.create_user(
                    entity=user.entity, **validated_data
                )
                return created
        else:
            created = models.Users.objects.create_user(**validated_data)
            return created
class CorporateRegisterSerializer(serializers.ModelSerializer): 
    # entity = serializers.CharField(read_only=True)
    password = serializers.CharField(max_length=68, min_length=6, read_only=True)

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
            "registration_method",
            "gender",
            "owner",
            "date_of_birth",
            "email",
            "phone",
            "password",
            "is_entity_administrator",
        ]


    def get_images(self, obj):
        # user = models.Users.objects.get(email=obj["email"])
        images = models.UserImages.objects.filter(owner=obj)

        return UserImageSerializer(images, context=self.context, many=True).data

    def validate(self, attrs):
        phone = attrs.get(
            "phone", "")
        email = attrs.get(
            "email", "")
        document_number = attrs.get(
            "document_number", "")

        # if not document_number.isdecimal():
        #     raise serializers.ValidationError(
        #         "The national ID should contain only numeric characters"
        #     )
        # if not document_number == "":
        #     if models.Users.objects.filter(document_number=document_number).count() > 0:
        #         return custom_error_response(1,"The identifier number provided is already in use")
        #         # raise serializers.ValidationError(
        #         #     "The identifier number provided is already in use"
        #         # )
        #     if models.Users.objects.filter(phone=phone).count() > 0:
        #         return custom_error_response(1,"The phone number provided is already in use")
        #         # raise serializers.ValidationError(
        #         #     "The phone number provided is already in use"
        #         # )
        # if models.Users.objects.filter(email=email).count() > 0:
        #     return custom_error_response(1,"The email address provided is already in use")
        #     # raise serializers.ValidationError(
        #     #     "The email address provided is already in use"
        #     # )

        return attrs

    # def create(self, validated_data):
    #     user = None
    #     created = None

    #     if "user" in self.context:
    #         user = self.context.get("user")
    #         print("user",user)
    #         create_log("info",f"User at validate: {user}")
    #         print("validated_data",validated_data)
    #         create_log("info",f"Validated ddata: {validated_data}")
    #         if user:
    #             if not "entity" in validated_data:
    #                 raise exceptions.ValidationError("Entity ID is required")
    #             else:
    #                 entity = validated_data.get("entity", None)
    #                 created = models.Users.objects.create_user(
    #                     **validated_data
    #                 )
    #                 return created
    #         else:
    #             created = models.Users.objects.create_user(
    #                  **validated_data
    #             )
    #             return created
    #     else:
    #         created = models.Users.objects.create_user(**validated_data)
    #         return created

class EmailVerificationSerializer(serializers.ModelSerializer):
    token = serializers.CharField(max_length=555)

    class Meta:
        model = models.Users
        fields = ["token"]

class OrganizationsSerializer(serializers.ModelSerializer):
    country_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ["-id"]
        model = models.Organizations
        fields = ("id", "title","organization_type","country","country_title", "owner", "description", "created", "updated")

        read_only_fields = (
            "id",
            "created",
            "updated",
        )
    def get_country_title(self,obj):
        if obj.country:
            return obj.country.title
        else:
            return ""


class DependantImageSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        # model = models.DependantImages
        fields = ("id", "dependant", "owner", "image", "created", "updated")

        read_only_fields = (
            "id",
            "created",
            "updated",
        )


class DependantsSerializer(serializers.ModelSerializer):
    images = DependantImageSerializer(many=True, read_only=True)
    key = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    age = serializers.SerializerMethodField(read_only=True)
    user_title = serializers.SerializerMethodField(read_only=True)
    user_phone = serializers.SerializerMethodField(read_only=True)
    user_email = serializers.SerializerMethodField(read_only=True)
    county_title = serializers.SerializerMethodField(read_only=True)
    sub_county_title = serializers.SerializerMethodField(read_only=True)
    location_title = serializers.SerializerMethodField(read_only=True)
    sub_location_title = serializers.SerializerMethodField(read_only=True)
    village_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Dependants
        fields = (
            "id",
            "user",
            "owner",
            "key",
            "images",
            "county",
            "county_title",
            "sub_county",
            "sub_county_title",
            "location",
            "location_title",
            "sub_location",
            "sub_location_title",
            "village",
            "village_title",
            "first_name",
            "middle_name",
            "last_name",
            "identifier_type",
            "identifier_number",
            "gender",
            "title",
            "relationship",
            "date_of_birth",
            "marital_status",
            "religion",
            "age",
            "user_title",
            "user_email",
            "user_phone",
            "village_name",
            "sub_location_name",
            "location_name",
            "is_active",
            "created",
            "updated",
        )
        read_only_fields = (
            "id",
            "url",
            "owner",
            "created",
            "updated",
        )
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }

    def create(self, validated_data):
        first_name = validated_data["first_name"]
        last_name = validated_data["last_name"]
        user = validated_data["user"]

        if (
            models.Dependants.objects.filter(
                first_name__icontains=first_name,
                last_name__icontains=last_name,
                user=user,
            ).count()
            > 0
        ):
            raise exceptions.ValidationError(
                f"{first_name} {last_name} already exists as dependant for {user.first_name} {user.last_name}"
            )

        created = models.Dependants.objects.create(**validated_data)

        return created
    def get_key(self,obj):
        return obj.id
    
    def get_title(self,obj):
        return f"{obj.first_name} {obj.last_name}"
    
    def get_user_title(self,obj):
        return f"{obj.user.first_name} {obj.user.last_name}"
    
    def get_user_phone(self,obj):
        return f"{obj.user.phone}"
    
    def get_user_email(self,obj):
        return f"{obj.user.email}"
    
    def get_age(self,obj):
        from core.date_utils import get_age_in_years
        return get_age_in_years(f"{obj.date_of_birth}")
    
    def get_county_title(self,obj):
        if obj.county:
            return f"{obj.county.title}" 
        else:
            return None
    def get_sub_county_title(self,obj):
        if obj.sub_county:
            return f"{obj.sub_county.title}" 
        else:
            return None
    def get_location_title(self,obj):
        if obj.location:
            return f"{obj.location.title}" 
        else:
            return None
    def get_sub_location_title(self,obj):
        if obj.sub_location:
            return f"{obj.sub_location.title}" 
        else:
            return None
    def get_village_title(self,obj):
        if obj.village:
            return f"{obj.village.title}" 
        else:
            return None

class GenericUserSerializer(serializers.ModelSerializer):
    country_title = serializers.SerializerMethodField(read_only=True)
    roles = serializers.SerializerMethodField(read_only=True)
    allowed_roles = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    documents_verified = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    name = serializers.SerializerMethodField(read_only=True)
    documents = UserDocumentsSerializer(many=True, read_only=True)
    # accounts = serializers.SerializerMethodField(read_only=True)
    # is_jp_profile_updated = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Users
        fields = (
            "id",
            "entity",
            "country",
            "accepted_terms",
            "url",
            "email",
            "name",
            "first_name",
            "middle_name",
            "last_name",
            "identifier_type",
            "identifier_number",
            "phone",
            "gender",
            "registration_method",
            "education_level",
            "marital_status",
            "key",
            "date_of_birth",
            "is_staff",
            "is_verified",
            "is_searchable",
            "iprs_verified",
            "documents",
            "images",
            "roles",
            "allowed_roles",
            "entity_title",
            "documents_verified",
            "created_at",
            "updated_at",
            "country_title",
            # "accounts"
        )

    def get_images(self, obj):
        if models.UserImages.objects.filter(owner=obj).count() > 0:
            images = models.UserImages.objects.filter(owner=obj)
            return UserImageSerializer(images, context=self.context, many=True).data
        else:
            return None

    def get_roles(self, obj):
        return RolesSerializer(obj.roles.all(), context=self.context, many=True).data

    def get_allowed_roles(self, obj):
        return RolesSerializer(
            obj.roles.filter(entity=obj.entity), context=self.context, many=True
        ).data

    def get_entity_title(self, obj):
        return obj.entity.title

    def get_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"

    def get_country_title(self, obj):
        if obj.country:
            return f"{obj.country.title}"
        else:
            return ""

    def get_documents_verified(self, obj):
        if models.UserDocuments.objects.filter(owner=obj).exists():
            return True
        else:
            return False
    # def get_accounts(self, obj):
    #     accounts =[]
    #     try:
    #         errors, accounts=get_jambopay_profile_accounts(obj.phone)
    #     except Exception as e:
    #         print(str(e))
    #     return accounts
    
    # def get_is_jp_profile_updated(self, obj):
    #     if not obj.is_jp_profile_updated:
    #         exists = check_user_jambopay_profile_by_phone(obj.phone)
    #         if exists:
    #             obj.is_jp_profile_updated = True
    #             obj.save()
    #     return obj.is_jp_profile_updated



class UsersSerializer(serializers.ModelSerializer):
    images = UserImageSerializer(many=True, read_only=True)
    documents = UserDocumentsSerializer(many=True, read_only=True)
    favorite_entities = EntitySerializer(many=True, read_only=True)
    password = serializers.CharField(style={"input_type": "password"}, write_only=True)
    # tokens = serializers.SerializerMethodField()
    documents_verified = serializers.SerializerMethodField(read_only=True)
    owned_entities = serializers.SerializerMethodField(read_only=True)
    employer_entities = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    entity_type = serializers.SerializerMethodField(read_only=True)
    entity_postal_address = serializers.SerializerMethodField(read_only=True)
    entity_town = serializers.SerializerMethodField(read_only=True)
    entity_country_title = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    profile = serializers.SerializerMethodField(read_only=True)
    primary_schools = serializers.SerializerMethodField(read_only=True)
    secondary_schools = serializers.SerializerMethodField(read_only=True)
    colleges = serializers.SerializerMethodField(read_only=True)
    # is_agent = serializers.SerializerMethodField(read_only=True)
    employments = serializers.SerializerMethodField(read_only=True)
    # accounts = serializers.SerializerMethodField(read_only=True)
    agent_id = serializers.SerializerMethodField(read_only=True)
    roles_string = serializers.SerializerMethodField(read_only=True)


    class Meta:
        model = models.Users
        fields = (
            "id",
            "url",
            "entity",
            "entity_title",
            "entity_postal_address",
            "entity_country_title",
            "entity_town",
            "entity_title",
            "entity_type",
            "accepted_terms",
            "email",
            "first_name",
            "middle_name",
            "last_name",
            "identifier_type",
            "identifier_number",
            "title",
            "gender",
            "education_level",
            "marital_status",
            "phone",
            "key",
            "date_of_birth",
            "password",
            "is_staff",
            "is_active",
            "is_verified",
            "iprs_verified",
            "is_email_verified",
            "is_profile_verified",
            "roles_string",
            "phone_otp_verified",
            "profile",
            "is_searchable",
            "is_agent",
            "roles",
            "gender",
            "registration_method",
            "allowed_roles",
            "favorite_entities",
            "notification_token",
            "owned_entities",
            "employer_entities",
            "images",
            "documents",
            "documents_verified",
            "is_profile_updated",
            "created_at",
            "primary_schools",
            "secondary_schools",
            "colleges",
            "employments",
            # "accounts",
            "agent_id",
            "owner",
            "country",
            "county",
            "creating_agent"
           
        )

        read_only_fields = (
            "id",
            "url",
            "is_profile_updated",
            "favorite_entities",
            "allowed_roles",
            "created_at",
            "is_verified",
        )

        extra_kwargs = {
            "password": {"write_only": True, "min_length": 8},
            "confirm_password": {"write_only": True, "min_length": 8},
        }
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }

        extra_kwargs = {
            "documents": {
                "required": False,
            }
        }
        extra_kwargs = {
            "roles": {
                "required": False,
            }
        }
    # def get_is_jp_profile_updated(self, obj):
    #     if not obj.is_jp_profile_updated:
    #         exists = check_user_jambopay_profile_by_phone(obj.phone)
    #         if exists:
    #             obj.is_jp_profile_updated = True
    #             obj.save()
    #     return obj.is_jp_profile_updated
    
    def validate_email(self, value):
        qs = models.Users.objects.filter(email__iexact=value)
        if qs.exists():
            raise serializers.ValidationError("Email address is already in use")
        return value

    def validate_username(self, value):
        qs = models.Users.objects.filter(username__iexact=value)
        if qs.exists():
            raise serializers.ValidationError("Phone address is already in use")
        return value

    def create(self, validated_data):
        return models.Users.objects.create_user(**validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        updated = super().update(instance, validated_data)

        # We save again the user if the password was specified to make sure it's properly hashed.
        if "password" in validated_data:
            updated.set_password(validated_data["password"])
            updated.save()
        return updated

    # def get_is_subscribed(self, obj):
    #     # Check if there is only one valid licence and return

    #     return (
    #         Subscriptions.objects.filter(
    #             entity=obj.entity, is_active=True).count() >= 0
    #     )

    def get_owned_entities(self, obj):
        """Retur list of owned entities for non staff users"""
        if not obj.is_staff:
            entities = models.Entities.objects.filter(owner=obj)
            return EntityMiniSerializer(entities, context=self.context, many=True).data
        else:
            return []

    # def get_agency_entities(self, obj):
    #     """Retur list of entities where user is agent"""
    #     if not obj.is_staff:
    #         agent = Agents.objects.filter(user=obj)
    #         if agent:
    #             return EntityMiniSerializer(
    #                 agent.entities.all(), context=self.context, many=True
    #             ).data
    #         else:
    #             return []
    #     else:
    #         return []
    def get_employer_entities(self, obj):
        """Retur list of entities where user is employee"""
        employer_entities=[]
        if not obj.is_staff:
            employments = Employees.objects.filter(user=obj)
            if employments:
                for emp in employments:
                    employer_entities.append(emp.entity)
                return EntityMiniSerializer(
                    employer_entities, context=self.context, many=True
                ).data
            else:
                return []
        else:
            return []

    def get_primary_schools(self, obj):
        primary_schools = models.PrimarySchools.objects.filter(owner=obj)
        return PrimarySchoolsSerializer(
            primary_schools, context=self.context, many=True
        ).data

    def get_agent_id(self, obj):
        agent=""
        if Agents.objects.filter(user=obj,is_active=True).exists():
            agent =Agents.objects.filter(user=obj,is_active=True).first()
            obj.is_agent=True
            obj.save()
            return agent.id
        else:
            obj.is_agent=False
            obj.save()
            return ""

    def get_title(self, obj):
        return f"{obj.first_name} {obj.last_name}"

    def get_secondary_schools(self, obj):
        secondary_schools = models.SecondarySchools.objects.filter(owner=obj)
        return SecondarySchoolsSerializer(
            secondary_schools, context=self.context, many=True
        ).data

    def get_colleges(self, obj):
        colleges = models.Colleges.objects.filter(owner=obj)
        return CollegesSerializer(colleges, context=self.context, many=True).data

    def get_universities(self, obj):
        universities = models.Universities.objects.filter(owner=obj)
        return UniversitiesSerializer(
            universities, context=self.context, many=True
        ).data

    def get_employments(self, obj):
        universities = models.Employments.objects.filter(owner=obj)
        return EmploymentsSerializer(universities, context=self.context, many=True).data

    def get_profile(self, obj):
        if models.Profiles.objects.filter(owner=obj).count() > 0:
            profile = models.Profiles.objects.filter(owner=obj).first()
            return ProfilesSerializer(
                profile,
                context=self.context,
            ).data
        else:
            return None

    # def get_tokens(self, obj):
    #     user = models.Users.objects.get(id=obj.id)
    #     return {
    #         "access": user.tokens()["access"],
    #         "refresh": user.tokens()["refresh"],
    #     }

    def get_entity_title(self, obj):
        return obj.entity.title
    
    def get_entity_type(self, obj):
        return obj.entity.entity_type

    def get_entity_postal_address(self, obj):
        return obj.entity.postal_address

    def get_entity_town(self, obj):
        return obj.entity.town

    def get_entity_country_title(self, obj):
        if obj.entity.country:
            return obj.entity.country.title
        else:
            return ""

    def get_documents_verified(self, obj):
        if models.UserDocuments.objects.filter(owner=obj, is_verified=True).exists():
            return True
        else:
            return False
    def get_roles_string(self, obj):
        roles_string=""
        if len(obj.roles.all())>0:
            for role in obj.roles.all():
                roles_string=roles_string + role.title +", "
        return roles_string[:-2]

class ResetPasswordEmailRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(min_length=2)

    class Meta:
        fields = [
            "email",
        ]


class PhoneLoginSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(max_length=255, min_length=3, read_only=True)
    password = serializers.CharField(max_length=68, min_length=6, write_only=True)
    id = serializers.CharField(max_length=255, min_length=3, read_only=True)
    notification_token = serializers.CharField(
        max_length=255, min_length=3, read_only=True
    )
    is_staff = serializers.BooleanField(read_only=True)
    is_searchable = serializers.BooleanField(read_only=True)
    phone = serializers.CharField(
        max_length=20,
        min_length=3,
    )
    first_name = serializers.CharField(max_length=100, min_length=3, read_only=True)
    last_name = serializers.CharField(max_length=100, min_length=3, read_only=True)
    date_of_birth = serializers.CharField(max_length=255, min_length=3, read_only=True)
    entity = serializers.CharField(max_length=255, min_length=3, read_only=True)
    roles = RolesSerializer(read_only=True, many=True)
    tokens = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    wallets = serializers.SerializerMethodField(read_only=True)
    entities = serializers.SerializerMethodField(read_only=True)
    user_details = serializers.SerializerMethodField(read_only=True)
    entity_details = serializers.SerializerMethodField(read_only=True)
    profile_details = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Users
        fields = [
            "id",
            "country",
            "email",
            "password",
            "phone",
            "title",
            "first_name",
            "middle_name",
            "last_name",
            "date_of_birth",
            "entity",
            "is_staff",
            "registration_method",
            "is_searchable",
            "is_profile_verified",
            "roles",
            "tokens",
            "entities",
            "wallets",
            "images",
            "user_details",
            "entity_details",
            "profile_details",
            "notification_token",
        ]
        read_only_fields = [
            "is_profile_verified",
        ]

    def get_entities(self, obj):
        user = models.Users.objects.get(email=obj["email"])
        if not user.is_staff:
            entities = models.Entities.objects.filter(owner=user)
            if entities.count() > 0:
                # for entity in entities:
                #     if models.Roles.objects.filter(
                #         value="RETAIL_SUPER_ADMIN", entity=entity.id
                #     ).exists():
                #         roles = models.Roles.objects.get(
                #             value="RETAIL_SUPER_ADMIN", entity=entity.id
                #         )
                #         user.roles.add(roles)
                #         user.save()

                return EntitySerializer(entities, context=self.context, many=True).data
            else:
                return None
        return None

    def get_wallets(self, obj):
        user = models.Users.objects.get(email=obj["email"])
        wallets = models.Wallets.objects.filter(owner=user)

        return WalletSerializer(wallets, context=self.context, many=True).data

    def get_user_details(self, obj):
        user = models.Users.objects.get(email=obj["email"])
        return GenericUserSerializer(
            user,
            context=self.context,
        ).data

    def get_entity_details(self, obj):
        user = Users.objects.get(email=obj["email"])
        entity = models.Entities.objects.get(id=user.entity_id)

        return EntitySerializer(
            entity,
            context=self.context,
        ).data

    def get_images(self, obj):
        user = Users.objects.get(email=obj["email"])
        image = models.UserImages.objects.filter(owner=user)

        return UserImageSerializer(image, context=self.context, many=True).data

    def get_title(self, obj):
        return f"{obj.first_name} {obj.last_name} - {obj.phone}"

    def get_profile_details(self, obj):
        user = Users.objects.get(email=obj["email"])
        if models.Profiles.objects.filter(owner=user).count() > 0:
            profile = models.Profiles.objects.get(owner=user)
            return ProfilesSerializer(
                profile,
                context=self.context,
            ).data
        else:
            return None

    def get_tokens(self, obj):
        # Pass the default client role

        user = Users.objects.get(email=obj["email"])
        if not user.is_staff:
            role = models.Roles.objects.get(value="CLIENT")
            if role:
                user.roles.add(role)
                user.save()
                # raise exceptions.ValidationError(f"{roles}")
            else:
                pass

        return {
            "access": user.tokens()["access"],
            "refresh": user.tokens()["refresh"],
        }

    def validate(self, attrs):
        phone = attrs.get("phone", "")
        password = attrs.get("password", "")

        user = auth.authenticate(phone=phone, password=password)
        if not user:
            raise serializers.ValidationError(
                "No user was retrieved for provided details. Enter new details and try again."
            )

        if not user.is_active:
            raise serializers.ValidationError(
                "models.Wallets not active. Contact admin"
            )
        # if not user.is_verified:
        #     raise serializers.ValidationError(
        #         'Email is not verified. Log in to your email to verify')

        if user.notification_token:
            send_message(user.notification_token, "Hey there", "You are logged in!!")
        return {
            "tokens": user.tokens(),
            "notification_token": user.notification_token,
        }


class UniversityTranscriptsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.UniversityTranscripts
        fields = ("id", "owner", "transcript", "university", "created", "updated")

        read_only_fields = ("id", "created", "updated", "university")




class UniversitiesSerializer(serializers.ModelSerializer):
    university_transcripts = UniversityTranscriptsSerializer(many=True, read_only=True)
    owner_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Universities
        fields = [
            "id",
            "university_title",
            "degree_title",
            "grade_attained",
            "gpa_attained",
            "degree_type",
            "start",
            "end",
            "university_transcripts",
            "is_verified",
            "verified_by",
            "owner_details",
            "created",
            "updated",
        ]
        read_only_fields = (
            "id",
            "owner",
            "is_verified",
            "verified_by",
            "owner_details",
        )
        extra_kwargs = {
            "university_transcripts": {
                "required": False,
            }
        }

    # def create(self, validated_data):
    #     user = self.context.get('user')
    #     if self.context:
    #         raise exceptions.ValidationError(
    #             f"{self.context.get('user').entity}")
    #     else:
    #         raise exceptions.ValidationError("No useer")
    #     return super().create(validated_data)

    def get_owner_details(self, obj):
        owner = Users.objects.get(id=obj.owner.id)
        return GenericUserSerializer(
            owner,
            context=self.context,
        ).data


class EmploymentTestimonialsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.EmploymentTestimonials
        fields = ("id", "owner", "testimonial", "employment", "created", "updated")

        read_only_fields = ("id", "created", "updated", "employment")


# class EmployersSerializer(serializers.ModelSerializer):
#     entity_title = serializers.SerializerMethodField(read_only=True)
#     department_title = serializers.SerializerMethodField(read_only=True)
#     designation_title = serializers.SerializerMethodField(read_only=True)

#     class Meta:

#         model = models.Employees
#         fields = (
#             "id",
#             "entity",
#             "entity_title",
#             "department",
#             "department_title",
#             "hire_date",
#             "terminal_date",
#             "designation",
#             "designation_title",
#         )

#     def get_entity_title(self, obj):
#         return obj.entity.title

#     def get_department_title(self, obj):
#         if obj.department:
#             return obj.department.title
#         else:
#             return ""

#     def get_designation_title(self, obj):
#         if obj.designation:
#             return obj.designation.title
#         else:
#             return ""


class EmploymentsSerializer(serializers.ModelSerializer):
    employment_testimonials = EmploymentTestimonialsSerializer(
        many=True, read_only=True
    )

    class Meta:
        model = models.Employments
        fields = [
            "id",
            "employer_title",
            "position_title",
            "employment_type",
            "start",
            "end",
            "comment",
            "employment_testimonials",
            "created",
            "updated",
        ]
        read_only_fields = (
            "id",
            "owner",
        )
        extra_kwargs = {
            "employment_testimonials": {
                "required": False,
            }
        }


class RefereesSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.Referees
        fields = (
            "id",
            "owner",
            "salutation",
            "first_name",
            "last_name",
            "position",
            "phone",
            "email",
            "institution",
            "box",
            "code",
            "town",
            "country",
            "created",
            "updated",
        )

        read_only_fields = ("id", "created", "owner", "updated", "employment")
class AgentsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ["-id"]
        model = models.Agents
        fields = (
            "id",
            "owner",
            "user",
            "is_active",
            "is_approved",
            "created",
            "updated",
        )

        read_only_fields = ("id", "created", "owner", "updated",)


class ProfilesSerializer(serializers.ModelSerializer):
    current_employers = serializers.SerializerMethodField(read_only=True)
    documents = serializers.SerializerMethodField(read_only=True)
    photos = serializers.SerializerMethodField(read_only=True)
    primary_schools = PrimarySchoolsSerializer(read_only=True, many=True)
    secondary_schools = SecondarySchoolsSerializer(read_only=True, many=True)
    colleges = CollegesSerializer(read_only=True, many=True)
    universities = UniversitiesSerializer(read_only=True, many=True)
    employments = EmploymentsSerializer(read_only=True, many=True)
    referees = serializers.SerializerMethodField(
        read_only=True,
    )
    """Profile serializer"""
    owner_details = serializers.SerializerMethodField(read_only=True)
    cadre_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Profiles
        fields = (
            "id",
            "url",
            "owner",
            "biography",
            "is_available",
            "is_verified",
            "is_cadre_updated",
            "documents",
            "gender",
            "education_level",
            "marital_status",
            "cadre",
            "current_address",
            "permanent_address",
            "primary_schools",
            "secondary_schools",
            "colleges",
            "universities",
            "employments",
            "photos",
            "referees",
            "verified_by",
            "created",
            "is_searchable",
            "current_employers",
            "updated",
            "cadre_details",
            "owner_details",
        )
        read_only_fields = (
            "id",
            "url",
            "gender",
            "education_level",
            "marital_status",
            "is_available",
            "is_verified",
            "verified_by",
            "is_searchable",
            "is_cadre_updated",
            "documents",
            "photos",
            "owner",
            "cadre_details",
            "owner_details",
            "created",
            "updated",
        )
        # Required for the many-to-many relationship
        extra_kwargs = {"primary_schools": {"required": False}}
        extra_kwargs = {"secondary_schools": {"required": False}}
        extra_kwargs = {"colleges": {"required": False}}
        extra_kwargs = {"universities": {"required": False}}
        extra_kwargs = {"referees": {"required": False}}
        extra_kwargs = {
            "licences": {
                "required": False,
            },
        }

    def get_referees(self, obj):
        referees = None
        if obj.owner:
            referees = models.Referees.objects.filter(owner_id=obj.owner.id)
        return RefereesSerializer(referees, context=self.context, many=True).data

    def get_documents(self, obj):
        docs = models.IdentityDocuments.objects.filter(profile=obj)
        return IdentityDocumentsSerializer(docs, context=self.context, many=True).data

    def get_photos(self, obj):
        docs = models.ProfilePhotos.objects.filter(profile=obj)
        return ProfilePhotosSerializer(docs, context=self.context, many=True).data

    def get_cadre_details(self, obj):
        if obj.cadre:
            cadre = models.Cadres.objects.get(id=obj.cadre.id)
            return CadresSerializer(
                cadre,
                context=self.context,
            ).data
        else:
            return None

    def get_owner_details(self, obj):
        owner = models.Users.objects.get(id=obj.owner.id)
        return GenericUserSerializer(
            owner,
            context=self.context,
        ).data

    def get_current_employers(self, obj):
        employers = models.Employees.objects.filter(user=obj.owner)
        return EmployersSerializer(employers, context=self.context, many=True).data


class SetNewPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(min_length=6, max_length=68, write_only=True)
    token = serializers.CharField(min_length=1, write_only=True)
    uidb64 = serializers.CharField(min_length=1, write_only=True)

    class Meta:
        field = ["password", "token", "uidb64"]

    def validate(self, attrs):
        try:
            password = attrs.get("password")
            token = attrs.get("token")
            uidb64 = attrs.get("uidb64")

            id = force_str(urlsafe_base64_decode(uidb64))
            user = Users.objects.get(id=id)

            if not PasswordResetTokenGenerator().check_token(user, token):
                raise exceptions.AuthenticationFailed("The reset link is invalid", 401)
            user.set_password(password)
            user.save()
            return user

        except:
            raise exceptions.AuthenticationFailed("The reset link is invalid", 401)
        return super().validate(attrs)


class StakesSerializer(serializers.ModelSerializer):
    ownerName = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Stakes
        fields = (
            "id",
            "entity",
            "percent",
            "amount",
            "created",
            "updated",
            "owner",
            "ownerName",
        )

    def get_ownerName(self, obj):
        return f"{obj.entity.title}"

class BranchesSerializer(serializers.ModelSerializer):

    class Meta:
        model = models.Branches
        fields ="__all__"

class EntityBranchSerializer(serializers.ModelSerializer):
    # entity_title = serializers.SerializerMethodField(read_only=True)
    # county_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.EntityBranches
        fields = (
            "id",
            "entity",
            # "entity_title",
            "title",
            "branch_code",
            "branch_telephone",
            "branch_email",
            "county",
            "country",
            "town",
            "road",
            # "administrator",
            "building",
            "description",
            "is_active",
            "is_verified",
            # "owner",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "created",
            "updated",
        )
    def get_entity_title(self, obj):
        return obj.entity.title
    
    def get_county_title(self, obj):
        if obj.county:
            return obj.county.title
        return ""


# class EntityCollectionAccountsSerializer(serializers.ModelSerializer):
#     account_provider_title = serializers.SerializerMethodField(read_only=True)

#     class Meta:
#         model = models.EntityCollectionAccounts
#         fields = (
#             "id",
#             "entity",
#             "account_provider",
#             "account_provider_title",
#             "account_balance",
#             "account_number",
#             "account_type",
#             "is_verified",
#             "is_active",
#             "verified_by",
#             "owner",
#             "created",
#             "updated",
#         )

#         read_only_fields = (
#             "id",
#             "account_provider_title",
#             "created",
#             "updated",
#         )

#     def get_account_provider_title(self, obj):
#         return obj.account_provider.title


# class EntitySettlementAccountsSerializer(serializers.ModelSerializer):
    # account_provider_title = serializers.SerializerMethodField(read_only=True)

    # class Meta:
    #     model = models.EntitySettlementAccounts
    #     fields = (
    #         "id",
    #         "entity",
    #         "account_provider",
    #         "account_provider_title",
    #         "account_provider_branch",
    #         "account_number",
    #         "account_type",
    #         "is_verified",
    #         "is_active",
    #         "verified_by",
    #         "owner",
    #         "created",
    #         "updated",
    #     )
    #     read_only_fields = (
    #         "id",
    #         "created",
    #         "updated",
    #     )

    def get_account_provider_title(self, obj):
        return obj.account_provider.title


