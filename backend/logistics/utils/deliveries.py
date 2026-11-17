# logistics/utils/deliveries.py
#
# Delivery logic for logistics.Shipment / ShipmentLeg (see logistics/models.py).
#
# Only orders whose BUYER chose delivery enter the pipeline, and the buyer
# pays every delivery cost once, with the order:
#
#   retailer_order_delivery_options()  before paying, the buyer sees every way
#        to get the order, priced for THEIR location, each with all its costs:
#          LOCAL   - a delivery person straight to them (when close enough),
#                    one option per provider (the seller's own staff, or each
#                    partner delivery company);
#          COURIER - a delivery person to the courier's office nearest the
#                    seller, then the courier to its office nearest the buyer,
#                    one option per partner courier.
#   choose_retailer_order_delivery()   buyer picks an option (or PICKUP). The
#        server re-prices it, saves it as a QUOTED Shipment whose legs carry
#        each deliverer's price (= their payout), and sets the order's
#        shipping_amount to the total. Pickup: no shipment, no fee.
#   dispatch_order()                   after payment, the seller assigns the
#        delivery person(s) of the planned provider. Prices don't change.
#   assign_leg() / update_leg()        reassign, picked up / handed over /
#        delivered; a finished leg becomes payable to its deliverer.
#   confirm_collected()                buyer collects at the courier's office.
#   -> order.delivered_at; then the retailer can receive the order into stock.
#   Pickup orders: receiving into stock is the collection.
#
# Customer orders (retailer -> customer) use the same pipeline: options at
# checkout (checkout_delivery_options), the chosen one is re-priced and saved
# when the order is created (retailers create_customer_order), then
# dispatch_order / legs / delivery code as above.
#
# Distance: straight line x ROAD_FACTOR (a routing API can replace it later).
# Price: the DeliveryRate of whoever does the leg, by mode; the global
# retailers.ShippingConfiguration is the fallback.

import math
import secrets
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from authentication.models import CollectionPoints, Entities
from logistics.models import (
    DeliveryAgent,
    DeliveryMode,
    DeliveryPartner,
    DeliveryRate,
    LegStatus,
    Shipment,
    ShipmentLeg,
    ShipmentStatus,
)
from utils.logging import create_log

ROAD_FACTOR = Decimal("1.3")
DEFAULT_ITEM_KG = Decimal("0.50")

# What each mode can do: (mode, max kg, max km). None = no limit.
MODE_LIMITS = [
    (DeliveryMode.FOOT, Decimal("5"), Decimal("5")),  # walking delivery persons: up to 5 km
    (DeliveryMode.BICYCLE, Decimal("15"), Decimal("6")),
    (DeliveryMode.MOTORBIKE, Decimal("40"), Decimal("40")),
    (DeliveryMode.CAR, Decimal("300"), None),
    (DeliveryMode.VAN, Decimal("1500"), None),
    (DeliveryMode.TRUCK, None, None),
]
LOCAL_MODES = {m for m, _, _ in MODE_LIMITS}

FINAL_LEG_STATES = {LegStatus.DELIVERED, LegStatus.HANDED_OVER}


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

def _product_kg(product, qty):
    """Chargeable kg: the greater of actual and volumetric (L x W x H / 5000)."""
    qty = Decimal(str(qty or 0))
    actual = (getattr(product, "weight_kg", None) or DEFAULT_ITEM_KG) * qty
    dims = [getattr(product, f, None) for f in ("length_cm", "width_cm", "height_cm")]
    vol = (dims[0] * dims[1] * dims[2] / Decimal("5000")) * qty if all(dims) else Decimal("0")
    return max(actual, vol)


def retailer_order_weight(order):
    from wholesalers.models import RetailerOrderItems

    total = Decimal("0")
    for it in RetailerOrderItems.objects.select_related("wholesaler_receipt__product").filter(retailer_order=order):
        product = getattr(it.wholesaler_receipt, "product", None)
        if product:
            total += _product_kg(product, it.total_quantity or it.purchased_quantity)
    return _q(total)


