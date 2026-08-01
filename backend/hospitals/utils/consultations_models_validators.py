from .. import models
from rest_framework import exceptions



def validate_visit(visit_id):
    if models.Visit.objects.filter(id=visit_id, is_active=True).exists():
        return models.Visit.objects.filter(id=visit_id, is_active=True).first()
    else:
        raise exceptions.ValidationError("Visit for provided details does not exist")


def validate_departmental_visit(departmental_visit_id):
    if models.DepartmentalVisit.objects.filter(id=departmental_visit_id).exists():
        return models.DepartmentalVisit.objects.filter(id=departmental_visit_id).first()
    else:
        raise exceptions.ValidationError("Visit for provided details does not exist")
    
def validate_admission_model(id):
    errors =[]
    if models.Admission.objects.filter(id=id).exists():
        existing = models.Admission.objects.filter(id=id).first()
        return [], existing
    else:
        errors.append("No admission with provided ID exists in database")
        return errors, None
    
def validate_admission_nursing_cadex(id):
    errors =[]
    if models.AdmissionNursingCadex.objects.filter(id=id).exists():
        existing = models.AdmissionNursingCadex.objects.filter(id=id).first()
        return [], existing
    else:
        errors.append("Admission nursing cadex with provided ID exists in database")
        return errors, None
    
def validate_nursing_care_plan(id):
    errors =[]
    if models.NursingCarePlan.objects.filter(id=id).exists():
        existing = models.NursingCarePlan.objects.filter(id=id).first()
        return [], existing
    else:
        errors.append("Nursing care plan with provided ID exists in database")
        return errors, None
    
def validate_comprehension_first_cadex(id):
    errors =[]
    if models.ComprehensionFirstCadex.objects.filter(id=id).exists():
        existing = models.ComprehensionFirstCadex.objects.filter(id=id).first()
        return [], existing
    else:
        errors.append("Comprehension first cadex with provided ID exists in database")
        return errors, None