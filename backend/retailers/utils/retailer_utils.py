# retailers/utils/retailer_utils.py
#
# Retailer utilities: receipts, orders, indents, out-of-stocks,
# payments, sales returns, and stock adjustments.

# ---------- Standard library ----------
import datetime
import json
import math
from decimal import Decimal, InvalidOperation

import pytz
import requests
from decouple import config

# ---------- Django ----------
from django.contrib.gis.geos import Point, fromstr
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime

# ---------- DRF ----------
from rest_framework import exceptions, status
from rest_framework.response import Response

# ---------- Local apps ----------
from authentication.models import Entities, Users
from authentication.serializers import EntityMiniSerializer
from authentication.utils.utils import (
    generate_document_number,
    generate_reference_number,
    get_telco_by_phone_number,
    use_reference_number,
)
from authentication.validators.authentication_models_validators import (
    validate_entity,
    validate_user,
)
from core.date_utils import (
    get_formatted_from_date,
    get_formatted_to_date,
    get_today,
    get_tommorow,
    get_yesterday,
)
from core.utils import generate_reference_numbers, titlecase
from drugs.models import Formulations, Frequency, Routes
from employees.models import Employees
from employees.validators import employees_models_validators
from intergrations.jambopay.get_jp_token import get_auth_token
from intergrations.jambopay.jp_mobile_money_checkout import (
    jambopay_mobile_checkout,
)
from intergrations.jambopay.jambopay_wallet import (
    customer_order_payment,
    get_account_by_phone,
    jambopay_wallet_checkout,
)
from payments.models import (
    EntityPSPCollectionAccount,
    PaymentMethods,
    UserAccounts,
)
from payments.validators import payments_models_validators
from payments.validators.payments_models_validators import (
    validate_payment_method_exists,
)
from products.models import Preparation, ProductImages, Products
from products.serializers import ProductImageSerializer
from products.validators import product_models_validator
from retailers.models import CustomerOrderPayment
from retailers.validators.model_validators import (
    validate_retailer_price_discount,
    validate_retailer_quantity_discount,
)
from utils.logging import create_log
from wazi.utils import raise_custom_exception
from wholesalers.models import (
    RetailerOrderItems,
    RetailerOrderPayments,
    RetailerOrders,
    WholesalerPriceDiscountBanners,
    WholesalerPriceDiscounts,
    WholesalerQuantityDiscountBanners,
    WholesalerQuantityDiscounts,
    WholesalerReceipts,
)
from wholesalers.serializers import (
    WholesalerPriceDiscountBannersSerializer,
    WholesalerQuantityDiscountBannersSerializer,
)
from wholesalers.validators.wholesalers_models_validators import (
    validate_wholesaler_receipt,
)

# ---------- App-local ----------
from .. import models
from ..models import (
    BodaLocations,
    CustomerOrderItems,
    CustomerOrders,
    OrderEstimate,
    OutOfStock,
    ProductMovement,
    RetailerIndent,
    RetailerIndentItem,
    RetailerReceipts,
    RetailerVariations,
    ShippingAddress,
)
from ..serializers import RetailerIndentItemsSerializer
from ..validators import model_validators
from .inventory_utils import update_stock
from .process_mpesa_utils import process_mpesa


# ===========================================================================
# Small numeric helpers
# ===========================================================================

def _q(value):
    """Quantize to 2 dp, half-up. None → Decimal('0.00')."""
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _to_decimal(value, default="0.00"):
    if value in (None, ""):
        return Decimal(default)
    try:
        return Decimal(str(value))
    except (TypeError, ValueError, InvalidOperation):
        return Decimal(default)


def _to_int(value, default=0):
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ===========================================================================
# Utility class + validators
# ===========================================================================

class Util:
    def is_product_drug(product):
        """Admin user can only create manufacturing entities."""
        return bool(product.preparation)


def product_and_entity_share_category(user, product):
    if user.entity.category != product.category:
        raise exceptions.ValidationError(
            "Product is not for this entity category"
        )


def verify_order_data(data):
    errors = []
    if "payment_method" not in data:
        errors.append("Payment method is required")

    if errors:
        raise exceptions.ValidationError(errors)
    return data


def check_order_has_items(order):
    order_items = CustomerOrderItems.objects.filter(customer_order=order)
    if order_items.count() < 1:
        order.delete()
        raise exceptions.ValidationError(
            "Order has no items. Please create a new order"
        )


def check_order_item_details(item):
    if not item["purchased_quantity"]:
        raise exceptions.ValidationError("Purchased quantity is required")
    if item["purchased_quantity"] < 1:
        raise exceptions.ValidationError(
            "Purchased quantity cannot be less than 1"
        )
    if not item["total_quantity"]:
        raise exceptions.ValidationError("Total quantity is required")
    if item["total_quantity"] < item["purchased_quantity"]:
        raise exceptions.ValidationError(
            "Total quantity cannot be less than purchased quantity"
        )
    if item["net_price"] == 0:
        raise exceptions.ValidationError("Net price cannot be zero")

    if not item["retailer_receipt"]:
        raise exceptions.ValidationError("Item ID is required")

    receipt = RetailerReceipts.objects.filter(
        id=item["retailer_receipt"],
        current_unit_quantity__gte=0,
    ).first()
    if not receipt:
        raise exceptions.ValidationError("Item not available")
    if receipt.current_unit_quantity < item["total_quantity"]:
        raise exceptions.ValidationError(
            f"Insufficient quantity, quantity "
            f"{receipt.current_unit_quantity} available"
        )

    if not item["item_price"]:
        raise exceptions.ValidationError("Item price is required")
    if not item["net_price"]:
        raise exceptions.ValidationError("Net price is required")


def custom_error_message(message):
    return Response(
        data={
            "response_code": 1,
            "response_message": f"{message}",
            "errors": ["An error occurred!"],
        },
        status=status.HTTP_200_OK,
    )


# ===========================================================================
# Receipts — create from an order
# ===========================================================================

@transaction.atomic
def create_retailer_receipts(item, retailer_order_obj, user):
    errors = []
    try:
        receipt = RetailerReceipts.objects.create(
            product=item.wholesaler_receipt.product,
            received_from=retailer_order_obj.wholesaler,
            entity=user.entity,
            owner=user,
            retailer_order=retailer_order_obj,
            retailer_order_item=item,
            wholesaler_receipt=item.wholesaler_receipt,
            unit_buying_price=item.item_final_price or item.item_net_price,
            unit_selling_price=(
                item.intended_retail_unit_price
                or item.item_final_price
                or item.item_net_price
            ),
            received_unit_quantity=item.total_quantity,
            current_unit_quantity=item.total_quantity,
            units_per_pack=item.wholesaler_receipt.product.units_per_pack,
            unit_of_receipt=item.unit_of_issue or "Pack",
            batch=item.wholesaler_receipt.batch,
            manufacture_date=item.wholesaler_receipt.manufacture_date,
            expiry_date=item.wholesaler_receipt.expiry_date,
            in_placement=False,
        )

        if item.is_received != "true":
            item.is_received = "true"
            item.save(update_fields=["is_received", "updated"])

        return receipt
    except IntegrityError as e:
        errors.append(str(e))
        raise_custom_exception(errors)


def confirm_item_in_retailer_order(receipt, retailer_order_obj):
    retailer_order_item_obj = None
    errors = []

    if not receipt["retailer_order_item"]:
        errors.append("Order item ID is required")
    else:
        if RetailerOrderItems.objects.filter(
            id=receipt["retailer_order_item"]
        ).exists():
            retailer_order_item_obj = RetailerOrderItems.objects.filter(
                id=receipt["retailer_order_item"]
            ).first()
            if retailer_order_item_obj.retailer_order != retailer_order_obj:
                errors.append(
                    f"{retailer_order_item_obj} : This item is not in "
                    f"the selected order"
                )
        else:
            errors.append(
                "No item was found in the order for the entered ID"
            )

    if not receipt["unit_selling_price"]:
        errors.append("Pack selling price is required")

    if errors:
        raise exceptions.ValidationError(errors)


# ===========================================================================
# Receipts — queries
# ===========================================================================

def get_retailer_receipts_for_entity(data, user):
    retailer_receipts = None
    entity = None
    entity_id = None

    if "entity" in data:
        entity_id = data["entity"]
    if entity_id:
        entity = validate_entity(entity_id)

    if entity:
        qs = (
            RetailerReceipts.objects
            .filter(entity=entity)
            .select_related(
                "product",
                "product__category",
                "product__manufacturer",
                "product__preparation",
                "product__preparation__formulation",
                "product__origin_country",
                "entity",
                "received_from",
            )
            .order_by("-created")
        )
        if qs.exists():
            return qs
        raise exceptions.ValidationError(
            "No items were retrieved for the selected entity"
        )


def get_retailer_receipts(user):
    retailer_receipts = []
    if RetailerReceipts.objects.filter(
        Q(current_unit_quantity__gte=1),
        entity=user.entity,
    ).exists():
        retailer_receipts = (
            RetailerReceipts.objects
            .filter(
                Q(current_unit_quantity__gte=1),
                entity=user.entity,
            )
            .order_by("expiry_date")
        )
    return retailer_receipts


def get_retailer_receipts_by_catgory(data, user):
    entity_id = None
    entity = None
    retailer_receipts = []

    try:
        entity_id = data["entity"]
        if entity_id == "":
            raise exceptions.ValidationError(
                "Entity ID should be a valid UUID"
            )
        entity = validate_entity(entity_id)
    except KeyError:
        raise exceptions.ValidationError("Entity ID is required")

    try:
        category = data["category"]
        if category == "":
            raise exceptions.ValidationError(
                "Category ID should be a valid UUID"
            )
        retailer_receipts = RetailerReceipts.objects.filter(
            entity=entity, product__category_id=category
        )
    except KeyError:
        raise exceptions.ValidationError("Category ID is required")

    return retailer_receipts


def get_retailer_receipt_details(data, user):
    try:
        retailer_receipt_id = data["retailer_receipt"]
        if RetailerReceipts.objects.filter(id=retailer_receipt_id).exists():
            return RetailerReceipts.objects.get(id=retailer_receipt_id)
    except KeyError:
        raise exceptions.ValidationError("Retailer receipt ID is required")


def search_receipts(data, user):
    search_param = None
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError(
                "Search parameter cannot be empty"
            )

        if RetailerReceipts.objects.filter(
            Q(product__title__icontains=search_param)
            | Q(product__manufacturer__title__icontains=search_param)
            | Q(product__preparation__title__icontains=search_param),
            entity=user.entity,
        ).exists():
            return (
                RetailerReceipts.objects
                .filter(
                    Q(product__title__icontains=search_param)
                    | Q(product__manufacturer__title__icontains=search_param)
                    | Q(product__preparation__title__icontains=search_param),
                    entity=user.entity,
                )
                .all()
                .order_by("expiry_date")
            )
        return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")


def search_receipts_by_customer(data, user):
    search_param = None
    try:
        search_param = data["search_param"]
        if data["search_param"] == "":
            raise exceptions.ValidationError(
                "Search parameter cannot be empty"
            )

        if RetailerReceipts.objects.filter(
            Q(product__title__icontains=search_param)
            | Q(product__manufacturer__title__icontains=search_param)
            | Q(product__preparation__title__icontains=search_param),
            current_unit_quantity__gte=1,
        ).exists():
            return (
                RetailerReceipts.objects
                .filter(
                    Q(product__title__icontains=search_param)
                    | Q(product__manufacturer__title__icontains=search_param)
                    | Q(product__preparation__title__icontains=search_param),
                    current_unit_quantity__gte=1,
                )
                .all()
                .order_by("unit_selling_price")[:4]
            )
        return []

    except KeyError:
        raise exceptions.ValidationError("Search parameter is required")


# ===========================================================================
# Receipts — direct create / update (form flow)
# ===========================================================================

def validate_retailer_receipt_data(data, user):
    errors = []
    product = None
    received_from_obj = None

    employee = Employees.objects.filter(
        user=user, entity=user.entity, is_active="true",
    ).first()
    if not employee:
        return custom_error_message(
            f"You are not an active employee at "
            f"{titlecase(user.entity.title)}"
        )

    details = data.get("retailer_receipt_details", {})

    received_unit_quantity = details.get("received_unit_quantity")
    if received_unit_quantity in (None, "", 0, "0"):
        errors.append("Received unit quantity is required")
    else:
        try:
            if int(received_unit_quantity) < 1:
                errors.append("Unit quantity must be at least 1")
        except (TypeError, ValueError):
            errors.append("Unit quantity must be an integer")

    product_id = details.get("product")
    if not product_id:
        errors.append("Product ID is required")
    else:
        product = Products.objects.filter(id=product_id).first()
        if not product:
            raise exceptions.ValidationError(
                "Product with supplied ID does not exist"
            )

    if product and product.preparation:
        if not details.get("manufacture_date"):
            errors.append("Manufacture date is required")
        if not details.get("expiry_date"):
            errors.append("Expiry date is required")

    draft_id = details.get("draft_id")
    if draft_id:
        existing = RetailerReceipts.objects.filter(
            draft_id=draft_id, entity=user.entity,
        ).first()
        if existing:
            return [], existing

    unit_selling_price = details.get("unit_selling_price")
    if unit_selling_price in (None, ""):
        errors.append("Unit selling price is required")

    received_from_id = details.get("received_from")
    if received_from_id:
        received_from_obj = validate_entity(received_from_id)

    if errors:
        raise exceptions.ValidationError(errors)


