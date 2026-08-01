
from django.contrib.gis.db import models
from django.contrib.auth import get_user_model
import uuid

Users = get_user_model()

TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)

class Locations(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    point = models.PointField(null=True, blank=True, srid=4326)
    entity = models.OneToOneField("authentication.Entities", on_delete=models.CASCADE)
    farness = models.CharField(max_length=100)
    country = models.ForeignKey(
        "cities_light.Country", on_delete=models.SET_NULL, null=True, blank=True
    )
    city = models.ForeignKey(
        "cities_light.City", on_delete=models.SET_NULL, null=True, blank=True
    )

    def __str__(self) -> str:
        return self.entity.title

    class Meta:
        verbose_name_plural = "Entity Locations"



class BodaLocations(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    point = models.PointField(null=True, blank=True, srid=4326)
    boda = models.ForeignKey("transport.SaccoPersonnel", on_delete=models.CASCADE)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE,null=True, blank=True)
    farness = models.CharField(max_length=100)
    country = models.ForeignKey(
        "cities_light.Country", on_delete=models.SET_NULL, null=True, blank=True
    )
    city = models.ForeignKey(
        "cities_light.City", on_delete=models.SET_NULL, null=True, blank=True
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    def __str__(self) -> str:
        return f"{self.boda.user.first_name} {self.boda.user.phone}"

    class Meta:
        verbose_name_plural = "Boda Locations"

class WifiLocations(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=256)
    point = models.PointField(null=True, blank=True, srid=4326)
    entity = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE,related_name="wifi_location_entity")
    owner = models.ForeignKey(Users, on_delete=models.CASCADE,null=True, blank=True,related_name="wifi_location_owner")
    farness = models.CharField(max_length=100)
    country = models.ForeignKey(
        "cities_light.Country", on_delete=models.SET_NULL, null=True, blank=True
    )
    city = models.ForeignKey(
        "cities_light.City", on_delete=models.SET_NULL, null=True, blank=True
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    def __str__(self) -> str:
        return f"{self.boda.user.first_name} {self.boda.user.phone}"

    class Meta:
        verbose_name_plural = "Wifi Installation Locations"


class PropertyLocations(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    point = models.PointField(null=True, blank=True, srid=4326)
    property = models.ForeignKey("properties.Property", on_delete=models.CASCADE)
    entity = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE,related_name="property_location_entity")
    owner = models.ForeignKey(Users, on_delete=models.CASCADE,null=True, blank=True,related_name="property_location_owner")
    farness = models.CharField(max_length=100)
    country = models.ForeignKey(
        "cities_light.Country", on_delete=models.SET_NULL, null=True, blank=True
    )
    city = models.ForeignKey(
        "cities_light.City", on_delete=models.SET_NULL, null=True, blank=True
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    def __str__(self) -> str:
        return f"{self.property.title} {self.property.town}"

    class Meta:
        verbose_name_plural = "Property Locations"
