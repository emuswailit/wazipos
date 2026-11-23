# wifi/tasks.py
from celery import shared_task


@shared_task
def monitor_wifi_payments():
    """Every 30 s: confirm pending WiFi payments, connect paid devices, queue owner payouts (wifi/payments.py)."""
    from wifi.payments import monitor

    return monitor()
