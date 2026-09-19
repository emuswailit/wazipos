# core/constants.py

from enum import Enum


# =====================================================================
# Existing constants
# =====================================================================

TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)

UNITS_OF_ISSUE_CHOICES = (
    ("Pack", "Pack"),
    ("Piece", "Piece"),
    ("Box", "Box"),
    ("Carton", "Carton"),
    ("Strip", "Strip"),
    ("Bottle", "Bottle"),
    ("Tube", "Tube"),
    ("Sachet", "Sachet"),
)


# =====================================================================
# Entity types
# =====================================================================

class EntityType(Enum):
    """
    All entity types in the system. The `.value` is what's stored
    on `Entities.entity_type` and inside `Products.allowed_entities`.
    """

    BAR = "Bar"
    BANK = "Bank"
    CLINIC = "Clinic"
    DEFAULT = "Default"
    DISPENSARY = "Dispensary"
    GENERAL_DISTRIBUTOR = "GeneralDistributor"
    PHARMACEUTICAL_DISTRIBUTOR = "PharmaceuticalDistributor"
    FARM = "Farm"
    GROCERY = "Grocery"
    HOSPITAL = "Hospital"
    HOTEL = "Hotel"
    INTERNET_SERVICE_PROVIDER = "InternetServiceProvider"
    INSURANCE = "Insurance"
    GENERAL_MANUFACTURER = "GeneralManufacturer"
    PHARMACEUTICAL_MANUFACTURER = "PharmaceuticalManufacturer"
    PARK = "Park"
    PARKING = "Parking"
    GENERAL_RETAILER = "GeneralRetailer"
    PHARMACEUTICAL_RETAILER = "PharmaceuticalRetailer"
    REALTY = "Realty"
    RESTAURANT = "Restaurant"
    SACCO = "Sacco"
    TRANSPORT_COMPANY = "TransportCompany"
    TELCO = "Telco"
    GENERAL_WHOLESALER = "GeneralWholesaler"
    PHARMACEUTICAL_WHOLESALER = "PharmaceuticalWholesaler"

    @classmethod
    def choices(cls):
        """Django choices list for model fields."""
        return [(member.value, member.value) for member in cls]

    @classmethod
    def values(cls):
        """Plain list of all string values."""
        return [member.value for member in cls]

    @classmethod
    def default_entities(cls):
        """
        Default value for Products.allowed_entities.
        Returned as a fresh list each call to avoid mutable-default bugs.
        """
        return [
            cls.GENERAL_WHOLESALER.value,
            cls.GENERAL_RETAILER.value,
        ]

    # -----------------------------------------------------------------
    # Tier / domain groupings
    # -----------------------------------------------------------------

    @classmethod
    def wholesaler_types(cls):
        return {
            cls.GENERAL_WHOLESALER.value,
            cls.PHARMACEUTICAL_WHOLESALER.value,
        }

    @classmethod
    def retailer_types(cls):
        return {
            cls.GENERAL_RETAILER.value,
            cls.PHARMACEUTICAL_RETAILER.value,
        }

    @classmethod
    def pharma_types(cls):
        return {
            cls.PHARMACEUTICAL_WHOLESALER.value,
            cls.PHARMACEUTICAL_RETAILER.value,
            cls.PHARMACEUTICAL_DISTRIBUTOR.value,
            cls.PHARMACEUTICAL_MANUFACTURER.value,
        }

    @classmethod
    def general_types(cls):
        return {
            cls.GENERAL_WHOLESALER.value,
            cls.GENERAL_RETAILER.value,
            cls.GENERAL_DISTRIBUTOR.value,
            cls.GENERAL_MANUFACTURER.value,
        }


# retailers/constants.py

WHOLESALER_ENTITY_TYPES = [
    "GeneralWholesaler",
    "PharmaceuticalWholesaler",
]

REQUEST_EXPIRY_DAYS = 14