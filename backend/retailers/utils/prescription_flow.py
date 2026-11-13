"""
Prescription flow
=================

1. A customer uploads a prescription image, optionally choosing a pharmacy
   (that pharmacy then gets a quotation request).
2. It is digitized by the system (AI), an admin, or the staff of a pharmacy that
   has it. Digitizing = the shared list of PrescriptionItems (preparation and/or
   product, prescribed quantity, `allow_partial_purchase`, dosing details).
3. A prescription is handled by exactly ONE pharmacy (for now): the one chosen
   at upload, or the one its owner forwards it to once digitized
   (forward_for_quotation). It can't be sent to another afterwards.
4. That pharmacy quotes: one open PrescriptionQuotations row, backed by its own
   CustomerOrders; each order line (CustomerOrderItems) points at the
   prescription item it prices (`prescription_item`). Admins have no inventory
   and never quote.
5. The customer picks lines from the quotation and pays by mobile money. Items
   that don't allow partial purchase must be bought in full; the others can be
   bought in parts, over several purchases. Every purchase is a quotation of its own
   (PrescriptionQuotations with `parent` = the pharmacy's open quotation) with
   its own CustomerOrders holding exactly what was bought. When it is paid
   (settle_purchase) the items' dispensed / balance quantities are updated and
   every open quotation is cut down to what is still to be dispensed, so the
   next purchase can only be for the balance.
6. Fulfilment: a pharmacy can insist the patient collects in person
   (`pickup_required`: further advice, guided administration; no shipping).
   Otherwise the customer chooses at checkout, and pays shipping for delivery.
7. A paid purchase puts the medicines on the patient's dosing schedule
   (prescription_schedule.py).

Every public function returns (errors, result) like the rest of retail_prescriptions_utils.
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from authentication.models import Entities
from authentication.utils.utils import generate_document_number, generate_reference_number
from core.constants import EntityType
from drugs.models import Frequency, Routes
from employees.validators import employees_models_validators
from payments.validators import payments_models_validators
from products.models import Preparation, Products

from .. import models
from ..models import RetailerReceipts

logger = logging.getLogger(__name__)

PHARMACY = EntityType.PHARMACEUTICAL_RETAILER.value
CLOSED_STATUSES = ("CLOSED", "CANCELLED", "DISPENSED")
LOCKED_QUOTATION_STATUSES = ("CHECKOUT",)
# A medicine prescribed for this many days or more is long-term (a month's
# supply is commonly 28 days): the patient is advised to check for a follow-up
# appointment with the prescriber.
LONG_TERM_DAYS = 28
FOLLOW_UP_ADVICE = (
    "This prescription has long-term medicine (a month or longer). Check whether you have a "
    "follow-up appointment with your prescriber, and book one if you don't."
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _present(data, key):
    return key in data and data[key] is not None and str(data[key]).strip() != ""


def _as_bool(value):
    return str(value).strip().lower() in ("true", "1", "yes", "on")


def _as_int(value, label):
    try:
        return [], int(str(value).strip())
    except (TypeError, ValueError):
        return [f"{label} must be a whole number"], None


def is_admin(user):
    return bool(getattr(user, "is_staff", False) or getattr(user, "is_superuser", False))


def pharmacy_of(user):
    entity = getattr(user, "entity", None)
    return entity if entity is not None and entity.entity_type == PHARMACY else None


def _get_prescription(data, key="prescription"):
    if not _present(data, key):
        return ["Prescription ID is required"], None
    prescription = models.Prescriptions.objects.filter(id=data[key]).first()
    if not prescription:
        return ["No prescription for provided ID"], None
    return [], prescription


def _not_editable(prescription):
    if prescription.is_closed == "true" or prescription.status in CLOSED_STATUSES:
        return [f"Prescription is already {prescription.status.lower()}"]
    return []


def has_long_term_items(prescription):
    return models.PrescriptionItems.objects.filter(prescription=prescription, days__gte=LONG_TERM_DAYS).exists()


def is_fully_dispensed(prescription):
    """
    Every medicine on the prescription has been bought in full (paid for).
    A medicine without a prescribed quantity counts once any of it is bought;
    one that was never bought (e.g. never quoted) keeps the prescription open.
    """
    items = list(models.PrescriptionItems.objects.filter(prescription=prescription))
    if not items:
        return False
    for item in items:
        bought = _paid_quantity(item)
        required = item.required_unit_quantity or 0
        if bought < 1 or (required and bought < required):
            return False
    return True


def quotation_for(prescription, entity, create=False, requested_by=None):
    """The pharmacy's open quotation (not one of the purchases made from it)."""
    quotation = models.PrescriptionQuotations.objects.filter(
        prescription=prescription, entity=entity, parent__isnull=True
    ).first()
    if quotation or not create:
        return quotation
    return models.PrescriptionQuotations.objects.create(
        prescription=prescription, entity=entity, requested_by=requested_by, status="REQUESTED"
    )


def pharmacy_has_access(user, prescription):
    pharmacy = pharmacy_of(user)
    if not pharmacy:
        return False
    return prescription.entity_id == pharmacy.id or models.PrescriptionQuotations.objects.filter(
        prescription=prescription, entity=pharmacy
    ).exists()


def can_digitize(user, prescription):
    return is_admin(user) or pharmacy_has_access(user, prescription)


def _paid_quantity(item, exclude_order_id=None):
    """Units of `item` already bought (lines in paid orders)."""
    qs = models.CustomerOrderItems.objects.filter(prescription_item=item, customer_order__is_paid="true")
    if exclude_order_id:
        qs = qs.exclude(customer_order_id=exclude_order_id)
    return int(qs.aggregate(q=Sum("quantity"))["q"] or 0)


def _unit_price(receipt):
    final = receipt.final_unit_selling_price
    if final is not None and Decimal(final) > 0:
        return Decimal(final)
    return Decimal(receipt.unit_selling_price or 0)


