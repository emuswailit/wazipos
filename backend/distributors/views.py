from datetime import datetime
from venv import create
from django.shortcuts import get_object_or_404, render
from rest_framework import generics, permissions, status, exceptions
from authentication.models import Entities, Stakes
from core import app_permissions
from distributors import distributor_permissions
from wholesalers.wholesaler_permissions import WholesalerEmployeePermission

from manufacturers.models import DistributorOrderItems, DistributorOrders
from wholesalers.wholesaler_permissions import WholesalerAdminPermission
from . import serializers
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from django.db import transaction
from rest_framework.pagination import PageNumberPagination
from . import utils
from wazi.utils import raise_custom_exception
from distributors.utils import distributor_receipts_utils
from distributors.utils import wholesaler_orders_utils

from . import models
from core.responses import custom_error_response, custom_success_message


@api_view(["POST"])
@permission_classes([distributor_permissions.DistributorEmployeePermission])
def distributorReceiptsStaffAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateDistributorReceipt":

        distributor_receipt = distributor_receipts_utils.create_distributor_receipt(
            request.data, request.user
        )
        if distributor_receipt:
            serializer = serializers.DistributorReceiptsSerializer(
                distributor_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Distributor inventory receipt created successfully", serializer.data, 'distributor_receipt'
            )

        else:
            return custom_error_response(
                1, "Distributor inventoty receipt could not be created"
            )
    if request.data["action"] == "GetDistributorReceipts":
        """Get distributor receipts for staff"""

        distributor_receipts = distributor_receipts_utils.get_distributor_receipts(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(distributor_receipts, request)
        serializer = serializers.DistributorReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "UpdateDistributorReceipt":
        distributor_receipt = distributor_receipts_utils.update_distributor_receipt(
            request.data, request.user)

        if distributor_receipt:
            serializer = serializers.DistributorReceiptsSerializer(
                distributor_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Distributor inventory receipt updated successfully", serializer.data, 'distributor_receipt'
            )

        else:
            return custom_error_response(
                1, "Distributor inventory receipt could not be updated"
            )
    elif request.data["action"] == "SearchDistributorReceipts":
        """Search wholesaler receipts """

        wholesaler_receipts = distributor_receipts_utils.search_distributor_receipts(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.DistributorReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([WholesalerEmployeePermission])
def distributorReceiptsOpenAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetDistributorReceiptsById":
        """Get distributor receipts for staff"""

        distributor_receipts = distributor_receipts_utils.get_distributor_receipt_by_id(
            request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(distributor_receipts, request)
        serializer = serializers.DistributorReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchDistributorReceiptsById":
        """Search wholesaler receipts """

        wholesaler_receipts = distributor_receipts_utils.search_distributor_receipts_by_wholesalers(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.DistributorReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([WholesalerEmployeePermission])
def wholesalerOrdersAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateWholesalerOrder":

        retailer_order = wholesaler_orders_utils.create_wholesaler_order(
            request.data, request.user
        )
        if retailer_order:
            serializer = serializers.WholesalerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Wholesaler order created successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Wholesaler order could not be created"
            )
    if request.data["action"] == "GetUserWholesalerOrders":
        """Get wholesaler orders for staff"""

        retailer_orders = wholesaler_orders_utils.get_user_wholesaler_orders(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.WholesalerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "GetEntityWholesalerOrders":
        """Get retailer orders for staff entity"""

        wholesaler_orders = wholesaler_orders_utils.get_entity_wholesaler_orders(request.data,
                                                                                 request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_orders, request)
        serializer = serializers.WholesalerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "UpdateWholesalerReceipt":
        wholesaler_receipt = wholesaler_orders_utils.update_wholesaler_receipt(
            request.data, request.user)

        if wholesaler_receipt:
            serializer = serializers.WholesalerReceiptsSerializer(
                wholesaler_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Wholesaler inventory receipt updated successfully", serializer.data, 'wholesaler_receipt'
            )

        else:
            return custom_error_response(
                1, "Wholesaler inventory receipt could not be updated"
            )
    elif request.data["action"] == "SearchWholesalerReceipts":
        """Search wholesaler receipts """

        wholesaler_receipts = utils.search_wholesaler_receipts(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.WholesalerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')
