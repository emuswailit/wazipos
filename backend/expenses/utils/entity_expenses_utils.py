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