def _receipt_matches_item(receipt, item):
    if item.product_id:
        return receipt.product_id == item.product_id
    if item.preparation_id:
        return bool(receipt.product_id and receipt.product.preparation_id == item.preparation_id)
    return False


# ---------------------------------------------------------------------------
# Quotation orders / lines (pharmacy staff only)
# ---------------------------------------------------------------------------

def _ensure_quote_order(quotation, user):
    if quotation.customer_order_id:
        return quotation.customer_order
    prescription = quotation.prescription
    order = models.CustomerOrders.objects.create(
        prescription=prescription,
        entity=quotation.entity,
        owner=user,  # staff own prescription orders (see project notes)
        user=user,
        origin_point=prescription.origin_point,
        destination_point=prescription.origin_point,
        order_number=generate_document_number(quotation.entity, user, "CUSTOMERORDER"),
        reference_number=generate_reference_number(quotation.entity, user),
        order_type="PRESCRIPTION",
        status="PROCESSING",
    )
    quotation.customer_order = order
    quotation.save(update_fields=["customer_order", "updated"])
    return order


def _quotation_locked(quotation):
    order = quotation.customer_order
    return quotation.status in LOCKED_QUOTATION_STATUSES or (order is not None and order.is_paid == "true")


def _validate_quote_quantity(item, quantity):
    required = item.required_unit_quantity or 0
    if quantity < 1:
        return ["Quoted quantity must be at least 1"]
    if required and quantity > required:
        return [f"Can't quote more than the prescribed {required}"]
    if required and not item.allow_partial_purchase and quantity != required:
        return [f"This medicine can't be bought partially: quote the full {required}"]
    return []


def upsert_quote_line(item, receipt, quantity, user):
    """The user's pharmacy quotes `quantity` of `item` from its batch `receipt`."""
    pharmacy = pharmacy_of(user)
    if not pharmacy:
        return ["Only pharmacy staff can quote; admins have no inventory"], None
    if receipt.entity_id != pharmacy.id:
        return ["Stock item belongs to another pharmacy"], None
    if not _receipt_matches_item(receipt, item):
        return ["That stock item doesn't match this medicine"], None
    errors = _validate_quote_quantity(item, quantity)
    if errors:
        return errors, None
    # Only what hasn't been dispensed yet can be quoted.
    dispensed = _paid_quantity(item)
    if dispensed and not item.allow_partial_purchase:
        return ["This medicine has already been bought"], None
    if dispensed and item.required_unit_quantity and quantity > item.required_unit_quantity - dispensed:
        left = max(0, item.required_unit_quantity - dispensed)
        return [f"{dispensed} already dispensed: only {left} left to quote"], None
    if receipt.current_unit_quantity < quantity:
        return [f"Only {receipt.current_unit_quantity} in stock for batch {receipt.batch or ''}".strip()], None

    quotation = quotation_for(item.prescription, pharmacy, create=True)
    if _quotation_locked(quotation):
        return ["The customer has already checked out this quotation"], None

    order = _ensure_quote_order(quotation, user)
    price = _unit_price(receipt)
    line = models.CustomerOrderItems.objects.filter(customer_order=order, prescription_item=item).first()
    if line is None:
        line = models.CustomerOrderItems(customer_order=order, prescription_item=item, owner=user, entity=pharmacy)
    line.retailer_receipt = receipt
    line.unit_of_issue = item.unit_of_issue or receipt.unit_of_receipt or line.unit_of_issue
    line.quantity = quantity
    line.purchased_quantity = quantity
    line.total_quantity = quantity
    line.item_price = price
    line.item_price_total = price * quantity
    line.save()  # recalculates the order totals
    return [], quotation


def remove_quote_line(item, user):
    pharmacy = pharmacy_of(user)
    quotation = quotation_for(item.prescription, pharmacy) if pharmacy else None
    if not quotation or not quotation.customer_order_id:
        return [], None
    if _quotation_locked(quotation):
        return ["The customer has already checked out this quotation"], None
    models.CustomerOrderItems.objects.filter(customer_order=quotation.customer_order, prescription_item=item).delete()
    return [], quotation


def _drop_invalid_unpaid_lines(item):
    """After the prescribed quantity / partial flag change, drop quotes that no longer fit."""
    lines = models.CustomerOrderItems.objects.filter(prescription_item=item).exclude(customer_order__is_paid="true")
    for line in lines:
        if _validate_quote_quantity(item, int(line.quantity or 0)):
            line.delete()


# ---------------------------------------------------------------------------
# Digitizing: items (admin or pharmacy staff with access)
# ---------------------------------------------------------------------------

def _read_item_fields(data):
    """Validated optional fields shared by create/update. Returns (errors, fields)."""
    fields = {}
    if _present(data, "product"):
        product = Products.objects.filter(id=data["product"]).first()
        if not product:
            return ["No product for provided ID exists"], None
        fields["product"] = product
    if _present(data, "preparation"):
        preparation = Preparation.objects.filter(id=data["preparation"]).first()
        if not preparation:
            return ["No preparation for provided ID exists"], None
        fields["preparation"] = preparation
    if _present(data, "route"):
        route = Routes.objects.filter(id=data["route"]).first()
        if not route:
            return ["No route for provided ID exists"], None
        fields["route"] = route
    if _present(data, "frequency"):
        frequency = Frequency.objects.filter(id=data["frequency"]).first()
        if not frequency:
            return ["No frequency for provided ID exists"], None
        fields["frequency"] = frequency
    if _present(data, "dose"):
        fields["dose"] = str(data["dose"]).strip()
    if _present(data, "days"):
        errors, days = _as_int(data["days"], "Duration in days")
        if errors:
            return errors, None
        fields["days"] = days
    if _present(data, "required_unit_quantity"):
        errors, qty = _as_int(data["required_unit_quantity"], "Quantity")
        if errors:
            return errors, None
        if qty < 0:
            return ["Quantity can't be negative"], None
        fields["required_unit_quantity"] = qty
    if _present(data, "unit_of_issue"):
        fields["unit_of_issue"] = data["unit_of_issue"]
    if "instruction" in data and data["instruction"] is not None:
        fields["instruction"] = str(data["instruction"]).strip() or None
    if "allow_partial_purchase" in data and data["allow_partial_purchase"] is not None:
        fields["allow_partial_purchase"] = _as_bool(data["allow_partial_purchase"])
    return [], fields


