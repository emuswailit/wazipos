from urllib import request
from authentication.validators import authentication_models_validators
import datetime

from authentication.utils.utils import use_reference_number
from .. import models
from . import consultations_models_validators
from authentication.models import Departments
from django.db.models import Q
from products.validators import product_models_validator
from employees.validators import employees_models_validators
from authentication.models import Dependants
from core.date_utils import get_yesterday


def create_vitals(data,user):
    errors =[]
    visit = None
    dependant_id=""
    dependant = None
    departmental_visit_id=None
    departmental_visit=None
    temparature =None
    pulse =None
    respiration=None
    systolic=None
    diastolic=None
    oxygen_saturation=None



    if not "departmental_visit" in data or data["departmental_visit"]==None:
        errors.append("Department visit ID is required")
        return errors,None
    else:
        departmental_visit_id= data["departmental_visit"]
        if models.DepartmentalVisit.objects.filter(id=departmental_visit_id).exists():
            departmental_visit=models.DepartmentalVisit.objects.filter(id=departmental_visit_id).first()
        else:
            errors.append("No departmental visit with provided ID exists")
            return errors,None
        

    if not "dependant" in data or data["dependant"]==None:
        errors.append("Dependant ID is required")
        return errors,None
    else:
        dependant_id= data["dependant"]
        dependant =authentication_models_validators.validate_dependant(dependant_id)

    if not "temparature" in data or data["temparature"]==None:
        errors.append("Temparature is required")
    else:
        temparature=data["temparature"]

    if not "height" in data or data["height"]==None:
        errors.append("Height is required")
    else:
        height = data["height"]

    if not "weight" in data or data["weight"]==None:
        errors.append("Weight is required")
    else:
        weight = data["weight"]

    if "pulse" in data and not data["pulse"]==None:
        pulse=data["pulse"]

    if "oxygen_saturation" in data and not data["oxygen_saturation"]==None:
       oxygen_saturation=data["oxygen_saturation"]

    if "systolic" in data and not data["systolic"]==None:
       systolic=data["systolic"]

    if "diastolic" in data and not data["diastolic"]==None:
       diastolic=data["diastolic"]


    if "respiration" in data and not data["respiration"]==None:
       respiration=data["respiration"]


    try:
        created = models.Vitals.objects.create(
            entity=user.entity,
            departmental_visit=departmental_visit,
            diastolic=diastolic,
            systolic=systolic,
            dependant=dependant,
            temparature=temparature,
            pulse=pulse,
            respiration=respiration,
            oxygen_saturation=oxygen_saturation,
            owner=user,
            height=height,weight=weight)
        return [],created
    except Exception as e:
        errors.append(str(e))
        return errors,None


