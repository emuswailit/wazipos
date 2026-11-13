# retailers/tasks.py

from celery import Celery
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from decouple import config
from uuid import UUID
from datetime import timedelta
from django.utils import timezone
from django.db import transaction
import json
import logging

from intergrations.jambopay.jambopay_wallet import (
    get_auth_token,
    initiate_jambopay_settlement,
)
from intergrations.jambopay.jambopay_check_payment_status import (
    jambopay_check_payment_status,
)
from payments.models import EntityPSPCollectionAccount
from authentication.utils.utils import (
    generate_reference_number,
    use_reference_number,
)
from utils.logging import create_log
from . import models
from .models import CustomerOrderPayment, CustomerOrderSettlement
from .utils.inventory_utils import update_stock
from .services.variations_metrics import (
    MetricsConfig,
    run_variation_metrics_update,
)


logger = logging.getLogger(__name__)

app = Celery()
channel_layer = get_channel_layer()


# =====================================================================
# Payment reconciliation
# =====================================================================

def get_non_cash_today_customer_order_payments():
    today = timezone.now().date()
    qs = models.CustomerOrderPayment.objects.filter(
        is_validated=False,
        status="PENDING",
        created__date=today, # 👈 Added date filter
    ).exclude(
        payment_method__title="CASH",
    ).order_by("-created")
    return qs


@app.task
def check_jambopay_payment_status():
    token = get_auth_token()

    payments = get_non_cash_today_customer_order_payments()

    if payments.exists():
        for payment in payments:
            errors, result_json = jambopay_check_payment_status(
                payment.psp_reference_number
            )
            print("RESULT JSON", result_json)

            if not result_json:
                continue

            status = result_json.get("status", "").upper()
            description = result_json.get("description", "")
            provider_ref = result_json.get("providerRef")

            if status == "SUCCESS":
                with transaction.atomic(): # 👈 Wrap in atomic transaction
                    payment.provider_reference_number = provider_ref
                    payment.status = "SUCCESS"
                    payment.description = description
                    payment.is_validated = True
                    payment.save()

                    payment.customer_order.is_paid = "true"
                    payment.customer_order.save()

                    update_stock(payment.customer_order)
                
                # 🟢 INSTANTLY NOTIFY FRONTEND
                broadcast_order_payment_update(
                    reference_number=payment.reference_number,
                    status="SUCCESS",
                    description=description
                )

            elif status == "FAILED":
                with transaction.atomic():
                    payment.status = "FAILED"
                    payment.is_validated = True
                    payment.description = description
                    payment.save()

                    payment.customer_order.is_paid = "false"
                    payment.customer_order.save()
                
                # 🟢 INSTANTLY NOTIFY FRONTEND
                broadcast_order_payment_update(
                    reference_number=payment.reference_number,
                    status="FAILED",
                    description=description
                )

            else:
                with transaction.atomic():
                    payment.is_validated = True
                    payment.status = "FAILED"
                    payment.description = description
                    payment.save()
                
                # 🟢 INSTANTLY NOTIFY FRONTEND
                broadcast_order_payment_update(
                    reference_number=payment.reference_number,
                    status="FAILED",
                    description=description
                )
                continue 

    else:
        print("No pending customer order payments to sync")


# =====================================================================
# WebSocket fan-out tasks
# =====================================================================

class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            return obj.hex
        return json.JSONEncoder.default(self, obj)


def broadcast_order_payment_update(reference_number, status, description="Desc"):
    """
    fzffzx
    🟢 Helper to broadcast a signal to the specific customer order payment WebSocket group.
    Triggered by Celery tasks or JamboPay webhooks to instantly notify the frontend.
    """
    try:
        channel_layer = get_channel_layer()
        
        # This matches the `group_name` created in CustomerOrderPaymentConsumer
        group_name = f"payment_{reference_number}"
        
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                # This matches the method name `send_payment_status` in the consumer
                "type": "send_payment_status",
                "payment": {
                    "reference_number": reference_number,
                    "status": status,
                    "description": description,
                }
            }
        )
        create_log("info", f"Broadcasted order payment status for {reference_number}: {status}")
    except Exception as e:
        create_log("error", f"Failed to broadcast order payment update WS message: {str(e)}")


@app.task
def get_wholesaler_discounts():
    print("To be corrected")


@app.task
def load_out_of_stock_items():
    result = async_to_sync(channel_layer.group_send)(
        "oss",
        {"type": "send_retailer_out_of_stocks"},
    )
    print("rtes", result)
    return result


@app.task
def load_customer_order_details():
    print("Send customer order details")
    result = async_to_sync(channel_layer.group_send)(
        "customer-order-details",
        {"type": "send_customer_order_details"},
    )
    print("rtes", result)
    return result


