# shopguard/views.py — one action endpoint (/api/v1/shopguard/).
#   Staff:  GetMyShift / ClockIn / ClockOut / LogUnknownScan / GetMyCommission
#   Owner (the shop's super admin):
#           GetGuardSettings / SaveGuardSettings / GetWatchReport {from?, to?} / GetShifts {from?, to?, user?}
#           GetAlerts / MarkAlertsRead / GetCommissionPlans / SaveCommissionPlan
#           GetCommissionStatements {period} / PayCommissions {period, phone, employees?} / RefreshCommissionPayment {reference}

from decimal import Decimal

from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, parser_classes, permission_classes, renderer_classes
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.renderers import JSONRenderer

from django.utils import timezone

from core.responses import custom_errors_response, custom_success_message
from shopguard import services as sg
from shopguard.models import GuardAlerts

SETTING_FIELDS = {
    "alerts_enabled": bool, "commissions_enabled": bool, "geofence_m": int, "idle_alert_minutes": int,
    "unknown_scan_alert": int, "cash_variance_alert": Decimal, "alert_phone": str,
}


def _settings_out(s):
    return {
        "alerts_enabled": s.alerts_enabled, "commissions_enabled": s.commissions_enabled, "geofence_m": s.geofence_m,
        "idle_alert_minutes": s.idle_alert_minutes, "unknown_scan_alert": s.unknown_scan_alert,
        "cash_variance_alert": str(s.cash_variance_alert), "alert_phone": s.alert_phone,
        "shop_located": sg._shop_point(s.entity) is not None,
    }


def _reply(result, message, key):
    errors, obj = result
    if errors:
        return custom_errors_response(1, f"{message} failed", errors)
    return custom_success_message(0, message, obj, key)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@renderer_classes([JSONRenderer])
@parser_classes([JSONParser, MultiPartParser])
def shopGuardAPIView(request):
    action = request.data.get("action")
    user = request.user
    entity = user.entity
    if not entity:
        return custom_errors_response(1, "Not allowed", ["Sign in to your business first"])

    # ---- staff
    if action == "GetMyShift":
        shift = sg.open_shift(user, entity)
        return custom_success_message(0, "Shift", {
            "shift": sg.shift_out(shift) if shift else None,
            "can_clock_in": bool(sg._employee(user, entity) or sg.is_shop_admin(user, entity)),
            "geofence_m": sg.settings_for(entity).geofence_m,
        }, "data")
    if action == "ClockIn":
        errors, shift = sg.clock_in(user, request.data)
        return _reply((errors, sg.shift_out(shift) if shift else None), "Clocked in", "shift")
    if action == "ClockOut":
        errors, shift = sg.clock_out(user, request.data)
        return _reply((errors, sg.shift_out(shift) if shift else None), "Clocked out", "shift")
    if action == "LogUnknownScan":
        errors, _ = sg.log_unknown_scan(user, request.data)
        return _reply((errors, {}), "Logged", "data")
    if action == "GetMyCommission":
        return custom_success_message(0, "Commission", sg.my_commission(user), "statements")

    # ---- owner
    if not sg.is_shop_admin(user, entity):
        return custom_errors_response(1, "Not allowed", ["Only the shop's owner (super admin) sees this"])
    if action == "GetGuardSettings":
        return custom_success_message(0, "Settings", _settings_out(sg.settings_for(entity)), "settings")
    if action == "SaveGuardSettings":
        s = sg.settings_for(entity)
        errors = []
        for field, kind in SETTING_FIELDS.items():
            if field not in request.data:
                continue
            raw = request.data.get(field)
            try:
                if kind is bool:
                    value = str(raw).lower() in ("true", "1", "yes")
                elif kind is int:
                    value = max(0, int(str(raw)))
                elif kind is Decimal:
                    value = max(Decimal("0"), Decimal(str(raw or 0)))
                else:
                    value = str(raw or "").strip()[:20]
            except Exception:
                errors.append(f"Invalid {field.replace('_', ' ')}")
                continue
            setattr(s, field, value)
        if errors:
            return custom_errors_response(1, "Not saved", errors)
        s.save()
        return custom_success_message(0, "Saved", _settings_out(s), "settings")
    if action == "GetWatchReport":
        return custom_success_message(0, "Watch report", sg.watch_report(entity, request.data), "report")
    if action == "GetShifts":
        return custom_success_message(0, "Shifts", sg.list_shifts(entity, request.data), "shifts")
    if action == "GetAlerts":
        qs = GuardAlerts.objects.filter(entity=entity).select_related("user")[:200]
        return custom_success_message(0, "Alerts", [sg.alert_out(a) for a in qs], "alerts")
    if action == "MarkAlertsRead":
        GuardAlerts.objects.filter(entity=entity, read_at__isnull=True).update(read_at=timezone.now())
        return custom_success_message(0, "Done", {}, "data")
    if action == "GetCommissionPlans":
        return custom_success_message(0, "Commission plans", sg.list_plans(entity), "plans")
    if action == "SaveCommissionPlan":
        return _reply(sg.save_plan(entity, user, request.data), "Saved", "plan")
    if action == "GetCommissionStatements":
        sg.sync_commissions()
        return custom_success_message(0, "Statements", sg.statements(entity, request.data), "statements")
    if action == "PayCommissions":
        # One mobile-money prompt for the month's total; WaziPOS then pays each employee's user payout account.
        return _reply(sg.pay_commissions(entity, user, request.data), "Payment prompt sent", "payment")
    if action == "RefreshCommissionPayment":
        return custom_success_message(0, "Payment", {"status": sg.refresh_commission_payment(entity, request.data.get("reference"))}, "payment")
    raise exceptions.ValidationError(f"Action {action} is unknown")
