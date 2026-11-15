from rest_framework import generics, serializers, status, views, permissions, exceptions
from django.db import transaction
from core.responses import custom_error_response, custom_success_message
from rest_framework.decorators import api_view, permission_classes, parser_classes, renderer_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.pagination import PageNumberPagination

from . import models,serializers
from .utils import logistics_utils
from core.responses import custom_errors_response

# Create your views here.

@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]

)
@renderer_classes([JSONRenderer,])
@parser_classes([JSONParser, MultiPartParser])
def logisticsAdminAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetEntitySubStores":
        """Get facility sub stores"""

        categories = models.EntitySubStore.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.EntitySubStoreSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateEntityStore":
        errors, town = logistics_utils.create_entity_store(request.data, request.user)
        if town:
            serializer = serializers.EntityStoreSerializer(
                town, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity store created successfully", serializer.data, "entity_store"
            )

        else:
            return custom_errors_response(1, "Entity store not created", errors)
    elif request.data["action"] == "UpdateEntityStore":
        errors, entity_store = logistics_utils.update_entity_store(
            request.data, request.user
        )
        if entity_store:
            serializer = serializers.EntityStoreSerializer(
                entity_store, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity store updated successfully",
                serializer.data,
                "entity_store",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity store not updated",errors)     

    elif request.data["action"] == "GetEntityStores":
        """Get entity stores"""

        entity_stores = models.EntityStore.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_stores, request)
        serializer = serializers.EntityStoreSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateEntitySubStore":
        errors, entity_store = logistics_utils.create_entity_sub_store(request.data, request.user)
        if entity_store:
            serializer = serializers.EntitySubStoreSerializer(
                entity_store, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity sub store created successfully", serializer.data, "entity_store"
            )

        else:
            return custom_errors_response(1, "Entity sub store not created", errors)

    elif request.data["action"] == "UpdateEntitySubStore":
        errors, entity_sub_store = logistics_utils.update_entity_sub_store(
            request.data, request.user
        )
        if entity_sub_store:
            serializer = serializers.EntitySubStoreSerializer(
                entity_sub_store, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity sub store updated successfully",
                serializer.data,
                "entity_sub_store",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity sub store not updated",errors)     
    
    elif request.data["action"] == "GetEntitySubStores":
        """Get entity stores"""

        entity_stores = models.EntitySubStore.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_stores, request)
        serializer = serializers.EntitySubStoreSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateEntityStoreReceipt":
        errors, entity_store_receipt = logistics_utils.create_entity_store_receipt(request.data, request.user)
        if entity_store_receipt:
            serializer = serializers.EntityStoreReceiptsSerializer(
                entity_store_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity store receipt created successfully", serializer.data, "entity_store_receipt"
            )

        else:
            return custom_errors_response(1, "Entity store receipt not created", errors)

    elif request.data["action"] == "UpdateEntityStoreReceipt":
        errors, entity_store_receipt = logistics_utils.update_entity_store_receipt(
            request.data, request.user
        )
        if entity_store_receipt:
            serializer = serializers.EntityStoreReceiptsSerializer(
                entity_store_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity store receipt updated successfully",
                serializer.data,
                "entity_store_receipt",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity sub store receipt not updated",errors)     
    
    elif request.data["action"] == "GetEntityStoreReceipts":
        """Get entity stores"""

        entity_stores = models.EntityStoreReceipts.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_stores, request)
        serializer = serializers.EntityStoreReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateEntitySubStoreReceipt":
        errors, entity_sub_store_receipt = logistics_utils.create_entity_sub_store_receipt(request.data, request.user)
        if entity_sub_store_receipt:
            serializer = serializers.EntitySubStoreReceiptsSerializer(
                entity_sub_store_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0, "Entity sub store receipt created successfully", serializer.data, "entity_sub_store_receipt"
            )

        else:
            return custom_errors_response(1, "Entity sub store receipt not created", errors)

    elif request.data["action"] == "UpdateEntitySubStoreReceipt":
        errors, entity_sub_store_receipt = logistics_utils.update_entity_sub_store_receipt(
            request.data, request.user
        )
        if entity_sub_store_receipt:
            serializer = serializers.EntitySubStoreReceiptsSerializer(
                entity_sub_store_receipt, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Entity sub store receipt updated successfully",
                serializer.data,
                "entity_sub_store_receipt",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity sub store receipt not updated",errors)     
    
    elif request.data["action"] == "GetEntitySubStoreReceipts":
        """Get entity stores"""

        entity_stores = models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entity_stores, request)
        serializer = serializers.EntitySubStoreReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntitySubStoreReceiptsByPreparation":
        """Get sub store inventory for a given preparation """
        receipts=[]
        preparation = None
        from drugs.utils import drugs_models_validators
        if request.data["preparation"] and not request.data["preparation"]=="":
            errors, preparation = drugs_models_validators.validate_preparation(request.data["preparation"])
            if preparation:
                if models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity,product__preparation=preparation,current_unit_quantity__gte=1).exists():
                    receipts=models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity,product__preparation=preparation,current_unit_quantity__gte=1).all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(receipts, request)
        serializer = serializers.EntitySubStoreReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntitySubStoreReceiptsByProduct":
        """Get sub store inventory for a given product"""
        receipts=[]
        product = None
        from products.validators import product_models_validator
        if request.data["product"] and not request.data["product"]=="":
            product = product_models_validator.validate_product(request.data["product"])
            if product:
                if models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity,product=product,current_unit_quantity__gte=1).exists():
                    receipts=models.EntitySubStoreReceipts.objects.filter(entity=request.user.entity,product=product,current_unit_quantity__gte=1).all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(receipts, request)
        serializer = serializers.EntitySubStoreReceiptsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')



