# insurance/pricing.py — WaziPOS Cover: the pricing engine.
#
# Five micro-policies built for SMEs: small, pay-as-you-go premiums (per parcel, per
# duty day, per month, per credit sale) instead of one big annual bill.
#
#   SAFE_PARCEL   goods on the way to you — theft, accident, loss, fire in transit
#   RIDER_SHIELD  a rider's own accident cover — per duty day, week or month
#   DUKA_COVER    shop stock and cash — fire, lightning, burglary, cash robbery
#   TRADE_GUARD   a credit sale the customer never pays — 80% back
#   TILL_GUARD    staff theft and mobile-money fraud (SIM swap, fake M-Pesa, reversals)
#
# Everything here is a pure function of the inputs: quote(product, inputs) returns the
# premium, what is covered, the excess (deductible), and worked examples of what you'd
# be paid for each risk. claim_estimate() applies the same rules to a real loss.
# Rates live in RATES so they can be tuned with the underwriting partner.

import math
from decimal import Decimal

PRODUCTS = ("SAFE_PARCEL", "RIDER_SHIELD", "DUKA_COVER", "TRADE_GUARD", "TILL_GUARD")


class QuoteError(Exception):
    def __init__(self, errors):
        super().__init__(errors[0] if errors else "Invalid quote")
        self.errors = errors


RATES = {
    "SAFE_PARCEL": {
        # % of the goods value, by how it travels
        "mode_rate": {"FOOT": 0.40, "BICYCLE": 0.50, "MOTORBIKE": 0.70, "CAR": 0.50, "VAN": 0.50, "TRUCK": 0.60, "COURIER": 0.90, "LOCAL": 0.60},
        "category_factor": {"GENERAL": 1.0, "FOOD": 1.1, "PHARMA": 1.2, "FRAGILE": 1.4, "ELECTRONICS": 1.6},
        "distance_free_km": 10, "distance_step_km": 25, "distance_step_rate": 0.05, "distance_max_rate": 0.50,
        "min_premium": 15, "max_value": 1_000_000,
        "no_excess_below": 2_000, "excess_pct": 5, "excess_min": 100, "excess_max": 5_000,
    },
    "RIDER_SHIELD": {
        "day_price": {"FOOT": 10, "BICYCLE": 15, "MOTORBIKE": 25, "CAR": 20, "VAN": 25, "TRUCK": 30, "COURIER": 20},
        "plan_days": {"DAY": 1, "WEEK": 7, "MONTH": 30},
        "plan_paid_days": {"DAY": 1, "WEEK": 6, "MONTH": 22},  # a week = 6 days' price, a month = 22
        "death": 250_000, "disability": 250_000, "medical": 30_000, "medical_excess": 500,
        "hospital_cash_per_night": 1_000, "hospital_max_nights": 10,
    },
    "DUKA_COVER": {
        "stock_annual_pct": 0.60,
        "sector_factor": {"GENERAL": 1.0, "FMCG": 1.0, "PHARMA": 1.2, "FOOD": 1.3, "ELECTRONICS": 1.8},
        "cash_levels": (5_000, 10_000, 20_000, 50_000), "cash_annual_pct": 2.5,
        "security_discount_pct": 10, "shop_guard_discount_pct": 10, "stock_take_discount_pct": 5,
        "min_monthly": 99, "max_stock": 10_000_000,
        "excess_pct": 2.5, "excess_min": 1_000, "excess_max": 20_000, "cash_excess": 500,
    },
    "TRADE_GUARD": {
        "day_bands": ((14, 0.8), (30, 1.5), (60, 2.5), (90, 3.5)),
        "new_buyer_factor": 1.2, "trusted_buyer_factor": 0.85,
        "min_premium": 20, "max_amount": 200_000, "covered_pct": 80, "grace_days": 14,
    },
    "TILL_GUARD": {
        "levels": {50_000: (99, 30), 100_000: (179, 50), 200_000: (299, 80)},  # limit: (base, per staff) per month
        "shop_guard_discount_pct": 15, "excess_pct": 10, "excess_min": 1_000,
        "fake_message_cap_pct": 20,  # fake / reversed M-Pesa payments: up to 20% of the limit per claim
    },
}

