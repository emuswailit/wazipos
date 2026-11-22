# shopguard/models.py
#
# Owner-away protection for shops (retailers first): the shop runs straight when
# the owner isn't there.
#   GuardSettings      per shop: geofence, idle alert, cash variance alert, commissions on/off
#   StaffShifts        clock in / out with GPS (inside the shop's geofence or not), and a
#                      BLIND cash count at clock-out against the cash sales the person
#                      recorded during the shift
#   CommissionPlans    an employee's sales commission: % of the sales they record,
#                      optionally only above a monthly target
#   EmployeeCommissions one row per paid sale an employee recorded (rate snapshot)
#   CommissionPayouts  an employee's commission for a month: the owner pays the month's
#                      total by mobile money into the WaziPOS till (one prompt for
#                      everyone), then WaziPOS pays each employee into their USER
#                      payout account (payments.OrderPayouts, kind EMPLOYEE_COMMISSION).
#                      Commission is optional: per shop (GuardSettings.commissions_enabled)
#                      and per employee (CommissionPlans.is_active).
#   UnknownScans       barcodes scanned at the till that the shop doesn't stock
#                      (often a sign of goods that aren't the shop's)
#   GuardAlerts        what the owner was told (idle shop, cash short / over, clock-in
#                      away from the shop, many unknown scans)
# Logic: shopguard/services.py.

import uuid

from django.db import models
from django.utils.translation import gettext_lazy as _


class GuardSettings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.OneToOneField("authentication.Entities", related_name="guard_settings", on_delete=models.CASCADE)
    alerts_enabled = models.BooleanField(default=True)
    # Clock-ins farther than this from the shop's location are flagged.
    geofence_m = models.PositiveIntegerField(default=150)
    # No recorded sale for this long while staff are on shift (and the owner isn't) -> alert.
    idle_alert_minutes = models.PositiveIntegerField(default=120)
    # A clock-out cash count off by at least this much -> alert.
    cash_variance_alert = models.DecimalField(max_digits=10, decimal_places=2, default=200)
    # Unknown barcodes one person scans in a day before the owner is told.
    unknown_scan_alert = models.PositiveSmallIntegerField(default=5)
    commissions_enabled = models.BooleanField(default=False)
    # Extra number to text alerts to (the owner's super admins get push + SMS anyway).
    alert_phone = models.CharField(max_length=20, blank=True, default="")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Guard settings"

    def __str__(self):
        return f"Guard settings for {self.entity}"


class StaffShifts(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", _("On shift")
        CLOSED = "CLOSED", _("Closed")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey("authentication.Entities", related_name="staff_shifts", on_delete=models.CASCADE)
    user = models.ForeignKey("authentication.Users", related_name="staff_shifts", on_delete=models.CASCADE)
    employee = models.ForeignKey("employees.Employees", related_name="shifts", on_delete=models.SET_NULL, null=True, blank=True)
    # The owner (a super admin of the shop) on site: the shop isn't "owner away".
    is_owner = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN, db_index=True)
    clock_in_at = models.DateTimeField()
    in_latitude = models.FloatField(null=True, blank=True)
    in_longitude = models.FloatField(null=True, blank=True)
    in_distance_m = models.PositiveIntegerField(null=True, blank=True)
    in_inside = models.BooleanField(null=True)
    clock_out_at = models.DateTimeField(null=True, blank=True)
    out_latitude = models.FloatField(null=True, blank=True)
    out_longitude = models.FloatField(null=True, blank=True)
    out_distance_m = models.PositiveIntegerField(null=True, blank=True)
    auto_closed = models.BooleanField(default=False)
    # Clock-out: what they counted (blind) vs the cash sales they recorded.
    counted_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    expected_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cash_variance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    opening_float = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    non_cash_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sales_count = models.PositiveIntegerField(default=0)
    sales_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    note = models.CharField(max_length=300, blank=True, default="")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Staff shifts"
        ordering = ["-clock_in_at"]

    def __str__(self):
        return f"{self.user} at {self.entity} from {self.clock_in_at:%Y-%m-%d %H:%M}"


