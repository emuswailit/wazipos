# distributors/tasks.py — Celery: follow mobile-money payments on wholesalers' orders.

from celery import shared_task


@shared_task
def reconcile_wholesaler_order_payments():
    from distributors.services.payments import reconcile_pending

    return reconcile_pending()
