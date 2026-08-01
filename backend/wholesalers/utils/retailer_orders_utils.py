from xml.dom.minidom import Entity
from datetime import datetime, timedelta
from django.db import transaction
from rest_framework import exceptions
from authentication.utils.utils import generate_reference_number
from payments.models import EntityPSPCollectionAccount,UserAccounts
from employees.validators import employees_models_validators
from authentication.models import Entities
from authentication.validators import authentication_models_validators
from authentication.utils.utils import generate_reference_number, use_reference_number, get_telco_by_phone_number,generate_document_number
from rest_framework import exceptions

import json
import requests
from datetime import datetime, timedelta
from decouple import config
from django.db import transaction, IntegrityError
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import exceptions
from django.db.models import Q
from ..validators import wholesalers_models_validators
from core.date_utils import get_formatted_from_date, get_formatted_to_date, get_today_date
from ..models import RetailerOrders,RetailerOrderPayments, RetailerOrderItems, WholesalerReceipts, RetailerOrderPayments, WholesalerPriceDiscounts, WholesalerQuantityDiscounts
from django.db import transaction
from intergrations.jambopay.jp_mobile_money_checkout import jambopay_mobile_checkout
from datetime import datetime, timedelta
from payments.validators import payments_models_validators
from rest_framework.response import Response
from rest_framework import status
import json
from decouple import config
import requests
from payments.models import PaymentMethods,PayoutAccounts
from retailers.models import RetailerReceipts
from utils.logging import create_log
from intergrations.mpesa import mpesa_express_api,  transaction_status_api,c2b_register_url
from intergrations.jambopay.jambopay_wallet import  jambopay_wallet_checkout, get_wallet_balance
from core.utils import random_string_generator
from payments.validators.payments_models_validators import (
    validate_payment_method_exists,
)

@transaction.atomic
def update_stock(items):
    current_unit_quantity = 0
    sold_packs = 0
    loose = 0
    for item in items:
        # sold_packs = item.total_quantity % item.wholesaler_receipt.product.units_per_pack
        current_unit_quantity = item.wholesaler_receipt.current_unit_quantity
        item.wholesaler_receipt.current_unit_quantity = (
            current_unit_quantity - item.total_quantity
        )

        packs_updated = (
            int(current_unit_quantity - item.total_quantity)
            / item.wholesaler_receipt.product.units_per_pack
        )

        try:
            item.wholesaler_receipt.current_unit_quantity = packs_updated
            item.wholesaler_receipt.save()
        except Exception as e:
            print("Error", e)

        item.wholesaler_receipt.save()
    return True  


