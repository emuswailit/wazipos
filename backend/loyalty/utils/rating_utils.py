from rest_framework import exceptions
from authentication.models import Entities
from loyalty.models import Rating


def create_rating(data, user):
    errors = []
    entity = None
    comment = ""
    try:
        rating_details = data["rating_details"]

        if rating_details == {}:
            errors.append("Rating details is empty")

        if "entity" in data["rating_details"] and not data["rating_details"]['entity'] == "":
            entity_id = data["rating_details"]["entity"]
            if Entities.objects.filter(id=entity_id).exists():
                entity = Entities.objects.filter(
                    id=entity_id).first()
            else:
                errors.append(
                    'Entity with given ID does not exist')
        else:
            errors.append('Entity ID is required')

        if "rating" in data["rating_details"] and not data["rating_details"]["rating"] == "":
            rating = data["rating_details"]["rating"]
            if rating < 1:
                errors.append(
                    'Rating cannot be less than 1')
            if rating > 5:
                errors.append(
                    'Rating cannot be greater than 5')
        else:
            errors.append('Rating is required')
        if "comment" in data["rating_details"] and not data["rating_details"]['comment'] == "":
            comment = data["rating_details"]["comment"]

    except KeyError:
        errors.append("An error occurred")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:

        if Rating.objects.filter(user=user, entity=entity).exists():
            existing = Rating.objects.filter(user=user, entity=entity).first()
            existing.rating = rating
            existing.comment = comment
            existing.save()
            return existing
            # raise exceptions.ValidationError('You already rated this entity')
        else:
            created = Rating.objects.create(
                entity=entity,
                rating=rating,
                comment=comment,
                user=user
            )

            return created
