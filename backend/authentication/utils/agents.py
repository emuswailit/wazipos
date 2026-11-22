# authentication/utils/agents.py
#
# Agents sign up users and the businesses (entities) those users own, and earn
# a commission on the entities' subscription fees.
#
# - An agent is an active `Agents` row for a user. Platform admins create one
#   from an existing user and set its commission_percentage.
# - On login the user's token gets the "Agent" role (Users.tokens), which shows
#   the Agent panel in the app and on the web.
# - Agents only see what they brought in: users with creating_agent = the agent,
#   and entities with agent = the agent (or listed in Agents.entities).
# - Commission: when an agent's entity pays a subscription, the fee is divided —
#   commission_percentage to the agent (an AgentCommissions row), the rest to the
#   platform. See record_subscription_commission, called from
#   subscriptions/tasks.py:create_subscription_from_payment.
# - Onboarding terms (EntityOnboardings), agreed when the agent creates the entity:
#   the negotiated monthly subscription, a one-month free trial or paying right
#   away (a mobile money prompt to the owner's phone), and optional stock-take
#   help — people x rate per person per day x days, done by the agent's
#   onboarders (AgentOnboarders: their own users with phone, email and ID on file).
# - Onboarders are optional: a business's own employees can always enter its
#   stock on their usual screens. When the agent does attach onboarders —
# - Onboarders' access: an agent attaches onboarders to a business for its
#   stock take, from one date to another. On those days (and until the stock
#   take is DONE) they may only CREATE its opening stock — retailer receipts,
#   wholesaler receipts, or a restaurant's / hotel's supplies (food, cleaning,
#   utilities, packaging) and bar drinks — never update, through
#   authentication/onboarders.py.
#   Afterwards their access ends unless the agent changes the dates.
# - Blacklist (admins): blocks the agent and blacklists all their onboarders, who
#   are also taken off unfinished stock takes. Lifting it restores the agent and
#   clears the onboarders' blacklist; the agent switches onboarders back on.

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import exceptions

from authentication import models
from utils.logging import create_log

AGENT_ROLE_VALUE = "Agent"
ONBOARDER_ROLE_VALUE = "Onboarder"
# What onboarders create for each kind of business: retailers -> RetailerReceipts,
# wholesalers -> WholesalerReceipts, restaurants & hotels -> supplies
# (RestaurantStock: food, cleaning, utilities, packaging) and bar drinks.
RETAILER_TYPES = {"GeneralRetailer", "PharmaceuticalRetailer"}
WHOLESALER_TYPES = {"GeneralWholesaler", "PharmaceuticalWholesaler"}
RESTAURANT_TYPES = {"Restaurant", "Hotel"}


def receipt_kind(entity_type):
    """RETAILER / WHOLESALER / RESTAURANT: the stock onboarders create for this business, or None."""
    if entity_type in RETAILER_TYPES:
        return "RETAILER"
    if entity_type in WHOLESALER_TYPES:
        return "WHOLESALER"
    if entity_type in RESTAURANT_TYPES:
        return "RESTAURANT"
    return None
# Agents onboard retailers, wholesalers, restaurants and hotels.
AGENT_ENTITY_TYPES = {
    "GeneralRetailer", "PharmaceuticalRetailer", "GeneralWholesaler", "PharmaceuticalWholesaler",
    "Restaurant", "Hotel",
    # Delivery companies and couriers are onboarded centrally by WaziPOS admin, not agents.
}
MAX_COMMISSION = Decimal("100")
CENTS = Decimal("0.01")


# ---------------------------------------------------------------- who is an agent

def _system_role(value, title, description):
    """A platform role, created next to the Client role the first time it is needed."""
    role = models.Roles.objects.filter(value=value).select_related("entity").first()
    if role:
        return role
    client = models.Roles.objects.filter(value="Client").first()
    if not client:
        return None  # system roles not set up yet
    return models.Roles.objects.create(
        value=value, title=title, level="DEFAULT", description=description,
        entity_id=client.entity_id, cluster_id=client.cluster_id,
    )


def agent_role():
    return _system_role(AGENT_ROLE_VALUE, "AGENT", "Signs up users and businesses for a commission")


def onboarder_role():
    """In the token of active onboarders: shows them the Onboarding screen."""
    return _system_role(ONBOARDER_ROLE_VALUE, "ONBOARDER", "Enters stock for businesses being onboarded")


def active_agent(user):
    """The user's active Agents row, or None."""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    return models.Agents.objects.filter(user=user, is_active=True, is_blacklisted=False).order_by("-created").first()


def agent_users(agent):
    return models.Users.objects.filter(creating_agent=agent)


