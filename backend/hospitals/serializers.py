from rest_framework import exceptions
from rest_framework.exceptions import ValidationError
from rest_framework.validators import UniqueTogetherValidator
from rest_framework import serializers
from . import models
from core.serializers import EntitySafeSerializerMixin
from datetime import *
from django.contrib.auth import get_user_model
from rest_framework import generics, serializers



User = get_user_model()


class VisitorTicketsSerializer(serializers.ModelSerializer):
    country_title = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    """
    Visitors serializer
    """
    class Meta:
        # model = models.VisitorTickets
        fields = ('id', 'entity',"country","visitor_names","status","visitor_phone","identifier_type","identifier_number",'country_title',"identifier_type",'identifier_number', 'comment', 'arrival_time', 'departure_time',
                  'created', 'updated')

        read_only_fields = ('id', 'title', 'entity', 'arrival_time', 'departure_time',
                            'created', 'updated')

    def get_country_title(self,obj):
        if obj.country:
            return obj.country.title
        else:
            return "N?A"
    def get_status(self,obj):
        if obj.departure_time:
            return "OUT"
        else:
            return "IN"
class SlotSerializer(serializers.ModelSerializer):
    """
    Slots serializer
    """
    class Meta:
        # model = models.Slots
        fields = ('id', 'url', 'entity', 'title', 'amount',  'employee', 'start_time', 'end_time', 'start', 'end', 'is_available',
                  'owner', 'created', 'updated')

        read_only_fields = ('id', 'url', 'title', 'entity', 'start', 'end', 'owner', 'employee', 'is_available',
                            'created', 'updated')


class AppointmentsSerializer(serializers.ModelSerializer):
    """
    Appointments serializer
    """

    class Meta:
        # model = models.Appointments
        fields = ('id', 'url', 'account',  'entity', 'dependant',
                  'slot', 'payment', 'owner',  'accountDetails', 'dependantDetails', 'entityDetails', 'paymentDetails', 'slotDetails', 'created', 'updated')

        read_only_fields = ('id', 'url',   'owner', 'status',
                            'created', 'updated')


class VitalsSerializer(serializers.ModelSerializer):
    """
    Vitals serializer
    """

    class Meta:
        # model = models.Vitals
        fields = ('id',  'entity', 'dependant',
                  'temparature', 'pulse', 'respiration', 'systolic', 'diastolic', 'height', 'weight', 'oxygen_saturation', 'owner', 'created', 'updated')

        read_only_fields = ('id', 'entity',  'owner',
                            'created', 'updated')


# class ConsultationsSerializer(EntitySafeSerializerMixin, serializers.ModelSerializer):
#     """
#     Appointment Consultations serializer
#     """

#     class Meta:
#         # model = models.Consultation
#         fields = (
#             'id',
#             'url',
#             'entity',
#             'appointment',
#             'complaint_duration_length',
#             'complaint_duration_unit',
#             'location',
#             'onset',
#             'course',
#             'aggravating_factors',
#             'previous_treatment',
#             'current_medication',
#             'uses_alcohol',
#             'uses_tobbaco',
#             'is_married',
#             'current_occupation',
#             'allergies',
#             'owner',
#             'created',
#             'updated'
#         )

#         read_only_fields = ('id', 'url', 'entity', 'owner', 'status',
#                             'created', 'updated')

# class PrescriptionItemsSerializer(serializers.ModelSerializer):

#     class Meta:
#         model = models.PrescriptionItems
#         fields = (
#             'id',
#             'url',
#             'entity',
#             'prescription',
#             'preparation',
#             'product',
#             'frequency',
#             'route',
#             'instruction',
#             'dose',
#             'duration',
#             'owner',

#         )
#         read_only_fields = (
#             'created', 'updated', 'owner', 'entity',
#         )
#         validators = [
#             UniqueTogetherValidator(
#                 queryset=models.PrescriptionItems.objects.all(),
#                 fields=['prescription', 'product', ]
#             )
#         ]

#     def validate_duration(self, duration):
#         if duration == 0:
#             raise serializers.ValidationError(
#                 "Enter the number of days the drugs will be taken")
#         return duration

# class PrescriptionImagesSerializer(serializers.ModelSerializer):
#     class Meta:
#         ordering = ['-id']
#         model = models.PrescriptionImages
#         fields = ("id", "entity", "owner", "image",
#                     "created",  'updated')

#         read_only_fields = ("id", "entity", "created", "updated", "posts")



# class VisitSerializer(serializers.ModelSerializer):
#     dependant_title = serializers.SerializerMethodField()
#     dependant_dob = serializers.SerializerMethodField()
#     dependant_age = serializers.SerializerMethodField()
#     dependant_gender = serializers.SerializerMethodField()
#     departmental_visits = serializers.SerializerMethodField()

