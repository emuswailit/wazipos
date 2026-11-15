# restaurants/services/accommodation.py
#
# Accommodation — hotels only. A hotel is an entity of type "Hotel": it has
# everything a restaurant has (menu, orders, bar, tables, supplies, QR menu,
# POS — see services/dining.py RESTAURANT_TYPES) plus rooms and stays.
# Restaurants never get these actions.
#
# Guests (any signed-in user):
#   GetHotelRooms {entity, checkin_date, checkout_date}   rooms + whether each is free
#   BookRoom {room, checkin_date, checkout_date, guests, guest_name, guest_phone, notes}
#   PayRoomBooking {booking, mobile_money_phone} · RefreshRoomPayment {reference}
#   GetMyRoomBookings · CancelMyRoomBooking {booking}
# Hotel staff (working in the hotel):
#   GetRooms · SaveRoom (+ photo) · GetRoomBookings {scope: open|done}
#   BookRoom (a walk-in / phone booking for a guest)
#   UpdateRoomBooking {booking, status}   CONFIRMED · CHECKED_IN · CHECKED_OUT · CANCELLED · NO_SHOW
#   RecordRoomPayment {booking, payment_method}   cash / card at the desk
#   PayRoomBooking {booking, mobile_money_phone}  M-Pesa prompt to the guest
#
# A room is one bookable room (or one of several identical ones: add each).
# It is free for [check-in, check-out) when no live stay overlaps those nights;
# the check-out day itself is free for the next guest.

import math
import secrets
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from authentication.models import Entities
from restaurants import models as rm
from restaurants.services import dining as d

HOTEL_TYPES = ("Hotel",)
# Stays that hold the room.
LIVE = ("BOOKED", "CONFIRMED", "CHECKED_IN")
STATUS_LABELS = {
    "BOOKED": "Booked", "CONFIRMED": "Confirmed", "CHECKED_IN": "Checked in",
    "CHECKED_OUT": "Checked out", "CANCELLED": "Cancelled", "NO_SHOW": "No show",
}
# What staff may move a stay to, from where.
NEXT = {
    "BOOKED": {"CONFIRMED", "CHECKED_IN", "CANCELLED", "NO_SHOW"},
    "CONFIRMED": {"CHECKED_IN", "CANCELLED", "NO_SHOW"},
    "CHECKED_IN": {"CHECKED_OUT"},
}
MAX_NIGHTS = 90
AMENITIES = ("free_wifi", "free_breakfast", "free_parking", "free_cancellation")


def is_hotel(entity):
    return bool(entity) and entity.entity_type in HOTEL_TYPES


def is_hotel_staff(user):
    return bool(getattr(user, "entity_id", None)) and is_hotel(user.entity)


def hotel(entity_id):
    return Entities.objects.filter(id=entity_id, entity_type__in=HOTEL_TYPES).first() if entity_id else None


def _yes(v):
    return str(v).lower() in ("true", "1", "yes")


def _dates(data):
    """(errors, checkin, checkout, nights) from checkin_date / checkout_date."""
    checkin = parse_date(str(data.get("checkin_date") or "")[:10])
    checkout = parse_date(str(data.get("checkout_date") or "")[:10])
    if not checkin or not checkout:
        return ["Pick your check-in and check-out dates"], None, None, 0
    today = timezone.localdate()
    if checkin < today:
        return ["Check-in can't be in the past"], None, None, 0
    nights = (checkout - checkin).days
    if nights < 1:
        return ["Check-out must be after check-in"], None, None, 0
    if nights > MAX_NIGHTS:
        return [f"Stays are up to {MAX_NIGHTS} nights; call the hotel for longer"], None, None, 0
    if checkin > today + timedelta(days=365):
        return ["Book up to a year ahead"], None, None, 0
    return [], checkin, checkout, nights


def _busy_room_ids(entity, checkin, checkout, exclude=None):
    qs = rm.RoomBooking.objects.filter(entity=entity, status__in=LIVE, checkin_date__lt=checkout, checkout_date__gt=checkin)
    if exclude:
        qs = qs.exclude(id=exclude)
    return set(qs.values_list("room_id", flat=True))


