# import json
import simplejson as json
from symtable import Function
from channels.generic.websocket import AsyncWebsocketConsumer,JsonWebsocketConsumer,WebsocketConsumer
from asgiref.sync import async_to_sync
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from retailers.models import OutOfStock, RetailerReceipts,CustomerOrders,Prescriptions
from retailers.serializers import RetailerReceiptsSerializer,OutOfStocksSerializer,CustomerOrdersSerializer,MiniCustomerOrdersSerializer,RetailPrescriptionsSerializer
from products.models import Products
from authentication.serializers import UsersSerializer
from authentication.models import Users
from djangochannelsrestframework.generics import GenericAsyncAPIConsumer
from djangochannelsrestframework.observer import model_observer
from djangochannelsrestframework.decorators import action
from djangochannelsrestframework.mixins import ListModelMixin
from djangochannelsrestframework import permissions
from uuid import UUID
from core.date_utils import get_formatted_from_date, get_formatted_to_date
import asyncio
import logging
import dateutil.parser
from django.utils import timezone
from datetime import date, datetime, timedelta
import json
import uuid 

logger = logging.getLogger("retailers.consumers")

# class UUIDEncoder(json.JSONEncoder):
#     def default(self, obj):
#         if isinstance(obj, UUID):
#             # if the obj is uuid, we simply return the value of uuid
#             return obj.hex
#         return json.JSONEncoder.default(self, obj)

class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            # Explicitly return the standard string representation
            return str(obj)
        return super().default(obj)

# class WholesaleDiscountsConsumer(JsonWebsocketConsumer):
#     def connect(self):
#         print("Am at the connect")
#         async_to_sync(self.channel_layer.group_add('wholesaler-discounts',self.channel_name))
#         self.accept()
    
#     def disconnect(self, code):
#         print("Disconnected!")
#         async_to_sync(self.channel_layer.group_discard('wholesaler-discounts',self.channel_name))
#         return super().disconnect(code)

       
#     def send_wholesaler_discounts(self, event):
#         print("Am at the consumer")
#         print("Event", event)
#         discounts_message = event['data']
#         print("messs",json.loads(discounts_message))
#         # receipts=RetailerReceipts.objects.filter(unit_quantity__gte=0).all()
#         # retailer_receipts =RetailerReceiptsSerializer(receipts,many=True).data
#         async_to_sync(self.send(json.loads(discounts_message))) 



# from channels.generic.websocket import AsyncWebsocketConsumer

class WholesaleDiscountsConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        print("Am at the connect")
        await self.channel_layer.group_add('wholesaler-discounts',self.channel_name)
        await self.accept()

    async def disconnect(self):
        await self.channel_layer.group_discard('wholesaler-discounts',self.channel_name)

    async def send_wholesaler_discounts(self, event):
        print("Am at the consumer")
        print("Event", event)
        discounts_message = event['data']
        print("messs",discounts_message)
        await self.send(discounts_message)



import asyncio
import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer



class RetailerOutOfStocksConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'oss',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'out_of_stocks': json.loads(self.datum),
                    
                })


        

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'oss',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        os_items = OutOfStock.objects.all()
        print("qsw",os_items)
        # for item in os_items:
            # print("idem",item)
        self.out_of_stocks = os_items
        sers =OutOfStocksSerializer(os_items,many=True,).data
        data=json.dumps(sers,cls=UUIDEncoder)
        print("Data as s2s",data)
        self.datum=data


    async def send_retailer_out_of_stocks(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'out_of_stocks': json.loads(self.datum)
                   
                })


class RetailerInventoryConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'retail-inventory',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'inventory': json.loads(self.datum),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'retail-inventory',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        retailer_receipts = RetailerReceipts.objects.filter(entity=self.user.entity,current_unit_quantity__gte=0)
        self.retailer_receipts = retailer_receipts
        sers =RetailerReceiptsSerializer(retailer_receipts,many=True,context={'request': None}).data
        data=json.dumps(sers,cls=UUIDEncoder)
 
        
        self.datum=data


    async def send_retailer_receipts(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'inventory': json.loads(self.datum),
                    
                })
        
class ShopInventoryConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        self.selected_query_entity = self.scope["selected_query_entity"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'shop-inventory',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'shop_inventory': json.loads(self.shop_inventory),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'shop-inventory',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):

        shop_inventory = RetailerReceipts.objects.filter(unit_quantity__gte=0,entity_id=self.selected_query_entity).exclude(product__is_pom=True)
       
        sers =RetailerReceiptsSerializer(shop_inventory,many=True,context={'request': None}).data
        data=json.dumps(sers,cls=UUIDEncoder)
 
        self.shop_inventory = data
        


    async def send_shop_inventory(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'shop_inventory': json.loads(self.shop_inventory),
                    
                })
        


class RetailerDashboardsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'retailer-dashboard',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'retailer_dashboard': json.loads(self.retailer_dashboard),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'retailer-dashboard',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        from retailers.models import CustomerOrderItems,CustomerOrders,RetailerReceipts,CustomerOrderPayment
        from wholesalers.models import RetailerOrders
        final={}
        weekly_orders =[]
        days=[]
        now = datetime.now()

        for x in range(7):
            items_value=0.00
            all_payments_value=0.00
            orders=[]
            d = now - timedelta(days=x)
            next_d = d + timedelta(days=1)
            days.append(d)
            all_payments = CustomerOrderPayment.objects.filter(entity=self.user.entity,status="SUCCESS").all()
            for payment in all_payments:
                all_payments_value=all_payments_value+float(payment.amount)

            all_receipts = RetailerReceipts.objects.filter(entity=self.user.entity).all()
            all_orders = CustomerOrders.objects.filter(entity=self.user.entity,).all()
            all_requisitions = RetailerOrders.objects.filter(entity=self.user.entity,).all()
            final["retailer_receipts"]=len(all_receipts)
            final["customer_orders"]=len(all_orders)
            final["wholesale_requisitions"]=len(all_requisitions)
            final["all_payments_count"]=len(all_payments)
            final["all_payments_value"]=all_payments_value

            followers = self.user.entity.followers.all()
            final["followers"]=len(followers)

            ## Filtering order items and orders

            items = CustomerOrderItems.objects.filter(entity=self.user.entity,created__gte=d,created__lt=next_d,customer_order__is_paid="true")
            orders = CustomerOrders.objects.filter(entity=self.user.entity,created__gte=d,created__lt=next_d,is_paid="true").all()
            for item in items:
                items_value=items_value+ float(item.item_price_total)
                print(item.created)
            weekly_orders.append({"date":d.strftime("%Y-%m-%d"),"items":len(items),"value":items_value,"orders":len(orders)})
        
        final["weekly_orders"]=weekly_orders

        data=json.dumps(final,cls=UUIDEncoder)
 
        self.retailer_dashboard = data
        


    async def send_retailer_dashboard(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'retailer_dashboard': json.loads(self.retailer_dashboard),
                    
                })
        



