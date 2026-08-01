from rest_framework import generics, serializers, status, views, permissions, exceptions
from django.db import transaction
from core.responses import custom_error_response, custom_success_message
from rest_framework.decorators import api_view, permission_classes, parser_classes, renderer_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.pagination import PageNumberPagination

from . import models,serializers
from .utils import logistics_utils
from core.responses import custom_errors_response

# Create your views here.

@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]

)
@renderer_classes([JSONRenderer,])
@parser_classes([JSONParser, MultiPartParser])
def logisticsAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetEntitySubStores":
        """Get facility sub stores"""

        categories = models.EntitySubStore.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.EntitySubStoreSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateEntityStore":
        errors, town = logistics_utils.create_entity_store(request.data, request.user)
        if town:
            serializer = serializers.EntityStoreSerializer(
                town, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity store created successfully", serializer.data, "entity_store"
            )

        else:
            return custom_errors_response(1, "Entity store not created", errors)
    elif request.data["action"] == "UpdateEntityStore":
        errors, entity_store = logistics_utils.update_entity_store(
            request.data, request.user
        )
        if entity_store:
            serializer = serializers.EntityStoreSerializer(
                entity_store, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity store updated successfully",
                serializer.data,
                "entity_store",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity store not updated",errors)     

    elif request.data["action"] == "GetEntityStores":
        """Get entity stores"""

        entity_stores = models.EntityStore.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_stores, request)
        serializer = serializers.EntityStoreSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateEntitySubStore":
        errors, entity_store = logistics_utils.create_entity_sub_store(request.data, request.user)
        if entity_store:
            serializer = serializers.EntitySubStoreSerializer(
                entity_store, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity sub store created successfully", serializer.data, "entity_store"
            )

        else:
            return custom_errors_response(1, "Entity sub store not created", errors)

    elif request.data["action"] == "UpdateEntitySubStore":
        errors, entity_sub_store = logistics_utils.update_entity_sub_store(
            request.data, request.user
        )
        if entity_sub_store:
            serializer = serializers.EntitySubStoreSerializer(
                entity_sub_store, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity sub store updated successfully",
                serializer.data,
                "entity_sub_store",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity sub store not updated",errors)     
    
    elif request.data["action"] == "GetEntitySubStores":
        """Get entity stores"""

        entity_stores = models.EntitySubStore.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_stores, request)
        serializer = serializers.EntitySubStoreSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateEntityStoreReceipt":
        errors, entity_store_receipt = logistics_utils.create_entity_store_receipt(request.data, request.user)
        if entity_store_receipt:
            serializer = serializers.EntityStoreReceiptsSerializer(
                entity_store_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity store receipt created successfully", serializer.data, "entity_store_receipt"
            )

        else:
            return custom_errors_response(1, "Entity store receipt not created", errors)

    elif request.data["action"] == "UpdateEntityStoreReceipt":
        errors, entity_store_receipt = logistics_utils.update_entity_store_receipt(
            request.data, request.user
        )
        if entity_store_receipt:
            serializer = serializers.EntityStoreReceiptsSerializer(
                entity_store_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity store receipt updated successfully",
                serializer.data,
                "entity_store_receipt",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity sub store receipt not updated",errors)     
    
    elif request.data["action"] == "GetEntityStoreReceipts":
        """Get entity stores"""

        entity_stores = models.EntityStoreReceipts.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_stores, request)
        serializer = serializers.EntityStoreReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateEntitySubStoreReceipt":
        errors, entity_sub_store_receipt = logistics_utils.create_entity_sub_store_receipt(request.data, request.user)
        if entity_sub_store_receipt:
            serializer = serializers.EntitySubStoreReceiptsSerializer(
                entity_sub_store_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity sub store receipt created successfully", serializer.data, "entity_sub_store_receipt"
            )

        else:
            return custom_errors_response(1, "Entity sub store receipt not created", errors)

    elif request.data["action"] == "UpdateEntitySubStoreReceipt":
        errors, entity_sub_store_receipt = logistics_utils.update_entity_sub_store_receipt(
            request.data, request.user
        )
        if entity_sub_store_receipt:
            serializer = serializers.EntitySubStoreReceiptsSerializer(
                entity_sub_store_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity sub store receipt updated successfully",
                serializer.data,
                "entity_sub_store_receipt",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity sub store receipt not updated",errors)     
    
    elif request.data["action"] == "GetEntitySubStoreReceipts":
        """Get entity stores"""

        entity_stores = models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_stores, request)
        serializer = serializers.EntitySubStoreReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntitySubStoreReceiptsByPreparation":
        """Get sub store inventory for a given preparation """
        receipts=[]
        preparation = None
        from drugs.utils import drugs_models_validators
        if request.data["preparation"] and not request.data["preparation"]=="":
            errors, preparation = drugs_models_validators.validate_preparation(request.data["preparation"])
            if preparation:
                if models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity,product__preparation=preparation,current_unit_quantity__gte=1).exists():
                    receipts=models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity,product__preparation=preparation,current_unit_quantity__gte=1).all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(receipts, request)
        serializer = serializers.EntitySubStoreReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntitySubStoreReceiptsByProduct":
        """Get sub store inventory for a given product"""
        receipts=[]
        product = None
        from products.validators import product_models_validator
        if request.data["product"] and not request.data["product"]=="":
            product = product_models_validator.validate_product(request.data["product"])
            if product:
                if models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity,product=product,current_unit_quantity__gte=1).exists():
                    receipts=models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity,product=product,current_unit_quantity__gte=1).all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(receipts, request)
        serializer = serializers.EntitySubStoreReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')

