
from rest_framework import exceptions
from ..models import Frequency


def validate_frequency_data(data):
    errors = []
    preparation = None
    category = None
    try:
        frequency_details = data["frequency_details"]

    except KeyError:
        errors.append("Frequency details are required")
    try:
        title = data["frequency_details"]["title"]
        if data["frequency_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if title and Frequency.objects.filter(title=title.upper()).exists():
            errors.append(f"Frequency titled {title} already exists")

    except KeyError:
        errors.append("Frequency title is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_frequency(data, user):
    latin = None
    numerical = None

    if 'latin' in data["frequency_details"] and data["frequency_details"]["latin"]:
        latin = data["frequency_details"]["latin"]

    if 'numerical' in data["frequency_details"] and data["frequency_details"]["numerical"]:
        numerical = data["frequency_details"]["numerical"]
    try:
        created = Frequency.objects.create(
            title=data["frequency_details"]["title"],
            description=data["frequency_details"]["description"],
            abbreviation=data["frequency_details"]["abbreviation"],
            latin=latin,
            numerical=numerical,
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_all_frequencies(user):
    return Frequency.objects.all()


def update_frequency(data, user):
    frequency = None
    if user.is_staff:
        pass
    else:
        raise exceptions.ValidationError("Not authorized")

    try:
        frequency_id = data["frequency_details"]['id']
        if data["frequency_details"]['id'] == "":
            raise exceptions.ValidationError(
                "Frequency ID must be valid UUID")
        if Frequency.objects.filter(id=frequency_id).exists():
            frequency = Frequency.objects.get(id=frequency_id)
        else:
            raise exceptions.ValidationError(
                'Frequency for supplied ID does not exist')

    except KeyError:
        raise exceptions.ValidationError("Frequency ID is required")
    try:
        frequency_details = data["frequency_details"]
        if data["frequency_details"] == {}:
            raise exceptions.ValidationError(
                "No frequency details were supplied")
    except KeyError:
        raise exceptions.ValidationError(
            "Frequency details to update are required")

    title = None
    description = None
    numerical = None
    abbreviation = None
    latin = None

    if "title" in data["frequency_details"]:
        if data["frequency_details"]["title"]:
            title = data["frequency_details"]["title"]
    if "description" in data["frequency_details"]:
        if data["frequency_details"]["description"]:
            description = data["frequency_details"]["description"]
    if "abbreviation" in data["frequency_details"]:
        if data["frequency_details"]["abbreviation"]:
            abbreviation = data["frequency_details"]["abbreviation"]
    if "latin" in data["frequency_details"]:
        if data["frequency_details"]["latin"]:
            latin = data["frequency_details"]["latin"]
    if "numerical" in data["frequency_details"]:
        if data["frequency_details"]["numerical"]:
            numerical = data["frequency_details"]["numerical"]

    try:

        if title:
            frequency.title = title
            frequency.save()
        if description:
            frequency.description = description
            frequency.save()
        if abbreviation:
            frequency.abbreviation = abbreviation
            frequency.save()
        if latin:
            frequency.latin = latin
            frequency.save()
        if numerical:
            frequency.numerical = numerical
            frequency.save()

        return frequency
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_frequency_details(data, user):
    try:
        frequency_id = data["frequency_id"]
        if Frequency.objects.filter(id=frequency_id).exists():
            frequency = Frequency.objects.get(id=frequency_id)

            return frequency
        else:

            raise exceptions.ValidationError(
                "Frequency with the supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Frequency ID is required")
