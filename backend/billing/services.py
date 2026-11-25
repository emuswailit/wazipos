# billing/services.py — WaziPOS Tokens: wallet, metering, top-ups, the access gate.
#
# How a business is billed (see pricing.py for the numbers):
#   SETUP    signed up, waiting for WaziPOS to approve it: can set up (stock,
#            staff, payout account) and orders are recorded at 0 tokens.
#   TRIAL    the free first month, from approval: orders recorded at 0 tokens,
#            with what they would have cost.
#   LEGACY   an old monthly subscription is still running: orders covered.
#   TOKENS   pay per use from the wallet. A small overdraft keeps the till
#            working; past it (after a first top-up) the business must top up.
#
# Usage is metered from successful order payments (billing/signals.py), once per
# payment (idem_key), charged to the SELLING business.

from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Count, Sum
from django.utils import timezone

from billing import pricing
from billing.models import TokenLedger, TokenWallet

USAGE_KINDS = (TokenLedger.Kind.USAGE, TokenLedger.Kind.TRIAL, TokenLedger.Kind.COVERED)


class BillingError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = list(errors or [message])


# ---------------------------------------------------------------- helpers

def _now():
    return timezone.now()


def _month_start(now=None):
    now = timezone.localtime(now or _now())
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _s(x):
    return str(pricing.q(x))


def is_entity_admin(user, entity):
    if not user or not getattr(user, "is_authenticated", False) or not entity:
        return False
    if getattr(entity, "owner_id", None) == user.pk:
        return True
    return user.roles.filter(entity=entity, value=f"{entity.entity_type}SuperAdmin").exists()


def is_platform_admin(user):
    return bool(user and getattr(user, "is_authenticated", False) and (user.is_superuser or user.is_staff))


def wallet_for(entity, lock=False):
    w, _ = TokenWallet.objects.get_or_create(entity=entity, defaults={"low_balance_at": pricing.LOW_BALANCE_TOKENS})
    if lock:
        w = TokenWallet.objects.select_for_update().get(pk=w.pk)
    return w


def _subscription(entity, kind=None):
    from subscriptions.models import Subscription

    qs = Subscription.objects.filter(entity=entity, end_date__gt=_now())
    if kind:
        qs = qs.filter(type=kind)
    return qs.order_by("-end_date").first()


def approval_status(entity):
    """SETUP / PENDING / APPROVED / REJECTED, or None for businesses that never
    went through self sign-up (created by admins or agents)."""
    try:
        from onboarding.models import EntityApprovals

        row = EntityApprovals.objects.filter(entity=entity).only("status").first()
        return row.status if row else None
    except Exception:
        return None


def mode_of(entity, wallet=None):
    if getattr(entity, "entity_type", None) in pricing.BILLING_EXEMPT:
        return "EXEMPT"
    if _subscription(entity, "PAID"):
        return "LEGACY"
    wallet = wallet or wallet_for(entity)
    if wallet.trial_ends_at and wallet.trial_ends_at > _now():
        return "TRIAL"
    if _subscription(entity, "TRIAL"):  # agent-onboarded businesses get a trial row
        return "TRIAL"
    if approval_status(entity) in ("SETUP", "PENDING", "REJECTED"):
        return "SETUP"
    return "TOKENS"


def can_operate(entity):
    """The access gate (retail_permissions.EntitySubscriptionPermission). Returns (ok, reason)."""
    if entity is None:
        return False, "You are not working in any business"
    if getattr(entity, "is_active", True) is False:
        return False, f"{entity.title} has been deactivated by WaziPOS. Contact WaziPOS support."
    wallet = wallet_for(entity)
    m = mode_of(entity, wallet)
    if m in ("LEGACY", "TRIAL", "SETUP", "EXEMPT"):
        return True, ""
    if wallet.balance > 0:
        return True, ""
    if wallet.has_topped_up and wallet.balance > -pricing.OVERDRAFT_TOKENS:
        return True, ""
    if wallet.trial_ends_at:
        return False, f"{entity.title}'s free month has ended. Buy WaziPOS tokens to keep selling (Billing)."
    return False, f"{entity.title} has no WaziPOS tokens left. Top up from Billing to keep selling."


