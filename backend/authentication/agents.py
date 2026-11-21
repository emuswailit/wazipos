# authentication/agents.py
#
# Agents: see authentication/utils/agents.py for the rules.
#
#   POST /api/v1/authentication/agents/admin   (platform admins)
#     AdminGetAgents            {q?}                                  -> agents[]
#     AdminCreateAgent          {user, commission_percentage}         -> agent
#     AdminUpdateAgent          {agent, commission_percentage?, is_active?} -> agent
#     AdminGetAgentCommissions  {agent}                               -> {commissions[], summary}
#     AdminMarkCommissionsPaid  {agent, commissions?: [ids]}          -> {updated}
#     AdminBlacklistAgent       {agent, reason}  -> agent (all their onboarders blacklisted too)
#     AdminLiftAgentBlacklist   {agent}          -> agent (onboarders' blacklist cleared)
#
#   POST /api/v1/authentication/agents/me      (active agents only)
#     AgentGetProfile                                                -> {agent, summary}
#     AgentGetUsers             {q?}                                  -> users[]
#     AgentCreateUser / AgentUpdateUser {user?, ...same as AdminCreateUser}  (multipart with an ID file)
#     AgentSendConsent / AgentConfirmConsent {user, code?} / AgentSendEmailVerification {user}
#     AgentGetEntities                                               -> entities[] (each with "onboarding")
#     AgentCreateEntity {entity_details, onboarding: {monthly_subscription, subscription_start: TRIAL|PAY_NOW,
#                        stock_take_help, stock_take_persons, stock_take_daily_rate, stock_take_days, onboarders[]}}
#                       -> entity (+ payment: the mobile money prompt result for PAY_NOW)
#     AgentUpdateEntity {entity_details}                              -> entity
#     AgentUpdateOnboarding {entity, onboarding}                      -> onboarding
#     AgentRequestSubscriptionPayment {entity, phone?, months?}       -> payment (mobile money prompt)
#     AgentGetOnboarders / AgentAddOnboarder {user} / AgentSetOnboarderActive {onboarder, is_active}
#     AgentGetPayoutAccounts {user | entity}
#     AgentSavePayoutAccount {user | entity, payout_account_id?, payout_account_details}
#       where the agent's users / businesses are paid (saved unverified)
#     AgentGetCommissions                                            -> {commissions[], summary}

from django.db.models import Q
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import JSONParser, MultiPartParser

from authentication import models
from authentication.serializers import EntitySerializer
from authentication.utils import admin_users as au
from authentication.utils import agents as ag
from core.app_permissions import AdminRoleOnly
from core.responses import custom_errors_response, custom_success_message


class AgentOnly(permissions.BasePermission):
    """Users with an active Agents row."""

    message = "Only agents can do this."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            raise exceptions.ValidationError("Please log in")
        agent = ag.active_agent(request.user)
        if not agent:
            raise exceptions.ValidationError(["Only agents can do this."])
        request.agent = agent
        return True


def _action(request):
    action = request.data.get("action")
    if not action:
        raise exceptions.ValidationError("Action is not supplied")
    return action


