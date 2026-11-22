# shopguard/services.py
#
# Owner-away protection (models in shopguard/models.py):
#
#   Shifts        staff clock in / out from the app with GPS; a clock-in farther than
#                 the shop's geofence is flagged and the owner told. At clock-out the
#                 person counts the drawer WITHOUT seeing what the system expects; the
#                 variance is the count less (float + cash payments they recorded).
#   Commissions   OPTIONAL, per shop (settings.commissions_enabled) and per employee
#                 (plan.is_active). An employee with an active plan earns rate% of the
#                 goods value of every paid sale they record (shipping excluded), only on
#                 the month's sales above the plan's target; a cancelled sale voids its
#                 row until paid out. Once a month has ended the owner pays it: one
#                 mobile-money prompt for the total into the WaziPOS till, then WaziPOS
#                 pays each employee into their USER payout account (payments.OrderPayouts).
#   Watch         sales while the owner is on site vs away, per employee and per day:
#                 sales per hour on shift, cash share, cash variances, unknown scans.
#   Alerts        (Celery) no sale for idle_alert_minutes while staff are on shift and
#                 the owner isn't; shifts left open 16 h; many unknown barcodes; cash
#                 counts off by cash_variance_alert or more. Told to the shop's super
#                 admins by push + SMS (and the alert phone).

import math
from datetime import datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from shopguard.models import (
    CommissionPayouts,
    CommissionPlans,
    EmployeeCommissions,
    GuardAlerts,
    GuardSettings,
    StaffShifts,
    UnknownScans,
)
from utils.logging import create_log

LONG_SHIFT_HOURS = 16
CASH = "CASH"


def _q(v):
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _dec(v, label, errors, minimum=Decimal("0")):
    if v in (None, ""):
        return None
    try:
        d = Decimal(str(v))
    except Exception:
        errors.append(f"Enter {label} as a number")
        return None
    if d < minimum:
        errors.append(f"{label[0].upper() + label[1:]} can't be below {minimum}")
        return None
    return d


def settings_for(entity):
    s, _ = GuardSettings.objects.get_or_create(entity=entity)
    return s


def is_shop_admin(user, entity):
    from authentication.utils.admin_users import can_add_employees

    return can_add_employees(user, entity)


def _employee(user, entity):
    from employees.models import Employees

    return Employees.objects.filter(user=user, entity=entity, is_active="true").first()


def _owners(entity):
    from authentication.models import Users

    return list(Users.objects.filter(roles__entity=entity, roles__value__endswith="SuperAdmin").distinct())


def _name(user):
    if not user:
        return None
    return " ".join(x for x in (user.first_name, user.last_name) if x) or getattr(user, "phone", None) or str(user)


