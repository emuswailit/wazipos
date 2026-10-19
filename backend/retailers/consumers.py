# retailers/consumers.py

import json
from datetime import date, datetime, timedelta
from datetime import timedelta
from django.utils import timezone

import dateutil.parser
import simplejson
from asgiref.sync import async_to_sync, sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import (
    AsyncJsonWebsocketConsumer,
    AsyncWebsocketConsumer,
    JsonWebsocketConsumer,
    WebsocketConsumer,
)
from django.utils import timezone
from djangochannelsrestframework import permissions
from djangochannelsrestframework.decorators import action
from djangochannelsrestframework.generics import GenericAsyncAPIConsumer
from djangochannelsrestframework.mixins import ListModelMixin
from djangochannelsrestframework.observer import model_observer

from authentication.models import Users
from authentication.serializers import UsersSerializer
from core.date_utils import get_formatted_from_date, get_formatted_to_date
from products.models import Products
from retailers.models import (
    CustomerOrders,
    OutOfStock,
    Prescriptions,
    RetailerIndent,
    RetailerProductRequest,
    RetailerReceipts,
)
from retailers.serializers import (
    CustomerOrdersSerializer,
    MiniCustomerOrdersSerializer,
    OutOfStocksSerializer,
    RetailPrescriptionsSerializer,
    RetailerIndentSerializer,
    RetailerProductRequestSerializer,
    RetailerReceiptsSerializer,
)
from symtable import Function
from utils.UUIDEncoder import UUIDEncoder

import asyncio
import logging
import time
from decimal import Decimal
from uuid import UUID

logger = logging.getLogger("retailers.consumers")


# =====================================================================
# Wholesaler discounts (dormant — kept for reference)
# =====================================================================

class WholesaleDiscountsConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        print("Am at the connect")
        await self.channel_layer.group_add(
            'wholesaler-discounts',
            self.channel_name,
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'wholesaler-discounts',
            self.channel_name,
        )

    async def send_wholesaler_discounts(self, event):
        print("Am at the consumer")
        print("Event", event)
        discounts_message = event['data']
        print("messs", discounts_message)
        await self.send(discounts_message)


# =====================================================================
# Retailer out-of-stocks
# =====================================================================

class RetailerOutOfStocksConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'oss',
            self.channel_name,
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
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        os_items = OutOfStock.objects.all()
        print("qsw", os_items)
        sers = OutOfStocksSerializer(os_items, many=True).data
        data = json.dumps(sers, cls=UUIDEncoder)
        print("Data as s2s", data)
        self.datum = data

    async def send_retailer_out_of_stocks(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'out_of_stocks': json.loads(self.datum),
        })


# =====================================================================
# Retailer inventory
# =====================================================================

class RetailerInventoryConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'retail-inventory',
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
            'retail-inventory',
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        retailer_receipts = RetailerReceipts.objects.filter(
            entity=self.user.entity,
            current_unit_quantity__gte=0,
        )
        sers = RetailerReceiptsSerializer(
            retailer_receipts,
            many=True,
            context={'request': None},
        ).data
        self.datum = json.dumps(sers, cls=UUIDEncoder)

    async def send_retailer_receipts(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'inventory': json.loads(self.datum),
        })


# =====================================================================
# Retailer indents
# =====================================================================

class RetailerIndentsConsumer(AsyncJsonWebsocketConsumer):
    GROUP_NAME = "retailer-indents"

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)

        if not self.user.is_authenticated:
            await self.close()
            return

        await self.channel_layer.group_add(
            self.GROUP_NAME,
            self.channel_name,
        )
        await self.accept()

        # Initial snapshot
        await self.push_snapshot()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.GROUP_NAME,
            self.channel_name,
        )

    # Group event handler — the signal sends:
    #   { "type": "send.retailer.indents" }
    async def send_retailer_indents(self, event):
        await self.push_snapshot()

    async def push_snapshot(self):
        payload = await self.get_retailer_indents()
        await self.send_json({
            "retailer_indents": payload,
        })

    @database_sync_to_async
    def get_retailer_indents(self):
        qs = (
            RetailerIndent.objects
            .filter(entity=self.user.entity)
            .order_by("-created")[:10]
        )
        data = RetailerIndentSerializer(
            qs,
            many=True,
            context={"request": None},
        ).data
        return json.loads(json.dumps(data, cls=UUIDEncoder))


# =====================================================================
# Shop inventory
# =====================================================================

class ShopInventoryConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        self.selected_query_entity = self.scope["selected_query_entity"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'shop-inventory',
            self.channel_name,
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
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        shop_inventory = (
            RetailerReceipts.objects
            .filter(
                unit_quantity__gte=0,
                entity_id=self.selected_query_entity,
            )
            .exclude(product__is_pom=True)
        )
        sers = RetailerReceiptsSerializer(
            shop_inventory,
            many=True,
            context={'request': None},
        ).data
        self.shop_inventory = json.dumps(sers, cls=UUIDEncoder)

    async def send_shop_inventory(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'shop_inventory': json.loads(self.shop_inventory),
        })


# =====================================================================
# Retailer dashboard
# =====================================================================

class RetailerDashboardsConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'retailer-dashboard',
            self.channel_name,
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
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        from retailers.models import (
            CustomerOrderItems,
            CustomerOrderPayment,
            CustomerOrders,
            RetailerReceipts,
        )
        from wholesalers.models import RetailerOrders

        final = {}
        weekly_orders = []
        days = []
        now = datetime.now()

        for x in range(7):
            items_value = 0.00
            all_payments_value = 0.00
            orders = []
            d = now - timedelta(days=x)
            next_d = d + timedelta(days=1)
            days.append(d)

            all_payments = (
                CustomerOrderPayment.objects
                .filter(entity=self.user.entity, status="SUCCESS")
                .all()
            )
            for payment in all_payments:
                all_payments_value += float(payment.amount)

            all_receipts = (
                RetailerReceipts.objects
                .filter(entity=self.user.entity)
                .all()
            )
            all_orders = (
                CustomerOrders.objects
                .filter(entity=self.user.entity)
                .all()
            )
            all_requisitions = (
                RetailerOrders.objects
                .filter(entity=self.user.entity)
                .all()
            )

            final["retailer_receipts"] = len(all_receipts)
            final["customer_orders"] = len(all_orders)
            final["wholesale_requisitions"] = len(all_requisitions)
            final["all_payments_count"] = len(all_payments)
            final["all_payments_value"] = all_payments_value

            followers = self.user.entity.followers.all()
            final["followers"] = len(followers)

            items = CustomerOrderItems.objects.filter(
                entity=self.user.entity,
                created__gte=d,
                created__lt=next_d,
                customer_order__is_paid="true",
            )
            orders = CustomerOrders.objects.filter(
                entity=self.user.entity,
                created__gte=d,
                created__lt=next_d,
                is_paid="true",
            ).all()

            for item in items:
                items_value += float(item.item_price_total)

            weekly_orders.append({
                "date": d.strftime("%Y-%m-%d"),
                "items": len(items),
                "value": items_value,
                "orders": len(orders),
            })

        final["weekly_orders"] = weekly_orders
        self.retailer_dashboard = json.dumps(final, cls=UUIDEncoder)

    async def send_retailer_dashboard(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'retailer_dashboard': json.loads(self.retailer_dashboard),
        })

class BodabodaAssignedOrdersConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close(code=4401)
            return

        self.group_name = f"bodaboda_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        await self._send_snapshot()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def send_bodaboda_assigned_order(self, event):
        await self._send_snapshot()

    async def _send_snapshot(self):
        orders = await self._fetch_orders()
        if orders:
            await self.send_json({
                "type": "bodaboda.assigned_orders",
                "bodaboda_assigned_order": orders,
            })
        else:
            await self.send_json({
                "type": "bodaboda.assigned_orders",
                "bodaboda_assigned_order": None,
            })

    @sync_to_async
    def _fetch_orders(self):
        since = timezone.now() - timedelta(days=3)
        boda_ids = list(
            BodaLocations.objects
            .filter(owner=self.user, is_active="true")
            .values_list("id", flat=True)
        )
        if not boda_ids:
            return None

        qs = (
            CustomerOrders.objects
            .filter(
                bodaboda_id__in=boda_ids,
                status__in=["ASSIGNED", "DISPATCHED", "PICKED"],
                updated__gte=since,
            )
            .order_by("-updated")
        )
        if not qs.exists():
            return None

        return json.loads(json.dumps(
            CustomerOrdersSerializer(qs, many=True, context={"request": None}).data,
            cls=UUIDEncoder,
        ))

# =====================================================================
# Customer orders
# =====================================================================

class CustomerOrdersConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'customer-orders',
            self.channel_name,
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
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        formatted_from_date = dateutil.parser.parse(
            str(timezone.now().date())
        ).strftime("%Y-%m-%d %H:%M:%S")

        # customer_orders = CustomerOrders.objects.filter(
        #     entity=self.user.entity,
        #     created__gte=formatted_from_date,
        # ).order_by('-created')


        # earlier in the function
        formatted_from_date = (timezone.now() - timedelta(days=7)).isoformat()

        # your existing filter, unchanged
        customer_orders = CustomerOrders.objects.filter(
            entity=self.user.entity,
            created__gte=formatted_from_date,
        ).order_by('-created')[:100]

        orders = CustomerOrdersSerializer(
            customer_orders,
            many=True,
            context={'request': None},
        ).data
        self.customer_orders = json.dumps(orders, cls=UUIDEncoder)

    async def send_customer_orders(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'customer_orders': json.loads(self.customer_orders),
        })


# =====================================================================
# User orders
# =====================================================================

class UserOrdersConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'user-orders',
            self.channel_name,
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
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        user_orders = CustomerOrders.objects.filter(
            customer=self.user
        )[:10]

        orders = CustomerOrdersSerializer(
            user_orders,
            many=True,
            context={'request': None},
        ).data
        self.user_orders = json.dumps(orders, cls=UUIDEncoder)

    async def send_user_orders(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'customer_orders': json.loads(self.user_orders),
        })


# =====================================================================
# User prescriptions
# =====================================================================

class UserPrescriptionsConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'user-prescriptions',
            self.channel_name,
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
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        user_prescriptions = Prescriptions.objects.filter(
            created_by=self.user
        )

        orders = RetailPrescriptionsSerializer(
            user_prescriptions,
            many=True,
            context={'request': None},
        ).data
        self.user_prescriptions = json.dumps(orders, cls=UUIDEncoder)

    async def send_user_prescriptions(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'user_prescriptions': json.loads(self.user_prescriptions),
        })


# =====================================================================
# Retailer receipts (observer)
# =====================================================================

class RetailerReceiptsConsumer(ListModelMixin, GenericAsyncAPIConsumer):

    queryset = RetailerReceipts.objects.all()
    serializer_class = RetailerReceiptsSerializer
    permissions = (permissions.AllowAny,)

    async def connect(self, **kwargs):
        logger.warning("Connected to retailer consumer")
        await self.model_change.subscribe()
        await super().connect()

    @model_observer(RetailerReceipts)
    async def model_change(self, message, observer=None, **kwargs):
        logger.warning("message", message)
        await self.send_json(message)

    @model_change.serializer
    def model_serialize(self, instance, action, **kwargs):
        data = dict(
            data=RetailerReceiptsSerializer(instance=instance).data,
            context={'request': None},
            action=action.value,
        )
        self.retailer_receipts = json.dumps(data, cls=UUIDEncoder)
        logger.warning(self.retailer_receipts)
        return json.loads(self.retailer_receipts)


# =====================================================================
# Customer order notifications
# =====================================================================

class CustomerOrderNotificationsConsumer(WebsocketConsumer):
    def connect(self):
        user = self.scope["user"]
        if user.is_authenticated:
            self.group_name = f"user_{user.id}"
            async_to_sync(self.channel_layer.group_add)(
                self.group_name, self.channel_name,
            )
            self.accept()
        else:
            self.close()

    def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            print("Disconnecting from group", self.group_name)
            print("Channel name", self.channel_name)

            async_to_sync(self.channel_layer.group_discard)(
                self.group_name, self.channel_name,
            )

    def send_notification(self, event):
        print("Event data received in consumer:", event)

        self.send(text_data=json.dumps({
            "customer_name": event["customer_name"],
            "customer_phone": event["customer_phone"],
            "delivery_method": event["delivery_method"],
            "is_received": event["is_received"],
            "is_delivered": event["is_delivered"],
            "selected_payment_method": event["selected_payment_method"],
            "selected_payment_method_title": event["selected_payment_method_title"],
            "is_paid": event["is_paid"],
            "shipping_cost": event["shipping_cost"],
            "order_price_total": event["order_price_total"],
            "entity": event["entity"],
            "entity_title": event["entity_title"],
            "owner": event["owner"],
            "status": event["status"],
            "id": event["id"],
        }))


# =====================================================================
# Order details
# =====================================================================

class OrderDetailsConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'customer-order-details',
            self.channel_name,
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
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        order_id = self.scope["url_route"]["kwargs"]["order_id"]
        customer_order = CustomerOrders.objects.filter(
            id=order_id
        ).first()

        sers = CustomerOrdersSerializer(
            customer_order,
            many=False,
        ).data
        self.datum = json.dumps(sers, cls=UUIDEncoder)

    async def send_customer_order_details(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'customer_order_details': json.loads(self.datum),
        })


# =====================================================================
# Retailer product requests
# =====================================================================

class RetailerProductRequestsConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'retailer-product-requests',
            self.channel_name,
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'retailer_product_requests': json.loads(
                self.retailer_product_requests
            ),
        })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'retailer-product-requests',
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        retailer_product_requests = (
            RetailerProductRequest.objects
            .filter(entity=self.user.entity)
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
            retailer_product_requests,
            many=True,
            context={'request': None},
        ).data
        self.retailer_product_requests = json.dumps(
            product_requests, cls=UUIDEncoder
        )

    async def send_retailer_product_requests(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'retailer_product_requests': json.loads(
                self.retailer_product_requests
            ),
        })


# =====================================================================
# Retailer requisitions
# =====================================================================

class RetailerRequisitionsConsumer(AsyncJsonWebsocketConsumer):
    """
    Live retailer requisitions registry.

    Serves the retailer's own orders — filters on `retailer`
    (the retailer-side FK on RetailerOrders), not `entity`
    (which is the wholesaler-side field).
    """

    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'retailer-requisitions',
            self.channel_name,
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'retailer-requisitions': json.loads(
                self.retailer_requisitions
            ),
        })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'retailer-requisitions',
            self.channel_name,
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        from wholesalers.models import RetailerOrders
        from wholesalers.serializers import RetailerOrdersSerializer

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
        self.retailer_requisitions = json.dumps(
            orders, cls=UUIDEncoder
        )

    async def send_retailer_requisitions(self, event):
        # Call the helper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            'retailer-requisitions': json.loads(
                self.retailer_requisitions
            ),
        })


class BodaLocationConsumer(AsyncJsonWebsocketConsumer):
    async def receive_json(self, content, **kwargs):
        lat = content.get("lat")
        lng = content.get("lng")

        # 1. validate
        if not valid_coords(lat, lng):
            await self.send_json({"type": "boda.error", "detail": "bad coords"})
            return

        lat, lng = float(lat), float(lng)

        # 2. persist the current point (single-column update)
        await self._save_point(lat, lng)

        # 3. fan out to every live order this boda is on
        await self._broadcast(lat, lng)

    @database_sync_to_async
    def _save_point(self, lat, lng):
        BodaLocations.objects.filter(pk=self.boda.pk).update(
            point=Point(lng, lat, srid=4326),   # lng first!
            updated_at=timezone.now(),
        )

    async def _broadcast(self, lat, lng):
        payload = {
            "type": "boda.location",
            "lat": lat,
            "lng": lng,
            "ts": timezone.now().isoformat(),
        }
        order_ids = await self._live_order_ids()
        for order_id in order_ids:
            await self.channel_layer.group_send(f"order_{order_id}", payload)

    @database_sync_to_async
    def _live_order_ids(self):
        return list(
            CustomerOrders.objects
            .filter(
                bodaboda_id=self.boda.id,
                status__in=["ASSIGNED", "DISPATCHED", "PICKED"],
            )
            .values_list("id", flat=True)
        )

# orders/consumers.py
import json
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone


# Statuses during which live tracking is allowed
LIVE_STATUSES = {"ASSIGNED", "DISPATCHED", "PICKED"}

# Statuses that end the tracking session
TERMINAL_STATUSES = {"DELIVERED", "CANCELLED", "COMPLETED"}


