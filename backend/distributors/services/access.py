# distributors/services/access.py — who may act for a distributor or a buying wholesaler.

from rest_framework import exceptions, permissions

DISTRIBUTOR_TYPES = {"GeneralDistributor", "PharmaceuticalDistributor"}
WHOLESALER_TYPES = {"GeneralWholesaler", "PharmaceuticalWholesaler"}


def distributor_types_for(wholesaler):
    """Which distributors a wholesaler may buy from (as wholesalers/discovery.py does for retailers)."""
    if wholesaler.entity_type == "PharmaceuticalWholesaler":
        return {"PharmaceuticalDistributor", "GeneralDistributor"}
    return {"GeneralDistributor"}


def works_at(user, entity):
    """An active employee of the entity, or one of its super admins."""
    if not user or not user.is_authenticated or not entity:
        return False
    from employees.models import Employees

    if Employees.objects.filter(user=user, entity=entity, is_active="true").exists():
        return True
    return user.roles.filter(entity=entity, value__endswith="SuperAdmin").exists()


def employee_of(user, entity):
    from employees.models import Employees

    return Employees.objects.filter(user=user, entity=entity, is_active="true").first()


class DistributorStaff(permissions.BasePermission):
    """The signed-in user works at a distributor (their current entity)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            raise exceptions.ValidationError("Please log in")
        entity = user.entity
        if not entity or entity.entity_type not in DISTRIBUTOR_TYPES or not works_at(user, entity):
            raise exceptions.ValidationError(["Only a distributor's staff can do this."])
        request.distributor = entity
        return True


class WholesalerBuyer(permissions.BasePermission):
    """The signed-in user works at a wholesaler (their current entity), buying from distributors."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            raise exceptions.ValidationError("Please log in")
        entity = user.entity
        if not entity or entity.entity_type not in WHOLESALER_TYPES or not works_at(user, entity):
            raise exceptions.ValidationError(["Only a wholesaler's staff can buy from distributors."])
        request.wholesaler = entity
        return True