def _room_image(room, request):
    img = rm.RoomImages.objects.filter(room=room).order_by("-created").first() if room.pk else None
    if not img or not img.image:
        return None
    f = img.thumbnail or img.image
    try:
        return request.build_absolute_uri(f.url) if request else f.url
    except Exception:
        return None


def room_out(room, request=None, free=None):
    out = {
        "id": str(room.id),
        "title": room.title,
        "room_type": room.room_type,
        "about": room.about or room.description,
        "max_guests": room.max_guests,
        "price": str(room.price),
        "is_available": room.is_available == "true",
        "amenities": [a for a in AMENITIES if getattr(room, a) == "true"],
        "stars": room.stars,
        "image_url": _room_image(room, request),
    }
    if free is not None:
        out["is_free"] = free
    return out


# ================================================================ guests

def hotel_rooms(data, request=None):
    """Rooms on offer, with whether each is free for the dates (when dates are given)."""
    entity = hotel(data.get("entity"))
    if not entity:
        return ["Hotel not found"], None
    rooms = rm.Room.objects.filter(entity=entity, is_available="true", price__gt=0).order_by("price", "title")
    busy, nights, checkin, checkout = None, 0, None, None
    if data.get("checkin_date") or data.get("checkout_date"):
        errors, checkin, checkout, nights = _dates(data)
        if errors:
            return errors, None
        busy = _busy_room_ids(entity, checkin, checkout)
    return [], {
        "hotel": {"id": str(entity.id), "title": entity.title, "town": entity.town, "road": entity.road, "building": entity.building, "phone": getattr(entity, "phone", None)},
        "checkin_date": checkin.isoformat() if checkin else None,
        "checkout_date": checkout.isoformat() if checkout else None,
        "nights": nights,
        "rooms": [room_out(r, request, free=(r.id not in busy) if busy is not None else None) for r in rooms],
    }


def book_room(data, user):
    """A guest books a room, or hotel staff book one for a guest. Returns (errors, booking)."""
    get = lambda k: str(data.get(k) or "").strip()
    room = rm.Room.objects.filter(id=data.get("room")).select_related("entity").first() if data.get("room") else None
    if not room or not is_hotel(room.entity):
        return ["Room not found"], None
    entity = room.entity
    staff = getattr(user, "entity_id", None) == entity.id
    draft = get("draft_id")
    if draft:
        done = rm.RoomBooking.objects.filter(entity=entity, draft_id=draft).first()
        if done:
            return [], done
    if room.is_available != "true" or room.price <= 0:
        return [f"{(room.title or 'This room').title()} isn't on offer right now"], None
    errors, checkin, checkout, nights = _dates(data)
    if errors:
        return errors, None
    try:
        guests = int(data.get("guests") or 1)
    except (TypeError, ValueError):
        guests = 0
    if not 1 <= guests <= max(1, room.max_guests):
        return [f"{(room.title or 'This room').title()} sleeps up to {room.max_guests}"], None
    name = get("guest_name") or (f"{user.first_name or ''} {user.last_name or ''}".strip() if not staff else "")
    phone = get("guest_phone") or ("" if staff else str(user.phone or "").replace("None", ""))
    if len(name) < 2:
        return ["Whose name is the booking under?"], None
    if len("".join(c for c in phone if c.isdigit())) < 9:
        return ["A phone number the hotel can reach the guest on"], None

    with transaction.atomic():
        # Lock the room so two people can't take the same nights.
        room = rm.Room.objects.select_for_update().get(id=room.id)
        if room.id in _busy_room_ids(entity, checkin, checkout):
            return [f"{(room.title or 'That room').title()} is taken for those dates — pick other dates or another room"], None
        booking = rm.RoomBooking.objects.create(
            entity=entity, owner=user, room=room, customer=None if staff else user,
            checkin_date=checkin, checkout_date=checkout, nights=nights, guests=guests,
            guest_name=name[:120], guest_phone=phone[:56],
            nightly_rate=room.price, total=d._q(room.price * nights),
            document_number=f"RB{timezone.now():%y%m%d}{secrets.token_hex(3).upper()}",
            status="CONFIRMED" if staff else "BOOKED",
            order_origin="STAFF" if staff else "CUSTOMER",
            notes=get("notes")[:300] or None,
            draft_id=draft[:120] or None,
        )
    if not staff:
        d._push(entity.owner, "New room booking", f"{booking.document_number} · {room.title} · {checkin:%d %b} → {checkout:%d %b} · KES {booking.total}", {"type": "ROOM_BOOKING", "booking": str(booking.id)})
    return [], booking


