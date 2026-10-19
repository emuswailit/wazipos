# wazi/celery.py

from __future__ import absolute_import, unicode_literals
import os
from celery import Celery
from celery.schedules import crontab


# set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wazi.settings.development")

app = Celery("wazi")

app.config_from_object("django.conf:settings", namespace="CELERY")

app.conf.broker_url = "redis://127.0.0.1:6379/0"
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

    # ── DeepRead AI Prescription Safety Net ────────────────────────
    # Scans for uploaded prescriptions that failed to extract items
    # and retries them via DeepRead. Runs every 5 minutes.
    "retry-pending-prescription-extractions": {
        "task": "retailers.tasks.retry_pending_prescription_extractions",
        "schedule": 300.0, 
        "args": None,
    },
}