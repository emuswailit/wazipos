# logistics/utils/deliveries.py
#
# Delivery logic for logistics.Shipment / ShipmentLeg (see logistics/models.py).
#
# One pipeline for every order kind — a retailer's order on a wholesaler, a
# shopper's order on a retailer, a food order, and a wholesaler's order on a
# distributor (distributors.WholesalerOrders):
#   - the buyer who wants delivery sees every option for the distance: a walking
#     delivery person (short distances), a rider (bicycle / motorbike, in town),
#     or a long-haul courier — where the buyer picks the courier and the courier
#     office to collect from (option key COURIER:<courier>:<office>);
#   - the chosen option is priced here and locked (QUOTED shipment) before paying;
#   - at dispatch the seller allocates the in-town leg (to the buyer, or to the
#     courier's dispatch office) to its own delivery person if the distance and
#     weight allow, or to a rider — its own or a partner delivery company's. The
#     leg is re-priced at that deliverer's rate (their payout); the buyer's price
#     does not change;
#   - vendors' own fleets (logistics.FleetVehicle: cars, vans, lorries, motorbikes,
#     bicycles) carry legs with a driver; several deliveries can share one trip
#     (DeliveryTrip). A vehicle mode is offered only when the owner has a usable
#     vehicle big enough (owners who have not registered a fleet keep the older
#     rule: a delivery person using that mode). Cars, vans and lorries can deliver
#     direct beyond town, as far as the owner's rate allows;
#   - for courier deliveries the seller may drop at any of the courier's dispatch
#     offices near its premises (re-priced payouts; the buyer's price is unchanged).
# ... [Header comments remain the same] ...

import math
import secrets
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from authentication.models import CollectionPoints, Entities
from logistics.models import (
    CourierRateCardLine,
    DeliveryAgent,
    DeliveryTrip,
    FleetVehicle,
    DeliveryMode,
    DeliveryRate,
    PlatformDeliveryProvider,
    LegStatus,
    Shipment,
    ShipmentLeg,
    ShipmentStatus,
)
from utils.logging import create_log

ROAD_FACTOR = Decimal("1.3")
DEFAULT_ITEM_KG = Decimal("0.50")

# ---------------------------------------------------------------- the delivery mix
#
# One policy for every order kind (shopper, retailer, wholesaler orders):
#
#   way          load      distance   offered when
#   walking      <= 8 kg   <= 3 km    the buyer is within 3 km
#   bicycle      <= 20 kg  <= 10 km   riders: short hops in town
#   motorbike    <= 60 kg  <= 50 km   riders: across town / to nearby towns
#   car          <= 400 kg <= 200 km  vehicles: bigger loads, regional
#   van/pickup   <= 1.5 t  <= 400 km  vehicles: bulk, regional
#   lorry        any       any        vehicles: bulk, any distance
#   courier      courier's own limits  beyond 30 km: someone above takes the
#                goods to the courier's dispatch office (first mile), the courier
#                moves them office to office its own way, the buyer collects at
#                the office they picked.
#
# Who carries: the seller's own delivery persons and fleet (always free to use), or
# the platform's delivery companies (riders / drivers + vehicles onboarded and
# managed by WaziPOS admin) once whitelisted (logistics.PlatformDeliveryProvider);
# at dispatch only their available people near the pickup point are offered.
# A fleet vehicle's capacity replaces the load limit; every provider's rate
# (DeliveryRate.max_distance_km / max_weight_kg) can tighten these further.
# Order weight comes from the products' captured weights (_product_kg).
MODE_LIMITS = [
    (DeliveryMode.FOOT, Decimal("8"), Decimal("3")),
    (DeliveryMode.BICYCLE, Decimal("20"), Decimal("10")),
    (DeliveryMode.MOTORBIKE, Decimal("60"), Decimal("50")),
    (DeliveryMode.CAR, Decimal("400"), Decimal("200")),
    (DeliveryMode.VAN, Decimal("1500"), Decimal("400")),
    (DeliveryMode.TRUCK, None, None),
]
LOCAL_MODES = {m for m, _, _ in MODE_LIMITS}

FINAL_LEG_STATES = {LegStatus.DELIVERED, LegStatus.HANDED_OVER}
VEHICLE_MODES = {DeliveryMode.CAR, DeliveryMode.VAN, DeliveryMode.TRUCK}
FLEET_MODES = VEHICLE_MODES | {DeliveryMode.MOTORBIKE, DeliveryMode.BICYCLE}


# ---------------------------------------------------------------- fleet

def usable_vehicles(owner, mode, kg=None):
    """The owner's fleet vehicles of `mode` that can be sent: not in maintenance or retired,
    papers in date, big enough for `kg`."""
    from django.db.models import Q

    today = timezone.localdate()
    qs = FleetVehicle.objects.filter(entity=owner, kind=mode).exclude(status__in=[FleetVehicle.Status.MAINTENANCE, FleetVehicle.Status.RETIRED])
    qs = qs.filter(Q(insurance_expiry__isnull=True) | Q(insurance_expiry__gte=today))
    qs = qs.filter(Q(inspection_expiry__isnull=True) | Q(inspection_expiry__gte=today))
    if kg is not None:
        qs = qs.filter(Q(capacity_kg__isnull=True) | Q(capacity_kg__gte=kg))
    return qs


def _has_fleet(owner, mode):
    return FleetVehicle.objects.filter(entity=owner, kind=mode).exclude(status=FleetVehicle.Status.RETIRED).exists()


def _fleet_allows(owner, mode, kg):
    """A fleet mode is possible: a usable vehicle fits, or the owner keeps no fleet of that kind (older rule)."""
    if mode not in FLEET_MODES or not _has_fleet(owner, mode):
        return True
    return usable_vehicles(owner, mode, kg).exists()


def _q(v):
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------- geometry

def km_between(a, b):
    """Approximate road distance in km between two Points (x = lon, y = lat)."""
    if not a or not b:
        return Decimal("0")
    lon1, lat1, lon2, lat2 = map(math.radians, [a.x, a.y, b.x, b.y])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    straight = Decimal(str(2 * math.asin(math.sqrt(h)) * 6371))
    return _q(straight * ROAD_FACTOR)


def entity_point(entity):
    try:
        loc = getattr(entity, "locations", None)  # entitylocations.Locations (one-to-one)
    except Exception:  # RelatedObjectDoesNotExist: no location row yet
        loc = None
    return getattr(loc, "point", None) if loc else None


def delivery_location_errors(seller, buyer=None):
    """
    DELIVERY is only open to businesses whose location is set in entitylocations:
    the seller always (deliveries are priced from it) and, for retailer orders,
    the buying retailer too (it is where the goods go). [] when delivery is allowed.
    """
    errors = []
    if not seller or not entity_point(seller):
        name = getattr(seller, "title", None) or "The seller"
        errors.append(f"{name} has not set its business location, so it can't deliver. Choose pickup instead.")
    if buyer is not None and not entity_point(buyer):
        errors.append("Set your business location to have orders delivered. Choose pickup instead.")
    return errors


# ---------------------------------------------------------------- weight

PACK_UNITS = {"Pack", "Box", "Carton"}


