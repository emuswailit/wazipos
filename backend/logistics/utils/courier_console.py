# logistics/utils/courier_console.py
#
# The dashboard for a courier's / delivery company's own admins (entity types
# Courier and Delivery): how the business is doing today, its riders / drivers and
# whether they are on duty, its fleet, and — for couriers — the parcels moving
# through its offices:
#   INCOMING   handover legs heading to one of our offices (a seller's person is
#              bringing the goods); the office RECEIVES them (waybill), which
#              starts our transit leg
#   IN_TRANSIT our transit legs under way; the destination office marks them ARRIVED
#   AWAITING   parcels at our destination office waiting for the buyer, who
#              collects with the delivery code on their order
#   DONE       delivered in the last 30 days
# WaziPOS admin still onboards and whitelists the company (platform_providers.py).

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from authentication.models import CollectionPoints
from logistics.models import (
    DeliveryAgent,
    DeliveryMode,
    DeliveryTrip,
    FleetVehicle,
    LegStatus,
    PlatformDeliveryProvider,
    Shipment,
    ShipmentLeg,
    ShipmentStatus,
)
from logistics.utils.deliveries import AGENT_FRESH_MINUTES, _release_goods, _set_payee, confirm_collected, update_leg

OPEN_LEG = [LegStatus.PENDING, LegStatus.ASSIGNED, LegStatus.PICKED_UP]
STAGES = ("INCOMING", "IN_TRANSIT", "AWAITING", "DONE")


def _fresh():
    return timezone.now() - timedelta(minutes=AGENT_FRESH_MINUTES)


def _busy(entity):
    """Our people out on a delivery now: {agent id: leg}."""
    legs = (
        ShipmentLeg.objects.filter(agent__entity=entity, status__in=[LegStatus.ASSIGNED, LegStatus.PICKED_UP])
        .select_related("shipment").order_by("assigned_at")
    )
    out = {}
    for leg in legs:
        out.setdefault(leg.agent_id, leg)
    return out


# ---------------------------------------------------------------- parcels

def _parcels_qs(entity, stage, office=None):
    if stage == "INCOMING":
        # Heading to our office, or dropped there (the rider marked it handed over)
        # but not yet received by us: our transit leg hasn't started.
        qs = ShipmentLeg.objects.filter(
            kind=ShipmentLeg.Kind.HANDOVER, destination_collection_point__entity=entity,
            status__in=OPEN_LEG + [LegStatus.HANDED_OVER],
            shipment__status__in=[ShipmentStatus.CONFIRMED, ShipmentStatus.IN_TRANSIT],
            shipment__legs__kind=ShipmentLeg.Kind.TRANSIT, shipment__legs__provider=entity,
            shipment__legs__status=LegStatus.PENDING,
        ).distinct()
        if office:
            qs = qs.filter(destination_collection_point_id=office)
    elif stage == "IN_TRANSIT":
        qs = ShipmentLeg.objects.filter(
            kind=ShipmentLeg.Kind.TRANSIT, provider=entity, status=LegStatus.PICKED_UP,
        )
        if office:
            qs = qs.filter(Q(origin_collection_point_id=office) | Q(destination_collection_point_id=office))
    elif stage == "AWAITING":
        qs = ShipmentLeg.objects.filter(
            kind=ShipmentLeg.Kind.TRANSIT, provider=entity, shipment__status=ShipmentStatus.AWAITING_PICKUP,
        )
        if office:
            qs = qs.filter(destination_collection_point_id=office)
    else:
        qs = ShipmentLeg.objects.filter(
            kind=ShipmentLeg.Kind.TRANSIT, provider=entity, shipment__status=ShipmentStatus.DELIVERED,
            shipment__delivered_at__gte=timezone.now() - timedelta(days=30),
        )
        if office:
            qs = qs.filter(destination_collection_point_id=office)
    return qs.select_related(
        "shipment__entity", "agent__user", "origin_collection_point", "destination_collection_point", "provider",
    )


def _buyer(shipment):
    for attr in ("retailer_order", "customer_order", "wholesaler_order", "food_order"):
        order = getattr(shipment, attr, None)
        if order is not None:
            for name in ("retailer", "wholesaler", "customer", "client", "entity"):
                who = getattr(order, name, None)
                if who is not None and who != shipment.entity:
                    return getattr(who, "title", None) or " ".join(
                        x for x in (getattr(who, "first_name", ""), getattr(who, "last_name", "")) if x
                    ) or str(who)
    return None


