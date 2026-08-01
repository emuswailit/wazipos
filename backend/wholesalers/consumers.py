import json
from channels.generic.websocket import AsyncWebsocketConsumer,JsonWebsocketConsumer
from asgiref.sync import async_to_sync
from retailers.models import RetailerReceipts
from retailers.serializers import RetailerReceiptsSerializer



class WholesalerInventoryConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add('wholesaler-discounts',self.channel_name)
        await self.accept()

    async def disconnect(self):
        await self.channel_layer.group_discard('wholesaler-discounts',self.channel_name)

    async def send_wholesaler_discounts(self, event):
        discounts_message = event['data']
        print("messs",discounts_message)
        await self.send(discounts_message)