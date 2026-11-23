# credit/views.py — POST /api/v1/credit/  (signed in)
#   Buyers / sellers' staff:  Offers {order_kind, order_id} · RequestConsent {order_kind, order_id, lender_id, tenor, phone?}
#                             Borrow {order_kind, order_id, lender_id, tenor, accept_terms, consent_id?, consent_code?}
#                             MyLoans · Repay {facility_id, amount?, phone} · RefreshRepayment {repayment_id}
#   Lenders (Bank / Facilitator admins): MyLender · SaveLender {...} · LenderBook {status?}
#                             TopUpFloat {amount, phone} · RefreshTopUp {movement_id} · WithdrawFloat {amount}
#   WaziPOS admins:           DeskLenders · DecideLender {lender_id, decision: APPROVE | SUSPEND}

import logging

from django.http import JsonResponse
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes, renderer_classes, throttle_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.throttling import UserRateThrottle

from core.responses import custom_errors_response, custom_success_message
from credit import services as credit

log = logging.getLogger(__name__)


class CreditThrottle(UserRateThrottle):
    rate = "180/min"


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@renderer_classes([JSONRenderer])
@throttle_classes([CreditThrottle])
def creditAPIView(request):
    data = request.data
    user = request.user
    action = data.get("action") if hasattr(data, "get") else None
    if not action:
        return custom_errors_response(1, "Check the details", ["Action is not supplied"])
    routes = {
        "Offers": (lambda: credit.offers(user, data), "Offers", "offers"),
        "RequestConsent": (lambda: credit.request_consent(user, data), "Code sent", "consent"),
        "Borrow": (lambda: credit.borrow(user, data), "Order paid with WaziPOS Credit", "facility"),
        "MyLoans": (lambda: credit.my_facilities(user), "Loans", "facilities"),
        "Repay": (lambda: credit.repay(user, data), "Payment prompt sent", "repayment"),
        "RefreshRepayment": (lambda: credit.refresh_repayment(user, data), "Repayment", "repayment"),
        "MyLender": (lambda: credit.my_lender(user), "Lender", "lender"),
        "SaveLender": (lambda: credit.save_lender(user, data), "Lending set-up saved", "profile"),
        "LenderBook": (lambda: credit.lender_book(user, data), "Loan book", "book"),
        "TopUpFloat": (lambda: credit.topup_float(user, data), "Payment prompt sent", "topup"),
        "RefreshTopUp": (lambda: credit.refresh_topup(user, data), "Top-up", "topup"),
        "WithdrawFloat": (lambda: credit.withdraw_float(user, data), "Withdrawal on its way", "withdrawal"),
        "DeskLenders": (lambda: credit.desk_lenders(user), "Lenders", "lenders"),
        "DecideLender": (lambda: credit.desk_decide_lender(user, data), "Lender updated", "profile"),
    }
    route = routes.get(str(action))
    if not route:
        return custom_errors_response(1, "Check the details", [f"Unknown action '{action}'"])
    fn, message, key = route
    try:
        return custom_success_message(0, message, fn(), key)
    except credit.CreditError as e:
        return custom_errors_response(1, e.message, e.errors)
    except exceptions.ValidationError as e:
        detail = e.detail if isinstance(e.detail, list) else [str(e.detail)]
        return custom_errors_response(1, "Check the details", [str(d) for d in detail])
    except Exception as e:  # noqa: BLE001 — last line of defence
        log.exception("credit %s failed for %s", action, getattr(user, "pk", None))
        try:
            from utils.logging import create_log

            create_log("error", f"Credit {action} failed: {e}")
        except Exception:
            pass
        return JsonResponse({"response_code": 1, "response_message": "Server problem", "errors": ["Something went wrong on our side. Please try again shortly."]}, status=500)
