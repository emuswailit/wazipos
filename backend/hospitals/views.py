from dataclasses import dataclass
from rest_framework import generics, serializers, status, views, permissions, exceptions
from django.db import transaction
from core.responses import custom_error_response, custom_success_message
from rest_framework.decorators import api_view, permission_classes, parser_classes, renderer_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.pagination import PageNumberPagination
from . import models,serializers
from .utils import consultation_utils,hospital_utils,inpatient_utils,order_utils,services_utils
from core.responses import custom_errors_response
from authentication.serializers import DependantsSerializer,DepartmentsSerializer
from services.serializers import LaboratoryServicesSerializer,PhysiotherapyServicesSerializer,RadiologyServicesSerializer
from datetime import date
from django.http import JsonResponse
from rest_framework.views import APIView
from hospitals.validators import hospitals_model_validators

# Create your views here.


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]

)
@renderer_classes([JSONRenderer,])
@parser_classes([JSONParser, MultiPartParser])
def hospitalStaffAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetAllVisitors":
        """Get current list of visitors"""

        visitors = models.Visit.objects.filter(is_active=True)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(visitors, request)
        serializer = serializers.VisitSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "SearchDependantByNationalIdOrPhone":
        """Search de3pendant by national ID or phone number"""
        dependants =consultation_utils.search_dependants(request.data)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(dependants, request)
        serializer = DependantsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityDepartments":
        """Get departments for entity"""

        departments =consultation_utils.get_entity_departments(request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(departments, request)
        serializer = DepartmentsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)  
    elif request.data["action"] == "CreateVitals":
            errors, visit = consultation_utils.create_vitals(
                request.data, request.user
            )
            if visit:
                serializer = serializers.VitalsSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Vitals created successfully",
                    serializer.data,
                    "vitals",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Vitals not created",errors)
    elif request.data["action"] == "GetDependantVitals":
            """Getvitals queue"""

            vitals_queue =consultation_utils.get_dependant_vitals(request.data)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.VitalsSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateConsultation":
        errors, consultation = consultation_utils.create_consultation(
            request.data, request.user
        )
        if consultation:
            serializer = serializers.ConsulationsSerializer(
                consultation, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Consultation created successfully",
                serializer.data,
                "consultation",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Consultation not created",errors)      
    elif request.data["action"] == "GetDependantConsultations":
            """Get dependant Consultations"""

            dependant_consultations =consultation_utils.get_dependant_consultations(request.data)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(dependant_consultations, request)
            serializer = serializers.ConsulationsSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateVisit":
        errors, visit = consultation_utils.create_visit(
            request.data, request.user
        )
        if visit:
            serializer = serializers.VisitSerializer(
                visit, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Visit created successfully",
                serializer.data,
                "visit",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Visit not created",errors)
    elif request.data["action"] == "GetVitalsQueue":
            """Getvitals queue"""

            vitals_queue =consultation_utils.get_vitals_queue(request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.VisitSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateDepartmentalVisit":
        errors, departmental_visit = consultation_utils.create_departmental_visit(
            request.data, request.user
        )
        if departmental_visit:
            serializer = serializers.DepartmentalVisitSerializer(
                departmental_visit, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Departmental visit created successfully",
                serializer.data,
                "departmental_visit",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Services not added",errors)      
    elif request.data["action"] == "GetAllDepartmentalVisits":
            """Getvitals all departmental Visits"""

            vitals_queue =consultation_utils.get_all_departmental_visits(request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.DepartmentalVisitSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateLaboratoryOrder":
        errors, laboratory_order = order_utils.create_laboratory_orders(
            request.data, request.user
        )
        if laboratory_order:
            serializer = serializers.LaboratoryOrdersSerializer(
                laboratory_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Laboratory order created successfully",
                serializer.data,
                "laboratory_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Services not added",errors)         
    elif request.data["action"] == "UpdateLaboratoryOrder":
        errors, laboratory_order = order_utils.update_laboratory_order(
            request.data, request.user
        )
        if laboratory_order:
            serializer = serializers.LaboratoryOrdersSerializer(
                laboratory_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "laboratory order updated successfully",
                serializer.data,
                "laboratory_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Services not added",errors)      
    elif request.data["action"] == "GetLaboratoryOrders":
            """Get all laboratory orders"""

            vitals_queue =order_utils.get_all_laboratory_orders(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.LaboratoryOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetLaboratoryOrderPayments":
            """Get all laboratory orders"""

            vitals_queue =order_utils.get_laboratory_order_payments(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.LaboratoryOrderPaymentsSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetDependantLaboratoryOrders":
            """Get all dependant laboratory orders"""

            vitals_queue =order_utils.get_dependant_laboratory_orders(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.LaboratoryOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateRadiologyOrder":
        errors, radiology_order = order_utils.create_radiology_orders(
            request.data, request.user
        )
        if radiology_order:
            serializer = serializers.RadiologyOrdersSerializer(
                radiology_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Radiology order created successfully",
                serializer.data,
                "radiology_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Radiology order not created",errors)        
    elif request.data["action"] == "UpdateRadiologyOrder":
        errors, radiology_order = order_utils.update_radiology_order(
            request.data, request.user
        )
        if radiology_order:
            serializer = serializers.RadiologyOrdersSerializer(
                radiology_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Radiology order updated successfully",
                serializer.data,
                "radiology_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Radiology order not updated",errors)      
    elif request.data["action"] == "GetRadiologyOrders":
            """Get all laboratory orders"""

            radiology_orders =order_utils.get_all_radiology_orders(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(radiology_orders, request)
            serializer = serializers.RadiologyOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetRadiologyOrderPayments":
            """Get all radiology order payments"""

            radiology_order_payments =order_utils.get_radiology_order_payments(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(radiology_order_payments, request)
            serializer = serializers.RadiologyOrderPaymentsSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetDependantRadiologyOrders":
            """Get all dependant radiology orders"""

            vitals_queue =order_utils.get_dependant_radiology_orders(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.RadiologyOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreatePhysiotherapyOrder":
        errors, physiotherapy_order = order_utils.create_physiotherapy_orders(
            request.data, request.user
        )
        if physiotherapy_order:
            serializer = serializers.PhysiotherapyOrdersSerializer(
                physiotherapy_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Physiotherapy order created successfully",
                serializer.data,
                "physiotherapy_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Physiotherapy order not created",errors)      
    elif request.data["action"] == "UpdatePhysiotherapyOrder":
        errors, physiotherapy_order = order_utils.update_physiotherapy_order(
            request.data, request.user
        )
        if physiotherapy_order:
            serializer = serializers.PhysiotherapyOrdersSerializer(
                physiotherapy_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Physiotherapy order updated successfully",
                serializer.data,
                "physiotherapy_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Physiotherapy order not updated",errors)      
    elif request.data["action"] == "GetPhysiotherapyOrders":
            """Get all physiotherapy orders"""

            physiotherapy_orders =order_utils.get_all_physiotherapy_orders(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(physiotherapy_orders, request)
            serializer = serializers.PhysiotherapyOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetPhysiotherapyOrderPayments":
            """Get all physiotherapy order  payments"""

            physiotherapy_order_payments =order_utils.get_physiotherapy_order_payments(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(physiotherapy_order_payments, request)
            serializer = serializers.PhysiotherapyOrderPaymentsSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreatePhysiotherapyProcedure":
        errors, physiotherapy_order = order_utils.create_physiotherapy_procedure(
            request.data, request.user
        )
        if physiotherapy_order:
            serializer = serializers.PhysiotherapyOrdersSerializer(
                physiotherapy_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Physiotherapy order updated successfully",
                serializer.data,
                "physiotherapy_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Physiotherapy order not updated",errors) 
    elif request.data["action"] == "DeletePhysiotherapyProcedure":
        errors, physiotherapy_order = order_utils.delete_physiotherapy_procedure(
            request.data, request.user
        )
        if physiotherapy_order:
            serializer = serializers.PhysiotherapyOrdersSerializer(
                physiotherapy_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Physiotherapy order updated successfully",
                serializer.data,
                "physiotherapy_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Physiotherapy order not updated",errors)  
    elif request.data["action"] == "GetDependantPhysiotherapyOrders":
            """Get all dependant physiotherapy orders"""

            vitals_queue =order_utils.get_dependant_physiotherapy_orders(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.PhysiotherapyOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityLaboratoryServices":
            """Get entity laboratory services"""

            entity_laboratory_services =services_utils.get_entity_laboratory_services(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(entity_laboratory_services, request)
            serializer = serializers.EntityLaboratoryServicesSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateLaboratoryExamination":
        errors, laboratory_order = order_utils.create_laboratory_examination(
            request.data, request.user
        )
        if laboratory_order:
            serializer = serializers.LaboratoryOrdersSerializer(
                laboratory_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Laboratory order created successfully",
                serializer.data,
                "laboratory_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Services not added",errors) 
    elif request.data["action"] == "DeleteLaboratoryExamination":
        errors, laboratory_order = order_utils.delete_laboratory_examination(
            request.data, request.user
        )
        if laboratory_order:
            serializer = serializers.LaboratoryOrdersSerializer(
                laboratory_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Hospital prescription item deleted successfully",
                serializer.data,
                "laboratory_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Hospital prescription item not deleted",errors)  
    elif request.data["action"] == "UpdateLaboratoryExamination":
        errors, laboratory_order = order_utils.update_laboratory_examination(
            request.data, request.user
        )
        if laboratory_order:
            serializer = serializers.LaboratoryOrdersSerializer(
                laboratory_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Laboratory examiation updated successfully",
                serializer.data,
                "laboratory_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Laboratory examiation not updated",errors)      
    elif request.data["action"] == "CreateEntityLaboratoryService":
        errors, entity_laboratory_service = services_utils.create_entity_laboratory_service(
            request.data, request.user
        )
        if entity_laboratory_service:
            serializer = serializers.EntityLaboratoryServicesSerializer(
                entity_laboratory_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Laboratory service created successfully",
                serializer.data,
                "entity_laboratory_service",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity laboratory service not created",errors)       
    elif request.data["action"] == "SearchLaboratoryServices":
        """Search laboratory services"""

        products = hospital_utils.search_laboratory_services(
            request.data, request.user)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(products, request)
        serializer = LaboratoryServicesSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateEntityLaboratoryService":
        errors, entity_laboratory_service = services_utils.update_entity_laboratory_service(
            request.data, request.user
        )
        if entity_laboratory_service:
            serializer = serializers.EntityLaboratoryServicesSerializer(
                entity_laboratory_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Laboratory service updated successfully",
                serializer.data,
                "entity_laboratory_service",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Laboratory service not updated",errors)      
    elif request.data["action"] == "CreateEntityRadiologyService":
        errors, entity_radiology_service = services_utils.create_entity_radiology_service(
            request.data, request.user
        )
        if entity_radiology_service:
            serializer = serializers.EntityRadiologyServicesSerializer(
                entity_radiology_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Radiology service created successfully",
                serializer.data,
                "entity_radiology_service",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity radiology service not created",errors) 
    elif request.data["action"] == "UpdateEntityRadiologyService":
        errors, entity_radiology_service = services_utils.update_entity_radiology_service(
            request.data, request.user
        )
        if entity_radiology_service:
            serializer = serializers.EntityRadiologyServicesSerializer(
                entity_radiology_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Radiolgy service updated successfully",
                serializer.data,
                "entity_radiology_service",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Laboratory service not updated",errors)
    elif request.data["action"] == "SearchRadiologyServices":
            """Search radiology services"""

            products = hospital_utils.search_radiology_services(
                request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(products, request)
            serializer = RadiologyServicesSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "GetEntityRadiologyServices":
            """Get entity radiology services"""

            entity_radiology_services =services_utils.get_entity_radiology_services(request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(entity_radiology_services, request)
            serializer = serializers.EntityRadiologyServicesSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)      
    elif request.data["action"] == "CreateRadiologyExamination":
        errors, radiology_order = order_utils.create_radiology_examination(
            request.data, request.user
        )
        if radiology_order:
            serializer = serializers.RadiologyOrdersSerializer(
                radiology_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Radiology order updated successfully",
                serializer.data,
                "radiology_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Services not added",errors) 
    elif request.data["action"] == "DeleteRadiologyExamination":
        errors, radiology_order = order_utils.delete_radiology_examination(
            request.data, request.user
        )
        if radiology_order:
            serializer = serializers.RadiologyOrdersSerializer(
                radiology_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Radiology border updated successfully",
                serializer.data,
                "radiology_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Radiology order not updated",errors)     
    elif request.data["action"] == "CreateEntityPhysiotherapyService":
        errors, entity_physiotherapy_service = services_utils.create_entity_physiotherapy_service(
            request.data, request.user
        )
        if entity_physiotherapy_service:
            serializer = serializers.EntityPhysiotherapyServicesSerializer(
                entity_physiotherapy_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Physiotherapy service created successfully",
                serializer.data,
                "entity_physiotherapy_service",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Entity physiotherapy service not created",errors) 
    elif request.data["action"] == "SearchPhysiotherapyServices":
            """Search radiology services"""

            products = hospital_utils.search_physiotherapy_services(
                request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(products, request)
            serializer = PhysiotherapyServicesSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateEntityPhysiotherapyService":
        errors, entity_physiotherapy_service = services_utils.update_entity_physiotherapy_service(
            request.data, request.user
        )
        if entity_physiotherapy_service:
            serializer = serializers.EntityPhysiotherapyServicesSerializer(
                entity_physiotherapy_service, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Radiolgy service updated successfully",
                serializer.data,
                "entity_physiotherapy_service",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Laboratory service not updated",errors)
    elif request.data["action"] == "GetEntityPhysiotherapyServices":
            """Get entity physiotherapy services"""

            entity_physiotherapy_services =services_utils.get_entity_physiotherapy_services(request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(entity_physiotherapy_services, request)
            serializer = serializers.EntityPhysiotherapyServicesSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)  
    elif request.data["action"] == "CreateHospitalPrescription":
        errors, hospital_prescription = order_utils.create_hospital_prescription(
            request.data, request.user
        )
        if hospital_prescription:
            serializer = serializers.HospitalPrescriptionSerializer(
                hospital_prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Hospital prescription created successfully",
                serializer.data,
                "hospital_prescription",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Hospital prescription not created",errors)     
    elif request.data["action"] == "UpdateHospitalPrescription":
        errors, hospital_prescription = order_utils.update_hospital_prescription(
            request.data, request.user
        )
        if hospital_prescription:
            serializer = serializers.HospitalPrescriptionSerializer(
                hospital_prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Hospital prescription updated successfully",
                serializer.data,
                "hospital_prescription",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Hospital prescription not updated",errors)   
    elif request.data["action"] == "CreateHospitalPrescriptionItem":
        errors, hospital_prescription = order_utils.create_hospital_prescription_item(
            request.data, request.user
        )
        if hospital_prescription:
            serializer = serializers.HospitalPrescriptionSerializer(
                hospital_prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Hospital prescription item created successfully",
                serializer.data,
                "hospital_prescription",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Hospital prescription item not created",errors)   
    elif request.data["action"] == "DeleteHospitalPrescriptionItem":
        errors, hospital_prescription = order_utils.delete_hospital_prescription_item(
            request.data, request.user
        )
        if hospital_prescription:
            serializer = serializers.HospitalPrescriptionSerializer(
                hospital_prescription, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Hospital prescription item deleted successfully",
                serializer.data,
                "hospital_prescription",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Hospital prescription item not deleted",errors)   
    elif request.data["action"] == "GetDependantHospitalPrescriptions":
            """Get all dependant hospital prescriptions"""

            vitals_queue =order_utils.get_dependant_hospital_prescriptions(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.HospitalPrescriptionSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)  
    elif request.data["action"] == "GetAdmissionPrescriptionItems":
            """Get all prescription items for all admission prescriptions"""

            prescription_items =order_utils.get_admission_prescription_items(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(prescription_items, request)
            serializer = serializers.HospitalPrescriptionItemSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)    
    elif request.data["action"] == "UpdateHospitalPrescriptionItemAdministration":
        errors, hospital_prescription_item = order_utils.update_hospital_prescription_item_administration(
            request.data, request.user
        )
        if hospital_prescription_item:
            serializer = serializers.HospitalPrescriptionItemSerializer(
                hospital_prescription_item, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Hospital prescription updated successfully",
                serializer.data,
                "hospital_prescription_item",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Hospital prescription not updated",errors)   
    elif request.data["action"] == "GetAllHospitalPrescriptions":
            """Get all dependant hospital prescriptions"""

            vitals_queue =order_utils.get_all_hospital_prescriptions(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.HospitalPrescriptionSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)  
    elif request.data["action"] == "GetQueuingHospitalPrescriptions":
            """Get queuing dependant hospital prescriptions"""

            vitals_queue =order_utils.get_queuing_hospital_prescriptions(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.HospitalPrescriptionSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)  
    elif request.data["action"] == "GetDepartmentPrescriptions":
            """Get department prescriptions"""

            vitals_queue =order_utils.get_department_prescriptions(request.data, request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(vitals_queue, request)
            serializer = serializers.HospitalPrescriptionSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "GetOrCreatePrescriptionOrder":
        errors, prescription_order = order_utils.create_prescription_order(
            request.data, request.user
        )
        if prescription_order:
            serializer = serializers.PrescriptionOrdersSerializer(
                prescription_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Prescription order created successfully",
                serializer.data,
                "prescription_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Hospital prescription not created",errors)     
    elif request.data["action"] == "ClosePrescriptionOrder":
        errors, prescription_order = order_utils.close_prescription_order(
            request.data, request.user
        )
        if prescription_order:
            serializer = serializers.PrescriptionOrdersSerializer(
                prescription_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Prescription order closed successfully",
                serializer.data,
                "prescription_order", 
            )
        if len(errors)>0:
            return custom_errors_response(1,"Hospital prescription order not closed",errors)     
    elif request.data["action"] == "GetPrescriptionOrderPayments":
            """Get prescription order payments"""

            prescription_orders =models.PrescriptionOrderPayments.objects.filter(owner=request.user).order_by("-created")
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(prescription_orders, request)
            serializer = serializers.PrescriptionOrderPaymentsSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "GetUserPrescriptionOrders":
            """Get prescription orders"""

            prescription_orders =models.PrescriptionOrders.objects.filter(owner=request.user).order_by("-created")
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(prescription_orders, request)
            serializer = serializers.PrescriptionOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "GetAdmissionPrescriptionOrders":
            """Get prescription orders"""
            prescription_orders=[]
            admission =None
            if "admission" in request.data and not request.data["admission"]=="":
                 errors, admission = hospitals_model_validators.validate_admission(request.data["admission"])
                 if admission:
                      if models.PrescriptionOrders.objects.filter(owner=request.user,hospital_prescription__admission=admission,status="COMPLETE").exists():
                           prescription_orders=models.PrescriptionOrders.objects.filter(owner=request.user,hospital_prescription__admission=admission,status="COMPLETE").all().order_by("-created")
                 
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(prescription_orders, request)
            serializer = serializers.PrescriptionOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "GetAdmissionLaboratoryOrders":
            """Get laboratory orders"""
            prescription_orders=[]
            admission =None
            if "admission" in request.data and not request.data["admission"]=="":
                 errors, admission = hospitals_model_validators.validate_admission(request.data["admission"])
                 if admission:
                      if models.LaboratoryOrders.objects.filter(admission=admission).exists():
                           prescription_orders=models.LaboratoryOrders.objects.filter(admission=admission).all()
                 
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(prescription_orders, request)
            serializer = serializers.LaboratoryOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "GetAdmissionPhysiotherapyOrders":
            """Get physiotherapy orders"""
            prescription_orders=[]
            admission =None
            if "admission" in request.data and not request.data["admission"]=="":
                 errors, admission = hospitals_model_validators.validate_admission(request.data["admission"])
                 if admission:
                      if models.PhysiotherapyOrders.objects.filter(admission=admission).exists():
                           prescription_orders=models.PhysiotherapyOrders.objects.filter(admission=admission).all()
                 
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(prescription_orders, request)
            serializer = serializers.PhysiotherapyOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "GetAdmissionRadiologyOrders":
            """Get radiology orders"""
            prescription_orders=[]
            admission =None
            if "admission" in request.data and not request.data["admission"]=="":
                 errors, admission = hospitals_model_validators.validate_admission(request.data["admission"])
                 if admission:
                      if models.RadiologyOrders.objects.filter(admission=admission).exists():
                           prescription_orders=models.RadiologyOrders.objects.filter(admission=admission).all()
                 
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(prescription_orders, request)
            serializer = serializers.RadiologyOrdersSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "UpdatePrescriptionOrder":
        errors, prescription_order = order_utils.update_prescription_order(
            request.data, request.user
        )
        if prescription_order:
            serializer = serializers.PrescriptionOrdersSerializer(
                prescription_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Prescription order updated successfully",
                serializer.data,
                "prescription_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Prescription order not updated",errors)       
    elif request.data["action"] == "CreatePrescriptionOrderItem":
        errors, prescription_order = order_utils.create_or_update_prescription_order_item(
            request.data, request.user
        )
        if prescription_order:
            serializer = serializers.PrescriptionOrdersSerializer(
                prescription_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Prescription order item created successfully",
                serializer.data,
                "prescription_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Prescription order item not updated",errors)  
    elif request.data["action"] == "DeletePrescriptionOrderItem":
        errors, prescription_order = order_utils.delete_prescription_order_item(
            request.data, request.user
        )
        if prescription_order:
            serializer = serializers.PrescriptionOrdersSerializer(
                prescription_order, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Prescription order item created successfully",
                serializer.data,
                "prescription_order",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Prescription order not created",errors)   
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]

)
@renderer_classes([JSONRenderer,])
@parser_classes([JSONParser, MultiPartParser])
def hospitalInpatientStaffAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateAdmission":
        errors, visit = inpatient_utils.create_admission(
            request.data, request.user
        )
        if visit:
            serializer = serializers.AdmissionSerializer(
                visit, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Admission created successfully",
                serializer.data,
                "admission",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Admission not created",errors)
    elif request.data["action"] == "UpdateAdmission":
        errors, visit = inpatient_utils.update_admission(
            request.data, request.user
        )
        if visit:
            serializer = serializers.AdmissionSerializer(
                visit, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Admission details updated  successfully",
                serializer.data,
                "admission",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Admission details not updated",errors)
    elif request.data["action"] == "GetAdmissions":
            """Get admissions"""

            admissions =inpatient_utils.get_admissions(request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(admissions, request)
            serializer = serializers.AdmissionSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "CreateBloodPressureChartEntry":
        errors, visit = inpatient_utils.create_blood_pressure_chart_entry(
            request.data, request.user
        )
        if visit:
            serializer = serializers.BloodPressureChartSerializer(
                visit, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Blood pressure charted successfully",
                serializer.data,
                "blood_pressure_chart_entry",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Blood pressure not charted",errors)
    elif request.data["action"] == "GetAdmissionBloodPressureEntries":
            """Get patient blood pressure entries for an admission"""

            entries =inpatient_utils.get_patient_blood_pressure_entries(request.data,request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(entries, request)
            serializer = serializers.BloodPressureChartSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data) 
    elif request.data["action"] == "GetDependantAdmission":
        errors, admission = inpatient_utils.get_dependant_admussion(
            request.data, request.user
        )
        if admission:
            serializer = serializers.AdmissionSerializer(
                admission, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Admision details retrieved successfully",
                serializer.data,
                "admission",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Admission not retrieved",errors)
    elif request.data["action"] == "CreatePatientNursingCadexEntry":
            errors, visit = inpatient_utils.create_patient_nursing_cadex_entry(
                request.data, request.user
            )
            if visit:
                serializer = serializers.PatientNursingCadexSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Patient nursing cadex entry created successfully",
                    serializer.data,
                    "patient_nursing_cadex_entry",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Patient nursing cadex entry not created",errors)
    elif request.data["action"] == "GetPatientNursingCadexEntries":
            """Get patient nursing cadex entries for an admission"""

            admissions =inpatient_utils.get_patient_nursing_cadex_entries(request.data,request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(admissions, request)
            serializer = serializers.PatientNursingCadexSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)   
    elif request.data["action"] == "CreateContinuationSheetEntry":
            errors, visit = inpatient_utils.create_continous_sheet_entry(
                request.data, request.user
            )
            if visit:
                serializer = serializers.ContinousSheetSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Continous sheet entry created successfully",
                    serializer.data,
                    "continous_sheet_entry",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Continous sheet entry not created",errors)
    elif request.data["action"] == "GetContinuationSheetEntries":
            """Get continous entries for an admission"""

            admissions =inpatient_utils.get_continous_sheet_entries(request.data,request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(admissions, request)
            serializer = serializers.ContinousSheetSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)   
    elif request.data["action"] == "CreateTreatmentSheetEntry":
            errors, visit = inpatient_utils.create_treatment_sheet_entry(
                request.data, request.user
            )
            if visit:
                serializer = serializers.TreatmentSheetSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Treatment sheet entry created successfully",
                    serializer.data,
                    "treatment_sheet_entry",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Treatment sheet entry not created",errors)
    elif request.data["action"] == "GetTreatmentSheetEntries":
            """Get treatment sheet entries for an admission"""

            admissions =inpatient_utils.get_treatment_sheet_entries(request.data,request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(admissions, request)
            serializer = serializers.TreatmentSheetSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)  
    elif request.data["action"] == "CreateAdmissionNursingCadex":
            errors, admission_nursing_cadex = inpatient_utils.create_admission_nursing_cadex(
                request.data, request.user
            )
            if admission_nursing_cadex:
                serializer = serializers.AdmissionNursingCadexSerializer(
                    admission_nursing_cadex, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Admission nursing cadex created successfully",
                    serializer.data,
                    "admission_nursing_cadex",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Admission nursing cadex not created",errors)          
    elif request.data["action"] == "GetAdmissionNursingCadexEntry":
            errors, admission_nursing_cadex = inpatient_utils.get_admission_nursing_cadex(
                request.data, request.user
            )
            if admission_nursing_cadex:
                serializer = serializers.AdmissionNursingCadexSerializer(
                    admission_nursing_cadex, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Admission nursing cadex retrieved successfully",
                    serializer.data,
                    "admission_nursing_cadex",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Admission nursing cadex not retrieved",errors)          
    elif request.data["action"] == "UpdateAdmissionNursingCadex":
            errors, visit = inpatient_utils.update_admission_nursing_cadex(
                request.data, request.user
            )
            if visit:
                serializer = serializers.AdmissionNursingCadexSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Admission nursing cadex updated successfully",
                    serializer.data,
                    "admission_nursing_cadex",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Admission nursing cadex plan not updated",errors) 
    elif request.data["action"] == "CreateNursingCarePlan":
            errors, visit = inpatient_utils.create_nursing_care_plan(
                request.data, request.user
            )
            if visit:
                serializer = serializers.NursingCarePlanSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Nursing care plan created successfully",
                    serializer.data,
                    "nursing_care_plan",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Nursing care plan not created",errors) 
    elif request.data["action"] == "UpdateNursingCarePlan":
            errors, visit = inpatient_utils.update_nursing_care_plan(
                request.data, request.user
            )
            if visit:
                serializer = serializers.NursingCarePlanSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Nursing care plan updated successfully",
                    serializer.data,
                    "nursing_care_plan",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Nursing care plan not updated",errors) 
    
    elif request.data["action"] == "GetAdmissionNursingCarePlans":
            """Getnursing care plans for an admission"""

            admissions =inpatient_utils.get_admission_care_plans(request.data,request.user)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(admissions, request)
            serializer = serializers.NursingCarePlanSerializer(
                page, many=True, context={"request": request, "user": request.user}
            )
            return paginator.get_paginated_response(serializer.data)  
    
    elif request.data["action"] == "CreateComprehensionFirstCadex":
            errors, visit = inpatient_utils.create_comprehension_first_cadex(
                request.data, request.user
            )
            if visit:
                serializer = serializers.ComprehensionFirstCadexSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Comprehension first cadex created successfully",
                    serializer.data,
                    "comprehension_first_cadex",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Comprehension first cadex not created",errors) 
    elif request.data["action"] == "GetComprehensionFirstCadexEntry":
            errors, comprehension_first_cadex = inpatient_utils.get_comprehension_first_cadex(
                request.data, request.user
            )
            if comprehension_first_cadex:
                serializer = serializers.ComprehensionFirstCadexSerializer(
                    comprehension_first_cadex, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Comprehension first cadex retrieved successfully",
                    serializer.data,
                    "comprehension_first_cadex",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Comprehension first cadex not retrieved",errors) 
    elif request.data["action"] == "UpdateComprehensionFirstCadex":
            errors, visit = inpatient_utils.update_comprehension_first_cadex(
                request.data, request.user
            )
            if visit:
                serializer = serializers.ComprehensionFirstCadexSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Comprehension first cadex updated successfully",
                    serializer.data,
                    "comprehension_first_cadex",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Comprehension first cadex not updated",errors)        
    elif request.data["action"] == "CreateTheatreOperationNotes":
            errors, visit = inpatient_utils.create_theatre_operation_notes(
                request.data, request.user
            )
            if visit:
                serializer = serializers.TheatreOperationNotesSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Theatre operation notes created successfully",
                    serializer.data,
                    "theatre_operation_notes",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Theatre operation notes not created",errors) 
    elif request.data["action"] == "UpdateTheatreOperationNotes":
            errors, visit = inpatient_utils.update_theatre_operation_notes(
                request.data, request.user
            )
            if visit:
                serializer = serializers.TheatreOperationNotesSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Theatre operation notes updated successfully",
                    serializer.data,
                    "create_theatre_operation_notes",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Theatre operation notes not updated",errors) 
    elif request.data["action"] == "CreateMaternityAdmissionChart":
            errors, visit = inpatient_utils.create_maternity_admission_chart(
                request.data, request.user
            )
            if visit:
                serializer = serializers.MaternityAdmissionChartSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Maternity admission chart created successfully",
                    serializer.data,
                    "maternity_admission_chart",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Maternity admission chart not created",errors) 
    elif request.data["action"] == "UpdateMaternityAdmissionChart":
            errors, visit = inpatient_utils.update_maternity_admission_chart(
                request.data, request.user
            )
            if visit:
                serializer = serializers.MaternityAdmissionChartSerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Maternity admission updated successfully",
                    serializer.data,
                    "maternity_admission_chart",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Maternity admission not updated",errors) 
    elif request.data["action"] == "CreateDischargeSummary":
            errors, visit = inpatient_utils.create_discharge_summary(
                request.data, request.user
            )
            if visit:
                serializer = serializers.DischargeSummarySerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Discharge summary created successfully",
                    serializer.data,
                    "discharge_summary",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Discharge summary not created",errors) 
    elif request.data["action"] == "UpdateDischargeSummary":
            errors, visit = inpatient_utils.update_discharge_summary(
                request.data, request.user
            )
            if visit:
                serializer = serializers.DischargeSummarySerializer(
                    visit, many=False, context={"request": request}
                )
                return custom_success_message(
                    0,
                    "Discharge summary updated successfully",
                    serializer.data,
                    "discharge_summary",
                )

            if len(errors)>0:
                return custom_errors_response(1,"Discharge summary not updated",errors)         
    elif request.data["action"] == "GetAdmissionDischargeSummary":
        errors, discharge_summary = inpatient_utils.get_admission_discharge_summary(
            request.data, request.user
        )
        if discharge_summary:
            print("Am here")
            serializer = serializers.DischargeSummarySerializer(
                discharge_summary, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Discharge summary retrieved successfully",
                serializer.data,
                "discharge_summary",
            )
        else:
            if len(errors)>0:
                return custom_errors_response(1,"Discharge summary not retrieved",errors) 
    
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')




@api_view(["POST"])
@permission_classes(
    [
        permissions.IsAuthenticated,
    ]

)
@renderer_classes([JSONRenderer,])
@parser_classes([JSONParser, MultiPartParser])
def slotsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "GetAllOpenSlots":
        """Get all categories for users"""

        categories = models.Slots.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(categories, request)
        serializer = serializers.SlotSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)


    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')


@api_view(["POST"])
@permission_classes(
    [
        permissions.AllowAny,
    ]

)
@renderer_classes([JSONRenderer,])
@parser_classes([JSONParser, MultiPartParser])
def openHospitalsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")
    if request.data["action"] == "CreateVisitorTicket":
        """Create visitor ticket"""

        errors, visitor_ticket = hospital_utils.create_visitor_ticket(
            request.data, 
        )
        if visitor_ticket:
            serializer = serializers.VisitorTicketsSerializer(
                visitor_ticket, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Visitor ticket created successfully",
                serializer.data,
                "visitor_ticket",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Visitor ticket not created",errors)
    if request.data["action"] == "UpdateVisitorTicket":
        """update visitor ticket"""

        errors, visitor_ticket = hospital_utils.update_visitor_ticket(
            request.data, 
        )
        if visitor_ticket:
            serializer = serializers.VisitorTicketsSerializer(
                visitor_ticket, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Visitor ticket created successfully",
                serializer.data,
                "visitor_ticket",
            )
        if len(errors)>0:
            return custom_errors_response(1,"Visitor ticket not created",errors)
    elif request.data["action"] == "GetAllVisitorTickets":
        """Get all visitor tickets for today"""

        visitor_tickets = models.VisitorTickets.objects.filter(entity=request.user.entity,created__gte=date.today())
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(visitor_tickets, request)
        serializer = serializers.VisitorTicketsSerializer(
            page, many=True, context={"request": request, "user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)
    else:
        raise exceptions.ValidationError(
            f'Action { request.data["action"]} is unknown')

class DrugAdministrationRoutine(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    def get_date(self, administration):
         return administration.created
    
    def get_administrations_for_date(self, administrations_list, date):
        adms =[]
        qss = administrations_list.filter(created__gte=date,created__lte=date)
        for qs in qss:
            item ={
                "id":qs.id,
                "administration_date":qs.administration_date
            }
            adms.append(item)
        return adms
    
    def post(self,request):
        prescription_item =None
        administrations =[]
        final={}
        if "prescription_item" in request.data and not request.data["prescription_item"]=="":
            errors, prescription_item= hospitals_model_validators.validate_hospital_prescription_item(request.data["prescription_item"])
        if prescription_item:
             if models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=prescription_item).exists():
                administrations = models.HospitalPrescriptionItemAdministrations.objects.filter(hospital_prescription_item=prescription_item).all()

                print("administrations",administrations)

                dates = list(set(map(self.get_date, administrations)))

                print("dates",dates)
                
                for date in dates:
                    
                    final[str(date)]= self.get_administrations_for_date(administrations, date)
            
        else:
             raise exceptions.ValidationError(errors)
        
        # weekly_orders =[]
        # days=[]
        # now = datetime.now()

        # for x in range(7):
        #     items_value=0.00
        #     orders=[]
        #     d = now - timedelta(days=x)
        #     days.append(d)
        #     items = CustomerOrderItems.objects.filter(created=d,customer_order__status="COMPLETED",entity=request.user.entity)
        #     orders = CustomerOrders.objects.filter(entity=request.user.entity,created=d).all()
        #     for item in items:
        #         items_value=items_value+ float(item.item_price_total)
        #         print(item.created)
        #     weekly_orders.append({"date":d.strftime("%Y-%m-%d"),"items":len(items),"value":items_value,"orders":len(orders)})
        # final["weekly_orders"]=weekly_orders

    
        return JsonResponse({"data": final},status=200)  