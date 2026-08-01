from django.shortcuts import get_object_or_404
from payments.utils import user_account_payout_utils
from rest_framework.pagination import PageNumberPagination
from rest_framework import exceptions, permissions, generics, status
from intergrations.jambopay.jambopay_wallet import get_wallet_balance, check_user_jambopay_profile_by_phone
from rest_framework_api_key.permissions import HasAPIKey
from rest_framework.filters import SearchFilter, OrderingFilter
from django.http import JsonResponse,HttpResponse
from rest_framework.decorators import (
    api_view,
    permission_classes,
    parser_classes,
    renderer_classes,
)
from core import app_permissions
from payments.utils import payment_utils, account_utils
from utils.logging import create_log

from intergrations.jambopay import integration_utils
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms
from decouple import config
from utils.logging import create_log

# from .serializers import AccountProviderSerializer, AccountProviderBranchSerializer, EntityAccountSerializer
from .validators import account_provider_validator, entity_account_validators
from core.responses import (
    custom_success_message,
    custom_error_response,
    custom_errors_response,
    custom_json_response,
)
from rest_framework.response import Response
from django.db import IntegrityError
from . import serializers, models
from rest_framework.parsers import MultiPartParser, FormParser
from core.responses import (
    custom_error_response,
    custom_success_message,
    custom_plain_response,
)
from core.app_permissions import AdminsOnlyPermissions
from .validators import quantity_discount_utils, price_discount_utils,payments_models_validators
from intergrations.jambopay import jambopay_wallet
from authentication.validators.authentication_models_validators import validate_entity

# Providers


# @api_view(["POST"])
# @permission_classes(
#     [
#         permissions.IsAuthenticated,
#     ]

# )
# def accountProvidersAPIView(request):
#     try:
#         action = request.data["action"]
#     except KeyError:
#         raise exceptions.ValidationError("Action is not supplied")
#     if request.data["action"] == "GetAccountProviders":
#         """Get all categories for users"""

#         account_providers = account_provider_validator.get_all_account_providers()
#         paginator = PageNumberPagination()
#         page = paginator.paginate_queryset(account_providers, request)
#         serializer = AccountProviderSerializer(
#             page, many=True, context={"request": request, "user": request.user}
#         )
#         return paginator.get_paginated_response(serializer.data)
#     elif request.data["action"] == "CreateAccountProviderBranch":
#         account_provider_validator.validate_account_provider_details(
#             request.data, request.user)

#         account_provider_branch = account_provider_validator.create_account_provider_branch(
#             request.data, request.user)
#         if account_provider_branch:
#             serializer = AccountProviderBranchSerializer(
#                 account_provider_branch, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0, "Account provider branch created successfully", serializer.data, 'account_provider_branch'
#             )

#         else:
#             return custom_error_response(1, "Account provider branch could not be created")
#     else:
#         raise exceptions.ValidationError(
#             f'Action { request.data["action"]} is unknown')


# Provider Branches
# @api_view(["POST"])
# @permission_classes(
#     [
#         permissions.IsAuthenticated,
#     ]

# )
# def accountProviderBranchesAPIView(request):
#     try:
#         action = request.data["action"]
#     except KeyError:
#         raise exceptions.ValidationError("Action is not supplied")
#     if request.data["action"] == "GetAccountProviderBranches":
#         """Get all branches for users"""

#         account_provider_branches = account_provider_validator.get_all_account_provider_branches(
#             request.data)
#         paginator = PageNumberPagination()
#         page = paginator.paginate_queryset(account_provider_branches, request)
#         serializer = AccountProviderBranchSerializer(
#             page, many=True, context={"request": request, "user": request.user}
#         )
#         return paginator.get_paginated_response(serializer.data)
#     elif request.data["action"] == "CreateAccountProviderBranch":
#         account_provider_validator.validate_account_provider_branch_details(
#             request.data, request.user)

#         account_provider_branch = account_provider_validator.create_account_provider_branch(
#             request.data, request.user)
#         if account_provider_branch:
#             serializer = AccountProviderBranchSerializer(
#                 account_provider_branch, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0, "Account provider branch created successfully", serializer.data, 'account_provider_branch'
#             )

#         else:
#             return custom_error_response(1, "Account provider branch could not be created")
#     elif request.data["action"] == "UpdateAccountProviderBranch":
#         account_provider_branch = account_provider_validator.validate_account_provider_branch_update_details(
#             request.data, request.user)

#         if account_provider_branch:
#             serializer = AccountProviderBranchSerializer(
#                 account_provider_branch, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0, "Account provider branch updated successfully", serializer.data, 'account_provider_branch'
#             )

#         else:
#             return custom_error_response(1, "Account provider branch could not be updated")
#     else:
#         raise exceptions.ValidationError(
#             f'Action { request.data["action"]} is unknown')


