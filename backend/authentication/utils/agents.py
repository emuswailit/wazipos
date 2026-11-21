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

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import exceptions

from authentication import models
from utils.logging import create_log

AGENT_ROLE_VALUE = "Agent"
# Agents onboard shops: retailers and wholesalers.
AGENT_ENTITY_TYPES = {"GeneralRetailer", "PharmaceuticalRetailer", "GeneralWholesaler", "PharmaceuticalWholesaler"}
MAX_COMMISSION = Decimal("100")
CENTS = Decimal("0.01")


# ---------------------------------------------------------------- who is an agent

def agent_role():
    """The system "Agent" role, created next to the Client role the first time it is needed."""
    role = models.Roles.objects.filter(value=AGENT_ROLE_VALUE).select_related("entity").first()
    if role:
        return role
    client = models.Roles.objects.filter(value="Client").first()
    if not client:
        return None  # system roles not set up yet
    return models.Roles.objects.create(
        value=AGENT_ROLE_VALUE,
        title="AGENT",
        level="DEFAULT",
        description="Signs up users and businesses for a commission",
        entity_id=client.entity_id,
        cluster_id=client.cluster_id,
    )


def active_agent(user):
    """The user's active Agents row, or None."""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    return models.Agents.objects.filter(user=user, is_active=True).order_by("-created").first()


def agent_users(agent):
    return models.Users.objects.filter(creating_agent=agent)


def agent_entities(agent):
    return models.Entities.objects.filter(Q(agent=agent) | Q(agent_entities=agent)).distinct()


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
    money = {
        row["agent_id"]: row
        for row in models.AgentCommissions.objects.filter(agent_id__in=agent_ids).values("agent_id").annotate(
            earned=Sum("amount"), pending=Sum("amount", filter=Q(status="PENDING")),
        )
    }
    return {
        a: {
            "users": users.get(a, 0),
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
            agent.is_active = str(data.get("is_active")).lower() in ("true", "1", "yes")
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
    n = qs.update(status="PAID", paid_at=timezone.now(), paid_by=admin)
    return [], n


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


def record_subscription_commission(payment):
    """
    Divide a successful subscription payment between the entity's agent and the
    platform. Once per payment (one-to-one); nothing when the entity has no
    active agent or the agent's rate is 0. Must never break the subscription.
    """
    try:
        entity = payment.entity
        agent = entity.agent if entity and entity.agent_id else None
        if not agent or not agent.is_active:
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


def create_entity(data, agent, request_user):
    """
    AgentCreateEntity {entity_details: {..., owner}} — the owner must be one of
    the agent's users. The entity is tied to the agent (for commission), and its
    owner moves onto it if they were still on the default WAZIPOS entity, so
    their next login opens the business with its super admin role.
    """
    from authentication.utils import utils

    details = data.get("entity_details") or {}
    owner = own_user(agent, details.get("owner"))
    errors = []
    if not owner:
        errors.append("Pick the owner from the users you registered")
    if details.get("entity_type") not in AGENT_ENTITY_TYPES:
        errors.append("Agents register retailers and wholesalers only")
    errors += utils.validate_create_local_entity_data(data, request_user)
    if errors:
        return errors, None

    with transaction.atomic():
        entity = utils.create_local_entity(data, request_user)
        if not entity:
            return ["Entity could not be created"], None
        entity.agent = agent
        entity.save(update_fields=["agent"])
        utils.create_super_admin_role(entity)
        default = models.Entities.objects.filter(title__iexact="WAZIPOS").values_list("id", flat=True).first()
        if not owner.entity_id or owner.entity_id == default:
            owner.entity = entity
            owner.save(update_fields=["entity"])
    return [], entity


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
        return ["Agents register retailers and wholesalers only"], None
    if details.get("owner") and str(details["owner"]) != str(entity.owner_id) and not own_user(agent, details["owner"]):
        return ["Pick the owner from the users you registered"], None
    # update_entity allows staff or the owner; the agent acts for the owner here.
    updated = utils.update_entity(data, entity.owner)
    return ([], updated) if updated else (["Entity could not be updated"], None)