def _metres(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return int(2 * math.asin(math.sqrt(h)) * 6371000)


def _shop_point(entity):
    from logistics.utils.deliveries import entity_point

    return entity_point(entity)


# ---------------------------------------------------------------- alerts

def notify_owners(entity, kind, message, user=None, shift=None, dedupe_minutes=None):
    """Record the alert and tell the shop's super admins (push + SMS) and the alert phone."""
    settings = settings_for(entity)
    if dedupe_minutes and GuardAlerts.objects.filter(
        entity=entity, kind=kind, shift=shift, user=user, created__gte=timezone.now() - timedelta(minutes=dedupe_minutes),
    ).exists():
        return None
    alert = GuardAlerts.objects.create(entity=entity, kind=kind, message=message[:400], user=user, shift=shift)
    if not settings.alerts_enabled:
        return alert

    def send():
        from core.utils import send_push_notification, send_sms

        title = f"{entity.title}: {GuardAlerts.Kind(kind).label}"
        phones = set()
        for owner in _owners(entity):
            if owner.notification_token:
                send_push_notification(owner.notification_token, title, message, {"type": "shopguard", "kind": kind})
            if getattr(owner, "phone", None):
                phones.add(owner.phone)
        if settings.alert_phone:
            phones.add(settings.alert_phone)
        for phone in phones:
            errs, _ = send_sms(phone, f"WaziPOS {title}. {message}"[:300])
            if errs:
                create_log("error", f"Shop guard SMS failed: {errs}")

    transaction.on_commit(send)
    return alert


def alert_out(a):
    return {
        "id": str(a.id),
        "kind": a.kind,
        "kind_label": a.get_kind_display(),
        "message": a.message,
        "user": _name(a.user),
        "read": a.read_at is not None,
        "created": a.created.isoformat(),
    }


# ---------------------------------------------------------------- shifts

def _sales_by(user, entity, start, end):
    """Paid sales this person recorded in [start, end] (orders they took, or tagged with their employee row)."""
    from retailers.models import CustomerOrders

    return CustomerOrders.objects.filter(entity=entity, is_paid="true").exclude(status="CANCELLED").filter(
        Q(employee__user=user) | Q(employee__isnull=True, owner=user),
    ).filter(Q(paid_at__range=(start, end)) | Q(paid_at__isnull=True, created__range=(start, end)))


def _payments_by(user, entity, start, end):
    from retailers.models import CustomerOrderPayment

    return CustomerOrderPayment.objects.filter(
        customer_order__entity=entity, owner=user, status="SUCCESS", created__range=(start, end),
    )


def goods_value(order):
    """What the customer paid for the goods: net total less delivery."""
    return _q(max(Decimal("0"), _q(order.order_net_price_total) - _q(order.shipping_cost)))


def shift_out(s, owner_view=False):
    out = {
        "id": str(s.id),
        "user": str(s.user_id),
        "name": _name(s.user),
        "is_owner": s.is_owner,
        "status": s.status,
        "clock_in_at": s.clock_in_at.isoformat(),
        "clock_out_at": s.clock_out_at.isoformat() if s.clock_out_at else None,
        "in_inside": s.in_inside,
        "in_distance_m": s.in_distance_m,
        "out_distance_m": s.out_distance_m,
        "auto_closed": s.auto_closed,
        "note": s.note,
    }
    # Staff never see the expected cash before they've counted (blind count).
    if owner_view or s.status == StaffShifts.Status.CLOSED:
        out.update({
            "opening_float": str(s.opening_float),
            "counted_cash": str(s.counted_cash) if s.counted_cash is not None else None,
            "expected_cash": str(s.expected_cash),
            "cash_variance": str(s.cash_variance),
            "non_cash_total": str(s.non_cash_total),
            "sales_count": s.sales_count,
            "sales_total": str(s.sales_total),
        })
    return out


def open_shift(user, entity):
    return StaffShifts.objects.filter(user=user, entity=entity, status=StaffShifts.Status.OPEN).first()


def _where(entity, settings, lat, lng):
    point = _shop_point(entity)
    if lat in (None, "") or lng in (None, "") or point is None:
        return None, None, None, None
    lat, lng = float(lat), float(lng)
    d = _metres(lat, lng, point.y, point.x)
    return lat, lng, d, d <= settings.geofence_m


def clock_in(user, data):
    """ClockIn {latitude?, longitude?, opening_float?}."""
    entity = user.entity
    employee = _employee(user, entity)
    owner = is_shop_admin(user, entity)
    if not employee and not owner:
        return ["Only the shop's staff clock in here"], None
    if open_shift(user, entity):
        return ["You are already on shift"], None
    errors = []
    float_ = _dec(data.get("opening_float"), "the opening float", errors) or Decimal("0")
    if errors:
        return errors, None
    settings = settings_for(entity)
    try:
        lat, lng, dist, inside = _where(entity, settings, data.get("latitude"), data.get("longitude"))
    except (TypeError, ValueError):
        return ["Invalid location"], None
    shift = StaffShifts.objects.create(
        entity=entity, user=user, employee=employee, is_owner=owner, clock_in_at=timezone.now(),
        in_latitude=lat, in_longitude=lng, in_distance_m=dist, in_inside=inside, opening_float=_q(float_),
    )
    if not owner and inside is False:
        notify_owners(entity, GuardAlerts.Kind.OUTSIDE_SHOP, f"{_name(user)} clocked in {dist:,} m from the shop.", user=user, shift=shift)
    if not owner and lat is None:
        notify_owners(entity, GuardAlerts.Kind.OUTSIDE_SHOP, f"{_name(user)} clocked in without sharing their location.", user=user, shift=shift)
    return [], shift


def _close(shift, now, counted=None, lat=None, lng=None, dist=None, note="", auto=False):
    start = shift.clock_in_at
    payments = _payments_by(shift.user, shift.entity, start, now)
    cash = _q(payments.filter(payment_method__title__iexact=CASH).aggregate(t=Sum("amount"))["t"])
    other = _q(payments.exclude(payment_method__title__iexact=CASH).aggregate(t=Sum("amount"))["t"])
    sales = list(_sales_by(shift.user, shift.entity, start, now))
    shift.status = StaffShifts.Status.CLOSED
    shift.clock_out_at = now
    shift.out_latitude, shift.out_longitude, shift.out_distance_m = lat, lng, dist
    shift.expected_cash = _q(cash + shift.opening_float)
    shift.non_cash_total = other
    shift.sales_count = len(sales)
    shift.sales_total = _q(sum((goods_value(o) for o in sales), Decimal("0")))
    shift.auto_closed = auto
    if counted is not None:
        shift.counted_cash = _q(counted)
        shift.cash_variance = _q(shift.counted_cash - shift.expected_cash)
    if note:
        shift.note = note[:300]
    shift.save()
    return shift


def clock_out(user, data):
    """ClockOut {counted_cash, latitude?, longitude?, note?}: blind count of the drawer."""
    entity = user.entity
    shift = open_shift(user, entity)
    if not shift:
        return ["You aren't on shift"], None
    errors = []
    counted = _dec(data.get("counted_cash"), "the cash you counted", errors)
    if counted is None and not errors and not shift.is_owner:
        errors.append("Count the cash in the drawer and enter it")
    if errors:
        return errors, None
    settings = settings_for(entity)
    try:
        lat, lng, dist, _inside = _where(entity, settings, data.get("latitude"), data.get("longitude"))
    except (TypeError, ValueError):
        lat = lng = dist = None
    shift = _close(shift, timezone.now(), counted, lat, lng, dist, str(data.get("note") or ""))
    if shift.counted_cash is not None and abs(shift.cash_variance) >= settings.cash_variance_alert and not shift.is_owner:
        word = "short" if shift.cash_variance < 0 else "over"
        notify_owners(
            entity, GuardAlerts.Kind.CASH_VARIANCE,
            f"{_name(user)}'s cash was KES {abs(shift.cash_variance):,.0f} {word} at clock-out "
            f"(counted {shift.counted_cash:,.0f}, recorded {shift.expected_cash:,.0f}).",
            user=user, shift=shift,
        )
    return [], shift


def list_shifts(entity, data):
    qs = StaffShifts.objects.filter(entity=entity).select_related("user")
    start, end = _range(data)
    qs = qs.filter(clock_in_at__lte=end).filter(Q(clock_out_at__isnull=True) | Q(clock_out_at__gte=start))
    if data.get("user"):
        qs = qs.filter(user_id=data["user"])
    return [shift_out(s, owner_view=True) for s in qs[:500]]


# ---------------------------------------------------------------- unknown scans

def log_unknown_scan(user, data):
    """LogUnknownScan {barcode, context?}: a barcode the till didn't find in the shop's stock."""
    code = str(data.get("barcode") or "").strip()[:64]
    if not code:
        return ["Barcode missing"], None
    entity = user.entity
    scan = UnknownScans.objects.create(entity=entity, user=user, barcode=code, context=str(data.get("context") or "POS")[:20])
    settings = settings_for(entity)
    today = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    n = UnknownScans.objects.filter(entity=entity, user=user, created__gte=today).count()
    if n == settings.unknown_scan_alert:
        notify_owners(
            entity, GuardAlerts.Kind.UNKNOWN_SCANS,
            f"{_name(user)} scanned {n} barcodes today that aren't in the shop's stock (latest {code}). "
            "Check for goods that aren't yours.",
            user=user,
        )
    return [], scan


# ---------------------------------------------------------------- commissions

def _has_payout_account(user):
    from payments.models import UserPayoutAccounts

    return UserPayoutAccounts.objects.filter(user=user, is_active="true").exists()


def plan_out(employee, plan):
    return {
        "employee": str(employee.id),
        "user": str(employee.user_id),
        "name": _name(employee.user),
        "has_payout_account": _has_payout_account(employee.user),
        "rate_percent": str(plan.rate_percent) if plan else "0",
        "monthly_target": str(plan.monthly_target) if plan else "0",
        "is_active": bool(plan and plan.is_active),
    }


def list_plans(entity):
    from employees.models import Employees

    plans = {p.employee_id: p for p in CommissionPlans.objects.filter(entity=entity)}
    return [plan_out(e, plans.get(e.id)) for e in Employees.objects.filter(entity=entity, is_active="true").select_related("user")]


def save_plan(entity, user, data):
    """SaveCommissionPlan {employee, rate_percent, monthly_target?, is_active?}."""
    from employees.models import Employees

    employee = Employees.objects.filter(id=data.get("employee") or None, entity=entity).select_related("user").first() if data.get("employee") else None
    if not employee:
        return ["Employee not found"], None
    errors = []
    rate = _dec(data.get("rate_percent"), "the commission rate", errors)
    target = _dec(data.get("monthly_target"), "the monthly target", errors)
    if rate is not None and rate > 50:
        errors.append("A commission above 50% isn't allowed")
    if errors:
        return errors, None
    plan, _ = CommissionPlans.objects.get_or_create(entity=entity, employee=employee)
    if rate is not None:
        plan.rate_percent = rate
    if target is not None:
        plan.monthly_target = target
    if "is_active" in data:
        plan.is_active = str(data.get("is_active")).lower() in ("true", "1", "yes")
    plan.updated_by = user
    plan.save()
    return [], plan_out(employee, plan)


def sync_commissions(days=10):
    """Celery: a commission row for every paid sale by an employee with an active plan; void cancelled ones."""
    from retailers.models import CustomerOrders

    since = timezone.now() - timedelta(days=days)
    plans = {p.employee_id: p for p in CommissionPlans.objects.filter(is_active=True, rate_percent__gt=0, entity__guard_settings__commissions_enabled=True)}
    created = 0
    if plans:
        orders = (
            CustomerOrders.objects.filter(is_paid="true", employee_id__in=plans.keys())
            .exclude(status="CANCELLED").filter(Q(paid_at__gte=since) | Q(paid_at__isnull=True, created__gte=since))
            .filter(employee_commission__isnull=True)
        )
        for order in orders[:2000]:
            plan = plans[order.employee_id]
            when = order.paid_at or order.created
            EmployeeCommissions.objects.get_or_create(
                order=order,
                defaults=dict(
                    entity_id=order.entity_id, employee_id=order.employee_id, period=timezone.localtime(when).strftime("%Y-%m"),
                    sale_amount=goods_value(order), rate_percent=plan.rate_percent, earned_at=when,
                ),
            )
            created += 1
        # Sales recorded without the employee tag: the person who took them.
        from employees.models import Employees

        by_user = {}
        for e in Employees.objects.filter(id__in=plans.keys()):
            by_user[(e.user_id, e.entity_id)] = e.id
        untagged = (
            CustomerOrders.objects.filter(is_paid="true", employee__isnull=True, owner_id__in={u for u, _ in by_user})
            .exclude(status="CANCELLED").filter(Q(paid_at__gte=since) | Q(paid_at__isnull=True, created__gte=since))
            .filter(employee_commission__isnull=True)
        )
        for order in untagged[:2000]:
            emp_id = by_user.get((order.owner_id, order.entity_id))
            if not emp_id:
                continue
            plan = plans[emp_id]
            when = order.paid_at or order.created
            EmployeeCommissions.objects.get_or_create(
                order=order,
                defaults=dict(
                    entity_id=order.entity_id, employee_id=emp_id, period=timezone.localtime(when).strftime("%Y-%m"),
                    sale_amount=goods_value(order), rate_percent=plan.rate_percent, earned_at=when,
                ),
            )
            created += 1
    EmployeeCommissions.objects.filter(status=EmployeeCommissions.Status.EARNED, order__status="CANCELLED").update(status=EmployeeCommissions.Status.VOID)
    return created


def _statement(employee, period, plan=None):
    rows = EmployeeCommissions.objects.filter(employee=employee, period=period).exclude(status=EmployeeCommissions.Status.VOID)
    sales = _q(rows.aggregate(t=Sum("sale_amount"))["t"])
    gross = _q(sum((r.sale_amount * r.rate_percent / Decimal("100") for r in rows), Decimal("0")))
    target = _q(plan.monthly_target) if plan else Decimal("0")
    # Commission only on sales above the target: the same share of every sale's commission.
    share = Decimal("1") if target <= 0 else (max(Decimal("0"), sales - target) / sales if sales > 0 else Decimal("0"))
    amount = _q(gross * share)
    payout = CommissionPayouts.objects.filter(employee=employee, period=period).exclude(status=CommissionPayouts.Status.FAILED).first()
    return {
        "employee": str(employee.id),
        "name": _name(employee.user),
        "has_payout_account": _has_payout_account(employee.user),
        "payout_status": payout.status if payout else None,
        "period": period,
        "sales_count": rows.count(),
        "sales_total": str(sales),
        "monthly_target": str(target),
        "rate_percent": str(plan.rate_percent) if plan else "0",
        "amount": str(payout.amount if payout else amount),
        "paid": bool(payout and payout.status == CommissionPayouts.Status.PAID),
        "paid_at": payout.paid_at.isoformat() if payout and payout.paid_at else None,
        "reference": (payout.reference or payout.pay_in_reference) if payout else None,
    }


def statements(entity, data):
    from employees.models import Employees

    period = str(data.get("period") or timezone.localtime().strftime("%Y-%m"))[:7]
    plans = {p.employee_id: p for p in CommissionPlans.objects.filter(entity=entity)}
    ids = set(plans) | set(EmployeeCommissions.objects.filter(entity=entity, period=period).values_list("employee_id", flat=True))
    return [_statement(e, period, plans.get(e.id)) for e in Employees.objects.filter(id__in=ids).select_related("user")]


def my_commission(user):
    """Staff: this month's and last month's commission so far."""
    employee = _employee(user, user.entity)
    if not employee:
        return []
    plan = CommissionPlans.objects.filter(employee=employee).first()
    now = timezone.localtime()
    last = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    return [_statement(employee, now.strftime("%Y-%m"), plan), _statement(employee, last, plan)]


def pay_commissions(entity, user, data):
    """
    PayCommissions {period, phone, employees?}: the owner pays an ended month's
    commission (everyone due, or the employees listed) with ONE mobile-money prompt
    into the WaziPOS till. Once it succeeds WaziPOS pays each employee into their
    user payout account. Returns (errors, {reference, amount, employees}).
    """
    import math

    from employees.models import Employees
    from payments.utils.system_till import push_to_system_till
    from authentication.utils.utils import generate_reference_number, use_reference_number

    if not settings_for(entity).commissions_enabled:
        return ["Commissions are switched off for this shop"], None
    period = str(data.get("period") or "")[:7]
    if len(period) != 7 or period >= timezone.localtime().strftime("%Y-%m"):
        return ["Pay a month once it has ended"], None
    phone = str(data.get("phone") or getattr(user, "phone", "") or "").strip()
    if not phone:
        return ["Enter the phone number to pay from"], None
    sync_commissions(days=62)
    wanted = {str(x) for x in (data.get("employees") or [])}
    plans = {pl.employee_id: pl for pl in CommissionPlans.objects.filter(entity=entity)}
    due = []
    for e in Employees.objects.filter(entity=entity, id__in=EmployeeCommissions.objects.filter(entity=entity, period=period).values("employee_id")).select_related("user"):
        if wanted and str(e.id) not in wanted:
            continue
        existing = CommissionPayouts.objects.filter(employee=e, period=period).first()
        if existing and existing.status in (CommissionPayouts.Status.FUNDED, CommissionPayouts.Status.PAID):
            continue
        st = _statement(e, period, plans.get(e.id))
        if Decimal(st["amount"]) > 0:
            due.append((e, st, existing))
    if not due:
        return ["Nothing is owed for that month"], None
    total = _q(sum((Decimal(st["amount"]) for _, st, _ in due), Decimal("0")))
    reference = generate_reference_number(entity, user)
    errors, result, _telco = push_to_system_till(reference, math.ceil(total), phone, description=f"Staff commission {period}"[:60])
    if errors:
        return errors, None
    use_reference_number(reference)
    with transaction.atomic():
        for e, st, existing in due:
            row = existing or CommissionPayouts(entity=entity, employee=e, period=period)
            row.sales_total, row.monthly_target, row.amount = Decimal(st["sales_total"]), Decimal(st["monthly_target"]), Decimal(st["amount"])
            row.status, row.pay_in_reference, row.payer_phone, row.paid_by = CommissionPayouts.Status.AWAITING_PAYMENT, reference, phone[:20], user
            row.save()
    return [], {"reference": reference, "amount": str(total), "employees": len(due)}


def _fund(rows):
    """The owner's payment arrived: each employee's commission becomes a payout to their user account."""
    from payments.models import OrderPayouts, UserPayoutAccounts

    now = timezone.now()
    for row in rows:
        with transaction.atomic():
            row = CommissionPayouts.objects.select_for_update().select_related("employee__user").get(id=row.id)
            if row.status != CommissionPayouts.Status.AWAITING_PAYMENT:
                continue
            account = UserPayoutAccounts.objects.filter(user=row.employee.user, is_active="true").first()
            OrderPayouts.objects.create(
                payee_kind=OrderPayouts.PayeeKind.EMPLOYEE_COMMISSION, order_kind="commission", order_id=str(row.id),
                order_reference=f"{row.period} commission", seller=row.entity, payee_user=row.employee.user, user_account=account,
                gross_amount=row.amount, amount=row.amount, due_at=now,
                status=OrderPayouts.Status.DUE if account else OrderPayouts.Status.NO_ACCOUNT,
                note="" if account else "The employee needs to add a payout account",
            )
            row.status, row.funded_at = CommissionPayouts.Status.FUNDED, now
            row.save(update_fields=["status", "funded_at", "updated"])
            EmployeeCommissions.objects.filter(employee=row.employee, period=row.period, status=EmployeeCommissions.Status.EARNED).update(payout=row)


def commission_paid_out(order_payout):
    """payments: the employee was paid (OrderPayouts PAID)."""
    row = CommissionPayouts.objects.filter(id=order_payout.order_id).first()
    if not row:
        return
    row.status, row.paid_at = CommissionPayouts.Status.PAID, order_payout.paid_at or timezone.now()
    row.reference = (order_payout.psp_reference or order_payout.reference_number or "")[:120]
    row.save(update_fields=["status", "paid_at", "reference", "updated"])
    EmployeeCommissions.objects.filter(payout=row).update(status=EmployeeCommissions.Status.PAID)


def refresh_commission_payment(entity, reference):
    """RefreshCommissionPayment {reference} / Celery: follow the owner's prompt to SUCCESS or failure."""
    from payments.utils.system_till import fetch_transaction

    rows = list(CommissionPayouts.objects.filter(pay_in_reference=reference or None, status=CommissionPayouts.Status.AWAITING_PAYMENT, **({"entity": entity} if entity else {})))
    if not rows:
        return "DONE"
    tx = fetch_transaction(reference)
    status = (tx or {}).get("status", "")
    if status == "SUCCESS":
        _fund(rows)
        from payments.utils.order_payouts import run_payouts

        transaction.on_commit(run_payouts)
        return "SUCCESS"
    if status in ("FAILED", "CANCELLED"):
        CommissionPayouts.objects.filter(id__in=[r.id for r in rows]).update(status=CommissionPayouts.Status.FAILED)
        return "FAILED"
    if not tx and timezone.now() - rows[0].updated > timedelta(minutes=30):
        CommissionPayouts.objects.filter(id__in=[r.id for r in rows]).update(status=CommissionPayouts.Status.FAILED)
        return "FAILED"
    return "PENDING"


def reconcile_commission_payments():
    refs = set(CommissionPayouts.objects.filter(status=CommissionPayouts.Status.AWAITING_PAYMENT).values_list("pay_in_reference", flat=True))
    for ref in refs:
        if ref:
            refresh_commission_payment(None, ref)
    return len(refs)


# ---------------------------------------------------------------- watch report

def _range(data):
    today = timezone.localdate()
    try:
        start = datetime.fromisoformat(str(data.get("from"))[:10]).date() if data.get("from") else today - timedelta(days=6)
        end = datetime.fromisoformat(str(data.get("to"))[:10]).date() if data.get("to") else today
    except ValueError:
        start, end = today - timedelta(days=6), today
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime.combine(start, time.min), tz), timezone.make_aware(datetime.combine(end, time.max), tz)


