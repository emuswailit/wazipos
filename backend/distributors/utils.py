from psycopg2 import IntegrityError
from rest_framework import exceptions
from django.db import transaction
from authentication.models import Entities
from distributors.models import (
    DistributorReceipts,
    DistributorVariations,
    WholesalerOrderItems,
    WholesalerOrders,
)
from manufacturers.models import DistributorOrderItems
from products.models import Products
from wazi.utils import raise_custom_exception


def create_wholesaler_order(data, manufacturerObj, request):

    try:
        draft_id = data["draft_id"]
        if not draft_id or draft_id == "":
            raise exceptions.ValidationError("Draft ID is blank")
    except KeyError:
        raise exceptions.ValidationError("Draft ID not received")
    try:
        order_terms = data["order_terms"]
    except KeyError:
        raise exceptions.ValidationError("Please enter order terms")

    try:
        order_shipping_cost = data["order_shipping_cost"]
    except KeyError:
        order_shipping_cost = 0.00

    try:
        order_total_tax = data["order_total_tax"]
    except KeyError:
        order_total_tax = 0.00

    try:
        order_total_discount = data["order_total_discount"]
    except KeyError:
        order_total_discount = 0.00

    try:
        order_net_cost = data["order_net_cost"]
    except KeyError:
        raise exceptions.ValidationError("order_net_cost is required")
    try:
        order_gross_cost = data["order_gross_cost"]
    except KeyError:
        raise exceptions.ValidationError("order_gross_cost is required")
    try:
        order_final_cost = data["order_final_cost"]
    except KeyError:
        raise exceptions.ValidationError("order_final_cost is required")

    if DistributorOrders.objects.filter(draft_id=draft_id).count() > 0:
        raise exceptions.ValidationError("This order is already saved")

    order = DistributorOrders.objects.create(
        entity=request.user.entity,
        order_terms=order_terms,
        manufacturer=manufacturerObj,
        order_total_discount=order_total_discount,
        order_total_tax=order_total_tax,
        order_gross_cost=order_gross_cost,
        order_net_cost=order_net_cost,
        order_final_cost=order_final_cost,
        order_shipping_cost=order_shipping_cost,
        owner=request.user,
        draft_id=draft_id,
    )

    return order

    # ---------------------------------------------------------------------------


def validate_wholesaler_order_data(data):

    errors = []

    if (
        not "wholesaler_order_items" in data
        or not data["wholesaler_order_items"]
        or len(data["wholesaler_order_items"]) < 1
    ):
        errors.append("Add items to order")
    else:
        wholesaler_order_items = data["wholesaler_order_items"]
        for item in wholesaler_order_items:
            check_order_item_is_ok(item)
    if not "order_terms" in data or not data["order_terms"]:
        errors.append("Order terms is required")
    if not "draft_id" in data or not data["draft_id"]:
        errors.append("Order is not well drafted")

    if not "items_price_total" in data or not data["items_price_total"]:
        errors.append("Items price total is required")
    if not "distributor" in data or not data["distributor"]:
        errors.append("Distributor ID  is required")
    else:
        if Entities.objects.filter(
            id=data["distributor"], entity_type="DISTRIBUTION"
        ).exists():
            pass
        else:
            errors.append("Selected distributor does not exist")
    if not "tax_total" in data or not data["tax_total"]:
        errors.append("Tax total  is required. Default is 0")
    # if not 'shipping_amount' in data:
    #     errors.append("Shipping amount  is required. Default is 0")
    if not "discount_total" in data or not data["discount_total"]:
        errors.append("Discount total  is required. Default is 0")
    # if not 'net_price_total' in data or not data['net_price_total']:
    #     errors.append("Net price total  is required")
    # if not 'final_amount_total' in data or not data['final_amount_total']:
    #     errors.append("Final total  is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return data


