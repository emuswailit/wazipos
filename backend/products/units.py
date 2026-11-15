# products/units.py
#
# Whole units and parts — one place for the arithmetic, used everywhere stock
# moves (retailer & wholesaler receipts, customer & retailer order lines, the
# bar and restaurant supplies).
#
# A product may be "sold in parts" (Products.sold_in_parts):
#   measure          VOLUME (ml) · MASS (g) · COUNT (pieces)
#   content_per_unit what one whole unit holds, in the base unit
#                    (750 for a 750 ml bottle, 50000 for a 50 kg bag, 30 for a tray)
#   part_size        one part, in the base unit (25 ml tot, 1000 g = 1 kg, 1 piece)
#   part_label       what a part is called ("tot", "kg", "egg", "glass")
#
# Stock is kept as today — WHOLE (sealed) units in current_unit_quantity — plus
# open_content: what's left in the one opened unit (base units). Selling a whole
# unit takes a sealed one; selling parts takes from the open unit first and
# opens a sealed unit when it runs short. Returns put content back and re-seal
# whole units when the open unit fills up.

from decimal import ROUND_DOWN, Decimal

FULL, PART = "FULL", "PART"
SALE_UNITS = (FULL, PART)
MEASURES = {"VOLUME": "ml", "MASS": "g", "COUNT": "piece"}
# Friendly unit names -> (measure, base units)
UNIT_FACTORS = {
    "ml": ("VOLUME", 1), "millilitre": ("VOLUME", 1), "cl": ("VOLUME", 10), "l": ("VOLUME", 1000), "litre": ("VOLUME", 1000),
    "g": ("MASS", 1), "gram": ("MASS", 1), "kg": ("MASS", 1000), "kilogram": ("MASS", 1000),
    "piece": ("COUNT", 1), "pc": ("COUNT", 1),
}


class InsufficientStock(Exception):
    pass


def D(v, default="0"):
    try:
        return Decimal(str(v if v not in (None, "") else default))
    except Exception:
        return Decimal(default)


def fmt(v) -> str:
    """Plain number text: 30, 2.5, 0.25 (never 3E+1)."""
    d = D(v)
    t = format(d.quantize(Decimal("0.001"), rounding=ROUND_DOWN), "f")
    return t.rstrip("0").rstrip(".") if "." in t else t


def _plural(word, n) -> str:
    return word if D(n) == 1 or not word or word.endswith("s") or word in ("ml", "g", "kg", "l", "cl") else word + "s"


def sells_in_parts(product) -> bool:
    return bool(
        product is not None
        and getattr(product, "sold_in_parts", False)
        and D(getattr(product, "content_per_unit", 0)) > 0
        and D(getattr(product, "part_size", 0)) > 0
    )


def content_per_unit(product) -> Decimal:
    return D(getattr(product, "content_per_unit", 0)) if sells_in_parts(product) else Decimal("1")


def part_size(product) -> Decimal:
    return D(getattr(product, "part_size", 0)) if sells_in_parts(product) else Decimal("1")


def parts_per_unit(product) -> Decimal:
    return (content_per_unit(product) / part_size(product)) if sells_in_parts(product) else Decimal("1")


def unit_label(product) -> str:
    return (getattr(product, "packaging", "") or "unit").strip().lower() or "unit"


def part_label(product) -> str:
    return (getattr(product, "part_label", "") or MEASURES.get(getattr(product, "measure", ""), "part")).strip()


def content_needed(product, sale_unit, quantity) -> Decimal:
    """Base units a sale takes: whole units × content, or parts × part size."""
    q = D(quantity)
    if str(sale_unit or FULL).upper() == PART:
        if not sells_in_parts(product):
            raise InsufficientStock("This product isn't sold in parts")
        return q * part_size(product)
    return q * content_per_unit(product)


def available_content(full_units, open_content, product) -> Decimal:
    return D(full_units) * content_per_unit(product) + (D(open_content) if sells_in_parts(product) else Decimal("0"))


def can_take(full_units, open_content, product, sale_unit, quantity) -> bool:
    if str(sale_unit or FULL).upper() == FULL:
        return D(full_units) >= D(quantity)
    return available_content(full_units, open_content, product) >= content_needed(product, PART, quantity)


