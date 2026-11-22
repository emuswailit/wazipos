# logistics/utils/rate_charts.py
#
# Couriers publish rate charts (logistics.CourierRateCard / CourierRateCardLine):
# "cargo from this office (or county, or anywhere) to that office / county /
# anywhere, weighing min..max kg, costs X (+ Y per extra kg on an open band)",
# plus a value percent (insurance). Long-haul legs are priced from the most
# specific matching line (deliveries.courier_leg_price); without one, the
# courier's COURIER DeliveryRate applies.

from datetime import date
from decimal import Decimal

from django.db import transaction

from authentication.models import CollectionPoints, Counties
from logistics.models import CourierRateCard, CourierRateCardLine


def _dec(v, label, errors, required=False, minimum=Decimal("0")):
    if v in (None, ""):
        if required:
            errors.append(f"Enter the {label}")
        return None
    try:
        d = Decimal(str(v))
    except Exception:
        errors.append(f"Enter the {label} as a number")
        return None
    if d < minimum:
        errors.append(f"The {label} can't be below {minimum}")
        return None
    return d


def line_out(l):
    return {
        "id": str(l.id),
        "origin_office": str(l.origin_office_id) if l.origin_office_id else None,
        "origin_office_title": l.origin_office.title if l.origin_office_id else None,
        "origin_county": str(l.origin_county_id) if l.origin_county_id else None,
        "origin_county_title": getattr(l.origin_county, "title", None) if l.origin_county_id else None,
        "destination_office": str(l.destination_office_id) if l.destination_office_id else None,
        "destination_office_title": l.destination_office.title if l.destination_office_id else None,
        "destination_county": str(l.destination_county_id) if l.destination_county_id else None,
        "destination_county_title": getattr(l.destination_county, "title", None) if l.destination_county_id else None,
        "min_kg": str(l.min_kg),
        "max_kg": str(l.max_kg) if l.max_kg is not None else None,
        "price": str(l.price),
        "extra_per_kg": str(l.extra_per_kg),
        "lead_time_days": l.lead_time_days,
    }


def card_out(c):
    return {
        "id": str(c.id),
        "title": c.title,
        "is_active": c.is_active,
        "effective_from": c.effective_from.isoformat() if c.effective_from else None,
        "value_percent": str(c.value_percent),
        "notes": c.notes,
        "lines": [line_out(l) for l in c.lines.select_related("origin_office", "origin_county", "destination_office", "destination_county")],
    }


def list_cards(courier):
    return [card_out(c) for c in CourierRateCard.objects.filter(entity=courier)]


def save_card(courier, user, data):
    """SaveRateCard {card?, title, is_active?, effective_from?, value_percent?, notes?}."""
    errors = []
    card = None
    if data.get("card"):
        card = CourierRateCard.objects.filter(id=data["card"], entity=courier).first()
        if not card:
            return ["Rate card not found"], None
    title = str(data.get("title") or (card.title if card else "")).strip()
    if not title:
        errors.append("Give the rate card a title")
    value_percent = _dec(data.get("value_percent"), "value percent", errors)
    if value_percent is not None and value_percent > 100:
        errors.append("The value percent can't be above 100")
    eff = None
    if data.get("effective_from"):
        try:
            eff = date.fromisoformat(str(data["effective_from"])[:10])
        except Exception:
            errors.append("Pick a valid start date")
    if errors:
        return errors, None
    card = card or CourierRateCard(entity=courier, owner=user)
    card.title = title[:120]
    if value_percent is not None:
        card.value_percent = value_percent
    if "effective_from" in data:
        card.effective_from = eff
    if "is_active" in data:
        card.is_active = str(data.get("is_active")).lower() in ("true", "1", "yes")
    if "notes" in data:
        card.notes = str(data.get("notes") or "")[:300]
    card.save()
    return [], card


def save_line(courier, data):
    """
    SaveRateCardLine {card, line?, origin_office? | origin_county?, destination_office? | destination_county?,
    min_kg, max_kg?, price, extra_per_kg?, lead_time_days?}. Blank origin / destination = anywhere.
    """
    errors = []
    card = CourierRateCard.objects.filter(id=data.get("card") or None, entity=courier).first() if data.get("card") else None
    if not card:
        return ["Rate card not found"], None
    line = None
    if data.get("line"):
        line = CourierRateCardLine.objects.filter(id=data["line"], card=card).first()
        if not line:
            return ["Line not found"], None

    def office(key):
        if not data.get(key):
            return None
        o = CollectionPoints.objects.filter(id=data[key], entity=courier).first()
        if not o:
            errors.append("Pick one of your offices")
        return o

    def county(key):
        if not data.get(key):
            return None
        c = Counties.objects.filter(id=data[key]).first()
        if not c:
            errors.append("Pick a valid county")
        return c

    o_off, o_cty, d_off, d_cty = office("origin_office"), county("origin_county"), office("destination_office"), county("destination_county")
    min_kg = _dec(data.get("min_kg") or 0, "minimum weight", errors)
    max_kg = _dec(data.get("max_kg"), "maximum weight", errors)
    if min_kg is not None and max_kg is not None and max_kg < min_kg:
        errors.append("The maximum weight must be at least the minimum")
    price = _dec(data.get("price"), "price", errors, required=True)
    extra = _dec(data.get("extra_per_kg") or 0, "price per extra kg", errors)
    lead = None
    if data.get("lead_time_days") not in (None, ""):
        try:
            lead = max(0, int(str(data["lead_time_days"])))
        except Exception:
            errors.append("Enter the delivery time in whole days")
    if errors:
        return errors, None
    line = line or CourierRateCardLine(card=card)
    line.origin_office, line.origin_county = o_off, o_cty
    line.destination_office, line.destination_county = d_off, d_cty
    line.min_kg, line.max_kg, line.price, line.extra_per_kg, line.lead_time_days = min_kg, max_kg, price, extra, lead
    line.save()
    return [], line


def delete_line(courier, data):
    n, _ = CourierRateCardLine.objects.filter(id=data.get("line") or None, card__entity=courier).delete()
    return [] if n else ["Line not found"]
