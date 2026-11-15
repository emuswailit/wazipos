# products/units_admin.py
#
# Validating "sold in parts" settings on a product (see products/units.py).
# Accepts friendly input from the product form:
#   sold_in_parts: true
#   measure: VOLUME | MASS | COUNT
#   content_per_unit: 750, content_unit: "ml"   (or 50 + "kg", 30 + "piece")
#   part_size: 25, part_unit: "ml"               (or 1 + "kg", 1 + "piece")
#   part_label: "tot"
# and stores everything in base units (ml / g / pieces).

from decimal import Decimal

from products.units import MEASURES, UNIT_FACTORS, D


def _base(value, unit, measure):
    """Value in base units (ml / g / pieces) from a friendly unit."""
    unit = str(unit or MEASURES.get(measure, "")).strip().lower()
    fam, factor = UNIT_FACTORS.get(unit, (measure, 1))
    if fam != measure:
        raise ValueError(f"'{unit}' isn't a unit of {measure.lower()}")
    return D(value) * Decimal(factor)


def apply_parts_settings(product, details):
    """Set the parts fields from a form; returns a list of errors (nothing saved here)."""
    if "sold_in_parts" not in details:
        return []
    on = str(details.get("sold_in_parts")).lower() in ("true", "1", "yes")
    if not on:
        product.sold_in_parts = False
        return []
    measure = str(details.get("measure") or "").upper()
    if measure not in MEASURES:
        return ["Pick how parts are measured: volume, mass or count"]
    try:
        content = _base(details.get("content_per_unit"), details.get("content_unit"), measure)
        part = _base(details.get("part_size"), details.get("part_unit"), measure)
    except ValueError as e:
        return [str(e)]
    if content <= 0:
        return ["Enter what one whole unit holds (e.g. 750 ml, 50 kg, 30 pieces)"]
    if part <= 0:
        return ["Enter the size of one part (e.g. 25 ml, 1 kg, 1 piece)"]
    if part > content:
        return ["A part can't be bigger than the whole unit"]
    product.sold_in_parts = True
    product.measure = measure
    product.content_per_unit = content
    product.part_size = part
    product.part_label = (str(details.get("part_label") or "").strip() or str(details.get("part_unit") or MEASURES[measure]).strip())[:32]
    return []
