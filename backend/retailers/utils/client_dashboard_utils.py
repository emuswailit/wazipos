# retailers/utils/client_dashboard_utils.py
#
# get_client_dashboard — aggregated dashboard for the authenticated
# user (the "client" persona: shopper + shop owner + wholesaler
# owner in one).
#
# Buckets:
#   orders.self                → orders the user placed as a customer
#   orders.shop                → orders OTHER customers placed at
#                                retail shops the user owns
#   prescriptions.self         → prescriptions the user created
#   prescriptions.shop         → prescriptions OTHER users created at
#                                retail shops the user owns
#   owned_wholesalers.general  → RetailerOrders routed at the user's
#                                GeneralWholesaler entities (if any)
#   owned_wholesalers.pharmaceutical
#                              → RetailerOrders routed at the user's
#                                PharmaceuticalWholesaler entities
#   inventory                  → item count + total value for the
#                                entity the user is "currently logged
#                                into" (entity_id param). Always
#                                present; retail + wholesale slots
#                                both emitted, zeros if the entity
#                                type doesn't apply.
#
# All monetary values are strings of Decimal, quantized to 2dp by the
# underlying model save() handlers. Counts are ints. Empty buckets
# return 0 / "0.00" / {} / [] — never null — so the client can render
# unconditionally.
#
# Public entry point: get_client_dashboard(user, entity_id=None)

from decimal import Decimal
from datetime import timedelta

from django.db.models import (
    Count,
    Sum,
    Q,
    Avg,
    F,
    DecimalField,
    ExpressionWrapper,
)
from django.utils import timezone

from authentication.models import Entities
from retailers import models
from wholesalers.models import RetailerOrders, WholesalerReceipts


# ── Bucket tuning ──────────────────────────────────────────
_TERMINAL_CUSTOMER_ORDER_STATUSES = (
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
)
_TERMINAL_RETAILER_ORDER_STATUSES = (
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
    "RECEIVED",
)
_OPEN_PRESCRIPTION_STATUSES = ("QUEUING",)
_RECENT_LIMIT = 5
_ENTITY_LIST_LIMIT = 20

# ── Entity discriminator ───────────────────────────────────
_ENTITY_TYPE_FIELD = "entity_type"
_RETAIL = "Retail"
_GENERAL_WS = "GeneralWholesaler"
_PHARMA_WS = "PharmaceuticalWholesaler"

# ── RetailerOrders shape ───────────────────────────────────
_RETAILER_ORDER_WS_FK = "wholesaler"
_RETAILER_ORDER_TOTAL_FIELD = "final_price_total"
_RETAILER_ORDER_COUNTERPARTY_FK = "retailer"
_RETAILER_ORDER_DOC_NUMBER_FK = "document_number"

# ── CustomerOrders shape ───────────────────────────────────
_CUSTOMER_ORDER_TOTAL_FIELD = "order_net_price_total"
_CUSTOMER_ORDER_DOC_NUMBER_FK = "order_number"
_CUSTOMER_ORDER_COUNTERPARTY_FK = "entity"


# ============================================================
# Small helpers
# ============================================================

def _dec(v):
    return str(v if v is not None else Decimal("0.00"))


def _int(v):
    return int(v or 0)


def _period_starts(now):
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)
    year_start = today_start.replace(month=1, day=1)
    return today_start, week_start, month_start, year_start


def _doc_number_str(obj, fk_name):
    doc = getattr(obj, fk_name, None)
    if not doc:
        return None
    return (
        getattr(doc, "number", None)
        or getattr(doc, "value", None)
        or getattr(doc, "code", None)
        or str(doc.id)
    )


# ============================================================
# Order aggregates
# ============================================================

