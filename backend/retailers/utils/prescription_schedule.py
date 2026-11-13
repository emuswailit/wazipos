"""
Dosing schedule and supply of bought prescription medicines
===========================================================

A prescription item's administrations (one row per dose) are built when the
customer first pays for it, starting two hours after payment, at fixed times of
day for its frequency. The whole course is laid out; the doses covered by what
has been paid for are "supplied". The patient confirms each supplied dose.

A partial purchase covers only the first part of the course:

    supplied doses = bought units / prescribed units * total doses

The medicine "runs out" at its last supplied dose. Refill reminders go out 7, 3
and 1 day(s) before that (push from here; the app also puts them in the phone's
calendar and reminds the patient 60 and 30 minutes before each dose).

When a refill is paid for after the supply ran out, the doses that were not
covered are moved forward to start from the new payment.
"""
import logging
import re
from datetime import datetime, time as dt_time, timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from .. import models

logger = logging.getLogger(__name__)

# Time between payment and the first dose (collection / delivery).
START_DELAY = timedelta(hours=2)
# A dose can be confirmed from this long before its time.
CONFIRM_EARLY = timedelta(hours=1)
REFILL_REMINDER_DAYS = (7, 3, 1)
LONG_TERM_DAYS = 28  # same as prescription_flow.LONG_TERM_DAYS
DOSE_REMINDER_MINUTES = (60, 30)
CLOSED_STATUSES = ("CLOSED", "CANCELLED")

# Times of day for the usual frequencies; others are spread evenly from 06:00.
DOSE_TIMES = {
    1: ((8, 0),),
    2: ((8, 0), (20, 0)),
    3: ((6, 0), (14, 0), (22, 0)),
    4: ((6, 0), (12, 0), (18, 0), (22, 0)),
}


def _now():
    """Now, as a naive datetime in the server's time zone (how doses are stored)."""
    now = timezone.now()
    if timezone.is_aware(now):
        now = timezone.localtime(now).replace(tzinfo=None)
    return now.replace(microsecond=0)