def _quote_from_data(item, data, user):
    """Pharmacy forms may attach a batch + quantity: quote it in the same step."""
    if not _present(data, "retailer_receipt"):
        return []
    if not pharmacy_of(user):
        return ["Admins can't quote: they have no inventory"]
    receipt = RetailerReceipts.objects.filter(id=data["retailer_receipt"]).first()
    if not receipt:
        return ["No stock item for provided ID exists"]
    quantity = item.required_unit_quantity or 0
    if _present(data, "quote_quantity"):
        errors, quantity = _as_int(data["quote_quantity"], "Quoted quantity")
        if errors:
            return errors
    errors, _ = upsert_quote_line(item, receipt, quantity, user)
    return errors


class _Rollback(Exception):
    def __init__(self, errors):
        super().__init__("; ".join(errors))
        self.errors = errors


def create_prescription_item(data, user):
    errors, prescription = _get_prescription(data)
    if errors:
        return errors, None
    if not can_digitize(user, prescription):
        return ["You can't digitize this prescription"], None
    errors = _not_editable(prescription)
    if errors:
        return errors, None

    errors, fields = _read_item_fields(data)
    if errors:
        return errors, None
    product, preparation = fields.get("product"), fields.get("preparation")
    if not product and not preparation:
        return ["Select a preparation, a product, or both"], None
    if product and preparation is None and product.preparation_id:
        fields["preparation"] = product.preparation

    same = {"product": product} if product else {"product__isnull": True, "preparation": preparation}
    if models.PrescriptionItems.objects.filter(prescription=prescription, **same).exists():
        return ["Item is already added to prescription"], None

    employee = employees_models_validators.validate_employee(user) if pharmacy_of(user) else None
    try:
        with transaction.atomic():
            item = models.PrescriptionItems.objects.create(
                prescription=prescription,
                entity=prescription.entity,
                owner=user,
                created_by=employee,
                prescribed_by=employee,
                balance_unit_quantity=fields.get("required_unit_quantity", 0),
                **fields,
            )
            errors = _quote_from_data(item, data, user)
            if errors:
                raise _Rollback(errors)
    except _Rollback as e:
        return e.errors, None
    except Exception as e:
        logger.exception("Create prescription item failed")
        return [str(e)], None
    return [], prescription


def update_prescription_item(data, user):
    if not _present(data, "prescription_item"):
        return ["Prescription item ID is required"], None
    item = models.PrescriptionItems.objects.filter(id=data["prescription_item"]).first()
    if not item:
        return ["Prescription item with provided ID not found"], None
    prescription = item.prescription
    if not can_digitize(user, prescription):
        return ["You can't edit this prescription"], None
    errors = _not_editable(prescription)
    if errors:
        return errors, None

    errors, fields = _read_item_fields(data)
    if errors:
        return errors, None
    for key, value in fields.items():
        setattr(item, key, value)
    if not item.product_id and not item.preparation_id:
        return ["Select a preparation, a product, or both"], None
    if "required_unit_quantity" in fields:
        paid = _paid_quantity(item)
        if item.required_unit_quantity and item.required_unit_quantity < paid:
            return [f"{paid} units are already paid for; the quantity can't go below that"], None
        item.balance_unit_quantity = max(0, (item.required_unit_quantity or 0) - (item.issued_unit_quantity or 0))

    try:
        with transaction.atomic():
            item.save()
            if "required_unit_quantity" in fields or "allow_partial_purchase" in fields:
                _drop_invalid_unpaid_lines(item)
            errors = _quote_from_data(item, data, user)
            if errors:
                raise _Rollback(errors)
    except _Rollback as e:
        return e.errors, None
    except Exception as e:
        logger.exception("Update prescription item failed")
        return [str(e)], None
    return [], item


def remove_prescription_item(data, user):
    if not _present(data, "prescription_item"):
        return ["Prescription item ID is required"], None
    item = models.PrescriptionItems.objects.filter(id=data["prescription_item"]).first()
    if not item:
        return ["No prescription item for provided ID"], None
    prescription = item.prescription
    if not can_digitize(user, prescription):
        return ["You can't edit this prescription"], None
    errors = _not_editable(prescription)
    if errors:
        return errors, None
    if _paid_quantity(item):
        return ["This medicine has already been paid for and can't be removed"], None
    with transaction.atomic():
        for line in models.CustomerOrderItems.objects.filter(prescription_item=item):
            line.delete()  # keeps the order totals right
        item.delete()
    return [], prescription


# ---------------------------------------------------------------------------
# Digitized / quotation submitted / forwarded
# ---------------------------------------------------------------------------

