# logistics/utils/fleet.py
#
# A vendor's (or delivery company's) own delivery fleet (logistics.FleetVehicle):
#   vehicles  type (bicycle, motorbike, car, van, lorry), registration, capacity,
#             status, default driver, insurance / inspection expiry, odometer
#   trips     one run of a vehicle with its driver, carrying one or more delivery
#             legs (allocated at dispatch — logistics/utils/deliveries.py _allocate):
#             PLANNED (loading) -> ON_ROUTE (odometer out) -> DONE (odometer in, fuel)
#   logs      fuel, service, repairs, inspection / insurance renewals — running cost
# Vehicles in maintenance, retired, or with expired papers can't be allocated.

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

from logistics.models import DeliveryAgent, DeliveryTrip, FleetVehicle, LegStatus, VehicleLog

EXPIRY_WARN_DAYS = 30


def _day(v, label, errors):
    if v in (None, ""):
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except Exception:
        errors.append(f"Pick a valid {label}")
        return None


def _dec(v, label, errors, allow_none=True):
    if v in (None, ""):
        return None if allow_none else Decimal("0")
    try:
        d = Decimal(str(v))
    except Exception:
        errors.append(f"Enter the {label} as a number")
        return None
    if d < 0:
        errors.append(f"The {label} can't be negative")
        return None
    return d


def papers(v, today=None):
    """[(label, state)] for insurance / inspection: OK, DUE (within 30 days) or EXPIRED."""
    today = today or timezone.localdate()
    out = []
    for label, d in (("Insurance", v.insurance_expiry), ("Inspection", v.inspection_expiry)):
        if not d:
            continue
        state = "EXPIRED" if d < today else "DUE" if d <= today + timedelta(days=EXPIRY_WARN_DAYS) else "OK"
        out.append({"label": label, "expiry": d.isoformat(), "state": state})
    return out


def vehicle_out(v):
    today = timezone.localdate()
    running = v.logs.aggregate(total=Sum("cost"))["total"] or Decimal("0")
    open_trip = v.trips.filter(status__in=[DeliveryTrip.Status.PLANNED, DeliveryTrip.Status.ON_ROUTE]).first()
    p = papers(v, today)
    return {
        "id": str(v.id),
        "kind": v.kind,
        "kind_label": v.get_kind_display(),
        "registration": v.registration,
        "make_model": v.make_model,
        "capacity_kg": str(v.capacity_kg) if v.capacity_kg is not None else None,
        "status": v.status,
        "default_driver": str(v.default_driver_id) if v.default_driver_id else None,
        "default_driver_name": _person(v.default_driver) if v.default_driver_id else None,
        "insurance_expiry": v.insurance_expiry.isoformat() if v.insurance_expiry else None,
        "inspection_expiry": v.inspection_expiry.isoformat() if v.inspection_expiry else None,
        "papers": p,
        "allocatable": v.status not in (FleetVehicle.Status.MAINTENANCE, FleetVehicle.Status.RETIRED) and not any(x["state"] == "EXPIRED" for x in p),
        "odometer_km": str(v.odometer_km),
        "running_cost": str(running),
        "open_trip": str(open_trip.id) if open_trip else None,
        "notes": v.notes,
    }


def _person(agent):
    if not agent:
        return None
    u = agent.user
    return " ".join(x for x in (u.first_name, u.last_name) if x) or agent.phone or str(u)


def list_vehicles(owner):
    return [vehicle_out(v) for v in FleetVehicle.objects.filter(entity=owner).select_related("default_driver__user")]


