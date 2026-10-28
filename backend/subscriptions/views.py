import json
import time
import requests
from decimal import Decimal
from decouple import config
from rest_framework.decorators import api_view, permission_classes
from rest_framework import permissions, exceptions
from rest_framework.pagination import PageNumberPagination
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

# Payments & Subscriptions Models/Serializers
from payments.models import PaymentMethods, UserAccounts
from .models import Subscription, SubscriptionPayment
from .serializers import SubscriptionSerializer, SubscriptionPaymentsSerializer

Users = get_user_model()


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def subscriptionsDispatcherAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    # Get entity directly from the logged-in user
    entity = request.user.entity
    if not entity:
        raise exceptions.ValidationError("User is not associated with any entity")

    # ==========================================
    # 1. GET ENTITY SUBSCRIPTIONS
    # ==========================================
    if action == "GetEntitySubscriptions":
        subscriptions = Subscription.objects.filter(
            entity=entity
        ).order_by('-created')

        paginator = PageNumberPagination()
        paginator.page_size = request.data.get("page_size", 10) 
        paginated_subscriptions = paginator.paginate_queryset(subscriptions, request)

        if not paginated_subscriptions and paginator.page.paginator.count == 0:
            return custom_error_response(1, "No subscriptions found for this entity")

        serializer = SubscriptionSerializer(
            paginated_subscriptions, 
            many=True, 
            context={"request": request}
        )

        return custom_success_message(
            0, 
            "Subscriptions retrieved successfully", 
            {
                "results": serializer.data,
                "count": paginator.page.paginator.count,
                "next": paginator.get_next_link(),
                "previous": paginator.get_previous_link(),
            }, 
            "subscriptions"
        )

    # ==========================================
    # 2. GET ENTITY SUBSCRIPTION PAYMENTS
    # ==========================================
    elif action == "GetEntitySubscriptionPayments":
        payments = SubscriptionPayment.objects.filter(
            entity=entity
        ).order_by('-created')

        paginator = PageNumberPagination()
        paginator.page_size = request.data.get("page_size", 10) 
        paginated_payments = paginator.paginate_queryset(payments, request)

        if not paginated_payments and paginator.page.paginator.count == 0:
            return custom_error_response(1, "No subscription payments found for this entity")

        serializer = SubscriptionPaymentsSerializer(
            paginated_payments, 
            many=True, 
            context={"request": request}
        )

        return custom_success_message(
            0, 
            "Subscription payments retrieved successfully", 
            {
                "results": serializer.data,
                "count": paginator.page.paginator.count,
                "next": paginator.get_next_link(),
                "previous": paginator.get_previous_link(),
            }, 
            "payments"
        )

    # ==========================================
    # 3. INITIATE SUBSCRIPTION PAYMENT
    # ==========================================
    elif action == "InitiateSubscriptionPayment":
        mobile_money_phone = request.data.get("phone_number")
        errors = []

        if not mobile_money_phone:
            return custom_error_response(1, "phone_number is required")

        payment_method = PaymentMethods.objects.filter(title="MOBILE MONEY").first()
        if not payment_method:
            return custom_error_response(1, "Mobile Money payment method not configured")

        if not UserAccounts.objects.filter(owner=entity.administrator).exists():
            return custom_error_response(1, "Entity admin has no collection account")

        administrator_account = UserAccounts.objects.filter(
            owner=entity.administrator
        ).first()

        try:
            telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
        except Exception as e:
            return custom_error_response(1, f"Invalid phone number: {str(e)}")

        amount = int(entity.monthly_subscription or 0)
        if amount <= 0:
            return custom_error_response(1, "This entity does not have a valid subscription amount configured")

        reference_number = generate_reference_number(entity, request.user)
        payload = None

        # 5. Build Payload
        if telco == "MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": amount,
                "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                "accountTo": administrator_account.account_number,
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })
            create_log("info", f"subscription payment {payload}")
            
        elif telco == "AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": str(amount),
                "callBackUrl": "https://webhook.site/55963e0b-b692-42b6-a682-0223eaf7fbff",
                "accountTo": administrator_account.account_number,
                "currency": "KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })
        else:
            return custom_error_response(1, f"Unsupported telco: {telco}")

        # 6. Authenticate with JamboPay
        the_data = {
            "client_id": config("JAMBOPAY_CLIENT_ID"),
            "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
            "grant_type": config("JAMBOPA_GRANT_TYPE"),
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        
        try:
            result = requests.post(
                config("JAMBOPAY_AUTH_URL1"),
                data=the_data,
                headers=headers,
            )
            result_json = result.json()
            token = result_json.get("access_token") if result_json else None
        except Exception as e:
            return custom_error_response(1, f"JamboPay Auth failed: {str(e)}")

        if not token:
            return custom_error_response(1, "Token not generated from JamboPay")

        # 7. Make the Checkout Call
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            "Accept": "*/*",
        }
        
        try:
            result = requests.post(
                config("JAMBOPAY_BASE_URL") + "/checkout/express",
                data=payload,
                headers=headers,
            )
            result_json = result.json()
            create_log("info", f"result_json {result_json}")
        except Exception as e:
            return custom_error_response(1, f"JamboPay Checkout failed: {str(e)}")

        if not result_json or "ref" not in result_json:
            create_log("info", f"from jp errors {errors}")
            return custom_error_response(1, "Payment failed at JamboPay")

        # 8. Create Record & Poll (3 attempts over 30 seconds)
        try:
            sub_payment = SubscriptionPayment.objects.create(
                reference_number=reference_number,
                psp_reference_number=result_json["ref"],
                amount=Decimal(str(amount)),
                entity=entity,
                owner=request.user,
                status="PENDING",
            )
            create_log("info", f"sub_payment created: {sub_payment.id}")
            use_reference_number(reference_number)

            # POLLING LOGIC: 3 attempts, 10 seconds apart (max 30 seconds)
            max_attempts = 3
            poll_interval = 10 
            tx_data = result_json
            
            order_id = result_json.get("orderId", reference_number) 
            transaction_url = config("JAMBOPAY_BASE_URL") + f"/wallet/transaction/{order_id}"
            poll_headers = {"Authorization": f"Bearer {token}", "Accept": "*/*"}

            create_log("info", f"Starting poll attempts for URL: {transaction_url}")

            for attempt in range(max_attempts):
                try:
                    tx_result = requests.get(transaction_url, headers=poll_headers)
                    create_log("info", f"Poll attempt {attempt + 1} - HTTP Status: {tx_result.status_code}")
                    
                    if tx_result.status_code == 200:
                        tx_data = tx_result.json()
                        create_log("info", f"tx_data : {tx_data}")
                        
                        current_status = str(tx_data.get("status", "")).upper()
                        
                        # If status is no longer PENDING, update DB and break
                        if current_status and current_status != "PENDING":
                            sub_payment.description = tx_data.get("description", "")
                            sub_payment.status = current_status
                            if tx_data.get("providerRef"):
                                sub_payment.provider_reference_number = tx_data.get("providerRef")
                            
                            sub_payment.save()
                            break 
                            
                except Exception as poll_error:
                    create_log("error", f"Polling error for {order_id}: {str(poll_error)}")
                
                # Don't sleep on the very last attempt
                if attempt < max_attempts - 1:
                    time.sleep(poll_interval)

            # Fallback if it timed out and status is still pending/missing
            if tx_data.get("status") is None or str(tx_data.get("status")).upper() == "PENDING":
                tx_data["status"] = "PENDING"
                tx_data["description"] = "User did not enter PIN or request timed out."

            # Return the exact requested payload
            return custom_success_message(
                0,
                "STK push initiated successfully",
                {
                    "payment_id": sub_payment.id,
                    "reference_number": reference_number,
                    "amount": amount,
                    "status": tx_data['status'],
                    "description": tx_data['description'],
                    "jambopay_response": tx_data
                },
                "payment"
            )
            
        except Exception as e:
            create_log("error", str(e))
            return custom_error_response(1, f"Failed to create payment record: {str(e)}")

    # ==========================================
    # 4. UNKNOWN ACTION
    # ==========================================
    raise exceptions.ValidationError(f"Action {action} is unknown")