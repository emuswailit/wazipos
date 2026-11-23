# credit/services.py — WaziPOS Credit ("Lipa Baadaye"): order financing for traders.
#
#   1. A Bank / Facilitator entity sets up lending (rates per 7/14/28 days, fees,
#      limits, who it serves) and WaziPOS approves it (licence checked). It needs a
#      JamboPay WALLET payout account — every repayment goes straight there.
#   2. It tops up a lending float by mobile money into the WaziPOS collection account.
#   3. At checkout a buyer (or the seller's staff, with the buyer's SMS consent) picks
#      a lender and 7, 14 or 28 days. The loan is approved on the spot from the float
#      and books a payment on the order — the seller is paid onward by the usual
#      payout ledger, as for any M-Pesa payment.
#   4. The borrower repays any time by a mobile-money checkout INTO THE LENDER'S
#      WALLET (never through WaziPOS). On the due date WaziPOS sends the prompt itself.
#   5. Reminders: 3 days before (email + app), due day (SMS — action needed), overdue
#      days 1, 3 and 7 (SMS). Late fees weekly after the grace days, capped so all
#      charges never exceed the amount borrowed (in duplum). 30 days late → defaulted.
#
# Kenya: lenders must be licensed (CBK bank / microfinance / digital credit provider, or
# SASRA SACCO); every offer shows the full cost of credit, an APR, and the 20% excise
# duty on fees; consent is explicit (in the app, or an SMS code with the terms).

import hashlib
import logging
import secrets
from datetime import date, timedelta
from decimal import ROUND_UP, Decimal

from django.db import IntegrityError, transaction
from django.db.models import F, Q, Sum
from django.utils import timezone

from credit import adapters
from credit.models import CreditConsents, Facilities, FloatMovements, LenderProfiles, Repayments

log = logging.getLogger(__name__)

TENORS = (7, 14, 28)
LENDER_TYPES = {"Bank", "Facilitator"}
SEGMENT_CODES = {"RETAILER_B2B", "WHOLESALER_B2B", "CUSTOMER", "FOOD"}
PEOPLE_SEGMENTS = {"CUSTOMER", "FOOD"}
CONSENT_MINUTES = 10
DEFAULT_AFTER_DAYS = 30


class CreditError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = errors or [message]


def _q(v):
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


def _whole(v):
    """Mobile money takes whole shillings; round charges up, never down."""
    return Decimal(str(v or 0)).quantize(Decimal("1"), rounding=ROUND_UP)


def _code(prefix):
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return prefix + "".join(secrets.choice(alphabet) for _ in range(9))


def _phone(raw):
    p = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if p.startswith("0") and len(p) == 10:
        p = "254" + p[1:]
    return p or None


def _mask(phone):
    p = str(phone or "")
    return f"{p[:5]}***{p[-3:]}" if len(p) > 8 else "***"


def _is_admin(user, entity):
    if not user or not entity or not getattr(entity, "entity_type", None):
        return False
    return user.roles.filter(entity=entity, value=f"{entity.entity_type}SuperAdmin").exists()


def _platform_admin(user):
    from authentication.utils.admin_users import is_platform_admin

    return is_platform_admin(user)


def kes(v):
    return f"KES {Decimal(str(v or 0)):,.0f}"


# ------------------------------------------------------------------ pricing


def cost_of_credit(lender, principal, tenor):
    """Everything the borrower pays, itemised (shown before they accept)."""
    if tenor not in TENORS:
        raise CreditError("Check the details", ["Repay in 7, 14 or 28 days"])
    principal = _q(principal)
    rate = Decimal(str(getattr(lender, f"rate_{tenor}")))
    interest = _q(principal * rate / 100)
    admin_fee = _q(max(Decimal(str(lender.admin_fee_min)), principal * Decimal(str(lender.admin_fee_pct)) / 100))
    excise = _q(admin_fee * Decimal(str(lender.excise_pct)) / 100)  # excise duty is on fees, not interest
    total = _whole(principal + interest + admin_fee + excise)
    charges = total - principal
    apr = _q(charges / principal * Decimal(365) / Decimal(tenor) * 100) if principal else Decimal("0")
    due = timezone.localdate() + timedelta(days=tenor)
    return {
        "tenor": tenor, "principal": float(principal), "interest": float(interest), "rate_pct": float(rate),
        "admin_fee": float(admin_fee), "excise": float(excise), "total": float(total), "charges": float(charges),
        "apr": float(apr), "due_date": due.isoformat(),
        "late_fee": f"{lender.late_fee_pct_week}% of the balance a week after {lender.grace_days} grace days (total charges never exceed what you borrowed)",
    }


# ------------------------------------------------------------------ WaziScore


def _age_days(user, entity):
    born = getattr(entity, "created", None) if entity else (getattr(user, "created_at", None) or getattr(user, "date_joined", None))
    return (timezone.now() - born).days if born else 0


def _borrower_q(user, entity):
    return Q(borrower_entity=entity) if entity else Q(borrower_user=user, borrower_entity__isnull=True)