def _auto_quote_from_stock(prescription, pharmacy, user):
    """
    Quote every not-yet-quoted medicine the pharmacy has stock for: the
    soonest-expiring unexpired batch that covers the prescribed quantity, or,
    when partial purchase is allowed, the largest batch it has. Medicines the
    staff already quoted by hand are left as they are; medicines without a
    prescribed quantity or without stock are skipped.
    """
    quotation = quotation_for(prescription, pharmacy)
    if quotation and _quotation_locked(quotation):
        return
    quoted_ids = set()
    if quotation and quotation.customer_order_id:
        quoted_ids = set(
            models.CustomerOrderItems.objects.filter(customer_order=quotation.customer_order)
            .values_list("prescription_item_id", flat=True)
        )
    today = timezone.localdate()
    for item in models.PrescriptionItems.objects.filter(prescription=prescription):
        dispensed = _paid_quantity(item)
        if dispensed and not item.allow_partial_purchase:
            continue  # already bought in full
        # Quote what is still to be dispensed.
        required = (item.required_unit_quantity or 0) - dispensed
        if item.id in quoted_ids or required < 1:
            continue
        batches = list(_batches_for_item(pharmacy, item).filter(Q(expiry_date__isnull=True) | Q(expiry_date__gte=today)))
        receipt = next((b for b in batches if b.current_unit_quantity >= required), None)
        quantity = required
        if receipt is None and item.allow_partial_purchase and batches:
            receipt = max(batches, key=lambda b: b.current_unit_quantity)
            quantity = min(required, receipt.current_unit_quantity)
        if receipt is None:
            continue
        errors, _ = upsert_quote_line(item, receipt, quantity, user)
        if errors:
            logger.info("Auto-quote skipped item %s: %s", item.id, "; ".join(errors))


# ---------------------------------------------------------------------------
# Fulfilment. The pharmacy either insists the patient collects in person
# (`pickup_required`: further advice / pharmaceutical care; never any shipping)
# or leaves it to the customer, who chooses at checkout: PICKUP (no shipping)
# or DELIVERY (intracity shipping, priced from the pharmacy's location to where
# the prescription was uploaded, is added to what they pay).
# ---------------------------------------------------------------------------

FULFILMENT_METHODS = ("PICKUP", "DELIVERY")


def _read_delivery_method(data):
    """(errors, method): method is None when the request doesn't set one."""
    if not _present(data, "delivery_method"):
        return [], None
    method = str(data["delivery_method"]).strip().upper()
    if method not in FULFILMENT_METHODS:
        return ["Choose collection in person (PICKUP) or delivery (DELIVERY)"], None
    return [], method


def _read_pickup_policy(data):
    """
    The pharmacy's fulfilment decision: (errors, pickup_required, reason).
    pickup_required is None when the request doesn't say. `delivery_method`
    is still accepted from older clients (PICKUP = the patient must collect).
    """
    reason = str(data.get("pickup_reason") or "").strip()[:256]
    if "pickup_required" in data and data["pickup_required"] is not None and str(data["pickup_required"]).strip() != "":
        return [], _as_bool(data["pickup_required"]), reason
    errors, method = _read_delivery_method(data)
    if errors or method is None:
        return errors, None, reason
    return [], method == "PICKUP", reason


def _pharmacy_point(pharmacy):
    from entitylocations.models import Locations

    location = Locations.objects.filter(entity=pharmacy).first()
    return location.point if location and location.point else None


def delivery_available(quotation):
    """Can the customer have this quotation's medicines delivered?"""
    if quotation.pickup_required:
        return False
    return bool(quotation.prescription.origin_point and _pharmacy_point(quotation.entity))


def _price_delivery(pharmacy, prescription, line_quantities, items_total):
    """
    Intracity shipping for [(retailer_receipt_id, quantity)] from the pharmacy
    to where the prescription was uploaded: (errors, cost, distance_km, shop point).
    """
    from .shipping_utils import calculate_shipping_rate

    if not prescription.origin_point:
        return ["Your location is missing on this prescription, so delivery can't be priced. Collect in person instead."], None, None, None
    shop = _pharmacy_point(pharmacy)
    if not shop:
        return ["This pharmacy hasn't set its location, so it can't deliver. Collect in person instead."], None, None, None
    cost, distance_km, _weight, errors = calculate_shipping_rate(
        shop_location=shop,
        destination_point=prescription.origin_point,
        is_pickup=False,  # intracity rate (local_rate_per_km)
        order_items_data=[{"retailer_receipt_id": receipt_id, "quantity": int(qty or 0)} for receipt_id, qty in line_quantities],
        order_value=Decimal(items_total or 0),
    )
    if errors:
        return errors, None, None, None
    return [], Decimal(cost), Decimal(str(distance_km)).quantize(Decimal("0.01")), shop


def _apply_fulfilment(order, method, prescription):
    """Set PICKUP / DELIVERY on an order, price shipping, recalc totals."""
    if method == "PICKUP":
        order.delivery_method = "PICKUP"
        order.shipping_cost = Decimal("0.00")
        order.farness = None
        order.destination_point = None
    else:
        lines = models.CustomerOrderItems.objects.filter(customer_order=order)
        errors, cost, distance_km, shop = _price_delivery(
            order.entity,
            prescription,
            [(l.retailer_receipt_id, l.quantity) for l in lines],
            order.order_price_total,
        )
        if errors:
            return errors
        order.delivery_method = "DELIVERY"
        order.shipping_cost = cost
        order.farness = distance_km
        order.origin_point = shop
        order.destination_point = prescription.origin_point
    order.save(update_fields=["delivery_method", "shipping_cost", "farness", "origin_point", "destination_point", "updated"])
    order.recalculate()
    return []


def _set_pickup_policy(quotation, pickup_required, reason):
    """Store the pharmacy's decision; its quotation order is a price list with no shipping."""
    if pickup_required is not None:
        quotation.pickup_required = pickup_required
        quotation.pickup_reason = reason if pickup_required else ""
        quotation.save(update_fields=["pickup_required", "pickup_reason", "updated"])
    return _apply_fulfilment(quotation.customer_order, "PICKUP", quotation.prescription)


