# analytics/utils/domains.py

"""
Tier and domain helpers for the analytics engine.

Tier is what side of the supply chain an entity sits on:
    WHOLESALER  — holds bulk inventory, sells to retailers
    RETAILER    — holds shop inventory, sells to end customers

Domain is the vertical the entity operates in:
    pharma      — pharmaceutical
    general     — general merchandise

A single entity_type maps to exactly one tier and one domain.
"""

from core.constants import EntityType


# =====================================================================
# Tier groups
# =====================================================================

WHOLESALER_TYPES = {
    EntityType.GENERAL_WHOLESALER.value,
    EntityType.PHARMACEUTICAL_WHOLESALER.value,
}

RETAILER_TYPES = {
    EntityType.GENERAL_RETAILER.value,
    EntityType.PHARMACEUTICAL_RETAILER.value,
}


def tier_of(entity_type: str) -> str | None:
    """
    Return 'WHOLESALER', 'RETAILER', or None if not inventory-relevant.
    """
    if entity_type in WHOLESALER_TYPES:
        return "WHOLESALER"
    if entity_type in RETAILER_TYPES:
        return "RETAILER"
    return None


def is_wholesaler(entity_type: str) -> bool:
    return entity_type in WHOLESALER_TYPES


def is_retailer(entity_type: str) -> bool:
    return entity_type in RETAILER_TYPES


# =====================================================================
# Domain groups
# =====================================================================

PHARMA_ENTITY_TYPES = {
    EntityType.PHARMACEUTICAL_WHOLESALER.value,
    EntityType.PHARMACEUTICAL_RETAILER.value,
    EntityType.PHARMACEUTICAL_DISTRIBUTOR.value,
    EntityType.PHARMACEUTICAL_MANUFACTURER.value,
}

GENERAL_ENTITY_TYPES = {
    EntityType.GENERAL_WHOLESALER.value,
    EntityType.GENERAL_RETAILER.value,
    EntityType.GENERAL_DISTRIBUTOR.value,
    EntityType.GENERAL_MANUFACTURER.value,
}


def domain_of(entity_type: str) -> str:
    """Return 'pharma' | 'general' | 'other'."""
    if entity_type in PHARMA_ENTITY_TYPES:
        return "pharma"
    if entity_type in GENERAL_ENTITY_TYPES:
        return "general"
    return "other"


def is_pharma(entity_type: str) -> bool:
    return entity_type in PHARMA_ENTITY_TYPES


def is_general(entity_type: str) -> bool:
    return entity_type in GENERAL_ENTITY_TYPES


# =====================================================================
# Queryset filters
# =====================================================================

def filter_snapshots_by_domain(qs, domain: str):
    """
    Filter an InventorySnapshot queryset (or any queryset that FKs to
    entity with entity_type) to a domain.
    """
    if domain == "pharma":
        return qs.filter(entity__entity_type__in=PHARMA_ENTITY_TYPES)
    if domain == "general":
        return qs.filter(entity__entity_type__in=GENERAL_ENTITY_TYPES)
    if domain == "other":
        return qs.exclude(
            entity__entity_type__in=PHARMA_ENTITY_TYPES | GENERAL_ENTITY_TYPES
        )
    raise ValueError(f"Unknown domain: {domain}")


# =====================================================================
# Product distribution policy
# =====================================================================

def entity_type_is_allowed(entity_type: str, allowed_entities) -> bool:
    """
    Check whether an entity_type is in a product's allowed_entities.
    Empty or None allowed_entities = no restriction.
    """
    if not allowed_entities:
        return True
    return entity_type in allowed_entities