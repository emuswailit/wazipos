# onboarding/models.py — self sign-up: a business opened by its owner waits for
# WaziPOS to approve it. Businesses created by admins or agents have no row here
# and are not affected.
#
#   SETUP     created, owner still completing the checklist
#   PENDING   submitted; a WaziPOS admin reviews it
#   APPROVED  live — the free month starts (billing.services.start_trial)
#   REJECTED  sent back with a reason; the owner fixes it and submits again

import uuid

from django.db import models

from authentication.models import Entities, Users


class EntityApprovals(models.Model):
    class Status(models.TextChoices):
        SETUP = "SETUP", "Setting up"
        PENDING = "PENDING", "Waiting for approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Changes needed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.OneToOneField(Entities, related_name="approval", on_delete=models.CASCADE)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SETUP, db_index=True)
    created_by = models.ForeignKey(Users, related_name="entity_signups", on_delete=models.SET_NULL, null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    submissions = models.PositiveIntegerField(default=0)
    checklist = models.JSONField(default=dict, blank=True)  # snapshot at submit
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(Users, related_name="entity_decisions", on_delete=models.SET_NULL, null=True, blank=True)
    reason = models.TextField(blank=True, default="")  # why it was sent back
    admin_note = models.TextField(blank=True, default="")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Entity approval"
        ordering = ("-created",)

    def __str__(self):
        return f"{self.entity.title}: {self.status}"