@transaction.atomic
def create_retailer_receipt_directly(data, user):
    errors = []
    draft_id = None
    details = data.get("retailer_receipt_details", {})

    if not details.get("draft_id"):
        errors.append("Draft ID is required")
        return errors, None

    draft_id = details.get("draft_id")
    if draft_id:
        existing = RetailerReceipts.objects.filter(
            draft_id=draft_id
        ).first()
        if existing:
            return [], existing

    employee = Employees.objects.filter(
        user=user, entity=user.entity, is_active="true",
    ).first()
    if not employee:
        errors.append(
            f"You are not an active employee at "
            f"{titlecase(user.entity.title)}"
        )
        return errors, None

    manufacture_date = details.get("manufacture_date") or None
    expiry_date = details.get("expiry_date") or None

    received_from = None
    received_from_id = details.get("received_from")
    if received_from_id:
        received_from = validate_entity(received_from_id)

    retailer_order_item = None
    roi_id = details.get("retailer_order_item")
    if roi_id:
        retailer_order_item = RetailerOrderItems.objects.filter(
            id=roi_id
        ).first()
        if retailer_order_item:
            if retailer_order_item.is_received == "true":
                errors.append("Item is already received into inventory")
                return errors, None
            if retailer_order_item.retailer_order.status != "RECEIVED":
                errors.append(
                    "Order status for this item is not yet set to RECEIVED"
                )
                return errors, None

    received_unit_quantity = _to_int(
        details.get("received_unit_quantity")
    )
    unit_selling_price = _to_decimal(details.get("unit_selling_price"))
    unit_price_discount = _to_decimal(details.get("unit_price_discount"))
    unit_buying_price = _to_decimal(details.get("unit_buying_price"))
    unit_of_receipt = details.get("unit_of_receipt") or "Piece"

    product_id = details.get("product")
    product = Products.objects.filter(id=product_id).first()
    if not product:
        errors.append("Product with supplied ID does not exist")
        return errors, None

    batch = details.get("batch") or None
    bar_code = details.get("bar_code") or ""

    a_minute_ago = datetime.datetime.now() - datetime.timedelta(minutes=1)
    if RetailerReceipts.objects.filter(
        product_id=product_id,
        received_unit_quantity=received_unit_quantity,
        created__gte=a_minute_ago,
    ).exists():
        errors.append("You added a similar item less than a minute ago")
        return errors, None

    try:
        created = RetailerReceipts.objects.create(
            unit_of_receipt=unit_of_receipt,
            product=product,
            received_from=received_from,
            entity=user.entity,
            owner=user,
            received_unit_quantity=received_unit_quantity,
            current_unit_quantity=received_unit_quantity,
            manufacture_date=manufacture_date,
            expiry_date=expiry_date,
            batch=batch,
            bar_code=bar_code,
            employee=employee,
            draft_id=draft_id,
            retailer_order_item=retailer_order_item,
            unit_buying_price=unit_buying_price,
            unit_selling_price=unit_selling_price,
            units_per_pack=product.units_per_pack,
            unit_price_discount=unit_price_discount,
        )

        if retailer_order_item:
            retailer_order_item.is_received = "true"
            retailer_order_item.save(
                update_fields=["is_received", "updated"]
            )

        return [], created
    except Exception as e:
        errors.append(str(e))
        return errors, None


def validate_retailer_receipt_update_data(data):
    receipt = None
    errors = []
    try:
        if RetailerReceipts.objects.filter(
            id=data["retailer_receipt"]
        ).exists():
            receipt = RetailerReceipts.objects.filter(
                id=data["retailer_receipt"]
            ).first()
        else:
            errors.append("Retailer receipt for given ID does not exist")
    except KeyError:
        errors.append("Retailer receipt ID is required")

    if errors:
        raise exceptions.ValidationError(errors)


@transaction.atomic
def update_retailer_receipt_directly(data, user):
    details = data.get("retailer_receipt_details", {})
    receipt = RetailerReceipts.objects.filter(
        id=data["retailer_receipt"]
    ).first()
    if not receipt:
        raise exceptions.ValidationError("Retailer receipt not found")

    changed = []

    if details.get("current_unit_quantity"):
        receipt.current_unit_quantity = _to_int(
            details["current_unit_quantity"]
        )
        changed.append("current_unit_quantity")

    if details.get("unit_of_receipt"):
        receipt.unit_of_receipt = details["unit_of_receipt"]
        changed.append("unit_of_receipt")

    if details.get("received_from"):
        receipt.received_from = validate_entity(details["received_from"])
        changed.append("received_from")

    if details.get("unit_selling_price"):
        receipt.unit_selling_price = _to_decimal(
            details["unit_selling_price"]
        )
        changed.append("unit_selling_price")

    if details.get("unit_buying_price"):
        receipt.unit_buying_price = _to_decimal(
            details["unit_buying_price"]
        )
        changed.append("unit_buying_price")

    if details.get("unit_price_discount"):
        receipt.unit_price_discount = _to_decimal(
            details["unit_price_discount"]
        )
        changed.append("unit_price_discount")

    if details.get("batch"):
        receipt.batch = details["batch"]
        changed.append("batch")

    if details.get("bar_code"):
        bar_code = details["bar_code"]
        if not receipt.product.bar_code:
            receipt.product.bar_code = bar_code
            receipt.product.save(update_fields=["bar_code"])
        receipt.bar_code = bar_code
        changed.append("bar_code")

    if details.get("manufacture_date"):
        receipt.manufacture_date = details["manufacture_date"]
        changed.append("manufacture_date")

    if details.get("expiry_date"):
        receipt.expiry_date = details["expiry_date"]
        changed.append("expiry_date")

    if details.get("is_active"):
        receipt.is_active = details["is_active"]
        changed.append("is_active")

    if changed:
        changed.append("final_unit_selling_price")
        changed.append("updated")
        receipt.save(update_fields=changed)

    return receipt


# ===========================================================================
# Out of stock / product movement
# ===========================================================================

def get_products(customerOrderItem):
    return customerOrderItem.retailer_receipt.product


def get_products_from_os(outOfStocks):
    return outOfStocks.product


def get_unique_products(item):
    return item.product


def get_current_balance(product):
    total = (
        RetailerReceipts.objects
        .filter(product=product, current_unit_quantity__gte=0)
        .aggregate(total=Sum("current_unit_quantity"))["total"]
    ) or 0
    return total


def get_product_movement(data, user):
    if not data.get("product"):
        raise exceptions.ValidationError("Product ID is required")

    product = product_models_validator.validate_product(data["product"])
    from_date = get_formatted_from_date(data)
    to_date = get_formatted_to_date(data)

    receipts_in_range = RetailerReceipts.objects.filter(
        product=product, entity=user.entity,
        created__gte=from_date, created__lte=to_date,
    )
    items_in_range = CustomerOrderItems.objects.filter(
        retailer_receipt__product=product, entity=user.entity,
        created__gte=from_date, created__lte=to_date,
    )

    ProductMovement.objects.filter(
        product=product, entity=user.entity, owner=user,
    ).delete()

    for receipt in receipts_in_range:
        ProductMovement.objects.create(
            product=product,
            transaction_date=receipt.created,
            quantity=receipt.current_unit_quantity,
            direction="RECEIPT",
            retailer_receipt=receipt,
            customer_order_item=None,
            owner=receipt.owner,
            entity=user.entity,
        )

    for item in items_in_range:
        ProductMovement.objects.create(
            product=product,
            transaction_date=item.created,
            quantity=item.total_quantity,
            direction="ISSUE",
            retailer_receipt=None,
            customer_order_item=item,
            owner=item.owner,
            entity=user.entity,
        )

    movements = ProductMovement.objects.filter(
        product=product, entity=user.entity, owner=user,
    ).order_by("transaction_date")

    total_receipts = Decimal("0.00")
    total_issues = Decimal("0.00")
    for pm in movements:
        if pm.direction == "RECEIPT":
            total_receipts += Decimal(str(pm.quantity))
        else:
            total_issues += Decimal(str(pm.quantity))
        pm.balance = total_receipts - total_issues
        pm.save(update_fields=["balance"])

    return movements.order_by("-transaction_date")


@transaction.atomic
def create_out_of_stock_item(data, user):
    errors = []
    product = None
    required_quantity = None
    customer = None
    customer_phone = None
    customer_name = None
    unit_of_receipt = "Piece"
    is_special_order = False

    if not "product" in data:
        errors.append("Product ID is required")
    else:
        product = product_models_validator.validate_product(data["product"])

    if not "required_quantity" in data:
        errors.append("Quantity required")
    else:
        required_quantity = int(data["required_quantity"])

    if "customer" in data:
        customer = validate_user(data["customer"])
        customer_name = customer.first_name + " " + customer.last_name
        customer_phone = customer.phone

    if "customer_name" in data:
        customer_name = data["customer_name"]

    if "unit_of_receipt" in data:
        unit_of_receipt = data["unit_of_receipt"]

    if "customer_phone" in data:
        customer_phone = data["customer_phone"]

    if "is_special_order" in data:
        is_special_order = data["is_special_order"]

    if errors:
        return errors, None

    if not is_special_order:
        if RetailerReceipts.objects.filter(
            product=product,
            current_unit_quantity__gte=required_quantity,
            entity=user.entity,
        ).exists():
            item = RetailerReceipts.objects.filter(
                product=product,
                current_unit_quantity__gte=required_quantity,
                entity=user.entity,
            ).first()
            errors.append(
                f"Quantity {item.current_unit_quantity} of "
                f"{item.product.title} is available at "
                f"{user.entity.title.upper()}"
            )
            return errors, None

    two_minutes_ago = datetime.datetime.now() - datetime.timedelta(minutes=2)
    if OutOfStock.objects.filter(
        product=product,
        required_quantity=required_quantity,
        created__gte=two_minutes_ago,
    ).exists():
        errors.append("A similar entry was done in under 2 minutes ago")
        return errors, None

    created = OutOfStock.objects.create(
        product=product,
        owner=user,
        required_quantity=required_quantity,
        is_special_order=is_special_order,
        customer=customer,
        unit_of_receipt=unit_of_receipt,
        customer_name=customer_name,
        customer_phone=customer_phone,
        entity=user.entity,
    )
    return [], created


@transaction.atomic
def update_out_of_stock_item(data, user):
    errors = []
    out_of_stock_item = None

    if not data.get("out_of_stock_item_id"):
        errors.append("Out of stock item ID is required")
        return errors, None

    if OutOfStock.objects.filter(
        id=data["out_of_stock_item_id"]
    ).exists():
        out_of_stock_item = OutOfStock.objects.filter(
            id=data["out_of_stock_item_id"]
        ).first()
    else:
        errors.append("No item with provided ID found")
        return errors, None

    if "product" in data:
        product = product_models_validator.validate_product(data["product"])
        out_of_stock_item.product = product
        out_of_stock_item.save()

    if "required_quantity" in data:
        out_of_stock_item.required_quantity = int(
            data["required_quantity"]
        )
        out_of_stock_item.save()

    if "customer_name" in data:
        out_of_stock_item.customer_name = data["customer_name"]
        out_of_stock_item.save()

    if "unit_of_issue" in data:
        out_of_stock_item.unit_of_issue = data["unit_of_issue"]
        out_of_stock_item.save()

    if "customer_phone" in data:
        out_of_stock_item.customer_phone = data["customer_phone"]
        out_of_stock_item.save()

    if "is_special_order" in data:
        out_of_stock_item.is_special_order = data["is_special_order"]
        out_of_stock_item.save()

    return [], out_of_stock_item


def retrieve_out_of_stock_items(user):
    items = []
    if OutOfStock.objects.filter(entity=user.entity).exists():
        items = OutOfStock.objects.filter(entity=user.entity).all()
    return items


# ===========================================================================
# Wholesale offers
# ===========================================================================

def get_wholesale_offers_for_product(product):
    wholesaler_offerings = []

    receipts = (
        WholesalerReceipts.objects
        .filter(product=product, current_unit_quantity__gte=0)
        .order_by("-unit_selling_price")[:3]
    )

    for receipt in receipts:
        price_discount = {}
        quantity_discount = {}
        price_discount_banners = []
        quantity_discount_banners = []

        wpd = WholesalerPriceDiscounts.objects.filter(
            wholesaler_receipt=receipt, is_active="true",
        ).first()
        if wpd:
            for banner in WholesalerPriceDiscountBanners.objects.filter(
                wholesaler_price_discount=wpd,
            ):
                price_discount_banners.append(
                    {"banner": banner.price_discount_banner.url}
                )
            price_discount = {
                "id": wpd.id,
                "title": wpd.title,
                "percent": wpd.percent,
                "normal_price": wpd.normal_price,
                "offer_price": wpd.offer_price,
                "is_active": wpd.is_active,
                "start": wpd.start,
                "end": wpd.end,
                "banners": price_discount_banners,
            }

        wqd = WholesalerQuantityDiscounts.objects.filter(
            wholesaler_receipt=receipt, is_active="true",
        ).first()
        if wqd:
            for banner in WholesalerQuantityDiscountBanners.objects.filter(
                wholesaler_quantity_discount=wqd,
            ):
                quantity_discount_banners.append(
                    {"banner": banner.quantity_discount_banner.url}
                )
            quantity_discount = {
                "id": wqd.id,
                "title": wqd.title,
                "limit_quantity": wqd.limit_quantity,
                "awarded_quantity": wqd.awarded_quantity,
                "is_active": wqd.is_active,
                "start": wqd.start,
                "end": wqd.end,
                "banners": quantity_discount_banners,
            }

        wholesaler_offerings.append({
            "wholesale_inventory_id": receipt.id,
            "wholesale_id": (
                receipt.received_from.id if receipt.received_from else None
            ),
            "wholesale_title": (
                receipt.received_from.title if receipt.received_from else ""
            ),
            "current_unit_quantity": receipt.current_unit_quantity,
            "unit_selling_price": receipt.unit_selling_price,
            "final_unit_selling_price": receipt.final_unit_selling_price,
            "recommended_retail_price": receipt.recommended_retail_price,
            "price_discount": price_discount,
            "quantity_discount": quantity_discount,
            "manufacture_date": receipt.manufacture_date,
            "expiry_date": receipt.expiry_date,
        })

    return wholesaler_offerings


def retrieve_product_wholesale_offers(data, user):
    product = None
    errors = []

    if not data.get("product"):
        errors.append("Product ID is required")
        return errors, None

    product = product_models_validator.validate_product(data["product"])

    if WholesalerReceipts.objects.filter(
        product=product, pack_quantity__gte=1
    ).exists():
        return (
            [],
            WholesalerReceipts.objects.filter(
                product=product, pack_quantity__gte=1
            ).all(),
        )
    return errors, []


# ===========================================================================
# Order estimates
# ===========================================================================

