from .. import models
from retailers.models import CustomerOrders,CustomerOrderItems
from authentication.utils.utils import generate_document_number
from django.db import transaction
def create_wish_list(request_data, user):
    """
    Create a wish list for the user based on the provided request data.
    
    Args:
        request_data (dict): The data from the request containing wish list details.
        user (User): The user for whom the wish list is being created.
    
    Returns:
        tuple: A tuple containing a list of errors (if any) and the created wish list object.
    """
    errors = []
    wish_list = None
    title = None
    limit = 0.00

    # Implement logic to create a wish list
    # For example, validate request_data, create a WishLists object, etc.
    if not "title" in request_data or  request_data["title"]=="":
        errors.append("Title is required for the wish list.")
    
    else:
        title = request_data["title"]
    if  "limit" in request_data and not  request_data["limit"]=="":
        limit = request_data["limit"]

    if models.WishLists.objects.filter(title=title, owner=user).exists():
        errors.append("Wish list with this title already exists.")
    if len(errors) > 0:
        return errors, wish_list
    else:
        try:

            wish_list = models.WishLists.objects.create(
                title=title,
                limit_amount=limit,
                owner=user,
            )
            wish_list.save()
            return errors, wish_list
        except Exception as e:
            errors.append(f"An error occurred while creating the wish list: {str(e)}")
            wish_list = None
            return errors, None


def get_user_wish_lists(user):
    """
    Retrieve all wish lists for the given user.
    
    Args:
        user (User): The user whose wish lists are to be retrieved.
    
    Returns:
        QuerySet: A queryset of the user's wish lists.
    """
    return models.WishLists.objects.filter(owner=user).order_by("-created")[:10]

def update_wish_list(data, user):
    """
    Update the given wish list with the provided request data.
    
    Args:
        wish_list (WishLists): The wish list to be updated.
        request_data (dict): The data containing updates for the wish list.
    
    Returns:
        tuple: A tuple containing a list of errors (if any) and the updated wish list object.
    """
    errors = []
    wish_list =None

    if not "wish_list" in data or data["wish_list"] is None:
        errors.append("Wish list is required for updating.")
        return errors, None
    else:

       if not models.WishLists.objects.filter(id=data["wish_list"]).exists():
            errors.append("Invalid wish list object provided.")
            return errors, None
       else:
            wish_list = models.WishLists.objects.get(id=data["wish_list"])
    
    if "title" in data and data["title"] != "":
        wish_list.title = data["title"]
    
    if "limit" in data and data["limit"] != "":
        wish_list.limit = float(data["limit"])

    if "is_closed" in data and data["is_closed"] != "":
        wish_list.is_closed = data["is_closed"]

    
    try:
        wish_list.save()
        return errors, wish_list
    except Exception as e:
        errors.append(f"An error occurred while updating the wish list: {str(e)}")
        return errors, None
    

def get_retailer_for_wishlist_item(wishlist_item):
    return wishlist_item.product.entity

def get_wish_list_items_for_retailer(retailer,wish_list_items):
    retailer_items =[]

    for item in wish_list_items:
        
        if item.product.entity==retailer:
            retailer_items.append(item)
    return retailer_items

@transaction.atomic
def close_wishlist(data,user):
    errors = []
    wish_list = None
    wish_list_items=[]

    if not "wish_list" in data or data["wish_list"] is None:
        errors.append("Wishlist ID is required.")
        return errors, None
    else:

       if not models.WishLists.objects.filter(id=data["wish_list"]).exists():
            errors.append("Invalid wish list object provided.")
            return errors, None
       else:
            wish_list = models.WishLists.objects.get(id=data["wish_list"])
            if wish_list.is_closed == "true":
                errors.append("This wish list is already closed.")
                return errors, None
            
    if models.WishListProducts.objects.filter(wishlist=wish_list, owner=user).exists():
        wish_list_items = models.WishListProducts.objects.filter(wishlist=wish_list, owner=user)
 
        unique_retailers= list(set(map(get_retailer_for_wishlist_item, wish_list_items)))

        for retailer in unique_retailers:
            unique_retailer_wishlist_items = get_wish_list_items_for_retailer(retailer,wish_list_items)
            order_number = generate_document_number(retailer, user,"CUSTOMERORDER")
            if len(unique_retailer_wishlist_items) > 0:
                try:
                    customer_order = CustomerOrders.objects.create(
                    customer_name=f"{user.first_name} {user.last_name}",
                    customer_phone=f"{user.phone}",
                    order_origin="CUSTOMER",
                    owner=user,
                    entity=retailer,
                    order_number=order_number,
                    customer=user,
                    order_channel="ANDROID"
                
                )
                    customer_order.save()
                    for item in unique_retailer_wishlist_items:
                        try:
                            customer_order_item = CustomerOrderItems.objects.create(
                                customer_order=customer_order,
                                retailer_receipt=item.product,
                                quantity=item.quantity,
                                owner=user,
                                item_price_total=item.product.unit_selling_price * item.quantity,
                                item_price=item.product.unit_selling_price,
                                entity=item.product.entity,
                            )
                            customer_order_item.save()
                            # item.is_purchased = "true"
                            # item.save()
                            wish_list.is_closed = "true"
                            wish_list.save()
                        except Exception as e:
                            errors.append(f"An error occurred while creating the order item: {str(e)}")
                            return errors, None
                except Exception as e:
                    errors.append(f"An error occurred while creating the retailer receipt: {str(e)}")
                    return errors, None
               
            

    return [],wish_list
    

    
