"""
Wholesaler campaign read selectors.

Read-only queries used by views.campaignsAPIView. Writes and
multi-row workflows live in services/campaigns.py.

Every selector takes `(data, user)` — same convention as services,
but returns either a queryset (for paginated lists) or a
`(object, errors)` tuple for single-object fetches.
"""

from django.core.exceptions import ValidationError
from django.db.models import Prefetch
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..models import (
    WholesalerCampaign,
    WholesalerCampaignAudience,
    WholesalerCampaignBanners,
    WholesalerCampaignItem,
)


# ===========================================================================
# Private helpers
# ===========================================================================

def _get_user_entity(user):
    """
    Resolve the entity that owns this user's campaigns.

    Mirror of the helper in services/campaigns.py. Kept local so
    campaign_utils has no dependency on the services package.
    """
    entity = getattr(user, "entity", None)
    if entity is None:
        raise ValidationError(_("User is not associated with an entity."))
    return entity


def _errors_from(exc: Exception):
    """Normalise a ValidationError into a dict."""
    if isinstance(exc, ValidationError):
        if hasattr(exc, "message_dict"):
            return exc.message_dict
        return {"detail": list(exc.messages)}
    return {"detail": str(exc)}


def _campaign_queryset():
    """
    Base queryset for campaign reads.

    Prefetches items, audience and banners so detail serializers don't
    issue N+1 queries. List serializers ignore the prefetches and cost
    only the parent row.

    NOTE: the reverse-relation name for the campaign's banner M2M is
    `campaign_banners` (see WholesalerCampaign.campaign_banners). The
    previous `"banners"` string was the old singular model's related
    name and no longer exists.
    """
    item_qs = (
        WholesalerCampaignItem.objects
        .select_related(
            "wholesaler_receipt",
            "wholesaler_receipt__product",
            "wholesaler_price_discount",
            "wholesaler_quantity_discount",
        )
        .order_by("id")
    )
    audience_qs = (
        WholesalerCampaignAudience.objects
        .select_related("retailer")
        .order_by("id")
    )
    banner_qs = WholesalerCampaignBanners.objects.order_by("created", "id")

    return (
        WholesalerCampaign.objects
        .select_related("wholesaler")
        .prefetch_related(
            Prefetch("items", queryset=item_qs),
            Prefetch("audience", queryset=audience_qs),
            Prefetch("campaign_banners", queryset=banner_qs),
        )
    )


# ===========================================================================
# Campaign reads
# ===========================================================================

def get_entity_campaigns(data, user):
    """
    List campaigns owned by the caller's entity.

    Optional filters via `data`:
        status       — one of DRAFT / PUBLISHED / CLOSED / CANCELLED
        is_active    — "true" / "false"
        active_only  — if truthy, restrict to currently-active campaigns

    Sample request:
        {
            "action": "GetEntityCampaigns",
            "status": "PUBLISHED",     // optional
            "page": 1
        }

    Returns a queryset suitable for PageNumberPagination.
    """
    entity = _get_user_entity(user)
    qs = _campaign_queryset().filter(wholesaler=entity)

    status = data.get("status")
    if status:
        qs = qs.filter(status=status)

    is_active = data.get("is_active")
    if is_active is not None:
        qs = qs.filter(is_active=str(is_active).lower())

    if data.get("active_only"):
        today = timezone.now().date()
        qs = qs.filter(
            is_active="true",
            status=WholesalerCampaign.Status.PUBLISHED,
            start__lte=today,
            end__gte=today,
        )

    return qs.order_by("-created")


def get_campaign_details(data, user):
    """
    Fetch a single campaign owned by the caller's entity.

    Sample request:
        {
            "action": "GetCampaignDetails",
            "campaign_id": 42
        }

    Returns `(campaign, None)` on success, `(None, errors)` otherwise.
    """
    try:
        campaign_id = data.get("campaign_id") or data.get("id")
        if not campaign_id:
            raise ValidationError({"campaign_id": _("This field is required.")})

        entity = _get_user_entity(user)
        campaign = (
            _campaign_queryset()
            .filter(pk=campaign_id, wholesaler=entity)
            .first()
        )
        if campaign is None:
            raise ValidationError({"campaign_id": _("Campaign not found.")})
        return campaign, None
    except ValidationError as exc:
        return None, _errors_from(exc)


# ===========================================================================
# Item reads
# ===========================================================================

def get_campaign_items(data, user):
    """
    List items on a campaign owned by the caller's entity.

    Sample request:
        {
            "action": "GetCampaignItems",
            "campaign_id": 42,
            "page": 1
        }

    Returns a queryset suitable for PageNumberPagination.
    """
    campaign_id = data.get("campaign_id")
    if not campaign_id:
        raise ValidationError({"campaign_id": _("This field is required.")})

    entity = _get_user_entity(user)
    owns = WholesalerCampaign.objects.filter(
        pk=campaign_id, wholesaler=entity,
    ).exists()
    if not owns:
        raise ValidationError({"campaign_id": _("Campaign not found.")})

    return (
        WholesalerCampaignItem.objects
        .select_related(
            "campaign",
            "wholesaler_receipt",
            "wholesaler_receipt__product",
            "wholesaler_price_discount",
            "wholesaler_quantity_discount",
        )
        .filter(campaign_id=campaign_id)
        .order_by("id")
    )


# ===========================================================================
# Audience reads
# ===========================================================================

def get_campaign_audience(data, user):
    """
    List the audience (and opt-in state) for a campaign owned by the
    caller's entity.

    Optional filter via `data`:
        opted_in  — "true" to return only retailers who opted in,
                    "false" for those who have not.

    Sample request:
        {
            "action": "GetCampaignAudience",
            "campaign_id": 42,
            "page": 1
        }

    Returns a queryset suitable for PageNumberPagination.
    """
    campaign_id = data.get("campaign_id")
    if not campaign_id:
        raise ValidationError({"campaign_id": _("This field is required.")})

    entity = _get_user_entity(user)
    owns = WholesalerCampaign.objects.filter(
        pk=campaign_id, wholesaler=entity,
    ).exists()
    if not owns:
        raise ValidationError({"campaign_id": _("Campaign not found.")})

    qs = (
        WholesalerCampaignAudience.objects
        .select_related("campaign", "retailer", "retailer_indent")
        .filter(campaign_id=campaign_id)
    )

    # `has_opted_in` compares timestamps, so a row where the retailer
    # opted in, opted out, then opted back in correctly reads as
    # opted-in. An inline filter of
    # `opted_in_at__isnull=False, opted_out_at__isnull=True`
    # would miss that case.
    opted_in = data.get("opted_in")
    if opted_in is not None:
        value = str(opted_in).lower()
        if value == "true":
            qs = qs.filter(opted_in_at__isnull=False).filter(
                # opted_in_at > opted_out_at, or no opt-out at all
                models.Q(opted_out_at__isnull=True)
                | models.Q(opted_in_at__gt=models.F("opted_out_at"))
            )
        elif value == "false":
            qs = qs.filter(
                models.Q(opted_in_at__isnull=True)
                | models.Q(opted_in_at__lte=models.F("opted_out_at"))
            )

    return qs.order_by("id")


# ===========================================================================
# Retailer-facing reads
# ===========================================================================

def get_my_campaigns(data, user):
    """
    List campaigns the caller (a retailer) is on the audience for.

    Optional filters via `data`:
        status       — one of DRAFT / PUBLISHED / CLOSED / CANCELLED
        opted_in     — "true" / "false" to filter by opt-in state
        active_only  — if truthy, restrict to currently-active campaigns

    Sample request:
        {
            "action": "GetMyCampaigns",
            "active_only": true,
            "page": 1
        }

    Returns a queryset of WholesalerCampaign, suitable for
    PageNumberPagination.
    """
    entity = _get_user_entity(user)

    audience_qs = WholesalerCampaignAudience.objects.filter(
        retailer=entity,
        is_visible="true",
    )

    opted_in = data.get("opted_in")
    if opted_in is not None:
        value = str(opted_in).lower()
        if value == "true":
            audience_qs = audience_qs.filter(
                opted_in_at__isnull=False
            ).filter(
                models.Q(opted_out_at__isnull=True)
                | models.Q(opted_in_at__gt=models.F("opted_out_at"))
            )
        elif value == "false":
            audience_qs = audience_qs.filter(
                models.Q(opted_in_at__isnull=True)
                | models.Q(opted_in_at__lte=models.F("opted_out_at"))
            )

    campaign_ids = audience_qs.values_list("campaign_id", flat=True)
    qs = _campaign_queryset().filter(pk__in=campaign_ids)

    status = data.get("status")
    if status:
        qs = qs.filter(status=status)
    else:
        # Default to published-only for the retailer inbox — drafts
        # should never surface here even if the audience row exists.
        qs = qs.filter(status=WholesalerCampaign.Status.PUBLISHED)

    if data.get("active_only"):
        today = timezone.now().date()
        # Also assert status=PUBLISHED here. A campaign that was closed
        # mid-window has a valid date range but should not show up in
        # the retailer inbox under active_only.
        qs = qs.filter(
            is_active="true",
            status=WholesalerCampaign.Status.PUBLISHED,
            start__lte=today,
            end__gte=today,
        )

    return qs.order_by("-start", "-created")