def wholesale_items_weight(items):
    """Retailer-order lines before the order exists: [{wholesaler_receipt, purchased_quantity}, ...]."""
    from wholesalers.models import WholesalerReceipts

    ids = [str(i.get("wholesaler_receipt") or "") for i in items or [] if i.get("wholesaler_receipt")]
    products = {
        str(r.id): r.product
        for r in WholesalerReceipts.objects.select_related("product").filter(id__in=ids)
        if r.product
    }
    total = Decimal("0")
    for i in items or []:
        product = products.get(str(i.get("wholesaler_receipt") or ""))
        if product:
            total += _product_kg(product, i.get("purchased_quantity") or i.get("quantity") or 1)
    return _q(total)


def checkout_items_weight(items):
    """Customer checkout lines: [{retailer_receipt, purchased_quantity}, ...]."""
    from retailers.models import RetailerReceipts

    ids = [str(i.get("retailer_receipt") or "") for i in items or [] if i.get("retailer_receipt")]
    products = {
        str(r.id): r.product
        for r in RetailerReceipts.objects.select_related("product").filter(id__in=ids)
        if r.product
    }
    total = Decimal("0")
    for i in items or []:
        product = products.get(str(i.get("retailer_receipt") or ""))
        if product:
            total += _product_kg(product, i.get("purchased_quantity") or i.get("quantity") or 1)
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


def price(rate, km, kg):
    cost = _q(rate.base_fee) + _q(rate.rate_per_km) * Decimal(km) + _q(rate.rate_per_kg) * Decimal(kg)
    return _q(max(cost, _q(rate.min_fee)))


# ---------------------------------------------------------------- delivery options

# Beyond this (road km) there's no direct delivery; couriers only.
LOCAL_MAX_KM = Decimal("40")


def delivery_requested(order):
    """The buyer chose delivery (RetailerOrders.delivery_method "COURIER")."""
    return str(getattr(order, "delivery_method", "") or "").upper() in ("COURIER", "DELIVERY")


def _person_providers(seller):
    """The seller + its active partner delivery companies, with their active delivery persons."""
    ids = [seller.id] + list(
        DeliveryPartner.objects.filter(entity=seller, kind=DeliveryPartner.Kind.DELIVERY_COMPANY, is_active=True)
        .values_list("partner_id", flat=True)
    )
    agents = DeliveryAgent.objects.filter(entity_id__in=ids, is_active=True).select_related("entity")
    by_provider = {}
    for agent in agents:
        by_provider.setdefault(agent.entity_id, (agent.entity, []))[1].append(agent)
    return list(by_provider.values())


def _best_person_leg(provider, agents, km, kg, modes=None):
    """Cheapest mode the provider's delivery persons can do for this distance and weight (optionally only `modes`)."""
    best = None
    allowed = set(modes) if modes else LOCAL_MODES
    for mode in {a.mode for a in agents if a.mode in allowed}:
        limit = next(((mk, mm) for m, mk, mm in MODE_LIMITS if m == mode), (None, None))
        if (limit[0] is not None and kg > limit[0]) or (limit[1] is not None and km > limit[1]):
            continue
        if not any(a.mode == mode and (a.max_weight_kg is None or kg <= a.max_weight_kg) for a in agents):
            continue
        rate = rate_for(provider, mode)
        if rate.max_distance_km is not None and km > rate.max_distance_km:
            continue
        cost = price(rate, km, kg)
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


def _leg(kind, mode, provider, km, cost, **extra):
    return dict(kind=kind, mode=mode, provider=provider, distance_km=km, cost=cost, **extra)


