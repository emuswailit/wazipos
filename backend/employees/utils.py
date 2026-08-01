from rest_framework import exceptions
from employees.models import Employees, Designations, Adverts, DeliveryPersons
from core.utils import date_is_current_or_future
from authentication.models import Users, Roles, Departments, Entities, Cadres
from authentication.validators.authentication_models_validators import validate_entity
from .models import Salaries
from django.db import transaction
from authentication.validators import authentication_models_validators
from employees.validators import employees_models_validators


def update_employee_roles(employee, new_roles, owner):
    user_roles = employee.user.roles.all()
    employee_roles = employee.employee_roles.all()
    this_facility_roles_in_user = user_roles.filter(entity=owner.entity)
    print("User roles: this facility", this_facility_roles_in_user)
    print("Employee roles", employee_roles)
    print("New roles", new_roles)

    if len(new_roles) > 0:
        # Replace local roles
        employee.employee_roles.clear()
        employee.employee_roles.set(new_roles)
        employee.save()

        if len(this_facility_roles_in_user) > 0:
            # There are old roles and new roles
            # Remove all roles, but one by one for this entity from the user roles
            for x in this_facility_roles_in_user:
                employee.user.roles.remove(x)
                employee.user.save()
            # Add new roles, one by one
            for y in new_roles:
                employee.user.roles.add(y)
                employee.user.save()
        else:
            # There are new roles though no old roles
            for y in new_roles:
                employee.user.roles.add(y)
                employee.user.save()

    else:
        employee.employee_roles.clear()
        employee.save()
        if len(this_facility_roles_in_user) > 0:
            # Remove all roles, but one by one for this entity from the user roles, no further adding
            for x in this_facility_roles_in_user:
                employee.user.roles.remove(x)
                employee.user.save()

    # if len(all_user_roles) > 0:
    #     current_entity_roles = all_user_roles.filter(entity=owner.entity)
    #     for cer in current_entity_roles:
    #         employee.user.roles.remove(cer)
    #     employee.user.save()

    # if len(new_roles) > 0:
    #     for nr in new_roles:
    #         employee.user.roles.add(nr)
    #     employee.user.save()


# Adverts

def get_entity_adverts(user):
    return Adverts.objects.filter(entity=user.entity)


