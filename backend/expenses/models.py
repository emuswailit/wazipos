from django.db import models
from authentication.models import Users
from core.models import EntityRelatedModel
from core.constants import TRUE_FALSE_OPTIONS, RECURRENCE_PERIOD_OPTIONS

# Create your models here.


class EntityExpenseCategories(EntityRelatedModel):
    title = models.CharField(max_length=256, unique=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    is_recurrent = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    recurrence_period = models.CharField(
        max_length=50, choices=RECURRENCE_PERIOD_OPTIONS, null=True, blank=True
    )
    created_by = models.ForeignKey(
        Users,
        related_name="entity_expense_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        Users,
        related_name="entity_expense_updater",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(EntityExpenseCategories, self).save(*args, **kwargs)


class EntityExpenses(EntityRelatedModel):
    draft_id = models.CharField(
        max_length=256, null=True, blank=True,
    )
    expense_category = models.ForeignKey(
        EntityExpenseCategories,
        related_name="entity_expense_category",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    expense_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, )
    description = models.TextField(max_length=300, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="entity_expense_subscription_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)