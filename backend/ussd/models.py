from django.db import models
import uuid

# Create your models here.
class Dials(models.Model):
    class Meta:
        verbose_name_plural = "USSD Dials"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.IntegerField()
    msisdn = models.CharField(max_length=28, null=True, blank=True)
    last_input = models.CharField(max_length=48, null=True, blank=True)
    all_input = models.CharField(max_length=48, null=True, blank=True)
    level = models.CharField(max_length=48, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.phone