def _bucketed_agg(qs, sum_field, now):
    today_start, week_start, month_start, year_start = _period_starts(now)

    agg = qs.aggregate(
        count_all=Count("id"),
        count_today=Count("id", filter=Q(created__gte=today_start)),
        count_week=Count("id", filter=Q(created__gte=week_start)),
        count_month=Count("id", filter=Q(created__gte=month_start)),
        count_year=Count("id", filter=Q(created__gte=year_start)),

        spend_all=Sum(sum_field),
        spend_today=Sum(sum_field, filter=Q(created__gte=today_start)),
        spend_week=Sum(sum_field, filter=Q(created__gte=week_start)),
        spend_month=Sum(sum_field, filter=Q(created__gte=month_start)),
        spend_year=Sum(sum_field, filter=Q(created__gte=year_start)),

        avg_today=Avg(sum_field, filter=Q(created__gte=today_start)),
        avg_week=Avg(sum_field, filter=Q(created__gte=week_start)),
        avg_month=Avg(sum_field, filter=Q(created__gte=month_start)),
        avg_year=Avg(sum_field, filter=Q(created__gte=year_start)),
    )

    return {
        "today": {
            "count": _int(agg["count_today"]),
            "spend": _dec(agg["spend_today"]),
            "average": _dec(agg["avg_today"]),
        },
        "week": {
            "count": _int(agg["count_week"]),
            "spend": _dec(agg["spend_week"]),
            "average": _dec(agg["avg_week"]),
        },
        "month": {
            "count": _int(agg["count_month"]),
            "spend": _dec(agg["spend_month"]),
            "average": _dec(agg["avg_month"]),
        },
        "year": {
            "count": _int(agg["count_year"]),
            "spend": _dec(agg["spend_year"]),
            "average": _dec(agg["avg_year"]),
        },
        "all": {
            "count": _int(agg["count_all"]),
            "spend": _dec(agg["spend_all"]),
        },
    }


def _order_status_breakdown(qs):
    return {
        (r["status"] or "UNKNOWN"): r["n"]
        for r in qs.values("status").annotate(n=Count("id"))
    }


def _recent_customer_order_rows(qs):
    rows = (
        qs.order_by("-created")
        .select_related(_CUSTOMER_ORDER_COUNTERPARTY_FK,
                        _CUSTOMER_ORDER_DOC_NUMBER_FK)[:_RECENT_LIMIT]
    )
    out = []
    for o in rows:
        counterparty = getattr(o, _CUSTOMER_ORDER_COUNTERPARTY_FK, None)
        out.append({
            "id": str(o.id),
            "order_number": _doc_number_str(
                o, _CUSTOMER_ORDER_DOC_NUMBER_FK,
            ),
            "entity_name": (
                getattr(counterparty, "title", None)
                if counterparty else None
            ),
            "status": o.status,
            "total": str(
                getattr(o, _CUSTOMER_ORDER_TOTAL_FIELD, None)
                or Decimal("0.00")
            ),
            "created": o.created.isoformat(),
        })
    return out


def _recent_retailer_order_rows(qs):
    rows = (
        qs.order_by("-created")
        .select_related(_RETAILER_ORDER_COUNTERPARTY_FK,
                        _RETAILER_ORDER_DOC_NUMBER_FK)[:_RECENT_LIMIT]
    )
    out = []
    for o in rows:
        counterparty = getattr(o, _RETAILER_ORDER_COUNTERPARTY_FK, None)
        out.append({
            "id": str(o.id),
            "order_number": _doc_number_str(
                o, _RETAILER_ORDER_DOC_NUMBER_FK,
            ),
            "entity_name": (
                getattr(counterparty, "title", None)
                if counterparty else None
            ),
            "status": o.status,
            "total": str(
                getattr(o, _RETAILER_ORDER_TOTAL_FIELD, None)
                or Decimal("0.00")
            ),
            "created": o.created.isoformat(),
        })
    return out


def _decorate_customer_bucket(bucket, qs):
    bucket["status_breakdown"] = _order_status_breakdown(qs)
    bucket["open_orders"] = qs.exclude(
        status__in=_TERMINAL_CUSTOMER_ORDER_STATUSES,
    ).count()
    bucket["recent"] = _recent_customer_order_rows(qs)
    return bucket


def _decorate_retailer_bucket(bucket, qs):
    bucket["status_breakdown"] = _order_status_breakdown(qs)
    bucket["open_orders"] = qs.exclude(
        status__in=_TERMINAL_RETAILER_ORDER_STATUSES,
    ).count()
    bucket["recent"] = _recent_retailer_order_rows(qs)
    return bucket


# ============================================================
# Prescription aggregates (count-only)
# ============================================================