# ---------------------------------------------------------------- metering

def _month_usage(entity, now=None):
    rows = TokenLedger.objects.filter(entity=entity, kind__in=USAGE_KINDS, created__gte=_month_start(now))
    agg = rows.aggregate(charged=Sum("tokens"), listed=Sum("list_tokens"), value=Sum("order_value"))
    orders = rows.exclude(order_ref="").values("order_ref").distinct().count()
    return {
        "orders": orders,
        "charged": -(agg["charged"] or Decimal("0")),
        "listed": agg["listed"] or Decimal("0"),
        "value": agg["value"] or Decimal("0"),
    }


def meter(entity, meter_code, value, reference, order_ref="", note=""):
    """Record one successful order payment against the selling business. Idempotent.
    Never raises into the payment flow — returns the ledger row or None."""
    if entity is None or meter_code not in pricing.METERS:
        return None
    if entity.entity_type in pricing.BILLING_EXEMPT:
        return None  # not billed: nothing recorded, nothing charged
    key = f"USE:{meter_code}:{reference}"
    if TokenLedger.objects.filter(idem_key=key).exists():
        return None
    try:
        with transaction.atomic():
            wallet = wallet_for(entity, lock=True)
            m = mode_of(entity, wallet)
            usage = _month_usage(entity)
            first = not (order_ref and TokenLedger.objects.filter(entity=entity, meter=meter_code, order_ref=str(order_ref)).exists())
            listed = pricing.price(meter_code, value, usage["orders"], first)
            kind, charge = TokenLedger.Kind.USAGE, listed
            if m == "LEGACY":
                kind, charge, note = TokenLedger.Kind.COVERED, Decimal("0"), note or "Covered by your monthly subscription"
            elif m in ("TRIAL", "SETUP"):
                kind, charge, note = TokenLedger.Kind.TRIAL, Decimal("0"), note or ("Free month" if m == "TRIAL" else "Before approval")
            else:
                cap = pricing.monthly_cap(entity.entity_type)
                room = max(Decimal("0"), cap - usage["charged"])
                if room <= 0:
                    kind, charge, note = TokenLedger.Kind.COVERED, Decimal("0"), note or "Monthly ceiling reached: free for the rest of the month"
                elif charge > room:
                    charge = room
            wallet.balance = pricing.q(wallet.balance - charge)
            wallet.save(update_fields=["balance", "updated"])
            row = TokenLedger.objects.create(
                wallet=wallet, entity=entity, kind=kind, meter=meter_code, tokens=-charge, list_tokens=listed,
                balance_after=wallet.balance, order_value=pricing.q(value), order_ref=str(order_ref or "")[:64],
                reference=str(reference)[:120], idem_key=key, note=note[:255],
            )
    except IntegrityError:
        return None  # counted already by a parallel signal
    if row.kind == TokenLedger.Kind.USAGE:
        transaction.on_commit(lambda: _maybe_alert(wallet.pk))
    return row