def _times_of_day(doses_per_day):
    if doses_per_day in DOSE_TIMES:
        return [dt_time(h, m) for h, m in DOSE_TIMES[doses_per_day]]
    step = (24 * 60) // doses_per_day
    minutes = sorted((6 * 60 + step * i) % (24 * 60) for i in range(doses_per_day))
    return [dt_time(m // 60, m % 60) for m in dict.fromkeys(minutes)]


def _slots(start, doses_per_day, count):
    """The next `count` dose times at or after `start`."""
    times = _times_of_day(doses_per_day)
    out = []
    day = start.date()
    while len(out) < count:
        for t in times:
            moment = datetime.combine(day, t)
            if moment >= start and len(out) < count:
                out.append(moment)
        day += timedelta(days=1)
    return out


def _when(row):
    return datetime.combine(row.administration_date, row.administration_time)


def paid_quantity(item):
    agg = models.CustomerOrderItems.objects.filter(
        prescription_item=item, customer_order__is_paid="true"
    ).aggregate(q=Sum("quantity"))
    return int(agg["q"] or 0)


def dosing_plan(item):
    """{doses_per_day, total_doses} of the item's course, or None when it has no usable dosing."""
    frequency = item.frequency
    try:
        doses_per_day = int(getattr(frequency, "numerical", 0) or 0)
        days = int(item.days or 0)
    except (TypeError, ValueError):
        return None
    if doses_per_day < 1 or doses_per_day > 24 or days < 1:
        return None
    return {"doses_per_day": doses_per_day, "total_doses": doses_per_day * days}


def supplied_doses(item, plan, bought):
    """How many doses of the course `bought` units cover."""
    total = plan["total_doses"]
    if bought <= 0:
        return 0
    required = int(item.required_unit_quantity or 0)
    if required > 0:
        return min(total, (bought * total) // required)
    # No prescribed quantity: go by the units per dose written in `dose` ("2", "2 tabs").
    match = re.match(r"\s*(\d+(?:\.\d+)?)", str(item.dose or ""))
    per_dose = float(match.group(1)) if match else 1.0
    if per_dose <= 0:
        per_dose = 1.0
    return min(total, int(bought / per_dose))


# ---------------------------------------------------------------------------
# Building / extending the schedule when a purchase is paid
# ---------------------------------------------------------------------------

def _create_rows(item, owner, moments):
    models.PrescriptionItemAdministrations.objects.bulk_create(
        [
            models.PrescriptionItemAdministrations(
                prescription_item=item,
                administration_date=m.date(),
                administration_time=m.time(),
                owner=owner,
                entity=item.entity,
            )
            for m in moments
        ],
        ignore_conflicts=True,
    )


def extend_schedule(item, newly_bought, owner, now=None):
    """`newly_bought` more units of `item` were just paid for."""
    plan = dosing_plan(item)
    if not plan:
        return
    start = (now or _now()) + START_DELAY
    bought = paid_quantity(item)
    previously = max(0, bought - int(newly_bought or 0))
    rows = list(models.PrescriptionItemAdministrations.objects.filter(prescription_item=item))
    rows.sort(key=_when)

    if previously == 0:
        # First purchase: lay the whole course out from now.
        taken = [r for r in rows if r.is_administered == "true"]
        stale = [r.pk for r in rows if r.is_administered != "true"]
        if stale:
            models.PrescriptionItemAdministrations.objects.filter(pk__in=stale).delete()
        missing = plan["total_doses"] - len(taken)
        if missing > 0:
            _create_rows(item, owner, _slots(start, plan["doses_per_day"], missing))
        return

    # A refill. If the doses it covers are already overdue (the supply ran
    # out), move every uncovered dose forward to start from now.
    uncovered = [r for r in rows[supplied_doses(item, plan, previously):] if r.is_administered != "true"]
    if uncovered and _when(uncovered[0]) < start:
        models.PrescriptionItemAdministrations.objects.filter(pk__in=[r.pk for r in uncovered]).delete()
        _create_rows(item, owner, _slots(start, plan["doses_per_day"], len(uncovered)))


def record_supply_for_order(order_id):
    """Called once a prescription purchase is paid (CustomerOrders post_save)."""
    with transaction.atomic():
        claimed = models.CustomerOrders.objects.filter(
            pk=order_id, is_paid="true", supply_recorded_at__isnull=True
        ).update(supply_recorded_at=timezone.now())
        if not claimed:
            return
        order = models.CustomerOrders.objects.select_related("prescription", "prescription__owner", "entity").get(pk=order_id)
        prescription = order.prescription
        if not prescription:
            return
        # Dispensed / balance quantities, and what the pharmacies still offer.
        from .prescription_flow import settle_purchase

        settle_purchase(order)
        lines = models.CustomerOrderItems.objects.filter(
            customer_order=order, prescription_item__isnull=False
        ).select_related("prescription_item", "prescription_item__frequency")
        scheduled = 0
        for line in lines:
            item = line.prescription_item
            extend_schedule(item, int(line.quantity or 0), prescription.owner)
            if dosing_plan(item):
                scheduled += 1

    if scheduled:
        _push(
            prescription.owner,
            "Your medication schedule is ready",
            f"Payment to {order.entity.title} received. Open your schedule to see when to take each medicine.",
            {"type": "prescription.schedule", "prescription": str(prescription.id)},
        )


def _push(user, title, body, data):
    token = getattr(user, "notification_token", None)
    if not token:
        return
    try:
        from core.utils import send_push_notification

        send_push_notification(token, title, body, data)
    except Exception:
        logger.exception("Medication push to user %s failed", getattr(user, "id", None))


# ---------------------------------------------------------------------------
# Reading the schedule
# ---------------------------------------------------------------------------

def _iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%S") if moment else None


def _item_title(item):
    return getattr(item.product, "title", None) or (str(item.preparation) if item.preparation_id else "") or "Medicine"


def supply_of(item, rows=None, bought=None, now=None):
    """
    Supply of one bought item: (summary dict, supplied rows), or (None, []) when
    it has no schedule. `rows`: its administrations, if already loaded.
    """
    plan = dosing_plan(item)
    if not plan:
        return None, []
    if bought is None:
        bought = paid_quantity(item)
    if bought <= 0:
        return None, []
    if rows is None:
        rows = list(models.PrescriptionItemAdministrations.objects.filter(prescription_item=item))
    rows = sorted(rows, key=_when)
    if not rows:
        return None, []
    now = now or _now()
    supplied = rows[: supplied_doses(item, plan, bought)]
    required = int(item.required_unit_quantity or 0)
    taken = sum(1 for r in supplied if r.is_administered == "true")
    pending = [r for r in supplied if r.is_administered != "true"]
    upcoming = [r for r in pending if _when(r) >= now]
    runs_out = _when(supplied[-1]) if supplied else None
    is_partial = bool(required and bought < required)

    reminders = []
    if is_partial and runs_out:
        for days in REFILL_REMINDER_DAYS:
            day = runs_out.date() - timedelta(days=days)
            reminders.append({"days_before": days, "date": day.isoformat()})

    summary = {
        "prescription_item": str(item.id),
        "prescription": str(item.prescription_id),
        "patient_name": item.prescription.patient_name,
        "title": _item_title(item),
        "dose": item.dose or "",
        "frequency_title": item.frequency.title if item.frequency_id else "",
        "route_title": item.route.title if item.route_id else "",
        "instruction": item.instruction or "",
        "unit_of_issue": item.unit_of_issue or "",
        "days": item.days,
        # A month or longer: the patient should check for a follow-up appointment with the prescriber.
        "is_long_term": bool(item.days and item.days >= LONG_TERM_DAYS),
        "doses_per_day": plan["doses_per_day"],
        "total_doses": plan["total_doses"],
        "supplied_doses": len(supplied),
        "administered_doses": taken,
        "doses_left": len(pending),
        "required_unit_quantity": required,
        "bought_quantity": bought,
        "balance_quantity": max(0, required - bought) if required else 0,
        "allow_partial_purchase": bool(item.allow_partial_purchase),
        # Bought only part of the prescribed quantity: a refill is due before `runs_out_at`.
        "is_partial": is_partial,
        "runs_out_at": _iso(runs_out),
        "next_dose_at": _iso(_when(upcoming[0])) if upcoming else None,
        "refill_reminders": reminders,
    }
    return summary, supplied


def _row(row):
    return {
        "id": str(row.id),
        "prescription_item": str(row.prescription_item_id),
        "scheduled_at": _iso(_when(row)),
        "is_administered": row.is_administered == "true",
        "administered_at": row.administered_at.isoformat() if row.administered_at else None,
        "comment": row.comment or "",
    }


def _own_items(user, prescription_id=None):
    qs = (
        models.PrescriptionItems.objects.filter(Q(prescription__owner=user) | Q(prescription__created_by=user))
        .exclude(prescription__status__in=CLOSED_STATUSES)
        .filter(quote_lines__customer_order__is_paid="true")
        .select_related("prescription", "product", "preparation", "frequency", "route")
        .prefetch_related("administrations")
        .distinct()
    )
    if prescription_id:
        qs = qs.filter(prescription_id=prescription_id)
    return qs


def _parse_day(value, default):
    try:
        return datetime.strptime(str(value).strip()[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return default


def get_medication_schedule(data, user):
    """
    The user's bought medicines and their doses. data: optional `prescription`,
    `from` / `to` (YYYY-MM-DD; default 2 days back to 14 days ahead).
    Times are in the server's time zone (`timezone`), without an offset.
    """
    now = _now()
    first = _parse_day(data.get("from"), now.date() - timedelta(days=2))
    last = _parse_day(data.get("to"), now.date() + timedelta(days=14))
    prescription_id = str(data.get("prescription") or "").strip() or None

    medicines, doses = [], []
    try:
        items = list(_own_items(user, prescription_id))
    except Exception:  # a malformed prescription id
        logger.exception("Medication schedule lookup failed")
        return ["Could not load the medication schedule"], None
    for item in items:
        summary, supplied = supply_of(item, rows=list(item.administrations.all()), now=now)
        if not summary:
            continue
        medicines.append(summary)
        doses.extend(_row(r) for r in supplied if first <= r.administration_date <= last)
    doses.sort(key=lambda d: d["scheduled_at"])
    medicines.sort(key=lambda m: (m["next_dose_at"] is None, m["next_dose_at"] or "", m["title"]))
    return [], {
        "medicines": medicines,
        "doses": doses,
        "now": _iso(now),
        "timezone": getattr(settings, "TIME_ZONE", "") or "",
        "from": first.isoformat(),
        "to": last.isoformat(),
        "dose_reminder_minutes": list(DOSE_REMINDER_MINUTES),
        "refill_reminder_days": list(REFILL_REMINDER_DAYS),
    }


def confirm_administration(data, user):
    """
    The patient confirms (or un-confirms) taking a dose.
    data: administration, is_administered (default true), comment.
    """
    admin_id = str(data.get("administration") or "").strip()
    if not admin_id:
        return ["Dose ID is required"], None
    try:
        row = (
            models.PrescriptionItemAdministrations.objects.filter(id=admin_id)
            .select_related("prescription_item", "prescription_item__prescription", "prescription_item__frequency")
            .first()
        )
    except Exception:
        row = None
    if not row or not row.prescription_item_id:
        return ["No dose for provided ID"], None
    item = row.prescription_item
    prescription = item.prescription
    if prescription.owner_id != user.id and prescription.created_by_id != user.id:
        return ["You can only confirm doses of your own prescriptions"], None

    value = data.get("is_administered", True)
    taken = str(value).strip().lower() in ("true", "1", "yes", "on")
    now = _now()
    _summary, supplied = supply_of(item, now=now)
    if row.pk not in {r.pk for r in supplied}:
        return ["This dose isn't covered by what you've bought yet. Buy the rest of the medicine first."], None
    if taken and _when(row) > now + CONFIRM_EARLY:
        return [f"It's not time for this dose yet. It's due {_when(row).strftime('%d %b at %H:%M')}."], None

    row.is_administered = "true" if taken else "false"
    row.administered_at = timezone.now() if taken else None
    if data.get("comment") is not None:
        row.comment = str(data.get("comment")).strip()[:120] or None
    row.save(update_fields=["is_administered", "administered_at", "comment", "updated"])

    summary, _supplied = supply_of(item, now=now)
    return [], {"dose": _row(row), "medicine": summary}


# ---------------------------------------------------------------------------
# Refill reminders (daily task)
# ---------------------------------------------------------------------------

def send_refill_reminders(today=None):
    """Push "running out in N days" for partly-bought medicines, N in REFILL_REMINDER_DAYS."""
    now = _now()
    today = today or now.date()
    items = (
        models.PrescriptionItems.objects.filter(quote_lines__customer_order__is_paid="true", required_unit_quantity__gt=0)
        .exclude(prescription__status__in=CLOSED_STATUSES)
        .select_related("prescription", "prescription__owner", "product", "preparation", "frequency", "route")
        .prefetch_related("administrations")
        .distinct()
    )
    sent = 0
    for item in items:
        try:
            summary, supplied = supply_of(item, rows=list(item.administrations.all()), now=now)
            if not summary or not summary["is_partial"] or not supplied:
                continue
            days_left = (_when(supplied[-1]).date() - today).days
            if days_left not in REFILL_REMINDER_DAYS:
                continue
            when = "tomorrow" if days_left == 1 else f"in {days_left} days"
            _push(
                item.prescription.owner,
                "Time to refill your medicine",
                f"{summary['title']} runs out {when}. You still have {summary['balance_quantity']} to buy on this prescription.",
                {"type": "prescription.refill", "prescription": str(item.prescription_id), "prescription_item": str(item.id)},
            )
            sent += 1
        except Exception:
            logger.exception("Refill reminder for prescription item %s failed", item.id)
    return sent
