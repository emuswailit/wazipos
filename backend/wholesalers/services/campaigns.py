"""
Wholesaler campaign services.

All workflows that write to the database — from creating a draft
campaign to seeding an indent from a retailer opt-in — live here.

Convention
----------
Every public service takes `(data, user)` and returns `(errors, result)`.

    On success: errors is None, result is the created/updated object
                (or a plain dict for projections).
    On failure: result is None, errors is a JSON-serialisable mapping.

This matches the calling convention in views.campaignsAPIView. Reads
live in utils.py.

Domain helpers (`_build_probe`, `_snapshot_item_terms`,
`project_item_for_quantity`) are kept here as the single source of
truth for campaign-item projection math — WholesalerCampaignItem
delegates to `project_item_for_quantity`.
"""

from decimal import Decimal, InvalidOperation
from typing import Dict, Optional

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.translation import gettext_lazy as _

from ..models import (
    WholesalerCampaign,
    WholesalerCampaignAudience,
    WholesalerCampaignItem,
)


# ===========================================================================
# Private helpers
# ===========================================================================

def _errors_from(exc: Exception) -> Dict:
    """Normalise a ValidationError or general exception into a dict."""
    if isinstance(exc, ValidationError):
        if hasattr(exc, "message_dict"):
            return exc.message_dict
        return {"detail": list(exc.messages)}
    return {"detail": str(exc)}


def _parse_date_field(data: Dict, key: str):
    raw = data.get(key)
    if not raw:
        raise ValidationError({key: _("This field is required.")})
    parsed = parse_date(raw) if isinstance(raw, str) else raw
    if parsed is None:
        raise ValidationError({key: _("Enter a valid date.")})
    return parsed


def _parse_decimal(value) -> Optional[Decimal]:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValidationError(_("Enter a valid number."))


def _get_wholesaler_entity(user):
    """
    Resolve the entity that owns this user's campaigns.

    Adjust to match how ownership is modelled on your User / Entities
    relationship — the check is here so every service inherits it.
    """
    entity = getattr(user, "entity", None)
    if entity is None:
        raise ValidationError(_("User is not associated with an entity."))
    return entity


def _get_campaign(data: Dict, user, *, require_owner: bool = True) -> WholesalerCampaign:
    campaign_id = data.get("campaign_id") or data.get("id")
    if not campaign_id:
        raise ValidationError({"campaign_id": _("This field is required.")})

    campaign = (
        WholesalerCampaign.objects
        .select_related("wholesaler")
        .filter(pk=campaign_id)
        .first()
    )
    if campaign is None:
        raise ValidationError({"campaign_id": _("Campaign not found.")})

    if require_owner:
        entity = _get_wholesaler_entity(user)
        if campaign.wholesaler_id != entity.pk:
            raise ValidationError(
                {"campaign_id": _("Campaign does not belong to your entity.")}
            )
    return campaign


def _get_item(data: Dict, user) -> WholesalerCampaignItem:
    item_id = data.get("item_id")
    if not item_id:
        raise ValidationError({"item_id": _("This field is required.")})
    item = (
        WholesalerCampaignItem.objects
        .select_related("campaign", "campaign__wholesaler", "wholesaler_receipt")
        .filter(pk=item_id)
        .first()
    )
    if item is None:
        raise ValidationError({"item_id": _("Campaign item not found.")})

    entity = _get_wholesaler_entity(user)
    if item.campaign.wholesaler_id != entity.pk:
        raise ValidationError(
            {"item_id": _("Campaign item does not belong to your entity.")}
        )
    return item


def _get_audience(data: Dict, user, *, as_wholesaler: bool = True) -> WholesalerCampaignAudience:
    audience_id = data.get("audience_id")
    if not audience_id:
        raise ValidationError({"audience_id": _("This field is required.")})
    audience = (
        WholesalerCampaignAudience.objects
        .select_related("campaign", "campaign__wholesaler", "retailer")
        .filter(pk=audience_id)
        .first()
    )
    if audience is None:
        raise ValidationError({"audience_id": _("Audience row not found.")})

    if as_wholesaler:
        entity = _get_wholesaler_entity(user)
        if audience.campaign.wholesaler_id != entity.pk:
            raise ValidationError(
                {"audience_id": _("Audience row does not belong to your entity.")}
            )
    else:
        if audience.retailer_id != getattr(user, "entity_id", None):
            raise ValidationError(
                {"audience_id": _("Audience row does not belong to you.")}
            )
    return audience


# ===========================================================================
# Projection — domain math
# ===========================================================================

