# billing/models.py — WaziPOS Tokens (pay per use, replaces the monthly subscription).
#
#   TokenWallet  one per business: balance, trial end, alert state
#   TokenLedger  every movement, signed: TOPUP / BONUS / USAGE / TRIAL (usage at 0
#                during the free month) / COVERED (usage while an old paid
#                subscription still runs, or past the monthly ceiling) / ADJUST.
#                `idem_key` is unique: an order payment or a top-up is counted once
#                however many times its signal or reconciler fires.

import uuid

from django.db import models

from authentication.models import Entities, Users


class TokenWallet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.OneToOneField(Entities, related_name="token_wallet", on_delete=models.CASCADE)
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    trial_started_at = models.DateTimeField(null=True, blank=True)
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    has_topped_up = models.BooleanField(default=False)
    low_balance_at = models.DecimalField(max_digits=10, decimal_places=2, default=100)
    last_low_alert_at = models.DateTimeField(null=True, blank=True)
    last_empty_alert_at = models.DateTimeField(null=True, blank=True)
    trial_reminders = models.JSONField(default=list, blank=True)  # e.g. ["D5", "D1", "END"]
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Token wallet"

    def __str__(self):
        return f"{self.entity.title}: {self.balance} tokens"


class TokenLedger(models.Model):
    class Kind(models.TextChoices):
        TOPUP = "TOPUP", "Top-up"
        BONUS = "BONUS", "Bonus"
        USAGE = "USAGE", "Usage"
        TRIAL = "TRIAL", "Free trial usage"
        COVERED = "COVERED", "Covered usage"
        ADJUST = "ADJUST", "Adjustment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wallet = models.ForeignKey(TokenWallet, related_name="entries", on_delete=models.CASCADE)
    entity = models.ForeignKey(Entities, related_name="token_entries", on_delete=models.CASCADE)
    kind = models.CharField(max_length=12, choices=Kind.choices, db_index=True)
    meter = models.CharField(max_length=30, blank=True, default="", db_index=True)
    tokens = models.DecimalField(max_digits=14, decimal_places=2)  # signed: + in, - out
    list_tokens = models.DecimalField(max_digits=14, decimal_places=2, default=0)  # what it would cost
    balance_after = models.DecimalField(max_digits=14, decimal_places=2)
    order_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    order_ref = models.CharField(max_length=64, blank=True, default="", db_index=True)
    reference = models.CharField(max_length=120, blank=True, default="")
    idem_key = models.CharField(max_length=160, unique=True, null=True, blank=True)
    note = models.CharField(max_length=255, blank=True, default="")
    payment = models.ForeignKey(
        "subscriptions.SubscriptionPayment", related_name="token_entries", on_delete=models.SET_NULL, null=True, blank=True,
    )
    created_by = models.ForeignKey(Users, related_name="token_entries", on_delete=models.SET_NULL, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created",)
        indexes = [models.Index(fields=["entity", "created"]), models.Index(fields=["entity", "kind", "created"])]

    def __str__(self):
        return f"{self.entity_id} {self.kind} {self.tokens}"
