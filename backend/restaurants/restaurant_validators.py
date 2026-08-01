# from .models import FoodOrder
from rest_framework import exceptions
from . import models
from authentication.utils.utils import use_reference_number


def validate_reference_number(reference_number):
    if FoodOrder.objects.filter(reference_number=reference_number).exists():
        use_reference_number(reference_number)
        raise exceptions.ValidationError("Reference number already used")
    else:
        return reference_number
    
def validate_food_order(id):
    errors =[]
    if models.BranchFoodOrder.objects.filter(id=id).exists():
        return  models.BranchFoodOrder.objects.filter(id=id).first()
    else:
        raise exceptions.ValidationError("Food order with provided ID does not exist")


def validate_branch(branch_id, user):
    if models.EntityBranches.objects.filter(id=branch_id).exists():
        return models.EntityBranches.objects.filter(id=branch_id).first()
    else:
        raise exceptions.ValidationError("Branch with supplied ID does not exist")
    
def validate_menu(menu_id):
    if models.Menu.objects.filter(id=menu_id).exists():
        return models.Menu.objects.filter(id=menu_id).first()
    else:
        raise exceptions.ValidationError("Menu with supplied ID does not exist")
    

def validate_menu_item(menu_item_id):
    if models.MenuItem.objects.filter(id=menu_item_id).exists():
        return models.MenuItem.objects.filter(id=menu_item_id).first()
    else:
        raise exceptions.ValidationError("Menu item with supplied ID does not exist")

def validate_food_item(food_item_id):
    if models.BranchFoodItem.objects.filter(id=food_item_id).exists():
        return models.BranchFoodItem.objects.filter(id=food_item_id).first()
    else:
        raise exceptions.ValidationError("Food item with supplied ID does not exist")
    

def validate_bar_inventory(inventory_id):
    if models.BarInventory.objects.filter(id=inventory_id).exists():
        return models.BarInventory.objects.filter(id=inventory_id).first()
    else:
        raise exceptions.ValidationError("Bar inventory with supplied ID does not exist")
    

def validate_branch_table(table_id):
    if models.BranchTable.objects.filter(id=table_id).exists():
        return models.BranchTable.objects.filter(id=table_id).first()
    else:
        raise exceptions.ValidationError("Table with supplied ID does not exist")
    
def validate_room(room_id):
    if models.BranchRoom.objects.filter(id=room_id).exists():
        return models.BranchRoom.objects.filter(id=room_id).first()
    else:
        raise exceptions.ValidationError("Room with supplied ID does not exist")
