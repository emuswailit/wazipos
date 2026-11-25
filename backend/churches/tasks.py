from celery import shared_task


@shared_task
def send_church_message(message_id):
    """Send one church SMS to all its recipients (queued by churches.services.send_sms)."""
    from churches.services import deliver

    return deliver(message_id)
