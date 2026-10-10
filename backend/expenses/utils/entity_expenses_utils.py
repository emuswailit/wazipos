from .. import models


def create_entity_expense_category(data, user):
    errors = []
    title = data.get("title")
    description = data.get("description")
    created_by = user

    if not title:
        errors.append("Title is required")
    elif models.EntityExpenseCategories.objects.filter(title=title.upper()).exists():
        errors.append("Title must be unique")

    if errors:
        return errors, None

    entity_expense = models.EntityExpenseCategories.objects.create(
        title=title,
        description=description,
        created_by=created_by,
        entity=user.entity
    )

    return None, entity_expense

def update_entity_expense_category(data, user):
    errors = []
    category_id = data.get("expense_category")
    title = data.get("title")
    description = data.get("description")

    if not category_id:
        errors.append("Category ID is required")
        return errors, None

    try:
        entity_expense_category = models.EntityExpenseCategories.objects.get(id=category_id)
    except models.EntityExpenseCategories.DoesNotExist:
        errors.append("Entity expense category not found")
        return errors, None

    if title:
        if models.EntityExpenseCategories.objects.filter(title=title.upper()).exclude(id=category_id).exists():
            errors.append("Title must be unique")
        else:
            entity_expense_category.title = title

    if description is not None:
        entity_expense_category.description = description

    if errors:
        return errors, None

    entity_expense_category.save()
    return None, entity_expense_category


def get_entity_expense_categories(user):
    entity = user.entity
    if not entity:
        return []
    return models.EntityExpenseCategories.objects.all().order_by('title')


def create_entity_expense(data,user):
    errors =[]
    description=""
    amount=None
    expense_date=None
    if not "expense_category" in data or not data["expense_category"]:
        errors.append ("Expense category is required")
        return errors,None
    if not "amount" in data or not data["amount"]:
        errors.append ("Amount is required")
        return errors,None
    else:
        amount=data["amount"]

    if  "description" in data and not data["description"]=="":
        description=data["description"]

    if  "expense_date" in data and not data["expense_date"]=="":
        expense_date=data["expense_date"]

    if len(errors)>0:
        return errors,None

    entity_expense_category = models.EntityExpenseCategories.objects.get(id=data["expense_category"])
    entity_expense = models.EntityExpense.objects.create(
        expense_category=entity_expense_category,
        amount=amount,
        description=description,
        owner=user,
        entity=user.entity,
        expense_date=expense_date
    )
    return errors,entity_expense


# expenses/utils/entity_expenses_utils.py
#
# Existing imports at the top of the file probably already include:
#     from expenses import models
# If not, add it.

def delete_entity_expense_category(data, user):
    """
    Delete an entity expense category owned by the caller's entity.

    Returns (errors, deleted) where:
      - deleted = the deleted object on success, else None
      - errors  = list of error strings on failure
    """
    errors = []

    category_id = (
        data.get("entity_expense_category")
        or data.get("id")
    )
    if not category_id:
        errors.append("entity_expense_category is required")
        return errors, None

    try:
        category = models.EntityExpenseCategories.objects.get(
            id=category_id,
            entity=user.entity,
        )
    except models.EntityExpenseCategories.DoesNotExist:
        errors.append("Category not found")
        return errors, None
    except Exception as e:
        errors.append(str(e))
        return errors, None

    # -----------------------------------------------------------------
    # SAFETY: EntityExpenses.expense_category has on_delete=CASCADE,
    # so deleting this category will silently delete every expense
    # that points at it. If that's not what you want, either:
    #   (a) block deletion when the category is in use (uncomment the
    #       guard below), or
    #   (b) change the FK to models.SET_NULL in the model and keep
    #       `null=True, blank=True`.
    # -----------------------------------------------------------------
    # in_use = models.EntityExpenses.objects.filter(
    #     expense_category=category,
    # ).exists()
    # if in_use:
    #     errors.append(
    #         "Cannot delete a category that is still used by expenses."
    #     )
    #     return errors, None

    category.delete()
    return errors, category


def delete_entity_expense(data, user):
    """
    Delete an entity expense owned by the caller's entity.

    Returns (errors, deleted).
    """
    errors = []

    expense_id = (
        data.get("entity_expense")
        or data.get("id")
    )
    if not expense_id:
        errors.append("entity_expense is required")
        return errors, None

    try:
        expense = models.EntityExpenses.objects.get(
            id=expense_id,
            entity=user.entity,
        )
    except models.EntityExpenses.DoesNotExist:
        errors.append("Expense not found")
        return errors, None
    except Exception as e:
        errors.append(str(e))
        return errors, None

    expense.delete()
    return errors, expense


