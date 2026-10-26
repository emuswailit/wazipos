import datetime
from email.mime import image
from authentication.models import Cadres, Entities, Profiles, Roles
from authentication.serializers import (
    CadresSerializer,
    DepartmentsSerializer,
    EntitySerializer,
    ProfilesSerializer,
    RolesSerializer,
    UserImageSerializer,
    UsersSerializer,
    GenericUserSerializer,
)
from django.contrib.auth import get_user_model
from rest_framework import exceptions
from rest_framework import serializers
from django.db import transaction
from employees.utils import update_employee_roles
from . import models
from authentication.models import UserImages

Users = get_user_model()


class DesignationsSerializer(serializers.ModelSerializer):
    cadre_title = serializers.SerializerMethodField(read_only=True)
    cadre_details = serializers.SerializerMethodField(read_only=True)
    """
    Designations serializer
    """

    class Meta:
        model = models.Designations
        fields = (
            "id",
            "entity",
            "cadre",
            "title",
            "description",
            "tenure",
            "advertised",
            "open_slots",
            "advertised_slots",
            "vacant_slots",
            "total_slots",
            "filled_slots",
            "duration_in_months",
            "cadre_title",
            "cadre_details",
            "owner",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "entity",
            "owner",
            "filled_slots",
            "vacant_slots",
            "advertised",
            "created",
            "updated",
        )

    def create(self, validated_data):
        instance, created = self.Meta.model.objects.get_or_create(**validated_data)
        if not created:
            raise exceptions.ValidationError("instance alreaady exists..")
        return instance

    def get_cadre_title(self, obj):
        if obj.cadre:
            return obj.cadre.title
        else:
            return ""

    def get_cadre_details(self, obj):
        return CadresSerializer(obj.cadre, context=self.context).data


