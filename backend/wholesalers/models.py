# wholesalers/models.py

# Standard library
import uuid
from decimal import Decimal
from io import BytesIO
from typing import Dict

import pytz
from PIL import Image

# Third-party
from django_advance_thumbnail import AdvanceThumbnailField

# Django
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files import File
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.db.models import F, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

# Your apps
from authentication.models import DocumentNumbers, Entities, Stakes, Users
from core.constants import TRUE_FALSE_OPTIONS, UNITS_OF_ISSUE_CHOICES
from core.models import EntityRelatedModel
from core.utils import _q
from distributors.models import (
    DistributorReceipts,
    WholesalerOrders,
    WholesalerOrderItems,
)
from drugs.models import Users as DrugsUsers
from employees.models import Employees
from payments.models import PayoutAccounts
from products.models import Products

User = get_user_model()

COMPRESS_THRESHOLD_BYTES = 100 * 1024


# ---------------------------------------------------------------------------
# Upload path helpers
# ---------------------------------------------------------------------------

def wholesaler_price_discount_image_upload_to(instance, filename):
    title = instance.wholesaler_price_discount.title
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename


def wholesaler_quantity_discount_image_upload_to(instance, filename):
    title = instance.wholesaler_quantity_discount.title
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename


def wholesaler_campaign_image_upload_to(instance, filename):
    """
    Upload path for a campaign banner. Mirrors
    `wholesaler_quantity_discount_image_upload_to` /
    `wholesaler_price_discount_image_upload_to`.
    """
    title = instance.wholesaler_campaign.title
    slug = slugify(title)
    basename, file_extension = filename.split(".")
    new_filename = "%s-%s.%s" % (slug, instance.id, file_extension)
    return new_filename


# ---------------------------------------------------------------------------
# Legacy upload path helpers — kept so historical migrations can still import
# them by dotted path. New code should use `wholesaler_campaign_image_upload_to`.
# ---------------------------------------------------------------------------

def wholesaler_campaign_banner_upload_to(instance, filename):
    """Legacy helper for the removed single `banner` field."""
    return f"campaigns/{instance.uuid}/banner/{filename}"


# Backward-compat alias. Migration 0001_initial was generated when this
# function was named `wholesaler_campaign_hero_upload_to`. Django stores
# the callable path in migration state, so keep this alias so the loader
# can still import it on a fresh DB.
wholesaler_campaign_hero_upload_to = wholesaler_campaign_banner_upload_to


def wholesaler_campaign_gallery_upload_to(instance, filename):
    """Legacy helper for the removed singular `WholesalerCampaignBanner`."""
    key = str(instance.campaign.uuid) if instance.campaign_id else "draft"
    return f"campaigns/{key}/gallery/{filename}"


# ---------------------------------------------------------------------------
# Image helper
# ---------------------------------------------------------------------------

def compress_image(image):
    im = Image.open(image)
    if im.mode != "RGB":
        im = im.convert("RGB")
    im_io = BytesIO()
    im.save(im_io, "jpeg", quality=70, optimize=True)
    new_image = File(im_io, name=image.name)
    return new_image


# ---------------------------------------------------------------------------
# Wholesaler receipts & discounts
# ---------------------------------------------------------------------------

class WholesalerReceipts(EntityRelatedModel):
    """
    Distributor -> wholesaler inventory lot.

    One row per batch / expiry received by a wholesaler from a
    distributor. The wholesaler prices retailer indents against
    these rows.
    """

    draft_id = models.CharField(max_length=100, null=True, blank=True)
    product = models.ForeignKey(
        "products.Products",
        on_delete=models.CASCADE,
    )
    received_from = models.ForeignKey(
        "authentication.Entities",
        related_name="variationReceiptDistributor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    wholesaler_order_item = models.ForeignKey(
        WholesalerOrderItems,
        related_name="wholesalerDistributorOrder",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    retailer_order_item = models.ForeignKey(
        "wholesalers.RetailerOrderItems",
        related_name="resulting_receipts",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text=(
            "Retailer order line this lot is fulfilling, if any. "
            "Null for lots that came in via a distributor order only."
        ),
    )

    unit_of_receipt = models.CharField(
        max_length=20,
        choices=UNITS_OF_ISSUE_CHOICES,
        default="Pack",
    )
    batch = models.CharField(max_length=50, null=True, blank=True)
    bar_code = models.CharField(max_length=100, null=True, blank=True)
    manufacture_date = models.DateField(default=None, null=True, blank=True)
    expiry_date = models.DateField(default=None, null=True, blank=True)

    current_unit_quantity = models.BigIntegerField(default=0)
    received_unit_quantity = models.BigIntegerField(default=0)

    unit_buying_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    discount_unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
    )
    final_unit_selling_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
    )
    recommended_retail_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        default=None,
        help_text=(
            "Suggested retail price for the retailer to sell at. "
            "When set, overrides the retailer's indent markup. "
            "When empty, the retailer's indent markup applies."
        ),
    )

    employee = models.ForeignKey(
        Employees,
        related_name="employee_creating_wholesaler_receipt",
        on_delete=models.CASCADE,
    )
    in_placement = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default="true",
    )
    description = models.TextField(max_length=300)
    created = models.DateTimeField(default=timezone.now)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User,
        related_name="wholesalerReceiptOwner",
        on_delete=models.CASCADE,
    )

    def __str__(self):
        return self.product.title

    def save(self, *args, **kwargs):
        product = self.product

        if product and product.bar_code:
            self.bar_code = product.bar_code
        elif self.bar_code and product and not product.bar_code:
            product.bar_code = self.bar_code
            product.save(update_fields=["bar_code"])

        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # Price sync
    # ------------------------------------------------------------------
    def sync_price_from_discounts(self):
        """
        Recompute `final_unit_selling_price` and
        `discount_unit_selling_price` from the currently-active
        price discount (if any).

        Rules:
          - The most-recent active discount wins.
          - `offer_price` is authoritative, but if it is zero the
            discount's `percent` is used to derive it from the
            receipt's list price. The create view often forces
            `offer_price=0.00` and relies on `percent`.
          - When no discount is active, or the derived price is
            not actually lower than the list price, the receipt
            reverts to `unit_selling_price` with a zero discount.

        Only the two price fields are written — this avoids
        re-running the bar-code sync in `save()` and any other
        downstream side effects.
        """
        today = timezone.now().date()

        active = (
            self.wholesaler_price_discount_receipt
            .filter(
                is_active="true",
                start__lte=today,
                end__gte=today,
            )
            .order_by("-start", "-created")
            .first()
        )

        list_price = Decimal(str(self.unit_selling_price or "0.00"))

        if active is not None:
            offer = Decimal(str(active.offer_price or "0.00"))

            # Fall back to percent-derived pricing when the discount
            # view created the row with offer_price=0.00.
            if offer <= Decimal("0.00"):
                pct = Decimal(str(active.percent or "0.00"))
                if pct > Decimal("0.00"):
                    offer = (
                        list_price
                        * (Decimal("100.00") - pct)
                        / Decimal("100.00")
                    ).quantize(Decimal("0.01"))

            # Only write a change when the offer is a real reduction.
            # An expired / inactive row will fail the filter above,
            # and a zero-percent discount produces offer == list.
            if Decimal("0.00") < offer < list_price:
                self.final_unit_selling_price = offer
                self.discount_unit_selling_price = (
                    list_price - offer
                ).quantize(Decimal("0.01"))
                super().save(
                    update_fields=[
                        "final_unit_selling_price",
                        "discount_unit_selling_price",
                    ]
                )
                return

        # No active discount, or the discount is a no-op — revert.
        self.final_unit_selling_price = list_price
        self.discount_unit_selling_price = Decimal("0.00")
        super().save(
            update_fields=[
                "final_unit_selling_price",
                "discount_unit_selling_price",
            ]
        )


