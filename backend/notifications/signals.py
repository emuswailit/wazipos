# notifications/signals.py
#
# Who hears about orders, payments and payouts — wired to the models, so every
# path that creates an order or completes a payment is covered (orders are
# created in many places). Messages go through core/notify.py after commit.
#
#   ORDERS (remote / online only — counter sales would flood inboxes)
#     new B2B order (retailer->wholesaler, wholesaler->distributor, distributor->manufacturer)
#         seller admins: email + push      buyer admins: email (confirmation)
#     new online shop / restaurant order
#         shop / restaurant admins: email + push      customer: email (confirmation)
#   PAY-INS (a payment turns SUCCESS)
#     B2B order payments            seller admins: email + push   buyer admins: email receipt
#     online shop / restaurant      seller admins: email + push   customer: email receipt
#     hotel stays                   hotel admins: email + push    guest: email receipt
#     subscription / stock-take fee payer admins: email receipt
#     rent                          landlord admins: email
#     (bar tabs, counter sales, WiFi vouchers and fares are high-volume micro
#      payments: no per-payment email; they appear in payouts)
#   PAYOUTS (payments.OrderPayouts)
#     paid      business: email          person: SMS + email
#     failed / waiting for a payout account    payee: SMS + email (they must act)

from django.db.models.signals import post_save, pre_save

from core.notify import deliver_to_entity, deliver_to_users, later, money


# ---------------------------------------------------------------- helpers

def _remember_status(sender, instance, **kwargs):
    """pre_save: keep the stored status so post_save can see a change."""
    if instance.pk:
        old = sender.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
        instance._old_status = old
    else:
        instance._old_status = None


def _became(instance, created, value):
    return str(getattr(instance, "status", "")).upper() == value and (created or str(getattr(instance, "_old_status", "") or "").upper() != value)


def _fresh(model, pk):
    return model.objects.filter(pk=pk).first()


def _user_email_only(user):
    return [user] if user is not None else []


# ---------------------------------------------------------------- B2B orders

B2B = {
    # model label: (seller attr, buyer attr, total fields, reference fields, what)
    "wholesalers.RetailerOrders": ("wholesaler", "retailer", ("final_price_total", "shipping_amount"), ("reference_number", "document_number"), "retailer order"),
    "distributors.WholesalerOrders": ("distributor", "wholesaler", ("final_price_total", "shipping_amount"), ("reference_number",), "wholesaler order"),
    "manufacturers.DistributorPurchaseOrders": ("manufacturer", "distributor", ("final_price_total", "shipping_amount"), ("reference_number",), "purchase order"),
}


def _ref(obj, fields):
    for f in fields:
        v = getattr(obj, f, None)
        if v:
            return str(v)
    return str(obj.pk)[:8].upper()


def _total(obj, fields):
    from decimal import Decimal

    total = Decimal("0")
    for f in fields:
        try:
            total += Decimal(str(getattr(obj, f, 0) or 0))
        except Exception:
            pass
    return total


def _b2b_order_created(sender, instance, created, **kwargs):
    if not created:
        return
    label = sender._meta.label
    seller_attr, buyer_attr, totals, refs, what = B2B[label]
    if getattr(instance, buyer_attr + "_id", None) is None or str(getattr(instance, "status", "")).upper() in ("DRAFT", "CANCELLED"):
        return
    pk = instance.pk

    def build():
        o = _fresh(sender, pk)
        if not o:
            return
        seller, buyer = getattr(o, seller_attr), getattr(o, buyer_attr)
        ref, total = _ref(o, refs), _total(o, totals)
        delivery = "delivery" if str(getattr(o, "delivery_method", "")).upper() in ("COURIER", "DELIVERY") else "pickup"
        deliver_to_entity(
            seller, f"New order {ref} from {buyer.title}",
            [f"{buyer.title} placed {what} {ref} worth {money(total)} ({delivery}).",
             "Open Orders on WaziPOS to take payment and prepare it."],
            push=True, data={"type": "order", "order": str(o.pk)},
        )
        deliver_to_entity(
            buyer, f"Order {ref} placed with {seller.title}",
            [f"Your {what} {ref} to {seller.title} for {money(total)} was placed ({delivery}).",
             "Pay it by mobile money from Orders on WaziPOS; you will be told as it moves."],
        )

    later(build)


