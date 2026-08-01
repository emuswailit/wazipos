from rest_framework.pagination import PageNumberPagination
from rest_framework import generics, permissions, response, status, exceptions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import transaction
from core.phone_number_utils import get_telco_by_phone_number
from core.responses import custom_error_response, custom_json_response, custom_success_message,custom_errors_response
from intergrations.jambopay.jambopay_get_profile_accounts import get_jambopay_main_profile
from . import sacco_permissions
from .utils  import sacco_utils
from . import serializers,models
from rest_framework_simplejwt.tokens import RefreshToken
from . import models
from django.contrib.sites.shortcuts import get_current_site
from django.urls import reverse
from utils.logging import create_log
from decouple import config
from django.db import IntegrityError
from rest_framework.mixins import CreateModelMixin
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import JsonResponse
from authentication.serializers import CorporateRegisterSerializer,UserDocumentsSerializer
from authentication.renderers import UserRenderer
from authentication.utils import utils,sms_utils
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms
from saccos.models import Members,MemberAccounts
from authentication.validators import authentication_models_validators
from rest_framework.response import Response
from employees.validators import employees_models_validators
from .utils import sacco_models_validators
from authentication.models import UserDocuments
from employees.serializers import EmployeesSerializer

@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]
)
def saccoMemberAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "MemberAccountBalance":
        errors, balance = sacco_utils.retrieve_member_account_balance(request.data, request.user)
        if balance:
          
            return custom_json_response(0, "Member account balance sucessfully retrieved","balance",balance)
        else:
            return custom_errors_response(1, "Member account balance not retrieves", errors)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')
    

