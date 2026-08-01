from celery import Celery

app = Celery()
from . import models
import json
from intergrations.jambopay.jambopay_wallet import initiate_jambopay_settlement
from intergrations.jambopay.jambopay_check_payment_status import jambopay_check_payment_status
from decouple import config
from authentication.utils.utils import generate_reference_number
from restaurants.models import BarInventoryOrderItem,BranchFoodOrderItem





# @app.task
# def check_bar_order_mobile_money_payment_status():
  
#     if models.BarInventoryOrderPayment.objects.filter(is_settled=False,payment_method__title="MOBILE MONEY",status="PENDING").exists():
#         bar_order_mobile_money_payments = models.BarInventoryOrderPayment.objects.filter(is_settled=False,payment_method__title="MOBILE MONEY",status="PENDING").all()
        
#         if len(bar_order_mobile_money_payments)>0:
#             print(f"{len(bar_order_mobile_money_payments)} mobile money bar payments")
#             for payment in bar_order_mobile_money_payments:
#                 errors, result_json= jambopay_check_payment_status(payment.psp_reference_number)
#                 if result_json:
#                     print("Restaurants Ticket status.....(MOBILE MONEY)",result_json)
#                     if result_json and result_json["status"]=="SUCCESS":
#                         payment.status="SUCCESS"
#                         payment.provider_reference_number=result_json['providerRef']
#                         payment.psp_reference_number=result_json['ref']
#                         payment.description=result_json['description']
#                         payment.save()
#                         print("Ticket Payment success")

#                         payment.bar_inventory_order.is_paid ="true"
#                         payment.bar_inventory_order.save()


#                     if result_json and result_json["status"]=="FAILED":
#                         payment.status="FAILED"
#                         payment.description=result_json['description']
#                         payment.save()

#                         payment.bar_inventory_order.is_paid ="false"
#                         payment.bar_inventory_order.save()
                
#                         return 
#                     else:
#                         return errors
                    
#         else:
#             print("No pending mobile money payments")

## SHARED API
def process_collection_settlement(amount, account_number,reference_number):
    payload =  json.dumps({
        "callbackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
        "amount": str(amount),
        "accountTo": account_number,
        "accountFrom":config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
        "orderId": reference_number,
        
        })
    errors, result_json = initiate_jambopay_settlement(payload)

    return errors, result_json

#### BAR ORDER PAYMENTS 

