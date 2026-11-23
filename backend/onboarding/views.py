# onboarding/views.py — POST /api/v1/onboarding/  (signed in)
#   Owners:          GetOnboarding · GetPayoutAccounts · SavePayoutAccount {payout_account_details, payout_account_id?}
#                    SubmitForApproval
#   WaziPOS admins:  AdminSignups {days?, q?} · AdminApprovals {status?: PENDING|SETUP|APPROVED|REJECTED|ALL, q?}
#                    AdminApprove {entity, note?} · AdminReject {entity, reason} · AdminNote {entity, note}

import logging

from django.http import JsonResponse
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes, renderer_classes, throttle_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.throttling import UserRateThrottle

from core.responses import custom_errors_response, custom_success_message
from onboarding import services as ob

log = logging.getLogger(__name__)


class OnboardingThrottle(UserRateThrottle):
    rate = "120/min"


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@renderer_classes([JSONRenderer])
@throttle_classes([OnboardingThrottle])
def onboardingAPIView(request):
    data = request.data
    user = request.user
    action = data.get("action") if hasattr(data, "get") else None
    if not action:
        return custom_errors_response(1, "Check the details", ["Action is not supplied"])
    routes = {
        "GetOnboarding": (lambda: ob.state(user), "Onboarding", "onboarding"),
        "GetPayoutAccounts": (lambda: ob.payout_accounts(user), "Payout accounts", "payout_accounts"),
        "SavePayoutAccount": (lambda: ob.save_payout_account(user, data), "Payout account saved", "payout_account"),
        "SubmitForApproval": (lambda: ob.submit(user), "Submitted — we'll review it shortly", "onboarding"),
        "AdminSignups": (lambda: ob.admin_signups(user, data, request), "Sign-ups", "signups"),
        "AdminApprovals": (lambda: ob.admin_approvals(user, data, request), "Approvals", "approvals"),
        "AdminApprove": (lambda: ob.admin_approve(user, data), "Business approved — free month started", "decision"),
        "AdminReject": (lambda: ob.admin_reject(user, data), "Sent back to the owner", "decision"),
        "AdminNote": (lambda: ob.admin_note(user, data), "Note saved", "decision"),
    }
    route = routes.get(str(action))
    if not route:
        return custom_errors_response(1, "Check the details", [f"Unknown action '{action}'"])
    fn, message, key = route
    try:
        return custom_success_message(0, message, fn(), key)
    except ob.OnboardingError as e:
        return custom_errors_response(1, e.message, e.errors)
    except exceptions.ValidationError as e:
        detail = e.detail if isinstance(e.detail, list) else [str(e.detail)]
        return custom_errors_response(1, "Check the details", [str(d) for d in detail])
    except Exception as e:  # noqa: BLE001 — last line of defence
        log.exception("onboarding %s failed for %s", action, getattr(user, "pk", None))
        try:
            from utils.logging import create_log

            create_log("error", f"Onboarding {action} failed: {e}")
        except Exception:
            pass
        return JsonResponse({"response_code": 1, "response_message": "Server problem", "errors": ["Something went wrong on our side. Please try again shortly."]}, status=500)
