
from .. import models
from . import consultations_models_validators
from authentication.validators import authentication_models_validators
from employees.validators import employees_models_validators
from datetime import date,datetime,timedelta
from rest_framework import exceptions
from drugs.models import Preparation,Frequency,Routes




def create_admission(data,user):
    errors=[]
    admission_type=None
    inpatient_number=None
    bed_number=None
    diagnosis=None
    discharge_date=None
    admission=None
    dependant=None
    created=None
    origin_department =None
    destination_department =None
    referral_comment =None
    if not "dependant" in data or data['dependant']==None:
        errors.append("Dependant ID is required")
        return errors,None
    else:
        dependant = authentication_models_validators.validate_dependant(data['dependant'])
    
    if not "origin_department" in data or data['origin_department']==None:
        errors.append("Department ID is required")
        return errors,None
    else:
        origin_department = authentication_models_validators.validate_department(data['origin_department'],user)

    if not "destination_department" in data or data['destination_department']==None:
        errors.append("Department ID is required")
        return errors,None
    else:
        destination_department = authentication_models_validators.validate_department(data['destination_department'],user)

    # if not "admission_type" in data or data['admission_type']==None:
    #     errors.append("Admission type is required")
    #     return errors,None
    # else:
    #     admission_type = data['admission_type']
    if "referral_comment" in data and not data["referral_comment"]=="":
        referral_comment = data["referral_comment"]
        
    if "diagnosis" in data and not data['diagnosis']==None:
        diagnosis = data['diagnosis']
    
    if "discharge_date" in data and not data['discharge_date']==None:
        discharge_date = data['discharge_date']
    
    
    if "inpatient_number" in data and not data['inpatient_number']==None:
        inpatient_number = data['inpatient_number']
    
    if "bed_number" in data and not data['bed_number']==None:
        bed_number = data['bed_number']

    if "referral_comment" in data and not data["referral_comment"]=="":
        referral_comment = data["referral_comment"]
    
    if models.Admission.objects.filter(dependant=dependant, created__gte=date.today()).exists():
        errors.append("An admission created today exists for this patient")
    if len(errors)>0:
        return errors, None
    else:
        created = models.Admission.objects.create(
            entity = user.entity,
            owner =user,
            origin_department = origin_department,
            destination_department = destination_department,
            referral_comment = referral_comment,
            dependant =dependant,
            admission_type = admission_type,
            diagnosis=diagnosis,
            bed_number=bed_number,
            inpatient_number=inpatient_number
        )
    return errors,created

def update_admission(data,user):
    errors=[]
    diagnosis=None
    discharge_date=None
    inpatient_number=None
    bed_number=None
    admission=None
    dependant=None
    created=None
    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission

    if "diagnosis" in data and not data['diagnosis']==None:
        diagnosis = data['diagnosis']
        admission.diagnosis=diagnosis
        admission.save()
    
    if "discharge_date" in data and not data['discharge_date']==None:
        discharge_date = data['discharge_date']
        admission.discharge_date=discharge_date
        admission.save()

    if "discharge_time" in data and not data['discharge_time']==None:
        discharge_time = data['discharge_time']
        admission.discharge_time=discharge_time
        admission.save()
    
    
    if "inpatient_number" in data and not data['inpatient_number']==None:
        inpatient_number = data['inpatient_number']
        admission.inpatient_number=inpatient_number
        admission.save()
    
    if "bed_number" in data and not data['bed_number']==None:
        bed_number = data['bed_number']
        admission.bed_number=bed_number
        admission.save()

    return [],admission

def get_admissions(user):
    admissions=[]
    if models.Admission.objects.filter(entity=user.entity).exists():
        admissions =models.Admission.objects.filter(entity=user.entity).all()

    return admissions
def get_dependant_admussion(data,user):
    errors =[]
    dependant=None
    admission=None
    if "dependant" in data and not data["dependant"]==None:
        dependant = authentication_models_validators.validate_dependant(data["dependant"])
        if dependant:
            if models.Admission.objects.filter(dependant=dependant,discharge_date=None,entity=user.entity).exists():
                admission =models.Admission.objects.filter(entity=user.entity,discharge_date=None,).first()
        else:
            errors.append("Patient with provided ID not found")
            return errors, None
        
    else:
        errors.append("Dependant ID is required")
        return errors, None
    return [],admission


