from rest_framework import serializers
from expenses.models import WishLists, WishListProducts
from . import models




class WishListProductsSerializer(serializers.ModelSerializer):
    product_title = serializers.SerializerMethodField(read_only=True)
    product_price = serializers.SerializerMethodField(read_only=True)
    product_price_total = serializers.SerializerMethodField(read_only=True)
    vendor_title = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = WishListProducts
        fields = ['id', 'wishlist', 'product','units_per_pack','product_title','product_price','product_price_total','vendor_title', 'quantity', 'created', 'updated']
        read_only_fields = ['id', 'created', 'updated']

    def create(self, validated_data):
        return WishListProducts.objects.create(**validated_data)

    def update(self, instance, validated_data):
        instance.quantity = validated_data.get('quantity', instance.quantity)
        instance.save()
        return 
    def get_product_title(self, obj):
        if obj.product and obj.product.product:
            return obj.product.product.title
        return None
    def get_units_per_pack(self, obj):
        if obj.product and obj.product.product:
            return obj.product.product.units_per_pack
        return None
    
    def get_vendor_title(self, obj):
        if obj.vendor:
            return obj.vendor.title
        return None
    
    def get_product_price(self, obj):
        if obj.product :
            return obj.product.unit_selling_price
        return None
    
    def get_product_price_total(self, obj):
        if obj.product :
            return float(obj.product.unit_selling_price)*float(obj.quantity)
        return None

    

    
class WishListSerializer(serializers.ModelSerializer):

    products = serializers.SerializerMethodField( read_only=True)
    class Meta:
        model = WishLists
        fields = ['id', 'title','products', 'is_closed','limit_amount', 'owner', 'created', 'updated']
        read_only_fields = ['id', 'created', 'updated']

    def create(self, validated_data):
        return WishLists.objects.create(**validated_data)

    def update(self, instance, validated_data):
        instance.title = validated_data.get('title', instance.title)
        instance.limit = validated_data.get('limit', instance.limit)
        instance.save()
        return instance
    def get_products(self, obj):
        """
        Returns the products associated with the wish list.
        """
        products = WishListProducts.objects.filter(wishlist=obj)
        return WishListProductsSerializer(products, many=True).data
        


class EntityExpenseCategoriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.EntityExpenseCategories
        fields = ['id', 'title', 'description', 'created_by', 'created', 'updated']
        read_only_fields = ['id', 'created', 'updated']


class EntityExpensesSerializer(serializers.ModelSerializer):
    expense_category_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.EntityExpense
        fields = ['id','draft_id', 'expense_category','expense_date', 'expense_category_title', 'amount', 'description', 'owner', 'created', 'updated']
        read_only_fields = ['id', 'created', 'updated']
    
    def get_expense_category_title(self, obj):
        if obj.expense_category:
            return obj.expense_category.title
        return None
    

