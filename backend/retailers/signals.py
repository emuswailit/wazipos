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