
from rest_framework import exceptions
from ..models import DrugClass, Formulations
from django.db.models import Q


def validate_formulation_data(data):
    errors = []
    preparation = None
    category = None
    try:
        formulation_details = data["formulation_details"]

    except KeyError:
        errors.append("Formulation details are required")
    try:
        title = data["formulation_details"]["title"]
        if data["formulation_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if title and Formulations.objects.filter(title=title.upper()).exists():
            errors.append(f"Formulation titled {title} already exists")

    except KeyError:
        errors.append("Formulation title is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_formulation(data, user):
    try:
        created = Formulations.objects.create(
            title=data["formulation_details"]["title"],
            description=data["formulation_details"]["description"],
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def create_drug_class(data, user):
    try:
        created = DrugClass.objects.create(
            title=data["drug_class_details"]["title"],
            description=data["drug_class_details"]["description"],
            system_id=data["drug_class_details"]["body_system"],
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_all_formulations(user):
    return Formulations.objects.all()


def update_formulation(data, user):
    formulation = None
    if user.is_staff:
        pass
    else:
        raise exceptions.ValidationError("Not authorized")

    try:
        formulation_id = data["formulation_details"]['id']
        if data["formulation_details"]['id'] == "":
            raise exceptions.ValidationError(
                "Formulation ID must be valid UUID")
        if Formulations.objects.filter(id=formulation_id).exists():
            formulation = Formulations.objects.get(id=formulation_id)
        else:
            raise exceptions.ValidationError(
                'Formulation for supplied ID does not exist')

    except KeyError:
        raise exceptions.ValidationError("Formulation ID is required")
    try:
        formulation_details = data["formulation_details"]
        if data["formulation_details"] == {}:
            raise exceptions.ValidationError(
                "No formulation details were supplied")
    except KeyError:
        raise exceptions.ValidationError(
            "Formulation details to update are required")

    title = None
    description = None

    if "title" in data["formulation_details"]:
        if data["formulation_details"]["title"]:
            title = data["formulation_details"]["title"]
    if "description" in data["formulation_details"]:
        if data["formulation_details"]["description"]:
            description = data["formulation_details"]["description"]

    try:

        if title:
            formulation.title = title
            formulation.save()
        if description:
            formulation.description = description
            formulation.save()

        return formulation
    except Exception as e:
        raise exceptions.ValidationError(e)


def search_formulations(data, user):
    return Formulations.objects.filter(
        Q(title__icontains=data['searchQuery'])

    )


def get_formulation_details(data, user):
    try:
        formulation_id = data["formulation_id"]
        if Formulations.objects.filter(id=formulation_id).exists():
            formulation = Formulations.objects.get(id=formulation_id)

            return formulation
        else:

            raise exceptions.ValidationError(
                "Formulation with the supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Formulation ID is required")