def _bucketed_counts(qs, now):
    today_start, week_start, month_start, year_start = _period_starts(now)

    agg = qs.aggregate(
        count_all=Count("id"),
        count_today=Count("id", filter=Q(created__gte=today_start)),
        count_week=Count("id", filter=Q(created__gte=week_start)),
        count_month=Count("id", filter=Q(created__gte=month_start)),
        count_year=Count("id", filter=Q(created__gte=year_start)),
    )

    return {
        "today": {"count": _int(agg["count_today"])},
        "week":  {"count": _int(agg["count_week"])},
        "month": {"count": _int(agg["count_month"])},
        "year":  {"count": _int(agg["count_year"])},
        "all":   {"count": _int(agg["count_all"])},
    }


def _decorate_rx_bucket(bucket, qs):
    bucket["status_breakdown"] = {
        (r["status"] or "UNKNOWN"): r["n"]
        for r in qs.values("status").annotate(n=Count("id"))
    }
    bucket["nature_breakdown"] = {
        (r["nature"] or "UNKNOWN"): r["n"]
        for r in qs.values("nature").annotate(n=Count("id"))
    }
    bucket["open_count"] = qs.filter(
        status__in=_OPEN_PRESCRIPTION_STATUSES,
    ).count()
    bucket["recent"] = [
        {
            "id": str(rx.id),
            "patient_name": rx.patient_name,
            "status": rx.status,
            "nature": rx.nature,
            "entity_name": rx.entity.title if rx.entity else None,
            "created": rx.created.isoformat(),
        }
        for rx in (
            qs.order_by("-created")
            .select_related("entity")[:_RECENT_LIMIT]
        )
    ]
    return bucket


# ============================================================
# Inventory summaries (for the current entity)
# ============================================================

def _empty_inventory_slot():
    return {
        "item_count": 0,
        "total_value": "0.00",
    }


