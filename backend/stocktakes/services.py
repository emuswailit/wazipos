# stocktakes/services.py
#
# Stock taking as a paid WaziPOS service (see stocktakes/models.py).
#
#   Agent      books it for one of their businesses (one-off or every N days):
#              dates, agreed fee, stocktakers (their onboarders, each with a payout
#              account) and the daily rate; sends the payment prompt; submits the
#              count; corrects days worked.
#   Stocktaker counts blind — they see items, never book figures — only on the
#              booked days, while the stock take is scheduled / counting. One line
#              per item, create-only.
#   Vendor     (the business's super admin) sees counted vs book, pays the fee like
#              a subscription (mobile money), then decides line by line: set stock
#              to the count (a stock adjustment) or keep book stock.
#   Admin      sees every stock take and marks stocktakers' dues (days worked x
#              daily rate) paid to their payout accounts.
#
# Book stock: retailers -> RetailerReceipts lots, wholesalers -> WholesalerReceipts
# lots (summed per product); restaurants / hotels -> supplies (RestaurantStock) and
# bar drinks (BarInventory). Approved variances move stock by (counted - book at
# count time), so sales made since the count are kept.

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from authentication import models as am
from authentication.utils import agents as ag
from stocktakes import models as sm
from utils.logging import create_log

CENTS = Decimal("0.01")
OPEN = ("SCHEDULED", "COUNTING")
MAX_DAYS = 31


def _q3(v):
    return Decimal(v).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _money(v):
    return Decimal(v).quantize(CENTS, rounding=ROUND_HALF_UP)


def _dec(value, label, errors, minimum=Decimal("0")):
    try:
        v = Decimal(str(value))
    except Exception:
        errors.append(f"Enter the {label}")
        return None
    if v < minimum:
        errors.append(f"The {label} must be at least {minimum}")
        return None
    return v


def _day(value, label, errors):
    try:
        return date.fromisoformat(str(value)[:10])
    except Exception:
        errors.append(f"Pick the {label}")
        return None


def kind_of(entity):
    return ag.receipt_kind(entity.entity_type)  # RETAILER / WHOLESALER / RESTAURANT / None


# ---------------------------------------------------------------- book stock

def book_items(entity, q=None):
    """
    Every stock item of the business with its book quantity and unit cost:
    [{kind, item, title, unit, book_quantity, unit_cost}]. item = product /
    supply / drink id.
    """
    k = kind_of(entity)
    q = (q or "").strip()
    out = []
    if k in ("RETAILER", "WHOLESALER"):
        if k == "RETAILER":
            from retailers.models import RetailerReceipts as Lot
        else:
            from wholesalers.models import WholesalerReceipts as Lot
        lots = Lot.objects.filter(entity=entity)
        if q:
            lots = lots.filter(product__title__icontains=q)
        rows = (
            lots.values("product_id", "product__title")
            .annotate(qty=Sum("current_unit_quantity"))
            .order_by("product__title")
        )
        costs = {}
        for pid, cost in lots.filter(current_unit_quantity__gt=0).values_list("product_id", "unit_buying_price"):
            costs.setdefault(pid, cost)
        for r in rows:
            out.append({
                "kind": "PRODUCT", "item": str(r["product_id"]), "title": r["product__title"] or "",
                "unit": "units", "book_quantity": _q3(r["qty"] or 0), "unit_cost": _money(costs.get(r["product_id"]) or 0),
            })
    elif k == "RESTAURANT":
        from restaurants import models as rm

        supplies = rm.RestaurantStock.objects.filter(entity=entity)
        drinks = rm.BarInventory.objects.filter(entity=entity)
        if q:
            supplies = supplies.filter(title__icontains=q)
            drinks = drinks.filter(title__icontains=q)
        for s in supplies.order_by("title"):
            out.append({"kind": "SUPPLY", "item": str(s.id), "title": s.title, "unit": s.unit or "unit",
                        "book_quantity": _q3(s.quantity or 0), "unit_cost": _money(s.unit_cost or 0)})
        for d in drinks.order_by("title"):
            out.append({"kind": "DRINK", "item": str(d.id), "title": d.title, "unit": "bottles",
                        "book_quantity": _q3(d.stock_bottles or 0), "unit_cost": _money(d.bottle_cost or 0)})
    return out