def _maybe_alert(wallet_pk):
    """Low balance: email the admins (once a day). Empty: email + SMS — they must act."""
    from core.notify import deliver_to_entity, later

    w = TokenWallet.objects.select_related("entity").filter(pk=wallet_pk).first()
    if not w:
        return
    now = _now()
    day_ago = now - timedelta(hours=24)
    entity = w.entity
    if w.balance <= 0 and (w.last_empty_alert_at is None or w.last_empty_alert_at < day_ago):
        TokenWallet.objects.filter(pk=w.pk).update(last_empty_alert_at=now)
        sms = f"WaziPOS: {entity.title} is out of tokens. Top up in the app (Billing) to keep selling."
        later(lambda: deliver_to_entity(
            entity, f"{entity.title} is out of WaziPOS tokens",
            [f"Your balance is {_s(w.balance)} tokens.",
             f"Sales keep working until -{_s(pricing.OVERDRAFT_TOKENS)} tokens; then the till pauses until you top up.",
             "Open Billing on WaziPOS and buy a token pack by M-Pesa or Airtel Money."],
            sms=True, sms_text=sms, push=True, data={"type": "billing"},
        ))
    elif 0 < w.balance <= w.low_balance_at and (w.last_low_alert_at is None or w.last_low_alert_at < day_ago):
        TokenWallet.objects.filter(pk=w.pk).update(last_low_alert_at=now)
        later(lambda: deliver_to_entity(
            entity, f"{entity.title}: WaziPOS tokens running low",
            [f"You have {_s(w.balance)} tokens left.", "Top up from Billing before you run out — bigger packs carry bonus tokens."],
            push=True, data={"type": "billing"},
        ))


# ---------------------------------------------------------------- trial

def start_trial(entity, by=None, days=None):
    """Start the free month (on approval). Never restarts a trial already given."""
    days = int(days or pricing.TRIAL_DAYS)
    with transaction.atomic():
        w = wallet_for(entity, lock=True)
        if w.trial_started_at:
            return w
        now = _now()
        w.trial_started_at, w.trial_ends_at = now, now + timedelta(days=days)
        w.save(update_fields=["trial_started_at", "trial_ends_at", "updated"])
        if hasattr(entity, "offer_trial"):
            try:
                entity.offer_trial = "true"
                entity.trial_from, entity.trial_to = now, w.trial_ends_at
                entity.save(update_fields=["offer_trial", "trial_from", "trial_to"])
            except Exception:
                pass
    return w


def trial_daily():
    """Reminders: 5 days and 1 day before the free month ends, and on the day."""
    from core.notify import deliver_to_entity, later

    now = _now()
    soon = TokenWallet.objects.select_related("entity").filter(trial_ends_at__gt=now - timedelta(days=1), trial_ends_at__lte=now + timedelta(days=5))
    sent = 0
    for w in soon:
        left = (w.trial_ends_at - now).total_seconds() / 86400
        tag = "END" if left <= 0 else ("D1" if left <= 1.2 else ("D5" if left <= 5 else None))
        if not tag or tag in (w.trial_reminders or []):
            continue
        w.trial_reminders = list(w.trial_reminders or []) + [tag]
        w.save(update_fields=["trial_reminders", "updated"])
        entity = w.entity
        usage = _month_usage(entity)
        est = pricing.q(usage["listed"])
        lines = (
            [f"{entity.title}'s free month on WaziPOS has ended.", f"This month you processed {usage['orders']} orders — about {est} tokens (KES {est}) on pay-as-you-go.",
             "Buy a token pack in Billing to keep selling."]
            if tag == "END" else
            [f"{entity.title}'s free month ends in {'1 day' if tag == 'D1' else '5 days'}.",
             f"So far: {usage['orders']} orders, about {est} tokens (KES {est}) at pay-as-you-go prices.",
             "Top up in Billing any time — bigger packs carry bonus tokens."]
        )
        needs_action = tag == "END" and w.balance <= 0
        later(lambda e=entity, ls=lines, a=needs_action, t=tag: deliver_to_entity(
            e, f"{e.title}: free month {'ended' if t == 'END' else 'ending soon'}", ls, push=True, sms=a,
            sms_text=f"WaziPOS: {e.title}'s free month has ended. Buy tokens in the app (Billing) to keep selling." if a else None,
            data={"type": "billing"},
        ))
        sent += 1
    return sent


# ---------------------------------------------------------------- top-ups

