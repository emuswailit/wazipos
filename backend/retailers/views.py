from rest_framework.pagination import PageNumberPagination
from rest_framework import generics, permissions, response, status, exceptions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.gis.geos import fromstr
from core.responses import custom_error_response, custom_json_response, custom_success_message,custom_errors_response
from . import retail_permissions
from . import serializers
from . import models
from authentication.validators import authentication_models_validators
from rest_framework.response import Response
from authentication.serializers import CategoriesSerializer
from authentication.validators.authentication_models_validators import validate_entity
from products.models import Products,Entities
from wholesalers.serializers import RetailerOrdersSerializer,RetailerOrderItemsSerializer
from retailers.serializers import RetailerReceiptsSerializer
from utils.logging import create_log
import datetime


from core import app_permissions

# RetailVariations Views

from rest_framework.validators import UniqueTogetherValidator
from rest_framework import serializers
from django.db import IntegrityError
from django.shortcuts import render, get_object_or_404
from rest_framework import generics, exceptions, permissions, status
from core.views import EntitySafeViewMixin
from . import serializers, models
from .utils import (
    retailer_utils,
    retailers_shipping_rates_utils,
    wholesaler_invoice_utils,
    retail_prescriptions_utils
)
from . import customer_order_responses

# Create your views here.
@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAdminUser,
    ]
)
def retailerReceiptsSuperAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "UpdateInventoryBarCodes":
        inventories=[]
        products = Products.objects.all()
        for product in products:
            if product.bar_code:
                if models.RetailerReceipts.objects.filter(product=product, bar_code="").exists():
                    inventories = models.RetailerReceipts.objects.filter(product=product, bar_code="").all()
                    for inventory in inventories:
                        inventory.bar_code=product.bar_code
                        inventory.save()

        return custom_json_response(0, "Update done successfully","updated_items",len(inventories))

                
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')



