import uuid
from django.db import models


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
        

class EntityRelatedModel(models.Model):
    """Abstract class used by models that belong to a entity"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(
        "authentication.Entities",
        related_name="%(class)s",
        on_delete=models.CASCADE,
        editable=True,
    )

    class Meta:
        abstract = True
