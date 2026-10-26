import json
from decouple import config
from rest_framework.decorators import api_view, permission_classes
from rest_framework import permissions, exceptions
from django.contrib.auth import get_user_model

# Core responses and logging
from core.responses import custom_success_message, custom_error_response
from utils.logging import create_log

# Authentication Utils
from authentication.utils.utils import (
    generate_reference_number,
    get_telco_by_phone_number,
    use_reference_number,
)

# Payments & Subscriptions
from payments.models import PaymentMethods
from intergrations.jambopay.jp_mobile_money_checkout import (
    jambopay_mobile_checkout,
)
from .models import Subscription, SubscriptionPayment
from .serializers import SubscriptionSerializer

Users = get_user_model()


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def subscriptionsDispatcherAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    # 🌟 Get entity directly from the logged-in user
    entity = request.user.entity
    if not entity:
        raise exceptions.ValidationError("User is not associated with any entity")

    # ==========================================
    # 🌟 1. GET ENTITY SUBSCRIPTIONS
    # ==========================================
    if action == "GetEntitySubscriptions":
        subscriptions = Subscription.objects.filter(
            entity=entity
        ).order_by('-created')[:10]

        if not subscriptions.exists():
            return custom_error_response(1, "No subscriptions found for this entity")

        serializer = SubscriptionSerializer(
            subscriptions, 
            many=True, 
            context={"request": request}
        )

        return custom_success_message(
            0, 
            "Subscriptions retrieved successfully", 
            serializer.data, 
            "subscriptions"
        )

    # ==========================================
    # 🌟 2. INITIATE SUBSCRIPTION PAYMENT
    # ==========================================
    elif action == "InitiateSubscriptionPayment":
        phone_number = request.data.get("phone_number")

        if not phone_number:
            raise exceptions.ValidationError("phone_number is required")

        # 🌟 Fetch the amount from the entity's monthly_subscription attribute
        amount = getattr(entity, "monthly_subscription", 0.00)
        
        if not amount or float(amount) <= 0:
            return custom_error_response(1, "This entity does not have a valid subscription amount configured")

        # 1. Validate the mobile money payment method
        payment_method = PaymentMethods.objects.filter(title="MOBILE MONEY").first()
        if not payment_method:
            return custom_error_response(1, "Mobile Money payment method not configured")

        # 2. Retrieve Platform Collection Till and Jambopay URL from .env
        platform_account_number = config("WAZIPOS_SYSTEM_TILL", default="")
        jambopay_base_url = config("JAMBOPAY_BASE_URL", default="") 
        
        if not platform_account_number:
            return custom_error_response(1, "Platform collection till number is not configured in the environment")

        if not jambopay_base_url:
            return custom_error_response(1, "JamboPay Base URL is not configured in the environment")

        # 3. Get Telco and format phone number
        try:
            telco, formatted_phone_number = get_telco_by_phone_number(phone_number)
        except Exception as e:
            return custom_error_response(1, f"Invalid phone number: {str(e)}")

        # 4. Generate Reference Number
        reference_number = generate_reference_number(entity, request.user)
        
        payload = None

        # 5. Build JamboPay Payload based on Telco
        if telco == "MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": float(amount),
                "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c", 
                "accountTo": platform_account_number, 
                "description": "Subscription Topup",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })
        elif telco == "AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": float(amount),
                "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                "accountTo": platform_account_number, 
                "currency": "KES",
                "description": "Subscription Topup",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })
        else:
            return custom_error_response(1, f"Unsupported Telco: {telco}")

        # 6. Hit JamboPay 
        errors, result_json = jambopay_mobile_checkout(payload)

        if result_json:
            # 7. Create the SubscriptionPayment record
            sub_payment = SubscriptionPayment.objects.create(
                reference_number=reference_number,
                psp_reference_number=result_json.get("ref"),
                amount=float(amount),
                entity=entity,
                owner=request.user,
            )

            # 8. Mark reference number as USED
            use_reference_number(reference_number)

            return custom_success_message(
                0,
                "STK push initiated successfully",
                {
                    "payment_id": sub_payment.id,
                    "reference_number": reference_number,
                    "amount": float(amount),
                },
                "payment"
            )
        else:
            create_log("error", f"Errors at subscription payment: {errors}")
            return custom_error_response(1, f"Payment initiation failed: {errors}")

    # ==========================================
    # 🌟 3. UNKNOWN ACTION
    # ==========================================
    raise exceptions.ValidationError(f"Action {action} is unknown")