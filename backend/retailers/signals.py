# retailers/signals.py

import logging
import threading
from contextlib import contextmanager

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import (
    RetailerIndent,
    RetailerIndentItem,
    RetailerReceipts,
)

logger = logging.getLogger(__name__)


# =====================================================================
# Retailer inventory (RetailerReceipts)
# =====================================================================

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
        f"retail-inventory-{entity_id}",
        {"type": "send_retailer_receipts"},
    )


@receiver(post_save, sender=RetailerReceipts)
def on_retailer_receipt_saved(
    sender, instance, created, **kwargs
):
    _broadcast_inventory_change(
        getattr(instance, "entity_id", None)
    )


@receiver(post_delete, sender=RetailerReceipts)
def on_retailer_receipt_deleted(sender, instance, **kwargs):
    _broadcast_inventory_change(
        getattr(instance, "entity_id", None)
    )


# =====================================================================
# Retailer indents (RetailerIndent + RetailerIndentItem)
# =====================================================================

GROUP_NAME = "retailer-indents"


# ---------------------------------------------------------------------
# Silence mechanism
# ---------------------------------------------------------------------

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


# ---------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------

def _do_broadcast_indents_changed():
    """Send the group event. Runs after COMMIT."""
    print(f"[SIGNAL] _do_broadcast_indents_changed firing → group={GROUP_NAME}")

    layer = get_channel_layer()
    if layer is None:
        print("[SIGNAL] no channel layer configured — SKIPPING")
        logger.warning(
            "indent broadcast skipped — no channel layer configured"
        )
        return

    try:
        async_to_sync(layer.group_send)(
            GROUP_NAME,
            {"type": "send.retailer.indents"},
        )
        print(f"[SIGNAL] group_send OK → {GROUP_NAME}")
    except Exception as e:
        print(f"[SIGNAL] group_send FAILED: {e}")
        logger.exception("indent broadcast failed")


def _broadcast_indents_changed():
    if _is_silenced():
        print("[SIGNAL] _broadcast_indents_changed — silenced, skipping")
        return

    print("[SIGNAL] scheduling broadcast via transaction.on_commit")
    transaction.on_commit(_do_broadcast_indents_changed)


# ---------------------------------------------------------------------
# RetailerIndent
# ---------------------------------------------------------------------

@receiver(post_save, sender=RetailerIndent)
def retailer_indent_saved(sender, instance, created, **kwargs):
    print(f"[SIGNAL] RetailerIndent post_save — id={instance.id} created={created}")
    _broadcast_indents_changed()


@receiver(post_delete, sender=RetailerIndent)
def retailer_indent_deleted(sender, instance, **kwargs):
    print(f"[SIGNAL] RetailerIndent post_delete — id={instance.id}")
    _broadcast_indents_changed()


# ---------------------------------------------------------------------
# RetailerIndentItem — broadcast + recalculate
# ---------------------------------------------------------------------

def _resolve_parent_indent(instance):
    indent = getattr(instance, "retailer_indent", None)
    if indent is not None:
        return indent
    try:
        return RetailerIndent.objects.get(
            pk=instance.retailer_indent_id
        )
    except RetailerIndent.DoesNotExist:
        return None


# ---- post_save ----

@receiver(post_save, sender=RetailerIndentItem)
def retailer_indent_item_saved_broadcast(
    sender, instance, created, **kwargs
):
    print(f"[SIGNAL] RetailerIndentItem post_save — id={instance.id} created={created}")
    _broadcast_indents_changed()


@receiver(post_save, sender=RetailerIndentItem)
def retailer_indent_item_saved_recalc(
    sender, instance, created, **kwargs
):
    print(f"[SIGNAL] RetailerIndentItem post_save recalc — id={instance.id}")
    indent = _resolve_parent_indent(instance)
    if indent is None:
        print("[SIGNAL] recalc — no parent indent, skipping")
        return

    with silence_indent_signals():
        indent.recalculate()
    print(f"[SIGNAL] recalc done — parent total_cost={indent.total_cost}")


# ---- post_delete ----

@receiver(post_delete, sender=RetailerIndentItem)
def retailer_indent_item_deleted_broadcast(
    sender, instance, **kwargs
):
    print(f"[SIGNAL] RetailerIndentItem post_delete — id={instance.id}")
    _broadcast_indents_changed()


@receiver(post_delete, sender=RetailerIndentItem)
def retailer_indent_item_deleted_recalc(
    sender, instance, **kwargs
):
    indent = _resolve_parent_indent(instance)
    if indent is None:
        return

    with silence_indent_signals():
        indent.recalculate()