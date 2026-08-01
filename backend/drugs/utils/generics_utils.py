from rest_framework import exceptions
from ..models import Generic, DrugClass, DrugSubClass
from django.db.models import Q
from products.models import Products


def search_generics(data, user):
    return Generic.objects.filter(
        Q(title__icontains=data["searchQuery"])
        | Q(drug_sub_class__title__icontains=data["searchQuery"])
        | Q(drug_class__title__icontains=data["searchQuery"])
    )


def validate_generic_data(data):
    errors = []
    preparation = None
    drug_sub_class = None
    try:
        generic_details = data["generic_details"]

    except KeyError:
        errors.append("Drug generic details are required")

    try:
        drug_class_id = data["generic_details"]["drug_class"]
        if data["generic_details"]["drug_class"] == "":
            errors.append("Drug class ID cannot be empty")
        if drug_class_id and DrugClass.objects.filter(id=drug_class_id).exists():
            drug_sub_class = DrugClass.objects.filter(id=drug_class_id).first()
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
            and Generic.objects.filter(
                title=title.upper(), drug_class_id=drug_class_id
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
            drug_sub_class_id = data["generic_details"]["drug_sub_class"]
            if DrugSubClass.objects.filter(id=drug_sub_class_id).exists():
                pass
            else:
                errors.append("Drug sub class with provided ID does not exist")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_generic(data, user):
    # Optional drug sub category ID
    drug_sub_class = None
    if (
        "drug_sub_class" in data["generic_details"]
        and not data["generic_details"]["drug_sub_class"] == ""
    ):
        drug_sub_class_id = data["generic_details"]["drug_sub_class"]
        if DrugSubClass.objects.filter(id=drug_sub_class_id).exists():
            drug_sub_class = DrugSubClass.objects.filter(id=drug_sub_class_id).first()
        else:
            raise exceptions.ValidationError(
                "Drug sub class with provided ID does not exist"
            )

    try:
        created = Generic.objects.create(
            title=data["generic_details"]["title"],
            description=data["generic_details"]["description"],
            drug_class_id=data["generic_details"]["drug_class"],
            drug_sub_class=drug_sub_class,
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_all_generics(user):
    return Generic.objects.all()


def update_generic(data, user):
    generic = None
    try:
        generic_id = data["generic_details"]["id"]
        if data["generic_details"]["id"] == "":
            raise exceptions.ValidationError("Drug class ID must be valid UUID")
        if Generic.objects.filter(id=generic_id).exists():
            generic = Generic.objects.get(id=generic_id)
            if user.is_staff:
                pass
            elif user == generic.owner:
                pass
            else:
                raise exceptions.ValidationError("Not authorized")
        else:
            raise exceptions.ValidationError("Generic with supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Body system ID is required")
    try:
        generic_details = data["generic_details"]
        if data["generic_details"] == {}:
            raise exceptions.ValidationError("No body system details were supplied")
    except KeyError:
        raise exceptions.ValidationError("Product details to update are required")

    title = None
    description = None
    drug_class = None
    drug_sub_class = None

    if "title" in data["generic_details"]:
        if data["generic_details"]["title"]:
            title = data["generic_details"]["title"]
    if "description" in data["generic_details"]:
        if data["generic_details"]["description"]:
            description = data["generic_details"]["description"]
    if "drug_class" in data["generic_details"]:
        if data["generic_details"]["drug_class"]:
            drug_class = data["generic_details"]["drug_class"]
    if "drug_sub_class" in data["generic_details"]:
        if data["generic_details"]["drug_sub_class"]:
            drug_sub_class = data["generic_details"]["drug_sub_class"]
            if not DrugSubClass.objects.filter(id=drug_sub_class).exists():
                raise exceptions.ValidationError(
                    "Drug sub class with provided ID does not exist"
                )
    try:
        if title:
            generic.title = title
            generic.save()
        if description:
            generic.description = description
            generic.save()
        if drug_class:
            generic.drug_class_id = drug_class
            generic.save()
        if drug_sub_class:
            generic.drug_sub_class_id = drug_sub_class
            generic.save()

        return generic
    except Exception as e:
        raise exceptions.ValidationError(e)
    



