# restaurants/services/recipes.py
#
# Custom recipes: a customer asks a restaurant to prepare their own dish.
#
#   customer  RequestCustomRecipe  ingredients (from the restaurant's list or
#             typed), instructions, servings, dine in / pickup / delivery
#   kitchen   QuoteCustomRecipe    price + time to prepare (or DeclineCustomRecipe)
#   customer  AcceptRecipeQuote    (delivery: picks a priced option) -> becomes a
#             BranchFoodOrder on the restaurant's board, paid like any order
#
# Restaurants keep their ingredient list (SaveIngredient); its prices are an
# indicative estimate for the customer — the quote is what counts.

import secrets
from datetime import timedelta
from decimal import Decimal

from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from authentication.models import Entities
from restaurants import models as rm
from restaurants.services import dining as d

PORTION_KG = Decimal("0.5")


def _q(v):
    return Decimal(v).quantize(Decimal("0.01"))


# ================================================================ ingredients

def ingredient_out(i):
    return {"id": str(i.id), "name": i.name, "category": i.category, "unit_label": i.unit_label, "price": str(i.price), "is_available": i.is_available}


def list_ingredients(entity_id, staff=False):
    qs = rm.RestaurantIngredient.objects.filter(entity_id=entity_id)
    if not staff:
        qs = qs.filter(is_available=True)
    return [ingredient_out(i) for i in qs]


def save_ingredient(data, user):
    get = lambda k: str(data.get(k) or "").strip()
    item = None
    if get("id"):
        item = rm.RestaurantIngredient.objects.filter(id=get("id"), entity=user.entity).first()
        if not item:
            return ["Ingredient not found"], None
    if not get("name"):
        return ["Name the ingredient"], None
    try:
        price = _q(get("price") or "0")
    except Exception:
        return ["Enter a valid price"], None
    if price < 0:
        return ["Enter a valid price"], None
    clash = rm.RestaurantIngredient.objects.filter(entity=user.entity, name__iexact=get("name"))
    if item:
        clash = clash.exclude(id=item.id)
    if clash.exists():
        return ["This ingredient is already on your list"], None
    item = item or rm.RestaurantIngredient(entity=user.entity, owner=user)
    item.name = get("name")[:120]
    item.category = get("category")[:64] or None
    item.unit_label = get("unit_label")[:32] or "portion"
    item.price = price
    if "is_available" in data:
        item.is_available = str(data.get("is_available")).lower() in ("true", "1", "yes")
    item.save()
    return [], item


# The demo restaurant in authentication/fixtures/restaurantsFixture.json; its
# ingredient list is the starter catalogue restaurants can copy.
STARTER_RESTAURANT_ID = "e9ee73b5-7247-5023-b85d-e0d44aa77057"


def import_starter_ingredients(user):
    """Copy the starter catalogue into the caller's restaurant (skips names it has). Returns (errors, added)."""
    if str(user.entity_id) == STARTER_RESTAURANT_ID:
        return ["This is the starter catalogue itself"], 0
    starter = rm.RestaurantIngredient.objects.filter(entity_id=STARTER_RESTAURANT_ID)
    if not starter.exists():
        return ["The starter catalogue isn't loaded on this server (loaddata restaurantsFixture)"], 0
    have = {n.lower() for n in rm.RestaurantIngredient.objects.filter(entity=user.entity).values_list("name", flat=True)}
    added = 0
    with transaction.atomic():
        for i in starter:
            if i.name.lower() in have:
                continue
            rm.RestaurantIngredient.objects.create(
                entity=user.entity, owner=user, name=i.name, category=i.category,
                unit_label=i.unit_label, price=i.price, is_available=True,
            )
            added += 1
    return [], added


# ================================================================ requests

def recipe_out(r, for_customer=True):
    return {
        "id": str(r.id),
        "restaurant": str(r.entity_id),
        "restaurant_title": r.entity.title if r.entity_id else None,
        "customer_name": r.customer_name,
        "customer_phone": r.customer_phone,
        "title": r.title,
        "instructions": r.instructions,
        "servings": r.servings,
        "service_type": r.service_type,
        "party_size": r.party_size,
        "reservation_at": r.reservation_at.isoformat() if r.reservation_at else None,
        "has_destination": bool(r.destination_point),
        "ingredients": [
            {"name": i.name, "quantity": i.quantity, "portions": i.portions, "unit_price": str(i.unit_price), "from_list": bool(i.ingredient_id)}
            for i in r.ingredients.all()
        ],
        "estimate": str(r.estimate),
        "status": r.status,
        "quoted_price": str(r.quoted_price) if r.quoted_price is not None else None,
        "ready_in_minutes": r.ready_in_minutes,
        "restaurant_note": r.restaurant_note,
        "food_order": str(r.food_order_id) if r.food_order_id else None,
        "created": r.created.isoformat() if r.created else None,
    }


