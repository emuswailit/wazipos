
from .. import models
from rest_framework import exceptions
# from authentication.models import Countries


def get_all_account_providers():
    return models.PaymentServicesProvider.objects.all()


def validate_account_provider_details(data, user):
    if not user.is_staff:
        raise exceptions.ValidationError('Admins only')
    errors = []
    try:
        account_provider_details = data["account_provider_details"]

    except KeyError:
        raise exceptions.ValidationError(
            "Account provider details are required")
    try:
        account_provider_title = data["account_provider_details"]["account_provider_title"]
        if data["account_provider_details"]["account_provider_title"] == "":
            errors.append("Provider title cannot be empty")
        if models.PaymentServicesProvider.objects.filter(
            account_provider_title=account_provider_title,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider called {account_provider_title} already exists"
            )
    except KeyError:
        errors.append("Account provider title is required")
    try:
        account_provider_code = data["account_provider_details"]["account_provider_code"]
        if data["account_provider_details"]["account_provider_code"] == "":
            errors.append("Provider title cannot be empty")
        if models.PaymentServicesProvider.objects.filter(
            account_provider_code=account_provider_code,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider with code {account_provider_code} already exists"
            )
    except KeyError:
        errors.append("Account provider code is required")

    try:
        account_provider_type = data["account_provider_details"]["account_provider_type"]
        if data["account_provider_details"]["account_provider_type"] == "":
            errors.append("Provider type cannot be empty")
    except KeyError:
        errors.append("Account provider type is required")
    # try:
    #     country = data["account_provider_details"]["country"]
    #     if data["account_provider_details"]["country"] == "":
    #         errors.append("Provider country cannot be empty")
    #     if not Countries.objects.filter(id=country).exists():
    #         errors.append("No country with provided ID exists in the system")

    except KeyError:
        errors.append("Account provider country ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_account_provider(data, user):

    try:
        created = models.PaymentServicesProvider.objects.create(
            account_provider_title=data["account_provider_details"]["account_provider_title"],
            account_provider_code=data["account_provider_details"]["account_provider_code"],
            account_provider_type=data["account_provider_details"]["account_provider_type"],
            country_id=data["account_provider_details"]["country"],
            owner=user,

        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


# Account provider branch

def get_all_account_provider_branches():
   
    return models.PaymentServicesProviderBranch.objects.all()


def validate_account_provider_branch_details(data, user):
    if not user.is_staff:
        raise exceptions.ValidationError('Admins only')
    errors = []
    try:
        account_provider_branch_details = data["account_provider_branch_details"]

    except KeyError:
        raise exceptions.ValidationError(
            "Account provider branch details are required")
    try:
        account_provider = data["account_provider_branch_details"]["account_provider"]
        if data["account_provider_branch_details"]["account_provider"] == "":
            errors.append("Account provider ID cannot be empty")
        if not models.PaymentServicesProvider.objects.filter(
            id=account_provider,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider for provided ID does not exists"
            )
    except KeyError:
        errors.append("Account provider branch code is required")

    try:
        branch_title = data["account_provider_branch_details"]["branch_title"]
        if data["account_provider_branch_details"]["branch_title"] == "":
            errors.append("Provider title cannot be empty")
        if models.PaymentServicesProviderBranch.objects.filter(
            branch_title=branch_title,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider branch called {branch_title} already exists"
            )
    except KeyError:
        errors.append("Account provider branch title is required")
    try:
        branch_code = data["account_provider_branch_details"]["branch_code"]
        if data["account_provider_branch_details"]["branch_code"] == "":
            errors.append("Provider title cannot be empty")
        if models.PaymentServicesProviderBranch.objects.filter(
            branch_code=branch_code,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider branch with code {branch_code} already exists"
            )
    except KeyError:
        errors.append("Account provider branch code is required")

    try:
        branch_telephone = data["account_provider_branch_details"]["branch_telephone"]
        if data["account_provider_branch_details"]["branch_telephone"] == "":
            errors.append("Provider title cannot be empty")
        if models.PaymentServicesProviderBranch.objects.filter(
            branch_telephone=branch_telephone,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider branch with phone {branch_telephone} already exists"
            )
    except KeyError:
        errors.append("Account provider branch phone is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_account_provider_branch(data, user):

    try:
        created = models.PaymentServicesProviderBranch.objects.create(
            account_provider_id=data["account_provider_branch_details"]["account_provider"],
            branch_title=data["account_provider_branch_details"]["branch_title"],
            branch_code=data["account_provider_branch_details"]["branch_code"],
            branch_telephone=data["account_provider_branch_details"]["branch_telephone"],
            branch_email=data["account_provider_branch_details"]["branch_email"],
            owner=user,

        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def validate_account_provider_branch_update_details(data, user):
    account_provider_branch = None
    account_provider = None
    branch_title = None
    branch_code = None
    branch_telephone = None
    branch_email = None
    if not user.is_staff:
        raise exceptions.ValidationError('Admins only')
    errors = []
    if not 'account_provider_branch_id' in data["account_provider_branch_details"]:
        raise exceptions.ValidationError(
            f"Branch  ID does not exists"
        )
    else:
        if models.PaymentServicesProviderBranch.objects.filter(id=data["account_provider_branch_details"]['account_provider_branch_id']).exists():
            account_provider_branch = models.PaymentServicesProviderBranch.objects.filter(
                id=data["account_provider_branch_details"]['account_provider_branch_id']).first()
        else:
            raise exceptions.ValidationError(
                f"Provider branch for provided ID does not exists"
            )

    if 'account_provider' in data["account_provider_branch_details"]:
        account_provider = data["account_provider_branch_details"]["account_provider"]
        if data["account_provider_branch_details"]["account_provider"] == "":
            errors.append("Account provider ID cannot be empty")
        if not models.PaymentServicesProvider.objects.filter(
            id=account_provider,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider for provided ID does not exists"
            )
    if 'branch_title' in data["account_provider_branch_details"]:
        branch_title = data["account_provider_branch_details"]["branch_title"]
        if data["account_provider_branch_details"]["branch_title"] == "":
            errors.append("Title cannot be empty")
        if models.PaymentServicesProviderBranch.objects.filter(
            branch_title=branch_title,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider with provided title does exists"
            )
    if 'branch_code' in data["account_provider_branch_details"]:
        branch_code = data["account_provider_branch_details"]["branch_code"]
        if data["account_provider_branch_details"]["branch_code"] == "":
            errors.append("Title cannot be empty")
        if models.PaymentServicesProviderBranch.objects.filter(
            branch_code=branch_code,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider with provided code does exists"
            )
    if 'branch_telephone' in data["account_provider_branch_details"]:
        branch_telephone = data["account_provider_branch_details"]["branch_telephone"]
        if data["account_provider_branch_details"]["branch_telephone"] == "":
            errors.append("Title cannot be empty")
        if models.PaymentServicesProviderBranch.objects.filter(
            branch_telephone=branch_telephone,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider with provided phone does exists"
            )
    if 'branch_email' in data["account_provider_branch_details"]:
        branch_email = data["account_provider_branch_details"]["branch_email"]
        if data["account_provider_branch_details"]["branch_email"] == "":
            errors.append("Title cannot be empty")
        if models.PaymentServicesProviderBranch.objects.filter(
            branch_email=branch_email,
        ).exists():
            raise exceptions.ValidationError(
                f"Provider with provided email does exists"
            )

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        if account_provider:
            account_provider_branch.account_provider_id = account_provider
            account_provider_branch.save()
        if branch_title:
            account_provider_branch.psp_branch_title = branch_title
            account_provider_branch.save()
        if branch_code:
            account_provider_branch.psp_branch_code = branch_code
            account_provider_branch.save()
        if branch_telephone:
            account_provider_branch.psp_branch_telephone = branch_telephone
            account_provider_branch.save()
        if branch_email:
            account_provider_branch.psp_branch_email = branch_email
            account_provider_branch.save()

        return account_provider_branch
