
from rest_framework import exceptions
from ..models import BodySystem


def validate_body_system_data(data):
    errors = []
    preparation = None
    category = None
    try:
        body_system_details = data["body_system_details"]

    except KeyError:
        errors.append("Body system details are required")
    try:
        title = data["body_system_details"]["title"]
        if data["body_system_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if title and BodySystem.objects.filter(title=title.upper()).exists():
            errors.append(f"Body system titled {title} already exists")

    except KeyError:
        errors.append("Body system title is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_body_system(data, user):
    try:
        created = BodySystem.objects.create(
            title=data["body_system_details"]["title"],
            description=data["body_system_details"]["title"],
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_all_body_systems(user):
    return BodySystem.objects.all()


def update_body_system(data, user):
    body_system = None

    try:
        body_system_id = data["body_system_details"]['id']
        if data["body_system_details"]['id'] == "":
            raise exceptions.ValidationError(
                "Body system ID must be valid UUID")
        if BodySystem.objects.filter(id=body_system_id).exists():
            body_system = BodySystem.objects.get(id=body_system_id)
            if user.is_staff:
                pass
            elif user == body_system.owner:
                pass
            else:
                raise exceptions.ValidationError("Not authorized")
        else:
            raise exceptions.ValidationError(
                "No body system exists for give ID")

    except KeyError:
        raise exceptions.ValidationError("Body system ID is required")
    try:
        body_system_details = data["body_system_details"]
        if data["body_system_details"] == {}:
            raise exceptions.ValidationError(
                "No body system details were supplied")
    except KeyError:
        raise exceptions.ValidationError(
            "Product details to update are required")

    title = None
    description = None

    if "title" in data["body_system_details"]:
        if data["body_system_details"]["title"]:
            title = data["body_system_details"]["title"]
    if "description" in data["body_system_details"]:
        if data["body_system_details"]["description"]:
            description = data["body_system_details"]["description"]

    try:

        if title:
            body_system.title = title
            body_system.save()
        if description:
            body_system.description = description
            body_system.save()

        return body_system
    except Exception as e:
        raise exceptions.ValidationError(e)
