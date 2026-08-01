from datetime import datetime
from django.db import models
from core.models import EntityRelatedModel
from authentication.models import Dependants,Departments,Allergies
from drugs.models import Preparation,   Routes, Frequency
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
from services.models import LaboratoryServices,RadiologyServices,PhysiotherapyServices
from logistics.models import EntitySubStore,EntityStore,EntitySubStoreReceipts
from django.db.models.signals import post_save
from django.dispatch import receiver
from utils.logging import create_log

from encrypted_model_fields.fields import EncryptedCharField, EncryptedIntegerField,EncryptedBooleanField,EncryptedTextField


User = get_user_model()
TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)

DOCUMENT_TYPE_CHOICES = (
        ("NationalId", "NationalId"),
        ("Passport", "Passport"),
    )

class TimeToResultUnitOptions(models.TextChoices):
    Minutes = "Minutes", _("Minutes")
    Hours = "Hours", _("Hours")
    Days = "Days", _("Days")

class EntityLaboratoryServices(EntityRelatedModel):

    laboratory_service = models.ForeignKey(
        LaboratoryServices,  on_delete=models.CASCADE)
    department = models.ForeignKey(
        Departments,  on_delete=models.CASCADE,null=True,blank=True)
    charge = models.DecimalField(decimal_places=2,max_digits=12)
    owner = models.ForeignKey(
        User, related_name="entity_laboratory_service_creator", on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.laboratory_service.title}-{self.entity.title}"
    
class EntityRadiologyServices(EntityRelatedModel):

    radiology_service = models.ForeignKey(
        RadiologyServices,  on_delete=models.CASCADE)
    department = models.ForeignKey(
        Departments,  on_delete=models.CASCADE,null=True,blank=True)
    charge = models.DecimalField(decimal_places=2,max_digits=12)
    owner = models.ForeignKey(
        User, related_name="entity_radiology_service_creator", on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.laboratory_service.title}-{self.entity.title}"
    
class EntityPhysiotherapyServices(EntityRelatedModel):

    physiotherapy_service = models.ForeignKey(
        PhysiotherapyServices,  on_delete=models.CASCADE)
    department = models.ForeignKey(
        Departments,  on_delete=models.CASCADE,null=True,blank=True)
    charge = models.DecimalField(decimal_places=2,max_digits=12)
    owner = models.ForeignKey(
        User, related_name="entity_physiotherapy_service_creator", on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.laboratory_service.title}-{self.entity.title}"

