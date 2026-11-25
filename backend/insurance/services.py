# insurance/services.py — WaziPOS Cover: who can buy what, quotes with what WaziPOS
# already knows about you, buying (one mobile-money prompt into the WaziPOS till),
# policies, claims and the claims desk.
#
# Audiences (what each person is shown):
#   everyone ............ SafeParcel on deliveries they're buying
#   riders .............. RiderShield (anyone registered as a delivery person)
#   business admins ..... DukaCover, TillGuard; sellers also TradeGuard
#                         (admin = holds `{entity_type}SuperAdmin` for that entity)
#
# Sales switch: settings.INSURANCE_SALES_ENABLED. Until the licensed underwriting
# partner is live it is off — opting in pre-registers the policy (status INTEREST,
# no money taken) so demand is captured; switch it on and the same button takes
# payment. Every function returns data or raises CoverError(message, [reasons]).

import logging
import secrets
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import F, Q, Sum
from django.utils import timezone

from insurance import pricing
from insurance.models import Claims, Policies

log = logging.getLogger(__name__)

SELLER_TYPES = {
    "GeneralRetailer", "PharmaceuticalRetailer", "GeneralWholesaler", "PharmaceuticalWholesaler",
    "GeneralDistributor", "PharmaceuticalDistributor", "GeneralManufacturer", "PharmaceuticalManufacturer",
    "Publisher",
}
PREMISES_TYPES = SELLER_TYPES | {"Restaurant", "Hotel", "Bar", "Grocery", "Dispensary", "Clinic"}
ORDER_LINK = {
    "retailer": "retailer_order", "customer": "customer_order", "food": "food_order",
    "wholesaler": "wholesaler_order", "manufacturer": "distributor_purchase_order",
}
# Who the buyer is on each kind of order: a user (shoppers / diners) or an entity (businesses).
BUYER_FIELD = {"customer": ("customer", "user"), "food": ("customer", "user"), "retailer": ("retailer", "entity"), "wholesaler": ("wholesaler", "entity"), "manufacturer": ("distributor", "entity")}
OPEN_SHIPMENT = ("QUOTED", "CONFIRMED", "IN_TRANSIT", "AWAITING_PICKUP")


class CoverError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = errors or [message]


def sales_enabled():
    return bool(getattr(settings, "INSURANCE_SALES_ENABLED", False))


def underwriter():
    return getattr(settings, "INSURANCE_UNDERWRITER", "") or None


def _code(prefix):
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return prefix + "".join(secrets.choice(alphabet) for _ in range(9))


def _quote(product, inputs, **extra):
    try:
        return pricing.quote(product, inputs, **extra)
    except pricing.QuoteError as e:
        raise CoverError("Check the details", e.errors)


# ------------------------------------------------------------------ audience


def _is_entity_admin(user, entity):
    if not entity or not getattr(entity, "entity_type", None):
        return False
    return user.roles.filter(entity=entity, value=f"{entity.entity_type}SuperAdmin").exists()


def _rider(user):
    from logistics.models import DeliveryAgent

    return DeliveryAgent.objects.filter(user=user, is_active=True).order_by("-updated").first()


def audience(user):
    entity = getattr(user, "entity", None)
    admin = _is_entity_admin(user, entity)
    etype = getattr(entity, "entity_type", None) if admin else None
    rider = _rider(user)
    products = ["SAFE_PARCEL"]
    if rider:
        products.append("RIDER_SHIELD")
    if admin and etype in PREMISES_TYPES:
        products += ["DUKA_COVER", "TILL_GUARD"]
    if admin and etype in SELLER_TYPES:
        products.append("TRADE_GUARD")
    kind = "rider" if rider and not admin else "business" if admin else "client"
    return {"entity": entity if admin else None, "entity_type": etype, "rider": rider, "products": products, "kind": kind}


def _require(user, product):
    a = audience(user)
    if product not in a["products"]:
        why = {
            "RIDER_SHIELD": "RiderShield is for registered riders and drivers",
            "DUKA_COVER": "DukaCover is for a business's admin — sign in to the business you run",
            "TILL_GUARD": "TillGuard is for a business's admin — sign in to the business you run",
            "TRADE_GUARD": "TradeGuard is for businesses that sell on credit",
        }.get(product, "This cover isn't available to you")
        raise CoverError("Not available", [why])
    return a


# ------------------------------------------------------------------ facts WaziPOS knows


def _sector(etype):
    t = etype or ""
    if t.startswith("Pharmaceutical") or t in ("Dispensary", "Clinic"):
        return "PHARMA"
    if t in ("Restaurant", "Hotel", "Bar"):
        return "FOOD"
    if t.startswith("General") or t == "Grocery":
        return "FMCG"
    return "GENERAL"