def my_bookings(user):
    return rm.RoomBooking.objects.filter(customer=user).select_related("entity", "room").order_by("-created")[:100]


def cancel_my_booking(data, user):
    booking = rm.RoomBooking.objects.filter(id=data.get("booking"), customer=user).select_related("room").first()
    if not booking:
        return ["Booking not found"], None
    if booking.status not in ("BOOKED", "CONFIRMED"):
        return ["This stay can't be cancelled here any more; call the hotel"], None
    if paid_amount(booking) > 0 and not (booking.room_id and booking.room.free_cancellation == "true"):
        return ["This booking is paid and the room has no free cancellation; call the hotel"], None
    booking.status, booking.cancelled_at = "CANCELLED", timezone.now()
    booking.save(update_fields=["status", "cancelled_at", "updated"])
    return [], booking


# ================================================================ payments (system till)

def paid_amount(booking):
    return sum((p.amount for p in rm.RoomBookingPayment.objects.filter(booking=booking, status="SUCCESS")), Decimal("0"))


def amount_due(booking):
    return max(Decimal("0"), Decimal(booking.total or 0) - paid_amount(booking))


def _mark_paid(booking):
    if booking.is_paid != "true" and amount_due(booking) <= 0:
        booking.is_paid, booking.paid_at = "true", timezone.now()
        booking.save(update_fields=["is_paid", "paid_at", "updated"])


def _can_touch(booking, user):
    return user.id in (booking.customer_id, booking.owner_id) or getattr(user, "entity_id", None) == booking.entity_id


def pay_mobile_money(data, user):
    """M-Pesa prompt for what's due on a stay (the guest, or staff at the desk). Returns (errors, payment)."""
    from authentication.utils.utils import generate_reference_number, use_reference_number
    from payments.models import PaymentMethods
    from payments.utils.system_till import push_to_system_till

    booking = rm.RoomBooking.objects.filter(id=data.get("booking")).select_related("entity").first() if data.get("booking") else None
    if not booking or not _can_touch(booking, user):
        return ["Booking not found"], None
    if booking.status in ("CANCELLED", "NO_SHOW"):
        return ["This booking was cancelled"], None
    due = amount_due(booking)
    if due <= 0:
        _mark_paid(booking)
        return ["This stay is already paid"], None
    phone = str(data.get("mobile_money_phone") or "").strip()
    if not phone:
        return ["Enter the M-Pesa phone number to charge"], None
    method = PaymentMethods.objects.filter(title="MOBILE MONEY").first()
    if not method:
        return ["Mobile money isn't set up"], None
    reference = generate_reference_number(booking.entity, user)
    errors, result, telco = push_to_system_till(reference, math.ceil(due), phone, description=f"Stay {booking.entity.title}"[:60])
    if errors:
        return errors, None
    payment = rm.RoomBookingPayment.objects.create(
        entity=booking.entity, owner=user, booking=booking, payment_method=method,
        reference_number=reference, psp_reference_number=str(result.get("ref") or "")[:50],
        status="PENDING", description="Waiting for PIN entry.", amount=math.ceil(due), currency="KES", telco_name=(telco or "")[:28],
    )
    use_reference_number(reference)
    return [], payment