def _overlaps(t, windows):
    return any(a <= t <= b for a, b in windows)


def watch_report(entity, data):
    """
    GetWatchReport {from?, to?}: sales while the owner was on site vs away, per
    employee and per day, with cash variances, unknown scans and alerts.
    """
    from retailers.models import CustomerOrderPayment, CustomerOrders

    start, end = _range(data)
    now = timezone.now()
    shifts = list(
        StaffShifts.objects.filter(entity=entity, clock_in_at__lte=end)
        .filter(Q(clock_out_at__isnull=True) | Q(clock_out_at__gte=start)).select_related("user")
    )
    owner_windows = [(max(s.clock_in_at, start), min(s.clock_out_at or now, end)) for s in shifts if s.is_owner]
    orders = list(
        CustomerOrders.objects.filter(entity=entity, is_paid="true").exclude(status="CANCELLED")
        .filter(Q(paid_at__range=(start, end)) | Q(paid_at__isnull=True, created__range=(start, end)))
        .select_related("employee__user", "owner", "selected_payment_method")
    )
    cash_orders = set(
        CustomerOrderPayment.objects.filter(customer_order__in=[o.id for o in orders], status="SUCCESS", payment_method__title__iexact=CASH)
        .values_list("customer_order_id", flat=True)
    )

    def bucket():
        return {"sales_count": 0, "sales_total": Decimal("0"), "cash_total": Decimal("0")}

    present, away = bucket(), bucket()
    per_user, per_day = {}, {}
    for o in orders:
        when = o.paid_at or o.created
        value = goods_value(o)
        b = present if _overlaps(when, owner_windows) else away
        b["sales_count"] += 1
        b["sales_total"] += value
        seller = o.employee.user if o.employee_id else o.owner
        u = per_user.setdefault(getattr(seller, "id", None), {
            "user": str(seller.id) if seller else None, "name": _name(seller) or "Unknown",
            "sales_count": 0, "sales_total": Decimal("0"), "cash_total": Decimal("0"),
            "away_total": Decimal("0"), "present_total": Decimal("0"),
            "hours": 0.0, "shifts": 0, "cash_variance": Decimal("0"), "unknown_scans": 0,
        })
        u["sales_count"] += 1
        u["sales_total"] += value
        u["away_total" if b is away else "present_total"] += value
        day = per_day.setdefault(timezone.localtime(when).date().isoformat(), {"sales_total": Decimal("0"), "away_total": Decimal("0"), "owner_hours": 0.0})
        day["sales_total"] += value
        if b is away:
            day["away_total"] += value
        if o.id in cash_orders:
            b["cash_total"] += value
            u["cash_total"] += value

    staff_hours_present = staff_hours_away = 0.0
    for s in shifts:
        a, z = max(s.clock_in_at, start), min(s.clock_out_at or now, end)
        hours = max(0.0, (z - a).total_seconds() / 3600)
        if s.is_owner:
            d = per_day.setdefault(timezone.localtime(a).date().isoformat(), {"sales_total": Decimal("0"), "away_total": Decimal("0"), "owner_hours": 0.0})
            d["owner_hours"] += hours
            continue
        overlap = sum(max(0.0, (min(z, ob) - max(a, oa)).total_seconds() / 3600) for oa, ob in owner_windows)
        staff_hours_present += min(hours, overlap)
        staff_hours_away += max(0.0, hours - overlap)
        u = per_user.setdefault(s.user_id, {
            "user": str(s.user_id), "name": _name(s.user), "sales_count": 0, "sales_total": Decimal("0"),
            "cash_total": Decimal("0"), "away_total": Decimal("0"), "present_total": Decimal("0"),
            "hours": 0.0, "shifts": 0, "cash_variance": Decimal("0"), "unknown_scans": 0,
        })
        u["hours"] += hours
        u["shifts"] += 1
        u["cash_variance"] += s.cash_variance or 0
    for scan in UnknownScans.objects.filter(entity=entity, created__range=(start, end)).values_list("user_id", flat=True):
        if scan in per_user:
            per_user[scan]["unknown_scans"] += 1

    def money(b, hours):
        return {
            "sales_count": b["sales_count"],
            "sales_total": str(_q(b["sales_total"])),
            "cash_share": round(float(b["cash_total"] / b["sales_total"]) * 100, 1) if b["sales_total"] else None,
            "staff_hours": round(hours, 1),
            "per_staff_hour": str(_q(b["sales_total"] / Decimal(str(hours)))) if hours > 0 else None,
        }

    people = []
    for u in per_user.values():
        people.append({
            **u,
            "sales_total": str(_q(u["sales_total"])),
            "cash_total": str(_q(u["cash_total"])),
            "away_total": str(_q(u["away_total"])),
            "present_total": str(_q(u["present_total"])),
            "cash_variance": str(_q(u["cash_variance"])),
            "hours": round(u["hours"], 1),
            "per_hour": str(_q(u["sales_total"] / Decimal(str(u["hours"])))) if u["hours"] > 0 else None,
            "cash_share": round(float(u["cash_total"] / u["sales_total"]) * 100, 1) if u["sales_total"] else None,
        })
    people.sort(key=lambda r: -float(r["sales_total"]))
    return {
        "from": start.date().isoformat(),
        "to": end.date().isoformat(),
        "owner_present": money(present, staff_hours_present),
        "owner_away": money(away, staff_hours_away),
        "people": people,
        "days": [
            {"date": d, "sales_total": str(_q(v["sales_total"])), "away_total": str(_q(v["away_total"])), "owner_hours": round(v["owner_hours"], 1)}
            for d, v in sorted(per_day.items())
        ],
        "on_shift": [shift_out(s, owner_view=True) for s in shifts if s.status == StaffShifts.Status.OPEN],
        "unknown_scans": [
            {"barcode": x.barcode, "user": _name(x.user), "context": x.context, "created": x.created.isoformat()}
            for x in UnknownScans.objects.filter(entity=entity, created__range=(start, end)).select_related("user")[:100]
        ],
        "alerts": [alert_out(a) for a in GuardAlerts.objects.filter(entity=entity, created__range=(start, end)).select_related("user")[:100]],
    }