def request_recipe(data, user):
    """Customer asks for a custom dish. Returns (errors, recipe)."""
    get = lambda k: str(data.get(k) or "").strip()
    entity = Entities.objects.filter(id=data.get("entity"), entity_type__in=d.RESTAURANT_TYPES).first()
    if not entity:
        return ["Restaurant not found"], None
    errors = []
    title = get("title")
    instructions = get("instructions")
    if not title:
        errors.append("Give your dish a name")
    if not instructions:
        errors.append("Tell the kitchen briefly how to prepare it")
    elif len(instructions) > 1000:
        errors.append("Keep the instructions under 1000 characters")
    try:
        servings = int(data.get("servings") or 0)
    except (TypeError, ValueError):
        servings = 0
    if not 1 <= servings <= 100:
        errors.append("How many servings? (1–100)")
    service = get("service_type").upper()
    if service not in d.SERVICE_LABELS:
        errors.append("Choose dine in, pickup or delivery")

    raw = data.get("ingredients") or []
    if not raw:
        errors.append("Pick at least one ingredient")
    listed = {str(i.id): i for i in rm.RestaurantIngredient.objects.filter(entity=entity, id__in=[str(x.get("ingredient") or "") for x in raw])}
    lines = []
    for x in raw:
        ing = listed.get(str(x.get("ingredient") or ""))
        name = (ing.name if ing else str(x.get("name") or "").strip())[:120]
        if not name:
            continue
        try:
            portions = max(1, min(50, int(x.get("portions") or 1)))
        except (TypeError, ValueError):
            portions = 1
        lines.append((ing, name, str(x.get("quantity") or "").strip()[:40] or None, portions))
    if raw and not lines:
        errors.append("Pick at least one ingredient")

    reservation_at, party_size, dest = None, None, None
    if service == "DINE_IN":
        reservation_at = parse_datetime(get("reservation_at"))
        if reservation_at and timezone.is_naive(reservation_at):
            reservation_at = timezone.make_aware(reservation_at)
        now = timezone.now()
        if not reservation_at or reservation_at < now or reservation_at > now + timedelta(days=30):
            errors.append("Pick when you'll come in (from now up to 30 days ahead)")
        try:
            party_size = int(data.get("party_size") or 0)
        except (TypeError, ValueError):
            party_size = 0
        if not 1 <= party_size <= 50:
            errors.append("How many people? (1–50)")
    if service == "DELIVERY":
        try:
            dest = Point(float(data["destination_longitude"]), float(data["destination_latitude"]), srid=4326)
        except (KeyError, TypeError, ValueError):
            errors.append("Pin where to deliver")
    if errors:
        return errors, None

    # Indicative: listed ingredient prices x portions x servings.
    estimate = sum(((ing.price if ing else Decimal("0")) * portions for ing, _, _, portions in lines), Decimal("0")) * servings
    with transaction.atomic():
        recipe = rm.CustomRecipe.objects.create(
            entity=entity, owner=user, customer=user, title=title[:120], instructions=instructions, servings=servings,
            service_type=service, party_size=party_size, reservation_at=reservation_at, destination_point=dest,
            customer_name=get("customer_name")[:120] or f"{user.first_name} {user.last_name}".strip().title() or None,
            customer_phone=get("customer_phone")[:32] or user.phone, estimate=_q(estimate),
        )
        for ing, name, qty, portions in lines:
            rm.CustomRecipeIngredient.objects.create(
                recipe=recipe, ingredient=ing, name=name, quantity=qty, portions=portions, unit_price=ing.price if ing else Decimal("0"),
            )
    d._push(entity.owner, "New custom recipe request", f"{recipe.title} × {servings} · {d.SERVICE_LABELS[service]}", {"type": "CUSTOM_RECIPE", "recipe": str(recipe.id)})
    return [], recipe


def my_recipes(user):
    return rm.CustomRecipe.objects.filter(customer=user).select_related("entity").prefetch_related("ingredients")[:100]


def cancel_recipe(data, user):
    r = rm.CustomRecipe.objects.filter(id=data.get("recipe"), customer=user).first()
    if not r:
        return ["Request not found"], None
    if r.status not in ("REQUESTED", "QUOTED"):
        return ["This request can no longer be cancelled"], None
    r.status = "CANCELLED"
    r.save()
    return [], r


def recipe_delivery_options(data, user):
    """Delivery options for a quoted recipe (customer, before accepting)."""
    from logistics.utils.deliveries import delivery_location_errors, delivery_options, entity_point

    r = rm.CustomRecipe.objects.filter(id=data.get("recipe"), customer=user).select_related("entity").first()
    if not r or r.service_type != "DELIVERY" or not r.destination_point:
        return ["Request not found"], [], Decimal("0")
    errors = delivery_location_errors(r.entity)
    if errors:
        return errors, [], Decimal("0")
    kg = PORTION_KG * r.servings
    return [], delivery_options(r.entity, entity_point(r.entity), r.destination_point, kg), kg