class BodabodaAssignedOrdersConsumer(AsyncJsonWebsocketConsumer):
    print("Am here at boda")
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            print("No user")
            return
        else:
            print("user at boda", self.user)
        
        await self.channel_layer.group_add(
            f'bodaboda-assigned-order',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        if self.bodaboda_assigned_order and len(self.bodaboda_assigned_order)>0:
            await self.send_json({
                        'bodaboda_assigned_order': json.loads(self.bodaboda_assigned_order),
                        
                    })
        else:
            await self.send_json({
                        'bodaboda_assigned_order': None,
                        
                    })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'bodaboda-assigned-order',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        from entitylocations.models import BodaLocations

        bodaboda = None
        bodaboda_assigned_order=None
        self.bodaboda_assigned_order=None
        data=None
        yesterday = dateutil.parser.parse(str( date.today() - timedelta(days = 1))).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        # yesterday = date.today() - timedelta(days = 1)
        print("Yesterday", yesterday)
        if BodaLocations.objects.filter(owner=self.user).exists():
            bodaboda = BodaLocations.objects.filter(owner=self.user).first()

            if CustomerOrders.objects.filter(bodaboda=bodaboda,created__gte=yesterday,status="ASSIGNED").exists():
                bodaboda_assigned_order = CustomerOrders.objects.filter(bodaboda=bodaboda,created__gte=yesterday,status="ASSIGNED").all()
     

                self.bodaboda_assigned_order = bodaboda_assigned_order
        
                orders =CustomerOrdersSerializer(bodaboda_assigned_order,many=True,context={'request': None}).data
                data=json.dumps(orders,cls=UUIDEncoder)
                
                self.bodaboda_assigned_order=data
            else:
                self.bodaboda_assigned_order=None

        else:
            self.bodaboda_assigned_order=None

    async def send_bodaboda_assigned_order(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        if self.bodaboda_assigned_order and len(self.bodaboda_assigned_order)>0:
            await self.send_json({
                        'bodaboda_assigned_order': json.loads(self.bodaboda_assigned_order),
                        
                    })
        else:
            await self.send_json({
                        'bodaboda_assigned_order': None,
                        
                    })
        

        

class CustomerOrdersConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'customer-orders',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_orders': json.loads(self.customer_orders),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'customer-orders',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        formatted_from_date = dateutil.parser.parse(str(timezone.now().date())).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        customer_orders = CustomerOrders.objects.filter(entity=self.user.entity,created__gte=formatted_from_date).order_by('-created')

        self.customer_orders = customer_orders
        
        orders =CustomerOrdersSerializer(customer_orders,many=True,context={'request': None}).data
        data=json.dumps(orders,cls=UUIDEncoder)
        
        self.customer_orders=data


    async def send_customer_orders(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_orders': json.loads(self.customer_orders),
                    
                })
class UserOrdersConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):

        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'user-orders',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'user_orders': json.loads(self.user_orders),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'user-orders',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        user_orders = CustomerOrders.objects.filter(customer=self.user)[:10]

        self.user_orders = user_orders
        
        orders =CustomerOrdersSerializer(user_orders,many=True,context={'request': None}).data
        data=json.dumps(orders,cls=UUIDEncoder)
        
        self.user_orders=data


    async def send_user_orders(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_orders': json.loads(self.user_orders),
                    
                })
        
class UserPrescriptionsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'user-prescriptions',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'user_prescriptions': json.loads(self.user_prescriptions),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'user-prescriptions',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        user_prescriptions = Prescriptions.objects.filter(created_by=self.user)

        self.user_prescriptions = user_prescriptions
        
        orders =RetailPrescriptionsSerializer(user_prescriptions,many=True,context={'request': None}).data
        data=json.dumps(orders,cls=UUIDEncoder)
        
        self.user_prescriptions=data


    async def send_user_prescriptions(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'user_prescriptions': json.loads(self.user_prescriptions),
                    
                })
        


# class CustomerOrderNotificationConsumer(ListModelMixin, GenericAsyncAPIConsumer):

#     queryset = CustomerOrders.objects.all()
#     serializer_class = CustomerOrdersSerializer
#     permissions = (permissions.AllowAny,)

#     async def connect(self, **kwargs):
#         self.user = self.scope["user"]
#         logger.warn("Connected to retailer consumer")
#         await self.model_change.subscribe()
#         await super().connect()

#     @model_observer(CustomerOrders)
#     async def model_change(self, message, observer=None, **kwargs):
#         logger.warn("message", message)
#         await self.send_json(message)

#     @model_change.serializer
#     def model_serialize(self, instance, action, **kwargs):
#         print("the instance",instance)
#         data = dict(data=CustomerOrdersSerializer(instance=instance).data,context={'request':  None}, action=action.value)
#         data_j=json.dumps(data,cls=UUIDEncoder)
#         self.retailer_receipts= data_j
#         logger.warn(self.retailer_receipts)
#         return json.loads(self.retailer_receipts)
    

class RetailerReceiptsConsumer(ListModelMixin, GenericAsyncAPIConsumer):

    queryset = RetailerReceipts.objects.all()
    serializer_class = RetailerReceiptsSerializer
    permissions = (permissions.AllowAny,)

    async def connect(self, **kwargs):
        logger.warn("Connected to retailer consumer")
        await self.model_change.subscribe()
        await super().connect()

    @model_observer(RetailerReceipts)
    async def model_change(self, message, observer=None, **kwargs):
        logger.warn("message", message)
        await self.send_json(message)

    @model_change.serializer
    def model_serialize(self, instance, action, **kwargs):
        data = dict(data=RetailerReceiptsSerializer(instance=instance).data,context={'request':  None}, action=action.value)
        data_j=json.dumps(data,cls=UUIDEncoder)
        self.retailer_receipts= data_j
        logger.warn(self.retailer_receipts)
        return json.loads(self.retailer_receipts)