def _stock_value(entity):
    """Cost value of stock on hand (quantity × buying price) from the business's own receipts."""
    model = None
    t = getattr(entity, "entity_type", "") or ""
    try:
        if t.endswith("Retailer"):
            from retailers.models import RetailerReceipts as model
        elif t.endswith("Wholesaler"):
            from wholesalers.models import WholesalerReceipts as model
        elif t.endswith("Distributor"):
            from distributors.models import DistributorReceipts as model
        if model is None:
            return None
        v = model.objects.filter(entity=entity, current_unit_quantity__gt=0).aggregate(v=Sum(F("current_unit_quantity") * F("unit_buying_price")))["v"]
        return int(v or 0)
    except Exception as e:
        log.info("stock value for %s unavailable: %s", getattr(entity, "pk", None), e)
        return None


def _staff_count(entity):
    try:
        from employees.models import Employees

        return max(1, Employees.objects.filter(entity=entity, is_active="true").count())
    except Exception:
        return 1


def _shop_guard_on(entity):
    try:
        from shopguard.models import GuardSettings, StaffShifts

        on = GuardSettings.objects.filter(entity=entity, alerts_enabled=True).exists()
        recent = StaffShifts.objects.filter(entity=entity, clock_in_at__gte=timezone.now() - timedelta(days=30)).exists()
        return on and recent
    except Exception:
        return False


def _recent_stock_take(entity):
    try:
        from stocktakes.models import StockTakes

        return StockTakes.objects.filter(entity=entity, status="APPLIED", ends_on__gte=timezone.localdate() - timedelta(days=90)).exists()
    except Exception:
        return False


def prefill(user, a=None):
    a = a or audience(user)
    out = {}
    if a["rider"]:
        out["RIDER_SHIELD"] = {"mode": a["rider"].mode, "plan": "DAY"}
    e = a["entity"]
    if e:
        stock = _stock_value(e)
        guard, take = _shop_guard_on(e), _recent_stock_take(e)
        out["DUKA_COVER"] = {"stock_value": stock or 100_000, "stock_from_records": stock is not None and stock > 0, "sector": _sector(a["entity_type"]), "cash_limit": 10_000, "shop_guard": guard, "recent_stock_take": take, "secured": False}
        out["TILL_GUARD"] = {"staff_count": _staff_count(e), "limit": 50_000, "shop_guard": guard}
        out["TRADE_GUARD"] = {"amount": 10_000, "days": 30}
    out["SAFE_PARCEL"] = {"value": 5_000, "mode": "MOTORBIKE", "distance_km": 8, "category": "GENERAL"}
    return out


def _server_facts(user, product, inputs, a):
    """Discounts can't be claimed falsely: the facts WaziPOS knows override the form."""
    inputs = dict(inputs or {})
    e = a["entity"]
    extra = {}
    if product in ("DUKA_COVER", "TILL_GUARD") and e:
        inputs["shop_guard"] = _shop_guard_on(e)
    if product == "DUKA_COVER" and e:
        inputs["recent_stock_take"] = _recent_stock_take(e)
    if product == "RIDER_SHIELD" and a["rider"]:
        inputs.setdefault("mode", a["rider"].mode)
    if product == "TRADE_GUARD":
        extra["buyer_history"] = _buyer_history(e, inputs.get("buyer_phone"))
    return inputs, extra


def _buyer_history(entity, phone):
    phone = _phone(phone)
    if not entity or not phone:
        return (0, 0)
    qs = Policies.objects.filter(entity=entity, product="TRADE_GUARD", inputs__buyer_phone=phone)
    bad = Claims.objects.filter(policy__in=qs).exclude(status="REJECTED").count()
    good = qs.filter(status="EXPIRED").count()
    return (good, bad)


def _phone(raw):
    p = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if p.startswith("0") and len(p) == 10:
        p = "254" + p[1:]
    return p or None


# ------------------------------------------------------------------ catalogue / quotes / offers


