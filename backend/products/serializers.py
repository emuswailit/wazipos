import uuid
from authentication.models import Entities
from drugs.models import Preparation

# from wholesalers.models import WholesalerReceipts
from . import models
from rest_framework import exceptions, serializers
from authentication.serializers import (
    CategoriesSerializer,
    EntitySerializer,
    SubCategoriesSerializer,
)
from drugs.serializers import PreparationSerializer

# from retailers.models import RetailerReceipts, RetailerVariations


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ProductImages
        fields = (
            "id",
            "image",
            "thumbnail",
            "owner",
            "product",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("product", "thumbnail", "owner", "entity")


# class ProductsWolesalerReceiptsDisplaySerializer(serializers.ModelSerializer):
#     images = serializers.SerializerMethodField(read_only=True)
#     units_per_pack = serializers.SerializerMethodField(read_only=True)
#     company = serializers.SerializerMethodField(read_only=True)
#     current_stock_balance = serializers.SerializerMethodField(read_only=True)
#     product_title = serializers.SerializerMethodField(read_only=True)
#     preparation = serializers.SerializerMethodField(read_only=True)
#     preparation_title = serializers.SerializerMethodField(read_only=True)
#     company_product_relationship = serializers.SerializerMethodField(
#         read_only=True)
#     wholesaler_price_discount = serializers.SerializerMethodField(
#         read_only=True)
#     wholesaler_price_discount_title = serializers.SerializerMethodField(
#         read_only=True)
#     wholesaler_quantity_discount = serializers.SerializerMethodField(
#         read_only=True)
#     wholesaler_quantity_discount_title = serializers.SerializerMethodField(
#         read_only=True
#     )
#     # vendor_details = serializers.SerializerMethodField(read_only=True)
#     category = serializers.SerializerMethodField(read_only=True)

#     class Meta:
#         model = WholesalerReceipts
#         fields = (
#             "id",
#             "entity",
#             "url",
#             "pack_quantity",
#             "pack_selling_price",
#             "manufacture_date",
#             "expiry_date",
#             "category",
#             "company",
#             "units_per_pack",
#             "images",
#             "product",
#             "product_title",
#             "preparation",
#             "preparation_title",
#             "current_stock_balance",
#             "company_product_relationship",
#             "wholesaler_price_discount",
#             "wholesaler_price_discount_title",
#             "wholesaler_quantity_discount",
#             "wholesaler_quantity_discount_title",
#         )

#     # def get_vendor_details(self, obj):
#     #     if obj.entity:
#     #         if Entities.objects.filter(id=uuid.UUID(str(obj.entity))).exists():
#     #             vendor = Entities.objects.filter(id=uuid.UUID(str(obj.entity))).first()
#     #             return EntitySerializer(vendor, context=self.context).data
#     #         else:
#     #             return None

#     def get_category(self, obj):
#         if obj.product:
#             return obj.product.category.title
#         else:
#             return ""

#     def get_company(self, obj):
#         if Entities.objects.filter(id=uuid.UUID(str(obj.entity))).exists():
#             vendor = Entities.objects.filter(
#                 id=uuid.UUID(str(obj.entity))).first()
#             return vendor.title
#         return "-"

#     def get_company_product_relationship(self, obj):
#         return "wholesaler"

#     def get_manufacture_date(self, obj):
#         return obj.manufacture_date

#     def get_units_per_pack(self, obj):
#         return obj.product.units_per_pack

#     def get_product_title(self, obj):
#         return obj.product.title

#     def get_wholesaler_price_discount(self, obj):
#         if obj.wholesaler_price_discount:
#             return obj.wholesaler_price_discount.id
#         else:
#             return None

#     def get_wholesaler_price_discount_title(self, obj):
#         if obj.wholesaler_price_discount:
#             return obj.wholesaler_price_discount.title
#         else:
#             return "N/A"

#     def get_wholesaler_quantity_discount(self, obj):
#         if obj.wholesaler_quantity_discount:
#             return obj.wholesaler_quantity_discount.id
#         else:
#             return None

#     def get_wholesaler_quantity_discount_title(self, obj):
#         if obj.wholesaler_quantity_discount:
#             return obj.wholesaler_quantity_discount.title
#         else:
#             return "N/A"

#     def get_preparation(self, obj):
#         preparation = ""
#         if obj.product.preparation:
#             preparation = obj.product.preparation.id
#         return preparation

#     def get_preparation_title(self, obj):
#         preparation_title = ""
#         if obj.product.preparation:
#             preparation_title = obj.product.preparation.title
#         return preparation_title

#     def get_images(self, obj):
#         images = []
#         if models.ProductImages.objects.filter(product=obj.product).exists():
#             images = models.ProductImages.objects.filter(
#                 product=obj.product).all()
#         return ProductImageSerializer(images, context=self.context, many=True).data

#     def get_current_stock_balance(self, obj):
#         return "''"


class ProductsWolesalerReceiptsSerializer(serializers.ModelSerializer):
    images = serializers.SerializerMethodField(read_only=True)
    product_title = serializers.SerializerMethodField(read_only=True)
    preparation = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    company = serializers.SerializerMethodField(read_only=True)
    company_product_relationship = serializers.SerializerMethodField(read_only=True)
    category = serializers.SerializerMethodField(read_only=True)
    manufacture_date = serializers.SerializerMethodField(read_only=True)
    expiry_date = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    pack_selling_price = serializers.SerializerMethodField(read_only=True)
    current_stock_balance = serializers.SerializerMethodField(read_only=True)
    wholesaler_receipts = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Products
        fields = (
            "id",
            "url",
            "category",
            "bar_code",
            "expiry_date",
            "manufacture_date",
            "units_per_pack",
            "preparation",
            "preparation_title",
            "pack_selling_price",
            "company",
            "company_product_relationship",
            "images",
            "product_title",
            "current_stock_balance",
            "wholesaler_receipts",
        )

    def get_wholesaler_receipts(self, obj):
        wholesaler_receipts = None
        wholesaler_receipts = WholesalerReceipts.objects.filter(product=obj)
        return ProductsWolesalerReceiptsDisplaySerializer(
            wholesaler_receipts, context=self.context, many=True
        ).data

    def get_category(self, obj):
        if obj.category:
            return obj.category.title
        else:
            return "-"

    def get_expiry_date(self, obj):
        return "-"

    def get_product_title(self, obj):
        return obj.title

    def get_preparation(self, obj):
        preparation = ""
        if obj.preparation:
            preparation = obj.preparation.id
        return preparation

    def get_preparation_title(self, obj):
        preparation = ""
        if obj.preparation:
            preparation = obj.preparation.title
        return preparation

    def get_product_title(self, obj):
        return obj.title

    def get_manufacture_date(self, obj):
        return "-"

    def get_units_per_pack(self, obj):
        return obj.units_per_pack

    def get_pack_selling_price(self, obj):
        return "-"

    def get_company(self, obj):
        return "-"

    def get_company_product_relationship(self, obj):
        return "manufacturer"

    # def get_current_stock_balance(self, obj):
    #     user = self.context.get("user", None)
    #     retailer_variation = None
    #     if RetailerVariations.objects.filter(product=obj, entity=user.entity).exists():
    #         retailer_variation = RetailerVariations.objects.filter(
    #             product=obj, entity=user.entity
    #         ).first()
    #         return retailer_variation.current_stock_balance
    #     else:
    #         return 0

    def get_images(self, obj):
        images = []
        if models.ProductImages.objects.filter(product=obj).exists():
            images = models.ProductImages.objects.filter(product=obj).all()
        return ProductImageSerializer(images, context=self.context, many=True).data


class ProductsSerializer(serializers.ModelSerializer):
    key = serializers.SerializerMethodField(read_only=True)
    long_title = serializers.SerializerMethodField(read_only=True)
    category_details = serializers.SerializerMethodField(read_only=True)
    category_title = serializers.SerializerMethodField(read_only=True)
    sub_category_details = serializers.SerializerMethodField(read_only=True)
    preparation_title = serializers.SerializerMethodField(read_only=True)
    preparation_details = serializers.SerializerMethodField(read_only=True)
    long_preparation_title = serializers.SerializerMethodField(read_only=True)
    manufacturer_title = serializers.SerializerMethodField(read_only=True)
    formulation_title = serializers.SerializerMethodField(read_only=True)
    country_of_origin = serializers.SerializerMethodField(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = models.Products
        fields = (
            "id",
            "key",
            "url",
            "title",
            "long_title",
            "product_name",
            "preparation",
            "preparation_details",
            "manufacturer",
            "packaging",
            "bar_code",
            "category",
            "sub_category",
            "is_drug",
            "is_vatable",
            "is_pom",
            "images",
            "description",
            "owner",
            "units_per_pack",
            "manufacturer_title",
            "country_of_origin",
            "preparation_title",
            "long_preparation_title",
            "formulation_title",
            "category_details",
            "category_title",
            "sub_category_details",
            "origin_country",
            "active",
            "allowed_entities",
            "created",
            "updated",
        )
        read_only_fields = (
            "id",
            "url",
            "product_name",
            "owner",
            "active",
            "created",
            "updated",
        )
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }

    def validate(self, attrs):
        if "category" in attrs:
            category = attrs.get("category", None)
            if category.title == "PHARMACY" and "preparation" not in attrs:
                raise exceptions.ValidationError(
                    "Preparation details is mandatory for this category"
                )
            else:
                return attrs
        else:
            raise exceptions.ValidationError("Category is required")

    def get_preparation_details(self, obj):
        if obj.preparation:
            preparation = Preparation.objects.get(id=obj.preparation.id)
            return PreparationSerializer(preparation, context=self.context).data
        else:
            return None

    def get_key(self, obj):
        return obj.id
    
    def get_preparation_title(self, obj):
        if obj.preparation:
            return obj.preparation.title
        else:
            return ""

    def get_formulation_title(self, obj):
        if obj.preparation:
            return obj.preparation.formulation.title
        else:
            return ""

    def get_long_title(self, obj):
        if obj.preparation:
            return f"{obj.title} -({obj.preparation.title } - {obj.preparation.formulation.title })"
        else:
            return obj.title

    def get_category_title(self, obj):
        if obj.category:
            return obj.category.title
        else:
            return ""

    def get_manufacturer_title(self, obj):
        if obj.manufacturer:
            return obj.manufacturer.title
        else:
            return ""

    def get_country_of_origin(self, obj):
        if obj.manufacturer and obj.manufacturer.country:
            return obj.manufacturer.country.title
        else:
            return ""

    def get_long_preparation_title(self, obj):
        if obj.preparation:
            return f"{obj.preparation.title} - {obj.preparation.formulation.title}"
        else:
            return ""

    def get_preparation_details(self, obj):
        if obj.preparation:
            preparation = Preparation.objects.get(id=obj.preparation.id)
            return PreparationSerializer(preparation, context=self.context).data
        else:
            return None

    # def get_manufacturer_details(self, obj):
    #     if obj.manufacturer:
    #         if models.Entities.objects.filter(id=obj.manufacturer.id).exists():
    #             manufacturer = models.Entities.objects.get(
    #                 id=obj.manufacturer.id)
    #             return EntitySerializer(manufacturer, context=self.context).data

    #     else:
    #         return None

    def get_category_details(self, obj):
        if obj.category:
            if models.Categories.objects.filter(id=obj.category.id).exists():
                category = models.Categories.objects.get(id=obj.category.id)
                return CategoriesSerializer(category, context=self.context).data

        else:
            return None

    def get_sub_category_details(self, obj):
        if obj.sub_category:
            if models.SubCategories.objects.filter(id=obj.sub_category.id).exists():
                sub_category = models.SubCategories.objects.get(id=obj.sub_category.id)
                return SubCategoriesSerializer(sub_category, context=self.context).data

        else:
            return None

    def get_images(self, obj):
        images = []
        if models.ProductImages.objects.filter(product=obj.product).exists():
            images = models.ProductImages.objects.filter(
                product=obj.product).all()
        return ProductImageSerializer(images, context=self.context, many=True).data

    # def create(self, validated_data):
    #     is_drug = False
    #     preparation = validated_data.get("preparation", None)
    #     manufacturer = validated_data.get("manufacturer", None)
    #     category = validated_data.get("category", None)

    #     if not manufacturer:
    #         raise exceptions.ValidationError("Manufacurer is required")
    #     if manufacturer.entity_type != "MANUFACTURING":
    #         raise exceptions.ValidationError(
    #             f"{manufacturer}  is not registered in the system as a manufacturer"
    #         )

    #         # if not manufacturer:
    #         #     raise serializers.ValidationError(f"Manufacturer is required  ")
    #         # else:
    #         #     print("mANUFACYURER", manufacturer)
    #         #     print("Category", category)
    #         #     print("All", manufacturer.categories.all())

    #         #     if manufacturer.categories.all().filter(id=category.id).exists():
    #         #         raise exceptions.ValidationError("Category iko")
    #         #     else:
    #         #         raise exceptions.ValidationError("Category hakuna")

    #         # if not category in manufacturer.categories.all():
    #         #     raise exceptions.ValidationError(
    #         #         f"Manufacturer category must match product category"
    #         #     )

    #     product = models.Products.objects.create(**validated_data)

    #     return product
# class EntityServicesSerializer(serializers.ModelSerializer):
#     class Meta:
#         ordering = ['-checkin_time']
#         model = models.EntityServices
#         fields = ("id", "entity", "owner","department", "title","price","service_code",
#                     "created",  'updated')

#         read_only_fields = ("id", "entity", "created", "updated", )

# class DrinkCategorySerializer(serializers.ModelSerializer):
#     class Meta:
#         model = models.DrinkCategory
#         fields = (
#             "id",
#             "entity",
#             "title",
#             "description",
#             "owner",
#             "created",
#             "updated",
#         )
#         read_only_fields = ("owner", "created", "updated", "entity", "id")