def _book_item(entity, kind, item_id):
    for row in book_items(entity):
        if row["kind"] == kind and row["item"] == str(item_id):
            return row
    return None


# ---------------------------------------------------------------- output

def assignment_out(a):
    u = a.onboarder.user
    return {
        "id": str(a.id),
        "onboarder": str(a.onboarder_id),
        "name": " ".join(x for x in (u.first_name, u.last_name) if x),
        "phone": u.phone,
        "days_worked": a.days_worked,
        "daily_rate": str(a.daily_rate),
        "amount_due": str(_money(a.amount_due)),
        "payout_status": a.payout_status,
        "paid_at": a.paid_at.isoformat() if a.paid_at else None,
        "payout_reference": a.payout_reference,
        "payout_account": _payout_destination(u),
    }


def _payout_destination(user):
    from payments.models import UserPayoutAccounts

    acc = UserPayoutAccounts.objects.filter(user=user, is_active="true").first()
    if not acc:
        return None
    return {"type": acc.account_type, "name": acc.account_name, "number": acc.account_number, "verified": acc.is_verified}


def stock_take_out(st, with_counts=False):
    counted = st.counts.count()
    out = {
        "id": str(st.id),
        "entity": str(st.entity_id),
        "entity_title": st.entity.title,
        "entity_type": st.entity.entity_type,
        "agent": str(st.agent_id),
        "agent_name": " ".join(x for x in (st.agent.user.first_name, st.agent.user.last_name) if x) if st.agent.user_id else "",
        "kind": st.kind,
        "every_days": st.every_days,
        "series": str(st.series_id) if st.series_id else None,
        "starts_on": st.starts_on.isoformat(),
        "ends_on": st.ends_on.isoformat(),
        "fee": str(st.fee),
        "persons": st.persons,
        "daily_rate": str(st.daily_rate),
        "status": st.status,
        "is_paid": st.is_paid,
        "paid_at": st.paid_at.isoformat() if st.paid_at else None,
        "notes": st.notes,
        "counted_items": counted,
        "access_open": access_open(st),
        "submitted_at": st.submitted_at.isoformat() if st.submitted_at else None,
        "reviewed_at": st.reviewed_at.isoformat() if st.reviewed_at else None,
        "stocktakers": [assignment_out(a) for a in st.assignments.select_related("onboarder__user")],
        "created": st.created.isoformat() if st.created else None,
    }
    if with_counts:
        out["report"] = report(st)
    return out


def count_out(c, blind=False):
    row = {
        "id": str(c.id),
        "kind": c.kind,
        "item": str(c.product_id or c.supply_id or c.drink_id or ""),
        "title": c.title,
        "unit": c.unit,
        "counted_quantity": str(c.counted_quantity),
        "note": c.note,
        "counted_by": " ".join(x for x in (c.counted_by.first_name, c.counted_by.last_name) if x) if c.counted_by_id else "",
        "created": c.created.isoformat() if c.created else None,
    }
    if not blind:
        variance = c.variance
        row.update({
            "book_quantity": str(c.book_quantity),
            "variance": str(_q3(variance)),
            "unit_cost": str(c.unit_cost),
            "variance_value": str(_money(variance * Decimal(c.unit_cost or 0))),
            "decision": c.decision,
            "decided_at": c.decided_at.isoformat() if c.decided_at else None,
        })
    return row


