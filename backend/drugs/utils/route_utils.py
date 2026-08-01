
from rest_framework import exceptions
from ..models import Routes


def validate_route_data(data):
    errors = []
    preparation = None
    category = None
    try:
        route_details = data["route_details"]

    except KeyError:
        errors.append("Route details are required")
    try:
        title = data["route_details"]["title"]
        if data["route_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if title and Routes.objects.filter(title=title.upper()).exists():
            errors.append(f"Route titled {title} already exists")

    except KeyError:
        errors.append("Route title is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_route(data, user):
    try:
        created = Routes.objects.create(
            title=data["route_details"]["title"],
            description=data["route_details"]["description"],
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_all_routes(user):
    return Routes.objects.all()


def update_route(data, user):
    route = None
    if user.is_staff:
        pass
    else:
        raise exceptions.ValidationError("Not authorized")

    try:
        route_id = data["route_details"]['id']
        if data["route_details"]['id'] == "":
            raise exceptions.ValidationError(
                "Route ID must be valid UUID")
        if Routes.objects.filter(id=route_id).exists():
            route = Routes.objects.get(id=route_id)
        else:
            raise exceptions.ValidationError(
                'Route for supplied ID does not exist')

    except KeyError:
        raise exceptions.ValidationError("Route ID is required")
    try:
        route_details = data["route_details"]
        if data["route_details"] == {}:
            raise exceptions.ValidationError(
                "No route details were supplied")
    except KeyError:
        raise exceptions.ValidationError(
            "Route details to update are required")

    title = None
    description = None

    if "title" in data["route_details"]:
        if data["route_details"]["title"]:
            title = data["route_details"]["title"]
    if "description" in data["route_details"]:
        if data["route_details"]["description"]:
            description = data["route_details"]["description"]

    try:

        if title:
            route.title = title
            route.save()
        if description:
            route.description = description
            route.save()

        return route
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_route_details(data, user):
    try:
        route_id = data["route_id"]
        if Routes.objects.filter(id=route_id).exists():
            route = Routes.objects.get(id=route_id)

            return route
        else:

            raise exceptions.ValidationError(
                "Route with the supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Route ID is required")