def mark_prescription_digitized(data, user):
    """
    Admin or pharmacy staff finished digitizing. Pharmacy staff quote
    automatically from their own stock (see _auto_quote_from_stock) and the
    quotation goes to the customer when at least one medicine is quoted, with
    the pharmacy's `pickup_required` decision (+ `pickup_reason`); when the
    request doesn't say, the quotation keeps its current one (default: the
    customer chooses).
    """
    from ..prescription_events import notify_digitized, notify_quoted

    errors, prescription = _get_prescription(data)
    if errors:
        return errors, None
    if not can_digitize(user, prescription):
        return ["You can't digitize this prescription"], None
    errors = _not_editable(prescription)
    if errors:
        return errors, None
    if not models.PrescriptionItems.objects.filter(prescription=prescription).exists():
        return ["Add at least one medicine before marking the prescription digitized"], None

    errors, pickup_required, reason = _read_pickup_policy(data)
    if errors:
        return errors, None

    pharmacy = pharmacy_of(user)
    try:
        with transaction.atomic():
            _digitize(prescription, pharmacy, user, (pickup_required, reason), notify_digitized, notify_quoted)
    except _Rollback as e:
        return e.errors, None
    return [], prescription


def _digitize(prescription, pharmacy, user, pickup_policy, notify_digitized, notify_quoted):
    """Runs inside mark_prescription_digitized's transaction; raises _Rollback on errors."""
    first_time = prescription.status != "DIGITIZED"
    prescription.status = "DIGITIZED"
    prescription.digitized_at = prescription.digitized_at or timezone.now()
    if first_time or not prescription.digitized_by_id:
        prescription.digitized_by = user
        prescription.digitized_by_entity = pharmacy
    prescription.save()
    notify_digitized(prescription)

    if pharmacy:
        _auto_quote_from_stock(prescription, pharmacy, user)
    quotation = quotation_for(prescription, pharmacy) if pharmacy else None
    if quotation and quotation.customer_order_id and quotation.customer_order.parent_order.exists():
        errors = _set_pickup_policy(quotation, *pickup_policy)
        if errors:
            raise _Rollback(errors)
        _mark_quoted(quotation, user)
        notify_quoted(quotation)


def _mark_quoted(quotation, user):
    quotation.status = "QUOTED"
    quotation.quoted_at = timezone.now()
    quotation.quoted_by = user
    quotation.save(update_fields=["status", "quoted_at", "quoted_by", "updated"])


def submit_quotation(data, user):
    """
    Pharmacy sends (or re-sends) its quotation to the customer and says whether
    the patient must collect in person (`pickup_required` + `pickup_reason`) or
    may choose delivery at checkout.
    """
    from ..prescription_events import notify_quoted

    errors, prescription = _get_prescription(data)
    if errors:
        return errors, None
    errors, pickup_required, reason = _read_pickup_policy(data)
    if errors:
        return errors, None
    if pickup_required is None:
        return ["Say whether the patient must collect in person or may choose delivery"], None
    pharmacy = pharmacy_of(user)
    if not pharmacy:
        return ["Only pharmacy staff can send quotations"], None
    quotation = quotation_for(prescription, pharmacy)
    if not quotation or not quotation.customer_order_id or not quotation.customer_order.parent_order.exists():
        return ["Quote at least one medicine first"], None
    if _quotation_locked(quotation):
        return ["The customer has already checked out this quotation"], None
    try:
        with transaction.atomic():
            errors = _set_pickup_policy(quotation, pickup_required, reason)
            if errors:
                raise _Rollback(errors)
            _mark_quoted(quotation, user)
            notify_quoted(quotation)
    except _Rollback as e:
        return e.errors, None
    return [], prescription


def forward_for_quotation(data, user):
    """
    The owner sends a digitized prescription that has no pharmacy yet to exactly
    ONE pharmacy, which then handles it end to end (quotes from its stock and
    sources what it lacks). A prescription that already has a pharmacy can't be
    forwarded.
    """
    from ..prescription_events import notify_quotation_requested

    errors, prescription = _get_prescription(data)
    if errors:
        return errors, None
    if prescription.owner_id != user.id:
        return ["Only the prescription's owner can send it to a pharmacy"], None
    errors = _not_editable(prescription)
    if errors:
        return errors, None
    if prescription.status != "DIGITIZED":
        return ["Wait for the prescription to be digitized before sending it to a pharmacy"], None
    if prescription.entity_id or models.PrescriptionQuotations.objects.filter(prescription=prescription).exists():
        return ["This prescription already has a pharmacy handling it"], None

    entity_id = data.get("entity")
    if isinstance(entity_id, (list, tuple)):
        if len(entity_id) != 1:
            return ["Choose exactly one pharmacy"], None
        entity_id = entity_id[0]
    if not entity_id or not str(entity_id).strip():
        return ["Choose a pharmacy"], None
    pharmacy = Entities.objects.filter(id=str(entity_id).strip(), entity_type=PHARMACY).first()
    if not pharmacy:
        return ["Selected pharmacy was not found"], None

    with transaction.atomic():
        prescription.entity = pharmacy
        prescription.save(update_fields=["entity", "updated"])
        quotation = quotation_for(prescription, pharmacy, create=True, requested_by=user)
        notify_quotation_requested(quotation)
    return [], prescription


def search_pharmacies(data, user):
    qs = Entities.objects.filter(entity_type=PHARMACY)
    if _present(data, "search"):
        qs = qs.filter(title__icontains=str(data["search"]).strip())
    return [
        {
            "id": str(e.id),
            "title": e.title,
            "town": getattr(e, "town", "") or "",
            "phone": getattr(e, "phone", "") or "",
        }
        for e in qs.order_by("title")[:50]
    ]