def buy(user, data):
    from subscriptions.views import start_subscription_payment

    entity = getattr(user, "entity", None)
    if not entity:
        raise BillingError("No business", ["You are not working in any business"])
    if not is_entity_admin(user, entity):
        raise BillingError("Not allowed", ["Only the business's admins can buy tokens"])
    phone = str(data.get("phone") or "").strip()
    if not phone:
        raise BillingError("Check the details", ["Enter the M-Pesa / Airtel Money number to charge"])
    code = str(data.get("pack") or "").strip().upper()
    if code and code != "CUSTOM":
        p = pricing.pack(code)
        if not p:
            raise BillingError("Check the details", ["Pick a token pack"])
    else:
        try:
            kes = Decimal(str(data.get("amount")))
        except Exception:
            raise BillingError("Check the details", ["Enter how much to top up"])
        if kes < pricing.MIN_CUSTOM_KES or kes > pricing.MAX_CUSTOM_KES:
            raise BillingError("Check the details", [f"Top up between KES {pricing.MIN_CUSTOM_KES:,.0f} and KES {pricing.MAX_CUSTOM_KES:,.0f}"])
        p = pricing.custom_pack(kes.quantize(Decimal("1")))
    resp = start_subscription_payment(entity, user, phone, amount=p["kes"], purpose="TOKENS", tokens=p["tokens"])
    body = getattr(resp, "data", None) or {}
    if str(body.get("response_code")) != "0":
        msg = body.get("response_message") or "The payment prompt could not be sent"
        raise BillingError("Payment not started", [msg])
    pay = body.get("payment") or {}
    return {
        "payment_id": str(pay.get("payment_id")),
        "reference_number": pay.get("reference_number"),
        "kes": _s(p["kes"]),
        "tokens": _s(p["tokens"]),
        "bonus": _s(p["bonus"]),
        "pack": p["code"],
        "status": "PENDING",
    }


def refresh_topup(user, data):
    """The app polls this after the prompt; checks JamboPay too when it is slow."""
    from subscriptions.models import SubscriptionPayment

    entity = getattr(user, "entity", None)
    p = SubscriptionPayment.objects.filter(pk=data.get("payment_id"), entity=entity, purpose="TOKENS").first() if entity else None
    if not p:
        raise BillingError("Not found", ["That top-up does not exist"])
    if p.status == "PENDING" and (_now() - p.created).total_seconds() > 15:
        from payments.utils.system_till import fetch_transaction
        from subscriptions.tasks import create_subscription_from_payment

        tx = fetch_transaction(p.reference_number)
        st = (tx or {}).get("status")
        if st and st != "PENDING":
            p.status = st if st in ("SUCCESS", "FAILED", "CANCELLED") else "FAILED"
            p.description = str((tx or {}).get("description") or p.description or "")[:120]
            if (tx or {}).get("providerRef"):
                p.provider_reference_number = tx["providerRef"]
            p.save()
            if p.status == "SUCCESS":
                create_subscription_from_payment(p)
        elif (_now() - p.created).total_seconds() > 30 * 60:
            p.status, p.description = "FAILED", "Payment expired (timed out waiting for PIN)."
            p.save()
    w = wallet_for(entity)
    return {"payment_id": str(p.pk), "status": p.status, "description": p.description, "tokens": _s(p.tokens), "kes": _s(p.amount), "balance": _s(w.balance)}


