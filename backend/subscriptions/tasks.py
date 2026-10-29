# subscriptions/tasks.py

import json
import requests
from datetime import timedelta
from decimal import Decimal

from celery import shared_task
from decouple import config
from django.utils import timezone
from django.db import transaction
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from utils.logging import create_log
from .models import Subscription, SubscriptionPayment


@shared_task
def push_hourly_subscriptions():
    """
    Broadcast to all connected clients to re-fetch their subscription data.
    Runs every hour via Celery Beat.
    
    Why? This ensures that if a user leaves their app open for days, 
    the subscription status (e.g., active -> expired) updates automatically
    without needing a page refresh.
    """
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "subscriptions",
            {
                "type": "send_subscriptions",
                "message": "Hourly push from Celery task"
            }
        )
        create_log("info", "Hourly subscription push broadcasted to all connected clients.")
    except Exception as e:
        create_log("error", f"Failed to broadcast hourly subscription push: {str(e)}")


@shared_task
def check_pending_subscription_payments():
    """
    Background task to reconcile PENDING payments with JamboPay.
    Runs every minute (configure in CELERY_BEAT_SCHEDULE).
    
    Why? Webhooks can fail. If the user closes their browser, the WebSocket disconnects,
    and they won't know if the payment succeeded. This task ensures the database is
    eventually consistent.
    """
    create_log("info", "Starting pending subscription payments check...")

    # 1. Get payments that are PENDING and were created in the last 30 minutes
    # (No point checking old ones, they likely timed out).
    thirty_mins_ago = timezone.now() - timedelta(minutes=30)
    pending_payments = SubscriptionPayment.objects.filter(
        status="PENDING",
        created__gte=thirty_mins_ago
    )

    if not pending_payments.exists():
        create_log("info", "No pending payments to check.")
        return

    # 2. Authenticate with JamboPay (Once per task run)
    try:
        the_data = {
            "client_id": config("JAMBOPAY_CLIENT_ID"),
            "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
            "grant_type": config("JAMBOPA_GRANT_TYPE"),
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        auth_res = requests.post(config("JAMBOPAY_AUTH_URL1"), data=the_data, headers=headers)
        token = auth_res.json().get("access_token") if auth_res.json() else None
    except Exception as e:
        create_log("error", f"JamboPay Auth failed in background task: {str(e)}")
        return

    if not token:
        create_log("error", "JamboPay Token not generated in background task.")
        return

    # 3. Check each pending payment
    for payment in pending_payments:
        try:
            order_id = payment.reference_number
            transaction_url = config("JAMBOPAY_BASE_URL") + f"/wallet/transaction/{order_id}"
            poll_headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}
            
            tx_result = requests.get(transaction_url, headers=poll_headers)
            
            if tx_result.status_code == 200:
                tx_data = tx_result.json()
                current_status = str(tx_data.get("status", "")).upper()
                
                # If the status has changed from PENDING
                if current_status and current_status != "PENDING":
                    create_log("info", f"Payment {order_id} changed to {current_status}")
                    
                    # Update Payment Record
                    payment.status = current_status
                    payment.description = tx_data.get("description", "")
                    if tx_data.get("providerRef"):
                        payment.provider_reference_number = tx_data.get("providerRef")
                    payment.save()

                    # If successful, create the Subscription record
                    if current_status == "SUCCESS":
                        create_subscription_from_payment(payment)

                    # Broadcast the update to the frontend WebSocket
                    broadcast_payment_status(order_id, payment)

        except Exception as e:
            create_log("error", f"Error checking payment {payment.reference_number}: {str(e)}")

    # 4. Expire stale payments (older than 30 mins but still PENDING)
    stale_payments = SubscriptionPayment.objects.filter(
        status="PENDING",
        created__lt=thirty_mins_ago
    )
    
    for payment in stale_payments:
        payment.status = "FAILED"
        payment.description = "Payment expired (Timed out waiting for PIN)."
        payment.save()
        broadcast_payment_status(payment.reference_number, payment)
        create_log("info", f"Expired stale payment: {payment.reference_number}")


def create_subscription_from_payment(payment: SubscriptionPayment):
    """
    Helper to create the actual Subscription once payment succeeds.
    """
    try:
        with transaction.atomic():
            # Check if a subscription already exists for this payment to prevent duplicates
            if Subscription.objects.filter(payment=payment).exists():
                return

            # You may need to adjust these defaults based on your business logic
            # e.g., pulling `months` from the payment amount or entity config.
            months = 1 
            if payment.amount >= 5000: months = 6
            elif payment.amount >= 10000: months = 12

            start_date = timezone.now()
            end_date = start_date + timedelta(days=30 * months)

            Subscription.objects.create(
                entity=payment.entity,
                payment=payment,
                months=months,
                start_date=start_date,
                end_date=end_date,
                type="PAID",
                is_active="TRUE",
                owner=payment.owner
            )
            create_log("info", f"Successfully created Subscription for payment {payment.reference_number}")
    except Exception as e:
        create_log("error", f"Failed to create Subscription for {payment.reference_number}: {str(e)}")


def broadcast_payment_status(reference_number: str, payment: SubscriptionPayment):
    """
    Helper to broadcast the updated payment status to the WebSocket group.
    """
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"payment_{reference_number}",
            {
                "type": "send_payment_status",
                "message": "Status updated from background task"
            }
        )
    except Exception as e:
        create_log("error", f"Failed to broadcast WS message for {reference_number}: {str(e)}")