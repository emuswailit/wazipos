from authentication.models import  EntityBranches,Branches
from rest_framework import exceptions
from authentication.validators.authentication_models_validators import validate_entity


def get_entity_branches(data):
    entity_id = None
    entity = None
    if 'entity' in data and not data['entity'] == "":
        entity_id = data['entity']
        entity = validate_entity(entity_id)
    entity_branches = []
    if Branches.objects.filter(entity=entity).exists():
        entity_branches = Branches.objects.filter(
            entity=entity).all()
    return entity_branches


def create_entity_branch(data, user):
    branch_title = None
    branch_code = None
    entity_id = None
    entity = None
    errors = []

    if not 'entity' in data['entity_branch_details'] or data['entity_branch_details']['entity'] == "":
        errors.append('Entity ID is required')
    else:
        entity_id = data['entity_branch_details']['entity']
        entity = validate_entity(entity_id)

    if not 'branch_title' in data['entity_branch_details'] or data['entity_branch_details']['branch_title'] == "":
        errors.append('Branch title is required')
    else:
        branch_title = data['entity_branch_details']['branch_title']

    if not 'branch_code' in data['entity_branch_details'] or data['entity_branch_details']['branch_code'] == "":
        errors.append('Branch code is required')
    else:
        branch_code = data['entity_branch_details']['branch_code']

    if EntityBranches.objects.filter(entity=entity, branch_title=branch_title, branch_code=branch_code).exists():
        errors.append(f'This branch is already added to {entity.title}')

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:

        try:
            created = EntityBranches.objects.create(
                branch_title=branch_title,
                branch_code=branch_code,
                branch_email=data['entity_branch_details']['branch_email'],
                branch_telephone=data['entity_branch_details']['branch_telephone'],
                entity=entity,
                owner=user

            )
            if created:
                return created
            else:
                return None
        except Exception as e:
            raise exceptions.ValidationError(e)


def update_entity_entity_branch(data, user):
    is_active = None
    entity_branch_id = None
    entity_branch = None

    errors = []
    if not 'id' in data['entity_branch_details'] or data['entity_branch_details']['id'] == "":
        errors.append('Account ID is required')
    else:
        pass
        # entity_branch_id = data['entity_branch_details']['id']
        # if EntitySettlementAccounts.objects.filter(id=entity_branch_id, entity=user.entity).exists():
        #     entity_branch = EntitySettlementAccounts.objects.filter(
        #         id=entity_branch_id).first()
        # else:
        #     errors.append('Account with supplied ID does not exist')

    if not 'is_active' in data['entity_branch_details'] or data['entity_branch_details']['is_active'] == "":
        errors.append('Account activity status is required')
    else:
        is_active = data['entity_branch_details']['is_active']

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        pass
        # Deactivate all the other accounts
        # if EntitySettlementAccounts.objects.filter(entity=user.entity, is_active='true').exists():
        #     active_accounts = EntitySettlementAccounts.objects.filter(
        #         entity=user.entity, is_active='true').all()

        #     for acc in active_accounts:
        #         acc.is_active = 'false'
        #         acc.save()

        try:
            if is_active:
                entity_branch.is_active = is_active
                entity_branch.save()
            return entity_branch
        except Exception as e:
            raise exceptions.ValidationError(e)