# ---------------------------------------------------------------- Celery watch

def run_watch():
    """Idle shops while the owner is away, and shifts left open."""
    from retailers.models import CustomerOrders

    now = timezone.now()
    open_shifts = list(StaffShifts.objects.filter(status=StaffShifts.Status.OPEN).select_related("entity", "user"))
    # Shifts left open: closed automatically (no cash count) and the owner told.
    for s in open_shifts:
        if now - s.clock_in_at >= timedelta(hours=LONG_SHIFT_HOURS):
            _close(s, now, auto=True, note="Closed automatically: left open")
            notify_owners(s.entity, GuardAlerts.Kind.LONG_SHIFT, f"{_name(s.user)}'s shift was left open for {LONG_SHIFT_HOURS} h and closed without a cash count.", user=s.user, shift=s)
    by_entity = {}
    for s in open_shifts:
        if s.status == StaffShifts.Status.OPEN:
            by_entity.setdefault(s.entity_id, []).append(s)
    for entity_id, shifts in by_entity.items():
        entity = shifts[0].entity
        if any(s.is_owner for s in shifts):
            continue
        settings = settings_for(entity)
        idle = timedelta(minutes=settings.idle_alert_minutes)
        since = min(s.clock_in_at for s in shifts)
        last = (
            CustomerOrders.objects.filter(entity=entity, created__gte=since).order_by("-created").values_list("created", flat=True).first()
        )
        reference = last or since
        if now - reference >= idle:
            names = ", ".join(sorted({_name(s.user) for s in shifts}))
            mins = int((now - reference).total_seconds() // 60)
            notify_owners(
                entity, GuardAlerts.Kind.IDLE,
                f"No sale recorded for {mins // 60} h {mins % 60} min while {names} {'is' if len(shifts) == 1 else 'are'} on shift and you're away.",
                dedupe_minutes=settings.idle_alert_minutes,
            )
    return len(open_shifts)
