from authentication.serializers import EntitySerializer
from core import exceptions
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers, status, exceptions
from rest_framework.validators import UniqueTogetherValidator, UniqueValidator
from django.db import transaction
from rest_framework import serializers





from . import models

User = get_user_model()


class BodySystemImagesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.BodySystemImages
        fields = ("image", "entity", "system", "owner", "created", "updated")
        read_only_fields = (
            "owner",
            "created",
            "updated",
            "entity",
        )


class BodySystemSerializer(serializers.ModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)
    images = BodySystemImagesSerializer(many=True, read_only=True)

    class Meta:
        model = models.BodySystem
        fields = (
            "id",
            "title",
            "description",
            "owner",
            "images",
            "entity",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "created",
            "images",
            "entity",
            "updated",
            "owner",
            "is_active",
        )
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }

    # def get_owner_details(self, obj):
    #     owner = User.objects.get(id=obj.owner.id)
    #     return UserSerializer(owner, context=self.context).data

    def get_images(self, obj):
        images = models.BodySystemImages.objects.filter(body_system=obj)
        return BodySystemImagesSerializer(images, context=self.context, many=True).data


class InstructionSerializer(serializers.HyperlinkedModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Instruction
        fields = (
            "id",
            "url",
            "title",
            "description",
            "owner",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "created",
            "updated",
            "owner",
        )


class RoutesSerializer(serializers.HyperlinkedModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Routes
        fields = (
            "id",
            "title",
            "description",
            "owner",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
        )


class FrequencySerializer(serializers.HyperlinkedModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Frequency
        fields = (
            "id",
            "title",
            "abbreviation",
            "latin",
            "numerical",
            "description",
            "owner",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
        )


class DrugClassSerializer(serializers.ModelSerializer):
 

    class Meta:
        model = models.DrugClass
        fields = (
            "id",
            "title",
            "description",
            "owner",
            "image",
            "created",
            "updated",
            
        )

        read_only_fields = ("id", "created", "updated", "owner",)
        validators = [
            UniqueTogetherValidator(
                queryset=models.DrugClass.objects.all(), fields=["title"]
            )
        ]

    def get_body_system_title(self, obj):
        body_system_title=""
        if obj.body_system:
            body_system_title = obj.body_system.title
        return body_system_title


class DrugSubClassSerializer(serializers.ModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)
    drug_class_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.DrugSubClass
        fields = (
            "id",
            "title",
            "description",
            "image",
            "drug_class",
            "owner",
            "created",
            "updated",
            "drug_class_title",
        )

        read_only_fields = (
            "id",
            "created",
            "updated",
            "owner",
        )

    # def get_owner_details(self, obj):
    #     owner = User.objects.get(id=obj.owner.id)
    #     return UserSerializer(owner, context=self.context).data

    def get_drug_class_title(self, obj):
        drug_class = models.DrugClass.objects.get(id=obj.drug_class.id)
        if drug_class:
            return drug_class.title
        else:
            return ""

class GenericsSerializer(serializers.ModelSerializer):
    drug_class = serializers.PrimaryKeyRelatedField(
        queryset=models.DrugClass.objects.all(),
        many=True,
        required=False,
    )
    drug_sub_class = serializers.PrimaryKeyRelatedField(
        queryset=models.DrugSubClass.objects.all(),
        many=True,
        required=False,
    )

    # Read-only convenience fields
    drug_class_titles = serializers.SerializerMethodField()
    drug_sub_class_titles = serializers.SerializerMethodField()

    class Meta:
        model = models.Generics
        fields = [
            "id",
            "title",
            "description",
            "synonym",
            "drug_class",
            "drug_sub_class",
            "drug_class_titles",
            "drug_sub_class_titles",
            "owner",
            "created",
            "updated",
        ]
        read_only_fields = ["owner", "created", "updated"]

    def get_drug_class_titles(self, obj):
        return list(obj.drug_class.values_list("title", flat=True))

    def get_drug_sub_class_titles(self, obj):
        return list(obj.drug_sub_class.values_list("title", flat=True))

    def validate_title(self, value):
        if value:
            return value.strip().upper()
        return value

    def validate(self, attrs):
        # On PATCH, fall back to the instance's current M2M values
        if self.instance:
            classes = attrs.get("drug_class", list(self.instance.drug_class.all()))
            subclasses = attrs.get(
                "drug_sub_class", list(self.instance.drug_sub_class.all())
            )
        else:
            classes = attrs.get("drug_class", [])
            subclasses = attrs.get("drug_sub_class", [])

        class_ids = {c.id for c in classes}
        subclass_parent_ids = {sc.drug_class_id for sc in subclasses}
        missing = subclass_parent_ids - class_ids

        if missing:
            missing_titles = list(
                models.DrugClass.objects.filter(id__in=missing).values_list("title", flat=True)
            )
            raise serializers.ValidationError({
                "drug_class": (
                    "Every subclass's parent class must also be selected. "
                    f"Missing: {missing_titles}"
                )
            })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        classes = validated_data.pop("drug_class", [])
        subclasses = validated_data.pop("drug_sub_class", [])

        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data.setdefault("owner", request.user)

        instance = models.Generics.objects.create(**validated_data)
        instance.drug_class.set(classes)
        instance.drug_sub_class.set(subclasses)
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        classes = validated_data.pop("drug_class", None)
        subclasses = validated_data.pop("drug_sub_class", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if classes is not None:
            instance.drug_class.set(classes)
        if subclasses is not None:
            instance.drug_sub_class.set(subclasses)

        return instance


class GenericsSerializer(serializers.ModelSerializer):
    drug_class = serializers.PrimaryKeyRelatedField(
        queryset= models.DrugClass.objects.all(),
        many=True,
        required=False,
    )
    drug_sub_class = serializers.PrimaryKeyRelatedField(
        queryset=models.DrugSubClass.objects.all(),
        many=True,
        required=False,
    )

    # Read-only convenience fields
    drug_class_titles = serializers.SerializerMethodField()
    drug_sub_class_titles = serializers.SerializerMethodField()

    class Meta:
        model = models.Generics
        fields = [
            "id",
            "title",
            "description",
            "synonym",
            "drug_class",
            "drug_sub_class",
            "drug_class_titles",
            "drug_sub_class_titles",
            "owner",
            "created",
            "updated",
        ]
        read_only_fields = ["owner", "created", "updated"]

    def get_drug_class_titles(self, obj):
        return list(obj.drug_class.values_list("title", flat=True))

    def get_drug_sub_class_titles(self, obj):
        return list(obj.drug_sub_class.values_list("title", flat=True))

    def validate_title(self, value):
        if value:
            return value.strip().upper()
        return value

    def validate(self, attrs):
        # On PATCH, fall back to the instance's current M2M values
        if self.instance:
            classes = attrs.get("drug_class", list(self.instance.drug_class.all()))
            subclasses = attrs.get(
                "drug_sub_class", list(self.instance.drug_sub_class.all())
            )
        else:
            classes = attrs.get("drug_class", [])
            subclasses = attrs.get("drug_sub_class", [])

        class_ids = {c.id for c in classes}
        subclass_parent_ids = {sc.drug_class_id for sc in subclasses}
        missing = subclass_parent_ids - class_ids

        if missing:
            missing_titles = list(
                 models.DrugClass.objects.filter(id__in=missing).values_list("title", flat=True)
            )
            raise serializers.ValidationError({
                "drug_class": (
                    "Every subclass's parent class must also be selected. "
                    f"Missing: {missing_titles}"
                )
            })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        classes = validated_data.pop("drug_class", [])
        subclasses = validated_data.pop("drug_sub_class", [])

        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data.setdefault("owner", request.user)

        instance = models.Generics.objects.create(**validated_data)
        instance.drug_class.set(classes)
        instance.drug_sub_class.set(subclasses)
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        classes = validated_data.pop("drug_class", None)
        subclasses = validated_data.pop("drug_sub_class", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if classes is not None:
            instance.drug_class.set(classes)
        if subclasses is not None:
            instance.drug_sub_class.set(subclasses)

        return instance



class GenericsDisplaySerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Generics
        extra_kwargs = {"response_message": "Request successful"}
        fields = (
            "id",
            "url",
            "title",
            "description",
            "drug_class",
            "drug_sub_class",
            "drug_class_details",
            "drug_sub_class_details",
            "owner",
            "created",
            "updated",
            "preparations",
        )

        read_only_fields = (
            "id",
            "url",
            "created",
            "updated",
            "owner",
        )


class PreparationSerializer(serializers.ModelSerializer):
    gen_array = serializers.SerializerMethodField(read_only=True)
    formulation_title = serializers.SerializerMethodField(read_only=True)
    generics_string = serializers.SerializerMethodField(read_only=True)
    long_title = serializers.SerializerMethodField(read_only=True)
    key = serializers.SerializerMethodField(read_only=True)

    # Optional: make generics non-required on write
    generics = serializers.PrimaryKeyRelatedField(
        queryset=models.Generics.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = models.Preparation
        fields = (
            "id",
            "generics",
            "title",
            "long_title",
            "formulation",
            "description",
            "formulation_title",
            "generics_string",
            "key",
            "gen_array",
        )
        read_only_fields = ("owner", "gen_array")
        validators = [
            UniqueTogetherValidator(
                queryset=models.Preparation.objects.all(),
                fields=["title"],
            )
        ]

    def get_gen_array(self, obj):
        """Full nested generics objects for read-heavy consumers."""
        generics = obj.generics.all()
        if not generics:
            return []
        return GenericsSerializer(
            generics, context=self.context, many=True
        ).data

    def get_generics_string(self, obj):
        """Comma-joined titles — used in product listings."""
        generics = obj.generics.all()
        if not generics:
            return ""
        return ", ".join(g.title for g in generics if g.title)

    def get_formulation_title(self, obj):
        return f"{obj.formulation.title}" if obj.formulation else ""

    def get_long_title(self, obj):
        if not obj.formulation:
            return obj.title or ""
        return f"{obj.title}-{obj.formulation.title}"

    def get_key(self, obj):
        return obj.id


class PreparationDisplaySerializer(serializers.ModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)
    gen_array = serializers.SerializerMethodField(read_only=True)
    formulation_details = serializers.SerializerMethodField(read_only=True)
    generics = GenericsSerializer(many=True, read_only=True)

    # Implement a case sensitive check for uniqueness
    title = serializers.CharField(
        max_length=240,
        validators=[
            UniqueValidator(queryset=models.Preparation.objects.all(), lookup="iexact")
        ],
    )

    class Meta:
        model = models.Preparation
        fields = (
            "id",
            "url",
            "generics",
            "title",
            "formulation",
            "description",
            "formulation_details",
            "gen_array",
        )
        extra_kwargs = {"generics": {"required": False}}
        read_only_fields = ("owner", "gen_array")

    # def get_owner_details(self, obj):
    #     owner = User.objects.get(id=obj.owner.id)
    #     return UserSerializer(owner, context=self.context).data

    def get_formulation_details(self, obj):
        formulation = models.Formulations.objects.get(id=obj.formulation.id)
        return FormulationsSerializer(formulation, context=self.context).data

    def get_gen_array(self, obj):
        generics = obj.generics.all()
        if generics.count() > 0:
            return GenericsSerializer(generics, context=self.context, many=True).data
        else:
            return None


class FormulationsSerializer(serializers.HyperlinkedModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)

    # Implement a case sensitive check for uniqueness
    title = serializers.CharField(
        max_length=240,
        validators=[
            UniqueValidator(queryset=models.Formulations.objects.all(), lookup="iexact")
        ],
    )

    class Meta:
        model = models.Formulations
        fields = (
            "id",
            "title",
            "description",
            "owner",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "created",
            "updated",
            "owner",
        )


class BodySystemDisplaySerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.BodySystem
        fields = (
            "title",
            "description",
        )


class RoutesDisplaySerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.Routes
        fields = (
            "title",
            "description",
        )


class FrequencyDisplaySerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.Frequency
        fields = ("title", "numerical", "description")


class GenericDisplaySerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.Generics
        fields = ("title", "description")


class FormulationsDisplaySerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.Formulations
        fields = ("title", "description")


class IndicationsSerializer(serializers.HyperlinkedModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Indications
        fields = (
            "id",
            "url",
            "entity",
            "generic",
            "indication",
            "description",
            "owner",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "entity",
            "owner",
        )


class DosesSerializer(serializers.HyperlinkedModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Doses
        fields = (
            "id",
            "url",
            "entity",
            "generic",
            "indication",
            "route",
            "dose",
            "owner",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "entity",
            "owner",
        )


class ModeOfActionsSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.ModeOfActions
        fields = (
            "id",
            "url",
            "entity",
            "generic",
            "mode_of_action",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "entity",
            "owner",
        )


class ContraindicationsSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.Contraindications
        fields = (
            "id",
            "url",
            "entity",
            "generic",
            "title",
            "description",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "entity",
            "owner",
        )


class InteractionsSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.Interactions
        fields = (
            "id",
            "url",
            "entity",
            "generic",
            "contra_indicated",
            "description",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "entity",
            "owner",
        )


class SideEffectsSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.SideEffects
        fields = (
            "id",
            "url",
            "entity",
            "generic",
            "title",
            "description",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "entity",
            "owner",
        )


class PrecautionsSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.Precautions
        fields = (
            "id",
            "url",
            "entity",
            "generic",
            "title",
            "description",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "entity",
            "owner",
        )


class SpecialConsiderationsSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = models.SpecialConsiderations
        fields = (
            "id",
            "url",
            "entity",
            "generic",
            "title",
            "description",
            "created",
            "updated",
        )

        read_only_fields = (
            "id",
            "url",
            "entity",
            "owner",
        )


class GenericReferenceSerializer(serializers.ModelSerializer):
    preparations = serializers.SerializerMethodField(read_only=True)
    indications = serializers.SerializerMethodField(read_only=True)
    doses = serializers.SerializerMethodField(read_only=True)
    modes_of_action = serializers.SerializerMethodField(read_only=True)
    contra_indications = serializers.SerializerMethodField(read_only=True)
    interactions = serializers.SerializerMethodField(read_only=True)
    side_effects = serializers.SerializerMethodField(read_only=True)
    precautions = serializers.SerializerMethodField(read_only=True)
    special_considerations = serializers.SerializerMethodField(read_only=True)
    drug_class_details = serializers.SerializerMethodField(read_only=True)
    drug_sub_class_details = serializers.SerializerMethodField(read_only=True)

    # Implement a case sensitive check for uniqueness
    # title = serializers.CharField(
    #     max_length=240,
    #     validators=[
    #         UniqueValidator(queryset=models.Generics.objects.all(), lookup="iexact")
    #     ],
    # )

    class Meta:
        model = models.Generics
        fields = (
            "id",
            "owner",
            "url",
            "title",
            "description",
            "drug_class",
            "drug_sub_class",
            "created",
            "updated",
            "drug_class_details",
            "drug_sub_class_details",
            "preparations",
            "indications",
            "doses",
            "modes_of_action",
            "side_effects",
            "contra_indications",
            "interactions",
            "precautions",
            "special_considerations",
        )

        read_only_fields = (
            "id",
            "url",
            "created",
            "updated",
            "owner",
        )

    def get_preparations(self, obj):
        preparations = models.Preparation.objects.filter(generic=obj)
        return PreparationSerializer(preparations, context=self.context, many=True).data

    def get_indications(self, obj):
        indications = models.Indications.objects.filter(generic=obj)
        return IndicationsSerializer(indications, context=self.context, many=True).data

    def get_doses(self, obj):
        doses = models.Indications.objects.filter(generic=obj)
        return DosesSerializer(doses, context=self.context, many=True).data

    def get_modes_of_action(self, obj):
        modes_of_action = models.ModeOfActions.objects.filter(generic=obj)
        return ModeOfActionsSerializer(
            modes_of_action, context=self.context, many=True
        ).data

    def get_side_effects(self, obj):
        side_effects = models.SideEffects.objects.filter(generic=obj)
        return SideEffectsSerializer(side_effects, context=self.context, many=True).data

    def get_contra_indications(self, obj):
        contra_indications = models.Contraindications.objects.filter(generic=obj)
        return ContraindicationsSerializer(
            contra_indications, context=self.context, many=True
        ).data

    def get_precautions(self, obj):
        precautions = models.Precautions.objects.filter(generic=obj)
        return PrecautionsSerializer(precautions, context=self.context, many=True).data

    def get_interactions(self, obj):
        interactions = models.Interactions.objects.filter(generic=obj)
        return InteractionsSerializer(
            interactions, context=self.context, many=True
        ).data

    def get_special_considerations(self, obj):
        special_considerations = models.SpecialConsiderations.objects.filter(
            generic=obj
        )
        return SpecialConsiderationsSerializer(
            special_considerations, context=self.context, many=True
        ).data

    def get_drug_class_details(self, obj):
        drug_class = models.DrugClass.objects.get(id=obj.drug_class.id)
        return DrugClassSerializer(drug_class, context=self.context).data

    def get_drug_sub_class_details(self, obj):
        if obj.drug_sub_class:
            drug_sub_class = models.DrugSubClass.objects.get(id=obj.drug_sub_class.id)
            return DrugSubClassSerializer(drug_sub_class, context=self.context).data