def catalogue(user):
    a = audience(user)
    pre = prefill(user, a)
    now = timezone.now()
    active = {
        p.product: p for p in Policies.objects.filter(holder=user, status="ACTIVE", ends_at__gt=now).exclude(product__in=("SAFE_PARCEL", "TRADE_GUARD"))
    }
    items = []
    for product in a["products"]:
        try:
            inputs, extra = _server_facts(user, product, pre.get(product, {}), a)
            q = _quote(product, inputs, **extra)
        except CoverError:
            q = None
        name, tagline = pricing.LABELS[product]
        items.append({
            "product": product, "name": name, "tagline": tagline,
            "from_premium": q["premium"] if q else None, "period": q["period"] if q else None,
            "cover": q["cover"] if q else None, "prefill": pre.get(product, {}),
            "active": policy_out(active[product]) if product in active else None,
        })
    return {
        "audience": a["kind"], "entity": {"id": str(a["entity"].id), "title": a["entity"].title, "type": a["entity_type"]} if a["entity"] else None,
        "products": items, "sales_enabled": sales_enabled(), "underwriter": underwriter(),
        "options": {
            "modes": list(pricing.RATES["SAFE_PARCEL"]["mode_rate"].keys()), "categories": list(pricing.RATES["SAFE_PARCEL"]["category_factor"].keys()),
            "sectors": list(pricing.RATES["DUKA_COVER"]["sector_factor"].keys()), "cash_levels": list(pricing.RATES["DUKA_COVER"]["cash_levels"]),
            "till_limits": list(pricing.RATES["TILL_GUARD"]["levels"].keys()), "rider_plans": list(pricing.RATES["RIDER_SHIELD"]["plan_days"].keys()),
            "incidents": pricing.INCIDENTS,
        },
    }


def quote_for(user, data):
    product = str(data.get("product") or "").upper()
    a = _require(user, product)
    inputs, extra = _server_facts(user, product, data.get("inputs") or {}, a)
    q = _quote(product, inputs, **extra)
    q["inputs_used"] = inputs
    return q


def offer(user, data):
    """
    The opportunistic button: is this person covered for this moment already, and if
    not, what would it cost? product + context (e.g. an order's delivery, a rider's day).
    """
    product = str(data.get("product") or "").upper()
    a = audience(user)
    if product not in a["products"]:
        return {"eligible": False}
    ctx = data.get("context") or {}
    existing = None
    now = timezone.now()
    if product == "SAFE_PARCEL" and ctx.get("subject_id"):
        existing = Policies.objects.filter(holder=user, product=product, subject_kind=ctx.get("subject_kind"), subject_id=str(ctx["subject_id"]), status__in=("ACTIVE", "AWAITING_PAYMENT", "INTEREST")).first()
    elif product in ("RIDER_SHIELD", "DUKA_COVER", "TILL_GUARD"):
        existing = (
            Policies.objects.filter(holder=user, product=product, status="ACTIVE", ends_at__gt=now).order_by("-ends_at").first()
            # Pre-registered while sales are closed: show it as taken, don't keep offering.
            or Policies.objects.filter(holder=user, product=product, status="INTEREST").order_by("-created").first()
        )
    if existing:
        return {"eligible": True, "covered": True, "policy": policy_out(existing), "sales_enabled": sales_enabled()}
    inputs = {**prefill(user, a).get(product, {}), **(ctx.get("inputs") or {})}
    inputs, extra = _server_facts(user, product, inputs, a)
    try:
        q = _quote(product, inputs, **extra)
    except CoverError as e:
        return {"eligible": False, "reason": e.errors[0]}
    return {"eligible": True, "covered": False, "quote": q, "inputs": inputs, "sales_enabled": sales_enabled()}


# ------------------------------------------------------------------ subjects


def _order_for(kind, order_id):
    from logistics.models import Shipment

    field = ORDER_LINK.get(kind)
    if not field:
        raise CoverError("Check the details", ["Unknown order type"])
    model = Shipment._meta.get_field(field).related_model
    order = model.objects.filter(pk=order_id).first()
    if not order:
        raise CoverError("Not found", ["That order doesn't exist"])
    return order, Shipment.objects.filter(**{field: order}).first()


def _check_parcel_subject(user, kind, order_id):
    order, shipment = _order_for(kind, order_id)
    attr, who = BUYER_FIELD[kind]
    buyer = getattr(order, f"{attr}_id", None)
    mine = (buyer == user.pk) if who == "user" else (buyer == getattr(user, "entity_id", None))
    if not mine:
        raise CoverError("Not allowed", ["You can only insure deliveries you're buying"])
    if shipment and shipment.status in ("DELIVERED", "FAILED", "CANCELLED"):
        raise CoverError("Too late", ["This delivery is already finished"])
    if shipment and shipment.method == "PICKUP":
        raise CoverError("Not needed", ["You're collecting this order yourself — there's no delivery to insure"])
    ref = getattr(order, "reference_number", None) or getattr(order, "order_number", None) or str(order.pk)[:8].upper()
    return order, shipment, f"Delivery of order {ref}"


