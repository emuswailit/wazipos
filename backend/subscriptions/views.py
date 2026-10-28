import json
import time
import requests
from decimal import Decimal
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
from payments.models import PaymentMethods, UserAccounts
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
        mobile_money_phone = request.data.get("phone_number")
        errors = []

        if not mobile_money_phone:
            return custom_error_response(1, "phone_number is required")

        # 1. Validate Mobile Money Method
        payment_method = PaymentMethods.objects.filter(title="MOBILE MONEY").first()
        if not payment_method:
            return custom_error_response(1, "Mobile Money payment method not configured")

        # 2. Check for Entity Admin's Collection Account
        if not UserAccounts.objects.filter(owner=entity.administrator).exists():
            return custom_error_response(1, "Entity admin has no collection account")

        administrator_account = UserAccounts.objects.filter(
            owner=entity.administrator
        ).first()

        # 3. Get Telco and Amount
        try:
            telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
        except Exception as e:
            return custom_error_response(1, f"Invalid phone number: {str(e)}")

        amount = int(entity.monthly_subscription or 0)
        if amount <= 0:
            return custom_error_response(1, "This entity does not have a valid subscription amount configured")

        # 4. Generate Reference
        reference_number = generate_reference_number(entity, request.user)
        payload = None

        # 5. Build Payload
        if telco == "MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": amount,
                "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                "accountTo": administrator_account.account_number,
                "description": "Subscription payment",
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

        create_log("info", f"just before checkout {payload}")

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

        create_log("info", f"result from json: {result_json}")

        # 8. Create SubscriptionPayment Record & Poll for Status
        try:
            sub_payment = SubscriptionPayment.objects.create(
                reference_number=reference_number,
                psp_reference_number=result_json["ref"],
                amount=Decimal(str(amount)),
                entity=entity,
                owner=request.user,
            )
            create_log("info", f"sub_payment created: {sub_payment.id}")
            
            use_reference_number(reference_number)

            # 🌟 9. Poll JamboPay for transaction status (max 30 seconds)
            max_wait_time = 30
            poll_interval = 3
            start_time = time.time()
            
            final_status = "PENDING"
            status_description = "Waiting for PIN entry."
            tx_data = result_json # Fallback to the initial checkout response
            
            order_id = result_json.get("orderId", reference_number) 
            transaction_url = config("JAMBOPAY_BASE_URL") + f"/wallet/transaction/{order_id}"

            poll_headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "*/*",
            }

            while time.time() - start_time < max_wait_time:
                try:
                    tx_result = requests.get(transaction_url, headers=poll_headers)
                    
                    if tx_result.status_code == 200:
                        tx_data = tx_result.json()
                        is_completed = tx_data.get("completed", False)
                        current_status = str(tx_data.get("status", "")).upper()
                        
                        if is_completed:
                            final_status = current_status
                            status_description = tx_data.get("description", "")
                            break # Exit loop immediately if completed
                            
                except Exception as poll_error:
                    create_log("error", f"Polling error for {order_id}: {str(poll_error)}")
                
                time.sleep(poll_interval)

            if final_status == "PENDING":
                status_description = "User did not enter PIN or request timed out."

            return custom_success_message(
                0,
                "STK push initiated successfully",
                {
                    "payment_id": sub_payment.id,
                    "reference_number": reference_number,
                    "amount": amount,
                    "status": final_status,
                    "description": status_description,
                    # 🌟 RAW JAMBOPAY RESPONSE
                    "jambopay_response": tx_data 
                },
                "payment"
            )
        except Exception as e:
            create_log("error", str(e))
            return custom_error_response(1, f"Failed to create payment record: {str(e)}")

    # ==========================================
    # 🌟 3. UNKNOWN ACTION
    # ==========================================
    raise exceptions.ValidationError(f"Action {action} is unknown")