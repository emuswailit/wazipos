
from rest_framework import exceptions
from ..models import DrugClass, BodySystem, DrugSubClass
from django.db import transaction
from django.db.models import Q


def validate_drug_class_data(data):
    errors = []
    preparation = None
    category = None
    try:
        drug_class_details = data["drug_class_details"]

    except KeyError:
        errors.append("Drug class details are required")
    try:
        title = data["drug_class_details"]["title"]
        if data["drug_class_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if title and DrugClass.objects.filter(title=title.upper()).exists():
            errors.append(f"Drug class titled {title} already exists")

    except KeyError:
        errors.append("Drug class title is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_drug_class(data, user):
    print(data)
    try:
        created = DrugClass.objects.create(
            title=data["drug_class_details"]["title"],
            description=data["drug_class_details"]["description"],
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        print(str(e))
        raise exceptions.ValidationError(str(e))


def get_all_drug_classes(user):
    return DrugClass.objects.all()


def update_drug_class(data, user):
    drug_class = None
    try:
        drug_class_id = data["drug_class_details"]['id']
        if data["drug_class_details"]['id'] == "":
            raise exceptions.ValidationError(
                "Drug class ID must be valid UUID")
        if DrugClass.objects.filter(id=drug_class_id).exists():
            drug_class = DrugClass.objects.get(id=drug_class_id)
            if user.is_staff:
                pass
            elif user == drug_class.owner:
                pass
            else:
                raise exceptions.ValidationError("Not authorized")
        else:
            raise exceptions.ValidationError(
                'Drug class with supplied ID does not exist')

    except KeyError:
        raise exceptions.ValidationError("Body system ID is required")
    try:
        drug_class_details = data["drug_class_details"]
        if data["drug_class_details"] == {}:
            raise exceptions.ValidationError(
                "No body system details were supplied")
    except KeyError:
        raise exceptions.ValidationError(
            "Drug class details to update are required")

    title = None
    description = None
    body_system = None

    if "title" in data["drug_class_details"]:
        if data["drug_class_details"]["title"]:
            title = data["drug_class_details"]["title"]
    if "description" in data["drug_class_details"]:
        if data["drug_class_details"]["description"]:
            description = data["drug_class_details"]["description"]
    if "body_system" in data["drug_class_details"]:
        if data["drug_class_details"]["body_system"]:
            body_system_id = data["drug_class_details"]["body_system"]
            if BodySystem.objects.filter(id=body_system_id).exists():
                body_system = BodySystem.objects.filter(
                    id=body_system_id).first()
            else:
                raise exceptions.ValidationError(
                    'Body system with supplied ID does not exist')

    try:

        if title:
            drug_class.title = title
            drug_class.save()
        if description:
            drug_class.description = description
            drug_class.save()
        if body_system:
            drug_class.body_system = body_system
            drug_class.save()

        return drug_class
    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def delete_drug_class(data, user):
    drug_class = None
    drug_class_id = None
    entity_id = None
    entity = None
    valid_from = None
    valid_to = None
    errors = []
    """Delete drug class"""

    try:
        drug_class_id = data["drug_class_id"]
        if drug_class_id == "":
            errors.append("Drug class ID cannot be empty")

    except KeyError:
        errors.append("Drug class ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if DrugClass.objects.filter(id=drug_class_id).exists():
            drug_class = DrugClass.objects.filter(
                id=drug_class_id
            ).first()
        else:
            raise exceptions.ValidationError(
                "No drug class matches given details")

        drug_class.delete()
        return


def search_drug_classes(data, user):
    return DrugClass.objects.filter(
        Q(title__icontains=data['searchQuery'])

    )