def credit_topup(payment):
    """A token top-up was paid: credit the wallet (once) and pay the agent's commission."""
    tokens = Decimal(str(getattr(payment, "tokens", 0) or 0)) or Decimal(str(payment.amount or 0))
    paid = pricing.q(payment.amount)
    bonus = max(Decimal("0"), pricing.q(tokens - paid / pricing.TOKEN_KES))
    base = pricing.q(tokens - bonus)
    try:
        with transaction.atomic():
            if TokenLedger.objects.filter(idem_key=f"TOPUP:{payment.pk}").exists():
                return None
            w = wallet_for(payment.entity, lock=True)
            w.balance = pricing.q(w.balance + base)
            TokenLedger.objects.create(
                wallet=w, entity=payment.entity, kind=TokenLedger.Kind.TOPUP, tokens=base, balance_after=w.balance,
                reference=payment.reference_number or "", idem_key=f"TOPUP:{payment.pk}", payment=payment,
                created_by=payment.owner, note=f"Paid KES {paid:,.0f}",
            )
            if bonus > 0:
                w.balance = pricing.q(w.balance + bonus)
                TokenLedger.objects.create(
                    wallet=w, entity=payment.entity, kind=TokenLedger.Kind.BONUS, tokens=bonus, balance_after=w.balance,
                    reference=payment.reference_number or "", idem_key=f"BONUS:{payment.pk}", payment=payment, note="Pack bonus",
                )
            w.has_topped_up = True
            w.last_empty_alert_at = None
            w.last_low_alert_at = None
            w.save()
    except IntegrityError:
        return None
    try:
        from authentication.utils.agents import record_subscription_commission

        record_subscription_commission(payment)
    except Exception:
        pass
    return w


def adjust(user, data):
    """WaziPOS admins: gift or correct tokens {entity, tokens (+/-), note}."""
    from authentication.models import Entities

    if not is_platform_admin(user):
        raise BillingError("Not allowed", ["Only WaziPOS admins can adjust tokens"])
    entity = Entities.objects.filter(pk=data.get("entity")).first()
    if not entity:
        raise BillingError("Not found", ["Pick the business"])
    try:
        tokens = pricing.q(data.get("tokens"))
    except Exception:
        raise BillingError("Check the details", ["Enter the number of tokens"])
    note = str(data.get("note") or "").strip()
    if tokens == 0 or not note:
        raise BillingError("Check the details", ["Enter the tokens (+ or -) and a reason"])
    with transaction.atomic():
        w = wallet_for(entity, lock=True)
        w.balance = pricing.q(w.balance + tokens)
        w.save(update_fields=["balance", "updated"])
        TokenLedger.objects.create(wallet=w, entity=entity, kind=TokenLedger.Kind.ADJUST, tokens=tokens, balance_after=w.balance, note=note[:255], created_by=user)
    return _wallet_row(w)


TRIAL_GIFT_MAX = Decimal("100")  # trial tokens a WaziPOS admin may give one business, in total
TRIAL_GIFT_REF = "TRIAL_GIFT"


def _trial_gifted(entity):
    return TokenLedger.objects.filter(entity=entity, kind=TokenLedger.Kind.BONUS, reference=TRIAL_GIFT_REF).aggregate(t=Sum("tokens"))["t"] or Decimal("0")


def trial_gift_status(user, data):
    """Super users: how many trial tokens a business has had and can still get {entity}."""
    from authentication.models import Entities

    if not _trial_admin(user):
        raise BillingError("Not allowed", ["Only system super users can send trial tokens"])
    entity = Entities.objects.filter(pk=data.get("entity")).first()
    if not entity:
        raise BillingError("Not found", ["Pick the business"])
    given = pricing.q(_trial_gifted(entity))
    w = TokenWallet.objects.filter(entity=entity).first()
    return {"entity": str(entity.id), "given": _s(given), "left": _s(max(TRIAL_GIFT_MAX - given, 0)),
            "max": _s(TRIAL_GIFT_MAX), "balance": _s(w.balance if w else 0)}


def _trial_admin(user):
    """Trial tokens: system super users only (not staff or the "Admin" role)."""
    return bool(user and getattr(user, "is_authenticated", False) and user.is_superuser)


