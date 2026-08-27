from django.db import transaction
from utils.logging import create_log
from retailers.models import CustomerOrderItems,RetailerReceipts



from django.db import transaction

@transaction.atomic
def update_stock(customer_order):
    create_log("error", "Am updating stock...")
    
    # select_related avoids making a separate database query for every single loop iteration
    items = CustomerOrderItems.objects.filter(customer_order=customer_order).select_related('retailer_receipt')
    
    for item in items:
        receipt = item.retailer_receipt
        
        # Directly deduct the sold quantity from the current unit stock
        receipt.current_unit_quantity -= item.quantity
        receipt.save()

    # Function returns True only after all items have updated successfully
    return True



# @transaction.atomic
# def update_stock(customer_order):
#     create_log("error",f"Am updating stock...")
#     current_unit_quantity = 0
#     sold_packs = 0
#     loose = 0
#     items=CustomerOrderItems.objects.filter(customer_order=customer_order).all()
#     for item in items:
#         # sold_packs = item.total_quantity % item.retailer_receipt.product.units_per_pack
#         if item.retailer_receipt.is_bulky=="false":
#             current_unit_quantity = item.retailer_receipt.current_unit_quantity
#             item.retailer_receipt.current_unit_quantity = (
#                 current_unit_quantity - item.total_quantity
#             )
#             item.retailer_receipt.current_bulk_quantity = float(
#                 current_unit_quantity - item.total_quantity
#             )

#             item.retailer_receipt.save()
#             return True
#         elif  item.retailer_receipt.is_bulky=="true":
#             print("Item is bbulky")
          
#             if item.unit_of_issue=="KILOGRAM":
#                 item.retailer_receipt.current_bulk_quantity=item.retailer_receipt.current_bulk_quantity-item.quantity
#                 item.retailer_receipt.current_unit_quantity=item.retailer_receipt.current_bulk_quantity-item.quantity
#                 # item.retailer_receipt.current_unit_quantity=int(item.retailer_receipt.current_bulk_quantity)
#                 item.retailer_receipt.save()
#                 return True
#             elif  item.unit_of_issue=="GRAM":
#                 print("At GMS")
#                 print("At GMS",item.retailer_receipt.current_bulk_quantity)
#                 print("At GMS",item.retailer_receipt.current_unit_quantity)
#                 item.retailer_receipt.current_bulk_quantity=item.retailer_receipt.current_bulk_quantity-item.quantity
#                 item.retailer_receipt.current_unit_quantity=item.retailer_receipt.current_bulk_quantity-item.quantity
#                 # item.retailer_receipt.current_unit_quantity=int(item.retailer_receipt.current_bulk_quantity)
#                 item.retailer_receipt.save()

#                 return True
                
#             elif item.retailer_receipt.unit_of_receipt=="LITRE":
#                 if item.unit_of_issue=="LITRE":
#                     current_bulk_quantity = item.retailer_receipt.bulk_quantity
#                     item.retailer_receipt.current_bulk_quantity = (
#                         current_bulk_quantity - item.total_quantity/item.retailer_receipt.units_per_pack
#                     )
#                     current_unit_quantity = float(item.retailer_receipt.current_bulk_quantity)
#                     item.retailer_receipt.save()
#                     return True
#                 elif  item.unit_of_issue=="MILLILITRE":
#                     current_bulk_quantity = item.retailer_receipt.bulk_quantity
#                     item.retailer_receipt.bulk_quantity = (
#                         current_unit_quantity - item.quantity
#                     )
#                     item.retailer_receipt.current_unit_quantity = int(
#                         item.retailer_receipt.current_bulk_quantity
#                     )
#                     item.retailer_receipt.save()
#                     return True

# @transaction.atomic
# def update_stock(customer_order):
#     create_log("error",f"Am updating stock...{items}")
#     current_unit_quantity = 0
#     sold_packs = 0
#     loose = 0
#     items=CustomerOrderItems.objects.filter(customer_order=customer_order).all()
#     for item in items:
#         # sold_packs = item.total_quantity % item.retailer_receipt.product.units_per_pack
#         if item.retailer_receipt.is_bulky=="false":
#             current_unit_quantity = item.retailer_receipt.current_unit_quantity
#             item.retailer_receipt.current_unit_quantity = (
#                 current_unit_quantity - item.total_quantity
#             )
#             item.retailer_receipt.current_bulk_quantity = float(
#                 current_unit_quantity - item.total_quantity
#             )

#             item.retailer_receipt.save()
#             return True
#         elif  item.retailer_receipt.is_bulky=="true":
#             print("Item is bbulky")
          
#             if item.unit_of_issue=="KILOGRAM":
#                 item.retailer_receipt.current_bulk_quantity=item.retailer_receipt.current_bulk_quantity-item.quantity
#                 item.retailer_receipt.current_unit_quantity=item.retailer_receipt.current_bulk_quantity-item.quantity
#                 # item.retailer_receipt.current_unit_quantity=int(item.retailer_receipt.current_bulk_quantity)
#                 item.retailer_receipt.save()
#                 return True
#             elif  item.unit_of_issue=="GRAM":
#                 print("At GMS")
#                 print("At GMS",item.retailer_receipt.current_bulk_quantity)
#                 print("At GMS",item.retailer_receipt.current_unit_quantity)
#                 item.retailer_receipt.current_bulk_quantity=item.retailer_receipt.current_bulk_quantity-item.quantity
#                 item.retailer_receipt.current_unit_quantity=item.retailer_receipt.current_bulk_quantity-item.quantity
#                 # item.retailer_receipt.current_unit_quantity=int(item.retailer_receipt.current_bulk_quantity)
#                 item.retailer_receipt.save()

#                 return True
                
#             elif item.retailer_receipt.unit_of_receipt=="LITRE":
#                 if item.unit_of_issue=="LITRE":
#                     current_bulk_quantity = item.retailer_receipt.bulk_quantity
#                     item.retailer_receipt.current_bulk_quantity = (
#                         current_bulk_quantity - item.total_quantity/item.retailer_receipt.units_per_pack
#                     )
#                     current_unit_quantity = float(item.retailer_receipt.current_bulk_quantity)
#                     item.retailer_receipt.save()
#                     return True
#                 elif  item.unit_of_issue=="MILLILITRE":
#                     current_bulk_quantity = item.retailer_receipt.bulk_quantity
#                     item.retailer_receipt.bulk_quantity = (
#                         current_unit_quantity - item.quantity
#                     )
#                     item.retailer_receipt.current_unit_quantity = int(
#                         item.retailer_receipt.current_bulk_quantity
#                     )
#                     item.retailer_receipt.save()
#                     return True