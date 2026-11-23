# credit/models.py — WaziPOS Credit ("Lipa Baadaye"): lenders (Bank / Facilitator
# entities) pay a buyer's order on the spot; the buyer repays the lender in 7, 14 or
# 28 days by mobile money straight into the lender's own wallet.

import uuid

from django.conf import settings
from django.db import models


SEGMENTS = (
    ("RETAILER_B2B", "Retailers buying from wholesalers"),
    ("WHOLESALER_B2B", "Wholesalers buying from distributors"),
    ("CUSTOMER", "Customers buying from shops"),
    ("FOOD", "Diners at restaurants"),
)


class LenderProfiles(models.Model):
    """A Bank / Facilitator entity's lending set-up, approved by WaziPOS before it lends."""

    STATUSES = (("PENDING", "Awaiting approval"), ("ACTIVE", "Lending"), ("PAUSED", "Paused by the lender"), ("SUSPENDED", "Suspended by WaziPOS"))
    REGULATORS = (("CBK_BANK", "CBK - bank"), ("CBK_MFB", "CBK - microfinance bank"), ("CBK_DCP", "CBK - digital credit provider"), ("SASRA", "SASRA - SACCO"), ("OTHER", "Other"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.OneToOneField("authentication.Entities", on_delete=models.CASCADE, related_name="lender_profile")
    status = models.CharField(max_length=10, choices=STATUSES, default="PENDING", db_index=True)
    display_name = models.CharField(max_length=120)
    regulator = models.CharField(max_length=10, choices=REGULATORS, default="CBK_DCP")
    licence_number = models.CharField(max_length=80)
    segments = models.JSONField(default=list, blank=True)

    # Price: flat interest for the period, an admin fee (excise duty is charged on fees).
    rate_7 = models.DecimalField(max_digits=5, decimal_places=2, default=1.5)
    rate_14 = models.DecimalField(max_digits=5, decimal_places=2, default=3.0)
    rate_28 = models.DecimalField(max_digits=5, decimal_places=2, default=5.0)
    admin_fee_pct = models.DecimalField(max_digits=5, decimal_places=2, default=1.0)
    admin_fee_min = models.DecimalField(max_digits=10, decimal_places=2, default=50)
    excise_pct = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    late_fee_pct_week = models.DecimalField(max_digits=5, decimal_places=2, default=1.0)
    grace_days = models.PositiveSmallIntegerField(default=3)

    # Risk appetite.
    min_amount = models.DecimalField(max_digits=12, decimal_places=2, default=500)
    max_amount = models.DecimalField(max_digits=12, decimal_places=2, default=100_000)
    max_exposure_per_borrower = models.DecimalField(max_digits=12, decimal_places=2, default=150_000)
    min_score = models.PositiveSmallIntegerField(default=40)
    auto_collect = models.BooleanField(default=True)  # send the repayment prompt on the due date
    terms = models.TextField(null=True, blank=True)

    # The float that pays sellers instantly (held in the WaziPOS collection account).
    float_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_disbursed = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_lenders")
    approved_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.display_name} ({self.status})"


class FloatMovements(models.Model):
    KINDS = (("TOPUP", "Top-up"), ("DISBURSE", "Paid an order"), ("WITHDRAW", "Withdrawn to the lender"), ("REVERSAL", "Reversed"))
    STATUSES = (("PENDING", "Pending"), ("SUCCESS", "Done"), ("FAILED", "Failed"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lender = models.ForeignKey(LenderProfiles, on_delete=models.CASCADE, related_name="float_movements")
    kind = models.CharField(max_length=10, choices=KINDS)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUSES, default="PENDING", db_index=True)
    reference = models.CharField(max_length=40, null=True, blank=True, db_index=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    facility = models.ForeignKey("Facilities", on_delete=models.SET_NULL, null=True, blank=True, related_name="float_movements")
    note = models.CharField(max_length=200, null=True, blank=True)
    by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]


class Facilities(models.Model):
    """One loan: a lender paid one order; the borrower repays by the due date."""

    STATUSES = (("ACTIVE", "Active"), ("OVERDUE", "Overdue"), ("REPAID", "Repaid"), ("DEFAULTED", "Defaulted"), ("WRITTEN_OFF", "Written off"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=24, unique=True)
    lender = models.ForeignKey(LenderProfiles, on_delete=models.PROTECT, related_name="facilities")
    segment = models.CharField(max_length=20, choices=SEGMENTS, db_index=True)
    borrower_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="credit_facilities")
    borrower_entity = models.ForeignKey("authentication.Entities", on_delete=models.PROTECT, null=True, blank=True, related_name="credit_facilities")
    seller = models.ForeignKey("authentication.Entities", on_delete=models.PROTECT, related_name="credit_sales")
    order_kind = models.CharField(max_length=20)
    order_id = models.CharField(max_length=64, db_index=True)
    order_reference = models.CharField(max_length=64, blank=True, default="")

    principal = models.DecimalField(max_digits=12, decimal_places=2)
    interest = models.DecimalField(max_digits=12, decimal_places=2)
    admin_fee = models.DecimalField(max_digits=12, decimal_places=2)
    excise = models.DecimalField(max_digits=12, decimal_places=2)
    late_fees = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_due = models.DecimalField(max_digits=12, decimal_places=2)
    amount_repaid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tenor_days = models.PositiveSmallIntegerField()
    apr = models.DecimalField(max_digits=7, decimal_places=2, default=0)

    status = models.CharField(max_length=12, choices=STATUSES, default="ACTIVE", db_index=True)
    disbursed_at = models.DateTimeField()
    due_date = models.DateField(db_index=True)
    repaid_at = models.DateTimeField(null=True, blank=True)
    consent_via = models.CharField(max_length=10, default="APP")  # APP (borrower in the app) | OTP (seller's staff, SMS code)
    consent_phone = models.CharField(max_length=20, null=True, blank=True)
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    reminders = models.JSONField(default=list, blank=True)  # keys already sent: D-3, D0, D+1, D+3, D+7
    last_late_fee_on = models.DateField(null=True, blank=True)
    auto_collect_sent_on = models.DateField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]
        constraints = [models.UniqueConstraint(fields=["order_kind", "order_id"], name="one_facility_per_order")]

    @property
    def outstanding(self):
        return max(self.total_due - self.amount_repaid, 0)

    def __str__(self):
        return f"{self.reference} {self.lender_id} to {self.borrower_user_id} ({self.status})"


class Repayments(models.Model):
    STATUSES = (("PENDING", "Waiting for PIN"), ("SUCCESS", "Received"), ("FAILED", "Failed"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(Facilities, on_delete=models.CASCADE, related_name="repayments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    phone = models.CharField(max_length=20)
    reference = models.CharField(max_length=40, unique=True)
    psp_reference = models.CharField(max_length=80, null=True, blank=True)
    lender_account = models.CharField(max_length=80)  # the lender's wallet the checkout paid into
    status = models.CharField(max_length=10, choices=STATUSES, default="PENDING", db_index=True)
    source = models.CharField(max_length=10, default="APP")  # APP | AUTO (due-date prompt)
    payer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    paid_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]


class CreditConsents(models.Model):
    """A seller's staff offered credit to a buyer: the buyer approves with an SMS code."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code_hash = models.CharField(max_length=128)
    borrower_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    borrower_entity = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    lender = models.ForeignKey(LenderProfiles, on_delete=models.CASCADE, related_name="+")
    order_kind = models.CharField(max_length=20)
    order_id = models.CharField(max_length=64)
    tenor_days = models.PositiveSmallIntegerField()
    principal = models.DecimalField(max_digits=12, decimal_places=2)
    total_due = models.DecimalField(max_digits=12, decimal_places=2)
    phone = models.CharField(max_length=20)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
