from datetime import datetime, time, timedelta

from django.utils import timezone

DAYS_PER_MONTH = 30


def next_period_start(previous_end):
    """
    A renewal starts at the beginning (00:00 local time) of the day after the previous
    subscription ends. E.g. ends Nov 28 -> next starts Nov 29.
    """
    next_day = timezone.localtime(previous_end).date() + timedelta(days=1)
    return timezone.make_aware(datetime.combine(next_day, time.min))


def period_end(start, months):
    return start + timedelta(days=DAYS_PER_MONTH * months)
