# stocktakes/models.py
#
# Stock taking as a WaziPOS service to vendors (retailers, wholesalers,
# restaurants, hotels). An agent books it — one-off or repeating every N days —
# with an agreed fee, the days, and their stocktakers (authentication.AgentOnboarders)
# at a daily rate. Stocktakers count blind (they never see book figures) on those
# days only. The count is compared with the vendor's book stock; the vendor pays
# the fee by mobile money (subscriptions.SubscriptionPayment, purpose STOCK_TAKE —
# the agent's commission comes from it) and its super admin approves which counted
# lines become stock adjustments. Stocktakers are paid for the days they worked.
# Logic: stocktakes/services.py.

import uuid
from decimal import Decimal

from django.db import models
from django.utils.translation import gettext_lazy as _


class StockTakes(models.Model):
    class Kind(models.TextChoices):
        ONE_OFF = "ONE_OFF", _("One-off")
        RECURRING = "RECURRING", _("Repeats")

    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", _("Scheduled")
        COUNTING = "COUNTING", _("Counting")
        SUBMITTED = "SUBMITTED", _("Count submitted, awaiting the vendor's review")
        APPLIED = "APPLIED", _("Reviewed by the vendor")
        CANCELLED = "CANCELLED", _("Cancelled")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey("authentication.Entities", related_name="stock_takes", on_delete=models.CASCADE)
    agent = models.ForeignKey("authentication.Agents", related_name="stock_takes", on_delete=models.PROTECT)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.ONE_OFF)
    # Repeating stock takes: the next one is booked this many days after this one starts.
    every_days = models.PositiveSmallIntegerField(null=True, blank=True)
    series = models.ForeignKey("self", related_name="occurrences", on_delete=models.SET_NULL, null=True, blank=True)
    # The days stocktakers may count (inclusive). Outside them they have no access.
    starts_on = models.DateField()
    ends_on = models.DateField()
    # Agreed with the vendor; paid like a subscription. The agent earns their commission % of it.
    fee = models.DecimalField(max_digits=12, decimal_places=2)
    persons = models.PositiveSmallIntegerField(default=1)
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Paid to each stocktaker per day worked")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SCHEDULED, db_index=True)
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey("authentication.Users", related_name="stock_takes_booked", on_delete=models.SET_NULL, null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey("authentication.Users", related_name="stock_takes_reviewed", on_delete=models.SET_NULL, null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Stock take"
        verbose_name_plural = "Stock takes"
        ordering = ["-starts_on", "-created"]

    def __str__(self):
        return f"{self.entity} {self.starts_on} to {self.ends_on} ({self.status})"


class StockTakeAssignments(models.Model):
    """A stocktaker on a stock take, and what they are owed: days worked x daily rate."""

    class Payout(models.TextChoices):
        PENDING = "PENDING", _("Owed")
        PAID = "PAID", _("Paid out")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stock_take = models.ForeignKey(StockTakes, related_name="assignments", on_delete=models.CASCADE)
    onboarder = models.ForeignKey("authentication.AgentOnboarders", related_name="stock_take_assignments", on_delete=models.PROTECT)
    # Set from the days they recorded counts when the count is submitted; the agent can correct it.
    days_worked = models.PositiveSmallIntegerField(default=0)
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payout_status = models.CharField(max_length=10, choices=Payout.choices, default=Payout.PENDING, db_index=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey("authentication.Users", related_name="stocktaker_payouts_made", on_delete=models.SET_NULL, null=True, blank=True)
    payout_reference = models.CharField(max_length=120, blank=True, default="")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Stocktaker assignment"
        verbose_name_plural = "Stocktaker assignments"
        unique_together = [("stock_take", "onboarder")]

    @property
    def amount_due(self):
        return Decimal(self.days_worked or 0) * Decimal(self.daily_rate or 0)

    def __str__(self):
        return f"{self.onboarder} on {self.stock_take_id}: {self.days_worked} day(s)"


class StockTakeCounts(models.Model):
    """
    One counted item. kind PRODUCT: a retailer's / wholesaler's product (its lots
    are adjusted on approval); SUPPLY: a restaurant's supply item; DRINK: a bar drink.
    book_quantity is the system figure when it was counted.
    """

    class Kind(models.TextChoices):
        PRODUCT = "PRODUCT", _("Product")
        SUPPLY = "SUPPLY", _("Supply")
        DRINK = "DRINK", _("Bar drink")

    class Decision(models.TextChoices):
        PENDING = "PENDING", _("Awaiting review")
        APPLIED = "APPLIED", _("Stock set to the count")
        KEPT = "KEPT", _("Book stock kept")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stock_take = models.ForeignKey(StockTakes, related_name="counts", on_delete=models.CASCADE)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    product = models.ForeignKey("products.Products", related_name="stock_take_counts", on_delete=models.SET_NULL, null=True, blank=True)
    supply = models.ForeignKey("restaurants.RestaurantStock", related_name="stock_take_counts", on_delete=models.SET_NULL, null=True, blank=True)
    drink = models.ForeignKey("restaurants.BarInventory", related_name="stock_take_counts", on_delete=models.SET_NULL, null=True, blank=True)
    title = models.CharField(max_length=256)
    unit = models.CharField(max_length=40, blank=True, default="")
    book_quantity = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    counted_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    counted_by = models.ForeignKey("authentication.Users", related_name="stock_take_counts", on_delete=models.SET_NULL, null=True, blank=True)
    onboarder = models.ForeignKey("authentication.AgentOnboarders", related_name="stock_take_counts", on_delete=models.SET_NULL, null=True, blank=True)
    note = models.CharField(max_length=200, blank=True, default="")
    decision = models.CharField(max_length=10, choices=Decision.choices, default=Decision.PENDING)
    decided_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Stock take count"
        verbose_name_plural = "Stock take counts"
        ordering = ["title"]

    @property
    def variance(self):
        return Decimal(self.counted_quantity or 0) - Decimal(self.book_quantity or 0)

    def __str__(self):
        return f"{self.title}: {self.counted_quantity} (book {self.book_quantity})"


class StockTakeFoundItems(models.Model):
    """
    Goods on the premises that are NOT on the business's books: no matching item,
    no shop label, or a different batch. Often an employee's own stock sold in the
    shop. Recorded by stocktakers, shown to the vendor, never added to stock.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stock_take = models.ForeignKey(StockTakes, related_name="found_items", on_delete=models.CASCADE)
    title = models.CharField(max_length=256)
    barcode = models.CharField(max_length=64, blank=True, default="")
    batch_number = models.CharField(max_length=64, blank=True, default="")
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    # The price on the item / shelf, if any (what it would sell for).
    price_seen = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    where_found = models.CharField(max_length=120, blank=True, default="")
    note = models.CharField(max_length=200, blank=True, default="")
    photo = models.ImageField(upload_to="stock_takes/found/", null=True, blank=True)
    recorded_by = models.ForeignKey("authentication.Users", related_name="stock_take_found_items", on_delete=models.SET_NULL, null=True, blank=True)
    onboarder = models.ForeignKey("authentication.AgentOnboarders", related_name="stock_take_found_items", on_delete=models.SET_NULL, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Stock found off the books"
        verbose_name_plural = "Stock found off the books"
        ordering = ["-created"]

    def __str__(self):
        return f"{self.title} x{self.quantity} (off the books)"
