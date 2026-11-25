# manufacturers/services/access.py — who may act for a manufacturer or a buying distributor.

from rest_framework import exceptions, permissions

from distributors.services.access import DISTRIBUTOR_TYPES, employee_of, works_at  # noqa: F401

# Publishers (book publishers) sell their titles like a general manufacturer.
MANUFACTURER_TYPES = {"GeneralManufacturer", "PharmaceuticalManufacturer", "Publisher"}


def manufacturer_types_for(distributor):
    """Which manufacturers a distributor may buy from: pharmaceutical distributors buy medicines and general goods."""
    if distributor.entity_type == "PharmaceuticalDistributor":
        return {"PharmaceuticalManufacturer", "GeneralManufacturer", "Publisher"}
    return {"GeneralManufacturer", "Publisher"}


def distributor_types_for(manufacturer):
    """Which distributors a manufacturer may sell to (staff orders)."""
    if manufacturer.entity_type == "PharmaceuticalManufacturer":
        return {"PharmaceuticalDistributor"}
    return {"GeneralDistributor", "PharmaceuticalDistributor"}


class ManufacturerStaff(permissions.BasePermission):
    """The signed-in user works at a manufacturer (their current entity)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            raise exceptions.ValidationError("Please log in")
        entity = user.entity
        if not entity or entity.entity_type not in MANUFACTURER_TYPES or not works_at(user, entity):
            raise exceptions.ValidationError(["Only a manufacturer's staff can do this."])
        request.manufacturer = entity
        return True


class DistributorBuyer(permissions.BasePermission):
    """The signed-in user works at a distributor (their current entity), buying from manufacturers."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            raise exceptions.ValidationError("Please log in")
        entity = user.entity
        if not entity or entity.entity_type not in DISTRIBUTOR_TYPES or not works_at(user, entity):
            raise exceptions.ValidationError(["Only a distributor's staff can buy from manufacturers."])
        request.distributor = entity
        return True