def parcel_out(leg, stage):
    s = leg.shipment
    transit = leg if leg.kind == ShipmentLeg.Kind.TRANSIT else s.legs.filter(kind=ShipmentLeg.Kind.TRANSIT).select_related("destination_collection_point").first()
    dest = transit.destination_collection_point if transit else None
    origin = leg.destination_collection_point if leg.kind == ShipmentLeg.Kind.HANDOVER else leg.origin_collection_point
    agent = leg.agent if leg.kind == ShipmentLeg.Kind.HANDOVER else None
    return {
        "stage": stage,
        "leg": str(leg.id),
        "transit_leg": str(transit.id) if transit else None,
        "shipment": str(s.id),
        "reference": str(s.id)[:8].upper(),
        "seller": s.entity.title if s.entity_id else None,
        "buyer": _buyer(s),
        "from_office": origin.title if origin else None,
        "from_office_id": str(origin.id) if origin else None,
        "to_office": dest.title if dest else None,
        "to_office_id": str(dest.id) if dest else None,
        "weight_kg": str(s.chargeable_weight_kg or 0),
        "cargo_value": str(getattr(s, "cargo_value", 0) or 0),
        "waybill_number": transit.waybill_number if transit else None,
        "pays_us": str(transit.cost) if transit else None,
        "brought_by": " ".join(x for x in (agent.user.first_name, agent.user.last_name) if x) if agent else None,
        "brought_by_phone": (agent.phone or getattr(agent.user, "phone", None)) if agent else None,
        "handover_status": leg.status if leg.kind == ShipmentLeg.Kind.HANDOVER else None,
        "since": (leg.completed_at or leg.picked_up_at or leg.assigned_at or s.created).isoformat() if (leg.completed_at or leg.picked_up_at or leg.assigned_at or getattr(s, "created", None)) else None,
    }


def list_parcels(entity, data):
    stage = str(data.get("stage") or "INCOMING").upper()
    if stage not in STAGES:
        return ["Unknown stage"], None
    qs = _parcels_qs(entity, stage, data.get("office") or None).order_by("-id")[:300]
    return [], [parcel_out(leg, stage) for leg in qs]


def receive_parcel(entity, user, data):
    """
    ReceiveParcel {leg (the handover leg), waybill_number?}: our office took the
    goods from the seller's person — the handover is done (they are owed), our
    transit leg starts.
    """
    leg = ShipmentLeg.objects.select_related("shipment", "destination_collection_point").filter(
        id=data.get("leg") or None, kind=ShipmentLeg.Kind.HANDOVER, destination_collection_point__entity=entity,
    ).first() if data.get("leg") else None
    if not leg:
        return ["Parcel not found at your offices"], None
    shipment = leg.shipment
    if shipment.status not in (ShipmentStatus.CONFIRMED, ShipmentStatus.IN_TRANSIT):
        return ["This delivery isn't active"], None
    transit = shipment.legs.filter(kind=ShipmentLeg.Kind.TRANSIT, provider=entity).first()
    if not transit:
        return ["This parcel has no leg with you"], None
    if transit.status != LegStatus.PENDING:
        return ["This parcel was already received"], None
    if leg.status not in OPEN_LEG + [LegStatus.HANDED_OVER]:
        return ["This parcel's delivery to us failed or was cancelled"], None
    now = timezone.now()
    with transaction.atomic():
        if leg.status != LegStatus.HANDED_OVER:
            leg.status = LegStatus.HANDED_OVER
            leg.completed_at = now
            leg.picked_up_at = leg.picked_up_at or now
            _set_payee(leg)  # the intracity person delivered to our office: their pay is due
            leg.save()
        _release_goods(shipment, leg)  # the goods certainly left the seller (once per order)
        transit.status = LegStatus.PICKED_UP
        transit.picked_up_at = now
        if data.get("waybill_number"):
            transit.waybill_number = str(data["waybill_number"]).strip()[:60]
        _set_payee(transit)  # received at our dispatch office: our pay is due
        transit.save()
        shipment.status = ShipmentStatus.IN_TRANSIT
        shipment.save()
    return [], parcel_out(transit, "IN_TRANSIT")


def arrive_parcel(entity, user, data):
    """ArriveParcel {leg (our transit leg)}: it reached the destination office; the buyer can collect."""
    leg = ShipmentLeg.objects.filter(id=data.get("leg") or None, kind=ShipmentLeg.Kind.TRANSIT, provider=entity).first() if data.get("leg") else None
    if not leg:
        return ["Parcel not found"], None
    errors, leg = update_leg({"leg": str(leg.id), "status": LegStatus.HANDED_OVER, "waybill_number": data.get("waybill_number")}, user)
    if errors:
        return errors, None
    return [], parcel_out(leg, "AWAITING")


def collect_parcel(entity, user, data):
    """CollectParcel {shipment, delivery_code}: the buyer collected it at our office."""
    errors, shipment = confirm_collected(data, user)
    if errors:
        return errors, None
    return [], {"shipment": str(shipment.id), "status": shipment.status}


# ---------------------------------------------------------------- riders