def conflicted_entity_ids(user):
    """
    Businesses this person owns, administers, works at or holds a role in (or is
    signed into). As an agent they can't act on these — no bookings, onboarding,
    terms or commission on their own shop (conflict of interest). The default
    WAZIPOS entity, where every agent sits, is not a conflict.
    """
    if not user or not getattr(user, "pk", None):
        return set()
    from employees.models import Employees

    ids = set(models.Entities.objects.filter(Q(owner=user) | Q(administrator=user)).values_list("id", flat=True))
    ids |= set(Employees.objects.filter(user=user, is_active="true").values_list("entity_id", flat=True))
    ids |= {e for e in user.roles.exclude(entity__isnull=True).values_list("entity_id", flat=True) if e}
    if getattr(user, "entity_id", None):
        ids.add(user.entity_id)
    from authentication.utils.admin_users import DEFAULT_ENTITY_TITLE

    default = models.Entities.objects.filter(title=DEFAULT_ENTITY_TITLE).values_list("id", flat=True).first()
    ids.discard(default)
    return ids


def is_own_shop(agent, entity):
    """The agent owns / runs / works at this business: agent actions are off there."""
    return bool(agent and entity) and getattr(entity, "id", entity) in conflicted_entity_ids(agent.user)


def agent_entities(agent):
    """The businesses the agent registered or serves — never one they own or work at."""
    qs = models.Entities.objects.filter(Q(agent=agent) | Q(agent_entities=agent)).distinct()
    own = conflicted_entity_ids(agent.user) if agent else set()
    return qs.exclude(id__in=own) if own else qs


def _percentage(value):
    try:
        pct = Decimal(str(value)).quantize(CENTS)
    except Exception:
        return None
    return pct if Decimal("0") <= pct <= MAX_COMMISSION else None


def _default_entity():
    from authentication.utils.admin_users import default_entity

    return default_entity()


# ---------------------------------------------------------------- admins manage agents

def agent_out(agent, stats=None):
    u = agent.user
    stats = stats or {}
    return {
        "id": str(agent.id),
        "user": str(u.id) if u else None,
        "name": " ".join(x for x in (u.first_name, u.middle_name, u.last_name) if x).title() if u else "",
        "email": u.email if u else "",
        "phone": u.phone if u else "",
        "commission_percentage": str(agent.commission_percentage),
        "is_active": bool(agent.is_active),
        "is_blacklisted": bool(agent.is_blacklisted),
        "blacklist_reason": agent.blacklist_reason,
        "blacklisted_at": agent.blacklisted_at.isoformat() if agent.blacklisted_at else None,
        "onboarders_count": stats.get("onboarders", 0),
        "users_count": stats.get("users", 0),
        "entities_count": stats.get("entities", 0),
        "commission_earned": str(stats.get("earned") or Decimal("0.00")),
        "commission_pending": str(stats.get("pending") or Decimal("0.00")),
        "created": agent.created.isoformat() if agent.created else None,
    }


def _stats_for(agent_ids):
    users = dict(
        models.Users.objects.filter(creating_agent_id__in=agent_ids)
        .values("creating_agent_id").annotate(n=Count("id")).values_list("creating_agent_id", "n")
    )
    entities = dict(
        models.Entities.objects.filter(agent_id__in=agent_ids)
        .values("agent_id").annotate(n=Count("id")).values_list("agent_id", "n")
    )
    onboarders = dict(
        models.AgentOnboarders.objects.filter(agent_id__in=agent_ids)
        .values("agent_id").annotate(n=Count("id")).values_list("agent_id", "n")
    )
    money = {
        row["agent_id"]: row
        for row in models.AgentCommissions.objects.filter(agent_id__in=agent_ids).values("agent_id").annotate(
            earned=Sum("amount"), pending=Sum("amount", filter=Q(status="PENDING")),
        )
    }
    return {
        a: {
            "users": users.get(a, 0),
            "onboarders": onboarders.get(a, 0),
            "entities": entities.get(a, 0),
            "earned": (money.get(a) or {}).get("earned"),
            "pending": (money.get(a) or {}).get("pending"),
        }
        for a in agent_ids
    }


def list_agents(data):
    qs = models.Agents.objects.select_related("user").filter(user__isnull=False).order_by("-created")
    q = str(data.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q)
            | Q(user__email__icontains=q) | Q(user__phone__icontains=q)
        )
    agents = list(qs[:1000])
    stats = _stats_for([a.id for a in agents])
    return [agent_out(a, stats.get(a.id)) for a in agents]