def _product_kg(product, qty, unit=None):
    """
    Chargeable kg for `qty` of a product: the greater of actual and volumetric
    (L x W x H / 5000) weight. Lines counted in packs / boxes / cartons weigh a
    full pack (its pack weight, else unit weight x units per pack); other lines
    weigh units. Weights are captured on the product (products.Products).
    """
    qty = Decimal(str(qty or 0))
    unit_kg = Decimal(getattr(product, "weight_kg", None) or DEFAULT_ITEM_KG)
    per_pack = int(getattr(product, "units_per_pack", None) or 1) or 1
    if unit in PACK_UNITS:
        each = Decimal(getattr(product, "pack_weight_kg", None) or unit_kg * per_pack)
        dims_factor = per_pack
    else:
        each = unit_kg
        dims_factor = 1
    actual = each * qty
    dims = [getattr(product, f, None) for f in ("length_cm", "width_cm", "height_cm")]
    # Dimensions describe one unit as listed; a pack holds units_per_pack of them.
    vol = (dims[0] * dims[1] * dims[2] / Decimal("5000")) * qty * dims_factor if all(dims) else Decimal("0")
    return max(actual, vol)


def retailer_order_weight(order):
    from wholesalers.models import RetailerOrderItems

    total = Decimal("0")
    for it in RetailerOrderItems.objects.select_related("wholesaler_receipt__product").filter(retailer_order=order):
        product = getattr(it.wholesaler_receipt, "product", None)
        if product:
            total += _product_kg(product, it.total_quantity or it.purchased_quantity, getattr(it.wholesaler_receipt, "unit_of_receipt", None))
    return _q(total)


def wholesale_items_weight(items):
    """Retailer-order lines before the order exists: [{wholesaler_receipt, purchased_quantity}, ...]."""
    from wholesalers.models import WholesalerReceipts

    ids = [str(i.get("wholesaler_receipt") or "") for i in items or [] if i.get("wholesaler_receipt")]
    lots = {
        str(r.id): r
        for r in WholesalerReceipts.objects.select_related("product").filter(id__in=ids)
        if r.product
    }
    total = Decimal("0")
    for i in items or []:
        lot = lots.get(str(i.get("wholesaler_receipt") or ""))
        if lot:
            total += _product_kg(lot.product, i.get("purchased_quantity") or i.get("quantity") or 1, lot.unit_of_receipt)
    return _q(total)


def _items_value(items, lot_key):
    """The goods' value of order lines before the order exists: lot selling price x quantity."""
    if lot_key == "wholesaler_receipt":
        from wholesalers.models import WholesalerReceipts as Lot
    else:
        from retailers.models import RetailerReceipts as Lot
    ids = [str(i.get(lot_key) or "") for i in items or [] if i.get(lot_key)]
    prices = {
        str(r.id): Decimal(getattr(r, "final_unit_selling_price", None) or r.unit_selling_price or 0)
        for r in Lot.objects.filter(id__in=ids)
    }
    total = Decimal("0")
    for i in items or []:
        try:
            qty = Decimal(str(i.get("purchased_quantity") or i.get("quantity") or 1))
        except Exception:
            qty = Decimal("1")
        total += prices.get(str(i.get(lot_key) or ""), Decimal("0")) * qty
    return _q(total)


def checkout_items_weight(items):
    """Customer checkout lines: [{retailer_receipt, purchased_quantity}, ...]."""
    from retailers.models import RetailerReceipts

    ids = [str(i.get("retailer_receipt") or "") for i in items or [] if i.get("retailer_receipt")]
    lots = {
        str(r.id): r
        for r in RetailerReceipts.objects.select_related("product").filter(id__in=ids)
        if r.product
    }
    total = Decimal("0")
    for i in items or []:
        lot = lots.get(str(i.get("retailer_receipt") or ""))
        if lot:
            # Shoppers buy pieces off the shelf unless the lot is sold by the pack.
            total += _product_kg(lot.product, i.get("purchased_quantity") or i.get("quantity") or 1, getattr(lot, "unit_of_issue", None) or lot.unit_of_receipt)
    return _q(total)


# ---------------------------------------------------------------- pricing

def rate_for(entity, mode):
    """The entity's active rate for `mode`, or a fallback built from ShippingConfiguration."""
    rate = DeliveryRate.objects.filter(entity=entity, mode=mode, is_active=True).first() if entity else None
    if rate:
        return rate
    from retailers.models import ShippingConfiguration

    cfg = ShippingConfiguration.objects.filter(is_active=True).first()
    fallback = DeliveryRate(mode=mode)
    if cfg:
        fallback.base_fee = cfg.base_dispatch_fee
        fallback.rate_per_km = cfg.intercounty_rate_per_km if mode == DeliveryMode.COURIER else cfg.local_rate_per_km
        fallback.rate_per_kg = cfg.surcharge_per_kg
    return fallback


def price(rate, km, kg, value=0):
    """
    One leg: base + per km + per chargeable kg (the greater of actual and
    volumetric weight — packaging size counts) + value_percent of the cargo value
    (insurance / handling), never below the minimum fee.
    """
    cost = _q(rate.base_fee) + _q(rate.rate_per_km) * Decimal(km) + _q(rate.rate_per_kg) * Decimal(kg)
    cost += _q(Decimal(str(value or 0)) * _q(getattr(rate, "value_percent", 0) or 0) / Decimal("100"))
    return _q(max(cost, _q(rate.min_fee)))


def _chart_line(courier, origin_cp, dest_cp, kg):
    """The most specific line of the courier's active rate charts for this route and weight, or None."""
    today = timezone.localdate()
    from django.db.models import Q

    lines = (
        CourierRateCardLine.objects.select_related("card")
        .filter(card__entity=courier, card__is_active=True, min_kg__lte=kg)
        .filter(Q(card__effective_from__isnull=True) | Q(card__effective_from__lte=today))
        .filter(Q(max_kg__isnull=True) | Q(max_kg__gte=kg))
        .filter(Q(origin_office__isnull=True) | Q(origin_office=origin_cp))
        .filter(Q(destination_office__isnull=True) | Q(destination_office=dest_cp))
        .filter(Q(origin_county__isnull=True) | Q(origin_county_id=getattr(origin_cp, "county_id", None)))
        .filter(Q(destination_county__isnull=True) | Q(destination_county_id=getattr(dest_cp, "county_id", None)))
    )
    best, best_key = None, None
    for line in lines:
        specificity = (
            2 * bool(line.origin_office_id) + bool(line.origin_county_id)
            + 2 * bool(line.destination_office_id) + bool(line.destination_county_id)
        )
        key = (-specificity, line.price)
        if best is None or key < best_key:
            best, best_key = line, key
    return best


def courier_leg_price(courier, origin_cp, dest_cp, km, kg, value=0):
    """
    The courier's own leg (dispatch office -> collection office): its published rate
    chart when a line matches (+ the card's value percent), else its COURIER rate.
    Returns (cost, lead_time_days or None).
    """
    line = _chart_line(courier, origin_cp, dest_cp, Decimal(kg)) if origin_cp and dest_cp else None
    if line:
        cost = _q(line.price)
        if line.max_kg is None and line.extra_per_kg:
            cost += _q(line.extra_per_kg) * max(Decimal(kg) - _q(line.min_kg), Decimal("0"))
        cost += _q(Decimal(str(value or 0)) * _q(line.card.value_percent) / Decimal("100"))
        return _q(cost), line.lead_time_days
    return price(rate_for(courier, DeliveryMode.COURIER), km, kg, value), None


# ---------------------------------------------------------------- delivery options

# Persons and riders deliver direct up to this (road km); beyond it only cars, vans
# and lorries go direct (within their own limits), and couriers take the rest.
LOCAL_MAX_KM = Decimal("50")


def delivery_requested(order):
    """The buyer chose delivery (RetailerOrders.delivery_method "COURIER")."""
    return str(getattr(order, "delivery_method", "") or "").upper() in ("COURIER", "DELIVERY")


