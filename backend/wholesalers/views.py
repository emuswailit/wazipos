from rest_framework.decorators import (
    api_view,
    permission_classes,
    parser_classes,
)
from rest_framework import exceptions, generics, permissions, status
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db import IntegrityError
from django.db.models import Prefetch, Q

from core.responses import (
    custom_error_response,
    custom_errors_response,
    custom_plain_response,
    custom_success_message,
    custom_success_message_with_reference,
)
from core import app_permissions
from retailers.retail_permissions import EntitySubscriptionPermission
from retailers.models import (
    RetailerProductRequest,
    RetailerProductRequestItem,
    RetailerProductRequestOffer,
    RetailerProductRequestResponse,
)
from retailers.serializers import (
    RetailerProductRequestSerializer,
    RetailerProductRequestListSerializer,
)

from wholesalers.wholesaler_permissions import (
    WholesalerEmployeePermission,
    WholesalerAndRetailerEmployeePermission,
)

from . import models
from . import serializers
from . import utils
from .utils import retailer_orders_utils, wholesaler_receipt_utils
from .services import campaigns as services
from .utils import campaign_utils
from .services.request_response import wholesaler_respond_to_request


# ===========================================================================
# Wholesaler receipts — staff
# ===========================================================================

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def wholesalerReceiptsStaffAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateWholesalerReceipt":

        wholesaler_receipt = wholesaler_receipt_utils.create_wholesaler_receipt(
            request.data, request.user
        )
        if wholesaler_receipt:
            serializer = serializers.WholesalerReceiptsSerializer(
                wholesaler_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Wholesaler inventory receipt created successfully", serializer.data, 'wholesaler_receipt'
            )

        else:
            return custom_error_response(
                1, "Wholesaler inventoty receipt could not be created"
            )
    if request.data["action"] == "GetWholesalerReceipts":
        """Get wholesaler receipts for staff"""

        wholesaler_receipts = wholesaler_receipt_utils.get_wholesaler_receipts(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.WholesalerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)


    elif request.data["action"] == "UpdateWholesalerReceipt":
        wholesaler_receipt = wholesaler_receipt_utils.update_wholesaler_receipt(
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

        wholesaler_receipts = wholesaler_receipt_utils.search_wholesaler_receipts(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.WholesalerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetWholesaleReceiptDetails":


        product = wholesaler_receipt_utils.get_wholesale_receipt_details(request.data, request.user)
        if product:
            serializer = serializers.WholesalerReceiptsSerializer(
                product, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Product details sucessfuly retrieved", serializer.data, 'wholesale_receipt'
            )

        else:
            return custom_error_response(1, "Product details not retrieved")
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


# ===========================================================================
# Wholesaler receipts dispatcher — general reads
# ===========================================================================

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def wholesalerReceiptsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "WholesalerQuantityDiscounts":
        """Get wholesaler price discount for staff"""
        wholesaler_quantity_discounts = wholesaler_receipt_utils.get_wholesaler_quantity_discounts(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_quantity_discounts, request)
        serializer = serializers.WholesalerQuantityDiscountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "WholesalerQuantityDiscountsById":
        """Get wholesaler price discount for staff"""
        wholesaler_quantity_discounts = wholesaler_receipt_utils.get_wholesaler_quantity_discounts_by_id(
            request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_quantity_discounts, request)
        serializer = serializers.WholesalerQuantityDiscountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "WholesalerPriceDiscountsById":
        """Get wholesaler price discount for staff"""
        wholesaler_receipts = wholesaler_receipt_utils.get_wholesaler_price_discounts_by_id(
            request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.WholesalerPriceDiscountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "WholesalerPriceDiscounts":
        """Get wholesaler price discount for staff"""
        wholesaler_receipts = wholesaler_receipt_utils.get_wholesaler_price_discounts(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.WholesalerPriceDiscountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "WholesalerReceiptsById":
        """Get wholesaler receipts for staff"""
        wholesaler_receipts = wholesaler_receipt_utils.get_wholesaler_receipt_by_id(
            request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.WholesalerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetWholesaleReceiptDetails":


        product = wholesaler_receipt_utils.get_wholesale_receipt_details(request.data, request.user)
        if product:
            serializer = serializers.WholesalerReceiptsSerializer(
                product, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Product details sucessfuly retrieved", serializer.data, 'wholesale_receipt'
            )

        else:
            return custom_error_response(1, "Product details not retrieved")
    if request.data["action"] == "GetWholesalerReceiptsWithAnalytics":
        """Get wholesaler receipts for staff with analytics of retailer product movement"""

        wholesaler_receipts = wholesaler_receipt_utils.get_wholesaler_receipt_with_analytics(
           request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.WholesalerReceiptsWithAnalyticsSerializer(
            page, many=True, context={"request": request,"wholesaler_id":request.data["wholesaler_id"],"retailer_id":request.data["retailer_id"],"order_days":request.data["order_days"]}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "WholesalerReceiptsByIdAndDiscount":
        """Get wholesaler receipts for staff"""
        wholesaler_receipts, errors = wholesaler_receipt_utils.get_wholesaler_receipt_by_id_and_discount(
            request.data)
        if wholesaler_receipts:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(wholesaler_receipts, request)
            serializer = serializers.WholesalerReceiptsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(
                1, "Inventory not retrieved",errors
            )


    elif request.data["action"] == "SearchWholesalerReceiptsById":
        """Search wholesaler receipts """

        wholesaler_receipts = wholesaler_receipt_utils.search_wholesaler_receipts_by_id(
            request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.WholesalerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


# ===========================================================================
# Retailer orders dispatcher — entity
# ===========================================================================

@api_view(["POST"])
@permission_classes([EntitySubscriptionPermission, permissions.IsAuthenticated])
def retailerOrdersAPIView(request):
    try:
        action = request.data["action"]
        print("Am here with", action)
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateRetailerOrder":

        errors, retailer_order, reference = retailer_orders_utils.create_draft_retailer_order(
            request.data, request.user
        )
        print("Hapa",retailer_order)
        print("Errrors hapa",errors)
        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message_with_reference(
                0, "Retailer order created successfully", serializer.data, 'retailer_order',reference
            )

        else:

            return custom_errors_response(
                1, "Retailer order could not be created",errors
            )
    elif request.data["action"] == "GetEntityRetailerOrders":
        """Get retailer orders for staff entity"""

        retailer_orders = retailer_orders_utils.get_entity_retailer_orders(
            request.user, request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.RetailerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetRetailerOrderDetails":
        retailer_order = retailer_orders_utils.get_retailer_order_details(
            request.data, request.user)

        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer order retrieved successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Retailer order could not be retrieved"
            )
    elif request.data["action"] == "UpdateRetailerOrder":
        errors, retailer_order = retailer_orders_utils.update_retailer_order(
            request.data, request.user)

        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer order updated successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_errors_response(
                1, "Retailer order payment not processed",errors
            )
    elif request.data["action"] == "ProcessRetailerOrderPayment":
        errors, retailer_order = retailer_orders_utils.process_retailer_order_payment(
            request.data, request.user)

        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer order updated successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_errors_response(
                1, "Retailer order payment not processed",errors
            )
    elif request.data["action"] == "DraftRetailerOrderAddItem":

        retailer_order = retailer_orders_utils.draft_retailer_order_add_item(
            request.data, request.user
        )
        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Item added to order created successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Item could not be added to order"
            )
    elif request.data["action"] == "DeleteRetailerOrderItem":

        retailer_order = retailer_orders_utils.delete_retailer_order_item(
            request.data, request.user)
        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Item deleted successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Item could not be deleted to order"
            )
    elif request.data["action"] == "UpdateRetailerOrderItem":
        retailer_order = retailer_orders_utils.update_retailer_order_item(
            request.data, request.user)

        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer order item updated successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Retailer order item could not be updated"
            )
    elif request.data["action"] == "GetUserRetailerOrders":
        """Get retailer orders for staff"""

        retailer_orders = retailer_orders_utils.get_use_retailer_orders(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.RetailerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetRetailerOrdersForWholesaler":
        """Get retailer to a wholesaler"""

        retailer_orders = retailer_orders_utils.get_wholesaler_retailer_orders(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.RetailerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityRetailerOrdersByWholesaler":
        """Get retailer orders for staff entity"""

        retailer_orders = retailer_orders_utils.get_entity_retailer_orders_by_wholesaler(
           request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.RetailerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "SearchRetailerOrders":
        """Search retailer orders """

        retailer_orders = retailer_orders_utils.search_retailer_orders(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.RetailerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


# ===========================================================================
# Retailer orders dispatcher — staff
# ===========================================================================

@api_view(["POST"])
@permission_classes([WholesalerEmployeePermission])
def retailerOrdersStaffAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateStaffRetailerOrder":

        errors,retailer_order = retailer_orders_utils.create_retailer_order(
            request.data, request.user
        )
        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Draft retailer order created successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_errors_response(
                1, "Draft retailer order could not be created",errors
            )
    elif request.data["action"] == "GetRetailerOrderDetails":
        retailer_order = retailer_orders_utils.get_retailer_order_details(
            request.data, request.user)

        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer order retrieved successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Retailer order could not be retrieved"
            )
    elif request.data["action"] == "UpdateRetailerOrder":
        retailer_order = retailer_orders_utils.update_retailer_order(
            request.data, request.user)

        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer order updated successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Retailer order could not be updated"
            )
    elif request.data["action"] == "DraftRetailerOrderAddItem":

        retailer_order = retailer_orders_utils.draft_retailer_order_add_item(
            request.data, request.user
        )
        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Item added to order created successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Item could not be added to order"
            )
    elif request.data["action"] == "DeleteRetailerOrderItem":

        retailer_order = retailer_orders_utils.delete_retailer_order_item(
            request.data, request.user)
        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Item deleted successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Item could not be deleted to order"
            )
    elif request.data["action"] == "UpdateRetailerOrderItem":
        retailer_order = retailer_orders_utils.update_retailer_order_item(
            request.data, request.user)

        if retailer_order:
            serializer = serializers.RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer order item updated successfully", serializer.data, 'retailer_order'
            )

        else:
            return custom_error_response(
                1, "Retailer order item could not be updated"
            )
    elif request.data["action"] == "GetUserRetailerOrders":
        """Get retailer orders for staff"""

        retailer_orders = retailer_orders_utils.get_use_retailer_orders(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.RetailerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetRetailerOrdersForWholesaler":
        """Get retailer to a wholesaler"""

        retailer_orders = retailer_orders_utils.get_wholesaler_retailer_orders(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.RetailerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityRetailerOrders":
        """Get retailer orders for staff entity"""

        retailer_orders = retailer_orders_utils.get_entity_retailer_orders(
            request.user,request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.RetailerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetRetailerOrderPayments":
        """Get retailer order payments"""

        retailer_orders = retailer_orders_utils.get_retailer_order_payments(
            request.user,request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.WholesalerPaymentsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "DeleteRetailerOrder":
        if (retailer_orders_utils.delete_retailer_order(
                request.data, request.user)):

            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Retailer order deleted succesfully",
                },

            )
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


# ===========================================================================
# Price discount — create / update
# ===========================================================================

class WholesalerPriceDiscountsCreateAPIView(generics.GenericAPIView):
    """
    Create new wholesaler price discount
    """

    name = "wholesale-price-discount-create"
    permission_classes = (WholesalerEmployeePermission,)
    serializer_class = serializers.WholesalerPriceDiscountsSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        errors_messages=[]
        from core.date_utils import get_today
        wholesaler_receipt = request.POST.get("wholesaler_receipt", None)
        title = request.POST.get("title", None)
        percent = request.POST.get("percent", 1)
        start = request.POST.get("start", None)
        end = request.POST.get("end", None)

        if wholesaler_receipt:
            if models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=wholesaler_receipt,end__gte=get_today()).exists():
                price_discount=models.WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=wholesaler_receipt,end__gte=get_today()).first()
                errors_messages.append("Price discount already exists for this product")
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Price discount already exists for this product",
                        "wholesale_price_discount": serializers.WholesalerPriceDiscountsSerializer(price_discount,context={'request': request}).data,
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )


        if not percent:
            raise exceptions.ValidationError("Percentage is required")

        if not title:
            raise exceptions.ValidationError("Title is required")

        files = request.FILES.getlist("price_discount_banners")
        if files:
            request.data.pop("price_discount_banners")
            serializer_context = {
                "request": request,
            }

            serializer = serializers.WholesalerPriceDiscountsSerializer(
                data=request.data, context=serializer_context
            )
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(exc)
                item = models.WholesalerPriceDiscounts.objects.get(id=serializer.data["id"])
                errors_messages = []

                uploaded_files = []
                for file in files:
                    content = models.WholesalerPriceDiscountBanners.objects.create(
                        owner=request.user,
                        price_discount_banner=file,
                        wholesaler_price_discount=item,
                        entity=request.user.entity,
                    )
                    uploaded_files.append(content)

                item.price_discount_banners.add(*uploaded_files)
                item.save()
                context = serializer.data
                arr =[]
                arr= serializers.WholesalerPriceDiscountBannersSerializer(item.price_discount_banners,context={'request': request}, many=True).data,
                context["price_discount_banners"] =arr

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Price discount succesfully created",
                        "wholesale_price_discount": serializers.WholesalerPriceDiscountsSerializer(item,context={'request': request}).data,
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )
            else:
                default_errors = serializer.errors
                errors_messages = []
                for field_name, field_errors in default_errors.items():
                    for field_error in field_errors:
                        error_message = "%s: %s" % (field_name, field_error)
                        errors_messages.append(error_message)

                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Price discount not created",
                        "wholesale_price_discount": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        else:

            serializer_context = {
                "request": request,
            }

            serializer = serializers.WholesalerPriceDiscountsSerializer(
                data=request.data, context=serializer_context
            )
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    entity=request.user.entity, normal_price=0.00, offer_price=0.00)
                except IntegrityError as exc:
                    errors_messages.append(str(exc))
                    return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Price discount not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )

                user_data = serializer.data
                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Wholesale price discount succesfully created",
                        "wholesale_price_discount": serializer.data,
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )
            else:
                default_errors = serializer.errors
                errors_messages = []
                for field_name, field_errors in default_errors.items():
                    for field_error in field_errors:
                        error_message = "%s: %s" % (field_name, field_error)
                        errors_messages.append(error_message)

                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Wholesale price discount not created",
                        "wholesale_price_discount": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )


class WholesalerPriceDiscountUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update price discount with banners.

    Fixes applied:
      - `name` class attribute preserved — urls.py reads it.
      - Date strings from `request.data` are parsed before assignment.
      - Fields are collected and saved once, not once per field.
      - `refresh_from_db()` before serialization so the serializer sees
        `date` objects, not in-memory strings.
    """

    name = "wholesale-price-discount-update"
    permission_classes = (WholesalerEmployeePermission,)
    serializer_class = serializers.WholesalerPriceDiscountsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.WholesalerPriceDiscounts.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        files = request.FILES.getlist("price_discount_banners")
        instance = self.get_object()

        if files:
            uploaded_files = []
            for file in files:
                content = models.WholesalerPriceDiscountBanners.objects.create(
                    owner=request.user,
                    price_discount_banner=file,
                    entity=request.user.entity,
                    wholesaler_price_discount=instance,
                )
                uploaded_files.append(content)
            instance.price_discount_banners.add(*uploaded_files)

        data = request.data
        update_fields: list[str] = []

        title = data.get("title")
        if title:
            instance.title = title
            update_fields.append("title")

        percent = data.get("percent")
        if percent not in (None, ""):
            instance.percent = percent
            update_fields.append("percent")

        start = data.get("start")
        if start:
            parsed = (
                parse_date(str(start))
                if isinstance(start, str)
                else start
            )
            if parsed is not None:
                instance.start = parsed
                update_fields.append("start")

        end = data.get("end")
        if end:
            parsed = (
                parse_date(str(end))
                if isinstance(end, str)
                else end
            )
            if parsed is not None:
                instance.end = parsed
                update_fields.append("end")

        if update_fields:
            instance.save(update_fields=update_fields)

        instance.refresh_from_db()

        return Response(
            serializers.WholesalerPriceDiscountsSerializer(
                instance, context={"request": request}
            ).data
        )

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


# ===========================================================================
# Quantity discount — create / update
# ===========================================================================

class WholesalerQuantityDiscountsCreateAPIView(generics.GenericAPIView):
    """
    Create new wholesaler quantity discount
    """

    name = "quantity-discount-create"
    permission_classes = (WholesalerEmployeePermission,)
    serializer_class = serializers.WholesalerQuantityDiscountsSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        title = request.POST.get("title", None)
        limit_quantity = request.POST.get("limit_quantity", 1)
        awarded_quantity = request.POST.get("awarded_quantity", 1)
        start = request.POST.get("start", None)
        end = request.POST.get("end", None)

        if not title:
            raise exceptions.ValidationError("Title is required")

        files = request.FILES.getlist("quantity_discount_banners")
        if files:
            request.data.pop("quantity_discount_banners")
            serializer_context = {
                "request": request,
            }

            serializer = serializers.WholesalerQuantityDiscountsSerializer(
                data=request.data, context=serializer_context
            )
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(exc)
                item = models.WholesalerQuantityDiscounts.objects.get(id=serializer.data["id"])
                errors_messages = []

                uploaded_files = []
                for file in files:
                    content = models.WholesalerQuantityDiscountBanners.objects.create(
                        owner=request.user,
                        quantity_discount_banner=file,
                        wholesaler_quantity_discount=item,
                        entity=request.user.entity,
                    )
                    uploaded_files.append(content)

                item.quantity_discount_banners.add(*uploaded_files)
                item.save()
                context = serializer.data
                arr =[]
                arr= serializers.WholesalerQuantityDiscountBannersSerializer(item.quantity_discount_banners,context={'request': request}, many=True).data,
                context["quantity_discount_banners"] =arr

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Wholesaler quantity succesfully created",
                        "wholesaler_quantity_discount": serializers.WholesalerQuantityDiscountsSerializer(item,context={'request': request}).data,
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )
            else:
                default_errors = serializer.errors
                errors_messages = []
                for field_name, field_errors in default_errors.items():
                    for field_error in field_errors:
                        error_message = "%s: %s" % (field_name, field_error)
                        errors_messages.append(error_message)

                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Wholesaler quantity discount not created",
                        "wholesaler_quantity_discount": serializers.WholesalerQuantityDiscountsSerializer(item,context={'request': request}).data,
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        else:

            serializer_context = {
                "request": request,
            }

            serializer = serializers.WholesalerQuantityDiscountsSerializer(
                data=request.data, context=serializer_context
            )
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(
                        f"{exc}"
                    )

                user_data = serializer.data
                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Wholesaer quantity discount succesfully created",
                        "wholesaler_quantity_discount": serializer.data,
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )
            else:
                default_errors = serializer.errors
                errors_messages = []
                for field_name, field_errors in default_errors.items():
                    for field_error in field_errors:
                        error_message = "%s: %s" % (field_name, field_error)
                        errors_messages.append(error_message)

                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Wholesaler quantity discount not created",
                        "product": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )


class WholesalerQuantityDiscountUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update quantity discount with banners.
    """

    name = "quantity-discount-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.WholesalerQuantityDiscountsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.WholesalerQuantityDiscounts.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        files = request.FILES.getlist("quantity_discount_banners")
        instance = self.get_object()

        if files:
            uploaded_files = []
            for file in files:
                content = models.WholesalerQuantityDiscountBanners.objects.create(
                    owner=request.user,
                    quantity_discount_banner=file,
                    entity=request.user.entity,
                    wholesaler_quantity_discount=instance,
                )
                uploaded_files.append(content)
            instance.quantity_discount_banners.add(*uploaded_files)

        data = request.data
        update_fields: list[str] = []

        title = data.get("title")
        if title:
            instance.title = title
            update_fields.append("title")

        limit_quantity = data.get("limit_quantity")
        if limit_quantity not in (None, ""):
            try:
                instance.limit_quantity = int(limit_quantity)
                update_fields.append("limit_quantity")
            except (TypeError, ValueError):
                pass

        awarded_quantity = data.get("awarded_quantity")
        if awarded_quantity not in (None, ""):
            try:
                instance.awarded_quantity = int(awarded_quantity)
                update_fields.append("awarded_quantity")
            except (TypeError, ValueError):
                pass

        start = data.get("start")
        if start:
            parsed = (
                parse_date(str(start))
                if isinstance(start, str)
                else start
            )
            if parsed is not None:
                instance.start = parsed
                update_fields.append("start")

        end = data.get("end")
        if end:
            parsed = (
                parse_date(str(end))
                if isinstance(end, str)
                else end
            )
            if parsed is not None:
                instance.end = parsed
                update_fields.append("end")

        if update_fields:
            instance.save(update_fields=update_fields)

        instance.refresh_from_db()

        return Response(
            serializers.WholesalerQuantityDiscountsSerializer(
                instance, context={"request": request}
            ).data
        )

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