def save_agent(data, admin):
    """
    AdminCreateAgent {user, commission_percentage} — an existing user becomes an
    agent (a previously removed agent is reactivated).
    AdminUpdateAgent {agent, commission_percentage?, is_active?}.
    Returns (errors, agent).
    """
    errors = []
    agent = None
    if data.get("agent"):
        agent = models.Agents.objects.select_related("user").filter(id=data["agent"]).first()
        if not agent:
            return ["Agent for provided ID does not exist"], None
        user = agent.user
    else:
        user = models.Users.objects.filter(id=data.get("user") or None).first() if data.get("user") else None
        if not user:
            errors.append("Pick the user who will be the agent")
        elif not user.is_active:
            errors.append("This user is deactivated")

    pct = None
    if "commission_percentage" in data or not agent:
        pct = _percentage(data.get("commission_percentage"))
        if pct is None:
            errors.append("Commission must be a percentage from 0 to 100")
    if errors:
        return errors, None

    with transaction.atomic():
        if not agent:
            agent = models.Agents.objects.filter(user=user).order_by("-created").first()
            if agent and agent.is_blacklisted:
                return ["This user is blacklisted as an agent. Lift the blacklist first."], None
            if agent and agent.is_active:
                return ["This user is already an agent"], None
            if not agent:
                agent = models.Agents(user=user, owner=admin, entity=user.entity or _default_entity())
            agent.is_active = True
            agent.is_approved = True
            agent.approver = admin
        if pct is not None:
            agent.commission_percentage = pct
        if "is_active" in data and data.get("agent"):
            want = str(data.get("is_active")).lower() in ("true", "1", "yes")
            if want and agent.is_blacklisted:
                return ["This agent is blacklisted. Lift the blacklist to reactivate them."], None
            agent.is_active = want
        agent.save()
        models.Users.objects.filter(id=user.id).update(is_agent=agent.is_active)
    return [], agent


def mark_commissions_paid(data, admin):
    """AdminMarkCommissionsPaid {agent, commissions?: [ids]} — all owed, or just these."""
    agent = models.Agents.objects.filter(id=data.get("agent") or None).first() if data.get("agent") else None
    if not agent:
        return ["Agent for provided ID does not exist"], 0
    qs = models.AgentCommissions.objects.filter(agent=agent, status="PENDING")
    ids = data.get("commissions")
    if isinstance(ids, list) and ids:
        qs = qs.filter(id__in=ids)
    paid_ids = list(qs.values_list("id", flat=True))
    n = qs.update(status="PAID", paid_at=timezone.now(), paid_by=admin)
    # Paid outside WaziPOS: the payout ledger must not pay them again.
    from payments.utils.collection_payouts import paid_manually

    paid_manually("agent_commission", paid_ids, data.get("reference"))
    return [], n


def blacklist_agent(data, admin):
    """
    AdminBlacklistAgent {agent, reason}: block the agent and blacklist every one
    of their onboarders (switched off, and taken off stock takes not yet done).
    Returns (errors, agent, onboarders_blacklisted).
    """
    agent = models.Agents.objects.select_related("user").filter(id=data.get("agent") or None).first() if data.get("agent") else None
    if not agent:
        return ["Agent for provided ID does not exist"], None, 0
    reason = str(data.get("reason") or "").strip()
    if not reason:
        return ["Say why the agent is blacklisted"], None, 0
    if agent.is_blacklisted:
        return ["This agent is already blacklisted"], None, 0
    now = timezone.now()
    with transaction.atomic():
        agent.is_blacklisted = True
        agent.is_active = False
        agent.blacklist_reason = reason[:500]
        agent.blacklisted_at = now
        agent.blacklisted_by = admin
        agent.save()
        if agent.user_id:
            models.Users.objects.filter(id=agent.user_id).update(is_agent=False)
        onboarders = models.AgentOnboarders.objects.filter(agent=agent)
        ids = list(onboarders.values_list("id", flat=True))
        n = onboarders.update(is_blacklisted=True, is_active=False, blacklisted_at=now)
        # Blacklisted people are not sent to shops.
        through = models.EntityOnboardings.onboarders.through
        through.objects.filter(
            agentonboarders_id__in=ids,
            entityonboardings__stock_take_status__in=["PLANNED", "IN_PROGRESS"],
        ).delete()
    create_log("info", f"Agent {agent.id} blacklisted by {admin.pk} with {n} onboarder(s): {reason[:200]}")
    return [], agent, n


def lift_agent_blacklist(data, admin):
    """
    AdminLiftAgentBlacklist {agent}: the agent is active again and their
    onboarders' blacklist is cleared; the onboarders stay switched off until the
    agent turns them back on under My onboarders.
    """
    agent = models.Agents.objects.select_related("user").filter(id=data.get("agent") or None).first() if data.get("agent") else None
    if not agent:
        return ["Agent for provided ID does not exist"], None, 0
    if not agent.is_blacklisted:
        return ["This agent is not blacklisted"], None, 0
    with transaction.atomic():
        agent.is_blacklisted = False
        agent.is_active = True
        agent.blacklist_reason = ""
        agent.blacklisted_at = None
        agent.blacklisted_by = None
        agent.save()
        if agent.user_id:
            models.Users.objects.filter(id=agent.user_id).update(is_agent=True)
        n = models.AgentOnboarders.objects.filter(agent=agent, is_blacklisted=True).update(is_blacklisted=False, blacklisted_at=None)
    create_log("info", f"Agent {agent.id} blacklist lifted by {admin.pk} ({n} onboarder(s) cleared)")
    return [], agent, n