def insurable_deliveries(user):
    """Deliveries this person is buying that aren't insured yet (the hub's SafeParcel list)."""
    from logistics.models import Shipment

    entity_id = getattr(user, "entity_id", None)
    rows = []
    for kind, field in ORDER_LINK.items():
        attr, who = BUYER_FIELD[kind]
        flt = {f"{field}__{attr}": user} if who == "user" else ({f"{field}__{attr}_id": entity_id} if entity_id else None)
        if not flt:
            continue
        try:
            for s in Shipment.objects.filter(status__in=OPEN_SHIPMENT, **flt).exclude(method="PICKUP").select_related("entity").order_by("-created")[:20]:
                order = getattr(s, field)
                rows.append({
                    "subject_kind": kind, "subject_id": str(order.pk), "seller": s.entity.title if s.entity_id else None,
                    "value": float(s.cargo_value or 0), "distance_km": float(s.distance_km or 0), "method": s.method,
                    "tracking": s.tracking_number, "status": s.status, "created": s.created.isoformat(),
                })
        except Exception as e:  # one order type misconfigured must not break the list
            log.info("insurable deliveries for %s skipped: %s", kind, e)
    insured = set(Policies.objects.filter(holder=user, product="SAFE_PARCEL", status__in=("ACTIVE", "AWAITING_PAYMENT", "INTEREST")).values_list("subject_id", flat=True))
    return [r for r in rows if r["subject_id"] not in insured]


# ------------------------------------------------------------------ buying


DURATION_DAYS = {"SAFE_PARCEL": 30, "DUKA_COVER": 30, "TILL_GUARD": 30}


def buy(user, data):
    product = str(data.get("product") or "").upper()
    a = _require(user, product)
    if not data.get("accept_terms"):
        raise CoverError("Check the details", ["Tick that you've read what's covered and what isn't"])
    inputs, extra = _server_facts(user, product, data.get("inputs") or {}, a)
    subject_kind, subject_id, label = data.get("subject_kind"), data.get("subject_id"), None
    now = timezone.now()

    if product == "SAFE_PARCEL":
        if not subject_kind or not subject_id:
            raise CoverError("Check the details", ["Pick the delivery to insure"])
        _order, shipment, label = _check_parcel_subject(user, str(subject_kind), str(subject_id))
        if shipment and shipment.cargo_value and float(shipment.cargo_value) > 0:
            inputs["value"] = float(shipment.cargo_value)  # the order's own goods value, not a typed one
            inputs.setdefault("distance_km", float(shipment.distance_km or 0))
            if shipment.method == "COURIER":
                inputs["mode"] = "COURIER"
        if Policies.objects.filter(holder=user, product=product, subject_kind=subject_kind, subject_id=str(subject_id), status__in=("ACTIVE", "AWAITING_PAYMENT", "INTEREST")).exists():
            raise CoverError("Already covered", ["This delivery is already insured"])
    elif product == "TRADE_GUARD":
        name = str(inputs.get("buyer_name") or "").strip()
        phone = _phone(inputs.get("buyer_phone"))
        if len(name) < 2 or not phone or len(phone) < 11:
            raise CoverError("Check the details", ["Enter the customer's name and phone number"])
        inputs["buyer_phone"] = phone
        subject_kind, subject_id = "credit_sale", str(data.get("subject_id") or f"{phone}:{now:%Y%m%d%H%M}")
        label = f"Credit to {name} ({inputs.get('amount')})"
    else:
        subject_kind = subject_kind or ("entity" if a["entity"] and product in ("DUKA_COVER", "TILL_GUARD") else "rider")
        subject_id = subject_id or (str(a["entity"].id) if subject_kind == "entity" else str(user.pk))
        label = a["entity"].title if subject_kind == "entity" else "Rider accident cover"

    q = _quote(product, inputs, **extra)
    plan = str(inputs.get("plan") or "").upper() or None
    phone = _phone(data.get("phone") or getattr(user, "phone", None))
    if sales_enabled() and (not phone or len(phone) < 11):
        raise CoverError("Check the details", ["Enter the mobile-money number to pay from"])

    # Renewals: a new period starts when the current one ends (no overlap, no gap).
    current = None
    if product in ("RIDER_SHIELD", "DUKA_COVER", "TILL_GUARD"):
        current = Policies.objects.filter(holder=user, product=product, subject_id=subject_id, status="ACTIVE", ends_at__gt=now).order_by("-ends_at").first()
        if current and current.ends_at - now > timedelta(days=5 if product != "RIDER_SHIELD" else 0):
            raise CoverError("Already covered", [f"You're covered until {timezone.localtime(current.ends_at):%d %b %Y, %H:%M}. Renew in the last 5 days."])

    if not sales_enabled():
        already = Policies.objects.filter(holder=user, product=product, subject_id=str(subject_id), status="INTEREST").first()
        if already:
            # Same thing pre-registered again: refresh the saved quote instead of duplicating it.
            already.inputs, already.quote = inputs, q
            already.premium, already.cover_amount = pricing.to_decimal(q["premium"]), pricing.to_decimal(q["cover"])
            already.save(update_fields=["inputs", "quote", "premium", "cover_amount", "updated"])
            return policy_out(already)

    with transaction.atomic():
        p = Policies.objects.create(
            policy_number=_code("WC"), product=product, plan=plan, holder=user, entity=a["entity"] if product != "SAFE_PARCEL" and product != "RIDER_SHIELD" else getattr(user, "entity", None),
            status="INTEREST" if not sales_enabled() else "AWAITING_PAYMENT",
            premium=pricing.to_decimal(q["premium"]), cover_amount=pricing.to_decimal(q["cover"]), excess=pricing.to_decimal(q.get("excess", 0)),
            inputs=inputs, quote=q, subject_kind=subject_kind, subject_id=str(subject_id), subject_label=(label or "")[:200],
            source=str(data.get("source") or "hub")[:40], pay_phone=phone,
            starts_at=current.ends_at if current else None,
        )
    if not sales_enabled():
        _tell(user, "You're on the list", [f"{q['name']} isn't on sale yet — we've saved your quote of KES {q['premium']:,} ({q['period']}).", "We'll let you know the moment you can switch it on."], push=True)
        return policy_out(p)

    from payments.utils.system_till import push_to_system_till

    reference = _code("INS")
    errors, _result, _telco = push_to_system_till(reference, int(q["premium"]), phone, description=f"{q['name']} {p.policy_number}"[:60])
    if errors:
        p.status = "FAILED"
        p.save(update_fields=["status", "updated"])
        raise CoverError("Payment prompt not sent", errors)
    p.pay_reference = reference
    p.save(update_fields=["pay_reference", "updated"])
    return policy_out(p)


