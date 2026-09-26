
from rest_framework import exceptions
from ..models import Preparation,  Formulations
from django.db.models import Q
from drugs.models import Generics


def validate_preparation_data(data):
    errors = []

    # ---- 1. Envelope ----
    try:
        preparation_details = data["preparation_details"]
    except KeyError:
        raise exceptions.ValidationError(
            ["Preparation details are required"]
        )

    # ---- 2. Title ----
    title = preparation_details.get("title")
    if not title or not str(title).strip():
        errors.append("Title cannot be empty")
    elif Preparation.objects.filter(
        title=str(title).strip().upper()
    ).exists():
        errors.append(f"Preparation titled {title} already exists")

    # ---- 3. Formulation ----
    formulation_id = preparation_details.get("formulation_id")
    if not formulation_id:
        errors.append("Formulation ID cannot be empty")
    elif not Formulations.objects.filter(
        id=formulation_id
    ).exists():
        errors.append(
            "Formulation with supplied ID does not exist"
        )

    # ---- 4. Generics (array) ----
    raw_generics = preparation_details.get("generics", [])
    if not isinstance(raw_generics, list):
        raw_generics = [raw_generics] if raw_generics else []

    generic_ids = [str(x) for x in raw_generics if x]

    if len(generic_ids) == 0:
        errors.append("At least one generic is required")
    else:
        found = Generics.objects.filter(id__in=generic_ids)
        found_ids = set(
            str(x) for x in found.values_list("id", flat=True)
        )
        missing = set(generic_ids) - found_ids
        if missing:
            errors.append(
                "Generics with provided IDs do not exist: "
                f"{list(missing)}"
            )

    # ---- 5. Bail if any errors collected ----
    if errors:
        raise exceptions.ValidationError(errors)

    return


def create_preparation(data, user):
    details = data["preparation_details"]

    # Normalize + fetch dependencies
    raw_generics = details.get("generics", [])
    if not isinstance(raw_generics, list):
        raw_generics = [raw_generics] if raw_generics else []
    generic_ids = [str(x) for x in raw_generics if x]
    generic_qs = Generics.objects.filter(id__in=generic_ids)

    # ---- 1. Create the row (no M2M in create()) ----
    try:
        created = Preparation.objects.create(
            title=details["title"],
            description=details.get("description", ""),
            formulation_id=details["formulation_id"],
            owner=user,
            entity=user.entity,
        )
    except Exception as e:
        raise exceptions.ValidationError(str(e))

    # ---- 2. Attach M2M AFTER create ----
    created.generics.set(generic_qs)

    # ---- 3. Refresh so downstream serialization sees the links ----
    created.refresh_from_db()

    return created

    
def get_all_preparations(user):
    return Preparation.objects.all()
    # return Preparation.objects.all().order_by("-created")[:10]


def search_preparations(data, user):

    return Preparation.objects.filter(
        Q(title__icontains=data['searchQuery']) | Q(
            formulation__title__icontains=data['searchQuery'])
    )


def update_preparation(data, user):
    preparation = None
    if user.is_staff:
        pass
    else:
        raise exceptions.ValidationError("Not authorized")

    try:
        preparation_id = data["preparation_details"]['id']
        if data["preparation_details"]['id'] == "":
            raise exceptions.ValidationError(
                "Preparation ID must be valid UUID")
        if Preparation.objects.filter(id=preparation_id).exists():
            preparation = Preparation.objects.filter(id=preparation_id).first()
        else:
            raise exceptions.ValidationError(
                'Preparation for supplied ID does not exist')

    except KeyError:
        raise exceptions.ValidationError("Preparation ID is required")
    try:
        preparation_details = data["preparation_details"]
        if data["preparation_details"] == {}:
            raise exceptions.ValidationError(
                "No preparation details were supplied")
    except KeyError:
        raise exceptions.ValidationError(
            "Preparation details to update are required")
    try:
        pass
        # generics = data["preparation_details"]["generics"]
        # if data["preparation_details"]["generics"] == []:
        #     raise exceptions.ValidationError("Generics cannot be empty")
        # else:
        #     for generic in data["preparation_details"]["generics"]:
        #         if Generics.objects.filter(id=generic).exists():
        #             pass
        #         else:
        #             raise exceptions.ValidationError(
        #                 f"Generic with  ID {generic} does not exist")

    except KeyError:
        raise exceptions.ValidationError("At least one generic is required")
    title = None
    description = None

    if "title" in data["preparation_details"]:
        if data["preparation_details"]["title"]:
            title = data["preparation_details"]["title"]
    if "description" in data["preparation_details"]:
        if data["preparation_details"]["description"]:
            description = data["preparation_details"]["description"]

    try:
        # if 'generics' in data["preparation_details"] and data["preparation_details"]["generics"]:
        #     preparation.generics.clear()
        #     for id in data["preparation_details"]["generics"]:
        #         if Generics.objects.filter(id=id).exists():
        #             generic = Generics.objects.filter(id=id).first()
        #             preparation.generics.add(generic)

        if title:
            preparation.title = title
            preparation.save()
        if description:
            preparation.description = description
            preparation.save()

        return preparation
    except Exception as e:
        raise exceptions.ValidationError(e)