# ---------------------------------------------------------------- online shop / restaurant orders

def _customer_order_created(sender, instance, created, **kwargs):
    if not created or str(getattr(instance, "order_origin", "")).upper() != "CUSTOMER":
        return
    pk = instance.pk

    def build():
        o = _fresh(sender, pk)
        if not o:
            return
        ref = str(o.order_number or o.reference_number or str(o.pk)[:8].upper())
        total = o.order_net_price_total or o.order_price_total
        who = o.customer_name or "A customer"
        deliver_to_entity(
            o.entity, f"New online order {ref}",
            [f"{who} ordered {money(total)} online ({'delivery' if str(o.delivery_method).upper() in ('COURIER', 'DELIVERY') else 'pickup'}).",
             "Prepare it once it is paid; WaziPOS tells you when the payment lands."],
            push=True, data={"type": "customer_order", "order": str(o.pk)},
        )
        if o.customer_id:
            deliver_to_users(_user_email_only(o.customer), f"Order {ref} placed with {o.entity.title}",
                             [f"Your order {ref} with {o.entity.title} for {money(total)} was placed.", "Track it in the WaziPOS app."])

    later(build)


def _food_order_created(sender, instance, created, **kwargs):
    if not created or str(getattr(instance, "order_origin", "")).upper() != "CUSTOMER":
        return
    pk = instance.pk

    def build():
        o = _fresh(sender, pk)
        if not o:
            return
        ref = str(o.document_number or str(o.pk)[:8].upper())
        total = o.order_total or o.order_items_cost
        deliver_to_entity(
            o.entity, f"New food order {ref}",
            [f"{o.customer_name or 'A customer'} ordered {money(total)} ({str(o.service_type or o.delivery_method or '').lower() or 'order'}).",
             "It shows on your kitchen board."],
            push=True, data={"type": "food_order", "order": str(o.pk)},
        )
        if o.customer_id:
            deliver_to_users(_user_email_only(o.customer), f"Order {ref} placed with {o.entity.title}",
                             [f"Your order {ref} with {o.entity.title} for {money(total)} was placed."])

    later(build)


# ---------------------------------------------------------------- pay-ins

PAYMENTS = {
    # model label: (order attr, seller attr on order, buyer attr on order | None, what)
    "wholesalers.RetailerOrderPayments": ("retailer_order", "wholesaler", "retailer", "retailer order"),
    "distributors.DistributorPayments": ("wholesaler_order", "distributor", "wholesaler", "wholesaler order"),
    "manufacturers.ManufacturerOrderPayments": ("order", "manufacturer", "distributor", "purchase order"),
}


def _b2b_payment_success(sender, instance, created, **kwargs):
    if not _became(instance, created, "SUCCESS"):
        return
    order_attr, seller_attr, buyer_attr, what = PAYMENTS[sender._meta.label]
    pk = instance.pk

    def build():
        p = _fresh(sender, pk)
        order = getattr(p, order_attr, None) if p else None
        if not order:
            return
        seller, buyer = getattr(order, seller_attr), getattr(order, buyer_attr)
        ref = _ref(order, ("reference_number", "document_number"))
        method = p.payment_method.title if getattr(p, "payment_method_id", None) else "Mobile money"
        held = bool(getattr(p, "pay_in_reference_number", None))
        deliver_to_entity(
            seller, f"Payment received · {ref}",
            [f"{buyer.title} paid {money(p.amount)} ({method}) for {what} {ref}.",
             "WaziPOS holds it and pays the goods amount to your payout account once the goods leave." if held else "Recorded as paid directly to you.",
             "Prepare the order now."],
            push=True, data={"type": "payment", "order": str(order.pk)},
        )
        deliver_to_entity(
            buyer, f"Payment receipt · {ref}",
            [f"You paid {money(p.amount)} ({method}) to {seller.title} for {what} {ref}.",
             f"Reference: {getattr(p, 'pay_in_reference_number', None) or getattr(p, 'reference', '') or p.pk}"],
        )

    later(build)


