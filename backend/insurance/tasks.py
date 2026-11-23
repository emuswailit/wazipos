from celery import shared_task


@shared_task
def reconcile_policy_payments():
    """Premium prompts followed to SUCCESS (cover starts) or failure."""
    from insurance.services import reconcile_payments

    return reconcile_payments()


@shared_task
def expire_insurance_policies():
    from insurance.services import expire_policies

    return expire_policies()
