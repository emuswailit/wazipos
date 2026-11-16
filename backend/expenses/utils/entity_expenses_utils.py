from .. import models
from django.db import IntegrityError

# ----------------------------------------------------------------------
# CREATE / UPDATE / DELETE / GET: EntityExpenseCategory
# ----------------------------------------------------------------------

def create_entity_expense_category(data, user):
    errors = []
    title = data.get("title")
    description = data.get("description")
    is_recurrent = str(data.get("is_recurrent", "false")).lower()
    recurrence_period = data.get("recurrence_period") if is_recurrent == "true" else None

    if not title:
        errors.append("Title is required")
    elif models.EntityExpenseCategories.objects.filter(title=title.upper(), entity=user.entity).exists():
        errors.append("Title must be unique")

    if errors:
        return errors, None

    try:
        entity_expense = models.EntityExpenseCategories.objects.create(
            title=title.upper(),
            description=description,
            is_recurrent=is_recurrent,
            recurrence_period=recurrence_period,
            created_by=user,
            entity=user.entity
        )
        return None, entity_expense
    except Exception as e:
        return [str(e)], None


def update_entity_expense_category(data, user):
    errors = []
    category_id = data.get("entity_expense_category") or data.get("id")

    if not category_id:
        return ["Category ID is required"], None

    try:
        category = models.EntityExpenseCategories.objects.get(id=category_id, entity=user.entity)
    except models.EntityExpenseCategories.DoesNotExist:
        return ["Entity expense category not found"], None
    except Exception as e:
        return [str(e)], None

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return ["Title cannot be empty"], None
        
        if models.EntityExpenseCategories.objects.filter(title=title.upper(), entity=user.entity).exclude(id=category_id).exists():
            return ["Title must be unique"], None
            
        category.title = title.upper()

    if "description" in data:
        category.description = data.get("description") or None

    if "is_recurrent" in data:
        category.is_recurrent = str(data.get("is_recurrent") or "false").lower()

    if "recurrence_period" in data:
        period = data.get("recurrence_period")
        if category.is_recurrent == "true" and period:
            category.recurrence_period = period
        else:
            category.recurrence_period = None

    category.updated_by = user
    category.save()
    return None, category


def delete_entity_expense_category(data, user):
    errors = []
    category_id = data.get("entity_expense_category") or data.get("id")

    if not category_id:
        return ["entity_expense_category is required"], None

    try:
        category = models.EntityExpenseCategories.objects.get(id=category_id, entity=user.entity)
    except models.EntityExpenseCategories.DoesNotExist:
        return ["Category not found"], None
    except Exception as e:
        return [str(e)], None

    # SAFETY WARNING: If EntityExpenses has on_delete=CASCADE, this will delete all related expenses.
    # Uncomment the block below to prevent deletion if the category is currently in use.
    # if models.EntityExpenses.objects.filter(expense_category=category).exists():
    #     return ["Cannot delete a category that is still used by expenses."], None

    category.delete()
    return None, category


def get_entity_expense_categories(user):
    if not user.entity:
        return []
    # FIXED: Was previously returning categories for ALL entities. Now scoped to the user's entity.
    return models.EntityExpenseCategories.objects.filter(entity=user.entity).order_by('title')


# ----------------------------------------------------------------------
# CREATE / UPDATE / DELETE: EntityExpense
# ----------------------------------------------------------------------

def create_entity_expense(data, user):
    errors = []
    description = data.get("description", "")
    amount = data.get("amount")
    expense_date = data.get("expense_date")
    category_id = data.get("expense_category")

    if not category_id:
        return ["Expense category is required"], None
    if not amount:
        return ["Amount is required"], None

    try:
        # Ensure the category actually belongs to this user's entity
        entity_expense_category = models.EntityExpenseCategories.objects.get(id=category_id, entity=user.entity)
    except models.EntityExpenseCategories.DoesNotExist:
        return ["Selected expense category not found"], None
    except Exception as e:
        return [str(e)], None

    try:
        # FIXED: Changed from models.EntityExpense to models.EntityExpenses
        entity_expense = models.EntityExpenses.objects.create(
            expense_category=entity_expense_category,
            amount=amount,
            description=description,
            owner=user,
            entity=user.entity,
            expense_date=expense_date if expense_date else None
        )
        return None, entity_expense
    except Exception as e:
        return [str(e)], None


def update_entity_expense(data, user):
    errors = []
    expense_id = data.get("entity_expense") or data.get("id")

    if not expense_id:
        return ["entity_expense is required"], None

    try:
        expense = models.EntityExpenses.objects.get(id=expense_id, entity=user.entity)
    except models.EntityExpenses.DoesNotExist:
        return ["Expense not found"], None
    except Exception as e:
        return [str(e)], None

    # -------------------- Category --------------------
    raw = data.get("expense_category")
    incoming = str(raw).strip() if raw not in (None, "") else ""

    if not incoming:
        return ["Please select a category."], None

    current = str(expense.expense_category_id) if expense.expense_category_id else ""

    if incoming != current:
        # Try finding by ID first, then by Title
        category = models.EntityExpenseCategories.objects.filter(id=incoming, entity=user.entity).first()
        if not category:
            category = models.EntityExpenseCategories.objects.filter(title__iexact=incoming, entity=user.entity).first()

        if not category:
            return [f"Category not found for value '{incoming}'."], None

        expense.expense_category = category

    # -------------------- Scalar fields --------------------
    if "expense_date" in data:
        expense.expense_date = data.get("expense_date") or None

    if "amount" in data:
        try:
            expense.amount = data.get("amount") or 0
        except (TypeError, ValueError):
            return ["amount must be a number"], None

    if "description" in data:
        expense.description = data.get("description") or None

    expense.save()
    return None, expense


def delete_entity_expense(data, user):
    errors = []
    expense_id = data.get("entity_expense") or data.get("id")

    if not expense_id:
        return ["entity_expense is required"], None

    try:
        expense = models.EntityExpenses.objects.get(id=expense_id, entity=user.entity)
    except models.EntityExpenses.DoesNotExist:
        return ["Expense not found"], None
    except Exception as e:
        return [str(e)], None

    expense.delete()
    return None, expense