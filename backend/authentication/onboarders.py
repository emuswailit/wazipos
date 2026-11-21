# authentication/onboarders.py
#
# Onboarders: an agent's helpers who count a new retailer's or wholesaler's
# stock to create its first inventory (authentication/utils/agents.py).
#
# They are not the business's employees and get no other access to it. While
# their agent has them attached to the business — between the agent's from and
# to dates, and until the stock take is DONE — they can only CREATE its opening
# stock: RetailerReceipts for retailers, WholesalerReceipts for wholesalers, and
# for restaurants / hotels supplies (food, cleaning, utilities, packaging) or
# new bar drinks with their opening bottles. Never update or delete. Every
# request re-checks the dates, so access ends on its own when the window
# closes, unless the agent changes the dates.
#
#   POST /api/v1/authentication/onboarders/me    (active onboarders)
#     OnboarderGetAssignments                 -> assignments[] (with access_open)
#     OnboarderSearchProducts {entity, q}     -> products[] (that business's categories)
#     OnboarderCreateReceipt  {entity, receipt_details}  -> receipt
#       retailers / wholesalers: {draft_id, product, received_unit_quantity, unit_of_receipt,
#                                 unit_buying_price, unit_selling_price, batch?, bar_code?,
#                                 manufacture_date?, expiry_date?}
#       restaurants / hotels:    {target: "SUPPLY", draft_id, product? | title, category
#                                 (FOOD|CLEANING|UTILITY|PACKAGING|OTHER), unit, quantity,
#                                 unit_cost, supplier_name?, batch?, expiry_date?}
#                             or {target: "DRINK", draft_id, product? | title, volume_ml,
#                                 bottle_price, bottle_cost, sells_tots?, tot_ml?, tot_price?,
#                                 bottles}  (a NEW drink with its opening bottles)
#     OnboarderGetMyReceipts  {entity}        -> receipts[] (only the ones they entered)

import uuid

from django.db.models import Q
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes

from authentication.utils import agents as ag
from core.responses import custom_errors_response, custom_success_message


