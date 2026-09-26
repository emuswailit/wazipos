import uuid
from authentication.models import Entities, Countries, Categories,SubCategories
from drugs.models import Preparation
from utils.logging import create_log

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
    """
    Read serializer for Products.

    FK safety:
    All foreign-key lookups go through `_safe_fk`, which uses the
    raw `_id` column and `.filter(pk=...).first()` instead of
    traversing the ORM descriptor. This prevents a single dangling
    FK (e.g. a `category_id` pointing at a deleted row) from
    raising `DoesNotExist` and 500-ing the entire list endpoint.

    If the foreign key points at a missing row, the affected field
    simply serializes to its empty form ("" / None). The row stays
    visible in the response so the frontend isn't silently starved.
    """

    key = serializers.SerializerMethodField(read_only=True)
    long_title = serializers.SerializerMethodField(read_only=True)
    category_details = serializers.SerializerMethodField(read_only=True)
    category_title = serializers.SerializerMethodField(read_only=True)
    sub_category_details = serializers.SerializerMethodField(read_only=True)
    manufacturer_title = serializers.SerializerMethodField(read_only=True)
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
            "manufacturer",
            "packaging",
            "bar_code",
            "category",
            "sub_category",
            "is_vatable",
            "is_pom",
            "images",
            "description",
            "owner",
            "units_per_pack",
            "manufacturer_title",
            "country_of_origin",
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

    # ---------------------------------------------------------
    # FK helpers
    # ---------------------------------------------------------

    @staticmethod
    def _safe_fk(model, pk):
        if not pk:
            return None
        try:
            return model.objects.filter(pk=pk).first()
        except Exception as e:
            create_log(
                "error",
                f"[_safe_fk] {model.__name__} pk={pk} failed: {e}",
            )
            return None

    # ---------------------------------------------------------
    # Validation (write path only)
    # ---------------------------------------------------------

    def validate(self, attrs):
        if "category" in attrs:
            category = attrs.get("category", None)
            if (
                category.title == "PHARMACY"
                and "preparation" not in attrs
            ):
                raise exceptions.ValidationError(
                    "Preparation details is mandatory for this category"
                )
            else:
                return attrs
        else:
            raise exceptions.ValidationError("Category is required")

    # ---------------------------------------------------------
    # Simple fields
    # ---------------------------------------------------------

    def get_key(self, obj):
        return obj.id

    def get_long_title(self, obj):
        return obj.title or ""

    # ---------------------------------------------------------
    # Category / sub-category
    # ---------------------------------------------------------

    def get_category_title(self, obj):
        cat = self._safe_fk(
            Categories,
            getattr(obj, "category_id", None),
        )
        return cat.title if cat else ""

    def get_category_details(self, obj):
        cat = self._safe_fk(
            Categories,
            getattr(obj, "category_id", None),
        )
        if cat is None:
            return None
        return CategoriesSerializer(
            cat, context=self.context
        ).data

    def get_sub_category_details(self, obj):
        sub = self._safe_fk(
            SubCategories,
            getattr(obj, "sub_category_id", None),
        )
        if sub is None:
            return None
        return SubCategoriesSerializer(
            sub, context=self.context
        ).data

    # ---------------------------------------------------------
    # Manufacturer / origin
    # ---------------------------------------------------------

    def get_manufacturer_title(self, obj):
        man = self._safe_fk(
            Entities,
            getattr(obj, "manufacturer_id", None),
        )
        return man.title if man else ""

    def get_country_of_origin(self, obj):
        man = self._safe_fk(
            Entities,
            getattr(obj, "manufacturer_id", None),
        )
        if man is None:
            return ""

        country = self._safe_fk(
            Countries,
            getattr(man, "country_id", None),
        )
        return country.title if country else ""