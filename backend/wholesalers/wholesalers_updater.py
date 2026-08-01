import datetime
from .models import RetailerOrderItems, RetailerOrders


def check_expired_orders():
    """Retrieve and delete all unpaid orders created by retailers at wholesalers 24 hours ago"""
    lastHourDateTime = datetime.datetime.now() - datetime.timedelta(hours=24)
    if RetailerOrders.objects.filter(created__lte=lastHourDateTime, is_paid=False).count() > 0:

        unpaidOrders = RetailerOrders.objects.filter(
            created__lte=lastHourDateTime, wholesaler_payment=None).all()

        for order in unpaidOrders:
            print("Deleteing unpaid order", order.id)
            order.delete()
    else:
        print("No expired retailer requisitions")


def check_fully_received_orders():
    """Retrieve and delete all unpaid orders created by retailers at wholesalers 24 hours ago"""
    lastHourDateTime = datetime.datetime.now() - datetime.timedelta(hours=24)
    for order in RetailerOrders.objects.all():
        if RetailerOrderItems.objects.filter(retailer_order=order, is_received=False).count() < 1:
            order.is_received = True
            order.save()

    else:
        print("All fully received orders unset")