# ---------------------------------------------------------------- commissions

def commission_out(c):
    return {
        "id": str(c.id),
        "agent": str(c.agent_id),
        "entity": str(c.entity_id),
        "entity_title": c.entity.title if c.entity_id else "",
        "payment": str(c.subscription_payment_id),
        "payment_reference": getattr(c.subscription_payment, "reference_number", "") or "",
        "months": getattr(c.subscription_payment, "months", 1) or 1,
        "payment_amount": str(c.payment_amount),
        "percentage": str(c.percentage),
        "amount": str(c.amount),
        "platform_amount": str(c.platform_amount),
        "status": c.status,
        "paid_at": c.paid_at.isoformat() if c.paid_at else None,
        "created": c.created.isoformat() if c.created else None,
    }


def list_commissions(agent):
    qs = (
        models.AgentCommissions.objects.filter(agent=agent)
        .select_related("entity", "subscription_payment").order_by("-created")
    )
    totals = qs.aggregate(earned=Sum("amount"), pending=Sum("amount", filter=Q(status="PENDING")),
                          paid=Sum("amount", filter=Q(status="PAID")))
    return {
        "commissions": [commission_out(c) for c in qs[:1000]],
        "summary": {
            "percentage": str(agent.commission_percentage),
            "earned": str(totals["earned"] or Decimal("0.00")),
            "pending": str(totals["pending"] or Decimal("0.00")),
            "paid": str(totals["paid"] or Decimal("0.00")),
        },
    }


def record_subscription_commission(payment, agent=None):
    """
    Divide a successful payment between an agent and the platform: by default
    the entity's agent (subscriptions); for a stock take, the agent who closed it.
    Once per payment (one-to-one); nothing when there is no active agent or the
    rate is 0. Must never break the payment flow.
    """
    try:
        entity = payment.entity
        agent = agent or (entity.agent if entity and entity.agent_id else None)
        if not agent or not agent.is_active:
            return None
        if is_own_shop(agent, entity):
            # No commission from the agent's own shop (conflict of interest): the platform keeps it.
            create_log("info", f"No agent commission on payment {payment.reference_number}: the agent's own business")
            return None
        pct = agent.commission_percentage or Decimal("0")
        paid = Decimal(payment.amount or 0)
        if pct <= 0 or paid <= 0:
            return None
        share = (paid * pct / Decimal("100")).quantize(CENTS, rounding=ROUND_HALF_UP)
        commission, created = models.AgentCommissions.objects.get_or_create(
            subscription_payment=payment,
            defaults={
                "agent": agent,
                "entity": entity,
                "payment_amount": paid,
                "percentage": pct,
                "amount": share,
                "platform_amount": paid - share,
            },
        )
        if created:
            create_log("info", f"Agent commission {share} ({pct}%) for payment {payment.reference_number}")
        return commission
    except Exception as e:
        create_log("error", f"Agent commission failed for payment {getattr(payment, 'reference_number', '?')}: {e!r}")
        return None


# ---------------------------------------------------------------- agents' own work

def own_user(agent, user_id):
    return agent_users(agent).filter(id=user_id).first() if user_id else None


def own_entity(agent, entity_id):
    return agent_entities(agent).filter(id=entity_id).first() if entity_id else None


# ---------------------------------------------------------------- onboarders

def onboarder_missing(user):
    """What a user still needs before they can be an onboarder (empty = ready)."""
    from authentication.utils.admin_users import has_real_email

    missing = []
    if not user.phone:
        missing.append("a phone number")
    if not has_real_email(user):
        missing.append("an email address")
    if user.identifier_type not in ("NationalId", "Passport") or not user.identifier_number:
        missing.append("an ID or passport number")
    has_doc = user.documents.exists() or models.UserDocuments.objects.filter(owner=user).exists()
    if not has_doc:
        missing.append("an uploaded ID or passport document")
    if not has_payout_account(user):
        missing.append("a payout account (to be paid for days worked)")
    return missing


def has_payout_account(user):
    from payments.models import UserPayoutAccounts

    return UserPayoutAccounts.objects.filter(user=user, is_active="true").exists()


