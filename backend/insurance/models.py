# insurance/models.py — WaziPOS Cover: policies people opt in to, and their claims.

import uuid

from django.conf import settings
from django.db import models


class Policies(models.Model):
    PRODUCTS = (
        ("SAFE_PARCEL", "SafeParcel"),
        ("RIDER_SHIELD", "RiderShield"),
        ("DUKA_COVER", "DukaCover"),
        ("TRADE_GUARD", "TradeGuard"),
        ("TILL_GUARD", "TillGuard"),
    )
    STATUSES = (
        ("INTEREST", "Pre-registered (sales not open yet)"),
        ("AWAITING_PAYMENT", "Awaiting payment"),
        ("ACTIVE", "Active"),
        ("EXPIRED", "Expired"),
        ("CANCELLED", "Cancelled"),
        ("FAILED", "Payment failed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy_number = models.CharField(max_length=24, unique=True)
    product = models.CharField(max_length=20, choices=PRODUCTS, db_index=True)
    plan = models.CharField(max_length=20, null=True, blank=True)
    holder = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="insurance_policies")
    entity = models.ForeignKey("authentication.Entities", on_delete=models.SET_NULL, null=True, blank=True, related_name="insurance_policies")
    status = models.CharField(max_length=20, choices=STATUSES, default="AWAITING_PAYMENT", db_index=True)

    premium = models.DecimalField(max_digits=12, decimal_places=2)
    cover_amount = models.DecimalField(max_digits=14, decimal_places=2)
    excess = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    inputs = models.JSONField(default=dict, blank=True)
    quote = models.JSONField(default=dict, blank=True)

    # What it covers (an order's delivery, a credit sale…)
    subject_kind = models.CharField(max_length=30, null=True, blank=True)
    subject_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    subject_label = models.CharField(max_length=200, null=True, blank=True)
    source = models.CharField(max_length=40, null=True, blank=True)  # where they opted in: checkout, duty, hub…

    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    pay_reference = models.CharField(max_length=40, null=True, blank=True, db_index=True)
    pay_phone = models.CharField(max_length=20, null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]
        indexes = [models.Index(fields=["holder", "product", "status"])]

    def __str__(self):
        return f"{self.policy_number} {self.product} ({self.status})"


class Claims(models.Model):
    STATUSES = (
        ("SUBMITTED", "Submitted"),
        ("IN_REVIEW", "In review"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("PAID", "Paid"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    claim_number = models.CharField(max_length=24, unique=True)
    policy = models.ForeignKey(Policies, on_delete=models.CASCADE, related_name="claims")
    claimant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="insurance_claims")
    incident = models.CharField(max_length=30)
    incident_at = models.DateTimeField()
    loss_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    nights = models.PositiveIntegerField(default=0)
    description = models.TextField()
    police_reference = models.CharField(max_length=60, null=True, blank=True)
    evidence = models.FileField(upload_to="insurance/claims/", null=True, blank=True)
    estimate = models.JSONField(default=dict, blank=True)
    payable_estimate = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    approved_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUSES, default="SUBMITTED", db_index=True)
    decision_note = models.TextField(null=True, blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="insurance_decisions")
    paid_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]

    def __str__(self):
        return f"{self.claim_number} on {self.policy_id} ({self.status})"
