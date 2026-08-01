from rest_framework import serializers
from . import models


class OrganizationStoreSerializer(serializers.ModelSerializer):
    """
    Organization Store serializer
    """

    class Meta:
        model = models.OrganizationStore
        fields = ('id', 'organization',  'title','description',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')
        
class CountySubStoreSerializer(serializers.ModelSerializer):
    """
    County Sub Store serializer
    """
    class Meta:
        model = models.OrganizationSubStore
        fields = ('id',  'entity','title','organization_store',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')
        
class EntityStoreSerializer(serializers.ModelSerializer):
    """
    Entity Store serializer
    """
    class Meta:
        model = models.EntityStore
        fields = ('id',   'entity','title','organization_store','organization_sub_store','description',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')
class EntitySubStoreSerializer(serializers.ModelSerializer):
    """
    Entity Sub Store serializer
    """
    class Meta:
        model = models.EntitySubStore
        fields = ('id',   'entity','title','entity_store','department','description',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')

class EntitySubStoreReceiptsSerializer(serializers.ModelSerializer):
    """
    Entity Sub Store serializer
    """
    units_per_pack = serializers.SerializerMethodField()
    preparation = serializers.SerializerMethodField()
    preparation_title = serializers.SerializerMethodField()
    product_title = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    class Meta:
        model = models.EntitySubStoreReceipts
        fields = ('id',   'entity',
                  'received_pack_quantity',
                  'current_pack_quantity',
                  'received_unit_quantity',
                  'current_unit_quantity',
                  'pack_buying_price',
                  'pack_selling_price',
                  'unit_buying_price',
                  'unit_selling_price',
                  'entity_sub_store',
                  'product',
                  "product_title",
                  "preparation",
                  "preparation_title",
                  "units_per_pack",
                  "manufacture_date",
                  "expiry_date",
                  "key",
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')
        
    def get_preparation(self,obj):
        if obj.product.preparation:
            return obj.product.preparation.id
        else:
            return ""
        
    def get_units_per_pack(self,obj):
        if obj.product.units_per_pack:
            return obj.product.units_per_pack
        else:
            return ""
    def get_preparation_title(self,obj):
        if obj.product.preparation:
            return obj.product.preparation.title
        else:
            return ""
        
    def get_product_title(self,obj):
        if obj.product:
            return obj.product.title
        else:
            return ""
    def get_key(self,obj):
        return obj.id

        

class EntityStoreReceiptsSerializer(serializers.ModelSerializer):
    """
    Entity Sub Store serializer
    """
    class Meta:
        model = models.EntityStoreReceipts
        fields = ('id',   'entity','received_pack_quantity','current_pack_quantity','entity_store','product',
                   'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 
                            'created', 'updated')
        
        
        
