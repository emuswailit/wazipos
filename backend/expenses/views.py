from rest_framework.pagination import PageNumberPagination
from rest_framework import generics, permissions, response, status, exceptions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from .utils import expenses_utils,entity_expenses_utils
from . import serializers, models
from core.responses import custom_success_message, custom_errors_response,custom_error_response

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def wishlistsAPIView(request):
    customer_orders = []
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")


    if request.data["action"] == "CreateWishList":
        """Create a new wish list for the user"""

        errors, wish_list = expenses_utils.create_wish_list(
            request.data, request.user
        )

        if wish_list:
            serializer = serializers.WishListSerializer(
                wish_list, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Wishlist created successfully",
                serializer.data,
                "wish_list",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Wishlist could not created",errors)
        
    elif request.data["action"] == "GetWishLists":
        """Get all wish lists for the user"""
        wish_lists = expenses_utils.get_user_wish_lists(request.user)

        serializer = serializers.WishListSerializer(
            wish_lists, many=True, context={"request": request}
        )
        return custom_success_message(
            0, "Wish lists retrieved successfully", serializer.data, "wish_lists"
        )
    elif request.data["action"] == "CloseWishList":
        """Close an open wish list for the user"""

        
        errors, wish_list = expenses_utils.close_wishlist(
            request.data, request.user
        )

        if wish_list:
            serializer = serializers.WishListSerializer(
                wish_list, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Wishlist closed successfully",
                serializer.data,
                "wish_list",
            )
        else:
            return custom_errors_response(1,"Wishlist could not be closed",errors)
    elif request.data["action"] == "UpdateWishList":
        """Update an existing wish list for the user"""

        
        errors, wish_list = expenses_utils.update_wish_list(
            request.data, request.user
        )

        if wish_list:
            serializer = serializers.WishListSerializer(
                wish_list, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Wishlist updated successfully",
                serializer.data,
                "wish_list",
            )
        else:
            return custom_errors_response(1,"Wishlist could not updated",errors)
    elif request.data["action"] == "DeleteWishList":
        """Delete an existing wish list for the user"""
        
        errors, deleted = expenses_utils.delete_wish_list(
            request.data, request.user
        )

        if deleted:
    
            return custom_error_response(
                0,
                "Wishlist deleted successfully",
           
            )
        else:
            return custom_errors_response(1,"Wishlist could not deleted",errors)
    elif request.data["action"] == "CreateWishListProduct":
        """Create a new item in the wish list"""
        
        errors, wish_list = expenses_utils.create_wish_list_product(
            request.data, request.user
        )

        if wish_list:
            serializer = serializers.WishListSerializer(
                wish_list, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Wish list product created successfully",
                serializer.data,
                "wish_list",
            )
        else:
            return custom_errors_response(1,"Wish list product could not created",errors)
        
    elif request.data["action"] == "UpdateWishListProduct":
        """Update an existing item in the wish list"""
        
        errors, wish_list_product = expenses_utils.update_wish_list_product(
            request.data, request.user
        )

        if wish_list_product:
            serializer = serializers.WishListProductsSerializer(
                wish_list_product, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Wish list item updated successfully",
                serializer.data,
                "wish_list_product",
            )
        else:
            return custom_errors_response(1,"Wish list product could not updated",errors)
        
    elif request.data["action"] == "DeleteWishListProduct":
        """Delete an item from the wish list"""
        
        errors, deleted = expenses_utils.delete_wish_list_product(
            request.data, request.user
        )

        if deleted:
      
            return custom_error_response(
                0,
                "Wish list product deleted successfully",
          
            )
        else:
            return custom_errors_response(1,"Wish list product could not deleted",errors)
        

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def entityExpensesAPIView(request):
    customer_orders = []
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")


    if request.data["action"] == "CreateEntityExpenseCategory":
        """Create a new entity expense category"""

        errors, entity_expense = entity_expenses_utils.create_entity_expense_category(
            request.data, request.user
        )

        if entity_expense:
            serializer = serializers.EntityExpenseCategoriesSerializer(
                entity_expense, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity expense category created successfully",
                serializer.data,
                "entity_expense",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Entity expense category could not created",errors)
        
    elif request.data["action"] == "UpdateEntityExpenseCategory":
        """Get all entity expenses for user entity"""
        errors, entity_expense = entity_expenses_utils.update_entity_expense_category(
            request.data, request.user
        )

        if entity_expense:
            serializer = serializers.EntityExpenseCategoriesSerializer(
                entity_expense, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity expense category updated successfully",
                serializer.data,
                "entity_expense",
            )
        else:
            return custom_errors_response(1,"Entity expense category could not updated",errors)
        

   
    elif request.data["action"] == "GetEntityExpenseCategories":
        """Get entity expenses for the user entity and user"""
        categories = entity_expenses_utils.get_entity_expense_categories(request.user)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.EntityExpenseCategoriesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "CreateEntityExpense":
            """Create a new entity expense"""

            errors, entity_expense = entity_expenses_utils.create_entity_expense(
                request.data, request.user
            )

            if entity_expense:
                serializer = serializers.EntityExpensesSerializer(
                    entity_expense, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Expense created successfully",
                    serializer.data,
                    "entity_expense",
                )
            else:
                return custom_errors_response(1,"Entity expense could not created",errors)
        
        
   
    elif request.data["action"] == "GetEntityExpenses":
        """Get entity expense subscriptions for the user entity"""
        entity_expenses = models.EntityExpense.objects.filter(entity=request.user.entity).order_by('-created')

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_expenses, request)
        serializer = serializers.EntityExpensesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