LABELS = {
    "SAFE_PARCEL": ("SafeParcel", "Your goods, covered until they're in your hands"),
    "RIDER_SHIELD": ("RiderShield", "Accident cover for every ride, from a few shillings a day"),
    "DUKA_COVER": ("DukaCover", "Stock and cash protected against fire and burglary"),
    "TRADE_GUARD": ("TradeGuard", "Get 80% back when a credit customer doesn't pay"),
    "TILL_GUARD": ("TillGuard", "Staff theft and mobile-money fraud cover"),
}


# ------------------------------------------------------------------ helpers


def _num(inputs, key, *, required=False, minimum=0, maximum=None, label=None, default=0):
    raw = inputs.get(key)
    if raw in (None, ""):
        if required:
            raise QuoteError([f"{label or key.replace('_', ' ').capitalize()} is required"])
        return default
    try:
        v = float(str(raw).replace(",", ""))
    except ValueError:
        raise QuoteError([f"{label or key} must be a number"])
    if v < minimum:
        raise QuoteError([f"{label or key} must be at least {minimum:,.0f}"])
    if maximum is not None and v > maximum:
        raise QuoteError([f"{label or key} can be at most {maximum:,.0f}"])
    return v


def _choice(inputs, key, options, default):
    v = str(inputs.get(key) or default).upper()
    if v not in options:
        raise QuoteError([f"Unknown {key.replace('_', ' ')} '{v}'"])
    return v


def _bool(inputs, key):
    return str(inputs.get(key) or "").lower() in ("1", "true", "yes", "on")


def up(value, step=5):
    """Round a premium UP to the next `step` shillings (premiums are never fractional)."""
    return int(math.ceil(max(0.0, value) / step) * step)


def kes(v):
    return f"KES {v:,.0f}"


def _scenario(risk, loss, payable, note=""):
    return {"risk": risk, "loss": round(loss), "you_get": max(0, round(payable)), "note": note}


# ------------------------------------------------------------------ SafeParcel


def _excess_parcel(r, value, loss):
    if value < r["no_excess_below"]:
        return 0
    return min(r["excess_max"], max(r["excess_min"], loss * r["excess_pct"] / 100))


def quote_safe_parcel(inputs):
    r = RATES["SAFE_PARCEL"]
    value = _num(inputs, "value", required=True, minimum=100, maximum=r["max_value"], label="Goods value")
    mode = _choice(inputs, "mode", r["mode_rate"], "LOCAL")
    category = _choice(inputs, "category", r["category_factor"], "GENERAL")
    distance = _num(inputs, "distance_km", maximum=2_000, label="Distance")
    extra_km = max(0.0, distance - r["distance_free_km"])
    distance_rate = min(r["distance_max_rate"], math.ceil(extra_km / r["distance_step_km"]) * r["distance_step_rate"]) if extra_km else 0.0
    rate = (r["mode_rate"][mode] + distance_rate) * r["category_factor"][category]
    premium = max(r["min_premium"], up(value * rate / 100))
    full_excess = _excess_parcel(r, value, value)
    partial = value * 0.3
    return {
        "premium": premium,
        "period": "this delivery",
        "cover": round(value),
        "excess": round(full_excess),
        "excess_text": "No excess" if value < r["no_excess_below"] else f"{r['excess_pct']}% of the loss (min {kes(r['excess_min'])}, max {kes(r['excess_max'])})",
        "breakdown": [
            f"{r['mode_rate'][mode]:.2f}% for {mode.lower()} delivery",
            *( [f"+{distance_rate:.2f}% for {distance:.0f} km"] if distance_rate else [] ),
            *( [f"× {r['category_factor'][category]} for {category.lower()} goods"] if category != "GENERAL" else [] ),
            f"= {rate:.2f}% of {kes(value)} (minimum {kes(r['min_premium'])})",
        ],
        "covers": ["Theft or robbery on the way", "Accident damage", "Parcel lost by the rider or courier", "Fire while in transit"],
        "excludes": ["Poor packaging", "The seller sending the wrong item", "Delays", "Goods the law forbids"],
        "scenarios": [
            _scenario("Stolen on the way", value, value - full_excess),
            _scenario("Lost by the courier", value, value - full_excess),
            _scenario("30% damaged in an accident", partial, partial - _excess_parcel(r, value, partial)),
        ],
        "claim_window": "Report within 48 hours of delivery (or of the delivery failing).",
    }


# ------------------------------------------------------------------ RiderShield


