"""
Prescription flow
=================

1. A customer uploads a prescription image, optionally choosing a pharmacy
   (that pharmacy then gets a quotation request).
2. It is digitized by the system (AI), an admin, or the staff of a pharmacy that
   has it. Digitizing = the shared list of PrescriptionItems (preparation and/or
   product, prescribed quantity, `allow_partial_purchase`, dosing details).
3. Pharmacies quote: each pharmacy has one PrescriptionQuotations row, backed by
   its own independent CustomerOrders; each order line (CustomerOrderItems)
   points at the prescription item it prices (`prescription_item`).
   Admins have no inventory and never quote.
4. A digitized prescription can be forwarded (admin, owner, or a pharmacy that
   has it) to more pharmacies — always only for quotation.
5. The customer picks lines from any quotations and pays each pharmacy
   separately by mobile money. Items that don't allow partial purchase must be
   bought in full, from one pharmacy.

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


def quotation_for(prescription, entity, create=False, requested_by=None):
    quotation = models.PrescriptionQuotations.objects.filter(prescription=prescription, entity=entity).first()
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
        return ["Admins can't quote: forward the prescription to pharmacies instead"]
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

def mark_prescription_digitized(data, user):
    """Admin or pharmacy staff finished digitizing. Pharmacy staff also submit their quotation."""
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

    pharmacy = pharmacy_of(user)
    with transaction.atomic():
        first_time = prescription.status != "DIGITIZED"
        prescription.status = "DIGITIZED"
        prescription.digitized_at = prescription.digitized_at or timezone.now()
        if first_time or not prescription.digitized_by_id:
            prescription.digitized_by = user
            prescription.digitized_by_entity = pharmacy
        prescription.save()
        notify_digitized(prescription)

        quotation = quotation_for(prescription, pharmacy) if pharmacy else None
        if quotation and quotation.customer_order_id and quotation.customer_order.parent_order.exists():
            _mark_quoted(quotation, user)
            notify_quoted(quotation)
    return [], prescription


def _mark_quoted(quotation, user):
    quotation.status = "QUOTED"
    quotation.quoted_at = timezone.now()
    quotation.quoted_by = user
    quotation.save(update_fields=["status", "quoted_at", "quoted_by", "updated"])


def submit_quotation(data, user):
    """Pharmacy sends (or re-sends) its quotation to the customer."""
    from ..prescription_events import notify_quoted

    errors, prescription = _get_prescription(data)
    if errors:
        return errors, None
    pharmacy = pharmacy_of(user)
    if not pharmacy:
        return ["Only pharmacy staff can send quotations"], None
    quotation = quotation_for(prescription, pharmacy)
    if not quotation or not quotation.customer_order_id or not quotation.customer_order.parent_order.exists():
        return ["Quote at least one medicine first"], None
    if _quotation_locked(quotation):
        return ["The customer has already checked out this quotation"], None
    with transaction.atomic():
        _mark_quoted(quotation, user)
        notify_quoted(quotation)
    return [], prescription


def _entity_ids(data):
    raw = data.get("entities")
    if raw is None and _present(data, "entity"):
        raw = [data["entity"]]
    if isinstance(raw, str):
        raw = [x for x in raw.split(",") if x.strip()]
    return [str(x).strip() for x in (raw or []) if str(x).strip()]


def forward_for_quotation(data, user):
    """Send a digitized prescription to more pharmacies, only for quotation."""
    from ..prescription_events import notify_quotation_requested

    errors, prescription = _get_prescription(data)
    if errors:
        return errors, None
    owner = prescription.owner_id == user.id or prescription.created_by_id == user.id
    if not (is_admin(user) or owner or pharmacy_has_access(user, prescription)):
        return ["You can't forward this prescription"], None
    errors = _not_editable(prescription)
    if errors:
        return errors, None
    if prescription.status != "DIGITIZED":
        return ["Digitize the prescription before forwarding it for quotation"], None

    ids = _entity_ids(data)
    if not ids:
        return ["Choose at least one pharmacy"], None
    pharmacies = list(Entities.objects.filter(id__in=ids, entity_type=PHARMACY))
    if len(pharmacies) != len(set(ids)):
        return ["One or more selected pharmacies were not found"], None

    created = []
    with transaction.atomic():
        for pharmacy in pharmacies:
            if models.PrescriptionQuotations.objects.filter(prescription=prescription, entity=pharmacy).exists():
                continue
            created.append(quotation_for(prescription, pharmacy, create=True, requested_by=user))
        for quotation in created:
            notify_quotation_requested(quotation)
    if not created:
        return ["Those pharmacies already have this prescription"], None
    return [], prescription


# ---------------------------------------------------------------------------
# Customer checkout: one mobile-money payment per pharmacy quotation
# ---------------------------------------------------------------------------

def pay_quotation(data, user):
    """
    data: quotation, lines=[{order_item, quantity}], payment_method, mobile_money_phone.
    Trims the pharmacy's quotation order to the chosen lines, then starts the
    mobile money payment for that order.
    """
    from .retailer_utils import process_customer_order_payment

    if not _present(data, "quotation"):
        return ["Quotation ID is required"], None
    quotation = models.PrescriptionQuotations.objects.filter(id=data["quotation"]).select_related("prescription", "customer_order").first()
    if not quotation:
        return ["No quotation for provided ID"], None
    prescription = quotation.prescription
    if prescription.owner_id != user.id and prescription.created_by_id != user.id:
        return ["You can only buy from your own prescriptions"], None
    order = quotation.customer_order
    if quotation.status not in ("QUOTED", "CHECKOUT") or not order:
        return ["This pharmacy hasn't sent a quotation yet"], None
    if order.is_paid == "true":
        return ["This quotation is already paid"], None
    if not _present(data, "payment_method"):
        return ["Payment method is required"], None
    payment_method = payments_models_validators.validate_payment_method_exists(data["payment_method"])
    if not payment_method or payment_method.title != "MOBILE MONEY":
        return ["Prescription purchases are paid by mobile money"], None
    if not _present(data, "mobile_money_phone"):
        return ["Mobile money phone number is required"], None

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

    lines = {str(l.id): l for l in models.CustomerOrderItems.objects.filter(customer_order=order).select_related("prescription_item")}
    unknown = set(chosen) - set(lines)
    if unknown:
        return ["Some selected medicines are not on this quotation"], None

    for line_id, qty in chosen.items():
        line = lines[line_id]
        item = line.prescription_item
        quoted = int(line.quantity or 0)
        name = getattr(item.product, "title", None) or getattr(item.preparation, "title", None) or "medicine"
        if qty < 1 or qty > quoted:
            return [f"Choose between 1 and {quoted} of {name}"], None
        if item and not item.allow_partial_purchase:
            if qty != quoted:
                return [f"{name} must be bought in full ({quoted})"], None
            if _paid_quantity(item, exclude_order_id=order.id):
                return [f"{name} has already been bought from another pharmacy"], None
        elif item and item.required_unit_quantity:
            left = item.required_unit_quantity - _paid_quantity(item, exclude_order_id=order.id)
            if qty > left:
                return [f"Only {max(left, 0)} more of {name} can be bought"], None

    with transaction.atomic():
        for line_id, line in lines.items():
            if line_id not in chosen:
                line.delete()
            elif int(line.quantity or 0) != chosen[line_id]:
                qty = chosen[line_id]
                line.quantity = qty
                line.purchased_quantity = qty
                line.total_quantity = qty
                line.item_price_total = Decimal(line.item_price or 0) * qty
                line.save()
        quotation.status = "CHECKOUT"
        quotation.save(update_fields=["status", "updated"])
        order.refresh_from_db()

    items = list(models.CustomerOrderItems.objects.filter(customer_order=order))
    errors, paid_order = process_customer_order_payment(
        order.entity, order, payment_method, user, data["mobile_money_phone"], items
    )
    if errors or not paid_order:
        return errors or ["Payment could not be started"], None
    return [], paid_order


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


def get_inventory_for_item(data, user):
    """The pharmacy's in-stock batches for a prescription item (or a product), soonest expiry first."""
    pharmacy = pharmacy_of(user)
    if not pharmacy:
        return RetailerReceipts.objects.none()
    qs = RetailerReceipts.objects.filter(entity=pharmacy, current_unit_quantity__gte=1).exclude(is_active="false")
    item = models.PrescriptionItems.objects.filter(id=data["prescription_item"]).first() if _present(data, "prescription_item") else None
    if item and item.product_id:
        qs = qs.filter(product_id=item.product_id)
    elif item and item.preparation_id:
        qs = qs.filter(product__preparation_id=item.preparation_id)
    elif _present(data, "product"):
        qs = qs.filter(product_id=data["product"])
    else:
        return RetailerReceipts.objects.none()
    return qs.order_by("expiry_date", "created")
