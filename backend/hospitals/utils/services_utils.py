from .. import models
from ..validators import hospitals_model_validators
from services.validators import services_model_validators
from authentication.validators import authentication_models_validators

def create_entity_laboratory_service(data,user):
    errors=[]
    laboratory_service=None
    created =None
    charge =None
    time_to_result_unit=None
    time_to_result=None


    if "laboratory_service" in data and not data["laboratory_service"]=="":
        errors, laboratory_service = services_model_validators.validate_laboratory_services(data['laboratory_service'])
        if laboratory_service:
            if models.EntityLaboratoryServices.objects.filter(laboratory_service=laboratory_service,entity=user.entity).exists():
                errors.append(f"Similar servce already exists at {user.entity}")
                return errors,None
        else:
            return errors, None
    else:
        errors.append("Laboratory service ID is required")

    if "department" in data and not data["department"]=="":
        department = authentication_models_validators.validate_department(data['department'],user)

    else:
        errors.append("Department ID is required")

    
    if "charge" in data and not data["charge"]=="":
        charge= data["charge"]
    else:
        errors.append("Service charge is required")

    if  len(errors)>0:
        return errors,None
    else:
        created = models.EntityLaboratoryServices.objects.create(
            laboratory_service=laboratory_service,
            charge=charge,
            department=department,
            entity=user.entity,
            owner=user
            
        )


        return [],created
    
def update_entity_laboratory_service(data,user):
    errors=[]
    laboratory_service=None
    created =None
    charge =None
    time_to_result_unit=None
    time_to_result=None


    if "entity_laboratory_service" in data and not data["entity_laboratory_service"]=="":
        errors, entity_laboratory_service = hospitals_model_validators.validate_entity_laboratory_services(data['entity_laboratory_service'])
    else:
        errors.append("Entity laboratory servce ID is required")


    if "charge" in data and not data["charge"]=="":
        charge= data["charge"]
        entity_laboratory_service.charge=charge
        entity_laboratory_service.save()

    if "time_to_result_unit" in data and not data["time_to_result_unit"]=="":
        time_to_result_unit= data["time_to_result_unit"]
        entity_laboratory_service.time_to_result_unit=time_to_result_unit
        entity_laboratory_service.save()


    if "time_to_result" in data and not data["time_to_result"]=="":
        time_to_result= data["time_to_result"]
        entity_laboratory_service.time_to_result=time_to_result
        entity_laboratory_service.save()

    if len(errors)>0:
        return errors, None
    else:
        return [],entity_laboratory_service
    
def get_entity_radiology_services(user):
    entity_labporatory_servces =[]
    if models.EntityRadiologyServices.objects.filter(entity=user.entity).exists():
        entity_labporatory_servces=models.EntityRadiologyServices.objects.filter(entity=user.entity).all()
    return entity_labporatory_servces

def create_entity_radiology_service(data,user):
    errors=[]
    radiology_service=None
    created =None
    charge =None
    department =None


    if "radiology_service" in data and not data["radiology_service"]=="":
        errors, radiology_service = services_model_validators.validate_radiology_services(data['radiology_service'])
        if radiology_service:
            if models.EntityRadiologyServices.objects.filter(radiology_service=radiology_service,entity=user.entity).exists():
                errors.append(f"Similar radiology service already exists for {user.entity}")
                return errors,None
    else:
        errors.append("Radiology service ID is required")
        return errors, None
        
    if "department" in data and not data["department"]=="":
        department = authentication_models_validators.validate_department(data['department'],user)

    else:
        errors.append("Department ID is required")
    if "charge" in data and not data["charge"]=="":
        charge= data["charge"]
    else:
        errors.append("Service charge is required")

    if  len(errors)>0:
        return errors,None
    else:
        created = models.EntityRadiologyServices.objects.create(
            radiology_service=radiology_service,
            charge=charge,
            entity=user.entity,
            department=department,
            owner=user
            
        )


        return [],created
    
def update_entity_radiology_service(data,user):
    errors=[]
    laboratory_service=None
    created =None
    charge =None
    time_to_result_unit=None
    time_to_result=None


    if "entity_radiology_service" in data and not data["entity_radiology_service"]=="":
        errors, entity_radiology_service = hospitals_model_validators.validate_entity_radiology_services(data['entity_radiology_service'])
    else:
        errors.append("Entity radiology servce ID is required")

    if "charge" in data and not data["charge"]=="":
        charge= data["charge"]
        entity_radiology_service.charge=charge
        entity_radiology_service.save()


    if len(errors)>0:
        return errors, None
    else:
        return [],entity_radiology_service
    

def create_entity_physiotherapy_service(data,user):
    errors=[]
    radiology_service=None
    created =None
    charge =None
    department =None


    if "physiotherapy_service" in data and not data["physiotherapy_service"]=="":
        errors, physiotherapy_service = services_model_validators.validate_physiotherapy_services(data['physiotherapy_service'])

        if physiotherapy_service:
            if models.EntityPhysiotherapyServices.objects.filter(physiotherapy_service=physiotherapy_service,entity=user.entity).exists():
                errors.append(f"Similar physotherapy service exists for {user.entity}")
    else:
        errors.append("Physiotherapy service ID is required")
   
    if "department" in data and not data["department"]=="":
        department = authentication_models_validators.validate_department(data['department'],user)

    else:
        errors.append("Department ID is required")
    if "charge" in data and not data["charge"]=="":
        charge= data["charge"]
    else:
        errors.append("Service charge is required")

    if  len(errors)>0:
        return errors,None
    else:
        created = models.EntityPhysiotherapyServices.objects.create(
            physiotherapy_service=physiotherapy_service,
            charge=charge,
            entity=user.entity,
            department=department,
            owner=user
            
        )


        return [],created
    
def update_entity_physiotherapy_service(data,user):
    errors=[]
    charge =None
    entity_physiotherapy_service=None

    if "entity_physiotherapy_service" in data and not data["entity_physiotherapy_service"]=="":
        errors, entity_physiotherapy_service = hospitals_model_validators.validate_entity_physiotherapy_services(data['entity_physiotherapy_service'])
        if errors:
            return errors, None
    else:
        errors.append("Entity radiology servce ID is required")
        return errors, None
    if entity_physiotherapy_service:

        if "charge" in data and not data["charge"]=="":
            charge= data["charge"]
            entity_physiotherapy_service.charge=charge
            entity_physiotherapy_service.save()
    else:
        errors.append("Nope")
        return errors,None


    if len(errors)>0:
        return errors, None
    else:
        return [],entity_physiotherapy_service
    
def get_entity_laboratory_services(data,user):
    entity_laboratory_servces =[]
    if "department" in data and not data["department"]=="":
        if models.EntityLaboratoryServices.objects.filter(entity=user.entity,department_id=data["department"]).exists():
            entity_laboratory_servces=models.EntityLaboratoryServices.objects.filter(entity=user.entity,department_id=data["department"]).all()
    return entity_laboratory_servces




def get_entity_physiotherapy_services(user):
    entity_labporatory_servces =[]
    if models.EntityPhysiotherapyServices.objects.filter(entity=user.entity).exists():
        entity_labporatory_servces=models.EntityPhysiotherapyServices.objects.filter(entity=user.entity).all()
    return entity_labporatory_servces