def save_vehicle(owner, user, data):
    """SaveVehicle {vehicle?, kind, registration, make_model?, capacity_kg?, status?, default_driver?, insurance_expiry?, inspection_expiry?, odometer_km?, notes?}."""
    errors = []
    v = None
    if data.get("vehicle"):
        v = FleetVehicle.objects.filter(id=data["vehicle"], entity=owner).first()
        if not v:
            return ["Vehicle not found"], None
    kind = str(data.get("kind") or (v.kind if v else "")).upper()
    if kind not in FleetVehicle.Kind.values:
        errors.append("Pick the type of vehicle")
    reg = str(data.get("registration") or (v.registration if v else "")).strip().upper().replace(" ", "")
    if kind in ("CAR", "VAN", "TRUCK", "MOTORBIKE") and not reg:
        errors.append("Enter the registration number")
    if not reg:
        reg = f"BIKE-{FleetVehicle.objects.filter(entity=owner).count() + 1}"
    clash = FleetVehicle.objects.filter(entity=owner, registration=reg)
    if v:
        clash = clash.exclude(id=v.id)
    if clash.exists():
        errors.append(f"{reg} is already in your fleet")
    status = str(data.get("status") or (v.status if v else FleetVehicle.Status.AVAILABLE)).upper()
    if status not in FleetVehicle.Status.values:
        errors.append("Unknown status")
    if v and status != v.status and v.status == FleetVehicle.Status.ON_TRIP and status != FleetVehicle.Status.AVAILABLE:
        errors.append("Finish the vehicle's trip first")
    driver = None
    if data.get("default_driver"):
        driver = DeliveryAgent.objects.filter(id=data["default_driver"], entity=owner, is_active=True).first()
        if not driver:
            errors.append("The driver must be one of your active delivery persons")
    capacity = _dec(data.get("capacity_kg"), "capacity", errors) if "capacity_kg" in data else (v.capacity_kg if v else None)
    odo = _dec(data.get("odometer_km"), "odometer", errors) if "odometer_km" in data else None
    ins = _day(data.get("insurance_expiry"), "insurance expiry", errors) if "insurance_expiry" in data else (v.insurance_expiry if v else None)
    insp = _day(data.get("inspection_expiry"), "inspection expiry", errors) if "inspection_expiry" in data else (v.inspection_expiry if v else None)
    if errors:
        return errors, None
    if v is None:
        v = FleetVehicle(entity=owner, owner=user)
    v.kind, v.registration, v.status = kind, reg, status
    v.make_model = str(data.get("make_model") if "make_model" in data else v.make_model or "")[:80]
    v.capacity_kg = capacity
    if "default_driver" in data:
        v.default_driver = driver
    v.insurance_expiry, v.inspection_expiry = ins, insp
    if odo is not None:
        v.odometer_km = odo
    if "notes" in data:
        v.notes = str(data.get("notes") or "")[:300]
    v.save()
    return [], v


# ---------------------------------------------------------------- logs

def log_out(l):
    return {
        "id": str(l.id), "vehicle": str(l.vehicle_id), "kind": l.kind, "kind_label": l.get_kind_display(),
        "date": l.date.isoformat(), "cost": str(l.cost), "odometer_km": str(l.odometer_km) if l.odometer_km is not None else None,
        "litres": str(l.litres) if l.litres is not None else None, "notes": l.notes,
    }


def list_logs(owner, vehicle_id):
    return [log_out(l) for l in VehicleLog.objects.filter(entity=owner, vehicle_id=vehicle_id)[:500]]


def add_log(owner, user, data):
    """AddVehicleLog {vehicle, kind, date, cost, odometer_km?, litres?, notes?, new_expiry? (inspection / insurance)}."""
    errors = []
    v = FleetVehicle.objects.filter(id=data.get("vehicle") or None, entity=owner).first() if data.get("vehicle") else None
    if not v:
        return ["Vehicle not found"], None
    kind = str(data.get("kind") or "").upper()
    if kind not in VehicleLog.Kind.values:
        errors.append("Pick what this is")
    day = _day(data.get("date"), "date", errors) or timezone.localdate()
    cost = _dec(data.get("cost"), "cost", errors, allow_none=False)
    odo = _dec(data.get("odometer_km"), "odometer", errors)
    litres = _dec(data.get("litres"), "litres", errors)
    new_expiry = _day(data.get("new_expiry"), "new expiry date", errors)
    if errors:
        return errors, None
    with transaction.atomic():
        log = VehicleLog.objects.create(entity=owner, owner=user, vehicle=v, kind=kind, date=day, cost=cost or 0,
                                        odometer_km=odo, litres=litres, notes=str(data.get("notes") or "")[:300])
        changed = []
        if odo is not None and odo > v.odometer_km:
            v.odometer_km = odo
            changed.append("odometer_km")
        if new_expiry and kind == "INSURANCE":
            v.insurance_expiry = new_expiry
            changed.append("insurance_expiry")
        if new_expiry and kind == "INSPECTION":
            v.inspection_expiry = new_expiry
            changed.append("inspection_expiry")
        if changed:
            v.save(update_fields=changed + ["updated"])
    return [], log


# ---------------------------------------------------------------- trips

def trip_out(t):
    legs = list(t.legs.select_related("shipment__retailer_order", "shipment__customer_order", "shipment__wholesaler_order",
                                      "shipment__food_order", "destination_collection_point"))
    return {
        "id": str(t.id),
        "vehicle": str(t.vehicle_id),
        "registration": t.vehicle.registration,
        "kind_label": t.vehicle.get_kind_display(),
        "driver": str(t.driver_id),
        "driver_name": _person(t.driver),
        "status": t.status,
        "started_at": t.started_at.isoformat() if t.started_at else None,
        "finished_at": t.finished_at.isoformat() if t.finished_at else None,
        "start_odometer_km": str(t.start_odometer_km) if t.start_odometer_km is not None else None,
        "end_odometer_km": str(t.end_odometer_km) if t.end_odometer_km is not None else None,
        "distance_km": str(t.end_odometer_km - t.start_odometer_km) if t.end_odometer_km is not None and t.start_odometer_km is not None else None,
        "fuel_cost": str(t.fuel_cost),
        "stops": [{
            "leg": str(l.id),
            "status": l.status,
            "to": (l.destination_collection_point.title if l.destination_collection_point_id else (l.shipment.recipient_name or "Buyer")),
            "tracking_number": l.shipment.tracking_number,
            "distance_km": str(l.distance_km),
        } for l in legs],
        "created": t.created.isoformat() if t.created else None,
    }


