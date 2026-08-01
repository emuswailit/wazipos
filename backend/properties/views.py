from django.shortcuts import render
from rest_framework import permissions, exceptions
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.pagination import PageNumberPagination
from .utils import property_utils
from . import serializers,models
from core.responses import custom_errors_response, custom_success_message
from django.shortcuts import get_object_or_404, render
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.pagination import PageNumberPagination

from rest_framework import exceptions, permissions, generics, status
from core.responses import custom_error_response, custom_success_message
from core.app_permissions import AdminsOnlyPermissions
from authentication.utils.utils import generate_reference_number


from django.db import IntegrityError

# Create your views here.
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def propertiesAPIView(request):
    customer_orders = []
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")


    if request.data["action"] == "CreateProperty":
        """Create a new property"""

        errors, property = property_utils.create_property(
            request.data, request.user
        )

        if property:
            serializer = serializers.PropertySerializer(
                property, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Property created successfully",
                serializer.data,
                "property",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Property could not created",errors)
    elif request.data["action"] == "GetPropertyDetails":
        """Get property details"""

        errors, property = property_utils.get_property_details(
            request.data, request.user
        )

        if property:
            serializer = serializers.PropertySerializer(
                property, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Property retreved successfully",
                serializer.data,
                "property",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Property could not created",errors)
        

    elif request.data["action"] == "UpdateProperty":
        errors, entity_store_receipt = property_utils.update_property(
            request.data, request.user
        )
        if entity_store_receipt:
            serializer = serializers.PropertySerializer(
                entity_store_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Property updated successfully",
                serializer.data,
                "property",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Property not updated",errors)     
    
    elif request.data["action"] == "GetPropertyFacilities":
        """Get property facilities"""

        facilities = models.PropertyFacilities.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(facilities, request)
        serializer = serializers.PropertyFacilitiesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityProperties":
        """Get entity properties"""

        properties = models.Property.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(properties, request)
        serializer = serializers.PropertySerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreatePropertyUnit":
        """Create a new property unit"""

        errors, property_unit = property_utils.create_property_unit(
            request.data, request.user
        )

        if property_unit:
            serializer = serializers.PropertyUnitSerializer(
                property_unit, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Property unit created successfully",
                serializer.data,
                "property_unit",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Property unit could not created",errors)
        

    elif request.data["action"] == "UpdatePropertyUnit":
        errors, property_unit = property_utils.update_property_unit(
            request.data, request.user
        )
        if property_unit:
            serializer = serializers.PropertyUnitSerializer(
                property_unit, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Property unit updated successfully",
                serializer.data,
                "property_unit",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Property unit not updated",errors)     
    
    elif request.data["action"] == "GetPropertyUnits":
        """Get entity property units"""
        properties =[]

        if request.data.get("property_id"):
            properties = models.PropertyUnits.objects.filter(entity=request.user.entity, property=request.data.get("property_id"))
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(properties, request)
        serializer = serializers.PropertyUnitSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllEntityPropertyUnits":
        """Get entity property units"""
        property_units =[] 
        property_units = models.PropertyUnits.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(property_units, request)
        serializer = serializers.PropertyUnitSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)


    # elif request.data["action"] == "CreatePropertyUnitTenant":
    #     """Create a new property unit tenant"""

    #     errors, property_unit_tenant = property_utils.create_property_unit_tenant(
    #         request.data, request.user
    #     )

    #     if property_unit_tenant:
    #         serializer = serializers.PropertyUnitTenantsSerializer(
    #             property_unit_tenant, many=False, context={"request": request}
    #         )
    #         return custom_success_message(
    #             0,
    #             "Property unit tenant created successfully",
    #             serializer.data,
    #             "property_unit_tenant",
    #         )

    #     if len(errors)>0:
    #         return custom_errors_response(1,"Property unit tenant could not created",errors)
    elif request.data["action"] == "GetEntityTenants":
        """Get entity tenants"""
        tenants =[] 
        if models.PropertyUnitTenants.objects.filter(entity=request.user.entity).exists():
            tenants = models.PropertyUnitTenants.objects.filter(entity=request.user.entity).all()  
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(tenants, request)
        serializer = serializers.PropertyUnitTenantsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
        


    

   
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')
    


class PropertyCreateAPIView(generics.GenericAPIView):
    """
    Create new property
    """

    name = "property-create"
    permission_classes = (AdminsOnlyPermissions,)
    serializer_class = serializers.PropertySerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        "Create property"

        country_id = "b4d0e91b-1600-4e1d-b147-f3f1c7e2f35f"


        files = request.FILES.getlist("images")
        if files:
            request.data.pop("images")
            serializer_context = {
                "request": request,
            }

            serializer = serializers.PropertySerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    
                                     country_id=country_id,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(exc)
                item = models.Property.objects.get(id=serializer.data["id"])
                errors_messages = []

                uploaded_files = []
                for file in files:
                    content = models.PropertyImages.objects.create(
                        owner=request.user,
                        image=file,
                        property=item,
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
                ls= serializers.PropertyImageSerializer(item.images,context={'request': request}, many=True).data,
                context["images"] =arr

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Property succesfully created",
                        "property": serializers.PropertySerializer(item,context={'request': request}).data,
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
                        "response_message": "Property not created",
                        "property": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        else:

            serializer_context = {
                "request": request,
            }

            serializer = serializers.PropertySerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(
                        f"{exc}"
                    )

                user_data = serializer.data
                # Retrieve user from database
                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Property succesfully created",
                        "property": serializer.data,
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
                        "response_message": "Property not created",
                        "property": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )


class PropertyUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update property images

    """

    name = "property-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.PropertySerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.Property.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update property with new images
        """
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = serializers.PropertySerializer(
            instance, context=serializer_context
        )

        data = request.data


        files = request.FILES.getlist("images")


        if files:
            if models.PropertyImages.objects.filter(property=instance).count()>5:
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "You can only upload a maximum of 5 images per property",
                        "property": serializer.data,
                        "errors": ["You can only upload a maximum of 5 images per property"],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            uploaded_files = []
            for file in files:
                content = models.PropertyImages.objects.create(
                    owner=request.user,
                    image=file,
                    entity=request.user.entity,
                    property=instance,
                )
                uploaded_files.append(content)

            instance.images.add(*uploaded_files)
            instance.save()
            context = serializer.data
            context["images"] = [file.id for file in uploaded_files]
            print('Created', content)

    
        if "title" in data and not data["title"]=="":
            title = data["title"].strip().upper()
            if models.Property.objects.filter(entity=request.user.entity, title=title).exclude(id=instance.id).exists():
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": f'Property with title {title} already exists',
                        "property": serializer.data,
                        "errors": [f'Property with title {title} already exists'],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            else:
                print("sameeee")   
                instance.title = title
                instance.save()
        else:
            pass

        if "description" in data and not data["description"]=="":
            instance.description = data["description"]
            instance.save()

        if "street_address" in data and not data["street_address"]=="":
            instance.street_address = data["street_address"]
            instance.save()

        if "property_number" in data and not data["property_number"]=="":
            instance.property_number = data["property_number"]
            instance.save()

        if "disposal_type" in data and not data["disposal_type"]=="":
            instance.disposal_type = data["disposal_type"]
            instance.save()

        return Response(
                data={
                    "response_code": 0,
                    "response_message": "Property updated successfully.",
                    "property": serializer.data,
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

        # Property Units Views
class PropertyUnitCreateAPIView(generics.GenericAPIView):
    """
    Create new property unit
    """

    name = "property-unit-create"
    permission_classes = (AdminsOnlyPermissions,)
    serializer_class = serializers.PropertyUnitSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        "Create property unit"
        data = request.data
        if "title" in data and not data["title"]=="" and "property" in data and not data["property"]=="":
            title = data["title"].strip().upper()
            if models.PropertyUnits.objects.filter(entity=request.user.entity, property_id=data.get("property"), title=title).exists():
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": f'Property unit with title {title} already exists',
                        "property": {},
                        "errors": [f'Property unit with title {title} already exists'],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        files = request.FILES.getlist("images")
        if files:
            request.data.pop("images")
            serializer_context = {
                "request": request,
            }

            serializer = serializers.PropertyUnitSerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            
            if serializer.is_valid():
                reference_number = generate_reference_number(request.user.entity, request.user)
                try:
                    serializer.save(owner=request.user,
                                    reference_number=reference_number,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(exc)
                item = models.PropertyUnits.objects.get(id=serializer.data["id"])
                errors_messages = []

                uploaded_files = []
                for file in files:
                    content = models.PropertyUnitImages.objects.create(
                        owner=request.user,
                        image=file,
                        property_unit=item,
                        entity=request.user.entity,
                       
                     
                    )
                    uploaded_files.append(content)

                item.images.add(*uploaded_files)
                item.save()
                context = serializer.data
                arr =[]

                ls= serializers.PropertyUnitImagesSerializer(item.images,context={'request': request}, many=True).data,
                context["images"] =arr

                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Property unit succesfully created",
                        "property": serializers.PropertyUnitSerializer(item,context={'request': request}).data,
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
                        "response_message": "Property unit not created",
                        "property": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        else:

            serializer_context = {
                "request": request,
            }

            serializer = serializers.PropertyUnitSerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                reference_number = generate_reference_number(request.user.entity, request.user)
                try:
                    serializer.save(owner=request.user,
                                    reference_number=reference_number,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(
                        f"{exc}"
                    )

                user_data = serializer.data
                # Retrieve user from database
                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Property unit succesfully created",
                        "property": serializer.data,
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
                        "response_message": "Property unit not created",
                        "property": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )


class PropertyUnitUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update property unit images

    """

    name = "property-unit-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.PropertyUnitSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.PropertyUnits.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update property unit with new images
        """
        data = request.data
        instance = self.get_object()

        if "title" in data and not data["title"]=="":
            title = data["title"].strip().upper()
            if models.PropertyUnits.objects.filter(entity=request.user.entity, property_id=instance.property_id, title=title).exclude(id=instance.id).exists():
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": f'Property unit with title {title} already exists',
                        "property": {},
                        "errors": [f'Property unit with title {title} already exists'],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer_context = {
            "request": request,
        }
        serializer = serializers.PropertyUnitSerializer(
            instance, context=serializer_context
        )

       


        files = request.FILES.getlist("images")


        if files:
            if models.PropertyUnitImages.objects.filter(property_unit=instance).count()>5:
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "You can only upload a maximum of 5 images per property unit",
                        "property": serializer.data,
                        "errors": ["You can only upload a maximum of 5 images per property unit"],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            uploaded_files = []
            for file in files:
                content = models.PropertyUnitImages.objects.create(
                    owner=request.user,
                    image=file,
                    entity=request.user.entity,
                    property_unit=instance,
                )
                uploaded_files.append(content)

            instance.images.add(*uploaded_files)
            instance.save()
            context = serializer.data
            context["images"] = [file.id for file in uploaded_files]
            print('Created', content)

    
        if "title" in data and not data["title"]=="":
            title = data["title"].strip().upper()
            if models.PropertyUnits.objects.filter(entity=request.user.entity,property=instance.property, title=title).exclude(id=instance.id).exists():
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": f'Property unit with title {title} already exists',
                        "property": serializer.data,
                        "errors": [f'Property with title {title} already exists'],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            else:
                
                instance.title = title
                instance.save()
        else:
            pass

        if "description" in data and not data["description"]=="" and not data['description']==instance.description:
            instance.description = data["description"]
            instance.save()

        if "disposal_type" in data and not data["disposal_type"]=="" and not data['disposal_type']==instance.disposal_type:
            instance.disposal_type = data["disposal_type"]
            instance.save()

        if "property_unit_type" in data and not data["property_unit_type"]=="" and not data['property_unit_type']==instance.property_unit_type:
            instance.property_unit_type = data["property_unit_type"]
            instance.save()

        if "price" in data and not float(data["price"])<=0 and not float(data["price"])==instance.price:
            instance.price = float(data["price"])
            instance.save()

        return Response(
                data={
                    "response_code": 0,
                    "response_message": "Property updated successfully.",
                    "property": serializer.data,
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
    

class PropertyUnitTenantCreateAPIView(generics.GenericAPIView):
    """
    Create new property unit tenant
    """

    name = "property-create"
    permission_classes = (AdminsOnlyPermissions,)
    serializer_class = serializers.PropertyUnitTenantsSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        "Create property"
        errors_messages = []

        serializer_context = {
                "request": request,
            }

        serializer = serializers.PropertyUnitTenantsSerializer(
                data=request.data, context=serializer_context
            )

        
        if serializer.is_valid():
            if models.PropertyUnitTenants.objects.filter(entity=request.user.entity, property_unit_id=request.data.get("property_unit"), tenant_id=request.data.get("tenant"),is_active="true").exists():
                errors_messages.append(f'Tenant already assigned to this property unit')
                return Response(
                        data={
                            "response_code": 1,
                            "response_message": "Property not created",
                            "property": serializer.data,
                            "errors": errors_messages,
                            "status": status.HTTP_400_BAD_REQUEST,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            
            try:
                serializer.save(owner=request.user,
                                is_active="true",
                                entity=request.user.entity)
                item = models.PropertyUnitTenants.objects.get(id=serializer.data["id"])
                return Response(
                                    data={
                                        "response_code": 0,
                                        "response_message": "Property succesfully created",
                                        "property": serializers.PropertyUnitTenantsSerializer(item,context={'request': request}).data,
                                        "errors": errors_messages,
                                    },
                                    status=status.HTTP_201_CREATED,
                        )
            except IntegrityError as exc:
                    errors_messages.append(f"{exc}")
                    return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Property not created",
                        "property": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
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
                    "response_message": "Property not created",
                    "property": serializer.data,
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )
            
class PropertyUnitTenantUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update property unit tenant

    """

    name = "property-unit-tenant-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.PropertyUnitTenantsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.PropertyUnitTenants.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update property unit tenant with new contract details
        """
        data = request.data
        instance = self.get_object()



        serializer_context = {
            "request": request,
        }
        serializer = serializers.PropertyUnitTenantsSerializer(
            instance, context=serializer_context
        )



        if "lease_start" in data and not data["lease_start"]=="" and not data['lease_start']==instance.lease_start:
            instance.lease_start = data["lease_start"]
            instance.save()

        if "lease_end" in data and not data["lease_end"]=="" and not data['lease_end']==instance.lease_end:
            instance.lease_end = data["lease_end"]
            instance.save()

        if "is_active" in data and not data["is_active"]=="":
            if instance.is_active =="false":
                return Response(
                data={
                    "response_code": 1,
                    "response_message": "Tenant is already deactivated",
                    "property": serializer.data,
                    "errors": [],
                },
                status=status.HTTP_201_CREATED,
            )
            
            instance.is_active = data["is_active"]
            instance.save()

        return Response(
                data={
                    "response_code": 0,
                    "response_message": "Property updated successfully.",
                    "property": serializer.data,
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