def quote_rider_shield(inputs):
    r = RATES["RIDER_SHIELD"]
    mode = _choice(inputs, "mode", r["day_price"], "MOTORBIKE")
    plan = _choice(inputs, "plan", r["plan_days"], "DAY")
    day = r["day_price"][mode]
    premium = day * r["plan_paid_days"][plan]
    full = day * r["plan_days"][plan]
    return {
        "premium": premium,
        "period": {"DAY": "today", "WEEK": "7 days", "MONTH": "30 days"}[plan],
        "days": r["plan_days"][plan],
        "saving": full - premium,
        "cover": r["death"],
        "excess": r["medical_excess"],
        "excess_text": f"{kes(r['medical_excess'])} on medical bills only",
        "breakdown": [f"{kes(day)} a day for {mode.lower()} riders", f"{plan.lower()} plan: {r['plan_paid_days'][plan]} paid day(s) for {r['plan_days'][plan]} day(s) of cover"],
        "covers": [
            f"Accidental death — {kes(r['death'])} to your family",
            f"Permanent disability — up to {kes(r['disability'])}",
            f"Medical bills after an accident — up to {kes(r['medical'])}",
            f"Hospital cash — {kes(r['hospital_cash_per_night'])} a night, up to {r['hospital_max_nights']} nights",
        ],
        "excludes": ["Riding drunk or without a licence", "Racing", "Injuries not caused by an accident"],
        "scenarios": [
            _scenario("Hospital bill of KES 18,000", 18_000, 18_000 - r["medical_excess"]),
            _scenario("3 nights in hospital", 3 * r["hospital_cash_per_night"], 3 * r["hospital_cash_per_night"]),
            _scenario("Permanent disability", r["disability"], r["disability"]),
        ],
        "claim_window": "Report within 7 days of the accident, with the hospital papers.",
    }


# ------------------------------------------------------------------ DukaCover


def _duka_excess(r, loss):
    return min(r["excess_max"], max(r["excess_min"], loss * r["excess_pct"] / 100))


def quote_duka_cover(inputs):
    r = RATES["DUKA_COVER"]
    stock = _num(inputs, "stock_value", required=True, minimum=10_000, maximum=r["max_stock"], label="Stock value")
    sector = _choice(inputs, "sector", r["sector_factor"], "GENERAL")
    cash = _num(inputs, "cash_limit", default=r["cash_levels"][0])
    if cash not in r["cash_levels"]:
        raise QuoteError([f"Cash cover must be one of {', '.join(kes(c) for c in r['cash_levels'])}"])
    discounts = []
    pct = 0
    if _bool(inputs, "secured"):
        pct += r["security_discount_pct"]
        discounts.append(f"-{r['security_discount_pct']}% grilled doors / night guard")
    if _bool(inputs, "shop_guard"):
        pct += r["shop_guard_discount_pct"]
        discounts.append(f"-{r['shop_guard_discount_pct']}% WaziPOS shop guard on")
    if _bool(inputs, "recent_stock_take"):
        pct += r["stock_take_discount_pct"]
        discounts.append(f"-{r['stock_take_discount_pct']}% stock take in the last 90 days")
    stock_year = stock * r["stock_annual_pct"] / 100 * r["sector_factor"][sector] * (1 - pct / 100)
    cash_year = cash * r["cash_annual_pct"] / 100
    monthly = max(r["min_monthly"], up((stock_year + cash_year) / 12, 10))
    burglary = stock * 0.4
    return {
        "premium": monthly,
        "period": "per month",
        "cover": round(stock + cash),
        "excess": round(_duka_excess(r, stock)),
        "excess_text": f"{r['excess_pct']}% of the loss (min {kes(r['excess_min'])}, max {kes(r['excess_max'])}); cash {kes(r['cash_excess'])}",
        "breakdown": [
            f"Stock {kes(stock)} × {r['stock_annual_pct']}% a year" + (f" × {r['sector_factor'][sector]} ({sector.lower()})" if r["sector_factor"][sector] != 1 else ""),
            *discounts,
            f"Cash {kes(cash)} × {r['cash_annual_pct']}% a year",
            f"÷ 12 = {kes(monthly)} a month (minimum {kes(r['min_monthly'])})",
        ],
        "covers": ["Fire and lightning", "Burglary with forced entry", f"Cash in the till or on the way to the bank — up to {kes(cash)}", "Riot and strike damage"],
        "excludes": ["Stock missing with no break-in (use TillGuard for staff theft)", "Expired or spoilt stock", "Floods", "Declaring less stock than you hold (you're paid in proportion)"],
        "scenarios": [
            _scenario("Fire destroys the shop", stock, stock - _duka_excess(r, stock)),
            _scenario("Break-in, 40% of stock taken", burglary, burglary - _duka_excess(r, burglary)),
            _scenario("Robbed of the day's cash", cash, cash - r["cash_excess"]),
        ],
        "claim_window": "Report to the police and to us within 48 hours.",
    }