def create_consultation(data,user):
    errors =[]
    consultation=None
    department=None
    departmental_visit=None
    dependant=None
    current_complaint=None
    complaint_duration_length=None
    complaint_duration_unit=None
    location=None
    onset=None
    course=None
    aggravating_factors=None
    previous_treatment=None
    current_treatment=None
    uses_alcohol=None
    uses_tobacco=None
    is_married=None
    current_occupation=None
    current_diagnosis=None
    medication_allergies=None
    food_allergies=None
    environmental_allergies=None
    years_of_smoking=None
    cigarettes_per_day=None



    employee = employees_models_validators.validate_employee(user)

    if not "department" in data or data["department"]=="":
        errors.append("Department ID is required")
    else:
        department = authentication_models_validators.validate_department(data["department"],user)
        
    if not "dependant" in data or data["dependant"]=="":
        errors.append("Dependant ID is required")
    else:
        dependant = authentication_models_validators.validate_dependant(data["dependant"],)
    
    if models.DepartmentalVisit.objects.filter(department=department,dependant=dependant).exists():
        departmental_visit=models.DepartmentalVisit.objects.filter(department=department,dependant=dependant).first()
        if models.Consultation.objects.filter(departmental_visit=departmental_visit).exists():
            errors.append("Consultation entry already exists for this visit")
            return errors,None
    else:
        errors.append("Client visit not registered today")
        return errors,None
        
    
    if not "current_complaint" in data or data["current_complaint"]=="":
        errors.append("Current complaint entry  is required")
    else:
        current_complaint=data["current_complaint"]

    if not "complaint_duration_length" in data or data["complaint_duration_length"]=="":
        errors.append("Current complaint duration length entry  is required")
    else:
        complaint_duration_length=data["complaint_duration_length"]

    if not "complaint_duration_unit" in data or data["complaint_duration_unit"]=="":
        errors.append("Current complaint duration unit entry  is required")
    else:
        complaint_duration_unit=data["complaint_duration_unit"]
        
    if not "location" in data or data["location"]=="":
        errors.append("Current complaint location entry  is required")
    else:
        location=data["location"]


    if not "onset" in data or data["onset"]=="":
        errors.append("Current complaint onset entry  is required")
    else:
        onset=data["onset"]


    if not "uses_tobacco" in data or data["uses_tobacco"]=="":
        errors.append("Tobacco use entry  is required")
    else:
        uses_tobacco=data["uses_tobacco"]

    if not "course" in data or data["course"]=="":
        errors.append("Complaint course entry  is required")
    else:
        course=data["course"]


    if not "aggravating_factors" in data or data["aggravating_factors"]=="":
        errors.append("Aggravating factors entry  is required")
    else:
        aggravating_factors=data["aggravating_factors"]




    if not "uses_alcohol" in data or data["uses_alcohol"]=="":
        errors.append("Alcohol use entry  is required")
    else:
        uses_alcohol=data["uses_alcohol"]

    if not "uses_tobacco" in data or data["uses_tobacco"]=="":
        errors.append("Tobacco use entry  is required")
    else:
        uses_tobacco=data["uses_tobacco"]

    if not "is_married" in data or data["is_married"]=="":
        errors.append("Marital status entry  is required")
    else:
        is_married=data["is_married"]

    if not "current_occupation" in data or data["current_occupation"]=="":
        errors.append("Current occupation entry  is required")
    else:
        current_occupation=data["current_occupation"]


    if not "current_diagnosis" in data or data["current_diagnosis"]=="":
        errors.append("Current diagnosis entry  is required")
    else:
        current_diagnosis=data["current_diagnosis"]

    
    if "medication_allergies" in data and not data["medication_allergies"]=="":
        medication_allergies=data["medication_allergies"]
    if "food_allergies" in data and not data["food_allergies"]=="":
        food_allergies=data["food_allergies"]
    if "environmental_allergies" in data and not data["environmental_allergies"]=="":
        environmental_allergies=data["environmental_allergies"]
    
    if "cigarettes_per_day" in data and not data["cigarettes_per_day"]=="":
        cigarettes_per_day=data["cigarettes_per_day"]

    if "years_of_smoking" in data and not data["years_of_smoking"]=="":
        years_of_smoking=data["years_of_smoking"]
    
    if "current_treatment" in data and not data["current_treatment"]=="":
        current_treatment=data["current_treatment"]
    
    if "previous_treatment" in data and not data["previous_treatment"]=="":
        previous_treatment=data["previous_treatment"]


    if len(errors)>0:
        return errors,None
    else:
        try:
            consultation = models.Consultation.objects.create(
                entity=user.entity,
                owner=user,
                departmental_visit=departmental_visit,
                current_complaint=current_complaint,
                complaint_duration_length=complaint_duration_length,
                complaint_duration_unit=complaint_duration_unit,
                location=location,
                onset=onset,
                course=course,
                aggravating_factors=aggravating_factors,
                previous_treatment=previous_treatment,
                current_treatment=current_treatment,
                uses_tobacco=uses_tobacco,
                is_married=is_married,
                current_occupation=current_occupation,
                current_diagnosis=current_diagnosis,
                created_by=employee,
                medication_allergies=medication_allergies,
                food_allergies=food_allergies,
                environmental_allergies=environmental_allergies,
                years_of_smoking=years_of_smoking,
                cigarettes_per_day=cigarettes_per_day
            )
            if consultation:
                return [],consultation
        except Exception as  e:
            errors.append(str(e))
            return errors,None



def create_visit(data,user):
    errors =[]
    visit = None
    dependant_id=""
    dependant = None
    reference_number=""


    if not "dependant" in data or data["dependant"]==None:
        errors.append("Dependant ID is required")
        return errors,None
    else:
        dependant_id= data["dependant"]
        dependant =authentication_models_validators.validate_dependant(dependant_id)
    today = datetime.date.today()
    if models.Visit.objects.filter(
                dependant=dependant,
                created__gte=today,
                is_active=True
            ).exists():
        errors.append(f"{dependant} is already in queue")

    if len(errors)>0:
        return errors,None
    else:
        visit = models.Visit.objects.create(dependant=dependant,entity=user.entity,owner=user)
        # use_reference_number(reference_number)
        return [], visit
    