@api_view(["POST"])
@permission_classes(
    [
        retail_permissions.RetailEmployeePermission,
        retail_permissions.EntitySubscriptionPermission
    ]
)
def retailerReceiptsAdminAPIView(request):
    # TODO: code reference: implementing apiview with only post method: single url for all requests supplying only an action parameter

    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateRetailerReceipt":
        retailer_utils.validate_retailer_receipt_data(request.data, request.user)

        errors,retailer_receipt = retailer_utils.create_retailer_receipt_directly(
            request.data, request.user
        )
        if retailer_receipt:
            serializer = serializers.RetailerReceiptsSerializer(
                retailer_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retailer inventory receipt created successfully",
                serializer.data,
                "retailer_receipt",
            )

        else:
            return custom_errors_response(
                1, "Retailer inventory receipt could not be created",errors
            )
    elif request.data["action"] == "GetRetailerReceipts":
        """Get retailer orders list for both wholesaler and retailer admins"""
 
        retailer_receipts = retailer_utils.get_retailer_receipts(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetProductMovement":
        """Get product movement"""
 
        retailer_receipts = retailer_utils.get_product_movement(request.data,request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.ProductMovementSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetailerReceiptsByCategory":
        """Get retailer orders list for both wholesaler and retailer admins"""

        retailer_receipts = retailer_utils.get_retailer_receipts_by_catgory(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateRetailerReceipt":
        # utils.validate_retailer_receipt_update_data(request.data)

        retailer_receipt = retailer_utils.update_retailer_receipt_directly(
            request.data, request.user
        )
        if retailer_receipt:
            serializer = serializers.RetailerReceiptsSerializer(
                retailer_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retailer inventory receipt updated successfully",
                serializer.data,
                "retailer_receipt",
            )

        else:
            return custom_errors_response(
                1, "Retailer inventory receipt could not be updated",errors
            )
    elif request.data["action"] == "CreatePurchasesReturn":

        errors, purchases_return = retailer_utils.create_purchases_return(
            request.data, request.user
        )
        create_log("info",purchases_return)
       

        if purchases_return:
            serializer = serializers.PurchasesReturnsSerializer(
                purchases_return, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Purchases return created successfully",
                serializer.data,
                "purchases_return",
            )

        else:
            if len(errors)>0:
                return custom_errors_response(1,"Purchases return not created",errors)
            
    elif request.data["action"] == "GetPurchasesReturns":
        """Get purchases returns"""

        purchases_returns = models.PurchasesReturns.objects.filter(entity=request.user.entity)
       
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(purchases_returns, request)
        serializer = serializers.PurchasesReturnsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateSalesReturn":

        errors, sales_return = retailer_utils.create_sales_return(
            request.data, request.user
        )
       

        if sales_return:
            serializer = serializers.SalesReturnsSerializer(
                sales_return, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sales return created successfully",
                serializer.data,
                "sales_return",
            )

        else:
            if len(errors)>0:
                return custom_errors_response(1,"Sales return not created",errors)
            
    elif request.data["action"] == "GetSalesReturns":
        """Get sales returns"""

        sales_returns = models.SalesReturns.objects.filter(entity=request.user.entity)
       
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sales_returns, request)
        serializer = serializers.SalesReturnsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateStockAdjustment":

        errors, stock_adjustment = retailer_utils.create_stock_adjustment(
            request.data, request.user
        )
       

        if stock_adjustment:
            serializer = serializers.StockAdjustmentsSerializer(
                stock_adjustment, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Stock adjustment created successfully",
                serializer.data,
                "stock_adjustment",
            )

        else:
            if len(errors)>0:
                return custom_errors_response(1,"Stock adjusttment not created",errors)
            
    elif request.data["action"] == "GetStockAdjustments":
        """Get sales returns"""

        stock_adjustments = models.StockAdjustments.objects.filter(entity=request.user.entity)
       
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(stock_adjustments, request)
        serializer = serializers.StockAdjustmentsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
       
    ]
)
def clientOrdersAPIView(request):
   
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetRetailerReceiptsForEntity":
        """Get retailer receipts for an entity"""

        final = {}

        retailer_receipts = retailer_utils.get_retailer_receipts_for_entity(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "CreateCustomerOrderByCustomer":
        """Customer remotely creates order at retailer shop"""

        errors, customer_order = retailer_utils.create_customer_order(
            request.data, request.user
        )

        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Customer order created successfully",
                serializer.data,
                "customer_order",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Customer order not created",errors)
    elif request.data["action"] == "RetrieveOwnOrders":
        """Get entity orders"""
        own_orders = retailer_utils.get_own_orders(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(own_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)    
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
          retail_permissions.EntitySubscriptionPermission
    ]
)
def retailerReceiptsJointAPIView(request):
    def get_category(retailer_receipt):
        return retailer_receipt.product.category

    def get_receipts_for_category(retailer_receipts_list, category):
        retailer_receipts = retailer_receipts_list.filter(product__category=category)
        print("retailer_receipts hre", retailer_receipts)
        return retailer_receipts

    # TODO: code reference: implementing apiview with only post method: single url for all requests supplying only an action parameter

    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetRetailerReceipts":
        """Get retailer orders list for both wholesaler and retailer admins"""

        retailer_receipts = retailer_utils.get_retailer_receipts(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    if request.data["action"] == "RetailerReceiptsByCategory":
        """Get retailer orders list for both wholesaler and retailer admins"""

        retailer_receipts = retailer_utils.get_retailer_receipts_by_catgory(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetRetailerReceiptsForEntity":
        """Get retailer receipts for an entity"""

        final = {}

        retailer_receipts = retailer_utils.get_retailer_receipts_for_entity(
            request.data, request.user
        )
        # categories = list(set(map(get_category, retailer_receipts)))
        # print('categories', categories)
        # for receipt in retailer_receipts:
        #     for category in categories:
        #         final[category.title] = serializers.RetailerReceiptsSerializer(get_receipts_for_category(
        #             retailer_receipts, category), many=True, context={"request": request}).data
        # return Response(data={'data': final}, status=status.HTTP_200_OK)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetRetailerReceiptDetails":
        # check_user_is_wholesale_admin(request.data, request.user)

        retailer_receipt = retailer_utils.get_retailer_receipt_details(
            request.data, request.user
        )
        if retailer_receipt:
            serializer = serializers.RetailerReceiptsSerializer(
                retailer_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Receipt sucessfuly retrieved", serializer.data, "retailer_receipt"
            )

        else:
            return custom_error_response(1, "Order not retrieved")
    elif request.data["action"] == "CheckItemStock":
        # Check inventory item availability
        retailer_receipt=None
        if "retailer_receipt_id" in request.data and not request.data["retailer_receipt_id"]=="":
            retailer_receipt_id= request.data["retailer_receipt_id"]
            if models.RetailerReceipts.objects.filter(id=retailer_receipt_id).exists():
                retailer_receipt=models.RetailerReceipts.objects.filter(id=retailer_receipt_id).first()
                return custom_json_response(0,"Product succesfully retrieved","retailer_receipt",{
                    "id":retailer_receipt.id,
                    "title":retailer_receipt.product.title,
                    "pack_quantity": int(retailer_receipt.pack_quantity),
                    "current_unit_quantity":int(retailer_receipt.current_unit_quantity),
                    "unit_selling_price":float(retailer_receipt.unit_selling_price)
                })

            else:
                 return custom_error_response(1, "No product for provided ID")
    elif request.data["action"] == "CheckStockStatusBatch":
        # Check inventory item availability
        retailer_receipt=None
        retailer_receipts_list=[]
        if "retailer_receipt_items" in request.data and not request.data["retailer_receipt_items"]=="":
            items= request.data["retailer_receipt_items"]
            for item in items:
                retailer_receipt_json={}
                if models.RetailerReceipts.objects.filter(id=item).exists():
                    retailer_receipt=models.RetailerReceipts.objects.filter(id=item).first()
                    retailer_receipt_json={
                        "id":retailer_receipt.id,
                        "title":retailer_receipt.product.title,
                        "pack_quantity": int(retailer_receipt.pack_quantity),
                        "unit_quantity":int(retailer_receipt.unit_quantity),
                        "loose_units_quantity":int(retailer_receipt.unit_quantity -(retailer_receipt.pack_quantity * retailer_receipt.product.units_per_pack)),
                        "pack_selling_price": float(retailer_receipt.pack_selling_price),
                        "unit_selling_price":float(retailer_receipt.unit_selling_price)
                    }
                    retailer_receipts_list.append(retailer_receipt_json)
                else:
                    pass
        if len(retailer_receipts_list)>0:
            return custom_json_response(0,"Stock status succesfully retrieved","retailer_receipts",retailer_receipts_list)

        else:
            return custom_error_response(1, "Stock status not retrieved")
    elif request.data["action"] == "SearchRetailerReceipts":
        """Get retailer orders list for both wholesaler and retailer admins"""

        retailer_receipts = retailer_utils.search_receipts(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchRetailerReceiptsByCustomer":
        """Search for retailer receipts accross vendors by customer"""

        retailer_receipts = retailer_utils.search_receipts_by_customer(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetRetailerAllowedCategories":
        """Get retailer allowed categories"""
        allowed_categories = []
        entity = None
        if "entity" in request.data and not request.data["entity"] == "":
            entity_id = request.data["entity"]
            print(entity_id)
            entity = validate_entity(entity_id)
            print(entity)
            allowed_categories = entity.categories.all()
            serializer = CategoriesSerializer(
                allowed_categories, many=True, context={"request": request}
            )
            return customer_order_responses.custom_success_message(
                0, "Categories retrieved successfully", serializer.data, "categories"
            )
        else:
            raise exceptions.ValidationError("gxv ")

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([  retail_permissions.EntitySubscriptionPermission,
                     retail_permissions.RetailEmployeePermission])
def customerOrdersStaffAPIView(request):
    customer_orders = []
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateRetailerIndent":
     
        errors, retailer_indent = retailer_utils.create_retailer_indent(
            request.data, request.user
        )
        if retailer_indent:
            serializer = serializers.RetailerIndentSerializer(
                retailer_indent, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retailer indent created successfully",
                serializer.data,
                "retailer_indent",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Customer order not created",errors)
    elif request.data["action"] == "CreateEstimateIndent":

        errors, retailer_indent = retailer_utils.create_estimate_indent(
            request.data, request.user
        )
        if retailer_indent:
            serializer = serializers.RetailerIndentSerializer(
                retailer_indent, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retailer indent created successfully",
                serializer.data,
                "retailer_indent",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Customer order not created",errors)

    elif request.data["action"] == "CloseRetailerIndent":
     
        errors, retailer_indent = retailer_utils.close_retailer_indent(
            request.data, request.user
        )
        if retailer_indent:
            serializer = serializers.RetailerIndentSerializer(
                retailer_indent, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retailer indent closed successfully",
                serializer.data,
                "retailer_indent",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Retailerindent not closed",errors)
    # elif request.data["action"] == "RetrieveRetailerIndentItems":
    #     """Retrieve retailer indents"""

    #     retailer_indents = retailer_utils.retrieve_retailer_indent_items( request.data)
    #     paginator = PageNumberPagination()
    #     page = paginator.paginate_queryset(retailer_indents, request)
    #     serializer = serializers.RetailerIndentItemsSerializer(
    #         page, many=True, context={"request": request, "user": request.user}
    #     )
    #     return paginator.get_paginated_response(serializer.data) 

    elif request.data["action"] == "RetrieveRetailerIndentItems":
        """Retrieve retailer indents"""

        retailer_indent_items = retailer_utils.retrieve_retailer_indent_items( request.data)

        if retailer_indent_items:
            return custom_json_response(0,"Items succesfully retrieved","data", retailer_indent_items)
        else:    
            return customer_order_responses.custom_error_response(
                    1, "Estimtes not retrieved"
                )
        
    elif request.data["action"] == "RetrieveRetailerIndents":
        """Retrieve retailer indents"""

        retailer_indents = retailer_utils.retrieve_retailer_indents( request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_indents, request)
        serializer = serializers.RetailerIndentSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "CreateRetailerIndentItem":
        errors, retailer_indent_item = retailer_utils.create_retailer_indent_item(
            request.data, request.user
        )
        if retailer_indent_item:
            serializer = serializers.RetailerIndentItemsSerializer(
                retailer_indent_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retailer indent item created successfully",
                serializer.data,
                "retailer_indent_item",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Indent item not created",errors)
    elif request.data["action"] == "RemoveRetailerIndentItem":
        errors, retailer_indent_items = retailer_utils.remove_retailer_indent_item(
            request.data, request.user
        )
        if retailer_indent_items:
            serializer = serializers.RetailerIndentItemsSerializer(
                retailer_indent_items, many=True, context={"request": request}
            )
            return custom_success_message(
                0,
                "Indent item deleted succesfully",
                serializer.data,
                "indent_items",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Indent item not deleted",errors)
    elif request.data["action"] == "CreateOutOfStockItem":
    
        errors, out_of_stock_item = retailer_utils.create_out_of_stock_item(
            request.data, request.user
        )
        if out_of_stock_item:
            serializer = serializers.OutOfStocksSerializer(
                out_of_stock_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Out of stock item created successfully",
                serializer.data,
                "out_of_stock_item",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Out of stock item not created",errors)
    
    elif request.data["action"] == "RetrieveCurrentOpenIndent":
        """Retrieve currently open indent"""

        errors,open_indent = retailer_utils.retrieve_open_indent( request.user)

        if open_indent:
            serializer = serializers.RetailerIndentSerializer(
                open_indent, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Indent retrieved successfully",
                serializer.data,
                "indent",
            )

        if len(errors)>0:
            return custom_errors_response(1,"No open indent",errors)
        
    # elif request.data["action"] == "CloseIndent":
    
    #     errors, retailer_orders = retailer_utils.close_indent(
    #         request.data, request.user
    #     )
    #     if retailer_orders:
    #         serializer = RetailerOrdersSerializer(
    #             retailer_orders, many=True, context={"request": request}
    #         )
    #         return custom_success_message(
    #             0,
    #             "Indent closed  successfully",
    #             serializer.data,
    #             "retailer_orders",
    #         )

    #     if len(errors)>0:
    #         return custom_errors_response(1,"Retailer indent not closed",errors)
    elif request.data["action"] == "UpdateOutOfStockItem":
    
        errors, out_of_stock_item = retailer_utils.update_out_of_stock_item(
            request.data, request.user
        )
        if out_of_stock_item:
            serializer = serializers.OutOfStocksSerializer(
                out_of_stock_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Out of stock item updated successfully",
                serializer.data,
                "out_of_stock_item",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Out of stock item not updated",errors)
    elif request.data["action"] == "MakeRetailerOrderPayment":
    
        errors, retailer_order = retailer_utils.make_retailer_order_payment(
            request.data, request.user
        )
        if retailer_order:
            serializer =RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retailer order payment made successfully",
                serializer.data,
                "retailer_order",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Retailer order payment process failed",errors)
    elif request.data["action"] == "RetrieveOutOfStockItems":
        """Retrieve list of all out of stock items"""

        retailer_orders = retailer_utils.retrieve_out_of_stock_items( request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.OutOfStocksSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "RetrieveRetailerOrders":
        """Retrieve list of retailer orders"""

        retailer_orders = retailer_utils.retrieve_retailer_orders( request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer =RetailerOrdersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "GetRetailerOrderDetails":
        """Retrieve list of retailer orders"""

        retailer_order_items = retailer_utils.retrieve_retailer_order_items( request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_order_items, request)
        serializer =RetailerOrdersSerializer(
            page, many=False, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "CreateCustomerOrder":
        retailer_utils.validate_customer_order_data(request.data, request.user)

        errors, customer_order = retailer_utils.create_customer_order(
            request.data, request.user
        )
        create_log("info", f"Customer order created {customer_order}")

        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Customer order created successfully",
                serializer.data,
                "customer_order",
            )

        else:
            if len(errors)>0:
                return custom_errors_response(1,"Customer order not created",errors)
    elif request.data["action"] == "CreateExpressCustomerOrder":

        errors, customer_order = retailer_utils.create_express_customer_order_data(
            request.data, request.user
        )
       

        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Customer order created successfully",
                serializer.data,
                "customer_order",
            )

        else:
            if len(errors)>0:
                return custom_errors_response(1,"Customer order not created",errors)
    elif request.data["action"] == "UpdateCustomerOrder":
        # retailer_utils.validate_customer_order_data(request.data, request.user)

        errors, customer_order = retailer_utils.update_customer_order(
            request.data, request.user
        )

        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Customer order updated successfully",
                serializer.data,
                "customer_order",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Customer order not updated",errors)
    elif request.data["action"] == "RetrieveEmployeeOrders":
        """Get entity orders"""

        employee_orders = retailer_utils.get_employee_orders(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employee_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchCustomerOrders":
        """Search retailer orders """

        retailer_orders = retailer_utils.search_customer_orders(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveOwnOrders":
        """Get own orders orders"""

        employee_orders = retailer_utils.get_own_orders(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employee_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "ChangeOrderPaymentMethod":
        # utils.validate_order_payment_method_data(request.data)
        customer_order = retailer_utils.update_customer_order(
            request.data, request.user
        )
        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return customer_order_responses.custom_success_message(
                0,
                "Customer order updated successfully",
                serializer.data,
                "customer_order",
            )
        else:
            return customer_order_responses.custom_error_response(
                1, "Customer order could not be updated"
            )
    elif request.data["action"] == "CustomerOrderDetails":
        customer_order = None
        try:
            customer_order_id = request.data["customer_order"]
            if models.CustomerOrders.objects.filter(id=customer_order_id).exists():
                customer_order = models.CustomerOrders.objects.filter(
                    id=customer_order_id
                ).first()
                serializer = serializers.CustomerOrdersSerializer(
                    customer_order, many=False, context={"request": request}
                )
                return customer_order_responses.custom_success_message(
                    0,
                    "Customer order retrieved successfully",
                    serializer.data,
                    "customer_order",
                )
            else:
                return customer_order_responses.custom_error_response(
                    1, "Customer order could not be retrieved"
                )

        except KeyError:
            raise exceptions.ValidationError("Customer order ID are required")
    elif request.data["action"] == "GenerateOrderItemEstimates":
        order_estimates =  retailer_utils.generate_order_estimates(
            request.data, request.user, request
        )
      
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(order_estimates, request)
        serializer = serializers.OrderEstimateSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveProductWholesaleOffers":
        errors, offers =  retailer_utils.retrieve_product_wholesale_offers(
            request.data, request.user
        )
        if offers:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(offers, request)
            serializer = serializers.WholesalerReceiptsDisplaySerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
        else:    
            return custom_errors_response(
                    1, "Wholesale offers not retrieved",errors
                )
    
    
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([retail_permissions.RetailEmployeePermission,
                       retail_permissions.EntitySubscriptionPermission])
def retailerInvoicesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateWholesalerInvoice":
        invoice = wholesaler_invoice_utils.create_wholesaler_invoice(
            request.data, request.user
        )
        if invoice:
            serializer = serializers.WholesalerInvoicesSerializer(
                invoice, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Wholesaler invoice created successfully",
                serializer.data,
                "invoice",
            )

        else:
            return custom_error_response(1, "Wholesaler invoice could not be created")
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([retail_permissions.RetailAdminPermission,  
                     retail_permissions.EntitySubscriptionPermission])
def customerOrdersAdminAPIView(request):
    customer_orders = []
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "RetrieveEmployeeOrders":
        """Get entity orders"""

        employee_orders = retailer_utils.get_employee_orders(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employee_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveEntityOrders":
        """Get employee's orders"""
        customer_orders = retailer_utils.get_entity_orders(request.user, request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveCustomerOrderPayments":
        """Get customer orders"""

        customer_order_payments = retailer_utils.get_customer_order_payments(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_order_payments, request)
        serializer = serializers.CustomerOrderPaymentsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveCustomerOrderSettlements":
        """Get customer orders"""

        customer_order_settlements = retailer_utils.get_customer_order_settlements(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_order_settlements, request)
        serializer = serializers.CustomerOrderSettlementSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveCustomerOrders":
        """Get customer orders"""

        customer_orders = retailer_utils.get_customer_orders(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "GetBodabodaDeliveries":
        """Get customer orders"""

        bodaboda_deliveries = retailer_utils.get_bodaboda_deliveries(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(bodaboda_deliveries, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "RetrieveCustomerOrderItems":
        """Get customer order items"""

        customer_order_items = retailer_utils.get_customer_order_items(
            request.data, request.user
        )
        print("Items at", customer_order_items)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_order_items, request)
        serializer = serializers.CustomerOrderItemsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "CustomerOrderDetails":
        customer_order = None
        try:
            customer_order_id = request.data["customer_order"]
            if models.CustomerOrders.objects.filter(id=customer_order_id).exists():
                customer_order = models.CustomerOrders.objects.filter(
                    id=customer_order_id
                ).first()
                serializer = serializers.CustomerOrdersSerializer(
                    customer_order, many=False, context={"request": request}
                )
                return customer_order_responses.custom_success_message(
                    0,
                    "Customer order retrieved successfully",
                    serializer.data,
                    "customer_order",
                )
            else:
                return customer_order_responses.custom_error_response(
                    1, "Customer order could not be retrieved"
                )

        except KeyError:
            raise exceptions.ValidationError("Customer order ID are required")
    elif request.data["action"] == "AddShippingCostByDistance":
        errors = []
        entity_id = None
        entity = None
        distance_in_km_from = None
        distance_in_km_to = None
        shipping_cost = None

        if "entity" in request.data and not request.data["entity"] == "":
            entity_id = request.data["entity"]
            entity = validate_entity(entity_id)
        else:
            errors.append("Entity ID is required")
        if (
            "distance_in_km_from" in request.data
            and not request.data["distance_in_km_from"] == ""
        ):
            distance_in_km_from = request.data["distance_in_km_from"]
        else:
            errors.append("Minimum distance is required")
        if (
            "distance_in_km_to" in request.data
            and not request.data["distance_in_km_to"] == ""
        ):
            distance_in_km_to = request.data["distance_in_km_to"]
        else:
            errors.append("Maximum distance is required")
        if "shipping_cost" in request.data and not request.data["shipping_cost"] == "":
            shipping_cost = request.data["shipping_cost"]
        else:
            errors.append("Shipping cost is required")

        if len(errors) > 0:
            raise exceptions.ValidationError(errors)
        else:
            try:
                created = models.RetailersShippingRates.objects.create(
                    entity=entity,
                    distance_in_km_from=distance_in_km_from,
                    distance_in_km_to=distance_in_km_to,
                    shipping_cost=shipping_cost,
                    owner=request.user,
                )
                if created:
                    serializer = serializers.RetailerShippingRatesSerializer(
                        created, many=False, context={"request": request}
                    )
                    return customer_order_responses.custom_success_message(
                        0,
                        "Shipping cost created successfully",
                        serializer.data,
                        "shipping_cost",
                    )
                else:
                    return customer_order_responses.custom_error_response(
                        1, "Shipping cost could not be retrieved"
                    )

            except Exception as e:
                raise exceptions.ValidationError(f"Could not create shipping cost: {e}")

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([  retail_permissions.EntitySubscriptionPermission,
                     permissions.IsAuthenticated])
def customerOrdersAPIView(request):
    customer_orders = []
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetOrderShippngCostByDistance":
        """Get customer order shipping by distance"""
        entity_id = None
        entity = None

        if "entity" in request.data and not request.data["entity"] == "":
            entity_id = request.data["entity"]
            if entity_id:
                entity = validate_entity(entity_id)
        else:
            raise exceptions.ValidationError("Entity ID is required")

        shipping_cost = 0.00
        if "distance" in request.data and not request.data["distance"] == "":
            distance = float(request.data["distance"])
            print(distance)
            print(type(distance))
            if models.RetailersShippingRates.objects.filter(
                distance_in_km_from__lte=distance,
                distance_in_km_to__gte=distance,
                entity=entity,
            ).exists():
                shipping_cost_obj = models.RetailersShippingRates.objects.filter(
                    distance_in_km_from__lte=distance,
                    distance_in_km_to__gte=distance,
                    entity=entity,
                ).first()
                shipping_cost = shipping_cost_obj.shipping_cost
            else:
                raise exceptions.ValidationError(
                    "No shipping cost found withis this range"
                )
        if shipping_cost:
            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Shipping cost retrieved",
                    "shipping_cost": shipping_cost,
                },
                status=status.HTTP_200_OK,
            )
        else:
            return customer_order_responses.custom_error_response(
                1, "Shipping cost could not be retrieved"
            )

    elif request.data["action"] == "MakeCustomerOrderPayment":
        """ Customer order payment"""
    
        errors, retailer_order = retailer_utils.make_customer_order_payment(
            request.data, request.user
        )
        if retailer_order:
            serializer =serializers.CustomerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Customer order payment made successfully",
                serializer.data,
                "customer_order",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Customer order payment process failed",errors)
    elif request.data["action"] == "RetrieveOwnOrders":
        """Get entity orders"""
        own_orders = retailer_utils.get_own_orders(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(own_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([  retail_permissions.EntitySubscriptionPermission, 
                     permissions.IsAuthenticated])
def remoteRetailPrescriptionsAPIView(request):

    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "UpdateRetailPrescription":
        errors, prescription = retail_prescriptions_utils.update_retail_prescription(
            request.data, request.user
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retail prescription created successfully",
                serializer.data,
                "prescription",
            )
        else:
            return custom_errors_response(1,"Retail prescription not created",errors)
    elif request.data["action"] == "GetRetailPrescriptionDetails":
        errors, prescription = retail_prescriptions_utils.get_retail_prescription_details(
            request.data, request.user
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retail prescription details retrieved successfully",
                serializer.data,
                "prescription",
            )
        else:
            return custom_errors_response(1,"Retail prescription not retrieved",errors)
    elif request.data["action"] == "MakePrescriptionOrderPayment":
        errors, customer_order = retail_prescriptions_utils.make_prescription_order_payment(
            request.data, request.user
        )
        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Prescription order updated successfully",
                serializer.data,
                "customer_order",
            )
        else:
            return custom_errors_response(1,"Prescriptiom order not updated",errors)
        
    if request.data["action"] == "UpdateRetailPrescriptionItem":
        errors, prescription_item = retail_prescriptions_utils.update_retail_prescription_item(
            request.data, request.user
        )
        if prescription_item:
            serializer = serializers.PrescriptionItemsSerializer(
                prescription_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retail prescription item updated successfully",
                serializer.data,
                "prescription_item",
            )
        else:
            return custom_errors_response(1,"Retail prescription item not updated",errors)  
    elif request.data["action"] == "RemoveRetailPrescriptionItem":
        errors, prescription = retail_prescriptions_utils.remove_retail_prescription_item(
            request.data, request.user
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retail prescription updated successfully",
                serializer.data,
                "prescription",
            )
        else:
            return custom_errors_response(1,"Retail prescription not updated",errors)
    elif request.data["action"] == "CreateOrUpdatePrescriptionOrderItem":
        errors, prescription = retail_prescriptions_utils.create_or_update_prescription_order_item(
            request.data, request.user
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Prescription order item created successfully",
                serializer.data,
                "prescription",
            )
        else:
            return custom_errors_response(1,"Retail prescription order not updated",errors)
    
    elif request.data["action"] == "RetrieveEntityRetailPrescriptions":
        """Retrieve entity retail prescriptions"""

        customer_orders = retail_prescriptions_utils.get_entity_retail_prescriptions(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_orders, request)
        serializer = serializers.RetailPrescriptionsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "RetrieveUserRetailPrescriptions":
        """Retrieve user retail prescriptions"""

        customer_orders = retail_prescriptions_utils.get_user_retail_prescriptions(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_orders, request)
        serializer = serializers.RetailPrescriptionsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "GetRelatedEntityInventoryForProduct":
        """Retrieve user retail prescriptions"""

        retailer_receipts = retail_prescriptions_utils.get_related_inventory_for_product(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = RetailerReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data) 
    
    elif request.data["action"] == "CreateRetailPrescriptionItem":
        errors, prescription = retail_prescriptions_utils.create_retail_prescription_item(
            request.data, request.user
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retail prescription item created successfully",
                serializer.data,
                "prescription",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Retail prescription item not created",errors)     
    
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
         retail_permissions.EntitySubscriptionPermission,
           retail_permissions.RetailAdminPermission,
    ]
)
def retailersShippinRatesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateEntityShippingRate":
        retailers_shipping_rates_utils.validate_retailers_shipping_rates_data(
            request.data, request.user
        )

        shipping_rate = retailers_shipping_rates_utils.create_retailer_shipping_rate(
            request.data, request.user
        )
        if shipping_rate:
            serializer = serializers.RetailerShippingRatesSerializer(
                shipping_rate, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Retailer shipping rate created successfully",
                serializer.data,
                "retailer_receipt",
            )

        else:
            return custom_error_response(
                1, "Retailer shipping rate could not be created"
            )
    elif request.data["action"] == "GetConstituencyShippingRates":
        """Get entity shipping rates for each constituency"""

        retailer_receipts = retailer_utils.get_retailer_receipts(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')
    

class RetailPrescriptionsCreateAPIView(generics.GenericAPIView):
    """
    Create new retail prescription
    """

    name = "retail-prescription-create"
    permission_classes = (  retail_permissions.EntitySubscriptionPermission, 
                          permissions.IsAuthenticated,)
    serializer_class = serializers.RetailPrescriptionsSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        dependant = None
        retailer = None
        origin_latitude = None
        origin_longitude=None
        errors_messages=[]
        origin_point=None
        destination_point=None
        dependant_id = request.POST.get("patient", None)
        pharmacy_id=None
        create_log("info",request.data)
        create_log("info",request.FILES)
 

        
        origin_latitude =request.POST.get("origin_latitude", None)
        origin_longitude =request.POST.get("origin_longitude", None)
        if origin_latitude and origin_longitude:
            origin_point = fromstr(f"POINT({origin_longitude} {origin_latitude})", srid=4326)
        
        destination_latitude =request.POST.get("destination_latitude", None)
        destination_longitude =request.POST.get("destination_longitude", None)
        if destination_latitude and destination_longitude:
            destination_point = fromstr(f"POINT({origin_longitude} {origin_latitude})", srid=4326)        

        if dependant_id:
            dependant = authentication_models_validators.validate_dependant(dependant_id)

        pharmacy_id = request.POST.get("entity", None)
        if pharmacy_id:
            print("pharmacy_id",pharmacy_id)
            retailer = authentication_models_validators.validate_entity(pharmacy_id)
            if retailer and not retailer.entity_type =="PHARMACY":
                errors_messages.append("Selected entity is not a pharmacy")
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Retail prescrption not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        else:
            errors_messages.append("Retailer ID is required")
            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Retail prescrption not created",
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )
        
        minutes_ago = datetime.datetime.now() - datetime.timedelta(minutes=2)
        hour_ago = datetime.datetime.now() - datetime.timedelta(minutes=60)
        if  models.Prescriptions.objects.filter(created_by=request.user,created__gte=minutes_ago, entity=retailer,status="QUEUING").exists():
            errors_messages.append(f"Prescriptin created an minutes ago already exists for {dependant}. Try again after 2 minutes if it is not a repetition")
            create_log("error","Conflicting prescription detected")
            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Retail prescrption not created",
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )
        else:
            create_log("info","No conflict prescription")
       
       
        files = request.FILES.getlist("images")
        create_log("info",request.FILES)
        create_log("info",len(files))
        if files:
            request.data.pop("images")
            serializer_context = {
                "request": request,
            }

            serializer = serializers.RetailPrescriptionsSerializer(
                data=request.data, context=serializer_context
            )


         
            
            if serializer.is_valid(raise_exception=True):
                try:
                    serializer.save(created_by=request.user,patient=dependant,origin_point=origin_point,destination_point=destination_point)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(exc)
                item = models.Prescriptions.objects.get(id=serializer.data["id"])
                errors_messages = []

                uploaded_files = []
                for file in files:
                    content = models.PrescriptionImages.objects.create(
                        owner=request.user,
                        image=file,
                        prescription=item,
                        entity=retailer   
                    )
                    uploaded_files.append(content)

                item.images.add(*uploaded_files)
                item.save()
                context = serializer.data
                arr =[]
                ls= serializers.PrescriptionImageSerializer(item.images,context={'request': request}, many=True).data,
                context["images"] =arr

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Retail prescription succesfully created",
                        "prescription": serializers.RetailPrescriptionsSerializer(item,context={'request': request}).data,
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
                        "response_message": "Retail prescrption not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        else:
            errors_messages.append("At least one image is required")
            return Response(
                                data={
                                    "response_code": 1,
                                    "response_message": "Retail prescription not created",
                                    "errors": errors_messages,
                                    "status": status.HTTP_200_OK,
                                },
                                status=status.HTTP_200_OK,
                            )
        


import datetime
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

import datetime
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

# retailers/views.py

import datetime
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

# --- Custom App Relational Imports ---
from authentication.models import Entities
from retailers.models import RetailerReceipts
from .serializers import InventoryPredictionQuerySerializer
from .helpers import (
    get_entity_interacted_products, 
    calculate_single_product_metrics, 
    find_wholesaler_procurement_offers,
    sync_or_create_active_indent,       
    rebuild_indent_item_row
)

class VendorPurchasePredictionAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Procurement Projections Engine View:
        Calculates dynamic runway requirements based on historical data footprints,
        automatically adding un-ordered out-of-stock backlogs directly into the forecast.
        """
        raw_params = request.query_params.dict()
        create_log("info", f"Raw Incoming Request Data Params Map: {raw_params}")

        query_serializer = InventoryPredictionQuerySerializer(data=raw_params)
        if not query_serializer.is_valid():
            create_log("error", f"Serializer validation failed: {query_serializer.errors}")
            return Response(query_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        v = query_serializer.validated_data
        today = datetime.date.today()
        
        # Extract order timeline horizons
        days_to_order = int(v['days_to_order'])
        history_cutoff = today - datetime.timedelta(days=v.get('lookback_window', 30))
        total_horizon_days = days_to_order + v['lead_time_days']
        horizon_expiry_threshold = today + datetime.timedelta(days=total_horizon_days)

        entity = Entities.objects.filter(Q(owner=request.user) | Q(administrator=request.user), is_active=True).first()
        if not entity:
            return Response({"error": "No active retailer profiling instance recognized."}, status=status.HTTP_404_NOT_FOUND)

        try:
            active_indent = sync_or_create_active_indent(entity, request.user, v)
        except Exception as err:
            return Response({"error": f"Indent synchronization failure: {str(err)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        predictions = []
        master_products = get_entity_interacted_products(entity.owner)

        for product in master_products:
            # 🚀 Passes days_to_order into the core metrics engine
            metric_data = calculate_single_product_metrics(
                product=product,
                owner=entity.owner,
                total_horizon_days=total_horizon_days,
                horizon_expiry_threshold=horizon_expiry_threshold,
                history_cutoff=history_cutoff,
                max_shelf_days=active_indent.max_shelf_days,
                lookback_days=active_indent.lookback_days,
                days_to_order=days_to_order # ✅ Passed safely down down the execution tree
            )

            if not metric_data or not isinstance(metric_data, dict):
                continue

            # Compute restock demand thresholds from intake consumption rates
            safety_buffer = 10 if not metric_data["has_overstayed"] else 0
            
            # 🚀 REFACTORED MULTI-FIELD QUANTITY EQUATION RUNWAY:
            # Multiplies your dual-quantity daily depletion velocity directly by your active order runway days parameter!
            base_demand = metric_data["avg_daily_sales"] * Decimal(days_to_order)
            
            # Predict purchase units required to sustain shelf velocity coverage targets
            predicted_purchase = max(Decimal(0), (base_demand + Decimal(safety_buffer)) - Decimal(metric_data["usable_stock_calculated"]))
            final_quantity_units = int(predicted_purchase.quantize(Decimal('1.'), rounding='ROUND_UP'))

            if metric_data["has_overstayed"] and final_quantity_units > 0:
                final_quantity_units = int(metric_data["validated_backlog_demand"])
                recommendation_notes = "Overstayed stock blocker active. Restocking unfulfilled client shortfalls only."
            else:
                final_quantity_units += int(metric_data["validated_backlog_demand"])
                recommendation_notes = "Velocity runway matching with unfulfilled client backlog buffers appended."

            # Map available wholesaler procurement configurations
            proposed_offers = find_wholesaler_procurement_offers(product, final_quantity_units, today)

            # Extract last product cost for bookkeeping valuation asset tracking lines (Unrestricted by active flags)
            last_receipt = RetailerReceipts.objects.filter(owner=entity.owner, product=product).order_by('-created').first()
            unit_cost = last_receipt.unit_buying_price if (last_receipt and last_receipt.unit_buying_price is not None) else Decimal('0.00')
            total_value = Decimal(metric_data["total_physical_stock"]) * unit_cost

            try:
                rebuild_indent_item_row(entity, entity.owner, active_indent, product, final_quantity_units, unit_cost, proposed_offers, today)
            except Exception as item_err:
                return Response({"error": f"Child lines population breakdown: {str(item_err)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            predictions.append({
                "product_id": str(product.id), 
                "title": product.product_name(), 
                "bar_code": product.bar_code, 
                "metrics_in_units": {
                    "total_physical_stock": metric_data["total_physical_stock"], 
                    "usable_stock_calculated": metric_data["usable_stock_calculated"], 
                    "shelf_age_days": metric_data["shelf_age_days"],
                    "average_daily_sales": round(float(metric_data["avg_daily_sales"]), 2), 
                    "validated_backlog_demand": metric_data["validated_backlog_demand"],
                    "unit_cost_price": float(unit_cost),
                    "total_value_calculated": float(total_value)
                },
                "flags": {
                    "expiry_warning": metric_data["expiring_stock_hidden"] > 0, 
                    "has_overstayed_on_shelf": metric_data["has_overstayed"], 
                    "has_inventory_discrepancy": metric_data["has_inventory_discrepancy"]
                },
                "discrepancy_details": metric_data["discrepancy_note"], 
                "recommendation_notes": recommendation_notes,
                "predicted_purchase_units": final_quantity_units, 
                "wholesaler_procurement_offers": proposed_offers
            })
        
        return Response({
            "entity_id": str(entity.id), 
            "entity_title": entity.title, 
            "retailer_indent_id": str(active_indent.id), 
            "retailer_indent_status": "OPEN_DRAFT" if active_indent.is_open == "true" else "CLOSED",
            "config": {
                "ordering_window_days": active_indent.order_days,
                "lead_time_days": active_indent.lead_time,
                "lookback_window_days": active_indent.lookback_days,
                "max_shelf_age_days": active_indent.max_shelf_days,
                "total_coverage_horizon": active_indent.order_days + active_indent.lead_time
            },
            "predictions": predictions
        }, status=status.HTTP_200_OK)

import datetime
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

# --- Custom System Relational Imports ---
from authentication.models import Entities
from wholesalers.models import WholesalerReceipts
from retailers.models import RetailerIndent, RetailerIndentItem, RetailerOrders, RetailerOrderItems

class RetailerCloseAndOrderIndentAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Phase 3 Closing Transaction API View:
        1. Closes out active internal RetailerIndent draft (sets is_open="false").
        2. Synchronizes final selected frontend items with RetailerIndentItem database metrics rows.
        3. Spawns distinct RetailerOrders mapped strictly to RetailerOrders schema model attributes.
        """
        data = request.data
        indent_id = data.get("indent_id")
        frontend_items = data.get("items", [])

        if not indent_id or not frontend_items:
            return Response(
                {"error": "Missing parameters. Ensure indent_id and item list arrays are populated."},
                status=status.HTTP_400_BAD_REQUEST
            )

        entity = Entities.objects.filter(Q(owner=request.user) | Q(administrator=request.user), is_active=True).first()
        if not entity:
            return Response({"error": "No active retailer entity profile configuration matched."}, status=status.HTTP_404_NOT_FOUND)

        try:
            with transaction.atomic():
                # 1. Fetch and close parent Indent lifecycle tracking state flags
                try:
                    indent = RetailerIndent.objects.select_for_update().get(id=indent_id, entity=entity, is_open="true")
                except RetailerIndent.DoesNotExist:
                    return Response(
                        {"error": f"Active open draft indent reference ID {indent_id} missing or already finalized."},
                        status=status.HTTP_404_NOT_FOUND
                    )

                # Lock the document state
                indent.is_open = "false"
                indent.save()

                # Group entries by distinct Wholesaler IDs to map discrete corporate fields
                wholesaler_groups = {}
                
                # 2. Iterate selected lines to update configurations and map bundles
                for item in frontend_items:
                    receipt_id = item.get("wholesaler_receipt")
                    if not receipt_id:
                        continue

                    try:
                        w_receipt = WholesalerReceipts.objects.get(id=receipt_id)
                    except WholesalerReceipts.DoesNotExist:
                        raise ValueError(f"Target wholesale catalog record ID {receipt_id} unresolvable.")

                    supplier_entity = w_receipt.received_from
                    if not supplier_entity:
                        raise ValueError(f"Wholesaler stock receipt ID {receipt_id} lacks a valid provider profile link.")

                    req_qty = int(item["required_quantity"])
                    final_price = Decimal(str(item["price"]))
                    gross_subtotal = Decimal(str(item["total"]))

                    # Synchronize final variables onto existing matching RetailerIndentItem rows
                    RetailerIndentItem.objects.update_or_create(
                        entity=entity,
                        retailer_indent=indent,
                        wholesale_receipt=w_receipt,
                        defaults={
                            "owner": entity.owner,
                            "predicted_purchase_units": req_qty,
                            "final_pack_price": final_price,
                            "item_gross_total_amount": gross_subtotal,
                            "item_net_total_amount": gross_subtotal,
                            "wholesaler_price_discount_id": item.get("wholesaler_price_discount_id"),
                            "wholesaler_quantity_discount_id": item.get("wholesaler_quantity_discount_id")
                        }
                    )

                    # Initialize vendor grouping array tracks dynamically
                    if supplier_entity.id not in wholesaler_groups:
                        wholesaler_groups[supplier_entity.id] = {
                            "supplier": supplier_entity,
                            "lines": []
                        }
                    
                    wholesaler_groups[supplier_entity.id]["lines"].append({
                        "w_receipt": w_receipt,
                        "quantity": req_qty,
                        "price": final_price,
                        "total": gross_subtotal
                    })

                # 3. Create independent RetailerOrders sheets for each distinct Wholesaler group
                created_orders_metadata = []

                for w_id, group in wholesaler_groups.items():
                    supplier = group["supplier"]
                    lines = group["lines"]

                    order_gross = sum(ln["total"] for ln in lines)

                    # Generate parent Retailer Order tracking header document block matching choices metrics
                    retailer_order = RetailerOrders.objects.create(
                        entity=entity,
                        owner=entity.owner,
                        retailer=entity,            # Matches related_name='wholesalerOrderRetailer'
                        wholesaler=supplier,        # Matches related_name='wholesalerOrderWholesaler'
                        order_origin="RETAILER",
                        order_type="NORMAL",
                        order_terms="CASH",
                        status="SUBMITTED",
                        is_paid="false",
                        is_delivered="false",
                        is_processed="false",
                        is_packed="false",
                        is_received="false",
                        is_approved="false",
                        is_dispatched="false",
                        delivery_method="SELF",
                        # Financial configurations totals
                        order_gross_price_total=order_gross,
                        final_price=order_gross,
                        final_price_total=order_gross,
                        order_discount_total=Decimal("0.00"),
                        order_tax_total=Decimal("0.00"),
                        shipping_amount=Decimal("0.00")
                    )

                    # Append granular child row metrics lines matching RetailerOrderItems schema parameters
                    for ln in lines:
                        RetailerOrderItems.objects.create(
                            entity=entity,
                            owner=entity.owner,
                            retailer_order=retailer_order,
                            wholesale_receipt=ln["w_receipt"],
                            purchased_quantity=ln["quantity"],
                            total_quantity=ln["quantity"],
                            discount_quantity=0,
                            item_price=ln["price"],
                            item_price_total=ln["total"],
                            item_final_price=ln["price"],
                            item_final_price_total=ln["total"],
                            item_net_price=ln["price"],
                            item_net_price_total=ln["total"],
                            unit_of_issue="Pack",
                            item_tax=Decimal("0.00"),
                            item_tax_total=Decimal("0.00"),
                            item_counter_price_discount_amount_total=Decimal("0.00"),
                            item_price_discount_total=Decimal("0.00")
                        )

                    created_orders_metadata.append({
                        "order_id": retailer_order.id,
                        "supplier_title": supplier.title,
                        "order_total": float(order_gross)
                    })

                return Response({
                    "message": "Indent requisition closed and vendor purchase orders generated successfully.",
                    "retailer_indent_id": indent.id,
                    "indent_status": "CLOSED_FINALIZED",
                    "purchase_orders_created": created_orders_metadata
                }, status=status.HTTP_201_CREATED)

        except Exception as transaction_error:
            return Response(
                {"error": f"Full-stack atomic generation sequence failed execution: {str(transaction_error)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
