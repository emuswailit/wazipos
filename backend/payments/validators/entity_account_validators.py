
from .. import models
from rest_framework import exceptions
from authentication.models import Entities


def get_entity_accounts(data, user):
    entity = None
    if not 'entity_id' in data or data['entity_id'] == "":
        raise exceptions.ValidationError('Entity ID is required')
    else:
        if not Entities.objects.filter(id=data['entity_id']).exists():
            raise exceptions.ValidationError(
                'Entity with provided ID does not exist')
        else:
            entity = Entities.objects.filter(id=data['entity_id']).first()
            # Admins or entity owners only
            if user.is_staff or entity.owner == user:
                return models.EntityPSPCollectionAccount.objects.filter(entity_id=data['entity_id'])
            else:
                raise exceptions.ValidationError('Not authorized')


def validate_entity_account_details(data, user):

    # Admins forbidden
    if user.is_staff:
        raise exceptions.ValidationError("Not authorized")
    entity = None
    account_provider = None
    account_provider_branch = None
    entity_account = None
    errors = []

    try:
        entity_account_details = data["entity_account_details"]

    except KeyError:
        raise exceptions.ValidationError(
            "Entity account details are required")

    try:
        entity_id = data["entity_account_details"]["entity_id"]
        if data["entity_account_details"]["entity_id"] == "":
            errors.append("Entity ID cannot be empty")
        if not Entities.objects.filter(
            id=entity_id,
        ).exists():
            raise exceptions.ValidationError(
                f"Entity with provided ID does not exists"
            )
        else:
            entity = Entities.objects.filter(
                id=entity_id,
            ).first()
    except KeyError:
        errors.append("Entity ID is required")
    if not entity.owner == user:
        raise exceptions.ValidationError(
            'Only entity owners can create accounts')
    try:
        account_provider_id = data["entity_account_details"]["account_provider_id"]
        if data["entity_account_details"]["account_provider_id"] == "":
            errors.append("Provider ID cannot be empty")
        if not models.PaymentServicesProvider.objects.filter(
            id=account_provider_id,
        ).exists():
            raise exceptions.ValidationError(
                f"Account provider with provided ID does not exists"
            )
        else:
            account_provider = models.PaymentServicesProvider.objects.filter(
                id=account_provider_id,
            ).first()
    except KeyError:
        errors.append("Account provider ID is required")

    try:
        account_provider_branch_id = data["entity_account_details"]["account_provider_branch_id"]
        if data["entity_account_details"]["account_provider_branch_id"] == "":
            errors.append("Provider branch ID cannot be empty")
        if not models.PaymentServicesProviderBranch.objects.filter(
            id=account_provider_branch_id,
        ).exists():
            raise exceptions.ValidationError(
                f"Account provider branch with provided ID does not exists"
            )
        else:
            account_provider_branch = models.PaymentServicesProviderBranch.objects.filter(
                id=account_provider_branch_id,
            ).first()
    except KeyError:
        errors.append("Account provider branch ID is required")
    try:
        account_number = data["entity_account_details"]["account_number"]
        if data["entity_account_details"]["account_number"] == "":
            errors.append("Provider title cannot be empty")
        if models.EntityPSPCollectionAccount.objects.filter(
            account_number=account_number, account_provider=account_provider
        ).exists():
            raise exceptions.ValidationError(
                f"Account number {account_number} provided by {account_provider.psp_title} already exists"
            )
    except KeyError:
        errors.append("Account number is required")
    try:
        account_type = data["entity_account_details"]["account_type"]
        if data["entity_account_details"]["account_type"] == "":
            errors.append("Account type cannot be empty")

    except KeyError:
        errors.append("Account type is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        entity_account = models.EntityPSPCollectionAccount.objects.create(
            entity=entity,
            account_provider=account_provider, account_provider_branch=account_provider_branch, account_number=account_number, account_type=account_type, owner=user
        )
        return entity_account