# ---------------------------------------------------------------- who can carry
#
# Own pool: the seller's own delivery persons + fleet, never filtered by distance.
# Platform pool: riders / drivers of WHITELISTED delivery companies (admin managed),
# offered only within the company's service radius of the pickup point, measured
# from where the person is now (location seen in the last AGENT_FRESH_MINUTES),
# else from the company's base. At dispatch (live) only those on duty and not out
# on another delivery are offered.
AGENT_FRESH_MINUTES = 30


def whitelisted_providers(kind):
    """{entity id: PlatformDeliveryProvider} WaziPOS admin has whitelisted, of this kind."""
    return {
        p.provider_id: p
        for p in PlatformDeliveryProvider.objects.filter(kind=kind, status=PlatformDeliveryProvider.Status.WHITELISTED).select_related("provider")
    }


def agent_position(agent):
    """(point, live): where the person is now if seen lately, else their company's base (live False)."""
    fresh = timezone.now() - timedelta(minutes=AGENT_FRESH_MINUTES)
    if agent.last_point and agent.last_seen_at and agent.last_seen_at >= fresh:
        return agent.last_point, True
    return entity_point(agent.entity), False


def _busy_agent_ids(agent_ids):
    """People already out on a delivery (a leg assigned / picked up, not one loading on a planned trip)."""
    from django.db.models import Q

    return set(
        ShipmentLeg.objects.filter(agent_id__in=agent_ids, status__in=[LegStatus.ASSIGNED, LegStatus.PICKED_UP])
        .filter(Q(trip__isnull=True) | ~Q(trip__status=DeliveryTrip.Status.PLANNED))
        .values_list("agent_id", flat=True)
    )


def _person_providers(seller, origin=None, live=False):
    """
    [(provider, [agents])]: the seller's own people first, then whitelisted delivery
    companies' people within reach of `origin` (each agent gets .km_away and
    .live_location; own people .km_away None). live: dispatch now — platform
    people on duty and not busy only.
    """
    own = list(DeliveryAgent.objects.filter(entity=seller, is_active=True).select_related("entity", "user"))
    for a in own:
        a.km_away, a.live_location, a.platform = None, False, False
    out = [(seller, own)] if own else []

    listed = whitelisted_providers(PlatformDeliveryProvider.Kind.DELIVERY_COMPANY)
    listed.pop(seller.id, None)
    if not listed:
        return out
    agents = DeliveryAgent.objects.filter(entity_id__in=listed.keys(), is_active=True).select_related("entity", "user")
    if live:
        agents = agents.filter(is_available=True)
    agents = list(agents)
    busy = _busy_agent_ids([a.id for a in agents]) if live else set()
    by_provider = {}
    for agent in agents:
        if agent.id in busy:
            continue
        point, fresh = agent_position(agent)
        km = km_between(point, origin) if (point and origin) else None
        if origin is not None and (km is None or km > Decimal(listed[agent.entity_id].service_radius_km)):
            continue
        agent.km_away, agent.live_location, agent.platform = km, fresh, True
        by_provider.setdefault(agent.entity_id, (agent.entity, []))[1].append(agent)
    for provider, people in by_provider.values():
        people.sort(key=lambda a: (a.km_away is None, a.km_away or 0))
        out.append((provider, people))
    return out


def _best_person_leg(provider, agents, km, kg, modes=None, value=0):
    """Cheapest mode the provider's delivery persons can do for this distance and weight (optionally only `modes`)."""
    best = None
    allowed = set(modes) if modes else LOCAL_MODES
    
    # Debugging: Print what we are evaluating
    print(f"DEBUG _best_person_leg: Provider={provider.title}, Distance={km}km, Weight={kg}kg, Agents={len(agents)}")

    for mode in {a.mode for a in agents if a.mode in allowed}:
        limit = next(((mk, mm) for m, mk, mm in MODE_LIMITS if m == mode), (None, None))
        if not _fleet_allows(provider, mode, kg):
            continue
        if mode in VEHICLE_MODES and _has_fleet(provider, mode):
            limit = (None, limit[1])  # the vehicle's own capacity decides the weight
        if (limit[0] is not None and kg > limit[0]) or (limit[1] is not None and km > limit[1]):
            print(f"DEBUG: Rejected {mode} - Exceeds hard limits (Max kg: {limit[0]}, Max km: {limit[1]})")
            continue
        if not any(a.mode == mode and (a.max_weight_kg is None or kg <= a.max_weight_kg) for a in agents):
            print(f"DEBUG: Rejected {mode} - No specific agent can carry this weight")
            continue
        rate = rate_for(provider, mode)
        if rate.max_distance_km is not None and km > rate.max_distance_km:
            print(f"DEBUG: Rejected {mode} - Exceeds provider rate max distance ({rate.max_distance_km}km)")
            continue
        cost = price(rate, km, kg, value)
        if best is None or cost < best[1]:
            best = (mode, cost)
    return best


def _nearest_point(courier, point):
    """The courier's active office nearest to `point`."""
    from django.contrib.gis.db.models.functions import Distance

    if not point:
        return None
    return (
        CollectionPoints.objects.filter(entity=courier, is_active=True, location__isnull=False)
        .annotate(d=Distance("location", point)).order_by("d").first()
    )


def _points_near(courier, point, limit=6):
    """The courier's active offices nearest to `point` (the buyer picks one)."""
    from django.contrib.gis.db.models.functions import Distance

    if not point:
        return []
    return list(
        CollectionPoints.objects.filter(entity=courier, is_active=True, location__isnull=False)
        .annotate(d=Distance("location", point)).order_by("d")[:limit]
    )


def cp_from_key(key):
    """The courier office the buyer picked, from an option key COURIER:<courier>:<office>."""
    parts = str(key or "").split(":")
    return parts[2] if len(parts) >= 3 and parts[0] == "COURIER" else None


def find_option(options, key):
    """The option with this key (an older COURIER:<courier> key means that courier's nearest office)."""
    key = str(key or "").strip()
    if key.startswith("LOCAL:"):
        key = "LOCAL"
    hit = next((o for o in options if o["key"] == key), None)
    if hit or not key.startswith("COURIER:") or key.count(":") != 1:
        return hit
    return next((o for o in options if o["key"].startswith(key + ":")), None)


def _leg(kind, mode, provider, km, cost, **extra):
    return dict(kind=kind, mode=mode, provider=provider, distance_km=km, cost=cost, **extra)


def delivery_options(seller, origin, destination, kg, dest_cp_id=None, value=0):
    """
    Every way `seller` can deliver `kg` from `origin` to `destination` — the
    delivery mix above (walking / riders / vehicles / couriers), each fully priced,
    cheapest first. Same offer for every order kind.
    """
    return tiered_delivery_options(seller, origin, destination, kg, dest_cp_id, value)


# ---------------------------------------------------------------- the offer by distance
#
# What every buyer is offered (road km; loads per the delivery mix table above):
#   up to 3 km    walking delivery, riders, vehicles
#   3 - 30 km     riders (as far as each goes), vehicles
#   over 30 km    riders where they reach, vehicles, and long-haul couriers
WALK_MAX_KM = Decimal("3")  # walking delivery: the policy table above
COURIER_FROM_KM = Decimal("30")
DELIVERY_GROUPS = {
    "WALK": ("Walking delivery", (DeliveryMode.FOOT,)),
    "RIDER": ("Rider", (DeliveryMode.BICYCLE, DeliveryMode.MOTORBIKE)),
    "VEHICLE": ("Car / van / lorry", (DeliveryMode.CAR, DeliveryMode.VAN, DeliveryMode.TRUCK)),
}


