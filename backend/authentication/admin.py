from django.contrib import admin
from . import models

# Register your models here.
from .models import (
    Categories,
    Cadres,
    Constituencies,
    Counties,
    Entities,
    Roles,
    Users,
    UserImages,
    UserDocuments,
    EntityDocuments,
    EntityBranches,
    EntityImages,
    EntityLogos,
    EntityLicences,
    ReferenceNumbers,
    Clusters,
    Plans,
    YearLetters,
    DocumentNumbers,
    Towns,
    Departments,Branches
  
)

# admin.site.register(Entities)
admin.site.register(Clusters)
admin.site.register(models.Agents)
# admin.site.register(Roles)
admin.site.register(Cadres)
admin.site.register(UserImages)

admin.site.register(EntityImages)
admin.site.register(EntityLogos)

admin.site.register(models.DependantImages)
admin.site.register(models.Locations)
admin.site.register(models.SubLocations)
admin.site.register(models.Villages)
admin.site.register(models.EntityDocuments)




@admin.register(Users)
class UsersAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "first_name",
        "last_name",
        "phone",
        "email",
        "is_jp_profile_updated",
        "phone_otp_verified",
        "is_verified",
        "is_agent",
        "created_at",
        "updated_at"
      
    )
    list_filter = ("entity", "first_name", "last_name", "phone", "email")
    search_fields = ("phone","first_name","last_name")
    # list_per_page = 20

    # This will help you to disbale add functionality
    def has_add_permission(self, request):
        return False

    # This will help you to disable delete functionaliyt
    def has_delete_permission(self, request, obj=None):
        return True


@admin.register(Departments)
class DepartmentsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "title",
        # "department_type",
        "description",
        "owner",
        "created",
        "updated"
    )
    list_filter = (
        "entity",
        "owner",
    )
    search_fields = ("title",)


@admin.register(models.Dependants)
class DependantsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "county",
        "first_name",
        "last_name",
        "gender",
        "relationship",
        "owner",
        "created",
        "updated"
    )
    list_filter = (
        "gender",
        "owner",
    )
    search_fields = ("first_name","last_name")

@admin.register(models.Organizations)
class OrganizationsAdmin(admin.ModelAdmin):
    list_display = (
        "organization_type",
        "title",
        "description",
        "owner",
        "created",
        "updated"
    )
    list_filter = (
        "organization_type",
        "owner",
    )
    search_fields = ("title",)



@admin.register(EntityLicences)
class EntityLicencesAdmin(admin.ModelAdmin):
    list_display = (
        "entity",
        "owner",
        "created",
        "updated"
    )
    list_filter = (
        "entity",
        "owner",
    )
    search_fields = ("title",)

@admin.register(Roles)
class RolesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "value",
        "title",
    )
    list_filter = (
        "entity",
        "title",
    )
    search_fields = ("title",)
    # list_per_page = 20

    # This will help you to disbale add functionality
    def has_add_permission(self, request):
        return True

    # This will help you to disable delete functionaliyt
    def has_delete_permission(self, request, obj=None):
        return True


@admin.register(Entities)
class EntitiesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "owner",
        "entity_code",
        "town",
        "road",
        "country",
        "is_verified",
        "entity_type",
        "entity_ownership",
    )
    list_filter = ("title",)
    search_fields = ("title",)
    list_per_page = 20

    # This will help you to disbale add functionality
    def has_add_permission(self, request):
        return True

    # This will help you to disable delete functionaliyt
    def has_delete_permission(self, request, obj=None):
        return True


# @admin.register(EntityCollectionAccounts)
# class EntityCollectionAccountsAdmin(admin.ModelAdmin):
#     list_display = ('entity', "account_number", 'account_provider', "account_type",
#                     "is_verified", "is_active", "consumer_key", "consumer_code", "consumer_secret")
#     list_filter = ('account_number', 'account_type')
#     search_fields = ('account_number', )
#     # list_per_page = 20

#     # This will help you to disbale add functionality
#     def has_add_permission(self, request):
#         return True

#     # This will help you to disable delete functionaliyt
#     def has_delete_permission(self, request, obj=None):
#         return True


@admin.register(Plans)
class PlansAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "registration_fee",
        "subscription",
        "subscription_frequency",
        "duration_in_days",
        "is_active",
        "owner",
        "created",
    )
    list_filter = ("title", "registration_fee", "owner")
    search_fields = ("title",)


@admin.register(EntityBranches)
class EntityBranchesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "entity",
    
        "created",
    )
    list_filter = ("title",  "entity")
    search_fields = ("title",)
@admin.register(Branches)
class BranchesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "entity",
    
        "created",
    )
    list_filter = ("title",  "entity")
    search_fields = ("title",)

@admin.register(ReferenceNumbers)
class ReferenceNumbersAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reference_number",
        "is_used",
        "owner",
        "created",
    )
    list_filter = ("reference_number", "is_used", "owner")
    search_fields = ("reference_number",)


@admin.register(UserDocuments)
class UserDocumentsAdmin(admin.ModelAdmin):
    list_display = (
        "document_number",
        "document_type",
        "owner",
        "is_verified",
        "created",
    )
    list_filter = ("document_number", "is_verified")
    search_fields = ("document_number",)


@admin.register(Towns)
class TownsAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "county",
        "abbreviation",
        "is_city",
        "created",
        "updated",
    )
    search_fields = ("title",)

@admin.register(Counties)
class CountiesAdmin(admin.ModelAdmin):
    list_display = (
        "county_code",
        "country",
        "title",
        "description",
        "created",
        "updated",
    )
    search_fields = ("title",)

@admin.register(models.SubCounties)
class SubCountiesAdmin(admin.ModelAdmin):
    list_display = (
        "sub_county_code",
        "county",
        "title",
        "description",
        "created",
        "updated",
    )
    search_fields = ("title",)

@admin.register(Constituencies)
class ConstituenciesAdmin(admin.ModelAdmin):
    list_display = (
        "constituency_code",
        "county",
        "title",
        "description",
        "created",
        "updated",
    )
    search_fields = ("title",)
@admin.register(YearLetters)
class YearLettersAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "year",
        "letter",
        "created",
        "updated",
    )
    search_fields = ("year",)


@admin.register(DocumentNumbers)
class DocumentNumbersAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "document",
        "document_number",
        "reference_number",
        "created",
        "updated",
    )
    search_fields = ("year",)

@admin.register(Categories)
class CategoriesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "icon",
        "category_class",
        "icon_category",
        "description",
        "created",
        "updated",
    )
    search_fields = ("title",)