def get_wholesale_sources(data, user):
    """
    For each medicine the pharmacy can't fully supply from its own unexpired
    stock, the pharmaceutical wholesalers that have it in stock and the unit
    price each offers (cheapest first). The pharmacy that handles the
    prescription uses this to source the medicine.
    """
    from wholesalers.models import WholesalerReceipts

    errors, prescription = _get_prescription(data)
    if errors:
        return errors, None
    pharmacy = pharmacy_of(user)
    if not pharmacy or not pharmacy_has_access(user, prescription):
        return ["Only the pharmacy handling this prescription can source its medicines"], None

    today = timezone.localdate()
    unexpired = Q(expiry_date__isnull=True) | Q(expiry_date__gte=today)
    results = []
    items = models.PrescriptionItems.objects.filter(prescription=prescription).select_related("product", "preparation")
    for item in items:
        if not item.product_id and not item.preparation_id:
            continue
        required = item.required_unit_quantity or 0
        own = _batches_for_item(pharmacy, item).filter(unexpired)
        in_stock = int(own.aggregate(q=Sum("current_unit_quantity"))["q"] or 0)
        best_batch = max((b.current_unit_quantity for b in own), default=0)
        if in_stock and (required < 1 or best_batch >= required):
            continue  # one of the pharmacy's own batches covers it

        offers = WholesalerReceipts.objects.filter(
            unexpired,
            entity__entity_type=EntityType.PHARMACEUTICAL_WHOLESALER.value,
            current_unit_quantity__gte=1,
        ).exclude(in_placement="false").select_related("entity", "product")
        if item.product_id:
            offers = offers.filter(product_id=item.product_id)
        else:
            offers = offers.filter(product__preparation_id=item.preparation_id)

        by_wholesaler = {}
        for receipt in offers:
            price = _unit_price(receipt)
            if price <= 0:
                continue
            current = by_wholesaler.get(receipt.entity_id)
            if current is None:
                current = by_wholesaler[receipt.entity_id] = {
                    "wholesaler": str(receipt.entity_id),
                    "wholesaler_title": receipt.entity.title,
                    "available_quantity": 0,
                    "unit_price": None,
                }
            current["available_quantity"] += int(receipt.current_unit_quantity)
            if current["unit_price"] is None or price < Decimal(current["unit_price"]):
                current.update({
                    "unit_price": str(price),
                    "wholesaler_receipt": str(receipt.id),
                    "product": str(receipt.product_id),
                    "product_title": receipt.product.title,
                    "unit": receipt.unit_of_receipt,
                    "expiry_date": receipt.expiry_date.isoformat() if receipt.expiry_date else None,
                })
        sources = sorted(by_wholesaler.values(), key=lambda o: Decimal(o["unit_price"]))[:10]
        results.append({
            "prescription_item": str(item.id),
            "item_title": item.product.title if item.product_id else str(item.preparation),
            "required_unit_quantity": required,
            "in_stock_quantity": in_stock,
            "sources": sources,
        })
    return [], results


# ---------------------------------------------------------------------------
# Customer checkout: one mobile-money payment per pharmacy per purchase.
# A purchase can cover all or part of what the pharmacy quoted (partial only
# for medicines that allow it); the rest can be bought later.
# ---------------------------------------------------------------------------

def _read_checkout(data, user):
    """
    Validate `quotation`, `lines=[{order_item, quantity}]` and `delivery_method`.
    Returns (errors, checkout) with checkout = {quotation, prescription, method,
    picks: [(quotation line, quantity)], items_total}.
    """
    if not _present(data, "quotation"):
        return ["Quotation ID is required"], None
    quotation = (
        models.PrescriptionQuotations.objects.filter(id=data["quotation"])
        .select_related("prescription", "customer_order", "entity")
        .first()
    )
    if not quotation:
        return ["No quotation for provided ID"], None
    prescription = quotation.prescription
    if prescription.owner_id != user.id and prescription.created_by_id != user.id:
        return ["You can only buy from your own prescriptions"], None
    errors = _not_editable(prescription)
    if errors:
        return errors, None
    if quotation.parent_id:
        return ["That is a past purchase. Buy from the pharmacy's current quotation."], None
    quote_order = quotation.customer_order
    if quotation.status == "FULFILLED":
        return ["Everything on this quotation has been bought"], None
    if quotation.status not in ("QUOTED", "CHECKOUT") or not quote_order:
        return ["This pharmacy hasn't sent a quotation yet"], None
    if quote_order.is_paid == "true":
        return ["This quotation is already paid"], None

    errors, method = _read_delivery_method(data)
    if errors:
        return errors, None
    method = method or "PICKUP"
    if method == "DELIVERY" and quotation.pickup_required:
        why = f" ({quotation.pickup_reason})" if quotation.pickup_reason else ""
        return [f"{quotation.entity.title} asks you to collect these medicines in person{why}. Delivery isn't available."], None

    chosen = {}
    for entry in data.get("lines") or []:
        line_id = str((entry or {}).get("order_item") or "").strip()
        if not line_id:
            continue
        errors, qty = _as_int(entry.get("quantity"), "Quantity")
        if errors:
            return errors, None
        chosen[line_id] = qty
    if not chosen:
        return ["Choose at least one medicine to buy"], None

    lines = {
        str(l.id): l
        for l in models.CustomerOrderItems.objects.filter(customer_order=quote_order).select_related(
            "prescription_item", "prescription_item__product", "prescription_item__preparation", "retailer_receipt"
        )
    }
    if set(chosen) - set(lines):
        return ["Some selected medicines are not on this quotation"], None

    picks, items_total = [], Decimal("0.00")
    for line_id, qty in chosen.items():
        line = lines[line_id]
        item = line.prescription_item
        quoted = int(line.quantity or 0)
        name = getattr(getattr(item, "product", None), "title", None) or getattr(getattr(item, "preparation", None), "title", None) or "medicine"
        if qty < 1 or qty > quoted:
            return [f"Choose between 1 and {quoted} of {name}"], None
        if item:
            already = _paid_quantity(item)
            if not item.allow_partial_purchase:
                if qty != quoted:
                    return [f"{name} must be bought in full ({quoted})"], None
                if already:
                    return [f"{name} has already been bought"], None
            elif item.required_unit_quantity:
                left = item.required_unit_quantity - already
                if qty > left:
                    return [f"Only {max(left, 0)} more of {name} can be bought"], None
        receipt = line.retailer_receipt
        if receipt is None or (receipt.current_unit_quantity or 0) < qty:
            in_stock = int(getattr(receipt, "current_unit_quantity", 0) or 0)
            return [f"{quotation.entity.title} has only {in_stock} of {name} left. Choose fewer or ask the pharmacy to update its quotation."], None
        picks.append((line, qty))
        items_total += Decimal(line.item_price or 0) * qty

    return [], {
        "quotation": quotation,
        "prescription": prescription,
        "method": method,
        "picks": picks,
        "items_total": items_total,
    }


