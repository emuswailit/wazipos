from intergrations.jambopay.jambopay_wallet import get_auth_token
from .models import CustomerOrderPayment,CustomerOrderSettlement
from decouple import config
from . import models
from .utils.inventory_utils import update_stock
from celery import Celery
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import json
from intergrations.jambopay.jambopay_check_payment_status import jambopay_check_payment_status
from uuid import UUID
from intergrations.jambopay.jambopay_wallet import initiate_jambopay_settlement
from payments.models import EntityPSPCollectionAccount
from authentication.utils.utils import generate_reference_number, use_reference_number


app = Celery()
channel_layer = get_channel_layer()


def get_non_cash_today_customer_order_payments():
    qs = models.CustomerOrderPayment.objects.filter(
            is_validated=False, 
            status="PENDING"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs


@app.task
def check_jambopay_payment_status():
    payment =None
    token = get_auth_token()
   
    payments = get_non_cash_today_customer_order_payments()
    
    if len(payments) > 0:
        for payment in payments:
          
            errors, result_json= jambopay_check_payment_status(payment.psp_reference_number)
            print("RESULT JSON", result_json)
            if result_json and result_json["status"] == "SUCCESS":
                payment.provider_reference_number = result_json["providerRef"]
                payment.status = result_json["status"]
                payment.description = result_json["description"]
                payment.save()
                payment.customer_order.is_paid="true"
                payment.customer_order.save()
                payment.is_validated=True
                order_items = models.CustomerOrderItems.objects.filter(customer_order=payment.customer_order).all()
                print("order_items",order_items)
                update_stock(payment.customer_order)
                
            elif result_json and result_json["status"]=="FAILED":
                payment.status="FAILED"
                payment.is_validated=True
                payment.description=result_json['description']
                payment.save()
                payment.customer_order.is_paid ="false"
                payment.customer_order.save()

            else:
                payment.is_validated=True
                payment.status="FAILED"
                payment.description = result_json["description"]
                payment.save()

                return errors
       
    
    else:
        print("No pending customer order payments to sync")


class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            # if the obj is uuid, we simply return the value of uuid
            return obj.hex
        return json.JSONEncoder.default(self, obj)
    

@app.task
def get_wholesaler_discounts():
    print("To be corrected")
    # retailer_receipts=[]
    # print("Getting wholesaler discounts....")
    # receipts=WholesalerReceipts.objects.filter(pack_quantity__gte=1).all()

    # retailer_receipts =WholesalerReceiptsSerializer(receipts,many=True,context={'request': request}).data
    # data=json.dumps(retailer_receipts,cls=UUIDEncoder)
    # result = async_to_sync(channel_layer.group_send)(
    #         'wholesaler-discounts',
    #         {
    #             "type": "send_wholesaler_discounts",
    #             "name": "Mikey",
    #             "data":data
    #         },
    #     )
    # return result

@app.task
def load_out_of_stock_items():
    print("Loading out of stock items.....")

    # items=OutOfStock.objects.filter(pack_quantity__gte=1).all()

    # out_of_stock_items =WholesalerReceiptsSerializer(receipts,many=True,).data
    # data=json.dumps(out_of_stock_items,cls=UUIDEncoder)
    result= async_to_sync(channel_layer.group_send)(
            'oss',
            {
                "type": "send_retailer_out_of_stocks"
            },
        )
    print("rtes",result)
    return result
@app.task
def load_customer_order_details():
    print("Send customer order details")

    # items=OutOfStock.objects.filter(pack_quantity__gte=1).all()

    # out_of_stock_items =WholesalerReceiptsSerializer(receipts,many=True,).data
    # data=json.dumps(out_of_stock_items,cls=UUIDEncoder)
    result= async_to_sync(channel_layer.group_send)(
            'customer-order-details',
            {
                "type": "send_customer_order_details"
            },
        )
    print("rtes",result)
    return result



# Retailer receipts web socket task

@app.task
def load_retailer_receipts():

    result= async_to_sync(channel_layer.group_send)(
            'retail-inventory',
            {
                "type": "send_retailer_receipts"
            },
        )
    return result

@app.task
def load_shop_inventory():

    result= async_to_sync(channel_layer.group_send)(
            'shop-inventory',
            {
                "type": "send_shop_inventory"
            },
        )
    return result



@app.task
def load_retailer_dashboard():

    result= async_to_sync(channel_layer.group_send)(
            'retailer-dashboard',
            {
                "type": "send_retailer_dashboard"
            },
        )
    return result



@app.task
def load_customer_orders():

    result= async_to_sync(channel_layer.group_send)(
            'customer-orders',
            {
                "type": "send_customer_orders"
            },
        )
    return result


@app.task
def load_user_orders():

    result= async_to_sync(channel_layer.group_send)(
            'user-orders',
            {
                "type": "send_user_orders"
            },
        )
    return result

@app.task
def load_user_prescriptions():

    result= async_to_sync(channel_layer.group_send)(
            'user-prescriptions',
            {
                "type": "send_user_prescriptions"
            },
        )
    return result

@app.task
def load_inventory_predictions():

    result= async_to_sync(channel_layer.group_send)(
            'inventory-predictions',
            {
                "type": "send_inventory_predictions"
            },
        )
    return result


@app.task
def load_bodaboda_assigned_order():

    result= async_to_sync(channel_layer.group_send)(
            'bodaboda-assigned-order',
            {
                "type": "send_bodaboda_assigned_order"
            },
        )
    return result



# @classmethod
# def encode_json(cls, content):
#     return json.dumps(content, cls=UUIDEncoder)
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

def get_succesful_unsynced_today_customer_order_payments():
    qs = models.CustomerOrderPayment.objects.filter(
            is_validate=True, 
            status="SUCCESS"
        ).all().order_by("-created").exclude(payment_method__title="CASH")

    return qs

@app.task
def settle_cashless_customer_order_payments():
    unsettled_customer_order_payments = get_succesful_unsynced_today_customer_order_payments()
    if len(unsettled_customer_order_payments)>0:
        print(f"We got {len(unsettled_customer_order_payments)} unsettled customer order payments")
        for ubop in unsettled_customer_order_payments:
            reference_number = generate_reference_number(ubop.entity, ubop.entity_collection_account.owner)
            errors, result_json =process_collection_settlement(ubop.amount,ubop.entity_collection_account.account_number,reference_number)
            if result_json:
                ubop.is_validated=True
                ubop.save()
                settlement = models.CustomerOrderSettlement.objects.create(
                    receiving_entity=ubop.receiving_entity,
                    entity_collection_account=ubop.entity_collection_account,
                    customer_order_payment=ubop,
                    psp_reference_number = result_json["ref"],
                    amount = result_json["amount"],
                    account_from = result_json["accountFrom"],
                    account_to = result_json["accountTo"],
                    entity=ubop.entity,
                    reference_number=reference_number
                
                )
    else:
        print("No unsynced cashless bar payments")


# @app.task
# def settle_succesfull_jambopay_payments():
    refnum =None
    payment =None
    # token = get_auth_token()
    
    
    payments = CustomerOrderPayment.objects.filter(status="SUCCESS",is_validated=False)
    
    if len(payments) > 0:
        print("Pending successful payments: ", len(payments))
        for payment in payments:
    
            if EntityPSPCollectionAccount.objects.filter(entity=payment.receiving_entity, psp=payment.payment_services_provider).exists():
                entity_collection_account=EntityPSPCollectionAccount.objects.filter(entity=payment.receiving_entity, psp=payment.payment_services_provider).first()
                print(f"Settling {payment.receiving_entity}, account number :{entity_collection_account.account_number}")
               
                refnum=generate_reference_number(payment.receiving_entity,payment.owner)
                print("refnum",refnum)
                # print("refnum no",refnum["reference_number"])
                
                if payment.payment_method.title=="JAMBOPAY MOBILE MONEY":
                    
                        data =  json.dumps({
                            "callbackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
                            "amount": str(payment.amount),
                            "accountTo": entity_collection_account.account_number,
                            "accountFrom":config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                            "orderId": refnum
                            })
                        print("data",data)
                        errors, settlement = initiate_jambopay_settlement(data)
                        if settlement:
                            created =CustomerOrderSettlement.objects.create(
                                entity=payment.receiving_entity,
                                receiving_entity=payment.receiving_entity,
                                customer_order_payment=payment,
                                reference_number=payment.reference_number,
                                psp_reference_number=settlement["ref"],
                                account_from=settlement["accountFrom"],
                                account_to=settlement["accountTo"],
                                amount=settlement["amount"],
                                payment_services_provider=payment.payment_method.psp
                            )

                            payment.is_validated=True
                            payment.save()
                            use_reference_number(refnum)
                            
                        
            else:
                print(f"{payment.receiving_entity} has no collection accout set")

    else:
        print("No unsettled  successful retail payments")