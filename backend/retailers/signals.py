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
        {
            "type": "send_retailer_receipts",
        },
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
#
# Used by the recalc receivers so an internal
# `indent.recalculate()` save doesn't schedule a second broadcast —
# the item's own post_save already did.
# ---------------------------------------------------------------------

_silenced = threading.local()


def _is_silenced() -> bool:
    return getattr(_silenced, "on", False)


@contextmanager
def silence_indent_signals():
    """
    Suppress indent broadcasts within a `with` block.

    Nests safely: an inner block restores the outer state on exit
    instead of unconditionally clearing the flag.

        with silence_indent_signals():
            indent.recalculate()   # no broadcast fired
    """
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

    No-op inside `silence_indent_signals()`.
    """
    if _is_silenced():
        return

    transaction.on_commit(_do_broadcast_indents_changed)


# ---------------------------------------------------------------------
# RetailerIndent
# ---------------------------------------------------------------------

@receiver(post_save, sender=RetailerIndent)
def retailer_indent_saved(sender, instance, created, **kwargs):
    _broadcast_indents_changed()


@receiver(post_delete, sender=RetailerIndent)
def retailer_indent_deleted(sender, instance, **kwargs):
    _broadcast_indents_changed()


# ---------------------------------------------------------------------
# RetailerIndentItem — broadcast + recalculate
#
# Two receivers per event:
#   1. broadcast   → tells every client to re-fetch
#   2. recalculate → updates the parent's totals
#
# The recalc save is wrapped in silence_indent_signals() so it
# doesn't schedule a redundant broadcast.
# ---------------------------------------------------------------------

def _resolve_parent_indent(instance):
    """
    Return the parent RetailerIndent, or None if it can't be
    resolved (e.g. cascade delete where the parent is gone).
    """
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
    _broadcast_indents_changed()


@receiver(post_save, sender=RetailerIndentItem)
def retailer_indent_item_saved_recalc(
    sender, instance, created, **kwargs
):
    """
    Recompute the parent indent's totals after an item save.

    Silent — the receiver above already scheduled a broadcast.
    """
    indent = _resolve_parent_indent(instance)
    if indent is None:
        return

    with silence_indent_signals():
        indent.recalculate()


# ---- post_delete ----

@receiver(post_delete, sender=RetailerIndentItem)
def retailer_indent_item_deleted_broadcast(
    sender, instance, **kwargs
):
    _broadcast_indents_changed()


@receiver(post_delete, sender=RetailerIndentItem)
def retailer_indent_item_deleted_recalc(
    sender, instance, **kwargs
):
    """
    Recompute the parent's totals after an item delete.

    On cascade delete (parent gone), `_resolve_parent_indent`
    returns None and we skip — the parent's own delete signal
    handles the broadcast.
    """
    indent = _resolve_parent_indent(instance)
    if indent is None:
        return

    with silence_indent_signals():
        indent.recalculate()