# logistics/utils/platform_providers.py
#
# WaziPOS admin manages the platform's delivery companies and long-haul couriers
# centrally: whitelisting (logistics.PlatformDeliveryProvider), their riders /
# drivers (DeliveryAgent, entity = the company) and their vehicles (FleetVehicle).
# Sellers never add these themselves; at dispatch they search the available
# riders / drivers of whitelisted companies near the pickup point
# (deliveries.allocatable_agents), or use their own people and fleet.

from datetime import timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from authentication.models import CollectionPoints, Entities
from logistics.models import DeliveryAgent, DeliveryMode, FleetVehicle, PlatformDeliveryProvider
from logistics.utils.deliveries import AGENT_FRESH_MINUTES, LOCAL_MODES, entity_point

PROVIDER_TYPES = {
    "Delivery": PlatformDeliveryProvider.Kind.DELIVERY_COMPANY,
    "Courier": PlatformDeliveryProvider.Kind.COURIER,
}


def is_platform_provider(entity):
    """Delivery companies and couriers: their people and vehicles are managed by WaziPOS admin."""
    return bool(entity) and getattr(entity, "entity_type", None) in PROVIDER_TYPES


def listing_for(entity):
    """The provider's whitelist row (created PENDING the first time admin sees it)."""
    kind = PROVIDER_TYPES[entity.entity_type]
    row, _ = PlatformDeliveryProvider.objects.get_or_create(provider=entity, defaults={"kind": kind})
    if row.kind != kind:
        row.kind = kind
        row.save(update_fields=["kind", "updated"])
    return row


def _provider(data):
    e = Entities.objects.filter(id=data.get("provider") or None, entity_type__in=PROVIDER_TYPES.keys()).first() if data.get("provider") else None
    return e


def provider_out(entity, row):
    fresh = timezone.now() - timedelta(minutes=AGENT_FRESH_MINUTES)
    agents = DeliveryAgent.objects.filter(entity=entity)
    point = entity_point(entity)
    return {
        "id": str(entity.id),
        "title": entity.title,
        "entity_type": entity.entity_type,
        "kind": row.kind,
        "status": row.status,
        "service_radius_km": str(row.service_radius_km),
        "notes": row.notes,
        "status_changed_at": row.status_changed_at.isoformat() if row.status_changed_at else None,
        "phone": getattr(entity, "phone", None),
        "town": getattr(entity, "town", None),
        "has_location": point is not None,
        "agents": agents.filter(is_active=True).count(),
        "agents_on_duty": agents.filter(is_active=True, is_available=True).count(),
        "agents_live": agents.filter(is_active=True, last_seen_at__gte=fresh).count(),
        "vehicles": FleetVehicle.objects.filter(entity=entity).exclude(status=FleetVehicle.Status.RETIRED).count(),
        "offices": CollectionPoints.objects.filter(entity=entity, is_active=True).count(),
    }


def list_providers(data):
    """GetDeliveryProviders {kind?, status?, search?}: every Delivery / Courier entity with its whitelist status."""
    qs = Entities.objects.filter(entity_type__in=PROVIDER_TYPES.keys()).order_by("title")
    if data.get("search"):
        qs = qs.filter(title__icontains=str(data["search"]).strip())
    out = []
    for e in qs[:500]:
        row = listing_for(e)
        if data.get("kind") and row.kind != data["kind"]:
            continue
        if data.get("status") and row.status != data["status"]:
            continue
        out.append(provider_out(e, row))
    return out