def create_blood_pressure_chart_entry(data,user):
    errors =[]
    admission = None
    diastolic_pressure=None
    systolic_pressure=None
    created = None
    if not "admission" in data or data['admission']==None:
        errors.append("Patient admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
    if not "diastolic_pressure" in data or data['diastolic_pressure']==None:
        errors.append("Diastolic pressure reading is required")
        return errors,None
    if not "systolic_pressure" in data or data['systolic_pressure']==None:
        errors.append("Systolic pressure reading is required")
        return errors,None
    
    if len(errors)>0:
        return errors, None
    else:
        created = models.BloodPressureChart.objects.create(
            entity = user.entity,
            owner =user,
            admission = admission,
            diastolic_pressure = data['diastolic_pressure'],
            systolic_pressure = data['systolic_pressure'],
        )
    return errors, created


def create_patient_nursing_cadex_entry(data,user):
    entry = None
    created =None
    errors=[]
    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission
        
    if not "entry" in data or data['entry']==None:
        errors.append("Entry cannot be empty")
        return errors,None
    else:
        entry = data['entry']
    created = models.PatrientNursingCadex.objects.create(
        entity=user.entity,
        owner=user,
        admission=admission,
        entry = entry
    )
    
        
    return errors,created

def get_patient_nursing_cadex_entries(data,user):
    entries = []
    if "admission" in data and not data["admission"]==None:
    
        entries = models.PatrientNursingCadex.objects.filter(entity=user.entity,admission_id=data['admission']).all().order_by("-created")[:10]
    return entries

def get_patient_blood_pressure_entries(data,user):
    entries = []
    if "admission" in data and not data["admission"]==None:
    
        entries = models.BloodPressureChart.objects.filter(entity=user.entity,admission_id=data['admission']).all().order_by("-created")[:10]
    return entries

def create_continous_sheet_entry(data,user):
    entry = None
    created =None
    errors=[]
    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission
        
    if not "entry" in data or data['entry']==None:
        errors.append("Entry cannot be empty")
        return errors,None
    else:
        entry = data['entry']
    created = models.ContinousSheet.objects.create(
        entity=user.entity,
        owner=user,
        admission=admission,
        entry = entry
    )
    
        
    return errors,created

def get_continous_sheet_entries(data,user):
    entries = []
    if "admission" in data and not data["admission"]==None:
    
        entries = models.ContinousSheet.objects.filter(entity=user.entity,admission_id=data['admission']).all()
    return entries


def create_treatment_sheet_entry(data,user):
    entry = None
    created =None
    preparation =None
    frequency =None
    entry_time =None
    duration =None
    route =None
    is_dda =None
    errors=[]
    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission
    
    if not "preparation" in data or data['preparation']=="":
        errors.append("Preparation ID is required")
        return errors,None
    else:
        if Preparation.objects.filter(id=data['preparation']).exists():
            preparation= Preparation.objects.filter(id=data['preparation']).first()
        else:
            errors.append("Preparation for provided ID does not exist in database")
            return errors,None
    
    if not "frequency" in data or data['frequency']==None:
        errors.append("Frequency ID is required")
        return errors,None
    else:
        if Frequency.objects.filter(id=data['frequency']).exists():
            frequency= Frequency.objects.filter(id=data['frequency']).first()
        else:
            errors.append("Frequency for provided ID does not exist in database")
            return errors,None
    
    
    if not "route" in data or data['route']==None:
        errors.append("Route ID is required")
        return errors,None
    else:
        if Routes.objects.filter(id=data['route']).exists():
            route= Routes.objects.filter(id=data['route']).first()
        else:
            errors.append("Route for provided ID does not exist in database")
            return errors,None
         
    if not "duration" in data or data['duration']==None:
        errors.append("Duration cannot be empty")
        return errors,None
    else:
        duration = data['duration']


    if not "entry_time" in data or data['entry_time']==None:
        errors.append("Entry time cannot be empty")
        return errors,None
    else:
        entry_time = data['entry_time']
    
    
    if not "is_dda" in data or data['is_dda']==None:
        errors.append("Is drug DDA or not?")
        return errors,None
    else:
        is_dda = data['is_dda']
    hour_ago = datetime.now() - timedelta(minutes=60)
    if models.TreatmentSheet.objects.filter(
            admission=admission,
            preparation=preparation,
            owner=user,
            created__gte=hour_ago,
        ).exists():
        errors.append("Patient has been prescrbed ths drug an hour ago")

    if len(errors)>0:
        return errors,None
    else:


        created = models.TreatmentSheet.objects.create(
            entity=user.entity,
            owner=user,
            is_dda=is_dda,
            entry_time= entry_time,
            duration=duration,
            route=route,
            preparation=preparation,
            admission=admission,
            frequency=frequency,
           
        )
    
        
        return [],created

def get_treatment_sheet_entries(data,user):
    entries = []
    if "admission" in data and not data["admission"]==None:
    
        entries = models.TreatmentSheet.objects.filter(entity=user.entity,admission_id=data['admission']).all()
    return entries


def get_admission_care_plans(data,user):
    entries = []
    if "admission" in data and not data["admission"]==None:
    
        entries = models.NursingCarePlan.objects.filter(entity=user.entity,admission_id=data['admission']).all().order_by("-created")
    return entries





def get_admission_nursing_cadex_entries(data,user):
    entries = []
    if "admission" in data and not data["admission"]==None:
    
        entries = models.AdmissionNursingCadex.objects.filter(entity=user.entity,admission_id=data['admission']).all()
    return entries


def get_admission_nursing_cadex(data,user):
    admission= None
    existing = None
    errors=[]

    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission
    if admission:
        if models.AdmissionNursingCadex.objects.filter(entity=user.entity,admission_id=data['admission']).exists():
            existing = models.AdmissionNursingCadex.objects.filter(entity=user.entity,admission_id=data['admission']).first()

            
    return errors, existing


def get_comprehension_first_cadex(data,user):
    admission= None
    existing = None
    errors=[]

    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission
    if admission:
        if models.ComprehensionFirstCadex.objects.filter(entity=user.entity,admission_id=data['admission']).exists():
            existing = models.ComprehensionFirstCadex.objects.filter(entity=user.entity,admission_id=data['admission']).first()

            
    return errors, existing


def get_admission_discharge_summary(data,user):
    admission= None
    existing = None
    errors=[]

    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        print("Errors", errors)
        print("Adm", admission)
        if errors:
            return errors,None
        else:
            if admission:
                if models.DischargeSummary.objects.filter(entity=user.entity,admission_id=data['admission']).exists():
                    existing = models.DischargeSummary.objects.filter(entity=user.entity,admission_id=data['admission']).first()
                    return [], existing
                else:
                    errors.append("No discharge summary")
                    return errors, None
            

def create_admission_nursing_cadex(data,user):
    admission = None
    created =None
    past_obstetric_history =None
    socio_economic_history =None
    diagnosis =None
    past_medical_surgical_history =None
    current_disease_history =None
    development_history =None
    physical_examination =None
    errors=[]
    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission

    
    
    
    if not "diagnosis" in data or data['diagnosis']==None:
        errors.append("Diagnosis cannot be empty")
        return errors,None
    else:
        diagnosis = data['diagnosis']

    if not "current_disease_history" in data or data['current_disease_history']==None:
        errors.append("Current disease history cannot be empty")
        return errors,None
    else:
        current_disease_history = data['current_disease_history']


    if not "past_medical_surgical_history" in data or data['past_medical_surgical_history']==None:
        errors.append("Past medical/surgical history cannot be empty")
        return errors,None
    else:
        past_medical_surgical_history = data['past_medical_surgical_history']


    if not "socio_economic_history" in data or data['socio_economic_history']==None:
        errors.append("Socioeconomic history cannot be empty")
        return errors,None
    else:
        socio_economic_history = data['socio_economic_history']

    if not "past_obstetric_history" in data or data['past_obstetric_history']==None:
        errors.append("Past obstetric history cannot be empty")
        return errors,None
    else:
        past_obstetric_history = data['past_obstetric_history']





    if not "development_history" in data or data['development_history']==None:
        errors.append("Development history cannot be empty")
        return errors,None
    else:
        development_history = data['development_history']

    if not "physical_examination" in data or data['physical_examination']==None:
        errors.append("Physical examination cannot be empty")
        return errors,None
    else:
        physical_examination = data['physical_examination']

    # if "allergies" in data:
    #     pass
    

    if models.AdmissionNursingCadex.objects.filter(
            admission=admission,

        ).exists():
        
        existing=models.AdmissionNursingCadex.objects.filter(
            admission=admission,
        

        ).first()
        return [],existing

    if len(errors)>0:
        return errors,None
    else:


        created = models.AdmissionNursingCadex.objects.create(
             admission=admission,
            diagnosis=diagnosis,
            current_disease_history=current_disease_history,
            past_medical_surgical_history=past_medical_surgical_history,
            socio_economic_history=socio_economic_history,
            past_obstetric_history=past_obstetric_history,
            development_history=development_history,
            physical_examination=physical_examination,
            owner=user,
            entity=user.entity
           
        )
    
        
        return [],created
    

def update_admission_nursing_cadex(data,user):

    past_obstetric_history =None
    socio_economic_history =None
    diagnosis =None
    past_medical_surgical_history =None
    current_disease_history =None
    development_history =None
    physical_examination =None
    errors=[]
    if not "admission_nursing_cadex" in data or data['admission_nursing_cadex']==None:
        errors.append("Admission nursing cadex ID is required")
        return errors,None
    else:
        errors, admission_nursing_cadex = consultations_models_validators.validate_admission_nursing_cadex(data['admission_nursing_cadex'])
        if errors:
            return errors,admission_nursing_cadex
        elif not admission_nursing_cadex==None and not admission_nursing_cadex.owner==user:
            errors.append("You are only authorized to edit your entries")
            return errors,None
    
    if  "diagnosis" in data and not data['diagnosis']==None:
        diagnosis = data['diagnosis']
        admission_nursing_cadex.diagnosis=diagnosis
        admission_nursing_cadex.save()


    if  "current_disease_history" in data and not data['current_disease_history']==None:
        current_disease_history = data['current_disease_history']
        admission_nursing_cadex.current_disease_history=current_disease_history
        admission_nursing_cadex.save()


    if  "past_medical_surgical_history" in data and not data['past_medical_surgical_history']==None:
        past_medical_surgical_history = data['past_medical_surgical_history']
        admission_nursing_cadex.past_medical_surgical_history=past_medical_surgical_history
        admission_nursing_cadex.save()


    if  "socio_economic_history" in data and not data['socio_economic_history']==None:
        socio_economic_history = data['socio_economic_history']
        admission_nursing_cadex.socio_economic_history=socio_economic_history
        admission_nursing_cadex.save()


    if  "past_obstetric_history" in data and not data['past_obstetric_history']==None:
        past_obstetric_history = data['past_obstetric_history']
        admission_nursing_cadex.past_obstetric_history=past_obstetric_history
        admission_nursing_cadex.save()


    if  "past_obstetric_history" in data and not data['past_obstetric_history']==None:
        past_obstetric_history = data['past_obstetric_history']
        admission_nursing_cadex.past_obstetric_history=past_obstetric_history
        admission_nursing_cadex.save()


    if  "development_history" in data and not data['development_history']==None:
        development_history = data['development_history']
        admission_nursing_cadex.development_history=development_history
        admission_nursing_cadex.save()


    if  "physical_examination" in data and not data['physical_examination']==None:
        physical_examination = data['physical_examination']
        admission_nursing_cadex.physical_examination=physical_examination
        admission_nursing_cadex.save()
    
    return [],admission_nursing_cadex
    

def create_nursing_care_plan(data,user):
    admission = None
    created =None
    assessment =None
    nursing_diagnosis =None
    goals_and_expected_outcome =None
    nursing_intervention =None
    rationale =None
    evaluation =None
    errors=[]
    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission

    
    if not "assessment" in data or data['assessment']==None:
        errors.append("Assesment cannot be empty")
        return errors,None
    else:
        assessment = data['assessment']
    
    if not "nursing_diagnosis" in data or data['nursing_diagnosis']==None:
        errors.append("Nursing diagnosis cannot be empty")
        return errors,None
    else:
        nursing_diagnosis = data['nursing_diagnosis']

    if not "goals_and_expected_outcome" in data or data['goals_and_expected_outcome']==None:
        errors.append("Goals and expected outcome cannot be empty")
        return errors,None
    else:
        goals_and_expected_outcome = data['goals_and_expected_outcome']


    if not "nursing_intervention" in data or data['nursing_intervention']==None:
        errors.append("Nursing intervention cannot be empty")
        return errors,None
    else:
        nursing_intervention = data['nursing_intervention']


    if not "rationale" in data or data['rationale']==None:
        errors.append("Rationale cannot be empty")
        return errors,None
    else:
        rationale = data['rationale']

    if not "evaluation" in data or data['evaluation']==None:
        errors.append("Evaluation cannot be empty")
        return errors,None
    else:
        evaluation = data['evaluation']
    

    if models.NursingCarePlan.objects.filter(
            admission=admission,
            nursing_diagnosis=nursing_diagnosis,

        ).exists():
        errors.append("Nursing diagnosis exists for this admission")
        
        existing=models.NursingCarePlan.objects.filter(
            admission=admission,
            nursing_diagnosis=nursing_diagnosis,

        ).first()
        return [],existing

    if len(errors)>0:
        return errors,None
    else:


        created = models.NursingCarePlan.objects.create(
             admission=admission,
            nursing_diagnosis=nursing_diagnosis,
            assessment=assessment,
            goals_and_expected_outcome=goals_and_expected_outcome,
            nursing_intervention=nursing_intervention,
            rationale=rationale,
            evaluation=evaluation,
            owner=user,
            entity=user.entity
           
        )
    
        
        return [],created
    

def update_nursing_care_plan(data,user):
    nursing_care_plan = None
    assessment =None
    nursing_diagnosis =None
    goals_and_expected_outcome =None
    nursing_intervention =None
    rationale =None
    evaluation =None
    errors=[]
    if not "nursing_care_plan" in data or data['nursing_care_plan']==None:
        errors.append("Nursing care plan ID is required")
        return errors,None
    else:
        errors, nursing_care_plan = consultations_models_validators.validate_nursing_care_plan(data['nursing_care_plan'])
        if errors:
            return errors,nursing_care_plan
        elif nursing_care_plan and not nursing_care_plan.owner==user:
            errors.append("You are only athorized to update your entries")
            return errors,None
    
    if  "assessment" in data and not data['assessment']==None:
        assessment = data['assessment']
        nursing_care_plan.assessment=assessment
        nursing_care_plan.save()


    if  "nursing_diagnosis" in data and not data['nursing_diagnosis']==None:
        nursing_diagnosis = data['nursing_diagnosis']
        nursing_care_plan.nursing_diagnosis=nursing_diagnosis
        nursing_care_plan.save()


    if  "goals_and_expected_outcome" in data and not data['goals_and_expected_outcome']==None:
        goals_and_expected_outcome = data['goals_and_expected_outcome']
        nursing_care_plan.goals_and_expected_outcome=goals_and_expected_outcome
        nursing_care_plan.save()


    if  "nursing_intervention" in data and not data['nursing_intervention']==None:
        nursing_intervention = data['nursing_intervention']
        nursing_care_plan.nursing_intervention=nursing_intervention
        nursing_care_plan.save()


    if  "rationale" in data and not data['rationale']==None:
        rationale = data['rationale']
        nursing_care_plan.rationale=rationale
        nursing_care_plan.save()


    if  "evaluation" in data and not data['evaluation']==None:
        evaluation = data['evaluation']
        nursing_care_plan.evaluation=evaluation
        nursing_care_plan.save()
    
    
        
    return [],nursing_care_plan




def create_comprehension_first_cadex(data,user):
    admission = None
    created =None
    neck =None
    head =None
    chest =None
    upper_extremities =None
    abdomen =None
    inspection =None
    palpation =None
    pulse =None
    temparature =None
    diastolic_pressure =None
    systolic_pressure =None
    existing = None
    errors=[]
    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission
        elif models.ComprehensionFirstCadex.objects.filter(admission=admission).exists():
            existing=models.ComprehensionFirstCadex.objects.filter(admission=admission).first()
            return errors,existing
    
    if not "neck" in data or data['neck']==None:
        errors.append("Neck observation cannot be empty")
        return errors,None
    else:
        neck = data['neck']
    
    if not "head" in data or data['head']==None:
        errors.append("Head observation cannot be empty")
        return errors,None
    else:
        head = data['head']

    if not "chest" in data or data['chest']==None:
        errors.append("Chest observation cannot be empty")
        return errors,None
    else:
        chest = data['chest']

    if not "upper_extremities" in data or data['upper_extremities']==None:
        errors.append("Upper extremities observation cannot be empty")
        return errors,None
    else:
        upper_extremities = data['upper_extremities']


    if not "abdomen" in data or data['abdomen']==None:
        errors.append("Abdominal inspection cannot be empty")
        return errors,None
    else:
        abdomen = data['abdomen']


    if not "inspection" in data or data['inspection']==None:
        errors.append("Inspection cannot be empty")
        return errors,None
    else:
        inspection = data['inspection']

    if not "palpation" in data or data['palpation']==None:
        errors.append("Palpation cannot be empty")
        return errors,None
    else:
        palpation = data['palpation']

    if not "ausculation" in data or data['ausculation']==None:
        errors.append("Ausculation  cannot be empty")
        return errors,None
    else:
        ausculation = data['ausculation']


    if not "lower_extremities" in data or data['lower_extremities']==None:
        errors.append("Lowe extremities observation cannot be empty")
        return errors,None
    else:
        lower_extremities = data['lower_extremities']

        
    if not "temparature" in data or data['temparature']==None:
        errors.append("Temparature cannot be empty")
        return errors,None
    else:
        temparature = data['temparature']

    if not "respiration" in data or data['respiration']==None:
        errors.append("Respiration cannot be empty")
        return errors,None
    else:
        respiration = data['respiration']

    if not "pulse" in data or data['pulse']==None:
        errors.append("Pulse cannot be empty")
        return errors,None
    else:
        pulse = data['pulse']

    if not "diastolic_pressure" in data or data['diastolic_pressure']==None:
        errors.append("Diastolic pressure cannot be empty")
        return errors,None
    else:
        diastolic_pressure = data['diastolic_pressure']

    if not "systolic_pressure" in data or data['systolic_pressure']==None:
        errors.append("Diastolic pressure cannot be empty")
        return errors,None
    else:
        systolic_pressure = data['systolic_pressure']
    

    # if models.ComprehensionFirstCadex.objects.filter(
    #         admission=admission,
          

    #     ).exists():
    #     errors.append("Comprehension first cadex already exists for this admission")
        
    #     existing=models.ComprehensionFirstCadex.objects.filter(
    #         admission=admission,
           

    #     ).first()
    #     return [],existing

    if len(errors)>0:
        return errors,None
    else:

        try:
            created = models.ComprehensionFirstCadex.objects.create(
                admission=admission,
                head=head,
                neck=neck,
                chest=chest,
                upper_extremities=upper_extremities,
                abdomen=abdomen,
                inspection=inspection,
                palpation=palpation,
                ausculation=ausculation,
                lower_extremities=lower_extremities,
                temparature=temparature,
                respiration=respiration,
                pulse=pulse,
                diastolic_pressure=diastolic_pressure,
                systolic_pressure=systolic_pressure,
                owner=user,
                entity=user.entity
            )
        
            
            return [],created
        except Exception as e:
            errors.append(str(e))
            return errors, None
    

def update_comprehension_first_cadex(data,user):
    comprehension_first_cadex = None
    head =None
    neck =None
    chest =None
    upper_extremities =None
    abdomen =None
    inspection =None
    palpation =None
    ausculation =None
    lower_extremities =None
    temparature =None
    respiration =None
    errors=[]
    if not "comprehension_first_cadex" in data or data['comprehension_first_cadex']==None:
        errors.append("Comprehension first cadex ID is required")
        return errors,None
    else:
        errors, comprehension_first_cadex = consultations_models_validators.validate_comprehension_first_cadex(data['comprehension_first_cadex'])
        if errors:
            return errors,comprehension_first_cadex
        elif comprehension_first_cadex and not comprehension_first_cadex.owner==user:
            errors.append("You are only athorized to update your entries")
            return errors,None
    
    if  "head" in data and not data['head']==None:
        head = data['head']
        comprehension_first_cadex.head=head
        comprehension_first_cadex.save()


    if  "neck" in data and not data['neck']==None:
        neck = data['neck']
        comprehension_first_cadex.neck=neck
        comprehension_first_cadex.save()


    if  "chest" in data and not data['chest']==None:
        chest = data['chest']
        comprehension_first_cadex.chest=chest
        comprehension_first_cadex.save()


    if  "upper_extremities" in data and not data['upper_extremities']==None:
        upper_extremities = data['upper_extremities']
        comprehension_first_cadex.upper_extremities=upper_extremities
        comprehension_first_cadex.save()


    if  "abdomen" in data and not data['abdomen']==None:
        abdomen = data['abdomen']
        comprehension_first_cadex.abdomen=abdomen
        comprehension_first_cadex.save()


    if  "inspection" in data and not data['inspection']==None:
        inspection = data['inspection']
        comprehension_first_cadex.inspection=inspection
        comprehension_first_cadex.save()

    if  "palpation" in data and not data['palpation']==None:
        palpation = data['palpation']
        comprehension_first_cadex.palpation=palpation
        comprehension_first_cadex.save()


    if  "ausculation" in data and not data['ausculation']==None:
        ausculation = data['ausculation']
        comprehension_first_cadex.ausculation=ausculation
        comprehension_first_cadex.save()

    if  "lower_extremities" in data and not data['lower_extremities']==None:
        lower_extremities = data['lower_extremities']
        comprehension_first_cadex.lower_extremities=lower_extremities
        comprehension_first_cadex.save()


    if  "temparature" in data and not data['temparature']==None:
        temparature = data['temparature']
        comprehension_first_cadex.temparature=temparature
        comprehension_first_cadex.save()


    if  "respiration" in data and not data['respiration']==None:
        respiration = data['respiration']
        comprehension_first_cadex.respiration=respiration
        comprehension_first_cadex.save()
        
    return [],comprehension_first_cadex



def create_theatre_operation_notes(data,user):
    admission = None
    created =None
    surgeon =None
    surgeon_assistant =None
    scrub_nurse =None
    anaesthetist =None
    surgery_size =None
    surgery_type =None
    intra_operation_diagnosis =None
    procedure =None
    start_date =None
    stop_date =None
    start_time =None
    stop_time =None
    errors=[]
    if not "admission" in data or data['admission']=="":
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission
        elif models.TheatreOperationNotes.objects.filter(admission=admission,created__gte=date.today()).exists():
            errors.append("Theatre notes created today exists for this admission")
            return errors,None
    
    if not "surgeon" in data or data['surgeon']=="":
        errors.append("Surgeon ID  cannot be empty")
        return errors,None
    else:
        surgeon = employees_models_validators.validate_employee_by_id_only(data['surgeon'])

    if not "surgeon_assistant" in data or data['surgeon_assistant']=="":
        errors.append("Surgeon assistant ID  cannot be empty")
        return errors,None
    else:
        surgeon_assistant = employees_models_validators.validate_employee_by_id_only(data['surgeon_assistant'])


    if not "scrub_nurse" in data or data['scrub_nurse']==None  or data['scrub_nurse']=="":
        errors.append("Scrub nurse ID  cannot be empty")
        return errors,None
    else:
        scrub_nurse = employees_models_validators.validate_employee_by_id_only(data['scrub_nurse'])


    if not "anaesthetist" in data or data['anaesthetist']=="":
        errors.append("Anaesthetist ID  cannot be empty")
        return errors,None
    else:
        anaesthetist = employees_models_validators.validate_employee_by_id_only(data['anaesthetist'])

    
    if not "surgery_type" in data or data['surgery_type']=="":
        errors.append("Surgery type cannot be empty")
        return errors,None
    else:
        surgery_type = data['surgery_type']

    if not "surgery_size" in data or data['surgery_size']=="":
        errors.append("Surgery size cannot be empty")
        return errors,None
    else:
        surgery_size = data['surgery_size']

    if not "intra_operation_diagnosis" in data or data['intra_operation_diagnosis']=="":
        errors.append("Intra-operation diagnosis cannot be empty")
        return errors,None
    else:
        intra_operation_diagnosis = data['intra_operation_diagnosis']


    if not "procedure" in data or data['procedure']=="":
        errors.append("Abdominal inspection cannot be empty")
        return errors,None
    else:
        procedure = data['procedure']


    if not "start_date" in data or data['start_date']=="":
        errors.append("Start date cannot be empty")
        return errors,None
    else:
        start_date = data['start_date']

    if not "start_time" in data or data['start_time']=="":
        errors.append("Start time cannot be empty")
        return errors,None
    else:
        start_time = data['start_time']


    if "stop_date" in data and not  data['stop_date']=="":
        stop_date = data['stop_date']

    if "stop_time" in data and not  data['stop_time']=="":
        stop_time = data['stop_time']

        

    



    if len(errors)>0:
        return errors,None
    else:


        created = models.TheatreOperationNotes.objects.create(
             admission=admission,
            surgeon=surgeon,
            surgeon_assistant=surgeon_assistant,
            scrub_nurse=scrub_nurse,
            anaesthetist=anaesthetist,
            procedure=procedure,
            intra_operation_diagnosis=intra_operation_diagnosis,
            start_date=start_date,
            start_time=start_time,
            stop_date=stop_date,
            stop_time=stop_time,
            surgery_size=surgery_size,
            surgery_type=surgery_type,
            owner=user,
            entity=user.entity
        )
    
        
        return [],created
    

def update_theatre_operation_notes(data,user):
    theatre_operation_notes = None
    head =None
    neck =None
    chest =None
    upper_extremities =None
    abdomen =None
    inspection =None
    palpation =None
    ausculation =None
    lower_extremities =None
    temparature =None
    respiration =None
    inspection =None
    errors=[]
    if not "theatre_operation_notes" in data or data['theatre_operation_notes']==None:
        errors.append("Theatre operation notes ID is required")
        return errors,None
    else:
        errors, theatre_operation_notes = consultations_models_validators.validate_theatre_operation_notes(data['theatre_operation_notes'])
        if errors:
            return errors,theatre_operation_notes
        elif theatre_operation_notes and not theatre_operation_notes.owner==user:
            errors.append("You are only athorized to update your entries")
            return errors,None
    
    if  "stop_date" in data and not data['stop_date']==None:
        stop_date = data['stop_date']
        theatre_operation_notes.stop_date=stop_date
        theatre_operation_notes.save()


    if  "stop_time" in data and not data['stop_time']==None:
        stop_time = data['stop_time']
        theatre_operation_notes.stop_time=stop_time
        theatre_operation_notes.save()

        
    return [],theatre_operation_notes

def create_discharge_summary(data,user):
    admission = None
    created =None
    admission_diagnosis =None
    final_diagnosis =None
    other_illnesses =None
    clinical_summary =None
    investigations =None
    operations =None
    treatment =None
    recommendations =None
    existing =None
    errors=[]
    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission
        elif models.DischargeSummary.objects.filter(admission=admission).exists():
            existing = models.DischargeSummary.objects.filter(admission=admission).first()
            return [],existing
    
    if not "admission_diagnosis" in data or data['admission_diagnosis']==None:
        errors.append("Final diagnosis cannot be empty")
        return errors,None
    else:
        admission_diagnosis = data['admission_diagnosis']

    if not "final_diagnosis" in data or data['final_diagnosis']==None:
        errors.append("Final diagnosis cannot be empty")
        return errors,None
    else:
        final_diagnosis = data['final_diagnosis']
    
    if  "other_illnesses" in data and not data['other_illnesses']=="":
        other_illnesses = data['other_illnesses']

    if not "clinical_summary" in data or data['clinical_summary']==None:
        errors.append("Clinical summary cannot be empty")
        return errors,None
    else:
        clinical_summary = data['clinical_summary']

    if  "operations" in data and not  data['operations']=="":

        operations = data['operations']


    if not "investigations" in data or data['investigations']==None:
        errors.append("Abdominal inspection cannot be empty")
        return errors,None
    else:
        investigations = data['investigations']


    if not "treatment" in data or data['treatment']==None:
        errors.append("Inspection cannot be empty")
        return errors,None
    else:
        treatment = data['treatment']

    if not "recommendations" in data or data['recommendations']==None:
        errors.append("Recommendation cannot be empty")
        return errors,None
    else:
        recommendations = data['recommendations']


    if len(errors)>0:
        return errors,None
    else:


        created = models.DischargeSummary.objects.create(
             admission=admission,
            admission_diagnosis=admission_diagnosis,
            final_diagnosis=final_diagnosis,
            investigations=investigations,
            treatment=treatment,
            recommendations=recommendations,
            clinical_summary=clinical_summary,
            operations=operations,
            other_illnesses=other_illnesses,
            owner=user,
            entity=user.entity
        )
    
        
        return [],created
    

def update_discharge_summary(data,user):
    discharge_summary = None
    admission_diagnosis =None
    final_diagnosis =None
    other_illnesses =None
    clinical_summary =None
    investigations =None
    operations =None
    treatment =None
    recommendations =None
    errors=[]
    if not "discharge_summary" in data or data['discharge_summary']==None:
        errors.append("Discharge summary ID is required")
        return errors,None
    else:
        errors, discharge_summary = consultations_models_validators.validate_discharge_summary(data['discharge_summary'])
        if errors:
            return errors,discharge_summary
        elif discharge_summary and not discharge_summary.owner==user:
            errors.append("You are only athorized to update your entries")
            return errors,None
    
    if  "admission_diagnosis" in data and not data['admission_diagnosis']==None:
        admission_diagnosis = data['admission_diagnosis']
        discharge_summary.admission_diagnosis=admission_diagnosis
        discharge_summary.save()


    if  "final_diagnosis" in data and not data['final_diagnosis']==None:
        final_diagnosis = data['final_diagnosis']
        discharge_summary.final_diagnosis=final_diagnosis
        discharge_summary.save()


    if  "other_illnesses" in data and not data['other_illnesses']==None:
        other_illnesses = data['other_illnesses']
        discharge_summary.other_illnesses=other_illnesses
        discharge_summary.save()


    if  "clinical_summary" in data and not data['clinical_summary']==None:
        clinical_summary = data['clinical_summary']
        discharge_summary.clinical_summary=clinical_summary
        discharge_summary.save()


    if  "investigations" in data and not data['investigations']==None:
        investigations = data['investigations']
        discharge_summary.investigations=investigations
        discharge_summary.save()


    if  "treatment" in data and not data['treatment']==None:
        treatment = data['treatment']
        discharge_summary.treatment=treatment
        discharge_summary.save()

    if  "recommendations" in data and not data['recommendations']==None:
        recommendations = data['recommendations']
        discharge_summary.recommendations=recommendations
        discharge_summary.save()


    if  "operations" in data and not data['operations']==None:
        operations = data['operations']
        discharge_summary.operations=operations
        discharge_summary.save()

        
    return [],discharge_summary



def create_maternity_admission_chart(data,user):
    admission = None
    created =None
    errors=[]
    gravida =None
    tetanus_vaccine_given =None
    parity =None
    alive =None
    dead =None
    stillbirths =None
    caesarean =None
    hospital_deliveries =None
    abortions =None
    fundal_height =None
    fetal_heart_rate =None
    abdominal_engagement =None
    presentation =None
    abdominal_position =None
    abdominal_contraction =None
    vaginal_membranes =None
    vaginal_draining =None
    vaginal_level =None
    pelvis =None
    msu =None
    presenting_part =None
    last_menstrual_period =None
    estimated_delivery_date =None
    gestation_in_weeks =None
    dead_before_arrival =None
    height_below_150_cm =None
    periods_regular =None
    is_attending_anc =None
    is_anaemic =None
    has_oedema =None
    enema_given =None
    prolonged_labour =None
    ante_partum_haemorrhage =None
    post_partum_haemorrhage =None
    general_condition =None
    recommendations =None

    errors=[]
    if not "admission" in data or data['admission']==None:
        errors.append("Admission ID is required")
        return errors,None
    else:
        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors,admission
        elif models.DischargeSummary.objects.filter(admission=admission).exists():
            errors.append("Discharge summary already exists for this admission")
            return errors,None
    
    if not "gravida" in data or data['gravida']==None:
        errors.append("Gravida cannot be empty")
        return errors,None
    else:
        gravida = data['gravida']

    if not "tetanus_vaccine_given" in data or data['tetanus_vaccine_given']==None:
        errors.append("Tetanus vaccine administration status cannot be empty")
        return errors,None
    else:
        tetanus_vaccine_given = data['tetanus_vaccine_given']
    
    if not "parity" in data or data['parity']==None:
        errors.append("Parity cannot be empty")
        return errors,None
    else:
        parity = data['parity']

    if not "alive" in data or data['alive']==None:
        errors.append("Alive births cannot be empty")
        return errors,None
    else:
        alive = data['alive']

    if not "dead" in data or data['dead']==None:
        errors.append("Dead births cannot be empty")
        return errors,None
    else:
        dead = data['dead']

    if not "stillbirths" in data or data['stillbirths']==None:
        errors.append("Stillbirth deliveries cannot be empty")
        return errors,None
    else:
        stillbirths = data['stillbirths']

    if not "caesarean" in data or data['caesarean']==None:
        errors.append("Caesarean births cannot be empty")
        return errors,None
    else:
        caesarean = data['caesarean']

    if not "vacuum" in data or data['vacuum']==None:
        errors.append("Vacuum births cannot be empty")
        return errors,None
    else:
        vacuum = data['vacuum']
    
    
    if not "hospital_deliveries" in data or data['hospital_deliveries']==None:
        errors.append("Hospital deliveries cannot be empty")
        return errors,None
    else:
        hospital_deliveries = data['hospital_deliveries']

    if not "abortions" in data or data['abortions']==None:
        errors.append("Abortions cannot be empty")
        return errors,None
    else:
        abortions = data['abortions']

    if not "fundal_height" in data or data['fundal_height']==None:
        errors.append("Fundal height cannot be empty")
        return errors,None
    else:
        fundal_height = data['fundal_height']

    if not "fetal_heart_rate" in data or data['fetal_heart_rate']==None:
        errors.append("Fetal heart rate cannot be empty")
        return errors,None
    else:
        fetal_heart_rate = data['fetal_heart_rate']

    if not "abdominal_engagement" in data or data['abdominal_engagement']==None:
        errors.append("Abdomonal engagement cannot be empty")
        return errors,None
    else:
        abdominal_engagement = data['abdominal_engagement']

    if not "presentation" in data or data['presentation']==None:
        errors.append("Presentation cannot be empty")
        return errors,None
    else:
        presentation = data['presentation']

    if not "abdominal_position" in data or data['abdominal_position']==None:
        errors.append("Abdominal position cannot be empty")
        return errors,None
    else:
        abdominal_position = data['abdominal_position']
        
    if not "abdominal_contraction" in data or data['abdominal_contraction']==None:
        errors.append("Abdominal contraction cannot be empty")
        return errors,None
    else:
        abdominal_contraction = data['abdominal_contraction']


    if not "vaginal_examination_reason" in data or data['vaginal_examination_reason']==None:
        errors.append("Vaginal examination reason cannot be empty")
        return errors,None
    else:
        vaginal_examination_reason = data['vaginal_examination_reason']


    if not "cervical_condition" in data or data['cervical_condition']==None:
        errors.append("Cervical condition cannot be empty")
        return errors,None
    else:
        cervical_condition = data['cervical_condition']

    if not "vaginal_membranes" in data or data['vaginal_membranes']==None:
        errors.append("vaginal membranes status cannot be empty")
        return errors,None
    else:
        vaginal_membranes = data['vaginal_membranes']

    if not "vaginal_draining" in data or data['vaginal_draining']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        vaginal_draining = data['vaginal_draining']
    
    if not "vaginal_level" in data or data['vaginal_level']==None:
        errors.append("Vaginal level cannot be empty")
        return errors,None
    else:
        vaginal_level = data['vaginal_level']


    if not "pelvis" in data or data['pelvis']==None:
        errors.append("Pelvic observation cannot be empty")
        return errors,None
    else:
        pelvis = data['pelvis']

    # if not "msu" in data or data['msu']==None:
    #     errors.append("Vaginal draining cannot be empty")
    #     return errors,None
    # else:
    #     msu = data['msu']

    if not "presenting_part" in data or data['presenting_part']==None:
        errors.append("Presenting part cannot be empty")
        return errors,None
    else:
        presenting_part = data['presenting_part']

    if not "last_menstrual_period" in data or data['last_menstrual_period']==None:
        errors.append("Last menstruation period  cannot be empty")
        return errors,None
    else:
        last_menstrual_period = data['last_menstrual_period']

    if not "estimated_delivery_date" in data or data['estimated_delivery_date']==None:
        errors.append("Estimated delivery date cannot be empty")
        return errors,None
    else:
        estimated_delivery_date = data['estimated_delivery_date']


    if not "gestation_in_weeks" in data or data['gestation_in_weeks']==None:
        errors.append("gestation in weeks cannot be empty")
        return errors,None
    else:
        gestation_in_weeks = data['gestation_in_weeks']

    if not "dead_before_arrival" in data or data['dead_before_arrival']==None:
        errors.append("Dead before arrival cannot be empty")
        return errors,None
    else:
        dead_before_arrival = data['dead_before_arrival']


    if not "height_below_150_cm" in data or data['height_below_150_cm']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        height_below_150_cm = data['height_below_150_cm']

    if not "height_below_150_cm" in data or data['height_below_150_cm']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        height_below_150_cm = data['height_below_150_cm']

    if not "periods_regular" in data or data['periods_regular']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        periods_regular = data['periods_regular']


    if not "periods_regular" in data or data['periods_regular']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        periods_regular = data['periods_regular']

    if not "is_attending_anc" in data or data['is_attending_anc']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        is_attending_anc = data['is_attending_anc']

    if not "is_anaemic" in data or data['is_anaemic']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        is_anaemic = data['is_anaemic']

    if not "has_oedema" in data or data['has_oedema']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        has_oedema = data['has_oedema']

    if not "enema_given" in data or data['enema_given']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        enema_given = data['enema_given']

    if not "prolonged_labour" in data or data['prolonged_labour']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        prolonged_labour = data['prolonged_labour']

    if not "ante_partum_haemorrhage" in data or data['ante_partum_haemorrhage']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        ante_partum_haemorrhage = data['ante_partum_haemorrhage']

    if not "post_partum_haemorrhage" in data or data['post_partum_haemorrhage']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        post_partum_haemorrhage = data['post_partum_haemorrhage']

    if not "general_condition" in data or data['general_condition']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        general_condition = data['general_condition']

    if not "recommendations" in data or data['recommendations']==None:
        errors.append("Vaginal draining cannot be empty")
        return errors,None
    else:
        recommendations = data['recommendations']


    if len(errors)>0:
        return errors,None
    else:


        created = models.MaternityAdmissionChart.objects.create(
             admission=admission,
    gravida =gravida,
    tetanus_vaccine_given =tetanus_vaccine_given,
    parity =parity,
    alive =alive,
    dead =dead,
    stillbirths =stillbirths,
    caesarean =caesarean,
    hospital_deliveries =hospital_deliveries,
    abortions =abortions,
    fundal_height =fundal_height,
    fetal_heart_rate =fetal_heart_rate,
    abdominal_engagement =abdominal_engagement,
    presentation =presentation,
    abdominal_position =abdominal_position,
    abdominal_contraction =abdominal_contraction,
    vaginal_membranes =vaginal_membranes,
    vaginal_draining =vaginal_draining,
    vaginal_level =vaginal_level,
    pelvis =pelvis,
    presenting_part =presenting_part,
    last_menstrual_period =last_menstrual_period,
    estimated_delivery_date =estimated_delivery_date,
    gestation_in_weeks =gestation_in_weeks,
    dead_before_arrival =dead_before_arrival,
    height_below_150_cm =height_below_150_cm,
    periods_regular =periods_regular,
    is_attending_anc =is_attending_anc,
    is_anaemic =is_anaemic,
    has_oedema =has_oedema,
    enema_given =enema_given,
    prolonged_labour =prolonged_labour,
    ante_partum_haemorrhage =ante_partum_haemorrhage,
    post_partum_haemorrhage =post_partum_haemorrhage,
    general_condition =general_condition,
    recommendations =recommendations,
            owner=user,
            entity=user.entity
        )
    
        
        return [],created
    

def update_maternity_admission_chart(data,user):
    discharge_summary = None
    admission_diagnosis =None
    final_diagnosis =None
    other_illnesses =None
    clinical_summary =None
    investigations =None
    operations =None
    treatment =None
    recommendations =None
    errors=[]
    if not "discharge_summary" in data or data['discharge_summary']==None:
        errors.append("Discharge summary ID is required")
        return errors,None
    else:
        errors, discharge_summary = consultations_models_validators.validate_discharge_summary(data['discharge_summary'])
        if errors:
            return errors,discharge_summary
        elif discharge_summary and not discharge_summary.owner==user:
            errors.append("You are only athorized to update your entries")
            return errors,None
    
    if  "admission_diagnosis" in data and not data['admission_diagnosis']==None:
        admission_diagnosis = data['admission_diagnosis']
        discharge_summary.admission_diagnosis=admission_diagnosis
        discharge_summary.save()


    if  "final_diagnosis" in data and not data['final_diagnosis']==None:
        final_diagnosis = data['final_diagnosis']
        discharge_summary.final_diagnosis=final_diagnosis
        discharge_summary.save()


    if  "other_illnesses" in data and not data['other_illnesses']==None:
        other_illnesses = data['other_illnesses']
        discharge_summary.other_illnesses=other_illnesses
        discharge_summary.save()


    if  "clinical_summary" in data and not data['clinical_summary']==None:
        clinical_summary = data['clinical_summary']
        discharge_summary.clinical_summary=clinical_summary
        discharge_summary.save()


    if  "investigations" in data and not data['investigations']==None:
        investigations = data['investigations']
        discharge_summary.investigations=investigations
        discharge_summary.save()


    if  "treatment" in data and not data['treatment']==None:
        treatment = data['treatment']
        discharge_summary.treatment=treatment
        discharge_summary.save()

    if  "recommendations" in data and not data['recommendations']==None:
        recommendations = data['recommendations']
        discharge_summary.recommendations=recommendations
        discharge_summary.save()


    if  "operations" in data and not data['operations']==None:
        operations = data['operations']
        discharge_summary.operations=operations
        discharge_summary.save()

        
    return [],discharge_summary