# ===========================================================================
# Wholesaler campaigns — unified dispatcher
# ===========================================================================
#
# Route:  POST /api/wholesalers/campaigns/
# Body:   {"action": "<ActionName>", ...payload}
#
# Writes and multi-row workflows → services.campaigns
# Read-side query builders       → utils.campaign_utils
#
# CreateCampaign / UpdateCampaign live on their own class-based views
# (WholesalerCampaignsCreateAPIView / WholesalerCampaignUpdateAPIView)
# because they handle multipart banners. Everything else dispatches here.
# ---------------------------------------------------------------------------

_CAMPAIGN_ACTIONS = {}


def campaign_action(name):
    """Register `fn` as the handler for campaign action `name`."""
    def decorator(fn):
        _CAMPAIGN_ACTIONS[name] = fn
        return fn
    return decorator


def _ok(serializer_class, instance, request, *, message, key):
    """Success response carrying a single serialized object."""
    data = serializer_class(
        instance, many=False, context={"request": request},
    ).data
    return custom_success_message(0, message, data, key)


def _ok_empty(message, key):
    """Success response with an empty payload (delete / remove actions)."""
    return custom_success_message(0, message, {}, key)


def _fail(message, errors):
    return custom_errors_response(1, message, errors)


def _paginate(serializer_class, queryset, request):
    paginator = PageNumberPagination()
    page = paginator.paginate_queryset(queryset, request)
    data = serializer_class(
        page, many=True, context={"request": request},
    ).data
    return paginator.get_paginated_response(data)