def delivery_options(seller, origin, destination, kg):
    """
    Every way `seller` can deliver `kg` from `origin` to `destination`, each
    fully priced; option = {key, method, legs[...], total}, cheapest first.
    """
    providers = _person_providers(seller)
    options = []

    # 1. A delivery person straight to the buyer (adjacent / same town).
    direct_km = km_between(origin, destination)
    if direct_km <= LOCAL_MAX_KM:
        for provider, agents in providers:
            best = _best_person_leg(provider, agents, direct_km, kg)
            if best:
                mode, cost = best
                options.append({
                    "key": f"LOCAL:{provider.id}",
                    "method": Shipment.Method.LOCAL,
                    "legs": [_leg(ShipmentLeg.Kind.LOCAL, mode, provider, direct_km, cost,
                                  origin_point=origin, destination_point=destination)],
                })

    # 2. A delivery person to the courier's office, then the courier to the buyer's nearest office.
    couriers = DeliveryPartner.objects.filter(entity=seller, kind=DeliveryPartner.Kind.COURIER, is_active=True).select_related("partner")
    for cp in couriers:
        courier = cp.partner
        origin_cp, dest_cp = _nearest_point(courier, origin), _nearest_point(courier, destination)
        if not origin_cp or not dest_cp:
            continue
        hand_km = km_between(origin, origin_cp.location)
        hand = None
        for provider, agents in providers:
            best = _best_person_leg(provider, agents, hand_km, kg)
            if best and (hand is None or best[1] < hand[2]):
                hand = (provider, best[0], best[1])
        if not hand:
            continue
        transit_km = km_between(origin_cp.location, dest_cp.location)
        options.append({
            "key": f"COURIER:{courier.id}",
            "method": Shipment.Method.COURIER,
            "legs": [
                _leg(ShipmentLeg.Kind.HANDOVER, hand[1], hand[0], hand_km, hand[2],
                     origin_point=origin, destination_point=origin_cp.location, destination_collection_point=origin_cp),
                _leg(ShipmentLeg.Kind.TRANSIT, DeliveryMode.COURIER, courier, transit_km,
                     price(rate_for(courier, DeliveryMode.COURIER), transit_km, kg),
                     origin_collection_point=origin_cp, origin_point=origin_cp.location,
                     destination_collection_point=dest_cp, destination_point=dest_cp.location),
            ],
        })

    for opt in options:
        opt["total"] = _q(sum((leg["cost"] for leg in opt["legs"]), Decimal("0")))
    options.sort(key=lambda o: o["total"])
    return options


# ---------------------------------------------------------------- shopper checkout tiers
#
# What a shopper is offered depends on how far they are from the shop (road km):
#   under 5 km   walking delivery persons and riders
#   5 - 20 km    riders
#   over 20 km   riders and long-haul couriers (riders only as far as a rider goes)
WALK_MAX_KM = Decimal("7")
COURIER_FROM_KM = Decimal("20")
DELIVERY_GROUPS = {
    "WALK": ("Walking delivery", (DeliveryMode.FOOT,)),
    "RIDER": ("Rider", (DeliveryMode.BICYCLE, DeliveryMode.MOTORBIKE)),
}


def _courier_options(seller, providers, origin, destination, kg):
    """A delivery person to the courier's office, then the courier to the buyer's nearest office."""
    options = []
    couriers = DeliveryPartner.objects.filter(entity=seller, kind=DeliveryPartner.Kind.COURIER, is_active=True).select_related("partner")
    for cp in couriers:
        courier = cp.partner
        origin_cp, dest_cp = _nearest_point(courier, origin), _nearest_point(courier, destination)
        if not origin_cp or not dest_cp:
            continue
        hand_km = km_between(origin, origin_cp.location)
        hand = None
        for provider, agents in providers:
            best = _best_person_leg(provider, agents, hand_km, kg)
            if best and (hand is None or best[1] < hand[2]):
                hand = (provider, best[0], best[1])
        if not hand:
            continue
        transit_km = km_between(origin_cp.location, dest_cp.location)
        options.append({
            "key": f"COURIER:{courier.id}",
            "method": Shipment.Method.COURIER,
            "group": "COURIER",
            "group_label": "Long-haul courier",
            "legs": [
                _leg(ShipmentLeg.Kind.HANDOVER, hand[1], hand[0], hand_km, hand[2],
                     origin_point=origin, destination_point=origin_cp.location, destination_collection_point=origin_cp),
                _leg(ShipmentLeg.Kind.TRANSIT, DeliveryMode.COURIER, courier, transit_km,
                     price(rate_for(courier, DeliveryMode.COURIER), transit_km, kg),
                     origin_collection_point=origin_cp, origin_point=origin_cp.location,
                     destination_collection_point=dest_cp, destination_point=dest_cp.location),
            ],
        })
    return options