def report(st):
    """Counted vs book, line by line, with totals; plus book items nobody counted."""
    lines = [count_out(c) for c in st.counts.select_related("counted_by").order_by("title")]
    short = [l for l in lines if Decimal(l["variance"]) < 0]
    over = [l for l in lines if Decimal(l["variance"]) > 0]
    counted_keys = {(l["kind"], l["item"]) for l in lines}
    uncounted = [
        {"kind": b["kind"], "item": b["item"], "title": b["title"], "unit": b["unit"], "book_quantity": str(b["book_quantity"])}
        for b in book_items(st.entity)
        if (b["kind"], b["item"]) not in counted_keys and b["book_quantity"] > 0
    ]
    value = lambda rows: _money(sum((Decimal(r["variance_value"]) for r in rows), Decimal("0")))
    found = [found_out(f) for f in st.found_items.select_related("recorded_by")]
    found_value = _money(sum((Decimal(f["value_seen"] or 0) for f in found), Decimal("0")))
    return {
        "lines": lines,
        "uncounted": uncounted,
        # Goods on site that aren't the business's (e.g. an employee's own stock).
        "found": found,
        "summary": {
            "found": len(found),
            "found_value": str(found_value),
            "counted": len(lines),
            "matched": len(lines) - len(short) - len(over),
            "short": len(short),
            "over": len(over),
            "uncounted": len(uncounted),
            "value_short": str(value(short)),
            "value_over": str(value(over)),
            "net_value": str(value(lines)),
            "pending": sum(1 for l in lines if l["decision"] == "PENDING"),
        },
    }


# ---------------------------------------------------------------- agents

def _clean_booking(agent, data, st=None):
    errors = []
    out = {}
    if st is None:
        entity = ag.own_entity(agent, data.get("entity"))
        if not entity:
            errors.append("Pick one of the businesses you registered")
        elif not kind_of(entity):
            errors.append("Stock takes are for retailers, wholesalers, restaurants and hotels")
        out["entity"] = entity
        kind = str(data.get("kind") or "ONE_OFF").upper()
        if kind not in ("ONE_OFF", "RECURRING"):
            errors.append("Choose one-off or repeating")
        out["kind"] = kind
        if kind == "RECURRING":
            try:
                every = int(data.get("every_days"))
            except (TypeError, ValueError):
                every = 0
            if not 7 <= every <= 366:
                errors.append("Repeat every 7 to 366 days")
            out["every_days"] = every
    start = _day(data.get("starts_on"), "first day", errors) if "starts_on" in data or st is None else st.starts_on
    end = _day(data.get("ends_on"), "last day", errors) if "ends_on" in data or st is None else st.ends_on
    if start and end:
        if end < start:
            errors.append("The last day must be on or after the first day")
        elif (end - start).days + 1 > MAX_DAYS:
            errors.append(f"A stock take can run at most {MAX_DAYS} days")
        if st is None and end < timezone.localdate():
            errors.append("The days are already past")
    out["starts_on"], out["ends_on"] = start, end
    if "fee" in data or st is None:
        out["fee"] = _dec(data.get("fee"), "fee", errors, Decimal("1"))
    if "daily_rate" in data or st is None:
        out["daily_rate"] = _dec(data.get("daily_rate"), "pay per stocktaker per day", errors, Decimal("0"))
    if "persons" in data or st is None:
        try:
            persons = int(data.get("persons"))
        except (TypeError, ValueError):
            persons = 0
        if not 1 <= persons <= 100:
            errors.append("Number of stocktakers must be 1 to 100")
        out["persons"] = persons
    if "stocktakers" in data or st is None:
        ids = [i for i in (data.get("stocktakers") or []) if i]
        picked = list(am.AgentOnboarders.objects.filter(agent=agent, is_active=True, is_blacklisted=False, id__in=ids).select_related("user"))
        if len(picked) != len(ids):
            errors.append("Pick stocktakers from your active onboarders")
        if not picked:
            errors.append("Pick at least one stocktaker")
        persons = out.get("persons") or (st.persons if st else 0)
        if persons and len(picked) > persons:
            errors.append(f"You picked {len(picked)} stocktakers for {persons} places")
        for o in picked:
            if not _payout_destination(o.user):
                errors.append(f"{o.user.first_name} needs a payout account before they can be sent")
        out["stocktakers"] = picked
    if "notes" in data:
        out["notes"] = str(data.get("notes") or "")[:2000]
    return errors, out


