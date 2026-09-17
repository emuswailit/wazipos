# wholesalers/signals.py

"""
Signals for the wholesaler app.

When a WholesalerReceipts' current_unit_quantity changes, rebalance
any open RetailerProductRequestOffers against that receipt so pending
offers shrink or withdraw based on real availability.
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import WholesalerReceipts


@receiver(pre_save, sender=WholesalerReceipts)
def capture_old_quantity(sender, instance, **kwargs):
    """Snapshot the previous quantity before save so post_save can compare."""
    if instance.pk:
        try:
            old = (
                WholesalerReceipts.objects
                .only("current_unit_quantity")
                .get(pk=instance.pk)
            )
            instance._old_quantity = old.current_unit_quantity
        except WholesalerReceipts.DoesNotExist:
            instance._old_quantity = None
    else:
        instance._old_quantity = None


@receiver(post_save, sender=WholesalerReceipts)
def rebalance_request_offers(sender, instance, created, **kwargs):
    """Rebalance pending offers when the receipt's quantity changes."""
    if created:
        return

    old = getattr(instance, "_old_quantity", None)
    if old is None or old == instance.current_unit_quantity:
        return

    from retailers.models import RetailerProductRequestOffer

    offers = list(
        RetailerProductRequestOffer.objects
        .filter(
            wholesaler_receipt=instance,
            status__in=[
                RetailerProductRequestOffer.Status.OFFERED,
                RetailerProductRequestOffer.Status.CONFIRMED,
            ],
        )
        .order_by("responded_at", "created")
        .select_related("request_item")
    )

    if not offers:
        return

    available = int(instance.current_unit_quantity or 0)
    updates = []
    affected_line_ids = set()
    affected_request_ids = set()

    for offer in offers:
        original = offer.offered_quantity or 0
        if available >= original:
            available -= original
            continue

        new_offered = max(0, available)
        available = 0

        if new_offered != original:
            offer.offered_quantity = new_offered
            if new_offered == 0:
                offer.status = RetailerProductRequestOffer.Status.WITHDRAWN
                offer.retailer_response_note = (
                    "Stock consumed before confirmation."
                )
            offer.save(update_fields=[
                "offered_quantity", "status",
                "retailer_response_note", "updated",
            ])
            affected_line_ids.add(offer.request_item_id)
            affected_request_ids.add(offer.request_item.request_id)
            updates.append({
                "offer_id": str(offer.id),
                "request_id": str(offer.request_item.request_id),
                "retailer_id": str(offer.request_item.request.entity_id),
                "old_offered": original,
                "new_offered": new_offered,
            })

    # Recalculate affected lines and their request headers
    if affected_line_ids:
        from retailers.models import (
            RetailerProductRequestItem,
            RetailerProductRequest,
        )
        for line in RetailerProductRequestItem.objects.filter(id__in=affected_line_ids):
            line.recalculate(save=True)
        for req in RetailerProductRequest.objects.filter(id__in=affected_request_ids):
            req.recalculate(save=True)

    # Push notifications
    if updates:
        try:
            from analytics.realtime import push_offer_adjusted
            for u in updates:
                push_offer_adjusted(u["retailer_id"], {
                    "request_id": u["request_id"],
                    "offer_id": u["offer_id"],
                    "old_offered_quantity": u["old_offered"],
                    "new_offered_quantity": u["new_offered"],
                })
        except ImportError:
            # Realtime module not wired yet — silently skip
            pass