def _courier_options(seller, providers, origin, destination, kg, dest_cp_id=None, value=0):
    """
    A delivery person from the seller to the courier's dispatch office, then the
    courier to the office the buyer collects from: the one they picked
    (dest_cp_id), else the nearest. Each option lists the courier's offices near
    the buyer so they can pick another.
    """
    options = []
    # Long-haul couriers: those WaziPOS admin has whitelisted.
    couriers = [p.provider for p in whitelisted_providers(PlatformDeliveryProvider.Kind.COURIER).values() if p.provider_id != seller.id]
    for courier in couriers:
        nearby = _points_near(courier, destination)
        origin_cp = _nearest_point(courier, origin)
        dest_cp = None
        if dest_cp_id:
            dest_cp = CollectionPoints.objects.filter(id=dest_cp_id, entity=courier, is_active=True, location__isnull=False).first()
        dest_cp = dest_cp or (nearby[0] if nearby else None)
        if not origin_cp or not dest_cp:
            continue
        hand_km = km_between(origin, origin_cp.location)
        hand = None
        for provider, agents in providers:
            best = _best_person_leg(provider, agents, hand_km, kg, value=value)
            if best and (hand is None or best[1] < hand[2]):
                hand = (provider, best[0], best[1])
        if not hand:
            continue
        transit_km = km_between(origin_cp.location, dest_cp.location)
        transit_cost, lead_days = courier_leg_price(courier, origin_cp, dest_cp, transit_km, kg, value)
        courier_rate = rate_for(courier, DeliveryMode.COURIER)
        if (courier_rate.max_weight_kg is not None and kg > courier_rate.max_weight_kg) or (
            courier_rate.max_distance_km is not None and transit_km > courier_rate.max_distance_km
        ):
            continue  # beyond what this courier carries
        options.append({
            "key": f"COURIER:{courier.id}:{dest_cp.id}",
            "method": Shipment.Method.COURIER,
            "group": "COURIER",
            "group_label": "Long-haul courier",
            "courier": courier,
            "lead_time_days": lead_days,
            "collection_point": dest_cp,
            "collection_points": [
                {"id": str(p.id), "title": p.title, "distance_km": str(km_between(destination, p.location))} for p in nearby
            ],
            "legs": [
                _leg(ShipmentLeg.Kind.HANDOVER, hand[1], hand[0], hand_km, hand[2],
                     origin_point=origin, destination_point=origin_cp.location, destination_collection_point=origin_cp),
                _leg(ShipmentLeg.Kind.TRANSIT, DeliveryMode.COURIER, courier, transit_km, transit_cost,
                     origin_collection_point=origin_cp, origin_point=origin_cp.location,
                     destination_collection_point=dest_cp, destination_point=dest_cp.location),
            ],
        })
    return options


def tiered_delivery_options(seller, origin, destination, kg, dest_cp_id=None, value=0):
    """
    What a buyer is offered (every order kind):
      - "Delivered to you" — one option when someone (the seller's people or fleet,
        or a partner delivery company) can bring it direct; priced at the cheapest
        way that fits. The SELLER decides at dispatch who / which vehicle actually goes.
      - beyond COURIER_FROM_KM, long-haul couriers: the buyer picks only the office
        to collect from; the seller decides how the goods reach the courier.
    Prices cover every leg, the chargeable weight (actual or packaging volume) and
    the cargo value. option = {key, method, group, group_label, distance_km, legs, total, ...}.
    """
    providers = _person_providers(seller, origin)
    km = km_between(origin, destination)
    modes = None if km <= LOCAL_MAX_KM else VEHICLE_MODES
    if km > WALK_MAX_KM:
        modes = set(modes or LOCAL_MODES) - {DeliveryMode.FOOT}
    best = None
    for provider, agents in providers:
        found = _best_person_leg(provider, agents, km, kg, modes=modes, value=value)
        if found and (best is None or found[1] < best[2]):
            best = (provider, found[0], found[1])
    options = []
    if best:
        provider, mode, cost = best
        options.append({
            "key": "LOCAL",
            "method": Shipment.Method.LOCAL,
            "group": "LOCAL",
            "group_label": "Delivered to you",
            "legs": [_leg(ShipmentLeg.Kind.LOCAL, mode, provider, km, cost,
                          origin_point=origin, destination_point=destination)],
        })
    if km > COURIER_FROM_KM:
        options += _courier_options(seller, providers, origin, destination, kg, dest_cp_id, value)
    for opt in options:
        opt["total"] = _q(sum((leg["cost"] for leg in opt["legs"]), Decimal("0")))
        opt["distance_km"] = km
        opt["chargeable_weight_kg"] = _q(kg)
        opt["cargo_value"] = _q(value or 0)
    options.sort(key=lambda o: o["total"])
    return options


def retailer_order_delivery_options(order, dest_cp_id=None):
    """Options for a retailer order (wholesaler -> retailer). Returns (errors, options, kg)."""
    seller, buyer = order.wholesaler, order.retailer
    errors = delivery_location_errors(seller, buyer)
    if errors:
        return errors, [], Decimal("0")
    origin, destination = entity_point(seller), entity_point(buyer)
    kg = retailer_order_weight(order)
    value = Decimal(str(order.final_price_total or 0))
    return [], delivery_options(seller, origin, destination, kg, dest_cp_id, value), kg


def staff_retailer_order_delivery_options(seller, retailer, items, dest_cp_id=None):
    """Wholesaler staff building an order for `retailer`: (errors, options, kg)."""
    errors = delivery_location_errors(seller)
    if not errors and retailer is not None and not entity_point(retailer):
        errors = [f"{retailer.title} has not set its business location, so it can't receive deliveries. Choose pickup instead."]
    if errors:
        return errors, [], Decimal("0")
    kg = wholesale_items_weight(items)
    value = _items_value(items, "wholesaler_receipt")
    return [], delivery_options(seller, entity_point(seller), entity_point(retailer), kg, dest_cp_id, value), kg


def plan_staff_retailer_order_delivery(seller, retailer, items, option_key):
    """Re-price the option staff picked: (errors, chosen, kg)."""
    errors, options, kg = staff_retailer_order_delivery_options(seller, retailer, items, cp_from_key(option_key))
    if errors:
        return errors, None, kg
    chosen = find_option(options, option_key)
    if not chosen:
        return ["That delivery option is no longer available; choose again"], None, kg
    return [], chosen, kg


def attach_retailer_order_shipment(order, chosen, kg, user):
    """Save a staff-chosen delivery as the retailer order's (QUOTED) shipment."""
    return _create_quoted_shipment(
        seller=order.wholesaler, user=user, chosen=chosen, kg=kg,
        origin=entity_point(order.wholesaler), destination=entity_point(order.retailer),
        recipient_name=order.retailer.title, recipient_phone=getattr(order.retailer, "phone", None),
        retailer_order=order,
    )


def preassign_delivery_person(shipment, agent_id):
    """
    Seller staff can name the delivery person when the order is made; the leg
    stays PENDING (it is dispatched once the order is paid and ready). Returns an error or None.
    """
    if not agent_id:
        return None
    leg = shipment.legs.exclude(kind=ShipmentLeg.Kind.TRANSIT).order_by("sequence").first()
    if not leg:
        return None
    agent, err = _allocate(leg, agent_id)
    if err:
        return err
    leg.agent = agent
    leg.save(update_fields=["agent", "provider", "mode", "cost", "vehicle", "trip"])
    return None


