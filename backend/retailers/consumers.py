# retailers/consumers.py

import json
import asyncio
import logging
import requests
from datetime import date, datetime, timedelta
from .utils.inventory_utils import update_stock
from .utils.retailer_utils import (
    customer_order_payments_for_entity,
    customer_order_payments_group,
    customer_orders_group,
)
from django.db import transaction
from django.utils import timezone
from django.core.serializers.json import DjangoJSONEncoder
from decouple import config
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
    CustomerOrderPayment,
    OutOfStock,
    Prescriptions,
    RetailerIndent,
    RetailerProductRequest,
    RetailerReceipts,
)
from retailers.serializers import (
    CustomerOrderPaymentListSerializer,
    CustomerOrdersSerializer,
    MiniCustomerOrdersSerializer,
    OutOfStocksSerializer,
    RetailPrescriptionsSerializer,
    RetailerIndentSerializer,
    RetailerProductRequestSerializer,
    RetailerReceiptsSerializer,
)
from utils.UUIDEncoder import UUIDEncoder

logger = logging.getLogger("retailers.consumers")

# 🟢 Utility for logging
try:
    from utils.logging import create_log
except ImportError:
    def create_log(level, message):
        getattr(logger, level if level in ['info', 'error', 'warning'] else 'info')(message)


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
        await self.helper_func()
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
        await self.helper_func()
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
        if not self.user.is_authenticated:
            await self.close()
            return

        await self.channel_layer.group_add(
            self.GROUP_NAME,
            self.channel_name,
        )
        await self.accept()

        await self.push_snapshot()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.GROUP_NAME,
            self.channel_name,
        )

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
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'shop-inventory',
            self.channel_name,
        )
        await self.accept()
        await self.helper_func()

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
        await self.helper_func()
        await self.send_json({
            'shop_inventory': json.loads(self.shop_inventory),
        })


# =====================================================================
# Retailer dashboard
# =====================================================================

class RetailerDashboardsConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'retailer-dashboard',
            self.channel_name,
        )
        await self.accept()
        await self.helper_func()

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
        from wholesalers.models import RetailerOrders

        final = {}
        weekly_orders = []
        days = []
        now = datetime.now()

        for x in range(7):
            items_value = 0.00
            all_payments_value = 0.00
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
        await self.helper_func()
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
        from retailers.models import BodaLocations
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
# consumers.py

import json
import asyncio
import time
import requests
import dateutil.parser
from datetime import timedelta
from django.utils import timezone
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from asgiref.sync import sync_to_async
from django.core.serializers.json import DjangoJSONEncoder

# Assuming these are imported from your project
# from .models import CustomerOrders, CustomerOrderPayment
# from .serializers import CustomerOrdersSerializer
# from .utils.inventory_utils import update_stock
# from utils.logging import create_log
# from decouple import config


# NOTE: UUIDEncoder comes from utils.UUIDEncoder (imported above). A local
# UUID-only copy used to sit here and shadow it for every consumer below,
# so payloads with Decimal / date values (retailer requisitions) crashed the
# socket with close code 1011.


