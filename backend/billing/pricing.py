# billing/pricing.py — WaziPOS Tokens: what a unit of work costs.
#
# One token = KES 1. Businesses buy tokens in packs (bigger packs carry bonus
# tokens) and every order they process uses a few, priced on the order's value:
#
#   tokens = clamp(value x rate, min, max) x volume discount
#
#   * rate / min / max depend on the kind of order (a KES 80 duka sale and a
#     KES 400,000 distributor invoice are not the same amount of work or value);
#   * the volume discount grows with the number of orders the business has
#     processed this month, so busy shops pay less per order;
#   * a monthly ceiling per kind of business: past it, orders are free for the
#     rest of the month. Nobody pays more than a busy shop's fair monthly fee.
#
# The first month (from WaziPOS approving the business) is a free trial: orders
# are recorded at 0 tokens with what they would have cost, so the owner sees
# their real monthly bill before paying anything.
#
# Everything here is deterministic and easy to explain on the billing screen.

from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings

TOKEN_KES = Decimal("1")  # price of one token
TRIAL_DAYS = int(getattr(settings, "BILLING_TRIAL_DAYS", 30))
# Orders may take the wallet slightly below zero, so a sale is never blocked at
# the till; past this the business must top up (only after a first top-up).
OVERDRAFT_TOKENS = Decimal(str(getattr(settings, "BILLING_OVERDRAFT_TOKENS", 50)))
LOW_BALANCE_TOKENS = Decimal(str(getattr(settings, "BILLING_LOW_BALANCE_TOKENS", 100)))

TWO = Decimal("0.01")

# meter: (label, rate on value, min tokens, max tokens)
METERS = {
    "RETAIL_SALE": ("Shop / pharmacy sale", Decimal("0.004"), Decimal("1"), Decimal("40")),
    "FOOD_ORDER": ("Restaurant order", Decimal("0.005"), Decimal("1"), Decimal("30")),
    "ROOM_STAY": ("Hotel stay", Decimal("0.01"), Decimal("10"), Decimal("250")),
    "WHOLESALE_SALE": ("Wholesale order (to a retailer)", Decimal("0.003"), Decimal("2"), Decimal("150")),
    "DISTRIBUTOR_SALE": ("Distributor order (to a wholesaler)", Decimal("0.0025"), Decimal("5"), Decimal("300")),
    "MANUFACTURER_SALE": ("Manufacturer order (to a distributor)", Decimal("0.002"), Decimal("5"), Decimal("500")),
}

# Orders processed this month -> share of the price paid.
VOLUME_TIERS = (
    (0, Decimal("1.00"), "First 500 orders"),
    (500, Decimal("0.80"), "Orders 501–2,000: 20% off"),
    (2000, Decimal("0.60"), "Beyond 2,000 orders: 40% off"),
)

# Monthly ceiling (tokens) per kind of business; past it, orders are free.
MONTHLY_CAP = {
    "GeneralRetailer": Decimal("3000"),
    "PharmaceuticalRetailer": Decimal("3500"),
    "Restaurant": Decimal("3000"),
    "Hotel": Decimal("6000"),
    "GeneralWholesaler": Decimal("8000"),
    "PharmaceuticalWholesaler": Decimal("9000"),
    "GeneralDistributor": Decimal("15000"),
    "PharmaceuticalDistributor": Decimal("15000"),
    "GeneralManufacturer": Decimal("25000"),
    "PharmaceuticalManufacturer": Decimal("25000"),
}
DEFAULT_CAP = Decimal("3000")

# Kinds of business WaziPOS does not bill: never charged tokens, never blocked by the gate.
BILLING_EXEMPT = {"Publisher", "Church"}

