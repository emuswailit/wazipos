from django.contrib import admin
from . import models


admin.site.register(models.Slots)
admin.site.register(models.Appointments)

@admin.register(models.DepartmentalVisit)
class DepartmentalVisitssAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "dependant",
        "department",
        "checkin_time",
        "checkout_time",
        "owner",
        "created",
    )
    list_filter = ("entity", "dependant", "owner")
    search_fields = ("dependant",)


@admin.register(models.VisitorTickets)
class VisitssAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "department",
        "visitor_number",
        "arrival_time",
        "departure_time",
        "comment",
        "created",
    )
    list_filter = ("entity", "department",)
    search_fields = ("visitor_number",)


@admin.register(models.Admission)
class AdmissionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "origin_department",
        "destination_department",
        "bed_number",
        "inpatient_number",
        "admission_date",
        "discharge_date",
        "created",
    )
    list_filter = ("entity", "origin_department","destination_department")
    search_fields = ("inpatient_number",)



@admin.register(models.PatrientNursingCadex)
class PatrientNursingCadexAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity",
        "admission",
        "entry",
        "created",
    )
    list_filter = ("entity", "entry",)
    search_fields = ("entry",)


@admin.register(models.NursingCarePlan)
class NursingCarePlanAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "assessment",
        "admission",
        "nursing_diagnosis",
        "created",
    )
    list_filter = ("entity", "nursing_diagnosis",)
    search_fields = ("nursing_diagnosis",)


@admin.register(models.EntityLaboratoryServices)
class EntityLaboratoryServicesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "laboratory_service",
        "department",
        "charge",
        "created",
    )
    list_filter = ("entity", "department",)
    search_fields = ("department",)


@admin.register(models.EntityRadiologyServices)
class EntityRadiologyServicesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "radiology_service",
        "department",
        "charge",
        "created",
    )
    list_filter = ("entity", "department",)
    search_fields = ("department",)


@admin.register(models.LaboratoryOrders)
class LaboratoryOrdersAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "origin_department",
        "destination_department",
        "dependant",
        "is_closed",
        "created_by",
        "created",
    )
    list_filter = ("entity", "origin_department","destination_department")
    search_fields = ("origin_department","destination_department")

@admin.register(models.RadiologyOrders)
class RadiologyOrdersAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "origin_department",
        "destination_department",
        "dependant",
        "is_closed",
        "created_by",
        "created",
    )
    list_filter = ("entity", "origin_department","destination_department")
    search_fields = ("origin_department","destination_department")

@admin.register(models.Consultation)
class ConsultationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "departmental_visit",
        "current_complaint",
        "location",
        "owner",
        "created",
    )
    list_filter = ("entity", "current_diagnosis",)
    search_fields = ("current_diagnosis",)

@admin.register(models.HospitalPrescription)
class HospitalPrescriptionAdmin(admin.ModelAdmin):
    list_display = (
        "is_closed",
        "status",
        "dependant",
        "entity_store",
        "nature",
        "entity_sub_store",
        "origin_department",
        "created_by",
        "owner",
        "created",
    )
    list_filter = ("entity", "origin_department",)
    search_fields = ("entity_sub_store",)


@admin.register(models.HospitalPrescriptionItem)
class HospitalPrescriptionItemAdmin(admin.ModelAdmin):
    list_display =("id","entity","route","frequency")


@admin.register(models.HospitalPrescriptionItemAdministrations)
class HospitalPrescriptionItemAdministrationsAdmin(admin.ModelAdmin):
    list_display =("id","entity","comment","is_administered","hospital_prescription_item","administration_date","administration_time")



@admin.register(models.PrescriptionOrderPayments)
class PrescriptionOrderPaymentsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "prescription_order",
        "status",
        "amount",
        "owner",
        "created",
    )
    list_filter = ("entity", "prescription_order",)
    search_fields = ("prescription_order",)


@admin.register(models.TreatmentSheet)
class TreatmentSheetAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "admission",
        "frequency",
        "duration",
        "route",
        "owner",
        "created",
    )



