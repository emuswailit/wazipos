
from django.shortcuts import get_object_or_404
from rest_framework.pagination import PageNumberPagination
from rest_framework import exceptions, permissions, generics, status
from intergrations.jambopay.jambopay_wallet import get_wallet_balance, check_user_jambopay_profile_by_phone
from rest_framework.decorators import (
    api_view,
    permission_classes,
    parser_classes,
    renderer_classes,
)
from .utils import parking_utils
from . import serializers
from core.responses import (
    custom_success_message,
    custom_error_response,
    custom_errors_response,
    custom_json_response,
)

@api_view(["POST"])
@permission_classes([permissions.IsAdminUser])
def adminParkingAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateParkingStation":
        errors, parking_station = parking_utils.create_parking_station(request.data, request.user)
        if parking_station:
            serializer =serializers.PakinsgStation(parking_station,many=False).data
            return custom_success_message(0, "Parking station sucessfully created",serializer,"parking_station")
        else:
            return custom_errors_response(1, "Parking station  not be created", errors)

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')