#     class Meta:
#         ordering = ['-checkin_time']
#         model = models.Visit
#         fields = ("id", "entity", "owner", "checkin_time","checkout_time","dependant","dependant_age","dependant_dob","dependant_gender","appointment","departmental_visits","dependant_title",
#                     "created",  'updated')

#         read_only_fields = ("id", "entity", "created", "updated", )

#     def get_dependant_title(self,obj):
#         return f"{obj.dependant.first_name} {obj.dependant.last_name}"
#     def get_dependant_dob(self,obj):
#         return f"{obj.dependant.date_of_birth}"
#     def get_dependant_gender(self,obj):
#         return f"{obj.dependant.gender}"
#     def get_dependant_age(self,obj):
#         from core.date_utils import get_age_in_years
#         return get_age_in_years(f"{obj.dependant.date_of_birth}")
#     def get_departmental_visits(self,obj):
#         dep_visits=[]
#         if models.DepartmentalVisit.objects.filter(visit=obj).exists():
#             dep_visits= models.DepartmentalVisit.objects.filter(visit=obj)
#         return DepartmentalVisitSerializer(dep_visits, many=True,context=self.context).data


class DepartmentalVisitSerializer(serializers.ModelSerializer):
    dependant_title = serializers.SerializerMethodField()
    department_title = serializers.SerializerMethodField()
    dependant_dob = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    dependant_age = serializers.SerializerMethodField()
    dependant_gender = serializers.SerializerMethodField()
    # services_list = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-checkin_time']
        model = models.DepartmentalVisit
        fields = ("id", "entity", "owner",
                  "department",
                  "department_title", 
                  "dependant_dob", 
                  "dependant_age", 
                  "dependant_gender", 
                  "checkin_time",
                  "checkout_time",
                  "dependant_title",
                  "dependant",
                  "key",
                  "running_number","dependant_title",
                    "created",  'updated')

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_title(self,obj):
        return f"{obj.dependant.first_name} {obj.dependant.last_name}"
    
    def get_department_title(self,obj):
        return f"{obj.department.title}"
    def get_key(self,obj):
        return f"{obj.dependant.id}"
    
    def get_dependant_dob(self,obj):
        return f"{obj.dependant.date_of_birth}"
    def get_dependant_gender(self,obj):
        return f"{obj.dependant.gender}"
    def get_dependant_age(self,obj):
        from core.date_utils import get_age_in_years
        return get_age_in_years(f"{obj.dependant.date_of_birth}")
    
    # def get_services_list(self,obj):
    #     return EntityServicesSerializer(obj.services.all(),many=True,context=self.context).data


class BloodPressureChartSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ['-id']
        model = models.BloodPressureChart
        fields = ("id", "entity","admission","diastolic_pressure","systolic_pressure", "owner",
                    "created",  'updated')

        read_only_fields = ("id", "entity", "created", "updated", )


class AdmissionSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    dependant_gender = serializers.SerializerMethodField()
    dependant_date_of_birth = serializers.SerializerMethodField()
    dependant_age = serializers.SerializerMethodField()
    origin_department_title = serializers.SerializerMethodField()
    destination_department_title = serializers.SerializerMethodField()
    admission_nursing_cadex = serializers.SerializerMethodField()
    comprehension_first_cadex = serializers.SerializerMethodField()
    continous_sheet = serializers.SerializerMethodField()
    blood_pressure_chart = serializers.SerializerMethodField()
    theatre_operation_notes = serializers.SerializerMethodField()
    discharge_summary = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.Admission
        fields = ("id", 
                    "entity",
                    "dependant",
                    "dependant_name",
                    "dependant_gender",
                    "dependant_date_of_birth",
                    "dependant_age",
                    "dependant_name",
                    "origin_department",
                    "origin_department_title",
                    "destination_department",
                    "destination_department_title",
                    "bed_number",
                    "diagnosis", 
                    "owner", 
                    "inpatient_number",
                    "admission_type",
                    "admission_date",
                    "discharge_date",
                    "discharge_time",
                    "admission_nursing_cadex",
                    "blood_pressure_chart",
                    "comprehension_first_cadex",
                    "discharge_summary",
                    "theatre_operation_notes",
                    "continous_sheet",
                    "key",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )
    def get_dependant_name(self,obj):
        return f"{obj.dependant.first_name} {obj.dependant.last_name}"
    
    def get_key(self,obj):
        return f"{obj.id}"

    def get_comprehension_first_cadex(self,obj):
        comprehension_first_cadex=None
        if models.ComprehensionFirstCadex.objects.filter(admission=obj).exists():
            comprehension_first_cadex=models.ComprehensionFirstCadex.objects.filter(admission=obj).first()
        return ComprehensionFirstCadexSerializer(comprehension_first_cadex, many=False,context=self.context).data
    
    def get_continous_sheet(self,obj):
        continous_sheet=None
        if models.ContinousSheet.objects.filter(admission=obj).exists():
            continous_sheet=models.ContinousSheet.objects.filter(admission=obj).all()
        return ContinousSheetSerializer(continous_sheet, many=True,context=self.context).data
    
    def get_admission_nursing_cadex(self,obj):
        admission_nursing_cadex=None
        if models.AdmissionNursingCadex.objects.filter(admission=obj).exists():
            admission_nursing_cadex=models.AdmissionNursingCadex.objects.filter(admission=obj).first()
        return AdmissionNursingCadexSerializer(admission_nursing_cadex, many=False,context=self.context).data
    
    def get_blood_pressure_chart(self,obj):
        blood_pressure_chart=None
        if models.BloodPressureChart.objects.filter(admission=obj).exists():
            blood_pressure_chart=models.BloodPressureChart.objects.filter(admission=obj).all()
        return BloodPressureChartSerializer(blood_pressure_chart, many=True,context=self.context).data
    
    def get_discharge_summary(self,obj):
        discharge_summary=None
        if models.DischargeSummary.objects.filter(admission=obj).exists():
            discharge_summary=models.DischargeSummary.objects.filter(admission=obj).first()
        return DischargeSummarySerializer(discharge_summary, many=False,context=self.context).data
    
    def get_theatre_operation_notes(self,obj):
        theatre_operation_notes=None
        if models.TheatreOperationNotes.objects.filter(admission=obj).exists():
            theatre_operation_notes=models.TheatreOperationNotes.objects.filter(admission=obj).all()
        return TheatreOperationNotesSerializer(theatre_operation_notes, many=True,context=self.context).data
    
    def get_origin_department_title(self,obj):
        origin_department=None
        if obj.origin_department:
            origin_department= f"{obj.origin_department.title}"
        return origin_department
    
    def get_destination_department_title(self,obj):
        destination_department=None
        if obj.destination_department:
            destination_department= f"{obj.destination_department.title}"
        return destination_department
    
    def get_dependant_gender(self,obj):
        return f"{obj.dependant.gender}"
    
    def get_dependant_date_of_birth(self,obj):
        return f"{obj.dependant.date_of_birth}"
    
    def get_dependant_age(self,obj):
        from core.date_utils import get_age_in_years
        return get_age_in_years(f"{obj.dependant.date_of_birth}")
    
    def get_prescriber_name(self,obj):
        return f"{obj.created_by.user.first_name} {obj.created_by.user.last_name}"

class PatientNursingCadexSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    destination_department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.PatrientNursingCadex
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "destination_department_title",
                    "entry",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.admission.dependant.first_name} {obj.admission.dependant.last_name}"
    
    
    def get_destination_department_title(self,obj):
        return f"{obj.admission.destination_department.title}"
    
class MaternityAdmissionChartSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.MaternityAdmissionChart
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "department_name",
                    "gravida",
                    "tetanus_vaccine_given",
                    "parity",
                    "alive",
                    "stillbirths",
                    "caesarean",
                    "vacuum",
                    "hospital_deliveries",
                    "abortions",
                    "fundal_height",
                    "fetal_heart_rate",
                    "abdominal_engagement",
                    "presentation",
                    "abdominal_position",
                    "abdominal_contraction",
                    "vaginal_examination_reason",
                    "cervical_condition",
                    "vaginal_dilatation",
                    "vaginal_membranes",
                    "vaginal_draining",
                    "vaginal_level",
                    "pelvis",
                    "msu",
                    "last_menstrual_period",
                    "dead_before_arrival",
                    "estimated_delivery_date",
                    "gestation_in_weeks",
                    "birth_before_arrival",
                    "height_below_150_cm",
                    "periods_regular",
                    "is_attending_anc",
                    "is_anaemic",
                    "has_oedema",
                    "enema_given",
                    "prolonged_labour",
                    "ante_partum_haemorrhage",
                    "post_partum_haemorrhage",
                    "general_condition",
                    "recommendations",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.admission.dependant.first_name} {obj.admission.dependant.last_name}"
    
    
    def get_department_name(self,obj):
        return f"{obj.admission.department.title}"
    

class ContinousSheetSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    destination_department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.ContinousSheet
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "destination_department_title",
                    "entry",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.admission.dependant.first_name} {obj.admission.dependant.last_name}"
    
    
    def get_destination_department_title(self,obj):
        return f"{obj.admission.destination_department.title}"
    

class TreatmentSheetSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    origin_department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.TreatmentSheet
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "origin_department_title",
                    "preparation",
                    "frequency",
                    "route",
                    "duration",
                    "entry_time",
                    "allergies",
                    "is_dda",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.admission.dependant.first_name} {obj.admission.dependant.last_name}"
    
    
    def get_origin_department_title(self,obj):
        return f"{obj.admission.origin_department.title}"
    

class AdmissionNursingCadexSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    destination_department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.AdmissionNursingCadex
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "destination_department_title",
                    "diagnosis",
                    "current_disease_history",
                    "past_medical_surgical_history",
                    "socio_economic_history",
                    "past_obstetric_history",
                    "development_history",
                    "physical_examination",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.admission.dependant.first_name} {obj.admission.dependant.last_name}"
    
    
    def get_destination_department_title(self,obj):
        return f"{obj.admission.destination_department.title}"
    

class NursingCarePlanSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    destination_department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.NursingCarePlan
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "destination_department_title",
                    "assessment",
                    "nursing_diagnosis",
                    "goals_and_expected_outcome",
                    "nursing_intervention",
                    "rationale",
                    "evaluation",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.admission.dependant.first_name} {obj.admission.dependant.last_name}"
    
    
    def get_destination_department_title(self,obj):
        return f"{obj.admission.destination_department.title}"
    

class ComprehensionFirstCadexSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    destination_department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.ComprehensionFirstCadex
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "destination_department_title",
                    "head",
                    "neck",
                    "chest",
                    "upper_extremities",
                    "abdomen",
                    "inspection",
                    "palpation",
                    "ausculation",
                    "lower_extremities",
                    "temparature",
                    "pulse",
                    "respiration",
                    "plan_of_action",
                    "systolic_pressure",
                    "diastolic_pressure",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.admission.dependant.first_name} {obj.admission.dependant.last_name}"
    
    
    def get_destination_department_title(self,obj):
        return f"{obj.admission.destination_department.title}"
    

class TheatreOperationNotesSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.TheatreOperationNotes
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "department_name",
                    "surgeon",
                    "surgeon_assistant",
                    "scrub_nurse",
                    "anaesthetist",
                    "surgery_type",
                    "surgery_size",
                    "intra_operation_diagnosis",
                    "procedure",
                    "start_date",
                    "start_time",
                    "stop_date",
                    "stop_time",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.admission.dependant.first_name} {obj.admission.dependant.last_name}"
    
    
    def get_department_name(self,obj):
        return f"{obj.admission.department.title}"
    

class DischargeSummarySerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    origin_department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.DischargeSummary
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "origin_department_title",
                    "final_diagnosis",
                    "admission_diagnosis",
                    "other_illnesses",
                    "clinical_summary",
                    "operations",
                    "investigations",
                    "treatment",
                    "recommendations",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.admission.dependant.first_name} {obj.admission.dependant.last_name}"
    
    
    def get_origin_department_title(self,obj):
        return f"{obj.admission.origin_department.title}"
    
class LaboratoryOrdersSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    origin_department_title = serializers.SerializerMethodField()
    destination_department_title = serializers.SerializerMethodField()
    department_type = serializers.SerializerMethodField()
    examinations = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.LaboratoryOrders
        fields = ("id", 
                    "entity",
                    "admission",
                    "dependant_name",
                    "origin_department",
                    "origin_department_title",
                    "destination_department",
                    "destination_department_title",
                    "department_type",
                    "order_total_price",
                    "status",
                    "is_paid",
                    "examinations",
                    "reference_number",
                    "is_closed",
                    "created_by",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.dependant.first_name} {obj.dependant.last_name}"
    
    
    def get_origin_department_title(self,obj):
        origin_department=None
        if obj.origin_department:
            origin_department= f"{obj.origin_department.title}"
        return origin_department
    
    def get_destination_department_title(self,obj):
        destination_department=None
        if obj.destination_department:
            destination_department= f"{obj.destination_department.title}"
        return destination_department
    
    def get_department_type(self,obj):
        return f"{obj.destination_department.department_type}"
    
    def get_examinations(self,obj):
        examinations=[]
        if models.LaboratoryExaminations.objects.filter(laboratory_order=obj).exists():
            examinations=models.LaboratoryExaminations.objects.filter(laboratory_order=obj).all()
        return LaboratoryExaminationsSerializer(examinations,many=True, context=self.context).data
    