def score(kind, user, entity):
    """An explainable 0–100 score from what WaziPOS sees, and the credit limit it unlocks."""
    q = _borrower_q(user, entity)
    if Facilities.objects.filter(q, status__in=("DEFAULTED", "WRITTEN_OFF")).exists():
        return {"score": 0, "limit": 0, "reasons": ["An earlier WaziPOS Credit loan wasn't repaid"]}
    s, reasons = 40, ["Starting score 40"]
    paid = adapters.paid_orders_90d(kind, user, entity)
    if paid:
        add = min(30, paid * 3)
        s += add
        reasons.append(f"+{add} for {paid} paid orders in 90 days")
    age = _age_days(user, entity)
    if age >= 9:
        add = min(20, age // 9)
        s += add
        reasons.append(f"+{add} for {age} days on WaziPOS")
    on_time = sum(1 for f in Facilities.objects.filter(q, status="REPAID").only("repaid_at", "due_date") if f.repaid_at and timezone.localtime(f.repaid_at).date() <= f.due_date)
    if on_time:
        add = min(20, on_time * 5)
        s += add
        reasons.append(f"+{add} for {on_time} loans repaid on time")
    if Facilities.objects.filter(q, status="OVERDUE").exists():
        s -= 40
        reasons.append("-40: a loan is overdue")
    s = max(0, min(100, s))
    limit = 100_000 if s >= 80 else 60_000 if s >= 65 else 30_000 if s >= 50 else 15_000 if s >= 40 else 5_000
    if adapters.SEGMENT[kind] in PEOPLE_SEGMENTS:
        limit //= 5
    return {"score": s, "limit": limit, "reasons": reasons}


def _outstanding(user, entity, lender=None):
    qs = Facilities.objects.filter(_borrower_q(user, entity), status__in=("ACTIVE", "OVERDUE"))
    if lender:
        qs = qs.filter(lender=lender)
    return sum((f.outstanding for f in qs), Decimal("0"))


# ------------------------------------------------------------------ who borrows


def _who(user, kind, order):
    """
    (borrower_user, borrower_entity, mode): mode "self" when the user is the buyer
    (or its admin), "consent" when the seller's staff offer credit to the buyer.
    """
    b_user, b_entity = adapters.buyer(kind, order)
    seller = adapters.seller(kind, order)
    if b_entity is not None:
        if _is_admin(user, b_entity):
            return user, b_entity, "self"
        if getattr(user, "entity_id", None) == getattr(seller, "id", None):
            return None, b_entity, "consent"
        raise CreditError("Not allowed", ["Only the buying business's admin can take credit for this order"])
    if b_user is not None and b_user.pk == user.pk:
        return user, None, "self"
    if getattr(user, "entity_id", None) == getattr(seller, "id", None):
        return b_user, None, "consent"
    raise CreditError("Not allowed", ["Only the customer can take credit for this order"])


def _consent_target(kind, order, b_user, b_entity, phone=None):
    """The person who must approve by SMS, and their phone."""
    from authentication.models import Users

    if b_entity is not None:
        from core.notify import entity_admins

        admins = [u for u in entity_admins(b_entity) if _phone(getattr(u, "phone", None)) and _is_admin(u, b_entity)]
        if not admins:
            raise CreditError("Can't ask for consent", [f"{b_entity.title} has no admin with a phone number on WaziPOS"])
        return admins[0], _phone(admins[0].phone)
    if b_user is not None and _phone(getattr(b_user, "phone", None)):
        return b_user, _phone(b_user.phone)
    p = _phone(phone or adapters.buyer_phone(kind, order))
    if not p:
        raise CreditError("Check the details", ["Enter the customer's phone number"])
    local = "0" + p[3:] if p.startswith("254") else p
    u = Users.objects.filter(Q(phone=p) | Q(phone=local) | Q(phone=f"+{p}")).first()
    if not u:
        raise CreditError("Customer not on WaziPOS", ["WaziPOS Credit is for registered customers — ask them to join WaziPOS with this number first"])
    return u, p


# ------------------------------------------------------------------ offers


def _lender_wallet(lender):
    from payments.models import PayoutAccounts

    acct = PayoutAccounts.objects.filter(entity=lender.entity, is_active="true", account_type="WALLET").order_by("-updated").first()
    return acct.account_number if acct else None


def offers(user, data):
    kind = str(data.get("order_kind") or "")
    try:
        order = adapters.get_order(kind, data.get("order_id"))
        due = adapters.amount_due(kind, order)
    except adapters.AdapterError as e:
        raise CreditError("Not available", [str(e)])
    if due <= 0:
        return {"eligible": False, "reason": "This order is already paid"}
    existing = Facilities.objects.filter(order_kind=kind, order_id=str(order.pk)).first()
    if existing:
        return {"eligible": False, "reason": f"Already financed by {existing.lender.display_name}", "facility": facility_out(existing)}
    b_user, b_entity, mode = _who(user, kind, order)
    segment = adapters.SEGMENT[kind]
    known = b_user is not None or b_entity is not None
    # A walk-in the seller's staff offer credit to: a neutral new-customer score until they consent.
    sc = score(kind, b_user, b_entity) if known else {"score": 40, "limit": 3_000, "reasons": ["New customer — limit grows as they repay"]}
    exposure = (lambda lender=None: _outstanding(b_user, b_entity, lender)) if known else (lambda lender=None: Decimal("0"))
    room = Decimal(str(sc["limit"])) - exposure()
    lenders = []
    for lender in LenderProfiles.objects.filter(status="ACTIVE").select_related("entity"):
        if segment not in (lender.segments or []) or sc["score"] < lender.min_score:
            continue
        if due < lender.min_amount or due > lender.max_amount or due > lender.float_balance:
            continue
        if due > min(room, lender.max_exposure_per_borrower - exposure(lender)):
            continue
        if not _lender_wallet(lender):
            continue
        lenders.append({
            "lender_id": str(lender.id), "name": lender.display_name, "regulator": lender.get_regulator_display(),
            "licence": lender.licence_number, "terms": lender.terms, "quotes": [cost_of_credit(lender, due, t) for t in TENORS],
        })
    lenders.sort(key=lambda l: l["quotes"][0]["total"])
    reason = None
    if not lenders:
        reason = "No lender can cover this order right now" if room >= due else f"Your WaziPOS Credit limit is {kes(sc['limit'])} — repay current loans or order less"
    return {
        "eligible": bool(lenders), "reason": reason, "amount": float(due), "segment": segment, "mode": mode,
        "borrower": {"name": (b_entity.title if b_entity else (f"{b_user.first_name} {b_user.last_name}".strip() if b_user else None))},
        "score": sc, "available_limit": float(max(room, Decimal("0"))), "lenders": lenders,
    }


# ------------------------------------------------------------------ consent (seller's staff)


def _hash(code, consent_id):
    return hashlib.sha256(f"{consent_id}:{code}".encode()).hexdigest()


def request_consent(user, data):
    kind = str(data.get("order_kind") or "")
    try:
        order = adapters.get_order(kind, data.get("order_id"))
        due = adapters.amount_due(kind, order)
    except adapters.AdapterError as e:
        raise CreditError("Not available", [str(e)])
    b_user, b_entity, mode = _who(user, kind, order)
    if mode != "consent":
        raise CreditError("Not needed", ["You're the buyer — accept the terms in the app instead"])
    lender = LenderProfiles.objects.filter(id=data.get("lender_id"), status="ACTIVE").first()
    if not lender:
        raise CreditError("Check the details", ["Pick a lender"])
    tenor = int(data.get("tenor") or 0)
    quote = cost_of_credit(lender, due, tenor)
    person, phone = _consent_target(kind, order, b_user, b_entity, data.get("phone"))
    code = f"{secrets.randbelow(10**6):06d}"
    c = CreditConsents.objects.create(
        code_hash="", borrower_user=person, borrower_entity=b_entity, lender=lender, order_kind=kind, order_id=str(order.pk),
        tenor_days=tenor, principal=_q(due), total_due=_q(quote["total"]), phone=phone, requested_by=user,
        expires_at=timezone.now() + timedelta(minutes=CONSENT_MINUTES),
    )
    c.code_hash = _hash(code, c.id)
    c.save(update_fields=["code_hash"])
    seller = adapters.seller(kind, order)
    text = (
        f"WaziPOS Credit: {lender.display_name} will pay {kes(due)} to {seller.title} for "
        f"{'your business ' + b_entity.title if b_entity else 'you'}. You repay {kes(quote['total'])} by "
        f"{date.fromisoformat(quote['due_date']):%d %b} (APR {quote['apr']:.0f}%). "
        f"Code {code} - give it only to accept. Expires in {CONSENT_MINUTES} min."
    )
    try:
        from core.utils import send_sms

        send_sms(phone, text)
    except Exception as e:
        log.warning("consent SMS failed: %s", e)
        raise CreditError("SMS not sent", ["The consent code couldn't be sent — try again"])
    return {"consent_id": str(c.id), "phone": _mask(phone), "expires_in": CONSENT_MINUTES * 60}


def _use_consent(data, kind, order, lender, tenor):
    c = CreditConsents.objects.select_for_update().filter(id=data.get("consent_id"), order_kind=kind, order_id=str(order.pk), used_at__isnull=True).first()
    if not c:
        raise CreditError("Consent needed", ["Send the customer a consent code first"])
    if c.expires_at < timezone.now():
        raise CreditError("Code expired", ["The code has expired — send a new one"])
    if c.lender_id != lender.id or c.tenor_days != tenor:
        raise CreditError("Terms changed", ["The lender or the days changed — send a new code"])
    if c.attempts >= 5:
        raise CreditError("Too many tries", ["Send a new code"])
    if _hash(str(data.get("consent_code") or "").strip(), c.id) != c.code_hash:
        c.attempts += 1
        c.save(update_fields=["attempts"])
        raise CreditError("Wrong code", [f"That code isn't right ({5 - c.attempts} tries left)"])
    c.used_at = timezone.now()
    c.save(update_fields=["used_at"])
    return c


# ------------------------------------------------------------------ borrow (instant)


def borrow(user, data):
    kind = str(data.get("order_kind") or "")
    tenor = int(data.get("tenor") or 0)
    if not data.get("accept_terms"):
        raise CreditError("Check the details", ["Accept the loan terms to continue"])
    try:
        with transaction.atomic():
            try:
                order = adapters.get_order(kind, data.get("order_id"))
            except adapters.AdapterError as e:
                raise CreditError("Not available", [str(e)])
            order = type(order).objects.select_for_update().get(pk=order.pk)
            due = adapters.amount_due(kind, order)
            if due <= 0:
                raise CreditError("Already paid", ["This order is already paid"])
            if Facilities.objects.filter(order_kind=kind, order_id=str(order.pk)).exists():
                raise CreditError("Already financed", ["This order already has a WaziPOS Credit loan"])
            lender = LenderProfiles.objects.select_for_update().filter(id=data.get("lender_id"), status="ACTIVE").first()
            if not lender:
                raise CreditError("Check the details", ["That lender isn't lending right now"])
            wallet = _lender_wallet(lender)
            if not wallet:
                raise CreditError("Not available", [f"{lender.display_name} can't receive repayments yet"])
            b_user, b_entity, mode = _who(user, kind, order)
            consent = None
            if mode == "consent":
                consent = _use_consent(data, kind, order, lender, tenor)
                b_user = consent.borrower_user
            segment = adapters.SEGMENT[kind]
            sc = score(kind, b_user, b_entity)
            problems = []
            if segment not in (lender.segments or []):
                problems.append(f"{lender.display_name} doesn't finance this kind of order")
            if sc["score"] < lender.min_score:
                problems.append(f"WaziScore {sc['score']} is below {lender.display_name}'s minimum of {lender.min_score}")
            if due < lender.min_amount or due > lender.max_amount:
                problems.append(f"{lender.display_name} lends {kes(lender.min_amount)} to {kes(lender.max_amount)}")
            if due > lender.float_balance:
                problems.append(f"{lender.display_name} can't cover {kes(due)} right now")
            if _outstanding(b_user, b_entity) + due > Decimal(str(sc["limit"])):
                problems.append(f"That would go over the credit limit of {kes(sc['limit'])}")
            if _outstanding(b_user, b_entity, lender) + due > lender.max_exposure_per_borrower:
                problems.append(f"That would go over what {lender.display_name} lends to one borrower")
            if problems:
                raise CreditError("Not approved", problems)

            q = cost_of_credit(lender, due, tenor)
            now = timezone.now()
            f = Facilities.objects.create(
                reference=_code("WCR"), lender=lender, segment=segment, borrower_user=b_user, borrower_entity=b_entity,
                seller=adapters.seller(kind, order), order_kind=kind, order_id=str(order.pk), order_reference=adapters.reference(order),
                principal=_q(due), interest=_q(q["interest"]), admin_fee=_q(q["admin_fee"]), excise=_q(q["excise"]),
                total_due=_q(q["total"]), tenor_days=tenor, apr=_q(q["apr"]), disbursed_at=now, due_date=timezone.localdate() + timedelta(days=tenor),
                consent_via="OTP" if consent else "APP", consent_phone=consent.phone if consent else _phone(getattr(b_user, "phone", None)), initiated_by=user,
            )
            LenderProfiles.objects.filter(pk=lender.pk).update(float_balance=F("float_balance") - f.principal, total_disbursed=F("total_disbursed") + f.principal)
            FloatMovements.objects.create(lender=lender, kind="DISBURSE", amount=f.principal, status="SUCCESS", reference=f.reference, facility=f, note=f"Order {f.order_reference}"[:200], by=user)
            adapters.settle(kind, order, f, user)
    except IntegrityError:
        raise CreditError("Already financed", ["This order already has a WaziPOS Credit loan"])
    _notify_disbursed(f)
    return facility_out(f)


# ------------------------------------------------------------------ repay (to the lender's wallet)


def _my_facility(user, facility_id):
    f = Facilities.objects.select_related("lender", "borrower_entity", "seller").filter(id=facility_id).first()
    if not f:
        raise CreditError("Not found", ["That loan doesn't exist"])
    mine = f.borrower_user_id == user.pk or (f.borrower_entity_id and _is_admin(user, f.borrower_entity))
    if not mine:
        raise CreditError("Not allowed", ["This isn't your loan"])
    return f


def repay(user, data, source="APP", facility=None):
    from payments.utils.system_till import push_to_account

    f = facility or _my_facility(user, data.get("facility_id"))
    if f.status not in ("ACTIVE", "OVERDUE", "DEFAULTED"):
        raise CreditError("Nothing to repay", [f"This loan is {f.get_status_display().lower()}"])
    owed = _whole(f.outstanding)
    raw = data.get("amount")
    amount = _whole(raw) if raw not in (None, "") else owed
    if amount <= 0 or amount > owed:
        raise CreditError("Check the details", [f"Repay between KES 1 and {kes(owed)}"])
    phone = _phone(data.get("phone") or getattr(user, "phone", None) or f.consent_phone)
    if not phone or len(phone) < 11:
        raise CreditError("Check the details", ["Enter the M-Pesa or Airtel Money number to pay from"])
    wallet = _lender_wallet(f.lender)
    if not wallet:
        raise CreditError("Not available", [f"{f.lender.display_name} hasn't set up its repayment wallet — contact them"])
    if Repayments.objects.filter(facility=f, status="PENDING", created__gte=timezone.now() - timedelta(minutes=3)).exists():
        raise CreditError("Prompt already sent", ["Check your phone — a payment prompt was just sent"])
    ref = _code("RP")
    errors, result, _telco = push_to_account(wallet, ref, int(amount), phone, description=f"Loan {f.reference} {f.lender.display_name}"[:60])
    if errors:
        raise CreditError("Prompt not sent", errors)
    r = Repayments.objects.create(facility=f, amount=amount, phone=phone, reference=ref, psp_reference=str((result or {}).get("ref") or ""), lender_account=wallet, source=source, payer=user)
    return repayment_out(r)


def _follow_repayment(r):
    from payments.utils.system_till import fetch_transaction

    if r.status != "PENDING":
        return r
    tx = fetch_transaction(r.reference)
    status = (tx or {}).get("status", "")
    if status == "SUCCESS":
        with transaction.atomic():
            r = Repayments.objects.select_for_update().get(pk=r.pk)
            if r.status != "PENDING":
                return r
            r.status, r.paid_at = "SUCCESS", timezone.now()
            r.save(update_fields=["status", "paid_at", "updated"])
            f = Facilities.objects.select_for_update().get(pk=r.facility_id)
            f.amount_repaid = _q(f.amount_repaid + r.amount)
            if f.amount_repaid >= f.total_due:
                f.status, f.repaid_at = "REPAID", timezone.now()
            elif f.status == "DEFAULTED":
                pass
            f.save(update_fields=["amount_repaid", "status", "repaid_at", "updated"])
        _notify_repaid(f, r)
    elif status in ("FAILED", "CANCELLED") or (not tx and timezone.now() - r.created > timedelta(minutes=30)):
        Repayments.objects.filter(pk=r.pk, status="PENDING").update(status="FAILED", updated=timezone.now())
        r.refresh_from_db()
    return r


def refresh_repayment(user, data):
    r = Repayments.objects.select_related("facility").filter(id=data.get("repayment_id")).first()
    if not r:
        raise CreditError("Not found", ["That repayment doesn't exist"])
    _my_facility(user, r.facility_id)
    return repayment_out(_follow_repayment(r))


def reconcile():
    n = 0
    for r in Repayments.objects.filter(status="PENDING")[:300]:
        try:
            _follow_repayment(r)
            n += 1
        except Exception as e:
            log.warning("repayment %s check failed: %s", r.pk, e)
    for m in FloatMovements.objects.filter(status="PENDING", kind="TOPUP")[:100]:
        try:
            _follow_topup(m)
        except Exception as e:
            log.warning("float top-up %s check failed: %s", m.pk, e)
    return n


# ------------------------------------------------------------------ borrower views


def my_facilities(user):
    from authentication.models import Entities

    admin_of = [e for e in Entities.objects.filter(credit_facilities__isnull=False).distinct() if _is_admin(user, e)]
    qs = Facilities.objects.select_related("lender", "seller", "borrower_entity").filter(Q(borrower_user=user, borrower_entity__isnull=True) | Q(borrower_entity__in=admin_of)).order_by("-created")[:200]
    return [facility_out(f) for f in qs]


def facility_out(f, lender_view=False):
    today = timezone.localdate()
    out = {
        "id": str(f.id), "reference": f.reference, "status": f.status, "segment": f.segment,
        "lender": {"id": str(f.lender_id), "name": f.lender.display_name},
        "seller": f.seller.title if f.seller_id else None, "order_kind": f.order_kind, "order_id": f.order_id, "order_reference": f.order_reference,
        "borrower": f.borrower_entity.title if f.borrower_entity_id else (f"{f.borrower_user.first_name} {f.borrower_user.last_name}".strip() or f.borrower_user.email),
        "principal": float(f.principal), "interest": float(f.interest), "admin_fee": float(f.admin_fee), "excise": float(f.excise),
        "late_fees": float(f.late_fees), "total_due": float(f.total_due), "repaid": float(f.amount_repaid), "outstanding": float(f.outstanding),
        "tenor_days": f.tenor_days, "apr": float(f.apr), "disbursed_at": f.disbursed_at.isoformat(), "due_date": f.due_date.isoformat(),
        "days_to_due": (f.due_date - today).days, "repaid_at": f.repaid_at.isoformat() if f.repaid_at else None,
        "repayments": [repayment_out(r) for r in f.repayments.all()[:20]],
    }
    if lender_view:
        out["borrower_phone"] = f.consent_phone
        out["consent_via"] = f.consent_via
    return out


def repayment_out(r):
    return {"id": str(r.id), "amount": float(r.amount), "status": r.status, "reference": r.reference, "source": r.source, "phone": _mask(r.phone), "paid_at": r.paid_at.isoformat() if r.paid_at else None, "created": r.created.isoformat()}


# ------------------------------------------------------------------ lenders


def _my_lender_entity(user):
    e = getattr(user, "entity", None)
    if not e or e.entity_type not in LENDER_TYPES:
        raise CreditError("Not a lender", ["Sign in to your bank or facilitator business to lend on WaziPOS"])
    if not _is_admin(user, e):
        raise CreditError("Not allowed", [f"Only {e.title}'s admin can manage lending"])
    return e


def lender_profile_out(p):
    return {
        "id": str(p.id), "status": p.status, "display_name": p.display_name, "regulator": p.regulator, "licence_number": p.licence_number,
        "segments": p.segments, "rate_7": float(p.rate_7), "rate_14": float(p.rate_14), "rate_28": float(p.rate_28),
        "admin_fee_pct": float(p.admin_fee_pct), "admin_fee_min": float(p.admin_fee_min), "excise_pct": float(p.excise_pct),
        "late_fee_pct_week": float(p.late_fee_pct_week), "grace_days": p.grace_days, "min_amount": float(p.min_amount),
        "max_amount": float(p.max_amount), "max_exposure_per_borrower": float(p.max_exposure_per_borrower), "min_score": p.min_score,
        "auto_collect": p.auto_collect, "terms": p.terms, "float_balance": float(p.float_balance), "total_disbursed": float(p.total_disbursed),
        "wallet": _lender_wallet(p), "entity": {"id": str(p.entity_id), "title": p.entity.title, "type": p.entity.entity_type},
        "example": cost_of_credit(p, 10_000, 14),
    }


def my_lender(user):
    e = _my_lender_entity(user)
    p = LenderProfiles.objects.filter(entity=e).first()
    return {"profile": lender_profile_out(p) if p else None, "entity": {"id": str(e.id), "title": e.title, "type": e.entity_type}, "has_wallet": bool(p and _lender_wallet(p)) or bool(_wallet_for_entity(e))}


def _wallet_for_entity(entity):
    from payments.models import PayoutAccounts

    return PayoutAccounts.objects.filter(entity=entity, is_active="true", account_type="WALLET").exists()


def _dec(data, key, lo, hi, label):
    raw = data.get(key)
    if raw in (None, ""):
        return None
    try:
        v = Decimal(str(raw))
    except Exception:
        raise CreditError("Check the details", [f"{label} must be a number"])
    if v < lo or v > hi:
        raise CreditError("Check the details", [f"{label} must be between {lo} and {hi}"])
    return v


def save_lender(user, data):
    e = _my_lender_entity(user)
    p = LenderProfiles.objects.filter(entity=e).first() or LenderProfiles(entity=e, display_name=e.title)
    name = str(data.get("display_name") or p.display_name or e.title).strip()[:120]
    licence = str(data.get("licence_number") or p.licence_number or "").strip()[:80]
    if not licence:
        raise CreditError("Check the details", ["Enter your licence number (CBK or SASRA)"])
    regulator = str(data.get("regulator") or p.regulator or "CBK_DCP")
    if regulator not in dict(LenderProfiles.REGULATORS):
        raise CreditError("Check the details", ["Pick your regulator"])
    segments = data.get("segments")
    if segments is not None:
        segments = [s for s in segments if s in SEGMENT_CODES]
        if not segments:
            raise CreditError("Check the details", ["Pick at least one kind of order to finance"])
        p.segments = segments
    p.display_name, p.licence_number, p.regulator = name, licence, regulator
    limits = {
        "rate_7": (0, 15, "7-day interest %"), "rate_14": (0, 20, "14-day interest %"), "rate_28": (0, 30, "28-day interest %"),
        "admin_fee_pct": (0, 10, "Admin fee %"), "admin_fee_min": (0, 2000, "Minimum admin fee"), "excise_pct": (0, 30, "Excise duty %"),
        "late_fee_pct_week": (0, 5, "Late fee % a week"), "min_amount": (100, 1_000_000, "Smallest loan"), "max_amount": (100, 5_000_000, "Largest loan"),
        "max_exposure_per_borrower": (100, 10_000_000, "Most per borrower"),
    }
    for key, (lo, hi, label) in limits.items():
        v = _dec(data, key, Decimal(lo), Decimal(hi), label)
        if v is not None:
            setattr(p, key, v)
    if data.get("grace_days") not in (None, ""):
        p.grace_days = int(_dec(data, "grace_days", Decimal(0), Decimal(14), "Grace days"))
    if data.get("min_score") not in (None, ""):
        p.min_score = int(_dec(data, "min_score", Decimal(0), Decimal(100), "Minimum WaziScore"))
    if "auto_collect" in data:
        p.auto_collect = str(data.get("auto_collect")).lower() in ("1", "true", "yes", "on")
    if "terms" in data:
        p.terms = str(data.get("terms") or "").strip()[:4000] or None
    if p.min_amount > p.max_amount:
        raise CreditError("Check the details", ["The smallest loan can't be more than the largest"])
    if not (p.rate_7 <= p.rate_14 <= p.rate_28):
        raise CreditError("Check the details", ["Longer loans should cost the same or more: 7-day ≤ 14-day ≤ 28-day"])
    want = str(data.get("status") or "").upper()
    if want in ("ACTIVE", "PAUSED") and p.pk and p.status in ("ACTIVE", "PAUSED"):
        if want == "ACTIVE" and not _lender_wallet(p):
            raise CreditError("Wallet needed", ["Add a JamboPay WALLET payout account — repayments go straight there"])
        p.status = want
    p.save()
    if not p.approved_at:
        _tell_desk("Lender waiting for approval", [f"{p.display_name} ({p.get_regulator_display()} licence {p.licence_number}) set up WaziPOS Credit."])
    return lender_profile_out(p)


def lender_book(user, data):
    e = _my_lender_entity(user)
    p = LenderProfiles.objects.filter(entity=e).first()
    if not p:
        raise CreditError("Set up first", ["Set up your lending profile first"])
    qs = Facilities.objects.select_related("lender", "seller", "borrower_entity", "borrower_user").filter(lender=p)
    status = str(data.get("status") or "").upper()
    rows = qs.filter(status=status) if status else qs
    today = timezone.localdate()
    live = qs.filter(status__in=("ACTIVE", "OVERDUE"))
    outstanding = sum((f.outstanding for f in live), Decimal("0"))
    par30 = sum((f.outstanding for f in live.filter(due_date__lt=today - timedelta(days=30))), Decimal("0"))
    collected = Repayments.objects.filter(facility__lender=p, status="SUCCESS").aggregate(t=Sum("amount"))["t"] or 0
    return {
        "profile": lender_profile_out(p),
        "stats": {
            "loans": qs.count(), "active": live.count(), "overdue": qs.filter(status="OVERDUE").count(), "defaulted": qs.filter(status="DEFAULTED").count(),
            "disbursed": float(p.total_disbursed), "outstanding": float(outstanding), "collected": float(collected),
            "due_this_week": float(sum((f.outstanding for f in live.filter(due_date__lte=today + timedelta(days=7))), Decimal("0"))),
            "par30_pct": float(_q(par30 / outstanding * 100)) if outstanding else 0.0,
            "income": float(sum((f.total_due - f.principal for f in qs.filter(status="REPAID")), Decimal("0"))),
        },
        "facilities": [facility_out(f, lender_view=True) for f in rows.order_by("due_date" if status in ("ACTIVE", "OVERDUE") else "-created")[:300]],
        "float": [{"id": str(m.id), "kind": m.kind, "amount": float(m.amount), "status": m.status, "reference": m.reference, "note": m.note, "created": m.created.isoformat()} for m in p.float_movements.all()[:50]],
    }


def topup_float(user, data):
    from payments.utils.system_till import push_to_system_till

    e = _my_lender_entity(user)
    p = LenderProfiles.objects.filter(entity=e).first()
    if not p or p.status == "SUSPENDED":
        raise CreditError("Not allowed", ["Your lending profile isn't active"])
    amount = _dec(data, "amount", Decimal(100), Decimal(500_000), "Top-up amount")
    if amount is None:
        raise CreditError("Check the details", ["Enter how much to add"])
    phone = _phone(data.get("phone") or getattr(user, "phone", None))
    if not phone or len(phone) < 11:
        raise CreditError("Check the details", ["Enter the M-Pesa / Airtel Money number to pay from"])
    ref = _code("FL")
    errors, _res, _telco = push_to_system_till(ref, int(_whole(amount)), phone, description=f"Lending float {p.display_name}"[:60])
    if errors:
        raise CreditError("Prompt not sent", errors)
    m = FloatMovements.objects.create(lender=p, kind="TOPUP", amount=_whole(amount), reference=ref, phone=phone, by=user, note="Mobile money top-up")
    return {"id": str(m.id), "reference": ref, "amount": float(m.amount), "status": m.status}


def _follow_topup(m):
    from payments.utils.system_till import fetch_transaction

    tx = fetch_transaction(m.reference)
    status = (tx or {}).get("status", "")
    if status == "SUCCESS":
        with transaction.atomic():
            m = FloatMovements.objects.select_for_update().get(pk=m.pk)
            if m.status == "PENDING":
                m.status = "SUCCESS"
                m.save(update_fields=["status", "updated"])
                LenderProfiles.objects.filter(pk=m.lender_id).update(float_balance=F("float_balance") + m.amount)
    elif status in ("FAILED", "CANCELLED") or (not tx and timezone.now() - m.created > timedelta(minutes=30)):
        FloatMovements.objects.filter(pk=m.pk, status="PENDING").update(status="FAILED", updated=timezone.now())


def refresh_topup(user, data):
    _my_lender_entity(user)
    m = FloatMovements.objects.filter(id=data.get("movement_id"), kind="TOPUP").first()
    if not m:
        raise CreditError("Not found", ["That top-up doesn't exist"])
    _follow_topup(m)
    m.refresh_from_db()
    return {"id": str(m.id), "status": m.status, "amount": float(m.amount)}


def withdraw_float(user, data):
    """Unused float back to the lender's payout account (via the payout ledger)."""
    from payments.models import OrderPayouts, PayoutAccounts

    e = _my_lender_entity(user)
    amount = _dec(data, "amount", Decimal(100), Decimal(10_000_000), "Amount")
    if amount is None:
        raise CreditError("Check the details", ["Enter how much to withdraw"])
    account = PayoutAccounts.objects.filter(entity=e, is_active="true").order_by("-updated").first()
    if not account:
        raise CreditError("No payout account", ["Add a payout account to receive your float"])
    with transaction.atomic():
        p = LenderProfiles.objects.select_for_update().filter(entity=e).first()
        if not p or amount > p.float_balance:
            raise CreditError("Not enough float", [f"You can withdraw up to {kes(p.float_balance if p else 0)}"])
        p.float_balance -= amount
        p.save(update_fields=["float_balance", "updated"])
        m = FloatMovements.objects.create(lender=p, kind="WITHDRAW", amount=amount, reference=_code("FW"), by=user, note="Withdrawal to payout account")
        OrderPayouts.objects.create(
            payee_kind=OrderPayouts.PayeeKind.LENDER_FLOAT, order_kind="credit_float", order_id=str(m.id), order_reference=m.reference,
            seller=e, payee_entity=e, entity_account=account, gross_amount=amount, amount=amount, status=OrderPayouts.Status.DUE,
            note=f"Lending float withdrawal {m.reference}", due_at=timezone.now(),
        )
    from payments.utils.order_payouts import run_payouts

    transaction.on_commit(run_payouts)
    return {"id": str(m.id), "reference": m.reference, "amount": float(amount)}


def float_withdrawal_paid(row):
    """Payout ledger hook: the float withdrawal reached the lender."""
    FloatMovements.objects.filter(id=row.order_id, kind="WITHDRAW", status="PENDING").update(status="SUCCESS", updated=timezone.now())


# ------------------------------------------------------------------ platform admins


def desk_lenders(user):
    if not _platform_admin(user):
        raise CreditError("Not allowed", ["Only WaziPOS admins can do this"])
    return [lender_profile_out(p) for p in LenderProfiles.objects.select_related("entity").order_by("status", "display_name")]


def desk_decide_lender(user, data):
    if not _platform_admin(user):
        raise CreditError("Not allowed", ["Only WaziPOS admins can do this"])
    p = LenderProfiles.objects.select_related("entity").filter(id=data.get("lender_id")).first()
    if not p:
        raise CreditError("Not found", ["That lender doesn't exist"])
    decision = str(data.get("decision") or "").upper()
    if decision == "APPROVE":
        if not _lender_wallet(p):
            raise CreditError("Wallet needed", ["The lender must add a JamboPay WALLET payout account first"])
        p.status, p.approved_by, p.approved_at = "ACTIVE", user, timezone.now()
        msg = ("You can lend on WaziPOS", [f"{p.display_name} is approved for WaziPOS Credit.", "Top up your lending float to start paying traders' orders."])
    elif decision == "SUSPEND":
        p.status = "SUSPENDED"
        msg = ("WaziPOS Credit suspended", [f"Lending by {p.display_name} is paused by WaziPOS. Existing loans keep running."])
    else:
        raise CreditError("Check the details", ["Approve or suspend"])
    p.save()
    _tell_entity(p.entity, *msg, sms=False)
    return lender_profile_out(p)


# ------------------------------------------------------------------ daily: reminders, overdue, late fees, auto-collect


def daily():
    today = timezone.localdate()
    done = 0
    for f in Facilities.objects.select_related("lender", "lender__entity", "borrower_entity", "borrower_user", "seller").filter(status__in=("ACTIVE", "OVERDUE")):
        try:
            _daily_one(f, today)
            done += 1
        except Exception as e:
            log.warning("credit daily for %s failed: %s", f.reference, e)
    return done


def _daily_one(f, today):
    days = (f.due_date - today).days
    sent = set(f.reminders or [])
    changed = []

    def once(key, fn):
        if key not in sent:
            fn()
            sent.add(key)
            changed.append(key)

    owed = kes(f.outstanding)
    head = f"Loan {f.reference} ({f.lender.display_name})"
    if days == 3:
        once("D-3", lambda: _tell_borrower(f, "Repayment due in 3 days", [f"{head}: {owed} is due on {f.due_date:%a %d %b}.", "Repay any time in WaziPOS → Credit — it goes straight to your lender."], push=True))
    if days == 0:
        once("D0", lambda: _tell_borrower(f, "Repayment due today", [f"{head}: {owed} is due today.", "We'll send a payment prompt to your phone — enter your PIN to repay."], push=True, sms=True))
        if f.lender.auto_collect and f.auto_collect_sent_on != today and f.consent_phone:
            try:
                repay(f.borrower_user, {"phone": f.consent_phone}, source="AUTO", facility=f)
                Facilities.objects.filter(pk=f.pk).update(auto_collect_sent_on=today)
            except CreditError as e:
                log.info("auto-collect for %s skipped: %s", f.reference, e.errors)
    if days < 0:
        late = -days
        if f.status != "OVERDUE":
            f.status = "OVERDUE"
            changed.append("status")
            _tell_lender(f, "Loan overdue", [f"{head}: {f.borrower_entity.title if f.borrower_entity_id else 'the borrower'} owes {owed} since {f.due_date:%d %b}."])
        for d in (1, 3, 7, 14):
            if late >= d:
                once(f"D+{d}", lambda d=d: _tell_borrower(f, "Loan overdue", [f"{head}: {owed} was due {d} day(s) ago. Repay now in WaziPOS → Credit to avoid late fees and protect your WaziScore."], push=True, sms=True))
        # Late fee once a week after the grace days, capped (in duplum).
        if late > f.lender.grace_days and (not f.last_late_fee_on or (today - f.last_late_fee_on).days >= 7):
            charges = f.interest + f.admin_fee + f.excise + f.late_fees
            room = max(Decimal("0"), f.principal - charges)
            fee = min(room, _q(f.outstanding * Decimal(str(f.lender.late_fee_pct_week)) / 100))
            if fee > 0:
                f.late_fees = _q(f.late_fees + fee)
                f.total_due = _q(f.total_due + fee)
                changed.append("late")
            f.last_late_fee_on = today
            changed.append("late_on")
        if late >= DEFAULT_AFTER_DAYS and f.status != "DEFAULTED":
            f.status = "DEFAULTED"
            changed.append("status")
            _tell_lender(f, "Loan defaulted", [f"{head} is {late} days overdue with {owed} unpaid.", "Follow up with the borrower; WaziPOS has stopped further credit to them."], sms=True)
            _tell_borrower(f, "Loan defaulted", [f"{head} is {late} days overdue. Repay {owed} now in WaziPOS → Credit to restore your access to credit."], push=True, sms=True)
    if changed:
        f.reminders = sorted(sent)
        f.save(update_fields=["reminders", "status", "late_fees", "total_due", "last_late_fee_on", "updated"])


# ------------------------------------------------------------------ notices


def _tell_borrower(f, subject, lines, push=False, sms=False):
    """Business loans: the borrowing entity's admins. Personal loans: the borrower."""
    from core.notify import deliver_to_entity, deliver_to_users

    kw = dict(email=True, push=push, sms=sms, sms_text=f"WaziPOS Credit: {lines[0]}"[:300], data={"type": "credit", "facility": str(f.id)})
    try:
        if f.borrower_entity_id:
            deliver_to_entity(f.borrower_entity, subject, lines, **kw)
        else:
            deliver_to_users([f.borrower_user], subject, lines, **kw)
    except Exception as e:
        log.warning("borrower notice for %s failed: %s", f.reference, e)


def _tell_lender(f, subject, lines, sms=False):
    _tell_entity(f.lender.entity, subject, lines, sms=sms, data={"type": "credit_book", "facility": str(f.id)})


def _tell_entity(entity, subject, lines, sms=False, data=None):
    try:
        from core.notify import notify_entity

        notify_entity(entity, subject, lines, email=True, push=True, sms=sms, sms_text=f"WaziPOS Credit: {lines[0]}"[:300], data=data or {"type": "credit_book"})
    except Exception as e:
        log.warning("entity notice failed: %s", e)


def _tell_desk(subject, lines):
    try:
        from authentication.models import Users
        from core.notify import notify_users

        notify_users(list(Users.objects.filter(Q(is_staff=True) | Q(roles__value="Admin")).distinct()[:20]), subject, lines, email=True)
    except Exception as e:
        log.warning("desk notice failed: %s", e)


def _notify_disbursed(f):
    from core.notify import later

    fid = f.pk

    def build():
        x = Facilities.objects.select_related("lender", "lender__entity", "borrower_entity", "borrower_user", "seller").get(pk=fid)
        terms = [
            f"{x.lender.display_name} paid {kes(x.principal)} to {x.seller.title} for order {x.order_reference}.",
            f"Repay {kes(x.total_due)} by {x.due_date:%a %d %b %Y} — interest {kes(x.interest)}, admin fee {kes(x.admin_fee)}, excise duty {kes(x.excise)} (APR {x.apr:.0f}%).",
            "Repay early or in parts any time in WaziPOS → Credit; every repayment goes straight to your lender.",
        ]
        _tell_borrower(x, f"Loan {x.reference}: order paid", terms, push=True, sms=True)
        from core.notify import deliver_to_entity

        deliver_to_entity(x.lender.entity, f"New loan {x.reference}", [f"{kes(x.principal)} to {x.borrower_entity.title if x.borrower_entity_id else 'a customer'} for an order at {x.seller.title}.", f"{kes(x.total_due)} due {x.due_date:%d %b %Y}.", f"Float left: {kes(x.lender.float_balance)}."], email=True, push=True)

    later(build)


def _notify_repaid(f, r):
    f = Facilities.objects.select_related("lender", "lender__entity", "borrower_entity", "borrower_user").get(pk=f.pk)
    full = f.status == "REPAID"
    _tell_borrower(f, "Repayment received" if not full else "Loan repaid", [f"{kes(r.amount)} received by {f.lender.display_name} for loan {f.reference}.", "Thank you — your loan is fully repaid and your WaziScore went up." if full else f"Still to pay: {kes(f.outstanding)} by {f.due_date:%d %b}."], push=True)
    _tell_lender(f, "Repayment received", [f"{kes(r.amount)} paid into your wallet for loan {f.reference}.", "Loan fully repaid." if full else f"Outstanding: {kes(f.outstanding)}."])