# Entity accounts
# @api_view(["POST"])
# @permission_classes(
#     [
#         permissions.IsAuthenticated,
#     ]

# )
# def entityAccountsAPIView(request):
#     try:
#         action = request.data["action"]
#     except KeyError:
#         raise exceptions.ValidationError("Action is not supplied")
#     if request.data["action"] == "GetEntityAccounts":
#         """Get entity accounts"""

#         entity_accounts = entity_account_validators.get_entity_accounts(
#             request.data, request.user)
#         paginator = PageNumberPagination()
#         page = paginator.paginate_queryset(entity_accounts, request)
#         serializer = EntityAccountSerializer(
#             page, many=True, context={"request": request, "user": request.user}
#         )
#         return paginator.get_paginated_response(serializer.data)
#     elif request.data["action"] == "CreateEntityAccount":
#         entity_account = entity_account_validators.validate_entity_account_details(
#             request.data, request.user)

#         if entity_account:
#             serializer = EntityAccountSerializer(
#                 entity_account, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0, "Entity account created successfully", serializer.data, 'entity_account'
#             )

#         else:
#             return custom_error_response(1, "Entity account could not be created")
#     elif request.data["action"] == "UpdateAccountProviderBranch":
#         account_provider_branch = account_provider_validator.validate_account_provider_branch_update_details(
#             request.data, request.user)

#         if account_provider_branch:
#             serializer = AccountProviderBranchSerializer(
#                 account_provider_branch, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0, "Account provider branch updated successfully", serializer.data, 'account_provider_branch'
#             )

#         else:
#             return custom_error_response(1, "Account provider branch could not be updated")
#     else:
#         raise exceptions.ValidationError(
#             f'Action { request.data["action"]} is unknown')


class PaymentMethodsImagesUploadAPIView(generics.RetrieveUpdateAPIView):
    """
    Update entity with banners
    """

    name = "entity-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.PaymentMethodsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.PaymentMethods.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update entity with new images
        """
        files = request.FILES.getlist("images")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = serializers.PaymentMethodsSerializer(
            instance, context=serializer_context
        )
        if files:
            uploaded_files = []
            for file in files:
                content = models.PaymentMethodImages.objects.create(
                    owner=request.user,
                    image=file,
                    entity=request.user.entity,
                )
                uploaded_files.append(content)

            instance.images.add(*uploaded_files)
            context = serializer.data
            context["images"] = [file.id for file in uploaded_files]

        data = request.data
        return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class PaymentMethodsCreateAPIView(generics.ListCreateAPIView):
    """
    Create paymentmethod
    """

    name = "paymentmethods-create"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.PaymentMethodsSerializer
    queryset = models.PaymentMethods.objects.all()

    def perform_create(self, serializer):
        try:
            user = self.request.user
            serializer.save(owner=user, entity_id=user.entity.id)
        except IntegrityError as e:
            raise exceptions.ValidationError("Error creating paymentmethod")

    def get_serializer_context(self):
        user_pk = self.request.user.id
        context = super(PaymentMethodsCreateAPIView, self).get_serializer_context()
        context.update(
            {
                "user_pk": user_pk,
            }
        )
        return context

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(owner=user, entity=user.entity)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            errors_messages = []
            self.perform_create(serializer)
            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Payment method succesfully created",
                    "paymentmethod": serializer.data,
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
                    "response_message": "Payment method not created",
                    "paymentmethod": serializer.data,
                    "errors": errors_messages,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class PaymentMethodsDetailAPIView(generics.RetrieveUpdateAPIView):
    """
    PaymentMethods
    """

    name = "paymentmethods-detail"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.PaymentMethodsSerializer
    queryset = models.PaymentMethods.objects.all()
    lookup_fields = ("pk",)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


class PaymentMethodsUpdate(generics.RetrieveUpdateAPIView):
    """
    PaymentMethods update
    """

    name = "paymentmethods-update"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.PaymentMethodsSerializer
    queryset = models.PaymentMethods.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update coupon
        """
        data = request.data

        instance = self.get_object()
        serializer_context = {
            "request": request,
        }

        active = data.get("active")

        instance.active = active
        instance.save()

        serializer = serializers.PaymentMethodsSerializer(
            instance, context=serializer_context
        )
        return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj


# Retailer price discounts


@api_view(["POST"])
@permission_classes([AdminsOnlyPermissions])
def priceDiscountsAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetPriceDiscounts":
        """Get retailer price discounts"""

        retailer_price_discounts = price_discount_utils.get_retailer_price_discounts(
            request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_price_discounts, request)
        serializer = serializers.PriceDiscountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreatePriceDiscount":
        price_discount = price_discount_utils.create_price_discount(
            request.data, request.user
        )

        if price_discount:
            serializer = serializers.PriceDiscountsSerializer(
                price_discount, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Price discount created successfully",
                serializer.data,
                "customer_order",
            )

        else:
            return custom_error_response(1, "Price dicount could not be created")

    elif request.data["action"] == "UpdatePriceDiscount":
        price_discount = price_discount_utils.update_price_discount(
            request.data, request.user
        )

        if price_discount:
            serializer = serializers.PriceDiscountsSerializer(
                price_discount, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Price discount updated successfully",
                serializer.data,
                "price_discount",
            )

        else:
            return custom_error_response(1, "Price dicount could not be created")

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