# ---------------------------------------------------------------- payout accounts
#
# Agents set up where their users (stocktakers' pay) and their businesses (sales
# payouts) are paid, when they register them. Saved unverified: a platform admin
# verifies, as for accounts people add themselves.

def payout_accounts_for(agent, data):
    """(errors, kind, rows): the payout accounts of one of the agent's users or businesses."""
    from payments import serializers as ps
    from payments.models import PayoutAccounts, UserPayoutAccounts

    if data.get("user"):
        user = own_user(agent, data.get("user"))
        if not user:
            return ["You can only manage users you registered"], None, []
        qs = UserPayoutAccounts.objects.filter(user=user).order_by("-is_active", "-updated")
        return [], "user", ps.UserPayoutAccountsSerializer(qs, many=True).data
    entity = own_entity(agent, data.get("entity"))
    if not entity:
        return ["You can only manage businesses you registered"], None, []
    qs = PayoutAccounts.objects.filter(entity=entity).order_by("-updated")
    return [], "entity", ps.PayoutAccountsSerializer(qs, many=True).data


def save_payout_account(agent, data, by_user):
    """
    AgentSavePayoutAccount {user | entity, payout_account_id?, payout_account_details}.
    Returns (errors, serialized account).
    """
    from payments import serializers as ps
    from payments.models import PayoutAccounts
    from payments.utils import admin_payout_accounts as pa

    if data.get("user"):
        user = own_user(agent, data.get("user"))
        if not user:
            return ["You can only manage users you registered"], None
        errors, account = pa.save_user_payout_account(data, user)
        return (errors, None) if errors else ([], ps.UserPayoutAccountsSerializer(account).data)

    entity = own_entity(agent, data.get("entity"))
    if not entity:
        return ["You can only manage businesses you registered"], None
    details = dict(data.get("payout_account_details") or {})
    details["entity"] = str(entity.id)
    details.pop("is_verified", None)
    instance = None
    if data.get("payout_account_id"):
        instance = PayoutAccounts.objects.filter(id=data["payout_account_id"], entity=entity).first()
        if not instance:
            return ["Payout account does not exist"], None
    errors, fields = pa._validate(details, instance=instance)
    if errors:
        return errors, None
    fields["entity"] = entity
    with transaction.atomic():
        if instance is None:
            account = PayoutAccounts.objects.create(
                **fields, is_active=pa._bool_str(details.get("is_active"), default="true"),
                is_verified=False, owner=by_user,
            )
        else:
            account = instance
            changed = any((fields.get(f) or None) != (getattr(account, f) or None) for f in pa.DESTINATION_FIELDS)
            for k, v in fields.items():
                setattr(account, k, v)
            if "is_active" in details:
                account.is_active = pa._bool_str(details.get("is_active"))
            if changed:
                account.is_verified = False
                account.verified_by = None
            account.save()
    return [], ps.PayoutAccountsSerializer(account).data


def onboarder_out(o, request=None):
    from authentication.utils.admin_users import admin_user_out

    u = admin_user_out(o.user, request)
    return {
        "id": str(o.id),
        "user": u,
        "is_active": bool(o.is_active),
        "is_blacklisted": bool(o.is_blacklisted),
        "stock_takes": o.stock_takes.count(),
        "created": o.created.isoformat() if o.created else None,
    }


def list_onboarders(agent, request=None):
    qs = models.AgentOnboarders.objects.filter(agent=agent).select_related("user", "user__entity").order_by("-created")
    return [onboarder_out(o, request) for o in qs]


def add_onboarder(agent, user_id):
    """AgentAddOnboarder {user}: one of the agent's users, with phone, email and ID on file."""
    user = own_user(agent, user_id)
    if not user:
        return ["Pick one of the users you registered"], None
    missing = onboarder_missing(user)
    if missing:
        return [f"{user.first_name} still needs " + ", ".join(missing) + ". Edit them under My users first."], None
    existing = models.AgentOnboarders.objects.filter(user=user).first()
    if existing and existing.is_blacklisted:
        return ["This person is blacklisted and can't be an onboarder"], None
    if existing and existing.agent_id != agent.id:
        return ["This person already works under another agent"], None
    if existing:
        if existing.is_active:
            return ["Already one of your onboarders"], None
        existing.is_active = True
        existing.save(update_fields=["is_active", "updated"])
        return [], existing
    return [], models.AgentOnboarders.objects.create(agent=agent, user=user)


def set_onboarder_active(agent, onboarder_id, active):
    o = models.AgentOnboarders.objects.filter(agent=agent, id=onboarder_id).first() if onboarder_id else None
    if not o:
        return ["Onboarder not found"], None
    if active and o.is_blacklisted:
        return ["This onboarder is blacklisted and can't be switched on"], None
    o.is_active = bool(active)
    o.save(update_fields=["is_active", "updated"])
    return [], o


