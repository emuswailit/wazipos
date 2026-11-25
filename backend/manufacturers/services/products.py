# manufacturers/services/products.py
#
# Products are the source of everything sold on WaziPOS. A manufacturer owns its
# product master (products.Products, manufacturer = it): name, barcode, category,
# pack size, unit and pack weight + dimensions (deliveries are planned from
# them), VAT, and for pharmaceutical manufacturers the drug preparation. Every
# distributor, wholesaler, retailer, restaurant and hotel then stocks these same
# products, so the manufacturer also sees its products' reach down the chain.
# Only the manufacturer (or a WaziPOS admin) edits its products.

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum

from core.constants import EntityType

PHARMA_ENTITY_TYPES = [
    "PharmaceuticalManufacturer", "PharmaceuticalDistributor", "PharmaceuticalWholesaler",
    "PharmaceuticalRetailer", "Clinic", "Hospital", "Dispensary",
]
# Who may stock a general product unless the manufacturer narrows it.
GENERAL_ENTITY_TYPES = [
    "GeneralManufacturer", "Publisher", "GeneralDistributor", "PharmaceuticalDistributor", "GeneralWholesaler",
    "PharmaceuticalWholesaler", "GeneralRetailer", "PharmaceuticalRetailer", "Grocery", "Restaurant",
    "Hotel", "Bar",
]


def _bool(v):
    return str(v).lower() in ("true", "1", "yes")


def reach(product_ids):
    """{product id: {distributors, wholesalers, retailers, units_in_market}}: who stocks it now."""
    from distributors.models import DistributorReceipts
    from retailers.models import RetailerReceipts
    from wholesalers.models import WholesalerReceipts

    out = {pid: {"distributors": 0, "wholesalers": 0, "retailers": 0} for pid in product_ids}
    for model, key, qty_field in (
        (DistributorReceipts, "distributors", "current_unit_quantity"),
        (WholesalerReceipts, "wholesalers", "current_unit_quantity"),
        (RetailerReceipts, "retailers", "current_unit_quantity"),
    ):
        try:
            rows = (
                model.objects.filter(product_id__in=product_ids, **{f"{qty_field}__gt": 0})
                .values("product_id").annotate(n=Count("entity", distinct=True))
            )
            for r in rows:
                out.setdefault(r["product_id"], {"distributors": 0, "wholesalers": 0, "retailers": 0})[key] = r["n"]
        except Exception:
            continue
    return out


def product_out(p, stock=None, market=None):
    s = stock or {}
    return {
        "id": str(p.id),
        "title": p.title,
        "packaging": p.packaging,
        "bar_code": p.bar_code,
        "category": str(p.category_id) if p.category_id else None,
        "category_title": p.category.title if p.category_id else None,
        "sub_category": str(p.sub_category_id) if p.sub_category_id else None,
        "sub_category_title": p.sub_category.title if p.sub_category_id else None,
        "description": p.description,
        "units_per_pack": p.units_per_pack,
        "is_vatable": str(p.is_vatable).lower() == "true",
        "is_pom": p.is_pom,
        "preparation": str(p.preparation_id) if p.preparation_id else None,
        "preparation_title": str(p.preparation) if p.preparation_id else None,
        "weight_kg": str(p.weight_kg),
        "pack_weight_kg": str(p.pack_weight_kg) if p.pack_weight_kg is not None else None,
        "length_cm": str(p.length_cm) if p.length_cm is not None else None,
        "width_cm": str(p.width_cm) if p.width_cm is not None else None,
        "height_cm": str(p.height_cm) if p.height_cm is not None else None,
        "weight_captured": p.weight_captured,
        "allowed_entities": list(p.allowed_entities or []),
        "active": p.active,
        "batches": s.get("batches", 0),
        "units_in_stock": s.get("units", 0),
        "reach": market or {"distributors": 0, "wholesalers": 0, "retailers": 0},
        "created": p.created.isoformat() if p.created else None,
    }


def list_products(manufacturer, data):
    from manufacturers.models import ManufacturerBatches
    from products.models import Products

    qs = Products.objects.filter(manufacturer=manufacturer).select_related("category", "sub_category", "preparation").order_by("title")
    q = str(data.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(title__icontains=q) | Q(bar_code__iexact=q) | Q(packaging__icontains=q))
    scope = str(data.get("scope") or "ALL").upper()
    if scope == "ACTIVE":
        qs = qs.filter(active=True)
    elif scope == "INACTIVE":
        qs = qs.filter(active=False)
    elif scope == "NO_WEIGHT":
        qs = qs.filter(weight_captured=False)
    products = list(qs[:2000])
    ids = [p.id for p in products]
    stock = {
        r["product_id"]: {"batches": r["n"], "units": r["units"] or 0}
        for r in ManufacturerBatches.objects.filter(entity=manufacturer, product_id__in=ids, current_quantity__gt=0)
        .values("product_id").annotate(n=Count("id"), units=Sum("current_quantity"))
    }
    market = reach(ids)
    return [product_out(p, stock.get(p.id), market.get(p.id)) for p in products]


def save_product(manufacturer, user, data):
    """
    SaveProduct {product?, title, category, sub_category?, units_per_pack, packaging?, bar_code?,
    description?, is_vatable?, is_pom?, preparation? (pharmaceutical manufacturers),
    weight_kg, pack_weight_kg?, length_cm?, width_cm?, height_cm?, allowed_entities?, active?,
    sold_in_parts / measure / content_per_unit / part_size / part_label?}.
    """
    from authentication.models import Categories, SubCategories
    from drugs.models import Preparation
    from products.models import Products
    from products.product_utils import validate_weights
    from products.units_admin import apply_parts_settings

    errors = []
    product = None
    if data.get("product"):
        product = Products.objects.filter(id=data["product"], manufacturer=manufacturer).first()
        if not product:
            return ["Product not found among your products"], None
    creating = product is None

    title = str(data.get("title") if "title" in data else (product.title if product else "")).strip()
    if not title:
        errors.append("Give the product a name")
    category = None
    if "category" in data or creating:
        category = Categories.objects.filter(id=data.get("category") or None).first() if data.get("category") else None
        if not category:
            errors.append("Pick the category")
    sub_category = None
    if data.get("sub_category"):
        sub_category = SubCategories.objects.filter(id=data["sub_category"]).first()
        if not sub_category:
            errors.append("Pick a valid sub-category")
        elif category and getattr(sub_category, "category_id", None) not in (None, category.id):
            errors.append("That sub-category belongs to another category")
    units = None
    if "units_per_pack" in data or creating:
        try:
            units = int(str(data.get("units_per_pack")))
            if units < 1:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Enter how many units are in one pack (1 or more)")
    preparation = None
    pharma = manufacturer.entity_type == "PharmaceuticalManufacturer"
    if data.get("preparation"):
        if not pharma:
            errors.append("Only pharmaceutical manufacturers make medicines")
        else:
            preparation = Preparation.objects.filter(id=data["preparation"]).first()
            if not preparation:
                errors.append("Pick a valid drug preparation")
    bar_code = str(data.get("bar_code") if "bar_code" in data else (product.bar_code if product else "") or "").strip()
    if bar_code:
        clash = Products.objects.filter(bar_code=bar_code).exclude(id=getattr(product, "id", None)).exclude(bar_code="").first()
        if clash:
            errors.append(f"Barcode {bar_code} is already used by {clash.title}")
    weight_errors, weights = validate_weights(data, required=creating)
    errors += weight_errors
    allowed = None
    if "allowed_entities" in data:
        valid = set(EntityType.values())
        allowed = [e for e in (data.get("allowed_entities") or []) if e in valid]
        if (preparation or (product and product.preparation_id and "preparation" not in data)) and any(e not in PHARMA_ENTITY_TYPES for e in allowed):
            errors.append("Medicines can only be stocked by pharmaceutical businesses")
    if errors:
        return errors, None

    try:
        with transaction.atomic():
            if creating:
                product = Products(manufacturer=manufacturer, owner=user, entity=manufacturer, title=title)
            product.title = title[:100]
            if category is not None:
                product.category = category
            if "sub_category" in data:
                product.sub_category = sub_category
            if units is not None:
                product.units_per_pack = units
            if "packaging" in data:
                product.packaging = str(data.get("packaging") or "")[:100]
            if "bar_code" in data or creating:
                product.bar_code = bar_code[:256]
            if "description" in data:
                product.description = str(data.get("description") or "")
            if "is_vatable" in data:
                product.is_vatable = "true" if _bool(data.get("is_vatable")) else "false"
            if "is_pom" in data:
                product.is_pom = _bool(data.get("is_pom"))
            if "preparation" in data:
                product.preparation = preparation
            if "active" in data:
                product.active = _bool(data.get("active"))
            for key, value in weights.items():
                setattr(product, key, value)
            if allowed is not None:
                product.allowed_entities = allowed
            elif creating:
                product.allowed_entities = PHARMA_ENTITY_TYPES if preparation else GENERAL_ENTITY_TYPES
            parts_errors = apply_parts_settings(product, data)
            if parts_errors:
                raise ValueError("; ".join(parts_errors))
            product.save()
    except IntegrityError:
        return [f"You already have a product called {title} with {units or product.units_per_pack} per pack"], None
    except ValueError as e:
        return [str(e)], None
    return [], product


def lookups(manufacturer):
    """Categories, sub-categories and (pharmaceutical manufacturers) drug preparations for the product form."""
    from authentication.models import Categories, SubCategories

    cats = [{"id": str(c.id), "title": c.title, "class": c.category_class} for c in Categories.objects.order_by("title")]
    subs = [{"id": str(s.id), "title": s.title, "category": str(s.category_id) if s.category_id else None} for s in SubCategories.objects.order_by("title")[:2000]]
    return {"categories": cats, "sub_categories": subs, "pharmaceutical": manufacturer.entity_type == "PharmaceuticalManufacturer"}


def search_preparations(q):
    from drugs.models import Preparation

    q = str(q or "").strip()
    if len(q) < 2:
        return []
    return [{"id": str(p.id), "title": str(p)} for p in Preparation.objects.filter(title__icontains=q).order_by("title")[:30]]
