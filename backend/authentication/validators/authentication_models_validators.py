from .. import models
from rest_framework import exceptions


def validate_dependant(dependant_id):
    if not models.Dependants.objects.filter(id=dependant_id).exists():
        raise exceptions.ValidationError("Dependant for supplied ID does not exist")
    else:
        return models.Dependants.objects.filter(id=dependant_id).first()

def validate_department(department_id,user):
    if not models.Departments.objects.filter(id=department_id,entity=user.entity).exists():
        raise exceptions.ValidationError("Department does not exist for your entity")
    else:
        return models.Departments.objects.filter(id=department_id, entity=user.entity).first()

def validate_town(entity_id):
    if not models.Towns.objects.filter(id=entity_id).exists():
        raise exceptions.ValidationError("Town with the supplied ID does not exist")
    else:
        return models.Towns.objects.filter(id=entity_id).first()
    
    

def validate_entity(entity_id):
    if not models.Entities.objects.filter(id=entity_id).exists():
        raise exceptions.ValidationError("Entity with the supplied ID does not exist")
    else:
        return models.Entities.objects.filter(id=entity_id).first()
    
def validate_town(entity_id):
    if not models.Towns.objects.filter(id=entity_id).exists():
        raise exceptions.ValidationError("Town with the supplied ID does not exist")
    else:
        return models.Towns.objects.filter(id=entity_id).first()
    
def validate_entity_branch(entity_branch_id):
    if not models.EntityBranches.objects.filter(id=entity_branch_id).exists():
        raise exceptions.ValidationError("Entity branch with provided ID does not exist")
    else:
        return models.EntityBranches.objects.filter(id=entity_branch_id).first()


def existing_and_verified_user(id):
    if id == "":
        raise exceptions.ValidationError("User ID is required at validate")

    if not models.Users.objects.filter(id=id).exists():
        raise exceptions.ValidationError("User with supplied ID could not be retrieved")
    else:
        if models.Users.objects.filter(id=id, is_verified="true").exists():
            return models.Users.objects.filter(id=id, is_verified="true").first()
        else:
            raise exceptions.ValidationError("User is not verified")


def validate_role(id, user):
    if not models.Roles.objects.filter(id=id, entity=user.entity).exists():
        raise exceptions.ValidationError(f"Role with provided ID ({id}) does not exist")
    else:
        return models.Roles.objects.filter(id=id, entity=user.entity).first()


def entity_not_created_by_admin(id):
    entity = None
    if not models.Entities.objects.filter(id=id).exists():
        raise exceptions.ValidationError(
            f"Entity for supplied ID ({id}) does not exist"
        )
    else:
        entity = models.Entities.objects.filter(id=id).first()
        if entity.owner and entity.owner.is_staff:
            raise exceptions.ValidationError("Entity was created by admin")
        elif not entity.owner:
            raise exceptions.ValidationError("Default entity")
        else:
            return entity


def entity_has_verified_licences(id):
    entity = validate_entity(id)
    if models.EntityLicences.objects.filter(is_verified="true", entity=entity).exists():
        return entity
    else:
        raise exceptions.ValidationError("Entity has no verified licences")


def verify_category_exists(id):
    if not models.Categories.objects.filter(id=id).exists():
        raise exceptions.ValidationError(f"Category with ID  ({id}) does not exist")
    else:
        return models.Categories.objects.filter(id=id).first()


def validate_user(id):
    if not models.Users.objects.filter(id=id).exists():
        raise exceptions.ValidationError(f"User with provided ID ({id}) does not exist")
    else:
        return models.Users.objects.filter(id=id).first()
    
    
def validate_user_with_phone_exists(phone):
    if not models.Users.objects.filter(phone=phone).exists():
        return None
    else:
        return models.Users.objects.filter(phone=phone).first()


def validate_county(county_id):
    if not models.Counties.objects.filter(id=county_id).exists():
        raise exceptions.ValidationError("County for supplied ID does not exist")
    else:
        return models.Counties.objects.filter(id=county_id).first()
    
def validate_sub_county(county_id):
    if not models.SubCounties.objects.filter(id=county_id).exists():
        raise exceptions.ValidationError("SubCounty for supplied ID does not exist")
    else:
        return models.SubCounties.objects.filter(id=county_id).first()
    
def validate_location(county_id):
    if not models.Locations.objects.filter(id=county_id).exists():
        raise exceptions.ValidationError("Location for supplied ID does not exist")
    else:
        return models.Locations.objects.filter(id=county_id).first()
    

def validate_sub_location(county_id):
    if not models.SubLocations.objects.filter(id=county_id).exists():
        raise exceptions.ValidationError("Sublocation for supplied ID does not exist")
    else:
        return models.SubLocations.objects.filter(id=county_id).first()
    
def validate_village(county_id):
    if not models.Villages.objects.filter(id=county_id).exists():
        raise exceptions.ValidationError("Sublocation for supplied ID does not exist")
    else:
        return models.Villages.objects.filter(id=county_id).first()

def validate_country(country_id):
    errors=[]
    if not models.Countries.objects.filter(id=country_id).exists():
        errors.append("Country for supplied ID does not exist")
        return errors, None
    else:
        return [], models.Countries.objects.filter(id=country_id).first()
    
def validate_organization(organization_id):
    errors=[]
    if not models.Organizations.objects.filter(id=organization_id).exists():
        errors.append("Organizationj for supplied ID does not exist")
        return errors, None
    else:
        return [], models.Organizations.objects.filter(id=organization_id).first()


def validate_constituency(constituency_id):
    if not models.Constituencies.objects.filter(id=constituency_id).exists():
        raise exceptions.ValidationError("Constituency for supplied ID does not exist")
    else:
        return models.Constituencies.objects.filter(id=constituency_id).first()


def user_has_verified_kyc_documents(user):
    if models.UserDocuments.objects.filter(is_verified="true", owner=user).exists():
        return models.UserDocuments.objects.filter(is_verified="true", owner=user).first()
    else:
        return False