def generate_order_estimates(data, user, request):
    retailer_indent = None
    lead_time = None
    order_days = None
    products = None

    if data.get("order_days") not in (None, ""):
        order_days = int(data["order_days"])
    else:
        raise exceptions.ValidationError("order days is required")

    if data.get("lead_time_days") not in (None, ""):
        lead_time = int(data["lead_time_days"])
    else:
        raise exceptions.ValidationError("Lead time days is required")

    total_order_days = order_days + lead_time

    if RetailerIndent.objects.filter(
        entity=user.entity, is_open="true", owner=user
    ).exists():
        retailer_indent = RetailerIndent.objects.filter(
            entity=user.entity, is_open="true", owner=user
        ).first()
        retailer_indent.lead_time = lead_time
        retailer_indent.order_days = total_order_days
        retailer_indent.save()
    else:
        indent_number = generate_document_number(
            user.entity, user, "INDENT"
        )
        retailer_indent = RetailerIndent.objects.create(
            indent_number=indent_number,
            entity=user.entity,
            is_open="true",
            order_days=total_order_days,
            owner=user,
            lead_time=lead_time,
        )

    customer_order_items = []
    out_of_sock_items = []
    todays_date = datetime.datetime.today()
    days_ago = todays_date - datetime.timedelta(
        days=int(data["order_days"])
    )

    order_estimates = []
    products_from_sales = []
    products_from_os = []

    if OutOfStock.objects.filter(
        entity=user.entity, created__gte=days_ago
    ).exists():
        out_of_stocks = OutOfStock.objects.filter(
            entity=user.entity, created__gte=days_ago
        )
        products_from_os = list(
            set(map(get_products_from_os, out_of_stocks))
        )

    if CustomerOrderItems.objects.filter(
        entity=user.entity,
        created__gte=days_ago,
        created__lte=todays_date,
    ).exists():
        customer_order_items = CustomerOrderItems.objects.filter(
            entity=user.entity,
            created__gte=days_ago,
            created__lte=todays_date,
        )
        products_from_sales = list(
            set(map(get_products, customer_order_items))
        )

    products = list(set(products_from_os + products_from_sales))

    if not products or len(products) == 0:
        return []

    for prod in products:
        quantity = 0
        average_sold = 0
        current_balance = get_current_balance(prod)

        for coi in customer_order_items:
            if coi.retailer_receipt.product == prod:
                quantity += coi.purchased_quantity

        average_sold = round(quantity / order_days, 2)
        quantity_estimate = int(average_sold * total_order_days)

        if quantity_estimate < current_balance:
            quantity_estimate = 0
        else:
            quantity_estimate = quantity_estimate - current_balance

        if OrderEstimate.objects.filter(
            product=prod, is_ordered="false"
        ).exists():
            order_estimate = OrderEstimate.objects.filter(
                product=prod, is_ordered="false"
            ).first()
            order_estimate.sold_quantity = quantity
            order_estimate.current_quantity = current_balance
            order_estimate.required_estimate = quantity_estimate
            order_estimate.average_sold_daily = average_sold
            order_estimate.retailer_indent = retailer_indent
            order_estimate.save()
        else:
            OrderEstimate.objects.create(
                entity=user.entity,
                product=prod,
                retailer_indent=retailer_indent,
                sold_quantity=quantity,
                average_sold_daily=average_sold,
                required_estimate=quantity_estimate,
                current_quantity=get_current_balance(prod),
                is_ordered="false",
                owner=user,
            )

        out_of_sock_items = OutOfStock.objects.filter(
            entity=user.entity,
            product=prod,
            is_ordered="false",
            created__gte=days_ago,
        )

        product_os_quantity_collated = 0
        for os in out_of_sock_items:
            product_os_quantity_collated += os.required_quantity

        if product_os_quantity_collated < get_current_balance(prod):
            product_os_quantity_collated = 0
        else:
            product_os_quantity_collated = (
                product_os_quantity_collated - get_current_balance(prod)
            )

        if OrderEstimate.objects.filter(
            product=prod,
            is_ordered="false",
            retailer_indent=retailer_indent,
        ).exists():
            order_estimate = OrderEstimate.objects.filter(
                product=prod,
                is_ordered="false",
                retailer_indent=retailer_indent,
            ).first()
            order_estimate.current_quantity = get_current_balance(prod)
            order_estimate.required_estimate = (
                order_estimate.required_estimate
                + product_os_quantity_collated
            )
            order_estimate.save()
        else:
            OrderEstimate.objects.create(
                entity=user.entity,
                product=prod,
                retailer_indent=retailer_indent,
                current_quantity=get_current_balance(prod),
                required_estimate=product_os_quantity_collated,
                is_ordered="false",
                owner=user,
            )

        unindenteds = OrderEstimate.objects.filter(
            retailer_indent=None
        ).all()
        for unindented in unindenteds:
            unindented.delete()

        all_estimates = OrderEstimate.objects.filter(
            retailer_indent=retailer_indent
        ).all()

        for order_estimate in all_estimates:
            if RetailerIndentItem.objects.filter(
                retailer_indent=retailer_indent,
                wholesale_receipt__product=order_estimate.product,
            ).exists():
                to_update = RetailerIndentItem.objects.filter(
                    retailer_indent=retailer_indent,
                    wholesale_receipt__product=order_estimate.product,
                ).first()
                to_update.required_quantity = (
                    order_estimate.required_estimate
                )
                to_update.save()

        return all_estimates


# ===========================================================================
# Customer orders — queries
# ===========================================================================

def get_user_own_orders(user, data):
    today = datetime.date.today()
    tommorow = today + datetime.timedelta(days=1)

    if (
        "filters" in data
        and "from_date" in data["filters"]
        and "to_date" in data["filters"]
    ):
        from_date = parse_datetime(
            data["filters"]["from_date"]
        ).strftime("%Y-%m-%d %H:%M:%S")
        to_date = parse_datetime(
            data["filters"]["to_date"] + " 23:59:59"
        ).strftime("%Y-%m-%d %H:%M:%S")

        return (
            CustomerOrders.objects
            .filter(entity=user.entity)
            .filter(created__gte=from_date, created__lte=to_date)
            .order_by("-created")
        )

    return (
        CustomerOrders.objects
        .filter(entity=user.entity)
        .filter(created__gte=today, created__lt=tommorow)
        .order_by("-created")
    )


def get_entity_orders(user, data):
    today = datetime.date.today()
    tommorow = today + datetime.timedelta(days=1)

    if (
        "filters" in data
        and "from_date" in data["filters"]
        and "to_date" in data["filters"]
    ):
        from_date = parse_datetime(
            data["filters"]["from_date"]
        ).strftime("%Y-%m-%d %H:%M:%S")
        to_date = parse_datetime(
            data["filters"]["to_date"] + " 23:59:59"
        ).strftime("%Y-%m-%d %H:%M:%S")

        return (
            CustomerOrders.objects
            .filter(entity=user.entity)
            .filter(created__gte=from_date, created__lte=to_date)
            .order_by("-created")
        )

    return (
        CustomerOrders.objects
        .filter(entity=user.entity)
        .filter(created__gte=today, created__lt=tommorow)
        .order_by("-created")
    )


def get_employee_orders(data, user):
    try:
        if Employees.objects.filter(
            user=user, entity=user.entity
        ).exists():
            employee = Employees.objects.filter(
                user=user,
                entity=user.entity,
                created__gte=get_formatted_from_date(data),
                created__lte=get_formatted_to_date(data),
            ).first()
            return CustomerOrders.objects.filter(
                employee=employee,
                entity=user.entity,
                created__gte=get_formatted_from_date(data),
                created__lte=get_formatted_to_date(data),
            )
        raise exceptions.ValidationError(
            "Employee with given ID does not exist in your entity"
        )
    except KeyError:
        raise exceptions.ValidationError(
            "An error occurred while retrieving employee orders"
        )


def get_own_orders(data, user):
    try:
        if CustomerOrders.objects.filter(user=user).exists():
            return (
                CustomerOrders.objects
                .filter(
                    owner=user,
                    created__gte=get_formatted_from_date(data),
                    created__lte=get_formatted_to_date(data),
                )
                .all()
                .order_by("created")[:20]
            )
        return []
    except KeyError:
        raise exceptions.ValidationError(
            "An error occurred while retrieving employee orders"
        )


def get_user_orders(user):
    return CustomerOrders.objects.filter(entity=user.entity, owner=user)


def get_customer_orders(data, user):
    try:
        customer_id = data["customer"]
        if Users.objects.filter(id=customer_id).exists():
            return CustomerOrders.objects.filter(customer_id=customer_id)
        raise exceptions.ValidationError(
            "User for provided ID does not exist"
        )
    except KeyError:
        raise exceptions.ValidationError("Customer ID is required")


def get_bodaboda_deliveries(data, user):
    bodaboda = None
    bodaboda_assigned_orders = []
    tommorow = get_tommorow()
    today = get_today()

    if BodaLocations.objects.filter(owner=user).exists():
        bodaboda = BodaLocations.objects.filter(owner=user).first()

    if CustomerOrders.objects.filter(
        bodaboda=bodaboda,
        created__lt=tommorow,
        created__gte=today,
        status="ASSIGNED",
    ).exists():
        bodaboda_assigned_orders = CustomerOrders.objects.filter(
            bodaboda=bodaboda,
            created__lt=tommorow,
            created__gte=today,
            status="ASSIGNED",
        ).all()

    return bodaboda_assigned_orders


def get_customer_order_payments(data, user):
    if CustomerOrderPayment.objects.filter(
        receiving_entity=user.entity,
        created__gte=get_formatted_from_date(data),
        created__lte=get_formatted_to_date(data),
    ).exists():
        return CustomerOrderPayment.objects.filter(
            receiving_entity=user.entity,
            created__gte=get_formatted_from_date(data),
            created__lte=get_formatted_to_date(data),
        ).all()
    return []


def get_customer_order_settlements(data, user):
    return []


def get_customer_order_items(data, user):
    qs = CustomerOrderItems.objects.filter(entity=user.entity)
    today = timezone.now().date()

    if (
        "filters" in data
        and "from_date" in data["filters"]
        and "to_date" in data["filters"]
    ):
        from_date = parse_datetime(
            data["filters"]["from_date"]
        ).strftime("%Y-%m-%d")
        to_date = parse_datetime(
            data["filters"]["to_date"]
        ).strftime("%Y-%m-%d")
        return qs.filter(created__gte=from_date, created__lte=to_date)

    return qs.filter(created__gte=today)


def get_order_price_total(customer_order):
    total = (
        CustomerOrderItems.objects
        .filter(customer_order=customer_order)
        .aggregate(total=Sum("item_net_price_total"))["total"]
    ) or Decimal("0.00")

    if customer_order.shipping_cost and customer_order.shipping_cost > 0:
        total += Decimal(str(customer_order.shipping_cost))

    return _q(total)


def get_title(self, item):
    return item.title


# ===========================================================================
# Customer orders — search
# ===========================================================================

def search_customer_orders(data, user):
    """
    Server-side order search.

    Required:
        search_param (str) — matches order number, customer name,
                             customer phone, or either reference.
    Optional:
        receipt_id (str)   — restrict to orders that contain this
                             retailer receipt in their items.

    Returns a QuerySet (possibly empty). The view's paginator
    handles the response shape.
    """
    search_param = str(data.get("search_param") or "").strip()

    queryset = CustomerOrders.objects.filter(entity=user.entity)

    if search_param:
        queryset = queryset.filter(
            Q(order_number__document_number__icontains=search_param)
            | Q(customer_name__icontains=search_param)
            | Q(customer_phone__icontains=search_param)
            | Q(reference_number__icontains=search_param)
            | Q(psp_reference_number__icontains=search_param)
        )

    receipt_id = data.get("receipt_id")
    if receipt_id:
        queryset = queryset.filter(
            parent_order__retailer_receipt_id=receipt_id
        )

    return queryset.distinct().order_by("-created")[:100]


# ===========================================================================
# Customer orders — validators
# ===========================================================================

def validate_customer_order_data(data, user):
    errors = []
    retailer_receipt = None
    order_origin = None
    employee = None

    employee = employees_models_validators.validate_employee(user)

    try:
        customer_order = data["customer_order_details"]
        if customer_order == {}:
            errors.append("Customer order details is empty")
    except KeyError:
        errors.append("Customer order details are required")

    try:
        order_origin = data["customer_order_details"]["order_origin"]
        if order_origin == "":
            errors.append("Order origin cannot be empty")
    except KeyError:
        errors.append("Order origin is required")

    try:
        order_items = data["customer_order_details"]["order_items"]
        if order_origin == "STAFF" and len(order_items) < 1:
            errors.append("No order items in the order")

        for item in order_items:
            try:
                retailer_receipt_id = item["retailer_receipt"]
                if RetailerReceipts.objects.filter(
                    id=retailer_receipt_id
                ).exists():
                    retailer_receipt = RetailerReceipts.objects.filter(
                        id=retailer_receipt_id
                    ).first()
                else:
                    raise exceptions.ValidationError(
                        "Retailer receipt for supplied ID does not exist"
                    )
            except KeyError:
                errors.append("Retailer receipt is required.")

    except KeyError:
        errors.append("Order items are required.")

    if errors:
        raise exceptions.ValidationError(errors)


def validate_order_payment_method_data(data):
    errors = []

    try:
        customer_order = data["customer_order"]
        if customer_order == {}:
            errors.append("Customer order ID is required")
    except KeyError:
        errors.append("Customer order details are required")

    try:
        _ = data["payment_method"]
    except KeyError:
        errors.append("Payment method ID is required")

    if errors:
        raise exceptions.ValidationError(errors)


# ===========================================================================
# Retailer indents
# ===========================================================================

@transaction.atomic
def create_estimate_indent(data, user):
    errors = []
    order_days = data.get("order_days")
    lead_time = data.get("lead_time")
    indent_items = data.get("indent_items")

    if not order_days:
        errors.append(
            "Number of days the order inventory is projected to last "
            "is required"
        )
        return errors, None
    if lead_time is None:
        errors.append("Lead time is required")
        return errors, None
    if not indent_items:
        errors.append("Add indent items")
        return errors, None

    header_errors, indent = create_retailer_indent(
        {"order_days": order_days, "lead_time": lead_time},
        user,
    )
    if header_errors:
        return header_errors, None

    for entry in indent_items:
        item_errors, _ = create_retailer_indent_item(
            {
                "retailer_indent": indent.id,
                "wholesale_receipt": entry.get("offer_id"),
                "required_quantity": entry.get("required_estimate"),
            },
            user,
        )
        if item_errors:
            errors.extend(item_errors)

    return errors, indent