def process_customer_order_payment(retailer_order, payment_method, user, mobile_money_phone, reference_number):
    print("bo", retailer_order)
    errors = []
    retailer_collection_account = None
    wholesaler_collection_account = None

    if payment_method.title == "CASH":
        try:
            customer_order_payment = RetailerOrderPayments.objects.create(
                payment_method=payment_method,
                pay_in_reference_number=reference_number,
                status="SUCCESS",
                amount=retailer_order.final_price_total,
                entity=user.entity,
                currency="KES",
                owner=user,
                retailer_order=retailer_order,
            )
            if customer_order_payment:
                return [], retailer_order
            else:
                errors.append("Error while creating food order payment")
                return errors, retailer_order
        except (IntegrityError, DjangoValidationError, Exception) as database_error:
            errors.append(f"Cash payment database creation failed: {str(database_error)}")
            return errors, retailer_order

    elif payment_method.title == "MOBILE MONEY":
        payout_account = None
        if PayoutAccounts.objects.filter(entity=retailer_order.wholesaler).exists():
            payout_account = PayoutAccounts.objects.filter(entity=retailer_order.wholesaler).first()
        else:
            errors.append(f"{retailer_order.wholesaler.title} has no payout account")
            return errors, retailer_order

        payload = None
        telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
        create_log("info", f"{formatted_phone_number} {telco}")
        
        if telco == "MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(retailer_order.final_price_total + retailer_order.shipping_amount),
                "callBackUrl": "https://webhook.site",
                "accountTo": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                "description": "Merchant payment",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "MERCHANTPAYMENT"
                }
            })
        elif telco == "AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": int(retailer_order.final_price_total + retailer_order.shipping_amount),
                "callBackUrl": "https://webhook.site",
                "accountTo": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
                "currency": "KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "MERCHANTPAYMENT"
                }
            })
        else:
            errors.append(f"Unsupported mobile network operator: {telco}")
            return errors, retailer_order

        the_data = {
            "client_id": config("JAMBOPAY_CLIENT_ID"),
            "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
            "grant_type": config("JAMBOPA_GRANT_TYPE"),
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        
        try:
            result = requests.post(config("JAMBOPAY_AUTH_URL1"), data=the_data, headers=headers)
            result_json = result.json()
        except Exception as e:
            errors.append(f"Auth network request failed: {str(e)}")
            return errors, retailer_order

        token = None
        if result_json and "access_token" in result_json:
            token = result_json["access_token"]
        else:
            errors.append("Invalid response format received from auth provider")
            return errors, retailer_order
            
        if token:
            headers = {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token,
                "Accept": "*/*",
            }
            try:
                result = requests.post(
                    config("JAMBOPAY_BASE_URL") + "/checkout/express", 
                    data=payload, 
                    headers=headers,
                )
                result_json = result.json()
            except Exception as e:
                errors.append(f"Checkout API request failed: {str(e)}")
                return errors, retailer_order

            create_log("info", f"result_json {result_json}")
            
            if result_json and "statusCode" not in result_json and "ref" in result_json:
                try:
                    retailer_order_payment = RetailerOrderPayments.objects.create(
                        payment_method=payment_method,
                        pay_in_reference_number=reference_number,
                        status="PENDING",
                        amount=float(retailer_order.final_price_total),
                        entity=user.entity,
                        currency="KES",
                        psp_reference_number=result_json["ref"],
                        owner=user,
                        retailer_order=retailer_order,
                    )
                    use_reference_number(reference_number)
                    
                    if retailer_order_payment:
                        poll_external_transaction_status(retailer_order_payment, token)
                        return [], retailer_order
                    else:
                        errors.append("Customer order payment record could not be created")
                        return errors, retailer_order
                except (IntegrityError, DjangoValidationError, Exception) as database_error:
                    errors.append(f"Mobile Money payment database creation failed: {str(database_error)}")
                    return errors, retailer_order
            elif  result_json and "statusCode" not in result_json and "message" not in result_json:
                errors.append(result_json["message"])
                return errors, retailer_order
            else:
                errors.append("Payment provider processing transaction error or invalid status payload")
                return errors, retailer_order
        else:
            errors.append("Unable to authenticate with payment provider: Access Token is empty")
            return errors, retailer_order

    elif payment_method.title == "JAMBOPAY WALLET":
        print("at Jambopay wallet", retailer_order.wholesaler)
        if EntityPSPCollectionAccount.objects.filter(entity=retailer_order.wholesaler).exists():
            wholesaler_collection_account = EntityPSPCollectionAccount.objects.filter(entity=retailer_order.wholesaler).first()
        else:
            errors.append("Wholesaler has no collection account")
            return errors, retailer_order

        print("at Jambopay wallet", retailer_order.retailer)
        if EntityPSPCollectionAccount.objects.filter(entity=retailer_order.retailer).exists():
            retailer_collection_account = EntityPSPCollectionAccount.objects.filter(entity=retailer_order.retailer).first()
        else:
            errors.append("No wallet for retailer")
            return errors, retailer_order

        if retailer_collection_account and wholesaler_collection_account:
            data = {
                "orderId": reference_number,
                "amount": int(retailer_order.final_price_total),
                "callBackUrl": "https://webhook.site",
                "accountTo": wholesaler_collection_account.entity_account_number,
                "description": "Test_Wallet Checkout",
                "modeOfPayment": "WALLET_AS_SERVICE",
                "provider": "JAMBOPAY",
                "data": {
                    "serviceType": "MERCHANTPAYMENT",
                    "accountNo": retailer_collection_account.entity_account_number
                }
            }
            print("data", data)
            response = jambopay_wallet_checkout(data)
            print("response", response)
            
            if response and "statusCode" not in response and "ref" in response:
                try:
                    retailer_order_payment = RetailerOrderPayments.objects.create(
                        payment_method=payment_method,
                        pay_in_reference_number=reference_number,
                        status="PENDING",
                        amount=float(retailer_order.final_price_total),
                        entity=user.entity,
                        currency="KES",
                        psp_reference_number=response["ref"],
                        owner=user,
                        retailer_order=retailer_order,
                        entity_collection_account=wholesaler_collection_account
                    )
                    use_reference_number(reference_number)
                    
                    if retailer_order_payment:
                        return [], retailer_order
                    else:
                        errors.append("Ticket payment could not be created under wallet strategy")
                        return errors, retailer_order
                except (IntegrityError, DjangoValidationError, Exception) as database_error:
                    errors.append(f"Jambopay Wallet payment database creation failed: {str(database_error)}")
                    return errors, retailer_order
            else:
                errors.append(f"Jambopay wallet transaction failed: {str(response)}")
                return errors, retailer_order
        else:
            errors.append("No collection account configurations found for mobile phone context")
            return errors, retailer_order

    else:
        errors.append(f"Unsupported payment method type: {payment_method.title}")
        return errors, retailer_order

def search_retailer_orders(data,user):
    # TODO: reference search with Q
    """ Filter with Q  """
    search_param = None
    errors=[]
    retailer_orders=[]
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError(
                "Search parameter cannot be empty")
        else:
            if RetailerOrders.objects.filter(
                Q(document_number__document_number__icontains=search_param)
              ,
                retailer=user.entity
            ).exists():

                retailer_orders = RetailerOrders.objects.filter(
                    Q(document_number__document_number__icontains=search_param)
                ,
                    retailer=user.entity
                ).all()

                return retailer_orders
            else:
                return []
            
    except Exception as e:
        errors.append(str(e))
        raise exceptions.ValidationError(errors)

@transaction.atomic
def create_draft_retailer_order(data, user):
    errors = []
    order_terms = None
    retailer_order_items=None
    order_type = None
    wholesaler = None
    order_origin=None
    reference_number = None
    reference = None
    payment_method = None
    payment_account_number=None

    if "payment_method_id" in data["retailer_order_details"]:
        payment_method_id = data["retailer_order_details"]["payment_method_id"]
    if payment_method_id == "" or not payment_method_id:
        errors.append("Payment method ID is required")
        return errors,None,None
    else:
        payment_method = validate_payment_method_exists(payment_method_id)
        print("PM",payment_method.psp)


    if  payment_method.title=="CASH" or  payment_method.title=="JAMBOPAY WALLET":
        """Payment account number not required for cash transactions"""
        pass
    else:
        if  not "payment_account_number" in data["retailer_order_details"] or data["retailer_order_details"]["payment_account_number"] =="":
            errors.append("Payment acount is required for non cash orders")
            return errors,None,None
        else:
            payment_account_number=data["retailer_order_details"]["payment_account_number"]

    employee = employees_models_validators.validate_employee(user)

    if "retailer_order_items" in data["retailer_order_details"] and not len(data["retailer_order_details"]["retailer_order_items"])>0:
        errors.append("No items added to order")
        return  errors, None,None
    else:
        retailer_order_items=data["retailer_order_details"]["retailer_order_items"]

        for i in retailer_order_items:
            wholesaler_receipt = None
            item_id = i["wholesaler_receipt_id"]
            if WholesalerReceipts.objects.filter(id=i["wholesaler_receipt_id"]).exists():
                wholesaler_receipt= WholesalerReceipts.objects.filter(id=i["wholesaler_receipt_id"]).first()
                if wholesaler_receipt.current_unit_quantity < int(i["purchased_quantity"]):
                    errors.append(f"{wholesaler_receipt}: Available packs: {wholesaler_receipt.current_unit_quantity}")
                    return  errors,None,None
                else:
                    pass
            else:
                errors.append(f"Item with ID {item_id} does not exist")
                return  errors, None,None

    if "order_origin" in data["retailer_order_details"]:
        order_origin=data["retailer_order_details"]["order_origin"]


    try:
        wholesaler_id = data["retailer_order_details"]["wholesaler_id"]
        wholesaler = authentication_models_validators.validate_entity(
            wholesaler_id)
        if order_terms == "":
            errors.append("Wholesaler ID cannot be empty")
    except KeyError:
        errors.append("Wholesaler ID is required")
    
    try:
        order_terms = data["retailer_order_details"]["order_terms"]
        if order_terms == "":
            errors.append("Order terms cannot be empty")
    except KeyError:
        errors.append("Order terms is required")
    try:
        order_type = data["retailer_order_details"]["order_type"]
        if order_terms == "":
            errors.append("Order type cannot be empty")
    except KeyError:
        errors.append("Order type is required")
    # try:
    #     payment_method_id = data["retailer_order_details"]["payment_method_id"]
    #     payment_method = payments_models_validators.validate_payment_method_exists(
    #         payment_method_id)
    #     if order_terms == "":
    #         errors.append("Payment method cannot be empty")
    # except KeyError:
    #     errors.append("Payment method is required")


    if len(errors) > 0:
        return  errors,None,None
    else:
        try:
            reference_number= generate_reference_number(user.entity, user)
            order_created = RetailerOrders.objects.create(
                wholesaler=wholesaler,
                retailer=user.entity,
                order_terms=order_terms,
                owner=user,
                payment_method=payment_method,
                entity=user.entity,
                order_origin= order_origin,
                reference_number=reference_number,
                employee=employee)
            
            if order_created:
                print("Am here", order_created)
                item_counter_price_discount_amount = 0.0
                item_counter_price_discount = 0.0
                order_items = data["retailer_order_details"]["retailer_order_items"]
                total_quantity = 0.00

                for item in order_items:
                    item_price = None
                    wholesaler_receipt = None
                    item_tax = 0.00
                    order_price_discount_total=0.00
                    order_tax_total=0.00
                    item_price_discount = 0.00
                    item_net_price = 0.00
                    discount_quantity = 0.00
                    item_price_total = 0.0
                    item_tax_total = 0.0
                    order_net_price_total=0.00
                    final_price_total=0.00
                    total_quantity=0
                    wholesaler_receipt_price_discount= None
                    wholesaler_receipt_quantity_discount= None

                    purchased_quantity = float(item["purchased_quantity"])
                    wholesaler_receipt_id = item["wholesaler_receipt_id"]

                    if (
                       WholesalerReceipts.objects.filter(id=wholesaler_receipt_id).exists()
                    ):
                        wholesaler_receipt = WholesalerReceipts.objects.filter(
                            id=wholesaler_receipt_id
                        ).first()
                        print("Item iko", wholesaler_receipt)
                        # Calculate item tax
                        item_price = float(wholesaler_receipt.pack_selling_price)
                        item_price_total = float(
                            float(wholesaler_receipt.pack_selling_price)
                            * int(purchased_quantity)
                        )
                        print("item_price", item_price)
                        print("item_price_total", item_price_total)
                        if wholesaler_receipt.product.is_vatable:
                            item_tax = float(wholesaler_receipt.pack_selling_price) * float(
                                0.16
                            )

                            item_tax_total = float(item_tax) * purchased_quantity
                            print("Item tax", item_tax)
                            print("Item tax total", item_tax_total)
                        if WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=wholesaler_receipt).exists():
                            wholesaler_receipt_price_discount = WholesalerPriceDiscounts.objects.filter(wholesaler_receipt=wholesaler_receipt).first()
                            item_price_discount = (
                                float(wholesaler_receipt.pack_selling_price)
                                * float(wholesaler_receipt_price_discount.percent)
                                / 100
                            )

                            item_net_price = float(item_price)- float(item_price_discount)
                        else:
                            item_net_price = float(item_price) 

                        print("item_price_discount",item_price_discount)    
                        print("item_net_price",item_net_price)    
                                
                        if WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=wholesaler_receipt).exists():
                            wholesaler_receipt_quantity_discount = WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt=wholesaler_receipt).all()
                            print("there is qty disc")
                            if len(wholesaler_receipt_quantity_discount)>0:
                                for qd in wholesaler_receipt_quantity_discount:
                                    if (
                                        purchased_quantity
                                        % qd.limit_quantity
                                        > 1
                                    ):
                                        discount_quantity = (
                                            qd.awarded_quantity
                                        )

                                    total_quantity = int(purchased_quantity) + int(discount_quantity)
                                    print("purchased_quantity",purchased_quantity)     
                                    print("total_quantity",total_quantity)     
                                    if wholesaler_receipt.current_unit_quantity < total_quantity:
                                        raise exceptions.ValidationError(
                                            f"Insufficient stocks. Only {wholesaler_receipt.current_unit_quantity} available"
                                        )
                                    else:
                                        print("Item iko enough", wholesaler_receipt)
                            else:
                                print("No qty discs")
                            
                        else:
                            print("No qty disc")
                            total_quantity= purchased_quantity
                            print("purchased_quantity",purchased_quantity)     
                            print("total_quantity",total_quantity)  
                        try:    
                            item_created = RetailerOrderItems.objects.create(
                                    item_price=item_price,
                                    item_price_total=item_price_total,
                                    item_tax=item_tax,
                                    item_tax_total=item_tax_total,
                                    item_price_discount=item_price_discount,
                                    item_price_discount_total=float(item_price_discount)
                                    * float(purchased_quantity),
                                    item_net_price=item_net_price,
                                    discount_quantity=discount_quantity,
                                    item_counter_price_discount=item_counter_price_discount,
                                    item_counter_price_discount_amount=item_counter_price_discount_amount,
                                    item_counter_price_discount_amount_total=float(
                                        item_counter_price_discount_amount
                                    )
                                    * float(purchased_quantity),
                                    item_net_price_total=float(item_net_price)
                                    * float(purchased_quantity),
                                    total_quantity=int(purchased_quantity) + int(discount_quantity),
                                    purchased_quantity=purchased_quantity,
                                    wholesaler_receipt=wholesaler_receipt,
                                    retailer_order=order_created,
                                    owner=user,
                                    entity=user.entity,
                                )
                            items = RetailerOrderItems.objects.filter(retailer_order=order_created)

                            for item in items:
                                order_price_discount_total = order_price_discount_total + float(
                                    item.item_price_discount_total
                                )
                                order_tax_total = order_tax_total + float(item.item_tax_total)
                                order_net_price_total = order_net_price_total + float(
                                    item.item_net_price_total
                                )
                                final_price_total = final_price_total + float(item.item_price_total)

                            order_created.order_price_discount_total = order_price_discount_total
                            order_created.order_tax_total = order_tax_total
                            order_created.order_net_price_total = order_net_price_total
                            order_created.final_price_total = final_price_total
                            
                            order_created.save()
                            print("final order", order_created)
                            # order_created.is_paid="true"
                            order_items=RetailerOrderItems.objects.filter(retailer_order=order_created).all()
                            # update_stock(order_items)
                            reference_number=generate_reference_number(user.entity,user)
                            errors, created_order  = process_customer_order_payment(order_created,payment_method,user,payment_account_number, reference_number )
                            print("errors",errors)
                            print("errors")
                            print("reference",reference)
                            if len(errors)>0:
                                return errors, None
                            else:
                                return None, created_order
                        except Exception as e:
                            errors.append(str(e))
                            return errors, None
                        
                    else:
                        errors.append("Item does not exist in inventory")
                        return errors, None



                # return errors, order_created
            # Defer payments
            # print("PAN",order_created.payment_account_number)

            # if order_created.payment_account_number and payment_method.psp.psp_title=="MOBILE":
            #     """MPESA order"""
            #     print("Am here 1")
                
            #     data ={
            #             "action":"CustomerOrderPayment",
            #             "entity":order_created.entity.id,
            #             "order":order_created.id,
            #             "phone_number":payment_account_number,
            #             "payment_method":order_created.selected_payment_method.id,
            #             "psp":payment_method.psp.id
            #         }

            #     errors, result_json = customer_order_payment(data,user)
            #     if result_json:
            #         payment = CustomerOrderPayment.objects.create(
            #         payment_services_provider_id=payment_method.psp,
            #         retailer_order=order_created,
            #         paying_entity=user.entity,
            #         receiving_entity=order_created.entity,
            #         payment_method_id=payment_method,
            #         reference_number=order_created.reference_number,
            #         psp_reference_number=result_json["ref"],
            #         provider_reference_number="",
            #         amount=float(order_created.order_net_price_total),
            #         narration="CUSTOMER_TO_RETAILER",
            #         currency=result_json["currency"],
            #         owner=user,
            #         entity=user.entity,
            #         status="PENDING",
            #         )
            #         use_reference_number(order_created.reference_number)
                    
                    
            #         print("Order created payment",payment)
            #         return [], order_created
            #     if errors:
            #         print("Payment no created")
            #         print("errors",errors)
            #         return errors, None


            #     # print("Going to process mpesa")
            #     # print("Going to process mpesa amount", order_created.final_price_total)
            #     # mpesa_result = process_mpesa(
            #     #     order_created.payment_account_number,
            #     #     order_created.reference_number,
            #     #     order_created.final_price_total,
            #     # )

            #     # if mpesa_result:
            #     #     print("mpesa result", mpesa_result)
            #     #     task_result = create_monitor_and_periodic_task(order_created)
            #     #     print("Created task", task_result)
            #     #     return order_created
            #     # else:
            #     #     raise exceptions.ValidationError("Mpesa payment failed")
            #     return ["Mpesa"], None

            # else: 
            #     if not payment_account_number and payment_method.title == "CASH":
            #         order_created.is_paid="true"
            #         order_items=CustomerOrderItems.objects.filter(retailer_order=order_created).all()
            #         update_stock(order_items)
            #         return [], order_created

                    
                # payment = CustomerOrderPayment.objects.create(
                #     reference_number=reference_number,
                #     amount=order_created.final_price_total,
                #     payment_method=order_created.selected_payment_method,
                #     narration="CUSTOMER_ORDER_PAYMENT",
                #     entity=user.entity,
                #     owner=user,
                # )
                # use_reference_number(reference_number)
                # order_items = CustomerOrderItems.objects.filter(
                #     retailer_order=order_created
                # ).all()
                # # Update inventory
                # update_stock(order_items)
                # order_created.payment = payment
                # order_created.save()

                # return order_created

        
            # if created:
            #     for i in retailer_order_items:
            #         wholesaler_receipt = None
            #         if WholesalerReceipts.objects.filter(id=i["wholesaler_receipt_id"]).exists():
            #             wholesaler_receipt= WholesalerReceipts.objects.filter(id=i["wholesaler_receipt_id"]).first()
            #             try:
            #                 created_item = RetailerOrderItems.objects.create(
            #                     retailer_order=created,
            #                     wholesaler_receipt=wholesaler_receipt,
            #                     purchased_quantity=int(i["purchased_quantity"]),
            #                     owner=user,
            #                     entity=user.entity,
            #                     employee=employee)
                            
            #             except Exception as e:
            #                 errors.append(str(e))
            #                 return None, errors

            #         else:
            #             errors.append("Item with provided ID does not exist in wholesale inventory")
            #             return None, errors
            # else:
            #     errors.append("Order not created")
            #     return None, errors
        except NameError as e:
            errors.append(str(e))
            return None, errors, None
    # return  errors, order_created, None