def _activate(p):
    now = timezone.now()
    start = p.starts_at if p.starts_at and p.starts_at > now else now
    if p.product == "RIDER_SHIELD":
        days = pricing.RATES["RIDER_SHIELD"]["plan_days"].get(p.plan or "DAY", 1)
        end = timezone.localtime(start).replace(hour=23, minute=59, second=59) + timedelta(days=days - 1) if days == 1 else start + timedelta(days=days)
    elif p.product == "TRADE_GUARD":
        r = pricing.RATES["TRADE_GUARD"]
        end = start + timedelta(days=int(p.inputs.get("days") or 30) + r["grace_days"] + 60)
    else:
        end = start + timedelta(days=DURATION_DAYS.get(p.product, 30))
    p.status, p.starts_at, p.ends_at, p.paid_at = "ACTIVE", start, end, now
    p.save(update_fields=["status", "starts_at", "ends_at", "paid_at", "updated"])
    q = p.quote or {}
    _tell(p.holder, f"{q.get('name', 'Cover')} is on", [
        f"Policy {p.policy_number}: covered up to KES {float(p.cover_amount):,.0f} until {timezone.localtime(end):%d %b %Y, %H:%M}.",
        f"Premium paid: KES {float(p.premium):,.0f}.",
        "If something happens, open WaziPOS → Insurance → Claims.",
    ], push=True)


def refresh_payment(user, data):
    pid = data.get("policy_id")
    p = Policies.objects.filter(id=pid, **({"holder": user} if user else {})).first() if pid else None
    if not p:
        raise CoverError("Not found", ["That policy doesn't exist"])
    _follow(p)
    p.refresh_from_db()
    return policy_out(p)


def _follow(p):
    if p.status != "AWAITING_PAYMENT" or not p.pay_reference:
        return
    from payments.utils.system_till import fetch_transaction

    tx = fetch_transaction(p.pay_reference)
    status = (tx or {}).get("status", "")
    if status == "SUCCESS":
        with transaction.atomic():
            locked = Policies.objects.select_for_update().get(pk=p.pk)
            if locked.status == "AWAITING_PAYMENT":
                _activate(locked)
    elif status in ("FAILED", "CANCELLED") or (not tx and timezone.now() - p.created > timedelta(minutes=30)):
        Policies.objects.filter(pk=p.pk, status="AWAITING_PAYMENT").update(status="FAILED", updated=timezone.now())


def reconcile_payments():
    n = 0
    for p in Policies.objects.filter(status="AWAITING_PAYMENT").exclude(pay_reference=None)[:200]:
        try:
            _follow(p)
            n += 1
        except Exception as e:
            log.warning("policy %s payment check failed: %s", p.pk, e)
    return n