# ---------------------------------------------------------------------------
# Deliveries — logistics/utils/deliveries.py
# ---------------------------------------------------------------------------

from .utils import deliveries  # noqa: E402


def _save_owned(model, serializer_cls, request, extra_validate=None):
    """Create, or update by "id", a row owned by the caller's entity."""
    data = dict(request.data.get("details") or {})
    instance = None
    if data.get("id"):
        instance = model.objects.filter(id=data["id"], entity=request.user.entity).first()
        if not instance:
            return custom_errors_response(1, "Record not found", ["Record for provided ID does not exist"])
    if extra_validate:
        err = extra_validate(data, instance)
        if err:
            return custom_errors_response(1, "Not saved", [err])
    ser = serializer_cls(instance, data=data, partial=bool(instance), context={"request": request})
    if not ser.is_valid():
        return custom_errors_response(1, "Not saved", [f"{k}: {', '.join(map(str, v))}" for k, v in ser.errors.items()])
    obj = ser.save(**({} if instance else {"entity": request.user.entity, "owner": request.user}))
    return custom_success_message(0, "Saved", serializer_cls(obj, context={"request": request}).data, "record")


def _validate_partner(data, instance):
    partner_id = data.get("partner") or (instance and instance.partner_id)
    kind = data.get("kind") or (instance and instance.kind)
    partner = models.Entities.objects.filter(id=partner_id).first() if partner_id else None
    if not partner:
        return "Pick the delivery company or courier"
    if kind == models.DeliveryPartner.Kind.COURIER and partner.entity_type != "Courier":
        return f"{partner.title} isn't registered as a courier"
    if kind == models.DeliveryPartner.Kind.DELIVERY_COMPANY and partner.entity_type != "Delivery":
        return f"{partner.title} isn't registered as a delivery company"
    return None


def _validate_agent(data, instance, entity=None):
    if instance is None and not data.get("user"):
        return "Pick the delivery person (a user)"
    if data.get("user") and entity is not None:
        from employees.models import Employees

        if not Employees.objects.filter(entity=entity, user_id=data["user"], is_active="true").exists():
            return "Add the delivery person as an employee first"
    return None


_LEG_LABELS = {
    "LOCAL": "Delivery to you",
    "HANDOVER": "To the courier's office",
    "TRANSIT": "Courier to your nearest office",
    "LAST_MILE": "Last mile",
}