@transaction.atomic
def create_staff_retailer_order(data, user):
    errors = []
    order_terms = None
    order_type = None
    retailer = None
    payment_method = None
    employee = employees_models_validators.validate_employee(user)

    try:
        retailer_id = data["retailer_order_details"]["retailer_id"]
        retailer = authentication_models_validators.validate_entity(
            retailer_id)
        if order_terms == "":
            errors.append("Retailer ID cannot be empty")
    except KeyError:
        errors.append("Retailer ID is required")
    try:
        order_terms = data["retailer_order_details"]["order_terms"]
        if order_terms == "":
            errors.append("Order terms cannot be empty")
    except KeyError:
        errors.append("Order terms is required")
    try:
        order_type = data["retailer_order_details"]["order_type"]
        if order_type == "":
            errors.append("Order type cannot be empty")
    except KeyError:
        errors.append("Order type is required")
    try:
        payment_method_id = data["retailer_order_details"]["payment_method_id"]
        payment_method = payments_models_validators.validate_payment_method_exists(
            payment_method_id)
        if payment_method_id == "":
            errors.append("Payment method cannot be empty")
    except KeyError:
        errors.append("Payment method is required")
    retailer_order_number = random_string_generator().capitalize()
    if RetailerOrders.objects.filter(
        retailer_order_number=retailer_order_number
    ).exists():
        pass
    else:
        retailer_order_number = random_string_generator().capitalize()

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if RetailerOrders.objects.filter(retailer=retailer, wholesaler=user.entity, owner=user, status='DRAFT').exists():
            raise exceptions.ValidationError(
                f"You have an existing draft order for {retailer.title} at {user.entity.title}")

        created = RetailerOrders.objects.create(
            wholesaler=user.entity,
            retailer=retailer,
            order_terms=order_terms,
            retailer_order_number=retailer_order_number,
            owner=user,
            payment_method=payment_method,
            entity=user.entity,
            order_origin='STAFF',
            employee=employee)
        return created


