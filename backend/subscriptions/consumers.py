# subscriptions/consumers.py

import json
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from utils.logging import create_log
## Create log

# Make sure to import the exact model and serializer names you are using
from .models import Subscription, SubscriptionPayment
from .serializers import SubscriptionSerializer, SubscriptionPaymentsSerializer

# Use Django's built-in JSON encoder for safety with UUIDs and Datetimes
from django.core.serializers.json import DjangoJSONEncoder


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
        create_log("SubscriptionPayment ref",self.reference_number)

        if payment:
            # 🌟 Using your exact serializer name here
            payment_details = SubscriptionPaymentsSerializer(
                payment,
                context={'request': None},
            ).data
            self.payment_data = json.dumps(payment_details, cls=DjangoJSONEncoder)
        else:
            # Fallback if payment record isn't found
            self.payment_data = json.dumps({
                "reference_number": self.reference_number,
                "status": "NOT_FOUND"
            })

    async def send_payment_status(self, event):
        # Re-fetch data when the JamboPay webhook triggers an update
        await self.helper_func()

        # Broadcast the fresh result to the connected client
        await self.send_json({
            'payment': json.loads(self.payment_data),
        })