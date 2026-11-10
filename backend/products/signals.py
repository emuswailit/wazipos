# products/signals.py
#
# Push a fresh catalogue snapshot to every connected app as soon as a product
# (or one of its images) is created, changed or deleted — instead of waiting for
# the 30-minute interval in ProductsConsumer.
#
# The push happens after the database transaction commits (so clients never see
# uncommitted data) and is coalesced: many saves in one transaction send ONE
# broadcast. Each socket then re-reads its own scoped product list.

import logging

from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import ProductImages, Products

logger = logging.getLogger(__name__)

PRODUCTS_GROUP = "products"


def broadcast_products_changed(reason="changed"):
    """Ask every ProductsConsumer to send its client a fresh snapshot. Never raises."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(PRODUCTS_GROUP, {"type": "send_products", "reason": reason})
    except Exception:
        logger.exception("products broadcast failed")


def _flush():
    broadcast_products_changed("changed")


def schedule_products_broadcast():
    """Broadcast once after the current transaction commits (immediately if none)."""
    try:
        conn = transaction.get_connection()
        if not conn.in_atomic_block:
            _flush()
            return
        # Already queued for this transaction? (Django drops the queue on rollback,
        # so nothing gets stuck.)
        if any(_flush in entry for entry in conn.run_on_commit):
            return
        transaction.on_commit(_flush)
    except Exception:
        logger.exception("could not schedule products broadcast")


@receiver(post_save, sender=Products)
@receiver(post_delete, sender=Products)
@receiver(post_save, sender=ProductImages)
@receiver(post_delete, sender=ProductImages)
def _products_changed(sender, **kwargs):
    if kwargs.get("raw"):  # loaddata / fixtures
        return
    schedule_products_broadcast()