def accept_quote(data, user):
    """Customer accepts the price: the recipe becomes a food order. Returns (errors, recipe, order)."""
    from logistics.utils.deliveries import _create_quoted_shipment, entity_point

    r = rm.CustomRecipe.objects.filter(id=data.get("recipe"), customer=user).select_related("entity").first()
    if not r:
        return ["Request not found"], None, None
    if r.status != "QUOTED" or r.quoted_price is None:
        return ["The restaurant hasn't priced this yet"], None, None
    if r.service_type == "DINE_IN" and r.reservation_at and r.reservation_at < timezone.now():
        return ["The booking time has passed — send a new request"], None, None

    chosen, kg = None, Decimal("0")
    if r.service_type == "DELIVERY":
        errors, options, kg = recipe_delivery_options({"recipe": str(r.id)}, user)
        if errors:
            return errors, None, None
        chosen = next((o for o in options if o["key"] == str(data.get("delivery_option") or "")), None)
        if not chosen:
            return ["Choose a delivery option"], None, None

    shipping = chosen["total"] if chosen else Decimal("0")
    price = Decimal(r.quoted_price)
    notes = f"CUSTOM RECIPE: {r.instructions}"[:300]
    with transaction.atomic():
        order = rm.BranchFoodOrder.objects.create(
            entity=r.entity, owner=user, customer=user,
            customer_name=r.customer_name, customer_phone=r.customer_phone,
            document_number=f"FC{timezone.now():%y%m%d}{secrets.token_hex(3).upper()}",
            order_origin="CUSTOMER", service_type=r.service_type,
            delivery_method="DELIVERY" if r.service_type == "DELIVERY" else "PICKUP",
            party_size=r.party_size, reservation_at=r.reservation_at, notes=notes, status="RECEIVED",
            order_items_cost=_q(price), shipping_cost=_q(shipping), order_total=_q(price + shipping),
            origin_point=entity_point(r.entity), destination_point=r.destination_point,
        )
        rm.BranchFoodOrderItem.objects.create(
            entity=r.entity, owner=user, branch_food_order=order, title=f"{r.title} (custom, {r.servings} servings)"[:256],
            quantity=1, unit_price=_q(price), line_total=_q(price),
        )
        if chosen:
            _create_quoted_shipment(
                seller=r.entity, user=user, chosen=chosen, kg=kg, origin=entity_point(r.entity), destination=r.destination_point,
                recipient_name=r.customer_name, recipient_phone=r.customer_phone, food_order=order,
            )
        r.status = "ACCEPTED"
        r.food_order = order
        r.save()
    d._notify_restaurant(order)
    return [], r, order


# ================================================================ kitchen

def restaurant_recipes(data, user):
    qs = rm.CustomRecipe.objects.filter(entity=user.entity).prefetch_related("ingredients")
    if data.get("scope") == "done":
        return qs.exclude(status__in=("REQUESTED", "QUOTED"))[:200]
    return qs.filter(status__in=("REQUESTED", "QUOTED"))[:300]


def quote_recipe(data, user):
    r = rm.CustomRecipe.objects.filter(id=data.get("recipe"), entity=user.entity).first()
    if not r:
        return ["Request not found"], None
    if r.status not in ("REQUESTED", "QUOTED"):
        return ["This request is closed"], None
    try:
        price = _q(str(data.get("price") or "0"))
    except Exception:
        return ["Enter the price"], None
    if price <= 0:
        return ["Enter the price"], None
    minutes = str(data.get("ready_in_minutes") or "").strip()
    r.quoted_price = price
    r.ready_in_minutes = int(minutes) if minutes.isdigit() else None
    r.restaurant_note = str(data.get("note") or "").strip()[:300] or None
    r.status = "QUOTED"
    r.quoted_at = timezone.now()
    r.save()
    d._push(r.customer, r.entity.title, f"Your custom {r.title} is priced at KES {price}. Open the app to accept.", {"type": "CUSTOM_RECIPE", "recipe": str(r.id)})
    return [], r


def decline_recipe(data, user):
    r = rm.CustomRecipe.objects.filter(id=data.get("recipe"), entity=user.entity).first()
    if not r:
        return ["Request not found"], None
    if r.status not in ("REQUESTED", "QUOTED"):
        return ["This request is closed"], None
    r.status = "DECLINED"
    r.restaurant_note = str(data.get("note") or "").strip()[:300] or "The kitchen can't prepare this one."
    r.save()
    d._push(r.customer, r.entity.title, f"Sorry — we can't prepare your {r.title}: {r.restaurant_note}", {"type": "CUSTOM_RECIPE", "recipe": str(r.id)})
    return [], r
