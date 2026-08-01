from celery import Celery
from celery import shared_task
from django.utils import timezone
from .models import WholesalerPriceDiscounts
from utils.logging import create_log
app = Celery()
from . import models
import json

from intergrations.jambopay.jambopay_check_payment_status import jambopay_check_payment_status

#### FOOD ORDERS
def get_non_cash_today_wholesale_order_payments():
    qs = models.RetailerOrderPayments.objects.filter(
            status="INITIATED"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs

#@app.task
def check_retailer_order_mobile_money_payment_status():
    food_order_mobile_money_payments =get_non_cash_today_wholesale_order_payments()
    if len(food_order_mobile_money_payments)>0:
        print(f"{len(food_order_mobile_money_payments)} mobile money retailer order payments")
        for payment in food_order_mobile_money_payments:
            errors, result_json= jambopay_check_payment_status(payment.psp_reference_number)
            if result_json:
                print("Retailer order payments status.....(MOBILE MONEY)",result_json)
                if result_json and result_json["status"]=="SUCCESS":
                    payment.status="SUCCESS"
                    payment.provider_reference_number=result_json['providerRef']
                    payment.psp_reference_number=result_json['ref']
                    payment.description=result_json['description']
                    payment.save()
                    print("Ticket Payment success")

                    payment.retailer_order.is_paid ="true"
                    # payment.retailer_order.reference_number =payment.reference_number
                    payment.retailer_order.save()
                    # Adjust inventory for succesfull  payments
                    order_items =  models.RetailerOrderItems.objects.filter(retailer_order=payment.retailer_order).all()
                    for item in order_items:
                            print("aAdjust by",item.purchased_quantity)
                            item.wholesaler_receipt.pack_quantity=item.wholesaler_receipt.pack_quantity - int(item.purchased_quantity)
                            item.wholesaler_receipt.save()
                            print("aAdjusted item",item.wholesaler_receipt)
                            print("aAdjusted item qty",item.wholesaler_receipt.pack_quantity)


                elif result_json and result_json["status"]=="FAILED":
                    payment.status="FAILED"
                    payment.desc=result_json['description']
                    payment.save()

                    payment.retailer_order.is_paid ="false"
                    payment.retailer_order.save()
            
                    return 
                else:
                    return errors
                
    else:
        print("No pending mobile money payments")




@shared_task
def deactivate_expired_price_discounts():
    """
    Finds all active discounts whose end date has passed 
    and updates them to 'false' in a single database query.
    """
    today = timezone.now().date()
    
    # 1. Query for active objects where the end date is earlier than today
    expired_discounts = WholesalerPriceDiscounts.objects.filter(
        is_active="true",
        end__lt=today
    )
    
    # 2. Bulk update them efficiently without triggering individual save loops
    count = expired_discounts.update(is_active="false")
    create_log("info", f"Expired price discounts: {count}")
    
    return f"Deactivated {count} expired wholesaler discounts."