def get_non_cash_today_bar_order_payments():
    qs = models.BarInventoryOrderPayment.objects.filter(
            is_settled=False, 
            status="PENDING"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs

#@app.task
def check_bar_order_mobile_money_payment_status():
    order_items = None
    bar_order_mobile_money_payments =get_non_cash_today_bar_order_payments()
    if len(bar_order_mobile_money_payments)>0:
        print(f"{len(bar_order_mobile_money_payments)} mobile money bar payments at omaria")
        for payment in bar_order_mobile_money_payments:
            errors, result_json= jambopay_check_payment_status(payment.psp_reference_number)
            if result_json:
                print("Restaurants bar payments status.....(MOBILE MONEY) OMARIA",result_json)
                if result_json and result_json["status"]=="SUCCESS":
                    payment.status="SUCCESS"
                    payment.provider_reference_num=result_json['providerRef']
                    payment.psp_reference_num=result_json['ref']
                    payment.desc=result_json['description']
                    payment.save()
                    print("Ticket Payment success")



                    payment.bar_inventory_order.is_paid ="true"
                    payment.bar_inventory_order.payment_reference_number =result_json['providerRef']
                    payment.bar_inventory_order.save()


                    if BarInventoryOrderItem.objects.filter(bar_inventory_order=payment.bar_inventory_order).exists():
                        order_items = BarInventoryOrderItem.objects.filter(bar_inventory_order=payment.bar_inventory_order).all()
                        for item in order_items:
                            item.bar_inventory.unit_quantity = item.bar_inventory.pack_quantity - item.quantity
                            item.bar_inventory.pack_quantity = int(item.bar_inventory.pack_quantity - item.quantity)/int(item.bar_inventory.product.units_per_pack)
                            item.bar_inventory.save()
                            print("EMUSWAILIT", item.bar_inventory)


                elif result_json and result_json["status"]=="FAILED":
                    payment.status="FAILED"
                    payment.desc=result_json['description']
                    payment.save()

                    payment.bar_inventory_order.is_paid ="false"
                    payment.bar_inventory_order.save()
            
                    return 
                else:
                    return errors
                
    else:
        print("No pending mobile money payments")

def get_succesful_unsynced_today_bar_order_payments():
    qs = models.BarInventoryOrderPayment.objects.filter(
            is_settled=False, 
            status="SUCCESS"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs

#@app.task
def settle_cashless_bar_order_payments():
    pass
    # unsettled_bar_order_payments = get_succesful_unsynced_today_bar_order_payments()
    # if len(unsettled_bar_order_payments)>0:
    #     print(f"We got {len(unsettled_bar_order_payments)} unsettled bar order payments")
    #     for ubop in unsettled_bar_order_payments:
    #         reference_number = generate_reference_number(ubop.entity, ubop.branch_collection_account.owner)
    #         errors, result_json =process_collection_settlement(ubop.amount,ubop.branch_collection_account.account_number,reference_number)
    #         if result_json:
    #             ubop.is_settled=True
    #             ubop.save()
    #             settlement = models.BarOrderPaymentSettlement.objects.create(
    #                 branch_collection_account=ubop.branch_collection_account,
    #                 bar_order_payment=ubop,
    #                 psp_reference_number = result_json["ref"],
    #                 amount = result_json["amount"],
    #                 account_from = result_json["accountFrom"],
    #                 account_to = result_json["accountTo"],
    #                 status ="SUCCESS",
    #                 entity=ubop.entity,
    #                 reference_number=reference_number
                
    #             )
    # else:
    #     print("No unsynced cashless bar payments")

#### FOOD ORDERS
def get_non_cash_today_food_order_payments():
    qs = models.BranchFoodOrderPayment.objects.filter(
            is_settled=False, 
            status="PENDING"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs

#@app.task
def check_food_order_mobile_money_payment_status():
    food_order_mobile_money_payments =get_non_cash_today_food_order_payments()
    if len(food_order_mobile_money_payments)>0:
        print(f"{len(food_order_mobile_money_payments)} mobile money food payments")
        for payment in food_order_mobile_money_payments:
            errors, result_json= jambopay_check_payment_status(payment.psp_reference_number)
            if result_json:
                print("Restaurants food payments status.....(MOBILE MONEY)",result_json)
                if result_json and result_json["status"]=="SUCCESS":
                    payment.status="SUCCESS"
                    payment.provider_reference_num=result_json['providerRef']
                    payment.psp_reference_number=result_json['ref']
                    payment.desc=result_json['description']
                    payment.save()
                    print("Ticket Payment success")

                    payment.branch_food_order.is_paid ="true"
                    payment.branch_food_order.save()
                    # Adjust inventory for succesfull cashless food payments
                    order_items =  BranchFoodOrderItem.objects.filter(branch_food_order=payment.branch_food_order).all()
                    for item in order_items:
                            print("aAdjust by",item.quantity)
                            item.branch_food_item.quantity=item.branch_food_item.quantity - int(item.quantity)
                            item.branch_food_item.save()
                            print("aAdjusted item",item.branch_food_item)
                            print("aAdjusted item qty",item.branch_food_item.quantity)


                elif result_json and result_json["status"]=="FAILED":
                    payment.status="FAILED"
                    payment.desc=result_json['description']
                    payment.save()

                    payment.branch_food_order.is_paid ="false"
                    payment.branch_food_order.save()
            
                    return 
                else:
                    
                    return errors
                
    else:
        print("No pending mobile money payments")


def get_succesful_unsynced_today_food_order_payments():
    qs = models.BranchFoodOrderPayment.objects.filter(
            is_settled=False, 
            status="SUCCESS"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs

#@app.task
def settle_cashless_food_order_payments():
    unsettled_food_order_payments = get_succesful_unsynced_today_food_order_payments()
    if len(unsettled_food_order_payments)>0:
        print(f"We got {len(unsettled_food_order_payments)} unsettled food order payments")
        for ufop in unsettled_food_order_payments:
            reference_number = generate_reference_number(ufop.entity, ufop.branch_collection_account.owner)
            errors, result_json =process_collection_settlement(ufop.amount,ufop.branch_collection_account.account_number,reference_number)
            if result_json:
                ufop.is_settled=True
                ufop.save()
                settlement = models.FoodOrderPaymentSettlement.objects.create(
                    branch_collection_account=ufop.branch_collection_account,
                    branch_food_order_payment=ufop,
                    psp_reference_number = result_json["ref"],
                    amount = result_json["amount"],
                    account_from = result_json["accountFrom"],
                    account_to = result_json["accountTo"],
                    status ="SUCCESS",
                    entity=ufop.entity,
                    reference_number=reference_number
                
                )
    else:
        print("No unsynced cashless food payments")


#### ACCOMMODATION ORDERS
def get_non_cash_today_accommodation_order_payments():
    qs = models.AccomodationOrderPayments.objects.filter(
            is_settled=False, 
            status="PENDING"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs

#@app.task
def check_accommodation_order_mobile_money_payment_status():
    accommodation_order_mobile_money_payments =get_non_cash_today_accommodation_order_payments()
    if len(accommodation_order_mobile_money_payments)>0:
        print(f"{len(accommodation_order_mobile_money_payments)} mobile money food payments")
        for payment in accommodation_order_mobile_money_payments:
            errors, result_json= jambopay_check_payment_status(payment.psp_reference_number)
            if result_json:
                print("Restaurants accommodation payments status.....(MOBILE MONEY)",result_json)
                if result_json and result_json["status"]=="SUCCESS":
                    payment.status="SUCCESS"
                    payment.provider_reference_num=result_json['providerRef']
                    payment.psp_reference_number=result_json['ref']
                    payment.desc=result_json['description']
                    payment.save()
                   

                    payment.accommodation_order.is_paid ="true"
                    payment.accommodation_order.save()


                elif result_json and result_json["status"]=="FAILED":
                    payment.status="FAILED"
                    payment.description=result_json['description']
                    payment.save()

                    payment.accommodation_order.is_paid ="false"
                    payment.accommodation_order.save()
            
                    return 
                else:
                    return errors
                
    else:
        print("No pending accommodation mobile money payments")


def get_succesful_unsynced_today_accommodation_order_payments():
    qs = models.AccomodationOrderPayments.objects.filter(
            is_settled=False, 
            status="SUCCESS"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs

#@app.task
def settle_cashless_accommodation_order_payments():
    unsettled_accommodation_order_payments = get_succesful_unsynced_today_accommodation_order_payments()
    if len(unsettled_accommodation_order_payments)>0:
        print(f"We got {len(unsettled_accommodation_order_payments)} unsettled accommodation order payments")
        for uaop in unsettled_accommodation_order_payments:
            reference_number = generate_reference_number(uaop.entity, uaop.branch_collection_account.owner)
            errors, result_json =process_collection_settlement(uaop.amount,uaop.branch_collection_account.account_number,reference_number)
            if result_json:
                uaop.is_settled=True
                uaop.save()
                settlement = models.AccommodationOrderPaymentSettlement.objects.create(
                    branch_collection_account=uaop.branch_collection_account,
                    accommodation_order_payment=uaop,
                    psp_reference_number = result_json["ref"],
                    amount = result_json["amount"],
                    account_from = result_json["accountFrom"],
                    account_to = result_json["accountTo"],
                    status ="SUCCESS",
                    entity=uaop.entity,
                    reference_number=reference_number
                
                )
    else:
        print("No unsynced cashless food payments")