def delete_wish_list(data, user):
    """
    Delete the given wish list.
    
    Args:
        wish_list (WishLists): The wish list to be deleted.
    
    Returns:
        tuple: A tuple containing a list of errors (if any) and a success message.
    """
    errors = []
    
    if not "wish_list" in data or data["wish_list"] is None:
        errors.append("Wish list is required for deletion.")
        return errors, "Deletion failed"
    
    if not models.WishLists.objects.filter(id=data["wish_list"]).exists():
        errors.append("Invalid wish list ID provided.")
        return errors, False
    
    wish_list = models.WishLists.objects.get(id=data["wish_list"])
    
    try:
        wish_list.delete()
        return errors, "Wish list deleted successfully"
    except Exception as e:
        errors.append(f"An error occurred while deleting the wish list: {str(e)}")
        return errors, True
    

def create_wish_list_product(request_data, user):  
    """
    Create a new product in the user's wish list based on the provided request data.
    
    Args:
        request_data (dict): The data from the request containing wish list product details.
        user (User): The user for whom the wish list product is being created.
    
    Returns:
        tuple: A tuple containing a list of errors (if any) and the created wish list product object.
    """
    errors = []
    wish_list_product = None
    quantity = None
    product = None
    wish_list = None

    # Implement logic to create a wish list item
    if not "wish_list" in request_data or request_data["wish_list"] is None:
        errors.append("Wish list is required for creating an item.")
    
    else:
        if not models.WishLists.objects.filter(id=request_data["wish_list"]).exists():
            errors.append("Invalid wish list ID provided.")
            return errors, None
        else:
            wish_list = models.WishLists.objects.get(id=request_data["wish_list"])
    
    if not "product" in request_data or request_data["product"] is None:
        errors.append("Product is required for creating an item.")
    
    else:
        product = models.RetailerReceipts.objects.get(id=request_data["product"])
        if models.WishListProducts.objects.filter(wishlist=wish_list, product=product, owner=user).exists():
            errors.append("This product is already in the wish list.")
            return errors, None
    
    if not "quantity" in request_data or request_data["quantity"] is None:
        errors.append("Quantity is required for creating an item.")
    
    else:
        quantity = int(request_data["quantity"])

    if len(errors) > 0:
        return errors, wish_list
    
    try:
        wish_list_product = models.WishListProducts.objects.create(
            wishlist=wish_list,
            product=product,
            quantity=quantity,
            owner=user,
            vendor=product.entity if product.entity else None,
        )
        wish_list_product.save()
        return errors, wish_list
    except Exception as e:
        errors.append(f"An error occurred while creating the wish list item: {str(e)}")
        return errors, None
    
def get_user_wish_list_items(data,user): 
    
    """
    Retrieve all wish list items for the given user.
    
    Args:
        user (User): The user whose wish list items are to be retrieved.
    
    Returns:
        QuerySet: A queryset of the user's wish list items.

    """
    errors = []
    wish_list = None
    if not "wish_list" in data or data["wish_list"] =="":
        errors.append("Wish list is required to retrieve items.")
    else:
        if  isinstance(data["wish_list"], models.WishLists):
            wish_list = models.WishLists.objects.get(id=data["wish_list"])

    return models.WishListProducts.objects.filter(owner=user,wish_list=wish_list).order_by("-created")

def update_wish_list_product(request_data,user):
    """
    Update the given wish list item with the provided request data.
    Args:
        wish_list_item (WishListProducts): The wish list item to be updated.
        request_data (dict): The data containing updates for the wish list item.
    Returns:
        tuple: A tuple containing a list of errors (if any) and the updated wish list item object.
    """     
    errors = []
    wish_list_product = None

    if not "wish_list_product" in request_data or request_data["wish_list_product"] is None:
        errors.append("Wish list item is required for updating.")
        return errors, None
    else:
        if not models.WishListProducts.objects.filter(id=request_data["wish_list_product"]).exists():
            errors.append("Invalid wish list product ID provided.")
            return errors, None
        else:
            wish_list_product = models.WishListProducts.objects.get(id=request_data["wish_list_product"])
    
    if "quantity" in request_data and request_data["quantity"] != "":
        wish_list_product.quantity = int(request_data["quantity"])
    
    try:
        wish_list_product.save()
        return errors, wish_list_product
    except Exception as e:
        errors.append(f"An error occurred while updating the wish list item: {str(e)}")
        return errors, None

def delete_wish_list_product(data,user):
    """
    Delete the given wish list item.
    
    Args:
        wish_list_item (WishListProducts): The wish list item to be deleted.
    
    Returns:
        tuple: A tuple containing a list of errors (if any) and a success message.
    """
    errors = []
    
    if not models.WishListProducts.objects.filter(id=data["wish_list_product"]).exists():
        errors.append("Invalid wish list item object provided.")
        return errors, False
    else:
        wish_list_product = models.WishListProducts.objects.get(id=data["wish_list_product"])
    
    try:
        wish_list_product.delete()
        return errors, True
    except Exception as e:
        errors.append(f"An error occurred while deleting the wish list item: {str(e)}")
        return errors, "Deletion failed"

    