def _option_out(option):
    """A delivery option as the buyer sees it: who does each leg, how far, at what cost."""
    legs = []
    for leg in option["legs"]:
        provider = leg.get("provider")
        dest_cp = leg.get("destination_collection_point")
        origin_cp = leg.get("origin_collection_point")
        legs.append({
            "kind": leg["kind"],
            "label": _LEG_LABELS.get(leg["kind"], leg["kind"]),
            "mode": leg["mode"],
            "mode_label": models.DeliveryMode(leg["mode"]).label,
            "provider": str(provider.id) if provider else None,
            "provider_title": provider.title if provider else None,
            "from_title": origin_cp.title if origin_cp else None,
            "to_title": dest_cp.title if dest_cp else None,
            "distance_km": str(leg["distance_km"]),
            "cost": str(leg["cost"]),
        })
    return {"key": option["key"], "method": option["method"], "total": str(option["total"]), "legs": legs}


def _is_platform_admin(user):
    from payments.utils.admin_payout_accounts import is_platform_admin

    return is_platform_admin(user)


def _save_office(request, entity):
    """Create, or update by "id", one of the caller's offices (CollectionPoints)."""
    from authentication.models import CollectionPoints, Counties
    from django.contrib.gis.geos import Point

    d = dict(request.data.get("details") or {})
    office = None
    if d.get("id"):
        office = CollectionPoints.objects.filter(id=d["id"], entity=entity).first()
        if not office:
            return custom_errors_response(1, "Not saved", ["Office for provided ID does not exist"])
    errors = []
    title = str(d.get("title") or (office.title if office else "")).strip()
    if not title:
        errors.append("Enter the office name")
    county_id = d.get("county") or (office.county_id if office else None)
    county = Counties.objects.filter(id=county_id).first() if county_id else None
    if not county:
        errors.append("Pick the county")
    point_type = str(d.get("point_type") or (office.point_type if office else "POST_OFFICE")).upper()
    if point_type not in CollectionPoints.PointType.values:
        errors.append("Pick the kind of office")
    location = office.location if office else None
    if d.get("latitude") not in (None, "") and d.get("longitude") not in (None, ""):
        try:
            lat, lng = float(d["latitude"]), float(d["longitude"])
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                raise ValueError
            location = Point(lng, lat, srid=4326)
        except (TypeError, ValueError):
            errors.append("Enter a valid latitude and longitude")
    if not location:
        errors.append("Set the office location (needed to price deliveries)")
    if errors:
        return custom_errors_response(1, "Not saved", errors)

    office = office or CollectionPoints(entity=entity, owner=request.user)
    office.title = title
    office.county = county
    office.point_type = point_type
    office.location = location
    for f in ("code", "physical_address", "landmark", "phone_number"):
        if f in d:
            setattr(office, f, (str(d[f]).strip() or None) if d[f] is not None else None)
    if "is_active" in d:
        office.is_active = bool(d["is_active"])
    office.save()
    return custom_success_message(0, "Office saved", serializers.OfficeSerializer(office).data, "record")