def _customer_payment_success(sender, instance, created, **kwargs):
    if not _became(instance, created, "SUCCESS"):
        return
    pk = instance.pk

    def build():
        p = _fresh(sender, pk)
        o = p.customer_order if p else None
        if not o or str(o.order_origin).upper() != "CUSTOMER":
            return  # counter sales: no email per sale
        ref = str(o.order_number or o.reference_number or str(o.pk)[:8].upper())
        deliver_to_entity(o.entity, f"Payment received · order {ref}",
                          [f"{o.customer_name or 'A customer'} paid {money(p.amount)} for online order {ref}.", "Prepare it now."],
                          push=True, data={"type": "customer_order", "order": str(o.pk)})
        if o.customer_id:
            deliver_to_users(_user_email_only(o.customer), f"Payment receipt · order {ref}",
                             [f"You paid {money(p.amount)} to {o.entity.title} for order {ref}.", f"Reference: {p.reference_number or p.pk}"])

    later(build)


def _food_payment_success(sender, instance, created, **kwargs):
    if not _became(instance, created, "SUCCESS"):
        return
    pk = instance.pk

    def build():
        p = _fresh(sender, pk)
        o = p.food_order if p else None
        if not o or str(o.order_origin).upper() != "CUSTOMER":
            return
        ref = str(o.document_number or str(o.pk)[:8].upper())
        deliver_to_entity(o.entity, f"Payment received · food order {ref}",
                          [f"{o.customer_name or 'A customer'} paid {money(p.amount)} for order {ref}."], push=True,
                          data={"type": "food_order", "order": str(o.pk)})
        if o.customer_id:
            deliver_to_users(_user_email_only(o.customer), f"Payment receipt · {o.entity.title}",
                             [f"You paid {money(p.amount)} to {o.entity.title} for order {ref}."])

    later(build)


def _stay_payment_success(sender, instance, created, **kwargs):
    if not _became(instance, created, "SUCCESS"):
        return
    pk = instance.pk

    def build():
        p = _fresh(sender, pk)
        b = p.booking if p else None
        if not b:
            return
        ref = str(b.document_number or str(b.pk)[:8].upper())
        deliver_to_entity(b.entity, f"Payment received · stay {ref}",
                          [f"{b.guest_name or 'A guest'} paid {money(p.amount)} for stay {ref} ({b.nights} night(s))."], push=True,
                          data={"type": "room_booking", "booking": str(b.pk)})
        if b.customer_id:
            deliver_to_users(_user_email_only(b.customer), f"Payment receipt · {b.entity.title}",
                             [f"You paid {money(p.amount)} to {b.entity.title} for stay {ref}."])

    later(build)


def _subscription_payment_success(sender, instance, created, **kwargs):
    if not _became(instance, created, "SUCCESS"):
        return
    pk = instance.pk

    def build():
        p = _fresh(sender, pk)
        if not p or not getattr(p, "entity_id", None):
            return
        purpose = str(getattr(p, "purpose", "") or "").upper()
        what = "the stock take" if purpose == "STOCK_TAKE" else f"{p.months or 1} month(s) of WaziPOS"
        deliver_to_entity(p.entity, "Payment receipt · WaziPOS",
                          [f"We received {money(p.amount)} for {what}. Thank you.", f"Reference: {p.reference_number}"])

    later(build)


