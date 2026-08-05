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
