import re
import logging
from django.db.models import Q

logger = logging.getLogger(__name__)

def map_extracted_medications_to_prescription_items(extracted_data, prescription, retailer, user):
    from retailers.models import PrescriptionItems
    from drugs.models import Preparation, Routes, Frequency
    from products.models import Products

    # --- FREQUENCY SYNONYMS MAP ---
    FREQ_SYNONYMS = {
        "once daily": "OD", "one time a day": "OD", "od": "OD", "daily": "OD",
        "twice daily": "BD", "two times a day": "BD", "two times daily": "BD", "bd": "BD", "bid": "BD",
        "thrice daily": "TDS", "three times a day": "TDS", "three times daily": "TDS", "tid": "TDS", "tds": "TDS",
        "four times a day": "QID", "four times daily": "QID", "qid": "QID", "qds": "QID",
    }

    created_items = []
    medications = extracted_data.get("medications", [])

    for med in medications:
        raw_name = med.get("product_name", "").strip()
        if not raw_name:
            continue

        # 1. Clean Name
        clean_name = re.sub(r'\d+\s*(mg|g|ml|mcg|%|tabs|caps|syrup).*$', '', raw_name, flags=re.IGNORECASE).strip()
        search_term = clean_name if clean_name else raw_name

        product = None
        preparation = None
        route = None
        frequency = None

        # 2. Match Drug (Product / Preparation)
        product = Products.objects.filter(
            Q(title__icontains=search_term) | Q(preparation__title__icontains=search_term)
        ).first()
        if product:
            preparation = product.preparation
        else:
            preparation = Preparation.objects.filter(title__icontains=search_term).first()
            if not preparation:
                preparation = Preparation.objects.filter(generics__title__icontains=search_term).first()

        # 3. Match Route
        raw_route = med.get("route", "").strip()
        if raw_route:
            route_mappings = {"po": "oral", "iv": "intravenous", "im": "intramuscular", "sc": "subcutaneous"}
            clean_route = route_mappings.get(raw_route.lower(), raw_route)
            route = Routes.objects.filter(title__icontains=clean_route).first()
            if not route:
                route = Routes.objects.filter(title__icontains=raw_route).first()

        # 4. Match Frequency (Checking Abbreviation, Title, Latin, and Description)
        raw_freq = med.get("frequency", "").strip().lower()
        if raw_freq:
            mapped_freq = FREQ_SYNONYMS.get(raw_freq, raw_freq.upper())
            
            frequency = Frequency.objects.filter(
                Q(abbreviation__iexact=mapped_freq) | 
                Q(abbreviation__iexact=raw_freq) |
                Q(title__icontains=raw_freq) |
                Q(title__icontains=mapped_freq) |
                Q(description__icontains=raw_freq) |     # <--- Added description
                Q(description__icontains=mapped_freq) |  # <--- Added description
                Q(latin__icontains=raw_freq)             # <--- Added latin
            ).first()

            # Final fallback: try finding it by the mapped string (e.g., if title is "TWICE A DAY")
            if not frequency and mapped_freq in ["OD", "BD", "TDS", "QID"]:
                title_lookup = {"OD": "ONCE", "BD": "TWICE", "TDS": "THRICE", "QID": "FOUR"}
                frequency = Frequency.objects.filter(
                    Q(title__icontains=title_lookup[mapped_freq]) |
                    Q(description__icontains=title_lookup[mapped_freq])
                ).first()

        # 5. Create Item
        item = PrescriptionItems.objects.create(
            entity=retailer,
            owner=user,
            prescription=prescription,
            product=product,
            preparation=preparation,
            route=route,
            frequency=frequency,
            prescribed_by=None,
            dose=med.get("dose", "As directed"),
            days=med.get("days") or 1,
            instruction=med.get("instruction", ""),
            required_unit_quantity=1,
        )
        
        logger.info(f"AI Mapped '{raw_name}' -> Freq: {frequency}, Route: {route}")
        created_items.append(item)
        
    return created_items