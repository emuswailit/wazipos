# shopguard/tasks.py
from celery import shared_task


@shared_task
def run_shop_watch():
    """Idle shops while the owner is away; shifts left open."""
    from shopguard.services import run_watch

    return run_watch()


@shared_task
def sync_employee_commissions():
    """A commission row for each paid sale by an employee with a plan."""
    from shopguard.services import sync_commissions

    return sync_commissions()


@shared_task
def reconcile_commission_payments():
    """Owners' commission payments: once paid in, each employee is paid to their user payout account."""
    from shopguard.services import reconcile_commission_payments as run

    return run()