def create_departmental_visit(data,user):
    errors =[]
    departmental_visit = None
    department_id=""
    department = None
    dependant_id=None
    dependant =None

    if not "department" in data or data["department"]==None:
        errors.append("Department ID is required")
    else:
        department_id= data["department"]
    if department_id:
        if Departments.objects.filter(id=department_id).exists():
            department =Departments.objects.filter(id=department_id).first()
        else:
            errors.append("No department with provided ID exists")
            return errors,None


            
    if not "dependant" in data or data["dependant"]==None:
        errors.append("Dependant ID is required")
    else:
        dependant_id= data["dependant"]
        if Dependants.objects.filter(id=dependant_id).exists():
            dependant =Dependants.objects.filter(id=dependant_id).first()
        else:
            errors.append("No dependant with provided ID exists")
            return errors,None

        
    # yesterday = datetime.datetime.now() - datetime.timedelta(hours=24)
    today= datetime.date.today()
    if models.DepartmentalVisit.objects.filter(
                dependant=dependant,
                department=department,
                created__gte=today,
                is_active=True
            ).exists():
        errors.append(f"{dependant} has already visited this department today")
        return errors,None

    else:
        departmental_visit = models.DepartmentalVisit.objects.create(department=department,dependant=dependant,entity=user.entity,owner=user)
        return [], departmental_visit
    


def search_dependants(data):
    dependants =[]
    search_param = data['search_param']
    if Dependants.objects.filter(
                Q(user__identifier_number__icontains=search_param)
                | Q(user__phone__icontains=search_param)).exists():
        dependants = (
            Dependants.objects.filter(
                    Q(user__identifier_number__icontains=search_param)
        | Q(user__phone__icontains=search_param)
        
            )
            .all()
          
        )

        return dependants
    

def add_services_to_departmental_visit(data, user):
    errors =[]
    service_id=""
    service=None
    departmental_visit_id=""
    departmental_visit=None

    if not "departmental_visit" in data["departmental_visit_details"] or data["departmental_visit_details"]["departmental_visit"]=="":
        errors.append("Visit ID is required")
    else:
        departmental_visit_id=data["departmental_visit_details"]['departmental_visit']
        departmental_visit=consultations_models_validators.validate_departmental_visit(departmental_visit_id, user)

    if not "services" in data["departmental_visit_details"]:
        errors.append("Services are required")
    

    if len(errors)>0:
        return errors,None
    
    else:
        for service_id in data["departmental_visit_details"]['services']:
            service=product_models_validator.validate_service(service_id, user)
            departmental_visit.services.add(service)

        return [], departmental_visit.services.all()

def get_entity_departments(user):
    return Departments.objects.filter(entity=user.entity).all().order_by("title")


def get_vitals_queue(user):
    from datetime import date
    vitals_queue=[]
    if models.Visit.objects.filter(entity=user.entity,created__gte=date.today()).exists():
        vitals_queue =models.Visit.objects.filter(entity=user.entity,created__gte=date.today()).all()

    return vitals_queue
def get_dependant_consultations(data):
    dependant_id=None
    dependant=None
    dependant_consultations=[]
    if  "dependant" in data and not data["dependant"]==None:
        dependant_id= data["dependant"]
        dependant =authentication_models_validators.validate_dependant(dependant_id)

    if models.Consultation.objects.filter(departmental_visit__dependant=dependant).exists():
        dependant_consultations =models.Consultation.objects.filter(departmental_visit__dependant=dependant).all()
    return dependant_consultations

def get_dependant_vitals(data):
    dependant_id=None
    dependant=None
    dependant_vitals=[]
    if  "dependant" in data and not data["dependant"]==None:
        dependant_id= data["dependant"]
        dependant =authentication_models_validators.validate_dependant(dependant_id)

    if models.Vitals.objects.filter(dependant=dependant).exists():
        dependant_vitals =models.Vitals.objects.filter(dependant=dependant).all()
    return dependant_vitals


def get_all_departmental_visits(user):
    from datetime import date
    vitals_queue=[]
    if models.DepartmentalVisit.objects.filter(entity=user.entity,created__gte=date.today()).exists():
        vitals_queue =models.DepartmentalVisit.objects.filter(entity=user.entity,created__gte=date.today()).all()

    return vitals_queue