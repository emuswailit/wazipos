from rest_framework.pagination import PageNumberPagination
from rest_framework import generics, permissions, response, status, exceptions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from .utils import wifi_utils 
from . import serializers,models
from core.responses import custom_success_message, custom_errors_response,custom_error_response

from django.shortcuts import render
from django.views.decorators.clickjacking import xframe_options_exempt

import uuid
import datetime
from django.shortcuts import render, redirect
from django.utils import timezone
from django.views.decorators.clickjacking import xframe_options_exempt
from .models import WifiSubscriptions
import uuid
import datetime
from django.shortcuts import render, redirect
from django.utils import timezone
from django.views.decorators.clickjacking import xframe_options_exempt


# Create your views here.
import logging
import traceback

from utils.logging import create_log

wifi_log = logging.getLogger("wifi.api")


def _log(level, msg):
    """Both the app log (utils.logging) and the server console."""
    getattr(wifi_log, level, wifi_log.info)(msg)
    try:
        create_log(level, msg)
    except Exception:
        pass


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def wifiAPIView(request):
    """Logs every call (who, which business, what came back) and any crash with its traceback."""
    user = request.user
    action = request.data.get("action") if hasattr(request.data, "get") else None
    entity = getattr(user, "entity", None)
    who = f"user={user.pk} staff={user.is_staff} entity={getattr(entity, 'pk', None)} ({getattr(entity, 'title', None)}, {getattr(entity, 'entity_type', None)})"
    _log("info", f"[wifi] {action} <- {who}")
    try:
        response = _wifi_dispatch(request)
    except exceptions.APIException:
        raise
    except Exception as e:
        _log("error", f"[wifi] {action} CRASHED for {who}: {e} | {traceback.format_exc()}")
        from django.http import JsonResponse

        return JsonResponse(
            {"response_code": 1, "response_message": "Server problem", "errors": [f"{type(e).__name__}: {e}"], "action": action},
            status=500,
        )
    data = getattr(response, "data", None)
    if isinstance(data, dict):
        rows = data.get("results")
        detail = f"count={data.get('count')} returned={len(rows)}" if isinstance(rows, list) else f"response_code={data.get('response_code')} message={data.get('response_message')}"
    else:
        detail = f"type={type(data).__name__}"
    _log("info", f"[wifi] {action} -> HTTP {getattr(response, 'status_code', '?')} {detail}")
    if isinstance(data, dict) and data.get("count") == 0 and action in _LIST_MODELS:
        _explain_empty(action, entity)
    return response


_LIST_MODELS = {
    "GetWifiRouters": "WifiRouters",
    "GetWifiTariffs": "WifiTarrifs",
    "GetWifiSubscriptions": "WifiSubscriptions",
    "GetWifiPayments": "WifiSubscriptionPayments",
}


def _explain_empty(action, entity):
    """An empty list: say where the rows actually are (usually another business)."""
    try:
        from django.db.models import Count

        model = getattr(models, _LIST_MODELS[action])
        total = model.objects.count()
        owners = list(model.objects.values("entity_id", "entity__title").annotate(n=Count("id")).order_by("-n")[:5])
        _log("warning", f"[wifi] {action} empty for entity={getattr(entity, 'pk', None)}; {total} rows in all. Held by: {owners}")
    except Exception as e:
        _log("error", f"[wifi] {action} empty-list diagnosis failed: {e}")


def _wifi_dispatch(request):
    customer_orders = []
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")


    if request.data["action"] == "CreateWifiRouter":
        """Create a new wifi router for the user"""

        errors, wifi_router = wifi_utils.create_wifi_router(
            request.data, request.user
        )

        if wifi_router:
            serializer = serializers.WifiRoutersSerializer(
                wifi_router, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Wifi router created successfully",
                serializer.data,
                "wifi_router",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Router could not created",errors)
    elif request.data["action"] == "UpdateWifiRouter":
        errors, wifi_router = wifi_utils.update_wifi_router(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Router could not be updated", errors)
        serializer = serializers.WifiRoutersSerializer(wifi_router, many=False, context={"request": request})
        return custom_success_message(0, "Wifi router updated successfully", serializer.data, "wifi_router")
    elif request.data["action"] == "GetWifiRouters":
        wifi_routers = wifi_utils.get_wifi_routers(
         request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wifi_routers, request)
        serializer = serializers.WifiRoutersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)  
    elif request.data["action"] == "CreateWifiTariff":
        """Create a new wifi tariff for the user"""

        errors, wifi_tariff = wifi_utils.create_wifi_tariff(
            request.data, request.user
        )

        if wifi_tariff:
            serializer = serializers.WifiTarrifsSerializer(
                wifi_tariff, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Wifi tariff created successfully",
                serializer.data,
                "wifi_tariff",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Tariff could not created",errors)
    elif request.data["action"] == "GetWifiTariffs":
        wifi_tariffs = wifi_utils.get_wifi_tariffs(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wifi_tariffs, request)
        serializer = serializers.WifiTarrifsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)     
    elif request.data["action"] == "UpdateWifiTariff":
        """Update an existing wifi tariff for the user"""
        errors, wifi_tariff = wifi_utils.update_wifi_tariff(
            request.data, request.user
        )

        if wifi_tariff:
            serializer = serializers.WifiTarrifsSerializer(
                wifi_tariff, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Wifi tariff updated successfully",
                serializer.data,
                "wifi_tariff",
            )
        else:
            return custom_errors_response(1,"Wifi tariff could not updated",errors)
    elif request.data["action"] == "DeleteWifiTariff":
        """Delete an existing wifi tariff"""
        
        errors, deleted = wifi_utils.delete_wifi_tariff(
            request.data, request.user
        )

        if deleted:
    
            return custom_error_response(
                0,
                "Wifi tariff deleted successfully",
           
            )
        else:
            return custom_errors_response(1,"Wifi tariff could not deleted",errors)
    elif request.data["action"] == "GetWifiSubscriptions":
        wifi_tariff_subscriptions = wifi_utils.get_wifi_subscriptions(
 request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wifi_tariff_subscriptions, request)
        serializer = serializers.WifiSubscriptionsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)     
    elif request.data["action"] == "GetWifiPayments":
        wifi_payments = wifi_utils.get_wifi_subscription_payments(
            request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wifi_payments, request)
        serializer = serializers.WifiSubscriptionPaymentsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)     
    elif request.data["action"] == "RecheckWifiPayment":
        # Ask the gateway about one payment now; connects the device and queues the payout if paid.
        from wifi.payments import recheck

        data = recheck(request.user, request.data.get("id"))
        if data is None:
            return custom_errors_response(1, "Not found", ["That payment does not exist or is not yours"])
        return custom_success_message(0, f"Payment {data['status'].lower()}", data, "payment")
    elif request.data["action"] == "DeleteWifiRouter":
        # Payments and subscriptions are created by customers and are read only.
        from .utils import wifi_crud as crud

        errors = crud.delete_router(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Not deleted", errors)
        return custom_success_message(0, "Deleted", {"id": request.data.get("id")}, "deleted")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