def list_trips(owner, scope="OPEN"):
    qs = DeliveryTrip.objects.filter(entity=owner).select_related("vehicle", "driver__user").order_by("-created")
    if str(scope).upper() == "OPEN":
        qs = qs.filter(status__in=[DeliveryTrip.Status.PLANNED, DeliveryTrip.Status.ON_ROUTE])
    return [trip_out(t) for t in qs[:300]]


def _trip(owner, data):
    return DeliveryTrip.objects.select_related("vehicle").filter(id=data.get("trip") or None, entity=owner).first() if data.get("trip") else None


def start_trip(owner, data):
    """StartTrip {trip, odometer_km}: the vehicle leaves with its loaded legs."""
    t = _trip(owner, data)
    if not t:
        return ["Trip not found"], None
    if t.status != DeliveryTrip.Status.PLANNED:
        return ["This trip has already started or closed"], None
    if not t.legs.exists():
        return ["Nothing is loaded on this trip"], None
    errors = []
    odo = _dec(data.get("odometer_km"), "odometer", errors)
    if errors:
        return errors, None
    if odo is not None and odo < t.vehicle.odometer_km:
        return [f"The odometer reads more than that already ({t.vehicle.odometer_km} km)"], None
    with transaction.atomic():
        t.status, t.started_at = DeliveryTrip.Status.ON_ROUTE, timezone.now()
        t.start_odometer_km = odo if odo is not None else t.vehicle.odometer_km
        t.save()
        FleetVehicle.objects.filter(id=t.vehicle_id).update(status=FleetVehicle.Status.ON_TRIP, odometer_km=t.start_odometer_km)
    return [], t


def finish_trip(owner, data):
    """FinishTrip {trip, odometer_km, fuel_cost?}: back at base; legs not done are taken off for another trip."""
    t = _trip(owner, data)
    if not t:
        return ["Trip not found"], None
    if t.status != DeliveryTrip.Status.ON_ROUTE:
        return ["Start the trip first"], None
    errors = []
    odo = _dec(data.get("odometer_km"), "odometer", errors)
    fuel = _dec(data.get("fuel_cost"), "fuel cost", errors, allow_none=False)
    if errors:
        return errors, None
    if odo is not None and t.start_odometer_km is not None and odo < t.start_odometer_km:
        return ["The odometer can't be lower than when the trip started"], None
    with transaction.atomic():
        t.status, t.finished_at = DeliveryTrip.Status.DONE, timezone.now()
        t.end_odometer_km = odo if odo is not None else t.start_odometer_km
        t.fuel_cost = fuel or 0
        t.save()
        # Undelivered legs leave the trip (re-allocate them); delivered ones stay on record.
        t.legs.exclude(status__in=[LegStatus.DELIVERED, LegStatus.HANDED_OVER]).update(trip=None, vehicle=None)
        FleetVehicle.objects.filter(id=t.vehicle_id).update(status=FleetVehicle.Status.AVAILABLE, odometer_km=t.end_odometer_km)
        if t.fuel_cost:
            VehicleLog.objects.create(entity=owner, owner=t.driver.user, vehicle=t.vehicle, kind="FUEL",
                                      date=timezone.localdate(), cost=t.fuel_cost, odometer_km=t.end_odometer_km,
                                      notes=f"Trip {str(t.id)[:8]}")
    return [], t


def cancel_trip(owner, data):
    t = _trip(owner, data)
    if not t:
        return ["Trip not found"], None
    if t.status != DeliveryTrip.Status.PLANNED:
        return ["Only a trip still loading can be cancelled"], None
    with transaction.atomic():
        t.legs.update(trip=None, vehicle=None)
        t.status = DeliveryTrip.Status.CANCELLED
        t.save(update_fields=["status", "updated"])
    return [], t


def fleet_summary(owner):
    vs = FleetVehicle.objects.filter(entity=owner).exclude(status=FleetVehicle.Status.RETIRED)
    by = dict(vs.values("status").annotate(n=Count("id")).values_list("status", "n"))
    today = timezone.localdate()
    soon = today + timedelta(days=EXPIRY_WARN_DAYS)
    due = sum(1 for v in vs if any(d and d <= soon for d in (v.insurance_expiry, v.inspection_expiry)))
    return {"vehicles": vs.count(), "available": by.get("AVAILABLE", 0), "on_trip": by.get("ON_TRIP", 0),
            "maintenance": by.get("MAINTENANCE", 0), "papers_due": due,
            "open_trips": DeliveryTrip.objects.filter(entity=owner, status__in=["PLANNED", "ON_ROUTE"]).count()}