def validate_adverts_data(data, user):

    entered_user = None
    errors = []

    try:
        advert_details = data["advert_details"]
        if advert_details == {}:
            errors.append("Advert  details is empty")
    except KeyError:
        errors.append("Advert details are required")
    try:
        title = data["advert_details"]["title"]
    except KeyError:
        errors.append("Advert title is required")
    try:
        vacancies = data["advert_details"]["vacancies"]
        if vacancies == "":
            errors.append("Vacancies cannot be empty")

    except KeyError:
        errors.append("Vacancies is required")
    try:
        closes = data["advert_details"]["closes"]
    except KeyError:
        errors.append("Closing date is required")
    # Cadre
    try:
        designation_id = data["advert_details"]["designation"]

        if designation_id == "":
            errors.append("Designation ID  is empty")
        # Check user exists for given ID
        if Designations.objects.filter(id=designation_id).exists():
            entered_cadre = Designations.objects.filter(
                id=designation_id).first()
        else:
            errors.append("Designation for given ID does not exist")
    except KeyError:
        errors.append("Designation ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


@transaction.atomic
def create_advert(data, user):

    title = None
    vacancies = None
    closes = None
    description = None

    cadre_id = None
    if data["advert_details"]["designation"]:
        designation_id = data["advert_details"]["designation"]
    if data["advert_details"]["title"]:
        title = data["advert_details"]["title"]
    if data["advert_details"]["vacancies"]:
        vacancies = data["advert_details"]["vacancies"]
    if data["advert_details"]["description"]:
        description = data["advert_details"]["description"]
    if data["advert_details"]["closes"]:
        closes = data["advert_details"]["closes"]
    if data["advert_details"]["closes"]:
        closes = data["advert_details"]["closes"]

    try:
        created = Adverts.objects.create(
            title=title,
            vacancies=int(vacancies),
            description=description,
            closes=closes,
            designation_id=designation_id,
            owner=user,
            entity=user.entity,
        )
        return created

    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def update_advert(data, user):

    advert = None
    title = None
    description = None
    closes = None
    vacancies = None
    designation = None

    try:
        advert_id = data["advert_details"]["id"]
        if data["advert_details"]["id"] == "":
            raise exceptions.ValidationError(
                "Advert ID must be valid UUID")
        if Adverts.objects.filter(id=advert_id).exists():
            advert = Adverts.objects.get(id=advert_id)
        else:
            raise exceptions.ValidationError(
                "Advert for supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Designation ID is required")

    if "title" in data["advert_details"]:
        if data["advert_details"]["title"]:
            title = data["advert_details"]["title"]
    if "closes" in data["advert_details"]:
        if data["advert_details"]["closes"]:
            cadre = data["advert_details"]["closes"]
    if "description" in data["advert_details"]:
        if data["advert_details"]["description"]:
            description = data["advert_details"]["description"]

    if "vacancies" in data["advert_details"]:
        if data["advert_details"]["vacancies"]:
            vacancies = data["advert_details"]["vacancies"]
    if "designation" in data["advert_details"]:
        if data["advert_details"]["designation"]:
            designation = data["advert_details"]["designation"]

    try:

        if title:
            advert.title = title
            advert.save()
        if title:
            advert.designation_id = designation
            advert.save()
        if description:
            advert.description = description
            advert.save()
        if vacancies:
            advert.vacancies = vacancies
            advert.save()
        if closes:
            advert.closes = closes
            advert.save()

        return advert
    except Exception as e:
        raise exceptions.ValidationError(e)


# Designations


def get_entity_designations(user):
    return Designations.objects.filter(entity=user.entity)


def validate_designation_data(data, user):

    entered_user = None
    errors = []

    try:
        designation_details = data["designation_details"]
        if designation_details == {}:
            errors.append("Designation details is empty")
    except KeyError:
        errors.append("Designation details are required")
    try:
        title = data["designation_details"]["title"]
    except KeyError:
        errors.append("Designation title is required")
    try:
        tenure = data["designation_details"]["tenure"]
        if tenure == "":
            errors.append("Tenure cannot be empty")

    except KeyError:
        errors.append("Tenure type is required")
    try:
        total_slots = data["designation_details"]["total_slots"]
    except KeyError:
        errors.append("Total slots possible is required")
    # Cadre
    try:
        cadre_id = data["designation_details"]["cadre"]

        if cadre_id == "":
            errors.append("Cadre ID  is empty")
        # Check user exists for given ID
        if Cadres.objects.filter(id=cadre_id).exists():
            entered_cadre = Cadres.objects.filter(id=cadre_id).first()
        else:
            errors.append("Cadre for given ID does not exist")
    except KeyError:
        errors.append("Cadre ID is required")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


@transaction.atomic
def create_designation(data, user):

    title = None
    total_slots = None
    description = None
    tenure = None
    duration_in_months = None
    cadre_id = None
    if data["designation_details"]["cadre"]:
        cadre_id = data["designation_details"]["cadre"]
    if data["designation_details"]["title"]:
        title = data["designation_details"]["title"]
    if data["designation_details"]["total_slots"]:
        total_slots = data["designation_details"]["total_slots"]
    if data["designation_details"]["description"]:
        description = data["designation_details"]["description"]
    if data["designation_details"]["tenure"]:
        tenure = data["designation_details"]["tenure"]
    if data["designation_details"]["duration_in_months"]:
        duration_in_months = data["designation_details"]["duration_in_months"]

    try:
        created = Designations.objects.create(
            title=title,
            total_slots=int(total_slots),
            description=description,
            tenure=tenure,
            duration_in_months=int(duration_in_months),
            cadre_id=cadre_id,
            owner=user,
            entity=user.entity,
        )
        return created

    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def update_designation(data, user):

    designation = None
    title = None
    description = None
    cadre = None
    total_slots = None
    duration_in_months = None
    tenure = None

    try:
        designation_id = data["designation_details"]["id"]
        if data["designation_details"]["id"] == "":
            raise exceptions.ValidationError(
                "Designation ID must be valid UUID")
        if Designations.objects.filter(id=designation_id).exists():
            designation = Designations.objects.get(id=designation_id)
        else:
            raise exceptions.ValidationError(
                "Designation for supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Designation ID is required")

    if "title" in data["designation_details"]:
        if data["designation_details"]["title"]:
            title = data["designation_details"]["title"]
    if "cadre" in data["designation_details"]:
        if data["designation_details"]["cadre"]:
            cadre = data["designation_details"]["cadre"]
    if "description" in data["designation_details"]:
        if data["designation_details"]["description"]:
            description = data["designation_details"]["description"]
    if "total_slots" in data["designation_details"]:
        if data["designation_details"]["total_slots"]:
            total_slots = data["designation_details"]["total_slots"]
    if "duration_in_months" in data["designation_details"]:
        if data["designation_details"]["duration_in_months"]:
            duration_in_months = data["designation_details"]["duration_in_months"]
    if "tenure" in data["designation_details"]:
        if data["designation_details"]["tenure"]:
            tenure = data["designation_details"]["tenure"]

    try:

        if title:
            designation.title = title
            designation.save()
        if title:
            designation.cadre_id = cadre
            designation.save()
        if description:
            designation.description = description
            designation.save()
        if total_slots:
            designation.total_slots = int(total_slots)
            designation.save()
        if duration_in_months:
            designation.duration_in_months = int(duration_in_months)
            designation.save()

        if tenure:
            designation.tenure = tenure
            designation.save()

        return designation
    except Exception as e:
        raise exceptions.ValidationError(e)


# Employees
def validate_employee_data(data, user):
    errors=[]
    if not user.is_staff:
        errors.append("Not authorized")
    

    # if not "entity" in data:
    #     errors.append()
    entered_user = None
    errors = []

    try:
        employee_details = data["employee_details"]
        if employee_details == {}:
            errors.append("Employee details is empty")
    except KeyError:
        errors.append("Employee details are required")
    try:
        hire_date = data["employee_details"]["hire_date"]
    except KeyError:
        errors.append("Hire date is required")
    try:
        roles = data["employee_details"]["roles"]
        if len(roles) == 0:
            errors.append("Include at least one role ID")
    except KeyError:
        errors.append("Employee roles are required")
    try:
        user_id = data["employee_details"]["user_id"]
        # Check user exists for given ID

        entered_user = authentication_models_validators.validate_user(
            user_id)

        # Owner does not have to favorite entity
        # if entered_user == user:
        #     user.followers.add(user.entity)
        #     pass
        # else:
        #     if len(entered_user.favorite_entities.all()) < 1:
        #         errors.append("User has not favorited any entity")
        #     else:
        #         if user.entity in entered_user.favorite_entities.all():
        #             pass
        #         else:
        #             errors.append("User has not favorited your entity")

            # Check if user is already employee
        if Employees.objects.filter(user=entered_user, entity=user.entity).exists():
            errors.append(
                f"{entered_user.first_name} {entered_user.last_name} is already added as an employee {user.entity.title}"
            )
        else:
            pass
    except KeyError:
        errors.append("User ID is required")

    if len(errors) > 0:
        return errors
    else:
        return []


@transaction.atomic
def create_delivery_person(data, user):
    if user.entity.is_verified == "false":
        raise exceptions.ValidationError(
            f'{user.entity.title} is not yet verified')

    user_id = None
    entered_user
    roles = []
    if data["delivery_person_details"]["user"]:
        user_id = data["delivery_person_details"]["user"]
        if user_id == "":
            raise exceptions.ValidationError('User ID is required')
        else:
            entered_user = authentication_models_validators.existing_and_verified_user(
                user_id)
            if entered_user.is_verified == 'false':
                raise exceptions.ValidationError(
                    f'Profile of {entered_user.first_name} {entered_user.last_name} is not verified')
    if data["delivery_person_details"]["roles"]:
        roles = data["delivery_person_details"]["roles"]
    else:
        raise exceptions.ValidationError(
            'Roles to assign this user is required')

    try:
        created = DeliveryPersons.objects.create(
            user=entered_user,
            is_active=data["delivery_person_details"]["user"],
            owner=user,
            entity=user.entity,
        )
        if created and created.is_active == 'true':
            entered_user.entity = user.entity
            entered_user.save()

            # Set roles
            for role in roles:
                if Roles.objects.filter(id=role).exists():
                    role_obj = Roles.objects.filter(id=role).first()
                    created.user.roles.add(role_obj)
                else:
                    pass

            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def create_employee(data, user):
    if user.entity.is_verified == "false":
        raise exceptions.ValidationError(
            f'{user.entity.title} is not yet verified')

    terminal_date = None
    hire_date = None
    department = None
    entity = None
    designation = None
    advert = None
    new_user = None

    roles = None
    if data["employee_details"]["user_id"]:
        user_id = data["employee_details"]["user_id"]
        new_user = Users.objects.filter(id=user_id).first()
    if data["employee_details"]["roles"]:
        roles = data["employee_details"]["roles"]
    if data["employee_details"]["hire_date"]:
        hire_date = data["employee_details"]["hire_date"]
    if data["employee_details"]["terminal_date"]:
        terminal_date = data["employee_details"]["terminal_date"]
    if data["employee_details"]["department"]:
        department = data["employee_details"]["department"]
    if data["employee_details"]["designation"]:
        designation = data["employee_details"]["designation"]
    if data["employee_details"]["advert"]:
        advert = data["employee_details"]["advert"]
    try:
        created = Employees.objects.create(
            user=new_user,
            hire_date=hire_date,
            terminal_date=terminal_date,
            designation_id=designation,
            advert_id=advert,
            department_id=department,
            owner=user,
            entity=user.entity,
        )
        if created:
            new_user.entity = user.entity
            new_user.save()

            # Set roles
            for role in roles:
                if Roles.objects.filter(id=role).exists():
                    role_obj = Roles.objects.filter(id=role).first()
                    created.user.roles.add(role_obj)
                else:
                    pass
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)

