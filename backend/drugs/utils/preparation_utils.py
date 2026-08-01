
from rest_framework import exceptions
from ..models import Preparation, Generic, Formulations
from django.db.models import Q


def validate_preparation_data(data):
    errors = []
    preparation = None
    category = None
    try:
        preparation_details = data["preparation_details"]

    except KeyError:
        errors.append("Preparation details are required")
    try:
        title = data["preparation_details"]["title"]
        if data["preparation_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if title and Preparation.objects.filter(title=title.upper()).exists():
            errors.append(f"Preparation titled {title} already exists")

    except KeyError:
        errors.append("Preparation title is required")
    try:
        formulation_id = data["preparation_details"]["formulation_id"]
        if data["preparation_details"]["formulation_id"] == "":
            errors.append("Formulation ID cannot be empty")
        if formulation_id and Formulations.objects.filter(id=formulation_id).exists():
            pass
        else:
            errors.append(f"Formulation with supplied ID does not exist")

    except KeyError:
        errors.append("Formulation ID is required")
    try:
        generics = data["preparation_details"]["generics"]
        if data["preparation_details"]["generics"] == []:
            errors.append("Generics cannot be empty")
        else:
            for generic in data["preparation_details"]["generics"]:
                if Generic.objects.filter(id=generic).exists():
                    pass
                else:
                    errors.append(
                        f"Generic with  ID {generic} does not exist")

    except KeyError:
        errors.append("At least one generic is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_preparation(data, user):
    try:
        created = Preparation.objects.create(
            title=data["preparation_details"]["title"],
            description=data["preparation_details"]["description"],
            formulation_id=data["preparation_details"]["formulation_id"],
            owner=user,
            entity=user.entity,
        )
        if created:
            if 'generics' in data["preparation_details"] and data["preparation_details"]["generics"]:
                for id in data["preparation_details"]["generics"]:
                    if Generic.objects.filter(id=id).exists():
                        generic = Generic.objects.filter(id=id).first()
                        created.generics.add(generic)
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


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
            preparation = Preparation.objects.get(id=preparation_id)
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
        generics = data["preparation_details"]["generics"]
        if data["preparation_details"]["generics"] == []:
            raise exceptions.ValidationError("Generics cannot be empty")
        else:
            for generic in data["preparation_details"]["generics"]:
                if Generic.objects.filter(id=generic).exists():
                    pass
                else:
                    raise exceptions.ValidationError(
                        f"Generic with  ID {generic} does not exist")

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
        if 'generics' in data["preparation_details"] and data["preparation_details"]["generics"]:
            preparation.generics.clear()
            for id in data["preparation_details"]["generics"]:
                if Generic.objects.filter(id=id).exists():
                    generic = Generic.objects.filter(id=id).first()
                    preparation.generics.add(generic)

        if title:
            preparation.title = title
            preparation.save()
        if description:
            preparation.description = description
            preparation.save()

        return preparation
    except Exception as e:
        raise exceptions.ValidationError(e)