def expire_policies():
    """Policies past their end become EXPIRED; a SafeParcel ends 48 h after its delivery."""
    now = timezone.now()
    n = Policies.objects.filter(status="ACTIVE", ends_at__lt=now).update(status="EXPIRED", updated=now)
    from logistics.models import Shipment

    for p in Policies.objects.filter(status="ACTIVE", product="SAFE_PARCEL"):
        field = ORDER_LINK.get(p.subject_kind or "")
        if not field:
            continue
        s = Shipment.objects.filter(**{f"{field}_id": p.subject_id}).only("status", "delivered_at", "updated").first()
        done_at = s and (s.delivered_at or (s.updated if s.status in ("FAILED", "CANCELLED") else None))
        if done_at and done_at + timedelta(hours=48) < now:
            Policies.objects.filter(pk=p.pk).update(status="EXPIRED", ends_at=done_at + timedelta(hours=48), updated=now)
            n += 1
    return n


def cancel(user, data):
    p = Policies.objects.filter(id=data.get("policy_id"), holder=user).first()
    if not p:
        raise CoverError("Not found", ["That policy doesn't exist"])
    if p.status not in ("INTEREST", "AWAITING_PAYMENT", "FAILED"):
        raise CoverError("Not allowed", ["Only cover that hasn't started can be cancelled here"])
    p.status = "CANCELLED"
    p.save(update_fields=["status", "updated"])
    return policy_out(p)


def my_policies(user):
    rows = Policies.objects.filter(holder=user).exclude(status="CANCELLED").order_by("-created")[:200]
    return [policy_out(p) for p in rows]


def policy_out(p):
    q = p.quote or {}
    return {
        "id": str(p.id), "policy_number": p.policy_number, "product": p.product, "name": q.get("name") or p.get_product_display(), "plan": p.plan,
        "status": p.status, "premium": float(p.premium), "cover": float(p.cover_amount), "excess": float(p.excess), "excess_text": q.get("excess_text"),
        "period": q.get("period"), "covers": q.get("covers", []), "excludes": q.get("excludes", []), "scenarios": q.get("scenarios", []),
        "claim_window": q.get("claim_window"), "subject_kind": p.subject_kind, "subject_id": p.subject_id, "subject_label": p.subject_label,
        "starts_at": p.starts_at.isoformat() if p.starts_at else None, "ends_at": p.ends_at.isoformat() if p.ends_at else None,
        "paid_at": p.paid_at.isoformat() if p.paid_at else None, "created": p.created.isoformat(),
        "claims": [{"id": str(c.id), "status": c.status, "claim_number": c.claim_number} for c in p.claims.all()[:5]] if p.pk else [],
        "incidents": pricing.INCIDENTS.get(p.product, {}),
        # For renewing with the same answers (TradeGuard buyer details stay private to the holder).
        "inputs": p.inputs or {},
    }


# ------------------------------------------------------------------ claims


CLAIM_WINDOW_DAYS = {"SAFE_PARCEL": 2, "RIDER_SHIELD": 7, "DUKA_COVER": 2, "TRADE_GUARD": 60, "TILL_GUARD": 7}
EVIDENCE_TYPES = {".pdf", ".png", ".jpg", ".jpeg", ".heic", ".webp"}


def _claim_policy(user, data):
    p = Policies.objects.filter(id=data.get("policy_id"), holder=user).first()
    if not p:
        raise CoverError("Not found", ["That policy doesn't exist"])
    if p.status not in ("ACTIVE", "EXPIRED") or not p.starts_at:
        raise CoverError("Not covered", ["This cover never started, so there's nothing to claim"])
    return p


def _incident_time(data):
    from datetime import datetime

    raw = data.get("incident_at")
    if not raw:
        raise CoverError("Check the details", ["When did it happen?"])
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        raise CoverError("Check the details", ["The date and time of the incident isn't valid"])
    return dt if timezone.is_aware(dt) else timezone.make_aware(dt)


def _loss(data):
    try:
        return max(0.0, float(str(data.get("loss_amount") or 0).replace(",", "")))
    except ValueError:
        raise CoverError("Check the details", ["Loss amount must be a number"])


def estimate_claim(user, data):
    p = _claim_policy(user, data)
    incident = str(data.get("incident") or "").upper()
    try:
        return pricing.claim_estimate(p.product, float(p.cover_amount), p.inputs, incident, _loss(data), int(data.get("nights") or 0))
    except pricing.QuoteError as e:
        raise CoverError("Check the details", e.errors)