class CommissionPlans(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey("authentication.Entities", related_name="commission_plans", on_delete=models.CASCADE)
    employee = models.OneToOneField("employees.Employees", related_name="commission_plan", on_delete=models.CASCADE)
    rate_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    # Commission is earned only on the month's sales above this (0 = from the first shilling).
    monthly_target = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey("authentication.Users", related_name="+", on_delete=models.SET_NULL, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.employee}: {self.rate_percent}%"


class CommissionPayouts(models.Model):
    class Status(models.TextChoices):
        AWAITING_PAYMENT = "AWAITING_PAYMENT", _("Waiting for the owner's payment")
        FUNDED = "FUNDED", _("Paid in; paying the employee")
        PAID = "PAID", _("Paid to the employee")
        FAILED = "FAILED", _("Owner's payment failed")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey("authentication.Entities", related_name="commission_payouts", on_delete=models.CASCADE)
    employee = models.ForeignKey("employees.Employees", related_name="commission_payouts", on_delete=models.CASCADE)
    period = models.CharField(max_length=7)  # YYYY-MM
    sales_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    monthly_target = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AWAITING_PAYMENT, db_index=True)
    # The owner's mobile-money payment (shared by everyone paid in the same prompt).
    pay_in_reference = models.CharField(max_length=64, blank=True, default="", db_index=True)
    payer_phone = models.CharField(max_length=20, blank=True, default="")
    reference = models.CharField(max_length=120, blank=True, default="")  # the payout to the employee
    paid_by = models.ForeignKey("authentication.Users", related_name="+", on_delete=models.SET_NULL, null=True, blank=True)
    funded_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["employee", "period"], name="uniq_commission_payout_per_month")]

    def __str__(self):
        return f"{self.employee} {self.period}: {self.amount}"


class EmployeeCommissions(models.Model):
    class Status(models.TextChoices):
        EARNED = "EARNED", _("Earned")
        VOID = "VOID", _("Void (order cancelled)")
        PAID = "PAID", _("Paid")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey("authentication.Entities", related_name="employee_commissions", on_delete=models.CASCADE)
    employee = models.ForeignKey("employees.Employees", related_name="commissions", on_delete=models.CASCADE)
    order = models.OneToOneField("retailers.CustomerOrders", related_name="employee_commission", on_delete=models.CASCADE)
    period = models.CharField(max_length=7, db_index=True)  # YYYY-MM of the sale
    sale_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    rate_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.EARNED, db_index=True)
    payout = models.ForeignKey(CommissionPayouts, related_name="rows", on_delete=models.SET_NULL, null=True, blank=True)
    earned_at = models.DateTimeField()
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-earned_at"]


class UnknownScans(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey("authentication.Entities", related_name="unknown_scans", on_delete=models.CASCADE)
    user = models.ForeignKey("authentication.Users", related_name="unknown_scans", on_delete=models.SET_NULL, null=True, blank=True)
    barcode = models.CharField(max_length=64)
    context = models.CharField(max_length=20, default="POS")
    created = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created"]


class GuardAlerts(models.Model):
    class Kind(models.TextChoices):
        IDLE = "IDLE", _("No sales recorded")
        CASH_VARIANCE = "CASH_VARIANCE", _("Cash count off")
        OUTSIDE_SHOP = "OUTSIDE_SHOP", _("Clock-in away from the shop")
        UNKNOWN_SCANS = "UNKNOWN_SCANS", _("Unknown barcodes scanned")
        LONG_SHIFT = "LONG_SHIFT", _("Shift left open")
        FOUND_STOCK = "FOUND_STOCK", _("Stock found that isn't on the books")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey("authentication.Entities", related_name="guard_alerts", on_delete=models.CASCADE)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    message = models.CharField(max_length=400)
    user = models.ForeignKey("authentication.Users", related_name="+", on_delete=models.SET_NULL, null=True, blank=True)
    shift = models.ForeignKey(StaffShifts, related_name="alerts", on_delete=models.SET_NULL, null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created"]