def refresh_payment(data, user):
    """Poll the system till for a pending payment. Returns (errors, payment)."""
    from payments.utils.system_till import PENDING_TIMEOUT_MINUTES, fetch_transaction

    payment = rm.RoomBookingPayment.objects.filter(reference_number=data.get("reference")).select_related("booking").first() if data.get("reference") else None
    if not payment or not _can_touch(payment.booking, user):
        return ["Payment not found"], None
    if payment.status == "PENDING":
        if payment.created < timezone.now() - timedelta(minutes=PENDING_TIMEOUT_MINUTES):
            payment.status, payment.description = "FAILED", "Payment expired (no PIN entered)."
            payment.save()
        else:
            tx = fetch_transaction(payment.reference_number)
            status = (tx or {}).get("status")
            if status and status != "PENDING":
                with transaction.atomic():
                    payment = rm.RoomBookingPayment.objects.select_for_update().select_related("booking").get(id=payment.id)
                    if payment.status == "PENDING":
                        payment.status = "SUCCESS" if status == "SUCCESS" else "FAILED"
                        payment.description = str(tx.get("description") or payment.description)[:256]
                        payment.provider_reference_num = str(tx.get("providerRef") or "")[:50]
                        payment.save()
                        if payment.status == "SUCCESS":
                            _mark_paid(payment.booking)
    return [], payment


def record_payment(data, user):
    """Hotel staff take cash / card at the desk for what's due. Returns (errors, booking)."""
    from payments.models import PaymentMethods

    booking = rm.RoomBooking.objects.filter(id=data.get("booking"), entity=user.entity).first() if data.get("booking") else None
    if not booking:
        return ["Booking not found"], None
    due = amount_due(booking)
    if due <= 0:
        return ["This stay is already paid"], None
    method = (PaymentMethods.objects.filter(id=data.get("payment_method")).first() if data.get("payment_method") else None) or PaymentMethods.objects.filter(title="CASH").first()
    if not method:
        return ["Pick a payment method"], None
    if str(method.title).upper() in ("CREDIT", "MOBILE MONEY"):
        return ["Record cash, card or bank here — use the M-Pesa prompt for mobile money"], None
    rm.RoomBookingPayment.objects.create(
        entity=booking.entity, owner=user, booking=booking, payment_method=method,
        reference_number=f"CASH{secrets.token_hex(4).upper()}", status="SUCCESS",
        description=f"{method.title} at the hotel"[:256], amount=due, currency="KES", is_settled=True,
    )
    _mark_paid(booking)
    booking.refresh_from_db()
    return [], booking


# ================================================================ hotel staff

def list_rooms(user):
    return rm.Room.objects.filter(entity=user.entity).order_by("title")


def save_room(data, files, user):
    get = lambda k: str(data.get(k) or "").strip()
    room = None
    if get("id"):
        room = rm.Room.objects.filter(id=get("id"), entity=user.entity).first()
        if not room:
            return ["Room not found"], None
    title = get("title")
    if not title:
        return ["Name the room, e.g. Room 101"], None
    clash = rm.Room.objects.filter(entity=user.entity, title__iexact=title)
    if room:
        clash = clash.exclude(id=room.id)
    if clash.exists():
        return ["You already have a room with this name"], None
    try:
        price = d._q(get("price") or "0")
    except Exception:
        return ["Enter a valid price per night"], None
    if price <= 0:
        return ["Enter the price per night"], None
    try:
        max_guests = int(get("max_guests") or 2)
    except ValueError:
        max_guests = 0
    if not 1 <= max_guests <= 20:
        return ["How many guests does it sleep? (1–20)"], None
    with transaction.atomic():
        room = room or rm.Room(entity=user.entity, owner=user)
        room.title = title[:256]
        room.room_type = get("room_type")[:40] or None
        room.about = get("about")[:300] or None
        room.description = (get("about") or get("room_type"))[:48] or None
        room.max_guests = max_guests
        room.occupancy = 1 if max_guests == 1 else 2
        room.price = price
        for a in AMENITIES:
            if a in data:
                setattr(room, a, "true" if _yes(data.get(a)) else "false")
        if "is_available" in data:
            room.is_available = "true" if _yes(data.get("is_available")) else "false"
        room.save()
        image = files.get("image") if files else None
        if image:
            img = rm.RoomImages.objects.create(entity=user.entity, owner=user, room=room, image=image)
            room.room_images.add(img)
    return [], room