def _build_probe(item: WholesalerCampaignItem, quantity: int):
    """
    Build an unsaved RetailerIndentItem mirroring `item` so we can run the
    real recalculation logic instead of duplicating it.
    """
    from retailers.models import RetailerIndentItem

    return RetailerIndentItem(
        retailer_indent=None,
        wholesale_receipt=item.wholesaler_receipt,
        wholesaler_price_discount=item.wholesaler_price_discount,
        wholesaler_quantity_discount=item.wholesaler_quantity_discount,
        required_quantity=quantity,
        recommended_retail_price=item.retail_price_hint,
        supplier_unit_selling_price=None,
    )


def project_item_for_quantity(item: WholesalerCampaignItem, quantity: int, markup_pct: Decimal):
    """
    Run the same math as RetailerIndentItem.recalculate against an unsaved
    probe. Public because WholesalerCampaignItem.project_for_quantity
    delegates here.
    """
    probe = _build_probe(item, quantity)
    probe.recalculate(markup_override=markup_pct)
    return probe.profit_estimate


def _snapshot_item_terms(item: WholesalerCampaignItem) -> None:
    """
    Freeze the terms shown to retailers for a single campaign item.

    NOTE: `unit_selling_price` and `bonus_quantity` are the field names on
    RetailerIndentItem assumed by this snapshot. Adjust the two
    assignments if your probe exposes them under different names.
    """
    probe = _build_probe(item, quantity=1)
    probe.recalculate()

    item.published_unit_price = probe.unit_selling_price
    item.published_bonus_quantity = getattr(probe, "bonus_quantity", 0) or 0
    item.published_at = timezone.now()
    item.save(
        update_fields=[
            "published_unit_price",
            "published_bonus_quantity",
            "published_at",
            "updated",
        ]
    )


# ===========================================================================
# Campaign lifecycle
# ===========================================================================

def create_campaign(data: Dict, user):
    """Create a draft campaign owned by the user's entity."""
    try:
        entity = _get_wholesaler_entity(user)
        campaign = WholesalerCampaign(
            wholesaler=entity,
            title=(data.get("title") or "").strip(),
            description=data.get("description", "") or "",
            start=_parse_date_field(data, "start"),
            end=_parse_date_field(data, "end"),
            budget_cap=_parse_decimal(data.get("budget_cap")),
            status=WholesalerCampaign.Status.DRAFT,
            owner=user,
        )
        if not campaign.title:
            raise ValidationError({"title": _("This field is required.")})

        campaign.full_clean()
        campaign.save()
        return None, campaign
    except ValidationError as exc:
        return _errors_from(exc), None


def update_campaign(data: Dict, user):
    """Update the mutable fields of a draft campaign."""
    try:
        campaign = _get_campaign(data, user)

        if campaign.status not in (
            WholesalerCampaign.Status.DRAFT,
            WholesalerCampaign.Status.PUBLISHED,
        ):
            raise ValidationError(
                _("Only draft or published campaigns can be updated.")
            )

        if "title" in data:
            campaign.title = (data.get("title") or "").strip()
        if "description" in data:
            campaign.description = data.get("description") or ""
        if "start" in data:
            campaign.start = _parse_date_field(data, "start")
        if "end" in data:
            campaign.end = _parse_date_field(data, "end")
        if "budget_cap" in data:
            campaign.budget_cap = _parse_decimal(data.get("budget_cap"))

        campaign.full_clean()
        campaign.save()
        return None, campaign
    except ValidationError as exc:
        return _errors_from(exc), None


def delete_campaign(data: Dict, user):
    """Delete a campaign and everything hanging off it (cascades)."""
    try:
        campaign = _get_campaign(data, user)
        if campaign.status == WholesalerCampaign.Status.PUBLISHED and campaign.audience.filter(
            opted_in_at__isnull=False,
        ).exists():
            raise ValidationError(
                _("Cannot delete a published campaign that has opt-ins. Close it instead.")
            )
        campaign.delete()
        return None, campaign
    except ValidationError as exc:
        return _errors_from(exc), None


def _apply_publication(campaign: WholesalerCampaign) -> None:
    """The multi-row workflow. Raises ValidationError on failure."""
    items = list(
        campaign.items.select_related(
            "wholesaler_receipt",
            "wholesaler_price_discount",
            "wholesaler_quantity_discount",
        )
    )
    if not items:
        raise ValidationError(_("Cannot publish a campaign with no items."))

    for item in items:
        item.validate_windows_cover_campaign()

    for item in items:
        _snapshot_item_terms(item)

    campaign.status = WholesalerCampaign.Status.PUBLISHED
    campaign.save(update_fields=["status", "updated"])