@app.task
def load_retailer_receipts():
    result = async_to_sync(channel_layer.group_send)(
        "retail-inventory",
        {"type": "send_retailer_receipts"},
    )
    return result


@app.task
def load_retailer_indents():
    result = async_to_sync(channel_layer.group_send)(
        "retailer-indents",
        {"type": "send_retailer_indents"},
    )
    return result


@app.task
def load_shop_inventory():
    result = async_to_sync(channel_layer.group_send)(
        "shop-inventory",
        {"type": "send_shop_inventory"},
    )
    return result


@app.task
def load_retailer_dashboard():
    result = async_to_sync(channel_layer.group_send)(
        "retailer-dashboard",
        {"type": "send_retailer_dashboard"},
    )
    return result


@app.task
def load_customer_orders():
    """
    Safety-net push (runs every 30s via Celery beat). Only entities that need it are
    notified, each on its own group:
      - orders changed in the last 2 minutes (catches anything not broadcast directly),
      - successful payments whose stock hasn't been deducted yet, so the
        CustomerOrdersConsumer sweeper runs for them,
      - payments changed in the last 2 minutes (e.g. status set by the payment checks),
        so the Payments screen updates too.
    broadcast_customer_orders_update refreshes both the orders and payments lists.
    """
    from .utils.retailer_utils import broadcast_customer_orders_update

    since = timezone.now() - timedelta(minutes=2)
    entity_ids = set(
        models.CustomerOrders.objects.filter(updated__gte=since)
        .values_list("entity_id", flat=True)
        .distinct()
    )
    entity_ids |= set(
        CustomerOrderPayment.objects.filter(status="SUCCESS", is_validated=False)
        .values_list("customer_order__entity_id", flat=True)
        .distinct()
    )
    # Payments are stored with `entity` = the shop (receiving_entity is usually empty).
    entity_ids |= set(
        CustomerOrderPayment.objects.filter(updated__gte=since)
        .values_list("entity_id", flat=True)
        .distinct()
    )
    entity_ids.discard(None)

    for entity_id in entity_ids:
        broadcast_customer_orders_update(entity_id)
    return len(entity_ids)


@app.task
def load_inventory_predictions():
    result = async_to_sync(channel_layer.group_send)(
        "inventory-predictions",
        {"type": "send_inventory_predictions"},
    )
    return result


@app.task
def load_user_orders():
    result = async_to_sync(channel_layer.group_send)(
        "user-orders",
        {"type": "send_user_orders"},
    )
    return result


@app.task
def load_user_prescriptions():
    result = async_to_sync(channel_layer.group_send)(
        "user-prescriptions",
        {"type": "send_user_prescriptions"},
    )
    return result


@app.task
def load_bodaboda_assigned_order():
    result = async_to_sync(channel_layer.group_send)(
        "bodaboda-assigned-order",
        {"type": "send_bodaboda_assigned_order"},
    )
    return result


@app.task
def load_retailer_product_requests():
    result = async_to_sync(channel_layer.group_send)(
        "retailer-product-requests",
        {"type": "send_retailer_product_requests"},
    )
    return result


@app.task
def load_retailer_requisitions():
    """
    Push fresh requisitions (runs every 2 minutes via Celery beat) only to retailers
    whose requisitions changed: the requisition itself, or a payment on it (which
    changes its balance). Each retailer has its own group.
    """
    from wholesalers.models import RetailerOrderPayments, RetailerOrders
    from .consumers import retailer_requisitions_group

    since = timezone.now() - timedelta(minutes=3)  # overlaps the 2-minute schedule
    entity_ids = set(
        RetailerOrders.objects.filter(updated__gte=since)
        .values_list("retailer_id", flat=True)
        .distinct()
    )
    entity_ids |= set(
        RetailerOrderPayments.objects.filter(updated__gte=since)
        .values_list("retailer_order__retailer_id", flat=True)
        .distinct()
    )
    entity_ids.discard(None)

    for entity_id in entity_ids:
        async_to_sync(channel_layer.group_send)(
            retailer_requisitions_group(entity_id),
            {"type": "send_retailer_requisitions"},
        )
    return len(entity_ids)


# =====================================================================
# Settlement
# =====================================================================

def process_collection_settlement(amount, account_number, reference_number):
    payload = json.dumps(
        {
            "callbackUrl": (
                "https://webhook.site/"
                "94df1553-1b65-44c3-99ba-4ff3a32c554e"
            ),
            "amount": str(amount),
            "accountTo": account_number,
            "accountFrom": config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
            "orderId": reference_number,
        }
    )
    errors, result_json = initiate_jambopay_settlement(payload)
    return errors, result_json


