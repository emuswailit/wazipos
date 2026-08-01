# from authentication.models import EntityCollectionAccounts
# from rest_framework import exceptions
# from authentication.validators.authentication_models_validators import validate_entity


# def get_entity_collection_accounts(user):
#     collection_accounts = []
#     if EntityCollectionAccounts.objects.filter(entity=user.entity).exists():
#         collection_accounts = EntityCollectionAccounts.objects.filter(
#             entity=user.entity).all()
#     return collection_accounts


# def get_active_collection_account(data, user):
#     collection_account = None
#     if 'entity' in data:
#         entity_id = data['entity']
#         entity = validate_entity(entity_id)
#         if EntityCollectionAccounts.objects.filter(entity=entity, is_active='true').exists():
#             collection_account = EntityCollectionAccounts.objects.filter(
#                 entity=entity, is_active='true').first()
#         return collection_account
#     else:
#         raise exceptions.ValidationError('Entity ID is required')


# def create_entity_collection_account(data, user):

#     account_provider_id = None
#     account_provider = None

    account_number = None
    account_type = None
    errors = []

    if not 'account_provider' in data['collection_account_details'] or data['collection_account_details']['account_provider'] == "":
        errors.append('Account provider ID is required')
    else:
        account_provider_id = data['collection_account_details']['account_provider']
        account_provider = validate_entity(account_provider_id)
    if not 'account_number' in data['collection_account_details'] or data['collection_account_details']['account_number'] == "":
        errors.append('Account number is required')
    else:
        account_number = data['collection_account_details']['account_number']
    if not 'account_type' in data['collection_account_details'] or data['collection_account_details']['account_type'] == "":
        errors.append('Account type is required')
    else:
        account_type = data['collection_account_details']['account_type']
    if EntityCollectionAccounts.objects.filter(entity=user.entity, account_number=account_number, account_provider=account_provider).exists():
        errors.append(f'This account is already added to {user.entity.title}')
    # Deactivate all the other accounts
    if EntityCollectionAccounts.objects.filter(entity=user.entity, is_active='true').exists():
        active_accounts = EntityCollectionAccounts.objects.filter(
            entity=user.entity, is_active='true').all()

        for acc in active_accounts:
            acc.is_active = 'false'
            acc.save()
    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:

        try:
            created = EntityCollectionAccounts.objects.create(
                account_provider=account_provider,
                account_number=account_number,
                account_type=account_type,
                entity=user.entity,
                owner=user

            )
            if created:
                return created
            else:
                return None
        except Exception as e:
            raise exceptions.ValidationError(e)


def update_entity_collection_account(data, user):
    if not user.is_staff:
        raise exceptions.ValidationError('Not authorized')
    is_active = None
    collection_account_id = None
    collection_account = None

    errors = []
    if not 'id' in data['collection_account_details'] or data['collection_account_details']['id'] == "":
        errors.append('Account ID is required')
    else:
        collection_account_id = data['collection_account_details']['id']
        if EntityCollectionAccounts.objects.filter(id=collection_account_id).exists():
            collection_account = EntityCollectionAccounts.objects.filter(
                id=collection_account_id).first()
        else:
            errors.append('Account with supplied ID does not exist')

    if not 'is_active' in data['collection_account_details'] or data['collection_account_details']['is_active'] == "":
        errors.append('Account activity status is required')
    else:
        is_active = data['collection_account_details']['is_active']
    if not 'is_verified' in data['collection_account_details'] or data['collection_account_details']['is_verified'] == "":
        errors.append('Account activity status is required')
    else:
        is_verified = data['collection_account_details']['is_verified']

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        # Deactivate all the other accounts
        if EntityCollectionAccounts.objects.filter(entity=user.entity, is_active='true').exists():
            active_accounts = EntityCollectionAccounts.objects.filter(
                entity=user.entity, is_active='true').all()

            for acc in active_accounts:
                acc.is_active = 'false'
                acc.save()

        try:
            if is_active:
                collection_account.is_active = is_active
                collection_account.is_verified = is_verified
                collection_account.verified_by = user
                collection_account.save()
            return collection_account
        except Exception as e:
            raise exceptions.ValidationError(e)
