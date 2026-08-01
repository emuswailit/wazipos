
from rest_framework import exceptions
from ..models import DrugClass, DrugSubClass
from .drug_class_utils import validate_drug_class_data


def validate_drug_sub_class_data(data):
    errors = []
    preparation = None
    category = None
    try:
        drug_sub_class_details = data["drug_sub_class_details"]

    except KeyError:
        errors.append("Drug sub cklass details are required")
    try:
        title = data["drug_sub_class_details"]["title"]
        if data["drug_sub_class_details"]["title"] == "":
            errors.append("Title cannot be empty")
        if title and DrugSubClass.objects.filter(title=title.upper()).exists():
            errors.append(f"Drug sub class titled {title} already exists")

    except KeyError:
        errors.append("Drug sub class title is required")
    try:
        drug_class_id = data["drug_sub_class_details"]["drug_class"]
        if data["drug_sub_class_details"]["drug_class"] == "":
            errors.append("Body system ID cannot be empty")
        if drug_class_id and DrugClass.objects.filter(id=drug_class_id).exists():
            pass
        else:
            errors.append("Drug class with given ID does not exist")

    except KeyError:
        errors.append("Drug class ID is required")
    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def create_drug_sub_class(data, user):
    try:
        created = DrugSubClass.objects.create(
            title=data["drug_sub_class_details"]["title"],
            description=data["drug_sub_class_details"]["description"],
            drug_class_id=data["drug_sub_class_details"]["drug_class"],
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)


def get_all_drug_sub_classes(user):
    return DrugSubClass.objects.all()


def get_all_drug_sub_classes_for_drug_class(data):
    if not 'drug_class_id' in data or not data["drug_class_id"]:
        raise exceptions.ValidationError('Drug class ID ir required')
    drug_class_id = data["drug_class_id"]
    if drug_class_id == "":
        raise exceptions.ValidationError('Enter drug class ID')
    print('dci', drug_class_id)
    if DrugClass.objects.filter(id=drug_class_id).exists():
        if DrugSubClass.objects.filter(drug_class_id=drug_class_id).exists():
            return DrugSubClass.objects.filter(drug_class_id=drug_class_id).all()
        else:
            return []
    else:
        raise exceptions.ValidationError(
            'Drug class with the supplied ID does not exist')
    return []


def update_drug_sub_class(data, user):
    drug_sub_class = None
    drug_class = None
    try:
        drug_sub_class_id = data["drug_sub_class_details"]['id']
        if data["drug_sub_class_details"]['id'] == "":
            raise exceptions.ValidationError(
                "Drug sub class ID must be valid UUID")
        if DrugSubClass.objects.filter(id=drug_sub_class_id).exists():
            drug_sub_class = DrugSubClass.objects.get(id=drug_sub_class_id)
            if user.is_staff:
                pass
            elif user == drug_sub_class.owner:
                pass
            else:
                raise exceptions.ValidationError("Not authorized")

        else:
            raise exceptions.ValidationError(
                "Drug sub class with supplied ID does not exist")

    except KeyError:
        raise exceptions.ValidationError("Drug sub class ID is required")
    try:
        drug_sub_class_details = data["drug_sub_class_details"]
        if data["drug_sub_class_details"] == {}:
            raise exceptions.ValidationError(
                "No body system details were supplied")
    except KeyError:
        raise exceptions.ValidationError(
            "Product details to update are required")
    try:

        if 'drug_class' in data["drug_sub_class_details"] and not data["drug_sub_class_details"]['drug_class'] == '':
            drug_class_id = data["drug_sub_class_details"]['drug_class']

            if DrugClass.objects.filter(id=drug_class_id).exists():
                drug_class = DrugClass.objects.filter(id=drug_class_id).first()
            else:
                raise exceptions.ValidationError(
                    "Drug class for supplied ID does not exist")
        else:
            pass
    except KeyError:
        raise exceptions.ValidationError(
            "Drug class ID is required required")
    title = None
    description = None

    if "title" in data["drug_sub_class_details"]:
        if data["drug_sub_class_details"]["title"]:
            title = data["drug_sub_class_details"]["title"]
    if "description" in data["drug_sub_class_details"]:
        if data["drug_sub_class_details"]["description"]:
            description = data["drug_sub_class_details"]["description"]
    # if "drug_class" in data["drug_sub_class_details"]:
    #     if data["drug_sub_class_details"]["drug_class"]:
    #         drug_class = data["drug_sub_class_details"]["drug_class"]

    try:

        if title:
            drug_sub_class.title = title
            drug_sub_class.save()
        if description:
            drug_sub_class.description = description
            drug_sub_class.save()
        if drug_class:
            drug_sub_class.drug_class_id = drug_class.id
            drug_sub_class.save()

        return drug_sub_class
    except Exception as e:
        raise exceptions.ValidationError(e)
