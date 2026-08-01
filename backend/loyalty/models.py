from django.db import models
from core.models import EntityRelatedModel
from authentication.models import Users

# Create your models here.


class Rating(EntityRelatedModel):
    user = models.ForeignKey(
        Users, related_name="rating_user", on_delete=models.CASCADE)
    comment = models.TextField(blank=True, null=True)
    rating = models.PositiveIntegerField(choices=(
        (1, '1 star'), (2, '2 stars'), (3, '3 stars'), (4, '4 stars'), (5, '5 stars')))
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('entity', 'user')

    def __str__(self):
        return f"{self.user}'s {self.rating}-star rating for {self.entity}"
