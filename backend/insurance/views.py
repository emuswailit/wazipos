# insurance/views.py — POST /api/v1/insurance/  (signed in)
#   Everyone:   Catalogue · Quote {product, inputs} · Offer {product, context}
#               Buy {product, inputs, phone, accept_terms, subject_kind?, subject_id?, source?}
#               RefreshPayment {policy_id} · CancelPolicy {policy_id} · MyPolicies
#               InsurableDeliveries · EstimateClaim {policy_id, incident, loss_amount, nights?}
#               FileClaim {policy_id, incident, incident_at, loss_amount, description, police_reference?, evidence? (multipart)}
#               MyClaims
#   Claims desk (platform admins): DeskClaims {status?} · DecideClaim {claim_id, status, approved_amount?, note?} · DeskSummary
#
# Business problems → 200 {response_code: 1, response_message, errors}; anything
# unexpected is logged and answered 500 with a plain message.

import logging

from django.http import JsonResponse
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, parser_classes, permission_classes, renderer_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.renderers import JSONRenderer
from rest_framework.throttling import UserRateThrottle

from core.responses import custom_errors_response, custom_success_message
from insurance import services as cover

log = logging.getLogger(__name__)


class CoverThrottle(UserRateThrottle):
    rate = "240/min"


def _crash(action, user, err):
    log.exception("insurance %s failed for %s", action, getattr(user, "pk", None))
    try:
        from utils.logging import create_log

        create_log("error", f"Insurance {action} failed: {err}")
    except Exception:
        pass
    return JsonResponse({"response_code": 1, "response_message": "Server problem", "errors": ["Something went wrong on our side. Please try again shortly."]}, status=500)


def _json_field(data, key):
    """Multipart sends nested objects as JSON text."""
    import json

    v = data.get(key)
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return {}
    return v


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@renderer_classes([JSONRenderer])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@throttle_classes([CoverThrottle])
def insuranceAPIView(request):
    data = request.data
    user = request.user
    action = data.get("action") if hasattr(data, "get") else None
    if not action:
        return custom_errors_response(1, "Check the details", ["Action is not supplied"])
    if hasattr(data, "dict"):  # multipart QueryDict → plain dict
        data = {k: data.get(k) for k in data.keys()}
    for key in ("inputs", "context"):
        if key in data:
            data[key] = _json_field(data, key) or {}

    routes = {
        "Catalogue": (lambda: cover.catalogue(user), "Cover", "catalogue"),
        "Quote": (lambda: cover.quote_for(user, data), "Quote", "quote"),
        "Offer": (lambda: cover.offer(user, data), "Offer", "offer"),
        "Buy": (lambda: cover.buy(user, data), "Policy", "policy"),
        "RefreshPayment": (lambda: cover.refresh_payment(user, data), "Policy", "policy"),
        "CancelPolicy": (lambda: cover.cancel(user, data), "Policy cancelled", "policy"),
        "MyPolicies": (lambda: cover.my_policies(user), "Policies", "policies"),
        "InsurableDeliveries": (lambda: cover.insurable_deliveries(user), "Deliveries", "deliveries"),
        "EstimateClaim": (lambda: cover.estimate_claim(user, data), "Estimate", "estimate"),
        "FileClaim": (lambda: cover.file_claim(user, data, request.FILES), "Claim received", "claim"),
        "MyClaims": (lambda: cover.my_claims(user), "Claims", "claims"),
        "DeskClaims": (lambda: cover.desk_claims(user, data, request), "Claims", "claims"),
        "DecideClaim": (lambda: cover.desk_decide(user, data, request), "Claim updated", "claim"),
        "DeskSummary": (lambda: cover.desk_summary(user), "Summary", "summary"),
    }
    route = routes.get(str(action))
    if not route:
        return custom_errors_response(1, "Check the details", [f"Unknown action '{action}'"])
    fn, message, key = route
    try:
        return custom_success_message(0, message, fn(), key)
    except cover.CoverError as e:
        return custom_errors_response(1, e.message, e.errors)
    except exceptions.ValidationError as e:
        detail = e.detail if isinstance(e.detail, list) else [str(e.detail)]
        return custom_errors_response(1, "Check the details", [str(d) for d in detail])
    except exceptions.PermissionDenied as e:
        return custom_errors_response(1, "Not allowed", [str(e.detail)])
    except Exception as e:  # noqa: BLE001
        return _crash(action, user, e)
