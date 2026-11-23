from celery import shared_task


@shared_task
def close_expired_job_adverts():
    """Open job adverts past their closing date stop taking applications."""
    from employees.jobs import close_expired

    return close_expired()