# ---------------------------------------------------------------------------
# Campaign lifecycle
# ---------------------------------------------------------------------------

@campaign_action("GetEntityCampaigns")
def _get_entity_campaigns(request):
    """
    Sample request:
        {
            "action": "GetEntityCampaigns",
            "status": "PUBLISHED",
            "page": 1
        }
    """
    campaigns = campaign_utils.get_entity_campaigns(request.data, request.user)
    return _paginate(
        serializers.WholesalerCampaignSerializer, campaigns, request,
    )


@campaign_action("GetCampaignDetails")
def _get_campaign_details(request):
    """
    Sample request:
        {
            "action": "GetCampaignDetails",
            "campaign_id": "5b8f1c2a-9d4e-4b7a-8c1f-3e6a9d2f7b4c"
        }
    """
    campaign, errors = campaign_utils.get_campaign_details(
        request.data, request.user,
    )
    if not campaign:
        return _fail("Campaign could not be retrieved", errors)
    return _ok(
        serializers.WholesalerCampaignSerializer,
        campaign, request,
        message="Campaign retrieved successfully",
        key="campaign",
    )


@campaign_action("DeleteCampaign")
def _delete_campaign(request):
    errors, campaign = services.delete_campaign(request.data, request.user)
    if not campaign:
        return _fail("Campaign could not be deleted", errors)
    return _ok_empty("Campaign deleted successfully", "campaign")


@campaign_action("PublishCampaign")
def _publish_campaign(request):
    errors, campaign = services.publish_campaign(request.data, request.user)
    if not campaign:
        return _fail("Campaign could not be published", errors)
    return _ok(
        serializers.WholesalerCampaignSerializer,
        campaign, request,
        message="Campaign published successfully",
        key="campaign",
    )


@campaign_action("CloseCampaign")
def _close_campaign(request):
    errors, campaign = services.close_campaign(request.data, request.user)
    if not campaign:
        return _fail("Campaign could not be closed", errors)
    return _ok(
        serializers.WholesalerCampaignDetailSerializer,
        campaign, request,
        message="Campaign closed successfully",
        key="campaign",
    )


# ---------------------------------------------------------------------------
# Campaign items
# ---------------------------------------------------------------------------

@campaign_action("AddCampaignItem")
def _add_campaign_item(request):
    """
    Sample request:
        {
            "action": "AddCampaignItem",
            "campaign_id": 42,
            "wholesaler_receipt_id": 918,
            "wholesaler_price_discount_id": 17,
            "wholesaler_quantity_discount_id": 33,
            "suggested_quantity": 20,
            "per_retailer_limit": 100,
            "retail_price_hint": "149.99"
        }
    """
    errors, item = services.add_campaign_item(request.data, request.user)
    if not item:
        return _fail("Campaign item could not be added", errors)
    return _ok(
        serializers.WholesalerCampaignItemDetailSerializer,
        item, request,
        message="Campaign item added successfully",
        key="campaign_item",
    )


@campaign_action("UpdateCampaignItem")
def _update_campaign_item(request):
    errors, item = services.update_campaign_item(request.data, request.user)
    if not item:
        return _fail("Campaign item could not be updated", errors)
    return _ok(
        serializers.WholesalerCampaignItemDetailSerializer,
        item, request,
        message="Campaign item updated successfully",
        key="campaign_item",
    )


@campaign_action("DeleteCampaignItem")
def _delete_campaign_item(request):
    errors, item = services.delete_campaign_item(request.data, request.user)
    if not item:
        return _fail("Campaign item could not be deleted", errors)
    return _ok_empty("Campaign item deleted successfully", "campaign_item")


@campaign_action("GetCampaignItems")
def _get_campaign_items(request):
    items = campaign_utils.get_campaign_items(request.data, request.user)
    return _paginate(
        serializers.WholesalerCampaignItemDetailSerializer, items, request,
    )


# ---------------------------------------------------------------------------
# Audience
# ---------------------------------------------------------------------------

@campaign_action("AddCampaignAudience")
def _add_campaign_audience(request):
    """
    Sample request:
        {
            "action": "AddCampaignAudience",
            "campaign_id": 42,
            "retailer_id": 305
        }
    """
    errors, audience = services.add_campaign_audience(request.data, request.user)
    if not audience:
        return _fail("Audience could not be added", errors)
    return _ok(
        serializers.WholesalerCampaignAudienceListSerializer,
        audience, request,
        message="Audience added successfully",
        key="campaign_audience",
    )


@campaign_action("RemoveCampaignAudience")
def _remove_campaign_audience(request):
    errors, audience = services.remove_campaign_audience(request.data, request.user)
    if not audience:
        return _fail("Audience could not be removed", errors)
    return _ok_empty("Audience removed successfully", "campaign_audience")


@campaign_action("GetCampaignAudience")
def _get_campaign_audience(request):
    audience = campaign_utils.get_campaign_audience(request.data, request.user)
    return _paginate(
        serializers.WholesalerCampaignAudienceListSerializer, audience, request,
    )


# ---------------------------------------------------------------------------
# Retailer-facing
# ---------------------------------------------------------------------------

@campaign_action("GetMyCampaigns")
def _get_my_campaigns(request):
    campaigns = campaign_utils.get_my_campaigns(request.data, request.user)
    return _paginate(
        serializers.WholesalerCampaignSerializer, campaigns, request,
    )


