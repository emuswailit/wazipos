from authentication.serializers import EntitySerializer
from core import exceptions
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers, status, exceptions
from rest_framework.validators import UniqueTogetherValidator, UniqueValidator


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


class GenericDisplaySerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Generic
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
    # generics = GenericSerializer(many=True)

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
        # extra_kwargs = {'generics': {'required': False}}
        read_only_fields = ("owner", "gen_array")
        validators = [
            UniqueTogetherValidator(
                queryset=models.Preparation.objects.all(), fields=["title"]
            )
        ]

    def get_gen_array(self, obj):
        generics = obj.generics.all()
        if generics.count() > 0:
            return GenericSerializer(generics, context=self.context, many=True).data
        else:
            return None

    def get_formulation_title(self, obj):
        if obj.formulation:
            return f"{obj.formulation.title}"
        else:
            return ""
    def get_key(self, obj):
            return obj.id

    def get_generics_string(self, obj):
        generics = obj.generics.all()
        generics_string = ""
        generics_string_arr = []
        if len(generics) > 0:
            for item in generics:
                generics_string_arr.append(item.title)
        generics_string = ", ".join(map(str, generics_string_arr))
        return generics_string.rstrip(',') 

    def get_long_title(self, obj):
        formulation = models.Formulations.objects.get(id=obj.formulation.id)
        return f"{obj.title}-{formulation.title}"


class GenericSerializer(serializers.ModelSerializer):
    # preparations = PreparationSerializer(many=True, read_only=True)
    # preparation_details = serializers.SerializerMethodField(read_only=True)
    drug_class_id = serializers.SerializerMethodField(read_only=True)
    drug_class_title = serializers.SerializerMethodField(read_only=True)
    drug_sub_class_id = serializers.SerializerMethodField(read_only=True)
    drug_sub_class_title = serializers.SerializerMethodField(read_only=True)

    # Implement a case sensitive check for uniqueness
    title = serializers.CharField(
        max_length=240,
        validators=[
            UniqueValidator(queryset=models.Generic.objects.all(), lookup="iexact")
        ],
    )

    class Meta:
        model = models.Generic

        fields = (
            "id",
            "title",
            "description",
            "synonym",
            "drug_class",
            "drug_sub_class",
            "drug_class_id",
            "drug_class_title",
            "drug_sub_class_id",
            "drug_sub_class_title",
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

    def validate(self, attrs):
        """Ensure selected drug sub class is a child of selected drug class"""
        if "drug_sub_class" in attrs and "drug_class" in attrs:
            drug_class = attrs["drug_class"]
            drug_sub_class = attrs["drug_sub_class"]

            if drug_sub_class.drug_class != drug_class:
                raise serializers.ValidationError(
                    f"Ensure selected drug sub class is a child of selected drug class"
                )
            else:
                return attrs
        else:
            return attrs

    def get_drug_class_id(self, obj):
        drug_class_id = ""
        if obj.drug_class:
            drug_class_id = obj.drug_class.id
        return drug_class_id

    def get_drug_class_title(self, obj):
        drug_class_title = ""
        if obj.drug_class:
            drug_class_title = obj.drug_class.title
        return drug_class_title

    def get_drug_sub_class_id(self, obj):
        drug_sub_class_id = ""
        if obj.drug_sub_class_id:
            drug_sub_class_id = obj.drug_sub_class.id
        return drug_sub_class_id

    def get_drug_sub_class_title(self, obj):
        drug_sub_class_title = ""
        if obj.drug_sub_class:
            drug_sub_class_title = obj.drug_sub_class.title
        return drug_sub_class_title

    # def get_drug_class_details(self, obj):
    #     drug_class = models.DrugClass.objects.get(id=obj.drug_class.id)
    #     return DrugClassSerializer(drug_class, context=self.context).data

    # def get_drug_sub_class_details(self, obj):
    #     if obj.drug_sub_class:
    #         drug_sub_class = models.DrugSubClass.objects.get(id=obj.drug_sub_class.id)
    #         return DrugSubClassSerializer(drug_sub_class, context=self.context).data
    #     else:
    #         return None


class PreparationDisplaySerializer(serializers.ModelSerializer):
    # owner_details = serializers.SerializerMethodField(read_only=True)
    gen_array = serializers.SerializerMethodField(read_only=True)
    formulation_details = serializers.SerializerMethodField(read_only=True)
    generics = GenericSerializer(many=True, read_only=True)

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
            return GenericSerializer(generics, context=self.context, many=True).data
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
        model = models.Generic
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
    title = serializers.CharField(
        max_length=240,
        validators=[
            UniqueValidator(queryset=models.Generic.objects.all(), lookup="iexact")
        ],
    )

    class Meta:
        model = models.Generic
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