def checkout_delivery_options(seller, destination, items, dest_cp_id=None):
    """Options for a customer checkout (retailer -> customer). Returns (errors, options, kg)."""
    errors = delivery_location_errors(seller)
    if errors:
        return errors, [], Decimal("0")
    origin = entity_point(seller)
    if not destination:
        return ["Share your delivery location to see delivery options"], [], Decimal("0")
    kg = checkout_items_weight(items)
    value = _items_value(items, "retailer_receipt")
    return [], tiered_delivery_options(seller, origin, destination, kg, dest_cp_id, value), kg


def _create_quoted_shipment(*, seller, user, chosen, kg, origin, destination, recipient_name, recipient_phone, **order_link):
    shipment = Shipment.objects.create(
        entity=seller, owner=user, method=chosen["method"], status=ShipmentStatus.QUOTED,
        origin_point=origin, destination_point=destination,
        destination_collection_point=chosen["legs"][-1].get("destination_collection_point")
        if chosen["method"] == Shipment.Method.COURIER else None,
        recipient_name=recipient_name, recipient_phone=recipient_phone,
        chargeable_weight_kg=kg,
        cargo_value=chosen.get("cargo_value") or 0,
        distance_km=_q(sum((leg["distance_km"] for leg in chosen["legs"]), Decimal("0"))),
        total_cost=chosen["total"],
        **order_link,
    )
    for i, leg in enumerate(chosen["legs"], start=1):
        ShipmentLeg.objects.create(shipment=shipment, sequence=i, entity=seller, owner=user,
                                   status=LegStatus.PENDING, **leg)
    return shipment


# ---------------------------------------------------------------- wholesaler orders on distributors

def wholesaler_order_lines_weight(lines):
    """[(DistributorReceipts lot, units)] -> chargeable kg."""
    total = Decimal("0")
    for lot, units in lines:
        if lot.product_id:
            total += _product_kg(lot.product, units, lot.unit_of_receipt)
    return _q(total)


def wholesaler_order_delivery_options(distributor, wholesaler, lines, dest_cp_id=None):
    """
    A wholesaler ordering from a distributor: walking delivery / rider / courier
    for the distance (same tiers as shopper checkout). Returns (errors, options, kg).
    """
    errors = delivery_location_errors(distributor, wholesaler)
    if errors:
        return errors, [], Decimal("0")
    kg = wholesaler_order_lines_weight(lines)
    value = sum((Decimal(lot.final_unit_selling_price or lot.unit_selling_price or 0) * units for lot, units in lines), Decimal("0"))
    return [], tiered_delivery_options(distributor, entity_point(distributor), entity_point(wholesaler), kg, dest_cp_id, value), kg


def plan_wholesaler_order_delivery(distributor, wholesaler, lines, option_key):
    """Re-price the option the wholesaler picked: (errors, chosen, kg)."""
    if not str(option_key or "").strip():
        return ["Choose how it should be delivered"], None, Decimal("0")
    errors, options, kg = wholesaler_order_delivery_options(distributor, wholesaler, lines, cp_from_key(option_key))
    if errors:
        return errors, None, kg
    chosen = find_option(options, option_key)
    if not chosen:
        return ["That delivery option is no longer available; choose again"], None, kg
    return [], chosen, kg


# ---------------------------------------------------------------- distributors' orders on manufacturers

def purchase_order_lines_weight(lines):
    """[(ManufacturerBatches batch, units of issue)] -> chargeable kg (a unit of issue holds packs_per_unit packs)."""
    total = Decimal("0")
    for batch, units in lines:
        if batch.product_id:
            total += _product_kg(batch.product, Decimal(units) * Decimal(batch.packs_per_unit or 1), "Pack")
    return _q(total)


def purchase_order_delivery_options(manufacturer, distributor, lines, dest_cp_id=None):
    """A distributor ordering from a manufacturer: the same delivery mix. Returns (errors, options, kg)."""
    errors = delivery_location_errors(manufacturer, distributor)
    if errors:
        return errors, [], Decimal("0")
    kg = purchase_order_lines_weight(lines)
    value = sum((Decimal(b.final_unit_price or b.unit_price or 0) * units for b, units in lines), Decimal("0"))
    return [], tiered_delivery_options(manufacturer, entity_point(manufacturer), entity_point(distributor), kg, dest_cp_id, value), kg


def plan_purchase_order_delivery(manufacturer, distributor, lines, option_key):
    """Re-price the option the distributor picked: (errors, chosen, kg)."""
    if not str(option_key or "").strip():
        return ["Choose how it should be delivered"], None, Decimal("0")
    errors, options, kg = purchase_order_delivery_options(manufacturer, distributor, lines, cp_from_key(option_key))
    if errors:
        return errors, None, kg
    chosen = find_option(options, option_key)
    if not chosen:
        return ["That delivery option is no longer available; choose again"], None, kg
    return [], chosen, kg


def attach_purchase_order_shipment(order, chosen, kg, user):
    """Save the distributor's chosen delivery as the order's (QUOTED) shipment."""
    return _create_quoted_shipment(
        seller=order.manufacturer, user=user, chosen=chosen, kg=kg,
        origin=entity_point(order.manufacturer), destination=entity_point(order.distributor),
        recipient_name=order.distributor.title, recipient_phone=getattr(order.distributor, "phone", None),
        distributor_purchase_order=order,
    )


def attach_wholesaler_order_shipment(order, chosen, kg, user):
    """Save the wholesaler's chosen delivery as the order's (QUOTED) shipment."""
    return _create_quoted_shipment(
        seller=order.distributor, user=user, chosen=chosen, kg=kg,
        origin=entity_point(order.distributor), destination=entity_point(order.wholesaler),
        recipient_name=order.wholesaler.title, recipient_phone=getattr(order.wholesaler, "phone", None),
        wholesaler_order=order,
    )


def plan_customer_checkout_delivery(seller, destination, items, option_key):
    """
    At customer checkout: re-price the chosen option server-side.
    Returns (errors, chosen, kg); chosen["total"] is the order's shipping cost.
    """
    errors, options, kg = checkout_delivery_options(seller, destination, items, cp_from_key(option_key))
    if errors:
        return errors, None, kg
    chosen = find_option(options, option_key)
    if not chosen:
        return ["That delivery option is no longer available; choose again"], None, kg
    return [], chosen, kg


def attach_customer_order_shipment(order, chosen, kg, user):
    """Save the customer's chosen delivery as the order's (QUOTED) shipment."""
    return _create_quoted_shipment(
        seller=order.entity, user=user, chosen=chosen, kg=kg,
        origin=entity_point(order.entity), destination=order.destination_point,
        recipient_name=order.recipient_name or order.customer_name,
        recipient_phone=order.recipient_phone or order.customer_phone,
        customer_order=order,
    )


def _buyer_order(data, user):
    from wholesalers.models import RetailerOrders

    order = RetailerOrders.objects.select_related("wholesaler", "retailer").filter(
        id=data.get("retailer_order"), retailer=user.entity
    ).first()
    if not order:
        return "Retailer order for provided ID does not exist", None
    if str(order.status).upper() == "CANCELLED":
        return "This order was cancelled", None
    return None, order


