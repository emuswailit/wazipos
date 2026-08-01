from services.validators import services_model_validators
from .. import models
def create_laboratory_service(data,user):
    errors =[]
    title = None
    sample = None
    sample_handling_temparature=None
    other_requirements=None
    cause_for_rejection=None
    time_to_result_unit=None
    time_to_result=None
    description=None
    created=None

    if  "title" in data and not data["title"]=="":
        title= data["title"]
    else:
        errors.append("Title is required")
        return errors,None

    if  "sample" in data and not data["sample"]=="":
        sample= data["sample"]
    else:
        errors.append("Sample is required")
        return errors,None

    if  "sample_handling_temparature" in data and not data["sample_handling_temparature"]=="":
        sample_handling_temparature= data["sample_handling_temparature"]
    else:
        errors.append("Sample handling temparature is required")
        return errors,None

    if  "time_to_result_unit" in data and not data["time_to_result_unit"]=="":
        time_to_result_unit= data["time_to_result_unit"]
    else:
        errors.append("Time to result unit is required")
        return errors,None
    
    if  "time_to_result" in data and not data["time_to_result"]=="":
        time_to_result= data["time_to_result"]
    else:
        errors.append("Time to result is required")
        return errors,None

    if  "other_requirements" in data and not data["other_requirements"]=="":
        other_requirements= data["other_requirements"]

    if  "cause_for_rejection" in data and not data["cause_for_rejection"]=="":
        cause_for_rejection= data["cause_for_rejection"]

    if  "description" in data and not data["description"]=="":
        description= data["description"]

    if models.LaboratoryServices.objects.filter(title=title.upper()).exists():
        errors.append("Laboratory test with similar title exists")
        return errors,None
    created = models.LaboratoryServices.objects.create(
        title=title,
        sample=sample,
        sample_handling_temparature=sample_handling_temparature,
        time_to_result_unit=time_to_result_unit,
        time_to_result=time_to_result,
        other_requirements=other_requirements,
        cause_for_rejection=cause_for_rejection,
        description=description,
         owner=user
        
        )
    
    return [], created


def update_laboratory_service(data,user):
    errors =[]
    laboratory_service =None
    if not "laboratory_service" in data or data["laboratory_service"]=="":
        errors.append("Laboratory service ID is required")
        return errors, None
    else:
        errors, laboratory_service=services_model_validators.validate_laboratory_services(data["laboratory_service"])
        if errors:
            return errors, None

    if "title" in data:
        if not models.LaboratoryServices.objects.filter(title=data["title"]).exists():
            laboratory_service.title=data["title"]
            laboratory_service.save()
        else:
            errors.append("Laboratory service with similar title already exists")
            return errors, None
    
    if "sample" in data and not data["sample"]=="":
        laboratory_service.sample=data["sample"]
        laboratory_service.save()

    if "time_to_result" in data and not data["time_to_result"]=="":
        laboratory_service.time_to_result=data["time_to_result"]
        laboratory_service.save()

    if len(errors)>0:
        return errors, None
    else:
        return [],laboratory_service

def update_physiotherapy_service(data,user):
    errors =[]
    physiotherapy_service =None
    if not "physiotherapy_service" in data or data["physiotherapy_service"]=="":
        errors.append("Physiotherapy service ID is required")
        return errors, None
    else:
        errors, physiotherapy_service=services_model_validators.validate_physiotherapy_services(data["physiotherapy_service"])
        if errors:
            return errors, None

    if "title" in data:
        if not models.LaboratoryServices.objects.filter(title=data["title"]).exists():
            physiotherapy_service.title=data["title"]
            physiotherapy_service.save()
        else:
            errors.append("Physiotherapy service with similar title already exists")
            return errors, None
    
    if "description" in data and not data["description"]=="":
        physiotherapy_service.description=data["description"]
        physiotherapy_service.save()



    if len(errors)>0:
        return errors, None
    else:
        return [],physiotherapy_service
    


def create_radiology_service(data,user):
    errors =[]
    title = None
    description=None
    created=None

    if  "title" in data and not data["title"]=="":
        title= data["title"]
    else:
        errors.append("Title is required")
        return errors,None

    if  "description" in data and not data["description"]=="":
        description= data["description"]

    if models.RadiologyServices.objects.filter(title=title.upper()).exists():
        errors.append("Radiology service with similar title exists")
        return errors,None
    created = models.RadiologyServices.objects.create(
        title=title,
        description=description, owner=user
        
        )
    
    return [], created


def update_radiology_service(data,user):
    errors =[]
    radiology_service =None
    if not "radiology_service" in data or data["radiology_service"]=="":
        errors.append("Radiology service ID is required")
        return errors, None
    else:
        errors, radiology_service=services_model_validators.validate_radiology_services(data["radiology_service"])
        if errors:
            return errors, None

    if "title" in data:
        if not models.LaboratoryServices.objects.filter(title=data["title"]).exists():
            radiology_service.title=data["title"]
            radiology_service.save()
        else:
            errors.append("Radiology service with similar title already exists")
            return errors, None
    
    if "description" in data and not data["description"]=="":
        radiology_service.description=data["description"]
        radiology_service.save()



    if len(errors)>0:
        return errors, None
    else:
        return [],radiology_service


def create_physiotherapy_service(data,user):
    errors =[]
    title = None
    description=None
    created=None

    if  "title" in data and not data["title"]=="":
        title= data["title"]
    else:
        errors.append("Title is required")
        return errors,None


    if  "description" in data and not data["description"]=="":
        description= data["description"]

    if models.PhysiotherapyServices.objects.filter(title=title.upper()).exists():
        errors.append("Radiology service with similar title exists")
        return errors,None
    created = models.PhysiotherapyServices.objects.create(
        title=title,
        description=description,
        owner=user
        
        )
    
    return [], created

