from django.db import IntegrityError
from django.shortcuts import render
from rest_framework import generics, permissions, response, status, exceptions
from rest_framework.decorators import api_view, permission_classes
from authentication.serializers import EntityBranchSerializer, UsersSerializer
from authentication.models import Roles
from rest_framework.parsers import MultiPartParser, FormParser
from decouple import config
from rest_framework.response import Response
from django.contrib.auth import authenticate, login
from retailers import customer_order_responses
from restaurants.restaurant_validators import validate_menu
from core import app_permissions
from employees.validators.employees_models_validators import validate_employee
from core.responses import (
    custom_json_response,
    custom_success_message,
    custom_error_response,
    custom_errors_response,
    custom_plain_response,
)
import jwt
from . import models, serializers
from rest_framework.pagination import PageNumberPagination
from . import restaurant_utils, restaurant_payment_utils
from django.http import JsonResponse
from authentication.validators import authentication_models_validators
from authentication.utils import utils
from payments.serializers import PaymentMethodsSerializer
from django.shortcuts import get_object_or_404


@api_view(["POST"])
@permission_classes([app_permissions.AdminsOnlyPermissions])
def restaurantsAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetBranchCollectionAccountData":
        errors, data = restaurant_payment_utils.retrieve_branch_collection_account_data( request.user)
        if data:
        
            return custom_json_response(0, "Collection account data retrieved","data",data)
        else:
            return custom_errors_response(1, "Collection account data  not retrieved", errors)

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def restaurantsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateRestaurantBranch":
        errors, restaurant_branch = restaurant_utils.create_restaurant_branch(request.data, request.user)
        if restaurant_branch:
            serializer = EntityBranchSerializer(
                restaurant_branch, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch created successfully", serializer.data, "branch"
            )
        else:
            return custom_errors_response(1, "Restaurant branch could not be created",errors)
    elif request.data["action"] == "UpdateRestaurantBranch":
        errors, restaurant_branch = restaurant_utils.update_restaurant_branch(request.data, request.user)
        if restaurant_branch:
            serializer = serializers.BranchsSerializer(
                restaurant_branch, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch updated successfully", serializer.data, "branch"
            )
        else:
            return custom_errors_response(1, "Restaurant branch could not be updated",errors)
    elif request.data["action"] == "GetRestaurantBranches":
        restaurant_branches = restaurant_utils.get_restaurants_branches(request.user)
        if restaurant_branches:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(restaurant_branches, request)
            serializer = EntityBranchSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No branches retrieved", [])
    elif request.data["action"] == "CreateBranchMenu":
        errors, restaurant_menu = restaurant_utils.create_branch_menu(request.data, request.user)
        if restaurant_menu:
            serializer = serializers.MenusSerializer(
                restaurant_menu, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch menu created successfully", serializer.data, "branch_menu"
            )
        else:
            return custom_errors_response(1, "Restaurant menu not created",errors)
    elif request.data["action"] == "UpdateBranchMenu":
        errors, branch_menu = restaurant_utils.update_branch_menu(request.data, request.user)
        if branch_menu:
            serializer = serializers.MenusSerializer(
                branch_menu, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch menu updated successfully", serializer.data, "branch_menu"
            )
        else:
            return custom_errors_response(1, "Restaurant menu could not be updated",errors)
    elif request.data["action"] == "GetBranchMenus":
        errors, branch_menus = restaurant_utils.get_user_branch_menus(request.user)
        if branch_menus:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(branch_menus, request)
            serializer = serializers.MenusSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No branch menus retrieved", errors)
    elif request.data["action"] == "CreateBranchMenuItem":
        errors, restaurant_menu = restaurant_utils.create_branch_menu_item(request.data, request.user)
        if restaurant_menu:
            serializer = serializers.MenuItemsSerializer(
                restaurant_menu, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch menu item created successfully", serializer.data, "branch_menu_item"
            )
        else:
            return custom_errors_response(1, "Branch menu item not created",errors)
    elif request.data["action"] == "UpdateBranchMenuItem":
        errors, branch_menu_item = restaurant_utils.update_branch_menu_item(request.data, request.user)
        if branch_menu_item:
            serializer = serializers.MenuItemsSerializer(
                branch_menu_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch menu item updated successfully", serializer.data, "branch_menu_item"
            )
        else:
            return custom_errors_response(1, "Restaurant menu item could not be updated",errors) 
    elif request.data["action"] == "GetBranchMenuItems":
        branch_menu_items = restaurant_utils.get_user_branch_menu_items(request.user)
        if branch_menu_items:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(branch_menu_items, request)
            serializer = serializers.MenuItemsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No branch menu items retrieved", [])
    elif request.data["action"] == "CreateBranchFoodItem":
        errors, branch_food_item = restaurant_utils.create_branch_food_item(request.data, request.user)
        if branch_food_item:
            serializer = serializers.BranchFoodItemSerializer(
                branch_food_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch food item created successfully", serializer.data, "branch_food_item"
            )
        else:
            return custom_errors_response(1, "Branch food item not created",errors)
    elif request.data["action"] == "UpdateBranchFoodItem":
        errors, branch_food_item = restaurant_utils.update_branch_food_item(request.data)
        if branch_food_item:
            serializer = serializers.BranchFoodItemSerializer(
                branch_food_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch food item updated successfully", serializer.data, "branch_food_item"
            )
        else:
            return custom_errors_response(1, "Restaurant menu item could not be updated",errors) 
    elif request.data["action"] == "GetUserBranchFoodItems":
        branch_food_item = restaurant_utils.get_user_branch_food_items(request.user)
        if branch_food_item:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(branch_food_item, request)
            serializer = serializers.BranchFoodItemSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No branch food items retrieved", [])
    elif request.data["action"] == "GetBranchFoodItems":
        branch_food_item = restaurant_utils.get_branch_food_items(request.user)
        if branch_food_item:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(branch_food_item, request)
            serializer = serializers.BranchFoodItemSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No branch food items retrieved", [])
    elif request.data["action"] == "CreateBranchTable":
        errors, branch_table = restaurant_utils.create_branch_table(request.data, request.user)
        if branch_table:
            serializer = serializers.TablesSerializer(
                branch_table, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch table created successfully", serializer.data, "branch_table"
            )
        else:
            return custom_errors_response(1, "Branch table not created",errors)
    elif request.data["action"] == "UpdateBranchTable":
        errors, branch_table = restaurant_utils.update_branch_table(request.data, request.user)
        if branch_table:
            serializer = serializers.TablesSerializer(
                branch_table, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Branch table updated successfully", serializer.data, "branch_table"
            )
        else:
            return custom_errors_response(1, "Branch table not updated",errors)
    elif request.data["action"] == "UpdateBranchFoodOrder":
        errors, food_order = restaurant_utils.update_branch_food_order(request.data, request.user)
        if food_order:
            serializer = serializers.FoodOrderSerializer(
                food_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Food order updated successfully", serializer.data, "food_order"
            )
        else:
            return custom_errors_response(1, "Food order not updated",errors)
        
    elif request.data["action"] == "GetBodabodaBranchFoodDeliveries":
        """Get customer orders"""

        bodaboda_deliveries = restaurant_utils.get_bodaboda_deliveries(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(bodaboda_deliveries, request)
        serializer = serializers.FoodOrderSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetUserBranchTables":
        branch_tables = restaurant_utils.get_user_branch_tables(request.user)
        if branch_tables:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(branch_tables, request)
            serializer = serializers.TablesSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No tables for entity retrieved", [])
    elif request.data["action"] == "GetUserBranchRooms":
        branch_rooms = restaurant_utils.get_user_branch_rooms(request.user)
        if branch_rooms:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(branch_rooms, request)
            serializer = serializers.BranchRoomSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No rooms for entity retrieved", [])
    elif request.data["action"] == "CreateBarInventory":
        errors, bar_inventory = restaurant_utils.create_bar_inventory(request.data, request.user)
        if bar_inventory:
            serializer = serializers.BarInventorySerializer(
                bar_inventory, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Bar inventory created successfully", serializer.data, "bar_inventory"
            )
        else:
            return custom_errors_response(1, "Bar inventory not created",errors)
    elif request.data["action"] == "UpdateBarInventory":
        errors, bar_inventory = restaurant_utils.update_bar_inventory(request.data, request.user)
        if bar_inventory:
            serializer = serializers.BarInventorySerializer(
                bar_inventory, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Bar inventory updated successfully", serializer.data, "bar_inventory"
            )
        else:
            return custom_errors_response(1, "Bar inventory not updated",errors)  
    elif request.data["action"] == "GetBranchBarInventory":
        errors, bar_inventory = restaurant_utils.get_branch_bar_inventory(request.user)
        if bar_inventory:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(bar_inventory, request)
            serializer = serializers.BarInventorySerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No bar inventory retrieved", errors)
    elif request.data["action"] == "GetAssignedBranches":
        assigned_branches = restaurant_utils.get_assigned_branches(request.user)
        if assigned_branches:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(assigned_branches, request)
            serializer = EntityBranchSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No branches retrieved", [])
    elif request.data["action"] == "GetBranchMenus":
        menus = restaurant_utils.get_branch_menus(
            request.data, request.data
        )
        if menus:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(menus, request)
            serializer = serializers.MenusSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No routes retrieved", [])
    elif request.data["action"] == "GetBranchMenuItems":
        menu_items = restaurant_utils.get_branch_menu_items(
            request.data, request.data
        )
        if menu_items:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(menu_items, request)
            serializer = serializers.MenuItemsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No menu items retrieved", [])
    elif request.data["action"] == "GetBranchInventory":
        errors, drinks = restaurant_utils.get_branch_drinks(
            request.data, request.data
        )
        if drinks:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(drinks, request)
            serializer = serializers.MenuItemsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No menu items retrieved", [])
    elif request.data["action"] == "CreateSingleFoodOrder":
        errors, food_order = restaurant_utils.create_single_food_order(request.data, request.user)
        if food_order:
            serializer = serializers.FoodOrderSerializer(
                food_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Food order created successfully", serializer.data, "food_order"
            )
        else:
            return custom_errors_response(1, "Food order payment could not be created", errors)
        
    elif request.data["action"] == "MakeFoodOrderPayment":
        """ Customer order payment"""
    
        errors, food_order = restaurant_utils.make_food_order_payment(
            request.data, request.user
        )
        if food_order:
            serializer =serializers.FoodOrderSerializer(
                food_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Food order payment made successfully",
                serializer.data,
                "customer_order",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Customer order payment process failed",errors)
    elif request.data["action"] == "GetUserFoodOrders":
        user_tickets = restaurant_utils.get_user_food_orders(request.user, request.data)
        if user_tickets:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(user_tickets, request)
            serializer = serializers.FoodOrderSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No orders food were retrieved", [])
    elif request.data["action"] == "GetFoodOrderDetails":
        food_order = None
        try:
            food_order_id = request.data["food_order_id"]
            if models.BranchFoodOrder.objects.filter(id=food_order_id).exists():
                food_order = models.BranchFoodOrder.objects.filter(
                    id=food_order_id
                ).first()
                serializer = serializers.FoodOrderSerializer(
                    food_order, many=False, context={"request": request}
                )
                return customer_order_responses.custom_success_message(
                    0,
                    "Food order retrieved successfully",
                    serializer.data,
                    "food_order",
                )
            else:
                return customer_order_responses.custom_error_response(
                    1, "Food order could not be retrieved"
                )

        except KeyError:
            raise exceptions.ValidationError("Customer order ID are required")
    elif request.data["action"] == "GetFoodOrdersPayments":
        food_order_payments = restaurant_utils.get_food_order_payments(request.user, request.data)
        if food_order_payments:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(food_order_payments, request)
            serializer = serializers.BranchFoodOrderPaymentsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No food order payments were retrieved", [])
    elif request.data["action"] == "GetFoodOrderPaymentSettlements":
        food_order_payments = restaurant_utils.get_food_order_payment_settlements(request.user, request.data)
        if food_order_payments:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(food_order_payments, request)
            serializer = serializers.FoodOrderPaymentSettlementsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No food order settlements retrieved", [])
    elif request.data["action"] == "CreateBarInventoryOrder":
        errors, bar_inventory_order = restaurant_utils.create_bar_inventory_order(request.data, request.user)
        if bar_inventory_order:
            serializer = serializers.BarInventoryOrderSerializer(
                bar_inventory_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Bar order created successfully", serializer.data, "bar_inventory_order"
            )
        else:
            return custom_errors_response(1, "Bar order not created",errors)
    elif request.data["action"] == "GetBarInventoryOrders":
        inventory_orders = restaurant_utils.get_bar_inventory_orders(request.user, request.data)
        if inventory_orders:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(inventory_orders, request)
            serializer = serializers.BarInventoryOrderSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No bar orders were retrieved", [])
    elif request.data["action"] == "GetOnlineBarInventoryOrders":
        inventory_orders = restaurant_utils.get_online_bar_inventory_orders(request.user, request.data)
        if inventory_orders:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(inventory_orders, request)
            serializer = serializers.BarInventoryOrderSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No bar orders were retrieved", [])
    elif request.data["action"] == "GetBarInventoryOrderPayments":
        inventory_order_payments = restaurant_utils.get_bar_inventory_order_payments(request.user, request.data)
        if inventory_order_payments:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(inventory_order_payments, request)
            serializer = serializers.BarInventoryOrderPaymentSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No bar order payments were retrieved", [])
    elif request.data["action"] == "GetBarInventoryOrderDetails":
        bar_inventory_order = None
        try:
            bar_inventory_order_id = request.data["bar_inventory_order_id"]
            if models.BarInventoryOrder.objects.filter(id=bar_inventory_order_id).exists():
                bar_inventory_order = models.BarInventoryOrder.objects.filter(
                    id=bar_inventory_order_id
                ).first()
                serializer = serializers.BarInventoryOrderSerializer(
                    bar_inventory_order, many=False, context={"request": request}
                )
                return customer_order_responses.custom_success_message(
                    0,
                    "Bar inventory order retrieved successfully",
                    serializer.data,
                    "bar_inventory_order",
                )
            else:
                return customer_order_responses.custom_error_response(
                    1, "Bar inventory order could not be retrieved"
                )

        except KeyError:
            raise exceptions.ValidationError("Customer order ID are required")
    elif request.data["action"] == "GetBarOrderPaymentSettlements":
        food_order_payments = restaurant_utils.get_bar_order_payment_settlements(request.user, request.data)
        if food_order_payments:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(food_order_payments, request)
            serializer = serializers.BarOrderPaymentSettlementsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No bar order settlements retrieved", [])
    elif request.data["action"] == "CheckInventoryStatusBatch":
        # Check inventory item availability
        bar_inventory=None
        bar_inventory_list=[]
        if "bar_inventory_items" in request.data and not request.data["bar_inventory_items"]=="":
            items= request.data["bar_inventory_items"]
            for item in items:
                bar_inventory_json={}
                if models.BarInventory.objects.filter(id=item).exists():
                    bar_inventory=models.BarInventory.objects.filter(id=item).first()
                    bar_inventory_json={
                        "id":bar_inventory.id,
                        "title":bar_inventory.product.title,
                        "pack_quantity": int(bar_inventory.pack_quantity),
                        "unit_quantity":int(bar_inventory.unit_quantity),
                        "pack_selling_price": float(bar_inventory.pack_selling_price),
                        "unit_selling_price":float(bar_inventory.unit_selling_price)
                    }
                    bar_inventory_list.append(bar_inventory_json)
                else:
                    pass
        if len(bar_inventory_list)>0:
            print("zikooo")
            return custom_json_response(0,"Stock status succesfully retrieved","bar_inventory",bar_inventory_list)

        else:
            print("Naumadc")
            return custom_error_response(1, "Stock status not retrieved")
    elif request.data["action"] == "CheckFoodInventoryStatusBatch":
        # Check inventory item availability
        bar_inventory=None
        food_inventory_list=[]
        if "food_inventory_items" in request.data and not request.data["food_inventory_items"]=="":
            items= request.data["food_inventory_items"]
            for item in items:
                food_inventory_json={}
                if models.BranchFoodItem.objects.filter(id=item).exists():
                    food_inventory=models.BranchFoodItem.objects.filter(id=item).first()
                    food_inventory_json={
                        "id":food_inventory.id,
                        "title":food_inventory.menu_item.title,
                        "quantity": int(food_inventory.quantity),
                        "price": float(food_inventory.price),
                        "preparation_date":food_inventory.preparation_date,
                        "expiry_date":food_inventory.expiry_date
                    }
                    food_inventory_list.append(food_inventory_json)
                else:
                    pass
        if len(food_inventory_list)>0:
            print("zikooo")
            return custom_json_response(0,"Food stock status succesfully retrieved","food_inventory",food_inventory_list)

        else:
            print("Naumadc")
            return custom_error_response(1, "Food stock status not retrieved")
    elif request.data["action"] == "CreateBranchAccommodationOrder":
        errors, accommodation_order = restaurant_utils.create_branch_accommodation_order(request.user, request.data)
        if accommodation_order:
            serializer = serializers.AccomodationOrderSerializer(
                accommodation_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Accommodation order created successfully", serializer.data, "accommodation_order"
            )
        else:
            return custom_errors_response(1, "Accommodation order not created",errors)
    elif request.data["action"] == "GetBranchAccommodationOrders":
        user_tickets = restaurant_utils.get_branch_accommodation_orders(request.user, request.data)
        if user_tickets:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(user_tickets, request)
            serializer = serializers.AccomodationOrderSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No accommodation orders retrieved", [])
    elif request.data["action"] == "GetBranchRoomBookings":
        user_tickets = restaurant_utils.get_branch_room_bookings(request.user, request.data)
        if user_tickets:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(user_tickets, request)
            serializer = serializers.BranchRoomBookingSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No branch bookings retrieved", [])
    elif request.data["action"] == "GenerateReferenceNumber":
        """Get all entities for admin users"""
        entity = None
        if request.data["entity_id"]:
            entity_id = request.data["entity_id"]
            entity = authentication_models_validators.validate_entity(entity_id)
            if entity:
                sequence = utils.generate_reference_number(entity, request.user)
                if sequence:
                    return Response(
                        data={
                            "reference_number": sequence,
                        },
                        status=status.HTTP_200_OK,
                    )
        else:
            raise exceptions.ValidationError("Entity ID is required")
    elif request.data["action"] == "GetAccommodationOrdersPayments":
        food_order_payments = restaurant_utils.get_accommodation_order_payments(request.user, request.data)
        if food_order_payments:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(food_order_payments, request)
            serializer = serializers.BranchFoodOrderPaymentsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No food order payments were retrieved", [])
    elif request.data["action"] == "GetAccommodatioPaymentSettlements":
        food_order_payments = restaurant_utils.get_accommodation_payment_settlements(request.user, request.data)
        if food_order_payments:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(food_order_payments, request)
            serializer = serializers.AccomodationOrderPaymentSettlementsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No accomodation settlements were retrieved", [])
    elif request.data["action"] == "GenerateBatchReferenceNumbers":
        """Get all entities for admin users"""

        sequences = utils.generate_batch_reference_number(request.data, request.user)
        if sequences:
            return JsonResponse(
                {
                    "response_code": 0,
                    "response_message": "References succesfully generated",
                    "reference_numbers": sequences,
                }
            )
        else:
            return custom_errors_response(1, "References not retrieved", [])
    elif request.data["action"] == "GetPaymentMethods":
        payment_methods = restaurant_utils.get_payment_methods()
        if payment_methods:
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(payment_methods, request)
            serializer = PaymentMethodsSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)
        else:
            return custom_errors_response(1, "No routes retrieved", [])
    else:
        return custom_errors_response(1, "Supplied action is unknown", [])


class LoginAPIView(generics.GenericAPIView):
    def get_serializer_class(self):
        return super().get_serializer_class()

    def post(self, request):
        current_employment = None
        phone_or_email = request.data.get("phone_or_email")
        password = request.data.get("password")
        user = authenticate(phone_or_email=phone_or_email, password=password)
        roles = []

        if user:
            # Retrieve only roles a user is currently assigned to and append to the login payload

            if user.is_staff:
                role = Roles.objects.filter(value="ADMIN").first()
                roles.append(role)

            else:
                user_roles = user.roles.all().filter(entity=user.entity)
                for user_role in user_roles:
                    roles.append(user_role)
                role = Roles.objects.filter(value="CLIENT").first()
                roles.append(role)

            login(request, user)
            decodeJTW = jwt.decode(
            user.tokens()["access"], config("SECRET_KEY"), algorithms=["HS256"]
                
            )

            return JsonResponse(
                data={
                    "tokens": user.tokens(),
                    "expires":decodeJTW['exp'],
                    "response_code": 0,
                    "response_message": "Log in was succesful",
                    "user": UsersSerializer(
                        user, many=False, context={"request": request}
                    ).data
                    # "id": user.id,
                    # "email": user.email,
                    # "first_name": user.first_name,
                    # "last_name": user.last_name,
                    # "date_of_birth": user.date_of_birth,
                    # "phone": user.phone,
                    # "is_staff": user.is_staff,
                    # "is_verified": user.is_verified,
                    # "is_active": user.is_active,
                    # "entity": user.entity.id,
                    # "entity_title": user.entity.title,
                    # 'roles':  RolesSerializer(roles,  many=True).data,
                },
                status=status.HTTP_200_OK,
            )

        else:
            return JsonResponse(
                data={
                    "response_code": 1,
                    "response_message": "Invalid credentials",
                },
                status=status.HTTP_200_OK,
            )

class MenuItemCreateAPIView(generics.GenericAPIView):
    """
    Create new menu item
    """

    name = "room-create"
    permission_classes = (app_permissions.EntityEmployeePermission,)
    serializer_class = serializers.MenuItemsSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        errors_messages=[]
        menu_id=""
        menu = None
        files =[]

        title = request.POST.get("title", "")
        if not title or title=="":
            raise exceptions.ValidationError("Room title is required")
        
        menu_id = request.POST.get("menu", "")
        if not menu_id or menu_id=="":
            raise exceptions.ValidationError("Menu ID is required")
        else:
            menu = validate_menu(menu_id)

        description = request.POST.get("description", "")

        employee=validate_employee(request.user)
        if not employee.current_branch:
            raise exceptions.ValidationError("Employee details not updated")
        else:
            pass

        if (
                models.MenuItem.objects.filter(
                    entity=request.user.entity,
                    branch=employee.current_branch,
                    title__icontains=title
                ).count()
                > 0
            ):
                raise exceptions.ValidationError(
                    f"Menu item  named {title} already exists at {employee.current_branch}")
        files = request.FILES.getlist("images")
        if files:
            request.data.pop("images")
            serializer_context = {
                "request": request,
            }

            serializer = serializers.MenuItemsSerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    branch=employee.current_branch,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(exc)
                item = models.MenuItem.objects.get(id=serializer.data["id"])
                errors_messages = []

                uploaded_files = []
                for file in files:
                    content = models.MenuItemImages.objects.create(
                        owner=request.user,
                        image=file,
                        menu_item=item,
                        entity=request.user.entity,
                    )
                    uploaded_files.append(content)

                item.images.add(*uploaded_files)
                item.save()
                context = serializer.data
                                
                arr =[]
                # context["images"] = [file.id for file in uploaded_files]
                # context["images"] = [file.id for file in uploaded_files]
                # context["images"] = [image for image in uploaded_files]
                ls= serializers.ProductImageSerializer(item.images,context={'request': request}, many=True).data,
                context["images"] =arr

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Menu item created",
                        "menu_item": serializers.MenuItemsSerializer(item,context={'request': request}).data,
                        "errors": errors_messages,
                    },
                    status=status.HTTP_201_CREATED,
                )
                # context["images"] = [file.id for file in uploaded_files]

                # errors_messages = []
                # return Response(
                #     data={
                #         "response_code": 0,
                #         "response_message": "Menu item succesfully created",
                #         "menu_item": serializer.data,
                #         "errors": errors_messages,
                #     },
                #     status=status.HTTP_201_CREATED,
                # )
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
                        "response_message": "Menu item not created",
                        "menu_item": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:

            serializer_context = {
                "request": request,
            }

            serializer = serializers.BranchRoomSerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    branch=employee.current_branch,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(
                        f"Menu item named {title} already exists"
                    )

                user_data = serializer.data
                # Retrieve user from database
                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Room succesfully created",
                        "menu_item": serializer.data,
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
                        "response_message": "Room not created",
                        "menu_item": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )



class MenuItemUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update menu item images
    """

    name = "menuitem-detail"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.MenuItemsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.MenuItem.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update menu item with new images
        """
        files =[]
        menu = None

        menuitem_id = self.kwargs.get("pk")

        if  "images" in request.data:
            files = request.FILES.getlist("images")

        menuitem_id = self.kwargs.get("pk")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        if "description" in request.data:
            instance.description=request.data["description"]
            instance.save()

        if "menu" in request.data:
            menu = validate_menu(request.data["menu"])
            instance.menu=menu
            instance.save()

        serializer = serializers.MenuItemsSerializer(instance, context=serializer_context)
        if models.MenuItemImages.objects.filter(menu_item_id=menuitem_id).count() > 5:
            raise exceptions.ValidationError(
                "Not more than 5 profile pictures allowed. "
            )
        if files and len(files) > 5:
            raise exceptions.ValidationError("Not more than 5 images can be uploaded")
        else:
            uploaded_files = []
            for file in files:
                content = models.MenuItemImages.objects.create(
                    image=file,
                    menu_item=instance,
                    owner=request.user,
                    entity=request.user.entity
                )
                uploaded_files.append(content)

            instance.images.add(*uploaded_files)
            context = serializer.data
            context["images"] = [file.id for file in uploaded_files]

            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Image uploaded succesfully",
                    "menu_item": serializer.data,
                },
                status=status.HTTP_200_OK,
            )
            # return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class BranchRoomCreateAPIView(generics.GenericAPIView):
    """
    Create new room
    """

    name = "room-create"
    permission_classes = (app_permissions.EntityEmployeePermission,)
    serializer_class = serializers.BranchRoomSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        errors_messages=[]

        title = request.POST.get("title", "")
        if not title or title=="":
            raise exceptions.ValidationError("Room title is required")
        
        price = float(request.POST.get("price", 0.00))
        if not price or price==0.00:
            raise exceptions.ValidationError("Room price is required")
        
        occupancy = int(request.POST.get("occupancy", 0))
        if not occupancy or occupancy==0:
            raise exceptions.ValidationError("Room occupancy is required")
        
        is_available = request.POST.get("is_available", "")
        free_wifi = request.POST.get("free_wifi", "")
        free_parking = request.POST.get("free_parking", "")
        free_cancellation = request.POST.get("free_cancellation", "")


        employee=validate_employee(request.user)
        print("Employee", employee)
        print("Employee current branch", employee.current_branch)
        if not employee.current_branch:
            raise exceptions.ValidationError("employee details not updated")
        else:
            pass

        if (
                models.BranchRoom.objects.filter(
                    entity=request.user.entity,
                    branch=employee.current_branch,
                    title__icontains=title
                  
                ).count()
                > 0
            ):
                raise exceptions.ValidationError(
                    f"Room named {title} already exists at {employee.current_branch}")
        files = request.FILES.getlist("room_images")
        if files:
            request.data.pop("room_images")
            serializer_context = {
                "request": request,
            }

            serializer = serializers.BranchRoomSerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    branch=employee.current_branch,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(exc)
                item = models.BranchRoom.objects.get(id=serializer.data["id"])
                errors_messages = []

                uploaded_files = []
                for file in files:
                    content = models.BranchRoomImages.objects.create(
                        owner=request.user,
                        image=file,
                        branch_room=item,
                        entity=request.user.entity,
                    )
                    uploaded_files.append(content)

                item.room_images.add(*uploaded_files)
                context = serializer.data
                context["room_images"] = [file.id for file in uploaded_files]

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Room succesfully created",
                        "branch_room": serializer.data,
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
                        "response_message": "Room not created",
                        "branch_room": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:

            serializer_context = {
                "request": request,
            }

            serializer = serializers.BranchRoomSerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    branch=employee.current_branch,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(
                        f"Room named {title} already exists"
                    )

                user_data = serializer.data
                # Retrieve user from database
                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Room succesfully created",
                        "branch_room": serializer.data,
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
                        "response_message": "Room not created",
                        "branch_room": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )


class BranchRoomUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update menu item images
    """

    name = "branch-room-update"
    permission_classes = (app_permissions.EntityEmployeePermission,)
    serializer_class = serializers.BranchRoomSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.BranchRoom.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update menu item with new images
        """
        price =0.00
        files=[]

        room_id = self.kwargs.get("pk")

        if  "room_images" in request.data:
            files = request.FILES.getlist("room_images")

        instance = self.get_object()

        if "price" in request.data and not request.data["price"]=="":
            price=float(request.data["price"])
            if price <=0.00:
                raise exceptions.ValidationError("Room price cannot be zero")
            else:
                instance.price=price
                instance.save()
        serializer_context = {
            "request": request,
        }

        if "free_cancellation" in request.data and not request.data["free_cancellation"]=="":
            instance.free_cancellation=request.data["free_cancellation"]
            instance.save()

        if "free_parking" in request.data and not request.data["free_parking"]=="":
            instance.free_parking=request.data["free_parking"]
            instance.save()

        if "free_breakfast" in request.data and not request.data["free_breakfast"]=="":
            instance.free_breakfast=request.data["free_breakfast"]
            instance.save()


        if "free_wifi" in request.data and not request.data["free_wifi"]=="":
            instance.free_wifi=request.data["free_wifi"]
            instance.save()

        if "description" in request.data and not request.data["description"]=="":
            instance.description=request.data["description"]
            instance.save()

        if "title" in request.data and not request.data["title"]=="":
            instance.title=request.data["title"]
            instance.save()


        serializer = serializers.BranchRoomSerializer(instance, context=serializer_context)
        if models.BranchRoomImages.objects.filter(branch_room_id=room_id).count() > 5:
            raise exceptions.ValidationError(
                "Not more than 5 room pictures allowed. "
            )
        if files and len(files) > 5:
            raise exceptions.ValidationError("Not more than 5 images can be uploaded")
        else:
            uploaded_files = []
            for file in files:
                content = models.BranchRoomImages.objects.create(
                    image=file,
                    branch_room=instance,
                    owner=request.user,
                    entity=request.user.entity
                )
                uploaded_files.append(content)

            instance.room_images.add(*uploaded_files)
            context = serializer.data
            context["room_images"] = [file.id for file in uploaded_files]

            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Room details updated succesfully",
                    "branch_room": serializer.data,
                },
                status=status.HTTP_200_OK,
            )
            # return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj
