# wholesalers/discovery.py
#
# Wholesaler discovery for the retailer's wholesale marketplace.
#
#   POST /api/v1/wholesalers/discovery   { action: "DiscoverWholesalers", ... }
#
# Which wholesalers a retailer may see depends on the retailer's type:
#   PharmaceuticalRetailer -> PharmaceuticalWholesaler + GeneralWholesaler
#   GeneralRetailer        -> GeneralWholesaler
#
# Modes
#   "adjacent" - wholesalers within `radius_km` of the device's coordinates,
#                nearest first (needs latitude + longitude).
#   "kenya"    - every allowed wholesaler, optionally filtered by `county` and
#                `sub_county` (ids), sorted by name. If coordinates are sent,
#                each result still carries its distance.
#
# Both modes accept
#   search  - wholesaler name, town or code
#   product - only wholesalers with an in-stock, listed item whose product
#             title or barcode matches; each result lists the matches
#   page / page_size (default 20, max 50)
#
# Counties and sub-counties come from the existing /authentication/counties
# (GetCounties, sub-counties nested) and /authentication/sub-counties
# (GetSubCounties) endpoints.

from decimal import Decimal

from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Count, Min, Q
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from authentication.models import Entities
from core.constants import EntityType
from entitylocations.models import Locations

from .models import WholesalerReceipts

WHOLESALERS_FOR_RETAILER = {
    EntityType.PHARMACEUTICAL_RETAILER.value: [
        EntityType.PHARMACEUTICAL_WHOLESALER.value,
        EntityType.GENERAL_WHOLESALER.value,
    ],
    EntityType.GENERAL_RETAILER.value: [EntityType.GENERAL_WHOLESALER.value],
}

DEFAULT_RADIUS_KM = 30
MAX_RADIUS_KM = 300
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 50
MATCHES_PER_WHOLESALER = 3


def _error(message, errors=None):
    return Response({"response_code": 1, "response_message": message, "errors": errors or [message]})


def _present(data, key):
    value = data.get(key)
    return value is not None and str(value).strip() != ""


def _float(data, key):
    try:
        return float(data.get(key))
    except (TypeError, ValueError):
        return None


def _int(data, key, default, low, high):
    try:
        value = int(data.get(key))
    except (TypeError, ValueError):
        return default
    return max(low, min(high, value))


def _coords(data):
    """Point from latitude/longitude (also accepts coords: {latitude, longitude})."""
    src = data.get("coords") if isinstance(data.get("coords"), dict) else data
    lat, lng = _float(src, "latitude"), _float(src, "longitude")
    if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return Point(lng, lat, srid=4326)


def _in_stock_receipts():
    """Wholesaler stock a retailer can buy: in stock and listed."""
    return WholesalerReceipts.objects.filter(current_unit_quantity__gte=1).exclude(in_placement="false")


def _unit_price(receipt_values):
    final = receipt_values.get("final_unit_selling_price")
    if final is not None and Decimal(final) > 0:
        return Decimal(final)
    return Decimal(receipt_values.get("unit_selling_price") or 0)


def _image_url(entity, request):
    """Newest cover image (images are prefetched, so this doesn't query)."""
    images = [i for i in entity.images.all() if i.image]
    if not images:
        return None
    image = max(images, key=lambda i: i.created)
    try:
        return request.build_absolute_uri(image.image.url)
    except Exception:
        return None