class VisitorTickets(EntityRelatedModel):
    from authentication.models import Countries

    """
    Visitors models
    """
    department = models.ForeignKey(
        Departments, related_name="department_to_visit", on_delete=models.DO_NOTHING, null=True, blank=True)
    country = models.ForeignKey(
        Countries, related_name="visitor_nationality", on_delete=models.CASCADE
    )

    visitor_names = models.CharField(max_length=50,null=True, blank=True)
    visitor_phone = models.CharField(max_length=50,null=True, blank=True)
    
    identifier_type = models.CharField(
        max_length=50, choices=DOCUMENT_TYPE_CHOICES, default="false"
    )
    identifier_number = models.CharField(max_length=50,null=True, blank=True)
    arrival_time = models.DateTimeField(auto_now_add=True)
    departure_time = models.DateTimeField(null=True,blank=True)
    visitor_number = models.CharField(
        max_length=20,)
    comment = models.TextField(null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    class Meta:
        verbose_name_plural = "Visitor Tickets"

    # def generate_visitor_number(self):
    #     entity_today_length=0
    #     if self.visitor_number:
    #         return
    #     entry_number =None                
    #     title = ""
    #     title = self.department.title
    #     title = title.replace(" ", "")
    #     title = re.sub('[^A-Za-z0-9]+', '', title)
    #     title = re.sub("\(.*?\)", "", title)
    #     title = re.sub("\[.*?\]", "", title)
    #     title = re.sub(r"[-()\"#/@;:<>{}`+=~|.!?,]", "", title)
    #     first_lettera = title[:4]
    #     if self.objects.filter(entity=self.entity,created__gte=datetime.today()).exists():
    #         entity_today_length = self.objects.filter(entity=self.entity,created_gte=datetime.today()).count()
    #     entry_number = str(first_lettera+entity_today_length).upper()

    #     return entry_number

    # def save(self, *args, **kwargs):
    #     if not self.visitor_number or self.visitor_number==None:
    #         self.visitor_number = self.generate_visitor_number()
            
    #     super(VisitorTickets, self).save(*args, **kwargs)

class Slots(EntityRelatedModel):

    """
    Model for appointment slots
    -Slots must be created prior by entity
    -Users will only see available slots and pay to reserve them
    """
    employee = models.ForeignKey(
        "employees.Employees", related_name="employee_for_slot", on_delete=models.CASCADE, null=True, blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    amount = models.DecimalField(
        max_digits=10, decimal_places=2)
    is_available = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)

    # def save(self, *args, **kwargs):
    #     try:
    #         Slots.objects.get(Q(start_time__range=(self.start_time, self.end_time)) | Q(end_time__range=(
    #             self.start_time, self.end_time)) | Q(start_time__lt=self.start_time, end_time__gt=self.end_time))
    #         # raise some save error
    #     except Slots.DoesNotExist:
    #         super(Slots, self).save(*args, **kwargs)

    def __str__(self):
        return f"From {self.start} to {self.end}"

    def title(self):
        date = self.start_time.strftime("%Y-%m-%d")
        start = self.start_time.strftime("%H:%M")
        end = self.end_time.strftime("%H:%M")
        return f"{date} from {start} to {end} - {self.department.title}"

    def start(self):
        start_t = self.start_time.timestamp()
        return f"{start_t}"

    def end(self):
        end_t = self.end_time.timestamp()
        return f"{end_t}"

    # def is_available(self):
    #     return Appointments.objects.filter(slot=self).count() < 1

    # class Meta:
    #     unique_together = ('entity', 'department', 'start_time', 'end_time')

    # objects = SlotsManager()

class Appointments(EntityRelatedModel):

    """
    -Model for a reservation payment

    -Create an appointment only after this payment is saved
    """
    PAYMENT_STATUS_CHOICES = (
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("FAILED", "FAILED"),
    )
    ATTENDANCE_STATUS_CHOICES = (
        ("SCHEDULED", "SCHEDULED"),
        ("ATTENDED", "ATTENDED"),
        ("ABSCONDED", "ABSCONDED"),
        ("RESCHEDULED", "RESCHEDULED"),
        ("CANCELLED", "CANCELLED"),
    )

    dependant = models.ForeignKey(
        Dependants,  on_delete=models.CASCADE)
    slot = models.ForeignKey(Slots, on_delete=models.CASCADE)
    attendance_status = models.CharField(
        max_length=100, choices=ATTENDANCE_STATUS_CHOICES, default="PENDING")
    owner = models.ForeignKey(
        User, related_name="reservation_creator", on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.entity.title

    def is_pending(self):
        return self.slot.start_time.timestamp() > datetime.now().timestamp()

class Visit(EntityRelatedModel):

    """
    Model for appointment slots
    -Slots must be created prior by entity
    -Users will only see available slots and pay to reserve them
    """
    dependant = models.ForeignKey(
        Dependants, related_name="visiting_dependant", on_delete=models.CASCADE, null=True, blank=True)
    appointment = models.ForeignKey(Appointments,related_name="visit_appointment",null=True,blank=True,on_delete=models.CASCADE)
    department = models.ForeignKey(
        Departments, related_name="visit_department", on_delete=models.CASCADE, null=True, blank=True)
    appointment = models.ForeignKey(Appointments,related_name="visit_appointment",null=True,blank=True,on_delete=models.CASCADE)
    checkin_time = models.DateTimeField(auto_now_add=True)
    checkout_time = models.DateTimeField(null=True,blank=True)
    # reference_number = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)
    created = models.DateField(auto_now_add=True)
    updated = models.DateField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)

class DepartmentalVisit(EntityRelatedModel):
    """
    Departments visited during visit
    """
    dependant = models.ForeignKey(
        Dependants,related_name="departmental_visit_dependant", on_delete=models.DO_NOTHING, null=True, blank=True)
    department = models.ForeignKey(
        Departments, related_name="departmental_visit_department", on_delete=models.DO_NOTHING, null=True, blank=True)
    appointment = models.ForeignKey(
        Appointments, related_name="departmental_visit_appointment", on_delete=models.DO_NOTHING, null=True, blank=True)
    checkin_time = models.DateTimeField(auto_now_add=True)
    checkout_time = models.DateTimeField(null=True,blank=True)
    running_number = models.IntegerField(
        default=1)
    # services = models.ManyToManyField(Services,blank=True)
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    class Meta:
        verbose_name_plural = "Departmental Visits"

class Vitals(EntityRelatedModel):
    departmental_visit = models.ForeignKey(
        DepartmentalVisit,related_name="departmental_visit_vitals", null=True, blank=True,  on_delete=models.CASCADE)
    dependant = models.ForeignKey(
        Dependants, related_name="vitals_dependant", on_delete=models.CASCADE)
    temparature = models.DecimalField(decimal_places=2, max_digits=5)
    pulse = models.IntegerField(null=True,blank=True)
    respiration = models.IntegerField(null=True,blank=True)
    systolic = models.IntegerField(null=True,blank=True)
    diastolic = models.IntegerField(null=True,blank=True)
    oxygen_saturation = models.IntegerField(null=True,blank=True)
    weight = models.IntegerField(null=True,blank=True)
    height = models.IntegerField(null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)

class AdmissionTypeOptions(models.TextChoices):
    TRAUMA = "TRAUMA", _("TRAUMA")
    MATERNITY = "MATERNITY", _("MATERNITY")
    OTHER = "OTHER", _("OTHER") 

class Consultation(EntityRelatedModel):

    COMPLAINT_DURATION_UNIT = (
        ("DAYS", "DAYS"),
        ("WEEKS", "WEEKS"),
        ("MONTHS", "MONTHS"),
        ("YEARS", "YEARS"),
    )
    MARITAL_STATUS_CHOICES = (
        ("SINGLE", "SINGLE"),
        ("MARRIED", "MARRIED"),
        ("DIVORCED", "DIVORCED"),
        ("UNDERAGE", "UNDERAGE"),
    )

    USES_TOBACCO_CHOICES = (
        ("YES", "YES"),
        ("NO", "NO"),
        ("QUIT", "QUIT"),
    )
    USES_ALCOHOL_CHOICES = (
        ("", ""),
        ("YES", "YES"),
        ("NO", "NO"),
        ("QUIT", "QUIT"),
    )
    departmental_visit = models.OneToOneField(
        DepartmentalVisit, related_name="consultation_departmental_visit", on_delete=models.CASCADE,null=True,blank=True)

    current_complaint = EncryptedTextField()
    complaint_duration_length = EncryptedIntegerField(default=0)
    complaint_duration_unit = EncryptedCharField(
        max_length=100, choices=COMPLAINT_DURATION_UNIT)
    location = EncryptedCharField(max_length=100)
    onset = EncryptedCharField(max_length=300)
    course = EncryptedCharField(max_length=300)
    aggravating_factors = EncryptedTextField(null=True, blank=True)
    previous_treatment = EncryptedTextField(null=True, blank=True)
    current_treatment = EncryptedTextField(null=True, blank=True)
    uses_alcohol = EncryptedCharField(
        max_length=100, choices=USES_ALCOHOL_CHOICES,default="")
    uses_tobacco = EncryptedCharField(
        max_length=100, choices=USES_TOBACCO_CHOICES)
    cigarettes_per_day= EncryptedIntegerField(default=0)
    years_of_smoking= EncryptedIntegerField(default=0)
    is_married =EncryptedCharField(
        max_length=100, choices=MARITAL_STATUS_CHOICES)
    current_occupation = EncryptedTextField()
    medication_allergies = EncryptedTextField(null=True, blank=True)
    food_allergies = EncryptedTextField(null=True, blank=True)
    environmental_allergies = EncryptedTextField(null=True, blank=True)
    current_diagnosis =EncryptedTextField()
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        "employees.Employees", on_delete=models.CASCADE,null=True,blank=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
 
class Admission(EntityRelatedModel):
    """Model admissions"""
    dependant = models.ForeignKey(
        Dependants,related_name="admission_dependant", on_delete=models.CASCADE)
    origin_department = models.ForeignKey(
        Departments, related_name="admission_origin_department",on_delete=models.CASCADE,null=True,blank=True)
    destination_department = models.ForeignKey(
        Departments, related_name="admission_destination_department",on_delete=models.CASCADE,blank=True,null=True)
    bed_number = models.CharField(max_length=112,null=True,blank=True)
    inpatient_number = models.CharField(max_length=112,null=True,blank=True)
    diagnosis = models.CharField(max_length=255, null=True, blank=True)
    admission_date = models.DateTimeField(auto_now_add=True)
    discharge_date = models.DateTimeField(null=True,blank=True)
    discharge_time = models.DateTimeField(null=True,blank=True)
    referral_comment=models.TextField(null=True,blank=True)
    admission_type = models.CharField(
        verbose_name=_("Admission Type"),
        choices=AdmissionTypeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.dependant.first_name} {self.dependant.last_name}"

class PatrientNursingCadex(EntityRelatedModel):
    """Model for Nursing Cadex"""
    admission = models.ForeignKey(
        Admission,related_name="patient_nursing_cadex_admission", on_delete=models.CASCADE)
    entry = models.TextField() 
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"

class ContinousSheet(EntityRelatedModel):
    """Model for Continous Sheet"""
    admission = models.ForeignKey(
        Admission,related_name="continous_sheet_admission", on_delete=models.CASCADE)
    entry = models.TextField() 
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"
    
class EntryTimeOptions(models.TextChoices):
    Morning = "Morning", _("Morning")
    Afternoon = "Afternoon", _("Afternoon")
    Evening = "Evening", _("Evening") 
    Night = "Night", _("Night") 

class TreatmentSheet(EntityRelatedModel):
    """Model for Treatment Sheet"""
    admission = models.ForeignKey(
        Admission,related_name="treatment_sheet_admission", on_delete=models.CASCADE)
    preparation = models.ForeignKey(
        Preparation,related_name="tmreatment_sheet_drug", on_delete=models.CASCADE)
    frequency = models.ForeignKey(
        Frequency,related_name="treatment_sheet_drug_frequency", on_delete=models.CASCADE)
    route = models.ForeignKey(
        Routes,related_name="treatment_sheet_drug", on_delete=models.CASCADE)
    duration = models.IntegerField(default=0)
    allergies = models.ManyToManyField(Allergies)
    entry_time = models.CharField(
        verbose_name=_("Entry Time"),
        choices=EntryTimeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )

    is_dda = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    

    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"
    
class AdmissionNursingCadex(EntityRelatedModel):
    """Model for Admission Nursing Cadex"""
    admission = models.ForeignKey(
        Admission,related_name="admission_nursing_cadex_admission", on_delete=models.CASCADE)
    diagnosis = models.TextField() 
    current_disease_history = models.TextField() 
    past_medical_surgical_history = models.TextField() 
    socio_economic_history = models.TextField() 
    past_obstetric_history = models.TextField() 
    development_history = models.TextField() 
    physical_examination = models.TextField() 
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"
    
class NursingCarePlan(EntityRelatedModel):
    """Model for Nursing Care Plan"""
    admission = models.ForeignKey(
        Admission,related_name="nursing_care_plan_admission", on_delete=models.CASCADE)
    assessment = models.CharField(max_length=256) 
    nursing_diagnosis = models.CharField(max_length=256) 
    goals_and_expected_outcome = models.CharField(max_length=256) 
    nursing_intervention = models.CharField(max_length=256) 
    rationale = models.CharField(max_length=256) 
    evaluation = models.CharField(max_length=256) 
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"
    
class ComprehensionFirstCadex(EntityRelatedModel):
    """Model for Comprehension First Cadex"""
    admission = models.ForeignKey(
        Admission,related_name="comprehension_first_cadex_admission", on_delete=models.CASCADE)
    head = models.CharField(max_length=256) 
    neck = models.CharField(max_length=256) 
    chest = models.CharField(max_length=256) 
    upper_extremities = models.CharField(max_length=256) 
    abdomen = models.CharField(max_length=256) 
    inspection = models.CharField(max_length=256) 
    palpation = models.CharField(max_length=256) 
    ausculation = models.CharField(max_length=256) 
    lower_extremities = models.CharField(max_length=256) 
    diastolic_pressure = models.IntegerField(null=True,blank=True)
    systolic_pressure = models.IntegerField(null=True,blank=True)
    plan_of_action = models.TextField(null=True,blank=True) 

    temparature = models.DecimalField(null=True,blank=True,decimal_places=2,max_digits=5) 
    respiration = models.IntegerField(null=True,blank=True) 
    pulse = models.IntegerField(null=True,blank=True) 
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"
    
class BloodPressureChart(EntityRelatedModel):
    """Model for Blood Pressure Chart"""
    admission = models.ForeignKey(
        Admission,related_name="blood_pressure_chart_admission", on_delete=models.CASCADE)
    diastolic_pressure = models.IntegerField() 
    systolic_pressure = models.IntegerField() 
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"
    
class SurgeryTypeOptions(models.TextChoices):
    Elective = "Elective", _("Elective")
    Emergency = "Emergency", _("Emergency")

class SurgerySizeOptions(models.TextChoices):
    Minor = "Minor", _("Minor")
    Major = "Major", _("Major")

class TheatreOperationNotes(EntityRelatedModel):
    """Model for Theatre Operation Notes"""
    admission = models.ForeignKey(
        Admission,related_name="theatre_opeartion_notes_admission", on_delete=models.CASCADE)
    surgeon = models.ForeignKey(
        "employees.Employees",related_name="theatre_opeartion_surgeon", on_delete=models.CASCADE)
    surgeon_assistant = models.ForeignKey(
        "employees.Employees",related_name="theatre_opeartion_surgeon_assistant", on_delete=models.CASCADE)
    scrub_nurse = models.ForeignKey(
        "employees.Employees",related_name="theatre_opeartion_scrub_nurse", on_delete=models.CASCADE)
    anaesthetist = models.ForeignKey(
        "employees.Employees",related_name="theatre_opeartion_anaesthetist", on_delete=models.CASCADE)
    surgery_type = models.CharField(
        verbose_name=_("Surgery Type"),
        choices=SurgeryTypeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    surgery_size = models.CharField(
        verbose_name=_("Surgery Size"),
        choices=SurgerySizeOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    intra_operation_diagnosis = models.CharField(max_length=256) 
    procedure = models.CharField(max_length=256) 
    start_date = models.DateField(null=True,blank=True)
    stop_date = models.DateField(null=True,blank=True)
    start_time = models.TimeField(null=True,blank=True)
    stop_time = models.TimeField(null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"
    
class DischargeSummary(EntityRelatedModel):
    """Model for Discharge Summary"""
    admission = models.ForeignKey(
        Admission,related_name="discharge_summary_admission", on_delete=models.CASCADE)
    final_diagnosis = models.TextField() 
    admission_diagnosis = models.TextField() 
    other_illnesses = models.TextField(null=True,blank=True) 
    clinical_summary = models.TextField() 
    operations = models.TextField() 
    investigations = models.TextField() 
    treatment = models.TextField() 
    recommendations = models.TextField() 
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    
    
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"

class GravidaOptions(models.TextChoices):
    Multigravida = "Multigravida", _("Multigravida")
    Nulligravida = "Nulligravida", _("Nulligravida")
    Primigravida = "Primigravida", _("Primigravida")

class TetanusVaccineOptions(models.TextChoices):
    No = "No", _("No")
    Once = "Once", _("Once")
    Twice = "Twice", _("Twice")

class MaternityAdmissionChart(EntityRelatedModel):
    """Model for Maternity Admission"""
    admission = models.ForeignKey(
        Admission,related_name="maternity_admission", on_delete=models.CASCADE)
    gravida = models.CharField(
        verbose_name=_("Gravida"),
        choices=GravidaOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    tetanus_vaccine_given = models.CharField(
        verbose_name=_("Gravida"),
        choices=TetanusVaccineOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )

    parity = models.IntegerField() 
    alive = models.IntegerField(default=0) 
    dead = models.IntegerField(default=0) 
    stillbirths = models.IntegerField(default=0) 
    caesarean = models.IntegerField(default=0) 
    vacuum = models.IntegerField(default=0) 
    hospital_deliveries = models.IntegerField(default=0) 
    abortions = models.IntegerField(default=0) 
    fundal_height = models.IntegerField() 
    fetal_heart_rate = models.IntegerField() 
    abdominal_engagement = models.CharField(max_length=256) 
    presentation = models.CharField(max_length=256) 
    abdominal_position = models.CharField(max_length=256) 
    abdominal_contraction = models.CharField(max_length=256) 
    vaginal_examination_reason = models.CharField(max_length=256) 
    cervical_condition = models.CharField(max_length=256) 
    vaginal_dilatation = models.CharField(max_length=256) 
    vaginal_membranes = models.CharField(max_length=256) 
    vaginal_draining = models.CharField(max_length=256) 
    vaginal_level = models.CharField(max_length=256) 
    # vaginal_position = models.CharField(max_length=256) 
    # blood_smear = models.CharField(max_length=256) 
    pelvis = models.CharField(max_length=256) 
    # msu = models.CharField(max_length=256) 
    # stool = models.C//////harField(max_length=256) 
    presenting_part = models.CharField(max_length=256) 
    # high_vaginal_swab = models.CharField(max_length=256) 
    # vdrl = models.CharField(max_length=256) 
    # blood_group = models.CharField(max_length=12) 
    last_menstrual_period = models.DateField() 
    estimated_delivery_date = models.DateField() 
    gestation_in_weeks = models.IntegerField(default=40) 
    dead_before_arrival = models.IntegerField() 
    birth_before_arrival = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    height_below_150_cm = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    periods_regular = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_attending_anc = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_anaemic = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    has_oedema = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    enema_given = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    prolonged_labour = models.TextField() 
    ante_partum_haemorrhage = models.TextField() 
    post_partum_haemorrhage = models.TextField() 
    general_condition = models.TextField() 
    # treatment = models.TextField() 
    recommendations = models.TextField() 
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"
    
class LaboratoryOrders(EntityRelatedModel):
    """Model for laboratory orders"""
    LABORATORY_ORDER_STATUS_CHOICES = (
        ("CANCELLED", "CANCELLED"),
        ("CLOSED", "CLOSED"),
        ("PROCESSING", "PROCESSING"),
        ("COMPLETE", "COMPLETE"),
       
    )
    admission = models.ForeignKey(
        Admission,related_name="laboratory_order_admission", on_delete=models.CASCADE,null=True,blank=True)
    origin_department = models.ForeignKey(
        Departments,related_name="laboratory_order_origin_department", on_delete=models.CASCADE,null=True,blank=True)
    destination_department = models.ForeignKey(
        Departments,related_name="laboratory_order_destination_department", on_delete=models.CASCADE,null=True,blank=True)
    dependant = models.ForeignKey(
        Dependants,related_name="laboratory_order_dependant", on_delete=models.CASCADE)
    created_by = models.ForeignKey(
            "employees.Employees",related_name="laboratory_order_created_by", on_delete=models.CASCADE)
    referral_comment=models.TextField(null=True,blank=True)
    is_closed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    status = models.CharField(
            max_length=120, choices=LABORATORY_ORDER_STATUS_CHOICES,default="PROCESSING"
        )
    is_paid = models.CharField(
        max_length=120, choices=TRUE_FALSE_OPTIONS,default="false"
    )
    reference_number = models.CharField(max_length=28,null=True,blank=True)
    order_total_price=models.DecimalField(decimal_places=2,max_digits=12,default=0.00)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        ## Update precreated order payment amount
        laboratory_order_payment = None
        if LaboratoryOrderPayments.objects.filter(laboratory_order=self).exists():
            laboratory_order_payment = LaboratoryOrderPayments.objects.filter(laboratory_order=self).first()
            laboratory_order_payment.amount = self.order_total_price
            laboratory_order_payment.save()
        super(LaboratoryOrders, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.dependant.first_name} {self.dependant.last_name} on {self.created}"
    
class LaboratoryExaminations(EntityRelatedModel):
    """Model for laboratory examination"""
    laboratory_order = models.ForeignKey(
        LaboratoryOrders,related_name="laboratory_examination_order", on_delete=models.CASCADE)
    examination = models.ForeignKey(
        EntityLaboratoryServices,related_name="laboratory_examination_examination", on_delete=models.CASCADE)
    requested_by = models.ForeignKey(
            "employees.Employees",related_name="laboratory_examination_requested_by", on_delete=models.CASCADE)
    processed_by = models.ForeignKey(
            "employees.Employees",related_name="laboratory_examination_processed_by", on_delete=models.CASCADE,null=True,blank=True)
    reported_by = models.ForeignKey(
            "employees.Employees",related_name="laboratory_examination_reported_by", on_delete=models.CASCADE,null=True,blank=True)
    report = models.TextField(null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    
    def save(self, *args, **kwargs):
        if self.examination.charge:
            self.laboratory_order.order_total_price = float(self.laboratory_order.order_total_price) + float(self.examination.charge)
            self.laboratory_order.save()  
        super(LaboratoryExaminations, self).save(*args, **kwargs)
    
    
    
    def __str__(self):
        return f"{self.laboratory_order.dependant.first_name} {self.laboratory_order.dependant.last_name} on {self.created}"


class RadiologyOrders(EntityRelatedModel):
    """Model for radiology orders"""
    RADIOLOGY_ORDER_STATUS_CHOICES = (
        ("CANCELLED", "CANCELLED"),
        ("CLOSED", "CLOSED"),
        ("PROCESSING", "PROCESSING"),
        ("COMPLETE", "COMPLETE"),
       
    )
    admission = models.ForeignKey(
        Admission,related_name="radiology_order_admission", on_delete=models.CASCADE,null=True,blank=True)
    origin_department = models.ForeignKey(
        Departments,related_name="radiology_order_origin_department", on_delete=models.CASCADE,null=True,blank=True)
    destination_department = models.ForeignKey(
        Departments,related_name="radiology_order_destination_department", on_delete=models.CASCADE,null=True,blank=True)
    dependant = models.ForeignKey(
        Dependants,related_name="radiology_order_dependant", on_delete=models.CASCADE)
    referral_comment=models.TextField(null=True,blank=True)
    created_by = models.ForeignKey(
            "employees.Employees",related_name="radiology_order_created_by", on_delete=models.CASCADE)
    is_closed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_paid = models.CharField(
        max_length=120, choices=TRUE_FALSE_OPTIONS,default="false"
    ) 
    status = models.CharField(
            max_length=120, choices=RADIOLOGY_ORDER_STATUS_CHOICES,default="PROCESSING"
        )
    reference_number = models.CharField(max_length=28,null=True,blank=True)
    order_total_price=models.DecimalField(decimal_places=2,max_digits=12,default=0.00)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        ## Update precreated order payment amount
        radiology_order_payment = None
        if RadiologyOrderPayments.objects.filter(radiology_order=self).exists():
            radiology_order_payment = RadiologyOrderPayments.objects.filter(radiology_order=self).first()
            radiology_order_payment.amount = self.order_total_price
            radiology_order_payment.save()
        super(RadiologyOrders, self).save(*args, **kwargs)
    
    
    def __str__(self):
        return f"{self.dependant.first_name} {self.dependant.last_name} on {self.created}"
    
class RadiologyExaminations(EntityRelatedModel):
    """Model for radiology examinations"""
    radiology_order = models.ForeignKey(
        RadiologyOrders,related_name="radiology_examination_order", on_delete=models.CASCADE)
    examination = models.ForeignKey(
        EntityRadiologyServices,related_name="radiology_examination_examination", on_delete=models.CASCADE)
    requested_by = models.ForeignKey(
            "employees.Employees",related_name="radiology_examination_requested_by", on_delete=models.CASCADE)
    processed_by = models.ForeignKey(
            "employees.Employees",related_name="radiology_examination_processed_by", on_delete=models.CASCADE,null=True,blank=True)
    reported_by = models.ForeignKey(
            "employees.Employees",related_name="radiology_examination_reported_by", on_delete=models.CASCADE,null=True,blank=True)
    report = models.TextField(null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    
    def save(self, *args, **kwargs):
        if self.examination.charge:
            self.radiology_order.order_total_price = float(self.radiology_order.order_total_price) + float(self.examination.charge)
            self.radiology_order.save()  
        super(RadiologyExaminations, self).save(*args, **kwargs)
    
    
    
    def __str__(self):
        return f"{self.dependant.first_name} {self.dependant.last_name} on {self.created}"

class PhysiotherapyOrders(EntityRelatedModel):
    """Model for physiotherapy orders"""
    PHYSIOTHERAPY_ORDER_STATUS_CHOICES = (
        ("CANCELLED", "CANCELLED"),
        ("CLOSED", "CLOSED"),
        ("OPEN", "OPEN"),
        ("COMPLETE", "COMPLETE"),
       
    )
    admission = models.ForeignKey(
            Admission,related_name="physiotherapy_order_admission", on_delete=models.CASCADE,null=True,blank=True)
    origin_department = models.ForeignKey(
        Departments,related_name="physiotherapy_order_origin_department", on_delete=models.CASCADE,null=True,blank=True)
    destination_department = models.ForeignKey(
        Departments,related_name="physiotherapy_order_destination_department", on_delete=models.CASCADE,null=True,blank=True)
    dependant = models.ForeignKey(
        Dependants,related_name="physiotherapy_order_dependant", on_delete=models.CASCADE)
    referral_comment=models.TextField(null=True,blank=True)
    created_by = models.ForeignKey(
            "employees.Employees",related_name="physiotherapy_order_created_by", on_delete=models.CASCADE)
    is_closed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    reference_number = models.CharField(max_length=28,null=True,blank=True)
    status = models.CharField(
            max_length=120, choices=PHYSIOTHERAPY_ORDER_STATUS_CHOICES,default="OPEN"
        )
    is_paid = models.CharField(
        max_length=120, choices=TRUE_FALSE_OPTIONS,default="false"
    )
    order_total_price=models.DecimalField(decimal_places=2,max_digits=12,default=0.00)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    
    def save(self, *args, **kwargs):
        ## Update precreated order payment amount
        physiotherapy_order_payment = None
        if PhysiotherapyOrderPayments.objects.filter(physiotherapy_order=self).exists():
            physiotherapy_order_payment = PhysiotherapyOrderPayments.objects.filter(physiotherapy_order=self).first()
            physiotherapy_order_payment.amount = self.order_total_price
            physiotherapy_order_payment.save()
        super(PhysiotherapyOrders, self).save(*args, **kwargs)   
    
    def __str__(self):
        return f"{self.dependant.first_name} {self.dependant.last_name} on {self.created}"
    
class PhysiotherapyProcedures(EntityRelatedModel):
    """Model for physiotherapy procedures"""
    physiotherapy_order = models.ForeignKey(
        PhysiotherapyOrders,related_name="physiotherapy_order", on_delete=models.CASCADE)
    procedure = models.ForeignKey(
        EntityPhysiotherapyServices,related_name="physiotherapy_procedure_procedure", on_delete=models.CASCADE)
    requested_by = models.ForeignKey(
            "employees.Employees",related_name="physiotherapy_procedure_requested_by", on_delete=models.CASCADE)
    processed_by = models.ForeignKey(
            "employees.Employees",related_name="physiotherapy_procedure_processed_by", on_delete=models.CASCADE,null=True,blank=True)
    reported_by = models.ForeignKey(
            "employees.Employees",related_name="physiotherapy_procedure_reported_by", on_delete=models.CASCADE,null=True,blank=True)
    # sessions = models.IntegerField(default=1)
    # session_charge=models.DecimalField(decimal_places=2,max_digits=12)
    # total_sessions_charge=models.DecimalField(decimal_places=2,max_digits=12)
    report = models.TextField(null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.admission.dependant.first_name} {self.admission.dependant.last_name} on {self.created}"
    
    def save(self, *args, **kwargs):
        if self.procedure.charge:
            self.physiotherapy_order.order_total_price = float(self.physiotherapy_order.order_total_price) + float(self.procedure.charge)
            self.physiotherapy_order.save()  
        super(PhysiotherapyProcedures, self).save(*args, **kwargs)


    
class HospitalPrescription(EntityRelatedModel):
    """Model for hospital inventory"""
    PRESCRIPTION_STATUS_CHOICES = (
        ("CANCELLED", "CANCELLED"),
        ("CLOSED", "CLOSED"),
        ("DISPENSED", "DISPENSED"),
        ("QUEUING", "QUEUING"),
    )
    PRESCRIPTION_NATURE_CHOICES = (
        ("DISCHARGE", "DISCHARGE"),
        ("INPATIENT", "INPATIENT"),
        ("OUTPATIENT", "OUTPATIENT"),
    )
    entity_store = models.ForeignKey(
        EntityStore,related_name="hospital_prescription_to_facility_sub_store", on_delete=models.CASCADE,null=True,blank=True)
    admission = models.ForeignKey(
        Admission,related_name="hospital_prescription_admission", on_delete=models.CASCADE,null=True,blank=True)
    entity_sub_store = models.ForeignKey(
        EntitySubStore,related_name="hospital_prescription_to_facility_sub_store", on_delete=models.CASCADE,null=True,blank=True)
    origin_department = models.ForeignKey(
        Departments,related_name="hospital_prescription_origin_department", on_delete=models.CASCADE,null=True,blank=True)
    destination_department = models.ForeignKey(
        Departments,related_name="hospital_prescription_destination_department", on_delete=models.CASCADE,null=True,blank=True)
    dependant = models.ForeignKey(
        Dependants,related_name="hospital_prescription_dependant", on_delete=models.CASCADE)
    created_by = models.ForeignKey(
            "employees.Employees",related_name="hospital_prescription_created_by", on_delete=models.CASCADE)
    interpreted_by = models.ForeignKey(
            "employees.Employees",related_name="hospital_prescription_interpreted_by", on_delete=models.CASCADE,null=True,blank=True)  
    is_closed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_dispensed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    status = models.CharField(
        max_length=120, choices=PRESCRIPTION_STATUS_CHOICES,default="OPEN"
    )
    nature = models.CharField(
        max_length=120, choices=PRESCRIPTION_NATURE_CHOICES,
    )
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    def __str__(self):
        return f"{self.dependant.first_name} {self.dependant.last_name} on {self.created}"
    
class HospitalPrescriptionItem(EntityRelatedModel):
    """Model for hospital prescription item"""
    hospital_prescription = models.ForeignKey(
        HospitalPrescription,related_name="hospital_prescription_item_prescription", on_delete=models.CASCADE)

    preparation = models.ForeignKey(
        Preparation,related_name="hospital_prescription_item_preparation", on_delete=models.CASCADE,null=True,blank=True)
    product = models.ForeignKey(
        "products.Products",related_name="hospital_prescription_item_preparation", on_delete=models.CASCADE,null=True,blank=True)
    prescribed_by = models.ForeignKey(
            "employees.Employees",related_name="hospital_prescription_item_prescribed_by", on_delete=models.CASCADE)

    route = models.ForeignKey(
            Routes,related_name="hospital_prescription_item_route", on_delete=models.CASCADE,null=True,blank=True)
    frequency = models.ForeignKey(
            Frequency,related_name="hospital_prescription_item_frequency", on_delete=models.CASCADE,null=True,blank=True)

    dose = models.CharField(max_length=128)
    days = models.IntegerField()
    interpreted_by = models.ForeignKey(
            "employees.Employees",related_name="hospital_prescription_item_interpreted_by", on_delete=models.CASCADE,null=True,blank=True)
    required_unit_quantity=models.IntegerField(default=0)
    issued_unit_quantity=models.IntegerField(default=0)
    balance_unit_quantity=models.IntegerField(default=0)
    instruction = models.CharField(max_length=256,null=True,blank=True)
    created_by = models.ForeignKey(
            "employees.Employees",related_name="hospital_prescription_item_created_by", on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.id}"
        # return f"{self.hospital_prescription.dependant.first_name} {self.hospital_prescription.dependant.last_name} on {self.created}"
    
class HospitalPrescriptionItemAdministrations(EntityRelatedModel):
    hospital_prescription_item = models.ForeignKey(
            HospitalPrescriptionItem,related_name="hospital_prescription_item_administration_hospital_prescription_item", on_delete=models.CASCADE,null=True,blank=True)
    administration_date = models.DateField()
    administration_time = models.TimeField()
    is_administered = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    comment = models.CharField(
        max_length=120, null=True,blank=True
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)


def convert_time(time_str):
    if time_str.startswith("24:"):
        return "00:" + time_str[3:]
    return time_str

@receiver(post_save, sender=HospitalPrescriptionItem)
def create_hospital_presciption_item_administrations_model(sender, instance, created, **kwargs):
    from datetime import datetime,date, timedelta
    if created and instance:
        try:
            print("Am at receiver")
            date_count=-1
            administration_date=date.today()
            
            time_apart =0
            if instance.days:
                for day in range(instance.days):
                    date_count = date_count+1
                    administration_date = date.today() + timedelta(days=date_count)
                    administration_time=0
                    
                    if instance.frequency.numerical:
                        time_apart = 24/int(instance.frequency.numerical)
                        for i in range(int(instance.frequency.numerical)):
                            
                            
                            administration_time=int(administration_time+24/int(instance.frequency.numerical))
                            print("Dates", administration_date)
                            print("Times",  time_apart)

                            ## Two decimal places
                            # administration_time_dp="{:2f}".format(int(administration_time))
                            # administration_time_dp=administration_time
                            # print("administration_time_dp",administration_time_dp)
                            # print("l administration_time_dp",len(administration_time_dp))

                            if len(str(administration_time))==1:
                                administration_time_f= "0"+ str(administration_time)+":00"
                            else:
                                administration_time_f = str(administration_time)+":00"
                            
                            print("l administration_time_f",len(administration_time_f))
                            print("administration_time_f",administration_time_f)

                            time_time=datetime.strptime(convert_time(administration_time_f),  '%H:%M').time()
                            # print("administration_time", "{:.2f}".format(administration_time) )
                            created = HospitalPrescriptionItemAdministrations.objects.create(hospital_prescription_item=instance, administration_date=administration_date, administration_time=time_time,owner = instance.owner,entity=instance.entity)
        except Exception as e:
            print(str(e))
                            
                                

class PrescriptionOrders(EntityRelatedModel):
    """Hospital prescription orders"""
    PRESCRIPTION_ORDER_STATUS_CHOICES = (
        ("CANCELLED", "CANCELLED"),
        ("CLOSED", "CLOSED"),
        ("OPEN", "OPEN"),
        ("COMPLETE", "COMPLETE"),
       
    )
    admission = models.ForeignKey(
            Admission,related_name="prescription_order_admission", on_delete=models.CASCADE,null=True,blank=True)
    hospital_prescription = models.ForeignKey(
        HospitalPrescription, related_name="prescription_orders_prescription",on_delete=models.CASCADE)
    entity_store = models.ForeignKey(
        EntityStore, related_name="entity_store_issue_entity_store",on_delete=models.CASCADE,null=True,blank=True)
    entity_sub_store = models.ForeignKey(
        EntitySubStore, related_name="entity_store_issue_entity_sub_store",on_delete=models.CASCADE,null=True,blank=True)
    order_total_price=models.DecimalField(decimal_places=2,max_digits=12)
    employee = models.ForeignKey(
            "employees.Employees",related_name="prescription_order_employee", on_delete=models.CASCADE,null=True,blank=True)
    status = models.CharField(
        max_length=120, choices=PRESCRIPTION_ORDER_STATUS_CHOICES,
    )
    reference_number = models.CharField(max_length=28,null=True,blank=True)
    is_paid = models.CharField(
        max_length=120, choices=TRUE_FALSE_OPTIONS,default="false"
    )
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    
    def save(self, *args, **kwargs):
        ## Update precreated order payment amount
        prescription_order_payment = None
        if PrescriptionOrderPayments.objects.filter(prescription_order=self).exists():
            prescription_order_payment = PrescriptionOrderPayments.objects.filter(prescription_order=self).first()
            prescription_order_payment.amount = self.order_total_price
            prescription_order_payment.save()
        super(PrescriptionOrders, self).save(*args, **kwargs)

        
class PrescriptionOrderItems(EntityRelatedModel):
    """Prescription order items"""
    prescription_order = models.ForeignKey(
        PrescriptionOrders, related_name="prescription_order_item_prescription_order",on_delete=models.CASCADE)
    hospital_prescription_item = models.ForeignKey(
        HospitalPrescriptionItem,on_delete=models.CASCADE)
    entity_sub_store_receipt = models.ForeignKey(
        EntitySubStoreReceipts,on_delete=models.CASCADE,null=True,blank=True)
    issued_unit_quantity=models.IntegerField()
    item_total_price=models.DecimalField(decimal_places=2,max_digits=12)
    dispensed_by = models.ForeignKey(
            "employees.Employees",related_name="prescription_order_item_dispensed_by", on_delete=models.CASCADE,null=True,blank=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    
    def save(self, *args, **kwargs):
        
        self.prescription_order.order_total_price = float(self.prescription_order.order_total_price) + float(self.item_total_price)
        self.prescription_order.save()  
        super(PrescriptionOrderItems, self).save(*args, **kwargs)

        
    

class PrescriptionOrderPayments(EntityRelatedModel):
    """Hospital prescription order payments"""
    PAYMENT_STATUS_CHOICES = (
        ("INITIATED", "INITIATED"),
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )
    prescription_order = models.OneToOneField(
        PrescriptionOrders, on_delete=models.DO_NOTHING)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",on_delete=models.CASCADE,null=True,blank=True)
    amount=models.DecimalField(decimal_places=2,max_digits=12,default=0.00)
    reference_number = models.CharField(max_length=28,null=True,blank=True)
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )
    psp_reference_number = models.CharField(max_length=28,null=True,blank=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    
@receiver(post_save, sender=PrescriptionOrders)
def create_prescription_order_payment_model(sender, instance, created, **kwargs):
    if created and instance:
        try:
            if not PrescriptionOrderPayments.objects.filter(prescription_order=instance).exists():
                prescription_order_payment = PrescriptionOrderPayments.objects.create(
                    prescription_order=instance,
                    amount=instance.order_total_price,
                    status="INITIATED",
                    owner=instance.owner,
                    entity=instance.entity
                )
            else:
                create_log("info", "Prescription Order Payment already created")
        except Exception as e:
            create_log("error",str(e))




class LaboratoryOrderPayments(EntityRelatedModel):
    """Laboratory order payments"""
    PAYMENT_STATUS_CHOICES = (
        ("INITIATED", "INITIATED"),
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )
    laboratory_order = models.OneToOneField(
        LaboratoryOrders, on_delete=models.DO_NOTHING)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",on_delete=models.CASCADE,null=True,blank=True)
    amount=models.DecimalField(decimal_places=2,max_digits=12)
    reference_number = models.CharField(max_length=28,null=True,blank=True)
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )
    psp_reference_number = models.CharField(max_length=28,null=True,blank=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    ## Create laboratory order payment on the fly
@receiver(post_save, sender=LaboratoryOrders)
def create_laboratory_order_payment_model(sender, instance, created, **kwargs):
    if created and instance:
        try:
            if not LaboratoryOrderPayments.objects.filter(laboratory_order=instance).exists():
                laboratory_order_payment = LaboratoryOrderPayments.objects.create(
                    laboratory_order=instance,
                    amount=instance.order_total_price,
                    status="INITIATED",
                    owner=instance.owner,
                    entity=instance.entity
                )
            else:
                create_log("info", "Laboratory Order Payment already created")
        except Exception as e:
            create_log("error",str(e))
    
class PhysiotherapyOrderPayments(EntityRelatedModel):
    """Physiotherapy order payments"""
    PAYMENT_STATUS_CHOICES = (
        ("INITIATED", "INITIATED"),
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )
    physiotherapy_order = models.OneToOneField(
        PhysiotherapyOrders, on_delete=models.DO_NOTHING)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",on_delete=models.CASCADE,null=True,blank=True)
    amount=models.DecimalField(decimal_places=2,max_digits=12)
    reference_number = models.CharField(max_length=28,null=True,blank=True)
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )
    psp_reference_number = models.CharField(max_length=28,null=True,blank=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    
@receiver(post_save, sender=PhysiotherapyOrders)
def create_physiotherapy_order_payment_model(sender, instance, created, **kwargs):
    if created and instance:
        try:
            if not PhysiotherapyOrderPayments.objects.filter(physiotherapy_order=instance).exists():
                physiotherapy_order_payment = PhysiotherapyOrderPayments.objects.create(
                    physiotherapy_order=instance,
                    amount=instance.order_total_price,
                    status="INITIATED",
                    owner=instance.owner,
                    entity=instance.entity
                )
            else:
                create_log("info", "Physiotherapy Order Payment already created")
        except Exception as e:
            create_log("error",str(e))
    
class RadiologyOrderPayments(EntityRelatedModel):
    """Radiology order payments"""
    PAYMENT_STATUS_CHOICES = (
        ("INITIATED", "INITIATED"),
        ("PENDING", "PENDING"),
        ("SUCCESS", "SUCCESS"),
        ("CANCELLED", "CANCELLED"),
        ("FAILED", "FAILED"),
    )
    radiology_order = models.OneToOneField(
        RadiologyOrders, on_delete=models.DO_NOTHING)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",on_delete=models.CASCADE,null=True,blank=True)
    amount=models.DecimalField(decimal_places=2,max_digits=12)
    reference_number = models.CharField(max_length=28,null=True,blank=True)
    status = models.CharField(
        max_length=120, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )
    psp_reference_number = models.CharField(max_length=28,null=True,blank=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)

@receiver(post_save, sender=RadiologyOrders)
def create_radiology_order_payment_model(sender, instance, created, **kwargs):
    if created and instance:
        try:
            if not RadiologyOrderPayments.objects.filter(radiology_order=instance).exists():
                radiology_order_payment = RadiologyOrderPayments.objects.create(
                    radiology_order=instance,
                    amount=instance.order_total_price,
                    status="INITIATED",
                    owner=instance.owner,
                    entity=instance.entity
                )
            else:
                create_log("info", "Radiology Order Payment already created")
        except Exception as e:
            create_log("error",str(e))