class LaboratoryExaminationsSerializer(serializers.ModelSerializer):
    examination_name = serializers.SerializerMethodField()
    examination_charge = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.LaboratoryExaminations
        fields = ("id", 
                    "entity",
                    "laboratory_order",
                    "examination",
                    "examination_name",
                    "examination_charge",
                    "requested_by",
                    "processed_by",
                    "reported_by",
                    "report",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    
    def get_examination_name(self,obj):
        return obj.examination.laboratory_service.title
    
    def get_examination_charge(self,obj):
        return obj.examination.charge

class RadiologyOrdersSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    origin_department_title = serializers.SerializerMethodField()
    destination_department_title = serializers.SerializerMethodField()
    examinations = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.RadiologyOrders
        fields = ("id", 
                    "entity",
                    "admission",
                    "origin_department",
                    "origin_department_title",
                    "destination_department",
                    "destination_department_title",
                    "dependant_name",
                    "examinations",
                    "order_total_price",
                    "reference_number",
                    "status",
                    "is_paid",
                    "is_closed",
                    "created_by",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.dependant.first_name} {obj.dependant.last_name}"
    
    
    def get_origin_department_title(self,obj):
        origin_department=None
        if obj.origin_department:
            origin_department= f"{obj.origin_department.title}"
        return origin_department
    
    def get_destination_department_title(self,obj):
        destination_department=None
        if obj.destination_department:
            destination_department= f"{obj.destination_department.title}"
        return destination_department
    
    def get_examinations(self,obj):
        examinations=[]
        if models.RadiologyExaminations.objects.filter(radiology_order=obj).exists():
            examinations=models.RadiologyExaminations.objects.filter(radiology_order=obj).all()
        return RadiologyExaminationsSerializer(examinations,many=True, context=self.context).data
    
 
class RadiologyExaminationsSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    examination_title = serializers.SerializerMethodField()
    examination_charge = serializers.SerializerMethodField()
   
    class Meta:
        ordering = ['-id']
        model = models.RadiologyExaminations
        fields = ("id", 
                    "entity",
                    "dependant_name",
                    "radiology_order",
                    "examination",
                    "examination_title",
                    "examination_charge",
                    "requested_by",
                    "processed_by",
                    "reported_by",
                    "report",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.radiology_order.dependant.first_name} {obj.radiology_order.dependant.last_name}"
    def get_examination_title(self,obj):
        return f"{obj.examination.radiology_service.title}"
    
    def get_examination_charge(self,obj):
        return str(obj.examination.charge)
    


class PhysiotherapyProceduresSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    charge = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    procedure_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.PhysiotherapyProcedures
        fields = ("id", 
                    "entity",
                    "department",
                    "dependant_name",
                    "department_name",
                    "physiotherapy_order",
                    "charge",
                    # "sessions",
                    # "session_charge",
                    # "total_sessions_charge",
                    "procedure",
                    "procedure_title",
                    "requested_by",
                    "processed_by",
                    "reported_by",
                    "report",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.physiotherapy_order.dependant.first_name} {obj.physiotherapy_order.dependant.last_name}"
    
    
    def get_department(self,obj):
        return f"{obj.physiotherapy_order.destination_department.title}"  
    
    def get_department_name(self,obj):
        return f"{obj.physiotherapy_order.destination_department.title}" 
     
    def get_procedure_title(self,obj):
        return f"{obj.procedure.physiotherapy_service.title}"  
    
    def get_charge(self,obj):
        return f"{obj.procedure.charge}"  

class PhysiotherapyOrdersSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    origin_department_title = serializers.SerializerMethodField()
    destination_department_title = serializers.SerializerMethodField()
    procedures = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.PhysiotherapyOrders
        fields = ("id", 
                    "entity",
                    "admission",
                    "origin_department",
                    "origin_department_title",
                    "destination_department",
                    "destination_department_title",
                    "dependant_name",
                    "order_total_price",
                    "reference_number",
                    "procedures",
                    "status",
                    "is_paid",
                    "is_closed",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.dependant.first_name} {obj.dependant.last_name}"
    
    
    def get_origin_department_title(self,obj):
        origin_department=None
        if obj.origin_department:
            origin_department= f"{obj.origin_department.title}"
        return origin_department
    
    def get_destination_department_title(self,obj):
        destination_department=None
        if obj.destination_department:
            destination_department= f"{obj.destination_department.title}"
        return destination_department
    

    
    def get_procedures(self,obj):
        procedures=[]
        if models.PhysiotherapyProcedures.objects.filter(physiotherapy_order=obj).exists():
            procedures=models.PhysiotherapyProcedures.objects.filter(physiotherapy_order=obj).all()
        return PhysiotherapyProceduresSerializer(procedures,many=True, context=self.context).data
    


    # Services

class EntityLaboratoryServicesSerializer(serializers.ModelSerializer):
    laboratory_service_title = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.EntityLaboratoryServices
        fields = ("id", 
                    "entity",
                    "laboratory_service",
                    "laboratory_service_title",
                    "department",
                    "department_title",
                    "charge",
                    "key",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_laboratory_service_title(self,obj):
        return obj.laboratory_service.title
    
    def get_key(self,obj):
        return obj.id
    
    def get_department_title(self,obj):
        return obj.department.title
    

class EntityRadiologyServicesSerializer(serializers.ModelSerializer):
    radiology_service_title = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.EntityRadiologyServices
        fields = ("id", 
                    "entity",
                    "radiology_service",
                    "radiology_service_title",
                    "department",
                    "department_title",
                    "charge",
                    "key",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_radiology_service_title(self,obj):
        return obj.radiology_service.title
    
    def get_key(self,obj):
        return obj.id
    
    def get_department_title(self,obj):
        return obj.department.title
    
class EntityPhysiotherapyServicesSerializer(serializers.ModelSerializer):
    physiotherapy_service_title = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    department_title = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.EntityPhysiotherapyServices
        fields = ("id", 
                    "entity",
                    "key",
                    "physiotherapy_service",
                    "physiotherapy_service_title",
                    "department",
                    "department_title",
                    "charge",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_physiotherapy_service_title(self,obj):
        return obj.physiotherapy_service.title
    
    def get_key(self,obj):
        return obj.id
    
    def get_department_title(self,obj):
        if obj.department:
            return obj.department.title
        else:
            return None

class HospitalPrescriptionItemAdministrationsSerializer(serializers.ModelSerializer):
    class Meta:
        ordering = ['-id']
        model = models.HospitalPrescriptionItemAdministrations
        fields = ("id", 
                    "entity",
                    "comment",
                    "administration_date",
                    "administration_time",
                    "hospital_prescription_item",
                    "is_administered",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )


class HospitalPrescriptionItemSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    frequency_title = serializers.SerializerMethodField()
    route_title = serializers.SerializerMethodField()
    product_title = serializers.SerializerMethodField()
    administrations = serializers.SerializerMethodField()
    administration_progresss = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.HospitalPrescriptionItem
        fields = ("id", 
                    "entity",
                    "hospital_prescription",
                    "preparation",
                    "product",
                    "product_title",
                    "interpreted_by",
                    "instruction",
                    "required_unit_quantity",
                    "issued_unit_quantity",
                    "balance_unit_quantity",
                    "prescribed_by",
                    "route",
                    "route_title",
                    "frequency",
                    "frequency_title",
                    "title",
                    "dose",
                    "days",
                    "owner",
                    "key",
                    "administrations",
                    "administration_progresss",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_title(self,obj):
        return obj.preparation.title
    
    def get_frequency_title(self,obj):
        return obj.frequency.title
    
    def get_route_title(self,obj):
        return obj.route.title
    
    def get_product_title(self,obj):
        if obj.product:
            return obj.product.title
        else:
            return ""
    def get_key(self,obj):
        return obj.id
    def get_administrations(self,obj):
        administrations=[]
        if models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=obj).exists():
            administrations=models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=obj).all().order_by("administration_date")
        return HospitalPrescriptionItemAdministrationsSerializer(administrations,many=True, context=self.context).data        
    def get_administration_progresss(self,obj):
        true_administrations=[]
        false_administrations=[]
        total_administrations=[]
        if models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=obj).exists():
            total_administrations=models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=obj).all()
        
        if models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=obj,is_administered="true").exists():
            true_administrations=models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=obj,is_administered="true").all()
        
        if models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=obj,is_administered="false").exists():
            false_administrations=models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=obj,is_administered="false").all()

        return f"{len(true_administrations)}/{len(total_administrations)}"    

class HospitalPrescriptionSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    dependant_gender = serializers.SerializerMethodField()
    dependant_date_of_birth = serializers.SerializerMethodField()
    dependant_age = serializers.SerializerMethodField()
    entity_sub_store_name = serializers.SerializerMethodField()
    prescriber_name = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    prescription_orders = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.HospitalPrescription
        fields = ("id", 
                    "entity",
                    "entity_sub_store",
                    "dependant_name",
                    "dependant_gender",
                    "dependant_date_of_birth",
                    "dependant_age",
                    "admission",
                    "nature",
                    "status",
                    "prescriber_name",
                    "entity_sub_store_name",
                    "items",
                    "is_closed",
                    "created_by",
                    "key",
                    "prescription_orders",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.dependant.first_name} {obj.dependant.last_name}"
    
    def get_dependant_gender(self,obj):
        return f"{obj.dependant.gender}"
    
    def get_dependant_date_of_birth(self,obj):
        return f"{obj.dependant.date_of_birth}"
    
    def get_dependant_age(self,obj):
        from core.date_utils import get_age_in_years
        return get_age_in_years(f"{obj.dependant.date_of_birth}")
    
    def get_prescriber_name(self,obj):
        return f"{obj.created_by.user.first_name} {obj.created_by.user.last_name}"
    
    def get_entity_sub_store_name(self,obj):
        return f"{obj.entity_sub_store.title}"
    def get_key(self,obj):
        return obj.id
    
    def get_items(self,obj):
        items=[]
        if models.HospitalPrescriptionItem.objects.filter(hospital_prescription=obj).exists():
            items=models.HospitalPrescriptionItem.objects.filter(hospital_prescription=obj).all()
        return HospitalPrescriptionItemSerializer(items,many=True, context=self.context).data
    
    def get_prescription_orders(self,obj):
        prescription_orders=[]
        if models.PrescriptionOrders.objects.filter(hospital_prescription=obj).exists():
            prescription_orders=models.PrescriptionOrders.objects.filter(hospital_prescription=obj).all()
        return PrescriptionOrdersSerializer(prescription_orders,many=True, context=self.context).data
    