def get_succesful_unsynced_today_customer_order_payments():
    today = timezone.now().date()
    qs = models.CustomerOrderPayment.objects.filter(
        is_validated=False,
        status="SUCCESS",
        created__date=today, # 👈 Added date filter
    ).exclude(
        payment_method__title="CASH",
    ).order_by("-created")
    return qs


@app.task
def settle_cashless_customer_order_payments():
    unsettled = get_succesful_unsynced_today_customer_order_payments()
    if unsettled.exists():
        print(
            f"We got {unsettled.count()} unsettled customer order payments"
        )
        for ubop in unsettled:
            reference_number = generate_reference_number(
                ubop.entity,
                ubop.entity_collection_account.owner,
            )
            errors, result_json = process_collection_settlement(
                ubop.amount,
                ubop.entity_collection_account.account_number,
                reference_number,
            )
            if result_json:
                ubop.is_validated = True
                ubop.save()

                models.CustomerOrderSettlement.objects.create(
                    receiving_entity=ubop.receiving_entity,
                    entity_collection_account=ubop.entity_collection_account,
                    customer_order_payment=ubop,
                    psp_reference_number=result_json["ref"],
                    amount=result_json["amount"],
                    account_from=result_json["accountFrom"],
                    account_to=result_json["accountTo"],
                    entity=ubop.entity,
                    reference_number=reference_number,
                )
    else:
        print("No unsynced cashless bar payments")


# =====================================================================
# Retailer variations — performance metrics recalculation
# =====================================================================

@app.task(
    name="retailers.tasks.update_variation_metrics",
    time_limit=60 * 30,       
    soft_time_limit=60 * 25,  
)
def update_variation_metrics():
    result = run_variation_metrics_update(config=MetricsConfig())
    logger.info(
        "variation metrics: processed=%s updated=%s failed=%s in %ss",
        result["processed"],
        result["updated"],
        result["failed"],
        result["duration_seconds"],
    )
    print("variation metrics:", result)
    return result


@app.task(
    name="retailers.tasks.update_variation_metrics_for_entity",
    time_limit=60 * 15,
    soft_time_limit=60 * 12,
)
def update_variation_metrics_for_entity(entity_id):
    result = run_variation_metrics_update(
        config=MetricsConfig(),
        entity_id=str(entity_id),
    )
    logger.info(
        "variation metrics for %s: processed=%s updated=%s failed=%s",
        entity_id,
        result["processed"],
        result["updated"],
        result["failed"],
    )
    print(f"variation metrics for {entity_id}:", result)
    return result


# =====================================================================
# DeepRead AI Prescription Processing
# =====================================================================

@app.task(
    name="retailers.tasks.process_prescription_with_deepread",
    time_limit=60 * 5, 
)
def process_prescription_with_deepread(prescription_id, image_id):
    from .utils import deep_read_utils

    logger.info(f"Starting DeepRead extraction for Prescription {prescription_id}")
    
    try:
        prescription = models.Prescriptions.objects.get(id=prescription_id)
        image_obj = models.PrescriptionImages.objects.get(id=image_id)
        
        extracted_data = deep_read_utils.extract_prescription_data(image_obj.image)
        
        if extracted_data and extracted_data.get("medications"):
            deep_read_utils.map_extracted_medications_to_prescription_items(
                extracted_data=extracted_data,
                prescription=prescription,
                retailer=prescription.entity,
                user=prescription.created_by
            )
            logger.info(f"DeepRead successfully extracted {len(extracted_data['medications'])} items for Prescription {prescription_id}")
            
        load_user_prescriptions.delay()
        
        return {"status": "success", "prescription_id": str(prescription_id)}
        
    except Exception as e:
        logger.error(f"DeepRead Task failed for Prescription {prescription_id}: {e}")
        return {"status": "failed", "error": str(e)}


@app.task(
    name="retailers.tasks.retry_pending_prescription_extractions",
    time_limit=60 * 10, 
)
def retry_pending_prescription_extractions():
    yesterday = timezone.now() - timedelta(days=1)
    
    pending_prescriptions = models.Prescriptions.objects.filter(
        created__gte=yesterday,
        status="QUEUING",
        prescription_items__isnull=True
    ).distinct()
    
    count = 0
    for prescription in pending_prescriptions:
        image = prescription.prescription_images.first()
        if image:
            process_prescription_with_deepread.delay(
                prescription_id=prescription.id,
                image_id=image.id
            )
            count += 1
            
    logger.info(f"Sweeper found and triggered {count} pending prescription extractions.")
    return f"Triggered {count} tasks"


@app.task
def send_prescription_refill_reminders():
    """Daily: push "running out in 7 / 3 / 1 day(s)" for partly-bought prescription medicines."""
    from retailers.utils.prescription_schedule import send_refill_reminders

    return send_refill_reminders()