def _set_stocktakers(st, picked):
    keep = {o.id for o in picked}
    st.assignments.exclude(onboarder_id__in=keep).filter(days_worked=0).delete()
    have = set(st.assignments.values_list("onboarder_id", flat=True))
    for o in picked:
        if o.id not in have:
            sm.StockTakeAssignments.objects.create(stock_take=st, onboarder=o, daily_rate=st.daily_rate)
    st.assignments.filter(payout_status="PENDING").update(daily_rate=st.daily_rate)


def create_stock_take(agent, data, user):
    errors, c = _clean_booking(agent, data)
    if errors:
        return errors, None
    with transaction.atomic():
        st = sm.StockTakes.objects.create(
            entity=c["entity"], agent=agent, kind=c["kind"], every_days=c.get("every_days") or None,
            starts_on=c["starts_on"], ends_on=c["ends_on"], fee=c["fee"], persons=c["persons"],
            daily_rate=c["daily_rate"], notes=c.get("notes", ""), created_by=user,
        )
        if st.kind == "RECURRING":
            st.series = st
            st.save(update_fields=["series"])
        _set_stocktakers(st, c["stocktakers"])
    return [], st


def update_stock_take(agent, data):
    """Dates, stocktakers, rate and notes while scheduled / counting; the fee only until paid."""
    st = sm.StockTakes.objects.filter(id=data.get("stock_take"), agent=agent).first() if data.get("stock_take") else None
    if not st:
        return ["Stock take not found"], None
    if st.status not in OPEN:
        return ["This stock take can no longer be changed"], None
    if st.is_paid and "fee" in data and Decimal(str(data["fee"])) != st.fee:
        return ["The fee can't change after the business has paid"], None
    errors, c = _clean_booking(agent, data, st=st)
    if errors:
        return errors, None
    with transaction.atomic():
        for k in ("starts_on", "ends_on", "fee", "persons", "daily_rate", "notes"):
            if c.get(k) is not None and k in c:
                setattr(st, k, c[k])
        st.save()
        if "stocktakers" in c:
            _set_stocktakers(st, c["stocktakers"])
        else:
            st.assignments.filter(payout_status="PENDING").update(daily_rate=st.daily_rate)
    return [], st


def cancel_stock_take(agent, data):
    st = sm.StockTakes.objects.filter(id=data.get("stock_take"), agent=agent).first() if data.get("stock_take") else None
    if not st:
        return ["Stock take not found"], None
    if st.status not in OPEN:
        return ["Only scheduled or counting stock takes can be cancelled"], None
    if st.is_paid:
        return ["The business has paid for this stock take; ask an admin to cancel and refund it"], None
    st.status = "CANCELLED"
    st.save(update_fields=["status", "updated"])
    return [], st


def submit_stock_take(agent, data):
    """The count is finished: days worked are set from counting days, the vendor reviews, the next repeat is booked."""
    st = sm.StockTakes.objects.filter(id=data.get("stock_take"), agent=agent).first() if data.get("stock_take") else None
    if not st:
        return ["Stock take not found"], None
    if st.status not in OPEN:
        return ["This stock take was already submitted or closed"], None
    if not st.counts.exists() and not st.found_items.exists():
        return ["Nothing has been counted yet"], None
    with transaction.atomic():
        for a in st.assignments.all():
            days = {
                timezone.localtime(t).date()
                for t in st.counts.filter(onboarder=a.onboarder).values_list("created", flat=True)
            }
            a.days_worked = len(days)
            a.save(update_fields=["days_worked", "updated"])
        st.status = "SUBMITTED"
        st.submitted_at = timezone.now()
        st.save(update_fields=["status", "submitted_at", "updated"])
        _book_next(st)
    found = st.found_items.count()
    if found:
        # Stock that isn't the business's: the owner hears at once.
        from shopguard.models import GuardAlerts
        from shopguard.services import notify_owners

        notify_owners(
            st.entity, GuardAlerts.Kind.FOUND_STOCK,
            f"The stock take found {found} item line{'s' if found != 1 else ''} on your premises that "
            "aren't on your books. Open the stock take report to see them.",
        )
    return [], st


