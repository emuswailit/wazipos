# wazi/celery.py

from __future__ import absolute_import, unicode_literals
import os
from celery import Celery
from celery.schedules import crontab
from decouple import config # 👈 Import config to use .env

# set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wazi.settings.development")

app = Celery("wazi")

app.config_from_object("django.conf:settings", namespace="CELERY")

# 🟢 Fix 1: Read Broker URL from .env or fallback to localhost
app.conf.broker_url = config("CELERY_BROKER_URL", default="redis://127.0.0.1:6379/0")
app.conf.enable_utc = False
app.conf.update(timezone="Africa/Nairobi")

app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print("Request: {0!r}".format(self.request))


app.conf.beat_schedule = {
    "process_wifi_payments": {
        "task": "payments.tasks.process_wifi_payments",
        "schedule": 30.0,
        "args": None,
    },
    "process_retailer_order_payments": {
        "task": "payments.tasks.process_retailer_order_payments",
        "schedule": 30.0,
        "args": None,
    },
    "deactivate_expired_price_discounts": {
        "task": "wholesalers.tasks.deactivate_expired_price_discounts",
        "schedule": 60.0,
        "args": None,
    },
    "load_customer_orders": {
        "task": "retailers.tasks.load_customer_orders",
        "schedule": 30.0,
        "args": None,
    },
    "load_inventory_predictions": {
        "task": "retailers.tasks.load_inventory_predictions",
        "schedule": 120.0,
        "args": None,
    },
    "load_retailer_receipts": {
        "task": "retailers.tasks.load_retailer_receipts",
        "schedule": 120.0,
        "args": None,
    },
    "load_retailer_indents": {
        "task": "retailers.tasks.load_retailer_indents",
        "schedule": 60.0,
        "args": None,
    },
    "load_out_of_stocks": {
        "task": "retailers.tasks.load_out_of_stock_items",
        "schedule": 120.0,
        "args": None,
    },
    "load_retailer_requisitions": {
        "task": "retailers.tasks.load_retailer_requisitions",
        "schedule": 120.0,
        "args": None,
    },

    # ── Analytics ──────────────────────────────────────────────────
    "analytics-nightly-pipeline": {
        "task": "analytics.tasks.run_nightly_pipeline",
        "schedule": crontab(hour=0, minute=0),
        "args": None,
    },
    "analytics-refresh-alerts": {
        "task": "analytics.tasks.load_analytics_alerts",
        "schedule": 120.0,
        "args": None,
    },
    "analytics-refresh-overview": {
        "task": "analytics.tasks.load_analytics_overview",
        "schedule": 300.0,
        "args": None,
    },

    # WHOLESALERS
    "load_wholesaler_receipts": {
        "task": "wholesalers.tasks.load_wholesaler_receipts",
        "schedule": 120.0,
        "args": None,
    },
    "load_retailer_orders": {
        "task": "wholesalers.tasks.load_retailer_orders",
        "schedule": 120.0,
        "args": None,
    },
    "load_filtered_retailer_orders": {
        "task": "wholesalers.tasks.load_filtered_retailer_orders",
        "schedule": 120.0,
        "args": None,
    },
    "load_wholesaler_product_requests": {
        "task": "wholesalers.tasks.load_wholesaler_product_requests",
        "schedule": 120.0,
        "args": None,
    },
    "load_retailer_product_requests": {
        "task": "retailers.tasks.load_retailer_product_requests",
        "schedule": 120.0,
        "args": None,
    },

    # ── Retailer variation metrics ─────────────────────────────────
    "retailers-update-variation-metrics-daily": {
        "task": "retailers.tasks.update_variation_metrics",
        "schedule": crontab(hour=2, minute=0),
        "args": None,
    },

    # ── Prescription refill reminders (7 / 3 / 1 day(s) before a partly-bought medicine runs out)
    "send-prescription-refill-reminders-daily": {
        "task": "retailers.tasks.send_prescription_refill_reminders",
        "schedule": crontab(hour=8, minute=0),
        "args": None,
    },

    # ── DeepRead AI Prescription Safety Net ────────────────────────
    "retry-pending-prescription-extractions": {
        "task": "retailers.tasks.retry_pending_prescription_extractions",
        "schedule": 300.0, 
        "args": None,
    },

    # ── Subscription Payments Reconciliation ───────────────────────
    # 🟢 FIXED: Changed from 3.0s to 60.0s to prevent CPU exhaustion
    "check-pending-subscription-payments": {
        "task": "subscriptions.tasks.check_pending_subscription_payments",
        "schedule": 60.0, 
        "args": None,
    },

    # ── Requisition (Retailer Order) Payments Reconciliation ───────
    # Mobile money collected into the system till; the socket handles
    # live status, this catches the rest and expires stale payments.
    "reconcile-retailer-order-payments": {
        "task": "wholesalers.tasks.reconcile_retailer_order_payments",
        "schedule": 60.0,
        "args": None,
    },

    # ── Customer Order Payments Reconciliation ─────────────────────
    # 🟢 FIXED: Changed from 5.0s to 60.0s. 
    # The WebSocket handles real-time (5s) for active users.
    # Celery handles cleanup (60s) for abandoned users.
    "check-pending-customer-order-payments": {
        "task": "retailers.tasks.check_jambopay_payment_status",
        "schedule": 60.0, 
        "args": None,
    },

    # ── Hourly Subscription Push ───────────────────────────────────
    "push-hourly-subscriptions": {
        "task": "subscriptions.tasks.push_hourly_subscriptions",
        "schedule": 60.0, 
        "args": None,
    },
}