@transaction.atomic
def draft_retailer_order_add_item(data, user):
    errors = []
    retailer_order = None
    wholesaler_receipt = None
    employee = employees_models_validators.validate_employee(user)

    try:
        retailer_order_id = data["retailer_order_details"]["retailer_order_id"]
        retailer_order = wholesalers_models_validators.validate_retailer_order_is_users(
            retailer_order_id, user)
        if retailer_order.status == 'CLOSED':
            errors.append('Order has been closed')
        if retailer_order_id == "":
            errors.append("Retailer order ID cannot be empty")
    except KeyError:
        errors.append("Retailer oder ID is required")
    try:
        wholesaler_receipt_id = data["retailer_order_details"]["wholesaler_receipt_id"]
        wholesaler_receipt = wholesalers_models_validators.validate_wholesaler_receipt(
            wholesaler_receipt_id)
        # Check if retaailer is allowed to handle this product
        if not wholesaler_receipt.product.category in user.entity.categories.all():
            errors.append(
                f'{wholesaler_receipt.product.title} does not belong to any of the categories you are allowed to trade')
        if wholesaler_receipt_id == "":
            errors.append("Wholesaler receipt ID cannot be empty")
    except KeyError:
        errors.append("Wholesaler receipt ID is required")
    try:
        purchased_quantity = data["retailer_order_details"]["purchased_quantity"]
        if int(purchased_quantity) < 1:
            errors.append("Purchased quantity should be one or more")
        if int(purchased_quantity) > wholesaler_receipt.current_unit_quantity:
            errors.append(
                f"Only {wholesaler_receipt.current_unit_quantity} packs available")
    except KeyError:
        errors.append("Purchased quantity is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:

        if RetailerOrderItems.objects.filter(retailer_order=retailer_order,  wholesaler_receipt=wholesaler_receipt).exists():
            raise exceptions.ValidationError(
                f"{wholesaler_receipt.product.title} is already added to order")
        created = RetailerOrderItems.objects.create(
            retailer_order=retailer_order,
            wholesaler_receipt=wholesaler_receipt,
            purchased_quantity=int(purchased_quantity),
            owner=user,
            entity=user.entity,
            employee=employee)
        return retailer_order

# Poll transaction for status
def poll_external_transaction_status(payment, token):
    """
    Polls an external payment gateway API up to 60 times.
    Returns the final status dictionary or raises an exception if it times out.
    """
    # if WifiSubscriptionPayments.objects.filter(payout_reference_number=reference_number,entity=entity).exists():
    #     payment = WifiSubscriptionPayments.objects.get(payout_reference_number=reference_number,entity=entity)
    # else:
    #     raise APIException(
    #         detail=f"No payment found with reference number {reference_number} for entity {entity.title}.",
    #         code=status.HTTP_404_NOT_FOUND
    #     )
    max_attempts = 60
    attempt = 0
    delay_seconds = 3  # Time to wait between each poll

    while attempt < max_attempts:
        attempt += 1
        try:
            # response = requests.get(url, headers=headers, timeout=5)
            headers = {
                "Authorization": "Bearer " + token,
            }
            
            result = requests.get(
                config(f"JAMBOPAY_BASE_URL")
                + f"/wallet/transaction/{payment.pay_out_reference_number}",
                headers=headers,
                timeout=5
            )
            result_json = result.json()
            create_log("info",f"Polling result {attempt}: {result_json}")
            if result_json and "status" in result_json and result_json["status"] == "SUCCESS":
                payment.provider_reference_number = result_json["providerRef"]
                payment.status = result_json["status"]
                # payment.description = result_json["description"]
                # payment.pay_in_reference_number = result_json["orderId"]
                payment.save()
                payment.is_settled="true"
                payment.entity.save()
                create_log("info",f"poll_external_transaction_status: {payment.entity.title} payment successful")   
            else:
                # payment.description = result_json["description"]
                # payment.pay_in_reference_number = result_json["orderId"]
                payment.status = result_json["status"] if "status" in result_json else "FAILED"
                payment.is_settled="false"
                payment.save()
                create_log("error",f"poll_external_transaction_status: {payment.entity.title} payment failed")

            return result_json
                    
        except requests.RequestException as e:
            # Log the error but keep trying until max_attempts is reached
            print(f"Attempt {attempt} failed with network error: {e}")

        # Wait before the next attempt, unless it was the last one
        if attempt < max_attempts:
            time.sleep(delay_seconds)

    # If the loop finishes without returning, the polling timed out
    raise APIException(
        detail="Transaction verification timed out after 60 attempts.",
        code=status.HTTP_504_GATEWAY_TIMEOUT
    )



@transaction.atomic 
def create_retailer_order(data, user):
    errors = []
    wholesaler_obj = user.entity
    retailer_id = None
    order_terms = None
    draft_id = None
    shipping_amount = 0.0
    wholesaler_receipt_obj = None
    order_origin = "RETAILER"
    order_gross_price_total = 0.00
    order_discount_total = 0.00
    payment_method = None
    mobile_money_phone = None
    unit_of_issue = "PACK"
    retailer_order = None
    final_price_total = 0.00

    employee_obj = employees_models_validators.validate_employee(user)
    if employee_obj:
        order_origin = "STAFF"

    if "retailer_order_details" in data:
        order_details = data["retailer_order_details"]
        
        if "retailer_id" in order_details:
            retailer_id = order_details["retailer_id"]

        if employee_obj:
            if Entities.objects.filter(id=retailer_id).exists():
                retailer_obj = Entities.objects.filter(id=retailer_id).first()
            else:
                retailer_obj = user.entity
        else:
            retailer_obj = user.entity

        if "mobile_money_phone" in order_details:
            mobile_money_phone = order_details["mobile_money_phone"]

        if "payment_method_id" in order_details:
            payment_method_id = order_details["payment_method_id"]
            if PaymentMethods.objects.filter(id=payment_method_id).exists():
                payment_method = PaymentMethods.objects.filter(id=payment_method_id).first()

        if "wholesaler_id" in order_details and order_details["wholesaler_id"] is not None:
            wholesaler_id = order_details.get("wholesaler")  # Note: Check if key should be 'wholesaler_id' instead
            if wholesaler_id == "":
                errors.append("Product ID cannot be empty")
            else:
                wholesaler_obj = authentication_models_validators.validate_entity(wholesaler_id)

        try:
            draft_id = order_details["draft_id"]
            if draft_id == "":
                errors.append("Draft ID cannot be empty")
        except KeyError:
            errors.append("Draft ID is required")

        try:
            order_terms = order_details["order_terms"]
            if order_terms == "":
                errors.append("Order terms cannot be empty")
        except KeyError:
            errors.append("Order terms is required")

        if "shipping_amount" in order_details:
            shipping_amount = order_details["shipping_amount"]
        if "order_gross_price_total" in order_details:
            order_gross_price_total = order_details["order_gross_price_total"]
        if "order_discount_total" in order_details:
            order_discount_total = order_details["order_discount_total"]
        if "final_price_total" in order_details:
            final_price_total = order_details["final_price_total"]

        try:
            order_items = order_details["order_items"]
            if len(order_items) < 1:
                errors.append("Order items cannot be empty")
            else:
                for item in order_items:
                    product = WholesalerReceipts.objects.get(id=item['wholesaler_receipt'])
                    purchased_quantity = 0
                    unit_of_issue = None
                    # try:
                    #     if "unit_of_issue" not in item:
                    #         errors.append("Unit of issue is required")
                    #     else:
                    #         unit_of_issue = item["unit_of_issue"]
                    #         if unit_of_issue == "":
                    #             errors.append("Unit of issue cannot be empty")
                    #         elif unit_of_issue not in ["Gram", "Litre","Millilitre","Kilogram","Piece","Pack"]:
                    #             errors.append("Unit of issue should be either Gram,Kilogram, Millitre,Litre,Piece or Pack")
                    #         else:
                    #             unit_of_issue=item['unit_of_issue']

                    #         if product.unit_of_receipt != unit_of_issue:
                    #             errors.append(f"Unit of issue for {product.product.title} should be {product.unit_of_issue}")
                    # except KeyError:
                    #     errors.append("Product unit of issue is required")

                    try:
                        purchased_quantity = item["purchased_quantity"]
                        if purchased_quantity == "":
                            errors.append("Purchased quantity cannot be empty")
                    except KeyError:
                        errors.append("Purchased quantity is required")

                    # try:
                    #     total_quantity = item["total_quantity"]
                    #     if total_quantity == "":
                    #         errors.append("Total quantity cannot be empty")
                    # except KeyError:
                    #     errors.append("Total quantity is required")

                    if "discount_quantity" in item and item["discount_quantity"] == "":
                        errors.append("Discount quantity cannot be empty")

                    try:
                        wholesaler_receipt_id = item["wholesaler_receipt"]
                        if wholesaler_receipt_id == "":
                            errors.append("Order terms cannot be empty")
                        else:
                            wholesaler_receipt_obj = wholesalers_models_validators.validate_wholesaler_receipt_inventory(
                                wholesaler_receipt_id, item.get("total_quantity", 0)
                            )
                    except Exception as e:
                        errors.append(f"{str(e)}")
        except KeyError:
            errors.append("Order items key is required")
    else:
        errors.append("retailer_order_details is required")

    # --- CRITICAL FIX 1: Evaluate all validation errors collected above ---
    if len(errors) > 0:
        return errors, None

    # Check for duplicate orders
    five_minutes_ago = datetime.now() - timedelta(minutes=5)
    if RetailerOrders.objects.filter(draft_id=draft_id, wholesaler=wholesaler_obj, created__gte=five_minutes_ago, owner=user).exists():
        errors.append("You created a similar order within less than 5 minutes ago")
        return errors, None

    # Create the order
    document_number = generate_document_number(user.entity, user,"RETAILERORDER")
    retailer_order = RetailerOrders.objects.create(
        wholesaler=wholesaler_obj,
        reference_number =document_number.document_number,
        retailer=retailer_obj,
        order_terms=order_terms,
        draft_id=draft_id,
        shipping_amount=shipping_amount,
        owner=user,
        entity=user.entity,
        order_origin=order_origin,
        final_price_total=final_price_total,
        order_discount_total=order_discount_total,
        order_gross_price_total=order_gross_price_total,
        employee=employee_obj
    )

    if retailer_order:
        for item in order_items:
            wholesaler_receipt=None
            discount_quantity = 0
            today = get_today_date()
            wholesaler_receipt = WholesalerReceipts.objects.get(id=item['wholesaler_receipt'])
            if not wholesaler_receipt:
                errors.append("Item non existes")
                return errors, None
           
            if WholesalerQuantityDiscounts.objects.filter(wholesaler_receipt_id=item['wholesaler_receipt'],end__gte=today).exists():
                wholesaler_quantity_discount = WholesalerQuantityDiscounts.objects.filter(
                    wholesaler_receipt_id=item['wholesaler_receipt'],end__gte=today).first()
                if int(item['purchased_quantity']) % int(wholesaler_quantity_discount.limit_quantity) > 1:
                    discount_quantity = wholesaler_quantity_discount.awarded_quantity
                else:
                    discount_quantity = 0
            RetailerOrderItems.objects.create(
                retailer_order=retailer_order,
                item_price_total=item['item_price_total'],
                purchased_quantity=item['purchased_quantity'],
                total_quantity=int(item['purchased_quantity'])+ int(discount_quantity),
                discount_quantity=discount_quantity,
                item_price=item['item_price'],
                item_net_price=float(item['item_price'])-float(item['item_price_discount']),
                item_price_discount=item['item_price_discount'],
                unit_of_issue=wholesaler_receipt.unit_of_receipt,
                wholesaler_receipt_id=item['wholesaler_receipt'],
                owner=user,
                entity=user.entity
            )

        if payment_method:
            payment_errors=[]
            reference_number = generate_reference_number(user.entity, user)
            payment_errors, created_order = process_customer_order_payment(
                retailer_order, payment_method, user, mobile_money_phone, reference_number
            )
            
            # --- CRITICAL FIX 2: Fixed reference variable NameError here ---
            create_log("errror", f"Errors: {payment_errors}")

            
            if len(payment_errors) > 0:
                return payment_errors, None
            else:
                return None, retailer_order
        else:
            create_log("info", f"Retailer order {retailer_order.id} created without payment by {user.first_name} {user.last_name}")
            return None, retailer_order

    # Fallback safety return
    return ["Failed to create order due to an unknown issue"], None

def get_use_retailer_orders(user):
    """ Get retailer orders"""
    if RetailerOrders.objects.filter(owner=user).exists():
        return RetailerOrders.objects.filter(owner=user).all()
    else:
        return []
def get_retailer_order_payments(user,data):
    """Get payments for orders"""
    if RetailerOrderPayments.objects.filter(owner=user).exists():
        return RetailerOrderPayments.objects.filter(owner=user).all()
    else:
        return []


def get_entity_retailer_orders(user,data):
    if RetailerOrders.objects.filter(wholesaler=user.entity).exists():
        return RetailerOrders.objects.filter(wholesaler=user.entity).all().order_by("-created")

    else:
        return []
    
def get_entity_retailer_orders_by_wholesaler(data, user):
    print("Data", data)
    wholesaler = authentication_models_validators.validate_entity(data["wholesaler"])
    qs = RetailerOrders.objects.filter(
            entity=user.entity, 
            wholesaler=wholesaler,
        ).filter(Q(created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data))).all().order_by("-created")

    print("qs",qs)
    return qs

def get_wholesaler_retailer_orders(user):
    if RetailerOrders.objects.filter(wholesaler=user.entity).exists():
        return RetailerOrders.objects.filter(wholesaler=user.entity).all().order_by("-created")
    else:
        return []


def get_retailer_order_details(data, user):
    errors = []
    retailer_order = None

    try:
        retailer_order_id = data["retailer_order_id"]
        if retailer_order_id == "":
            errors.append("Retailer order ID cannot be empty")
        else:
            retailer_order = wholesalers_models_validators.validate_retailer_order_is_users(
                retailer_order_id, user)
            return retailer_order
    except KeyError:
        errors.append("Retailer order ID is required")


def update_retailer_order(data, user):
    errors = []
    retailer_order = None
    payment_method = None
    status = ""
    shipping_amount = 0.0
    delivery_method = None
    order_items = None
    order_terms = None
    facilitator=None

    if 'retailer_order_id' in data["retailer_order_details"] and not data["retailer_order_details"]['retailer_order_id']==None :
        retailer_order_id = data["retailer_order_details"]["retailer_order_id"]
        if RetailerOrders.objects.filter(id=retailer_order_id).exists():
            retailer_order=RetailerOrders.objects.filter(id=retailer_order_id).first()
        else:
            errors.append("Order with provided ID does not exist")
    else:
         errors.append("Order ID is required")

        # try:
        #     retailer_order_id = data["retailer_order_details"]["retailer_order_id"]
        #     if retailer_order_id == "":
        #         errors.append("Retailer order ID cannot be empty")
        #     else:
        #         retailer_order = wholesalers_models_validators.validate_retailer_order_is_users(
        #             retailer_order_id, user)
        #         if retailer_order.is_paid=="true":
        #             errors.append(
        #                 'Order is already paid thus cannot be updated')
        #     if not RetailerOrderItems.objects.filter(retailer_order=retailer_order).exists():
        #         errors.append("Order has no items thus cannot be closed")
        # except KeyError:
        #     errors.append("Retailer order ID is required")

    if "payment_method_id" in data["retailer_order_details"]:
        payment_method_id = data["retailer_order_details"]["payment_method_id"]
        if payment_method_id == "":
            errors.append("Payment method ID cannot be empty")
        else:
            payment_method = payments_models_validators.validate_payment_method_exists(
                payment_method_id)

    if "facilitator" in data["retailer_order_details"]:
        facilitator = data["retailer_order_details"]["facilitator"]

    if "order_terms" in data["retailer_order_details"]:
        order_terms = data["retailer_order_details"]["order_terms"]

    if "status" in data["retailer_order_details"]:
        status = data["retailer_order_details"]["status"]



    if "delivery_method" in data["retailer_order_details"]:
        delivery_method = data["retailer_order_details"]["delivery_method"]

    if "shipping_amount" in data["retailer_order_details"]:
        shipping_amount = data["retailer_order_details"]["shipping_amount"]
    if "order_items" in data["retailer_order_details"]:
        order_items = data["retailer_order_details"]["order_items"]
        if retailer_order.status == 'CLOSED':
            errors.append(
                'Order is already closed thus items cannot be updated')

    if len(errors) > 0:
        return errors,None
    else:
        if order_items and len(order_items) > 0:
            for item in order_items:
                print('idem', item['id'])
                if RetailerOrderItems.objects.filter(id=item['id']).exists():
                    order_item = RetailerOrderItems.objects.filter(
                        id=item['id']).first()
                    order_item.purchased_quantity = item['purchased_quantity']
                    order_item.save()
        if delivery_method:
            retailer_order.delivery_method = delivery_method
            retailer_order.save()

        if payment_method:
            retailer_order.payment_method = payment_method
            retailer_order.save()

        if facilitator:
            retailer_order.facilitator = facilitator
            retailer_order.save()
        if order_terms:
            retailer_order.order_terms = order_terms
            retailer_order.save()


        # Receive order items into inventory
        if status:

            # Check payment status
            if not RetailerOrderPayments.objects.filter(retailer_order=retailer_order).exists():
                if status=="PROCESSING":
                    errors.append("Order not paid for cannot be processed")
                    return errors,None
            retailer_order.status = status
            retailer_order.save()
            if status=="RECEIVE" and not retailer_order.status=="RECEIVE":
                retailer_order_items = RetailerOrderItems.objects.filter(retailer_order=retailer_order).all()
                for item in retailer_order_items:
                    retailer_receipt = RetailerReceipts.objects.create(
                        product= item.product,
                        current_unit_quantity= item.total_quantity,
                        retailer_order=retailer_order,
                        received_from=retailer_order.wholesaler,
                        entity=retailer_order.retailer,
                        retailer_order_item=item,
                        batch = item.wholesaler_receipt.batch,
                        owner=user
                    )
            
        if shipping_amount:
            retailer_order.shipping_amount = shipping_amount
            retailer_order.save()
        else:
            retailer_order.shipping_amount = 0
            retailer_order.save()

        return [], retailer_order


def delete_retailer_order(data, user):
    errors = []
    try:
        retailer_order_id = data["retailer_order_id"]
        if retailer_order_id == "":
            errors.append("Retailer order ID cannot be empty")
        else:
            if RetailerOrders.objects.filter(id=retailer_order_id).exists():
                retailer_order = RetailerOrders.objects.filter(
                    id=retailer_order_id).first()
                if retailer_order.status == 'DRAFT' or retailer_order.status == '':
                    retailer_order.delete()
                else:
                    raise exceptions.ValidationError(
                        'Retailer order is already closed')
                return True
            else:
                raise exceptions.ValidationError(
                    'No retailer order exists for given ID')

    except KeyError:
        raise exceptions.ValidationError("Retailer order ID is required")


def update_retailer_order_item(data, user):
    errors = []
    retailer_order_item = None
    purchased_quantity = None
    status = 0
    shipping_amount = 0.0

    try:
        retailer_order_item_id = data["retailer_order_details"]["retailer_order_item_id"]
        if retailer_order_item_id == "":
            errors.append("Retailer order item ID cannot be empty")
        else:
            retailer_order_item = wholesalers_models_validators.validate_retailer_order_item_is_users(
                retailer_order_item_id, user)
    except KeyError:
        errors.append("Retailer order item ID is required")

    if "purchased_quantity" in data["retailer_order_details"]:
        purchased_quantity = data["retailer_order_details"]["purchased_quantity"]
        if int(purchased_quantity) < 1:
            errors.append("Purchased qua cannot be empty")
        if int(purchased_quantity) > int(retailer_order_item.wholesaler_receipt.current_unit_quantity):
            errors.append(
                "Required quantity cannot be more than available quantity")

    # if "status" in data["retailer_order_details"]:
    #     status = data["retailer_order_details"]["status"]

    # if "shipping_amount" in data["retailer_order_details"]:
    #     shipping_amount = data["retailer_order_details"]["shipping_amount"]
    #     if shipping_amount == "":
    #         errors.append("Pack quantity cannot be empty")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if purchased_quantity:
            retailer_order_item.purchased_quantity = purchased_quantity
            retailer_order_item.save()

        return retailer_order_item.retailer_order


def delete_retailer_order_item(data, user):
    retailer_order_item_id = None
    retailer_order_item = None
    retailer_order = None
    errors = []
    try:

        retailer_order_id = data["retailer_order_id"]
        if retailer_order_id == "":
            errors.append("Retailer order  ID cannot be empty")
    except KeyError:
        raise exceptions.ValidationError("Retailer order  ID is required")

    try:
        retailer_order_item_id = data["retailer_order_item_id"]
        if retailer_order_item_id == "":
            errors.append("Retailer order item ID cannot be empty")
        else:
            if RetailerOrderItems.objects.filter(id=retailer_order_item_id).exists():
                retailer_order_item = RetailerOrderItems.objects.filter(
                    id=retailer_order_item_id).first()
            else:
                errors.append('No item to delete')

    except KeyError:
        raise exceptions.ValidationError("Retailer order item ID is required")
    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if retailer_order_item:
            retailer_order_item.delete()
            return RetailerOrders.objects.filter(id=retailer_order_id).first()


def process_retailer_order_payment(data,user):
    retailer_order=None
    payment_method=None
    errors =[]

    if not data['retailer_order'] or data['retailer_order']=="":
        errors.append("Retailer order ID is required")

    if not data['payment_method'] or data['payment_method']=="":
        errors.append("Payment method ID is required")
    

    if RetailerOrders.objects.filter(id=data['retailer_order']).exists():
        retailer_order = RetailerOrders.objects.filter(id=data['retailer_order']).first()
    else:
        errors.append("No order with provided ID exists")

    if RetailerOrderPayments.objects.filter(retailer_order=retailer_order,status="SUCCESS").exists():
        errors.append("Order is already paid")
        return errors,None

    if PaymentMethods.objects.filter(id=data['payment_method']).exists():
        payment_method = PaymentMethods.objects.filter(id=data['payment_method']).first()
    else:
        errors.append("No payment method with provided ID exists")

    if payment_method.title =="CASH":
        # reference_number = generate_reference_number(retailer_order.wholesaler, user)
        retailer_order_payment = RetailerOrderPayments.objects.create(
            retailer_order=retailer_order,
            payment_method=payment_method,
            is_paid="true",
            is_settled="true",
            amount=retailer_order.final_price_total,
            entity=retailer_order.entity,
            status="SUCCESS",
            owner=user
        )

        retailer_order.payment_method = payment_method
        retailer_order.is_paid="true"
        retailer_order.save()

    elif payment_method.title=="MOBILE MONEY":
        if not data['mobile_money_phone'] or data['mobile_money_phone']=="":
            errors.append("Mobile money phone is required")
        create_log("INFO", f"mobile_money_phone: { data['mobile_money_phone']}")
        telco, formatted_phone_number = get_telco_by_phone_number( data['mobile_money_phone'])
        reference_number = generate_reference_number(retailer_order.wholesaler, user)

        payload_data = {
            "orderId": reference_number, "amount": int(retailer_order.final_price_total), "accountTo": config('WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT'),
            "description": f"Retailer order payment for  - {retailer_order}", "modeOfPayment": "MOBILE_MONEY",
            "provider": "Mpesa" if telco == "MPESA" else "AIRTELMONEY","currency":"KES",
            "data": {"phoneNumber": formatted_phone_number, "serviceType": "TOPUP"}, "callBackUrl": "https://webhook.site"
        }

        create_log("INFO", f"Payload: {payload_data}")

        try:
            auth_data = {"client_id": config("JAMBOPAY_CLIENT_ID"), "client_secret": config("JAMBOPAY_CLIENT_SECRET"), "grant_type": config("JAMBOPA_GRANT_TYPE")}
            auth_res = requests.post(config("JAMBOPAY_AUTH_URL1"), data=auth_data, timeout=8)
            token = auth_res.json().get("access_token")
            
            checkout_res = requests.post(config("JAMBOPAY_BASE_URL") + "/checkout/express", data=json.dumps(payload_data), headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "Accept": "*/*"}, timeout=10)
            result_json = checkout_res.json()

            create_log("INFO", f"Retailer order: {token}: {result_json}")

            if result_json and "ref" in result_json:
                retailer_order_payment = RetailerOrderPayments.objects.create(
                retailer_order=retailer_order,
                payment_method=payment_method,
                is_paid="false",
                is_settled="false",
                amount=retailer_order.final_price_total,
                entity=retailer_order.entity,
                status="PENDING",
                owner=user
            )
                return [],retailer_order
        except Exception as e:
            create_log("INFO", f"payment for {retailer_order} failed")
            errors.append(str(e))
            return errors, None


