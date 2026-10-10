from rest_framework.pagination import PageNumberPagination
from rest_framework import permissions, exceptions
from rest_framework.decorators import api_view, permission_classes

from .utils import entity_expenses_utils
from . import serializers, models
from core.responses import custom_success_message, custom_errors_response


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def entityExpensesAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    # ------------------------------------------------------------------
    # Categories
    # ------------------------------------------------------------------

    if action == "CreateEntityExpenseCategory":
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

        return custom_errors_response(
            1, "Entity expense category could not created", errors
        )

    elif action == "UpdateEntityExpenseCategory":
        """Update an existing entity expense category"""
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

        return custom_errors_response(
            1, "Entity expense category could not updated", errors
        )

    elif action == "DeleteEntityExpenseCategory":
        """Delete an existing entity expense category"""
        errors, deleted = entity_expenses_utils.delete_entity_expense_category(
            request.data, request.user
        )

        if deleted:
            return custom_success_message(
                0,
                "Entity expense category deleted successfully",
                None,
                "entity_expense",
            )

        return custom_errors_response(
            1, "Entity expense category could not be deleted", errors
        )

    elif action == "GetEntityExpenseCategories":
        """Get entity expense categories for the user's entity"""
        categories = entity_expenses_utils.get_entity_expense_categories(request.user)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.EntityExpenseCategoriesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    # ------------------------------------------------------------------
    # Expenses
    # ------------------------------------------------------------------

    elif action == "CreateEntityExpense":
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

        return custom_errors_response(1, "Entity expense could not created", errors)

    elif action == "DeleteEntityExpense":
        """Delete an existing entity expense"""
        errors, deleted = entity_expenses_utils.delete_entity_expense(
            request.data, request.user
        )

        if deleted:
            return custom_success_message(
                0,
                "Expense deleted successfully",
                None,
                "entity_expense",
            )

        return custom_errors_response(
            1, "Entity expense could not be deleted", errors
        )

    elif action == "GetEntityExpenses":
        """Get entity expenses for the user's entity"""
        entity_expenses = models.EntityExpenses.objects.filter(
            entity=request.user.entity
        ).order_by("-created")

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_expenses, request)
        serializer = serializers.EntityExpensesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)

    else:
        raise exceptions.ValidationError(f"Action {action} is unknown")