class EmployeesSerializer(serializers.ModelSerializer):
    """
    Employees serializer
    """

    user_id = serializers.SerializerMethodField(read_only=True)
    current_branch_title = serializers.SerializerMethodField(read_only=True)
    user_title = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    attached_entity = serializers.SerializerMethodField(read_only=True)
    attached_entity_title = serializers.SerializerMethodField(read_only=True)
    department_title = serializers.SerializerMethodField(read_only=True)
    designation_title = serializers.SerializerMethodField(read_only=True)
    advert_title = serializers.SerializerMethodField(read_only=True)
    roles = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    email = serializers.SerializerMethodField(read_only=True)
    phone = serializers.SerializerMethodField(read_only=True)
    basic_salary = serializers.SerializerMethodField(read_only=True)
    house_allowance = serializers.SerializerMethodField(read_only=True)
    other_allowance = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Employees
        fields = (
            "id",
            "entity",
            "email",
            "entity_title",
            "attached_entity",
            "attached_entity_title",
            "department",
            "department_title",
            "advert",
            "advert_title",
            "user",
            "designation",
            "designation_title",
            "hire_date",
            "phone",
            "terminal_date",
            "title",
            "roles",
            "images",
            "is_active",
            "is_authorized",
            "can_deliver", # 🌟 Added to handle deliveries
            "user_id",
            "user_title",
            "counter_discount_limit",
            "current_branch",
            "current_branch_title",
            "basic_salary",
            "house_allowance",
            "other_allowance",
            "owner",
            "created",
            "updated",
        )

        read_only_fields = ("id", "entity", "owner", "roles", "created", "updated")
        extra_kwargs = {
            "employee_roles": {
                "required": False,
            },
        }

    def get_title(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}"

    def get_advert_title(self, obj):
        if obj.advert:
            return f"{obj.advert.title}"
        else:
            return ""

    def get_current_branch_title(self, obj):
        if obj.current_branch:
            return f"{obj.current_branch.title}"
        else:
            return ""

    def get_user_id(self, obj):
        return f"{obj.user.id}"
    
    def get_user_title(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}"

    def get_email(self, obj):
        return f"{obj.user.email} "

    def get_phone(self, obj):
        return f"{obj.user.phone}"

    def get_user_details(self, obj):
        return GenericUserSerializer(obj.user, context=self.context).data

    def get_images(self, obj):
        if UserImages.objects.filter(owner=obj.user).count() > 0:
            images = UserImages.objects.filter(owner=obj.user)
            return UserImageSerializer(images, context=self.context, many=True).data
        else:
            return None

    def get_roles(self, obj):
        """Return roles for current entity only"""
        return RolesSerializer(
            obj.user.roles.filter(entity=obj.user.entity),
            context=self.context,
            many=True,
        ).data

    def get_basic_salary(self, obj):
        basic_salary = 0.00
        if models.Salaries.objects.filter(employee=obj).exists():
            salary = models.Salaries.objects.filter(employee=obj).first()
            basic_salary = salary.basic_salary
        return basic_salary
    
    def get_house_allowance(self, obj):
        house_allowance = 0.00
        if models.Salaries.objects.filter(employee=obj).exists():
            salary = models.Salaries.objects.filter(employee=obj).first()
            house_allowance = salary.house_allowance
        return house_allowance
    
    def get_other_allowance(self, obj):
        other_allowance = 0.00
        if models.Salaries.objects.filter(employee=obj).exists():
            salary = models.Salaries.objects.filter(employee=obj).first()
            other_allowance = salary.other_allowance
        return other_allowance

    def get_entity_title(self, obj):
        return obj.entity.title

    def get_attached_entity(self, obj):
        return obj.user.entity.id

    def get_attached_entity_title(self, obj):
        return obj.user.entity.title

    def get_department_title(self, obj):
        if obj.department:
            return obj.department.title
        else:
            return ""

    def get_designation_title(self, obj):
        if obj.designation:
            return obj.designation.title
        else:
            return ""

    @transaction.atomic
    def create(self, validated_data):
        employee_profile = None
        roles = None
        # Remove roles from the other data
        employee_roles = validated_data.pop("employee_roles", None)
        advert = validated_data.get("advert", None)
        user = validated_data.get("user", None)
        designation = validated_data.get("designation", None)
        owner = self.context.get("user")

        if user:
            if Profiles.objects.filter(owner=user).exists():
                employee_profile = Profiles.objects.filter(owner=user).first()
                if employee_profile.is_verified:
                    pass
                else:
                    raise exceptions.ValidationError(
                        f"Profile for this user is not verified"
                    )
            else:
                raise exceptions.ValidationError(
                    f"Profile for this user does not exist"
                )
        else:
            raise exceptions.ValidationError(f"User is required")
        if not designation:
            raise exceptions.ValidationError(
                f"Select designation for this employee or create one"
            )

        # Cadre for designation and profile should match
        if designation.cadre != designation.cadre:
            raise exceptions.ValidationError(
                "Cadre for selected designation and selected designation do not match"
            )
        # Add user designation as employee to entity once
        if (
            models.Employees.objects.filter(
                user=user, entity=user.entity, designation=designation
            ).count()
            > 0
        ):
            raise exceptions.ValidationError(
                "Users already added as an employee in this entity"
            )

        terminal_date = validated_data.get("terminal_date", None)
        if terminal_date and terminal_date < datetime.date.today():
            raise exceptions.ValidationError("Terminal date cannot be a past date")

        hire_date = validated_data.get("hire_date", None)
        if hire_date:
            if hire_date and terminal_date and terminal_date < hire_date:
                raise exceptions.ValidationError(
                    "Terminal date cannot be a before hire date"
                )

        created = models.Employees.objects.create(**validated_data)
        created.designation.filled_slots = created.designation.filled_slots + 1
        created.designation.advertised_slots = created.designation.advertised_slots - 1
        created.designation.save()

        # Setting of employee roles
        if employee_roles:
            created.employee_roles.set(employee_roles)
            default_role = Roles.objects.get(value="CLIENT")
            if default_role:
                created.employee_roles.add(default_role)
            created.save()
            user.roles.set(created.employee_roles.all())
            user.save()

        return created

    def update(self, instance, validated_data):
        owner = self.context.get("user")
        new_roles = validated_data.pop("employee_roles", None)

        # Handle the update of can_deliver if it's passed
        if "can_deliver" in validated_data:
            instance.can_deliver = validated_data["can_deliver"]

        update_employee_roles(instance, new_roles, owner)
        instance.save()
        
        return instance


# ❌ DELETED: DeliveryPersonsSerializer has been removed


class SalariesSerializer(serializers.ModelSerializer):
    """
    Salaries serializer
    """

    class Meta:
        model = models.Salaries
        fields = (
            "id",
            "entity",
            "employee",
            "basic_salary",
            "house_allowance",
            "other_allowance",
            "is_active",
            "owner",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "owner",
            "entity",
            "employee",
            "created",
            "updated",
        )


class AdvertsSerializer(serializers.ModelSerializer):
    entity_title = serializers.SerializerMethodField(read_only=True)
    designation_title = serializers.SerializerMethodField(read_only=True)
    vacancies_str = serializers.SerializerMethodField(read_only=True)

    """
    Adverts serializer
    """

    class Meta:
        model = models.Adverts
        fields = (
            "id",
            "entity",
            "designation",
            "title",
            "vacancies",
            "closes",
            "description",
            "is_active",
            "owner",
            "entity_title",
            "designation_title",
            "vacancies_str",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "owner",
            "is_active",
            "entity",
            "created",
            "updated",
        )

    def create(self, validated_data):
        instance, created = self.Meta.model.objects.get_or_create(**validated_data)
        if not created:
            raise exceptions.ValidationError("instance alreaady exists..")
        return instance

    def get_entity_title(self, obj):
        entity_title = ""
        if obj.entity:
            entity_title = f"{obj.entity.title}"
        return entity_title

    def get_designation_title(self, obj):
        designation_title = ""
        if obj.designation:
            designation_title = f"{obj.designation.title}"
        return designation_title

    def get_vacancies_str(self, obj):
        return f"{obj.vacancies}"