class CustomerOrderPaymentConsumer(AsyncJsonWebsocketConsumer):
    """
    Listens to a specific order by reference number to track its payment status.
    Polls JamboPay exactly every 5 seconds until the status is no longer PENDING.
    """

    async def connect(self):
        self.user = self.scope.get("user")
        
        if not self.user or not self.user.is_authenticated:
            create_log("warning", "WS Connect Rejected: User not authenticated")
            await self.close()
            return

        self.identifier = str(self.scope['url_route']['kwargs']['reference_number'])
        create_log("info", f"🔌 WS Connect Accepted: Reference Number {self.identifier}")
        
        self.group_name = f"payment_{self.identifier}"

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name,
        )
        await self.accept()

        self.polling_task = asyncio.create_task(self.poll_payment_loop())

    async def disconnect(self, close_code):
        create_log("info", f"🔌 WS Disconnect: Reference Number {self.identifier}, Code: {close_code}")
        
        if hasattr(self, 'polling_task'):
            self.polling_task.cancel()

        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
        await self.close()

    async def poll_payment_loop(self):
        MAX_POLLS = 20  # Safety limit: ~100 seconds max
        poll_count = 0

        create_log("info", f"🚀 Starting polling loop for {self.identifier}")

        try:
            while poll_count < MAX_POLLS:
                start_time = time.time()
                poll_count += 1
                
                create_log("info", f"🔄 [POLL #{poll_count}/{MAX_POLLS}] Checking status for {self.identifier}...")

                await self.helper_func()
                
                if hasattr(self, 'payment_data'):
                    payment_dict = json.loads(self.payment_data)
                    await self.send_json({'payment': payment_dict})
                    
                    status = payment_dict.get("status", "").upper()
                    description = payment_dict.get("description", "")
                    ref = payment_dict.get("ref", "") or payment_dict.get("reference_number", "")
                    
                    create_log("info", f"📤 [POLL #{poll_count}/{MAX_POLLS}] Sent to Frontend -> Status: {status} | Ref: {ref} | Desc: {description}")
                    
                    if poll_count >= 3 and status and status != "PENDING":
                        create_log("info", f"🛑 Polling stopped for {self.identifier}. Final status: {status} after {poll_count} polls.")
                        break
                
                elapsed_time = time.time() - start_time
                sleep_time = max(0, 5.0 - elapsed_time)
                
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                
            if poll_count >= MAX_POLLS:
                create_log("error", f"⚠️ Max polling attempts ({MAX_POLLS}) reached for {self.identifier}. Stopping loop.")
                
        except asyncio.CancelledError:
            create_log("info", f"🛑 Polling loop cancelled for {self.identifier} (user disconnected).")
            pass 
        except Exception as e:
            create_log("error", f"❌ WebSocket polling loop error for {self.identifier}: {str(e)}")

    @sync_to_async
    def helper_func(self):
        customer_order = CustomerOrders.objects.filter(
            reference_number=self.identifier
        ).first()

        tx_data = None

        if not customer_order:
            create_log("error", f"❌ CustomerOrder not found for reference number: {self.identifier}")
            self._set_fallback_payload("CustomerOrder record not found.")
            return

        payment = CustomerOrderPayment.objects.filter(
            customer_order_id=customer_order.id
        ).order_by('-created').first()

        if not payment:
            create_log("error", f"❌ CustomerOrderPayment not found for order ID: {customer_order.id}")
            self._set_fallback_payload("Payment record not found.")
            return

        payment_method_title = (
            customer_order.selected_payment_method.title 
            if customer_order.selected_payment_method else None
        )

        reference_number_str = customer_order.reference_number

        # Poll JamboPay if PENDING OR if we are missing a description
        should_poll = payment.status == "PENDING" or not payment.description

        if should_poll:
            try:
                the_data = {
                    "client_id": config("JAMBOPAY_CLIENT_ID"),
                    "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
                    "grant_type": config("JAMBOPA_GRANT_TYPE"),
                }
                headers = {"Content-Type": "application/x-www-form-urlencoded"}
                auth_res = requests.post(config("JAMBOPAY_AUTH_URL1"), data=the_data, headers=headers)
                token = auth_res.json().get("access_token") if auth_res.json() else None
                
                if not token:
                    create_log("error", "❌ Failed to authenticate with JamboPay.")
                else:
                    transaction_url = config("JAMBOPAY_BASE_URL") + f"/wallet/transaction/{reference_number_str}"
                    poll_headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}
                    
                    create_log("info", f"🌐 Calling JamboPay API: {transaction_url}")
                    tx_result = requests.get(transaction_url, headers=poll_headers)
                    
                    if tx_result:
                        try:
                            tx_data = tx_result.json()
                            create_log("info", f"📦 Raw tx_data from JamboPay: {json.dumps(tx_data, indent=2, cls=DjangoJSONEncoder)}")
                            
                            if tx_data:
                                final_status = str(tx_data.get("status", "")).upper()
                                status_description = tx_data.get("description", "")
                                provider_ref = tx_data.get("providerRef")
                                
                                if final_status and final_status != "PENDING":
                                    payment.status = final_status
                                    if status_description:
                                        payment.description = status_description
                                    if provider_ref:
                                        payment.provider_reference_number = provider_ref
                                        
                                    payment.save()
                                    
                                    if final_status == "SUCCESS":
                                        customer_order.is_paid = "true"
                                        customer_order.save()
                                        
                                        # 🟢 DEDUCT STOCK AND PREVENT DOUBLE DEDUCTION
                                        update_stock(customer_order)
                                        payment.is_validated = True
                                        payment.save()
                                        create_log("info", f"✅ Stock deducted for order {customer_order.order_number} via poller")
                                        
                                    elif final_status == "FAILED":
                                        customer_order.is_paid = "false"
                                        customer_order.save(update_fields=["is_paid", "updated"])

                                    create_log("info", f"💾 DB Updated -> Status: {final_status} | Desc: {status_description}")
                        except ValueError:
                            create_log("error", f"❌ JamboPay returned non-JSON response. Raw text: {tx_result.text}")
                    else:
                        create_log("error", "❌ tx_result is None or Falsy. JamboPay request failed.")
            except Exception as e:
                create_log("error", f"❌ JamboPay Poller exception: {str(e)}")
        else:
            create_log("info", f"⏭️ DB Status is already {payment.status} and has a description. Skipping JamboPay API poll.")

        if tx_data:
            tx_data["reference_number"] = reference_number_str
            tx_data["payment_method_title"] = payment_method_title
            
            if not tx_data.get("description") and payment.description:
                tx_data["description"] = payment.description
            if not tx_data.get("description"):
                tx_data["description"] = f"Payment {payment.status.lower()} (No description provided)."
            
            self.payment_data = json.dumps(tx_data, cls=DjangoJSONEncoder)
        else:
            final_description = payment.description or f"Payment {payment.status.lower()} (No description provided)."
            self.payment_data = json.dumps({
                "id": str(payment.id),
                "ref": payment.reference_number,
                "providerRef": payment.provider_reference_number,
                "status": payment.status,
                "description": final_description,
                "orderId": reference_number_str,
                "amount": str(payment.amount) if payment.amount else "0.00",
                "modeOfPayment": "MOBILE_MONEY",
                "currency": "KES",
                "completed": payment.status != "PENDING",
                "reference_number": reference_number_str,
                "payment_method_title": payment_method_title,
            }, cls=DjangoJSONEncoder)
        
        create_log("info", f"✅ Final payload prepared for frontend: {self.payment_data}")

    def _set_fallback_payload(self, error_message):
        self.payment_data = json.dumps({
            "id": None,
            "ref": "",
            "status": "NOT_FOUND",
            "description": error_message,
            "reference_number": self.identifier,
            "payment_method_title": None,
        })
        create_log("info", f"⚠️ Fallback payload set: {self.payment_data}")

    async def send_payment_status(self, event):
        create_log("info", f"📡 Webhook triggered send_payment_status for {self.identifier}")
        await self.helper_func()
        await self.send_json({
            'payment': json.loads(self.payment_data),
        })