@campaign_action("GetMyCampaignDetails")
def _get_my_campaign_details(request):
    """
    Retailer-facing: one campaign the caller is on the audience for,
    with the retailer-safe item list — each item carrying its own
    per-retailer quantity recommendation — and the caller's own
    audience row.

    Gated by audience membership, not campaign ownership.

    Sample request:
        {
            "action": "GetMyCampaignDetails",
            "campaign_id": "5b8f1c2a-9d4e-4b7a-8c1f-3e6a9d2f7b4c"
        }
    """
    from analytics.services.campaign_advisor import (
        recommend_quantities_for_campaign_items,
    )

    try:
        campaign, items, audience = campaign_utils.get_my_campaign_details(
            request.data, request.user,
        )
    except DjangoValidationError as exc:
        errors = (
            exc.message_dict
            if hasattr(exc, "message_dict")
            else {"detail": list(exc.messages)}
        )
        return _fail("Campaign could not be retrieved", errors)

    # One batched recommendation pass across every item — 5 queries
    # total, independent of item count. No N+1.
    recommendations = recommend_quantities_for_campaign_items(
        items=items,
        retailer_entity=audience.retailer,
        service_level="balanced",
    )

    items_data = serializers.RetailerCampaignItemSerializer(
        items, many=True, context={"request": request},
    ).data

    for row in items_data:
        row["recommendation"] = recommendations.get(
            str(row["id"]),
            {
                "recommended_quantity": int(row.get("suggested_quantity") or 0),
                "confidence": "none",
                "reason": "No recommendation computed.",
                "current_on_hand": 0,
                "expected_demand": 0.0,
                "safety_stock": 0.0,
                "demand_pattern": None,
                "forecast_wape": None,
                "capped_by_limit": False,
            },
        )

    return Response(
        data={
            "response_code": 0,
            "response_message": "Campaign retrieved",
            "campaign": serializers.WholesalerCampaignSerializer(
                campaign, context={"request": request},
            ).data,
            "items": items_data,
            "my_audience": {
                "id": str(audience.id),
                "has_opted_in": audience.has_opted_in,
                "opted_in_at": audience.opted_in_at,
                "opted_out_at": audience.opted_out_at,
                "retailer_indent": (
                    str(audience.retailer_indent_id)
                    if audience.retailer_indent_id else None
                ),
                "retailer_indent_number": (
                    getattr(
                        audience.retailer_indent,
                        "indent_number",
                        None,
                    )
                    if audience.retailer_indent_id else None
                ),
            },
            "errors": [],
        },
        status=status.HTTP_200_OK,
    )


@campaign_action("GetCampaignItemSuggestion")
def _get_campaign_item_suggestion(request):
    """
    Quantity suggestion for a campaign item.

    Two modes, selected by the payload shape:

    // Mode A — wholesaler pre-fills `suggested_quantity` when picking
    //           a product in the builder. The item doesn't exist yet,
    //           so pass the receipt id + the live audience.
    {
        "action": "GetCampaignItemSuggestion",
        "campaign_id": "...",
        "wholesaler_receipt_id": "...",
        "retailer_ids": ["...", "..."]    // optional, overrides DB
    }
    Returns: { suggested_quantity, audience_size, expected_total_volume,
               confidence, reason }

    // Mode B — per-retailer recommendation when the modal opens a
    //           campaign item (only used by the batch fallback path —
    //           the primary flow attaches `recommendation` inside
    //           GetMyCampaignDetails).
    {
        "action": "GetCampaignItemSuggestion",
        "campaign_id": "...",
        "item_id": "...",
        "retailer_id": "..."              // optional; defaults to caller
    }
    """
    from analytics.services.campaign_advisor import (
        recommend_campaign_item_quantity,
        suggest_wholesale_item_quantity,
    )
    from authentication.models import Entities

    campaign_id = request.data.get("campaign_id")
    if not campaign_id:
        return _fail(
            "Suggestion could not be computed",
            {"campaign_id": "This field is required."},
        )

    campaign = (
        models.WholesalerCampaign.objects
        .select_related("wholesaler")
        .filter(pk=campaign_id)
        .first()
    )
    if campaign is None:
        return _fail(
            "Suggestion could not be computed",
            {"campaign_id": "Campaign not found."},
        )

    item_id = request.data.get("item_id")
    receipt_id = request.data.get("wholesaler_receipt_id")
    retailer_id = request.data.get("retailer_id")
    retailer_ids_payload = request.data.get("retailer_ids") or []

    # ---- Mode B: item_id present → per-retailer recommendation ----
    if item_id:
        item = (
            models.WholesalerCampaignItem.objects
            .select_related(
                "campaign",
                "wholesaler_receipt",
                "wholesaler_receipt__product",
            )
            .filter(pk=item_id, campaign=campaign)
            .first()
        )
        if item is None:
            return _fail(
                "Suggestion could not be computed",
                {"item_id": "Campaign item not found."},
            )

        if retailer_id:
            retailer = Entities.objects.filter(pk=retailer_id).first()
            if retailer is None:
                return _fail(
                    "Suggestion could not be computed",
                    {"retailer_id": "Retailer entity not found."},
                )
        else:
            retailer = getattr(request.user, "entity", None)
            if retailer is None:
                return _fail(
                    "Suggestion could not be computed",
                    {"detail": "User is not associated with an entity."},
                )

        suggestion = recommend_campaign_item_quantity(
            product=item.wholesaler_receipt.product,
            retailer_entity=retailer,
            campaign_start=campaign.start,
            campaign_end=campaign.end,
            per_retailer_limit=item.per_retailer_limit,
            service_level="balanced",
        )

        return custom_success_message(
            0,
            "Suggestion computed",
            {
                "item_id": str(item.id),
                "retailer_id": str(retailer.pk),
                **suggestion,
            },
            "suggestion",
        )

    # ---- Mode A: wholesaler-side, receipt-based ----
    if not receipt_id:
        return _fail(
            "Suggestion could not be computed",
            {
                "wholesaler_receipt_id":
                    "Provide either item_id or wholesaler_receipt_id.",
            },
        )

    receipt = (
        models.WholesalerReceipts.objects
        .select_related("product")
        .filter(pk=receipt_id)
        .first()
    )
    if receipt is None:
        return _fail(
            "Suggestion could not be computed",
            {"wholesaler_receipt_id": "Receipt not found."},
        )

    entity = getattr(request.user, "entity", None)
    if entity is None or campaign.wholesaler_id != entity.pk:
        return _fail(
            "Suggestion could not be computed",
            {"campaign_id": "Campaign does not belong to your entity."},
        )

    # Prefer the audience supplied by the client (live Formik state).
    # Fall back to the persisted rows when the client didn't send any.
    if retailer_ids_payload:
        audience_ids = list(retailer_ids_payload)
    else:
        audience_ids = list(
            models.WholesalerCampaignAudience.objects
            .filter(campaign=campaign, is_visible="true")
            .values_list("retailer_id", flat=True)
        )

    suggestion = suggest_wholesale_item_quantity(
        product=receipt.product,
        wholesaler_entity=entity,
        campaign_start=campaign.start,
        campaign_end=campaign.end,
        audience_entity_ids=audience_ids,
        service_level="balanced",
    )

    return custom_success_message(
        0,
        "Suggestion computed",
        {
            "wholesaler_receipt_id": str(receipt.id),
            "audience_size": len(audience_ids),
            **suggestion,
        },
        "suggestion",
    )


@campaign_action("ProjectCampaign")
def _project_campaign(request):
    errors, projections = services.project_campaign(request.data, request.user)
    if projections is None:
        return _fail("Projection could not be computed", errors)
    return custom_success_message(
        0, "Projection computed successfully", projections, "projections",
    )


