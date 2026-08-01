from .. import models
from rest_framework import exceptions


def validate_employee(user):

    if not models.Employees.objects.filter(user=user, entity=user.entity).exists():
        return None
    else:
        return models.Employees.objects.filter(user=user, entity=user.entity).first()

def validate_employee_by_id(employee_id,user):

    if not models.Employees.objects.filter(id=employee_id, entity =user.entity).exists():
        raise exceptions.ValidationError(
            "Employee details for this user does not exist")
    else:
        return models.Employees.objects.filter(id=employee_id,entity=user.entity).first()
def validate_employee_by_id_only(employee_id):

    if not models.Employees.objects.filter(id=employee_id).exists():
        raise exceptions.ValidationError(
            "Employee details for this user does not exist")
    else:
        return models.Employees.objects.filter(id=employee_id).first()

def validate_entity_employee(id, entity):

    if not models.Employees.objects.filter(id=id, entity=entity).exists():
        raise exceptions.ValidationError(
            f"Employee details for this ID does not exist at {entity}")
    else:
        return models.Employees.objects.filter(id=id, entity=entity).first()
    
def validate_employee_by_user_and_entity(user, entity):

    if not models.Employees.objects.filter(user=user, entity=entity).exists():
        raise exceptions.ValidationError(
            f"Employee {user} does not exist {entity}")
    else:
        return models.Employees.objects.filter(user=user, entity=entity).first()
    
def retrieve_employee_by_user_and_entity(user, entity):

    if not models.Employees.objects.filter(user=user, entity=entity).exists():
        return None
    else:
        return models.Employees.objects.filter(user=user, entity=entity).first()