def file_claim(user, data, files=None):
    p = _claim_policy(user, data)
    incident = str(data.get("incident") or "").upper()
    at = _incident_time(data)
    now = timezone.now()
    if at > now + timedelta(minutes=5):
        raise CoverError("Check the details", ["The incident can't be in the future"])
    if at < p.starts_at or (p.ends_at and at > p.ends_at):
        raise CoverError("Not covered", ["It happened outside the time this policy covered"])
    window = CLAIM_WINDOW_DAYS.get(p.product, 7)
    if p.product == "TRADE_GUARD":
        due = p.starts_at + timedelta(days=int(p.inputs.get("days") or 30) + pricing.RATES["TRADE_GUARD"]["grace_days"])
        if now < due:
            raise CoverError("Too early", [f"You can claim from {timezone.localtime(due):%d %b %Y} — after the due date and the {pricing.RATES['TRADE_GUARD']['grace_days']}-day grace period"])
        if now > due + timedelta(days=window):
            raise CoverError("Too late", ["Credit claims must be made within 60 days of becoming claimable"])
    elif now - at > timedelta(days=window + 1):
        raise CoverError("Too late", [f"Claims under this cover must be reported within {window} days"])
    description = str(data.get("description") or "").strip()
    if len(description) < 15:
        raise CoverError("Check the details", ["Describe what happened in a sentence or two"])
    loss = _loss(data)
    if incident not in ("DEATH", "DISABILITY", "HOSPITAL") and loss <= 0:
        raise CoverError("Check the details", ["Enter how much you lost"])
    police = str(data.get("police_reference") or "").strip()[:60] or None
    if p.product in ("DUKA_COVER", "TILL_GUARD") and incident in ("BURGLARY", "CASH", "STAFF_THEFT", "SIM_SWAP") and not police:
        raise CoverError("Check the details", ["Add the police OB number — burglary, robbery and theft claims need one"])
    if p.claims.exclude(status="REJECTED").filter(incident=incident, incident_at=at).exists():
        raise CoverError("Already claimed", ["You've already claimed for this incident"])
    ev = (files or {}).get("evidence") if files else None
    if ev:
        name = str(getattr(ev, "name", "")).lower()
        if (name[name.rfind("."):] if "." in name else "") not in EVIDENCE_TYPES:
            raise CoverError("Check the details", ["Evidence must be a photo or a PDF"])
        if getattr(ev, "size", 0) > 8 * 1024 * 1024:
            raise CoverError("Check the details", ["Evidence must be 8 MB or smaller"])
    try:
        est = pricing.claim_estimate(p.product, float(p.cover_amount), p.inputs, incident, loss, int(data.get("nights") or 0))
    except pricing.QuoteError as e:
        raise CoverError("Check the details", e.errors)
    c = Claims.objects.create(
        claim_number=_code("CL"), policy=p, claimant=user, incident=incident, incident_at=at, loss_amount=pricing.to_decimal(loss),
        nights=int(data.get("nights") or 0), description=description[:4000], police_reference=police, evidence=ev, estimate=est,
        payable_estimate=pricing.to_decimal(est["payable"]),
    )
    _tell(user, "Claim received", [f"Claim {c.claim_number} on policy {p.policy_number}.", f"Estimated payout: KES {est['payable']:,} (confirmed after review).", "We'll update you by email and in the app."], push=True)
    _tell_desk(f"New claim {c.claim_number}", [f"{(p.quote or {}).get('name', p.product)} · {pricing.INCIDENTS[p.product].get(incident, incident)}", f"Loss KES {loss:,.0f} · estimate KES {est['payable']:,}"])
    return claim_out(c)


def my_claims(user):
    return [claim_out(c) for c in Claims.objects.select_related("policy").filter(claimant=user).order_by("-created")[:200]]


def claim_out(c, request=None, desk=False):
    p = c.policy
    out = {
        "id": str(c.id), "claim_number": c.claim_number, "status": c.status, "incident": c.incident,
        "incident_label": pricing.INCIDENTS.get(p.product, {}).get(c.incident, c.incident), "incident_at": c.incident_at.isoformat(),
        "loss_amount": float(c.loss_amount), "nights": c.nights, "description": c.description, "police_reference": c.police_reference,
        "estimate": c.estimate, "payable_estimate": float(c.payable_estimate), "approved_amount": float(c.approved_amount) if c.approved_amount is not None else None,
        "decision_note": c.decision_note, "paid_at": c.paid_at.isoformat() if c.paid_at else None, "created": c.created.isoformat(),
        "policy": {"id": str(p.id), "policy_number": p.policy_number, "product": p.product, "name": (p.quote or {}).get("name", p.product), "subject_label": p.subject_label},
        "evidence": (request.build_absolute_uri(c.evidence.url) if request else c.evidence.url) if c.evidence else None,
    }
    if desk:
        u = c.claimant
        out["claimant"] = {"name": f"{u.first_name} {u.last_name}".strip() or u.email, "email": u.email, "phone": u.phone}
        out["policy"]["cover"] = float(p.cover_amount)
        out["policy"]["premium"] = float(p.premium)
    return out