# class RetailerReceiptsConsumer(GenericAsyncAPIConsumer):
#     queryset = Users.objects.all()
#     serializer_class = UsersSerializer

#     @model_observer(RetailerReceipts)
#     async def retailer_receipts_activity(
#         self,
#         message: RetailerReceiptsSerializer,
#         observer=None,
#         subscribing_request_ids=[],
#         **kwargs
#     ):
#         print("receipts",message.data)
#         await self.send_json(message.data)

#     @retailer_receipts_activity.serializer
#     def retailer_receipts_activity(self, instance: RetailerReceipts, action, **kwargs) -> RetailerReceiptsSerializer:
#         """This will return the retailer receipts serializer"""
#         return RetailerReceiptsSerializer(instance)

#     @retailer_receipts_activity.groups_for_signal
#     def retailer_receipts_activity(self, instance: RetailerReceipts, **kwargs):
#         # this block of code is called very often *DO NOT make DB QUERIES HERE*
#         yield f'-user__{instance.id}'  #! the string **user** is the ``Comment's`` user field.

#     @retailer_receipts_activity.groups_for_consumer
#     def retailer_receipts_activity(self, school=None, classroom=None, **kwargs):
#         # This is called when you subscribe/unsubscribe
#         yield f'-user__{self.scope["user"].pk}'

#     @action()
#     async def subscribe_to_retailer_receipts_activity(self, request_id, **kwargs):
#         # We will check if the user is authenticated for subscribing.
#         if "user" in self.scope and self.scope["user"].is_authenticated:
#             print("logged in user",self.scope["user"]['first_name'])
#             await self.retailer_receipts_activity.subscribe(request_id=request_id)


class CustomerOrderNotificationsConsumer(WebsocketConsumer):
    def connect(self):
        user = self.scope["user"]
        if user.is_authenticated:
            self.group_name = f"user_{user.id}"
            async_to_sync(self.channel_layer.group_add)(
                self.group_name, self.channel_name
            )
            self.accept()
        else:
            self.close()

    def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            print("Disconnecting from group", self.group_name)
            print("Channel name", self.channel_name)

            async_to_sync(self.channel_layer.group_discard)(
                self.group_name, self.channel_name
            )

    def send_notification(self, event):
        print("Event data received in consumer:", event)

        customer_name = event["customer_name"]
        customer_phone = event["customer_phone"]
        delivery_method = event["delivery_method"]
        is_received = event["is_received"]
        is_delivered = event["is_delivered"]
        selected_payment_method = event["selected_payment_method"]
        selected_payment_method_title = event["selected_payment_method_title"]
        is_paid = event["is_paid"]
        shipping_cost = event["shipping_cost"]
        order_price_total = event["order_price_total"]
        entity = event["entity"]
        entity_title = event["entity_title"]
        owner = event["owner"]
        status = event["status"]
        id = event["id"]
        self.send(text_data=json.dumps({
           "customer_name": customer_name,
           "customer_phone": customer_phone,
           "delivery_method": delivery_method,
           "is_received": is_received,
           "is_delivered": is_delivered,
           "selected_payment_method": selected_payment_method,
           "selected_payment_method_title": selected_payment_method_title,
           "is_paid": is_paid,
           "shipping_cost": shipping_cost,
           "order_price_total": order_price_total,
           "entity": entity,
           "entity_title": entity_title,
           "owner": owner,

           "status": status,
           "id": id,    
      
        }))

class InventoryPredictionsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'inventory-predictions',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'inventory_predictions': json.loads(self.inventory_predictions),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'inventory-predictions',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        inventory_predictions = json.dumps({"name":"Mike"})

        self.inventory_predictions = inventory_predictions
        
        # orders =RetailPrescriptionsSerializer(inventory_predictions,many=True,context={'request': None}).data
        # data=json.dumps(orders,cls=UUIDEncoder)
        
        # self.inventory_predictions=data


    async def send_inventory_predictions(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'inventory_predictions': json.loads(self.inventory_predictions),
                    
                })
        


        

class OrderDetailsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'customer-order-details',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_order_details': json.loads(self.datum),
                    
                })


        

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'customer-order-details',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        order_id = self.scope["url_route"]["kwargs"]["order_id"]
        customer_order = CustomerOrders.objects.filter(id=order_id).first()
       
        self.customer_order = customer_order
        sers =CustomerOrdersSerializer(customer_order,many=False,).data
        data=json.dumps(sers,cls=UUIDEncoder)
        print("Data as s2s",data)
        self.datum=data


    async def send_customer_order_details(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_order_details': json.loads(self.datum)
                   
                })


import json, numpy as np, pandas as pd
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from asgiref.sync import sync_to_async
from sklearn.linear_model import LinearRegression
from products.models import Products
from .models import RetailerReceipts, OutOfStock, CustomerOrderItems, RetailerOrders, RetailerOrderItems, WholesalerReceipts

class InventoryPredictionConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated: return
        await self.channel_layer.group_add('inventory-predictions', self.channel_name)
        await self.accept()
        await self.helper_func()
        await self.send_json({'status': 'completed', 'retailer_id': str(self.retailer_id) if self.retailer_id else None, 'retailer_name': self.retailer_name, 'predictions': json.loads(self.predictions)})

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard('inventory-predictions', self.channel_name)
        await self.close()

    @sync_to_async
    def helper_func(self):
        ent = getattr(self.user, 'entity', None) or getattr(getattr(self.user, 'employee', None), 'entity', None)
        if not ent:
            self.retailer_id, self.retailer_name, self.predictions = None, None, json.dumps([])
            return
        self.retailer_id, self.retailer_name, cycle_days, today = ent.id, getattr(ent, 'title', self.user.username), getattr(ent, 'order_days', 30), timezone.now().date()
        
        r_pids = list(RetailerReceipts.objects.filter(received_from=ent, is_active="true").values_list('product_id', flat=True))
        if not r_pids: r_pids = list(RetailerReceipts.objects.filter(owner=self.user, is_active="true").values_list('product_id', flat=True))
        o_pids = list(OutOfStock.objects.filter(owner_id=self.user.id).values_list('product_id', flat=True))
        p_ids = set(r_pids + o_pids)
        compiled = []

        for p_id in p_ids:
            try:
                p = Products.objects.filter(id=p_id, active=True).first()
                if not p: continue
                
                s_qs = list(CustomerOrderItems.objects.filter(retailer_receipt__product_id=p.id, customer_order__entity=ent, customer_order__status="COMPLETED").values('customer_order__created', 'purchased_quantity'))
                if not s_qs: s_qs = list(CustomerOrderItems.objects.filter(retailer_receipt__product_id=p.id, customer_order__owner=self.user, customer_order__status="COMPLETED").values('customer_order__created', 'purchased_quantity'))
                o_qs = list(OutOfStock.objects.filter(product_id=p.id, owner_id=self.user.id).values('created', 'required_quantity'))

                cl_s = [{'d': i['customer_order__created'].date() if hasattr(i['customer_order__created'], 'date') else pd.to_datetime(i['customer_order__created']).date(), 'q': int(i['purchased_quantity'])} for i in s_qs]
                cl_o = [{'d': i['created'].date() if hasattr(i['created'], 'date') else pd.to_datetime(i['created']).date(), 'q': int(i['required_quantity'])} for i in o_qs]

                if len(cl_s) + len(cl_o) < 3: daily_demand, safety_stock = Decimal('0.0000'), 0
                else:
                    df = pd.concat([pd.DataFrame(cl_s) if cl_s else pd.DataFrame(columns=['d','q']), pd.DataFrame(cl_o) if cl_o else pd.DataFrame(columns=['d','q'])], ignore_index=True)
                    df['d'] = pd.to_datetime(df['d'])
                    df.set_index('d', inplace=True)
                    m = df.resample('ME')['q'].sum().reset_index()
                    if len(m) < 3: daily_demand, safety_stock = Decimal('0.0000'), 0
                    else:
                        m['idx'] = np.arange(len(m))
                        daily_demand = Decimal(str(max(0, int(round(LinearRegression().fit(m[['idx']].values, m['q'].values).predict(np.array([[len(m)]]))))))) / Decimal('30.4')
                        w = df.resample('W')['q'].sum()
                        safety_stock = int(round((w.std() / 7) * 1.65)) if len(w) > 1 and not pd.isna(w.std()) else 0

                sup = WholesalerReceipts.objects.filter(product=p, current_unit_quantity__gt=0).select_related('received_from').order_by('final_unit_selling_price').first()
                l_days, l_var = 5, 2
                if sup and sup.received_from:
                    po = list(RetailerOrders.objects.filter(wholesaler=sup.received_from, retailer=ent, status="RECEIVED", is_received="true").values('created', 'received_at')[:10])
                    if not po: po = list(RetailerOrders.objects.filter(wholesaler=sup.received_from, owner=self.user, status="RECEIVED", is_received="true").values('created', 'received_at')[:10])
                    if len(po) >= 2:
                        durs = pd.Series([(o['received_at'].date() - o['created'].date()).days if hasattr(o['received_at'], 'date') else (o['received_at'] - o['created']).days for o in po])
                        if len(durs) > 1 and not pd.isna(durs.std()): l_days, l_var = max(1, int(round(durs.mean()))), max(0, int(round(durs.std())))

                total_days = l_days + l_var + cycle_days
                cutoff = today + timezone.timedelta(days=int(total_days))
                
                batches = RetailerReceipts.objects.filter(product=p, owner=self.user, is_active="true", current_unit_quantity__gt=0).order_by('expiry_date')
                if not batches.exists(): batches = RetailerReceipts.objects.filter(product=p, received_from=ent, is_active="true", current_unit_quantity__gt=0).order_by('expiry_date')
                usable, expired, batch_log = 0, 0, []
                
                for b in batches:
                    is_exp = b.expiry_date <= cutoff if b.expiry_date else False
                    batch_log.append({"batch_number": b.batch, "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None, "units_remaining": b.current_unit_quantity, "will_expire_during_plan_period": is_exp})
                    if is_exp: expired += b.current_unit_quantity
                    else: usable += b.current_unit_quantity

                pending = RetailerOrderItems.objects.filter(wholesaler_receipt__product_id=p.id, retailer_order__retailer=ent, retailer_order__status__in=["SUBMITTED", "PROCESSING", "DISPATCHED"], is_received="false").aggregate(t=Sum('purchased_quantity'))['t'] or 0
                if pending == 0: pending = RetailerOrderItems.objects.filter(wholesaler_receipt__product_id=p.id, retailer_order__owner=self.user, retailer_order__status__in=["SUBMITTED", "PROCESSING", "DISPATCHED"], is_received="false").aggregate(t=Sum('purchased_quantity'))['t'] or 0
                
                backlog = OutOfStock.objects.filter(product=p, owner_id=self.user.id, is_ordered="false", created__gte=today - timezone.timedelta(days=int(cycle_days))).aggregate(t=Sum('required_quantity'))['t'] or 0
                
                needed = int(round(daily_demand * total_days)) + safety_stock
                suggested = max(0, (needed - usable - pending)) + backlog

                compiled.append({
                    "product_id": p.id, "product_title": p.product_name(), "sku": getattr(p, 'bar_code', None), "is_drug": p.check_is_drug,
                    "calculated_metrics": {"average_daily_demand": float(round(daily_demand, 4)), "supplier_lead_time_days": l_days, "supplier_delay_days": l_var, "safety_stock_units": safety_stock, "total_days_planned_for": total_days, "total_units_needed": needed},
                    "current_stock_status": {"total_physical_on_hand": usable + expired, "good_usable_units": usable, "expiring_units_warning": expired, "units_already_ordered": pending, "customer_waitlist_units": backlog, "existing_expiries": batch_log},
                    "order_suggestion": {"suggested_order_quantity": suggested, "supplier": {"id": sup.received_from.id if sup and sup.received_from else None, "name": sup.received_from.title if sup and sup.received_from else None, "unit_price": float(sup.final_unit_selling_price) if sup else None}}
                })
            except: continue
        self.predictions = json.dumps(compiled, default=lambda o: str(o) if hasattr(o, 'hex') else o)

    async def send_inventory_predictions(self, event):
        await self.helper_func()
        await self.send_json({'status': 'completed', 'retailer_id': str(self.retailer_id) if self.retailer_id else None, 'retailer_name': self.retailer_name, 'predictions': json.loads(self.predictions)})

    locals()["send_inventory-predictions"] = send_inventory_predictions
