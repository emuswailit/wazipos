# consumers.py

import json

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from retailers.models import RetailerProductRequest
from retailers.serializers import RetailerProductRequestSerializer
from utils.UUIDEncoder import UUIDEncoder
from wholesalers.models import RetailerOrders, WholesalerReceipts
from wholesalers.serializers import (
    RetailerOrdersSerializer,
    WholesalerReceiptsSerializer,
)


class WholesalerInventoryConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'wholesaler-inventory',
            self.channel_name,
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
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        wholesaler_receipts = WholesalerReceipts.objects.filter(
            entity=self.user.entity,
            current_unit_quantity__gte=1,
        )

        sers = WholesalerReceiptsSerializer(
            wholesaler_receipts,
            many=True,
            context={'request': None},
        ).data

        self.datum = json.dumps(sers, cls=UUIDEncoder)

    async def send_wholesaler_receipts(self, event):
        # Call the helper async Function
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
            'retailer-orders',
            self.channel_name,
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
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        """
        Latest 20 orders for this entity, most recent first.
        """
        retailer_orders = (
            RetailerOrders.objects
            .filter(wholesaler=self.user.entity)
            .order_by('-created')[:20]
        )

        orders = RetailerOrdersSerializer(
            retailer_orders,
            many=True,
            context={'request': None},
        ).data

        self.retailer_orders = json.dumps(
            orders, cls=UUIDEncoder
        )

    async def send_retailer_orders(self, event):
        # Call the helper async Function
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
            'filtered-retailer-orders',
            self.channel_name,
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'filtered_retailer_orders': json.loads(
                self.retailer_orders
            ),
        })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'filtered-retailer-orders',
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        """
        Latest 20 orders where this entity is the retailer,
        most recent first.
        """
        retailer_orders = (
            RetailerOrders.objects
            .filter(retailer=self.user.entity)
            .order_by('-created')[:20]
        )

        orders = RetailerOrdersSerializer(
            retailer_orders,
            many=True,
            context={'request': None},
        ).data

        self.retailer_orders = json.dumps(
            orders, cls=UUIDEncoder
        )

    async def send_filtered_retailer_orders(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'filtered_retailer_orders': json.loads(
                self.retailer_orders
            ),
        })


class WholesalerProductRequestsConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'wholesaler-product-requests',
            self.channel_name,
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'wholesaler_product_requests': json.loads(
                self.wholesaler_product_requests
            ),
        })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'wholesaler-product-requests',
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        # Target-pair filter — only requests where this wholesaler
        # is an active target on at least one line, excluding
        # terminal statuses.
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

        product_requests = RetailerProductRequestSerializer(
            wholesaler_product_requests,
            many=True,
            context={'request': None},
        ).data

        self.wholesaler_product_requests = json.dumps(
            product_requests, cls=UUIDEncoder
        )

    async def send_wholesaler_product_requests(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'wholesaler_product_requests': json.loads(
                self.wholesaler_product_requests
            ),
        })