def send_trial_tokens(user, data):
    """Super users: give a business tokens to try WaziPOS {entity, tokens, note?}.
    At most TRIAL_GIFT_MAX per business across all gifts."""
    from authentication.models import Entities

    if not _trial_admin(user):
        raise BillingError("Not allowed", ["Only system super users can send trial tokens"])
    entity = Entities.objects.filter(pk=data.get("entity")).first()
    if not entity:
        raise BillingError("Not found", ["Pick the business"])
    try:
        tokens = pricing.q(data.get("tokens"))
    except Exception:
        raise BillingError("Check the details", ["Enter the number of tokens"])
    if tokens <= 0:
        raise BillingError("Check the details", ["Enter how many tokens to send (1 to 100)"])
    note = str(data.get("note") or "").strip() or "Trial tokens from WaziPOS"
    with transaction.atomic():
        w = wallet_for(entity, lock=True)  # the lock also serialises concurrent gifts
        left = TRIAL_GIFT_MAX - _trial_gifted(entity)
        if left <= 0:
            raise BillingError("Limit reached", [f"{entity.title} has already had the {TRIAL_GIFT_MAX:.0f} trial tokens allowed"])
        if tokens > left:
            raise BillingError("Too many tokens", [f"{entity.title} can get at most {_s(left)} more trial tokens (limit {TRIAL_GIFT_MAX:.0f})"])
        w.balance = pricing.q(w.balance + tokens)
        w.save(update_fields=["balance", "updated"])
        TokenLedger.objects.create(wallet=w, entity=entity, kind=TokenLedger.Kind.BONUS, tokens=tokens, balance_after=w.balance,
                                   reference=TRIAL_GIFT_REF, note=note[:255], created_by=user)
    try:
        from core.notify import deliver_to_entity, later

        later(lambda: deliver_to_entity(entity, f"{_s(tokens)} trial tokens for {entity.title}",
                                        [f"WaziPOS has added {_s(tokens)} tokens to {entity.title} so you can try it out.",
                                         f"Your balance is now {_s(w.balance)} tokens.", note]))
    except Exception:
        pass
    row = _wallet_row(w)
    given = pricing.q(_trial_gifted(entity))
    row.update({"trial_given": _s(given), "trial_left": _s(max(TRIAL_GIFT_MAX - given, 0))})
    return row


# ---------------------------------------------------------------- reading

def _entry(e):
    return {
        "id": str(e.id), "kind": e.kind, "meter": e.meter, "meter_label": pricing.METERS.get(e.meter, ("",))[0],
        "tokens": _s(e.tokens), "list_tokens": _s(e.list_tokens), "balance_after": _s(e.balance_after),
        "order_value": _s(e.order_value), "reference": e.reference, "note": e.note, "created": e.created.isoformat(),
    }