def choose_retailer_order_delivery(data, user):
    """
    Buyer picks, before paying: "option" = a key from the options list, or "PICKUP".
    The option is re-priced here (client prices are never trusted). Returns (errors, order).
    """
    from wholesalers.models import RetailerOrderPayments
    from wholesalers.services.retailer_order_payments import broadcast_order

    err, order = _buyer_order(data, user)
    if err:
        return [err], None
    if RetailerOrderPayments.objects.filter(retailer_order=order, status__in=["SUCCESS", "PENDING"]).exists():
        return ["Delivery is chosen before paying; this order already has a payment"], None

    key = str(data.get("option") or "").strip()
    with transaction.atomic():
        Shipment.objects.filter(retailer_order=order, status=ShipmentStatus.QUOTED).delete()
        if key.upper() == "PICKUP":
            order.delivery_method = "SELF"
            order.shipping_amount = Decimal("0")
            order.save()
            broadcast_order(order)
            return [], order

        errors, options, kg = retailer_order_delivery_options(order, cp_from_key(key))
        if errors:
            return errors, None
        chosen = find_option(options, key)
        if not chosen:
            return ["That delivery option is no longer available; reload the options"], None

        _create_quoted_shipment(
            seller=order.wholesaler, user=user, chosen=chosen, kg=kg,
            origin=entity_point(order.wholesaler), destination=entity_point(order.retailer),
            recipient_name=order.retailer.title, recipient_phone=getattr(order.retailer, "phone", None),
            retailer_order=order,
        )
        order.delivery_method = "COURIER"
        order.shipping_amount = chosen["total"]
        order.save()
    broadcast_order(order)
    return [], order


# ---------------------------------------------------------------- dispatch

def allocatable_agents(leg):
    """
    Who the seller can send on a person leg: its own delivery persons and fleet, or
    the available riders / drivers of whitelisted platform delivery companies near
    the pickup point — for fleet modes, each driver with each usable vehicle of
    their employer (one row per pair) — with what the leg would pay and whether
    they can do it. [{agent, vehicle, provider, cost, ok, reason, own, trip, km_away, live_location}].
    """
    shipment = leg.shipment
    seller = shipment.entity
    km = Decimal(leg.distance_km or 0)
    kg = Decimal(shipment.chargeable_weight_kg or 0)
    pickup = leg.origin_point or shipment.origin_point or entity_point(seller)
    out = []
    for provider, agents in _person_providers(seller, pickup, live=True):
        for agent in agents:
            if agent.mode not in LOCAL_MODES:
                continue
            limit = next(((mk, mm) for m, mk, mm in MODE_LIMITS if m == agent.mode), (None, None))
            fleet = agent.mode in FLEET_MODES and _has_fleet(provider, agent.mode)
            if fleet and agent.mode in VEHICLE_MODES:
                limit = (None, limit[1])
            reason = None
            if limit[0] is not None and kg > limit[0]:
                reason = f"{DeliveryMode(agent.mode).label} carries up to {limit[0]} kg"
            elif limit[1] is not None and km > limit[1]:
                reason = f"{DeliveryMode(agent.mode).label} goes up to {limit[1]} km"
            elif agent.max_weight_kg is not None and kg > agent.max_weight_kg:
                reason = f"carries up to {agent.max_weight_kg} kg"
            rate = rate_for(provider, agent.mode)
            if not reason and rate.max_distance_km is not None and km > rate.max_distance_km:
                reason = f"{provider.title} delivers up to {rate.max_distance_km} km"
            if not reason and not agent.is_available:
                reason = "off duty"
            cost = price(rate, km, kg, shipment.cargo_value)
            base = {
                "agent": agent, "provider": provider, "cost": cost, "own": provider.id == seller.id,
                "km_away": agent.km_away, "live_location": agent.live_location,
            }
            if not fleet:
                out.append({**base, "vehicle": None, "trip": None, "ok": reason is None, "reason": reason})
                continue
            # A vehicle paired with a driver (its usual driver) goes only with that driver.
            vehicles = [v for v in usable_vehicles(provider, agent.mode, kg) if not v.default_driver_id or v.default_driver_id == agent.id]
            if not vehicles:
                out.append({**base, "vehicle": None, "trip": None, "ok": False, "reason": reason or f"no {DeliveryMode(agent.mode).label.lower()} free that can carry {kg} kg"})
            for v in vehicles:
                trip = DeliveryTrip.objects.filter(vehicle=v, driver=agent, status=DeliveryTrip.Status.PLANNED).first()
                out.append({**base, "vehicle": v, "trip": trip, "ok": reason is None, "reason": reason})
    # Own people first, then paired driver + vehicle, then the nearest, then the cheapest.
    out.sort(key=lambda r: (
        not r["ok"], not r["own"],
        not (r.get("vehicle") is not None and r["vehicle"].default_driver_id == r["agent"].id),
        r["km_away"] if r["km_away"] is not None else Decimal("0"), r["cost"],
    ))
    return out


def dispatch_offices(leg, limit=5):
    """Courier deliveries: the courier's offices nearest the seller's premises (where the handover leg may end)."""
    if leg.kind != ShipmentLeg.Kind.HANDOVER:
        return []
    transit = leg.shipment.legs.filter(kind=ShipmentLeg.Kind.TRANSIT).first()
    if not transit or not transit.provider_id:
        return []
    origin = leg.origin_point or leg.shipment.origin_point
    return [
        {"id": str(p.id), "title": p.title, "distance_km": str(km_between(origin, p.location)), "current": p.id == leg.destination_collection_point_id}
        for p in _points_near(transit.provider, origin, limit)
    ]


def _set_dispatch_office(leg, office_id):
    """Re-route a handover leg to another office of the same courier (the transit leg starts there). Payouts re-priced."""
    if not office_id or leg.kind != ShipmentLeg.Kind.HANDOVER or str(office_id) == str(leg.destination_collection_point_id or ""):
        return None
    transit = leg.shipment.legs.filter(kind=ShipmentLeg.Kind.TRANSIT).first()
    if not transit:
        return "This delivery has no courier leg"
    office = CollectionPoints.objects.filter(id=office_id, entity_id=transit.provider_id, is_active=True, location__isnull=False).first()
    if not office:
        return "Pick one of the courier's offices"
    kg = Decimal(leg.shipment.chargeable_weight_kg or 0)
    leg.destination_collection_point = office
    leg.destination_point = office.location
    leg.distance_km = km_between(leg.origin_point or leg.shipment.origin_point, office.location)
    transit.origin_collection_point = office
    transit.origin_point = office.location
    transit.distance_km = km_between(office.location, transit.destination_point)
    transit.cost, _ = courier_leg_price(transit.provider, office, transit.destination_collection_point, transit.distance_km, kg, leg.shipment.cargo_value)
    transit.save(update_fields=["origin_collection_point", "origin_point", "distance_km", "cost"])
    return None


def _allocate(leg, agent_id, vehicle_id=None):
    """
    The seller sends this person leg with any delivery person who can do it — own
    staff or a partner's rider / driver, with one of their fleet vehicles where they
    keep a fleet. Re-priced at their rate (their payout); the buyer's price is
    unchanged. A vehicle joins its loading trip with that driver, or starts one.
    Returns (agent, error).
    """
    if not agent_id:
        return None, "Pick the delivery person"
    rows = [r for r in allocatable_agents(leg) if str(r["agent"].id) == str(agent_id)]
    if not rows:
        return None, "Pick one of your delivery persons, or an available WaziPOS rider / driver near you"
    if vehicle_id:
        row = next((r for r in rows if r["vehicle"] and str(r["vehicle"].id) == str(vehicle_id)), None)
        if not row:
            return None, "Pick a vehicle that can take this delivery"
    else:
        row = next((r for r in rows if r["ok"]), rows[0])
        if row["vehicle"] is not None:
            row = next((r for r in rows if r["ok"] and r["vehicle"] and row["agent"].mode in FLEET_MODES), row)
    if not row["ok"]:
        return None, f"{row['agent'].user} can't take this delivery: {row['reason']}"
    leg.provider = row["provider"]
    leg.mode = row["agent"].mode
    leg.cost = row["cost"]
    leg.vehicle = row["vehicle"]
    if row["vehicle"] is not None:
        trip = row["trip"] or DeliveryTrip.objects.create(
            entity=row["provider"], owner=row["agent"].user, vehicle=row["vehicle"], driver=row["agent"],
        )
        leg.trip = trip
    else:
        leg.trip = None
    return row["agent"], None