@transaction.atomic
def create_retailer_indent(data, user):
    """
    Create or update the retailer's open indent.

    Accepts an optional set of header config values. Fields not
    provided fall back to the model defaults on create, or are
    left untouched on update.
    """
    errors = []

    order_days = data.get("order_days")
    if order_days is None:
        errors.append(
            "Number of days the order inventory is projected "
            "to last is required"
        )
        return errors, None

    try:
        order_days = int(order_days)
    except (TypeError, ValueError):
        errors.append("order_days must be an integer")
        return errors, None

    if order_days <= 0:
        errors.append("order_days must be greater than zero")
        return errors, None

    lead_time = data.get("lead_time")
    if lead_time is None:
        errors.append("Lead time is required")
        return errors, None

    try:
        lead_time = int(lead_time)
    except (TypeError, ValueError):
        errors.append("lead_time must be an integer")
        return errors, None

    if lead_time < 0:
        errors.append("lead_time must be zero or greater")
        return errors, None

    optional_updates = {}

    if "budget_amount" in data:
        raw = data.get("budget_amount")
        if raw in (None, ""):
            optional_updates["budget_amount"] = None
        else:
            try:
                optional_updates["budget_amount"] = Decimal(str(raw))
            except (TypeError, ValueError, InvalidOperation):
                errors.append("budget_amount must be a valid number")
                return errors, None

    if "budget_enforced" in data:
        raw = data.get("budget_enforced")
        if isinstance(raw, bool):
            optional_updates["budget_enforced"] = (
                "true" if raw else "false"
            )
        else:
            s = str(raw).strip().lower()
            if s in ("true", "false"):
                optional_updates["budget_enforced"] = s
            else:
                errors.append("budget_enforced must be true or false")
                return errors, None

    if "pricing_percentage" in data:
        raw = data.get("pricing_percentage")
        if raw in (None, ""):
            optional_updates["pricing_percentage"] = Decimal("0.00")
        else:
            try:
                optional_updates["pricing_percentage"] = Decimal(
                    str(raw)
                )
            except (TypeError, ValueError, InvalidOperation):
                errors.append(
                    "pricing_percentage must be a valid number"
                )
                return errors, None

    if "is_open" in data:
        raw = data.get("is_open")
        if isinstance(raw, bool):
            optional_updates["is_open"] = "true" if raw else "false"
        else:
            s = str(raw).strip().lower()
            if s in ("true", "false"):
                optional_updates["is_open"] = s
            else:
                errors.append("is_open must be true or false")
                return errors, None

    existing = (
        RetailerIndent.objects
        .filter(owner=user, entity=user.entity, is_open="true")
        .order_by("-created")
        .first()
    )

    if existing:
        existing.lead_time = lead_time
        existing.order_days = order_days
        for field, value in optional_updates.items():
            setattr(existing, field, value)

        existing.save(update_fields=[
            "lead_time",
            "order_days",
            *optional_updates.keys(),
        ])
        return [], existing

    created = RetailerIndent.objects.create(
        owner=user,
        entity=user.entity,
        is_open="true",
        order_days=order_days,
        lead_time=lead_time,
        **optional_updates,
    )
    return [], created


def get_wholesaler_from_indent_item(indent_item):
    return indent_item.wholesale_receipt.entity


def get_indent_items_for_wholesaler(wholesale, indent_items):
    return [
        item for item in indent_items
        if item.wholesale_receipt.entity == wholesale
    ]


def create_retail_indent(user):
    indent_number = generate_document_number(user.entity, user, "INDENT")
    return RetailerIndent.objects.create(
        indent_number=indent_number,
        owner=user,
        is_open="true",
        order_days=30,
        lead_time=7,
        entity=user.entity,
    )


def _create_open_indent(user):
    """Reuse an existing open indent or create a new one."""
    existing = (
        RetailerIndent.objects
        .filter(owner=user, entity=user.entity, is_open="true")
        .order_by("-created")
        .first()
    )
    if existing:
        return existing

    return RetailerIndent.objects.create(
        owner=user,
        entity=user.entity,
        is_open="true",
        lead_time=0,
        order_days=getattr(user.entity, "order_days", 30) or 30,
    )


@transaction.atomic
def create_retailer_indent_item(data, user):
    from retailers.models import IndentItemSource
    from wholesalers import models as wholesalers_models

    errors = []
    retailer_indent = None

    raw_indent_id = data.get("retailer_indent")
    if not raw_indent_id:
        errors.append("Indent ID is required")
    else:
        retailer_indent = RetailerIndent.objects.filter(
            id=raw_indent_id
        ).first()
        if retailer_indent is None or retailer_indent.is_open == "false":
            retailer_indent = _create_open_indent(user)

    wholesale_receipt = None
    raw_receipt_id = data.get("wholesale_receipt")
    if not raw_receipt_id:
        errors.append("Wholesale product ID is required")
    else:
        wholesale_receipt = validate_wholesaler_receipt(raw_receipt_id)
        if wholesale_receipt is None:
            errors.append("Wholesale product not found")

    required_quantity = None
    raw_qty = data.get("required_quantity")
    if raw_qty in (None, 0, "0", ""):
        errors.append("Quantity is required")
    else:
        required_quantity = _to_int(raw_qty)
        if required_quantity <= 0:
            errors.append("Quantity must be greater than zero")

    source = IndentItemSource.MANUAL
    raw_source = data.get("source") or data.get("indenting_criteria")
    if raw_source:
        raw_source = str(raw_source).upper()
        valid_sources = {c[0] for c in IndentItemSource.choices}
        if raw_source in valid_sources:
            source = raw_source
        else:
            errors.append(
                f"source must be one of {sorted(valid_sources)}"
            )

    wholesaler_price_discount = None
    raw_pd = data.get("wholesaler_price_discount")
    if raw_pd:
        from wholesalers.validators import wholesalers_models_validators
        wholesaler_price_discount = (
            wholesalers_models_validators
            .validate_wholesaler_price_discount(raw_pd)
        )
        if wholesaler_price_discount is None:
            errors.append("Price discount not found")

    wholesaler_quantity_discount = None
    raw_qd = data.get("wholesaler_quantity_discount")
    if raw_qd:
        from wholesalers.validators import wholesalers_models_validators
        wholesaler_quantity_discount = (
            wholesalers_models_validators
            .validate_wholesaler_quantity_discount(raw_qd)
        )
        if wholesaler_quantity_discount is None:
            errors.append("Quantity discount not found")

    campaign_item = None
    raw_campaign_item = data.get("campaign_item")
    if raw_campaign_item:
        try:
            from wholesalers.models import WholesalerCampaignItem
            campaign_item = WholesalerCampaignItem.objects.filter(
                id=raw_campaign_item
            ).first()
        except ImportError:
            campaign_item = None

    if errors:
        return errors, None

    existing = RetailerIndentItem.objects.filter(
        wholesale_receipt=wholesale_receipt,
        retailer_indent=retailer_indent,
        entity=user.entity,
    ).first()

    if existing:
        existing.required_quantity = required_quantity
        existing.source = source
        existing.wholesaler_price_discount = wholesaler_price_discount
        existing.wholesaler_quantity_discount = (
            wholesaler_quantity_discount
        )
        if campaign_item is not None:
            existing.campaign_item = campaign_item
        existing.save()
        return [], existing

    created = RetailerIndentItem.objects.create(
        owner=user,
        entity=user.entity,
        retailer_indent=retailer_indent,
        wholesale_receipt=wholesale_receipt,
        required_quantity=required_quantity,
        source=source,
        wholesaler_price_discount=wholesaler_price_discount,
        wholesaler_quantity_discount=wholesaler_quantity_discount,
        campaign_item=campaign_item,
    )
    return [], created


def update_retailer_indent_item(data, user):
    """
    Update a single RetailerIndentItem's editable fields.

    `data` shape:
        {
            "indent_id": "<retailer indent id>",
            "item_id":   "<retailer indent item id>",
            "params": {
                "required_quantity":        20,
                "recommended_retail_price": "150.00" | null,
                "markup_percentage_used":   "30.00"  | null,
            }
        }
    """
    errors = []

    indent_id = data.get("indent_id")
    item_id = data.get("item_id")
    params = data.get("params", {}) or {}

    if not indent_id:
        errors.append("indent_id is required")
    if not item_id:
        errors.append("item_id is required")
    if errors:
        return errors, None

    entity = getattr(user, "entity", None)
    if not entity:
        errors.append("User has no entity")
        return errors, None

    item = (
        RetailerIndentItem.objects
        .filter(
            id=item_id,
            retailer_indent_id=indent_id,
            entity=entity,
        )
        .select_related(
            "retailer_indent",
            "wholesale_receipt",
            "wholesaler_price_discount",
            "wholesaler_quantity_discount",
        )
        .first()
    )
    if item is None:
        errors.append("Indent item not found")
        return errors, None

    indent = item.retailer_indent
    if indent is None:
        errors.append("Indent item has no parent indent")
        return errors, None

    if indent.is_open != "true":
        errors.append("Cannot edit items on a closed indent")
        return errors, None

    if "required_quantity" in params:
        try:
            qty = int(params["required_quantity"] or 0)
        except (TypeError, ValueError):
            errors.append("required_quantity must be an integer")
            qty = None

        if qty is not None:
            if qty < 0:
                errors.append("required_quantity must be >= 0")
            else:
                item.required_quantity = qty

    if "recommended_retail_price" in params:
        raw = params["recommended_retail_price"]
        if raw in (None, "", "0.00", "0", 0):
            item.recommended_retail_price = None
        else:
            try:
                item.recommended_retail_price = Decimal(str(raw))
            except (TypeError, ValueError, InvalidOperation):
                errors.append(
                    "recommended_retail_price must be a number"
                )

    markup_override = None
    if "markup_percentage_used" in params:
        raw = params["markup_percentage_used"]
        if raw not in (None, "", "0.00", "0", 0):
            try:
                markup_override = Decimal(str(raw))
            except (TypeError, ValueError, InvalidOperation):
                errors.append(
                    "markup_percentage_used must be a number"
                )

    if errors:
        return errors, None

    try:
        if markup_override is not None:
            item.recalculate(markup_override=markup_override)
            item.save(recalculate=False)
        else:
            item.save()
    except Exception as e:
        errors.append(f"Save failed: {e}")
        return errors, None

    return [], item


@transaction.atomic
def close_retailer_indent(data, user):
    from wholesalers.models import RetailerOrderItems, RetailerOrders

    errors = []

    indent_id = data.get("indent")
    if not indent_id:
        return ["Indent ID is required"], None

    indent = RetailerIndent.objects.filter(id=indent_id).first()
    if not indent:
        return ["Indent with provided ID does not exist"], None

    if indent.is_open == "false":
        return ["Indent is already closed"], None

    indent_items = list(
        RetailerIndentItem.objects
        .filter(retailer_indent=indent)
        .select_related(
            "wholesale_receipt__entity",
            "wholesaler_price_discount",
            "wholesaler_quantity_discount",
        )
    )
    if not indent_items:
        return ["Indent has no items"], None

    by_wholesaler = {}
    for item in indent_items:
        if not item.wholesale_receipt:
            errors.append(f"Item {item.id} has no receipt")
            continue
        wid = item.wholesale_receipt.entity.id
        if wid is None:
            errors.append(
                f"Receipt {item.wholesale_receipt_id} has no wholesaler"
            )
            continue
        by_wholesaler.setdefault(wid, []).append(item)

    if not by_wholesaler:
        if indent.is_open != "true":
            indent.is_open = "true"
            indent.save(update_fields=["is_open", "updated"])
        return errors or ["No valid items to order from"], indent

    orders_created = 0
    items_created = 0

    for wid, group in by_wholesaler.items():
        document_number = generate_document_number(
            user.entity, user, "RETAILERORDER",
        )
        order = RetailerOrders.objects.create(
            document_number=document_number,
            owner=user,
            retailer=indent.entity,
            wholesaler_id=wid,
            entity=user.entity,
            status="SUBMITTED",
            order_origin="RETAILER",
            retailer_indent=indent,
        )

        order_items_created = 0

        for indent_item in group:
            qd = indent_item.wholesaler_quantity_discount
            if (
                qd is not None
                and (qd.limit_quantity or 0) > 0
                and (qd.awarded_quantity or 0) > 0
            ):
                blocks = (
                    indent_item.required_quantity // qd.limit_quantity
                )
                discount_quantity = blocks * qd.awarded_quantity
            else:
                discount_quantity = 0

            est = indent_item.profit_estimate or {}
            cost_unit = _q(est.get("cost_per_unit") or 0)
            sell_unit = _q(est.get("sell_per_unit") or 0)
            purchased_qty = int(indent_item.required_quantity or 0)

            RetailerOrderItems.objects.create(
                retailer_order=order,
                retailer_indent_item=indent_item,
                wholesaler_receipt=indent_item.wholesale_receipt,
                purchased_quantity=purchased_qty,
                discount_quantity=discount_quantity,
                total_quantity=purchased_qty + discount_quantity,
                unit_of_issue=getattr(
                    indent_item.wholesale_receipt,
                    "unit_of_receipt", "Pack",
                ),
                item_price=cost_unit,
                item_price_total=_q(cost_unit * purchased_qty),
                item_final_price=cost_unit,
                item_final_price_total=_q(cost_unit * purchased_qty),
                item_net_price=cost_unit,
                item_net_price_total=_q(cost_unit * purchased_qty),
                intended_retail_unit_price=sell_unit,
                intended_retail_unit_price_source=est.get(
                    "pricing_source", "markup",
                ),
                entity=indent.entity,
                owner=user,
            )
            order_items_created += 1

        if order_items_created == 0:
            order.delete()
            continue

        order.recalculate(save=True)

        orders_created += 1
        items_created += order_items_created

    if orders_created == 0 or items_created == 0:
        if indent.is_open != "true":
            indent.is_open = "true"
            indent.save(update_fields=["is_open", "updated"])
        errors.append(
            "No retailer orders were created — indent remains open."
        )
        return errors, indent

    indent.is_open = "false"
    indent.save(update_fields=["is_open", "updated"])
    return [], indent


