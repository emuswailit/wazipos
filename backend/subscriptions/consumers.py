# subscriptions/consumers.py

import json
import requests
from decouple import config
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.core.serializers.json import DjangoJSONEncoder

from utils.logging import create_log
from .models import Subscription, SubscriptionPayment
from .serializers import SubscriptionSerializer


class SubscriptionConsumer(AsyncJsonWebsocketConsumer):
    """
    Listens for live changes to the entity's subscription status.
    Used by the frontend to instantly update the UI when a payment succeeds.
    """

    async def connect(self):
        self.user = self.scope.get("user")
        
        # 1. Ensure the user is authenticated
        if not self.user or not self.user.is_authenticated:
            await self.close()
            return

        # 2. Add to the subscriptions group
        self.group_name = 'subscriptions'
        
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name,
        )
        await self.accept()

        # 3. Fetch initial data and send it
        await self.helper_func()
        await self.send_json({
            'subscriptions': json.loads(self.subscriptions),
        })

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
        await self.close()

    @sync_to_async
    def helper_func(self):
        # Fetch the last 10 subscriptions for the user's entity
        subscriptions_qs = Subscription.objects.filter(
            entity=self.user.entity,
        ).order_by('-created')[:10]

        subscriptions_data = SubscriptionSerializer(
            subscriptions_qs,
            many=True,
            context={'request': None},
        ).data
        
        self.subscriptions = json.dumps(subscriptions_data, cls=DjangoJSONEncoder)

    async def send_subscriptions(self, event):
        # Re-fetch data when a signal/webhook triggers an update
        await self.helper_func()

        # Broadcast the fresh result to the connected client
        await self.send_json({
            'subscriptions': json.loads(self.subscriptions),
        })


class SubscriptionPaymentConsumer(AsyncJsonWebsocketConsumer):
    """
    Listens to a specific payment reference to track its success/failure in real-time.
    Used by the SubscriptionFormModal while waiting for the STK push to complete.
    """

    async def connect(self):
        self.user = self.scope.get("user")
        
        # 1. Ensure the user is authenticated
        if not self.user or not self.user.is_authenticated:
            await self.close()
            return

        # 2. Get the reference number from the URL route
        self.reference_number = self.scope['url_route']['kwargs']['reference_number']
        
        # 3. Create a specific group for this payment session
        self.group_name = f"payment_{self.reference_number}"

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name,
        )
        await self.accept()

        # 4. Fetch initial payment status and send it
        await self.helper_func()
        await self.send_json({
            'payment': json.loads(self.payment_data),
        })

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
        await self.close()

    @sync_to_async
    def helper_func(self):
        # Query the specific payment by its reference number
        payment = SubscriptionPayment.objects.filter(
            reference_number=self.reference_number
        ).first()
        
        create_log("info", f"SubscriptionPayment ref: {self.reference_number}")
        tx_data = None

        if payment:
            # Poll JamboPay if the payment is still PENDING
            if payment.status == "PENDING":
                try:
                    # 1. Authenticate with JamboPay
                    the_data = {
                        "client_id": config("JAMBOPAY_CLIENT_ID"),
                        "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
                        "grant_type": config("JAMBOPA_GRANT_TYPE"),
                    }
                    headers = {"Content-Type": "application/x-www-form-urlencoded"}
                    auth_res = requests.post(config("JAMBOPAY_AUTH_URL1"), data=the_data, headers=headers)
                    token = auth_res.json().get("access_token") if auth_res.json() else None
                    
                    if token:
                        # 2. Check the transaction status
                        order_id = payment.reference_number
                        transaction_url = config("JAMBOPAY_BASE_URL") + f"/wallet/transaction/{order_id}"
                        poll_headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}
                        
                        tx_result = requests.get(transaction_url, headers=poll_headers)
                        
                        if tx_result and not tx_result == None:
                            try:
                                tx_data = tx_result.json()
                                
                                # 3. Update DB only if JamboPay says the transaction is completed
                                if tx_data and not tx_data==None:
                                    final_status = str(tx_data.get("status", "")).upper()
                                    status_description = tx_data.get("description", "")
                                    provider_ref = tx_data.get("providerRef")
                                    
                                    # Update the Django model
                                    payment.status = final_status
                                    payment.description = status_description
                                    
                                    if provider_ref:
                                        payment.provider_reference_number = provider_ref
                                        
                                    payment.save()
                                    create_log("info", f"Updated payment via WS with JamboPay response: {final_status} - {status_description}")
                            except ValueError:
                                create_log("error", "JamboPay returned a non-JSON response during polling.")
                except Exception as e:
                    create_log("error", f"WS Poller error: {str(e)}")

            # 🌟 RECONSTRUCT LOG 1 (HTTP Response Format)
            self.payment_data = json.dumps({
                "payment_id": str(payment.id),
                "reference_number": payment.reference_number,
                "amount": float(payment.amount),
                "status": payment.status,
                "description": payment.description,
                "jambopay_response": tx_data if tx_data else {
                    "orderId": payment.reference_number,
                    "ref": payment.psp_reference_number,
                    "status": payment.status,
                    "description": payment.description
                }
            }, cls=DjangoJSONEncoder)
            
        else:
            # Fallback if payment record isn't found
            self.payment_data = json.dumps({
                "payment_id": None,
                "reference_number": self.reference_number,
                "amount": 0,
                "status": "NOT_FOUND",
                "description": "Payment record could not be found.",
                "jambopay_response": None
            })

    async def send_payment_status(self, event):
        # Re-fetch data when the JamboPay webhook triggers an update
        await self.helper_func()

        # Broadcast the fresh result to the connected client
        await self.send_json({
            'payment': json.loads(self.payment_data),
        })