def _rent_payment_success(sender, instance, created, **kwargs):
    if not _became(instance, created, "SUCCESS"):
        return
    pk = instance.pk

    def build():
        p = _fresh(sender, pk)
        if not p or not getattr(p, "entity_id", None):
            return
        unit = getattr(p.property_unit, "title", None) if getattr(p, "property_unit_id", None) else None
        deliver_to_entity(p.entity, "Rent received",
                          [f"{money(p.amount)} rent received{f' for {unit}' if unit else ''} ({p.months or 1} month(s)).",
                           "It is paid out to your payout account."])

    later(build)


# ---------------------------------------------------------------- payouts

def notify_payout(row):
    """A payout was paid, failed or is waiting for a payout account: tell the payee."""
    from payments.models import OrderPayouts

    status = row.status
    payee_user = row.payee_user if row.payee_user_id else None
    person = payee_user is not None
    what = f"{row.get_payee_kind_display().lower()} · {row.order_reference}"
    if status == OrderPayouts.Status.PAID:
        subject = f"Paid out {money(row.amount)}"
        lines = [f"We paid {money(row.amount)} to your payout account ({what}).",
                 f"Reference: {row.psp_reference or row.reference_number or '-'}"]
        sms = person
    elif status == OrderPayouts.Status.FAILED:
        subject = f"Payout of {money(row.amount)} failed"
        lines = [f"We could not pay {money(row.amount)} ({what}): {row.note or 'the payment was rejected'}.",
                 "Check your payout account details on WaziPOS; we will retry once they are correct."]
        sms = True
    elif status == OrderPayouts.Status.NO_ACCOUNT:
        subject = f"Add a payout account to receive {money(row.amount)}"
        lines = [f"{money(row.amount)} is waiting for you ({what}).",
                 "Add your payout account on WaziPOS (Payout accounts) and it is paid automatically."]
        sms = True
    else:
        return
    channels = dict(email=True, sms=sms, push=True, sms_text=f"{subject}. {lines[0]}", data={"type": "payout", "payout": str(row.pk)})
    if person:
        deliver_to_users([payee_user], subject, lines, **channels)
    elif row.payee_entity_id:
        deliver_to_entity(row.payee_entity, subject, lines, **channels)


def _payout_saved(sender, instance, created, **kwargs):
    from payments.models import OrderPayouts

    status = instance.status
    if status == OrderPayouts.Status.NO_ACCOUNT and not (created or instance._old_status != status):
        return
    if status in (OrderPayouts.Status.PAID, OrderPayouts.Status.FAILED, OrderPayouts.Status.NO_ACCOUNT) and (created or instance._old_status != status):
        if status == OrderPayouts.Status.PAID and (instance.note or "").startswith("Paid manually"):
            return
        pk = instance.pk
        later(lambda: (lambda r: notify_payout(r) if r else None)(_fresh(sender, pk)))


# ---------------------------------------------------------------- wiring

def connect():
    from django.apps import apps

    def model(label):
        try:
            return apps.get_model(label)
        except LookupError:
            return None

    for label in B2B:
        m = model(label)
        if m:
            post_save.connect(_b2b_order_created, sender=m, dispatch_uid=f"notify-order-{label}")
    for label, handler in (("retailers.CustomerOrders", _customer_order_created), ("restaurants.FoodOrder", _food_order_created)):
        m = model(label)
        if m:
            post_save.connect(handler, sender=m, dispatch_uid=f"notify-order-{label}")

    watched = [(label, _b2b_payment_success) for label in PAYMENTS] + [
        ("retailers.CustomerOrderPayment", _customer_payment_success),
        ("restaurants.FoodOrderPayment", _food_payment_success),
        ("restaurants.RoomBookingPayment", _stay_payment_success),
        ("subscriptions.SubscriptionPayment", _subscription_payment_success),
        ("properties.PropertyUnitPayments", _rent_payment_success),
        ("payments.OrderPayouts", _payout_saved),
    ]
    for label, handler in watched:
        m = model(label)
        if m:
            pre_save.connect(_remember_status, sender=m, dispatch_uid=f"notify-status-{label}")
            post_save.connect(handler, sender=m, dispatch_uid=f"notify-{label}")
