# manufacturers/tasks.py — Celery: follow mobile-money payments on distributors' purchase orders.

from celery import shared_task


@shared_task
def reconcile_purchase_order_payments():
    from manufacturers.services.payments import reconcile_pending

    return reconcile_pending()
