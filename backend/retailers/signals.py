# retailers/signals.py

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import RetailerReceipts


def _broadcast_inventory_change(entity_id):
    """
    Fire a `send_retailer_receipts` event on the entity's
    inventory group.

    `entity_id` MUST come from the saved/deleted instance,
    never from a request payload.
    """
    if not entity_id:
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        f'retail-inventory-{entity_id}',
        {
            'type': 'send_retailer_receipts',
        },
    )


@receiver(post_save, sender=RetailerReceipts)
def on_retailer_receipt_saved(sender, instance, created, **kwargs):
    _broadcast_inventory_change(
        getattr(instance, 'entity_id', None)
    )


@receiver(post_delete, sender=RetailerReceipts)
def on_retailer_receipt_deleted(sender, instance, **kwargs):
    _broadcast_inventory_change(
        getattr(instance, 'entity_id', None)
    )

# apps/retailers/signals.py

# retailers/signals.py

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import RetailerIndent, RetailerIndentItem

logger = logging.getLogger(__name__)

GROUP_NAME = "retailer-indents"

import threading
from contextlib import contextmanager

_silenced = threading.local()

def _is_silenced() -> bool:
    return getattr(_silenced, "on", False)

@contextmanager
def silence_indent_signals():
    previous = getattr(_silenced, "on", False)
    _silenced.on = True
    try:
        yield
    finally:
        _silenced.on = previous


def _do_broadcast_indents_changed():
    """Send the group event. Runs after COMMIT."""
    layer = get_channel_layer()
    if layer is None:
        logger.warning(
            "indent broadcast skipped — no channel layer configured"
        )
        return

    try:
        async_to_sync(layer.group_send)(
            GROUP_NAME,
            {
                "type": "send.retailer.indents",
            },
        )
    except Exception:
        # A failing WS push must never fail the request that
        # triggered it.
        logger.exception("indent broadcast failed")


def _broadcast_indents_changed():
    """
    Queue the broadcast to run once the current transaction
    commits.

    Without this deferral, `group_send` fires while the write is
    still inside an open transaction. If the write later rolls
    back — or if the consumer's `push_snapshot()` queries before
    COMMIT — the client gets a push describing data that either
    doesn't exist yet or shouldn't exist at all.

    `transaction.on_commit` behaves correctly both inside and
    outside an atomic block: inside, it defers until COMMIT;
    outside, it runs immediately.
    """
    if _is_silenced():
        return
    transaction.on_commit(_do_broadcast_indents_changed)


@receiver(post_save, sender=RetailerIndent)
def retailer_indent_saved(sender, instance, created, **kwargs):
    _broadcast_indents_changed()


@receiver(post_delete, sender=RetailerIndent)
def retailer_indent_deleted(sender, instance, **kwargs):
    _broadcast_indents_changed()


@receiver(post_save, sender=RetailerIndentItem)
def retailer_indent_item_saved(sender, instance, created, **kwargs):
    _broadcast_indents_changed()


@receiver(post_delete, sender=RetailerIndentItem)
def retailer_indent_item_deleted(sender, instance, **kwargs):
    _broadcast_indents_changed()