def _shipment_response(result, request, message):
    errors, obj = result
    if errors:
        return custom_errors_response(1, f"{message} failed", errors)
    shipment = obj if isinstance(obj, models.Shipment) else obj.shipment
    shipment = models.Shipment.objects.prefetch_related("legs").get(pk=shipment.pk)
    return custom_success_message(0, message, serializers.ShipmentSerializer(shipment, context={"request": request}).data, "shipment")


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@renderer_classes([JSONRenderer])
@parser_classes([JSONParser, MultiPartParser])
def deliveriesAPIView(request):
    action = request.data.get("action")
    entity = request.user.entity

    # ---- setup: partners, own delivery persons, rates ----
    if action == "GetDeliveryPartners":
        qs = models.DeliveryPartner.objects.filter(entity=entity).select_related("partner").order_by("kind", "partner__title")
        return custom_success_message(0, "Delivery partners", serializers.DeliveryPartnerSerializer(qs, many=True).data, "partners")
    if action == "SaveDeliveryPartner":
        return _save_owned(models.DeliveryPartner, serializers.DeliveryPartnerSerializer, request, _validate_partner)
    if action == "GetDeliveryAgents":
        # Own delivery persons; with "partner": a delivery company's persons (if it is our partner).
        owner_id = request.data.get("partner") or entity.id
        if str(owner_id) != str(entity.id) and not models.DeliveryPartner.objects.filter(
            entity=entity, partner_id=owner_id, is_active=True
        ).exists():
            return custom_errors_response(1, "Not allowed", ["That company isn't one of your delivery partners"])
        qs = models.DeliveryAgent.objects.filter(entity_id=owner_id).select_related("user", "entity").order_by("-is_active", "mode")
        return custom_success_message(0, "Delivery persons", serializers.DeliveryAgentSerializer(qs, many=True).data, "agents")
    if action == "SaveDeliveryAgent":
        return _save_owned(
            models.DeliveryAgent, serializers.DeliveryAgentSerializer, request,
            lambda data, instance: _validate_agent(data, instance, entity),
        )
    if action == "GetDeliveryRates":
        qs = models.DeliveryRate.objects.filter(entity=entity).order_by("mode")
        return custom_success_message(0, "Delivery rates", serializers.DeliveryRateSerializer(qs, many=True).data, "rates")
    if action == "SaveDeliveryRate":
        return _save_owned(models.DeliveryRate, serializers.DeliveryRateSerializer, request)

    # ---- shipments ----
    if action == "GetShipment":
        # A retailer order (seller or buyer entity) or a customer order (the shop, or the customer).
        if request.data.get("customer_order"):
            shipment = models.Shipment.objects.prefetch_related("legs").select_related("customer_order").filter(
                customer_order_id=request.data["customer_order"]).first()
            co = shipment.customer_order if shipment else None
            allowed = bool(co) and (co.entity_id == entity.id or co.owner_id == request.user.id)
        else:
            shipment = models.Shipment.objects.prefetch_related("legs").filter(retailer_order_id=request.data.get("retailer_order")).first()
            order = shipment.retailer_order if shipment else None
            allowed = bool(order) and entity.id in (order.wholesaler_id, order.retailer_id)
        if not shipment or not allowed:
            return custom_success_message(0, "No delivery yet", None, "shipment")
        return custom_success_message(0, "Shipment", serializers.ShipmentSerializer(shipment, context={"request": request}).data, "shipment")
    if action == "GetRetailerOrderDeliveryOptions":
        # Buyer, before paying: every way to get the order, priced for their location.
        err, order = deliveries._buyer_order(request.data, request.user)
        if err:
            return custom_errors_response(1, "No delivery options", [err])
        errors, options, kg = deliveries.retailer_order_delivery_options(order)
        if errors:
            return custom_errors_response(1, "No delivery options", errors)
        current = models.Shipment.objects.filter(retailer_order=order).first()
        return custom_success_message(0, "Delivery options", {
            "options": [_option_out(o) for o in options],
            "chargeable_weight_kg": str(kg),
            "chosen_method": "PICKUP" if not deliveries.delivery_requested(order) else (current.method if current else None),
            "shipping_amount": str(order.shipping_amount or 0),
        }, "delivery")
    if action == "ChooseRetailerOrderDelivery":
        # Buyer: "option" = an option key, or "PICKUP". Sets the order's delivery fee.
        errors, order = deliveries.choose_retailer_order_delivery(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Delivery choice not saved", errors)
        from wholesalers.serializers import RetailerOrdersSerializer

        return custom_success_message(
            0, "Delivery choice saved", RetailerOrdersSerializer(order, context={"request": request}).data, "retailer_order"
        )
    if action in ("DispatchRetailerOrder", "DispatchOrder"):
        # Seller, once paid: assign a delivery person of the planned provider
        # ("retailer_order" or "customer_order").
        return _shipment_response(deliveries.dispatch_order(request.data, request.user), request, "Order dispatched")
    if action == "GetDeliveryAvailability":
        # Can these businesses use DELIVERY? Only when their locations are set.
        # {"retailer_order"}: the wholesaler and the retailer; {"entity"}: that
        # seller (a shop front); nothing: the caller's own business (POS).
        if request.data.get("retailer_order"):
            from wholesalers.models import RetailerOrders

            order = RetailerOrders.objects.select_related("wholesaler", "retailer").filter(
                id=request.data.get("retailer_order")
            ).first()
            if not order or getattr(request.user, "entity_id", None) not in (order.wholesaler_id, order.retailer_id):
                return custom_errors_response(1, "Order not found", ["Retailer order for provided ID does not exist"])
            reasons = deliveries.delivery_location_errors(order.wholesaler, order.retailer)
        else:
            seller = (
                models.Entities.objects.filter(id=request.data.get("entity")).first()
                if request.data.get("entity") else getattr(request.user, "entity", None)
            )
            if not seller:
                return custom_errors_response(1, "Business not found", ["Business not found"])
            reasons = deliveries.delivery_location_errors(seller)
        return custom_success_message(0, "Delivery availability", {
            "delivery_available": not reasons,
            "reasons": reasons,
        }, "availability")
    if action == "GetCustomerDeliveryOptions":
        # Shopper at checkout, before paying: "entity" (the shop), destination
        # lat/lng and "order_items" [{retailer_receipt, purchased_quantity}].
        from django.contrib.gis.geos import Point

        seller = models.Entities.objects.filter(id=request.data.get("entity")).first()
        if not seller:
            return custom_errors_response(1, "No delivery options", ["Shop not found"])
        try:
            destination = Point(float(request.data["destination_longitude"]), float(request.data["destination_latitude"]), srid=4326)
        except (KeyError, TypeError, ValueError):
            destination = None
        errors, options, kg = deliveries.checkout_delivery_options(seller, destination, request.data.get("order_items") or [])
        if errors:
            return custom_errors_response(1, "No delivery options", errors)
        return custom_success_message(0, "Delivery options", {
            "options": [_option_out(o) for o in options],
            "chargeable_weight_kg": str(kg),
        }, "delivery")
    if action == "AssignShipmentLeg":
        return _shipment_response(deliveries.assign_leg(request.data, request.user), request, "Delivery person assigned")
    if action == "UpdateShipmentLeg":
        return _shipment_response(deliveries.update_leg(request.data, request.user), request, "Delivery updated")
    if action == "ConfirmShipmentCollected":
        return _shipment_response(deliveries.confirm_collected(request.data, request.user), request, "Collection confirmed")
    # ---- offices (a courier's collection points, where parcels are handed over / collected) ----
    if action == "GetMyOffices":
        from authentication.models import CollectionPoints

        qs = CollectionPoints.objects.filter(entity=entity).select_related("county").order_by("title")
        return custom_success_message(0, "Offices", serializers.OfficeSerializer(qs, many=True).data, "offices")
    if action == "SaveOffice":
        return _save_office(request, entity)

    # ---- payouts (platform admins): finished legs owed to deliverers ----
    if action == "GetDeliveryPayouts":
        if not _is_platform_admin(request.user):
            return custom_errors_response(1, "Not allowed", ["Only WaziPOS admins manage delivery payouts"])
        settled = str(request.data.get("settled", "false")).lower() == "true"
        qs = (
            models.ShipmentLeg.objects.filter(is_payable=True, is_settled=settled)
            .select_related("shipment__retailer_order", "shipment__customer_order", "provider", "agent__user",
                            "payout_user_account__user", "payout_user_account__account_entity",
                            "payout_entity_account__account_entity")
            .order_by("completed_at")[:500]
        )
        return custom_success_message(0, "Delivery payouts", serializers.PayableLegSerializer(qs, many=True).data, "legs")
    if action == "MarkDeliveryPayoutPaid":
        if not _is_platform_admin(request.user):
            return custom_errors_response(1, "Not allowed", ["Only WaziPOS admins manage delivery payouts"])
        reference = str(request.data.get("reference") or "").strip()
        ids = request.data.get("legs") or []
        if not reference:
            return custom_errors_response(1, "Not marked paid", ["Enter the payment reference"])
        from django.utils import timezone

        with transaction.atomic():
            legs = list(models.ShipmentLeg.objects.select_for_update().filter(id__in=ids, is_payable=True, is_settled=False))
            for leg in legs:
                leg.is_settled = True
                leg.settled_at = timezone.now()
                leg.pay_out_reference_number = reference[:120]
                leg.save(update_fields=["is_settled", "settled_at", "pay_out_reference_number", "updated"])
        return custom_success_message(0, f"{len(legs)} payout(s) marked paid", {"count": len(legs)}, "result")

    if action == "GetMyDeliveries":
        # The caller's open legs as a delivery person (any employer).
        legs = (
            models.ShipmentLeg.objects.filter(agent__user=request.user)
            .exclude(status__in=[models.LegStatus.DELIVERED, models.LegStatus.HANDED_OVER, models.LegStatus.CANCELLED])
            .select_related("shipment", "provider", "agent__user")
            .order_by("assigned_at")
        )
        return custom_success_message(0, "My deliveries", serializers.ShipmentLegSerializer(legs, many=True).data, "legs")

    raise exceptions.ValidationError(f"Action {action} is unknown")


def _fulfilment_response(result, message):
    from .utils.fulfilment import fulfilment_out

    errors, f = result
    if errors:
        return custom_errors_response(1, f"{message} failed", errors)
    return custom_success_message(0, message, fulfilment_out(f), "fulfilment")


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@renderer_classes([JSONRenderer])
@parser_classes([JSONParser, MultiPartParser])
def fulfilmentAPIView(request):
    """
    Preparing paid orders: "retailer_order" (wholesaler's) or "customer_order" (shop's).
      GetFulfilmentQueue {kind: "retailer"|"customer", scope: "open"|"done"}  (seller)
      GetFulfilment {retailer_order | customer_order}                       (seller or buyer)
      StartPreparing {preparer?, notes?} / MarkPacked {packer?, package_count?, package_weight_kg?}
      MarkReady / ConfirmCollection {collector_name, collector_phone?, collector_id_number?, pickup_code?}
    """
    from .utils import fulfilment as ff

    action = request.data.get("action")
    if action == "GetFulfilmentQueue":
        kind = "customer" if request.data.get("kind") == "customer" else "retailer"
        scope = "done" if request.data.get("scope") == "done" else "open"
        return custom_success_message(0, "Fulfilment queue", ff.fulfilment_queue(request.user, kind, scope), "orders")
    if action == "GetFulfilment":
        from retailers.models import CustomerOrders
        from wholesalers.models import RetailerOrders

        me = getattr(request.user, "entity_id", None)
        if request.data.get("customer_order"):
            order = CustomerOrders.objects.filter(id=request.data["customer_order"]).first()
            kind = "customer"
            seller = bool(order) and order.entity_id == me
            buyer = bool(order) and not seller and request.user.id in (order.customer_id, getattr(order, "user_id", None))
        else:
            order = RetailerOrders.objects.filter(id=request.data.get("retailer_order")).first()
            kind = "retailer"
            seller = bool(order) and order.wholesaler_id == me
            buyer = bool(order) and order.retailer_id == me
        if not (seller or buyer):
            return custom_errors_response(1, "Order not found", ["Order for provided ID does not exist"])
        f = ff.fulfilment_of(order, kind, create=False)
        return custom_success_message(0, "Fulfilment", ff.fulfilment_out(f, for_buyer=buyer), "fulfilment")
    if action == "StartPreparing":
        return _fulfilment_response(ff.start_preparing(request.data, request.user), "Preparing")
    if action == "MarkPacked":
        return _fulfilment_response(ff.mark_packed(request.data, request.user), "Packed")
    if action == "MarkReady":
        return _fulfilment_response(ff.mark_ready(request.data, request.user), "Ready")
    if action == "ConfirmCollection":
        return _fulfilment_response(ff.confirm_collection(request.data, request.user), "Collected")
    raise exceptions.ValidationError(f"Action {action} is unknown")
