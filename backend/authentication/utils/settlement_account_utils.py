# from authentication.models import EntitySettlementAccounts, EntityBranches
# from rest_framework import exceptions
# from authentication.validators.authentication_models_validators import validate_entity


# def get_entity_settlement_accounts(user):
#     settlement_accounts = []
#     if EntitySettlementAccounts.objects.filter(entity=user.entity).exists():
#         settlement_accounts = EntitySettlementAccounts.objects.filter(
#             entity=user.entity).all()
#     return settlement_accounts


# def create_entity_settlement_account(data, user):
#     account_provider_id = None
#     account_provider = None
#     account_provider_branch_id = None
#     account_provider_branch = None

#     account_number = None
#     account_type = None
#     errors = []

#     if not 'account_provider' in data['settlement_account_details'] or data['settlement_account_details']['account_provider'] == "":
#         errors.append('Account provider ID is required')
#     else:
#         account_provider_id = data['settlement_account_details']['account_provider']
#         account_provider = validate_entity(account_provider_id)
#     if 'account_provider_branch' in data['settlement_account_details']:
#         account_provider_branch_id = data['settlement_account_details']['account_provider_branch']
#         if EntityBranches.objects.filter(id=account_provider_branch_id).exists():
#             account_provider_branch = EntityBranches.objects.filter(
#                 id=account_provider_branch_id).first()

#     if not 'account_number' in data['settlement_account_details'] or data['settlement_account_details']['account_number'] == "":
#         errors.append('Account number is required')
#     else:
#         account_number = data['settlement_account_details']['account_number']
#     if not 'account_type' in data['settlement_account_details'] or data['settlement_account_details']['account_type'] == "":
#         errors.append('Account type is required')
#     else:
#         account_type = data['settlement_account_details']['account_type']
#     if EntitySettlementAccounts.objects.filter(entity=user.entity, account_number=account_number, account_provider=account_provider).exists():
#         errors.append(f'This account is already added to {user.entity.title}')
#     # Deactivate all the other accounts
#     if EntitySettlementAccounts.objects.filter(entity=user.entity, is_active='true').exists():
#         active_accounts = EntitySettlementAccounts.objects.filter(
#             entity=user.entity, is_active='true').all()

#         for acc in active_accounts:
#             acc.is_active = 'false'
#             acc.save()
#     if len(errors) > 0:
#         raise exceptions.ValidationError(errors)
#     else:

#         try:
#             created = EntitySettlementAccounts.objects.create(
#                 account_provider=account_provider,
#                 account_provider_branch=account_provider_branch,
#                 account_number=account_number,
#                 account_type=account_type,
#                 entity=user.entity,
#                 owner=user

#             )
#             if created:
#                 return created
#             else:
#                 return None
#         except Exception as e:
#             raise exceptions.ValidationError(e)


# def update_entity_settlement_account(data, user):
#     is_active = None
#     settlement_account_id = None
#     settlement_account = None

#     errors = []
#     if not 'id' in data['settlement_account_details'] or data['settlement_account_details']['id'] == "":
#         errors.append('Account ID is required')
#     else:
#         settlement_account_id = data['settlement_account_details']['id']
#         if EntitySettlementAccounts.objects.filter(id=settlement_account_id, entity=user.entity).exists():
#             settlement_account = EntitySettlementAccounts.objects.filter(
#                 id=settlement_account_id).first()
#         else:
#             errors.append('Account with supplied ID does not exist')

#     if not 'is_active' in data['settlement_account_details'] or data['settlement_account_details']['is_active'] == "":
#         errors.append('Account activity status is required')
#     else:
#         is_active = data['settlement_account_details']['is_active']

#     if len(errors) > 0:
#         raise exceptions.ValidationError(errors)
#     else:
#         # Deactivate all the other accounts
#         if EntitySettlementAccounts.objects.filter(entity=user.entity, is_active='true').exists():
#             active_accounts = EntitySettlementAccounts.objects.filter(
#                 entity=user.entity, is_active='true').all()

#             for acc in active_accounts:
#                 acc.is_active = 'false'
#                 acc.save()

#         try:
#             if is_active:
#                 settlement_account.is_active = is_active
#                 settlement_account.save()
#             return settlement_account
#         except Exception as e:
#             raise exceptions.ValidationError(e)
