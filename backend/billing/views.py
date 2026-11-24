# billing/views.py — POST /api/v1/billing/  (signed in)
#   Business staff:   GetBilling · GetLedger {kind?: IN|OUT, page?} · GetPricing
#   Business admins:  BuyTokens {pack | amount, phone} · RefreshTopUp {payment_id}
#   WaziPOS admins:   AdminWallets {q?} · AdminAdjustTokens {entity, tokens, note}
#                     AdminTrialTokens {entity} · AdminSendTrialTokens {entity, tokens (max 100 per business), note?}

import logging

from django.http import JsonResponse
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes, renderer_classes, throttle_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.throttling import UserRateThrottle

from billing import pricing
from billing import services as billing
from core.responses import custom_errors_response, custom_success_message

log = logging.getLogger(__name__)


class BillingThrottle(UserRateThrottle):
    rate = "120/min"


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@renderer_classes([JSONRenderer])
@throttle_classes([BillingThrottle])
def billingAPIView(request):
    data = request.data
    user = request.user
    action = data.get("action") if hasattr(data, "get") else None
    if not action:
        return custom_errors_response(1, "Check the details", ["Action is not supplied"])
    entity_type = getattr(getattr(user, "entity", None), "entity_type", "")
    routes = {
        "GetBilling": (lambda: billing.status(user), "Billing", "billing"),
        "GetLedger": (lambda: billing.ledger(user, data), "Token history", "ledger"),
        "GetPricing": (lambda: pricing.catalogue(entity_type), "Pricing", "pricing"),
        "BuyTokens": (lambda: billing.buy(user, data), "Payment prompt sent — enter your PIN", "topup"),
        "RefreshTopUp": (lambda: billing.refresh_topup(user, data), "Top-up", "topup"),
        "AdminWallets": (lambda: billing.admin_overview(user, data), "Wallets", "overview"),
        "AdminAdjustTokens": (lambda: billing.adjust(user, data), "Tokens adjusted", "wallet"),
        "AdminTrialTokens": (lambda: billing.trial_gift_status(user, data), "Trial tokens", "trial"),
        "AdminSendTrialTokens": (lambda: billing.send_trial_tokens(user, data), "Trial tokens sent", "wallet"),
    }
    route = routes.get(str(action))
    if not route:
        return custom_errors_response(1, "Check the details", [f"Unknown action '{action}'"])
    fn, message, key = route
    try:
        return custom_success_message(0, message, fn(), key)
    except billing.BillingError as e:
        return custom_errors_response(1, e.message, e.errors)
    except exceptions.ValidationError as e:
        detail = e.detail if isinstance(e.detail, list) else [str(e.detail)]
        return custom_errors_response(1, "Check the details", [str(d) for d in detail])
    except Exception as e:  # noqa: BLE001 — last line of defence
        log.exception("billing %s failed for %s", action, getattr(user, "pk", None))
        try:
            from utils.logging import create_log

            create_log("error", f"Billing {action} failed: {e}")
        except Exception:
            pass
        return JsonResponse({"response_code": 1, "response_message": "Server problem", "errors": ["Something went wrong on our side. Please try again shortly."]}, status=500)