# ------------------------------------------------------------------ TradeGuard


def _trade_rate(r, days):
    for limit, rate in r["day_bands"]:
        if days <= limit:
            return rate
    raise QuoteError([f"Credit can be covered for up to {r['day_bands'][-1][0]} days"])


def quote_trade_guard(inputs, buyer_history=None):
    r = RATES["TRADE_GUARD"]
    amount = _num(inputs, "amount", required=True, minimum=500, maximum=r["max_amount"], label="Credit amount")
    days = int(_num(inputs, "days", required=True, minimum=1, maximum=90, label="Credit days"))
    rate = _trade_rate(r, days)
    good, bad = (buyer_history or (0, 0))
    if bad:
        raise QuoteError(["This customer has an unpaid covered credit — TradeGuard can't cover them again yet"])
    factor, who = (r["trusted_buyer_factor"], "trusted customer (paid before)") if good >= 2 else (r["new_buyer_factor"], "new customer") if good == 0 else (1.0, "returning customer")
    premium = max(r["min_premium"], up(amount * rate / 100 * factor))
    covered = amount * r["covered_pct"] / 100
    return {
        "premium": premium,
        "period": f"{days} days of credit",
        "cover": round(covered),
        "excess": round(amount - covered),
        "excess_text": f"You carry {100 - r['covered_pct']}% — we pay {r['covered_pct']}% of what's unpaid",
        "breakdown": [f"{rate}% for {days} days", f"× {factor} for a {who}", f"= {kes(premium)} (minimum {kes(r['min_premium'])})"],
        "covers": [f"The customer doesn't pay by the due date + {r['grace_days']} days", "The customer's business closes or they disappear", "Part payments — we cover 80% of what's still owed"],
        "excludes": ["Disputes about the goods", "Credit given to relatives or your own staff", "Sales already overdue when covered"],
        "scenarios": [
            _scenario("Customer pays nothing", amount, covered),
            _scenario("Customer pays half", amount / 2, amount / 2 * r["covered_pct"] / 100),
        ],
        "claim_window": f"Claim from {r['grace_days']} days after the due date, within 60 days.",
    }


# ------------------------------------------------------------------ TillGuard


def quote_till_guard(inputs):
    r = RATES["TILL_GUARD"]
    staff = int(_num(inputs, "staff_count", required=True, minimum=1, maximum=200, label="Staff"))
    limit = int(_num(inputs, "limit", default=50_000))
    if limit not in r["levels"]:
        raise QuoteError([f"Cover limit must be one of {', '.join(kes(k) for k in r['levels'])}"])
    base, per = r["levels"][limit]
    monthly = base + per * staff
    discount = ""
    if _bool(inputs, "shop_guard"):
        monthly = monthly * (1 - r["shop_guard_discount_pct"] / 100)
        discount = f"-{r['shop_guard_discount_pct']}% WaziPOS shop guard on"
    monthly = up(monthly, 10)
    fake_cap = limit * r["fake_message_cap_pct"] / 100
    exc = lambda loss: max(r["excess_min"], loss * r["excess_pct"] / 100)
    return {
        "premium": monthly,
        "period": "per month",
        "cover": limit,
        "excess": round(exc(limit)),
        "excess_text": f"{r['excess_pct']}% of the loss (min {kes(r['excess_min'])})",
        "breakdown": [f"{kes(base)} for {kes(limit)} of cover", f"+ {kes(per)} × {staff} staff", *( [discount] if discount else [] ), f"= {kes(monthly)} a month"],
        "covers": ["Staff stealing cash or stock (proved by records or a police report)", "SIM-swap fraud on your business number", f"Fake or reversed M-Pesa payments you accepted — up to {kes(fake_cap)}"],
        "excludes": ["Losses with no record or report", "Theft by the owner or partners", "Losses before the cover started"],
        "scenarios": [
            _scenario("Cashier takes KES 30,000", 30_000, min(limit, 30_000) - exc(30_000)),
            _scenario("SIM swap empties the till", limit, limit - exc(limit)),
            _scenario("Fake M-Pesa message, KES 8,000", 8_000, min(fake_cap, 8_000) - exc(8_000)),
        ],
        "claim_window": "Report within 7 days of finding the loss.",
    }


