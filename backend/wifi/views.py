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
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def wifiAPIView(request):
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
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')