@transaction.atomic
def create_corporate_employee(data, user):

    errors=[]
    input_user = None
    hire_date = None
    terminal_date = None
    current_branch = None
    entity = None
    designation = None
    department = None
    advert = None
    roles = []


    if not user.is_staff:
        errors.append("Not authorized")

    if not "entity" in data["employee_details"]:
        errors.append("Entity ID is required")
        return errors, None
    else:
        entity = authentication_models_validators.validate_entity(data["employee_details"]["entity"])

    if not "user" in data["employee_details"]:
        errors.append("User ID is required")
        return errors, None
    else:
        input_user = authentication_models_validators.validate_user(data["employee_details"]["user"])
        if Employees.objects.filter(user=input_user, entity=entity).exists():
            errors.append(f"{input_user} is already an employee at {entity}")
            return errors, None

    if not "hire_date" in data["employee_details"]:
        errors.append("Hire date is required")
        return errors, None
    else:
        hire_date = data["employee_details"]["hire_date"]

    if "terminal_date" in data["employee_details"]:
        terminal_date = data["employee_details"]["terminal_date"]

    if "current_branch" in data["employee_details"] and not data["employee_details"]["current_branch"]=="":
        current_branch = authentication_models_validators.validate_entity_branch(data["employee_details"]["current_branch"])

    if "designation" in data["employee_details"]:
        designation_id = data["employee_details"]["designation"]

    if "advert" in data["employee_details"] and not data["employee_details"]["advert"]=="":
        advert_id = data["employee_details"]["advert"]
        advert =  authentication_models_validators.validate_a

    if "department" in data["employee_details"] and not data["employee_details"]["department"]=="":
        department_id = data["employee_details"]["department"]
        department = authentication_models_validators.validate_department(department_id)
    
    if "roles" in data["employee_details"]:

        roles = data["employee_details"]['roles']
        for role in roles:
            
            role_obj = authentication_models_validators.validate_role(
                role, user)
            roles.append(role_obj)

    if len(errors)>0:
        return errors, None
    else:
        try:
            employee = Employees.objects.create(
                user=input_user,
                entity=entity,
                hire_date=hire_date,
                terminal_date=terminal_date,
                designation=designation,
                advert=advert,
                department=department,
                owner=user,
                current_branch=current_branch
            
            )

            if employee:
                if len(roles) > 0:
                    for role in roles:
                        employee.user.roles.add(role)
                return [],employee

        except Exception as e:
            errors.append(str(e))
            return errors, None