def hotel_bookings(data, user):
    """open: stays still to happen or in house; done: checked out, cancelled, no-shows."""
    qs = rm.RoomBooking.objects.filter(entity=user.entity, document_number__isnull=False).select_related("room", "entity")
    if str(data.get("scope") or "open") == "done":
        return qs.exclude(status__in=LIVE).order_by("-updated")[:200]
    return qs.filter(status__in=LIVE).order_by("checkin_date", "created")[:500]


def update_booking(data, user):
    booking = rm.RoomBooking.objects.filter(id=data.get("booking"), entity=user.entity).select_related("room").first() if data.get("booking") else None
    if not booking:
        return ["Booking not found"], None
    status = str(data.get("status") or "").upper()
    if status not in NEXT.get(booking.status, set()):
        return [f"A stay that is {STATUS_LABELS.get(booking.status, booking.status).lower()} can't be moved to {STATUS_LABELS.get(status, status).lower()}"], None
    now = timezone.now()
    if status == "CHECKED_IN":
        if booking.checkin_date > timezone.localdate():
            return [f"Check-in is on {booking.checkin_date:%a %d %b}"], None
        booking.checked_in_at = now
    elif status == "CHECKED_OUT":
        if amount_due(booking) > 0:
            return [f"KES {amount_due(booking)} is still due — take payment before checking out"], None
        booking.checked_out_at = now
        # Leaving early frees the remaining nights.
        today = timezone.localdate()
        if booking.checkin_date < today < booking.checkout_date:
            booking.checkout_date = today
    elif status in ("CANCELLED", "NO_SHOW"):
        booking.cancelled_at = now
    booking.status = status
    booking.save()
    msgs = {"CONFIRMED": "is confirmed", "CHECKED_IN": "— you're checked in. Enjoy your stay!", "CHECKED_OUT": "— you're checked out. Thank you!", "CANCELLED": "was cancelled by the hotel"}
    if booking.customer_id and status in msgs:
        d._push(booking.customer, booking.entity.title, f"Your booking {booking.document_number} {msgs[status]}", {"type": "ROOM_BOOKING", "booking": str(booking.id)})
    return [], booking


def booking_out(booking, request=None):
    last = rm.RoomBookingPayment.objects.filter(booking=booking).order_by("-created").first()
    room = booking.room if booking.room_id else None
    return {
        "id": str(booking.id),
        "reference": booking.document_number,
        "hotel": str(booking.entity_id),
        "hotel_title": booking.entity.title if booking.entity_id else None,
        "room": str(room.id) if room else None,
        "room_title": room.title if room else None,
        "room_type": room.room_type if room else None,
        "room_image_url": _room_image(room, request) if room else None,
        "free_cancellation": bool(room and room.free_cancellation == "true"),
        "status": booking.status,
        "status_label": STATUS_LABELS.get(booking.status, booking.status),
        "checkin_date": booking.checkin_date.isoformat() if isinstance(booking.checkin_date, date) else None,
        "checkout_date": booking.checkout_date.isoformat() if isinstance(booking.checkout_date, date) else None,
        "nights": booking.nights,
        "guests": booking.guests,
        "guest_name": booking.guest_name,
        "guest_phone": booking.guest_phone,
        "nightly_rate": str(booking.nightly_rate),
        "total": str(booking.total),
        "paid": str(paid_amount(booking)),
        "amount_due": str(amount_due(booking)),
        "is_paid": booking.is_paid == "true",
        "notes": booking.notes,
        "origin": booking.order_origin,
        "last_payment": {"reference": last.reference_number, "status": last.status, "description": last.description} if last else None,
        "created": booking.created.isoformat() if booking.created else None,
        "checked_in_at": booking.checked_in_at.isoformat() if booking.checked_in_at else None,
        "checked_out_at": booking.checked_out_at.isoformat() if booking.checked_out_at else None,
    }