@campaign_action("OptInCampaign")
def _opt_in_campaign(request):
    errors, result = services.opt_in_campaign(request.data, request.user)
    if not result:
        return _fail("Campaign could not be accepted", errors)
    return custom_success_message(
        0,
        "Campaign accepted — indent updated",
        {
            "indent_id": result["indent"].id,
            "indent_number": result["indent"].indent_number,
            "items_created": len(result["items"]),
        },
        "indent",
    )


@campaign_action("OptOutCampaign")
def _opt_out_campaign(request):
    errors, audience = services.opt_out_campaign(request.data, request.user)
    if not audience:
        return _fail("Could not opt out", errors)
    return _ok(
        serializers.WholesalerCampaignAudienceListSerializer,
        audience, request,
        message="Opted out successfully",
        key="campaign_audience",
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

@api_view(["POST"])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@permission_classes([EntitySubscriptionPermission, permissions.IsAuthenticated])
def campaignsAPIView(request):
    """
    Single POST entry point. Dispatch is by the `action` key in the body.

    Missing action → 400 "Action is not supplied"
    Unknown action → 400 "Action <name> is unknown"

    CreateCampaign / UpdateCampaign are NOT handled here — they live on
    the dedicated class-based views (WholesalerCampaignsCreateAPIView /
    WholesalerCampaignUpdateAPIView) which accept multipart banner uploads.
    """
    action = request.data.get("action")

    if not action:
        raise exceptions.ValidationError("Action is not supplied")

    handler = _CAMPAIGN_ACTIONS.get(action)
    if handler is None:
        raise exceptions.ValidationError(f"Action {action} is unknown")

    return handler(request)


# ===========================================================================
# Campaign — create / update (class-based views, multipart banner uploads)
# ===========================================================================

class WholesalerCampaignsCreateAPIView(generics.GenericAPIView):
    """
    Create new wholesaler campaign
    """

    name = "campaign-create"
    permission_classes = (WholesalerEmployeePermission,)
    serializer_class = serializers.WholesalerCampaignSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        title = request.POST.get("title", None)

        if not title:
            raise exceptions.ValidationError("Title is required")

        files = request.FILES.getlist("campaign_banners")
        if files:
            request.data.pop("campaign_banners", None)

            serializer_context = {"request": request}
            serializer = serializers.WholesalerCampaignSerializer(
                data=request.data, context=serializer_context
            )

            if serializer.is_valid():
                try:
                    campaign = serializer.save(
                        owner=request.user,
                        entity=request.user.entity,
                        wholesaler=request.user.entity,
                    )
                except IntegrityError as exc:
                    raise exceptions.ValidationError(exc)

                uploaded_files = []
                for file in files:
                    content = models.WholesalerCampaignBanners.objects.create(
                        owner=request.user,
                        campaign_banner=file,
                        wholesaler_campaign=campaign,
                        entity=request.user.entity,
                    )
                    uploaded_files.append(content)

                campaign.campaign_banners.add(*uploaded_files)

                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Wholesaler campaign succesfully created",
                        "wholesaler_campaign": serializers.WholesalerCampaignSerializer(
                            campaign, context={"request": request}
                        ).data,
                        "errors": [],
                    },
                    status=status.HTTP_201_CREATED,
                )

            errors_messages = []
            for field_name, field_errors in serializer.errors.items():
                for field_error in field_errors:
                    errors_messages.append("%s: %s" % (field_name, field_error))

            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Wholesaler campaign not created",
                    "wholesaler_campaign": None,
                    "errors": errors_messages,
                },
                status=status.HTTP_200_OK,
            )

        serializer_context = {"request": request}
        serializer = serializers.WholesalerCampaignSerializer(
            data=request.data, context=serializer_context
        )

        if serializer.is_valid():
            try:
                serializer.save(
                    owner=request.user,
                    entity=request.user.entity,
                    wholesaler=request.user.entity,
                )
            except IntegrityError as exc:
                raise exceptions.ValidationError(f"{exc}")

            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Wholesaler campaign succesfully created",
                    "wholesaler_campaign": serializer.data,
                    "errors": [],
                },
                status=status.HTTP_201_CREATED,
            )

        errors_messages = []
        for field_name, field_errors in serializer.errors.items():
            for field_error in field_errors:
                errors_messages.append("%s: %s" % (field_name, field_error))

        return Response(
            data={
                "response_code": 1,
                "response_message": "Wholesaler campaign not created",
                "wholesaler_campaign": None,
                "errors": errors_messages,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )


class WholesalerCampaignUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update campaign with banners.

    POST /wholesalers/campaigns/<uuid:pk>/update
    Content-Type: multipart/form-data

    Response envelope:
        { response_code, response_message, wholesaler_campaign, errors }
    matching the create view so the frontend reads a single shape.
    """

    name = "campaign-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.WholesalerCampaignSerializer
    parser_classes = (MultiPartParser, FormParser)
    lookup_fields = ("pk",)

    def get_queryset(self):
        return models.WholesalerCampaign.objects.filter(
            wholesaler=self.request.user.entity
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()

        files = request.FILES.getlist("campaign_banners")
        if files:
            uploaded = []
            for file in files:
                uploaded.append(
                    models.WholesalerCampaignBanners.objects.create(
                        owner=request.user,
                        campaign_banner=file,
                        entity=request.user.entity,
                        wholesaler_campaign=instance,
                    )
                )
            instance.campaign_banners.add(*uploaded)

        data = request.data
        update_fields: list[str] = []

        title = data.get("title")
        if title:
            instance.title = title
            update_fields.append("title")

        description = data.get("description")
        if description is not None:
            instance.description = description
            update_fields.append("description")

        status_value = data.get("status")
        if status_value:
            if status_value not in models.WholesalerCampaign.Status.values:
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Campaign not updated",
                        "wholesaler_campaign": None,
                        "errors": [
                            f"status: '{status_value}' is not a valid choice."
                        ],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            instance.status = status_value
            update_fields.append("status")

        budget_cap = data.get("budget_cap")
        if budget_cap not in (None, ""):
            instance.budget_cap = budget_cap
            update_fields.append("budget_cap")

        start = data.get("start")
        if start:
            parsed = (
                parse_date(str(start))
                if isinstance(start, str)
                else start
            )
            if parsed is not None:
                instance.start = parsed
                update_fields.append("start")

        end = data.get("end")
        if end:
            parsed = (
                parse_date(str(end))
                if isinstance(end, str)
                else end
            )
            if parsed is not None:
                instance.end = parsed
                update_fields.append("end")

        try:
            instance.full_clean(exclude=None, validate_unique=False)
        except DjangoValidationError as exc:
            errors_messages = []
            if hasattr(exc, "message_dict"):
                for field_name, field_errors in exc.message_dict.items():
                    for msg in field_errors:
                        errors_messages.append(f"{field_name}: {msg}")
            else:
                errors_messages = list(exc.messages)
            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Campaign not updated",
                    "wholesaler_campaign": None,
                    "errors": errors_messages,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if update_fields:
            instance.save(update_fields=update_fields)

        instance.refresh_from_db()

        return Response(
            data={
                "response_code": 0,
                "response_message": "Campaign updated successfully",
                "wholesaler_campaign": serializers.WholesalerCampaignSerializer(
                    instance, context={"request": request}
                ).data,
                "errors": [],
            },
            status=status.HTTP_200_OK,
        )

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


# ===========================================================================
# Wholesaler receipt returns dispatcher
# ===========================================================================

@api_view(["POST"])
@permission_classes([EntitySubscriptionPermission, permissions.IsAuthenticated])
def receiptReturnsAPIView(request):
    """
    Single-entry command endpoint for wholesaler receipt returns.

    Route:  POST /api/v1/wholesalers/receipt-returns
    Body:   { "action": "<ActionName>", ...payload }
    """
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "InitiateReturn":
        errors, ret = utils.initiate_return(request.data, request.user)
        if ret:
            serializer = serializers.WholesalerReceiptReturnDetailSerializer(
                ret, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Return initiated successfully", serializer.data, "return",
            )
        return custom_errors_response(1, "Return could not be initiated", errors)

    elif action == "CreateReturn":
        errors, ret = utils.create_return(request.data, request.user)
        if ret:
            serializer = serializers.WholesalerReceiptReturnDetailSerializer(
                ret, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Return created successfully", serializer.data, "return",
            )
        return custom_errors_response(1, "Return could not be created", errors)

    elif action == "ListReturns":
        qs = utils.get_entity_returns(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializers.WholesalerReceiptReturnListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetReturnDetails":
        ret, errors = utils.get_return_details(request.data, request.user)
        if ret:
            serializer = serializers.WholesalerReceiptReturnDetailSerializer(
                ret, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Return retrieved successfully", serializer.data, "return",
            )
        return custom_errors_response(1, "Return could not be retrieved", errors)

    elif action == "UpdateReturn":
        errors, ret = utils.update_return(request.data, request.user)
        if ret:
            serializer = serializers.WholesalerReceiptReturnDetailSerializer(
                ret, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Return updated successfully", serializer.data, "return",
            )
        return custom_errors_response(1, "Return could not be updated", errors)

    elif action == "DeleteReturn":
        errors, ret = utils.delete_return(request.data, request.user)
        if ret:
            return custom_success_message(
                0, "Return deleted successfully", {}, "return",
            )
        return custom_errors_response(1, "Return could not be deleted", errors)

    elif action == "ConfirmReturn":
        errors, ret = utils.confirm_return(request.data, request.user)
        if ret:
            serializer = serializers.WholesalerReceiptReturnDetailSerializer(
                ret, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Return confirmed successfully", serializer.data, "return",
            )
        return custom_errors_response(1, "Return could not be confirmed", errors)

    elif action == "RejectReturn":
        errors, ret = utils.reject_return(request.data, request.user)
        if ret:
            serializer = serializers.WholesalerReceiptReturnDetailSerializer(
                ret, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Return rejected successfully", serializer.data, "return",
            )
        return custom_errors_response(1, "Return could not be rejected", errors)

    elif action == "SettleReturn":
        errors, ret = utils.settle_return(request.data, request.user)
        if ret:
            serializer = serializers.WholesalerReceiptReturnDetailSerializer(
                ret, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Return settled successfully", serializer.data, "return",
            )
        return custom_errors_response(1, "Return could not be settled", errors)

    elif action == "CancelReturn":
        errors, ret = utils.cancel_return(request.data, request.user)
        if ret:
            serializer = serializers.WholesalerReceiptReturnDetailSerializer(
                ret, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Return cancelled successfully", serializer.data, "return",
            )
        return custom_errors_response(1, "Return could not be cancelled", errors)

    elif action == "GetStaleReturns":
        qs = utils.get_stale_returns(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializers.WholesalerReceiptReturnListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetReturnMismatches":
        qs = utils.get_return_mismatches(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializers.WholesalerReceiptReturnListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    else:
        raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Wholesaler product requests dispatcher
# ===========================================================================

@api_view(["POST"])
@permission_classes([EntitySubscriptionPermission, permissions.IsAuthenticated])
def productRequestsAPIView(request):
    """
    Actions:
        GetIncoming                       — open requests in the wholesaler's scope
        GetRequestDetails                 — one request with lines and current offers
        Respond                           — accept/reject lines, attach or create receipts
        GetActiveDiscountsForProducts     — active promos for a set of products
    """
    action = request.data.get("action")
    if not action:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "GetIncoming":
        qs = (
            RetailerProductRequest.objects
            .filter(
                status__in=["OPEN", "ACKNOWLEDGED", "PARTIALLY_FULFILLED"],
                items__status__in=["PENDING", "OFFERED", "PARTIALLY_FULFILLED"],
            )
            .exclude(
                items__offers__wholesaler=request.user.entity,
                items__offers__status__in=[
                    RetailerProductRequestOffer.Status.OFFERED,
                    RetailerProductRequestOffer.Status.CONFIRMED,
                    RetailerProductRequestOffer.Status.FULFILLED,
                ],
            )
            .distinct()
            .select_related("entity")
            .prefetch_related("items")
            .order_by("-urgency", "-created")
        )

        if request.data.get("urgency"):
            qs = qs.filter(urgency=request.data["urgency"])

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = RetailerProductRequestListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetRequestDetails":
        request_id = request.data.get("request_id")
        if not request_id:
            return custom_errors_response(
                1, "Could not retrieve request",
                {"request_id": "This field is required."},
            )

        try:
            req = (
                RetailerProductRequest.objects
                .prefetch_related(
                    Prefetch("items", queryset=RetailerProductRequestItem.objects.select_related("product")),
                    Prefetch(
                        "items__offers",
                        queryset=RetailerProductRequestOffer.objects.select_related("wholesaler", "wholesaler_receipt"),
                    ),
                    Prefetch("responses", queryset=RetailerProductRequestResponse.objects.select_related("wholesaler")),
                )
                .get(id=request_id)
            )
        except RetailerProductRequest.DoesNotExist:
            return custom_errors_response(
                1, "Request not found", {"request_id": "Not found."},
            )

        return custom_success_message(
            0, "Request retrieved",
            RetailerProductRequestSerializer(req).data, "request",
        )

    elif action == "Respond":
        request_id = request.data.get("request_id")
        if not request_id:
            return custom_errors_response(
                1, "Response could not be recorded",
                {"request_id": "This field is required."},
            )

        try:
            req = RetailerProductRequest.objects.get(id=request_id)
        except RetailerProductRequest.DoesNotExist:
            return custom_errors_response(
                1, "Request not found", {"request_id": "Not found."},
            )

        accepted_lines = request.data.get("accepted_lines", [])
        rejected_lines = request.data.get("rejected_lines", [])
        note = request.data.get("note", "")

        if not accepted_lines and not rejected_lines:
            return custom_errors_response(
                1, "Response must accept or reject at least one line", {},
            )

        for payload in accepted_lines:
            item_id = payload.get("item_id")
            if not item_id:
                return custom_errors_response(
                    1, "Invalid accepted line",
                    {"accepted_lines": "Each line requires item_id."},
                )

            has_receipt_id = bool(payload.get("receipt_id"))
            has_receipt_payload = isinstance(payload.get("receipt"), dict)

            if has_receipt_id and has_receipt_payload:
                return custom_errors_response(
                    1, "Invalid accepted line",
                    {"accepted_lines": "Provide either receipt_id or receipt, not both."},
                )
            if not has_receipt_id and not has_receipt_payload:
                return custom_errors_response(
                    1, "Invalid accepted line",
                    {"accepted_lines": "Each accepted line requires receipt_id or receipt."},
                )

            if not req.items.filter(id=item_id).exists():
                return custom_errors_response(
                    1, "Line not found on this request",
                    {"accepted_lines": f"Item {item_id} does not belong to this request."},
                )

        for payload in rejected_lines:
            if not payload.get("item_id"):
                return custom_errors_response(
                    1, "Invalid rejected line",
                    {"rejected_lines": "Each line requires item_id."},
                )
            if not req.items.filter(id=payload["item_id"]).exists():
                return custom_errors_response(
                    1, "Line not found on this request",
                    {"rejected_lines": f"Item {payload['item_id']} does not belong to this request."},
                )

        accepted_ids = {p["item_id"] for p in accepted_lines}
        rejected_ids = {p["item_id"] for p in rejected_lines}
        if accepted_ids & rejected_ids:
            return custom_errors_response(
                1, "A line cannot be both accepted and rejected",
                {"overlap": list(accepted_ids & rejected_ids)},
            )

        try:
            response_obj = wholesaler_respond_to_request(
                request_obj=req,
                wholesaler_entity=request.user.entity,
                accepted_lines=accepted_lines,
                rejected_lines=rejected_lines,
                response_note=note,
                by_user=request.user,
            )
        except ValueError as e:
            return custom_errors_response(1, "Response could not be recorded", {"detail": str(e)})

        from analytics.realtime import push_request_response
        push_request_response(str(req.entity_id), {
            "request_id": str(req.id),
            "request_number": req.request_number,
            "wholesaler_id": str(request.user.entity_id),
            "wholesaler_title": request.user.entity.title,
            "offered_line_count": response_obj.offered_line_count,
            "rejected_line_count": response_obj.rejected_line_count,
            "note": note,
        })

        return custom_success_message(
            0,
            "Response recorded",
            {
                "response_id": str(response_obj.id),
                "offered_line_count": response_obj.offered_line_count,
                "rejected_line_count": response_obj.rejected_line_count,
            },
            "response",
        )

    elif action == "GetActiveDiscountsForProducts":
        product_ids = request.data.get("product_ids", [])
        if not product_ids:
            return custom_success_message(
                0, "No products specified",
                {"price_discounts": [], "quantity_discounts": []},
                "discounts",
            )

        today = timezone.now().date()

        price_discounts = (
            models.WholesalerPriceDiscounts.objects
            .filter(
                entity=request.user.entity,
                is_active="true",
                start__lte=today,
                end__gte=today,
                wholesaler_receipt__product_id__in=product_ids,
            )
            .select_related("wholesaler_receipt", "wholesaler_receipt__product")
            .values(
                "id", "title",
                "wholesaler_receipt_id",
                "wholesaler_receipt__product_id",
                "wholesaler_receipt__product__title",
                "percent", "offer_price",
            )
        )

        qty_discounts = (
            models.WholesalerQuantityDiscounts.objects
            .filter(
                entity=request.user.entity,
                is_active="true",
                start__lte=today,
                end__gte=today,
                wholesaler_receipt__product_id__in=product_ids,
            )
            .select_related("wholesaler_receipt", "wholesaler_receipt__product")
            .values(
                "id", "title",
                "wholesaler_receipt_id",
                "wholesaler_receipt__product_id",
                "wholesaler_receipt__product__title",
                "limit_quantity", "awarded_quantity",
            )
        )

        return custom_success_message(
            0, "Active discounts retrieved",
            {
                "price_discounts": list(price_discounts),
                "quantity_discounts": list(qty_discounts),
            },
            "discounts",
        )

    else:
        raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Order commit dispatcher
# ===========================================================================

@api_view(["POST"])
@permission_classes([EntitySubscriptionPermission, permissions.IsAuthenticated])
def retailerOrdersCommitAPIView(request):
    """
    Commit or reject a retailer order.

    Actions:
        CommitOrder    — commit with commit_type (CASH/CREDIT/PLACEMENT/FACILITY)
        RejectOrder    — reject with a reason
    """
    action = request.data.get("action")
    if not action:
        raise exceptions.ValidationError("Action is not supplied")

    from .models import RetailerOrders
    from .services.commit_order import commit_order

    if action == "CommitOrder":
        order_id = request.data.get("order_id")
        commit_type = request.data.get("commit_type")
        note = request.data.get("note", "")

        if not order_id or not commit_type:
            return custom_errors_response(
                1, "Order could not be committed",
                {
                    "order_id": "Required." if not order_id else None,
                    "commit_type": "Required." if not commit_type else None,
                },
            )

        try:
            order = RetailerOrders.objects.get(
                id=order_id, wholesaler=request.user.entity,
            )
        except RetailerOrders.DoesNotExist:
            return custom_errors_response(
                1, "Order not found",
                {"order_id": "Not found or not yours."},
            )

        try:
            order = commit_order(
                order=order,
                commit_type=commit_type,
                by_user=request.user,
                note=note,
            )
        except ValueError as e:
            return custom_errors_response(1, "Order could not be committed", {"detail": str(e)})

        from analytics.realtime import push_order_committed
        push_order_committed(str(order.retailer_id), {
            "order_id": str(order.id),
            "reference_number": order.reference_number,
            "commit_type": order.commit_type,
            "committed_at": order.committed_at.isoformat() if order.committed_at else None,
            "wholesaler_id": str(request.user.entity_id),
            "wholesaler_title": request.user.entity.title,
        })

        return custom_success_message(
            0, "Order committed",
            {
                "order_id": str(order.id),
                "commit_type": order.commit_type,
                "committed_at": order.committed_at.isoformat() if order.committed_at else None,
            },
            "order",
        )

    elif action == "RejectOrder":
        order_id = request.data.get("order_id")
        reason = request.data.get("reason", "")

        if not order_id:
            return custom_errors_response(
                1, "Order could not be rejected",
                {"order_id": "This field is required."},
            )

        try:
            order = RetailerOrders.objects.get(
                id=order_id, wholesaler=request.user.entity,
            )
        except RetailerOrders.DoesNotExist:
            return custom_errors_response(
                1, "Order not found", {"order_id": "Not found or not yours."},
            )

        if order.is_committed == "true":
            return custom_errors_response(
                1, "Cannot reject a committed order",
                {"status": "Order has already been committed."},
            )

        now = timezone.now()
        order.status = "CANCELLED"
        order.cancelled_at = now
        order.save(update_fields=["status", "cancelled_at", "updated"])

        from analytics.realtime import push_order_rejected
        push_order_rejected(str(order.retailer_id), {
            "order_id": str(order.id),
            "reference_number": order.reference_number,
            "reason": reason,
            "wholesaler_id": str(request.user.entity_id),
            "wholesaler_title": request.user.entity.title,
        })

        return custom_success_message(
            0, "Order rejected",
            {"order_id": str(order.id)},
            "order",
        )

    else:
        raise exceptions.ValidationError(f"Action {action} is unknown")