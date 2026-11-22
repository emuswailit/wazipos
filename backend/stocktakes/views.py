# stocktakes/views.py — see stocktakes/services.py for the rules.
#
#   POST /api/v1/stocktakes/agent       (active agents)
#     AgentGetStockTakes {entity?}
#     AgentCreateStockTake {entity, kind: ONE_OFF|RECURRING, every_days?, starts_on, ends_on,
#                           fee, persons, daily_rate, stocktakers: [onboarder ids], notes?}
#     AgentUpdateStockTake {stock_take, ...same fields}     AgentCancelStockTake {stock_take}
#     AgentSubmitStockTake {stock_take}                     AgentSetDaysWorked {assignment, days_worked}
#     AgentRemoveCount {count}                              AgentGetStockTakeReport {stock_take}
#     AgentRequestStockTakePayment {stock_take, phone?}  -> mobile money prompt to the owner
#
#   POST /api/v1/stocktakes/stocktaker  (active onboarders)
#     StocktakerGetJobs                                     StocktakerGetItems {stock_take, q?}  (blind)
#     StocktakerRecordCount {stock_take, kind, item, counted, note?}   StocktakerGetMyCounts {stock_take}
#
#   POST /api/v1/stocktakes/vendor      (the business's super admin)
#     VendorGetStockTakes                                   VendorGetStockTakeReport {stock_take}
#     VendorPayStockTake {stock_take, phone}                VendorDecide {stock_take, all?|lines?}
#
#   POST /api/v1/stocktakes/admin       (platform admins)
#     AdminGetStockTakes {status?}                          AdminGetStocktakerDues {status?}
#     AdminMarkStocktakerDuesPaid {assignments: [ids], reference?}

from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes

from authentication.agents import AgentOnly
from authentication.onboarders import OnboarderOnly
from core.app_permissions import AdminRoleOnly
from core.responses import custom_errors_response, custom_success_message
from stocktakes import models as sm
from stocktakes import services as sv


def _action(request):
    action = request.data.get("action")
    if not action:
        raise exceptions.ValidationError("Action is not supplied")
    return action


def _qs():
    return sm.StockTakes.objects.select_related("entity", "agent__user")


# ---------------------------------------------------------------- agents

@api_view(["POST"])
@permission_classes([AgentOnly])
def agentStockTakesAPIView(request):
    action, data, agent = _action(request), request.data, request.agent

    if action == "AgentGetStockTakes":
        qs = _qs().filter(agent=agent)
        if data.get("entity"):
            qs = qs.filter(entity_id=data["entity"])
        return custom_success_message(0, "Stock takes", [sv.stock_take_out(st) for st in qs[:500]], "stock_takes")

    if action in ("AgentCreateStockTake", "AgentUpdateStockTake", "AgentCancelStockTake", "AgentSubmitStockTake"):
        fn = {
            "AgentCreateStockTake": lambda: sv.create_stock_take(agent, data, request.user),
            "AgentUpdateStockTake": lambda: sv.update_stock_take(agent, data),
            "AgentCancelStockTake": lambda: sv.cancel_stock_take(agent, data),
            "AgentSubmitStockTake": lambda: sv.submit_stock_take(agent, data),
        }[action]
        errors, st = fn()
        if errors:
            return custom_errors_response(1, "Stock take not saved", errors)
        return custom_success_message(0, "Stock take saved", sv.stock_take_out(st), "stock_take")

    if action == "AgentSetDaysWorked":
        errors, a = sv.set_days_worked(agent, data)
        if errors:
            return custom_errors_response(1, "Days not saved", errors)
        return custom_success_message(0, "Days worked saved", sv.assignment_out(a), "assignment")

    if action == "AgentRemoveCount":
        errors = sv.remove_count(agent, data)
        if errors:
            return custom_errors_response(1, "Count not removed", errors)
        return custom_success_message(0, "Count removed", {}, "data")

    st = _qs().filter(agent=agent, id=data.get("stock_take")).first() if data.get("stock_take") else None
    if not st:
        return custom_errors_response(1, "Not found", ["Stock take not found"])

    if action == "AgentGetStockTakeReport":
        return custom_success_message(0, "Stock take", sv.stock_take_out(st, with_counts=True), "stock_take")

    if action == "AgentRequestStockTakePayment":
        owner = st.entity.owner
        phone = str(data.get("phone") or "").strip() or (owner.phone if owner else "")
        if not owner or not phone:
            return custom_errors_response(1, "Prompt not sent", ["Enter the phone number to send the payment prompt to"])
        return sv.request_payment(st, phone, owner)

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ---------------------------------------------------------------- stocktakers