def rider_out(a, busy):
    u = a.user
    job = busy.get(a.id)
    live = bool(a.last_seen_at and a.last_seen_at >= _fresh())
    return {
        "id": str(a.id),
        "user": str(a.user_id),
        "name": " ".join(x for x in (u.first_name, u.last_name) if x) or getattr(u, "phone", "") or str(u),
        "phone": a.phone or getattr(u, "phone", None),
        "mode": a.mode,
        "mode_label": DeliveryMode(a.mode).label,
        "max_weight_kg": str(a.max_weight_kg) if a.max_weight_kg is not None else None,
        "vehicle_registration": a.vehicle_registration,
        "is_active": a.is_active,
        "is_available": a.is_available,
        "live": live,
        "last_seen_at": a.last_seen_at.isoformat() if a.last_seen_at else None,
        "state": "INACTIVE" if not a.is_active else "BUSY" if job else "ON_DUTY" if a.is_available else "OFF_DUTY",
        "current_job": {"leg": str(job.id), "kind": job.kind, "status": job.status, "seller": job.shipment.entity.title if job.shipment.entity_id else None} if job else None,
    }


def list_riders(entity):
    busy = _busy(entity)
    qs = DeliveryAgent.objects.filter(entity=entity).select_related("user").order_by("-is_active", "-is_available", "mode")
    return [rider_out(a, busy) for a in qs]


def set_rider_availability(entity, data):
    agent = DeliveryAgent.objects.filter(id=data.get("agent") or None, entity=entity).select_related("user").first() if data.get("agent") else None
    if not agent:
        return ["Rider / driver not found"], None
    agent.is_available = str(data.get("available")).lower() in ("true", "1", "yes")
    agent.save(update_fields=["is_available", "updated"])
    return [], rider_out(agent, _busy(entity))


# ---------------------------------------------------------------- dashboard

def dashboard(entity):
    listing = PlatformDeliveryProvider.objects.filter(provider=entity).first()
    agents = DeliveryAgent.objects.filter(entity=entity)
    busy = _busy(entity)
    active = agents.filter(is_active=True)
    vehicles = FleetVehicle.objects.filter(entity=entity).exclude(status=FleetVehicle.Status.RETIRED)
    soon = timezone.localdate() + timedelta(days=30)
    papers_due = vehicles.filter(Q(insurance_expiry__lte=soon) | Q(inspection_expiry__lte=soon)).count()
    month = timezone.now() - timedelta(days=30)
    our_legs = ShipmentLeg.objects.filter(provider=entity)
    owed = our_legs.filter(is_payable=True, is_settled=False).aggregate(t=Sum("payout_amount"))["t"] or Decimal("0")
    paid_30 = our_legs.filter(is_payable=True, is_settled=True, completed_at__gte=month).aggregate(t=Sum("payout_amount"))["t"] or Decimal("0")
    earned_30 = our_legs.filter(completed_at__gte=month).aggregate(t=Sum("cost"))["t"] or Decimal("0")
    is_courier = getattr(entity, "entity_type", None) == "Courier"
    return {
        "provider": {
            "id": str(entity.id),
            "title": entity.title,
            "kind": "COURIER" if is_courier else "DELIVERY_COMPANY",
            "status": listing.status if listing else "PENDING",
            "service_radius_km": str(listing.service_radius_km) if listing else None,
        },
        "riders": {
            "total": active.count(),
            "on_duty": active.filter(is_available=True).count(),
            "busy": len(set(busy) & set(active.values_list("id", flat=True))),
            "live": active.filter(last_seen_at__gte=_fresh()).count(),
        },
        "fleet": {
            "total": vehicles.count(),
            "available": vehicles.filter(status=FleetVehicle.Status.AVAILABLE).count(),
            "on_trip": vehicles.filter(status=FleetVehicle.Status.ON_TRIP).count(),
            "maintenance": vehicles.filter(status=FleetVehicle.Status.MAINTENANCE).count(),
            "papers_due": papers_due,
            "open_trips": DeliveryTrip.objects.filter(entity=entity, status__in=[DeliveryTrip.Status.PLANNED, DeliveryTrip.Status.ON_ROUTE]).count(),
        },
        "jobs": {
            # deliveries our riders / drivers are doing for sellers
            "open": our_legs.filter(status__in=[LegStatus.ASSIGNED, LegStatus.PICKED_UP]).exclude(kind=ShipmentLeg.Kind.TRANSIT).count(),
            "done_30_days": our_legs.filter(status__in=[LegStatus.DELIVERED, LegStatus.HANDED_OVER], completed_at__gte=month).count(),
        },
        "parcels": {stage: _parcels_qs(entity, stage).count() for stage in STAGES} if is_courier else None,
        "offices": CollectionPoints.objects.filter(entity=entity, is_active=True).count(),
        "offices_without_location": CollectionPoints.objects.filter(entity=entity, is_active=True, location__isnull=True).count(),
        "money": {"earned_30_days": str(earned_30), "owed": str(owed), "paid_30_days": str(paid_30)},
    }
