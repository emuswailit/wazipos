# billing/tasks.py — free-month reminders (daily).
from celery import shared_task


@shared_task
def billing_daily():
    from billing.services import trial_daily

    return trial_daily()
