import uuid
from django.shortcuts import render
from django.http import request
from django.shortcuts import get_object_or_404, render

from rest_framework import exceptions, permissions, generics, status
from authentication.models import Categories, Entities
from utils.logging import create_log
from authentication.models import Countries

from core import app_permissions
from drugs.models import Preparation
# from wholesalers.models import WholesalerReceipts
from . import models, serializers
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db import IntegrityError
from manufacturers import manufacturer_permissions
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.pagination import PageNumberPagination
from . import product_utils
from core.responses import custom_error_response, custom_success_message
from core.app_permissions import AdminsOnlyPermissions

# Products


class ProductCreateAPIView(generics.GenericAPIView):
    """
    Create new produc
    """

    name = "product-create"
    permission_classes = (AdminsOnlyPermissions,)
    serializer_class = serializers.ProductsSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        try:
            print("request",request)
            print("request data",request.data)
            "Create product"
            create_log("info", f"create product data{request.data}")
            title = request.POST.get("title", None)
            units_per_pack = request.POST.get("units_per_pack", 1)
            manufacturer = request.POST.get("manufacturer", None)
            manufacturer_entity=None
            preparation = request.POST.get("preparation", None)
            country = None
            if Entities.objects.filter(id=manufacturer).exists():
                manufacturer_entity=Entities.objects.filter(id=manufacturer).first()
                if manufacturer_entity and manufacturer_entity.country:
                    country = manufacturer_entity.country
            
            elif Countries.objects.filter(title="KENYA").exists():
                    country = Countries.objects.filter(title="KENYA").first()
            else:
                raise exceptions.ValidationError("Manufacturer is required")

            # if not manufacturer:
            #     raise exceptions.ValidationError("Manufacturer is required")
            # if not preparation:
            #     raise exceptions.ValidationError("Preparation is required")
            if not title:
                raise exceptions.ValidationError("Title is required")
            if manufacturer and title and units_per_pack and preparation:
                if (
                    models.Products.objects.filter(
                        manufacturer=manufacturer,
                        title__icontains=title,
                        units_per_pack=units_per_pack,
                        preparation=preparation
                    ).count()
                    > 0
                ):
                    return Response(
                        data={
                            "response_code": 1,
                            "response_message": f"Product named {title} of pack size {units_per_pack} by this manufacturer already exists",
                            
                        },
                        status=status.HTTP_200_OK,
                    )
                    
                    # raise exceptions.ValidationError(
                    #     f"Product named {title} of pack size {units_per_pack} by this manufacturer already exists")
            elif manufacturer and title and units_per_pack:
                if (
                    models.Products.objects.filter(
                        manufacturer=manufacturer,
                        title__icontains=title,
                        units_per_pack=units_per_pack,
                    ).count()
                    > 0
                ):
                    return Response(
                        data={
                            "response_code": 1,
                            "response_message": f"Product named {title} of pack size {units_per_pack} by this manufacturer already exists",
                        
                        },
                        status=status.HTTP_200_OK,
                    )
                    # raise exceptions.ValidationError(
                    #     f"Product named {title} of pack size {units_per_pack} by this manufacturer already exists")
            files = request.FILES.getlist("images")
            create_log("info", f"Uploaded filed {files}")
            if files:
                request.data.pop("images")
                serializer_context = {
                    "request": request,
                }

                serializer = serializers.ProductsSerializer(
                    data=request.data, context=serializer_context
                )
                # serializer.is_valid(raise_exception=   True)
                
                if serializer.is_valid():
                    try:
                        serializer.save(owner=request.user,
                                        
                                        origin_country=country,
                                        entity=request.user.entity)
                    except Exception as exc:
                        create_log("error", f"create product error{exc}")
                        raise exceptions.ValidationError(exc)
                    item = models.Products.objects.get(id=serializer.data["id"])
                    errors_messages = []

                    uploaded_files = []
                    for file in files:
                        content = models.ProductImages.objects.create(
                            owner=request.user,
                            image=file,
                            product=item,
                            entity=request.user.entity,
                        
                        
                        )
                        uploaded_files.append(content)

                    item.images.add(*uploaded_files)
                    item.save()
                    context = serializer.data
                    arr =[]
                    # context["images"] = [file.id for file in uploaded_files]
                    # context["images"] = [file.id for file in uploaded_files]
                    # context["images"] = [image for image in uploaded_files]
                    ls= serializers.ProductImageSerializer(item.images,context={'request': request}, many=True).data,
                    context["images"] =arr

                    errors_messages = []
                    return Response(
                        data={
                            "response_code": 0,
                            "response_message": "Product succesfully created",
                            "product": serializers.ProductsSerializer(item,context={'request': request}).data,
                            "errors": errors_messages,
                        },
                        status=status.HTTP_201_CREATED,
                    )
                else:
                    default_errors = serializer.errors  # default errors dict
                    errors_messages = []
                    for field_name, field_errors in default_errors.items():
                        for field_error in field_errors:
                            error_message = "%s: %s" % (field_name, field_error)
                            errors_messages.append(error_message)

                    return Response(
                        data={
                            "response_code": 1,
                            "response_message": "Product not created",
                            "product": serializer.data,
                            "errors": errors_messages,
                            "status": status.HTTP_200_OK,
                        },
                        status=status.HTTP_200_OK,
                    )
            else:

                serializer_context = {
                    "request": request,
                }

                serializer = serializers.ProductsSerializer(
                    data=request.data, context=serializer_context
                )
                # serializer.is_valid(raise_exception=   True)
                if serializer.is_valid():
                    try:
                        serializer.save(owner=request.user,
                                        entity=request.user.entity)
                    except IntegrityError as exc:
                        raise exceptions.ValidationError(
                            f"Item named {title} already exists"
                        )

                    user_data = serializer.data
                    # Retrieve user from database
                    errors_messages = []
                    return Response(
                        data={
                            "response_code": 0,
                            "response_message": "Product succesfully created",
                            "product": serializer.data,
                            "errors": errors_messages,
                        },
                        status=status.HTTP_201_CREATED,
                    )
                else:
                    default_errors = serializer.errors  # default errors dict
                    errors_messages = []
                    for field_name, field_errors in default_errors.items():
                        for field_error in field_errors:
                            error_message = "%s: %s" % (field_name, field_error)
                            errors_messages.append(error_message)

                    return Response(
                        data={
                            "response_code": 1,
                            "response_message": "Product not created",
                            "product": serializer.data,
                            "errors": errors_messages,
                            "status": status.HTTP_400_BAD_REQUEST,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        except Exception as exc:
            create_log("error", f"create product error{exc}")
            raise exceptions.ValidationError(exc)
class ProductListAPIView(generics.ListAPIView):
    """
    Products listing
    """

    name = "products-list"
    permission_classes = (app_permissions.AdminsOnlyPermissions,)
    serializer_class = serializers.ProductsSerializer
    queryset = models.Products.objects.all()
    filter_backends = (SearchFilter,)

    # Searching and filtering
    search_fields = (
        "title",
        "description",
        "preparation__title",
        "manufacturer__title",
    )
    ordering_fields = ("title", "description", "id")
    ordering = ["title"]

    def get_queryset(self):
        if self.request.user.is_staff:
            return super().get_queryset().all()
        else:
            # TODO : Return only products in user entity categories: reference
            return self.queryset.filter(
                category__in=self.request.user.entity.categories.all()
            )


class ProductWholesalerReceiptsListAPIView(generics.ListAPIView):
    """
    Products listing
    """

    name = "productwholesalerreceipts-list"
    permission_classes = (app_permissions.AdminsOnlyPermissions,)
    serializer_class = serializers.ProductsWolesalerReceiptsSerializer

    queryset = models.Products.objects.all()
    filter_backends = (SearchFilter,)

    # Searching and filtering
    search_fields = (
        "title",
        "description",
        "preparation__title",
        "manufacturer__title",
    )
    ordering_fields = ("title", "description", "id")
    ordering = ["title"]

    def get_serializer_context(self):
        context = None
        if self.request.user and self.request.user.is_authenticated:
            user = self.request.user

            context = super(
                ProductWholesalerReceiptsListAPIView, self
            ).get_serializer_context()

            context.update(
                {
                    "user": user,
                }
            )
        return context

    def get_queryset(self):
        # Filter this data set and return only categories equal to logged in user company categories
        user_entity_id = self.request.user.entity

        wholesaler_receipts = WholesalerReceipts.objects.filter(
            pack_quantity__gt=0
        ).all()
        print(wholesaler_receipts)
        selecteds = []
        for item in wholesaler_receipts:
            selecteds.append(item.product.id)
            print("selecteds", selecteds)

        if Entities.objects.filter(id=uuid.UUID(str(user_entity_id))).exists():
            vendor = Entities.objects.filter(
                id=uuid.UUID(str(user_entity_id))).first()
        return (
            super()
            .get_queryset()
            .filter(category__in=vendor.categories.all(), id__in=selecteds)
        )


class ManufacturerProductListAPIView(generics.ListAPIView):
    """
    Products listing for logged on user
    """

    name = "products-list"
    permission_classes = (
        manufacturer_permissions.ManufacturerEmployeePermission,)
    serializer_class = serializers.ProductsSerializer

    queryset = models.Products.objects.all()

    filter_backends = (SearchFilter,)

    # Searching and filtering
    search_fields = (
        "title",
        "description",
        "preparation__title",
        "manufacturer__title",
    )
    ordering_fields = ("title", "description", "id")
    ordering = ["title"]

    def get_queryset(self):
        return super().get_queryset().filter(entity=self.request.user.entity)


class ProductsByPreparationId(generics.ListAPIView):
    """
    Products listing
    """

    name = "products-list"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.ProductsSerializer

    queryset = models.Products.objects.all()

    filter_backends = (SearchFilter,)

    # Searching and filtering
    search_fields = (
        "title",
        "description",
        "preparation__title",
        "manufacturer__title",
    )
    ordering_fields = ("title", "description", "id")
    ordering = ["title"]

    def get_queryset(self):
        preparation_id = self.kwargs.get("pk")
        return super().get_queryset().filter(preparation_id=preparation_id)


class ProductsByCategoryId(generics.ListAPIView):
    """
    Products listing by category
    """

    name = "products-list"
    permission_classes = (app_permissions.AdminsOnlyPermissions,)
    serializer_class = serializers.ProductsSerializer

    queryset = models.Products.objects.all()

    filter_backends = (SearchFilter,)

    # Searching and filtering
    search_fields = (
        "title",
        "description",
        "preparation__title",
        "manufacturer__title",
    )
    ordering_fields = ("title", "description", "id")
    ordering = ["title"]

    def get_queryset(self):
        category_id = self.kwargs.get("pk")
        return super().get_queryset().filter(category_id=category_id)


class ProductDetailAPIView(generics.RetrieveAPIView):
    """
    Product details
    """

    name = "products-detail"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.ProductsSerializer
    queryset = models.Products.objects.all()
    lookup_fields = ("pk",)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class ProductUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update prodcut with images3

    """

    name = "product-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.ProductsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.Products.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update product with new images
        """
        files = request.FILES.getlist("images")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = serializers.ProductsSerializer(
            instance, context=serializer_context
        )
        if files:
            uploaded_files = []
            for file in files:
                content = models.ProductImages.objects.create(
                    owner=request.user,
                    image=file,
                    entity=request.user.entity,
                    product=instance,
                )
                uploaded_files.append(content)

            instance.images.add(*uploaded_files)
            instance.save()
            context = serializer.data
            context["images"] = [file.id for file in uploaded_files]
            print('Created', content)

        data = request.data
        category_obj = instance.category

        is_vatable = data.get("is_vatable", None)
        if is_vatable:
            instance.is_vatable = is_vatable
            instance.save()

        bar_code = data.get("bar_code", None)
        if bar_code:
            if models.Products.objects.filter(bar_code=bar_code).exists():
                create_log("error",f"{bar_code} is already in use")
            else:
                instance.bar_code = bar_code
                instance.save()

        preparation_id = data.get("preparation", None)
        if preparation_id:
            if Preparation.objects.filter(id=preparation_id).exists():
                preparation = Preparation.objects.get(id=preparation_id)
                instance.preparation = preparation
                instance.save()
        else:
            instance.preparation = instance.preparation
            instance.save()
        if 'manufacturer' in data:
            instance.manufacturer_id = data.get(
                "manufacturer", instance.manufacturer.id)
        else:
            pass
        instance.category_id = data.get("category", instance.category.id)
        instance.title = data.get("title", instance.title)
        instance.description = data.get("description", instance.title)
        instance.units_per_pack = data.get(
            "units_per_pack", instance.units_per_pack)
        instance.packaging = data.get(
            "packaging", instance.packaging)
        # instance.is_vatable = data.get("is_vatable", instance.is_vatable)
        instance.save()

        return Response(
                data={
                    "response_code": 0,
                    "response_message": "Product updated successfully.",
                    "product": serializer.data,
                    "errors": [],
                },
                status=status.HTTP_201_CREATED,
            )

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class ProductImageList(generics.ListCreateAPIView):
    """
    Logged In User
    =================================================================
    1. Add pharmacist photo
    2. View own courier instance
    """

    name = "productimages-list"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.ProductImageSerializer
    queryset = models.ProductImages.objects.all()
    # TODO: Set  details to context

    def get_serializer_context(self):
        context = None
        if self.request.user and self.request.user.is_authenticated:
            user_pk = self.request.user.id
            user_entity = self.request.user.entity_id
            context = super(ProductImageList, self).get_serializer_context()

            context.update(
                {
                    "user_pk": user_pk,
                    "user_entity": user_entity,
                    "product_pk": self.kwargs.get("pk"),
                }
            )
        return context

    def perform_create(self, serializer):
        user = self.request.user
        product_pk = self.kwargs.get("pk")

        serializer.save(entity_id=user.entity_id,
                        owner=user, product_id=product_pk)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            errors_messages = []
            self.perform_create(serializer)
            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Product photo added successfully.",
                    "image": serializer.data,
                    "errors": errors_messages,
                },
                status=status.HTTP_201_CREATED,
            )
        else:
            default_errors = serializer.errors  # default errors dict
            errors_messages = []
            for field_name, field_errors in default_errors.items():
                for field_error in field_errors:
                    error_message = "%s: %s" % (field_name, field_error)
                    errors_messages.append(error_message)

            return Response(
                data={
                    "response_code": 1,
                    "response_message": "Product image not created",
                    "image": serializer.data,
                    "errors": errors_messages,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    def get_queryset(self):
        if self.request.user and self.request.user.is_authenticated:
            user = self.request.user
            return super().get_queryset().filter(owner=user)
        else:
            return None


class ProductImageDetail(generics.RetrieveUpdateDestroyAPIView):
    """
    Product image details
    """

    name = "productimages-detail"
    # permission_classes = (permissions.AllowAny,)
    serializer_class = serializers.ProductImageSerializer
    queryset = models.ProductImages.objects.all()
    lookup_fields = ("pk",)

    def get_object(self):
        user = self.request.user
        queryset = self.get_queryset().all()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


# New api
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def productsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateProduct":
        product_utils.validate_product_data(request.data)

        product = product_utils.create_product(request.data, request.user)
        if product:
            serializer = serializers.ProductsSerializer(
                product, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Product created successfully", serializer.data, "product"
            )

        else:
            return custom_error_response(1, "Product could not be created")
    elif request.data["action"] == "GetAllProducts":
        """Create new product"""

        products = product_utils.get_all_products(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(products, request)
        serializer = serializers.ProductsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchDrugProducts":
        """Search drugs products"""

        generics = product_utils.search_drug_products(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(generics, request)
        serializer = serializers.ProductsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)   
    
    elif request.data["action"] == "GetClientProducts":
        """Create new product"""

        products = product_utils.get_all_products(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(products, request)
        serializer = serializers.ProductsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchProducts":
        """Search products"""

        products = product_utils.search_products(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(products, request)
        serializer = serializers.ProductsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchProductsByCustomer":
        """Search for non regulated products by customer"""

        products = product_utils.search_products_by_customer(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(products, request)
        serializer = serializers.ProductsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateProduct":

        product = product_utils.update_product(request.data, request.user)
        if product:
            serializer = serializers.ProductsSerializer(
                product, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Product updated successfully", serializer.data
            )
        else:
            return custom_error_response(1, "Product could not be updated")
    elif request.data["action"] == "GetProductDetails":
        # check_user_is_wholesale_admin(request.data, request.user)

        product = product_utils.get_product_details(request.data, request.user)
        if product:
            serializer = serializers.ProductsSerializer(
                product, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Product details sucessfuly retrieved", serializer.data, 'product'
            )

        else:
            return custom_error_response(1, "Product details not retrieved")
    elif request.data["action"] == "GetProductsByCategory":
        # check_user_is_wholesale_admin(request.data, request.user)

        products = product_utils.get_products_by_category(request.data)
        if products:
            serializer = serializers.ProductsSerializer(
                products, many=True, context={"request": request}
            )
            return custom_success_message(
                0, "Products for category sucessfuly retrieved", serializer.data, 'products'
            )

        else:
            return custom_error_response(1, "Product for category not retrieved")
    elif request.data["action"] == "DeleteProductImage":
        image_id = ""
        if not request.data['image_id'] or request.data['image_id'] == "":
            raise exceptions.ValidationError('Image ID ir required')

        else:
            image_id = request.data['image_id']

            if models.ProductImages.objects.filter(id=image_id).exists():
                product_image = models.ProductImages.objects.filter(
                    id=image_id).first()
                product_image.delete()
                return custom_success_message(
                    0, "Product details sucessfuly deleted", None, ''
                )
            else:
                raise exceptions.ValidationError(
                    'Product image for giveen ID does not exist')

    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')