@transaction.atomic
def publish_campaign(data: Dict, user):
    """View-facing wrapper around `_apply_publication`."""
    try:
        campaign = _get_campaign(data, user)
        if campaign.status != WholesalerCampaign.Status.DRAFT:
            raise ValidationError(_("Only draft campaigns can be published."))
        _apply_publication(campaign)
        return None, campaign
    except ValidationError as exc:
        return _errors_from(exc), None


def close_campaign(data: Dict, user):
    """Close a published campaign — stops new opt-ins, keeps existing ones."""
    try:
        campaign = _get_campaign(data, user)
        if campaign.status != WholesalerCampaign.Status.PUBLISHED:
            raise ValidationError(_("Only published campaigns can be closed."))
        campaign.status = WholesalerCampaign.Status.CLOSED
        campaign.save(update_fields=["status", "updated"])
        return None, campaign
    except ValidationError as exc:
        return _errors_from(exc), None


# ===========================================================================
# Campaign items
# ===========================================================================

def _resolve_discount(model, discount_id, receipt):
    """Fetch a discount and verify it belongs to the given receipt."""
    if not discount_id:
        return None
    discount = model.objects.filter(pk=discount_id, wholesaler_receipt=receipt).first()
    if discount is None:
        raise ValidationError(
            _("Discount %(id)s does not belong to the selected receipt.")
            % {"id": discount_id}
        )
    return discount


def add_campaign_item(data: Dict, user):
    """Attach a receipt (plus optional discounts) to a draft campaign."""
    from ..models import WholesalerPriceDiscounts, WholesalerQuantityDiscounts
    from ..models import WholesalerReceipts

    try:
        campaign = _get_campaign(data, user)
        if campaign.status != WholesalerCampaign.Status.DRAFT:
            raise ValidationError(_("Items can only be added to draft campaigns."))

        receipt_id = data.get("wholesaler_receipt_id")
        if not receipt_id:
            raise ValidationError(
                {"wholesaler_receipt_id": _("This field is required.")}
            )
        receipt = WholesalerReceipts.objects.filter(pk=receipt_id).first()
        if receipt is None:
            raise ValidationError(
                {"wholesaler_receipt_id": _("Receipt not found.")}
            )

        item = WholesalerCampaignItem(
            campaign=campaign,
            wholesaler_receipt=receipt,
            wholesaler_price_discount=_resolve_discount(
                WholesalerPriceDiscounts, data.get("wholesaler_price_discount_id"), receipt,
            ),
            wholesaler_quantity_discount=_resolve_discount(
                WholesalerQuantityDiscounts, data.get("wholesaler_quantity_discount_id"), receipt,
            ),
            suggested_quantity=int(data.get("suggested_quantity") or 0),
            per_retailer_limit=(
                int(data["per_retailer_limit"])
                if data.get("per_retailer_limit") not in (None, "")
                else None
            ),
            retail_price_hint=_parse_decimal(data.get("retail_price_hint")),
            owner=user,
        )
        item.full_clean()
        item.save()
        return None, item
    except ValidationError as exc:
        return _errors_from(exc), None


def update_campaign_item(data: Dict, user):
    """Update a campaign item. Only allowed while the campaign is a draft."""
    from ..models import WholesalerPriceDiscounts, WholesalerQuantityDiscounts

    try:
        item = _get_item(data, user)
        if item.campaign.status != WholesalerCampaign.Status.DRAFT:
            raise ValidationError(_("Items can only be edited on draft campaigns."))

        receipt = item.wholesaler_receipt

        if "wholesaler_price_discount_id" in data:
            item.wholesaler_price_discount = _resolve_discount(
                WholesalerPriceDiscounts, data.get("wholesaler_price_discount_id"), receipt,
            )
        if "wholesaler_quantity_discount_id" in data:
            item.wholesaler_quantity_discount = _resolve_discount(
                WholesalerQuantityDiscounts, data.get("wholesaler_quantity_discount_id"), receipt,
            )
        if "suggested_quantity" in data:
            item.suggested_quantity = int(data.get("suggested_quantity") or 0)
        if "per_retailer_limit" in data:
            item.per_retailer_limit = (
                int(data["per_retailer_limit"])
                if data.get("per_retailer_limit") not in (None, "")
                else None
            )
        if "retail_price_hint" in data:
            item.retail_price_hint = _parse_decimal(data.get("retail_price_hint"))

        item.full_clean()
        item.save()
        return None, item
    except ValidationError as exc:
        return _errors_from(exc), None