@api_view(["POST"])
@permission_classes([AdminRoleOnly])
def agentsAdminAPIView(request):
    action = _action(request)
    data = request.data

    if action == "AdminGetAgents":
        return custom_success_message(0, "Agents", ag.list_agents(data), "agents")

    if action in ("AdminCreateAgent", "AdminUpdateAgent"):
        if action == "AdminCreateAgent" and data.get("agent"):
            raise exceptions.ValidationError("Use AdminUpdateAgent to change an agent")
        if action == "AdminUpdateAgent" and not data.get("agent"):
            raise exceptions.ValidationError("Agent ID is required")
        errors, agent = ag.save_agent(data, request.user)
        if errors:
            return custom_errors_response(1, "Agent not saved", errors)
        out = ag.agent_out(agent, ag._stats_for([agent.id]).get(agent.id))
        return custom_success_message(0, "Agent created" if action == "AdminCreateAgent" else "Agent updated", out, "agent")

    if action == "AdminGetAgentCommissions":
        agent = models.Agents.objects.filter(id=data.get("agent") or None).first() if data.get("agent") else None
        if not agent:
            return custom_errors_response(1, "Commissions not loaded", ["Agent for provided ID does not exist"])
        return custom_success_message(0, "Commissions", ag.list_commissions(agent), "data")

    if action in ("AdminBlacklistAgent", "AdminLiftAgentBlacklist"):
        fn = ag.blacklist_agent if action == "AdminBlacklistAgent" else ag.lift_agent_blacklist
        errors, agent, n = fn(data, request.user)
        if errors:
            return custom_errors_response(1, "Agent not changed", errors)
        out = ag.agent_out(agent, ag._stats_for([agent.id]).get(agent.id))
        out["onboarders_changed"] = n
        msg = (f"Agent blacklisted with {n} onboarder(s)" if action == "AdminBlacklistAgent"
               else f"Blacklist lifted ({n} onboarder(s) cleared)")
        return custom_success_message(0, msg, out, "agent")

    if action == "AdminMarkCommissionsPaid":
        errors, n = ag.mark_commissions_paid(data, request.user)
        if errors:
            return custom_errors_response(1, "Not marked paid", errors)
        return custom_success_message(0, f"{n} commission(s) marked paid", {"updated": n}, "data")

    raise exceptions.ValidationError(f"Action {action} is unknown")


