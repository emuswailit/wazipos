from celery import shared_task


@shared_task
def reconcile_credit_payments():
    """Repayment prompts (into lenders' wallets) and float top-ups followed to paid / failed."""
    from credit.services import reconcile

    return reconcile()


@shared_task
def credit_daily():
    """Reminders, overdue marking, late fees (capped), due-date repayment prompts, defaults."""
    from credit.services import daily

    return daily()