class WholesalerPriceDiscountBanners(EntityRelatedModel):
    """Model for uploading price discount banners"""

    wholesaler_price_discount = models.ForeignKey(
        "WholesalerPriceDiscounts",
        related_name="wholesaler_price_discount_banners",
        on_delete=models.CASCADE,
    )
    price_discount_banner = models.ImageField(
        upload_to=wholesaler_price_discount_image_upload_to,
    )
    thumbnail = AdvanceThumbnailField(
        source_field="price_discount_banners",
        upload_to="thumbnails/discounts/price",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Price Discount Banners"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.price_discount_banner:
            price_discount_banner = self.price_discount_banner
            if price_discount_banner.size > 0.1 * 1024 * 1024:
                self.price_discount_banner = compress_image(price_discount_banner)
        super(WholesalerPriceDiscountBanners, self).save(*args, **kwargs)

    def __str__(self):
        return self.wholesaler_price_discount.title


class WholesalerPriceDiscounts(EntityRelatedModel):
    """
    A dated promotional price on a specific WholesalerReceipts lot.

    The offer price is authoritative. On save, if the discount is
    currently active (start <= today <= end, is_active=True), the
    parent receipt's final_unit_selling_price is set to offer_price
    and discount_unit_selling_price is set to the per-unit delta.

    When a discount ends or is deactivated, the receipt reverts to
    its list price (unit_selling_price) on the next recompute.
    """

    wholesaler_receipt = models.ForeignKey(
        WholesalerReceipts,
        related_name="wholesaler_price_discount_receipt",
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=100)
    percent = models.DecimalField(max_digits=4, decimal_places=2)
    normal_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        help_text="List price snapshot at creation time.",
    )
    offer_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        help_text="Promotional price per unit.",
    )
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    price_discount_banners = models.ManyToManyField(
        WholesalerPriceDiscountBanners,
        related_name="price_discount_banners",
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User,
        related_name="wholesaler_price_discount_owner",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Wholesaler Price Discounts"
        indexes = [
            models.Index(fields=["wholesaler_receipt", "is_active"]),
            models.Index(fields=["start", "end"]),
        ]

    def __str__(self):
        return f"{self.title}"

    @property
    def is_currently_active(self) -> bool:
        today = timezone.now().date()
        return (
            self.is_active == "true"
            and self.start <= today <= self.end
        )

    def clean(self):
        super().clean()
        errors = {}

        if self.end and self.start and self.end < self.start:
            errors["end"] = "End date must be on or after start date."

        if self.offer_price is not None and self.normal_price:
            if self.offer_price > self.normal_price:
                errors["offer_price"] = (
                    "Offer price cannot exceed normal price."
                )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.wholesaler_receipt.sync_price_from_discounts()

    def delete(self, *args, **kwargs):
        receipt = self.wholesaler_receipt
        super().delete(*args, **kwargs)
        receipt.sync_price_from_discounts()


class WholesalerQuantityDiscountBanners(EntityRelatedModel):
    """Model for uploading quantity discount banners"""

    wholesaler_quantity_discount = models.ForeignKey(
        "WholesalerQuantityDiscounts",
        related_name="wholesaler_quantity_discount_banners",
        on_delete=models.CASCADE,
    )
    quantity_discount_banner = models.ImageField(
        upload_to=wholesaler_quantity_discount_image_upload_to,
    )
    thumbnail = AdvanceThumbnailField(
        source_field="quantity_discount_banner",
        upload_to="thumbnails/discounts/quantity",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Price Discount Banners"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.quantity_discount_banner:
            quantity_discount_banner = self.quantity_discount_banner
            if quantity_discount_banner.size > 0.1 * 1024 * 1024:
                self.quantity_discount_banner = compress_image(quantity_discount_banner)
        super(WholesalerQuantityDiscountBanners, self).save(*args, **kwargs)

    def __str__(self):
        return self.wholesaler_quantity_discount.title


class WholesalerQuantityDiscounts(EntityRelatedModel):
    """
    A dated buy-N-get-M-free offer on a specific WholesalerReceipts
    lot. Consumed by RetailerIndentItem for bonus calculation, and
    referenced by WholesalerCampaignItem.

    No price mutation here — quantity discounts only affect the
    free-unit count, not the unit price. Price effects flow through
    the indent item's bonus dilution.
    """

    wholesaler_receipt = models.ForeignKey(
        WholesalerReceipts,
        related_name="wholesaler_quantity_discount_receipt",
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=200)
    limit_quantity = models.IntegerField(
        default=0,
        help_text="Buy quantity per block. Order must reach this to earn the award.",
    )
    awarded_quantity = models.IntegerField(
        default=0,
        help_text="Free units granted per block purchased.",
    )
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    quantity_discount_banners = models.ManyToManyField(
        WholesalerQuantityDiscountBanners,
        related_name="quantity_discount_banners",
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="wholesale_quantity_discount_owner",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Wholesaler Quantity Discounts"
        indexes = [
            models.Index(fields=["wholesaler_receipt", "is_active"]),
            models.Index(fields=["start", "end"]),
        ]

    def __str__(self):
        return f"{self.title}"

    @property
    def is_currently_active(self) -> bool:
        today = timezone.now().date()
        return (
            self.is_active == "true"
            and self.start <= today <= self.end
        )

    def clean(self):
        super().clean()
        errors = {}

        if self.end and self.start and self.end < self.start:
            errors["end"] = "End date must be on or after start date."

        if self.limit_quantity is not None and self.limit_quantity <= 0:
            errors["limit_quantity"] = "Limit quantity must be greater than zero."

        if self.awarded_quantity is not None and self.awarded_quantity <= 0:
            errors["awarded_quantity"] = "Awarded quantity must be greater than zero."

        if (
            self.limit_quantity
            and self.awarded_quantity
            and self.awarded_quantity >= self.limit_quantity
        ):
            errors["awarded_quantity"] = (
                "Awarded quantity should be less than limit quantity."
            )

        if errors:
            raise ValidationError(errors)


# ---------------------------------------------------------------------------
# Campaign models
# ---------------------------------------------------------------------------

class WholesalerCampaignBanners(EntityRelatedModel):
    """
    Model for uploading campaign banners.

    Mirrors WholesalerPriceDiscountBanners / WholesalerQuantityDiscountBanners:
    a campaign owns many banners via an M2M, and each banner row points
    back at the campaign through the FK below.
    """

    wholesaler_campaign = models.ForeignKey(
        "WholesalerCampaign",
        related_name="wholesaler_campaign_banners",
        on_delete=models.CASCADE,
    )
    campaign_banner = models.ImageField(
        upload_to=wholesaler_campaign_image_upload_to,
    )
    thumbnail = AdvanceThumbnailField(
        source_field="campaign_banner",
        upload_to="thumbnails/campaigns",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Campaign Banners"

    def save(self, force_insert=False, force_update=False, using=None, *args, **kwargs):
        if self.campaign_banner:
            campaign_banner = self.campaign_banner
            if campaign_banner.size > 0.1 * 1024 * 1024:
                self.campaign_banner = compress_image(campaign_banner)
        super(WholesalerCampaignBanners, self).save(*args, **kwargs)

    def __str__(self):
        return self.wholesaler_campaign.title


class WholesalerCampaign(EntityRelatedModel):
    """
    Wholesaler-initiated offer: a curated set of receipts, each with
    optional price and quantity discounts, published to retailers with
    suggested quantities and projected earnings.

    Opting in seeds a RetailerIndent — the indent is the sole
    commitment path, campaign or not.

    Banners are stored as a many-to-many with WholesalerCampaignBanners,
    mirroring the price / quantity discount pattern.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", _("Draft")
        PUBLISHED = "PUBLISHED", _("Published")
        CLOSED = "CLOSED", _("Closed")
        CANCELLED = "CANCELLED", _("Cancelled")

    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    wholesaler = models.ForeignKey(
        "authentication.Entities",
        related_name="campaigns_published",
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=200)
    description = models.TextField(max_length=500, blank=True, default="")

    campaign_banners = models.ManyToManyField(
        WholesalerCampaignBanners,
        related_name="campaign_banners",
        blank=True,
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    start = models.DateField()
    end = models.DateField()
    is_active = models.CharField(
        max_length=10,
        choices=TRUE_FALSE_OPTIONS,
        default="true",
    )
    budget_cap = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Optional cap on total committed value, wholesaler-side.",
    )

    published_at = models.DateTimeField(null=True, blank=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Campaigns"
        indexes = [
            models.Index(fields=["wholesaler", "status"]),
            models.Index(fields=["start", "end"]),
            models.Index(fields=["status", "is_active", "start", "end"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(end__gte=F("start")),
                name="campaign_end_on_or_after_start",
            ),
        ]

    def __str__(self):
        return f"{self.wholesaler.title} — {self.title}"

    def clean(self):
        super().clean()
        errors = {}
        if self.start and self.end and self.end < self.start:
            errors["end"] = _("End date must be on or after start date.")
        if self.budget_cap is not None and self.budget_cap < 0:
            errors["budget_cap"] = _("Budget cap cannot be negative.")
        if errors:
            raise ValidationError(errors)

    @property
    def is_currently_active(self) -> bool:
        today = timezone.now().date()
        return (
            self.is_active == "true"
            and self.status == self.Status.PUBLISHED
            and self.start <= today <= self.end
        )

    def mark_published(self, *, save: bool = True) -> None:
        self.status = self.Status.PUBLISHED
        self.published_at = timezone.now()
        if save:
            self.save(update_fields=["status", "published_at", "updated"])

    def mark_closed(self, *, save: bool = True) -> None:
        self.status = self.Status.CLOSED
        if save:
            self.save(update_fields=["status", "updated"])


class WholesalerCampaignItem(EntityRelatedModel):
    """
    One receipt on a campaign.
    """

    campaign = models.ForeignKey(
        WholesalerCampaign,
        related_name="items",
        on_delete=models.CASCADE,
    )
    wholesaler_receipt = models.ForeignKey(
        "WholesalerReceipts",
        related_name="campaign_items",
        on_delete=models.CASCADE,
    )
    wholesaler_price_discount = models.ForeignKey(
        "WholesalerPriceDiscounts",
        related_name="campaign_items",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    wholesaler_quantity_discount = models.ForeignKey(
        "WholesalerQuantityDiscounts",
        related_name="campaign_items",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    suggested_quantity = models.IntegerField(default=0)
    per_retailer_limit = models.IntegerField(null=True, blank=True)
    retail_price_hint = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
    )

    published_unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Receipt's effective unit price at publication.",
    )
    published_bonus_quantity = models.IntegerField(
        default=0,
        help_text="Free units earned per block at publication.",
    )
    published_at = models.DateTimeField(null=True, blank=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Campaign Items"
        constraints = [
            models.UniqueConstraint(
                fields=["campaign", "wholesaler_receipt"],
                name="One receipt per campaign",
            ),
        ]
        indexes = [
            models.Index(fields=["wholesaler_receipt", "campaign"]),
        ]

    def __str__(self):
        return f"{self.wholesaler_receipt.product.title} on {self.campaign.title}"

    def clean(self):
        super().clean()

        if not self.wholesaler_receipt_id or not self.campaign_id:
            return

        errors = {}

        receipt = self.wholesaler_receipt
        pd = self.wholesaler_price_discount
        qd = self.wholesaler_quantity_discount

        if pd is not None:
            if pd.wholesaler_receipt_id != receipt.pk:
                errors["wholesaler_price_discount"] = _(
                    "Price discount does not belong to this receipt."
                )
            elif pd.end < self.campaign.start or pd.start > self.campaign.end:
                errors["wholesaler_price_discount"] = _(
                    "Price discount window does not overlap the campaign."
                )

        if qd is not None:
            if hasattr(qd, "wholesaler_receipt_id"):
                if (
                    qd.wholesaler_receipt_id is not None
                    and qd.wholesaler_receipt_id != receipt.pk
                ):
                    errors["wholesaler_quantity_discount"] = _(
                        "Quantity discount does not belong to this receipt."
                    )

        if self.suggested_quantity is not None and self.suggested_quantity < 0:
            errors["suggested_quantity"] = _("Suggested quantity cannot be negative.")

        if self.per_retailer_limit is not None and self.per_retailer_limit < 0:
            errors["per_retailer_limit"] = _("Per-retailer limit cannot be negative.")

        if errors:
            raise ValidationError(errors)

    def validate_windows_cover_campaign(self) -> None:
        """
        Strict publish-time check: every attached discount must be live for
        the whole campaign window, not merely overlap it.

        clean() allows partial overlap (assembling a draft). Call this
        explicitly before flipping status to PUBLISHED.
        """
        errors = {}
        for field, discount in (
            ("wholesaler_price_discount", self.wholesaler_price_discount),
            ("wholesaler_quantity_discount", self.wholesaler_quantity_discount),
        ):
            if discount is None:
                continue
            if discount.start > self.campaign.start:
                errors[field] = _(
                    "Discount starts %(disc_start)s, after campaign start %(camp_start)s."
                ) % {
                    "disc_start": discount.start,
                    "camp_start": self.campaign.start,
                }
            elif discount.end < self.campaign.end:
                errors[field] = _(
                    "Discount ends %(disc_end)s, before campaign end %(camp_end)s."
                ) % {
                    "disc_end": discount.end,
                    "camp_end": self.campaign.end,
                }
        if errors:
            raise ValidationError(errors)

    def project_for_quantity(self, quantity: int, markup_pct):
        from .services import project_item_for_quantity
        return project_item_for_quantity(self, quantity, markup_pct)


class WholesalerCampaignAudience(EntityRelatedModel):
    """
    Which retailers see this campaign, and their opt-in state.
    """

    campaign = models.ForeignKey(
        WholesalerCampaign,
        related_name="audience",
        on_delete=models.CASCADE,
    )
    retailer = models.ForeignKey(
        "authentication.Entities",
        related_name="campaigns_received",
        on_delete=models.CASCADE,
    )
    retailer_indent = models.ForeignKey(
        "retailers.RetailerIndent",
        related_name="campaign_optins",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    opted_in_at = models.DateTimeField(null=True, blank=True)
    opted_out_at = models.DateTimeField(null=True, blank=True)
    is_visible = models.CharField(
        max_length=10,
        choices=TRUE_FALSE_OPTIONS,
        default="true",
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        verbose_name_plural = "Wholesaler Campaign Audiences"
        constraints = [
            models.UniqueConstraint(
                fields=["campaign", "retailer"],
                name="One audience row per retailer per campaign",
            ),
        ]
        indexes = [
            models.Index(fields=["retailer", "is_visible"]),
            models.Index(fields=["campaign", "opted_in_at"]),
        ]

    def __str__(self):
        return f"{self.retailer.title} · {self.campaign.title}"

    def clean(self):
        super().clean()
        errors = {}

        if self.retailer_indent_id and self.retailer_id:
            indent_retailer_id = getattr(
                self.retailer_indent, "retailer_id", None
            )
            if (
                indent_retailer_id is not None
                and indent_retailer_id != self.retailer_id
            ):
                errors["retailer_indent"] = _(
                    "Linked indent belongs to a different retailer."
                )

        if errors:
            raise ValidationError(errors)

    @property
    def has_opted_in(self) -> bool:
        if self.opted_in_at is None:
            return False
        if self.opted_out_at is None:
            return True
        return self.opted_in_at > self.opted_out_at

    def opt_in(self, *, save: bool = True) -> None:
        self.opted_in_at = timezone.now()
        if save:
            self.save(update_fields=["opted_in_at", "updated"])

    def opt_out(self, *, save: bool = True) -> None:
        self.opted_out_at = timezone.now()
        if save:
            self.save(update_fields=["opted_out_at", "updated"])


class CommitType(models.TextChoices):
    CASH = "CASH", _("Paid in cash")
    CREDIT = "CREDIT", _("Credit approved")
    PLACEMENT = "PLACEMENT", _("Placement approved")
    FACILITY = "FACILITY", _("Facility approved")


# ---------------------------------------------------------------------------
# Retailer orders
# ---------------------------------------------------------------------------

class RetailerOrders(EntityRelatedModel):
    """
    An order a retailer places on a wholesaler.
    """

    ORDER_ORIGIN_CHOICES = (
        ("RETAILER", "RETAILER"),
        ("STAFF", "STAFF"),
    )
    DELIVERY_CHOICES = (
        ("SELF", "SELF"),
        ("COURIER", "COURIER"),
    )
    TERMS_CHOICES = (
        ("CASH", "CASH"),
        ("CONTRACT", "CONTRACT"),
        ("CREDIT", "CREDIT"),
        ("FACILITY", "FACILITY"),
        ("PLACEMENT", "PLACEMENT"),
    )
    ORDER_TYPE_CHOICES = (
        ("EMERGENCY", "EMERGENCY"),
        ("NORMAL", "NORMAL"),
    )
    ORDER_STATUS_CHOICES = (
        ("COMPLETED", "COMPLETED"),
        ("SUBMITTED", "SUBMITTED"),
        ("PROCESSING", "PROCESSING"),
        ("DISPATCHED", "DISPATCHED"),
        ("RECEIVED", "RECEIVED"),
        ("CANCELLED", "CANCELLED"),
    )

    retailer = models.ForeignKey(
        Entities, related_name="wholesalerOrderRetailer",
        on_delete=models.CASCADE,
    )
    wholesaler = models.ForeignKey(
        Entities, related_name="wholesalerOrderWholesaler",
        on_delete=models.CASCADE,
    )
    facilitator = models.ForeignKey(
        Entities, related_name="wholesalerOrderFacilitator",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    retailer_indent = models.ForeignKey(
        "retailers.RetailerIndent",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="retailer_orders",
        help_text="Indent this order was generated from, if any.",
    )
    draft_id = models.CharField(max_length=100, null=True, blank=True)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="reatiler_order_payment_method",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    document_number = models.ForeignKey(
        DocumentNumbers,
        related_name="retailer_order_document_number",
        on_delete=models.CASCADE, null=True, blank=True,
    )

    shipping_amount = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2,
    )
    order_discount_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )
    order_gross_price_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )
    final_price = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )
    final_price_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )
    order_tax_total = models.DecimalField(
        max_digits=7, default=0.00, decimal_places=2, null=True, blank=True,
    )

    order_terms = models.CharField(max_length=20, choices=TERMS_CHOICES)
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES)
    status = models.CharField(
        max_length=20, choices=ORDER_STATUS_CHOICES, default="SUBMITTED",
    )
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    is_delivered = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    employee = models.ForeignKey(
        Employees, related_name="employee_creating_order",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    delivered_by = models.ForeignKey(
        Users, related_name="wholesalerOrderDeliveredBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_processed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    processed_by = models.ForeignKey(
        Users, related_name="wholesalerOrderProcessedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_packed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    packed_by = models.ForeignKey(
        Users, related_name="wholesalerOrderPackedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_received = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    reference_number = models.CharField(
        max_length=56, null=True, blank=True,
    )
    received_by = models.ForeignKey(
        Users, related_name="wholesalerOrderReceivedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_approved = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    approved_by = models.ForeignKey(
        Users, related_name="wholesalerOrderApprovedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    is_dispatched = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true",
    )
    dispatched_by = models.ForeignKey(
        Users, related_name="wholesalerOrderDispatchedBy",
        on_delete=models.CASCADE, null=True, blank=True,
    )

    paid_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    packed_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)

    order_origin = models.CharField(
        max_length=20, choices=ORDER_ORIGIN_CHOICES,
    )
    delivery_method = models.CharField(
        max_length=20, choices=DELIVERY_CHOICES,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, related_name="wholesaler_order_owner",
        on_delete=models.CASCADE,
    )
    committed_by_entity = models.ForeignKey(
        "authentication.Entities",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="committed_orders",
        help_text="The wholesaler entity that committed this order.",
    )
    commit_type = models.CharField(
        max_length=20,
        choices=CommitType.choices,
        null=True, blank=True,
        help_text="How the wholesaler is approving this order.",
    )
    committed_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Set on commit. Triggers inventory reservation.",
    )
    committed_by_user = models.ForeignKey(
        "authentication.Users",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="committed_orders_by_user",
    )
    commit_note = models.CharField(
        max_length=256, blank=True, default="",
    )
    is_committed = models.CharField(
        max_length=10,
        choices=TRUE_FALSE_OPTIONS,
        default="false",
        help_text="Denormalized flag for fast filtering.",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "Retailer Orders"

    def __str__(self):
        return f"{self.retailer.title}-{self.id}"

    def recalculate(self, save=True):
        """
        Recompute order-level totals from the line items.

        `final_price_total` is the plain sum of every item's
        `item_price_total`. Shipping, discounts, and tax are not
        added again here — they are already reflected per line by
        the item serializer.

        `order_discount_total` and `order_tax_total` are still kept
        for reporting, but they no longer feed `final_price_total`.
        """
        agg = self.retailer_order.aggregate(
            gross=Sum("item_price_total"),
            discount=Sum("item_price_discount_total"),
            tax=Sum("item_tax_total"),
            net=Sum("item_net_price_total"),
        )
        self.order_gross_price_total = _q(agg["gross"] or 0)
        self.order_discount_total = _q(agg["discount"] or 0)
        self.order_tax_total = _q(agg["tax"] or 0)

        # final_price_total = sum(item_price_total)
        self.final_price_total = self.order_gross_price_total

        if save:
            super().save(update_fields=[
                "order_gross_price_total",
                "order_discount_total",
                "order_tax_total",
                "final_price_total",
                "updated",
            ])

    def allocate_shipping_to_receipts(self, save=True):
        from retailers.models import RetailerReceipts

        receipts = list(
            RetailerReceipts.objects.filter(
                retailer_order=self, is_active="true",
            )
        )
        if not receipts:
            return

        line_values = []
        total_value = Decimal("0.00")
        for r in receipts:
            value = _q(
                (r.received_unit_quantity or 0) * (r.unit_buying_price or 0)
            )
            line_values.append((r, value))
            total_value += value

        shipping = _q(self.shipping_amount or 0)

        if total_value <= 0 or shipping <= 0:
            for r, _ in line_values:
                r.allocated_shipping_total = Decimal("0.00")
                r.allocated_shipping_per_unit = Decimal("0.00")
            if save:
                RetailerReceipts.objects.bulk_update(
                    [r for r, _ in line_values],
                    ["allocated_shipping_total", "allocated_shipping_per_unit"],
                )
            return

        largest = max(line_values, key=lambda pair: pair[1])[0]
        running_total = Decimal("0.00")

        for r, value in line_values:
            if r is largest:
                share = _q(shipping - running_total)
            else:
                share = _q(shipping * (value / total_value))
                running_total += share

            r.allocated_shipping_total = share
            r.allocated_shipping_per_unit = (
                _q(share / r.received_unit_quantity)
                if r.received_unit_quantity else Decimal("0.00")
            )

        if save:
            RetailerReceipts.objects.bulk_update(
                [r for r, _ in line_values],
                ["allocated_shipping_total", "allocated_shipping_per_unit"],
            )

    @property
    def actual_lead_time_days(self):
        if self.approved_at and self.received_at:
            return max(0, (self.received_at - self.approved_at).days)
        return None


class RetailerOrderItems(EntityRelatedModel):
    """
    One committed line on a retailer order.
    """

    retailer_order = models.ForeignKey(
        RetailerOrders,
        related_name="retailer_order",
        on_delete=models.CASCADE,
    )
    retailer_indent_item = models.ForeignKey(
        "retailers.RetailerIndentItem",
        related_name="order_items_generated_from",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The indent line this order item was generated from.",
    )
    wholesaler_receipt = models.ForeignKey(
        WholesalerReceipts,
        related_name="order_item_wholesaler_receipt",
        on_delete=models.CASCADE,
    )

    purchased_quantity = models.IntegerField(default=0)
    discount_quantity = models.IntegerField(default=0)
    total_quantity = models.IntegerField(default=0)

    item_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_final_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_final_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    unit_of_issue = models.CharField(
        max_length=20,
        choices=UNITS_OF_ISSUE_CHOICES,
        default="Pack",
    )

    item_tax = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_tax_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_counter_price_discount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_counter_price_discount_amount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_counter_price_discount_amount_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00,
    )
    item_price_discount = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_price_discount_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_net_price = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )
    item_net_price_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
    )

    intended_retail_unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="What the retailer intends to sell this at once received.",
    )
    intended_retail_unit_price_source = models.CharField(
        max_length=32,
        default="markup",
        help_text="'rrp' or 'markup' — matches the indent's pricing_source.",
    )

    stakeholders = models.ManyToManyField(Stakes)
    is_received = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    is_issued = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false",
    )
    item_pending_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
    )
    item_paid_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00,
    )
    employee = models.ForeignKey(
        Employees,
        related_name="employee_creating_order_item",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateField(auto_now_add=True)
    updated = models.DateField(auto_now=True)
    owner = models.ForeignKey(
        User,
        related_name="wholesaler_order_item_owner",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Retailer Order Items"
        constraints = [
            models.UniqueConstraint(
                fields=["retailer_order", "wholesaler_receipt"],
                name="One item per order",
            )
        ]

    def __str__(self) -> str:
        return f"{self.wholesaler_receipt.product.title}"

    def recalculate(self, save=True):
        qty = Decimal(str(self.purchased_quantity or 0))
        final_unit = _q(self.item_final_price or 0)
        list_unit = _q(self.item_price or final_unit)
        discount_unit = _q(list_unit - final_unit)

        self.item_price_total = _q(list_unit * qty)
        self.item_price_discount = discount_unit
        self.item_price_discount_total = _q(discount_unit * qty)
        self.item_net_price = final_unit
        self.item_net_price_total = _q(final_unit * qty)

        tax_unit = _q(self.item_tax or 0)
        self.item_tax_total = _q(tax_unit * qty)

        total_qty = Decimal(str(self.total_quantity or self.purchased_quantity or 0))
        shipping_unit = Decimal("0.00")
        self.item_final_price_total = _q(
            (final_unit + tax_unit + shipping_unit) * total_qty
        )

        if save:
            self.save(recalculate=False)

    @property
    def product_title(self):
        if self.wholesaler_receipt and self.wholesaler_receipt.product:
            return self.wholesaler_receipt.product.title
        return ""

    @property
    def wholesaler_title(self):
        r = self.wholesaler_receipt
        if r and r.received_from:
            return r.received_from.title
        return ""

    @property
    def line_margin(self):
        if (
            self.intended_retail_unit_price is None
            or self.item_net_price_total is None
        ):
            return None
        return _q(
            (self.intended_retail_unit_price * Decimal(str(self.total_quantity or 0)))
            - self.item_net_price_total
        )

    # ------------------------------------------------------------------
    # Persistence hooks
    #
    # Two orthogonal concerns:
    #
    #   1. `recalculate` — recompute THIS row's derived fields
    #      (item_price_total, item_net_price_total, etc.). Only runs
    #      when the caller explicitly asks for it, because some
    #      writes (e.g. the batch close_retailer_indent) set those
    #      fields directly.
    #
    #   2. `refresh_parent` — after we persist, ask the parent
    #      RetailerOrders to recompute its totals from all its items.
    #      Defaults to True so any single-item mutation keeps the
    #      order's final_price_total in sync. Batch flows pass
    #      `refresh_parent=False` and call `order.recalculate()`
    #      themselves once, to avoid an aggregate query per item.
    # ------------------------------------------------------------------

    def save(self, *args, **kwargs):
        refresh_parent = kwargs.pop("refresh_parent", True)

        if kwargs.pop("recalculate", False):
            self.recalculate(save=False)

        super().save(*args, **kwargs)

        if refresh_parent and self.retailer_order_id:
            parent = (
                RetailerOrders.objects
                .filter(pk=self.retailer_order_id)
                .first()
            )
            if parent is not None:
                parent.recalculate(save=True)

    def delete(self, *args, **kwargs):
        # Capture the parent id BEFORE the row disappears; the FK
        # reference goes with it.
        parent_id = self.retailer_order_id

        result = super().delete(*args, **kwargs)

        if parent_id:
            parent = (
                RetailerOrders.objects
                .filter(pk=parent_id)
                .first()
            )
            if parent is not None:
                parent.recalculate(save=True)

        return result


class RetailerOrderPayments(EntityRelatedModel):
    PAYMENT_STATUS_CHOICES = (
        ("INITIATED", "INITIATED"),
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )
    retailer_order = models.ForeignKey(
        RetailerOrders, related_name="wholesalerOrders", on_delete=models.CASCADE
    )
    payout_account = models.ForeignKey(
        "payments.PayoutAccounts",
        related_name="entity_payout_account",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    commission_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payout_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="wholesalerPaymentMethd",
        on_delete=models.CASCADE,
    )
    narrative = models.CharField(max_length=300, null=True, blank=True)
    pay_in_reference_number = models.CharField(max_length=120, null=True, blank=True)
    telco = models.CharField(max_length=120, null=False, blank=False)
    psp_reference_number = models.CharField(max_length=120, null=False, blank=False)
    provider_reference_number = models.CharField(max_length=120, null=True, blank=True)
    description = models.CharField(max_length=120, null=True, blank=True)
    currency = models.CharField(max_length=120, null=False, blank=False)
    pay_out_reference_number = models.CharField(max_length=120, null=True, blank=True)
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )
    is_paid = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default="true",
    )
    is_settled = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default="true",
    )
    commission_paid = models.CharField(
        max_length=50,
        choices=TRUE_FALSE_OPTIONS,
        default="false",
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        "authentication.Users",
        related_name="wholesalerPaymentOwner",
        on_delete=models.CASCADE,
    )

    def save(self, *args, **kwargs):
        self.retailer_order.pay_in_reference_number = self.pay_in_reference_number
        super(RetailerOrderPayments, self).save(*args, **kwargs)

# wholesalers/models.py

class WholesalerReceiptReturns(EntityRelatedModel):
    """
    Wholesaler-side record of a return initiated by a retailer.

    Lifecycle:
        PENDING   — retailer initiated. Retailer-side StockAdjustment
                    already exists (created at initiate). Wholesaler
                    has not decided yet.
        ACCEPTED  — wholesaler took the goods back.
        REJECTED  — wholesaler declined. Retailer-side adjustment
                    stays in place (goods physically left). Wholesaler
                    reconciles their own books later via a manual
                    adjustment if needed.
        CANCELLED — either party cancelled while PENDING. The service
                    reverses the retailer-side initiating adjustment.
    """

    class ReturnReasonOptions(models.TextChoices):
        EXPIRED = "EXPIRED", _("Expired stock")
        NEAR_EXPIRY = "NEAR_EXPIRY", _("Near-expiry return")
        DAMAGED = "DAMAGED", _("Damaged in transit or storage")
        WRONG_ITEM = "WRONG_ITEM", _("Wrong item supplied")
        SHORT_DATED = "SHORT_DATED", _("Short-dated on delivery")
        QUALITY = "QUALITY", _("Quality issue")
        OVER_ORDERED = "OVER_ORDERED", _("Over-ordered")
        RECALL = "RECALL", _("Product recall")
        OTHER = "OTHER", _("Other")

    class ReturnTypeOptions(models.TextChoices):
        REFUND = "REFUND", _("Refund")
        EXCHANGE = "EXCHANGE", _("Exchange / credit note")
        REPLACEMENT = "REPLACEMENT", _("Replacement stock")

    class ReturnStatusOptions(models.TextChoices):
        PENDING   = "PENDING",   _("Awaiting wholesaler decision")
        ACCEPTED  = "ACCEPTED",  _("Accepted by wholesaler")
        REJECTED  = "REJECTED",  _("Rejected by wholesaler")
        CANCELLED = "CANCELLED", _("Cancelled before decision")

    # ---- FKs ----
    retailer_order = models.ForeignKey(
        RetailerOrders,
        related_name="wholesaler_receipt_returns",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    retailer_order_item = models.ForeignKey(
        RetailerOrderItems,
        related_name="wholesaler_receipt_returns",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    retailer_entity = models.ForeignKey(
        Entities,
        related_name="wholesaler_returns_from",
        on_delete=models.CASCADE,
    )
    wholesaler_entity = models.ForeignKey(
        Entities,
        related_name="wholesaler_returns_to",
        on_delete=models.CASCADE,
    )
    retailer_receipt = models.ForeignKey(
        "retailers.RetailerReceipts",
        related_name="wholesaler_returns_from_receipt",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text=_(
            "The retailer's lot being returned. The paired "
            "StockAdjustment decrements this lot at initiate time."
        ),
    )
    wholesaler_receipt = models.ForeignKey(
        WholesalerReceipts,
        related_name="wholesaler_receipt_returns",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    initiating_adjustment = models.OneToOneField(
        "retailers.StockAdjustments",
        related_name="generated_return",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text=_(
            "Retailer-side adjustment created alongside this return "
            "at initiate time. Reversed on cancel; left in place on "
            "reject."
        ),
    )
    product = models.ForeignKey(
        Products,
        on_delete=models.CASCADE,
    )

    draft_id = models.CharField(max_length=256, null=True, blank=True)
    document_number = models.ForeignKey(
        DocumentNumbers,
        related_name="wholesaler_receipt_return_document_number",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    reference_number = models.CharField(max_length=100, null=True, blank=True)

    quantity = models.IntegerField(default=0)
    unit_of_return = models.CharField(
        max_length=20,
        choices=UNITS_OF_ISSUE_CHOICES,
        default="Pack",
    )

    unit_price_paid = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text=_("Frozen from retailer_order_item.item_final_price at creation."),
    )
    unit_price_refunded = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
    )
    restocking_fee_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
    )
    total_refund_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0.00,
    )

    reason = models.CharField(
        max_length=30,
        choices=ReturnReasonOptions.choices,
        default=ReturnReasonOptions.OTHER,
    )
    justification = models.CharField(max_length=256)
    return_type = models.CharField(
        max_length=20,
        choices=ReturnTypeOptions.choices,
        default=ReturnTypeOptions.REFUND,
    )

    status = models.CharField(
        max_length=30,
        choices=ReturnStatusOptions.choices,
        default=ReturnStatusOptions.PENDING,
    )

    # Single free-text field for the wholesaler's decision note.
    # Replaces confirmation_notes.
    decision_notes = models.TextField(blank=True)

    # ---- Actors ----
    employee = models.ForeignKey(
        Employees,
        related_name="employee_creating_wholesaler_return",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    accepted_by = models.ForeignKey(
        Users,
        related_name="wholesaler_return_accepted_by",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    rejected_by = models.ForeignKey(
        Users,
        related_name="wholesaler_return_rejected_by",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    cancelled_by = models.ForeignKey(
        Users,
        related_name="wholesaler_return_cancelled_by",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    # ---- Timestamps ----
    accepted_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="wholesaler_return_owner",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name_plural = "Wholesaler Receipt Returns"
        indexes = [
            models.Index(fields=["wholesaler_entity", "status"]),
            models.Index(fields=["retailer_entity", "status"]),
            models.Index(fields=["wholesaler_receipt", "status"]),
            models.Index(fields=["status", "created"]),
            models.Index(fields=["reason", "created"]),
        ]

    def __str__(self) -> str:
        return f"Return {self.id} — {self.product.title} × {self.quantity}"

    # ---- Derived values ----

    @property
    def net_refund_per_unit(self) -> Decimal:
        return _q(
            (self.unit_price_refunded or 0)
            * (Decimal("1") - (self.restocking_fee_percent or 0) / Decimal("100"))
        )

    def recalculate(self, save=True):
        self.total_refund_amount = _q(
            self.net_refund_per_unit * Decimal(str(self.quantity or 0))
        )
        if save:
            super().save(update_fields=["total_refund_amount", "updated"])

    # ---- Validation ----

    def clean(self):
        super().clean()
        errors = {}

        if self.quantity is None or self.quantity <= 0:
            errors["quantity"] = "Quantity must be greater than zero."

        if errors:
            raise ValidationError(errors)

    # ---- Persistence ----

    def save(self, *args, **kwargs):
        is_new = self._state.adding

        if is_new:
            if not self.product_id and self.retailer_receipt_id:
                self.product_id = self.retailer_receipt.product_id

            if (
                self.unit_price_paid in (None, Decimal("0.00"))
                and self.retailer_order_item_id
            ):
                self.unit_price_paid = (
                    self.retailer_order_item.item_final_price
                    or Decimal("0.00")
                )

            if (
                self.unit_price_refunded in (None, Decimal("0.00"))
                and self.unit_price_paid
            ):
                self.unit_price_refunded = self.unit_price_paid

        else:
            # Product and quantity are frozen once a decision is made.
            if self.status in (
                self.ReturnStatusOptions.ACCEPTED,
                self.ReturnStatusOptions.REJECTED,
            ):
                original = (
                    WholesalerReceiptReturns.objects
                    .only("product_id", "quantity")
                    .get(pk=self.pk)
                )
                if original.product_id != self.product_id:
                    raise ValidationError(
                        "Product cannot be changed after decision."
                    )
                if original.quantity != self.quantity:
                    raise ValidationError(
                        "Quantity cannot be changed after decision. "
                        "Issue a compensating return instead."
                    )

        self.total_refund_amount = _q(
            self.net_refund_per_unit * Decimal(str(self.quantity or 0))
        )

        super().save(*args, **kwargs)