def _retail_inventory_summary(entity):
    """
    Retail on-hand: distinct product count and total selling value
    across active receipts (current_unit_quantity > 0).
    """
    active = models.RetailerReceipts.objects.filter(
        entity=entity,
        current_unit_quantity__gt=0,
    )

    agg = active.aggregate(
        item_count=Count("product", distinct=True),
        total_value=Sum(
            ExpressionWrapper(
                F("current_unit_quantity") * F("final_unit_selling_price"),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        ),
    )

    return {
        "item_count": _int(agg["item_count"]),
        "total_value": _dec(agg["total_value"]),
    }


def _wholesale_inventory_summary(entity):
    """
    Wholesale on-hand: distinct product count and total selling
    value across active receipts.

    NOTE: field names on WholesalerReceipts inferred from the
    retailer side. Verify `current_unit_quantity` and
    `unit_selling_price` exist; swap in the real names if not.
    """
    active = WholesalerReceipts.objects.filter(
        entity=entity,
        current_unit_quantity__gt=0,
    )

    agg = active.aggregate(
        item_count=Count("product", distinct=True),
        total_value=Sum(
            ExpressionWrapper(
                F("current_unit_quantity") * F("unit_selling_price"),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        ),
    )

    return {
        "item_count": _int(agg["item_count"]),
        "total_value": _dec(agg["total_value"]),
    }


def _build_inventory_section(current_entity):
    """
    Always returns a fully populated structure. When current_entity
    is None, both slots come back as zeros — so the client can
    render the card regardless of context.
    """
    if current_entity is None:
        return {
            "entity": {"id": None, "name": None, "type": None},
            "retail": _empty_inventory_slot(),
            "wholesale": _empty_inventory_slot(),
        }

    entity_type = getattr(current_entity, _ENTITY_TYPE_FIELD, None)
    is_retail = entity_type == _RETAIL
    is_wholesaler = entity_type in (_GENERAL_WS, _PHARMA_WS)

    return {
        "entity": {
            "id": str(current_entity.id),
            "name": getattr(current_entity, "title", None) or "",
            "type": entity_type,
        },
        "retail": (
            _retail_inventory_summary(current_entity)
            if is_retail
            else _empty_inventory_slot()
        ),
        "wholesale": (
            _wholesale_inventory_summary(current_entity)
            if is_wholesaler
            else _empty_inventory_slot()
        ),
    }


# ============================================================
# Entities
# ============================================================

def _entity_rows(qs):
    return [
        {
            "id": str(e.id),
            "name": getattr(e, "title", None) or "",
        }
        for e in qs.order_by("title")[:_ENTITY_LIST_LIMIT]
    ]


# ============================================================
# Public entry point
# ============================================================

def get_client_dashboard(user, entity_id=None):
    """
    `entity_id` is the entity the user is "currently logged into"
    on the client. Optional. When provided and owned by the user,
    the `inventory` section is populated with that entity's
    receipt-level summary. Otherwise the section returns zeros.
    """
    now = timezone.localtime(timezone.now())

    # ── Currently-logged-in entity (inventory scope) ──────
    current_entity = None
    if entity_id:
        current_entity = Entities.objects.filter(
            id=entity_id, owner=user,
        ).first()

    # ── Owned entities, split by type ──────────────────────
    owned = Entities.objects.filter(owner=user)

    owned_retail = owned.filter(**{_ENTITY_TYPE_FIELD: _RETAIL})
    owned_general_ws = owned.filter(**{_ENTITY_TYPE_FIELD: _GENERAL_WS})
    owned_pharma_ws = owned.filter(**{_ENTITY_TYPE_FIELD: _PHARMA_WS})

    owned_retail_ids = list(owned_retail.values_list("id", flat=True))
    owned_general_ws_ids = list(owned_general_ws.values_list("id", flat=True))
    owned_pharma_ws_ids = list(owned_pharma_ws.values_list("id", flat=True))

    # ── Orders ─────────────────────────────────────────────
    self_qs = models.CustomerOrders.objects.filter(customer=user)
    self_bucket = _decorate_customer_bucket(
        _bucketed_agg(self_qs, _CUSTOMER_ORDER_TOTAL_FIELD, now),
        self_qs,
    )

    shop_qs = models.CustomerOrders.objects.filter(
        entity_id__in=owned_retail_ids,
    ).exclude(customer=user)
    shop_bucket = _decorate_customer_bucket(
        _bucketed_agg(shop_qs, _CUSTOMER_ORDER_TOTAL_FIELD, now),
        shop_qs,
    )

    # ── Prescriptions ──────────────────────────────────────
    self_rx_qs = models.Prescriptions.objects.filter(created_by=user)
    self_rx_bucket = _decorate_rx_bucket(
        _bucketed_counts(self_rx_qs, now),
        self_rx_qs,
    )

    shop_rx_qs = (
        models.Prescriptions.objects
        .filter(entity_id__in=owned_retail_ids)
        .exclude(created_by=user)
    )
    shop_rx_bucket = _decorate_rx_bucket(
        _bucketed_counts(shop_rx_qs, now),
        shop_rx_qs,
    )

    # ── Owned wholesalers ─────────────────────────────────
    owned_wholesalers = {}

    if owned_general_ws_ids:
        general_qs = RetailerOrders.objects.filter(
            **{f"{_RETAILER_ORDER_WS_FK}_id__in": owned_general_ws_ids},
        )
        owned_wholesalers["general"] = _decorate_retailer_bucket(
            _bucketed_agg(
                general_qs, _RETAILER_ORDER_TOTAL_FIELD, now,
            ),
            general_qs,
        )
        owned_wholesalers["general"]["entity_type"] = _GENERAL_WS

    if owned_pharma_ws_ids:
        pharma_qs = RetailerOrders.objects.filter(
            **{f"{_RETAILER_ORDER_WS_FK}_id__in": owned_pharma_ws_ids},
        )
        owned_wholesalers["pharmaceutical"] = _decorate_retailer_bucket(
            _bucketed_agg(
                pharma_qs, _RETAILER_ORDER_TOTAL_FIELD, now,
            ),
            pharma_qs,
        )
        owned_wholesalers["pharmaceutical"]["entity_type"] = _PHARMA_WS

    # ── Entities section ──────────────────────────────────
    entities = {
        "retail": {
            "count": len(owned_retail_ids),
            "items": _entity_rows(owned_retail),
        },
    }
    if owned_general_ws_ids:
        entities["general_wholesalers"] = {
            "count": len(owned_general_ws_ids),
            "items": _entity_rows(owned_general_ws),
        }
    if owned_pharma_ws_ids:
        entities["pharmaceutical_wholesalers"] = {
            "count": len(owned_pharma_ws_ids),
            "items": _entity_rows(owned_pharma_ws),
        }

    return {
        "orders": {
            "self": self_bucket,
            "shop": shop_bucket,
        },
        "prescriptions": {
            "self": self_rx_bucket,
            "shop": shop_rx_bucket,
        },
        "owned_wholesalers": owned_wholesalers,
        "entities": entities,
        "inventory": _build_inventory_section(current_entity),
        "generated_at": now.isoformat(),
    }