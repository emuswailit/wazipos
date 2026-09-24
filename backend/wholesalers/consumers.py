import json
from channels.generic.websocket import AsyncWebsocketConsumer,JsonWebsocketConsumer
from asgiref.sync import async_to_sync
from wholesalers.models import WholesalerReceipts, RetailerOrders
from wholesalers.serializers import WholesalerReceiptsSerializer,RetailerOrdersSerializer
from retailers.models import RetailerProductRequest,RetailerProductRequestItem,RetailerProductRequestItemWholesaler
from retailers.serializers import RetailerProductRequestSerializer
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from utils.UUIDEncoder import UUIDEncoder
import dateutil.parser



class WholesalerInventoryConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'wholesaler-inventory',
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
            'wholesaler-inventory',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        wholesaler_receipts = WholesalerReceipts.objects.filter(entity=self.user.entity,current_unit_quantity__gte=1)
        self.wholesaler_receipts = wholesaler_receipts
        sers =WholesalerReceiptsSerializer(wholesaler_receipts,many=True,context={'request': None}).data
        data=json.dumps(sers,cls=UUIDEncoder)
 
        
        self.datum=data


    async def send_wholesaler_receipts(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'inventory': json.loads(self.datum),
                    
                })


class RetailerOrdersConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'retailer-orders',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'retailer_orders': json.loads(self.retailer_orders),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'retailer-orders',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        formatted_from_date = dateutil.parser.parse(str(timezone.now().date())).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        retailer_orders = RetailerOrders.objects.filter(entity=self.user.entity,created__gte=formatted_from_date).order_by('-created')

        self.retailer_orders = retailer_orders
        
        orders =RetailerOrdersSerializer(retailer_orders,many=True,context={'request': None}).data
        data=json.dumps(orders,cls=UUIDEncoder)
        
        self.retailer_orders=data


    async def send_retailer_orders(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'retailer_orders': json.loads(self.retailer_orders),
                    
                })

        
class FilteredRetailerOrdersConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'filtered-retailer-orders',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'filtered_retailer_orders': json.loads(self.retailer_orders),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'filtered-retailer-orders',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        formatted_from_date = dateutil.parser.parse(str(timezone.now().date())).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        retailer_orders = RetailerOrders.objects.filter(retailer=self.user.entity,created__gte=formatted_from_date).order_by('-created')

        self.retailer_orders = retailer_orders
        
        orders =RetailerOrdersSerializer(retailer_orders,many=True,context={'request': None}).data
        data=json.dumps(orders,cls=UUIDEncoder)
        
        self.retailer_orders=data


    async def send_filtered_retailer_orders(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'filtered_retailer_orders': json.loads(self.retailer_orders),
                    
                })

        
class WholesalerProductRequestsConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'wholesaler-product-requests',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'wholesaler_product_requests': json.loads(self.wholesaler_product_requests),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'wholesaler-product-requests',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        formatted_from_date = dateutil.parser.parse(str(timezone.now().date())).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        # wholesaler_product_requests = RetailerProductRequest.objects.filter(retailer=self.user.entity,created__gte=formatted_from_date).order_by('-created')
        wholesaler_product_requests = (
            RetailerProductRequest.objects
            .filter(
                items__target_pairs__wholesaler=self.user.entity,
                items__target_pairs__is_active=True,
            )
            .exclude(
                status__in=[
                    RetailerProductRequest.Status.CANCELLED,
                    RetailerProductRequest.Status.FULFILLED,
                    RetailerProductRequest.Status.EXPIRED,
                ]
            )
            .distinct()
            .order_by('-created')
        )
        
        self.wholesaler_product_requests = wholesaler_product_requests
        
        product_requests =RetailerProductRequestSerializer(wholesaler_product_requests,many=True,context={'request': None}).data
        data=json.dumps(product_requests,cls=UUIDEncoder)
        
        self.wholesaler_product_requests=data


    async def send_wholesaler_product_requests(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'wholesaler_product_requests': json.loads(self.wholesaler_product_requests),
                    
                })


        