def _book_next(st):
    if st.kind != "RECURRING" or not st.every_days:
        return None
    start = st.starts_on + timedelta(days=st.every_days)
    series = st.series or st
    if sm.StockTakes.objects.filter(series=series, starts_on=start).exists():
        return None
    nxt = sm.StockTakes.objects.create(
        entity=st.entity, agent=st.agent, kind=st.kind, every_days=st.every_days, series=series,
        starts_on=start, ends_on=start + (st.ends_on - st.starts_on), fee=st.fee, persons=st.persons,
        daily_rate=st.daily_rate, notes=st.notes, created_by=st.created_by,
    )
    for a in st.assignments.select_related("onboarder"):
        o = a.onboarder
        if o.is_active and not o.is_blacklisted:
            sm.StockTakeAssignments.objects.create(stock_take=nxt, onboarder=o, daily_rate=nxt.daily_rate)
    return nxt


def set_days_worked(agent, data):
    a = sm.StockTakeAssignments.objects.filter(id=data.get("assignment"), stock_take__agent=agent).select_related("stock_take", "onboarder__user").first() if data.get("assignment") else None
    if not a:
        return ["Stocktaker not found"], None
    if a.payout_status == "PAID":
        return ["Already paid out"], None
    try:
        days = int(data.get("days_worked"))
    except (TypeError, ValueError):
        return ["Enter the days worked"], None
    window = (a.stock_take.ends_on - a.stock_take.starts_on).days + 1
    if not 0 <= days <= window:
        return [f"Days worked must be 0 to {window}"], None
    a.days_worked = days
    a.save(update_fields=["days_worked", "updated"])
    return [], a


def request_payment(st, phone, payer):
    from subscriptions.views import start_subscription_payment

    if st.is_paid:
        from core.responses import custom_errors_response

        return custom_errors_response(1, "Already paid", ["This stock take is already paid"])
    return start_subscription_payment(st.entity, payer, phone, 1, amount=st.fee, purpose="STOCK_TAKE", stock_take=st)


def mark_paid(payment):
    """A successful stock-take payment (called from subscriptions.tasks): paid + the agent's commission."""
    st = payment.stock_take
    if not st:
        create_log("error", f"Stock-take payment {payment.reference_number} has no stock take")
        return
    with transaction.atomic():
        st = sm.StockTakes.objects.select_for_update().get(id=st.id)
        if not st.is_paid:
            st.is_paid = True
            st.paid_at = timezone.now()
            st.save(update_fields=["is_paid", "paid_at", "updated"])
        ag.record_subscription_commission(payment, agent=st.agent)


# ---------------------------------------------------------------- stocktakers

def access_open(st, today=None):
    today = today or timezone.localdate()
    return st.status in OPEN and st.starts_on <= today <= st.ends_on


def stocktaker_jobs(onboarder):
    return (
        sm.StockTakes.objects.filter(assignments__onboarder=onboarder)
        .exclude(status="CANCELLED").select_related("entity", "agent__user").order_by("-starts_on")
    )


def stocktaker_access(user, stock_take_id):
    onboarder = ag.active_onboarder(user)
    if not onboarder:
        return ["You are not an active stocktaker"], None, None
    st = stocktaker_jobs(onboarder).filter(id=stock_take_id).first() if stock_take_id else None
    if not st:
        return ["You are not on this stock take"], None, None
    if not access_open(st):
        if st.status not in OPEN:
            return ["This stock take is closed"], None, None
        return [f"You can count only from {st.starts_on} to {st.ends_on}. Ask your agent to change the dates."], None, None
    return [], st, onboarder