def active_onboarder(user):
    """The user's AgentOnboarders row if they may work at all (not off, not blacklisted, agent active)."""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    return (
        models.AgentOnboarders.objects.select_related("agent")
        .filter(user=user, is_active=True, is_blacklisted=False,
                agent__is_active=True, agent__is_blacklisted=False)
        .first()
    )


def onboarder_assignments(onboarder):
    """Every business this onboarder is attached to (open or not), newest first."""
    return (
        models.EntityOnboardings.objects.filter(onboarders=onboarder, stock_take_help=True)
        .select_related("entity", "agent__user").order_by("-onboarder_access_from", "-created")
    )


def onboarder_access(user, entity_id):
    """
    (errors, onboarding, onboarder): may this user enter stock for this business
    today? Only while attached, inside the agent's dates, and before DONE.
    """
    onboarder = active_onboarder(user)
    if not onboarder:
        return ["You are not an active onboarder"], None, None
    o = onboarder_assignments(onboarder).filter(entity_id=entity_id).first() if entity_id else None
    if not o:
        return ["You are not attached to this business"], None, None
    if o.agent_id and is_own_shop(o.agent, o.entity):
        # Onboarding the agent's own shop is a conflict of interest: their onboarders can't enter stock there.
        return ["This business belongs to your agent; their onboarders can't enter its stock"], None, None
    if not receipt_kind(o.entity.entity_type):
        return ["Onboarders can't enter stock for this kind of business"], None, None
    if not access_open(o):
        if o.stock_take_status == "DONE":
            return ["The stock take for this business is done; your access has ended"], None, None
        return [
            f"Your access to {o.entity.title} is from {o.onboarder_access_from} to {o.onboarder_access_to}. "
            "Ask your agent to change the dates."
        ], None, None
    return [], o, onboarder


# ---------------------------------------------------------------- onboarding terms

def onboarding_out(o):
    if not o:
        return None
    return {
        "id": str(o.id),
        "entity": str(o.entity_id),
        "monthly_subscription": str(o.monthly_subscription),
        "subscription_start": o.subscription_start,
        "stock_take_help": o.stock_take_help,
        "stock_take_persons": o.stock_take_persons,
        "stock_take_daily_rate": str(o.stock_take_daily_rate),
        "stock_take_days": o.stock_take_days,
        "stock_take_total": str(Decimal(o.stock_take_total).quantize(CENTS)),
        "stock_take_status": o.stock_take_status,
        "onboarders": [str(x) for x in o.onboarders.values_list("id", flat=True)],
        "onboarder_names": [
            " ".join(p for p in (fn, ln) if p) for fn, ln in o.onboarders.values_list("user__first_name", "user__last_name")
        ],
        "onboarder_access_from": o.onboarder_access_from.isoformat() if o.onboarder_access_from else None,
        "onboarder_access_to": o.onboarder_access_to.isoformat() if o.onboarder_access_to else None,
        "onboarder_access_open": access_open(o),
        "receipt_kind": receipt_kind(o.entity.entity_type) if o.entity_id else None,
        "notes": o.notes,
        "has_paid": _has_paid(o.entity_id),
        "created": o.created.isoformat() if o.created else None,
    }


def _has_paid(entity_id):
    from subscriptions.models import SubscriptionPayment

    return SubscriptionPayment.objects.filter(entity_id=entity_id, status="SUCCESS").exists()


def _money(value, label, errors, minimum=Decimal("0")):
    try:
        v = Decimal(str(value)).quantize(CENTS)
    except Exception:
        errors.append(f"Enter the {label} as an amount")
        return None
    if v < minimum:
        errors.append(f"The {label} must be at least {minimum}")
        return None
    return v


def _whole(value, label, errors, minimum=0, maximum=1000):
    try:
        v = int(str(value))
    except Exception:
        errors.append(f"Enter the {label} as a whole number")
        return None
    if not minimum <= v <= maximum:
        errors.append(f"The {label} must be from {minimum} to {maximum}")
        return None
    return v


def _date(value, label, errors):
    from datetime import date

    try:
        return date.fromisoformat(str(value)[:10])
    except Exception:
        errors.append(f"Pick the {label}")
        return None


def access_open(o, today=None):
    """Onboarders may work on this business today: dates set, today inside them, not DONE."""
    if not o or not o.stock_take_help or o.stock_take_status not in ("PLANNED", "IN_PROGRESS"):
        return False
    if not o.onboarder_access_from or not o.onboarder_access_to:
        return False
    today = today or timezone.localdate()
    return o.onboarder_access_from <= today <= o.onboarder_access_to