@api_view(["POST"])
@permission_classes([AgentOnly])
@parser_classes([JSONParser, MultiPartParser])
def agentsMeAPIView(request):
    action = _action(request)
    data = request.data
    agent = request.agent

    if action == "AgentGetProfile":
        out = ag.agent_out(agent, ag._stats_for([agent.id]).get(agent.id))
        return custom_success_message(0, "Agent", out, "agent")

    # ---- users the agent registered ----
    if action == "AgentGetUsers":
        qs = ag.agent_users(agent).select_related("entity").prefetch_related("roles").order_by("-created_at")
        q = str(data.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q)
                | Q(phone__icontains=q) | Q(identifier_number__icontains=q)
            )
        return custom_success_message(0, "Users", [au.admin_user_out(u, request) for u in qs[:2000]], "users")

    if action in ("AgentCreateUser", "AgentUpdateUser"):
        target = None
        if action == "AgentUpdateUser":
            target = ag.own_user(agent, data.get("user"))
            if not target:
                return custom_errors_response(1, "User not saved", ["You can only edit users you registered"])
        errors, saved, note = au.admin_save_user(
            data, request.FILES, request.user, target,
            creating_agent=agent, entity_locked=True,  # users start on WAZIPOS; agents never move them
        )
        if errors:
            return custom_errors_response(1, "User not saved", errors)
        out = au.admin_user_out(saved, request)
        out["consent_note"] = note
        return custom_success_message(0, "User created" if target is None else "User updated", out, "user")

    if action in ("AgentSendConsent", "AgentConfirmConsent", "AgentSendEmailVerification"):
        target = ag.own_user(agent, data.get("user"))
        if not target:
            return custom_errors_response(1, "Not done", ["You can only manage users you registered"])
        if action == "AgentSendConsent":
            errors, _ = au.request_contact_consent(target, requested_by=request.user)
            if errors:
                return custom_errors_response(1, "Code not sent", errors)
            return custom_success_message(0, "Consent code sent", au.admin_user_out(target, request), "user")
        if action == "AgentConfirmConsent":
            errors, _ = au.confirm_contact_consent(target, data.get("code"), confirmed_by=request.user, via="STAFF")
            if errors:
                return custom_errors_response(1, "Consent not confirmed", errors)
            return custom_success_message(0, "Consent confirmed", au.admin_user_out(target, request), "user")
        errors, sent = au.request_email_verification(target)
        if errors or not sent:
            return custom_errors_response(1, "Link not sent", errors or ["The email could not be sent"])
        return custom_success_message(0, "Verification link emailed", au.admin_user_out(target, request), "user")

    # ---- entities the agent registered ----
    if action == "AgentGetEntities":
        qs = list(ag.agent_entities(agent).order_by("-created"))
        data_out = EntitySerializer(qs, many=True, context={"request": request, "user": request.user}).data
        onboardings = {
            o.entity_id: o
            for o in models.EntityOnboardings.objects.filter(entity__in=qs).prefetch_related("onboarders__user")
        }
        for row, e in zip(data_out, qs):
            row["onboarding"] = ag.onboarding_out(onboardings.get(e.id))
        return custom_success_message(0, "Entities", data_out, "entities")

    if action in ("AgentCreateEntity", "AgentUpdateEntity"):
        if action == "AgentCreateEntity":
            errors, entity = ag.create_entity(data, agent, request.user)
        else:
            errors, entity = ag.update_entity(data, agent)
        if errors:
            return custom_errors_response(1, "Entity not saved", errors)
        out = dict(EntitySerializer(entity, context={"request": request}).data)
        onboarding = models.EntityOnboardings.objects.filter(entity=entity).first()
        out["onboarding"] = ag.onboarding_out(onboarding)
        if action == "AgentCreateEntity" and onboarding and onboarding.subscription_start == "PAY_NOW":
            # Pays right away: prompt the owner's phone now. The entity is saved either way.
            res = ag.request_payment(agent, {"entity": str(entity.id), "months": 1})
            body = getattr(res, "data", None) or {}
            out["payment"] = {
                "sent": str(body.get("response_code")) == "0",
                "message": body.get("response_message") or "",
                "errors": body.get("errors") or [],
            }
        return custom_success_message(0, "Entity created" if action == "AgentCreateEntity" else "Entity updated", out, "entity")

    if action == "AgentUpdateOnboarding":
        errors, onboarding = ag.update_onboarding(agent, data)
        if errors:
            return custom_errors_response(1, "Onboarding not saved", errors)
        return custom_success_message(0, "Onboarding saved", ag.onboarding_out(onboarding), "onboarding")

    if action == "AgentRequestSubscriptionPayment":
        return ag.request_payment(agent, data)

    # ---- payout accounts of the agent's users and businesses ----
    if action == "AgentGetPayoutAccounts":
        errors, kind, rows = ag.payout_accounts_for(agent, data)
        if errors:
            return custom_errors_response(1, "Not loaded", errors)
        return custom_success_message(0, "Payout accounts", rows, "payout_accounts")

    if action == "AgentSavePayoutAccount":
        errors, account = ag.save_payout_account(agent, data, request.user)
        if errors:
            return custom_errors_response(1, "Payout account not saved", errors)
        return custom_success_message(0, "Payout account saved", account, "payout_account")

    # ---- onboarders (stock-take helpers) ----
    if action == "AgentGetOnboarders":
        return custom_success_message(0, "Onboarders", ag.list_onboarders(agent, request), "onboarders")

    if action in ("AgentAddOnboarder", "AgentSetOnboarderActive"):
        if action == "AgentAddOnboarder":
            errors, o = ag.add_onboarder(agent, data.get("user"))
        else:
            active = str(data.get("is_active")).lower() in ("true", "1", "yes")
            errors, o = ag.set_onboarder_active(agent, data.get("onboarder"), active)
        if errors:
            return custom_errors_response(1, "Onboarder not saved", errors)
        return custom_success_message(0, "Onboarder saved", ag.onboarder_out(o, request), "onboarder")

    if action == "AgentGetCommissions":
        return custom_success_message(0, "Commissions", ag.list_commissions(agent), "data")

    raise exceptions.ValidationError(f"Action {action} is unknown")
