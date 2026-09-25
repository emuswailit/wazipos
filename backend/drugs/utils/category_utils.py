
from rest_framework import exceptions
from ..models import Category


def validate_category_data(data):
    errors = []
    preparation = None
    category = None
    try:
        category_details = data["category_details"]

    except KeyError:
        errors.append("Body system details are required")
    try:
        title = data["category_details"]["title"]
        if data["category_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if title and Category.objects.filter(title=title.upper()).exists():
            errors.append(f"Body system titled {title} already exists")

    except KeyError:
        errors.append("Body system title is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_category(data, user):
    try:
        created = Category.objects.create(
            title=data["category_details"]["title"],
            description=data["category_details"]["title"],
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_all_categorys(user):
    return Category.objects.all()


def update_category(data, user):
    category = None

    try:
        category_id = data["category_details"]['id']
        if data["category_details"]['id'] == "":
            raise exceptions.ValidationError(
                "Body system ID must be valid UUID")
        if Category.objects.filter(id=category_id).exists():
            category = Category.objects.get(id=category_id)
            if user.is_staff:
                pass
            elif user == category.owner:
                pass
            else:
                raise exceptions.ValidationError("Not authorized")
        else:
            raise exceptions.ValidationError(
                "No body system exists for give ID")

    except KeyError:
        raise exceptions.ValidationError("Body system ID is required")
    try:
        category_details = data["category_details"]
        if data["category_details"] == {}:
            raise exceptions.ValidationError(
                "No body system details were supplied")
    except KeyError:
        raise exceptions.ValidationError(
            "Product details to update are required")

    title = None
    description = None

    if "title" in data["category_details"]:
        if data["category_details"]["title"]:
            title = data["category_details"]["title"]
    if "description" in data["category_details"]:
        if data["category_details"]["description"]:
            description = data["category_details"]["description"]

    try:

        if title:
            category.title = title
            category.save()
        if description:
            category.description = description
            category.save()

        return category
    except Exception as e:
        raise exceptions.ValidationError(e)
