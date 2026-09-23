import uuid
from django.db import models
from django.conf import settings



class OrganizationRelatedModel(models.Model):
    """Abstract class used by models that belong to a entity"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "authentication.Organizations",
        related_name="%(class)s",
        on_delete=models.CASCADE,
        editable=True,
    )

    class Meta:
        abstract = True
        

# core/models.py
#
# Base abstract models shared across the project.

# core/models.py
#
# Base abstract models shared across the project.

import uuid

from django.conf import settings
from django.db import models

from core.current_request import (
    get_current_entity,
    get_current_user,
)


class EntityRelatedModel(models.Model):
    """Abstract class used by models that belong to an entity."""

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    entity = models.ForeignKey(
        "authentication.Entities",
        related_name="%(app_label)s_%(class)s_set",
        on_delete=models.CASCADE,
        editable=True,
        db_index=True,
    )

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        editable=False,
        related_name="%(app_label)s_%(class)s_owned",
        db_index=True,
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        extra_fields = []

        # Auto-default entity from the logged-in user's entity.
        if self.entity_id is None:
            entity = get_current_entity()
            if entity is not None:
                self.entity = entity
                extra_fields.append("entity")

        # Auto-default owner from the logged-in user.
        if self.owner_id is None:
            user = get_current_user()
            if user is not None:
                self.owner = user
                extra_fields.append("owner")

        if update_fields is not None and extra_fields:
            kwargs["update_fields"] = list(update_fields) + extra_fields

        super().save(*args, **kwargs)