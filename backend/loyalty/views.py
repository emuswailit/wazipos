from django.shortcuts import render
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes
from .utils.rating_utils import create_rating
from . import serializers
from core.responses import custom_success_message, custom_error_response

# Create your views here.


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def ratingAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateRating":
        rating = create_rating(
            request.data, request.user)

        if rating:
            serializer = serializers.RatingSerializer(
                rating, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Rating created successfully", serializer.data, 'rating'
            )
        else:
            return custom_error_response(
                1, "Rating could not be created"
            )

    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')