def delete_campaign_item(data: Dict, user):
    """Remove an item from a draft campaign."""
    try:
        item = _get_item(data, user)
        if item.campaign.status != WholesalerCampaign.Status.DRAFT:
            raise ValidationError(_("Items can only be removed from draft campaigns."))
        item.delete()
        return None, item
    except ValidationError as exc:
        return _errors_from(exc), None


# ===========================================================================
# Audience
# ===========================================================================

def add_campaign_audience(data: Dict, user):
    """Add one retailer to a campaign's audience."""
    try:
        from authentication.models import Entities

        campaign = _get_campaign(data, user)
        if campaign.status != WholesalerCampaign.Status.DRAFT:
            raise ValidationError(_("Audience can only be edited on draft campaigns."))

        retailer_id = data.get("retailer_id")
        if not retailer_id:
            raise ValidationError({"retailer_id": _("This field is required.")})
        retailer = Entities.objects.filter(pk=retailer_id).first()
        if retailer is None:
            raise ValidationError({"retailer_id": _("Retailer entity not found.")})

        existing = WholesalerCampaignAudience.objects.filter(
            campaign=campaign, retailer=retailer,
        ).first()
        if existing is not None:
            if existing.is_visible == "true":
                raise ValidationError(_("This retailer is already on the audience."))
            existing.is_visible = "true"
            existing.save(update_fields=["is_visible", "updated"])
            return None, existing

        audience = WholesalerCampaignAudience.objects.create(
            campaign=campaign,
            retailer=retailer,
            is_visible="true",
            owner=user,
        )
        return None, audience
    except ValidationError as exc:
        return _errors_from(exc), None


def remove_campaign_audience(data: Dict, user):
    """
    Remove a retailer from the audience.

    Hard-deletes if they never opted in, otherwise soft-hides so the
    attribution link to their indent is preserved.
    """
    try:
        audience = _get_audience(data, user, as_wholesaler=True)
        if audience.opted_in_at is not None:
            audience.is_visible = "false"
            audience.save(update_fields=["is_visible", "updated"])
        else:
            audience.delete()
        return None, audience
    except ValidationError as exc:
        return _errors_from(exc), None


# ===========================================================================
# Retailer-facing
# ===========================================================================

def project_campaign(data: Dict, user):
    """
    Compute per-item projections for a retailer without committing.

    Payload:
        {
          "campaign_id": int,
          "items": [{"item_id": int, "quantity": int}, ...],
          "markup_pct": "10.00"   # optional
        }

    Returns a list of dicts ready for JSON serialisation.
    """
    try:
        campaign_id = data.get("campaign_id")
        if not campaign_id:
            raise ValidationError({"campaign_id": _("This field is required.")})
        campaign = WholesalerCampaign.objects.filter(pk=campaign_id).first()
        if campaign is None or not campaign.is_currently_active:
            raise ValidationError({"campaign_id": _("Campaign is not currently active.")})

        markup_pct = _parse_decimal(data.get("markup_pct")) or Decimal("0")

        items_by_id = {
            item.pk: item
            for item in campaign.items.select_related(
                "wholesaler_receipt",
                "wholesaler_receipt__product",
                "wholesaler_price_discount",
                "wholesaler_quantity_discount",
            )
        }

        requested = data.get("items") or []
        if not requested:
            raise ValidationError({"items": _("At least one item is required.")})

        projections = []
        for entry in requested:
            item_id = entry.get("item_id")
            quantity = int(entry.get("quantity") or 0)
            item = items_by_id.get(item_id)
            if item is None:
                raise ValidationError(
                    {"items": _("Item %(id)s is not on this campaign.") % {"id": item_id}}
                )
            if quantity <= 0:
                raise ValidationError(
                    {"items": _("Quantity for item %(id)s must be positive.") % {"id": item_id}}
                )
            if item.per_retailer_limit is not None and quantity > item.per_retailer_limit:
                raise ValidationError(
                    {"items": _("Quantity for item %(id)s exceeds the per-retailer limit.") % {"id": item_id}}
                )

            profit = project_item_for_quantity(item, quantity, markup_pct)
            projections.append({
                "item_id": item.pk,
                "receipt_id": item.wholesaler_receipt_id,
                "product_title": item.wholesaler_receipt.product.title,
                "quantity": quantity,
                "published_unit_price": str(item.published_unit_price or ""),
                "published_bonus_quantity": item.published_bonus_quantity,
                "profit_estimate": str(profit),
            })

        return None, projections
    except ValidationError as exc:
        return _errors_from(exc), None