def clean_terms(agent, terms, creating=True, entity_type=None):
    """
    Validate {monthly_subscription, subscription_start, stock_take_help,
    stock_take_persons, stock_take_daily_rate, stock_take_days, onboarders[],
    onboarder_access_from, onboarder_access_to, stock_take_status?, notes?}.
    Stock-take help needs a business onboarders can enter stock for
    (receipt_kind). Returns (errors, cleaned).
    """
    terms = terms or {}
    errors = []
    out = {}
    if creating or "monthly_subscription" in terms:
        out["monthly_subscription"] = _money(terms.get("monthly_subscription"), "monthly subscription", errors, Decimal("1"))
    if creating:
        start = str(terms.get("subscription_start") or "").upper()
        if start not in ("TRIAL", "PAY_NOW"):
            errors.append("Choose a one-month free trial or paying right away")
        out["subscription_start"] = start
    help_ = str(terms.get("stock_take_help", False)).lower() in ("true", "1", "yes")
    if help_ and entity_type and not receipt_kind(entity_type):
        errors.append("Stock-take help is for retailers, wholesalers, restaurants and hotels")
    out["stock_take_help"] = help_
    if help_:
        out["stock_take_persons"] = _whole(terms.get("stock_take_persons"), "number of people", errors, 1, 100)
        out["stock_take_daily_rate"] = _money(terms.get("stock_take_daily_rate"), "pay per person per day", errors, Decimal("1"))
        out["stock_take_days"] = _whole(terms.get("stock_take_days"), "number of days", errors, 1, 60)
        ids = terms.get("onboarders") or []
        if not isinstance(ids, list):
            ids = [ids]
        picked = list(models.AgentOnboarders.objects.filter(agent=agent, is_active=True, is_blacklisted=False, id__in=[i for i in ids if i]))
        if len(picked) != len([i for i in ids if i]):
            errors.append("Pick onboarders from your active onboarders")
        if out.get("stock_take_persons") and len(picked) > out["stock_take_persons"]:
            errors.append(f"You picked {len(picked)} onboarders for {out['stock_take_persons']} places")
        out["onboarders"] = picked
        # Onboarders are optional: the business's own staff can do the stock take
        # on their usual screens. The access dates are needed only when onboarders
        # are attached.
        start = end = None
        if picked:
            start = _date(terms.get("onboarder_access_from"), "first day onboarders may work", errors)
            end = _date(terms.get("onboarder_access_to"), "last day onboarders may work", errors)
            if start and end and end < start:
                errors.append("The last day must be on or after the first day")
            if start and end and (end - start).days > 120:
                errors.append("Onboarders can be attached for at most 120 days at a time")
        out["onboarder_access_from"], out["onboarder_access_to"] = start, end
        status = str(terms.get("stock_take_status") or "PLANNED").upper()
        if status not in ("PLANNED", "IN_PROGRESS", "DONE"):
            errors.append("Unknown stock-take status")
        out["stock_take_status"] = status
    else:
        out.update(stock_take_persons=0, stock_take_daily_rate=Decimal("0"), stock_take_days=0,
                   onboarders=[], stock_take_status="NOT_NEEDED",
                   onboarder_access_from=None, onboarder_access_to=None)
    if "notes" in terms:
        out["notes"] = str(terms.get("notes") or "")[:2000]
    return errors, out


def _apply_terms(onboarding, cleaned):
    onboarders = cleaned.pop("onboarders", None)
    for k, v in cleaned.items():
        setattr(onboarding, k, v)
    onboarding.save()
    if onboarders is not None:
        onboarding.onboarders.set(onboarders)


def _start_trial(entity, owner):
    """One free month from now (subscriptions.Subscription TRIAL)."""
    from subscriptions.models import Subscription
    from subscriptions.periods import period_end

    now = timezone.now()
    if Subscription.objects.filter(entity=entity, end_date__gt=now).exists():
        return
    end = period_end(now, 1)
    Subscription.objects.create(
        entity=entity, payment=None, months=1, start_date=now, end_date=end,
        type="TRIAL", is_active="TRUE", owner=owner,
    )
    entity.offer_trial = "true"
    entity.trial_from = timezone.localdate(now)
    entity.trial_to = timezone.localdate(end)
    entity.save(update_fields=["offer_trial", "trial_from", "trial_to"])


def request_payment(agent, data):
    """
    AgentRequestSubscriptionPayment {entity, phone?, months?} — send the owner a
    mobile money prompt for the negotiated subscription (default: the owner's phone).
    Returns a DRF Response (the same one InitiateSubscriptionPayment returns).
    """
    from core.responses import custom_errors_response
    from subscriptions.views import start_subscription_payment

    entity = own_entity(agent, data.get("entity"))
    if not entity:
        return custom_errors_response(1, "Prompt not sent", ["You can only bill entities you registered"])
    owner = entity.owner
    phone = str(data.get("phone") or "").strip() or (owner.phone if owner else "")
    if not owner or not phone:
        return custom_errors_response(1, "Prompt not sent", ["Enter the phone number to send the payment prompt to"])
    return start_subscription_payment(entity, owner, phone, data.get("months") or 1)


