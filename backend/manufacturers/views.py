from datetime import datetime
from django.shortcuts import get_object_or_404, render
from rest_framework import generics, permissions, status, exceptions
from authentication.models import Entities
from core import app_permissions
from manufacturers import manufacturer_permissions
from manufacturers.utils.distributor_order_utils import check_sufficient_stock_exists, create_manufacturer_order, create_manufacturer_order_item, update_stakes
from . import models
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from distributors.distributor_permissions import DistributorAdminPermission
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from distributors.distributor_permissions import DistributorAdminPermission
from django.db import transaction
from . import serializers
from core.responses import custom_error_response, custom_success_message
from .utils import manufacturer_variations_utils
from rest_framework.pagination import PageNumberPagination
from distributors import distributor_permissions


# Manufacturer variations

@api_view(["POST"])
@permission_classes([manufacturer_permissions.ManufacturerEmployeePermission])
def manufacturerVariationsStaffAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateManufacturerVariation":

        wholesaler_receipt = manufacturer_variations_utils.create_manufacturer_variation(
            request.data, request.user
        )
        if wholesaler_receipt:
            serializer = serializers.WholesalerReceiptsSerializer(
                wholesaler_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Wholesaler inventory receipt created successfully", serializer.data, 'wholesaler_receipt'
            )

        else:
            return custom_error_response(
                1, "Wholesaler inventoty receipt could not be created"
            )
    if request.data["action"] == "GetManufacturerVariations":
        """Get wholesaler receipts for staff"""

        wholesaler_receipts = manufacturer_variations_utils.get_manufacturer_variations(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.ManufacturerVariationsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "UpdateManufacturerVariation":
        manufacturer_variation = manufacturer_variations_utils.update_manufacturer_variation(
            request.data, request.user)

        if manufacturer_variation:
            serializer = serializers.ManufacturerVariationsSerializer(
                manufacturer_variation, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Wholesaler inventory receipt updated successfully", serializer.data, 'manufacturer_variation'
            )

        else:
            return custom_error_response(
                1, "Wholesaler inventory receipt could not be updated"
            )
    elif request.data["action"] == "SearchManufacturerVariations":
        """Search manufacturer variations """

        manufacturer_variations = manufacturer_variations_utils.search_manufacturer_variations(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(manufacturer_variations, request)
        serializer = serializers.ManufacturerVariationsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')

# Manufacturer variations


@api_view(["POST"])
@permission_classes([distributor_permissions.DistributorEmployeePermission])
def manufacturerVariationsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetManufacturerVariations":
        """Get wholesaler receipts for staff"""

        wholesaler_receipts = manufacturer_variations_utils.get_manufacturer_variations(
            request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(wholesaler_receipts, request)
        serializer = serializers.ManufacturerVariationsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "UpdateManufacturerVariation":
        manufacturer_variation = manufacturer_variations_utils.update_manufacturer_variation(
            request.data, request.user)

        if manufacturer_variation:
            serializer = serializers.ManufacturerVariationsSerializer(
                manufacturer_variation, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Wholesaler inventory receipt updated successfully", serializer.data, 'manufacturer_variation'
            )

        else:
            return custom_error_response(
                1, "Wholesaler inventory receipt could not be updated"
            )
    elif request.data["action"] == "SearchManufacturerVariations":
        """Search manufacturer variations """

        manufacturer_variations = manufacturer_variations_utils.search_manufacturer_variations(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(manufacturer_variations, request)
        serializer = serializers.ManufacturerVariationsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


# Manufacturer orders


@ api_view(['POST'])
@ permission_classes([DistributorAdminPermission, ])
def createManufacturerOrder(request):

    distributor_order = None
    manufacturer_order_items = None

    data = request.data
    try:
        manufacturer = request.data['manufacturer']
        manufacturerObj = Entities.objects.get(id=manufacturer)
    except KeyError:
        raise exceptions.ValidationError("Manufacturer ID is required")

    distributor_order = create_manufacturer_order(
        data, manufacturerObj, request)
    if distributor_order:

        try:
            manufacturer_order_items = request.data['manufacturer_order_items']
        except KeyError:
            raise exceptions.ValidationError("Order items not submitted")
        if len(manufacturer_order_items) == 0:
            raise exceptions.ValidationError(
                f"Order item list is empty")
        else:
            for i in manufacturer_order_items:

                check_sufficient_stock_exists(
                    i)

                order_item = create_manufacturer_order_item(
                    i, distributor_order, manufacturerObj, request)

                if order_item:
                    # Set manufacturer as the sole stakeholder until payment is done
                    update_stakes(order_item)

                    # Return response to the user
        if distributor_order:
            serializer = serializers.DistributorOrdersSerializer(
                distributor_order, many=False, context={'request': request})
            return Response(data={"response_code": 0, "response_message": "Distributor order created successfully.", 'order': serializer.data}, status=status.HTTP_201_CREATED)
        else:

            errors_messages = []
            errors_messages.append("An error occurred!")
            return Response(data={"response_code": 1, "response_message": "Distributor order not created",   "errors": errors_messages}, status=status.HTTP_400_BAD_REQUEST)
    # else:

    #     errors_messages = []
    #     errors_messages.append("Order was not created")
    #     return Response(data={"response_code": 1, "response_message": "Manufacturer order not created",   "errors": errors_messages}, status=status.HTTP_400_BAD_REQUEST)


@ api_view(['PATCH'])
@ permission_classes([manufacturer_permissions.ManufacturerEmployeePermission, ])
def updateManufacturerOrder(request):
    manufacturerOrderObj = None
    print("req", request)

    try:
        action = request.data['action']
        if action == None:
            raise exceptions.ValidationError("Action is empty")
    except KeyError:
        raise exceptions.ValidationError(
            "Action is required: options: PACKED,CHECKED,DISPATCHED, DELIVERED")

    try:
        distributor_order = request.data['distributor_order']
        manufacturerOrderObj = models.DistributorOrders.objects.get(
            id=distributor_order)
    except KeyError:
        raise exceptions.ValidationError("Manufacturer order ID is required")

    if manufacturerOrderObj:
        if action == "PACKED":
            if not manufacturerOrderObj.is_paid:
                raise exceptions.ValidationError(
                    "Order payment is not confirmed")
            manufacturerOrderObj.isPacked = True
            manufacturerOrderObj.packedBy = request.user
            manufacturerOrderObj.packedAt = datetime.now()
            manufacturerOrderObj.save()
        elif action == "CHECKED":
            if not manufacturerOrderObj.isPacked:
                raise exceptions.ValidationError("Order is not yet packed")
            manufacturerOrderObj.is_processed = True
            manufacturerOrderObj.processedBy = request.user
            manufacturerOrderObj.processedAt = datetime.now()
            manufacturerOrderObj.save()
        elif action == "DISPATCHED":
            if not manufacturerOrderObj.isChecked:
                raise exceptions.ValidationError("Order is not yet checked")
            manufacturerOrderObj.is_dispatched = True
            manufacturerOrderObj.dispachedBy = request.user
            manufacturerOrderObj.dispachedAt = datetime.now()
            manufacturerOrderObj.save()
        elif action == "DELIVERED":
            if not manufacturerOrderObj.is_dispatched:
                raise exceptions.ValidationError("Order is not yet packed")
            manufacturerOrderObj.isReceived = True
            manufacturerOrderObj.receivedBy = request.user
            manufacturerOrderObj.receivedAt = datetime.now()
            manufacturerOrderObj.save()

        serializer = serializers.DistributorOrdersSerializer(
            manufacturerOrderObj, many=False, context={'request': request})
        return Response(data={"response_code": 0, "response_message": "Manufacturer order updated successfully.", 'order': serializer.data}, status=status.HTTP_201_CREATED)
    else:

        errors_messages = []
        errors_messages.append("An error occurred!")
        return Response(data={"response_code": 1, "response_message": "Manufacturer order not updated",   "errors": errors_messages}, status=status.HTTP_400_BAD_REQUEST)


class DistributorOrdersList(generics.ListAPIView):
    """
   Manufacturer orders listing
    """
    name = "distributororders-list"
    permission_classes = (DistributorAdminPermission,
                          )
    serializer_class = serializers.DistributorOrdersSerializer
    queryset = models.DistributorOrders.objects.all()
    search_fields = ('entity__title', )
    ordering_fields = ('entity__title', 'id')
    ordering = ['entity__title', ]

    def get_queryset(self):
        # return only orders that belong to logged in  entity admin

        return self.queryset.filter(entity=self.request.user.entity,
                                    )


class DistributorOrdersDetail(generics.RetrieveAPIView):
    """
    Manufacturer order details
    """
    name = "distributororders-detail"
    permission_classes = (permissions.IsAuthenticated,
                          )
    serializer_class = serializers.DistributorOrdersSerializer
    queryset = models.DistributorOrders.objects.all()
    lookup_fields = ('pk',)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class DistributorOrdersUpdate(generics.RetrieveUpdateAPIView):
    """
    Manufacturer orders update
    """
    name = "distributororders-update"
    permission_classes = (app_permissions.IsOwner,
                          )
    serializer_class = serializers.DistributorOrdersSerializer
    queryset = models.DistributorOrders.objects.all()
    lookup_fields = ('pk',)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


# Manufacturer order items

class DistributorOrderItemsCreate(generics.CreateAPIView):
    """
    Create new order item
    """
    name = "distributororderitems-create"
    permission_classes = (app_permissions.EntityObjectPermission,
                          )
    serializer_class = serializers.DistributorOrderItemsSerializer
    queryset = models.DistributorOrderItems.objects.all()

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(owner=user, entity=user.entity)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            errors_messages = []
            self.perform_create(serializer)
            return Response(data={"response_code": 0, "response_message": "Order item created successfully.", "order-item": serializer.data,  "errors": errors_messages}, status=status.HTTP_201_CREATED)
        else:
            default_errors = serializer.errors  # default errors dict
            errors_messages = []
            for field_name, field_errors in default_errors.items():
                for field_error in field_errors:
                    error_message = '%s: %s' % (field_name, field_error)
                    errors_messages.append(error_message)

            return Response(data={"response_code": 1, "response_message": "Order item not created", "order-item": serializer.data,  "errors": errors_messages}, status=status.HTTP_400_BAD_REQUEST)


class DistributorOrderItemsList(generics.ListAPIView):
    """
   Manufacturer order item listing
    """
    name = "distributororderitems-list"
    permission_classes = (app_permissions.DistributorEmployeesOnlyPermission,
                          )
    serializer_class = serializers.DistributorOrderItemsSerializer
    queryset = models.DistributorOrderItems.objects.all()
    search_fields = ('manufacturer__title', )
    ordering_fields = ('manufacturer__title', 'id')
    ordering = ['manufacturer__title', ]


class DistributorOrderItemsDetail(generics.RetrieveAPIView):
    """
    Order item details
    """
    name = "distributororderitems-detail"
    permission_classes = (permissions.IsAuthenticated,
                          )
    serializer_class = serializers.DistributorOrderItemsSerializer
    queryset = models.DistributorOrderItems.objects.all()
    lookup_fields = ('pk',)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class ManufacturerOrderItemsUpdate(generics.RetrieveUpdateAPIView):
    """
    Manufacturer order item  update
    """
    name = "distributororderitems-update"
    permission_classes = (app_permissions.IsOwner,
                          )
    serializer_class = serializers.DistributorOrderItemsSerializer
    queryset = models.DistributorOrderItems.objects.all()
    lookup_fields = ('pk',)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


# Manufacturer Coupons


class ManufacturerCouponsCreateAPIView(generics.CreateAPIView):
    """
    Create new manufacturer coupon
    """
    name = "manufacturercoupons-create"
    permission_classes = (manufacturer_permissions.ManufacturerAdminPermission,
                          )
    serializer_class = serializers.ManufacturerCouponsSerializer
    queryset = models.ManufacturerCoupons.objects.all()

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(owner=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            errors_messages = []
            self.perform_create(serializer)
            return Response(data={"response_code": 0, "response_message": "Action created successfully.", "manufacturercoupon": serializer.data,  "errors": errors_messages}, status=status.HTTP_201_CREATED)
        else:
            default_errors = serializer.errors  # default errors dict
            errors_messages = []
            for field_name, field_errors in default_errors.items():
                for field_error in field_errors:
                    error_message = '%s: %s' % (field_name, field_error)
                    errors_messages.append(error_message)

            return Response(data={"response_code": 1, "response_message": "Action not created", "manufacturercoupon": serializer.data,  "errors": errors_messages}, status=status.HTTP_400_BAD_REQUEST)


class ManufacturerCouponsListAPIView(generics.ListAPIView):
    """
    Manufacturer coupons list
    """
    name = "manufacturercoupons-list"
    permission_classes = (permissions.IsAuthenticated,
                          )
    serializer_class = serializers.ManufacturerCouponsSerializer

    queryset = models.ManufacturerCoupons.objects.all()

    search_fields = ('title', 'description',
                     'roles__label', )
    ordering_fields = ('title', 'id')
    ordering = ['-updated', 'title']


class ManufacturerCouponsDetailAPIView(generics.RetrieveAPIView):
    """
    Manufacturer coupons details
    """
    name = "manufacturercoupons-detail"
    permission_classes = (permissions.AllowAny,
                          )
    serializer_class = serializers.ManufacturerCouponsSerializer
    queryset = models.ManufacturerCoupons.objects.all()
    lookup_fields = ('pk',)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class ManufacturerCouponsUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Manufacturer coupons update
    """
    name = "manufacturercoupons-update"
    permission_classes = (permissions.IsAdminUser,
                          )
    serializer_class = serializers.ManufacturerCouponsSerializer
    queryset = models.ManufacturerCoupons.objects.all()
    lookup_fields = ('pk',)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj

    def delete(self, request, *args, **kwargs):
        raise exceptions.NotAcceptable(
            {"message": ["This item cannot be deleted!"]})


# Manufacturer Payments


class ManufacturerPaymentsCreateAPIView(generics.CreateAPIView):
    """
    Create new manufacturer payment
    """
    name = "manufacturerpayments-create"
    permission_classes = (DistributorAdminPermission,
                          )
    serializer_class = serializers.ManufacturerPaymnetsSerializer
    queryset = models.ManufacturerPayments.objects.all()

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(owner=user, entity=user.entity)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            errors_messages = []
            self.perform_create(serializer)
            return Response(data={"response_code": 0, "response_message": "Manufacturer payment created successfully.", "manufacturerpayment": serializer.data,  "errors": errors_messages}, status=status.HTTP_201_CREATED)
        else:
            default_errors = serializer.errors  # default errors dict
            errors_messages = []
            for field_name, field_errors in default_errors.items():
                for field_error in field_errors:
                    error_message = '%s: %s' % (field_name, field_error)
                    errors_messages.append(error_message)
            return Response(data={"response_code": 1, "response_message": "Manufacturer payment not created", "manufacturerpayment": serializer.data,  "errors": errors_messages}, status=status.HTTP_400_BAD_REQUEST)


class ManufacturerPaymentsListAPIView(generics.ListAPIView):
    """
    Manufacturer payments list
    """
    name = "manufacturerpayments-list"
    permission_classes = (DistributorAdminPermission,
                          )
    serializer_class = serializers.ManufacturerPaymnetsSerializer

    queryset = models.ManufacturerPayments.objects.all()

    search_fields = ('manufacturer__title', 'description',
                     'roles__label', )
    ordering_fields = ('manufacturer__title', 'id')
    ordering = ['-updated', 'manufacturer__title']


class ManufacturerPaymentsDetailAPIView(generics.RetrieveAPIView):
    """
    Manufacturer payments details
    """
    name = "manufacturerpayments-detail"
    permission_classes = (permissions.AllowAny,
                          )
    serializer_class = serializers.ManufacturerPaymnetsSerializer
    queryset = models.ManufacturerPayments.objects.all()
    lookup_fields = ('pk',)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class ManufacturerPaymentsUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Manufacturer payments update
    """
    name = "manufacturerpayments-update"
    permission_classes = (permissions.IsAuthenticated,
                          )
    serializer_class = serializers.ManufacturerPaymnetsSerializer
    queryset = models.ManufacturerPayments.objects.all()
    lookup_fields = ('pk',)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj

    def delete(self, request, *args, **kwargs):
        raise exceptions.NotAcceptable(
            {"message": ["This item cannot be deleted!"]})