# Packs: (code, label, KES paid, bonus tokens)
PACKS = (
    ("KIANZIO", "Kianzio", Decimal("300"), Decimal("0")),
    ("BIASHARA", "Biashara", Decimal("1000"), Decimal("50")),
    ("DUKA_PLUS", "Duka Plus", Decimal("2500"), Decimal("200")),
    ("JUMLA", "Jumla", Decimal("5000"), Decimal("600")),
    ("TAJIRI", "Tajiri", Decimal("10000"), Decimal("1500")),
)
MIN_CUSTOM_KES = Decimal("100")
MAX_CUSTOM_KES = Decimal("150000")


def q(x) -> Decimal:
    return Decimal(str(x or 0)).quantize(TWO, rounding=ROUND_HALF_UP)


def volume_factor(orders_this_month: int) -> Decimal:
    factor = VOLUME_TIERS[0][1]
    for floor, f, _ in VOLUME_TIERS:
        if orders_this_month >= floor:
            factor = f
    return factor


def price(meter: str, value, orders_this_month: int = 0, first_for_order: bool = True) -> Decimal:
    """Tokens for one payment on an order. A second payment on the same order
    (part payments) pays only the value share, not the minimum again."""
    if meter not in METERS:
        return Decimal("0")
    _, rate, lo, hi = METERS[meter]
    raw = Decimal(str(value or 0)) * rate
    raw = min(max(raw, lo), hi) if first_for_order else min(raw, hi)
    return q(raw * volume_factor(orders_this_month))


def monthly_cap(entity_type: str) -> Decimal:
    return MONTHLY_CAP.get(entity_type or "", DEFAULT_CAP)


def pack(code: str):
    for c, label, kes, bonus in PACKS:
        if c == code:
            return {"code": c, "label": label, "kes": kes, "bonus": bonus, "tokens": kes / TOKEN_KES + bonus}
    return None


def custom_pack(kes) -> dict:
    """Any amount: bonus of the biggest pack it reaches."""
    kes = q(kes)
    bonus = Decimal("0")
    for _, _, pk, pb in PACKS:
        if kes >= pk:
            bonus = (kes * pb / pk).quantize(Decimal("1")) if pk else Decimal("0")
    return {"code": "CUSTOM", "label": "Custom amount", "kes": kes, "bonus": bonus, "tokens": kes / TOKEN_KES + bonus}


def catalogue(entity_type: str) -> dict:
    """The price list shown on the billing screen."""
    return {
        "token_kes": str(TOKEN_KES),
        "trial_days": TRIAL_DAYS,
        "monthly_cap": str(monthly_cap(entity_type)),
        "overdraft": str(OVERDRAFT_TOKENS),
        "meters": [
            {"meter": k, "label": v[0], "rate_pct": str((v[1] * 100).normalize()), "min": str(v[2]), "max": str(v[3])}
            for k, v in METERS.items()
        ],
        "tiers": [{"from_orders": f, "pays_pct": int(p * 100), "label": label} for f, p, label in VOLUME_TIERS],
        "packs": [
            {"code": c, "label": label, "kes": str(kes), "bonus": str(bonus), "tokens": str(kes / TOKEN_KES + bonus)}
            for c, label, kes, bonus in PACKS
        ],
        "custom": {"min": str(MIN_CUSTOM_KES), "max": str(MAX_CUSTOM_KES)},
    }


def meter_for_entity_type(entity_type: str) -> list:
    """Meters that apply to a kind of business (for the screen)."""
    t = entity_type or ""
    if t.endswith("Retailer"):
        return ["RETAIL_SALE"]
    if t == "Restaurant":
        return ["FOOD_ORDER"]
    if t == "Hotel":
        return ["FOOD_ORDER", "ROOM_STAY"]
    if t.endswith("Wholesaler"):
        return ["WHOLESALE_SALE", "RETAIL_SALE"]
    if t.endswith("Distributor"):
        return ["DISTRIBUTOR_SALE"]
    if t.endswith("Manufacturer"):
        return ["MANUFACTURER_SALE"]
    return list(METERS)
