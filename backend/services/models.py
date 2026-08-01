from django.db import models
import uuid
from django.utils.translation import gettext_lazy as _
from django.contrib.auth import get_user_model

# Create your models here.
User = get_user_model()

class TimeToResultUnitOptions(models.TextChoices):
    MINUTES = "MINUTES", _("MINUTES")
    HOURS = "HOURS", _("HOURS")
    DAYS = "DAYS", _("DAYS")
    WEEKS = "WEEKS", _("WEEKS")

class SampleHandlingTemparatureOptions(models.TextChoices):
    REFRIGERATE = "REFRIGERATE", _("REFRIGERATE")
    ROOM = "ROOM", _("ROOM")
    FROZEN = "FROZEN", _("FROZEN")

class LaboratoryServices(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=256, unique=True)
    sample = models.CharField(max_length=256)
    other_requirements = models.CharField(max_length=256,null=True,blank=True)
    cause_for_rejection = models.CharField(max_length=256,null=True,blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    time_to_result_unit = models.CharField(
        verbose_name=_("Time To Result Unit"),
        choices=TimeToResultUnitOptions.choices,
        max_length=12,

    )
    sample_handling_temparature = models.CharField(
        verbose_name=_("Time To Result Unit"),
        choices=SampleHandlingTemparatureOptions.choices,
        max_length=100,

    )
    time_to_result=models.IntegerField()
    owner = models.ForeignKey(
        User, related_name="laboratory_service_creator", on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(LaboratoryServices, self).save(*args, **kwargs)


class RadiologyServices(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=256, unique=True)
    description = models.TextField(max_length=300, null=True, blank=True)

    owner = models.ForeignKey(
        User, related_name="radiology_service_creator", on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(RadiologyServices, self).save(*args, **kwargs)


class PhysiotherapyServices(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=256, unique=True)
    description = models.TextField(max_length=300, null=True, blank=True)

    owner = models.ForeignKey(
        User, related_name="physiotherapy_service_creator", on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(PhysiotherapyServices, self).save(*args, **kwargs)

# class GeneralServices(models.Model):
#     id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
#     title = models.CharField(max_length=256, unique=True)
#     description = models.TextField(max_length=300, null=True, blank=True)

#     owner = models.ForeignKey(
#         User, related_name="general_service_creator", on_delete=models.CASCADE,null=True,blank=True)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)

#     def __str__(self) -> str:
#         return self.title

#     def save(self, *args, **kwargs):
#         if self.title:
#             self.title = self.title.upper()
#         super(GeneralServices, self).save(*args, **kwargs)


