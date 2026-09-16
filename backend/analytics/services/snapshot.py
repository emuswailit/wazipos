# analytics/services/snapshot.py

"""
Daily snapshot builder.

Reads WholesalerReceipts (tier=WHOLESALER) and RetailerReceipts
(tier=RETAILER), computes derived fields, and writes InventorySnapshot
rows for the given date.

Idempotent: rerunning for the same date replaces all rows for that date.
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q

from analytics.models import InventorySnapshot
from retailers.models import RetailerReceipts
from wholesalers.models import WholesalerReceipts


# =====================================================================
# Public entry point
# =====================================================================

def build_daily_snapshot(snapshot_date: date | None = None) -> dict:
    """
    Build InventorySnapshot rows for a given date.

    Returns a summary dict with counts.

    Usage:
        from analytics.services.snapshot import build_daily_snapshot
        result = build_daily_snapshot()                 # today
        result = build_daily_snapshot(date(2026, 9, 15))  # backfill
    """
    snapshot_date = snapshot_date or date.today()

    wholesaler_rows = _build_wholesaler_rows(snapshot_date)
    retailer_rows = _build_retailer_rows(snapshot_date)
    all_rows = wholesaler_rows + retailer_rows

    with transaction.atomic():
        InventorySnapshot.objects.filter(snapshot_date=snapshot_date).delete()
        if all_rows:
            InventorySnapshot.objects.bulk_create(all_rows, batch_size=1000)

    return {
        "snapshot_date": snapshot_date.isoformat(),
        "wholesaler_rows": len(wholesaler_rows),
        "retailer_rows": len(retailer_rows),
        "total_rows": len(all_rows),
    }


# =====================================================================
# Wholesaler pass
# =====================================================================

def _build_wholesaler_rows(snapshot_date: date) -> list[InventorySnapshot]:
    """
    Snapshot all wholesaler lots with current_unit_quantity > 0.

    Includes negative-quantity lots as evidence of upstream issues.
    Includes inactive lots (is_active != "true").
    """
    qs = (
        WholesalerReceipts.objects
        .select_related("entity", "product", "received_from")
        .filter(Q(current_unit_quantity__gt=0) | Q(current_unit_quantity__lt=0))
    )

    rows = []
    for r in qs.iterator(chunk_size=500):
        rows.append(_build_row(r, snapshot_date, tier="WHOLESALER"))
    return rows


# =====================================================================
# Retailer pass
# =====================================================================

def _build_retailer_rows(snapshot_date: date) -> list[InventorySnapshot]:
    """
    Snapshot all retailer lots with current_unit_quantity > 0.

    Includes negative-quantity lots as evidence of upstream issues.
    Includes placement lots (in_placement=True) and inactive lots.
    """
    qs = (
        RetailerReceipts.objects
        .select_related("entity", "product", "received_from")
        .filter(Q(current_unit_quantity__gt=0) | Q(current_unit_quantity__lt=0))
    )

    rows = []
    for r in qs.iterator(chunk_size=500):
        rows.append(_build_row(r, snapshot_date, tier="RETAILER"))
    return rows


# =====================================================================
# Shared row builder
# =====================================================================

def _build_row(receipt, snapshot_date: date, tier: str) -> InventorySnapshot:
    """
    Compute all derived fields for a single lot.
    Works for both WholesalerReceipts and RetailerReceipts.
    Fields are looked up defensively — missing attributes on one tier
    fall back to sensible defaults.
    """
    # ---- Quantities ----
    current_qty = _to_int(getattr(receipt, "current_unit_quantity", 0))
    received_qty = _to_int(getattr(receipt, "received_unit_quantity", 0))
    reserved_qty = _to_int(getattr(receipt, "reserved_unit_quantity", 0))
    consumed_qty = received_qty - current_qty
    units_per_pack = _to_int_or_none(getattr(receipt, "units_per_pack", None))

    # ---- Prices ----
    unit_buying_price = _to_decimal(getattr(receipt, "unit_buying_price", 0))
    allocated_shipping = _to_decimal(
        getattr(receipt, "allocated_shipping_per_unit", 0)
    )
    landed_unit_cost = unit_buying_price + allocated_shipping
    final_selling = _to_decimal(
        getattr(receipt, "final_unit_selling_price", 0)
    )

    # ---- Values ----
    current_qty_dec = Decimal(current_qty)
    lot_value_at_cost = current_qty_dec * landed_unit_cost
    lot_value_at_sale = current_qty_dec * final_selling
    potential_margin = lot_value_at_sale - lot_value_at_cost
    margin_pct = (
        float(potential_margin / lot_value_at_sale)
        if lot_value_at_sale > 0
        else None
    )

    # ---- Expiry ----
    expiry_date = getattr(receipt, "expiry_date", None)
    manufacture_date = getattr(receipt, "manufacture_date", None)

    days_to_expiry = (expiry_date - snapshot_date).days if expiry_date else None
    is_expired = days_to_expiry is not None and days_to_expiry < 0
    is_expiring_soon = (
        days_to_expiry is not None and 0 <= days_to_expiry <= 90
    )
    shelf_life_days = (
        (expiry_date - manufacture_date).days
        if expiry_date and manufacture_date
        else None
    )

    # ---- Age ----
    created = getattr(receipt, "created", None)
    age_days = (snapshot_date - created.date()).days if created else None
    aging_bucket = _aging_bucket(age_days)

    # ---- Placement (BooleanField on retailer, CharField on wholesaler) ----
    in_placement_raw = getattr(receipt, "in_placement", False)
    in_placement = _to_bool(in_placement_raw)

    # ---- is_active (CharField "true"/"false" on both) ----
    is_active = _to_bool(getattr(receipt, "is_active", "true"))

    # ---- Construct ----
    return InventorySnapshot(
        entity_id=receipt.entity_id,
        snapshot_date=snapshot_date,
        tier=tier,
        wholesaler_receipt=receipt if tier == "WHOLESALER" else None,
        retailer_receipt=receipt if tier == "RETAILER" else None,
        product_id=receipt.product_id,
        received_from_entity_id=getattr(receipt, "received_from_id", None),
        batch=getattr(receipt, "batch", None),
        received_unit_quantity=received_qty,
        current_unit_quantity=current_qty,
        reserved_unit_quantity=reserved_qty,
        consumed_unit_quantity=consumed_qty,
        units_per_pack=units_per_pack,
        unit_buying_price=unit_buying_price,
        allocated_shipping_per_unit=allocated_shipping,
        landed_unit_cost=landed_unit_cost,
        final_unit_selling_price=final_selling,
        lot_value_at_cost=lot_value_at_cost,
        lot_value_at_sale=lot_value_at_sale,
        potential_margin=potential_margin,
        margin_pct=margin_pct,
        manufacture_date=manufacture_date,
        expiry_date=expiry_date,
        days_to_expiry=days_to_expiry,
        age_days=age_days,
        shelf_life_days=shelf_life_days,
        is_expired=is_expired,
        is_expiring_soon=is_expiring_soon,
        aging_bucket=aging_bucket,
        in_placement=in_placement,
        is_active=is_active,
    )


# =====================================================================
# Helpers
# =====================================================================

def _aging_bucket(age_days: int | None) -> str | None:
    if age_days is None:
        return None
    if age_days <= 30:
        return "fresh"
    if age_days <= 90:
        return "normal"
    if age_days <= 180:
        return "aging"
    if age_days <= 365:
        return "slow"
    return "dead"


def _to_int(value) -> int:
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _to_int_or_none(value) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_decimal(value) -> Decimal:
    if value is None:
        return Decimal("0.00")
    try:
        return Decimal(str(value))
    except (TypeError, ValueError, ArithmeticError):
        return Decimal("0.00")


def _to_bool(value) -> bool:
    if value is True:
        return True
    if value is False:
        return False
    if isinstance(value, str):
        return value.lower() == "true"
    return bool(value)