# Process payment
# def process_order_payment(retailer_order,user,payment_method):
#     reference_number = generate_reference_number(user.entity, user)

#     errors = []
#     administrator_account = None
#     if payment_method.title=="CASH":

#         # Cash payments
#         try:
#             customer_order_payment = RetailerOrderPayments.objects.create(
#                 payment_method=payment_method,
#                 pay_in_reference_number=reference_number,
#                 status="SUCCESS",
#                 amount=retailer_order.final_price_total+retailer_order.shipping_amount,
#                 entity=user.entity,
#                 currency="KES",
#                 owner=user,
#                 customer_order = retailer_order,
#             )
        
#             if customer_order_payment:
#                 print("Created")
#                 # print("payment", customer_order_payment)
#                 # update_stock(order_items)
#                 return [], retailer_order
#             else:
#                 print("Not Created")
#                 errors.append("Error while creating retailer order payment")
#                 return errors, None
#         except Exception as e:
#             errors.append(str(e))
#             return errors, None

#     elif payment_method.title=="MOBILE MONEY":
       
#         if not UserAccounts.objects.filter(owner = retailer_order.wholesaler.administrator).exists():
#             errors.append("Entity admin has no collection account")
#             return errors, None
#         else:
#             administrator_account =  UserAccounts.objects.filter(owner = retailer_order.wholesaler.administrator).first()
#             print("entity_collection_account",administrator_account)
      
#             payload = None
#             telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
        

#             if telco=="MPESA":
#                 payload = json.dumps({
#                     "orderId": reference_number,
#                     "amount": int(customer_order.final_price_total+ customer_order.shipping_amount),
#                     "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
#                     "accountTo":  administrator_account.account_number,
#                     "description": "Merchant payment",
#                     "modeOfPayment": "MOBILE_MONEY",
#                     "provider": "Mpesa",
#                     "data": {
#                         "phoneNumber": formatted_phone_number,
#                         "serviceType": "MERCHANTPAYMENT"
#                     }
#                     })
           
#             elif telco=="AIRTELMONEY":
#                 payload = json.dumps({
#                     "orderId": reference_number,
#                     "amount":  int(customer_order.final_price_total+ customer_order.shipping_amount),
#                     "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
#                     "accountTo":administrator_account.account_number, 
#                     "currency":"KES",
#                     "description": "TOPUP",
#                     "modeOfPayment": "MOBILE_MONEY",
#                     "provider": "AIRTELMONEY",
#                     "data": {
#                         "phoneNumber": formatted_phone_number,
#                         "serviceType": "MERCHANTPAYMENT" 
#                     }
            
#                     })
        
#             errors, result_json = jambopay_mobile_checkout(payload)
#             if result_json:
#                 print("Ikoooo")
#                 customer_order_payment = CustomerOrderPayment.objects.create(
#                     payment_method=payment_method,
#                     reference_number=reference_number,
#                     status="PENDING",
#                     amount=float(customer_order.final_price_total+ customer_order.shipping_amount),
#                     entity=entity,
#                     currency="KES",
#                     owner=user,
#                     customer_order = customer_order,
#                     administrator_account=administrator_account,
#                     psp_reference_number= result_json["ref"],
#                     telco= telco
#                 )
#                 use_reference_number(reference_number)
#                 if customer_order_payment:
#                     return [], customer_order
#                 else:
#                     errors.append("Customer order payment not created")
#                     return errors, None


#             else:
#                 print("Hamnaa")
#             return errors, None
#     elif payment_method.title=="JAMBOPAY WALLET":
#         if not UserAccounts.objects.filter(owner = user.entity.administrator).exists():
#             errors.append("Entity adminisrator has no collection account")
#             return errors, None
#         else:
#             administrator_account =  UserAccounts.objects.filter(owner = user.entity.administrator).first()

#         errors, wallet = get_account_by_phone(mobile_money_phone)
#         if wallet:
#             data ={
#                         "orderId": reference_number,
#                         "amount":  int(customer_order.final_price_total+ customer_order.shipping_amount),
#                         "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
#                         "accountTo": administrator_account.account_number,
#                         "description": "Customer order payment",
#                         "modeOfPayment": "WALLET_AS_SERVICE",
#                         "provider": "JAMBOPAY",
#                         "data": {
#                                 "serviceType": "MERCHANTPAYMENT",
#                                 "accountNo": wallet
#                         }
#                         }
#             response = jambopay_wallet_checkout(data)

#             if not "statusCode" in response and  "ref" in response:
#                 customer_order_payment = CustomerOrderPayment.objects.create(
#                     payment_method=payment_method,
#                     reference_number=reference_number,
#                     status="PENDING",
#                     amount=float(customer_order.final_price_total+ customer_order.shipping_amount),
#                     entity=user.entity,
#                     currency="KES",
#                     owner=user,
#                     customer_order = customer_order,
#                     entity_collection_account=administrator_account
#                 )
#                 use_reference_number(reference_number)
#                 if customer_order_payment:
                
#                     return [], customer_order
#                 else:
#                     errors.append("Ticket payment not created")
#                     return errors, [], None
#             else:
#                 # errors.append( str(response))
#                 return errors, None, None

#         else:
#             errors.append("No wallet for provided mobile phone")
#             return errors, None
#     else:
#         errors.append("Unsupported payment method")
#         return errors, None,None




# def process_retailer_order_payment(data,user):
#     payment_method = None
#     retailer_order = None
#     transaction_desc=""
#     shortcode =""
#     phone=""
#     amount =1
#     passkey =""
#     errors =[]
#     if not data['retailer_order'] or data['retailer_order']=="":
#         errors.append("Retailer order ID is required")

#     if RetailerOrders.objects.filter(id=data['retailer_order']).exists():
#         retailer_order = RetailerOrders.objects.filter(id=data['retailer_order']).first()

#     if not data['payment_method'] or data['payment_method']=="":
#         errors.append("Payment method ID is required")
#     else:
#         payment_method= validate_payment_method_exists(data["payment_method"])

#     # errors, mpesa_token=authorization_api.get_access_token()
#     reference_number = generate_reference_number(user.entity,user)

#     amount = data["amount"]
#     phone= data["phone"]
#     transaction_desc=data["transaction_desc"]
#     passkey=data["passkey"]
#     shortcode=data["shortcode"]
#     msisdn=data["msisdn"]

#     errors, response =c2b_register_url.register_url(shortcode)
#     create_log("warning",response)


#     print("errors at register url", errors)
#     print("response at register url", response)

#     reference_number= generate_reference_number(user.entity,user)
#     errors, response = c2b_register_url.validate_and_confirm(amount,msisdn,shortcode,reference_number)

#     print("errors at simulate ", errors)
#     print("response at simulate", response)
#     create_log("error",response)

    # errors, checkout_request_id =mpesa_express_api.initiate_stk_push(amount,transaction_desc,passkey,phone,reference_number,shortcode)
    # # print("errors at mpesa token", errors)
    # # print("checkout_request_id at mpesa stk", checkout_request_id)

    # create_log("warning",errors)
    # create_log("checkout_request_id",checkout_request_id)
    # if checkout_request_id:
    #     errors, message = transaction_status_api.query_stk_status(checkout_request_id,passkey,shortcode)


    #     create_log("warning",errors)
    #     create_log("warning",message)

    # return errors, retailer_order