def preview_checkout(data, user):
    """
    What the chosen lines cost with the chosen `delivery_method`, before paying:
    {items_total, shipping_cost, total, distance_km, delivery_method,
     pickup_required, pickup_reason, delivery_available, delivery_error}.
    """
    errors, checkout = _read_checkout(data, user)
    if errors:
        return errors, None
    quotation = checkout["quotation"]
    shipping, distance_km, delivery_error = Decimal("0.00"), None, None
    # Always price delivery when the customer may choose it, so the screen can
    # show what it would add.
    can_deliver = not quotation.pickup_required
    delivery_cost = None
    if can_deliver:
        d_errors, cost, km, _shop = _price_delivery(
            quotation.entity,
            checkout["prescription"],
            [(line.retailer_receipt_id, qty) for line, qty in checkout["picks"]],
            checkout["items_total"],
        )
        if d_errors:
            can_deliver, delivery_error = False, d_errors[0]
        else:
            delivery_cost = cost
            if checkout["method"] == "DELIVERY":
                shipping, distance_km = cost, km
            else:
                distance_km = km
    if checkout["method"] == "DELIVERY" and not can_deliver:
        return [delivery_error or "Delivery isn't available for this quotation"], None
    return [], {
        "quotation": str(quotation.id),
        "delivery_method": checkout["method"],
        "items_total": str(checkout["items_total"].quantize(Decimal("0.01"))),
        "shipping_cost": str(shipping.quantize(Decimal("0.01"))),
        "total": str((checkout["items_total"] + shipping).quantize(Decimal("0.01"))),
        "delivery_cost": str(delivery_cost.quantize(Decimal("0.01"))) if delivery_cost is not None else None,
        "distance_km": str(distance_km) if distance_km is not None else None,
        "pickup_required": quotation.pickup_required,
        "pickup_reason": quotation.pickup_reason,
        "delivery_available": can_deliver,
        "delivery_error": delivery_error,
    }


def pay_quotation(data, user):
    """
    data: quotation, lines=[{order_item, quantity}], delivery_method (PICKUP /
    DELIVERY, default PICKUP), payment_method, mobile_money_phone.
    Creates a purchase — its own quotation + order — for the chosen lines
    (delivery adds shipping), then starts its mobile money payment.
    """
    from .retailer_utils import process_customer_order_payment

    errors, checkout = _read_checkout(data, user)
    if errors:
        return errors, None
    if not _present(data, "payment_method"):
        return ["Payment method is required"], None
    payment_method = payments_models_validators.validate_payment_method_exists(data["payment_method"])
    if not payment_method or payment_method.title != "MOBILE MONEY":
        return ["Prescription purchases are paid by mobile money"], None
    if not _present(data, "mobile_money_phone"):
        return ["Mobile money phone number is required"], None

    try:
        order = _create_purchase(checkout, user, str(data["mobile_money_phone"]).strip())
    except _Rollback as e:
        return e.errors, None

    items = list(models.CustomerOrderItems.objects.filter(customer_order=order))
    errors, paid_order = process_customer_order_payment(
        order.entity, order, payment_method, user, data["mobile_money_phone"], items
    )
    if errors or not paid_order:
        return errors or ["Payment could not be started"], None
    return [], paid_order


def _reusable_purchase(quotation, user):
    """An earlier purchase of this customer from `quotation` that never got a payment going."""
    pending = (
        models.PrescriptionQuotations.objects.filter(parent=quotation, status="CHECKOUT", requested_by=user, customer_order__is_paid="false")
        .select_related("customer_order")
        .order_by("-created")[:5]
    )
    for purchase in pending:
        if not models.CustomerOrderPayment.objects.filter(customer_order=purchase.customer_order).exclude(status="FAILED").exists():
            return purchase
    return None


@transaction.atomic
def _create_purchase(checkout, user, phone):
    """
    The purchase for a validated checkout: a quotation of its own (child of the
    pharmacy's open quotation) and its order, with the chosen lines + fulfilment.
    """
    quotation, prescription = checkout["quotation"], checkout["prescription"]
    quote_order = quotation.customer_order
    purchase = _reusable_purchase(quotation, user)
    if purchase is None:
        staff = quote_order.owner  # staff own prescription orders (see project notes)
        order = models.CustomerOrders.objects.create(
            prescription=prescription,
            source_quotation=quotation,
            entity=quotation.entity,
            owner=staff,
            user=quote_order.user or staff,
            customer=user,
            order_origin="CUSTOMER",
            origin_point=prescription.origin_point,
            order_number=generate_document_number(quotation.entity, staff, "CUSTOMERORDER"),
            reference_number=generate_reference_number(quotation.entity, staff),
            order_type="PRESCRIPTION",
            status="PROCESSING",
            delivery_method=checkout["method"],
        )
        models.PrescriptionQuotations.objects.create(
            prescription=prescription,
            entity=quotation.entity,
            parent=quotation,
            status="CHECKOUT",
            customer_order=order,
            requested_by=user,
            quoted_by=quotation.quoted_by,
            quoted_at=quotation.quoted_at,
            pickup_required=quotation.pickup_required,
            pickup_reason=quotation.pickup_reason,
        )
    else:
        order = purchase.customer_order
        for old in models.CustomerOrderItems.objects.filter(customer_order=order):
            old.delete()
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    order.customer_name = full_name or prescription.patient_name
    order.customer_phone = phone[:20]
    order.recipient_name = prescription.patient_name
    order.recipient_phone = phone
    order.save(update_fields=["customer_name", "customer_phone", "recipient_name", "recipient_phone", "updated"])

    for line, qty in checkout["picks"]:
        models.CustomerOrderItems.objects.create(
            customer_order=order,
            prescription_item=line.prescription_item,
            retailer_receipt=line.retailer_receipt,
            unit_of_issue=line.unit_of_issue,
            quantity=qty,
            purchased_quantity=qty,
            total_quantity=qty,
            item_price=line.item_price,
            item_price_total=Decimal(line.item_price or 0) * qty,
            owner=order.owner,
            entity=quotation.entity,
        )
    order.refresh_from_db()
    errors = _apply_fulfilment(order, checkout["method"], prescription)
    if errors:
        raise _Rollback(errors)
    order.refresh_from_db()
    return order