def create_entity(data, agent, request_user):
    """
    AgentCreateEntity {entity_details: {..., owner}, onboarding: {terms}} — the
    owner must be one of the agent's users. The entity is tied to the agent (for
    commission) and gets the negotiated monthly subscription; a TRIAL start gives
    it one free month. The owner's entity changes to the new business — the only
    way an agent's user leaves WAZIPOS — so their next login opens it with its
    super admin role. PAY_NOW: the caller sends the payment prompt after this commits.
    """
    from authentication.utils import utils

    details = data.get("entity_details") or {}
    owner = own_user(agent, details.get("owner"))
    errors = []
    if not owner:
        errors.append("Pick the owner from the users you registered")
    elif owner.pk == agent.user_id:
        errors.append("Agents can't register their own business; another agent or WaziPOS must onboard it")
    if details.get("entity_type") not in AGENT_ENTITY_TYPES:
        errors.append("Agents register retailers, wholesalers, restaurants, hotels, delivery companies and couriers only")
    term_errors, terms = clean_terms(agent, data.get("onboarding"), creating=True, entity_type=details.get("entity_type"))
    errors += term_errors
    errors += utils.validate_create_local_entity_data(data, request_user)
    if errors:
        return errors, None

    with transaction.atomic():
        entity = utils.create_local_entity(data, request_user)
        if not entity:
            return ["Entity could not be created"], None
        entity.agent = agent
        entity.monthly_subscription = terms["monthly_subscription"]
        entity.save(update_fields=["agent", "monthly_subscription"])
        utils.create_super_admin_role(entity)
        owner.entity = entity
        owner.save(update_fields=["entity"])
        onboarding = models.EntityOnboardings(entity=entity, agent=agent)
        _apply_terms(onboarding, terms)
        if terms["subscription_start"] == "TRIAL":
            _start_trial(entity, owner)
    return [], entity


def update_onboarding(agent, data):
    """
    AgentUpdateOnboarding {entity, onboarding: {terms}} — change the stock-take
    plan (people, rate, days, onboarders, status, notes) any time; the monthly
    subscription only until the entity's first successful payment. The trial /
    pay-now choice is fixed once the entity is created.
    """
    entity = own_entity(agent, data.get("entity"))
    if not entity:
        return ["You can only change entities you registered"], None
    onboarding = models.EntityOnboardings.objects.filter(entity=entity).first()
    existed = onboarding is not None
    terms_in = dict(data.get("onboarding") or {})
    if not onboarding:
        # Entity registered before onboarding terms existed: record them now.
        if "monthly_subscription" not in terms_in:
            terms_in["monthly_subscription"] = entity.monthly_subscription
        onboarding = models.EntityOnboardings(entity=entity, agent=agent, subscription_start="PAY_NOW")
    if existed and "monthly_subscription" in terms_in and _has_paid(entity.id):
        try:
            changed = Decimal(str(terms_in["monthly_subscription"])).quantize(CENTS) != onboarding.monthly_subscription
        except Exception:
            changed = True
        if changed:
            return ["The monthly subscription can't change after the business has paid"], None
    errors, terms = clean_terms(agent, terms_in, creating=False, entity_type=entity.entity_type)
    if errors:
        return errors, None
    with transaction.atomic():
        _apply_terms(onboarding, terms)
        if "monthly_subscription" in terms and terms["monthly_subscription"] is not None:
            entity.monthly_subscription = terms["monthly_subscription"]
            entity.save(update_fields=["monthly_subscription"])
    return [], onboarding


def update_entity(data, agent):
    """AgentUpdateEntity {entity_details: {id, ...}} — only the agent's own entities."""
    from authentication.utils import utils

    details = data.get("entity_details") or {}
    entity = own_entity(agent, details.get("id"))
    if not entity:
        return ["You can only edit entities you registered"], None
    if not entity.owner_id:
        return ["This entity has no owner yet; ask an admin to set one"], None
    if details.get("entity_type") and details["entity_type"] not in AGENT_ENTITY_TYPES:
        return ["Agents register retailers, wholesalers, restaurants, hotels, delivery companies and couriers only"], None
    if details.get("owner") and str(details["owner"]) != str(entity.owner_id) and not own_user(agent, details["owner"]):
        return ["Pick the owner from the users you registered"], None
    # update_entity allows staff or the owner; the agent acts for the owner here.
    updated = utils.update_entity(data, entity.owner)
    return ([], updated) if updated else (["Entity could not be updated"], None)
