# analytics/tasks.py

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.management import call_command

from wazi.celery import app                     # ← the correctly configured app


channel_layer = get_channel_layer()


# =====================================================================
# Analytics pipeline
# =====================================================================

@app.task
def run_nightly_pipeline():
    """
    Run the full analytics pipeline, then trigger WebSocket refreshes
    so any connected clients get the new data immediately.
    """
    call_command("run_analytics")

    # After the pipeline has produced fresh alerts + metrics,
    # broadcast the refresh to any connected clients.
    load_analytics_alerts.delay()
    load_analytics_overview.delay()


# =====================================================================
# WebSocket refresh tasks
# =====================================================================

@app.task
def load_analytics_alerts():
    """
    Broadcast to every connected `analytics-alerts` consumer:
    'refetch your entity's alerts and push them to your socket'.

    The consumer's handler method is `send_analytics_alerts`.
    """
    result = async_to_sync(channel_layer.group_send)(
        "analytics-alerts",
        {"type": "send_analytics_alerts"},
    )
    return result


@app.task
def load_analytics_overview():
    """
    Broadcast to every connected `analytics-overview` consumer:
    'refetch your entity's metrics and push them to your socket'.

    The consumer's handler method is `send_analytics_overview`.
    """
    result = async_to_sync(channel_layer.group_send)(
        "analytics-overview",
        {"type": "send_analytics_overview"},
    )
    return result