def settle_purchase(order):
    """
    A prescription purchase was paid. Its quotation becomes PAID, each bought
    item's dispensed / balance quantities are brought up to date, and every
    open quotation is cut down to what is still to be dispensed:
    lines of medicines that are fully bought (or can't be bought in part) go,
    the others shrink to the balance. Call inside a transaction.
    """
    models.PrescriptionQuotations.objects.filter(customer_order=order, parent__isnull=False).update(
        status="PAID", updated=timezone.now()
    )
    bought = models.CustomerOrderItems.objects.filter(customer_order=order, prescription_item__isnull=False).select_related("prescription_item")
    touched = set()
    for item in {line.prescription_item for line in bought}:
        dispensed = _paid_quantity(item)
        required = item.required_unit_quantity or 0
        if item.issued_unit_quantity != dispensed:
            item.issued_unit_quantity = dispensed
            item.save()  # recomputes balance_unit_quantity
        open_lines = models.CustomerOrderItems.objects.filter(
            prescription_item=item,
            customer_order__prescription_quotation__isnull=False,
            customer_order__prescription_quotation__parent__isnull=True,
        ).exclude(customer_order__is_paid="true").select_related("customer_order")
        for line in open_lines:
            touched.add(line.customer_order_id)
            left = required - dispensed if required else None
            if not item.allow_partial_purchase or (left is not None and left <= 0):
                line.delete()
            elif left is not None and int(line.quantity or 0) > left:
                line.quantity = left
                line.purchased_quantity = left
                line.total_quantity = left
                line.item_price_total = Decimal(line.item_price or 0) * left
                line.save()
    # An open quotation with nothing left to buy is fulfilled.
    for quotation in models.PrescriptionQuotations.objects.filter(
        customer_order_id__in=touched, parent__isnull=True, status__in=("QUOTED", "CHECKOUT")
    ):
        if not models.CustomerOrderItems.objects.filter(customer_order_id=quotation.customer_order_id).exists():
            quotation.status = "FULFILLED"
            quotation.save(update_fields=["status", "updated"])

    # Everything on the prescription is bought: it is dispensed and can no
    # longer be edited, quoted or bought from (_not_editable).
    prescription = order.prescription
    if prescription and prescription.status == "DIGITIZED" and is_fully_dispensed(prescription):
        from ..prescription_events import notify_dispensed

        prescription.status = "DISPENSED"
        prescription.is_dispensed = "true"
        prescription.save(update_fields=["status", "is_dispensed", "updated"])
        models.PrescriptionQuotations.objects.filter(
            prescription=prescription, parent__isnull=True, status__in=("QUOTED", "CHECKOUT")
        ).update(status="FULFILLED", updated=timezone.now())
        notify_dispensed(prescription, has_long_term_items(prescription))


# ---------------------------------------------------------------------------
# Listing / lookups
# ---------------------------------------------------------------------------

def get_pharmacy_prescriptions(data, user):
    """Prescriptions sent to the user's pharmacy (uploaded to it, or forwarded for quotation)."""
    pharmacy = pharmacy_of(user)
    if not pharmacy:
        return models.Prescriptions.objects.none()
    return (
        models.Prescriptions.objects.filter(Q(entity=pharmacy) | Q(quotations__entity=pharmacy))
        .distinct()
        .order_by("-created")
    )


def get_all_prescriptions(data, user):
    """Admin: every prescription, optional `status` / `search` (patient name)."""
    qs = models.Prescriptions.objects.all().order_by("-created")
    if _present(data, "status"):
        qs = qs.filter(status=str(data["status"]).upper())
    if _present(data, "search"):
        qs = qs.filter(patient_name__icontains=str(data["search"]).strip())
    return qs


def _in_stock_batches(pharmacy):
    return RetailerReceipts.objects.filter(entity=pharmacy, current_unit_quantity__gte=1).exclude(is_active="false")


def _batches_for_item(pharmacy, item):
    """The pharmacy's in-stock batches matching a prescription item, soonest expiry first."""
    qs = _in_stock_batches(pharmacy)
    if item.product_id:
        qs = qs.filter(product_id=item.product_id)
    elif item.preparation_id:
        qs = qs.filter(product__preparation_id=item.preparation_id)
    else:
        return RetailerReceipts.objects.none()
    return qs.order_by("expiry_date", "created")


def get_inventory_for_item(data, user):
    """The pharmacy's in-stock batches for a prescription item (or a product), soonest expiry first."""
    pharmacy = pharmacy_of(user)
    if not pharmacy:
        return RetailerReceipts.objects.none()
    item = models.PrescriptionItems.objects.filter(id=data["prescription_item"]).first() if _present(data, "prescription_item") else None
    if item:
        return _batches_for_item(pharmacy, item)
    if _present(data, "product"):
        return _in_stock_batches(pharmacy).filter(product_id=data["product"]).order_by("expiry_date", "created")
    return RetailerReceipts.objects.none()