def tiered_delivery_options(seller, origin, destination, kg):
    """
    Shopper checkout: the delivery choices for this distance (see the tiers
    above), one option per provider and kind of deliverer, each fully priced,
    cheapest first. option = {key, method, group, group_label, distance_km, legs, total}.
    """
    providers = _person_providers(seller)
    km = km_between(origin, destination)
    groups = ["WALK", "RIDER"] if km < WALK_MAX_KM else ["RIDER"]
    options = []
    for provider, agents in providers:
        for group in groups:
            label, modes = DELIVERY_GROUPS[group]
            best = _best_person_leg(provider, agents, km, kg, modes=modes)
            if best:
                mode, cost = best
                options.append({
                    "key": f"LOCAL:{provider.id}:{group}",
                    "method": Shipment.Method.LOCAL,
                    "group": group,
                    "group_label": label,
                    "legs": [_leg(ShipmentLeg.Kind.LOCAL, mode, provider, km, cost,
                                  origin_point=origin, destination_point=destination)],
                })
    if km > COURIER_FROM_KM:
        options += _courier_options(seller, providers, origin, destination, kg)
    for opt in options:
        opt["total"] = _q(sum((leg["cost"] for leg in opt["legs"]), Decimal("0")))
        opt["distance_km"] = km
    options.sort(key=lambda o: o["total"])
    return options


def retailer_order_delivery_options(order):
    """Options for a retailer order (wholesaler -> retailer). Returns (errors, options, kg)."""
    seller, buyer = order.wholesaler, order.retailer
    errors = delivery_location_errors(seller, buyer)
    if errors:
        return errors, [], Decimal("0")
    origin, destination = entity_point(seller), entity_point(buyer)
    kg = retailer_order_weight(order)
    return [], delivery_options(seller, origin, destination, kg), kg


def staff_retailer_order_delivery_options(seller, retailer, items):
    """Wholesaler staff building an order for `retailer`: (errors, options, kg)."""
    errors = delivery_location_errors(seller)
    if not errors and retailer is not None and not entity_point(retailer):
        errors = [f"{retailer.title} has not set its business location, so it can't receive deliveries. Choose pickup instead."]
    if errors:
        return errors, [], Decimal("0")
    kg = wholesale_items_weight(items)
    return [], delivery_options(seller, entity_point(seller), entity_point(retailer), kg), kg


def plan_staff_retailer_order_delivery(seller, retailer, items, option_key):
    """Re-price the option staff picked: (errors, chosen, kg)."""
    errors, options, kg = staff_retailer_order_delivery_options(seller, retailer, items)
    if errors:
        return errors, None, kg
    chosen = next((o for o in options if o["key"] == str(option_key or "").strip()), None)
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
    agent, err = _agent_of(leg.provider, agent_id, leg.mode, shipment.chargeable_weight_kg)
    if err:
        return err
    leg.agent = agent
    leg.save(update_fields=["agent"])
    return None


def checkout_delivery_options(seller, destination, items):
    """Options for a customer checkout (retailer -> customer). Returns (errors, options, kg)."""
    errors = delivery_location_errors(seller)
    if errors:
        return errors, [], Decimal("0")
    origin = entity_point(seller)
    if not destination:
        return ["Share your delivery location to see delivery options"], [], Decimal("0")
    kg = checkout_items_weight(items)
    return [], tiered_delivery_options(seller, origin, destination, kg), kg