# Retailer price discounts


@api_view(["POST"])
@permission_classes([AdminsOnlyPermissions])
def quantityDiscountsAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetQuantityDiscounts":
        """Get retailer price discounts"""

        retailer_quantity_discounts = (
            quantity_discount_utils.get_retailer_quantity_discounts(request.user)
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(retailer_quantity_discounts, request)
        serializer = serializers.QuantityDiscountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateQuantityDiscount":
        quantity_discount = quantity_discount_utils.create_quantity_discount(
            request.data, request.user
        )

        if quantity_discount:
            serializer = serializers.QuantityDiscountsSerializer(
                quantity_discount, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Quantity discount created successfully",
                serializer.data,
                "quantity_discount",
            )

        else:
            return custom_error_response(1, "Quantity dicount could not be created")

    elif request.data["action"] == "UpdateQuantityDiscount":
        quantity_discount = quantity_discount_utils.update_quantity_discount(
            request.data, request.user
        )

        if quantity_discount:
            serializer = serializers.QuantityDiscountsSerializer(
                quantity_discount, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Quantity discount updated successfully",
                serializer.data,
                "quantity_discount",
            )

        else:
            return custom_error_response(1, "Quantity discount could not be updated")

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')
    

# @api_view(["POST"])
# @permission_classes([permissions.AllowAny])
# def offlinePaymentsAPIView(request):
#     try:
#         action = request.data["action"]
#     except KeyError:
#         raise exceptions.ValidationError("Action is not supplied")

#     if request.data["action"] == "CreateOfflinePayment":
#         """CreateOfflinePayment"""
#         errors, offline_payment = payment_utils.create_offline_payment(request.data)
#         if offline_payment:
#             serializer = serializers.OfflinePaymentsSerializer(
#                 offline_payment, many=False, context={"request": request}
#             )
#             return custom_success_message(
#                 0,
#                 "Offline payment created successfully",
#                 serializer.data,
#                 "quantity_discount",
#             )
#         else:
#             return custom_errors_response(1, "Price dicount could not be created",errors)
  


#     else:
#         raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

@api_view(["POST","PUT","PATCH","GET"])
# @permission_classes([permissions.AllowAny,])
def offlinePaymentsAPIView(request):
    create_log("error", request)
    errors, offline_payment = payment_utils.create_offline_payment(request.data)
    if offline_payment:
        serializer = serializers.OfflinePaymentsSerializer(
            offline_payment, many=False, context={"request": request}
        )
        return custom_success_message(
            0,
            "Offline payment created successfully",
            serializer.data,
            "quantity_discount",
        )
    else:
        return custom_errors_response(1, "Offline payment could not be created",errors)
    
@api_view(["POST"])
# @permission_classes([permissions.AllowAny,])
def peerToPeerPaymentsAPIView(request):
    create_log("error", request)
    errors, peer_to_peer_payment = payment_utils.create_peer_to_peer_payment(request.data)
    if peer_to_peer_payment:
        serializer = serializers.PeerToPeerPaymentsSerializer(
            peer_to_peer_payment, many=False, context={"request": request}
        )
        return custom_success_message(
            0,
            "Peer to peer payment created successfully",
            serializer.data,
            "peer_to_peer_payment",
        )
    else:
        return custom_errors_response(1, "Peer to peer payment could not be created",errors)

# Api for receiving and processing stk callbacks
@api_view(["POST"])
@permission_classes([permissions.AllowAny,])
def mpesaSTKPaymentsCallbackAPIView(request):
    create_log("error","Ok")
    create_log("error", request.data)
    return JsonResponse(
        {
            "response_code": 1,
            "response_message": "Ok",
          
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([permissions.AllowAny,])
def mpesaPaybillPaymentsValidationCallbackAPIView(request):
    create_log("error","Paybill validation")
    create_log("error", request.data)
    return JsonResponse(
        {
            "response_code": 1,
            "response_message": "Ok",
          
        },
        status=status.HTTP_200_OK,
    )

@api_view(["POST"])
@permission_classes([permissions.AllowAny,])
def mpesaPaybillPaymentsConfirmationCallbackAPIView(request):
    create_log("error","Paybill confirmation")
    create_log("error", request.data)
    return JsonResponse(
        {
            "response_code": 1,
            "response_message": "Ok",
          
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def paymentMethodsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "GetCashlessPaymentMethods":
        """Get payment methods that exclude cash"""

        payment_methods = models.PaymentMethods.objects.all().exclude(is_offline="true")
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(payment_methods, request)
        serializer = serializers.PaymentMethodsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllPaymentMethods":
        """Get all payment methods"""

        payment_methods = models.PaymentMethods.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(payment_methods, request)
        serializer = serializers.PaymentMethodsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllowedPaymentMethods":
        """Get for PSPs where entity has a collection account"""
        allowed_payment_methods =[]
        if models.PaymentMethods.objects.filter(title="CASH").exists():
            cash =models.PaymentMethods.objects.filter(title="CASH").first()
            allowed_payment_methods.append(cash)

        # if  request.user.entity.administrator:
        if models.PayoutAccounts.objects.filter(entity=request.user.entity,is_active="true").exists():
            allowed_payment_methods = models.PaymentMethods.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(allowed_payment_methods, request)
        serializer = serializers.PaymentMethodsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes([AdminsOnlyPermissions])
def paymentProvidersAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreatePaymentServiceProviderProfile":
        """Create jambopay user profile"""
        errors, profile = jambopay_wallet.create_jambopay_user_profile(
        request.data, request.user
        )
        if len(errors) > 0:
            return custom_errors_response(1, "Profile not created", errors)
        elif profile:
            return custom_json_response(
                0, "Profile created successfuly", "profile", profile
            )
  
    elif request.data["action"] == "GetOrCreatePaymentServiceProviderProfile":
        """Get jambopay user profile by admin"""
       
        psp = None
        if "psp" in request.data and not request.data["psp"]=="":
            psp = payments_models_validators.validate_psp_exists(request.data["psp"])
            if psp:
                if psp.psp_title=="JAMBOPAY":
                    errors, profile = jambopay_wallet.get_user_jambopay_profile_self(
                         request.user,psp
                            )
                    if len(errors) > 0:
                        return custom_errors_response(1, "Profile not retrieved", errors)
                    if profile:
                        return custom_json_response(
                            0, "Profile retrieved successfuly", "profile", profile
                        )
                                
                else:
                    print("To do")
                
            else:
                return custom_error_response(1,"Payment service provider with provided ID does not exist")

        else:
            return custom_error_response(1,"Payment service provider ID is required")
    elif request.data["action"] == "CheckCollectionAccountBalance":
        """Check collection account balance"""
       
        psp = None
        if "psp" in request.data and not request.data["psp"]=="":
            psp = payments_models_validators.validate_psp_exists(request.data["psp"])
            if psp:
                if psp.psp_title=="JAMBOPAY":
                    errors, balance = jambopay_wallet.get_wallet_balance(
                         request.data
                            )
                    if len(errors) > 0:
                        return custom_errors_response(1, "Wallet balance not retrieved", errors)
                    if balance:
                        return custom_json_response(
                            0, "Wallet balance retrieved successfuly", "balance", balance
                        )
                                
                else:
                    print("To do")
                
            else:
                return custom_error_response(1,"Payment service provider with provided ID does not exist")

        else:
            return custom_error_response(1,"Payment service provider ID is required")


    elif request.data["action"] == "CreatePaymentServiceProviderAccount":
        """Create user Jambopay Wallet"""
        psp = None
        if "psp" in request.data and not request.data["psp"]=="":
            psp = payments_models_validators.validate_psp_exists(request.data["psp"])
            if psp:
                if psp.psp_title=="JAMBOPAY":
                    errors, account = jambopay_wallet.create_user_jambopay_profile_account(
                    request.data, request.user
                        )
                    if len(errors) > 0:
                        return custom_errors_response(1, "Profile account not retrieved", errors)
                    if account:
                        return custom_json_response(
                            0, "Profile account created successfuly", "profile", account
                        )                           
                else:
                    print("To do")
                
            else:
                return custom_error_response(1,"Payment service provider with provided ID does not exist")

        else:
            return custom_error_response(1,"Payment service provider ID is required")
    elif request.data["action"] == "CreateEntityPayoutAccount":
        """Create psp payout account"""
        errors, payout_account = integration_utils.create_payout_account(
            request.data, request.user
                )
        if len(errors) > 0:
            return custom_errors_response(1, "Payout account not created", errors)
        if payout_account:
            serializer= serializers.PayoutAccountsSerializer(payout_account,many=False).data
            return custom_success_message(
                0, "Payout account created successfuly", serializer,"payout_account", 
            )  

     
        
    elif request.data["action"] == "GetCurrencies":
        """Create user Jambopay Wallet"""
        psp = None
        if "psp" in request.data and not request.data["psp"]=="":
            psp = payments_models_validators.validate_psp_exists(request.data["psp"])
            if psp:
                if psp.psp_title=="JAMBOPAY":
                    errors, currencies = jambopay_wallet.get_currencies(
                        )
                    if len(errors) > 0:
                        return custom_errors_response(1, "Currencies not retrieved", errors)
                    if currencies:
                        return custom_json_response(
                            0, "PCurrencies retrieved sucessfully", "currencies", currencies
                        )                           
                else:
                    print("To do")
                
            else:
                return custom_error_response(1,"Payment service provider with provided ID does not exist")

        else:
            return custom_error_response(1,"Payment service provider ID is required")
    elif request.data["action"] == "GetEntityPSPCollectionAccounts":
        """Get entity PSP accounts"""
        errors =[]
        entity=None
        psp_accounts=None
        if request.user.is_staff:
            # User is staff, use entity in request
            if not "entity" in request.data or request.data['entity']=="":
                errors.append("Entity ID is required")
                return custom_errors_response(1,"Accounts not retrieved",errors)
            else:
                entity= validate_entity(request.data['entity'])
                psp_accounts = models.EntityPSPCollectionAccount.objects.filter(entity=entity).all()
        else:
            # User not staff, Entity is logged in user's entity'
            entity = request.user.entity   
            # Return only accounts belonging to this user   
            psp_accounts = models.EntityPSPCollectionAccount.objects.filter(entity=entity,owner=request.user).all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(psp_accounts, request)
        serializer = serializers.EntityPSPCollectionAccountSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAccountProviders":
        """Get all account providers"""

        account_providers = account_provider_validator.get_all_account_providers()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(account_providers, request)
        serializer = serializers.PaymentServicesProviderSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAccountProviderBranches":
        """Get all account provider branches"""

        account_provider_branches = account_provider_validator.get_all_account_provider_branches()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(account_provider_branches, request)
        serializer = serializers.PaymentServicesProviderBranchSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetPayoutAccounts":
        """Get entity payout accounts"""
        errors =[]
        entity=None
        payout_accounts=None
  
            # Return only accounts belonging to this user   
        payout_accounts = models.PayoutAccounts.objects.filter(entity=request.user.entity,owner=request.user).all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(payout_accounts, request)
        serializer = serializers.PayoutAccountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)


    elif request.data["action"] == "GetAllPaymentServicesProviders":
        """Get entity PSP accounts"""
        errors =[]
        entity=None
        psps=None

            # Return only accounts belonging to this user   
        psps = models.PaymentServicesProvider.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(psps, request)
        serializer = serializers.PaymentServicesProviderSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "PayEntityRegistrationFee":
        """Pay entity registration fee"""

        errors, payment = jambopay_wallet.pay_entity_registration_fee(
            request.data, request.user
        )
        if len(errors) > 0:
            return custom_errors_response(1, "Payment not initiated", errors)
        if payment:
            return custom_plain_response(0, "Payment initiated successfuly","")
        else:
            return custom_error_response(1), "Payment was not initiated"
    elif request.data["action"] == "CustomerOrderPayment":
        """Customer to entity mobile money payment"""
        psp = None
        if "psp" in request.data and not request.data["psp"]=="":
            psp = payments_models_validators.validate_psp_exists(request.data["psp"])
            if psp:
                if psp.psp_title=="JAMBOPAY":
                    errors, payment = jambopay_wallet.customer_order_payment(
                        request.data, request.user
                        )
                    if len(errors) > 0:
                        return custom_errors_response(1, "Customer payment not initiated", errors)
                    if payment:
                        return custom_plain_response(0, "Customer payment initiated successfuly","")                          
                else:
                    print("To do")
                    
            else:
                return custom_error_response(1,"Payment service provider with provided ID does not exist")

        else:
            return custom_error_response(1,"Payment service provider ID is required")

    
        
    elif request.data["action"] == "GetAllPaymentMethods":
        """Get all payment methods"""

        payment_methods = models.PaymentMethods.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(payment_methods, request)
        serializer = serializers.PaymentMethodsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetAllBanks":
        """Get all banks"""

        payment_methods = models.PaymentServicesProvider.objects.filter(psp_type="BANK").all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(payment_methods, request)
        serializer = serializers.PaymentServicesProviderSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def accountPaymentsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "UserAccountBalance":
        errors, balance = account_utils.retrieve_user_account_balance(request.data, request.user)
        if balance:
          
            return custom_json_response(0, "Account balance sucessfully retrieved","balance",balance)
        else:
            return custom_errors_response(1, "Accont balance not retrieved", errors)
    if request.data["action"] == "UserAccountStatus":
        errors, balance = account_utils.retrieve_user_account_status(request.data, request.user)
        if balance:
          
            return custom_json_response(0, "Account balance sucessfully retrieved","balance",balance)
        else:
            return custom_errors_response(1, "Accont balance not retrieved", errors)
    elif request.data["action"] == "CreateEntityBankingAccount":
        errors, entity_banking_account = account_utils.create_entity_banking_account(request.data, request.user)
        if entity_banking_account:
            serializer =serializers.BankClientEntitySerializer(entity_banking_account,many=False).data
            return custom_success_message(0, "Entity baning account sucessfully created",serializer,"user_account")
        else:
            return custom_errors_response(1, "Entity banking account  not created", errors)
    elif request.data["action"] == "GetEntityBankingAccount":
        errors, account = account_utils.get_entity_banking_account(request.data, request.user)
        if account:
                serializer =serializers.BankClientEntitySerializer(account,many=False).data
                return custom_success_message(0, "Banking account sucessfully retrieved",serializer,"account")
        else:
            return custom_errors_response(1, "Entity banking account not retrieved", errors)
        
    elif request.data["action"] == "GetUserAccountPayins":
        """Get pay ins for user account"""
        errors =[]
        entity=None
        psp_accounts=[]
        user_acccount_payins = (
            payment_utils.get_user_account_payins(request.user)
        )

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(user_acccount_payins, request)
        serializer = serializers.UserAccountsPayinsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetUserAccountPayouts":
        """Get pay ins for user account"""
        errors =[]
        entity=None
        psp_accounts=[]
        user_acccount_payins = (
            payment_utils.get_user_account_payins(request.user)
        )

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(user_acccount_payins, request)
        serializer = serializers.UserAccountsPayinsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')

@api_view(["POST"])
@permission_classes([AdminsOnlyPermissions])
def adminsPaymentsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateBranchCollectionAccount":
        errors, collection_account = payment_utils.create_branch_collection_account(request.data, request.user)
        if collection_account:
            serializer =serializers.BranchCollectionAccountSerializer(collection_account,many=False).data
            return custom_success_message(0, "Collection account sucessfully updated",serializer,"payout_accounts")
        else:
            return custom_errors_response(1, "Collection account  not be created", errors)
    elif request.data["action"] == "CreateUserAccount":
        errors, user_account = payment_utils.create_user_account(request.data, request.user)
        if user_account:
            serializer =serializers.UserAccountSerializer(user_account,many=False).data
            return custom_success_message(0, "User account sucessfully created",serializer,"user_account")
        else:
            return custom_errors_response(1, "User account  not created", errors)
    elif request.data["action"] == "CreateUserAccountAdmin":
        errors, user_account = payment_utils.create_user_account_admin(request.data, request.user)
        if user_account:
            serializer =serializers.UserAccountSerializer(user_account,many=False).data
            return custom_success_message(0, "User account sucessfully created",serializer,"user_account")
        else:
            return custom_errors_response(1, "User account  not created", errors)
        
    elif request.data["action"] == "GetEntityCollectionAccountData":
        errors, data = payment_utils.retrieve_branch_collection_account_data( request.user)
        if data:
        
            return custom_json_response(0, "Collection account data retrieved","data",data)
        else:
            return custom_errors_response(1, "Collection account data  not retrieved", errors)

    elif request.data["action"] == "GetEntityPSPCollectionAccountsById":
        """Get entity PSP accounts"""
        errors =[]
        entity=None
        psp_accounts=[]
        if request.user.is_staff:
            # User is staff, use entity in request
            if not "entity" in request.data or request.data['entity']=="":
                errors.append("Entity ID is required")
                return custom_errors_response(1,"Accounts not retrieved",errors)
            else:
                entity= validate_entity(request.data['entity'])
                psp_accounts = models.EntityPSPCollectionAccount.objects.filter(entity=entity).all()

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(psp_accounts, request)
        serializer = serializers.EntityPSPCollectionAccountSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetUserAccounts":
        """Get user accounts"""
      
        user_accounts = models.UserAccounts.objects.all().order_by("-created")

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(user_accounts, request)
        serializer = serializers.UserAccountSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdatePayoutAccount":
        """Get entity payout accounts"""
        errors, payout_account = payment_utils.update_payout_account(request.data,request.user)
        if payout_account:
            serializer =serializers.PayoutAccountsSerializer(payout_account,many=False).data
            return custom_success_message(0, "Payout account successfully updated",serializer,"payout_account")
        else:
            return custom_errors_response(1, "Payout account  not updated", errors)
    elif request.data["action"] == "CreatePayoutAccount":
        """Get entity payout accounts"""
        errors, payout_account = payment_utils.create_payout_account(request.data,request.user)
        if payout_account:
            serializer =serializers.PayoutAccountsSerializer(payout_account,many=False).data
            return custom_success_message(0, "Payout account sucessfully updated",serializer,"payout_accounts")
        else:
            return custom_errors_response(1, "Payout account  not be created", errors)
    elif request.data["action"] == "GetEntityPayoutAccounts":
        """Get entity payout accounts"""
        payout_accounts =[]
        if models.PayoutAccounts.objects.filter(entity=request.user.entity,owner=request.user).exists():    
            payout_accounts = models.PayoutAccounts.objects.filter(entity=request.user.entity).all()  
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(payout_accounts, request)
        serializer = serializers.PayoutAccountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    elif request.data["action"] == "CheckJambopayProfileExistsByPhone":
        # exists = payment_utils.check_jambopay_profile_exists_by_phone( request.data)
        exists = check_user_jambopay_profile_by_phone(request.data["phone"])
        print("exists", exists)
        if exists:
        
            return custom_errors_response(0, "Profile exists",[])
        else:
            return custom_errors_response(1, "Profile does not exist", [])
    elif request.data["action"] == "UserAccountToAirtel":
        errors, account_to_airtel = user_account_payout_utils.user_account_to_airtel(request.data, request.user)
        if account_to_airtel:
            return custom_json_response(0,"Payout to Airtel Money successful", "account_to_airtel", account_to_airtel)
        else:
            return custom_errors_response(1, "Payout to Airtel Money failed", errors)
    elif request.data["action"] == "UserAccountToMpesa":
        errors, collection_to_mpesa = user_account_payout_utils.user_account_to_mpesa_payout(request.data, request.user)
        if collection_to_mpesa:
            return custom_json_response(0,"User account payout to mpessa successful", "collection_to_mpesa", collection_to_mpesa)
        else:
            return custom_errors_response(1, "User account payout to mpesa not sucessful", errors)
    elif request.data["action"] == "UserAccountToBank":
        errors, account_to_bank = user_account_payout_utils.user_account_to_bank(request.data, request.user)
        if account_to_bank:
            return custom_json_response(0,"Payout to bank successful", "collection_to_bank", account_to_bank)
        else:
            return custom_errors_response(1, "Payout to bank not sucessful", errors)
    elif request.data["action"] == "UserAccountToTill":
        errors, account_to_till = user_account_payout_utils.user_account_to_till(request.data, request.user)
        if account_to_till:
            return custom_json_response(0,"Payout to till successful", "account_to_till", account_to_till)
        else:
            return custom_errors_response(1, "Payout to till not sucessful", errors)
    elif request.data["action"] == "UserAccountToPaybill":
        errors, account_to_paybill = user_account_payout_utils.user_account_to_paybill(request.data, request.user)
        if account_to_paybill:
            return custom_json_response(0,"Payout to paybill successful", "account_to_paybill", account_to_paybill)
        else:
            return custom_errors_response(1, "Payout to till not sucessful", errors)
    elif request.data["action"] == "CheckUserAccountPinStatus":
        errors, message = user_account_payout_utils.check_user_account_pin_status(request.user)
        if message:
            return custom_json_response(0,message, "user_account", None)
        else:
            return custom_errors_response(1, "User account pin check not sucessful", errors)
    elif request.data["action"] == "SetUserAccountPin":
        errors, message = user_account_payout_utils.set_user_account_pin(request.user,request.data)
        if message:
            return custom_json_response(0,message, "user_account", None)
        else:
            return custom_errors_response(1, "User account pin check not sucessful", errors)
    elif request.data["action"] == "ChangeUserAccountPin":
        errors, message = user_account_payout_utils.change_user_account_pin(request.user,request.data)
        if message:
            return custom_json_response(0,message, "user_account", None)
        else:
            return custom_errors_response(1, "User account pin check not sucessful", errors)
    elif request.data["action"] == "CreateEntityRegistrationFeePayment":
        errors, payment = payment_utils.create_entity_registration_fee_payment(request.user,request.data)
        if payment:
            serializer =serializers.EntityRegistrationFeePaymentsSerializer(payment,many=False).data
            return custom_success_message(0, "Registration payment sucessfully created",serializer,"registration_payment")
        else:
            return custom_errors_response(1, "Registration payment not created", errors)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')
    

def set_mandatory_entity_subscription_to_all_entity_accounts(entity_subscrition):
    subscribers = []
    if models.UserAccounts.objects.filter(owner__entity=entity_subscrition.entity).exists():
        subscribers = models.UserAccounts.objects.filter(owner__entity=entity_subscrition.entity).all()
        for i in subscribers:
            i.entity_subscriptions.add(entity_subscrition)
            i.save()

            message = f"Admin at {entity_subscrition.entity} has added your account {i} to {entity_subscrition} subscription"

            payload = {
                    "contact" : i.account_phone,
                    "message" : message,
                    "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                    "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                }

            errors, sent = send_swift_sms(payload)


class EntitySubscriptionsCreateAPIView(generics.GenericAPIView):
    """
    Create new entity subscription
    """

    name = "sacco-subscription-create"
    permission_classes = (app_permissions.AdminsOnlyPermissions,)
    serializer_class = serializers.EntitySubscriptionsSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        title = request.POST.get("title", None)

        # if not preparation:
        #     raise exceptions.ValidationError("Preparation is required")
        if not title:
            raise exceptions.ValidationError("Title is required")
        if request.user.entity and title:
            if (
                models.EntitySubscriptions.objects.filter(
                    entity=request.user.entity,
                    title__icontains=title,
                ).count()
                > 0
            ):
                existing =models.EntitySubscriptions.objects.filter(
                    entity=request.user.entity,
                    title__icontains=title,
                ).first()
                print("Existing", existing)
                return Response(
                    data={
                        "response_code": 1,
                        "response_message": f"Subscription named {title} for this entity already exists",
                        
                    },
                    status=status.HTTP_200_OK,
                )
                
        files = request.FILES.getlist("banners")
        if files:
            request.data.pop("banners")
            serializer_context = {
                "request": request,
            }

            serializer = serializers.EntitySubscriptionsSerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    raise exceptions.ValidationError(exc)
                item = models.EntitySubscriptions.objects.get(id=serializer.data["id"])
                errors_messages = []

                uploaded_files = []
                for file in files:
                    content = models.EntitySubscriptionsBanners.objects.create(
                        owner=request.user,
                        banner=file,
                        subscription=item,
                        entity=request.user.entity,
                    )
                    uploaded_files.append(content)

                item.banners.add(*uploaded_files)
                item.save()
                context = serializer.data
                arr =[]

                ls= serializers.EntitySubscriptionsBannersSerializer(item.banners,context={'request': request}, many=True).data,
                context["banners"] =arr

                errors_messages = []
                if item.mandatory=="true":
                    set_mandatory_entity_subscription_to_all_entity_accounts(item)
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Entity subscription succesfully created",
                        "entity_subscription": serializers.EntitySubscriptionsSerializer(item,context={'request': request}).data,
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
                        create_log("errors", error_message)
                        errors_messages.append(error_message)

                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Entity subscription not created",
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

            serializer = serializers.EntitySubscriptionsSerializer(
                data=request.data, context=serializer_context
            )
            # serializer.is_valid(raise_exception=   True)
            if serializer.is_valid():
                try:
                    serializer.save(owner=request.user,
                                    entity=request.user.entity)
                except IntegrityError as exc:
                    create_log("error", str(exc))
                    raise exceptions.ValidationError(
                        str(exc)
                    )

                user_data = serializer.data
                item = models.EntitySubscriptions.objects.get(id=serializer.data["id"])
                if item.mandatory=="true":
                    set_mandatory_entity_subscription_to_all_entity_accounts(item)
                # Retrieve user from database
                errors_messages = []
                return Response(
                    data={
                        "response_code": 0,
                        "response_message": "Entity subscription succesfully created",
                        "entity_subscription": serializer.data,
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
                        create_log("error", error_message)
                        errors_messages.append(error_message)

                

                return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Entity subscription not created",
                        "product": serializer.data,
                        "errors": errors_messages,
                        "status": status.HTTP_400_BAD_REQUEST,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )


class EntitySubscriptionsListAPIView(generics.ListAPIView):
    """
    Subscriptions listing
    """

    name = "entity-subscriptions-list"
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = serializers.EntitySubscriptionsSerializer
    queryset = models.EntitySubscriptions.objects.all()
    filter_backends = (SearchFilter,)

    # Searching and filtering
    search_fields = (
        "title",
        "description",

    )
    ordering_fields = ("title", "description", "id")
    ordering = ["title"]

    def get_queryset(self):
        if self.request.user.is_staff:
            return super().get_queryset().all()
        else:
            # TODO : Return only subscription for user entity
            return self.queryset.filter(
                entity=self.request.user.entity
            )

class EntitySubscriptionsUpdateAPIView(generics.RetrieveUpdateAPIView):
    """
    Update entity subscription witth banners

    """

    name = "entity-subscriptions-update"
    permission_classes = (app_permissions.AdminsOnlyPermissions,)
    serializer_class = serializers.EntitySubscriptionsSerializer
    parser_classes = (MultiPartParser, FormParser)
    queryset = models.EntitySubscriptions.objects.all()
    lookup_fields = ("pk",)

    def update(self, request, *args, **kwargs):
        """
        Update subscription with new banners
        """
        files = request.FILES.getlist("banners")
        instance = self.get_object()
        serializer_context = {
            "request": request,
        }
        serializer = serializers.EntitySubscriptionsSerializer(
            instance, context=serializer_context
        )
        if files:
            uploaded_files = []
            for file in files:
                content = models.EntitySubscriptionsBanners.objects.create(
                    owner=request.user,
                    banner=file,
                    entity=request.user.entity,
                    subscription=instance,
                )
                uploaded_files.append(content)

            instance.banners.add(*uploaded_files)
            instance.save()
            context = serializer.data
            context["banners"] = [file.id for file in uploaded_files]
            print('Created', content)

        data = request.data
        

        if "is_active" in data:
            is_active = data.get("is_active", None)
            if is_active:
                instance.is_active = is_active
                instance.save()


        return Response(serializer.data)

    def get_object(self):
        queryset = self.get_queryset()
        filter = {}
        for field in self.lookup_fields:
            filter[field] = self.kwargs[field]

        obj = get_object_or_404(queryset, **filter)
        self.check_object_permissions(self.request, obj)
        return obj