def check_order_item_is_ok(item):
    errors = []
    distributor_receipt = None
    total_quantity = 0

    if not "distributor_receipt" in item or not item["distributor_receipt"]:
        errors.append("Distributor product ID is required")
    else:
        distributor_receipt = DistributorReceipts.objects.filter(
            id=item["distributor_receipt"]
        ).first()

        if distributor_receipt:

            if not "purchased_quantity" in item or not item["purchased_quantity"]:
                errors.append(
                    f"{distributor_receipt.product.title} : Purchased quantity is required. Enter default 0 if none"
                )

            if not "total_quantity" in item or not item["total_quantity"]:
                errors.append(
                    f"{distributor_receipt.product.title} Total quantity is required. Enter default 0 if none"
                )
            else:
                if item["total_quantity"] > distributor_receipt.pack_quantity:
                    errors.append(
                        f"{distributor_receipt.product.title}:Required quantity is less than available quantity. Only {distributor_receipt.pack_quantity} are available"
                    )

            if not "discount_quantity" in item:
                errors.append(
                    f"{distributor_receipt.product.title} Discount quantity is required. Enter default 0 if none "
                )
            if not "item_price" in item or not item["item_price"]:
                errors.append(
                    f"{distributor_receipt.product.title}: Item price is required."
                )
            if not "discount_amount" in item:
                errors.append(
                    f"{distributor_receipt.product.title}: Discount amount is required. Enter default 0 if none"
                )
            if not "net_price" in item or not item["net_price"]:
                errors.append(
                    f"{distributor_receipt.product.title}: Net price is required."
                )
            if not "tax_amount" in item:
                errors.append(
                    f"{distributor_receipt.product.title}: Tax amount is required. Enter default 0 if none"
                )
            if not "total_amount" in item or not item["total_amount"]:
                errors.append(
                    f"{distributor_receipt.product.title}: Total amount is required."
                )

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return item


def new_wholesaler_order_create(data, user):

    if WholesalerOrders.objects.filter(draft_id=data["draft_id"]).count() > 0:
        raise exceptions.ValidationError("This order is already saved")
    distributor_obj = Entities.objects.get(id=data["distributor"])

    order = WholesalerOrders.objects.create(
        entity=user.entity,
        order_terms=data["order_terms"],
        distributor=distributor_obj,
        shipping_amount=data["shipping_amount"],
        tax_total=data["tax_total"],
        discount_total=data["discount_total"],
        items_price_total=data["items_price_total"],
        net_price_total=data["net_price_total"],
        final_amount_total=data["final_amount_total"],
        owner=user,
        draft_id=data["draft_id"],
    )

    return order


def check_distributor_item_exists(distributorReceiptId):
    distributorReceipt = False
    if DistributorReceipts.objects.filter(id=distributorReceiptId).count() > 0:
        distributorReceipt = DistributorReceipts.objects.get(
            id=distributorReceiptId)
    return distributorReceipt


def create_wholesaler_order_item(wholesaler_order, item, user):

    distributor_receipt = DistributorReceipts.objects.get(
        id=item["distributor_receipt"]
    )
    item = WholesalerOrderItems.objects.create(
        entity=user.entity,
        distributor=wholesaler_order.distributor,
        wholesaler_order=wholesaler_order,
        distributor_receipt=distributor_receipt,
        purchased_quantity=item["purchased_quantity"],
        discount_quantity=item["discount_quantity"],
        total_quantity=item["total_quantity"],
        item_price=item["item_price"],
        discount_amount=item["discount_amount"],
        total_amount=item["total_amount"],
        net_price=item["net_price"],
        tax_amount=item["tax_amount"],
        owner=user,
    )
    return item


