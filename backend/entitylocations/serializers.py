from authentication.models import Entities,EntityImages,EntityLicences
from django.contrib.gis.geos import Point
from rest_framework import serializers
from authentication.serializers import EntitySerializer,EntityImagesSerializer,EntityLicencesSerializer,CategoriesSerializer, GenericUserSerializer
from properties.serializers import PropertySerializer
from entitylocations.models import Locations,BodaLocations
from django.core.serializers.json import DjangoJSONEncoder
from django.utils.six import text_type
from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from authentication.models import Categories
from loyalty.models import Rating
from transport.models import Vehicles
from . import models


class EntitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Entities
        fields = "__all__"


class LocationsGeofeatureSerializer(GeoFeatureModelSerializer):
    entity_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        geo_field = "point"
        model = models.Locations
        fields = ('point', 'entity',"entity_title")
        read_only_fields = ('id', 'farness',)

    def get_entity_title(self,obj):
        if obj.entity:
            return obj.entity.title
        else:
            return ""
class LocationsSerializer(serializers.ModelSerializer):
    categories = serializers.SerializerMethodField(read_only=True)
    followers = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    licences = serializers.SerializerMethodField(read_only=True)
    # entity_details = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    entity_type = serializers.SerializerMethodField(read_only=True)
    is_pharmacy = serializers.SerializerMethodField(read_only=True)
    rating = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Locations
        fields = ('point', 'rating', 'farness', 'is_pharmacy','categories','followers','images','licences',
                  'entity','entity_title','entity_type')
        read_only_fields = ('id', 'farness', 'is_pharmacy','entty_title','entity_type')

    # def get_entity_details(self, obj):
    #     if obj.entity:
    #         return EntitySerializer(obj.entity, many=False).data
    def get_images(self, obj):
        images=[]
        if obj.entity:
            images= EntityImages.objects.filter(entity=obj.entity);
            return EntityImagesSerializer(images, many=True,context=self.context).data
        else:
            return []
    def get_licences(self, obj):
        licences=[]
        if obj.entity:
            licences= EntityLicences.objects.filter(entity=obj.entity);
            return EntityLicencesSerializer(licences, many=True,context=self.context).data
    def get_categories(self, obj):
        categories=[]
        if obj.entity:
            categories= obj.entity.categories.all();
            return CategoriesSerializer(categories, many=True).data
        else:
            return []
    def get_followers(self, obj):
        followers=[]
        if obj.entity:
            followers= obj.entity.followers.all();
            return GenericUserSerializer(followers, many=True,context=self.context).data
        else:
            return []
    def get_rating(self, obj):
        rating = 0
        reviewsCount = 0
        ratings = 0
        reviews = None
        if Rating.objects.filter(entity=obj.entity).exists():
            reviewsCount = Rating.objects.filter(
                entity=obj.entity).count()
            reviews = Rating.objects.filter(entity=obj.entity).all()

            for review in reviews:
                ratings += review.rating
            rating = ratings / reviewsCount

        return rating

    def get_is_pharmacy(self, obj):
        category = None
        if Categories.objects.filter(title='PHARMACY').exists():
            category = Categories.objects.filter(title='PHARMACY').first()

        if category in obj.entity.categories.all():

            return 'true'
        else:
            return 'false'
    def get_entity_title(self,obj):
        if obj.entity:
            return obj.entity.title
        else:
            return ""
    def get_entity_type(self,obj):
        if obj.entity:
            return obj.entity.entity_type
        else:
            return ""
        

class BodaLocationsGeofeatureSerializer(GeoFeatureModelSerializer):
    boda_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        geo_field = "point"
        model = models.BodaLocations
        fields = ('point', 'boda',"boda_title",
                  "is_active"
                  )
        read_only_fields = ('id', 'farness',)

    def get_boda_title(self,obj):
        if obj.boda.user:
            return f"{obj.boda.user.first_name} -{obj.boda.user.last_name} - {obj.boda.user.phone}"
        else:
            return ""
        

class BodaLocationsSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField(read_only=True)
    phone = serializers.SerializerMethodField(read_only=True)
    email = serializers.SerializerMethodField(read_only=True)
    vehicle = serializers.SerializerMethodField(read_only=True)
    rating = serializers.SerializerMethodField(read_only=True)


    class Meta:
        model = models.BodaLocations
        fields = ('id','point', 'title', 'farness', 'phone','email','owner','vehicle','rating')
        read_only_fields = ('id', 'farness', 'title','phone','email','owner','vehicle','rating')

    def get_title(self,obj):
        if obj.boda.user:
            return f"{obj.boda.user.first_name} {obj.boda.user.last_name} - {obj.boda.user.phone}"
        else:
            return ""
    def get_phone(self,obj):
        if obj.boda.user:
            return obj.boda.user.phone
        else:
            return ""
    def get_email(self,obj):
        if obj.boda.user:
            return obj.boda.user.email
        else:
            return ""
    def get_vehicle(self,obj):
        vehicle =None
        if Vehicles.objects.filter(driver=obj.boda).exists():
            vehicle=Vehicles.objects.filter(driver=obj.boda).first()
            return vehicle.registration
        else:
            return ""
    def get_rating(self,obj):
            return "5"
    

class WifiLocationsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.WifiLocations
        fields = ('id','point', 'title', 'farness', 'owner')
        read_only_fields = ('id', 'farness', 'title','owner')


class PropertyLocationsSerializer(serializers.ModelSerializer):
    # property = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.PropertyLocations
        fields = ('id','point',  'farness', 'owner',)
        read_only_fields = ('id', 'farness','owner',)

    def get_property(self,obj):
        if obj.property:
            return PropertySerializer(obj.property, context=self.context, many=False).data
        else:
            return None