class ConsulationsSerializer(serializers.ModelSerializer):
    dependant_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    class Meta:
        ordering = ['-id']
        model = models.Consultation
        fields = ("id", 
                    "entity",
                    "dependant_name",
                    "department_name",
                    "doctor_name",
                    "departmental_visit",
                    "current_complaint",
                    "complaint_duration_unit",
                    "complaint_duration_length",
                    "location",
                    "onset",
                    "course",
                    "aggravating_factors",
                    "previous_treatment",
                    "current_medication",
                    "is_married",
                    "medication_allergies",
                    "food_allergies",
                    "environmental_allergies",
                    "current_diagnosis",
                    "years_of_smoking",
                    "cigarettes_per_day",
                    "created_by",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_dependant_name(self,obj):
        return f"{obj.departmental_visit.dependant.first_name} {obj.departmental_visit.dependant.last_name}"
    
    
    def get_department_name(self,obj):
        return f"{obj.departmental_visit.department.title} - ({obj.departmental_visit.department.department_type})"
    
    def get_doctor_name(self,obj):
        if obj.created_by:
            return f"{obj.created_by.user.first_name} - ({obj.created_by.user.last_name})"
        else:
            return "N/A"
    
    
class PrescriptionOrdersSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField(read_only=True)
    order_total_price = serializers.SerializerMethodField(read_only=True)
    dependant_name = serializers.SerializerMethodField(read_only=True)
    is_paid = serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ['-created']
        model = models.PrescriptionOrders
        fields = ("id", 
                    "entity",
                    "entity_store",
                    "entity_sub_store",
                    "dependant_name",
                    "order_total_price",
                    "is_paid",
                    "employee",
                    "reference_number",
                    "owner",
                    "status",
                    "items",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_items(self,obj):
        order_items=[]
        if models.PrescriptionOrderItems.objects.filter(prescription_order=obj).exists():
            order_items= models.PrescriptionOrderItems.objects.filter(prescription_order=obj).all()
        return PrescriptionOrderItemsSerializer(order_items, many=True,context=self.context).data
    def get_order_total_price(self,obj):
        order_total_price=0.00
        items =[]
        if models.PrescriptionOrderItems.objects.filter(prescription_order=obj).exists():
            items =models.PrescriptionOrderItems.objects.filter(prescription_order=obj).all()
            for item in items:
                order_total_price = float(order_total_price)+float(item.item_total_price)
            obj.order_total_price=round(float(order_total_price),2)
            obj.save()
        return round(float(order_total_price),2)
    def get_dependant_name(self,obj):
        return f"{obj.hospital_prescription.dependant.first_name} {obj.hospital_prescription.dependant.last_name}"
    
    def get_is_paid(self,obj):
        if models.PrescriptionOrderPayments.objects.filter(prescription_order=obj,status ="SUCCESS").exists():
            return "TRUE"
        else:
            return "FALSE"

class PrescriptionOrderItemsSerializer(serializers.ModelSerializer):
    entity_sub_store_receipt_title=serializers.SerializerMethodField(read_only=True)
    entity_sub_store_receipt_preparation_title=serializers.SerializerMethodField(read_only=True)
    required_unit_quantity=serializers.SerializerMethodField(read_only=True)
    key=serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ['-created']
        model = models.PrescriptionOrderItems
        fields = ("id", 
                    "entity",
                    "prescription_order",
                    "hospital_prescription_item",
                    "required_unit_quantity",
                    "issued_unit_quantity",
                    "item_total_price",
                    "entity_sub_store_receipt",
                    "entity_sub_store_receipt_title",
                    "entity_sub_store_receipt_preparation_title",
                    "key",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_entity_sub_store_receipt_title(self,obj):
        return obj.entity_sub_store_receipt.product.title
    def get_key(self,obj):
        return obj.id
    
    def get_required_unit_quantity(self,obj):
        if obj.hospital_prescription_item:
            return obj.hospital_prescription_item.required_unit_quantity
        else:
            return None
    
    def get_entity_sub_store_receipt_preparation_title(self,obj):
        if obj.entity_sub_store_receipt.product.preparation:
            return obj.entity_sub_store_receipt.product.preparation.title
        else:
            return ""


class PrescriptionOrderPaymentsSerializer(serializers.ModelSerializer):
    payment_method_title=serializers.SerializerMethodField(read_only=True)
    dependant_name=serializers.SerializerMethodField(read_only=True)
    order_reference_number=serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ['-created']
        model = models.PrescriptionOrderPayments
        fields = ("id", 
                    "entity",
                    "prescription_order",
                    "payment_method",
                    "payment_method_title",
                    "amount",
                    "reference_number",
                    "psp_reference_number",
                    "order_reference_number",
                    "dependant_name",
                    "status",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_payment_method_title(self,obj):
        if obj.payment_method:
            return obj.payment_method.title
        else:
            return None
        
    def get_order_reference_number(self,obj):
        order_reference_number=""
        if obj.prescription_order.reference_number:
            order_reference_number=obj.prescription_order.reference_number
        return order_reference_number
    
    def get_dependant_name(self,obj):
        if obj.prescription_order.hospital_prescription.dependant: 
            return f"{obj.prescription_order.hospital_prescription.dependant.first_name} {obj.prescription_order.hospital_prescription.dependant.last_name}"
        else:
            return "N/A"
        
class LaboratoryOrderPaymentsSerializer(serializers.ModelSerializer):
    payment_method_title=serializers.SerializerMethodField(read_only=True)
    dependant_name=serializers.SerializerMethodField(read_only=True)
    order_reference_number=serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ['-created']
        model = models.LaboratoryOrderPayments
        fields = ("id", 
                    "entity",
                    "laboratory_order",
                    "payment_method",
                    "payment_method_title",
                    "amount",
                    "reference_number",
                    "psp_reference_number",
                    "dependant_name",
                    "order_reference_number",
                    "status",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_payment_method_title(self,obj):
        if obj.payment_method:
            return obj.payment_method.title
        else:
            return "n/A"
    def get_order_reference_number(self,obj):
        order_reference_number=""
        if obj.laboratory_order.reference_number:
            order_reference_number=obj.laboratory_order.reference_number
        return order_reference_number
    
    def get_dependant_name(self,obj):
        if obj.laboratory_order.dependant: 
            return f"{obj.laboratory_order.dependant.first_name} {obj.laboratory_order.dependant.last_name}"
        else:
            return "N/A"
        
class PhysiotherapyOrderPaymentsSerializer(serializers.ModelSerializer):
    payment_method_title=serializers.SerializerMethodField(read_only=True)
    order_reference_number=serializers.SerializerMethodField(read_only=True)
    dependant_name=serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ['-created']
        model = models.PhysiotherapyOrderPayments
        fields = ("id", 
                    "entity",
                    "physiotherapy_order",
                    "payment_method",
                    "payment_method_title",
                    "amount",
                    "reference_number",
                    "psp_reference_number",
                    "status",
                    "dependant_name",
                    "order_reference_number",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_payment_method_title(self,obj):
        if obj.payment_method:
            return obj.payment_method.title
        else:
            return "N/A"
    def get_order_reference_number(self,obj):
        order_reference_number=""
        if obj.physiotherapy_order.reference_number:
            order_reference_number=obj.physiotherapy_order.reference_number
        return order_reference_number
    def get_dependant_name(self,obj):
        if obj.physiotherapy_order.dependant: 
            return f"{obj.physiotherapy_order.dependant.first_name} {obj.physiotherapy_order.dependant.last_name}"
        else:
            return "N/A"



class RadiologyOrderPaymentsSerializer(serializers.ModelSerializer):
    payment_method_title=serializers.SerializerMethodField(read_only=True)
    order_reference_number=serializers.SerializerMethodField(read_only=True)
    dependant_name=serializers.SerializerMethodField(read_only=True)
    class Meta:
        ordering = ['-created']
        model = models.RadiologyOrderPayments
        fields = ("id", 
                    "entity",
                    "radiology_order",
                    "payment_method",
                    "payment_method_title",
                    "amount",
                    "reference_number",
                    "psp_reference_number",
                    "order_reference_number",
                    "dependant_name",
                    "status",
                    "owner",
                    "created",  
                    'updated'
                    )

        read_only_fields = ("id", "entity", "created", "updated", )

    def get_payment_method_title(self,obj):
        if obj.payment_method:
            return obj.payment_method.title
        else:
            return None
    def get_order_reference_number(self,obj):
        order_reference_number=""
        if obj.radiology_order.reference_number:
            order_reference_number=obj.radiology_order.reference_number
        return order_reference_number
    def get_dependant_name(self,obj):
        if obj.radiology_order.dependant: 
            return f"{obj.radiology_order.dependant.first_name} {obj.radiology_order.dependant.last_name}"
        else:
            return "N/A"