def status(user):
    """Everything the Billing screen shows for the user's current business."""
    entity = getattr(user, "entity", None)
    if not entity:
        raise BillingError("No business", ["You are not working in any business"])
    w = wallet_for(entity)
    m = mode_of(entity, w)
    ok, reason = can_operate(entity)
    now = _now()
    usage = _month_usage(entity, now)
    # Projection: this month's pace over a full month.
    day = max(1, timezone.localtime(now).day)
    days_in_month = 30
    projected = pricing.q(usage["listed"] / day * days_in_month)
    cap = pricing.monthly_cap(entity.entity_type)
    trial_days_left = None
    trial_end = w.trial_ends_at
    if not trial_end:
        sub = _subscription(entity, "TRIAL")
        trial_end = sub.end_date if sub else None
    if trial_end and trial_end > now:
        trial_days_left = max(0, -(-int((trial_end - now).total_seconds()) // 86400))
    legacy = _subscription(entity, "PAID")
    by_meter = (
        TokenLedger.objects.filter(entity=entity, kind__in=USAGE_KINDS, created__gte=_month_start(now))
        .values("meter").annotate(n=Count("id"), listed=Sum("list_tokens"), charged=Sum("tokens"), value=Sum("order_value"))
    )
    recent = TokenLedger.objects.filter(entity=entity).order_by("-created")[:25]
    avg_daily = usage["listed"] / day if usage["listed"] else Decimal("0")
    runway = int(w.balance / avg_daily) if avg_daily > 0 and w.balance > 0 else None
    return {
        "entity": {"id": str(entity.id), "title": entity.title, "entity_type": entity.entity_type},
        "mode": m,
        "can_operate": ok,
        "blocked_reason": reason or None,
        "approval": approval_status(entity),
        "balance": _s(w.balance),
        "low_balance_at": _s(w.low_balance_at),
        "is_low": 0 < w.balance <= w.low_balance_at,
        "has_topped_up": w.has_topped_up,
        "trial_ends_at": trial_end.isoformat() if trial_end else None,
        "trial_days_left": trial_days_left,
        "legacy_until": legacy.end_date.isoformat() if legacy else None,
        "runway_days": runway,
        "month": {
            "orders": usage["orders"], "charged": _s(usage["charged"]), "listed": _s(usage["listed"]),
            "value": _s(usage["value"]), "projected": _s(min(projected, cap)), "cap": _s(cap),
            "cap_used_pct": int(min(100, (usage["charged"] / cap * 100))) if cap else 0,
            "by_meter": [
                {"meter": r["meter"], "label": pricing.METERS.get(r["meter"], (r["meter"],))[0], "orders": r["n"],
                 "listed": _s(r["listed"]), "charged": _s(-(r["charged"] or 0)), "value": _s(r["value"])}
                for r in by_meter
            ],
        },
        "is_admin": is_entity_admin(user, entity),
        "pricing": pricing.catalogue(entity.entity_type),
        "applies": pricing.meter_for_entity_type(entity.entity_type),
        "recent": [_entry(e) for e in recent],
    }


def ledger(user, data):
    entity = getattr(user, "entity", None)
    if not entity:
        raise BillingError("No business", ["You are not working in any business"])
    qs = TokenLedger.objects.filter(entity=entity)
    kind = str(data.get("kind") or "").upper()
    if kind == "IN":
        qs = qs.filter(kind__in=("TOPUP", "BONUS", "ADJUST"))
    elif kind == "OUT":
        qs = qs.filter(kind__in=USAGE_KINDS)
    page = max(1, int(data.get("page") or 1))
    size = min(100, max(10, int(data.get("page_size") or 40)))
    total = qs.count()
    rows = qs.order_by("-created")[(page - 1) * size: page * size]
    return {"results": [_entry(e) for e in rows], "count": total, "page": page, "has_more": page * size < total}


def _wallet_row(w):
    e = w.entity
    usage = _month_usage(e)
    return {
        "entity": str(e.id), "title": e.title, "entity_type": e.entity_type, "town": getattr(e, "town", None),
        "balance": _s(w.balance), "mode": mode_of(e, w), "trial_ends_at": w.trial_ends_at.isoformat() if w.trial_ends_at else None,
        "has_topped_up": w.has_topped_up, "month_orders": usage["orders"], "month_charged": _s(usage["charged"]),
        "month_listed": _s(usage["listed"]),
    }


def admin_overview(user, data):
    if not is_platform_admin(user):
        raise BillingError("Not allowed", ["Only WaziPOS admins can see all wallets"])
    qs = TokenWallet.objects.select_related("entity").order_by("balance")
    term = str(data.get("q") or "").strip()
    if term:
        qs = qs.filter(entity__title__icontains=term)
    rows = [_wallet_row(w) for w in qs[:200]]
    month = TokenLedger.objects.filter(created__gte=_month_start())
    agg_in = month.filter(kind=TokenLedger.Kind.TOPUP).aggregate(t=Sum("tokens"))["t"] or 0
    agg_use = month.filter(kind=TokenLedger.Kind.USAGE).aggregate(t=Sum("tokens"))["t"] or 0
    return {
        "wallets": rows,
        "totals": {
            "wallets": TokenWallet.objects.count(),
            "month_topups_kes": _s(agg_in),
            "month_usage": _s(-agg_use),
            "in_trial": TokenWallet.objects.filter(trial_ends_at__gt=_now()).count(),
            "empty": TokenWallet.objects.filter(balance__lte=0, has_topped_up=True).count(),
        },
    }
