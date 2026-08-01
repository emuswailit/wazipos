from rest_framework import exceptions
from authentication.models import Entities, Stakes
from django.db import transaction


from manufacturers.models import DistributorOrderItems, DistributorOrders, ManufacturerPayments, ManufacturerVariations


def create_manufacturer_order(data, manufacturerObj, request):

    try:
        draft_id = data['draft_id']
        if not draft_id or draft_id == '':
            raise exceptions.ValidationError("Draft ID is blank")
    except KeyError:
        raise exceptions.ValidationError("Draft ID not received")
    try:
        order_terms = data['order_terms']
    except KeyError:
        raise exceptions.ValidationError("Please enter order terms")

    try:
        order_shipping_cost = data['order_shipping_cost']
    except KeyError:
        order_shipping_cost = 0.00

    try:
        order_total_tax = data['order_total_tax']
    except KeyError:
        order_total_tax = 0.00

    try:
        order_total_discount = data['order_total_discount']
    except KeyError:
        order_total_discount = 0.00

    try:
        order_net_cost = data['order_net_cost']
    except KeyError:
        raise exceptions.ValidationError("order_net_cost is required")
    try:
        order_gross_cost = data['order_gross_cost']
    except KeyError:
        raise exceptions.ValidationError("order_gross_cost is required")
    try:
        order_final_cost = data['order_final_cost']
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
        draft_id=draft_id
    )

    return order


def check_sufficient_stock_exists(data):
    try:
        item_total_quantity = data['item_total_quantity']
    except KeyError:
        raise exceptions.ValidationError("Item total quantity is required")

    try:
        manufacturer_variation = data['manufacturer_variation']
    except KeyError:
        raise exceptions.ValidationError("Variation ID is required")

    if ManufacturerVariations.objects.filter(id=data['manufacturer_variation']).exists():
        obj = ManufacturerVariations.objects.get(
            id=data['manufacturer_variation'])
        if obj.pack_quantity >= item_total_quantity:
            return False
        else:
            raise exceptions.ValidationError(
                f"Insufficient stocks of {obj.product.title}. {obj.pack_quantity} available")


# @transaction.atomic
def create_manufacturer_order_item(data, distributor_order, manufacturerObj, request):
    try:
        manufacturer_variation = data['manufacturer_variation']
        manufacturer_variationObj = ManufacturerVariations.objects.filter(
            id=manufacturer_variation).first()
    except KeyError:
        raise exceptions.ValidationError("Enter final price")

    try:
        item_purchased_quantity = data['item_purchased_quantity']
    except KeyError:
        raise exceptions.ValidationError("Enter item purchased quantity")
    try:
        item_final_selling_price = data['item_final_selling_price']
    except KeyError:
        raise exceptions.ValidationError("Enter final selling price")

    try:
        item_discount_quantity = data['item_discount_quantity']
    except KeyError:
        item_discount_quantity = 0.00
    try:
        item_total_quantity = data['item_total_quantity']
    except KeyError:
        raise exceptions.ValidationError("Item total duantity is required")
    try:
        item_total_amount = data['item_total_amount']
    except KeyError:
        raise exceptions.ValidationError("Enter item total amount")
    try:
        item_discount_amount = data['item_discount_amount']
    except KeyError:
        item_discount_amount = 0.00
    try:
        item_final_amount = data['item_final_amount']
    except KeyError:
        raise exceptions.ValidationError("Enter final amount")
    try:
        item_tax_amount = data['item_tax_amount']
    except KeyError:
        item_tax_amount = 0.00

    order_item = DistributorOrderItems.objects.create(
        entity=request.user.entity,
        distributor_order=distributor_order,
        manufacturer=manufacturerObj,
        manufacturer_variation=manufacturer_variationObj,
        item_purchased_quantity=item_purchased_quantity,
        item_discount_quantity=item_discount_quantity,
        item_total_quantity=item_total_quantity,
        item_total_amount=item_total_amount,
        item_discount_amount=item_discount_amount,
        item_final_selling_price=item_final_selling_price,
        item_final_amount=item_final_amount,
        item_tax_amount=item_tax_amount,
        owner=request.user,

    )

    return order_item


def delete_expired_orders(order):
    print("Order to delete", order.id)


def update_stakes(order_item):
    if order_item.item_stakeholders:
        order_item.item_stakeholders.clear()
    manufacturer_percent_stake = (
        float(order_item.item_final_amount)-float(order_item.item_paid_amount))/float(order_item.item_final_amount) * 100
    print("manufacturer_percent_stake",
          manufacturer_percent_stake)
    manufacturerStake = Stakes.objects.create(
        entity=order_item.manufacturer, amount=manufacturer_percent_stake, owner=order_item.owner)
    order_item.item_stakeholders.add(manufacturerStake)

    distributor_percent_stake = float(order_item.item_paid_amount) / \
        float(order_item.item_final_amount) * 100
    print("distributor_percent_stake",
          distributor_percent_stake)
    distributorStake = Stakes.objects.create(
        entity=order_item.entity, amount=distributor_percent_stake, owner=order_item.owner)
    order_item.item_stakeholders.add(distributorStake)

    return order_item


def check_distributor_order_is_paid(order):
    if ManufacturerPayments.objects.filter(distributor_order=order).exists():
        payment = ManufacturerPayments.objects.filter(
            distributor_order=order).first()
        order.payment = payment
        order.save()
        return True
    else:
        return False
