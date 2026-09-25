from rest_framework import exceptions
from ..models import  DrugClass, DrugSubClass,Generics
from django.db.models import Q
from products.models import Products


def search_generics(data, user):
    pass
    # return Generics.objects.filter(
    #     Q(title__icontains=data["searchQuery"])
    #     | Q(drug_sub_class__title__icontains=data["searchQuery"])
    #     | Q(drug_class__title__icontains=data["searchQuery"])
    # )


def validate_generic_data(data):
    errors = []
    preparation = None
    drug_sub_class = None
    drug_class = None
    try:
        generic_details = data["generic_details"]

    except KeyError:
        errors.append("Drug generic details are required")

    try:
        drug_class = data["generic_details"]["drug_class"]
        if data["generic_details"]["drug_class"] == "":
            errors.append("Drug class ID cannot be empty")
        if drug_class and DrugClass.objects.filter(id=drug_class).exists():
            drug_sub_class = DrugClass.objects.filter(id=drug_class).first()
        else:
            errors.append("Drug class with given ID does not exist")

    except KeyError:
        errors.append("Drug class is required")

    try:
        title = data["generic_details"]["title"]
        if data["generic_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if (
            title
            and Generics.objects.filter(
                title=title.upper(), drug_class=drug_class
            ).exists()
        ):
            errors.append(
                f"Generic titled {title} already exists for the selected drug class"
            )

    except KeyError:
        errors.append("Drug generic title is required")

    if "drug_sub_class" in data["generic_details"]:
        if data["generic_details"]["drug_sub_class"] == "":
            pass
        else:
            drug_sub_class= data["generic_details"]["drug_sub_class"]
            if DrugSubClass.objects.filter(id=drug_sub_class).exists():
                pass
            else:
                errors.append("Drug sub class with provided ID does not exist")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def _to_id_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return [x for x in v if x]
    if isinstance(v, str):
        return [v] if v.strip() else []
    return []


def create_generic(data, user):
    details = data["generic_details"]

    drug_classes_ids = _to_id_list(details.get("drug_classes"))
    drug_sub_classes_ids = _to_id_list(details.get("drug_sub_classes"))

    # Validate drug classes exist
    class_qs = DrugClass.objects.filter(id__in=drug_classes_ids)
    if class_qs.count() != len(set(drug_classes_ids)):
        raise exceptions.ValidationError(
            "One or more drug classes with provided IDs do not exist"
        )

    # Validate drug sub classes exist
    sub_class_qs = DrugSubClass.objects.filter(id__in=drug_sub_classes_ids)
    if sub_class_qs.count() != len(set(drug_sub_classes_ids)):
        raise exceptions.ValidationError(
            "One or more drug sub classes with provided IDs do not exist"
        )

    # Invariant: every subclass's parent class must also be selected
    selected_class_ids = set(class_qs.values_list("id", flat=True))
    subclass_parent_ids = set(
        sub_class_qs.values_list("drug_class_id", flat=True)
    )
    missing = subclass_parent_ids - selected_class_ids
    if missing:
        missing_titles = list(
            DrugClass.objects.filter(id__in=missing).values_list(
                "title", flat=True
            )
        )
        raise exceptions.ValidationError({
            "drug_classes": (
                "Every subclass's parent class must also be selected. "
                f"Missing: {missing_titles}"
            )
        })

    try:
        created = Generics.objects.create(
            title=details["title"],
            description=details.get("description", ""),
            owner=user,
            entity=user.entity,
        )
    except Exception as e:
        raise exceptions.ValidationError(str(e))

    created.drug_class.set(class_qs)
    created.drug_sub_class.set(sub_class_qs)

    return created


def update_generic(data, user):
    details = data["generic_details"]
    generic_id = details.get("id")
    generic = Generics.objects.filter(id=generic_id).first()
    if not generic:
        raise exceptions.ValidationError("Generic not found")

    # Scalar fields
    if "title" in details:
        generic.title = details["title"]
    if "description" in details:
        generic.description = details["description"]
    generic.save()

    # M2M fields
    if "drug_classes" in details:
        class_ids = _to_id_list(details["drug_classes"])
        class_qs = DrugClass.objects.filter(id__in=class_ids)
        if class_qs.count() != len(set(class_ids)):
            raise exceptions.ValidationError(
                "One or more drug classes with provided IDs do not exist"
            )
        generic.drug_class.set(class_qs)
    else:
        class_qs = generic.drug_class.all()

    if "drug_sub_classes" in details:
        sub_class_ids = _to_id_list(details["drug_sub_classes"])
        sub_class_qs = DrugSubClass.objects.filter(id__in=sub_class_ids)
        if sub_class_qs.count() != len(set(sub_class_ids)):
            raise exceptions.ValidationError(
                "One or more drug sub classes with provided IDs do not exist"
            )
        generic.drug_sub_class.set(sub_class_qs)
    else:
        sub_class_qs = generic.drug_sub_class.all()

    # Invariant
    selected_class_ids = set(class_qs.values_list("id", flat=True))
    subclass_parent_ids = set(
        sub_class_qs.values_list("drug_class_id", flat=True)
    )
    missing = subclass_parent_ids - selected_class_ids
    if missing:
        missing_titles = list(
            DrugClass.objects.filter(id__in=missing).values_list(
                "title", flat=True
            )
        )
        raise exceptions.ValidationError({
            "drug_classes": (
                "Every subclass's parent class must also be selected. "
                f"Missing: {missing_titles}"
            )
        })

    return generic