class CustomerOrdersConsumer(AsyncJsonWebsocketConsumer):
    """
    Live customer orders for the user's own entity.

    Each entity has its own group (customer_orders_group), so a broadcast for one
    entity never makes other entities' clients re-query.
    """

    async def connect(self):
        self.user = self.scope["user"]
        self.group_name = None

        if not self.user.is_authenticated:
            # Reject with the code TokenAuthMiddleware chose (4001 no token,
            # 4002 invalid, 4003 expired) so the client knows not to retry blindly.
            await self.close(code=self.scope.get("close_code") or 4002)
            return

        entity_id = getattr(self.user, "entity_id", None)
        if not entity_id:
            await self.close(code=4002)
            return

        self.group_name = customer_orders_group(entity_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.helper_func()

        await self.send_json({
            'customer_orders': json.loads(self.customer_orders),
        })

    async def disconnect(self, close_code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    @staticmethod
    def _deduct_stock_once(order):
        """
        Deduct stock for a successful payment exactly once, even when several
        connections of the same entity run this at the same moment: the payment row
        is locked (rows another connection holds are skipped) and is_validated is set
        in the same transaction.
        """
        with transaction.atomic():
            payment = (
                CustomerOrderPayment.objects.select_for_update(skip_locked=True)
                .filter(customer_order=order, status="SUCCESS", is_validated=False)
                .first()
            )
            if not payment:
                return
            update_stock(order)
            payment.is_validated = True
            payment.save(update_fields=["is_validated", "updated"])
        create_log("info", f"Stock deducted via OrdersConsumer for order {order.order_number}")

    # The full list sent to clients. Clients mirror it exactly (orders not in it are
    # removed locally), so this is how much history devices keep.
    SNAPSHOT_DAYS = 30
    SNAPSHOT_LIMIT = 500

    @sync_to_async
    def helper_func(self):
        formatted_from_date = (timezone.now() - timedelta(days=self.SNAPSHOT_DAYS)).isoformat()

        customer_orders = CustomerOrders.objects.filter(
            entity=self.user.entity,
            created__gte=formatted_from_date,
        ).order_by('-created')[:self.SNAPSHOT_LIMIT]

        # 🟢 STOCK DEDUCTION SWEEPER: run only once per successful payment.
        # Only orders with a successful payment still awaiting stock deduction are
        # touched (usually none), instead of opening a transaction per listed order.
        pending_order_ids = set(
            CustomerOrderPayment.objects.filter(
                customer_order__entity=self.user.entity,
                status="SUCCESS",
                is_validated=False,
            ).values_list("customer_order_id", flat=True)
        )
        if pending_order_ids:
            for order in CustomerOrders.objects.filter(id__in=pending_order_ids):
                try:
                    self._deduct_stock_once(order)
                except Exception as e:
                    create_log("error", f"Failed to deduct stock for {order.order_number}: {str(e)}")

        orders = CustomerOrdersSerializer(
            customer_orders,
            many=True,
            context={'request': None},
        ).data
        self.customer_orders = json.dumps(orders, cls=UUIDEncoder)

    async def send_customer_orders(self, event):
        await self.helper_func()
        await self.send_json({
            'customer_orders': json.loads(self.customer_orders),
        })


# =====================================================================
# Customer order payments (Payments screen)
# =====================================================================

class CustomerOrderPaymentsConsumer(AsyncJsonWebsocketConsumer):
    """
    The latest customer order payments received by the user's own entity.

    Sends `{"customer_order_payments": [...]}` (newest first, at most PAYMENTS_LIMIT) on
    connect and whenever the entity's orders/payments change (see
    broadcast_customer_order_payments_update). The list is complete, so clients can
    mirror it exactly.
    """

    PAYMENTS_LIMIT = 50

    async def connect(self):
        self.user = self.scope["user"]
        self.group_name = None

        if not self.user.is_authenticated:
            await self.close(code=self.scope.get("close_code") or 4002)
            return

        entity_id = getattr(self.user, "entity_id", None)
        if not entity_id:
            await self.close(code=4002)
            return

        self.group_name = customer_order_payments_group(entity_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({'customer_order_payments': await self._latest_payments()})

    async def disconnect(self, close_code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    @sync_to_async
    def _latest_payments(self):
        payments = (
            customer_order_payments_for_entity(self.user.entity)
            .select_related("customer_order", "customer_order__order_number", "payment_method")
            .order_by("-created")[:self.PAYMENTS_LIMIT]
        )
        data = CustomerOrderPaymentListSerializer(payments, many=True).data
        return json.loads(json.dumps(data, cls=UUIDEncoder))

    async def send_customer_order_payments(self, event):
        await self.send_json({'customer_order_payments': await self._latest_payments()})


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
        await self.helper_func()
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
        await self.helper_func()
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
        if not self.user.is_authenticated:
            return

        await self.channel_layer.group_add(
            'customer-order-details',
            self.channel_name,
        )
        await self.accept()
        await self.helper_func()

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
            id=order_id, entity=self.user.entity
        ).first()

        sers = CustomerOrdersSerializer(
            customer_order,
            many=False,
        ).data
        self.datum = json.dumps(sers, cls=UUIDEncoder)

    async def send_customer_order_details(self, event):
        await self.helper_func()
        await self.send_json({
            'customer_order_details': json.loads(self.datum),
        })

import json
import asyncio
import requests
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from asgiref.sync import sync_to_async
from django.core.serializers.json import DjangoJSONEncoder

# Assuming these are imported from your project
# from .models import CustomerOrders, CustomerOrderPayment
# from .utils import create_log
# from decouple import config

# =====================================================================
# 🟢 Customer Order Payment Status (Real-time Polling like Subscription)
# =====================================================================


# consumers.py
import json
import asyncio
import time
import requests
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from asgiref.sync import sync_to_async
from django.core.serializers.json import DjangoJSONEncoder

# Assuming these are imported from your project
# from .models import CustomerOrders, CustomerOrderPayment
# from .utils import create_log
# from decouple import config

class CustomerOrderPaymentConsumer(AsyncJsonWebsocketConsumer):
    """
    Listens to a specific order by reference number to track its payment status.
    Polls JamboPay exactly every 5 seconds until the status is no longer PENDING.
    """

    async def connect(self):
        self.user = self.scope.get("user")
        
        # 1. Ensure the user is authenticated
        if not self.user or not self.user.is_authenticated:
            create_log("warning", "WS Connect Rejected: User not authenticated")
            await self.close()
            return

        # 2. Get the reference number from the URL route
        self.identifier = str(self.scope['url_route']['kwargs']['reference_number'])
        create_log("info", f"🔌 WS Connect Accepted: Reference Number {self.identifier}")
        
        # 3. Create a specific group for this payment session
        self.group_name = f"payment_{self.identifier}"

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name,
        )
        await self.accept()

        # 4. Start the background polling task
        self.polling_task = asyncio.create_task(self.poll_payment_loop())

    async def disconnect(self, close_code):
        create_log("info", f"🔌 WS Disconnect: Reference Number {self.identifier}, Code: {close_code}")
        
        if hasattr(self, 'polling_task'):
            self.polling_task.cancel()

        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
        await self.close()

    async def poll_payment_loop(self):
        """
        Continuously checks the payment status every 5 seconds.
        Polls at least 3 times, and continues while status is PENDING.
        """
        MAX_POLLS = 20  # Safety limit: ~100 seconds max
        poll_count = 0

        create_log("info", f"🚀 Starting polling loop for {self.identifier}")

        try:
            while poll_count < MAX_POLLS:
                start_time = time.time()
                poll_count += 1
                
                create_log("info", f"🔄 [POLL #{poll_count}/{MAX_POLLS}] Checking status for {self.identifier}...")

                # 1. Fetch latest from JamboPay and update DB
                await self.helper_func()
                
                # 2. Send the payload to the frontend
                if hasattr(self, 'payment_data'):
                    payment_dict = json.loads(self.payment_data)
                    await self.send_json({'payment': payment_dict})
                    
                    status = payment_dict.get("status", "").upper()
                    description = payment_dict.get("description", "")
                    ref = payment_dict.get("ref", "") or payment_dict.get("reference_number", "")
                    
                    create_log("info", f"📤 [POLL #{poll_count}/{MAX_POLLS}] Sent to Frontend -> Status: {status} | Ref: {ref} | Desc: {description}")
                    
                    # 3. Stop polling if:
                    #    - We have polled at least 3 times
                    #    - AND the status is no longer PENDING
                    if poll_count >= 3 and status and status != "PENDING":
                        create_log("info", f"🛑 Polling stopped for {self.identifier}. Final status: {status} after {poll_count} polls.")
                        break
                
                # 4. Wait exactly 5 seconds from the start of the poll
                elapsed_time = time.time() - start_time
                sleep_time = max(0, 5.0 - elapsed_time)
                
                if sleep_time > 0:
                    create_log("info", f"💤 Waiting {sleep_time:.2f} seconds before next poll...")
                    await asyncio.sleep(sleep_time)
                
            if poll_count >= MAX_POLLS:
                create_log("error", f"⚠️ Max polling attempts ({MAX_POLLS}) reached for {self.identifier}. Stopping loop.")
                
        except asyncio.CancelledError:
            create_log("info", f"🛑 Polling loop cancelled for {self.identifier} (user disconnected).")
            pass 
        except Exception as e:
            create_log("error", f"❌ WebSocket polling loop error for {self.identifier}: {str(e)}")

    @sync_to_async
    def helper_func(self):
        # 🟢 1. Look out for the order with reference number from frontend
        customer_order = CustomerOrders.objects.filter(
            reference_number=self.identifier, entity=self.user.entity
        ).first()

        tx_data = None

        if not customer_order:
            create_log("error", f"❌ CustomerOrder not found for reference number: {self.identifier}")
            self._set_fallback_payload("CustomerOrder record not found.")
            return

        # 🟢 2. Look for its corresponding payment using the order ID
        payment = CustomerOrderPayment.objects.filter(
            customer_order_id=customer_order.id
        ).order_by('-created').first()

        if not payment:
            create_log("error", f"❌ CustomerOrderPayment not found for order ID: {customer_order.id}")
            self._set_fallback_payload("Payment record not found.")
            return

        payment_method_title = (
            customer_order.selected_payment_method.title 
            if customer_order.selected_payment_method else None
        )

        # 🟢 3. The reference number is exactly what the frontend sent
        reference_number_str = customer_order.reference_number

        # 🟢 4. Poll JamboPay if PENDING OR if we are missing a description
        should_poll = payment.status == "PENDING" or not payment.description

        if should_poll:
            try:
                the_data = {
                    "client_id": config("JAMBOPAY_CLIENT_ID"),
                    "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
                    "grant_type": config("JAMBOPA_GRANT_TYPE"),
                }
                headers = {"Content-Type": "application/x-www-form-urlencoded"}
                auth_res = requests.post(config("JAMBOPAY_AUTH_URL1"), data=the_data, headers=headers)
                token = auth_res.json().get("access_token") if auth_res.json() else None
                
                if not token:
                    create_log("error", "❌ Failed to authenticate with JamboPay.")
                else:
                    transaction_url = config("JAMBOPAY_BASE_URL") + f"/wallet/transaction/{reference_number_str}"
                    poll_headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}
                    
                    create_log("info", f"🌐 Calling JamboPay API: {transaction_url}")
                    tx_result = requests.get(transaction_url, headers=poll_headers)
                    
                    if tx_result:
                        try:
                            tx_data = tx_result.json()
                            create_log("info", f"📦 Raw tx_data from JamboPay: {json.dumps(tx_data, indent=2, cls=DjangoJSONEncoder)}")
                            
                            if tx_data:
                                final_status = str(tx_data.get("status", "")).upper()
                                status_description = tx_data.get("description", "")
                                provider_ref = tx_data.get("providerRef")
                                
                                # 🟢 Update DB parameters if status is no longer PENDING
                                if final_status and final_status != "PENDING":
                                    payment.status = final_status
                                    if status_description:
                                        payment.description = status_description
                                    if provider_ref:
                                        payment.provider_reference_number = provider_ref
                                        
                                    payment.save()
                                    
                                    if final_status == "SUCCESS":
                                        customer_order.is_paid = "true"
                                        customer_order.save(update_fields=["is_paid", "updated"])
                                    elif final_status == "FAILED":
                                        customer_order.is_paid = "false"
                                        customer_order.save(update_fields=["is_paid", "updated"])

                                    # Push the new status to this entity's open order and
                                    # payment lists right away.
                                    from .utils.retailer_utils import broadcast_customer_orders_update
                                    broadcast_customer_orders_update(customer_order.entity_id)
                                    create_log("info", f"💾 DB Updated -> Status: {final_status} | Desc: {status_description}")
                        except ValueError:
                            create_log("error", f"❌ JamboPay returned non-JSON response. Raw text: {tx_result.text}")
                    else:
                        create_log("error", "❌ tx_result is None or Falsy. JamboPay request failed.")
            except Exception as e:
                create_log("error", f"❌ JamboPay Poller exception: {str(e)}")
        else:
            create_log("info", f"⏭️ DB Status is already {payment.status} and has a description. Skipping JamboPay API poll.")

        # 🌟 CONSTRUCT EXACT PAYLOAD FOR FRONTEND
        if tx_data:
            # Send the EXACT JamboPay payload, but inject UI fields
            tx_data["reference_number"] = reference_number_str
            tx_data["payment_method_title"] = payment_method_title
            
            # Fallback logic for description
            if not tx_data.get("description") and payment.description:
                tx_data["description"] = payment.description
            if not tx_data.get("description"):
                tx_data["description"] = f"Payment {payment.status.lower()} (No description provided)."
            
            self.payment_data = json.dumps(tx_data, cls=DjangoJSONEncoder)
        else:
            # Fallback: Construct a JamboPay-like payload from DB values
            final_description = payment.description or f"Payment {payment.status.lower()} (No description provided)."
            self.payment_data = json.dumps({
                "id": str(payment.id),
                "ref": payment.reference_number,
                "providerRef": payment.provider_reference_number,
                "status": payment.status,
                "description": final_description,
                "orderId": reference_number_str,
                "amount": str(payment.amount) if payment.amount else "0.00",
                "modeOfPayment": "MOBILE_MONEY",
                "currency": "KES",
                "completed": payment.status != "PENDING",
                "reference_number": reference_number_str,
                "payment_method_title": payment_method_title,
            }, cls=DjangoJSONEncoder)
        
        create_log("info", f"✅ Final payload prepared for frontend: {self.payment_data}")

    def _set_fallback_payload(self, error_message):
        self.payment_data = json.dumps({
            "id": None,
            "ref": "",
            "status": "NOT_FOUND",
            "description": error_message,
            "reference_number": self.identifier,
            "payment_method_title": None,
        })
        create_log("info", f"⚠️ Fallback payload set: {self.payment_data}")

    async def send_payment_status(self, event):
        """
        Triggered by JamboPay Webhooks.
        """
        create_log("info", f"📡 Webhook triggered send_payment_status for {self.identifier}")
        await self.helper_func()
        await self.send_json({
            'payment': json.loads(self.payment_data),
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
        await self.helper_func()
        await self.send_json({
            'retailer_product_requests': json.loads(
                self.retailer_product_requests
            ),
        })


# =====================================================================
# Retailer requisitions
# =====================================================================

def retailer_requisitions_group(entity_id):
    """Channels group for one retailer entity's requisitions WebSocket clients."""
    return f"retailer-requisitions-{entity_id}"


class RetailerRequisitionsConsumer(AsyncJsonWebsocketConsumer):
    """
    Live retailer requisitions (RetailerOrders placed by the user's entity).

    Each entity has its own group, so a push for one retailer never makes other
    retailers' clients re-query. Sends the newest SNAPSHOT_LIMIT requisitions.
    """

    SNAPSHOT_LIMIT = 200

    async def connect(self):
        self.user = self.scope["user"]
        self.group_name = None

        if not self.user.is_authenticated:
            # Reject with the code TokenAuthMiddleware chose (4001/4002/4003).
            await self.close(code=self.scope.get("close_code") or 4002)
            return

        entity_id = getattr(self.user, "entity_id", None)
        if not entity_id:
            await self.close(code=4002)
            return

        self.group_name = retailer_requisitions_group(entity_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.helper_func()

        await self.send_json({
            'retailer-requisitions': json.loads(
                self.retailer_requisitions
            ),
        })

    async def disconnect(self, close_code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    @sync_to_async
    def helper_func(self):
        from wholesalers.models import RetailerOrders
        from wholesalers.serializers import RetailerOrdersSerializer

        retailer_orders = (
            RetailerOrders.objects
            .filter(retailer=self.user.entity)
            .order_by('-created')[:self.SNAPSHOT_LIMIT]
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
        await self.helper_func()
        await self.send_json({
            'retailer-requisitions': json.loads(
                self.retailer_requisitions
            ),
        })


class BodaLocationConsumer(AsyncJsonWebsocketConsumer):
    async def receive_json(self, content, **kwargs):
        lat = content.get("lat")
        lng = content.get("lng")

        if not valid_coords(lat, lng):
            await self.send_json({"type": "boda.error", "detail": "bad coords"})
            return

        lat, lng = float(lat), float(lng)
        await self._save_point(lat, lng)
        await self._broadcast(lat, lng)

    @database_sync_to_async
    def _save_point(self, lat, lng):
        from orders.models import BodaLocations
        from django.contrib.gis.geos import Point
        BodaLocations.objects.filter(pk=self.boda.pk).update(
            point=Point(lng, lat, srid=4326),
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


class OrderTrackingConsumer(AsyncJsonWebsocketConsumer):
    """
    Watcher socket for a single order.
    """

    async def connect(self):
        self.user = self.scope.get("user")
        self.order_id = self.scope["url_route"]["kwargs"]["order_id"]
        self.group_name = f"order_{self.order_id}"

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4401)
            return

        verdict = await self._authorize()
        if verdict == "not_found":
            await self.close(code=4404)
            return
        if verdict == "forbidden":
            await self.close(code=4403)
            return
        if verdict == "terminal":
            await self.accept()
            snapshot = await self._final_snapshot()
            if snapshot:
                await self.send_json(snapshot)
            await self.close(code=4000)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        snapshot = await self._snapshot()
        if snapshot:
            await self.send_json(snapshot)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name, self.channel_name
            )

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")

        if msg_type == "ping":
            await self.send_json({"type": "pong", "ts": timezone.now().isoformat()})
            return

        await self.send_json({
            "type": "error",
            "detail": f"unsupported message type: {msg_type!r}",
        })

    async def boda_location(self, event):
        await self.send_json({
            "type": "boda.location",
            "lat": event["lat"],
            "lng": event["lng"],
            "ts": event.get("ts"),
        })

    async def order_status(self, event):
        status = event["status"]
        await self.send_json({
            "type": "order.status",
            "status": status,
            "ts": event.get("ts", timezone.now().isoformat()),
        })

        if status in TERMINAL_STATUSES:
            await self.close(code=4000)

    @database_sync_to_async
    def _authorize(self):
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
            return "terminal"

        return "ok"

    @database_sync_to_async
    def _snapshot(self):
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


# =====================================================================
# Prescription events (digitized / forwarded) — see prescription_events.py
# =====================================================================


class PrescriptionEventsConsumer(AsyncJsonWebsocketConsumer):
    """Joins rx_user_<id> (customers) and rx_entity_<id> (pharmacy staff)."""

    async def connect(self):
        from .prescription_events import entity_group, user_group

        self.user = self.scope.get("user")
        self.rx_groups = []
        if not self.user or not self.user.is_authenticated:
            # TokenAuthMiddleware records why: 4001 no token, 4002 invalid, 4003 expired.
            await self.close(code=self.scope.get("close_code") or 4001)
            return
        self.rx_groups.append(user_group(self.user.id))
        entity_id = getattr(self.user, "entity_id", None)
        if entity_id:
            self.rx_groups.append(entity_group(entity_id))
        for g in self.rx_groups:
            await self.channel_layer.group_add(g, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected"})

    async def disconnect(self, close_code):
        for g in getattr(self, "rx_groups", []):
            await self.channel_layer.group_discard(g, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if (content or {}).get("action") == "ping":
            await self.send_json({"event": "pong"})

    async def prescription_event(self, event):
        await self.send_json({"event": event.get("event"), "prescription": event.get("prescription")})