@transaction.atomic
def opt_in_campaign(data: Dict, user):
    """
    Seed a RetailerIndent from a campaign opt-in.

    Payload:
        {
          "campaign_id": int,
          "items": [{"item_id": int, "quantity": int}, ...],
          "markup_pct": "10.00"   # optional
        }

    Returns `{"indent": RetailerIndent, "items": [RetailerIndentItem, ...]}`.
    """
    from retailers.models import RetailerIndent, RetailerIndentItem

    try:
        retailer_entity = _get_wholesaler_entity(user)

        campaign_id = data.get("campaign_id")
        if not campaign_id:
            raise ValidationError({"campaign_id": _("This field is required.")})

        audience = (
            WholesalerCampaignAudience.objects
            .select_related("campaign")
            .filter(campaign_id=campaign_id, retailer=retailer_entity)
            .first()
        )
        if audience is None:
            raise ValidationError(_("You are not on the audience for this campaign."))
        if audience.is_visible != "true":
            raise ValidationError(_("This campaign is not visible to you."))

        campaign = audience.campaign
        if not campaign.is_currently_active:
            raise ValidationError(_("Campaign is not currently active."))

        if audience.opted_in_at is not None:
            raise ValidationError(_("You have already opted in to this campaign."))

        items_by_id = {
            item.pk: item
            for item in campaign.items.select_related(
                "wholesaler_receipt",
                "wholesaler_price_discount",
                "wholesaler_quantity_discount",
            )
        }

        requested = data.get("items") or []
        if not requested:
            raise ValidationError({"items": _("At least one item is required.")})

        markup_pct = _parse_decimal(data.get("markup_pct")) or Decimal("0")

        # Pre-flight: validate every line before creating anything.
        resolved = []
        for entry in requested:
            item_id = entry.get("item_id")
            quantity = int(entry.get("quantity") or 0)
            item = items_by_id.get(item_id)
            if item is None:
                raise ValidationError(
                    {"items": _("Item %(id)s is not on this campaign.") % {"id": item_id}}
                )
            if quantity <= 0:
                raise ValidationError(
                    {"items": _("Quantity for item %(id)s must be positive.") % {"id": item_id}}
                )

            if item.per_retailer_limit is not None:
                already = (
                    RetailerIndentItem.objects
                    .filter(
                        retailer_indent__retailer=retailer_entity,
                        retailer_indent__campaign=campaign,
                        wholesaler_receipt=item.wholesaler_receipt,
                    )
                    .aggregate(total=models.Sum("required_quantity"))
                    .get("total") or 0
                )
                if already + quantity > item.per_retailer_limit:
                    raise ValidationError(
                        _(
                            "Quantity for %(title)s exceeds the per-retailer "
                            "limit of %(limit)s."
                        )
                        % {
                            "title": item.wholesaler_receipt.product.title,
                            "limit": item.per_retailer_limit,
                        }
                    )
            resolved.append((item, quantity))

        indent = RetailerIndent.objects.create(
            retailer=retailer_entity,
            campaign=campaign,
            owner=user,
        )

        created_lines = []
        for item, quantity in resolved:
            line = RetailerIndentItem(
                retailer_indent=indent,
                wholesale_receipt=item.wholesaler_receipt,
                wholesaler_price_discount=item.wholesaler_price_discount,
                wholesaler_quantity_discount=item.wholesaler_quantity_discount,
                required_quantity=quantity,
                recommended_retail_price=item.retail_price_hint,
                supplier_unit_selling_price=None,
            )
            line.recalculate(markup_override=markup_pct)
            line.save()
            created_lines.append(line)

        audience.opted_in_at = timezone.now()
        audience.opted_out_at = None
        audience.retailer_indent = indent
        audience.save(
            update_fields=["opted_in_at", "opted_out_at", "retailer_indent", "updated"]
        )

        return None, {"indent": indent, "items": created_lines}
    except ValidationError as exc:
        return _errors_from(exc), None


def opt_out_campaign(data: Dict, user):
    """
    Mark the retailer's opt-in as withdrawn. Does not delete the indent —
    that is a separate commercial decision, not a campaign action.
    """
    try:
        retailer_entity = _get_wholesaler_entity(user)

        campaign_id = data.get("campaign_id")
        if not campaign_id:
            raise ValidationError({"campaign_id": _("This field is required.")})

        audience = (
            WholesalerCampaignAudience.objects
            .select_related("campaign")
            .filter(campaign_id=campaign_id, retailer=retailer_entity)
            .first()
        )
        if audience is None:
            raise ValidationError(_("You are not on the audience for this campaign."))
        if audience.opted_in_at is None:
            raise ValidationError(_("You have not opted in to this campaign."))

        audience.opted_out_at = timezone.now()
        audience.save(update_fields=["opted_out_at", "updated"])
        return None, audience
    except ValidationError as exc:
        return _errors_from(exc), None