def set_status(user, data):
    """SetDeliveryProvider {provider, status?, service_radius_km?, notes?}. Whitelisting needs a base location and people / offices."""
    entity = _provider(data)
    if not entity:
        return ["Delivery company or courier not found"], None
    row = listing_for(entity)
    errors = []
    status = data.get("status")
    if status and status not in PlatformDeliveryProvider.Status.values:
        errors.append("Unknown status")
    if status == PlatformDeliveryProvider.Status.WHITELISTED:
        if entity_point(entity) is None:
            errors.append(f"Set {entity.title}'s location first")
        if row.kind == PlatformDeliveryProvider.Kind.DELIVERY_COMPANY and not DeliveryAgent.objects.filter(entity=entity, is_active=True).exists():
            errors.append("Add at least one active rider or driver first")
        if row.kind == PlatformDeliveryProvider.Kind.COURIER and not CollectionPoints.objects.filter(entity=entity, is_active=True, location__isnull=False).exists():
            errors.append("The courier needs at least one active office with a location")
    radius = None
    if data.get("service_radius_km") not in (None, ""):
        try:
            radius = Decimal(str(data["service_radius_km"]))
            if radius <= 0 or radius > 500:
                errors.append("Service radius must be between 0 and 500 km")
        except Exception:
            errors.append("Enter the service radius in km")
    if errors:
        return errors, None
    if status and status != row.status:
        row.status, row.status_changed_by, row.status_changed_at = status, user, timezone.now()
    if radius is not None:
        row.service_radius_km = radius
    if "notes" in data:
        row.notes = str(data.get("notes") or "")[:300]
    row.save()
    return [], provider_out(entity, row)


def agent_out(a):
    u = a.user
    return {
        "id": str(a.id),
        "user": str(a.user_id),
        "name": f"{u.first_name or ''} {u.last_name or ''}".strip() or getattr(u, "phone", "") or str(u),
        "phone": a.phone or getattr(u, "phone", None),
        "mode": a.mode,
        "mode_label": DeliveryMode(a.mode).label,
        "max_weight_kg": str(a.max_weight_kg) if a.max_weight_kg is not None else None,
        "vehicle_registration": a.vehicle_registration,
        "is_active": a.is_active,
        "is_available": a.is_available,
        "last_seen_at": a.last_seen_at.isoformat() if a.last_seen_at else None,
    }


def list_agents(data):
    entity = _provider(data)
    if not entity:
        return ["Delivery company or courier not found"], None
    qs = DeliveryAgent.objects.filter(entity=entity).select_related("user").order_by("-is_active", "mode")
    return [], [agent_out(a) for a in qs]


def save_agent(admin, data):
    """SaveProviderAgent {provider, agent?, user (new), mode, max_weight_kg?, vehicle_registration?, phone?, is_active?, is_available?}."""
    from django.contrib.auth import get_user_model

    entity = _provider(data)
    if not entity:
        return ["Delivery company or courier not found"], None
    agent = None
    if data.get("agent"):
        agent = DeliveryAgent.objects.filter(id=data["agent"], entity=entity).first()
        if not agent:
            return ["Rider / driver not found"], None
    errors = []
    user = None
    if not agent:
        user = get_user_model().objects.filter(id=data.get("user") or None).first() if data.get("user") else None
        if not user:
            errors.append("Pick the rider / driver (a registered user)")
        elif DeliveryAgent.objects.filter(entity=entity, user=user).exists():
            errors.append("This person is already one of the company's riders / drivers")
    mode = data.get("mode") or (agent.mode if agent else None)
    if mode not in {m.value if hasattr(m, "value") else m for m in LOCAL_MODES}:
        errors.append("Pick how they deliver (on foot, bicycle, motorbike, car, van or lorry)")
    max_kg = None
    if data.get("max_weight_kg") not in (None, ""):
        try:
            max_kg = Decimal(str(data["max_weight_kg"]))
            if max_kg <= 0:
                errors.append("The load limit must be above 0 kg")
        except Exception:
            errors.append("Enter the load limit in kg")
    if errors:
        return errors, None
    agent = agent or DeliveryAgent(entity=entity, owner=admin, user=user)
    agent.mode = mode
    if "max_weight_kg" in data:
        agent.max_weight_kg = max_kg
    for f in ("vehicle_registration", "phone"):
        if f in data:
            setattr(agent, f, (str(data[f] or "").strip() or None))
    for f in ("is_active", "is_available"):
        if f in data:
            setattr(agent, f, str(data[f]).lower() in ("true", "1", "yes"))
    agent.save()
    return [], agent_out(agent)


def search_users(data, limit=20):
    """SearchUsers {q}: registered users to add as riders / drivers."""
    from django.contrib.auth import get_user_model

    q = str(data.get("q") or "").strip()
    if len(q) < 2:
        return []
    qs = get_user_model().objects.filter(
        Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(phone__icontains=q) | Q(email__icontains=q)
    ).order_by("first_name")[:limit]
    return [
        {"id": str(u.id), "title": f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email, "phone": getattr(u, "phone", None), "email": u.email}
        for u in qs
    ]