@api_view(["POST"])
@permission_classes(
    [
        sacco_permissions.SaccoStaffPermission,
    ]
)
def saccoStaffAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    if request.data["action"] == "CreateLoanCollateral":

        errors, collateral = sacco_utils.create_loan_collateral(
            request.data, request.user
        )
        if collateral:
            serializer = serializers.CollateralsSerializer(
                collateral, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Loan collateral created successfully",
                serializer.data,
                "collateral",
            )

        else:
            return custom_errors_response(
                1, "Loan collateral could not be created",errors
            )
    elif request.data["action"] == "CreateLoanGuarantor":

        errors, guarantor = sacco_utils.create_loan_guarantor(
            request.data, request.user
        )
        if guarantor:
            serializer = serializers.GuarantorsSerializer(
                guarantor, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Loan guarantor created successfully",
                serializer.data,
                "guarantor",
            )

        else:
            return custom_errors_response(
                1, "Loan guarantor could not be created",errors
            )
    elif request.data["action"] == "CreateCashier":

        errors, cashier = sacco_utils.create_cashier(
            request.data, request.user
        )
        if cashier:
            serializer = serializers.CashiersSerializer(
                cashier, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco cashier created successfully",
                serializer.data,
                "cashier",
            )

        else:
            return custom_errors_response(
                1, "Sacco cashier could not be created",errors
            )
        
    elif request.data["action"] == "GetBranchCashiers":
        """Get branch cashiers"""

        branch_cashiers = sacco_utils.get_branch_cashiers(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(branch_cashiers, request)
        serializer = serializers.CashiersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateTeller":

        errors, teller = sacco_utils.create_teller(
            request.data, request.user
        )
        if teller:
            serializer = serializers.TellersSerializer(
                teller, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco teller created successfully",
                serializer.data,
                "teller",
            )

        else:
            return custom_errors_response(
                1, "Sacco teller could not be created",errors
            )
        
    elif request.data["action"] == "GetBranchTellers":
        """Get branch tellers"""

        branch_tellers = sacco_utils.get_branch_tellers(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(branch_tellers, request)
        serializer = serializers.TellersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateSaccoDividend":

        errors, sacco_dividend = sacco_utils.create_sacco_dividend(
            request.data, request.user
        )
        if sacco_dividend:
            serializer = serializers.DividendsSerializer(
                sacco_dividend, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco dividend created successfully",
                serializer.data,
                "sacco_dividend",
            )

        else:
            return custom_errors_response(
                1, "Sacco dividend could not be created",errors
            )
        
    elif request.data["action"] == "GetSaccoDividends":
        """Get dividends"""

        sacco_dividends = sacco_utils.get_sacco_dividends(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sacco_dividends, request)
        serializer = serializers.DividendsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateSaccoCharge":

        errors, sacco_charge = sacco_utils.create_sacco_charge(
            request.data, request.user
        )
        if sacco_charge:
            serializer = serializers.SaccoChargesSerializer(
                sacco_charge, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco charge created successfully",
                serializer.data,
                "sacco_charge",
            )

        else:
            return custom_errors_response(
                1, "Sacco charge could not be created",errors
            )
        
    elif request.data["action"] == "GetSaccoCharges":
        """Get sacco charges"""

        sacco_charges = sacco_utils.get_sacco_charges(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sacco_charges, request)
        serializer = serializers.SaccoChargesSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateLoan":

        errors, loan = sacco_utils.create_loan(
            request.data, request.user
        )
        if loan:
            serializer = serializers.LoansSerializer(
                loan, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Loan created successfully",
                serializer.data,
                "loan",
            )

        else:
            return custom_errors_response(
                1, "Loan could not be created",errors
            )
    if request.data["action"] == "UpdateLoan":

        errors, loan = sacco_utils.update_loan(
            request.data, request.user
        )
        if loan:
            serializer = serializers.LoanApplicationsSerializer(
                loan, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Loan updated successfully",
                serializer.data,
                "loan",
            )

        else:
            return custom_errors_response(
                1, "Loan  could not be cupdaredreated",errors
            )
    elif request.data["action"] == "GetSaccoMemberLoans":
        """Get sacco member loans"""

        sacco_products = sacco_utils.get_sacco_member_loans(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sacco_products, request)
        serializer = serializers.LoansSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateLoanApplication":

        errors, loan_application = sacco_utils.create_loan_application(
            request.data, request.user
        )
        if loan_application:
            serializer = serializers.LoanApplicationsSerializer(
                loan_application, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Loan application created successfully",
                serializer.data,
                "loan_application",
            )

        else:
            return custom_errors_response(
                1, "Loan application could not be created",errors
            )
    if request.data["action"] == "UpdateLoanApplication":

        errors, loan_application = sacco_utils.update_loan_application(
            request.data, request.user
        )
        if loan_application:
            serializer = serializers.LoanApplicationsSerializer(
                loan_application, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Loan application created successfully",
                serializer.data,
                "loan_application",
            )

        else:
            return custom_errors_response(
                1, "Loan application could not be created",errors
            )
    elif request.data["action"] == "GetLoanApplications":
        """Get loan applications"""

        loan_applications = sacco_utils.get_loan_applications(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(loan_applications, request)
        serializer = serializers.LoanApplicationsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateMemberReferee":

        errors, member_referee = sacco_utils.create_member_referee(
            request.data, request.user
        )
        if member_referee:
            serializer = serializers.RefereesSerializer(
                member_referee, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco member referee created successfully",
                serializer.data,
                "member_referee",
            )

        else:
            return custom_errors_response(
                1, "Sacco member referee could not be created",errors
            )
    elif request.data["action"] == "CreateMemberNextfKin":

        errors, member_next_of_kin = sacco_utils.create_member_next_of_kin(
            request.data, request.user
        )
        if member_next_of_kin:
            serializer = serializers.NextOfKinsSerializer(
                member_next_of_kin, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco member next of kin created successfully",
                serializer.data,
                "member_next_of_kin",
            )

        else:
            return custom_errors_response(
                1, "Sacco member next of kin could not be created",errors
            )
    elif request.data["action"] == "CreateSaccoAccount":

        errors, sacco_account = sacco_utils.create_sacco_account(
            request.data, request.user
        )
        if sacco_account:
            serializer = serializers.SaccoAccountsSerializer(
                sacco_account, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco account created successfully",
                serializer.data,
                "sacco_account",
            )

        else:
            return custom_errors_response(
                1, "Sacco member account transaction could not be created",errors
            )
    
    elif request.data["action"] == "CreateMemberAccountTransaction":

        errors, member_account_transaction = sacco_utils.create_member_account_transaction_transaction(
            request.data, request.user
        )
        if member_account_transaction:
            serializer = serializers.MemberAccountTransactionsSerializer(
                member_account_transaction, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco member account transaction created successfully",
                serializer.data,
                "member_account_transaction",
            )

        else:
            return custom_errors_response(
                1, "Sacco member account transaction could not be created",errors
            )
    elif request.data["action"] == "GetSaccoAccounts":
        """Get sacco member accounts"""

        sacco_accounts = sacco_utils.get_sacco_accounts(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sacco_accounts, request)
        serializer = serializers.SaccoAccountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateMemberAccount":

        errors, member_account = sacco_utils.create_member_account(
            request.data, request.user
        )
        if member_account:
            serializer = serializers.MembersAccountsSerializer(
                member_account, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco member account created successfully",
                serializer.data,
                "member_account",
            )

        else:
            return custom_errors_response(
                1, "Sacco member account could not be created",errors
            )
    elif request.data["action"] == "UpdateMemberAccount":

        errors, member_account = sacco_utils.update_member_account(
            request.data, request.user
        )
        if member_account:
            serializer = serializers.MembersAccountsSerializer(
                member_account, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco member account updated successfully",
                serializer.data,
                "member_account",
            )

        else:
            return custom_errors_response(
                1, "Sacco member account could not be updated",errors
            )
    elif request.data["action"] == "GetSaccoMemberAccounts":
        """Get sacco member accounts"""

        sacco_products = sacco_utils.get_sacco_member_accounts(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sacco_products, request)
        serializer = serializers.MembersAccountsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateSaccoProduct":

        errors, sacco_product = sacco_utils.create_sacco_products(
            request.data, request.user
        )
        if sacco_product:
            serializer = serializers.SaccoProductsSerializer(
                sacco_product, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco product created successfully",
                serializer.data,
                "sacco_product",
            )

        else:
            return custom_errors_response(
                1, "Sacco product could not be created",errors
            )
    elif request.data["action"] == "UpdateSaccoProduct":

        errors, sacco_product = sacco_utils.update_sacco_product(
            request.data, request.user
        )
        if sacco_product:
            serializer = serializers.SaccoProductsSerializer(
                sacco_product, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Sacco product created successfully",
                serializer.data,
                "sacco_product",
            )

        else:
            return custom_errors_response(
                1, "Sacco product could not be created",errors
            )
    elif request.data["action"] == "GetSaccoProducts":
        """Get sacco products"""

        sacco_products = sacco_utils.get_sacco_products(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sacco_products, request)
        serializer = serializers.SaccoProductsSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetBranchSaccoMembers":
        """Get branch sacco members"""

        sacco_members = sacco_utils.get_branch_sacco_members(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sacco_members, request)
        serializer = serializers.MembersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchSaccoMemberAccounts":
        """Search branch sacco members"""

        sacco_members = sacco_utils.search_branch_sacco_members(request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sacco_members, request)
        serializer = serializers.MembersSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetBranchEmployees":
        """Get branch sacco employees"""

        sacco_members = sacco_utils.get_branch_sacco_employees(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(sacco_members, request)
        serializer = EmployeesSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    
    elif request.data["action"] == "SendSaccoMemberOTP":
        # switch user to entity

        errors, user = sacco_utils.send_sacco_user_sms_code(request.data)
        if user:
            serializer = serializers.SaccoUserSerializer(
                request.user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "OTP sent successfully", serializer.data, "user"
            )

        else:
            return   custom_errors_response(1, "OTP not sent", errors)
    elif request.data["action"] == "VerifySaccoMemberOTP":

        errors,user = sacco_utils.verify_sacco_member_otp(request.data, request.user)
        if user:
            serializer = serializers.SaccoUserSerializer(
                user, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "OTP verified succesfully", serializer.data, "user"
            )

        else:
            return custom_errors_response(1, "OTP could not be verified",errors)
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')
    

class SaccoUserRegisterView(CreateModelMixin, generics.GenericAPIView):
    """
    Register User user by admin
    """
   

    serializer_class = serializers.SaccoUserSerializer
    renderer_classes = (UserRenderer,)
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (sacco_permissions.SaccoStaffPermission,)

    # @transaction.atomic
            
    def post(self, request):
        errors =[]
        phone =request.data['phone']
        email =request.data['email']
        identifier_number =request.data['identifier_number']
        password = request.data['password']
        if phone and  models.Users.objects.filter(phone=phone).exists():
            errors.append("Phone is already in use")
        if email and models.Users.objects.filter(email=email).exists():
            errors.append("Email is already in use")

        if identifier_number and models.Users.objects.filter(identifier_number=identifier_number).exists():
            errors.append("User identifier number is already in use")

        if len(errors)>0:
            return JsonResponse(
                        {
                                "response_code": 1,
                                "response_message": "User not created",
                                "errors": errors,
                            
                            },
                
                        )
        employee = employees_models_validators.validate_employee_by_user_and_entity(request.user,request.user.entity)

        errors_messages=[]
        req_user=None
        phone_number =None
        occupation=None
        isBBFMember=None
        telco =None
        user_obj=None
        if "occupation" in request.data and not  request.data["occupation"]=="":
            occupation =  request.data["occupation"]
            request.data.pop("occupation")

        if "isBBFMember" in request.data and not  request.data["isBBFMember"]=="":
            isBBFMember =  request.data["isBBFMember"]
            request.data.pop("isBBFMember")


        documents = request.FILES.getlist("documents")
        if documents:
            request.data.pop("documents")
            serializer_context = {
                "request": request,
            }
        else:
            errors_messages.append("User ID or passport images required")
            return Response(
                    data={
                        "response_code": 1,
                        "response_message": "User  not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        
        photos = request.FILES.getlist("photos")
        if photos:
            request.data.pop("photos")
            serializer_context = {
                "request": request,
            }
        else:
            errors_messages.append("User passport size photo required")
            return Response(
                    data={
                        "response_code": 1,
                        "response_message": "User  not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        
        signatures = request.FILES.getlist("signatures")
        if signatures:
            request.data.pop("signatures")
            serializer_context = {
                "request": request,
            }
        else:
            errors_messages.append("User sample signature photo required")
            return Response(
                    data={
                        "response_code": 1,
                        "response_message": "User  not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )

        user_phone = request.POST.get("phone", None)
        if user_phone and not user_phone=="":
            telco, phone_number = get_telco_by_phone_number(user_phone)
            if authentication_models_validators.validate_user_with_phone_exists(phone_number):
                user_obj=authentication_models_validators.validate_user_with_phone_exists(phone_number)
            else:
                user_obj = None

        
                req_user = request.data

                serializer = self.serializer_class(data=req_user, context={"request": request, "user":request.user})
                # serializer.is_valid(raise_exception=   True)
                if serializer.is_valid():
                    profile = None
                    serializer.save(owner=request.user)
                    user_data = serializer.data
                    # Retrieve user from database
                    # user = models.Users.objects.get(email=user_data["email"])
                    user_obj = models.Users.objects.get(phone=user_data["phone"])
                    # user.entity=request.user.entity
                    # user.owner=request.user

                    user_obj.accepted_terms="true"
                    user_obj.iprs_verified="true"
                    user_obj.save()
                    if documents:
                        uploaded_files = []
                        for file in documents:
                            content = UserDocuments.objects.create(
                                owner=request.user,
                                document=file,
                                document_number=user_obj.identifier_number,
                                document_type=user_obj.identifier_type,
                                is_valid=True,
                                is_verified="true"
                            )
                            uploaded_files.append(content)

                        user_obj.documents.add(*uploaded_files)
                        user_obj.save()
                        context = serializer.data
                        arr =[]

                
                        # context["documents"] = [file.id for file in uploaded_files]
                        # context["documents"] = [file.id for file in uploaded_files]
                        context["documents"] = [image for image in uploaded_files]
                        ls= UserDocumentsSerializer(user_obj.documents,context={'request': request}, many=True).data,
                        context["documents"] =arr

                


                    # Generate token
                    token = RefreshToken.for_user(user_obj).access_token
                    # Get current site
                    # TODO: Ensure current site settings have been updated in the django admin panel
                    current_site = get_current_site(request).domain
                    # current_site = 'wazipos.com'
                    relativeLink = reverse("email-verify")
                    # generate absolute url
                    absurl = (
                        "https://" + current_site + relativeLink + "?token=" + str(token)
                    )
                    email_body = (
                        "Hi "
                        + user_obj.first_name
                        + " "
                        + user_obj.last_name
                        + " Use link below to verify your email \n"
                        + absurl
                    )
                    # message = f"Your account for {user.entity} has been created at JAMBOPAY. Your password is {password}"
                    time_otp = sms_utils.generate_otp(user_obj)
                    message =f"{request.user.entity.title} verification OTP {time_otp}.Use it to activate your account."
                    payload = {
                            "contact" : user_obj.phone,
                            "message" : message,
                            "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                            "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                        }
                
                    errors, sent = send_swift_sms(payload)
                    data = {
                        "email_body": email_body,
                        "to_email": user_obj.email,
                        "email_subject": "Verify your email address",
                    }

                    utils.Util.send_email(data)

                    errors_messages = []
                    # sent = sms_utils.send_sms_code(user)
                    # sent = sms_utils.send_password(user, request.data['password'])
                    # return JsonResponse(
                    #     data={
                    #         "response_code": 0,
                    #         "response_message": "User succesfully created",
                    #         "user": serializer.data,
                    #         "errors": errors_messages,
                    #     },
                    #     status=status.HTTP_201_CREATED,
                    # )
                else:
                    default_errors = serializer.errors  # default errors dict
                    errors_messages = []
                    for field_name, field_errors in default_errors.items():
                        for field_error in field_errors:
                            error_message = "%s: %s" % (field_name, field_error)
                            errors_messages.append(error_message)

                    return JsonResponse(
                        data={
                            "response_code": 1,
                            "response_message": "User not created",
                            "errors": errors_messages,
                            "status": status.HTTP_200_OK,
                        },
                        status=status.HTTP_200_OK,
                    )
                
        else:
            errors_messages.append("User phone number required")
            return Response(
                    data={
                        "response_code": 1,
                        "response_message": "User  not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )




        if user_obj:
            errors, profile = get_jambopay_main_profile(user_obj.phone)
            if profile:
                user_obj.is_jp_profile_updated = True
                user_obj.save()


            print("Finally my user", user_obj)
            if models.Members.objects.filter(user=user_obj).exists():
                member = models.Members.objects.filter(user=user_obj).first()
                if len(member.photos.all())<1:
                    """Update photos"""
                    uploaded_photos = []
                    for file in photos:
                        content = models.MemberPhotos.objects.create(
                            owner=request.user,
                            photo=file,
                            member=member,
                            entity=request.user.entity,
                            
                            
                        )
                        uploaded_photos.append(content)

                    member.photos.add(*uploaded_photos)
                    member.save()
                if len(member.signatures.all())<1:
                    """Update signatures"""
                    uploaded_signatures = []
                    for file in signatures:
                        content = models.MemberPhotos.objects.create(
                            owner=request.user,
                            signature=file,
                            member=member,
                            entity=request.user.entity,
                            
                            
                        )
                        uploaded_signatures.append(content)

                    member.signatures.add(*uploaded_signatures)
                    member.save()

            else:
                try:
                    member = models.Members.objects.create(
                    user=user_obj,  
                    isActive="true",
                    isBBFMember=isBBFMember,
                    occupation=occupation,
                    madeBy=employee,
                    branch=employee.current_branch,
                    entity=request.user.entity
                    )

                    uploaded_photos = []
                    for file in photos:
                        content = models.MemberPhotos.objects.create(
                            owner=request.user,
                            photo=file,
                            member=member,
                            entity=request.user.entity,
                            
                            
                        )
                        uploaded_photos.append(content)

                    member.photos.add(*uploaded_photos)
                    member.save()

                    uploaded_signatures = []
                    for file in signatures:
                        content = models.MemberPhotos.objects.create(
                            owner=request.user,
                            signature=file,
                            member=member,
                            entity=request.user.entity,
                            
                            
                        )
                        uploaded_signatures.append(content)

                    member.signatures.add(*uploaded_signatures)
                    member.save()
   
                except Exception as e:
                    create_log("error",str(e))
            return JsonResponse(
                        data={
                            "response_code": 0,
                            "response_message": "User succesfully created",
                            "user":  serializers.SaccoUserSerializer(user_obj,context={'request': request}).data,
                            "errors": errors_messages,
                        },
                        status=status.HTTP_201_CREATED,
                    )
        
        else:
            errors_messages.append("An error occurred while creating member. Please try again")
            return JsonResponse(
                        data={
                            "response_code": 1,
                            "response_message": "User not  created",
                        
                            "errors": errors_messages,
                        },
                        status=status.HTTP_201_CREATED,
                    )

   
     




    
class MemberRegisterView(generics.GenericAPIView):
    """
    Create new sacco member
    """

    name = "member-create"
    permission_classes = (sacco_permissions.SaccoStaffPermission,)
    serializer_class = serializers.MembersSerializer
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        "Create sacco member"
        employee = None
        user_id =None
        accountAdministratorId =None
        accountAdministrator =None
        user = None
        errors_messages=[]

        user_id = request.POST.get("user", None)
        if user_id and not user_id=="":
            user = authentication_models_validators.validate_user(user_id)
        else:
            errors_messages.append("User ID is required")
            return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Sacco member not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                    status=status.HTTP_200_OK,
                )
        employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)


        signatures = request.FILES.getlist("signatures")
        if signatures:
            request.data.pop("signatures")
            serializer_context = {
                "request": request,
            }
        else:
            errors_messages.append("Sample signatures are required")
            return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Sacco member not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },

                )
        photos = request.FILES.getlist("photos")
        if photos:
            request.data.pop("photos")
            serializer_context = {
                "request": request,
            }
        else:
            errors_messages.append("Passport photos are required")
            return Response(
                    data={
                        "response_code": 1,
                        "response_message": "Sacco member not created",
                        "errors": errors_messages,
                        "status": status.HTTP_200_OK,
                    },
                )

        serializer = serializers.MembersSerializer(
            data=request.data, context=serializer_context
        )
        
        if serializer.is_valid():
            try:
                serializer.save(madeBy=employee,
                                
                                    branch=employee.current_branch,
                                entity=request.user.entity)
            except IntegrityError as exc:
                raise exceptions.ValidationError(exc)
            item = models.Members.objects.get(id=serializer.data["id"])
            errors_messages = []

            uploaded_photos = []
            for file in photos:
                content = models.MemberPhotos.objects.create(
                    owner=request.user,
                    photo=file,
                    member=item,
                    entity=request.user.entity,
                    
                    
                )
                uploaded_photos.append(content)

            item.signatures.add(*uploaded_photos)
            item.save()

            uploaded_signatures = []
            for file in signatures:
                content = models.MemberPhotos.objects.create(
                    owner=request.user,
                    signature=file,
                    member=item,
                    entity=request.user.entity,
                    
                    
                )
                uploaded_signatures.append(content)

            item.signatures.add(*uploaded_signatures)
            item.save()
            context = serializer.data
         
            ls= serializers.MemberPhotosSerializer(item.photos,context={'request': request}, many=True).data,
            ls= serializers.MemberSignaturesSerializer(item.signatures,context={'request': request}, many=True).data,
   

            errors_messages = []
            return Response(
                data={
                    "response_code": 0,
                    "response_message": "Sacco member succesfully created",
                    "sacco_member": serializers.MembersSerializer(item,context={'request': request}).data,
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
                    "response_message": "Sacco member not created",
                    "sacco_member": serializer.data,
                    "errors": errors_messages,
                    "status": status.HTTP_200_OK,
                },
                status=status.HTTP_200_OK,
            )


