
from asgiref.sync import async_to_sync
from asgiref.sync import sync_to_async
import asyncio
import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from . import models
from .serializers import ProductsSerializer
from uuid import UUID
import uuid
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

class ProductsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'products',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'products': json.loads(self.datum),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'products',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        authorized_products = []

        if models.Products.objects.filter(category__in=self.user.entity.categories.all(), active=True).exists():
            authorized_products = models.Products.objects.filter(
                category__in=self.user.entity.categories.all(), active=True).all()
        print("authorized_products",authorized_products)
        self.products = authorized_products
        json_data =ProductsSerializer(authorized_products,many=True,context={'request': None}).data
        data=json.dumps(json_data,cls=UUIDEncoder) 
        self.datum=data


    async def send_products(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'products': json.loads(self.datum),
                    
                })
 