@transaction.atomic
def remove_retailer_indent_item(data, user):
    errors = []
    retailer_indent = None
    indent_items = []

    if data.get("retailer_indent"):
        if RetailerIndent.objects.filter(
            id=data["retailer_indent"]
        ).exists():
            retailer_indent = RetailerIndent.objects.filter(
                id=data["retailer_indent"]
            ).first()
    else:
        errors.append("Indent ID is required")

    if data.get("retailer_indent_item"):
        if RetailerIndentItem.objects.filter(
            id=data["retailer_indent_item"],
            retailer_indent=retailer_indent,
        ).exists():
            item_to_delete = RetailerIndentItem.objects.filter(
                id=data["retailer_indent_item"],
                retailer_indent=retailer_indent,
            ).first()
            item_to_delete.delete()
            indent_items = RetailerIndentItem.objects.filter(
                retailer_indent=retailer_indent
            ).all()
    else:
        errors.append("Indent item ID is required")

    return errors, indent_items


def retrieve_open_indent(user):
    errors = []
    if RetailerIndent.objects.filter(
        owner=user, entity=user.entity, is_open="true"
    ).exists():
        indent = RetailerIndent.objects.filter(
            owner=user, entity=user.entity, is_open="true"
        ).first()
        return [], indent

    errors.append("No open indent")
    return errors, None


def retrieve_retailer_indents(user):
    items = []
    if RetailerIndent.objects.filter(
        entity=user.entity, owner=user
    ).exists():
        items = RetailerIndent.objects.filter(
            entity=user.entity, owner=user
        ).order_by("-created").all()[:10]
    return items


def retrieve_retailer_indent_items(data):
    arr = {}
    retailer_indent_id = None

    if not data.get("retailer_indent"):
        raise exceptions.ValidationError("Indent ID is required")

    retailer_indent_id = data["retailer_indent"]
    if not RetailerIndentItem.objects.filter(
        retailer_indent_id=retailer_indent_id
    ).exists():
        return []

    items = RetailerIndentItem.objects.filter(
        retailer_indent_id=retailer_indent_id
    ).all()

    wholesalers = list(set(map(lambda i: i.wholesale_receipt.entity, items)))
    create_log("warning", wholesalers)

    arr = []
    for wholesaler in wholesalers:
        if RetailerIndentItem.objects.filter(
            retailer_indent_id=retailer_indent_id,
            wholesale_receipt__entity=wholesaler,
        ).exists():
            wholesaler_items = RetailerIndentItem.objects.filter(
                retailer_indent_id=retailer_indent_id,
                wholesale_receipt__entity=wholesaler,
            ).all()
            value = 0.00
            for item in wholesaler_items:
                value += float(
                    item.wholesale_receipt.unit_selling_price
                ) * float(item.required_quantity)
            ent = {
                "wholesaler": EntityMiniSerializer(
                    wholesaler, context={"request": None}, many=False
                ).data,
                "items": RetailerIndentItemsSerializer(
                    wholesaler_items,
                    context={"request": None},
                    many=True,
                ).data,
                "value": value,
                "count": len(wholesaler_items),
            }
            arr.append(ent)

    create_log("warning", arr)
    return arr


# ===========================================================================
# Indent — close and generate orders (alternate flow)
# ===========================================================================

@transaction.atomic
def close_indent(data, user):
    from collections import defaultdict

    def _q_local(v):
        return Decimal(str(v or 0)).quantize(Decimal("0.01"))

    errors = []
    created_orders = []

    indent_id = data.get("retailer_indent")
    if not indent_id:
        return ["Retailer Indent is required"], []

    indent = (
        RetailerIndent.objects
        .filter(id=indent_id, owner=user)
        .first()
    )
    if indent is None:
        return ["Indent not found"], []

    if indent.is_open == "false":
        return ["Retailer indent is already closed"], []

    items = list(
        RetailerIndentItem.objects
        .filter(retailer_indent=indent)
        .select_related(
            "wholesale_receipt",
            "wholesale_receipt__product",
            "wholesale_receipt__received_from",
            "wholesaler_price_discount",
            "wholesaler_quantity_discount",
        )
    )
    if not items:
        return ["Indent has no items"], []

    by_wholesaler = defaultdict(list)
    for item in items:
        r = item.wholesale_receipt
        if r is None:
            errors.append(f"Item {item.id} has no receipt")
            continue
        if r.received_from_id is None:
            errors.append(f"Receipt {r.id} has no wholesaler")
            continue
        by_wholesaler[r.received_from_id].append(item)

    if errors:
        return errors, []

    expected_order_count = len(by_wholesaler)
    expected_item_count = len(items)

    try:
        for wholesaler_id, wholesaler_items in by_wholesaler.items():
            order = RetailerOrders.objects.create(
                wholesaler_id=wholesaler_id,
                retailer=user.entity,
                entity=user.entity,
                owner=user,
                reference_number=generate_reference_number(
                    user.entity, user
                ),
                order_origin="RETAILER",
                order_terms="CASH",
                order_type="NORMAL",
                delivery_method="SELF",
            )

            for indent_item in wholesaler_items:
                receipt = indent_item.wholesale_receipt
                purchased_qty = int(
                    indent_item.required_quantity or 0
                )
                if purchased_qty <= 0:
                    raise ValueError(
                        f"Item {indent_item.id} has zero or "
                        f"negative quantity"
                    )

                unit_price = _q_local(
                    receipt.pack_selling_price or 0
                )

                is_vatable = (
                    receipt.product is not None
                    and str(
                        getattr(
                            receipt.product, "is_vatable", "false"
                        )
                    ).lower()
                    == "true"
                )
                unit_tax = (
                    _q_local(unit_price * Decimal("0.16"))
                    if is_vatable
                    else Decimal("0.00")
                )

                pd = (
                    WholesalerPriceDiscounts.objects
                    .filter(wholesale_receipt=receipt)
                    .first()
                )
                if pd and pd.percent:
                    unit_discount = _q_local(
                        unit_price
                        * Decimal(str(pd.percent))
                        / Decimal("100")
                    )
                else:
                    unit_discount = Decimal("0.00")

                unit_net = _q_local(unit_price - unit_discount)

                discount_qty = 0
                for qd in (
                    WholesalerQuantityDiscounts.objects
                    .filter(wholesale_receipt=receipt)
                ):
                    limit_q = int(qd.limit_quantity or 0)
                    award_q = int(qd.awarded_quantity or 0)
                    if limit_q > 0 and purchased_qty % limit_q > 1:
                        discount_qty = award_q

                total_qty = purchased_qty + discount_qty

                est = indent_item.profit_estimate or {}
                sell_unit = _q_local(est.get("sell_per_unit") or 0)
                pricing_source = est.get("pricing_source", "markup")

                RetailerOrderItems.objects.create(
                    retailer_order=order,
                    retailer_indent_item=indent_item,
                    wholesaler_receipt=receipt,
                    purchased_quantity=purchased_qty,
                    discount_quantity=discount_qty,
                    total_quantity=total_qty,
                    unit_of_issue=getattr(
                        receipt, "unit_of_receipt", "Pack"
                    ),
                    item_price=unit_price,
                    item_price_total=_q_local(
                        unit_price * purchased_qty
                    ),
                    item_final_price=unit_net,
                    item_final_price_total=_q_local(
                        (unit_net + unit_tax) * total_qty
                    ),
                    item_tax=unit_tax,
                    item_tax_total=_q_local(
                        unit_tax * purchased_qty
                    ),
                    item_price_discount=unit_discount,
                    item_price_discount_total=_q_local(
                        unit_discount * purchased_qty
                    ),
                    item_net_price=unit_net,
                    item_net_price_total=_q_local(
                        unit_net * purchased_qty
                    ),
                    item_counter_price_discount=Decimal("0.00"),
                    item_counter_price_discount_amount=Decimal("0.00"),
                    item_counter_price_discount_amount_total=(
                        Decimal("0.00")
                    ),
                    intended_retail_unit_price=sell_unit,
                    intended_retail_unit_price_source=pricing_source,
                    owner=user,
                    entity=user.entity,
                )

            order.recalculate()
            created_orders.append(order)

    except Exception as e:
        transaction.set_rollback(True)
        return [
            f"Failed to create orders: {type(e).__name__}: {e}"
        ], []

    if len(created_orders) != expected_order_count:
        transaction.set_rollback(True)
        return [
            f"Expected {expected_order_count} orders, created "
            f"{len(created_orders)}. Indent not closed."
        ], []

    actual_item_count = (
        RetailerOrderItems.objects
        .filter(retailer_order__in=created_orders)
        .count()
    )
    if actual_item_count != expected_item_count:
        transaction.set_rollback(True)
        return [
            f"Expected {expected_item_count} order items, "
            f"created {actual_item_count}. Indent not closed."
        ], []

    try:
        indent.is_open = "false"
        indent.save()
    except Exception as e:
        transaction.set_rollback(True)
        return [
            f"Failed to close indent: {type(e).__name__}: {e}"
        ], []

    return [], created_orders


# ===========================================================================
# Retailer orders
# ===========================================================================

def retrieve_retailer_orders(user):
    items = []
    if RetailerOrders.objects.filter(entity=user.entity).exists():
        items = (
            RetailerOrders.objects
            .filter(entity=user.entity)
            .all()
            .order_by("-created")
        )
    return items


def retrieve_retailer_order_items(data):
    if not data.get("order"):
        raise exceptions.ValidationError("Order ID is required")

    order_id = data["order"]
    items = []
    if RetailerOrderItems.objects.filter(
        retailer_order__id=order_id
    ).exists():
        items = RetailerOrderItems.objects.filter(
            retailer_order__id=order_id
        ).all()
    return items


# ===========================================================================
# Wholesaler stock and payments
# ===========================================================================

def update_wholesaler_stock(retailer_order):
    retailer_order_items = RetailerOrderItems.objects.filter(
        retailer_order=retailer_order,
    )
    for roi in retailer_order_items:
        wholesaler_receipt = WholesalerReceipts.objects.filter(
            id=roi.wholesaler_receipt_id,
        ).first()
        if wholesaler_receipt:
            wholesaler_receipt.current_unit_quantity = max(
                0,
                (wholesaler_receipt.current_unit_quantity or 0)
                - roi.total_quantity,
            )
            wholesaler_receipt.save(
                update_fields=["current_unit_quantity"]
            )


def process_retailer_order_payment(
    retailer_order, payment_method, user, mobile_money_phone
):
    retailer_order_payment = None

    if RetailerOrderPayments.objects.filter(
        retailer_order=retailer_order.id
    ).exists():
        retailer_order_payment = RetailerOrderPayments.objects.filter(
            retailer_order=retailer_order.id
        ).first()

    amount = int(
        retailer_order.final_price_total + retailer_order.shipping_amount
    )

    errors = []
    administrator_account = None
    reference_number = generate_reference_number(
        retailer_order.retailer, user
    )

    if payment_method.title == "CASH":
        try:
            retailer_order_payment = RetailerOrderPayments.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="SUCCESS",
                amount=(
                    retailer_order.final_price_total
                    + retailer_order.shipping_amount
                ),
                entity_id=retailer_order.entity.id,
                currency="KES",
                owner=user,
                retailer_order=retailer_order,
            )

            if retailer_order_payment:
                update_wholesaler_stock(retailer_order)
                retailer_order.is_paid = "true"
                retailer_order.save()
                retailer_order.payment = retailer_order_payment
                use_reference_number(reference_number)
                return [], retailer_order

            errors.append("Error while creating customer order payment")
            return errors, None
        except Exception as e:
            errors.append(str(e))
            return errors, None

    elif payment_method.title == "MOBILE MONEY":
        if not UserAccounts.objects.filter(
            owner=retailer_order.wholesaler.administrator
        ).exists():
            errors.append("Entity has no collection account")
            return errors, None

        administrator_account = UserAccounts.objects.filter(
            owner=retailer_order.wholesaler.administrator
        ).first()

        telco, formatted_phone_number = get_telco_by_phone_number(
            mobile_money_phone
        )

        payload = None

        if telco == "MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": amount,
                "callBackUrl": (
                    "https://webhook.site/"
                    "7911487f-fc9e-46b0-a812-3adfa008375c"
                ),
                "accountTo": administrator_account.account_number,
                "description": "Merchant payment",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })
        elif telco == "AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": amount,
                "callBackUrl": (
                    "https://webhook.site/"
                    "94df1553-1b65-44c3-99ba-4ff3a32c554e"
                ),
                "accountTo": administrator_account.account_number,
                "currency": "KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })

        errors, result_json = jambopay_mobile_checkout(payload)
        if result_json:
            create_log("error", f"Errors at payment 2:{errors}")
            retailer_order_payment = RetailerOrderPayments.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="INITIATED",
                amount=float(
                    retailer_order.final_price_total
                    + retailer_order.shipping_amount
                ),
                entity=retailer_order.retailer,
                currency="KES",
                owner=user,
                retailer_order=retailer_order,
                psp_reference_number=result_json["ref"],
                telco=telco,
            )
            use_reference_number(reference_number)
            if retailer_order_payment:
                retailer_order.payment = retailer_order_payment
                retailer_order.save()
                return [], retailer_order

            errors.append("Customer order payment not created")
            return errors, None

        create_log("error", f"Errors at payment:{errors}")
        return errors, None

    elif payment_method.title == "JAMBOPAY WALLET":
        if not UserAccounts.objects.filter(
            owner=retailer_order.wholesaler.administrator
        ).exists():
            errors.append("Entity administrator has no collection account")
            return errors, None

        administrator_account = UserAccounts.objects.filter(
            owner=retailer_order.wholesaler.administrator
        ).first()

        errors, wallet = get_account_by_phone(mobile_money_phone)
        if wallet:
            data = {
                "orderId": reference_number,
                "amount": int(
                    retailer_order.order_price_total
                    + retailer_order.shipping_amount
                ),
                "callBackUrl": (
                    "https://webhook.site/"
                    "931bef21-de22-43bc-a45b-7e12999ac9cb"
                ),
                "accountTo": administrator_account.account_number,
                "description": "Customer order payment",
                "modeOfPayment": "WALLET_AS_SERVICE",
                "provider": "JAMBOPAY",
                "data": {
                    "serviceType": "MERCHANTPAYMENT",
                    "accountNo": wallet,
                },
            }
            response = jambopay_wallet_checkout(data)

            if "statusCode" not in response and "ref" in response:
                retailer_order_payment = RetailerOrderPayments.objects.create(
                    payment_method=payment_method,
                    reference_number=reference_number,
                    status="PENDING",
                    amount=float(
                        retailer_order.final_price_total
                        + retailer_order.shipping_amount
                    ),
                    entity=user.entity,
                    currency="KES",
                    owner=user,
                    retailer_order=retailer_order,
                )
                use_reference_number(reference_number)
                if retailer_order_payment:
                    return [], retailer_order

                errors.append("Ticket payment not created")
                return errors, [], None

            return errors, None, None

        errors.append("No wallet for provided mobile phone")
        return errors, None

    errors.append("Unsupported payment method")
    return errors, None, None