def stocktaker_items(st, q=None):
    """What to count — titles and units only (blind count), marking items already counted."""
    done = {(c.kind, str(c.product_id or c.supply_id or c.drink_id)) for c in st.counts.all()}
    return [
        {"kind": b["kind"], "item": b["item"], "title": b["title"], "unit": b["unit"], "counted": (b["kind"], b["item"]) in done}
        for b in book_items(st.entity, q)[:300]
    ]


def record_count(st, onboarder, user, data):
    kind = str(data.get("kind") or "").upper()
    item = str(data.get("item") or "")
    book = _book_item(st.entity, kind, item) if kind and item else None
    if not book:
        return ["Pick an item of this business to count"], None
    try:
        counted = Decimal(str(data.get("counted")))
    except Exception:
        return ["Enter the quantity counted"], None
    if counted < 0:
        return ["The count can't be negative"], None
    key = {"PRODUCT": "product_id", "SUPPLY": "supply_id", "DRINK": "drink_id"}[kind]
    with transaction.atomic():
        st = sm.StockTakes.objects.select_for_update().get(id=st.id)
        if sm.StockTakeCounts.objects.filter(stock_take=st, kind=kind, **{key: item}).exists():
            return ["Already counted. Ask your agent if it needs a recount."], None
        c = sm.StockTakeCounts.objects.create(
            stock_take=st, kind=kind, title=book["title"][:256], unit=book["unit"][:40],
            book_quantity=book["book_quantity"], counted_quantity=_q3(counted), unit_cost=book["unit_cost"],
            counted_by=user, onboarder=onboarder, note=str(data.get("note") or "")[:200], **{key: item},
        )
        if st.status == "SCHEDULED":
            st.status = "COUNTING"
            st.save(update_fields=["status", "updated"])
    return [], c


def found_out(f, request=None):
    qty = Decimal(f.quantity or 0)
    return {
        "id": str(f.id),
        "title": f.title,
        "barcode": f.barcode,
        "batch_number": f.batch_number,
        "quantity": str(qty.normalize() if qty == qty.to_integral() else qty),
        "price_seen": str(f.price_seen) if f.price_seen is not None else None,
        "value_seen": str(_money(qty * Decimal(f.price_seen))) if f.price_seen is not None else None,
        "where_found": f.where_found,
        "note": f.note,
        "photo": f.photo.url if f.photo else None,
        "recorded_by": " ".join(x for x in (f.recorded_by.first_name, f.recorded_by.last_name) if x) if f.recorded_by_id else None,
        "created": f.created.isoformat(),
    }


def record_found_item(st, onboarder, user, data, files=None):
    """StocktakerRecordFoundItem {title, quantity, barcode?, batch_number?, price_seen?, where_found?, note?, photo?}."""
    title = str(data.get("title") or "").strip()
    if not title:
        return ["Describe the item"], None
    try:
        qty = Decimal(str(data.get("quantity")))
    except Exception:
        return ["Enter how many you found"], None
    if qty <= 0:
        return ["Enter how many you found"], None
    price = None
    if data.get("price_seen") not in (None, ""):
        try:
            price = _money(Decimal(str(data["price_seen"])))
        except Exception:
            return ["Enter the price as a number"], None
    with transaction.atomic():
        f = sm.StockTakeFoundItems.objects.create(
            stock_take=st, title=title[:256], quantity=_q3(qty), price_seen=price,
            barcode=str(data.get("barcode") or "").strip()[:64], batch_number=str(data.get("batch_number") or "").strip()[:64],
            where_found=str(data.get("where_found") or "").strip()[:120], note=str(data.get("note") or "")[:200],
            photo=(files or {}).get("photo"), recorded_by=user, onboarder=onboarder,
        )
        if st.status == "SCHEDULED":
            st.status = "COUNTING"
            st.save(update_fields=["status", "updated"])
    return [], f