def get_entity_employees(user, data):

    if Employees.objects.filter(entity=user.entity).exists():
        return Employees.objects.filter(entity=user.entity).all()
    else:
        return []
def get_entity_employees_by_id(data):
    entity = None
    employees = []
    if not "entity" in data:
        raise exceptions.ValidationError("Entity ID is required")
    else:
        entity = validate_entity(data["entity"])

        if Employees.objects.filter(entity=entity).exists():
            employees = Employees.objects.filter(entity=entity).all()
    return employees


def get_entity_delivery_persons(user, data):

    if DeliveryPersons.objects.filter(entity=user.entity).exists():
        return DeliveryPersons.objects.filter(entity=user.entity).all()
    else:
        return []


def get_all_employees(user, data):
    return Employees.objects.all()


def get_owned_employees(user):
    return Employees.objects.filter(owner=user)


def update_employee(data, user):
    employee = None
    salary = None
    errors =[]
    try:
        employee_details = data["employee_details"]
        if data["employee_details"] == None:
           errors.append(
                "No employee details were supplied")
           return errors,None
    except KeyError:
        errors.append(
            "Employee details to update are required")
        return errors,None

    try:
        employee_id = data["employee_details"]["id"]
        print('id', employee_id)
        employee = employees_models_validators.validate_employee_by_id_only(
            employee_id)
        if Salaries.objects.filter(employee=employee).exists():
            salary = Salaries.objects.filter(employee=employee).first()
        # if data["employee_details"]["id"] == "":
        #     raise exceptions.ValidationError("Employee ID must be valid UUID")
        # if Employees.objects.filter(id=employee_id, entity=user.entity).exists():
        #     employee = Employees.objects.get(
        #         id=employee_id, entity=user.entity)

        #     if Salaries.objects.filter(employee=employee).exists():
        #         salary = Salaries.objects.filter(employee=employee).first()

        #     if user.is_staff:
        #         pass
        #     elif user == employee.owner:
        #         pass
        #     else:
        #         raise exceptions.ValidationError("Not authorized")

    except KeyError:
       errors.append("Employee ID is required")
       return errors,None

    entity = None
    department = None
    designation = None
    advert = None
    is_active = ""
    hire_date = ""
    terminal_date = ""
    basic_salary = ""
    house_allowance = ""
    other_allowance = ""
    roles = []

    if "department" in data["employee_details"]:
        if data["employee_details"]["department"]:
            department_id = data["employee_details"]["department"]
            if Departments.objects.filter(id=department_id).exists():
                department = Departments.objects.filter(
                    id=department_id).first()
            else:
                raise Exception("Department for provided ID does not exist")
    if "entity" in data["employee_details"]:
        if data["employee_details"]["entity"]:
            entity_id = data["employee_details"]["entity"]
            if Entities.objects.filter(id=entity_id).exists():
                entity = Entities.objects.filter(id=entity_id).first()
            else:
                raise Exception("Entity for provided ID does not exist")

    if "designation" in data["employee_details"]:

        if data["employee_details"]["designation"]:
            designation_id = data["employee_details"]["designation"]
            if Designations.objects.filter(id=designation_id).exists():
                designation = Designations.objects.filter(
                    id=designation_id).first()
            else:
                raise Exception("Designation for provided ID does not exist")
    if "advert" in data["employee_details"]:
        if data["employee_details"]["advert"]:
            advert_id = data["employee_details"]["advert"]
            if Adverts.objects.filter(id=advert_id).exists():
                advert = Adverts.objects.filter(id=advert_id).first()
            else:
                raise Exception("Advert for provided ID does not exist")

    if "is_active" in data["employee_details"]:
        if data["employee_details"]["is_active"]:
            is_active = data["employee_details"]["is_active"]
            employee.is_active=is_active
            employee.save()

    if "hire_date" in data["employee_details"]:
        if data["employee_details"]["hire_date"]:
            hire_date = data["employee_details"]["hire_date"]
            employee.hire_date=hire_date
            employee.save()
    if "terminal_date" in data["employee_details"]:
        if data["employee_details"]["terminal_date"]:
            terminal_date = data["employee_details"]["terminal_date"]
            employee.terminal_date=terminal_date
            employee.save()
    if "basic_salary" in data["employee_details"]:
        if data["employee_details"]["basic_salary"]:
            basic_salary = data["employee_details"]["basic_salary"]
    if "house_allowance" in data["employee_details"]:
        if data["employee_details"]["house_allowance"]:
            house_allowance = data["employee_details"]["house_allowance"]
    if "other_allowance" in data["employee_details"]:
        if data["employee_details"]["other_allowance"]:
            other_allowance = data["employee_details"]["other_allowance"]
    if "roles" in data["employee_details"]:

        roles = data["employee_details"]['roles']
        for role in roles:
            print('rolex', role)
            role_obj = authentication_models_validators.validate_role(
                role, user)

    try:

        if entity:
            # Change employee entity
            employee.entity = entity
            employee.save()
            # Change user entity
            employee.user.entity = entity
            employee.user.save()

        if department:
            employee.department = department
            employee.save()
        if designation:
            employee.designation = designation
            employee.save()
        if advert:
            employee.advert = advert
            employee.save()

        if terminal_date:
            employee.terminal_date = terminal_date
            employee.save()
        if basic_salary:
            salary.basic_salary = basic_salary
            salary.save()
        if house_allowance:
            salary.house_allowance = house_allowance
            salary.save()
        if other_allowance:
            salary.other_allowance = other_allowance
            salary.save()

        if len(roles) > 0:
            employee.user.roles.all()
            for role in roles:
                if not role == "":
                    role_obj = authentication_models_validators.validate_role(
                        role, user)
                    if not role_obj in employee.user.roles.all():
                        employee.user.roles.add(role_obj)

        return [], employee
    except Exception as e:
       errors.append(str(e))
       return errors,None                       
