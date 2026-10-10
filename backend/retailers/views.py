# retailers/views.py

# ---------- Standard library ----------
import datetime
from decimal import Decimal


# ---------- Third-party ----------
from django.contrib.gis.geos import fromstr
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import exceptions, generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

# ---------- Local apps ----------
from authentication.models import Entities
from authentication.serializers import CategoriesSerializer
from authentication.validators import authentication_models_validators
from authentication.validators.authentication_models_validators import (
    validate_entity,
)
from core.responses import (
    custom_error_response,
    custom_errors_response,
    custom_json_response,
    custom_success_message,
)
from employees.models import Employees
from products.models import Products
from retailers.models import (
    IndentItemSource,
    RetailerIndent,
    RetailerIndentItem,
    RetailerReceipts,
)
from retailers.retail_permissions import EntitySubscriptionPermission
from retailers.serializers import RetailerReceiptsSerializer
from utils.logging import create_log
from wholesalers.models import (
    RetailerOrders,
    WholesalerReceiptReturns,
    WholesalerReceipts,
)
from wholesalers.serializers import RetailerOrdersSerializer, WholesalerReceiptReturnListSerializer
from .utils import daily_retailer_report, retailer_utils
from . import customer_order_responses, models, retail_permissions, serializers
from .serializers import (
    RetailerIndentItemEditSerializer,
    RetailerIndentItemParamsUpdateSerializer,
    RetailerIndentItemsSerializer,
    RetailerIndentParamsSerializer,
    RetailerIndentSerializer,
)
from .services.product_requests import product_requests_dispatch
from .utils import (
    client_dashboard_utils,
    daily_retailer_report,
    retail_prescriptions_utils,
    retailer_utils,
    retailers_shipping_rates_utils,
    wholesaler_invoice_utils,
    profit_and_loss_utils,
    expiry_report_utils,
    stock_report_utils
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REQUEST_EXPIRY_DAYS = 14
WHOLESALER_ENTITY_TYPES = ["GeneralWholesaler", "PharmaceuticalWholesaler"]


# ===========================================================================
# Super admin
# ===========================================================================

@api_view(["POST"])
@permission_classes([permissions.IsAdminUser])
def retailerReceiptsSuperAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "UpdateInventoryBarCodes":
        updated_items = 0
        for product in Products.objects.all():
            if not product.bar_code:
                continue
            inventories = models.RetailerReceipts.objects.filter(
                product=product, bar_code=""
            )
            for inventory in inventories:
                inventory.bar_code = product.bar_code
                inventory.save()
                updated_items += 1

        return custom_json_response(
            0, "Update done successfully", "updated_items", updated_items
        )

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Retail admin — receipts / returns / stock adjustments
# ===========================================================================

@api_view(["POST"])
@permission_classes(
    [
        retail_permissions.RetailEmployeePermission,
        retail_permissions.EntitySubscriptionPermission,
    ]
)
def retailerReceiptsAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "CreateRetailerReceipt":
        errors, retailer_receipt = retailer_utils.create_retailer_receipt_directly(
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
        return custom_errors_response(
            1, "Retailer inventory receipt could not be created", errors
        )

    elif action == "GetRetailerReceipts":
        retailer_receipts = retailer_utils.get_retailer_receipts(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetProductMovement":
        retailer_receipts = retailer_utils.get_product_movement(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.ProductMovementSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetailerReceiptsByCategory":
        retailer_receipts = retailer_utils.get_retailer_receipts_by_catgory(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "UpdateRetailerReceipt":
        errors, retailer_receipt = retailer_utils.update_retailer_receipt_directly(
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
        return custom_errors_response(
            1, "Retailer inventory receipt could not be updated", errors
        )



    elif action == "GetPurchasesReturns":
        purchases_returns =WholesalerReceiptReturns.objects.filter(
            retailer_entity=request.user.entity
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(purchases_returns, request)
        serializer = WholesalerReceiptReturnListSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "CreateSalesReturn":
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
        if errors:
            return custom_errors_response(
                1, "Sales return not created", errors
            )

    elif action == "GetSalesReturns":
        sales_returns = models.SalesReturns.objects.filter(
            entity=request.user.entity
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sales_returns, request)
        serializer = serializers.SalesReturnsSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "CreateStockAdjustment":
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
        if errors:
            return custom_errors_response(
                1, "Stock adjustment not created", errors
            )

    elif action == "GetStockAdjustments":
        stock_adjustments = models.StockAdjustments.objects.filter(
            entity=request.user.entity
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(stock_adjustments, request)
        serializer = serializers.StockAdjustmentsSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

        # -----------------------------------------------------------------
    # Reports — daily sales
    #
    # Default: today. Also accepts:
    #   { "date": "YYYY-MM-DD" }              — single day
    #   { "from": "YYYY-MM-DD" }              — from that day through today
    #   { "from": "YYYY-MM-DD", "to": "..." } — explicit range
    # Staff may pass "entity_id"; others are scoped to their own entity.
    # -----------------------------------------------------------------

    elif action == "GetDailySalesReport":
        errors, report = daily_retailer_report.get_daily_sales_report(
            request.data, request.user,
        )
        if report:
            return custom_success_message(
                0,
                "Daily sales report",
                report,
                "report",
            )
        return custom_errors_response(
            1, "Could not build daily sales report", errors,
        )
    elif action == "GetProfitAndLoss":
        errors, report = profit_and_loss_utils.get_profit_and_loss(
            request.data, request.user,
        )
        if report:
            return custom_success_message(
                0, "Profit and loss", report, "report",
            )
        return custom_errors_response(
            1, "Could not build profit and loss", errors,
        )
    elif action == "GetExpiryReport":
        errors, report = expiry_report_utils.get_expiry_report(
            request.data, request.user,
        )
        if report:
            return custom_success_message(
                0, "Expiry report", report, "report",
            )
        return custom_errors_response(
            1, "Could not build expiry report", errors,
        )
    elif action == "GetStockReport":
        errors, report = stock_report_utils.get_stock_report(
            request.data, request.user,
        )
        if report:
            return custom_success_message(
                0, "Stock report", report, "report",
            )
        return custom_errors_response(
            1, "Could not build stock report", errors,
        )
    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Client orders (customer-facing)
# ===========================================================================

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def clientOrdersAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "GetRetailerReceiptsForEntity":
        retailer_receipts = retailer_utils.get_retailer_receipts_for_entity(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "CreateCustomerOrderByCustomer":
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
        if errors:
            return custom_errors_response(
                1, "Customer order not created", errors
            )

    elif action == "RetrieveOwnOrders":
        own_orders = retailer_utils.get_own_orders(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(own_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetClientDashboard":
        dashboard = client_dashboard_utils.get_client_dashboard(request.user)
        return custom_success_message(
            0, "Dashboard retrieved", dashboard, "dashboard"
        )

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Joint retailer / wholesaler receipts
# ===========================================================================

@api_view(["POST"])
@permission_classes(
    [permissions.IsAuthenticated, retail_permissions.EntitySubscriptionPermission]
)
def retailerReceiptsJointAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "GetRetailerReceipts":
        retailer_receipts = retailer_utils.get_retailer_receipts(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetailerReceiptsByCategory":
        retailer_receipts = retailer_utils.get_retailer_receipts_by_catgory(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetRetailerReceiptsForEntity":
        retailer_receipts = retailer_utils.get_retailer_receipts_for_entity(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetRetailerReceiptDetails":
        retailer_receipt = retailer_utils.get_retailer_receipt_details(
            request.data, request.user
        )
        if retailer_receipt:
            serializer = serializers.RetailerReceiptsSerializer(
                retailer_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Receipt successfully retrieved",
                serializer.data, "retailer_receipt",
            )
        return custom_error_response(1, "Order not retrieved")

    elif action == "CheckItemStock":
        retailer_receipt_id = request.data.get("retailer_receipt_id")
        if not retailer_receipt_id:
            return custom_error_response(1, "retailer_receipt_id is required")

        retailer_receipt = models.RetailerReceipts.objects.filter(
            id=retailer_receipt_id
        ).first()
        if not retailer_receipt:
            return custom_error_response(1, "No product for provided ID")

        return custom_json_response(
            0, "Product successfully retrieved", "retailer_receipt",
            {
                "id": retailer_receipt.id,
                "title": retailer_receipt.product.title,
                "units_per_pack": int(retailer_receipt.units_per_pack),
                "current_unit_quantity": int(
                    retailer_receipt.current_unit_quantity
                ),
                "unit_selling_price": float(
                    retailer_receipt.final_unit_selling_price
                ),
            },
        )

    elif action == "CheckStockStatusBatch":
        items = request.data.get("retailer_receipt_items") or []
        retailer_receipts_list = []
        for item_id in items:
            retailer_receipt = models.RetailerReceipts.objects.filter(
                id=item_id
            ).first()
            if not retailer_receipt:
                continue
            units_per_pack = int(retailer_receipt.units_per_pack or 0)
            current_qty = int(retailer_receipt.current_unit_quantity or 0)
            retailer_receipts_list.append({
                "id": retailer_receipt.id,
                "title": retailer_receipt.product.title,
                "units_per_pack": units_per_pack,
                "current_unit_quantity": current_qty,
                "loose_units_quantity": (
                    current_qty - (units_per_pack * units_per_pack)
                ),
                "unit_selling_price": float(
                    retailer_receipt.final_unit_selling_price
                ),
            })

        if retailer_receipts_list:
            return custom_json_response(
                0, "Stock status successfully retrieved",
                "retailer_receipts", retailer_receipts_list,
            )
        return custom_error_response(1, "Stock status not retrieved")

    elif action == "SearchRetailerReceipts":
        retailer_receipts = retailer_utils.search_receipts(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "SearchRetailerReceiptsByCustomer":
        retailer_receipts = retailer_utils.search_receipts_by_customer(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetRetailerAllowedCategories":
        entity_id = request.data.get("entity")
        if not entity_id:
            raise exceptions.ValidationError("Entity is required")

        entity = validate_entity(entity_id)
        allowed_categories = entity.categories.all()
        serializer = CategoriesSerializer(
            allowed_categories, many=True, context={"request": request}
        )
        return customer_order_responses.custom_success_message(
            0, "Categories retrieved successfully",
            serializer.data, "categories",
        )

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Staff — indents / orders / prescriptions
# ===========================================================================

@api_view(["POST"])
@permission_classes([retail_permissions.EntitySubscriptionPermission])
def customerOrdersStaffAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "CreateRetailerIndent":
        errors, retailer_indent = retailer_utils.create_retailer_indent(
            request.data, request.user
        )
        if retailer_indent:
            serializer = serializers.RetailerIndentSerializer(
                retailer_indent, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer indent created successfully",
                serializer.data, "retailer_indent",
            )
        if errors:
            return custom_errors_response(
                1, "Customer order not created", errors
            )

    elif action == "CreateEstimateIndent":
        errors, retailer_indent = retailer_utils.create_estimate_indent(
            request.data, request.user
        )
        if retailer_indent:
            serializer = serializers.RetailerIndentSerializer(
                retailer_indent, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer indent created successfully",
                serializer.data, "retailer_indent",
            )
        if errors:
            return custom_errors_response(
                1, "Customer order not created", errors
            )

    elif action == "CloseRetailerIndent":
        errors, retailer_indent = retailer_utils.close_retailer_indent(
            request.data, request.user
        )
        if retailer_indent:
            serializer = serializers.RetailerIndentSerializer(
                retailer_indent, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer indent closed successfully",
                serializer.data, "retailer_indent",
            )
        if errors:
            return custom_errors_response(
                1, "Retailer indent not closed", errors
            )

    elif action == "RetrieveRetailerIndentItems":
        retailer_indent_items = retailer_utils.retrieve_retailer_indent_items(
            request.data
        )
        if retailer_indent_items:
            return custom_json_response(
                0, "Items successfully retrieved",
                "data", retailer_indent_items,
            )
        return customer_order_responses.custom_error_response(
            1, "Estimates not retrieved"
        )

    elif action == "RetrieveRetailerIndents":
        retailer_indents = retailer_utils.retrieve_retailer_indents(
            request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_indents, request)
        serializer = serializers.RetailerIndentSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "CreateRetailerIndentItem":
        errors, retailer_indent_item = retailer_utils.create_retailer_indent_item(
            request.data, request.user
        )
        if retailer_indent_item:
            serializer = serializers.RetailerIndentItemsSerializer(
                retailer_indent_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer indent item created successfully",
                serializer.data, "retailer_indent_item",
            )
        if errors:
            return custom_errors_response(
                1, "Indent item not created", errors
            )

    elif action == "UpdateRetailerIndentItem":
        errors, retailer_indent_item = retailer_utils.update_retailer_indent_item(
            request.data, request.user
        )
        if retailer_indent_item:
            serializer = serializers.RetailerIndentItemsSerializer(
                retailer_indent_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer indent item updated successfully",
                serializer.data, "retailer_indent_item",
            )
        if errors:
            return custom_errors_response(
                1, "Indent item not updated", errors
            )

    elif action == "RemoveRetailerIndentItem":
        errors, retailer_indent_items = retailer_utils.remove_retailer_indent_item(
            request.data, request.user
        )
        if retailer_indent_items:
            serializer = serializers.RetailerIndentItemsSerializer(
                retailer_indent_items, many=True, context={"request": request}
            )
            return custom_success_message(
                0, "Indent item deleted successfully",
                serializer.data, "indent_items",
            )
        if errors:
            return custom_errors_response(
                1, "Indent item not deleted", errors
            )

    elif action == "CreateOutOfStockItem":
        errors, out_of_stock_item = retailer_utils.create_out_of_stock_item(
            request.data, request.user
        )
        if out_of_stock_item:
            serializer = serializers.OutOfStocksSerializer(
                out_of_stock_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Out of stock item created successfully",
                serializer.data, "out_of_stock_item",
            )
        if errors:
            return custom_errors_response(
                1, "Out of stock item not created", errors
            )

    elif action == "RetrieveCurrentOpenIndent":
        errors, open_indent = retailer_utils.retrieve_open_indent(request.user)
        if open_indent:
            serializer = serializers.RetailerIndentSerializer(
                open_indent, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Indent retrieved successfully",
                serializer.data, "indent",
            )
        if errors:
            return custom_errors_response(1, "No open indent", errors)

    elif action == "CloseIndent":
        errors, retailer_orders = retailer_utils.close_indent(
            request.data, request.user
        )
        if retailer_orders:
            serializer = RetailerOrdersSerializer(
                retailer_orders, many=True, context={"request": request}
            )
            return custom_success_message(
                0, "Indent closed successfully",
                serializer.data, "retailer_orders",
            )
        if errors:
            return custom_errors_response(
                1, "Retailer indent not closed", errors
            )

    elif action == "UpdateOutOfStockItem":
        errors, out_of_stock_item = retailer_utils.update_out_of_stock_item(
            request.data, request.user
        )
        if out_of_stock_item:
            serializer = serializers.OutOfStocksSerializer(
                out_of_stock_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Out of stock item updated successfully",
                serializer.data, "out_of_stock_item",
            )
        if errors:
            return custom_errors_response(
                1, "Out of stock item not updated", errors
            )

    elif action == "MakeRetailerOrderPayment":
        errors, retailer_order = retailer_utils.make_retailer_order_payment(
            request.data, request.user
        )
        if retailer_order:
            serializer = RetailerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer order payment made successfully",
                serializer.data, "retailer_order",
            )
        if errors:
            return custom_errors_response(
                1, "Retailer order payment process failed", errors
            )

    elif action == "RetrieveOutOfStockItems":
        retailer_orders = retailer_utils.retrieve_out_of_stock_items(
            request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.OutOfStocksSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetrieveRetailerOrders":
        retailer_orders = retailer_utils.retrieve_retailer_orders(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = RetailerOrdersSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetRetailerOrderDetails":
        retailer_order_items = retailer_utils.retrieve_retailer_order_items(
            request.data
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_order_items, request)
        serializer = RetailerOrdersSerializer(
            page, many=False,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "CreateCustomerOrder":
        retailer_utils.validate_customer_order_data(
            request.data, request.user
        )
        errors, customer_order = retailer_utils.create_customer_order(
            request.data, request.user
        )
        create_log("info", f"Customer order created {customer_order}")

        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Customer order created successfully",
                serializer.data, "customer_order",
            )
        if errors:
            return custom_errors_response(
                1, "Customer order not created", errors
            )

    elif action == "CreateExpressCustomerOrder":
        errors, customer_order = retailer_utils.create_express_customer_order_data(
            request.data, request.user
        )
        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Customer order created successfully",
                serializer.data, "customer_order",
            )
        if errors:
            return custom_errors_response(
                1, "Customer order not created", errors
            )

    elif action == "UpdateCustomerOrder":
        errors, customer_order = retailer_utils.update_customer_order(
            request.data, request.user
        )
        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Customer order updated successfully",
                serializer.data, "customer_order",
            )
        if errors:
            return custom_errors_response(
                1, "Customer order not updated", errors
            )

    elif action == "RetrieveEmployeeOrders":
        employee_orders = retailer_utils.get_employee_orders(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employee_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "SearchCustomerOrders":
        retailer_orders = retailer_utils.search_customer_orders(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetrieveOwnOrders":
        employee_orders = retailer_utils.get_own_orders(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employee_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "ChangeOrderPaymentMethod":
        customer_order = retailer_utils.update_customer_order(
            request.data, request.user
        )
        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return customer_order_responses.custom_success_message(
                0, "Customer order updated successfully",
                serializer.data, "customer_order",
            )
        return customer_order_responses.custom_error_response(
            1, "Customer order could not be updated"
        )

    elif action == "CustomerOrderDetails":
        customer_order_id = request.data.get("customer_order")
        if not customer_order_id:
            raise exceptions.ValidationError(
                "Customer order ID is required"
            )
        customer_order = models.CustomerOrders.objects.filter(
            id=customer_order_id
        ).first()
        if not customer_order:
            return customer_order_responses.custom_error_response(
                1, "Customer order could not be retrieved"
            )
        serializer = serializers.CustomerOrdersSerializer(
            customer_order, many=False, context={"request": request}
        )
        return customer_order_responses.custom_success_message(
            0, "Customer order retrieved successfully",
            serializer.data, "customer_order",
        )

    elif action == "GenerateOrderItemEstimates":
        order_estimates = retailer_utils.generate_order_estimates(
            request.data, request.user, request
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(order_estimates, request)
        serializer = serializers.OrderEstimateSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetrieveProductWholesaleOffers":
        errors, offers = retailer_utils.retrieve_product_wholesale_offers(
            request.data, request.user
        )
        if offers:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(offers, request)
            serializer = serializers.WholesalerReceiptsDisplaySerializer(
                page, many=True,
                context={"request": request, "user": request.user},
            )
            return paginator.get_paginated_response(serializer.data)
        return custom_errors_response(
            1, "Wholesale offers not retrieved", errors
        )

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Wholesaler invoices
# ===========================================================================

@api_view(["POST"])
@permission_classes(
    [
        retail_permissions.RetailEmployeePermission,
        retail_permissions.EntitySubscriptionPermission,
    ]
)
def retailerInvoicesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "CreateWholesalerInvoice":
        invoice = wholesaler_invoice_utils.create_wholesaler_invoice(
            request.data, request.user
        )
        if invoice:
            serializer = serializers.WholesalerInvoicesSerializer(
                invoice, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Wholesaler invoice created successfully",
                serializer.data, "invoice",
            )
        return custom_error_response(
            1, "Wholesaler invoice could not be created"
        )

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Admin — customer orders
# ===========================================================================

@api_view(["POST"])
@permission_classes(
    [
        retail_permissions.RetailAdminPermission,
        retail_permissions.EntitySubscriptionPermission,
    ]
)
def customerOrdersAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "RetrieveEmployeeOrders":
        employee_orders = retailer_utils.get_employee_orders(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employee_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetrieveEntityOrders":
        customer_orders = retailer_utils.get_entity_orders(
            request.user, request.data
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetrieveCustomerOrderPayments":
        customer_order_payments = retailer_utils.get_customer_order_payments(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_order_payments, request)
        serializer = serializers.CustomerOrderPaymentsSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetrieveCustomerOrderSettlements":
        customer_order_settlements = (
            retailer_utils.get_customer_order_settlements(
                request.data, request.user
            )
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(
            customer_order_settlements, request
        )
        serializer = serializers.CustomerOrderSettlementSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetrieveCustomerOrders":
        customer_orders = retailer_utils.get_customer_orders(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetBodabodaDeliveries":
        bodaboda_deliveries = retailer_utils.get_bodaboda_deliveries(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(bodaboda_deliveries, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetrieveCustomerOrderItems":
        customer_order_items = retailer_utils.get_customer_order_items(
            request.data, request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_order_items, request)
        serializer = serializers.CustomerOrderItemsSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "CustomerOrderDetails":
        customer_order_id = request.data.get("customer_order")
        if not customer_order_id:
            raise exceptions.ValidationError(
                "Customer order ID is required"
            )
        customer_order = models.CustomerOrders.objects.filter(
            id=customer_order_id
        ).first()
        if not customer_order:
            return customer_order_responses.custom_error_response(
                1, "Customer order could not be retrieved"
            )
        serializer = serializers.CustomerOrdersSerializer(
            customer_order, many=False, context={"request": request}
        )
        return customer_order_responses.custom_success_message(
            0, "Customer order retrieved successfully",
            serializer.data, "customer_order",
        )

    elif action == "AddShippingCostByDistance":
        errors = []
        entity = None

        entity_id = request.data.get("entity")
        if entity_id:
            entity = validate_entity(entity_id)
        else:
            errors.append("Entity ID is required")

        distance_in_km_from = request.data.get("distance_in_km_from")
        if not distance_in_km_from:
            errors.append("Minimum distance is required")

        distance_in_km_to = request.data.get("distance_in_km_to")
        if not distance_in_km_to:
            errors.append("Maximum distance is required")

        shipping_cost = request.data.get("shipping_cost")
        if not shipping_cost:
            errors.append("Shipping cost is required")

        if errors:
            raise exceptions.ValidationError(errors)

        try:
            created = models.RetailersShippingRates.objects.create(
                entity=entity,
                distance_in_km_from=distance_in_km_from,
                distance_in_km_to=distance_in_km_to,
                shipping_cost=shipping_cost,
                owner=request.user,
            )
        except Exception as e:
            raise exceptions.ValidationError(
                f"Could not create shipping cost: {e}"
            )

        serializer = serializers.RetailerShippingRatesSerializer(
            created, many=False, context={"request": request}
        )
        return customer_order_responses.custom_success_message(
            0, "Shipping cost created successfully",
            serializer.data, "shipping_cost",
        )

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Customer orders (customer-facing)
# ===========================================================================

@api_view(["POST"])
@permission_classes(
    [
        retail_permissions.EntitySubscriptionPermission,
        permissions.IsAuthenticated,
    ]
)
def customerOrdersAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "GetOrderShippngCostByDistance":
        entity_id = request.data.get("entity")
        if not entity_id:
            raise exceptions.ValidationError("Entity ID is required")
        entity = validate_entity(entity_id)

        distance_raw = request.data.get("distance")
        if not distance_raw:
            raise exceptions.ValidationError("Distance is required")
        distance = float(distance_raw)

        shipping_rate = models.RetailersShippingRates.objects.filter(
            distance_in_km_from__lte=distance,
            distance_in_km_to__gte=distance,
            entity=entity,
        ).first()

        if not shipping_rate:
            raise exceptions.ValidationError(
                "No shipping cost found within this range"
            )

        return Response(
            data={
                "response_code": 0,
                "response_message": "Shipping cost retrieved",
                "shipping_cost": shipping_rate.shipping_cost,
            },
            status=status.HTTP_200_OK,
        )

    elif action == "MakeCustomerOrderPayment":
        errors, retailer_order = retailer_utils.make_customer_order_payment(
            request.data, request.user
        )
        if retailer_order:
            serializer = serializers.CustomerOrdersSerializer(
                retailer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Customer order payment made successfully",
                serializer.data, "customer_order",
            )
        if errors:
            return custom_errors_response(
                1, "Customer order payment process failed", errors
            )

    elif action == "RetrieveOwnOrders":
        own_orders = retailer_utils.get_own_orders(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(own_orders, request)
        serializer = serializers.CustomerOrdersSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Prescriptions (remote API)
# ===========================================================================

@api_view(["POST"])
@permission_classes(
    [
        retail_permissions.EntitySubscriptionPermission,
        permissions.IsAuthenticated,
    ]
)
def remoteRetailPrescriptionsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if action == "UpdateRetailPrescription":
        errors, prescription = (
            retail_prescriptions_utils.update_retail_prescription(
                request.data, request.user
            )
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retail prescription created successfully",
                serializer.data, "prescription",
            )
        return custom_errors_response(
            1, "Retail prescription not created", errors
        )

    elif action == "GetRetailPrescriptionDetails":
        errors, prescription = (
            retail_prescriptions_utils.get_retail_prescription_details(
                request.data, request.user
            )
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retail prescription details retrieved successfully",
                serializer.data, "prescription",
            )
        return custom_errors_response(
            1, "Retail prescription not retrieved", errors
        )

    elif action == "MakePrescriptionOrderPayment":
        errors, customer_order = (
            retail_prescriptions_utils.make_prescription_order_payment(
                request.data, request.user
            )
        )
        if customer_order:
            serializer = serializers.CustomerOrdersSerializer(
                customer_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Prescription order updated successfully",
                serializer.data, "customer_order",
            )
        return custom_errors_response(
            1, "Prescription order not updated", errors
        )

    elif action == "UpdateRetailPrescriptionItem":
        errors, prescription_item = (
            retail_prescriptions_utils.update_retail_prescription_item(
                request.data, request.user
            )
        )
        if prescription_item:
            serializer = serializers.PrescriptionItemsSerializer(
                prescription_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retail prescription item updated successfully",
                serializer.data, "prescription_item",
            )
        return custom_errors_response(
            1, "Retail prescription item not updated", errors
        )

    elif action == "RemoveRetailPrescriptionItem":
        errors, prescription = (
            retail_prescriptions_utils.remove_retail_prescription_item(
                request.data, request.user
            )
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retail prescription updated successfully",
                serializer.data, "prescription",
            )
        return custom_errors_response(
            1, "Retail prescription not updated", errors
        )

    elif action == "CreateOrUpdatePrescriptionOrderItem":
        errors, prescription = (
            retail_prescriptions_utils.create_or_update_prescription_order_item(
                request.data, request.user
            )
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Prescription order item created successfully",
                serializer.data, "prescription",
            )
        return custom_errors_response(
            1, "Retail prescription order not updated", errors
        )

    elif action == "RetrieveEntityRetailPrescriptions":
        customer_orders = (
            retail_prescriptions_utils.get_entity_retail_prescriptions(
                request.data, request.user
            )
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_orders, request)
        serializer = serializers.RetailPrescriptionsSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "RetrieveUserRetailPrescriptions":
        customer_orders = (
            retail_prescriptions_utils.get_user_retail_prescriptions(
                request.data, request.user
            )
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(customer_orders, request)
        serializer = serializers.RetailPrescriptionsSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetRelatedEntityInventoryForProduct":
        retailer_receipts = (
            retail_prescriptions_utils.get_related_inventory_for_product(
                request.data, request.user
            )
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = RetailerReceiptsSerializer(
            page, many=True,
            context={"request": request, "user": request.user},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "CreateRetailPrescriptionItem":
        errors, prescription = (
            retail_prescriptions_utils.create_retail_prescription_item(
                request.data, request.user
            )
        )
        if prescription:
            serializer = serializers.RetailPrescriptionsSerializer(
                prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retail prescription item created successfully",
                serializer.data, "prescription",
            )
        if errors:
            return custom_errors_response(
                1, "Retail prescription item not created", errors
            )

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Shipping rates
# ===========================================================================

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

    if action == "CreateEntityShippingRate":
        retailers_shipping_rates_utils.validate_retailers_shipping_rates_data(
            request.data, request.user
        )
        shipping_rate = (
            retailers_shipping_rates_utils.create_retailer_shipping_rate(
                request.data, request.user
            )
        )
        if shipping_rate:
            serializer = serializers.RetailerShippingRatesSerializer(
                shipping_rate, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Retailer shipping rate created successfully",
                serializer.data, "retailer_receipt",
            )
        return custom_error_response(
            1, "Retailer shipping rate could not be created"
        )

    elif action == "GetConstituencyShippingRates":
        retailer_receipts = retailer_utils.get_retailer_receipts(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_receipts, request)
        serializer = serializers.RetailerReceiptsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ===========================================================================
# Prescriptions — create (multipart)
# ===========================================================================

class RetailPrescriptionsCreateAPIView(generics.GenericAPIView):
    """Create new retail prescription."""

    name = "retail-prescription-create"
    permission_classes = (
        retail_permissions.EntitySubscriptionPermission,
        permissions.IsAuthenticated,
    )
    serializer_class = serializers.RetailPrescriptionsSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        dependant = None
        retailer = None
        errors_messages = []

        create_log("info", request.data)
        create_log("info", request.FILES)

        dependant_id = request.POST.get("patient", None)
        origin_latitude = request.POST.get("origin_latitude", None)
        origin_longitude = request.POST.get("origin_longitude", None)
        destination_latitude = request.POST.get("destination_latitude", None)
        destination_longitude = request.POST.get("destination_longitude", None)

        origin_point = None
        if origin_latitude and origin_longitude:
            origin_point = fromstr(
                f"POINT({origin_longitude} {origin_latitude})", srid=4326
            )

        destination_point = None
        if destination_latitude and destination_longitude:
            destination_point = fromstr(
                f"POINT({destination_longitude} {destination_latitude})",
                srid=4326,
            )

        if dependant_id:
            dependant = authentication_models_validators.validate_dependant(
                dependant_id
            )

        pharmacy_id = request.POST.get("entity", None)
        if not pharmacy_id:
            errors_messages.append("Retailer ID is required")
            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Retail prescription not created",
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )

        retailer = authentication_models_validators.validate_entity(
            pharmacy_id
        )
        if retailer and not retailer.entity_type == "PHARMACY":
            errors_messages.append("Selected entity is not a pharmacy")
            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Retail prescription not created",
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )

        minutes_ago = datetime.datetime.now() - datetime.timedelta(minutes=2)
        if models.Prescriptions.objects.filter(
            created_by=request.user,
            created__gte=minutes_ago,
            entity=retailer,
            status="QUEUING",
        ).exists():
            errors_messages.append(
                f"Prescription created minutes ago already exists for "
                f"{dependant}. Try again after 2 minutes if it is not a "
                f"repetition"
            )
            create_log("error", "Conflicting prescription detected")
            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Retail prescription not created",
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )

        files = request.FILES.getlist("images")
        if not files:
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

        serializer = serializers.RetailPrescriptionsSerializer(
            data=request.data, context={"request": request}
        )
        if not serializer.is_valid():
            default_errors = serializer.errors
            for field_name, field_errors in default_errors.items():
                for field_error in field_errors:
                    errors_messages.append(
                        "%s: %s" % (field_name, field_error)
                    )
            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Retail prescription not created",
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )

        try:
            serializer.save(
                created_by=request.user,
                patient=dependant,
                origin_point=origin_point,
                destination_point=destination_point,
            )
        except IntegrityError as exc:
            raise exceptions.ValidationError(exc)

        item = models.Prescriptions.objects.get(id=serializer.data["id"])

        for file in files:
            models.PrescriptionImages.objects.create(
                owner=request.user,
                image=file,
                prescription=item,
                entity=retailer,
            )

        return Response(
            data={
                "response_code": 0,
                "response_message": "Retail prescription successfully created",
                "prescription": serializers.RetailPrescriptionsSerializer(
                    item, context={"request": request}
                ).data,
                "errors": [],
            },
            status=status.HTTP_201_CREATED,
        )


# ===========================================================================
# Indent — close and generate orders
# ===========================================================================

class RetailerCloseAndOrderIndentAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        data = request.data
        indent_id = data.get("indent_id")
        frontend_items = data.get("items", [])

        if not indent_id or not frontend_items:
            return Response(
                {
                    "error": (
                        "Missing parameters. Ensure indent_id and item "
                        "list arrays are populated."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        entity = Entities.objects.filter(
            Q(owner=request.user) | Q(administrator=request.user),
            is_active=True,
        ).first()
        if not entity:
            return Response(
                {"error": "No active retailer entity profile configuration matched."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            with transaction.atomic():
                indent = RetailerIndent.objects.select_for_update().filter(
                    id=indent_id, entity=entity, is_open="true"
                ).first()
                if not indent:
                    return Response(
                        {
                            "error": (
                                f"Active open draft indent reference ID "
                                f"{indent_id} missing or already finalized."
                            )
                        },
                        status=status.HTTP_404_NOT_FOUND,
                    )

                indent.is_open = "false"
                indent.save()

                wholesaler_groups = {}

                for item in frontend_items:
                    receipt_id = item.get("wholesaler_receipt")
                    if not receipt_id:
                        continue

                    w_receipt = WholesalerReceipts.objects.filter(
                        id=receipt_id
                    ).first()
                    if not w_receipt:
                        raise ValueError(
                            f"Target wholesale catalog record ID "
                            f"{receipt_id} unresolvable."
                        )

                    supplier_entity = w_receipt.received_from
                    if not supplier_entity:
                        raise ValueError(
                            f"Wholesaler stock receipt ID {receipt_id} "
                            f"lacks a valid provider profile link."
                        )

                    req_qty = int(item["required_quantity"])
                    final_price = Decimal(str(item["price"]))
                    gross_subtotal = Decimal(str(item["total"]))

                    # Sync the frontend values onto the existing indent line.
                    # Only real DB columns are written here — the model's
                    # recalculate() derives bonus, totals, and profit.
                    indent_item = RetailerIndentItem.objects.filter(
                        entity=entity,
                        retailer_indent=indent,
                        wholesale_receipt=w_receipt,
                    ).first()
                    if indent_item is None:
                        indent_item = RetailerIndentItem(
                            entity=entity,
                            owner=entity.owner,
                            retailer_indent=indent,
                            wholesale_receipt=w_receipt,
                        )
                    indent_item.required_quantity = req_qty
                    indent_item.total_quantity = req_qty
                    indent_item.supplier_unit_selling_price = final_price
                    indent_item.wholesaler_price_discount_id = (
                        item.get("wholesaler_price_discount_id")
                    )
                    indent_item.wholesaler_quantity_discount_id = (
                        item.get("wholesaler_quantity_discount_id")
                    )
                    indent_item.save()

                    wholesaler_groups.setdefault(
                        supplier_entity.id,
                        {"supplier": supplier_entity, "lines": []},
                    )["lines"].append(
                        {
                            "w_receipt": w_receipt,
                            "quantity": req_qty,
                            "price": final_price,
                            "total": gross_subtotal,
                        }
                    )

                created_orders_metadata = []

                for w_id, group in wholesaler_groups.items():
                    supplier = group["supplier"]
                    lines = group["lines"]
                    order_gross = sum(ln["total"] for ln in lines)

                    retailer_order = RetailerOrders.objects.create(
                        entity=entity,
                        owner=entity.owner,
                        retailer=entity,
                        wholesaler=supplier,
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
                        order_gross_price_total=order_gross,
                        final_price=order_gross,
                        final_price_total=order_gross,
                        order_discount_total=Decimal("0.00"),
                        order_tax_total=Decimal("0.00"),
                        shipping_amount=Decimal("0.00"),
                    )

                    for ln in lines:
                        RetailerOrderItems.objects.create(
                            entity=entity,
                            owner=entity.owner,
                            retailer_order=retailer_order,
                            wholesaler_receipt=ln["w_receipt"],
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
                            item_price_discount_total=Decimal("0.00"),
                        )

                    created_orders_metadata.append(
                        {
                            "order_id": retailer_order.id,
                            "supplier_title": supplier.title,
                            "order_total": float(order_gross),
                        }
                    )

                return Response(
                    {
                        "message": (
                            "Indent requisition closed and vendor purchase "
                            "orders generated successfully."
                        ),
                        "retailer_indent_id": indent.id,
                        "indent_status": "CLOSED_FINALIZED",
                        "purchase_orders_created": created_orders_metadata,
                    },
                    status=status.HTTP_201_CREATED,
                )

        except Exception as transaction_error:
            return Response(
                {
                    "error": (
                        f"Full-stack atomic generation sequence failed "
                        f"execution: {str(transaction_error)}"
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ===========================================================================
# Indent — item operations (APIView-based)
# ===========================================================================

def _fire_refresh(entity_id):
    try:
        from retailers.tasks import refresh_entity_predictions

        refresh_entity_predictions.delay(str(entity_id))
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning(
            "[INDENT] Failed to schedule refresh: %s", e
        )


class RetailerIndentDetailView(APIView):
    """GET /api/v1/retailers/indents/current/"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        entity = getattr(request.user, "entity", None)
        if not entity or not entity.is_active:
            return Response(
                {"error": "No active entity for this user."},
                status=status.HTTP_404_NOT_FOUND,
            )

        indent = (
            RetailerIndent.objects
            .filter(entity=entity, is_open="true")
            .prefetch_related(
                "indent_for_item__wholesale_receipt__product",
                "indent_for_item__wholesale_receipt__entity",
                "indent_for_item__wholesaler_price_discount",
                "indent_for_item__wholesaler_quantity_discount",
            )
            .order_by("-created")
            .first()
        )
        if not indent:
            return Response(
                {"error": "No open indent for this entity."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            RetailerIndentSerializer(indent).data,
            status=status.HTTP_200_OK,
        )


class RetailerIndentParamsUpdateView(APIView):
    """PATCH /api/v1/retailers/indents/<indent_id>/params/"""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, indent_id, *args, **kwargs):
        create_log("data at patch: ", f"{request.data}")

        entity = getattr(request.user, "entity", None)
        if not entity or not entity.is_active:
            return Response(
                {"error": "No active entity for this user."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not Employees.objects.filter(
            user=request.user, entity=entity, is_active="true",
        ).exists():
            return Response(
                {"error": "You are not an active employee at this entity."},
                status=status.HTTP_403_FORBIDDEN,
            )

        indent = RetailerIndent.objects.filter(
            id=indent_id, entity=entity, is_open="true"
        ).first()
        if not indent:
            return Response(
                {"error": "No open indent found for this entity."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = RetailerIndentParamsSerializer(
            indent, data=request.data, partial=True
        )
        if not serializer.is_valid():
            return Response(
                serializer.errors, status=status.HTTP_400_BAD_REQUEST
            )
        serializer.save()
        _fire_refresh(entity.id)

        return Response(
            {
                "status": "accepted",
                "indent_id": str(indent.id),
                "params": serializer.data,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class RetailerIndentItemUpdateView(APIView):
    """PATCH /api/v1/retailers/indent-items/<item_id>/"""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, item_id, *args, **kwargs):
        entity = getattr(request.user, "entity", None)
        if not entity or not entity.is_active:
            return Response(
                {"error": "No active entity."},
                status=status.HTTP_404_NOT_FOUND,
            )

        item = RetailerIndentItem.objects.filter(
            id=item_id, entity=entity, retailer_indent__is_open="true"
        ).first()
        if not item:
            return Response(
                {"error": "Indent item not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = RetailerIndentItemEditSerializer(
            item, data=request.data, partial=True
        )
        if not serializer.is_valid():
            return Response(
                serializer.errors, status=status.HTTP_400_BAD_REQUEST
            )
        item = serializer.save()

        if item.source == IndentItemSource.PREDICTION:
            item.source = IndentItemSource.PREDICTION_EDITED
            item.save(update_fields=["source"])

        self._recompute_amounts(item)
        _fire_refresh(entity.id)

        return Response(
            RetailerIndentItemsSerializer(item).data,
            status=status.HTTP_200_OK,
        )

    def _recompute_amounts(self, item):
        """Recompute derived cost/revenue/profit for a line.

        Note: `item_gross_total_amount` and `item_net_total_amount` are
        model @property values — they cannot be persisted here. We only
        persist the JSON `profit_estimate`.
        """
        indent = item.retailer_indent
        pricing_percentage = float(indent.pricing_percentage or 30)

        receipt = item.wholesale_receipt
        cost_per_unit = Decimal(str(item.final_unit_price or 0))

        if receipt and receipt.recommended_retail_price:
            sell_per_unit = Decimal(str(receipt.recommended_retail_price))
            pricing_source = "recommended_retail_price"
        else:
            markup = Decimal(str(pricing_percentage)) / Decimal("100")
            sell_per_unit = cost_per_unit * (Decimal("1") + markup)
            pricing_source = "retailer_markup"

        qty = Decimal(str(item.required_quantity))
        total_cost = cost_per_unit * qty
        total_revenue = sell_per_unit * qty
        total_profit = total_revenue - total_cost

        margin = Decimal("0")
        if sell_per_unit > 0:
            margin = (
                (sell_per_unit - cost_per_unit) / sell_per_unit
            ) * Decimal("100")

        item.profit_estimate = {
            "cost_per_unit": float(cost_per_unit),
            "sell_per_unit": float(sell_per_unit),
            "pricing_source": pricing_source,
            "profit_per_unit": float(sell_per_unit - cost_per_unit),
            "margin_percent": float(round(margin, 2)),
            "total_cost": float(round(total_cost, 2)),
            "total_revenue": float(round(total_revenue, 2)),
            "total_profit": float(round(total_profit, 2)),
        }
        item.save(update_fields=["profit_estimate"])


class RetailerIndentItemDeleteView(APIView):
    """DELETE /api/v1/retailers/indent-items/<item_id>/delete/"""

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, item_id, *args, **kwargs):
        entity = getattr(request.user, "entity", None)
        if not entity or not entity.is_active:
            return Response(
                {"error": "No active entity."},
                status=status.HTTP_404_NOT_FOUND,
            )

        item = RetailerIndentItem.objects.filter(
            id=item_id, entity=entity, retailer_indent__is_open="true"
        ).first()
        if not item:
            return Response(
                {"error": "Indent item not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        item.delete()
        _fire_refresh(entity.id)

        return Response(
            {"status": "deleted", "id": str(item_id)},
            status=status.HTTP_200_OK,
        )


class RetailerIndentItemCreateView(APIView):
    """POST /api/v1/retailers/indents/<indent_id>/items/"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, indent_id, *args, **kwargs):
        entity = getattr(request.user, "entity", None)
        if not entity or not entity.is_active:
            return Response(
                {"error": "No active entity."},
                status=status.HTTP_404_NOT_FOUND,
            )

        indent = RetailerIndent.objects.filter(
            id=indent_id, entity=entity, is_open="true"
        ).first()
        if not indent:
            return Response(
                {"error": "Indent not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        receipt_id = request.data.get("wholesale_receipt")
        try:
            quantity = int(request.data.get("required_quantity", 0))
        except (TypeError, ValueError):
            quantity = 0

        if quantity <= 0:
            return Response(
                {"error": "required_quantity must be > 0"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        receipt = WholesalerReceipts.objects.filter(
            id=receipt_id, current_unit_quantity__gt=0
        ).first()
        if not receipt:
            return Response(
                {"error": "Wholesale receipt not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        existing = RetailerIndentItem.objects.filter(
            retailer_indent=indent,
            wholesale_receipt=receipt,
            entity=entity,
        ).first()

        if existing:
            existing.required_quantity = quantity
            existing.total_quantity = quantity
            existing.source = IndentItemSource.USER_ADDED
            existing.save(update_fields=[
                "required_quantity", "total_quantity", "source",
            ])
            _fire_refresh(entity.id)
            return Response(
                RetailerIndentItemsSerializer(existing).data,
                status=status.HTTP_200_OK,
            )

        unit_price = receipt.final_unit_selling_price or 0

        # NB: `final_unit_price` and `item_gross_total_amount` are model
        # @property values, not DB columns. `supplier_unit_selling_price`
        # is the persisted price input; the model's recalculate() derives
        # the rest.
        item = RetailerIndentItem.objects.create(
            entity=entity,
            owner=request.user,
            retailer_indent=indent,
            wholesale_receipt=receipt,
            required_quantity=quantity,
            total_quantity=quantity,
            supplier_unit_selling_price=unit_price,
            source=IndentItemSource.USER_ADDED,
        )
        _fire_refresh(entity.id)

        return Response(
            RetailerIndentItemsSerializer(item).data,
            status=status.HTTP_201_CREATED,
        )


class RetailerIndentItemParamsUpdateView(APIView):
    """PATCH /retailers/indent-items/<uuid:item_id>/params/"""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, item_id, *args, **kwargs):
        user = request.user

        item = get_object_or_404(
            RetailerIndentItem, id=item_id, entity=user.entity
        )

        if (
            item.retailer_indent
            and item.retailer_indent.is_open == "false"
        ):
            return Response(
                {"detail": "This indent is closed and cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RetailerIndentItemParamsUpdateSerializer(
            data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "wholesale_receipt" in data:
            receipt_id = data.pop("wholesale_receipt")
            if receipt_id is None:
                item.wholesale_receipt = None
            else:
                receipt = WholesalerReceipts.objects.filter(
                    id=receipt_id
                ).first()
                if receipt is None:
                    return Response(
                        {"detail": "Wholesale receipt not found."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                item.wholesale_receipt = receipt

        if "wholesaler_price_discount" in data:
            discount_id = data.pop("wholesaler_price_discount")
            if discount_id is None:
                item.wholesaler_price_discount = None
            else:
                discount = models.WholesalerPriceDiscounts.objects.filter(
                    id=discount_id
                ).first()
                if discount is None:
                    return Response(
                        {"detail": "Price discount not found."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                item.wholesaler_price_discount = discount

        if "wholesaler_quantity_discount" in data:
            discount_id = data.pop("wholesaler_quantity_discount")
            if discount_id is None:
                item.wholesaler_quantity_discount = None
            else:
                discount = models.WholesalerQuantityDiscounts.objects.filter(
                    id=discount_id
                ).first()
                if discount is None:
                    return Response(
                        {"detail": "Quantity discount not found."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                item.wholesaler_quantity_discount = discount

        if "required_quantity" in data:
            item.required_quantity = data["required_quantity"]
        if "source" in data:
            item.source = data["source"]
        if "supplier_unit_selling_price" in data:
            item.supplier_unit_selling_price = data["supplier_unit_selling_price"]
        if "recommended_retail_price" in data:
            item.recommended_retail_price = data["recommended_retail_price"]

        try:
            item.save()
        except IntegrityError:
            return Response(
                {"detail": "Another line on this indent already uses that receipt."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.refresh_from_db()

        return Response(
            {
                "status": "accepted",
                "item_id": str(item.id),
                "indent_id": (
                    str(item.retailer_indent_id)
                    if item.retailer_indent_id else None
                ),
                "params": {
                    "required_quantity": item.required_quantity,
                    "source": item.source,
                    "supplier_unit_selling_price": (
                        str(item.supplier_unit_selling_price)
                        if item.supplier_unit_selling_price is not None
                        else None
                    ),
                    "recommended_retail_price": (
                        str(item.recommended_retail_price)
                        if item.recommended_retail_price is not None
                        else None
                    ),
                    "markup_percentage_used": (
                        str(item.markup_percentage_used)
                        if item.markup_percentage_used is not None
                        else None
                    ),
                    "total_quantity": item.total_quantity,
                    "bonus_quantity_earned": item.bonus_quantity_earned,
                    "bonus_blocks_earned": item.bonus_blocks_earned,
                    "final_unit_price": (
                        str(item.final_unit_price)
                        if item.final_unit_price is not None else None
                    ),
                    "item_net_total_amount": (
                        str(item.item_net_total_amount)
                        if item.item_net_total_amount is not None else None
                    ),
                },
            },
            status=status.HTTP_202_ACCEPTED,
        )


# ===========================================================================
# Product requests
# ===========================================================================

@api_view(["POST"])
@permission_classes(
    [EntitySubscriptionPermission, permissions.IsAuthenticated]
)
def productRequestsAPIView(request):
    action = request.data.get("action")
    if not action:
        raise exceptions.ValidationError("Action is not supplied")

    result = product_requests_dispatch(request.user, request.data, request)

    if result[0] == "paginated":
        _, page_data = result
        return Response(page_data)

    if result[0] == "success":
        _, message, payload, payload_key = result
        return custom_success_message(0, message, payload, payload_key)

    _, message, errors = result
    return custom_errors_response(1, message, errors)