@transaction.atomic
def make_retailer_order_payment(data, user):
    errors = []
    retailer_order_id = None
    payment_method_id = None
    retailer_order = None
    payment_method = None
    mobile_money_phone = None

    if not data.get("retailer_order"):
        errors.append("Retailer order ID is required")
        return errors, None

    retailer_order_id = data["retailer_order"]
    if RetailerOrders.objects.filter(id=retailer_order_id).exists():
        retailer_order = RetailerOrders.objects.filter(
            id=retailer_order_id
        ).first()
    else:
        errors.append("Retailer order for provided ID does not exist")
        return errors, None

    if not data.get("payment_method"):
        errors.append("Payment method ID is required")
        return errors, None

    payment_method_id = data["payment_method"]

    if data.get("mobile_money_phone"):
        mobile_money_phone = data["mobile_money_phone"]

    if RetailerOrderPayments.objects.filter(
        retailer_order=retailer_order_id, status="SUCCESS"
    ).exists():
        errors.append("Order is already paid")
        return errors, None

    if PaymentMethods.objects.filter(id=payment_method_id).exists():
        payment_method = PaymentMethods.objects.filter(
            id=payment_method_id
        ).first()
    else:
        errors.append(
            "Payment method with provided ID does not exist!"
        )
        return errors, None

    errors, retailer_order = process_retailer_order_payment(
        retailer_order, payment_method, user, mobile_money_phone
    )
    if retailer_order:
        return [], retailer_order
    return errors, None


def recompute_order_payment_state(customer_order):
    paid_total = (
        CustomerOrderPayment.objects
        .filter(customer_order=customer_order, status="SUCCESS")
        .aggregate(total=Sum("amount"))["total"]
    ) or Decimal("0.00")

    paid_total = _q(paid_total)
    owed = _q(customer_order.order_net_price_total or 0)
    balance = _q(max(Decimal("0.00"), owed - paid_total))

    was_paid = customer_order.is_paid == "true"
    now_paid = balance <= Decimal("0.00")

    customer_order.paid_total = paid_total
    customer_order.balance_due = balance
    customer_order.is_paid = "true" if now_paid else "false"

    if now_paid and customer_order.paid_at is None:
        customer_order.paid_at = timezone.now()
    elif not now_paid:
        customer_order.paid_at = None

    customer_order.save(update_fields=[
        "paid_total", "balance_due", "is_paid", "paid_at", "updated",
    ])

    return now_paid and not was_paid


def process_customer_order_payment(
    entity, customer_order, payment_method, user,
    mobile_money_phone, order_items,
):
    customer_order.selected_payment_method = payment_method
    customer_order.save(update_fields=[
        "selected_payment_method", "updated",
    ])

    reference_number = generate_reference_number(
        customer_order.entity, user
    )

    errors = []
    administrator_account = None

    if payment_method.title == "CASH":
        try:
            CustomerOrderPayment.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="SUCCESS",
                amount=customer_order.order_net_price_total
                or Decimal("0.00"),
                entity=user.entity,
                currency="KES",
                owner=user,
                customer_order=customer_order,
                is_validated=True,
            )
            recompute_order_payment_state(customer_order)
            customer_order.status = "COMPLETE"
            customer_order.save(update_fields=["status", "updated"])
            use_reference_number(reference_number)
            return [], customer_order
        except Exception as e:
            errors.append(str(e))
            return errors, None

    elif payment_method.title == "CREDIT":
        customer_order.payment_method = payment_method
        customer_order.reference_number = reference_number
        customer_order.status = "DEFERRED"
        customer_order.save(update_fields=[
            "payment_method", "reference_number", "status", "updated",
        ])
        return [], customer_order

    elif payment_method.title == "MOBILE MONEY":
        if not UserAccounts.objects.filter(
            owner=entity.administrator
        ).exists():
            errors.append("Entity admin has no collection account")
            return errors, None

        administrator_account = UserAccounts.objects.filter(
            owner=entity.administrator
        ).first()

        telco, formatted_phone_number = get_telco_by_phone_number(
            mobile_money_phone
        )
        amount = int(customer_order.order_net_price_total or 0)

        payload = None
        if telco == "MPESA":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": amount,
                "callBackUrl": (
                    "https://webhook.site/"
                    "7911487f-fc9e-46b0-a812-3adfa008375c"
                ),
                "accountTo": administrator_account.account_number,
                "description": "Merchant payment",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "Mpesa",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })
            create_log(
                "info",
                f"create customer order by customer {payload}",
            )
        elif telco == "AIRTELMONEY":
            payload = json.dumps({
                "orderId": reference_number,
                "amount": str(amount),
                "callBackUrl": (
                    "https://webhook.site/"
                    "55963e0b-b692-42b6-a682-0223eaf7fbff"
                ),
                "accountTo": administrator_account.account_number,
                "currency": "KES",
                "description": "TOPUP",
                "modeOfPayment": "MOBILE_MONEY",
                "provider": "AIRTELMONEY",
                "data": {
                    "phoneNumber": formatted_phone_number,
                    "serviceType": "TOPUP",
                },
            })
        else:
            errors.append(f"Unsupported telco: {telco}")
            return errors, None

        create_log("info", f"just before checkout {payload}")

        the_data = {
            "client_id": config("JAMBOPAY_CLIENT_ID"),
            "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
            "grant_type": config("JAMBOPA_GRANT_TYPE"),
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        result = requests.post(
            config("JAMBOPAY_AUTH_URL1"),
            data=the_data,
            headers=headers,
        )
        result_json = result.json()
        token = result_json.get("access_token") if result_json else None

        if not token:
            errors.append("Token not generated")
            return errors, None

        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            "Accept": "*/*",
        }
        result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/checkout/express",
            data=payload,
            headers=headers,
        )
        result_json = result.json()
        create_log("info", f"result_json {result_json}")

        if not result_json or "ref" not in result_json:
            create_log("info", f"from jp errors {errors}")
            errors.append("Payment failed")
            return errors, None

        try:
            CustomerOrderPayment.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="PENDING",
                amount=customer_order.order_net_price_total
                or Decimal("0.00"),
                entity=entity,
                currency="KES",
                owner=user,
                customer_order=customer_order,
                administrator_account=administrator_account,
                psp_reference_number=result_json["ref"],
                telco=telco,
            )
            use_reference_number(reference_number)
            return [], customer_order
        except Exception as e:
            errors.append(str(e))
            return errors, None

    elif payment_method.title == "JAMBOPAY WALLET":
        if not UserAccounts.objects.filter(
            owner=user.entity.administrator
        ).exists():
            errors.append("Entity administrator has no collection account")
            return errors, None

        administrator_account = UserAccounts.objects.filter(
            owner=user.entity.administrator
        ).first()

        errors, wallet = get_account_by_phone(mobile_money_phone)
        if not wallet:
            errors.append("No wallet for provided mobile phone")
            return errors, None

        amount = int(customer_order.order_net_price_total or 0)

        data = {
            "orderId": reference_number,
            "amount": amount,
            "callBackUrl": (
                "https://webhook.site/"
                "931bef21-de22-43bc-a45b-7e12999ac9cb"
            ),
            "accountTo": administrator_account.account_number,
            "description": "Customer order payment",
            "modeOfPayment": "WALLET_AS_SERVICE",
            "provider": "JAMBOPAY",
            "data": {
                "serviceType": "TOPUP",
                "accountNo": wallet,
            },
        }
        response = jambopay_wallet_checkout(data)

        if "statusCode" in response or "ref" not in response:
            errors.append("Wallet checkout failed")
            return errors, None

        try:
            customer_order_payment = CustomerOrderPayment.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="PENDING",
                amount=customer_order.order_net_price_total
                or Decimal("0.00"),
                entity=user.entity,
                currency="KES",
                owner=user,
                customer_order=customer_order,
                entity_collection_account=administrator_account,
            )
            use_reference_number(reference_number)
            customer_order.reference_number = reference_number
            customer_order.payment = customer_order_payment
            customer_order.save(update_fields=[
                "reference_number", "payment", "updated",
            ])
            return [], customer_order
        except Exception as e:
            errors.append(str(e))
            return errors, None

    errors.append("Unsupported payment method")
    return errors, None


@transaction.atomic
def make_customer_order_payment(data, user):
    errors = []
    customer_order = None
    payment_method = None
    mobile_money_phone = None

    customer_order_id = data.get("customer_order")
    if not customer_order_id:
        errors.append("Customer order ID is required")
        return errors, None

    customer_order = CustomerOrders.objects.filter(
        id=customer_order_id
    ).first()
    if not customer_order:
        errors.append("Customer order for provided ID does not exist")
        return errors, None

    payment_method_id = data.get("payment_method")
    if not payment_method_id:
        errors.append("Payment method ID is required")
        return errors, None

    payment_method = PaymentMethods.objects.filter(
        id=payment_method_id
    ).first()
    if not payment_method:
        errors.append("Payment method with provided ID does not exist")
        return errors, None

    if data.get("mobile_money_phone"):
        mobile_money_phone = data["mobile_money_phone"]

    if CustomerOrderPayment.objects.filter(
        customer_order=customer_order,
        status="SUCCESS",
        is_validated=True,
    ).exists():
        errors.append("Order is already paid")
        return errors, None

    if not CustomerOrderItems.objects.filter(
        customer_order=customer_order
    ).exists():
        errors.append("Order has no items")
        return errors, None

    order_items = CustomerOrderItems.objects.filter(
        customer_order=customer_order
    )

    errors, customer_order = process_customer_order_payment(
        customer_order.entity,
        customer_order,
        payment_method,
        user,
        mobile_money_phone,
        order_items,
    )

    if customer_order:
        return [], customer_order
    return errors, None


@transaction.atomic
def re_initiate_order_payment(data, user):
    reference_number = None
    customer_order = None

    if not data.get("new_reference_number"):
        raise exceptions.ValidationError(
            "New reference number is required"
        )
    new_reference_number = data["new_reference_number"]

    if not data.get("reference_number"):
        raise exceptions.ValidationError(
            "Order reference number is required"
        )
    reference_number = data["reference_number"]

    if CustomerOrders.objects.filter(
        reference_number=reference_number
    ).exists():
        customer_order = CustomerOrders.objects.filter(
            reference_number=reference_number
        ).first()

        if not customer_order.payment:
            customer_order.order_number = new_reference_number
            customer_order.save()
        else:
            raise exceptions.ValidationError("Order already paid for")


# ===========================================================================
# Customer order — create / update
# ===========================================================================

@transaction.atomic
def create_customer_order(data, user):
    errors = []

    customer = None
    entity = None
    order_number = None
    payment_account_number = None
    payment_method = None
    delivery_method = None
    order_origin = None
    shipping_cost = Decimal("0.00")
    origin_latitude = None
    origin_longitude = None
    destination_latitude = None
    destination_longitude = None
    farness = Decimal("0.00")
    origin_point = None
    destination_point = None
    draft_id = None
    recipient_name = None
    recipient_phone = None
    order_items = []

    if not data.get("customer_order_details"):
        errors.append("No order details")
        return errors, None

    details = data["customer_order_details"]

    order_origin = details.get("order_origin")
    if not order_origin:
        errors.append("Order origin is required")
        return errors, None

    if order_origin == "CUSTOMER":
        customer = user

    draft_id = details.get("draft_id")
    if not draft_id:
        errors.append("Draft ID is required")

    if details.get("farness") not in (None, ""):
        farness = _to_decimal(details["farness"])

    if details.get("origin_latitude") not in (None, ""):
        origin_latitude = details["origin_latitude"]
    if details.get("origin_longitude") not in (None, ""):
        origin_longitude = details["origin_longitude"]

    if origin_latitude and origin_longitude:
        origin_point = fromstr(
            f"POINT({origin_longitude} {origin_latitude})", srid=4326,
        )

    if details.get("destination_latitude") not in (None, ""):
        destination_latitude = details["destination_latitude"]
    if details.get("destination_longitude") not in (None, ""):
        destination_longitude = details["destination_longitude"]

    if destination_latitude and destination_longitude:
        destination_point = fromstr(
            f"POINT({destination_longitude} {destination_latitude})",
            srid=4326,
        )

    recipient_name = details.get("recipient_name")
    recipient_phone = details.get("recipient_phone")

    entity_id = details.get("entity")
    if entity_id:
        entity = Entities.objects.filter(id=entity_id).first()
        if not entity:
            errors.append("Retailer with provided ID does not exist")
    else:
        entity = user.entity

    payment_account_number = details.get("payment_account_number")

    if details.get("shipping_cost") not in (None, ""):
        shipping_cost = _to_decimal(details["shipping_cost"])

    payment_method_id = details.get("payment_method")
    if not payment_method_id:
        errors.append("Payment method is required")
    else:
        payment_method = (
            payments_models_validators.validate_payment_method_exists(
                payment_method_id
            )
        )

    delivery_method = details.get("delivery_method")
    if not delivery_method:
        errors.append("Delivery method is required")

    order_items = details.get("order_items")
    if not order_items:
        errors.append("Order has no items")
        return errors, None

    create_log("info", f"Data items: {order_items}")

    for item in order_items:
        purchased_quantity = _to_int(item.get("purchased_quantity"))
        if purchased_quantity <= 0:
            errors.append("Purchased quantity must be greater than zero")
            return errors, None

        retailer_receipt_id = item.get("retailer_receipt")
        if not retailer_receipt_id:
            errors.append("Product ID is required")
            return errors, None

        retailer_receipt = models.RetailerReceipts.objects.filter(
            id=retailer_receipt_id, current_unit_quantity__gte=0,
        ).first()
        if not retailer_receipt:
            errors.append(
                "Item with provided ID does not exist in inventory"
            )
            return errors, None

        if retailer_receipt.current_unit_quantity < purchased_quantity:
            product_title = (
                getattr(
                    getattr(retailer_receipt, "product", None),
                    "title",
                    None,
                )
                or getattr(retailer_receipt, "product_title", None)
                or "Item"
            )
            errors.append(
                f"Only {retailer_receipt.current_unit_quantity} "
                f"{product_title} available"
            )
            return errors, None

        if item.get("final_unit_selling_price") in (None, ""):
            errors.append("Final unit selling price is required")
            return errors, None

    if errors:
        return errors, None

    order_number = generate_document_number(
        entity, user, "CUSTOMERORDER",
    )

    try:
        order_created = CustomerOrders.objects.create(
            order_number=order_number,
            payment_account_number=payment_account_number,
            customer_name=f"{user.first_name} {user.last_name}",
            customer_phone=f"{user.phone}",
            order_origin=order_origin,
            delivery_method=delivery_method,
            shipping_cost=shipping_cost,
            draft_id=draft_id,
            selected_payment_method=payment_method,
            owner=user,
            user=user,
            entity=entity,
            customer=customer,
            origin_point=origin_point,
            destination_point=destination_point,
            recipient_name=recipient_name,
            recipient_phone=recipient_phone,
            farness=farness,
        )

        create_log("info", f"Customer order: {order_created}")

        if not order_created:
            errors.append("Order could not be created")
            return errors, None

        for item in order_items:
            purchased_qty = _to_int(item["purchased_quantity"])
            discount_quantity = _to_int(item.get("discount_quantity"))
            final_unit = _to_decimal(item["final_unit_selling_price"])
            discount_unit = _to_decimal(item.get("item_price_discount"))

            retailer_receipt = models.RetailerReceipts.objects.filter(
                id=item["retailer_receipt"],
                current_unit_quantity__gte=purchased_qty,
            ).first()
            if not retailer_receipt:
                errors.append(
                    f"Receipt {item['retailer_receipt']} no longer "
                    f"available for the requested quantity"
                )
                return errors, None

            item_price_total = _q(final_unit * purchased_qty)
            item_price_discount_total = _q(discount_unit * purchased_qty)
            item_net_price = _q(final_unit - discount_unit)
            item_net_price_total = _q(item_net_price * purchased_qty)

            if retailer_receipt.product.is_vatable:
                item_tax = _q(final_unit * Decimal("0.16"))
                item_tax_total = _q(item_tax * purchased_qty)
            else:
                item_tax = Decimal("0.00")
                item_tax_total = Decimal("0.00")

            CustomerOrderItems.objects.create(
                customer_order=order_created,
                retailer_receipt=retailer_receipt,
                unit_of_issue=retailer_receipt.unit_of_receipt,
                purchased_quantity=purchased_qty,
                discount_quantity=discount_quantity,
                total_quantity=purchased_qty + discount_quantity,
                quantity=purchased_qty,
                item_price=final_unit,
                item_price_total=item_price_total,
                item_price_discount=discount_unit,
                item_price_discount_total=item_price_discount_total,
                item_net_price=item_net_price,
                item_net_price_total=item_net_price_total,
                item_tax=item_tax,
                item_tax_total=item_tax_total,
                entity=user.entity,
                owner=user,
            )

        order_created.recalculate()

        errors, order_created = process_customer_order_payment(
            entity,
            order_created,
            payment_method,
            user,
            payment_account_number,
            order_items,
        )
        return errors, order_created

    except Exception as e:
        errors.append(str(e))
        return errors, None