def remove_count(agent, data):
    """Agent: drop a wrong line so it can be counted again (before submission)."""
    c = sm.StockTakeCounts.objects.filter(id=data.get("count"), stock_take__agent=agent).select_related("stock_take").first() if data.get("count") else None
    if not c:
        return ["Count not found"]
    if c.stock_take.status not in OPEN:
        return ["The count was already submitted"]
    c.delete()
    return []


# ---------------------------------------------------------------- vendors

def is_vendor_admin(user, entity):
    from authentication.utils.admin_users import can_add_employees

    return can_add_employees(user, entity)


def decide(st, user, data):
    """
    VendorDecide {stock_take, lines: [{count, decision: APPLY|KEEP}]} or {all: APPLY|KEEP}.
    Needs the stock take paid. APPLY moves stock by the variance found at count time.
    """
    if st.status != "SUBMITTED" and st.status != "APPLIED":
        return ["The count isn't submitted yet"], 0
    if not st.is_paid:
        return ["Pay for the stock take first"], 0
    pending = st.counts.filter(decision="PENDING")
    plan = {}
    if data.get("all") in ("APPLY", "KEEP"):
        plan = {str(c.id): data["all"] for c in pending}
    else:
        for row in data.get("lines") or []:
            if row.get("decision") in ("APPLY", "KEEP"):
                plan[str(row.get("count"))] = row["decision"]
    errors, done = [], 0
    for c in pending.filter(id__in=list(plan.keys())):
        if plan[str(c.id)] == "APPLY" and c.variance != 0:
            err = _apply_variance(st, c, user)
            if err:
                errors.append(f"{c.title}: {err}")
                continue
        c.decision = "APPLIED" if plan[str(c.id)] == "APPLY" else "KEPT"
        c.decided_at = timezone.now()
        c.save(update_fields=["decision", "decided_at"])
        done += 1
    if not st.counts.filter(decision="PENDING").exists():
        st.status = "APPLIED"
        st.reviewed_by = user
        st.reviewed_at = timezone.now()
        st.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated"])
    return errors, done


def _apply_variance(st, c, user):
    delta = c.variance
    reason = f"Stock take {st.starts_on:%d %b %Y}"
    try:
        if c.kind == "SUPPLY":
            from restaurants.services import supplies

            s = c.supply
            if not s:
                return "item no longer exists"
            errs, _ = supplies.count({"stock": str(s.id), "counted": str(Decimal(s.quantity or 0) + delta), "reason": reason}, user)
            return errs[0] if errs else None
        if c.kind == "DRINK":
            from restaurants.services import bar

            d = c.drink
            if not d:
                return "item no longer exists"
            errs, _ = bar.count_drink({"drink": str(d.id), "counted_bottles": str(max(Decimal(d.stock_bottles or 0) + delta, Decimal("0"))), "reason": reason}, user)
            return errs[0] if errs else None
        return _apply_to_lots(st, c, int(delta), user, reason)
    except Exception as e:  # never leave a half-applied line silently
        create_log("error", f"Stock take {st.id} line {c.id} not applied: {e!r}")
        return "could not be applied"