def take(full_units, open_content, product, sale_unit, quantity):
    """
    New (full_units, open_content) after a sale. Whole units come from sealed
    stock; parts come from the open unit, opening sealed units as needed.
    Raises InsufficientStock.
    """
    full, open_ = int(D(full_units)), D(open_content)
    if str(sale_unit or FULL).upper() == FULL:
        q = int(D(quantity))
        if q > full:
            raise InsufficientStock(f"Only {full} {unit_label(product)}(s) in stock")
        return full - q, open_
    need = content_needed(product, PART, quantity)
    cpu = content_per_unit(product)
    while open_ < need:
        if full <= 0:
            raise InsufficientStock(f"Not enough in stock — {describe(full_units, open_content, product)} left")
        full -= 1
        open_ += cpu
    return full, open_ - need


def give_back(full_units, open_content, product, sale_unit, quantity):
    """Reverse a sale (void / cancel / return)."""
    full, open_ = int(D(full_units)), D(open_content)
    if str(sale_unit or FULL).upper() == FULL:
        return full + int(D(quantity)), open_
    open_ += content_needed(product, PART, quantity)
    cpu = content_per_unit(product)
    while cpu > 0 and open_ >= cpu:
        open_ -= cpu
        full += 1
    return full, open_


def describe(full_units, open_content, product) -> str:
    """'11 bottles + 14 tots', '3 bags + 23 kg', '40 packs'."""
    full = int(D(full_units))
    unit = unit_label(product)
    text = f"{full} {unit}{'' if full == 1 else 's'}"
    if sells_in_parts(product) and D(open_content) > 0:
        parts = D(open_content) / part_size(product)
        text += f" + {fmt(parts)} {_plural(part_label(product), parts)}"
    return text


def breakdown(full_units, open_content, product) -> dict:
    """For the apps: whole units, what's in the open unit, totals in parts."""
    in_parts = sells_in_parts(product)
    open_ = D(open_content) if in_parts else Decimal("0")
    return {
        "sold_in_parts": in_parts,
        "unit_label": unit_label(product),
        "part_label": part_label(product) if in_parts else None,
        "parts_per_unit": fmt(parts_per_unit(product)) if in_parts else None,
        "full_units": int(D(full_units)),
        "open_parts": fmt(open_ / part_size(product)) if in_parts else "0",
        "total_parts": fmt(available_content(full_units, open_, product) / part_size(product)) if in_parts else None,
        "label": describe(full_units, open_, product),
    }


def product_parts_out(product) -> dict:
    """The product's part settings, for forms and pickers."""
    return {
        "sold_in_parts": sells_in_parts(product),
        "measure": getattr(product, "measure", None),
        "content_per_unit": fmt(getattr(product, "content_per_unit", 0)) if product else None,
        "part_size": fmt(getattr(product, "part_size", 0)) if product else None,
        "part_label": getattr(product, "part_label", None),
        "parts_per_unit": fmt(parts_per_unit(product)) if sells_in_parts(product) else None,
    }


# ---------------------------------------------------------------- receipts

def take_from_receipt(receipt, sale_unit, quantity, save=True):
    """Apply a sale to a retailer / wholesaler receipt (current_unit_quantity + open_content)."""
    product = receipt.product
    full, open_ = take(receipt.current_unit_quantity or 0, getattr(receipt, "open_content", 0) or 0, product, sale_unit, quantity)
    receipt.current_unit_quantity = full
    if hasattr(receipt, "open_content"):
        receipt.open_content = open_
    if save:
        receipt.save(update_fields=["current_unit_quantity", "open_content"] if hasattr(receipt, "open_content") else ["current_unit_quantity"])
    return receipt


def give_back_to_receipt(receipt, sale_unit, quantity, save=True):
    product = receipt.product
    full, open_ = give_back(receipt.current_unit_quantity or 0, getattr(receipt, "open_content", 0) or 0, product, sale_unit, quantity)
    receipt.current_unit_quantity = full
    if hasattr(receipt, "open_content"):
        receipt.open_content = open_
    if save:
        receipt.save(update_fields=["current_unit_quantity", "open_content"] if hasattr(receipt, "open_content") else ["current_unit_quantity"])
    return receipt


def line_quantity(item):
    """(sale_unit, quantity) of an order line: whole units incl. free bonus units, or parts."""
    unit = str(getattr(item, "sale_unit", FULL) or FULL).upper()
    if unit == PART:
        return PART, D(getattr(item, "part_quantity", 0))
    total = getattr(item, "total_quantity", None)
    if total in (None, 0):
        total = getattr(item, "purchased_quantity", None) or getattr(item, "quantity", 0)
    return FULL, D(total)