@api_view(["POST"])
@permission_classes([OnboarderOnly])
def stocktakerAPIView(request):
    action, data = _action(request), request.data

    if action == "StocktakerGetJobs":
        rows = []
        for st in sv.stocktaker_jobs(request.onboarder)[:200]:
            out = sv.stock_take_out(st)
            # Stocktakers see the job, not the money or other people's dues.
            for k in ("fee", "is_paid", "paid_at"):
                out.pop(k, None)
            out["stocktakers"] = [s for s in out["stocktakers"] if s["onboarder"] == str(request.onboarder.id)]
            rows.append(out)
        return custom_success_message(0, "Stock takes", rows, "stock_takes")

    errors, st, onboarder = sv.stocktaker_access(request.user, data.get("stock_take"))
    if errors:
        return custom_errors_response(1, "No access", errors)

    if action == "StocktakerGetItems":
        return custom_success_message(0, "Items", sv.stocktaker_items(st, data.get("q")), "items")

    if action == "StocktakerRecordCount":
        errors, c = sv.record_count(st, onboarder, request.user, data)
        if errors:
            return custom_errors_response(1, "Count not recorded", errors)
        return custom_success_message(0, "Counted", sv.count_out(c, blind=True), "count")

    if action == "StocktakerGetMyCounts":
        rows = [sv.count_out(c, blind=True) for c in st.counts.filter(onboarder=onboarder).select_related("counted_by").order_by("-created")]
        return custom_success_message(0, "Counts", rows, "counts")

    if action == "StocktakerGetMyFoundItems":
        rows = [sv.found_out(f) for f in st.found_items.filter(onboarder=onboarder).select_related("recorded_by")]
        return custom_success_message(0, "Found items", rows, "found")

    if action == "StocktakerRecordFoundItem":
        # Goods on site that aren't the business's (no matching item, no shop label, other batch).
        errors, f = sv.record_found_item(st, onboarder, request.user, data, request.FILES)
        if errors:
            return custom_errors_response(1, "Not recorded", errors)
        return custom_success_message(0, "Recorded", sv.found_out(f), "found")

    # No update or delete: a wrong line is removed by the agent and counted again.
    raise exceptions.ValidationError(f"Action {action} is unknown")


# ---------------------------------------------------------------- vendors

class VendorAdminOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            raise exceptions.ValidationError("Please log in")
        if not request.user.entity_id or not sv.is_vendor_admin(request.user, request.user.entity):
            raise exceptions.ValidationError(["Only the business's super admin can do this."])
        return True


@api_view(["POST"])
@permission_classes([VendorAdminOnly])
def vendorStockTakesAPIView(request):
    action, data, entity = _action(request), request.data, request.user.entity

    if action == "VendorGetStockTakes":
        qs = _qs().filter(entity=entity).exclude(status="CANCELLED")
        return custom_success_message(0, "Stock takes", [sv.stock_take_out(st) for st in qs[:200]], "stock_takes")

    st = _qs().filter(entity=entity, id=data.get("stock_take")).first() if data.get("stock_take") else None
    if not st:
        return custom_errors_response(1, "Not found", ["Stock take not found"])

    if action == "VendorGetStockTakeReport":
        return custom_success_message(0, "Stock take", sv.stock_take_out(st, with_counts=True), "stock_take")

    if action == "VendorPayStockTake":
        phone = str(data.get("phone") or "").strip() or request.user.phone or ""
        if not phone:
            return custom_errors_response(1, "Prompt not sent", ["Enter the mobile money number to pay from"])
        return sv.request_payment(st, phone, request.user)

    if action == "VendorDecide":
        errors, n = sv.decide(st, request.user, data)
        st.refresh_from_db()
        out = sv.stock_take_out(st, with_counts=True)
        out["decided"] = n
        if errors and not n:
            return custom_errors_response(1, "Nothing applied", errors)
        out["errors"] = errors
        return custom_success_message(0, f"{n} line(s) reviewed", out, "stock_take")

    raise exceptions.ValidationError(f"Action {action} is unknown")


# ---------------------------------------------------------------- admins

@api_view(["POST"])
@permission_classes([AdminRoleOnly])
def adminStockTakesAPIView(request):
    action, data = _action(request), request.data

    if action == "AdminGetStockTakes":
        qs = _qs()
        if data.get("status"):
            qs = qs.filter(status=str(data["status"]).upper())
        return custom_success_message(0, "Stock takes", [sv.stock_take_out(st) for st in qs[:1000]], "stock_takes")

    if action == "AdminGetStocktakerDues":
        rows = []
        for a in sv.stocktaker_dues(data.get("status"))[:2000]:
            row = sv.assignment_out(a)
            row.update({
                "stock_take": str(a.stock_take_id),
                "entity_title": a.stock_take.entity.title,
                "starts_on": a.stock_take.starts_on.isoformat(),
                "ends_on": a.stock_take.ends_on.isoformat(),
            })
            rows.append(row)
        return custom_success_message(0, "Stocktaker dues", rows, "dues")

    if action == "AdminMarkStocktakerDuesPaid":
        errors, n = sv.mark_dues_paid(data, request.user)
        if errors:
            return custom_errors_response(1, "Not marked paid", errors)
        return custom_success_message(0, f"{n} due(s) marked paid", {"updated": n}, "data")

    raise exceptions.ValidationError(f"Action {action} is unknown")
