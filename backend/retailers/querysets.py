# retailers/querysets.py

from django.db.models import Prefetch

from .models import (
    RetailerProductRequest,
    RetailerProductRequestItem,
    RetailerProductRequestOffer,
)


# Statuses visible to wholesalers. Drafts and terminal states excluded.
WHOLESALER_VISIBLE_REQUEST_STATUSES = [
    RetailerProductRequest.Status.PUBLISHED,
    RetailerProductRequest.Status.ACKNOWLEDGED,
    RetailerProductRequest.Status.PARTIALLY_FULFILLED,
]

# Item statuses that still matter to a wholesaler. Excludes lines that
# are already fulfilled or cancelled.
WHOLESALER_VISIBLE_ITEM_STATUSES = [
    RetailerProductRequestItem.Status.PENDING,
    RetailerProductRequestItem.Status.OFFERED,
    RetailerProductRequestItem.Status.PARTIALLY_FULFILLED,
]


def tagged_items_for_wholesaler(wholesaler_id):
    """
    Items that `wholesaler_id` was tagged on, on requests that are
    still visible.

    Prefetches `my_offers_cache` — the caller's own offers on each item
    — so a wholesaler-facing serializer can render "here's what I've
    offered" without leaking anyone else's offers.

    Returns a QuerySet; use `.distinct()` if you join on this.
    """
    return (
        RetailerProductRequestItem.objects
        .filter(
            target_pairs__wholesaler_id=wholesaler_id,
            target_pairs__is_active=True,
            request__status__in=WHOLESALER_VISIBLE_REQUEST_STATUSES,
        )
        .select_related("product", "request", "request__entity")
        .prefetch_related(
            Prefetch(
                "offers",
                queryset=RetailerProductRequestOffer.objects.filter(
                    wholesaler_id=wholesaler_id,
                ),
                to_attr="my_offers_cache",
            ),
        )
        .distinct()
    )


def tagged_requests_for_wholesaler(wholesaler_id):
    """
    Requests that `wholesaler_id` is tagged on: at least one active
    tagged item, and the request is in a wholesaler-visible status.
    """
    item_qs = tagged_items_for_wholesaler(wholesaler_id)

    return (
        RetailerProductRequest.objects
        .filter(
            status__in=WHOLESALER_VISIBLE_REQUEST_STATUSES,
            items__in=item_qs,
        )
        .select_related("entity")
        .distinct()
        .order_by("-created")
    )


def visible_item_for_wholesaler(wholesaler_id, item_id):
    """
    Single-item check used before accepting an offer. Returns the
    item if this wholesaler may offer on it, else None.
    """
    return (
        RetailerProductRequestItem.objects
        .filter(
            id=item_id,
            target_pairs__wholesaler_id=wholesaler_id,
            target_pairs__is_active=True,
            request__status__in=WHOLESALER_VISIBLE_REQUEST_STATUSES,
        )
        .select_related("product", "request", "request__entity")
        .distinct()
        .first()
    )