QUOTERS = {
    "SAFE_PARCEL": quote_safe_parcel,
    "RIDER_SHIELD": quote_rider_shield,
    "DUKA_COVER": quote_duka_cover,
    "TRADE_GUARD": quote_trade_guard,
    "TILL_GUARD": quote_till_guard,
}


def quote(product, inputs, **extra):
    if product not in QUOTERS:
        raise QuoteError([f"Unknown cover '{product}'"])
    q = QUOTERS[product](inputs or {}, **extra) if extra else QUOTERS[product](inputs or {})
    name, tagline = LABELS[product]
    q.update({"product": product, "name": name, "tagline": tagline})
    return q


# ------------------------------------------------------------------ claims

INCIDENTS = {
    "SAFE_PARCEL": {"THEFT": "Stolen on the way", "LOST": "Lost in transit", "DAMAGED": "Damaged in an accident", "FIRE": "Fire in transit"},
    "RIDER_SHIELD": {"MEDICAL": "Medical bills after an accident", "HOSPITAL": "Nights in hospital", "DISABILITY": "Permanent disability", "DEATH": "Accidental death"},
    "DUKA_COVER": {"FIRE": "Fire or lightning", "BURGLARY": "Burglary (forced entry)", "CASH": "Cash robbed", "RIOT": "Riot or strike damage"},
    "TRADE_GUARD": {"UNPAID": "Customer didn't pay"},
    "TILL_GUARD": {"STAFF_THEFT": "Staff theft", "SIM_SWAP": "SIM-swap fraud", "FAKE_PAYMENT": "Fake or reversed M-Pesa payment"},
}


def claim_estimate(product, cover, inputs, incident, loss, nights=0):
    """What a claim would pay under the policy's own terms (the assessor confirms)."""
    if incident not in INCIDENTS.get(product, {}):
        raise QuoteError(["Pick what happened"])
    loss = max(0.0, float(loss or 0))
    notes = []
    if product == "SAFE_PARCEL":
        r = RATES[product]
        value = float(inputs.get("value") or cover)
        base = min(loss, value)
        excess = _excess_parcel(r, value, base)
        payable = base - excess
    elif product == "RIDER_SHIELD":
        r = RATES[product]
        if incident == "MEDICAL":
            base, excess = min(loss, r["medical"]), r["medical_excess"]
        elif incident == "HOSPITAL":
            n = min(int(nights or 0), r["hospital_max_nights"])
            base, excess, loss = n * r["hospital_cash_per_night"], 0, n * r["hospital_cash_per_night"]
            notes.append(f"{n} night(s) × {kes(r['hospital_cash_per_night'])}")
        elif incident == "DISABILITY":
            base, excess = r["disability"], 0
            notes.append("Paid in full for permanent total disability; partial disability is a share of this.")
        else:
            base, excess = r["death"], 0
            notes.append("Paid to the next of kin.")
        payable = base - excess
    elif product == "DUKA_COVER":
        r = RATES[product]
        if incident == "CASH":
            cash = float(inputs.get("cash_limit") or 0)
            base, excess = min(loss, cash), r["cash_excess"]
        else:
            stock = float(inputs.get("stock_value") or 0)
            base = min(loss, stock)
            excess = _duka_excess(r, base)
            notes.append("If the stock you actually held was worth more than you declared, the payout is reduced in proportion.")
        payable = base - excess
    elif product == "TRADE_GUARD":
        r = RATES[product]
        amount = float(inputs.get("amount") or 0)
        base = min(loss, amount)
        excess = base * (100 - r["covered_pct"]) / 100
        payable = base - excess
        notes.append(f"{r['covered_pct']}% of what's still unpaid.")
    else:  # TILL_GUARD
        r = RATES[product]
        limit = float(inputs.get("limit") or cover)
        cap = limit * r["fake_message_cap_pct"] / 100 if incident == "FAKE_PAYMENT" else limit
        base = min(loss, cap)
        excess = max(r["excess_min"], base * r["excess_pct"] / 100) if base else 0
        payable = base - excess
    return {"loss": round(loss), "covered": round(base), "excess": round(excess), "payable": max(0, round(payable)), "notes": notes}


def to_decimal(v):
    return Decimal(str(round(float(v or 0), 2)))