@transaction.atomic
def create_express_customer_order_data(data, user):
    errors = []
    customer_order = None
    customer = None
    payment_method = None
    order_origin = None
    order_channel = None
    payment_account_number = None
    customer_order_items = []
    customer_name = None
    customer_phone = None
    due_date = None

    if not data.get("customer_order_items"):
        errors.append("Customer order items are required")
        return errors, None

    customer_order_items = data["customer_order_items"]

    for entry in customer_order_items:
        receipt_id = entry.get("product")
        if not RetailerReceipts.objects.filter(id=receipt_id).exists():
            errors.append(
                "Product with provided product ID does not exist"
            )
            return errors, None

        retailer_receipt = RetailerReceipts.objects.filter(
            id=receipt_id
        ).first()
        if int(retailer_receipt.current_unit_quantity) < int(
            entry["quantity"]
        ):
            errors.append(
                f"{retailer_receipt.product.title} has only "
                f"{retailer_receipt.current_unit_quantity} units left "
                f"whereas {entry['quantity']} units are required"
            )
            return errors, None

    if data.get("customer"):
        customer = Users.objects.filter(id=data["customer"]).first()
    if data.get("customer_name"):
        customer_name = data["customer_name"]
    if data.get("customer_phone"):
        customer_phone = data["customer_phone"]
    if data.get("due_date"):
        due_date = data["due_date"]

    if data.get("payment_method"):
        payment_method = PaymentMethods.objects.filter(
            id=data["payment_method"]
        ).first()
        if payment_method.title == "MOBILE MONEY" and not data.get(
            "payment_account_number"
        ):
            errors.append("Mobile money phone number is required")
            return errors, None
        payment_account_number = data.get("payment_account_number")

    if data.get("order_origin"):
        order_origin = data["order_origin"]
    if data.get("order_channel"):
        order_channel = data["order_channel"]

    if errors:
        return errors, None

    try:
        order_number = generate_document_number(
            user.entity, user, "CUSTOMERORDER",
        )
        customer_order = CustomerOrders.objects.create(
            user=customer,
            owner=user,
            selected_payment_method=payment_method,
            entity=user.entity,
            order_origin=order_origin,
            order_channel=order_channel,
            order_number=order_number,
            customer_name=customer_name,
            customer_phone=customer_phone,
            due_date=due_date,
        )

        if not customer_order or not customer_order_items:
            errors.append("Order could not be created")
            return errors, None

        for entry in customer_order_items:
            retailer_receipt = RetailerReceipts.objects.filter(
                id=entry["product"]
            ).first()
            if not retailer_receipt:
                continue

            purchased_qty = _to_int(entry.get("quantity"))
            discount_quantity = _to_int(entry.get("discount_quantity"))
            final_unit = _to_decimal(
                retailer_receipt.final_unit_selling_price
                or retailer_receipt.unit_selling_price
            )
            discount_unit = _to_decimal(entry.get("discount"))

            item_price_total = _q(final_unit * purchased_qty)
            item_price_discount_total = _q(discount_unit * purchased_qty)
            item_net_price = _q(final_unit - discount_unit)
            item_net_price_total = _q(item_net_price * purchased_qty)

            if retailer_receipt.product.is_vatable:
                item_tax = _q(final_unit * Decimal("0.16"))
                item_tax_total = _q(item_tax * purchased_qty)
            else:
                item_tax = Decimal("0.00")
                item_tax_total = Decimal("0.00")

            CustomerOrderItems.objects.create(
                unit_of_issue=retailer_receipt.unit_of_receipt,
                customer_order=customer_order,
                retailer_receipt=retailer_receipt,
                purchased_quantity=purchased_qty,
                discount_quantity=discount_quantity,
                total_quantity=purchased_qty + discount_quantity,
                quantity=purchased_qty,
                item_price=final_unit,
                item_price_total=item_price_total,
                item_price_discount=discount_unit,
                item_price_discount_total=item_price_discount_total,
                item_net_price=item_net_price,
                item_net_price_total=item_net_price_total,
                item_tax=item_tax,
                item_tax_total=item_tax_total,
                owner=user,
                entity=user.entity,
            )

        customer_order.recalculate()

        order_items = CustomerOrderItems.objects.filter(
            customer_order=customer_order
        )

        errors, order_created = process_customer_order_payment(
            user.entity,
            customer_order,
            payment_method,
            user,
            payment_account_number,
            order_items,
        )
        if order_created:
            return [], order_created
        return errors, customer_order

    except Exception as e:
        errors.append(str(e))
        return errors, None


@transaction.atomic
def update_customer_order(data, user):
    errors = []
    customer_order = None
    payment_method = None
    delivery_method = None
    shipping_cost = None
    bodaboda = None
    status = None

    details = data.get("customer_order_details")
    if not details:
        errors.append("Customer order details are required")
        return errors, None

    customer_order_id = details.get("customer_order")
    if not customer_order_id:
        errors.append("Customer order ID is required")
        return errors, None

    customer_order = CustomerOrders.objects.filter(
        id=customer_order_id
    ).first()
    if not customer_order:
        errors.append("Customer order with provided ID does not exist")
        return errors, None

    if details.get("payment_method"):
        payment_method = PaymentMethods.objects.filter(
            id=details["payment_method"]
        ).first()
        if not payment_method:
            errors.append(
                "Payment method with provided ID does not exist"
            )
            return errors, None

    if details.get("delivery_method"):
        delivery_method = details["delivery_method"]

    if details.get("shipping_cost") not in (None, ""):
        shipping_cost = _to_decimal(details["shipping_cost"])

    if details.get("bodaboda"):
        bodaboda = BodaLocations.objects.filter(
            owner_id=details["bodaboda"]
        ).first()
        if not bodaboda:
            errors.append("Boda boda does not exist")
            return errors, None

    if details.get("status"):
        status = details["status"]

    changed = []

    if shipping_cost is not None:
        customer_order.shipping_cost = shipping_cost
        changed.append("shipping_cost")

    if payment_method is not None:
        customer_order.selected_payment_method = payment_method
        changed.append("selected_payment_method")

    if delivery_method is not None:
        customer_order.delivery_method = delivery_method
        changed.append("delivery_method")

    if bodaboda is not None and customer_order.delivery_method == "DELIVERY":
        customer_order.bodaboda = bodaboda
        changed.append("bodaboda")

    if status is not None:
        customer_order.status = status
        changed.append("status")

    if changed:
        changed.append("updated")
        customer_order.save(update_fields=changed)

        if "shipping_cost" in changed or "selected_payment_method" in changed:
            customer_order.recalculate()

    return [], customer_order


# ===========================================================================
# Stock adjustments
# ===========================================================================

def create_stock_adjustment(data, user):
    """
    Create a StockAdjustments row and apply the delta to the
    receipt's current_unit_quantity. Runs inside a transaction so a
    failure during the receipt save doesn't leave a dangling row.

    `return_intent` defaults to "NONE" for direct adjustments that
    aren't the byproduct of a sales return or a wholesaler return.
    """
    errors = []
    retailer_receipt = None

    if not data.get("retailer_receipt"):
        errors.append("Retailer receipt ID is required")
        return errors, None

    retailer_receipt = models.RetailerReceipts.objects.filter(
        id=data["retailer_receipt"]
    ).first()
    if not retailer_receipt:
        errors.append("No product with provided ID")
        return errors, None

    if data.get("quantity") in (None, ""):
        errors.append("Quantity is required")
        return errors, None

    try:
        quantity = int(data["quantity"])
    except (TypeError, ValueError):
        errors.append("Quantity must be a number")
        return errors, None

    if quantity <= 0:
        errors.append("Quantity must be greater than zero")
        return errors, None

    if not data.get("justification"):
        errors.append("Justification is required")
        return errors, None

    if not data.get("direction"):
        errors.append("Adjustment direction is required")
        return errors, None

    if data["direction"] not in ("INCREMENT", "DECREMENT"):
        errors.append("Invalid adjustment direction")
        return errors, None

    if data["direction"] == "DECREMENT":
        if quantity > int(retailer_receipt.current_unit_quantity):
            errors.append(
                f"Only {retailer_receipt.current_unit_quantity} are "
                f"currently in inventory"
            )
            return errors, None

    return_intent = data.get("return_intent") or "NONE"

    try:
        with transaction.atomic():
            created = models.StockAdjustments.objects.create(
                entity=user.entity,
                owner=user,
                retailer_receipt=retailer_receipt,
                quantity=quantity,
                justification=data["justification"],
                direction=data["direction"],
                return_intent=return_intent,
            )

            if created.direction == "INCREMENT":
                retailer_receipt.current_unit_quantity = (
                    int(retailer_receipt.current_unit_quantity) + quantity
                )
                retailer_receipt.save(
                    update_fields=["current_unit_quantity"]
                )
            elif created.direction == "DECREMENT":
                retailer_receipt.current_unit_quantity = (
                    int(retailer_receipt.current_unit_quantity) - quantity
                )
                retailer_receipt.save(
                    update_fields=["current_unit_quantity"]
                )

            return [], created

    except Exception as e:
        errors.append(str(e))
        return errors, None


