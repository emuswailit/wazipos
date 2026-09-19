import json
from channels.generic.websocket import AsyncWebsocketConsumer,JsonWebsocketConsumer
from asgiref.sync import async_to_sync
from wholesalers.models import WholesalerReceipts
from wholesalers.serializers import WholesalerReceiptsSerializer
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from utils.UUIDEncoder import UUIDEncoder



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