def _agent_of(provider, agent_id, mode, kg):
    agent = DeliveryAgent.objects.select_related("user").filter(id=agent_id, entity=provider, is_active=True).first()
    if not agent:
        return None, f"Pick an active delivery person of {provider.title}"
    if agent.mode != mode:
        return None, f"This delivery was priced for {DeliveryMode(mode).label.lower()}; pick a delivery person who uses it"
    if agent.max_weight_kg is not None and kg > agent.max_weight_kg:
        return None, f"{agent} can't carry {kg} kg"
    return agent, None


def _seller_order(data, user):
    """(error, order, kind): a retailer order sent to, or a customer order placed with, the caller's entity."""
    from retailers.models import CustomerOrders
    from wholesalers.models import RetailerOrders

    if data.get("customer_order"):
        order = CustomerOrders.objects.filter(id=data["customer_order"], entity=user.entity).first()
        return (None if order else "Customer order for provided ID does not exist"), order, "customer"
    if data.get("food_order"):
        from restaurants.models import FoodOrder

        order = FoodOrder.objects.filter(id=data["food_order"], entity=user.entity).first()
        return (None if order else "Food order for provided ID does not exist"), order, "food"
    if data.get("distributor_purchase_order"):
        from manufacturers.models import DistributorPurchaseOrders

        order = DistributorPurchaseOrders.objects.select_related("manufacturer", "distributor").filter(
            id=data["distributor_purchase_order"], manufacturer=user.entity
        ).first()
        return (None if order else "Purchase order for provided ID does not exist"), order, "manufacturer"
    if data.get("wholesaler_order"):
        from distributors.models import WholesalerOrders

        order = WholesalerOrders.objects.select_related("distributor", "wholesaler").filter(
            id=data["wholesaler_order"], distributor=user.entity
        ).first()
        return (None if order else "Wholesaler order for provided ID does not exist"), order, "wholesaler"
    order = RetailerOrders.objects.select_related("wholesaler", "retailer").filter(
        id=data.get("retailer_order"), wholesaler=user.entity
    ).first()
    return (None if order else "Retailer order for provided ID does not exist"), order, "retailer"


ORDER_LINK = {
    "retailer": "retailer_order", "customer": "customer_order", "food": "food_order",
    "wholesaler": "wholesaler_order", "manufacturer": "distributor_purchase_order",
}


def _order_paid(order, kind):
    if kind == "manufacturer":
        return bool(order.is_paid)
    if kind in ("customer", "food"):
        return str(order.is_paid).lower() == "true"
    if kind == "wholesaler":
        from distributors.services.orders import is_paid

        return is_paid(order)
    from wholesalers.services.retailer_order_payments import heal_paid_flag

    return heal_paid_flag(order)


def dispatch_order(data, user):
    """
    Seller assigns the planned delivery of a paid order ("retailer_order" or
    "customer_order"): "agent" = a delivery person of the provider (and mode)
    the buyer paid for. Prices don't change. Returns (errors, shipment).
    """
    err, order, kind = _seller_order(data, user)
    if err:
        return [err], None
    if str(order.status).upper() == "CANCELLED":
        return ["This order was cancelled"], None
    if not delivery_requested(order):
        return ["The buyer chose to collect this order; there's nothing to deliver"], None
    if not _order_paid(order, kind):
        return ["Dispatch once the order is paid"], None
    if kind == "food":
        # The kitchen marks food READY (restaurants dining service).
        if str(order.status).upper() != "READY":
            return ["Mark the food ready before dispatching"], None
    elif kind in ("wholesaler", "manufacturer"):
        f = getattr(order, "fulfilment", None)
        if not f or f.stage != "READY":
            return ["Prepare and pack the order, then mark it ready, before dispatching"], None
    else:
        from logistics.utils.fulfilment import is_ready_for_dispatch

        if not is_ready_for_dispatch(order, kind):
            return ["Prepare and pack the order, then mark it ready, before dispatching"], None
    shipment = Shipment.objects.filter(**{ORDER_LINK[kind]: order}).first()
    if not shipment:
        return ["The buyer hasn't chosen a delivery option for this order"], None
    if shipment.status != ShipmentStatus.QUOTED:
        return ["This order is already out for delivery; reassign its legs instead"], None

    # The seller allocates the in-town leg (to the buyer, or to the courier's dispatch office).
    leg = shipment.legs.exclude(kind=ShipmentLeg.Kind.TRANSIT).order_by("sequence").first()
    err = _set_dispatch_office(leg, data.get("dispatch_office"))
    if err:
        return [err], None
    agent, err = _allocate(leg, data.get("agent") or leg.agent_id, data.get("vehicle"))
    if err:
        return [err], None

    now = timezone.now()
    with transaction.atomic():
        leg.agent = agent
        leg.status = LegStatus.ASSIGNED
        leg.assigned_at = now
        leg.save()
        shipment.status = ShipmentStatus.CONFIRMED
        shipment.confirmed_at = now
        shipment.tracking_number = shipment.tracking_number or f"WZ{secrets.token_hex(4).upper()}"
        shipment.delivery_code = shipment.delivery_code or f"{secrets.randbelow(10**6):06d}"
        shipment.save()
        if kind == "retailer":
            if str(order.status).upper() in ("SUBMITTED", "PROCESSING", "PACKED", "READY"):
                order.status = "DISPATCHED"
            order.dispatched_at = order.dispatched_at or now
            order.dispatched_by = user
        elif kind in ("wholesaler", "manufacturer"):
            order.status = "DISPATCHED"
            order.dispatched_at = order.dispatched_at or now
        else:
            order.status = "DISPATCHED"
        order.save()
    _broadcast(shipment)
    return [], shipment


def _broadcast(shipment):
    if shipment.retailer_order_id:
        from wholesalers.services.retailer_order_payments import broadcast_order

        broadcast_order(shipment.retailer_order)


# ---------------------------------------------------------------- legs

def _may_manage_leg(leg, user):
    """Seller staff, or staff of the leg's provider (delivery company / courier)."""
    entity_id = getattr(user, "entity_id", None)
    return entity_id is not None and entity_id in (leg.shipment.entity_id, leg.provider_id)


def assign_leg(data, user):
    """
    Reassign a person leg that hasn't started to another delivery person of the
    same provider and mode: the buyer paid that price, so it doesn't change.
    """
    leg = ShipmentLeg.objects.select_related("shipment", "provider").filter(id=data.get("leg")).first()
    if not leg or not _may_manage_leg(leg, user):
        return ["Delivery leg for provided ID does not exist"], None
    if leg.shipment.status not in (ShipmentStatus.CONFIRMED, ShipmentStatus.IN_TRANSIT):
        return ["Dispatch the order first"], None
    if leg.status not in (LegStatus.PENDING, LegStatus.ASSIGNED):
        return ["This leg is already under way"], None
    if leg.kind == ShipmentLeg.Kind.TRANSIT:
        return ["The courier carries this leg; record its waybill instead"], None
    if getattr(user, "entity_id", None) == leg.shipment.entity_id:
        agent, err = _allocate(leg, data.get("agent"), data.get("vehicle"))
    else:
        agent, err = _agent_of(leg.provider, data.get("agent"), leg.mode, leg.shipment.chargeable_weight_kg)
    if err:
        return [err], None
    leg.agent = agent
    leg.status = LegStatus.ASSIGNED
    leg.assigned_at = timezone.now()
    leg.save()
    return [], leg