class OnboarderOnly(permissions.BasePermission):
    """Users with an active onboarder record (agent active, neither blacklisted)."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            raise exceptions.ValidationError("Please log in")
        onboarder = ag.active_onboarder(request.user)
        if not onboarder:
            raise exceptions.ValidationError(["Only active onboarders can do this."])
        request.onboarder = onboarder
        return True


def _assignment_out(o):
    return {
        "entity": str(o.entity_id),
        "entity_title": o.entity.title,
        "entity_type": o.entity.entity_type,
        "town": o.entity.town,
        "receipt_kind": ag.receipt_kind(o.entity.entity_type),
        "access_from": o.onboarder_access_from.isoformat() if o.onboarder_access_from else None,
        "access_to": o.onboarder_access_to.isoformat() if o.onboarder_access_to else None,
        "access_open": ag.access_open(o),
        "stock_take_status": o.stock_take_status,
        "agent_name": " ".join(x for x in (o.agent.user.first_name, o.agent.user.last_name) if x) if o.agent.user_id else "",
        "agent_phone": o.agent.user.phone if o.agent.user_id else None,
    }


def _receipt_out(r):
    return {
        "id": str(r.id),
        "product": str(r.product_id),
        "product_title": r.product.title if r.product_id else "",
        "received_unit_quantity": r.received_unit_quantity,
        "unit_of_receipt": r.unit_of_receipt,
        "unit_buying_price": str(r.unit_buying_price or 0),
        "unit_selling_price": str(r.unit_selling_price or 0),
        "batch": r.batch,
        "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None,
        "created": r.created.isoformat() if r.created else None,
    }


def _receipt_model(kind):
    if kind == "RETAILER":
        from retailers.models import RetailerReceipts

        return RetailerReceipts
    from wholesalers.models import WholesalerReceipts

    return WholesalerReceipts


def _mark_started(onboarding):
    if onboarding.stock_take_status == "PLANNED":
        onboarding.stock_take_status = "IN_PROGRESS"
        onboarding.save(update_fields=["stock_take_status", "updated"])


def _create_restaurant_stock(details, user, entity, onboarder):
    """A supply line (food, cleaning, utilities, packaging…) or a new bar drink with its opening bottles."""
    from django.db import transaction

    target = str(details.get("target") or "SUPPLY").upper()
    if target == "SUPPLY":
        from restaurants.services import supplies

        errs, stock = supplies.receive(details, user, entity=entity, onboarder=onboarder)
        if errs:
            return errs, None
        return [], _supply_row(stock.movements.filter(onboarder=onboarder).order_by("-created").first(), stock)
    if target == "DRINK":
        from restaurants.services import bar

        bottles = str(details.get("bottles") or "").strip()
        try:
            if float(bottles) <= 0:
                raise ValueError
        except ValueError:
            return ["How many bottles are there?"], None
        with transaction.atomic():
            # New drinks only (create_only): onboarders never change an existing drink.
            errs, drink = bar.save_drink({**details, "id": None}, user, entity=entity, create_only=True)
            if errs:
                transaction.set_rollback(True)
                return errs, None
            errs, drink = bar.receive_drinks(
                {"drink": str(drink.id), "bottles": bottles, "bottle_cost": details.get("bottle_cost"),
                 "draft_id": f"{details['draft_id']}:in", "supplier": "Opening stock"},
                user, entity=entity, onboarder=onboarder,
            )
            if errs:
                transaction.set_rollback(True)
                return errs, None
        return [], _drink_row(drink.movements.filter(onboarder=onboarder).order_by("-created").first(), drink)
    return ["Choose supplies or bar drinks"], None


def _supply_row(m, stock):
    return {
        "id": str(m.id) if m else str(stock.id),
        "product": str(stock.product_id) if stock.product_id else None,
        "product_title": stock.title,
        "received_unit_quantity": float(m.quantity) if m else float(stock.quantity),
        "unit_of_receipt": stock.unit,
        "unit_buying_price": str(m.unit_cost if m else stock.unit_cost),
        "unit_selling_price": None,
        "batch": stock.batch,
        "expiry_date": stock.expiry_date.isoformat() if stock.expiry_date else None,
        "category": stock.category,
        "target": "SUPPLY",
        "created": m.created.isoformat() if m and m.created else None,
    }


def _drink_row(m, drink):
    return {
        "id": str(m.id) if m else str(drink.id),
        "product": str(drink.product_id) if drink.product_id else None,
        "product_title": drink.title,
        "received_unit_quantity": float(m.bottles) if m else float(drink.stock_bottles or 0),
        "unit_of_receipt": "Bottle",
        "unit_buying_price": str(m.unit_cost if m else drink.bottle_cost),
        "unit_selling_price": str(drink.bottle_price),
        "batch": None,
        "expiry_date": None,
        "category": "BAR",
        "target": "DRINK",
        "created": m.created.isoformat() if m and m.created else None,
    }


def _restaurant_entries(entity, onboarder):
    from restaurants import models as rm

    supplies = rm.RestaurantStockMovement.objects.filter(entity=entity, onboarder=onboarder, kind="RECEIVE").select_related("stock")
    drinks = rm.BarStockMovement.objects.filter(entity=entity, onboarder=onboarder, kind="RECEIVE").select_related("drink")
    rows = [_supply_row(m, m.stock) for m in supplies[:500]] + [_drink_row(m, m.drink) for m in drinks[:500]]
    rows.sort(key=lambda r: r["created"] or "", reverse=True)
    return rows


@api_view(["POST"])
@permission_classes([OnboarderOnly])
def onboardersMeAPIView(request):
    action = request.data.get("action")
    if not action:
        raise exceptions.ValidationError("Action is not supplied")
    data = request.data

    if action == "OnboarderGetAssignments":
        rows = [_assignment_out(o) for o in ag.onboarder_assignments(request.onboarder)]
        return custom_success_message(0, "Assignments", rows, "assignments")

    # Everything below acts on one business: check access first, every time.
    errors, onboarding, onboarder = ag.onboarder_access(request.user, data.get("entity"))
    if errors:
        return custom_errors_response(1, "No access", errors)
    entity = onboarding.entity
    kind = ag.receipt_kind(entity.entity_type)

    if action == "OnboarderSearchProducts":
        from products.models import Products

        q = str(data.get("q") or "").strip()
        if len(q) < 2:
            return custom_success_message(0, "Products", [], "products")
        if kind == "RESTAURANT":
            # Restaurants receive anything from the catalogue (as Supplies does).
            from restaurants.services.supplies import search_catalogue

            return custom_success_message(0, "Products", search_catalogue(q), "products")
        qs = Products.objects.filter(Q(title__icontains=q) | Q(preparation__title__icontains=q))
        if entity.categories.exists():
            qs = qs.filter(category__in=entity.categories.all())
        rows = [
            {"id": str(p.id), "title": p.title, "units_per_pack": getattr(p, "units_per_pack", None)}
            for p in qs.order_by("title")[:30]
        ]
        return custom_success_message(0, "Products", rows, "products")

    if action == "OnboarderCreateReceipt":
        details = dict(data.get("receipt_details") or {})
        details["draft_id"] = str(details.get("draft_id") or uuid.uuid4())
        if kind == "RESTAURANT":
            errs, row = _create_restaurant_stock(details, request.user, entity, onboarder)
            if errs:
                return custom_errors_response(1, "Stock not recorded", errs)
            _mark_started(onboarding)
            return custom_success_message(0, "Stock recorded", row, "receipt")
        if kind == "RETAILER":
            from retailers.utils.retailer_utils import create_retailer_receipt_directly

            details.setdefault("unit_of_receipt", "Piece")
            errs, receipt = create_retailer_receipt_directly(
                {"retailer_receipt_details": details}, request.user, entity=entity, onboarder=onboarder,
            )
            if errs or not receipt:
                return custom_errors_response(1, "Stock not recorded", errs or ["Could not record the stock"])
        else:
            from wholesalers.utils.wholesaler_receipt_utils import create_wholesaler_receipt

            details.setdefault("unit_of_receipt", "Pack")
            details.setdefault("batch", None)
            receipt = create_wholesaler_receipt(
                {"wholesaler_receipt_details": details}, request.user, entity=entity, onboarder=onboarder,
            )
            if not receipt:
                return custom_errors_response(1, "Stock not recorded", ["Could not record the stock"])
        _mark_started(onboarding)
        return custom_success_message(0, "Stock recorded", _receipt_out(receipt), "receipt")

    if action == "OnboarderGetMyReceipts":
        if kind == "RESTAURANT":
            return custom_success_message(0, "Receipts", _restaurant_entries(entity, onboarder), "receipts")
        model = _receipt_model(kind)
        qs = model.objects.filter(entity=entity, onboarder=onboarder).select_related("product").order_by("-created")
        return custom_success_message(0, "Receipts", [_receipt_out(r) for r in qs[:500]], "receipts")

    # Update / delete are deliberately not offered: onboarders only create.
    raise exceptions.ValidationError(f"Action {action} is unknown")
