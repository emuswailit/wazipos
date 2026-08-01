from .models import Tickets
from rest_framework import exceptions
from . import models
from authentication.utils.utils import use_reference_number


def check_ticket_with_reference(reference_number):
    ticket =None
    if Tickets.objects.filter(reference_number=reference_number).exists():
        ticket=Tickets.objects.filter(reference_number=reference_number).first()
        return ticket
    else:
        return None
def validate_reference_number(reference_number):
    if Tickets.objects.filter(reference_number=reference_number).exists():
        use_reference_number(reference_number)
        raise exceptions.ValidationError("Reference number already used")
    else:
        return reference_number


def validate_route(route_id):
    if models.OperationRoutes.objects.filter(id=route_id).exists():
        return models.OperationRoutes.objects.filter(id=route_id).first()
    else:
        raise exceptions.ValidationError("Route with supplied ID does not exist")


def validate_destination(destination_id):
    if models.Destinations.objects.filter(id=destination_id).exists():
        return models.Destinations.objects.filter(id=destination_id).first()
    else:
        raise exceptions.ValidationError("Destination with supplied ID does not exist")

def validate_trip(trip_id):
    if models.Trip.objects.filter(id=trip_id).exists():
        return models.Trip.objects.filter(id=trip_id).first()
    else:
        raise exceptions.ValidationError("Trip with supplied ID does not exist")


def validate_charge(charge_id,user):
    if models.Charges.objects.filter(id=charge_id,entity=user.entity).exists():
        return models.Charges.objects.filter(id=charge_id,entity=user.entity).first()
    else:
        raise exceptions.ValidationError("Charge with supplied ID does not exist")
    
def validate_vehicle(vehicle_id):
    if models.Vehicles.objects.filter(id=vehicle_id).exists():
        return models.Vehicles.objects.filter(id=vehicle_id).first()
    else:
        raise exceptions.ValidationError("Vehicle with supplied ID does not exist")
    
def validate_sacco_vehicle(vehicle_id, user):
    if models.Vehicles.objects.filter(registration=vehicle_id.upper(), entity=user.entity,is_active="true").exists():
        return models.Vehicles.objects.filter(registration=vehicle_id, entity=user.entity,is_active="true").first()
    else:
        raise exceptions.ValidationError("Vehicle with supplied ID does not exist")

def validate_sacco_subscription(subscription_id,user):
    if models.SaccoSubscription.objects.filter(id=subscription_id,entity=user.entity).exists():
        return models.SaccoSubscription.objects.filter(id=subscription_id,entity=user.entity).first()
    else:
        raise exceptions.ValidationError("Subscription with supplied ID does not exist")

def validate_sacco_personnel(sacco_personnel_id):
    if models.SaccoPersonnel.objects.filter(id=sacco_personnel_id).exists():
        return models.SaccoPersonnel.objects.filter(id=sacco_personnel_id).first()
    else:
        raise exceptions.ValidationError("Sacco personnel with supplied ID does not exist")
    
def validate_sacco_settlement_account(id):
    if models.SaccoSettlementAccount.objects.filter(id=id).exists():
        return models.SaccoSettlementAccount.objects.filter(id=id).first()
    else:
        raise exceptions.ValidationError("Sacco settlement account with supplied ID does not exist")
    
def validate_transfer_point(id):
    if models.TransferPoints.objects.filter(id=id).exists():
        return models.TransferPoints.objects.filter(id=id).first()
    else:
        raise exceptions.ValidationError("Transfer point with supplied ID does not exist")
    
def validate_transfer(id):
    if models.Transfers.objects.filter(id=id).exists():
        return models.Transfers.objects.filter(id=id).first()
    else:
        raise exceptions.ValidationError("Transfer with supplied ID does not exist")
    
def validate_journey(id):
    if models.Journies.objects.filter(id=id).exists():
        return models.Journies.objects.filter(id=id).first()
    else:
        raise exceptions.ValidationError("Journey with supplied ID does not exist")