# ------------------------------------------------------------------ claims desk (platform admins)


def _desk(user):
    from authentication.utils.admin_users import is_platform_admin

    if not is_platform_admin(user):
        raise CoverError("Not allowed", ["Only the WaziPOS claims desk can do this"])


def desk_claims(user, data, request=None):
    _desk(user)
    qs = Claims.objects.select_related("policy", "claimant").order_by("-created")
    status = str(data.get("status") or "").upper()
    if status:
        qs = qs.filter(status=status)
    return [claim_out(c, request, desk=True) for c in qs[:300]]


DESK_MOVES = {"SUBMITTED": {"IN_REVIEW", "APPROVED", "REJECTED"}, "IN_REVIEW": {"APPROVED", "REJECTED"}, "APPROVED": {"PAID", "REJECTED"}, "REJECTED": set(), "PAID": set()}


def desk_decide(user, data, request=None):
    _desk(user)
    with transaction.atomic():
        c = Claims.objects.select_for_update().select_related("policy", "claimant").filter(id=data.get("claim_id")).first()
        if not c:
            raise CoverError("Not found", ["That claim doesn't exist"])
        status = str(data.get("status") or "").upper()
        if status not in DESK_MOVES.get(c.status, set()):
            raise CoverError("Not allowed", [f"A claim that is {c.status.lower()} can't become {status.lower() or '—'}"])
        note = str(data.get("note") or "").strip()[:2000] or None
        if status == "APPROVED":
            try:
                amount = Decimal(str(data.get("approved_amount") if data.get("approved_amount") not in (None, "") else c.payable_estimate))
            except Exception:
                raise CoverError("Check the details", ["Approved amount must be a number"])
            if amount <= 0 or amount > c.policy.cover_amount:
                raise CoverError("Check the details", ["Approved amount must be above zero and within the cover"])
            c.approved_amount = amount
        if status == "REJECTED" and not note:
            raise CoverError("Check the details", ["Say why the claim is declined — the claimant sees it"])
        if status == "PAID":
            c.paid_at = timezone.now()
        c.status, c.decision_note, c.decided_by = status, note or c.decision_note, user
        c.save()
    msg = {
        "IN_REVIEW": ("Your claim is being reviewed", f"Claim {c.claim_number} is with an assessor."),
        "APPROVED": ("Claim approved", f"Claim {c.claim_number}: KES {float(c.approved_amount or 0):,.0f} approved. Payment follows shortly."),
        "REJECTED": ("Claim update", f"Claim {c.claim_number} wasn't approved: {c.decision_note}"),
        "PAID": ("Claim paid", f"Claim {c.claim_number}: KES {float(c.approved_amount or 0):,.0f} has been paid."),
    }.get(status)
    if msg:
        _tell(c.claimant, msg[0], [msg[1]], push=True, sms=status in ("APPROVED", "PAID"))
    return claim_out(c, request, desk=True)


def desk_summary(user):
    _desk(user)
    rows = []
    for product, _label in Policies.PRODUCTS:
        qs = Policies.objects.filter(product=product)
        paid = qs.filter(status__in=("ACTIVE", "EXPIRED"))
        premiums = float(paid.aggregate(v=Sum("premium"))["v"] or 0)
        claims_paid = float(Claims.objects.filter(policy__product=product, status="PAID").aggregate(v=Sum("approved_amount"))["v"] or 0)
        rows.append({
            "product": product, "name": pricing.LABELS[product][0], "active": qs.filter(status="ACTIVE").count(), "interest": qs.filter(status="INTEREST").count(),
            "premiums": premiums, "claims_paid": claims_paid, "loss_ratio": round(claims_paid / premiums * 100, 1) if premiums else None,
            "open_claims": Claims.objects.filter(policy__product=product, status__in=("SUBMITTED", "IN_REVIEW", "APPROVED")).count(),
        })
    return {"products": rows, "sales_enabled": sales_enabled(), "underwriter": underwriter()}


# ------------------------------------------------------------------ notices


def _tell(user, subject, lines, push=False, sms=False):
    try:
        from core.notify import notify_users

        notify_users([user], subject, lines, email=True, push=push, sms=sms, sms_text=f"WaziPOS Cover: {lines[0]}"[:300], data={"type": "insurance"})
    except Exception as e:
        log.warning("insurance notice failed: %s", e)


def _tell_desk(subject, lines):
    try:
        from authentication.models import Users
        from core.notify import notify_users

        desk = list(Users.objects.filter(Q(is_staff=True) | Q(is_superuser=True)).distinct()[:20])
        notify_users(desk, subject, lines, email=True, push=False)
    except Exception as e:
        log.warning("claims desk notice failed: %s", e)
