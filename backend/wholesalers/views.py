from email import errors
from rest_framework.decorators import api_view, permission_classes
from rest_framework import exceptions, generics, permissions, status
from . import wholesaler_permissions, utils, serializers
from rest_framework.pagination import PageNumberPagination
from core.responses import custom_errors_response, custom_success_message, custom_error_response
from retailers.retail_permissions import EntitySubscriptionPermission
from wholesalers.wholesaler_permissions import WholesalerEmployeePermission,WholesalerAndRetailerEmployeePermission
from rest_framework.response import Response
from core.responses import custom_error_response, custom_success_message,  custom_plain_response,custom_success_message_with_reference
from .utils import retailer_orders_utils, wholesaler_receipt_utils
from rest_framework.parsers import MultiPartParser, FormParser
from core import app_permissions
from . import models
from django.shortcuts import get_object_or_404, render
from django.db import IntegrityError



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
        # if (retailer_orders_utils.delete_retailer_order_item(
        #         request.data, request.user)):

        #     return Response(
        #         data={
        #             "response_code": 0,
        #             "response_message": "Retailer order item deleted succesfully",
        #         },

        #     )
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
        # wholesaler_receipt = utils.update_wholesaler_receipt(
        #     request.data, request.user)

        # if wholesaler_receipt:
        #     serializer = serializers.WholesalerReceiptsSerializer(
        #         wholesaler_receipt, many=False, context={"request": request}
        #     )
        #     return custom_success_message(
        #         0, "Wholesaler inventory receipt updated successfully", serializer.data, 'wholesaler_receipt'
        #     )

        # else:
        #     return custom_error_response(
        #         1, "Wholesaler inventory receipt could not be updated"
        #     )
    # elif request.data["action"] == "DeleteRetailerOrder":
    #     if (retailer_orders_utils.delete_retailer_order(
    #             request.data, request.user)):

    #         return Response(
    #             data={
    #                 "response_code": 0,
    #                 "response_message": "Retailer order deleted succesfully",
    #             },

    #         )
    #     """Search wholesaler receipts """

    #     wholesaler_receipts = utils.search_wholesaler_receipts(
    #         request.data, request.user)
    #     paginator = PageNumberPagination()
    #     page = paginator.paginate_queryset(wholesaler_receipts, request)
    #     serializer = serializers.WholesalerReceiptsSerializer(
    #         page, many=True, context={"request": request}
    #     )
    #     return paginator.get_paginated_response(serializer.data)
    
    
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


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
        # if (retailer_orders_utils.delete_retailer_order_item(
        #         request.data, request.user)):

        #     return Response(
        #         data={
        #             "response_code": 0,
        #             "response_message": "Retailer order item deleted succesfully",
        #         },

        #     )
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
        # wholesaler_receipt = utils.update_wholesaler_receipt(
        #     request.data, request.user)

        # if wholesaler_receipt:
        #     serializer = serializers.WholesalerReceiptsSerializer(
        #         wholesaler_receipt, many=False, context={"request": request}
        #     )
        #     return custom_success_message(
        #         0, "Wholesaler inventory receipt updated successfully", serializer.data, 'wholesaler_receipt'
        #     )

        # else:
        #     return custom_error_response(
        #         1, "Wholesaler inventory receipt could not be updated"
        #     )
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
            # serializer.is_valid(raise_exception=   True)
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
                # context["images"] = [file.id for file in uploaded_files]
                # context["images"] = [file.id for file in uploaded_files]
                # context["images"] = [image for image in uploaded_files]
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
                default_errors = serializer.errors  # default errors dict
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
            # serializer.is_valid(raise_exception=   True)
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
                    # raise exceptions.ValidationError(
                    # f"{exc}"
                    # )

                user_data = serializer.data
                # Retrieve user from database
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
                default_errors = serializer.errors  # default errors dict
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
    Update prodcut with images3

    """

    name = "wholesale-price-discount-update"
    permission_classes = (WholesalerEmployeePermission,)
    serializer_class = serializers.WholesalerPriceDiscountsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.WholesalerPriceDiscounts.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update price discounts with new banners
        """
        files = request.FILES.getlist("price_discount_banners")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = serializers.WholesalerPriceDiscountsSerializer(
            instance, context=serializer_context
        )
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
            instance.save()
            context = serializer.data
            context["price_discount_banners"] = [file.id for file in uploaded_files]
            print('Created', content)

        data = request.data


        title = data.get("title", None)
        if title:
            instance.title = title
            instance.save()

        percent = data.get("percent", None)
        if percent:
            instance.percent = percent
            instance.save()


        start = data.get("start", None)
        if start:
            instance.start = start
            instance.save()

        end = data.get("end", None)
        if end:
            instance.end = end
            instance.save()

        return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj
    
    # Quantity discounts


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
            # serializer.is_valid(raise_exception=   True)
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
                # context["images"] = [file.id for file in uploaded_files]
                # context["images"] = [file.id for file in uploaded_files]
                # context["images"] = [image for image in uploaded_files]
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
                default_errors = serializer.errors  # default errors dict
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
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(
                        f"{exc}"
                    )

                user_data = serializer.data
                # Retrieve user from database
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
                default_errors = serializer.errors  # default errors dict
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
    Update quantity discount with banners

    """

    name = "product-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.WholesalerQuantityDiscountsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.WholesalerQuantityDiscounts.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update quantity discounts with new banners
        """
        files = request.FILES.getlist("quantity_discount_banners")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = serializers.WholesalerQuantityDiscountsSerializer(
            instance, context=serializer_context
        )
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
            instance.save()
            context = serializer.data
            context["quantity_discount_banners"] = [file.id for file in uploaded_files]
            print('Created', content)

        data = request.data


        title = data.get("title", None)
        if title:
            instance.title = title
            instance.save()

        limit_quantity = data.get("limit_quantity", None)
        if limit_quantity:
            instance.limit_quantity = limit_quantity
            instance.save()

        awarded_quantity = data.get("awarded_quantity", None)
        if awarded_quantity:
            instance.awarded_quantity = awarded_quantity
            instance.save()



        start = data.get("start", None)
        if start:
            instance.start = start
            instance.save()

        end = data.get("end", None)
        if end:
            instance.end = end
            instance.save()

        return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj

from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination

from retailers.retail_permissions import EntitySubscriptionPermission
from core.responses import (
    custom_error_response,
    custom_errors_response,
    custom_success_message,
)

from . import utils
from . import serializers


@api_view(["POST"])
@permission_classes([EntitySubscriptionPermission, permissions.IsAuthenticated])
def campaignsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    # =================================================================
    # Campaign lifecycle
    # =================================================================

    if action == "CreateCampaign":
        errors, campaign = utils.create_campaign(request.data, request.user)
        if campaign:
            serializer = serializers.WholesalerCampaignDetailSerializer(
                campaign, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Campaign created successfully",
                serializer.data, "campaign",
            )
        return custom_errors_response(
            1, "Campaign could not be created", errors,
        )

    elif action == "GetEntityCampaigns":
        campaigns = utils.get_entity_campaigns(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(campaigns, request)
        serializer = serializers.WholesalerCampaignListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetCampaignDetails":
        campaign, errors = utils.get_campaign_details(request.data, request.user)
        if campaign:
            serializer = serializers.WholesalerCampaignDetailSerializer(
                campaign, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Campaign retrieved successfully",
                serializer.data, "campaign",
            )
        return custom_errors_response(
            1, "Campaign could not be retrieved", errors,
        )

    elif action == "UpdateCampaign":
        errors, campaign = utils.update_campaign(request.data, request.user)
        if campaign:
            serializer = serializers.WholesalerCampaignDetailSerializer(
                campaign, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Campaign updated successfully",
                serializer.data, "campaign",
            )
        return custom_errors_response(
            1, "Campaign could not be updated", errors,
        )

    elif action == "DeleteCampaign":
        errors, campaign = utils.delete_campaign(request.data, request.user)
        if campaign:
            return custom_success_message(
                0, "Campaign deleted successfully", {}, "campaign",
            )
        return custom_errors_response(
            1, "Campaign could not be deleted", errors,
        )

    elif action == "PublishCampaign":
        errors, campaign = utils.publish_campaign(request.data, request.user)
        if campaign:
            serializer = serializers.WholesalerCampaignDetailSerializer(
                campaign, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Campaign published successfully",
                serializer.data, "campaign",
            )
        return custom_errors_response(
            1, "Campaign could not be published", errors,
        )

    elif action == "CloseCampaign":
        errors, campaign = utils.close_campaign(request.data, request.user)
        if campaign:
            serializer = serializers.WholesalerCampaignDetailSerializer(
                campaign, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Campaign closed successfully",
                serializer.data, "campaign",
            )
        return custom_errors_response(
            1, "Campaign could not be closed", errors,
        )

    # =================================================================
    # Campaign items
    # =================================================================

    elif action == "AddCampaignItem":
        errors, item = utils.add_campaign_item(request.data, request.user)
        if item:
            serializer = serializers.WholesalerCampaignItemDetailSerializer(
                item, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Campaign item added successfully",
                serializer.data, "campaign_item",
            )
        return custom_errors_response(
            1, "Campaign item could not be added", errors,
        )

    elif action == "UpdateCampaignItem":
        errors, item = utils.update_campaign_item(request.data, request.user)
        if item:
            serializer = serializers.WholesalerCampaignItemDetailSerializer(
                item, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Campaign item updated successfully",
                serializer.data, "campaign_item",
            )
        return custom_errors_response(
            1, "Campaign item could not be updated", errors,
        )

    elif action == "DeleteCampaignItem":
        errors, item = utils.delete_campaign_item(request.data, request.user)
        if item:
            return custom_success_message(
                0, "Campaign item deleted successfully", {}, "campaign_item",
            )
        return custom_errors_response(
            1, "Campaign item could not be deleted", errors,
        )

    elif action == "GetCampaignItems":
        items = utils.get_campaign_items(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(items, request)
        serializer = serializers.WholesalerCampaignItemListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    # =================================================================
    # Audience
    # =================================================================

    elif action == "AddCampaignAudience":
        errors, audience = utils.add_campaign_audience(request.data, request.user)
        if audience:
            serializer = serializers.WholesalerCampaignAudienceListSerializer(
                audience, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Audience added successfully",
                serializer.data, "campaign_audience",
            )
        return custom_errors_response(
            1, "Audience could not be added", errors,
        )

    elif action == "RemoveCampaignAudience":
        errors, audience = utils.remove_campaign_audience(request.data, request.user)
        if audience:
            return custom_success_message(
                0, "Audience removed successfully", {}, "campaign_audience",
            )
        return custom_errors_response(
            1, "Audience could not be removed", errors,
        )

    elif action == "GetCampaignAudience":
        audience = utils.get_campaign_audience(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(audience, request)
        serializer = serializers.WholesalerCampaignAudienceListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    # =================================================================
    # Retailer-facing
    # =================================================================

    elif action == "GetMyCampaigns":
        campaigns = utils.get_my_campaigns(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(campaigns, request)
        serializer = serializers.WholesalerCampaignListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "ProjectCampaign":
        errors, projections = utils.project_campaign(request.data, request.user)
        if projections is not None:
            return custom_success_message(
                0, "Projection computed successfully",
                projections, "projections",
            )
        return custom_errors_response(
            1, "Projection could not be computed", errors,
        )

    elif action == "OptInCampaign":
        errors, result = utils.opt_in_campaign(request.data, request.user)
        if result:
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
        return custom_errors_response(
            1, "Campaign could not be accepted", errors,
        )

    elif action == "OptOutCampaign":
        errors, audience = utils.opt_out_campaign(request.data, request.user)
        if audience:
            serializer = serializers.WholesalerCampaignAudienceListSerializer(
                audience, many=False, context={"request": request},
            )
            return custom_success_message(
                0, "Opted out successfully",
                serializer.data, "campaign_audience",
            )
        return custom_errors_response(
            1, "Could not opt out", errors,
        )

    else:
        raise exceptions.ValidationError(f"Action {action} is unknown")
    

# wholesalers/views.py

from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination

from core.responses import custom_success_message, custom_errors_response
from retailers.retail_permissions import EntitySubscriptionPermission

from wholesalers import utils
from wholesalers import serializers


@api_view(["POST"])
@permission_classes([EntitySubscriptionPermission, permissions.IsAuthenticated])
def receiptReturnsAPIView(request):
    """
    Single-entry command endpoint for wholesaler receipt returns.

    Route:  POST /api/v1/wholesalers/receipt-returns
    Body:   { "action": "<ActionName>", ...payload }

    Supported actions and their payloads:

    // ----------------------------------------------------------------
    // 1. InitiateReturn — retailer sends stock back to a wholesaler.
    //    Creates the StockAdjustment and the WholesalerReceiptReturns
    //    atomically.
    // ----------------------------------------------------------------
    {
        "action": "InitiateReturn",
        "retailer_receipt": "8f14e45f-ea0f-4f2a-b3c1-7d3c5a9b6c10",
        "quantity": 25,
        "reason": "NEAR_EXPIRY",
        "justification": "Batch expiring in 40 days, returning to wholesaler",
        "return_type": "REFUND",
        "unit_price_refunded": "45.00",
        "restocking_fee_percent": "5.00"
    }
    // Required: retailer_receipt, quantity, reason, justification
    // Optional: return_type, unit_price_refunded, restocking_fee_percent
    // reason choices: EXPIRED | NEAR_EXPIRY | DAMAGED | WRONG_ITEM |
    //                 SHORT_DATED | QUALITY | OVER_ORDERED | RECALL | OTHER
    // return_type choices: REFUND | EXCHANGE | REPLACEMENT

    // ----------------------------------------------------------------
    // 2. CreateReturn — wholesaler records a return handled offline.
    // ----------------------------------------------------------------
    {
        "action": "CreateReturn",
        "wholesaler_entity": "3e21a7b8-9c4d-4e5f-8a1b-2c6d9e7f3a4b",
        "retailer_entity": "8f14e45f-ea0f-4f2a-b3c1-7d3c5a9b6c10",
        "retailer_receipt": "5a6b7c8d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
        "wholesaler_receipt": "9d8c7b6a-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
        "product": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
        "quantity": 12,
        "reason": "QUALITY",
        "justification": "Client reported discoloration on 3 units",
        "return_type": "EXCHANGE",
        "unit_price_paid": "120.00",
        "unit_price_refunded": "120.00",
        "restocking_fee_percent": "0.00"
    }
    // Required: wholesaler_entity, retailer_entity, product,
    //           quantity, reason, justification

    // ----------------------------------------------------------------
    // 3. ListReturns — list returns scoped to caller's entity.
    // ----------------------------------------------------------------
    {
        "action": "ListReturns",
        "status": "PENDING_CONFIRMATION",
        "reason": "NEAR_EXPIRY",
        "return_type": "REFUND",
        "confirmation_outcome": "PENDING",
        "wholesaler_entity": "3e21a7b8-9c4d-4e5f-8a1b-2c6d9e7f3a4b",
        "retailer_entity": "8f14e45f-ea0f-4f2a-b3c1-7d3c5a9b6c10",
        "search": "paracetamol"
    }
    // All filters optional. Pagination via DRF PageNumberPagination.

    // Minimal version:
    {
        "action": "ListReturns"
    }

    // ----------------------------------------------------------------
    // 4. GetReturnDetails — retrieve one return by ID.
    // ----------------------------------------------------------------
    {
        "action": "GetReturnDetails",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
    }
    // Required: return_id

    // ----------------------------------------------------------------
    // 5. UpdateReturn — update a PENDING_CONFIRMATION return.
    //    Whitelisted fields: justification, reference_number,
    //                        return_type, unit_price_refunded,
    //                        restocking_fee_percent
    // ----------------------------------------------------------------
    {
        "action": "UpdateReturn",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "justification": "Updated: batch number confirmed as B-2024-118",
        "reference_number": "RMA-2026-0091",
        "return_type": "EXCHANGE",
        "unit_price_refunded": "118.50",
        "restocking_fee_percent": "2.50"
    }
    // Required: return_id
    // Optional: any whitelisted field

    // ----------------------------------------------------------------
    // 6. DeleteReturn — delete a PENDING_CONFIRMATION return.
    // ----------------------------------------------------------------
    {
        "action": "DeleteReturn",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
    }
    // Required: return_id

    // ----------------------------------------------------------------
    // 7a. ConfirmReturn — full take-back into inventory.
    // ----------------------------------------------------------------
    {
        "action": "ConfirmReturn",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "outcome": "TAKE_BACK",
        "notes": "Goods received in good condition"
    }
    // Required: return_id, outcome
    // outcome choices: TAKE_BACK | WRITE_OFF | PARTIAL_TAKE_BACK

    // ----------------------------------------------------------------
    // 7b. ConfirmReturn — full write-off (cast).
    // ----------------------------------------------------------------
    {
        "action": "ConfirmReturn",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "outcome": "WRITE_OFF",
        "notes": "All units expired on arrival, discarded"
    }

    // ----------------------------------------------------------------
    // 7c. ConfirmReturn — partial take-back.
    //     confirmed_quantity + written_off_quantity MUST equal
    //     the return's total quantity.
    // ----------------------------------------------------------------
    {
        "action": "ConfirmReturn",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "outcome": "PARTIAL_TAKE_BACK",
        "confirmed_quantity": 8,
        "written_off_quantity": 2,
        "notes": "8 units sellable, 2 damaged in transit"
    }

    // ----------------------------------------------------------------
    // 8. RejectReturn — wholesaler rejects the return.
    // ----------------------------------------------------------------
    {
        "action": "RejectReturn",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "reason": "Return not authorized — no RMA was issued"
    }
    // Required: return_id
    // Optional: reason

    // ----------------------------------------------------------------
    // 9a. SettleReturn — original refund terms.
    // ----------------------------------------------------------------
    {
        "action": "SettleReturn",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "notes": "Refund issued per original agreement"
    }

    // ----------------------------------------------------------------
    // 9b. SettleReturn — override refund values at settle time.
    // ----------------------------------------------------------------
    {
        "action": "SettleReturn",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "unit_price_refunded": "110.00",
        "restocking_fee_percent": "10.00",
        "notes": "Agreed to deduct 10% restocking fee after inspection"
    }
    // Required: return_id
    // Optional: unit_price_refunded, restocking_fee_percent, notes

    // ----------------------------------------------------------------
    // 10. CancelReturn — cancel pre-confirmation (either party).
    // ----------------------------------------------------------------
    {
        "action": "CancelReturn",
        "return_id": "c9a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "reason": "Return no longer needed — goods found in stock"
    }
    // Required: return_id
    // Optional: reason

    // ----------------------------------------------------------------
    // 11. GetStaleReturns — returns stuck in PENDING_CONFIRMATION.
    // ----------------------------------------------------------------
    {
        "action": "GetStaleReturns",
        "days": 14
    }
    // Optional: days (default 7)

    // ----------------------------------------------------------------
    // 12. GetReturnMismatches — quantity drift between paired records.
    // ----------------------------------------------------------------
    {
        "action": "GetReturnMismatches"
    }
    """
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    # =================================================================
    # Lifecycle
    # =================================================================

    # -----------------------------------------------------------------
    # InitiateReturn
    # Payload: {
    #     "action": "InitiateReturn",
    #     "retailer_receipt": "<uuid>",
    #     "quantity": <int>,
    #     "reason": "<enum>",
    #     "justification": "<string>",
    #     "return_type": "REFUND" | "EXCHANGE" | "REPLACEMENT",
    #     "unit_price_refunded": "<decimal>",
    #     "restocking_fee_percent": "<decimal>"
    # }
    # -----------------------------------------------------------------
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

    # -----------------------------------------------------------------
    # CreateReturn
    # Payload: {
    #     "action": "CreateReturn",
    #     "wholesaler_entity": "<uuid>",
    #     "retailer_entity": "<uuid>",
    #     "product": "<uuid>",
    #     "quantity": <int>,
    #     "reason": "<enum>",
    #     "justification": "<string>",
    #     "retailer_receipt": "<uuid>",
    #     "wholesaler_receipt": "<uuid>",
    #     "return_type": "REFUND" | "EXCHANGE" | "REPLACEMENT",
    #     "unit_price_paid": "<decimal>",
    #     "unit_price_refunded": "<decimal>",
    #     "restocking_fee_percent": "<decimal>"
    # }
    # -----------------------------------------------------------------
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

    # -----------------------------------------------------------------
    # ListReturns
    # Payload: {
    #     "action": "ListReturns",
    #     "status": "<enum>",
    #     "reason": "<enum>",
    #     "return_type": "<enum>",
    #     "confirmation_outcome": "<enum>",
    #     "wholesaler_entity": "<uuid>",
    #     "retailer_entity": "<uuid>",
    #     "search": "<string>"
    # }
    # All filters optional. Response is paginated.
    # -----------------------------------------------------------------
    elif action == "ListReturns":
        qs = utils.get_entity_returns(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializers.WholesalerReceiptReturnListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    # -----------------------------------------------------------------
    # GetReturnDetails
    # Payload: {
    #     "action": "GetReturnDetails",
    #     "return_id": "<uuid>"
    # }
    # -----------------------------------------------------------------
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

    # -----------------------------------------------------------------
    # UpdateReturn
    # Payload: {
    #     "action": "UpdateReturn",
    #     "return_id": "<uuid>",
    #     "justification": "<string>",
    #     "reference_number": "<string>",
    #     "return_type": "REFUND" | "EXCHANGE" | "REPLACEMENT",
    #     "unit_price_refunded": "<decimal>",
    #     "restocking_fee_percent": "<decimal>"
    # }
    # Only whitelisted fields are accepted.
    # -----------------------------------------------------------------
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

    # -----------------------------------------------------------------
    # DeleteReturn
    # Payload: {
    #     "action": "DeleteReturn",
    #     "return_id": "<uuid>"
    # }
    # -----------------------------------------------------------------
    elif action == "DeleteReturn":
        errors, ret = utils.delete_return(request.data, request.user)
        if ret:
            return custom_success_message(
                0, "Return deleted successfully", {}, "return",
            )
        return custom_errors_response(1, "Return could not be deleted", errors)

    # =================================================================
    # State transitions
    # =================================================================

    # -----------------------------------------------------------------
    # ConfirmReturn
    # Payload (full take-back): {
    #     "action": "ConfirmReturn",
    #     "return_id": "<uuid>",
    #     "outcome": "TAKE_BACK",
    #     "notes": "<string>"
    # }
    #
    # Payload (full write-off): {
    #     "action": "ConfirmReturn",
    #     "return_id": "<uuid>",
    #     "outcome": "WRITE_OFF",
    #     "notes": "<string>"
    # }
    #
    # Payload (partial): {
    #     "action": "ConfirmReturn",
    #     "return_id": "<uuid>",
    #     "outcome": "PARTIAL_TAKE_BACK",
    #     "confirmed_quantity": <int>,
    #     "written_off_quantity": <int>,
    #     "notes": "<string>"
    # }
    # confirmed + written_off MUST equal the return's quantity.
    # -----------------------------------------------------------------
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

    # -----------------------------------------------------------------
    # RejectReturn
    # Payload: {
    #     "action": "RejectReturn",
    #     "return_id": "<uuid>",
    #     "reason": "<string>"
    # }
    # -----------------------------------------------------------------
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

    # -----------------------------------------------------------------
    # SettleReturn
    # Payload: {
    #     "action": "SettleReturn",
    #     "return_id": "<uuid>",
    #     "unit_price_refunded": "<decimal>",
    #     "restocking_fee_percent": "<decimal>",
    #     "notes": "<string>"
    # }
    # Only return_id required; the rest are optional overrides.
    # -----------------------------------------------------------------
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

    # -----------------------------------------------------------------
    # CancelReturn
    # Payload: {
    #     "action": "CancelReturn",
    #     "return_id": "<uuid>",
    #     "reason": "<string>"
    # }
    # -----------------------------------------------------------------
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

    # =================================================================
    # Reconciliation
    # =================================================================

    # -----------------------------------------------------------------
    # GetStaleReturns
    # Payload: {
    #     "action": "GetStaleReturns",
    #     "days": <int>  // optional, default 7
    # }
    # Returns stuck in PENDING_CONFIRMATION beyond N days.
    # -----------------------------------------------------------------
    elif action == "GetStaleReturns":
        qs = utils.get_stale_returns(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializers.WholesalerReceiptReturnListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    # -----------------------------------------------------------------
    # GetReturnMismatches
    # Payload: {
    #     "action": "GetReturnMismatches"
    # }
    # Returns where the paired StockAdjustment quantity doesn't match.
    # -----------------------------------------------------------------
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
    

# wholesalers/views.py — product requests dispatcher

from django.utils import timezone
from django.db.models import Q, Prefetch
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination

from core.responses import custom_success_message, custom_errors_response
from retailers.retail_permissions import EntitySubscriptionPermission

# from retailers.models import (
#     RetailerProductRequest,
#     RetailerProductRequestItem,
#     RetailerProductRequestOffer,
#     RetailerProductRequestResponse,
# )
from retailers.serializers import (
    RetailerProductRequestSerializer,
    RetailerProductRequestListSerializer,
)

from .models import WholesalerPriceDiscounts, WholesalerQuantityDiscounts
from .services.request_response import wholesaler_respond_to_request


# =====================================================================
# Wholesaler product requests — unified dispatcher
# =====================================================================

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

    # =================================================================
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

    # =================================================================
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

    # =================================================================
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

        # Validate each accepted line
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

            # Validate the item belongs to the request
            if not req.items.filter(id=item_id).exists():
                return custom_errors_response(
                    1, "Line not found on this request",
                    {"accepted_lines": f"Item {item_id} does not belong to this request."},
                )

        # Validate rejections
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

        # Overlap check
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

        # Notify the retailer
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

    # =================================================================
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
            WholesalerPriceDiscounts.objects
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
            WholesalerQuantityDiscounts.objects
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

    # =================================================================
    else:
        raise exceptions.ValidationError(f"Action {action} is unknown")


# wholesalers/views.py — order commit dispatcher

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

    # =================================================================
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

    # =================================================================
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

        # Notify the retailer
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