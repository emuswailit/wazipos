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

    # ---- 1. Envelope ----
    try:
        generic_details = data["generic_details"]
    except KeyError:
        raise exceptions.ValidationError(
            ["Drug generic details are required"]
        )

    # ---- 2. Title ----
    title = generic_details.get("title")
    if not title or not str(title).strip():
        errors.append("Title cannot be empty")

    # ---- 3. Drug classes (array) ----
    raw_classes = generic_details.get("drug_classes", [])
    if not isinstance(raw_classes, list):
        raw_classes = [raw_classes] if raw_classes else []

    drug_classes_ids = [str(x) for x in raw_classes if x]

    if len(drug_classes_ids) == 0:
        errors.append("At least one drug class is required")

    class_qs = DrugClass.objects.none()
    if drug_classes_ids:
        class_qs = DrugClass.objects.filter(
            id__in=drug_classes_ids
        )
        found_class_ids = set(
            str(x) for x in class_qs.values_list("id", flat=True)
        )
        missing_class_ids = set(drug_classes_ids) - found_class_ids
        if missing_class_ids:
            errors.append(
                "One or more drug classes with provided IDs "
                f"do not exist: {list(missing_class_ids)}"
            )

    # ---- 4. Drug sub classes (array, optional) ----
    raw_sub_classes = generic_details.get("drug_sub_classes", [])
    if not isinstance(raw_sub_classes, list):
        raw_sub_classes = (
            [raw_sub_classes] if raw_sub_classes else []
        )

    drug_sub_classes_ids = [
        str(x) for x in raw_sub_classes if x
    ]

    sub_class_qs = DrugSubClass.objects.none()
    if drug_sub_classes_ids:
        sub_class_qs = DrugSubClass.objects.filter(
            id__in=drug_sub_classes_ids
        )
        found_sub_ids = set(
            str(x)
            for x in sub_class_qs.values_list("id", flat=True)
        )
        missing_sub_ids = (
            set(drug_sub_classes_ids) - found_sub_ids
        )
        if missing_sub_ids:
            errors.append(
                "One or more drug sub classes with provided IDs "
                f"do not exist: {list(missing_sub_ids)}"
            )

    # ---- 5. Invariant: every subclass's parent class must be selected ----
    if class_qs.exists() and sub_class_qs.exists():
        selected_class_ids = set(
            str(x)
            for x in class_qs.values_list("id", flat=True)
        )
        subclass_parent_ids = set(
            str(x)
            for x in sub_class_qs.values_list(
                "drug_class_id", flat=True
            )
        )
        missing_parents = subclass_parent_ids - selected_class_ids
        if missing_parents:
            missing_titles = list(
                DrugClass.objects.filter(
                    id__in=missing_parents
                ).values_list("title", flat=True)
            )
            errors.append(
                "Every subclass's parent class must also be "
                f"selected. Missing: {missing_titles}"
            )

    # ---- 6. Duplicate title within the same set of classes ----
    if title and class_qs.exists():
        normalized_title = str(title).strip().upper()
        for drug_class in class_qs:
            if Generics.objects.filter(
                title=normalized_title,
                drug_class=drug_class,
            ).exists():
                errors.append(
                    f"Generic titled {title} already exists for "
                    f"drug class {drug_class.title}"
                )

    # ---- 7. Bail if any error collected ----
    if errors:
        raise exceptions.ValidationError(errors)

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

