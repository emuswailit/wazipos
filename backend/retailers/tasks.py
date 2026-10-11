# retailers/tasks.py

from celery import Celery
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from decouple import config
from uuid import UUID
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
    qs = models.CustomerOrderPayment.objects.filter(
        is_validated=False,
        status="PENDING",
    ).exclude(
        payment_method__title="CASH",
    ).order_by("-created")
    return qs


@app.task
def check_jambopay_payment_status():
    payment = None
    token = get_auth_token()

    payments = get_non_cash_today_customer_order_payments()

    if len(payments) > 0:
        for payment in payments:
            errors, result_json = jambopay_check_payment_status(
                payment.psp_reference_number
            )
            print("RESULT JSON", result_json)

            if result_json and result_json.get("status") == "SUCCESS":
                payment.provider_reference_number = result_json.get(
                    "providerRef"
                )
                payment.status = result_json["status"]
                payment.description = result_json.get("description", "")
                payment.save()

                payment.customer_order.is_paid = "true"
                payment.customer_order.save()

                payment.is_validated = True
                payment.save()

                order_items = models.CustomerOrderItems.objects.filter(
                    customer_order=payment.customer_order
                ).all()
                print("order_items", order_items)
                update_stock(payment.customer_order)

            elif result_json and result_json.get("status") == "FAILED":
                payment.status = "FAILED"
                payment.is_validated = True
                payment.description = result_json.get("description", "")
                payment.save()

                payment.customer_order.is_paid = "false"
                payment.customer_order.save()

            else:
                payment.is_validated = True
                payment.status = "FAILED"
                payment.description = (
                    result_json.get("description", "") if result_json else ""
                )
                payment.save()
                return errors

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


@app.task
def get_wholesaler_discounts():
    print("To be corrected")
    # retailer_receipts = []
    # print("Getting wholesaler discounts....")
    # receipts = WholesalerReceipts.objects.filter(pack_quantity__gte=1).all()
    #
    # retailer_receipts = WholesalerReceiptsSerializer(
    #     receipts, many=True, context={'request': request}
    # ).data
    # data = json.dumps(retailer_receipts, cls=UUIDEncoder)
    # result = async_to_sync(channel_layer.group_send)(
    #     'wholesaler-discounts',
    #     {
    #         "type": "send_wholesaler_discounts",
    #         "name": "Mikey",
    #         "data": data
    #     },
    # )
    # return result


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
    result = async_to_sync(channel_layer.group_send)(
        "customer-orders",
        {"type": "send_customer_orders"},
    )
    return result


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
    result = async_to_sync(channel_layer.group_send)(
        "retailer-requisitions",
        {"type": "send_retailer_requisitions"},
    )
    return result


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
    # NOTE: fixed typo — was `is_validate=True`, must be `is_validated=True`
    qs = models.CustomerOrderPayment.objects.filter(
        is_validated=False,
        status="SUCCESS",
    ).exclude(
        payment_method__title="CASH",
    ).order_by("-created")
    return qs


@app.task
def settle_cashless_customer_order_payments():
    unsettled = get_succesful_unsynced_today_customer_order_payments()
    if len(unsettled) > 0:
        print(
            f"We got {len(unsettled)} unsettled customer order payments"
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
#
# Recomputes on every RetailerVariations row, from the transient
# receipts / orders / adjustments:
#
#   current_stock_balance     ← Sum(RetailerReceipts.current_unit_quantity)
#   running_total_receipts    ← Sum(RetailerReceipts.received_unit_quantity)
#   running_total_issues      ← Sum(CustomerOrderItems.total_quantity)
#   lead_time                 ← median (receipt.created − order.created)
#   safety_stock              ← z × σ_daily × √lead_time, floored
#   reorder_level             ← safety_stock + avg_daily × lead_time
#   economic_order_quantity   ← Wilson EOQ
#   maximum_stock             ← reorder_level + eoq
#   danger_stock              ← safety_stock × 0.5
#
# Idempotent. Safe to run more than once per day.
# =====================================================================

@app.task(
    name="retailers.tasks.update_variation_metrics",
    time_limit=60 * 30,       # hard cap: 30 minutes
    soft_time_limit=60 * 25,  # raise SoftTimeLimitExceeded at 25 min
)
def update_variation_metrics():
    """
    Full recompute across every RetailerVariations row.

    Schedule via celery beat (see CELERY_BEAT_SCHEDULE in settings).
    """
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
    """
    Same as above, scoped to a single entity. Useful after a bulk
    inventory sync so the reorder thresholds refresh immediately
    without waiting for the nightly run.
    """
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