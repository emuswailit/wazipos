from django.utils import timezone

from .models import Subscription

SECONDS_PER_DAY = 24 * 60 * 60


def build_subscription_summary(entity):
    """
    Totals across all of an entity's active subscriptions (end date still in the future).

    Each subscription contributes only its unused time, end - max(start, now), so a renewal
    stacked after the current period counts its full length while the current one counts
    what is left of it.
    """
    empty = {"active_count": 0, "total_days_remaining": 0, "active_until": None}
    if not entity:
        return empty

    now = timezone.now()
    active = list(
        Subscription.objects.filter(
            entity=entity,
            end_date__gt=now,
            is_active__iexact="true",
        ).only("start_date", "end_date")
    )
    if not active:
        return empty

    remaining_seconds = sum(
        (sub.end_date - max(sub.start_date, now)).total_seconds() for sub in active
    )
    # Round up, matching how the app shows days left.
    total_days = int(-(-max(0, remaining_seconds) // SECONDS_PER_DAY))

    return {
        "active_count": len(active),
        "total_days_remaining": total_days,
        "active_until": max(sub.end_date for sub in active).isoformat(),
    }