def update_stock_adjustment(data, user):
    """
    Update an existing stock adjustment and reconcile the receipt's
    current_unit_quantity against the change.

    Approach: reverse the old adjustment's effect, apply the new
    one, all inside a single transaction. Handles quantity changes,
    direction flips, and reassigning the adjustment to a different
    receipt.

    Refuses to edit adjustments spawned by a sales return or a
    wholesaler return — those must be edited through their parent
    record so both ledgers stay in sync.

    Returns (errors, stock_adjustment).
    """
    errors = []

    adjustment_id = data.get("stock_adjustment") or data.get("id")
    if not adjustment_id:
        errors.append("stock_adjustment is required")
        return errors, None

    adjustment = models.StockAdjustments.objects.filter(
        id=adjustment_id,
        entity=user.entity,
    ).first()
    if not adjustment:
        errors.append("Stock adjustment not found")
        return errors, None

    # Guard: return-linked adjustments are read-only here.
    if adjustment.return_intent in (
        "CUSTOMER_RETURN",
        "WHOLESALER_RETURN",
    ):
        parent_label = (
            "sales return"
            if adjustment.return_intent == "CUSTOMER_RETURN"
            else "wholesaler return"
        )
        errors.append(
            f"This adjustment was created by a {parent_label}. "
            f"Edit the {parent_label} instead — editing the adjustment "
            f"here would leave the {parent_label} record out of sync."
        )
        return errors, None

    new_receipt_id = (
        data.get("retailer_receipt") or adjustment.retailer_receipt_id
    )
    new_quantity_raw = data.get("quantity", adjustment.quantity)
    new_direction = data.get("direction", adjustment.direction)
    new_justification = data.get(
        "justification", adjustment.justification
    )
    new_return_intent = data.get(
        "return_intent", adjustment.return_intent
    )

    # Guard: don't allow converting a manual adjustment into a
    # return-linked one via this endpoint.
    if new_return_intent in ("CUSTOMER_RETURN", "WHOLESALER_RETURN"):
        errors.append(
            "Cannot edit an adjustment to link it to a return. "
            "Return-linked adjustments are created by their parent "
            "records."
        )
        return errors, None

    retailer_receipt = models.RetailerReceipts.objects.filter(
        id=new_receipt_id
    ).first()
    if not retailer_receipt:
        errors.append("No product with provided ID")
        return errors, None

    try:
        new_quantity = int(new_quantity_raw)
    except (TypeError, ValueError):
        errors.append("Quantity must be a number")
        return errors, None

    if new_quantity <= 0:
        errors.append("Quantity must be greater than zero")
        return errors, None

    if new_direction not in ("INCREMENT", "DECREMENT"):
        errors.append("Invalid adjustment direction")
        return errors, None

    if not str(new_justification or "").strip():
        errors.append("Justification is required")
        return errors, None

    old_receipt = adjustment.retailer_receipt
    old_quantity = int(adjustment.quantity or 0)
    old_direction = adjustment.direction

    if old_receipt and old_receipt.id == retailer_receipt.id:
        base_quantity = int(retailer_receipt.current_unit_quantity or 0)
        if old_direction == "INCREMENT":
            base_quantity -= old_quantity
        elif old_direction == "DECREMENT":
            base_quantity += old_quantity
    else:
        base_quantity = int(retailer_receipt.current_unit_quantity or 0)

    if new_direction == "DECREMENT" and new_quantity > base_quantity:
        errors.append(
            f"Only {base_quantity} would be in inventory after "
            f"reversing the previous adjustment"
        )
        return errors, None

    try:
        with transaction.atomic():
            if old_receipt and old_receipt.id != retailer_receipt.id:
                if old_direction == "INCREMENT":
                    old_receipt.current_unit_quantity = (
                        int(old_receipt.current_unit_quantity)
                        - old_quantity
                    )
                elif old_direction == "DECREMENT":
                    old_receipt.current_unit_quantity = (
                        int(old_receipt.current_unit_quantity)
                        + old_quantity
                    )
                old_receipt.save(
                    update_fields=["current_unit_quantity"]
                )

                if new_direction == "INCREMENT":
                    retailer_receipt.current_unit_quantity = (
                        int(retailer_receipt.current_unit_quantity)
                        + new_quantity
                    )
                elif new_direction == "DECREMENT":
                    retailer_receipt.current_unit_quantity = (
                        int(retailer_receipt.current_unit_quantity)
                        - new_quantity
                    )
                retailer_receipt.save(
                    update_fields=["current_unit_quantity"]
                )
            else:
                old_delta = (
                    old_quantity
                    if old_direction == "INCREMENT"
                    else -old_quantity
                )
                new_delta = (
                    new_quantity
                    if new_direction == "INCREMENT"
                    else -new_quantity
                )
                net_delta = new_delta - old_delta
                retailer_receipt.current_unit_quantity = (
                    int(retailer_receipt.current_unit_quantity)
                    + net_delta
                )
                retailer_receipt.save(
                    update_fields=["current_unit_quantity"]
                )

            adjustment.retailer_receipt = retailer_receipt
            adjustment.quantity = new_quantity
            adjustment.direction = new_direction
            adjustment.justification = new_justification
            adjustment.return_intent = new_return_intent
            adjustment.save()

            return errors, adjustment

    except Exception as e:
        errors.append(str(e))
        return errors, None


def delete_stock_adjustment(data, user):
    """
    Delete a stock adjustment and reverse its effect on the receipt's
    current_unit_quantity.

    Refuses to delete adjustments spawned by a sales return or a
    wholesaler return — deleting the adjustment alone would leave
    the parent record in place with no stock effect. Delete the
    parent instead.

    Refuses to reverse an INCREMENT if the receipt no longer holds
    enough units — the balance would go negative.

    Returns (errors, deleted).
    """
    errors = []

    adjustment_id = data.get("stock_adjustment") or data.get("id")
    if not adjustment_id:
        errors.append("stock_adjustment is required")
        return errors, None

    adjustment = models.StockAdjustments.objects.filter(
        id=adjustment_id,
        entity=user.entity,
    ).first()
    if not adjustment:
        errors.append("Stock adjustment not found")
        return errors, None

    # Guard: return-linked adjustments cannot be deleted here.
    if adjustment.return_intent in (
        "CUSTOMER_RETURN",
        "WHOLESALER_RETURN",
    ):
        parent_label = (
            "sales return"
            if adjustment.return_intent == "CUSTOMER_RETURN"
            else "wholesaler return"
        )
        errors.append(
            f"This adjustment was created by a {parent_label}. "
            f"Delete the {parent_label} instead — deleting the "
            f"adjustment here would leave the {parent_label} record "
            f"in place with no stock effect."
        )
        return errors, None

    retailer_receipt = adjustment.retailer_receipt
    quantity = int(adjustment.quantity or 0)
    direction = adjustment.direction

    try:
        with transaction.atomic():
            if retailer_receipt:
                if direction == "INCREMENT":
                    current = int(
                        retailer_receipt.current_unit_quantity or 0
                    )
                    if quantity > current:
                        errors.append(
                            f"Cannot delete: only {current} unit(s) are "
                            f"currently in inventory, but this adjustment "
                            f"added {quantity}. Some of those units have "
                            f"already been removed by later movements."
                        )
                        return errors, None

                    retailer_receipt.current_unit_quantity = (
                        current - quantity
                    )
                elif direction == "DECREMENT":
                    retailer_receipt.current_unit_quantity = (
                        int(retailer_receipt.current_unit_quantity or 0)
                        + quantity
                    )
                retailer_receipt.save(
                    update_fields=["current_unit_quantity"]
                )

            adjustment.delete()
            return errors, adjustment

    except Exception as e:
        errors.append(str(e))
        return errors, None


# ===========================================================================
# Sales returns
# ===========================================================================

def create_sales_return(data, user):
    """
    Create a sales return.

    Policy A: each (customer_order, retailer_receipt) pair can be
    returned exactly once. On success, a paired StockAdjustments row
    is created with direction="INCREMENT" and
    return_intent="CUSTOMER_RETURN", and the receipt's
    current_unit_quantity is bumped accordingly.

    Both writes share a transaction — either both succeed or neither
    does.
    """
    errors = []

    if not data.get("retailer_receipt"):
        errors.append("Retailer receipt ID is required")
        return errors, None

    retailer_receipt = models.RetailerReceipts.objects.filter(
        id=data["retailer_receipt"]
    ).first()
    if not retailer_receipt:
        errors.append("No product with provided ID")
        return errors, None

    if not data.get("customer_order"):
        errors.append("Customer order ID is required")
        return errors, None

    customer_order = models.CustomerOrders.objects.filter(
        id=data["customer_order"]
    ).first()
    if not customer_order:
        errors.append("No order with provided ID")
        return errors, None

    customer_order_item = CustomerOrderItems.objects.filter(
        customer_order=customer_order,
        retailer_receipt=retailer_receipt,
    ).first()
    if not customer_order_item:
        errors.append("This product was not in the selected order")
        return errors, None

    # Already-returned guard (Policy A).
    existing = models.SalesReturns.objects.filter(
        customer_order=customer_order,
        retailer_receipt=retailer_receipt,
    ).first()

    if existing:
        errors.append(
            f"This item was already returned on "
            f"{existing.created.strftime('%Y-%m-%d')} "
            f"({existing.quantity} unit(s)). Each order line can only "
            f"be returned once."
        )
        return errors, None

    if data.get("quantity") in (None, ""):
        errors.append("Quantity is required")
        return errors, None

    try:
        quantity = int(data["quantity"])
    except (TypeError, ValueError):
        errors.append("Quantity must be a number")
        return errors, None

    if quantity <= 0:
        errors.append("Quantity must be greater than zero")
        return errors, None

    purchased = int(customer_order_item.purchased_quantity or 0)
    if quantity > purchased:
        errors.append(
            f"Original order had {purchased} units. "
            f"You are returning {quantity}"
        )
        return errors, None

    if not data.get("justification"):
        errors.append("Justification is required")
        return errors, None

    try:
        with transaction.atomic():
            sales_return = models.SalesReturns.objects.create(
                entity=user.entity,
                owner=user,
                retailer_receipt=retailer_receipt,
                customer_order=customer_order,
                quantity=quantity,
                justification=data["justification"],
            )

            adj_errors, adjustment = create_stock_adjustment(
                {
                    "retailer_receipt": str(retailer_receipt.id),
                    "quantity": quantity,
                    "justification": data["justification"],
                    "direction": "INCREMENT",
                    "return_intent": "CUSTOMER_RETURN",
                },
                user,
            )

            if adj_errors or adjustment is None:
                raise ValueError(
                    "; ".join(adj_errors)
                    or "Stock adjustment could not be created"
                )

            return [], sales_return

    except Exception as e:
        errors.append(str(e))
        return errors, None


def update_sales_return(data, user):
    """
    Update an existing sales return.

    Policy A still applies. The record being edited is excluded from
    the "already returned" check so an edit doesn't reject itself.

    Reconciles the stock effect: if the quantity changed, writes a
    compensating StockAdjustments row (INCREMENT when the return
    grows, DECREMENT when it shrinks) so the receipt's
    current_unit_quantity tracks the new value.

    Returns (errors, sales_return).
    """
    errors = []

    sales_return_id = data.get("sales_return") or data.get("id")
    if not sales_return_id:
        errors.append("sales_return is required")
        return errors, None

    sales_return = models.SalesReturns.objects.filter(
        id=sales_return_id,
        entity=user.entity,
    ).first()
    if not sales_return:
        errors.append("Sales return not found")
        return errors, None

    new_receipt_id = (
        data.get("retailer_receipt") or sales_return.retailer_receipt_id
    )
    new_order_id = (
        data.get("customer_order") or sales_return.customer_order_id
    )
    new_quantity_raw = data.get("quantity", sales_return.quantity)
    new_justification = data.get(
        "justification", sales_return.justification
    )

    retailer_receipt = models.RetailerReceipts.objects.filter(
        id=new_receipt_id
    ).first()
    if not retailer_receipt:
        errors.append("No product with provided ID")
        return errors, None

    customer_order = models.CustomerOrders.objects.filter(
        id=new_order_id
    ).first()
    if not customer_order:
        errors.append("No order with provided ID")
        return errors, None

    customer_order_item = CustomerOrderItems.objects.filter(
        customer_order=customer_order,
        retailer_receipt=retailer_receipt,
    ).first()
    if not customer_order_item:
        errors.append("This product was not in the selected order")
        return errors, None

    conflicting = (
        models.SalesReturns.objects
        .filter(
            customer_order=customer_order,
            retailer_receipt=retailer_receipt,
        )
        .exclude(id=sales_return.id)
        .first()
    )

    if conflicting:
        errors.append(
            f"Another return already exists for this order line "
            f"({conflicting.created.strftime('%Y-%m-%d')}). "
            f"Each order line can only be returned once."
        )
        return errors, None

    try:
        quantity = int(new_quantity_raw)
    except (TypeError, ValueError):
        errors.append("Quantity must be a number")
        return errors, None

    if quantity <= 0:
        errors.append("Quantity must be greater than zero")
        return errors, None

    purchased = int(customer_order_item.purchased_quantity or 0)
    if quantity > purchased:
        errors.append(
            f"Original order had {purchased} units. "
            f"You are returning {quantity}"
        )
        return errors, None

    if not str(new_justification or "").strip():
        errors.append("Justification is required")
        return errors, None

    try:
        with transaction.atomic():
            old_quantity = int(sales_return.quantity or 0)
            delta = quantity - old_quantity

            sales_return.retailer_receipt = retailer_receipt
            sales_return.customer_order = customer_order
            sales_return.quantity = quantity
            sales_return.justification = new_justification
            sales_return.save()

            if delta != 0:
                adj_errors, _ = create_stock_adjustment(
                    {
                        "retailer_receipt": str(retailer_receipt.id),
                        "quantity": abs(delta),
                        "direction": (
                            "INCREMENT" if delta > 0 else "DECREMENT"
                        ),
                        "justification": (
                            f"Sales return quantity adjusted "
                            f"({old_quantity} → {quantity})"
                        ),
                        "return_intent": "CUSTOMER_RETURN",
                    },
                    user,
                )
                if adj_errors:
                    raise ValueError("; ".join(adj_errors))

            return errors, sales_return

    except Exception as e:
        errors.append(str(e))
        return errors, None


def delete_sales_return(data, user):
    """
    Delete a sales return and reverse its stock effect.

    Writes a compensating DECREMENT adjustment for the return's
    quantity before deleting the row, so the receipt's
    current_unit_quantity rolls back. If the receipt no longer holds
    enough units (some have since been sold or written off), refuses
    rather than pushing the balance negative.

    Returns (errors, deleted).
    """
    errors = []

    sales_return_id = data.get("sales_return") or data.get("id")
    if not sales_return_id:
        errors.append("sales_return is required")
        return errors, None

    sales_return = models.SalesReturns.objects.filter(
        id=sales_return_id,
        entity=user.entity,
    ).first()
    if not sales_return:
        errors.append("Sales return not found")
        return errors, None

    quantity = int(sales_return.quantity or 0)
    retailer_receipt = sales_return.retailer_receipt

    try:
        with transaction.atomic():
            if retailer_receipt and quantity > 0:
                adj_errors, _ = create_stock_adjustment(
                    {
                        "retailer_receipt": str(retailer_receipt.id),
                        "quantity": quantity,
                        "direction": "DECREMENT",
                        "justification": (
                            f"Reversal of sales return {sales_return.id}"
                        ),
                        "return_intent": "CUSTOMER_RETURN",
                    },
                    user,
                )
                if adj_errors:
                    raise ValueError("; ".join(adj_errors))

            sales_return.delete()
            return errors, sales_return

    except Exception as e:
        errors.append(str(e))
        return errors, None


def initiate_wholesaler_return(data, user):
    """
    Returns (errors, WholesalerReceiptReturns | None).
    Creates the return, the paired adjustment, and decrements the
    retailer receipt, all in one transaction.
    """

def cancel_wholesaler_return(data, user):
    """
    Returns (errors, WholesalerReceiptReturns | None).
    Only callable while status == PENDING_CONFIRMATION. Writes a
    compensating StockAdjustments(INCREMENT) and restores the
    receipt quantity, then sets status=CANCELLED.
    """

def acknowledge_return_rejection(data, user):
    """
    Returns (errors, WholesalerReceiptReturns | None).
    Only callable while status == REJECTED. Idempotent. Writes a
    compensating StockAdjustments(INCREMENT) and restores the
    receipt quantity.
    """