@transaction.atomic
def create_distributor_receipt(manufacturerOrderObj, data, request):
    distributorVariation = None
    productObj = None
    manufacturerOrderItemsObj = None

    try:
        if (
            DistributorOrderItems.objects.filter(
                id=data["id"], manufacturerOrder=manufacturerOrderObj
            ).count()
            > 0
        ):
            manufacturerOrderItemsObj = DistributorOrderItems.objects.get(
                id=data.id)
        else:
            raise exceptions.ValidationError(
                "Item does not exist in the order")
    except KeyError:
        raise exceptions.ValidationError("Item ID is required")

    try:
        product = data["product"]
        productObj = Products.objects.get(id=product)
    except KeyError:
        raise exceptions.ValidationError("Product ID is required")

    try:
        packBuyingPrice = data["packBuyingPrice"]
    except KeyError:
        raise exceptions.ValidationError("Pack buying price is required")
    try:
        packSellingPrice = data["packSellingPrice"]
    except KeyError:
        raise exceptions.ValidationError("Pack selling price is required")

    try:
        packQuantity = data["packQuantity"]
    except KeyError:
        raise exceptions.ValidationError("Pack quantity is required")

    try:
        quantityDiscount = data["quantityDiscount"]
    except KeyError:
        quantityDiscount = 0

    try:
        priceDiscount = data["priceDiscount"]
    except KeyError:
        priceDiscount = 0

    try:
        batch = data["batch"]
    except KeyError:
        batch = None

    if DistributorVariations.objects.filter(product_id=product).count() > 0:
        # Use existing distributor variation
        distributorVariation = DistributorVariations.objects.filter(
            product_id=product
        ).first()
        # Increment quantity
        distributorVariation.packQuantity = distributorVariation.packQuantity + int(
            packQuantity
        )
        distributorVariation.save()
    else:

        # Create new distributor variation
        distributorVariation = DistributorVariations.objects.create(
            entity=request.user.entity,
            owner=request.user,
            product_id=productObj,
            packQuantity=packQuantity,
        )

    # Create new distributor receipt
    distributorReceipt = DistributorReceipts.objects.create(
        entity=request.user.entity,
        received_from=manufacturerOrderObj.manufacturer,
        manufacturerOrderItem_id=id,
        owner=request.user,
        distributorVariation=distributorVariation,
        product=productObj,
        batch=batch,
        packBuyingPrice=packBuyingPrice,
        packSellingPrice=packSellingPrice,
        priceDiscount_id=priceDiscount,
        quantityDiscount_id=quantityDiscount,
        packQuantity=packQuantity,
        manufacturerOrder=manufacturerOrderObj,
    )

    return distributorReceipt


def confirm_item_in_distributor_order(receipt, distributor_order_obj):

    distributor_order_item_obj = None
    errors = []

    # if not receipt['product']:
    #     errors.append("Product ID is required")

    if not receipt["distributor_order_item"]:
        errors.append("Order item ID is required")
    else:
        if DistributorOrderItems.objects.filter(
            id=receipt["distributor_order_item"]
        ).exists():
            distributor_order_item_obj = DistributorOrderItems.objects.filter(
                id=receipt["distributor_order_item"]
            ).first()
            if distributor_order_item_obj.distributor_order != distributor_order_obj:
                errors.append(
                    f"{distributor_order_item_obj} : This item is not in the selected order"
                )
            else:
                print("Iko sawa", distributor_order_item_obj)

        else:
            errors.append("No item was found in the order for the entered ID")
    if not receipt["pack_selling_price"]:
        errors.append("Pack selling price is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_distributor_receipts(receipt, distributor_order_obj, user):
    errors = []
    pack_selling_price = receipt["pack_selling_price"]
    distributor_order_item_obj = DistributorOrderItems.objects.get(
        id=receipt["distributor_order_item"]
    )

    # TODO: REmove this
    unit_quantity = (
        distributor_order_item_obj.item_total_quantity
        * distributor_order_item_obj.manufacturer_variation.product.units_per_pack
    )
    unit_selling_price = float(pack_selling_price) / int(
        distributor_order_item_obj.manufacturer_variation.product.units_per_pack
    )

    try:
        distributor_receipt = DistributorReceipts.objects.create(
            pack_selling_price=pack_selling_price,
            pack_buying_price=distributor_order_item_obj.item_gross_price,
            pack_quantity=distributor_order_item_obj.item_total_quantity,
            entity=user.entity,
            owner=user,
            product=distributor_order_item_obj.manufacturer_variation.product,
            distributor_order_item=distributor_order_item_obj,
        )

        return distributor_receipt
    except IntegrityError as e:
        errors.append(e)

        raise_custom_exception(errors)
