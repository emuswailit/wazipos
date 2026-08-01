from .. import models

def validate_laboratory_services(id):
    errors=[]
    laboratory_services=None
    if models.LaboratoryServices.objects.filter(id=id).exists():
        laboratory_services=models.LaboratoryServices.objects.filter(id=id).first()
        return [],laboratory_services
    else:
        errors.append("No instance exists for provided ID")
        return errors,None
    

def validate_radiology_services(id):
    errors=[]
    radology_services=None
    if models.RadiologyServices.objects.filter(id=id).exists():
        radology_services=models.RadiologyServices.objects.filter(id=id).first()
        return [],radology_services
    else:
        errors.append("No Laboratory service instance exists for provided ID")
        return errors,None
    

def validate_physiotherapy_services(id):
    errors=[]
    physiotherapy_services=None
    if models.PhysiotherapyServices.objects.filter(id=id).exists():
        physiotherapy_services=models.PhysiotherapyServices.objects.filter(id=id).first()
        return [],physiotherapy_services
    else:
        errors.append("No instance exists for provided physotherapy service ID")
        return errors,None