class OrderTrackingConsumer(AsyncJsonWebsocketConsumer):
    """
    Watcher socket for a single order.

    Both the CUSTOMER and the RETAILER connect to the same URL:

        /ws/orders/<order_id>/tracking/?token=<jwt>

    The consumer:
      1. Authenticates the user (via scope["user"] set by middleware).
      2. Checks the user is allowed to watch this order.
      3. Joins the per-order group  ->  "order_<order_id>".
      4. Sends an initial snapshot of the driver's last known location.
      5. Forwards every boda.location event from the driver to the client.
      6. Forwards order.status events and closes on terminal statuses.
      7. Responds to client pings for keepalive.
    """

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    async def connect(self):
        self.user = self.scope.get("user")
        self.order_id = self.scope["url_route"]["kwargs"]["order_id"]
        self.group_name = f"order_{self.order_id}"

        # 1. Auth check
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4401)   # unauthorized
            return

        # 2. Permission check + terminal-status check
        verdict = await self._authorize()
        if verdict == "not_found":
            await self.close(code=4404)
            return
        if verdict == "forbidden":
            await self.close(code=4403)
            return
        if verdict == "terminal":
            # Order is already finished — connect, send final state, close.
            await self.accept()
            snapshot = await self._final_snapshot()
            if snapshot:
                await self.send_json(snapshot)
            await self.close(code=4000)
            return

        # 3. Join group
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # 4. Initial snapshot so the map isn't blank until the next ping
        snapshot = await self._snapshot()
        if snapshot:
            await self.send_json(snapshot)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name, self.channel_name
            )

    # ------------------------------------------------------------------ #
    # Incoming messages from the client
    # ------------------------------------------------------------------ #
    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")

        if msg_type == "ping":
            await self.send_json({"type": "pong", "ts": timezone.now().isoformat()})
            return

        # Clients don't push location on this socket; ignore anything else.
        await self.send_json({
            "type": "error",
            "detail": f"unsupported message type: {msg_type!r}",
        })

    # ------------------------------------------------------------------ #
    # Channel-layer handlers (names must match the "type" key sent by the driver)
    # ------------------------------------------------------------------ #
    async def boda_location(self, event):
        """Forwarded from BodaLocationConsumer when the driver moves."""
        await self.send_json({
            "type": "boda.location",
            "lat": event["lat"],
            "lng": event["lng"],
            "ts": event.get("ts"),
        })

    async def order_status(self, event):
        """Sent whenever the order status changes (view, signal, etc.)."""
        status = event["status"]
        await self.send_json({
            "type": "order.status",
            "status": status,
            "ts": event.get("ts", timezone.now().isoformat()),
        })

        if status in TERMINAL_STATUSES:
            # Nothing more to track — close cleanly.
            await self.close(code=4000)

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    @database_sync_to_async
    def _authorize(self):
        """
        Returns one of: "ok", "not_found", "forbidden", "terminal".
        """
        from orders.models import CustomerOrders

        try:
            order = CustomerOrders.objects.only(
                "id", "status", "customer_id", "user_id", "owner_id",
                "delivered_by_id",
            ).get(pk=self.order_id)
        except CustomerOrders.DoesNotExist:
            return "not_found"

        u = self.user
        allowed = (
            u.id == order.customer_id
            or u.id == order.user_id
            or u.id == order.owner_id
            or u.id == order.delivered_by_id
            or getattr(u, "is_staff", False)
        )
        if not allowed:
            return "forbidden"

        if order.status in TERMINAL_STATUSES:
            return "terminal"

        if order.status not in LIVE_STATUSES:
            # e.g. RECEIVED / PROCESSING — not trackable yet
            return "terminal"

        return "ok"

    @database_sync_to_async
    def _snapshot(self):
        """Last known driver location + order meta, for the initial render."""
        from orders.models import CustomerOrders

        order = (
            CustomerOrders.objects
            .select_related("bodaboda__boda__user")
            .filter(pk=self.order_id)
            .first()
        )
        if not order:
            return None

        boda = order.bodaboda
        point = boda.point if boda else None

        return {
            "type": "boda.location",
            "lat": point.y if point else None,
            "lng": point.x if point else None,
            "ts": (
                boda.updated_at.isoformat()
                if boda and hasattr(boda, "updated_at") and boda.updated_at
                else None
            ),
            "driver": self._driver_info(boda),
            "order": {
                "id": order.id,
                "status": order.status,
                "destination": self._point_lat_lng(order.destination_point),
                "origin": self._point_lat_lng(order.origin_point),
            },
        }

    @database_sync_to_async
    def _final_snapshot(self):
        """Snapshot sent when the order is already in a terminal state."""
        from orders.models import CustomerOrders

        order = (
            CustomerOrders.objects
            .select_related("bodaboda__boda__user")
            .filter(pk=self.order_id)
            .first()
        )
        if not order:
            return None
        return {
            "type": "order.status",
            "status": order.status,
            "ts": timezone.now().isoformat(),
        }

    @staticmethod
    def _driver_info(boda):
        if not boda:
            return None
        user = boda.boda.user
        return {
            "name": user.get_full_name() or user.first_name or "",
            "phone": user.phone,
        }

    @staticmethod
    def _point_lat_lng(p):
        if not p:
            return None
        return {"lat": p.y, "lng": p.x}