def discover_wholesalers(data, user, request):
    retailer = getattr(user, "entity", None)
    allowed = WHOLESALERS_FOR_RETAILER.get(getattr(retailer, "entity_type", None))
    if not allowed:
        return None, ["Only retailers can browse the wholesale marketplace"]

    mode = str(data.get("mode") or "kenya").strip().lower()
    if mode not in ("adjacent", "kenya"):
        return None, ["mode must be 'adjacent' or 'kenya'"]
    here = _coords(data)
    if mode == "adjacent" and here is None:
        return None, ["Your location is needed to find wholesalers near you"]

    qs = (
        Entities.objects.filter(entity_type__in=allowed)
        .select_related("county", "sub_county")
        .prefetch_related("images")
    )

    if _present(data, "search"):
        term = str(data["search"]).strip()
        qs = qs.filter(Q(title__icontains=term) | Q(town__icontains=term) | Q(entity_code__iexact=term))

    if mode == "kenya":
        if _present(data, "county"):
            qs = qs.filter(county_id=data["county"])
        if _present(data, "sub_county"):
            qs = qs.filter(sub_county_id=data["sub_county"])

    # Product search: only wholesalers selling a matching, in-stock item.
    product_term = str(data.get("product") or "").strip()
    matching_stock = None
    if product_term:
        matching_stock = _in_stock_receipts().filter(
            Q(product__title__icontains=product_term) | Q(product__bar_code=product_term)
        )
        qs = qs.filter(id__in=matching_stock.values("entity_id"))

    radius_km = _int(data, "radius_km", DEFAULT_RADIUS_KM, 1, MAX_RADIUS_KM)
    page = _int(data, "page", 1, 1, 10_000)
    page_size = _int(data, "page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    distances = {}
    # Adjacent-mode hints (page 1): why the list might be short or empty.
    unlocated_count = None
    nearest_km = None
    if mode == "adjacent":
        located = list(
            Locations.objects.filter(entity__in=qs, point__isnull=False, point__distance_lte=(here, D(km=radius_km)))
            .annotate(distance=Distance("point", here))
            .order_by("distance")
            .values_list("entity_id", "distance")
        )
        ordered_ids = [entity_id for entity_id, _ in located]
        distances = {entity_id: dist.km for entity_id, dist in located}
        total = len(ordered_ids)
        page_ids = ordered_ids[(page - 1) * page_size: page * page_size]
        by_id = {e.id: e for e in qs.filter(id__in=page_ids)}
        entities = [by_id[i] for i in page_ids if i in by_id]
        if page == 1:
            # Wholesalers with no saved map point never show under "Near me".
            unlocated_count = qs.exclude(
                id__in=Locations.objects.filter(point__isnull=False).values("entity_id")
            ).count()
            if not total:
                # Nearest located wholesaler outside the radius, if any.
                nearest = (
                    Locations.objects.filter(entity__in=qs, point__isnull=False)
                    .annotate(distance=Distance("point", here))
                    .order_by("distance")
                    .values_list("distance", flat=True)
                    .first()
                )
                nearest_km = round(nearest.km, 1) if nearest is not None else None
    else:
        qs = qs.order_by("title")
        total = qs.count()
        entities = list(qs[(page - 1) * page_size: page * page_size])
        if here is not None and entities:
            for entity_id, dist in (
                Locations.objects.filter(entity__in=entities, point__isnull=False)
                .annotate(distance=Distance("point", here))
                .values_list("entity_id", "distance")
            ):
                distances[entity_id] = dist.km

    ids = [e.id for e in entities]

    # How many different products each wholesaler has in stock.
    stock_counts = dict(
        _in_stock_receipts()
        .filter(entity_id__in=ids)
        .values("entity_id")
        .annotate(n=Count("product_id", distinct=True))
        .values_list("entity_id", "n")
    )

    # Matching products (cheapest batch of each) when searching by product.
    matches = {}
    if matching_stock is not None and ids:
        rows = (
            matching_stock.filter(entity_id__in=ids)
            .values("entity_id", "product_id", "product__title", "unit_of_receipt",
                    "final_unit_selling_price", "unit_selling_price", "current_unit_quantity")
        )
        best = {}
        for row in rows:
            key = (row["entity_id"], row["product_id"])
            price = _unit_price(row)
            if price <= 0:
                continue
            current = best.get(key)
            if current is None or price < current["price"]:
                best[key] = {"price": price, "row": row}
        for (entity_id, product_id), item in best.items():
            row = item["row"]
            matches.setdefault(entity_id, []).append({
                "product": str(product_id),
                "title": row["product__title"],
                "unit_price": str(item["price"]),
                "unit": row["unit_of_receipt"],
            })
        for entity_id in matches:
            matches[entity_id].sort(key=lambda m: Decimal(m["unit_price"]))

    results = []
    for e in entities:
        found = matches.get(e.id, [])
        distance = distances.get(e.id)
        results.append({
            "id": str(e.id),
            "title": e.title,
            "entity_type": e.entity_type,
            "entity_code": e.entity_code,
            "town": e.town or "",
            "county": {"id": str(e.county_id), "title": e.county.title} if e.county_id else None,
            "sub_county": {"id": str(e.sub_county_id), "title": e.sub_county.title} if e.sub_county_id else None,
            "phone": e.phone or "",
            "is_verified": e.is_verified == "true",
            "image": _image_url(e, request),
            "distance_km": round(distance, 2) if distance is not None else None,
            "products_in_stock": stock_counts.get(e.id, 0),
            "product_match_count": len(found),
            "product_matches": found[:MATCHES_PER_WHOLESALER],
        })

    return {
        "mode": mode,
        "radius_km": radius_km if mode == "adjacent" else None,
        "page": page,
        "page_size": page_size,
        "count": total,
        "has_more": page * page_size < total,
        "allowed_types": allowed,
        # adjacent mode, page 1 only (else null):
        "unlocated_count": unlocated_count,  # allowed wholesalers with no saved map location
        "nearest_km": nearest_km,            # nearest located one, when none are within the radius
        "results": results,
    }, []


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def wholesalerDiscoveryAPIView(request):
    if not isinstance(request.data, dict):
        raise exceptions.ValidationError("Request body must be a JSON object.")
    action = request.data.get("action")
    if action != "DiscoverWholesalers":
        raise exceptions.ValidationError(f"Action {action} is unknown")
    payload, errors = discover_wholesalers(request.data, request.user, request)
    if errors:
        return _error("Wholesalers not retrieved", errors)
    return Response({"response_code": 0, "response_message": "Wholesalers retrieved", **payload})