def _create_quoted_shipment(*, seller, user, chosen, kg, origin, destination, recipient_name, recipient_phone, **order_link):
    shipment = Shipment.objects.create(
        entity=seller, owner=user, method=chosen["method"], status=ShipmentStatus.QUOTED,
        origin_point=origin, destination_point=destination,
        destination_collection_point=chosen["legs"][-1].get("destination_collection_point")
        if chosen["method"] == Shipment.Method.COURIER else None,
        recipient_name=recipient_name, recipient_phone=recipient_phone,
        chargeable_weight_kg=kg,
        distance_km=_q(sum((leg["distance_km"] for leg in chosen["legs"]), Decimal("0"))),
        total_cost=chosen["total"],
        **order_link,
    )
    for i, leg in enumerate(chosen["legs"], start=1):
        ShipmentLeg.objects.create(shipment=shipment, sequence=i, entity=seller, owner=user,
                                   status=LegStatus.PENDING, **leg)
    return shipment


def plan_customer_checkout_delivery(seller, destination, items, option_key):
    """
    At customer checkout: re-price the chosen option server-side.
    Returns (errors, chosen, kg); chosen["total"] is the order's shipping cost.
    """
    errors, options, kg = checkout_delivery_options(seller, destination, items)
    if errors:
        return errors, None, kg
    chosen = next((o for o in options if o["key"] == str(option_key or "").strip()), None)
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

        errors, options, kg = retailer_order_delivery_options(order)
        if errors:
            return errors, None
        chosen = next((o for o in options if o["key"] == key), None)
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
    order = RetailerOrders.objects.select_related("wholesaler", "retailer").filter(
        id=data.get("retailer_order"), wholesaler=user.entity
    ).first()
    return (None if order else "Retailer order for provided ID does not exist"), order, "retailer"


def _order_paid(order, kind):
    if kind in ("customer", "food"):
        return str(order.is_paid).lower() == "true"
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
    else:
        from logistics.utils.fulfilment import is_ready_for_dispatch

        if not is_ready_for_dispatch(order, kind):
            return ["Prepare and pack the order, then mark it ready, before dispatching"], None
    link = {"customer_order": order} if kind == "customer" else {"food_order": order} if kind == "food" else {"retailer_order": order}
    shipment = Shipment.objects.filter(**link).first()
    if not shipment:
        return ["The buyer hasn't chosen a delivery option for this order"], None
    if shipment.status != ShipmentStatus.QUOTED:
        return ["This order is already out for delivery; reassign its legs instead"], None

    leg = shipment.legs.exclude(kind=ShipmentLeg.Kind.TRANSIT).order_by("sequence").first()
    agent, err = _agent_of(leg.provider, data.get("agent") or leg.agent_id, leg.mode, shipment.chargeable_weight_kg)
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
    agent, err = _agent_of(leg.provider, data.get("agent"), leg.mode, leg.shipment.chargeable_weight_kg)
    if err:
        return [err], None
    leg.agent = agent
    leg.status = LegStatus.ASSIGNED
    leg.assigned_at = timezone.now()
    leg.save()
    return [], leg


def _set_payee(leg):
    """A finished leg is owed to whoever did it (snapshot of the account)."""
    from payments.models import PayoutAccounts, UserPayoutAccounts

    seller_id = leg.shipment.entity_id
    own_agent = leg.agent and leg.agent.entity_id == seller_id
    if own_agent:
        leg.payout_user_account = UserPayoutAccounts.objects.filter(user=leg.agent.user, is_active="true").first()
    else:
        leg.payout_entity_account = PayoutAccounts.objects.filter(entity_id=leg.provider_id, is_active="true").first()
    leg.payout_amount = leg.cost
    leg.is_payable = leg.cost > 0
    if leg.is_payable and not (leg.payout_user_account or leg.payout_entity_account):
        create_log("warning", f"Delivery leg {leg.id} is payable but its deliverer has no active payout account")


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
        elif status in FINAL_LEG_STATES:
            if leg.kind == ShipmentLeg.Kind.TRANSIT and data.get("waybill_number"):
                leg.waybill_number = str(data["waybill_number"])[:60]
            if status == LegStatus.DELIVERED and is_last and leg.kind != ShipmentLeg.Kind.TRANSIT:
                if str(data.get("delivery_code") or "").strip() != (shipment.delivery_code or ""):
                    return ["Wrong delivery code. Ask the recipient for the code on their order."], None
            leg.completed_at = now
            _set_payee(leg)
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