# ----------------------------------------------------------------------
# Update / Delete: EntityExpenseCategory
# ----------------------------------------------------------------------

def update_entity_expense_category(data, user):
    """
    Update an entity expense category owned by the caller's entity.
    Only the fields present in `data` are changed.

    Returns (errors, category).
    """
    errors = []

    category_id = data.get("entity_expense_category") or data.get("id")
    if not category_id:
        errors.append("entity_expense_category is required")
        return errors, None

    try:
        category = models.EntityExpenseCategories.objects.get(
            id=category_id,
            entity=user.entity,
        )
    except models.EntityExpenseCategories.DoesNotExist:
        errors.append("Category not found")
        return errors, None
    except Exception as e:
        errors.append(str(e))
        return errors, None

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            errors.append("title cannot be empty")
            return errors, None
        category.title = title.upper()

    if "description" in data:
        category.description = data.get("description") or None

    if "is_recurrent" in data:
        category.is_recurrent = str(data.get("is_recurrent") or "false")

    if "recurrence_period" in data:
        period = data.get("recurrence_period")
        if category.is_recurrent == "true" and period:
            category.recurrence_period = period
        else:
            category.recurrence_period = None

    category.updated_by = user
    category.save()
    return errors, category


def delete_entity_expense_category(data, user):
    """
    Delete an entity expense category owned by the caller's entity.

    WARNING: EntityExpenses.expense_category has on_delete=CASCADE.
    Deleting a category will also delete every expense that points
    at it. If that is not what you want, switch the FK to SET_NULL
    or enable the in-use guard below.

    Returns (errors, deleted).
    """
    errors = []

    category_id = data.get("entity_expense_category") or data.get("id")
    if not category_id:
        errors.append("entity_expense_category is required")
        return errors, None

    try:
        category = models.EntityExpenseCategories.objects.get(
            id=category_id,
            entity=user.entity,
        )
    except models.EntityExpenseCategories.DoesNotExist:
        errors.append("Category not found")
        return errors, None
    except Exception as e:
        errors.append(str(e))
        return errors, None

    # Uncomment to block deletion of in-use categories.
    # if models.EntityExpenses.objects.filter(expense_category=category).exists():
    #     errors.append(
    #         "Cannot delete a category that is still used by expenses."
    #     )
    #     return errors, None

    category.delete()
    return errors, category


# ----------------------------------------------------------------------
# Update / Delete: EntityExpense
# ----------------------------------------------------------------------

def update_entity_expense(data, user):
    """
    Update an entity expense owned by the caller's entity.
    Only fields present in `data` are changed. Passing
    `expense_category: null` (or "") clears the category.

    Returns (errors, expense).
    """
    errors = []

    expense_id = data.get("entity_expense") or data.get("id")
    if not expense_id:
        errors.append("entity_expense is required")
        return errors, None

    try:
        expense = models.EntityExpenses.objects.get(
            id=expense_id,
            entity=user.entity,
        )
    except models.EntityExpenses.DoesNotExist:
        errors.append("Expense not found")
        return errors, None
    except Exception as e:
        errors.append(str(e))
        return errors, None

    if "expense_category" in data:
        category_id = data.get("expense_category")
        if category_id:
            try:
                category = models.EntityExpenseCategories.objects.get(
                    id=category_id,
                    entity=user.entity,
                )
                expense.expense_category = category
            except models.EntityExpenseCategories.DoesNotExist:
                errors.append("Category not found")
                return errors, None
        else:
            expense.expense_category = None

    if "expense_date" in data:
        expense.expense_date = data.get("expense_date") or None

    if "amount" in data:
        try:
            expense.amount = data.get("amount") or 0
        except (TypeError, ValueError):
            errors.append("amount must be a number")
            return errors, None

    if "description" in data:
        expense.description = data.get("description") or None

    if errors:
        return errors, None

    expense.save()
    return errors, expense


def delete_entity_expense(data, user):
    """
    Delete an entity expense owned by the caller's entity.

    Returns (errors, deleted).
    """
    errors = []

    expense_id = data.get("entity_expense") or data.get("id")
    if not expense_id:
        errors.append("entity_expense is required")
        return errors, None

    try:
        expense = models.EntityExpenses.objects.get(
            id=expense_id,
            entity=user.entity,
        )
    except models.EntityExpenses.DoesNotExist:
        errors.append("Expense not found")
        return errors, None
    except Exception as e:
        errors.append(str(e))
        return errors, None

    expense.delete()
    return errors, expense