def _apply_to_lots(st, c, delta, user, reason):
    """Retailers: audited StockAdjustments per lot. Wholesalers: lot quantities. Shortages come off the soonest-expiring lots."""
    if delta == 0:
        return None
    k = kind_of(st.entity)
    if k == "RETAILER":
        from retailers.models import RetailerReceipts as Lot
    else:
        from wholesalers.models import WholesalerReceipts as Lot
    lots = Lot.objects.filter(entity=st.entity, product_id=c.product_id)
    if delta > 0:
        lot = lots.order_by("-created").first()
        if not lot:
            return "no stock record to add to; receive it as new stock"
        plan = [(lot, delta)]
    else:
        need = -delta
        plan = []
        for lot in lots.filter(current_unit_quantity__gt=0).order_by("expiry_date", "created"):
            take = min(int(lot.current_unit_quantity), need)
            plan.append((lot, -take))
            need -= take
            if need == 0:
                break
        if need:
            return "book stock is now lower than the shortage"
    with transaction.atomic():
        for lot, change in plan:
            if k == "RETAILER":
                from retailers.utils.retailer_utils import create_stock_adjustment

                errs, _ = create_stock_adjustment({
                    "retailer_receipt": str(lot.id), "quantity": abs(change),
                    "direction": "INCREMENT" if change > 0 else "DECREMENT",
                    "justification": reason, "return_intent": "INTERNAL_CORRECTION",
                }, user)
                if errs:
                    transaction.set_rollback(True)
                    return errs[0]
            else:
                lot.current_unit_quantity = max(0, int(lot.current_unit_quantity or 0) + change)
                lot.save(update_fields=["current_unit_quantity"])
    return None


# ---------------------------------------------------------------- admins

def stocktaker_dues(status=None):
    qs = sm.StockTakeAssignments.objects.filter(stock_take__status__in=["SUBMITTED", "APPLIED"], days_worked__gt=0)
    if status in ("PENDING", "PAID"):
        qs = qs.filter(payout_status=status)
    return qs.select_related("stock_take__entity", "onboarder__user").order_by("payout_status", "-stock_take__starts_on")


def mark_dues_paid(data, admin):
    ids = [i for i in (data.get("assignments") or []) if i]
    if not ids:
        return ["Pick the dues to mark paid"], 0
    n = sm.StockTakeAssignments.objects.filter(id__in=ids, payout_status="PENDING", days_worked__gt=0).update(
        payout_status="PAID", paid_at=timezone.now(), paid_by=admin,
        payout_reference=str(data.get("reference") or "")[:120],
    )
    # Paid outside WaziPOS: the payout ledger must not pay them again.
    from payments.utils.collection_payouts import paid_manually

    paid_manually("stocktaker_pay", ids, data.get("reference"))
    return [], n


# ---------------------------------------------------------------- requests (vendors)

def request_stock_take(entity, user, data):
    """
    VendorRequestStockTake {note?, preferred_date?}: tell the business's agent (push + SMS)
    that it wants a stock take; without an agent, WaziPOS admins. Returns (errors, who was told).
    """
    from django.db import transaction as tx

    from authentication.models import Users

    note = str(data.get("note") or "").strip()[:200]
    when = str(data.get("preferred_date") or "").strip()[:10]
    from authentication.utils.agents import is_own_shop

    agent = getattr(entity, "agent", None)
    if agent is not None and (agent.user_id == user.pk or is_own_shop(agent, entity)):
        agent = None  # their own shop: WaziPOS handles it (conflict of interest)
    if agent is not None and getattr(agent, "is_active", True) and agent.user_id:
        people, sent_to = [agent.user], "your agent"
    else:
        people = list(Users.objects.filter(Q(is_staff=True) | Q(is_superuser=True)).distinct()[:10])
        sent_to = "WaziPOS"
    if not people:
        return ["Nobody to send the request to yet. Contact WaziPOS support."], None
    who = " ".join(x for x in (user.first_name, user.last_name) if x) or getattr(user, "phone", "") or "The owner"
    body = f"{entity.title} would like a stock take{f' from {when}' if when else ''}. {who}{f': {note}' if note else ''}. Book it under Agent Panel -> Stock takes."

    def send():
        from core.utils import send_push_notification, send_sms

        for p in people:
            if getattr(p, "notification_token", None):
                send_push_notification(p.notification_token, "Stock take requested", body, {"type": "stock_take_request", "entity": str(entity.id)})
            if getattr(p, "phone", None):
                send_sms(p.phone, f"WaziPOS: {body}"[:300])

    tx.on_commit(send)
    return [], sent_to