def _set_payee(leg):
    """
    A leg earned its pay (payments/utils/order_payouts.py):
      intracity person (walking / rider / driver, own staff or a platform company's)
        -> their USER payout account, once delivered to the buyer or to the
           courier's dispatch office;
      long-haul courier -> its ENTITY payout account, once the goods are received
        at its dispatch office.
    Snapshots the account on the leg and records the payout (once per leg).
    """
    from payments.models import PayoutAccounts, UserPayoutAccounts
    from payments.utils.order_payouts import record_leg_payout

    if leg.kind == ShipmentLeg.Kind.TRANSIT:
        leg.payout_entity_account = PayoutAccounts.objects.filter(entity_id=leg.provider_id, is_active="true").first()
        leg.payout_user_account = None
    else:
        leg.payout_user_account = (
            UserPayoutAccounts.objects.filter(user=leg.agent.user, is_active="true").first() if leg.agent_id else None
        )
        leg.payout_entity_account = None
    leg.payout_amount = leg.cost
    leg.is_payable = leg.cost > 0
    if leg.is_payable and not (leg.payout_user_account or leg.payout_entity_account):
        create_log("warning", f"Delivery leg {leg.id} is payable but its deliverer has no active payout account")
    record_leg_payout(leg)


def _release_goods(shipment, leg):
    """The seller's goods share is due once the goods leave with the delivery person (the first leg starts)."""
    from payments.utils.order_payouts import release_goods

    first = shipment.legs.order_by("sequence").first()
    if first and first.id == leg.id and leg.kind != ShipmentLeg.Kind.TRANSIT:
        release_goods(shipment)


def _mark_delivered(shipment):
    now = timezone.now()
    shipment.status = ShipmentStatus.DELIVERED
    shipment.delivered_at = now
    shipment.save()
    order = shipment.retailer_order
    if order and not order.delivered_at:
        order.delivered_at = now
        order.is_delivered = "true"
        order.save()
        _broadcast(shipment)
    customer_order = shipment.customer_order
    if customer_order and not customer_order.delivered_at:
        customer_order.delivered_at = now
        customer_order.status = "DELIVERED"
        customer_order.save()
    wholesaler_order = shipment.wholesaler_order
    if wholesaler_order and str(wholesaler_order.is_delivered).lower() != "true":
        wholesaler_order.is_delivered = "true"
        wholesaler_order.save(update_fields=["is_delivered", "updated"])
    purchase_order = shipment.distributor_purchase_order
    if purchase_order and not purchase_order.delivered_at:
        purchase_order.delivered_at = now
        purchase_order.save(update_fields=["delivered_at", "updated"])
    food_order = shipment.food_order
    if food_order and not food_order.delivered_at:
        food_order.delivered_at = now
        food_order.completed_at = food_order.completed_at or now
        food_order.status = "DELIVERED"
        food_order.save()


def update_leg(data, user):
    """
    Move a leg on: PICKED_UP, HANDED_OVER (to the courier office, or the courier
    hands it to the destination office), DELIVERED (needs the recipient's
    delivery code on the last leg) or FAILED. Returns (errors, leg).
    """
    status = str(data.get("status") or "").upper()
    leg = ShipmentLeg.objects.select_related("shipment__retailer_order", "agent").filter(id=data.get("leg")).first()
    is_agent = bool(leg and leg.agent and leg.agent.user_id == getattr(user, "id", None))
    if not leg or not (is_agent or _may_manage_leg(leg, user)):
        return ["Delivery leg for provided ID does not exist"], None
    if status not in (LegStatus.PICKED_UP, LegStatus.HANDED_OVER, LegStatus.DELIVERED, LegStatus.FAILED):
        return ["Status must be PICKED_UP, HANDED_OVER, DELIVERED or FAILED"], None
    if leg.status in (LegStatus.DELIVERED, LegStatus.HANDED_OVER, LegStatus.CANCELLED):
        return ["This leg is already finished"], None
    shipment = leg.shipment
    if shipment.status not in (ShipmentStatus.CONFIRMED, ShipmentStatus.IN_TRANSIT):
        return ["This delivery isn't active"], None
    previous = shipment.legs.filter(sequence__lt=leg.sequence).exclude(status__in=FINAL_LEG_STATES)
    if previous.exists():
        return ["Finish the earlier leg first"], None

    is_last = not shipment.legs.filter(sequence__gt=leg.sequence).exists()
    now = timezone.now()
    with transaction.atomic():
        if status == LegStatus.PICKED_UP:
            leg.picked_up_at = now
            shipment.status = ShipmentStatus.IN_TRANSIT
            if leg.kind == ShipmentLeg.Kind.TRANSIT:
                # The courier took the goods in at its dispatch office: its pay is due.
                _set_payee(leg)
            else:
                _release_goods(shipment, leg)
        elif status in FINAL_LEG_STATES:
            if leg.kind == ShipmentLeg.Kind.TRANSIT and data.get("waybill_number"):
                leg.waybill_number = str(data["waybill_number"])[:60]
            if status == LegStatus.DELIVERED and is_last and leg.kind != ShipmentLeg.Kind.TRANSIT:
                if str(data.get("delivery_code") or "").strip() != (shipment.delivery_code or ""):
                    return ["Wrong delivery code. Ask the recipient for the code on their order."], None
            leg.completed_at = now
            leg.picked_up_at = leg.picked_up_at or now
            _set_payee(leg)
            if leg.kind != ShipmentLeg.Kind.TRANSIT:
                _release_goods(shipment, leg)
            if is_last and leg.kind == ShipmentLeg.Kind.TRANSIT:
                # Courier left it at the destination office: the retailer collects.
                shipment.status = ShipmentStatus.AWAITING_PICKUP
            elif is_last:
                leg.status = status
                leg.save()
                _mark_delivered(shipment)
                return [], leg
        else:  # FAILED
            shipment.status = ShipmentStatus.FAILED
        leg.status = status
        leg.save()
        shipment.save()
    return [], leg


def confirm_collected(data, user):
    """
    Buyer collected the parcel (PICKUP from the seller, or from the courier's
    destination office): seller / courier staff enter the recipient's delivery
    code. Returns (errors, shipment).
    """
    shipment = Shipment.objects.select_related("retailer_order").filter(id=data.get("shipment")).first()
    if not shipment:
        return ["Shipment for provided ID does not exist"], None
    entity_id = getattr(user, "entity_id", None)
    courier_ids = set(shipment.legs.filter(kind=ShipmentLeg.Kind.TRANSIT).values_list("provider_id", flat=True))
    if entity_id not in ({shipment.entity_id} | courier_ids):
        return ["Shipment for provided ID does not exist"], None
    if shipment.status != ShipmentStatus.AWAITING_PICKUP:
        return ["This parcel isn't waiting for collection"], None
    if str(data.get("delivery_code") or "").strip() != (shipment.delivery_code or ""):
        return ["Wrong delivery code. Ask the recipient for the code on their order."], None
    with transaction.atomic():
        _mark_delivered(shipment)
    return [], shipment