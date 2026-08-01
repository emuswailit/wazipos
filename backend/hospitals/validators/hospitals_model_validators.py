from .. import models

def validate_laboratory_orders(id):
    errors=[]
    laboratory_order=None
    if models.LaboratoryOrders.objects.filter(id=id).exists():
        laboratory_order=models.LaboratoryOrders.objects.filter(id=id).first()
        return [],laboratory_order
    else:
        errors.append("No laboratory order for provided ID exists")
        return errors,None
    
def validate_radiology_orders(id):
    errors=[]
    radiology_order=None
    if models.RadiologyOrders.objects.filter(id=id).exists():
        radiology_order=models.RadiologyOrders.objects.filter(id=id).first()
        return [],radiology_order
    else:
        errors.append("No radiology order for provided ID exists")
        return errors,None
def validate_physiotherapy_orders(id):
    errors=[]
    radiology_order=None
    if models.PhysiotherapyOrders.objects.filter(id=id).exists():
        radiology_order=models.PhysiotherapyOrders.objects.filter(id=id).first()
        return [],radiology_order
    else:
        errors.append("No physiotherapy order for provided ID exists")
        return errors,None
    
def validate_hospital_prescription(id):
    errors=[]
    hospital_prescription=None
    if models.HospitalPrescription.objects.filter(id=id).exists():
        hospital_prescription=models.HospitalPrescription.objects.filter(id=id).first()
        return [],hospital_prescription
    else:
        errors.append("No prescription order for provided ID exists")
        return errors,None
    
def validate_entity_laboratory_services(id):
    errors=[]
    entity_laboratory_service=None
    if models.EntityLaboratoryServices.objects.filter(id=id).exists():
        entity_laboratory_service=models.EntityLaboratoryServices.objects.filter(id=id).first()
        return [],entity_laboratory_service
    else:
        errors.append("No instance exists for provided laboratry servce ID")
        return errors,None

def validate_entity_radiology_services(id):
    errors=[]
    entity_radiology_service=None
    if models.EntityRadiologyServices.objects.filter(id=id).exists():
        entity_radiology_service=models.EntityRadiologyServices.objects.filter(id=id).first()
        return [],entity_radiology_service
    else:
        errors.append("No radiology service instance exists for provided ID")
        return errors,None
    


def validate_entity_physiotherapy_services(id):
    errors=[]
    entity_physiotherapy_service=None
    if models.EntityPhysiotherapyServices.objects.filter(id=id).exists():
        entity_physiotherapy_service=models.EntityPhysiotherapyServices.objects.filter(id=id).first()
        return [],entity_physiotherapy_service
    else:
        errors.append("No instance exists for provided ID")
        return errors,None
    
def validate_laboratory_examinaton(id):
    errors=[]
    laboratory_examinaton=None
    if models.LaboratoryExaminations.objects.filter(id=id).exists():
        laboratory_examinaton=models.LaboratoryExaminations.objects.filter(id=id).first()
        return [],laboratory_examinaton
    else:
        errors.append("No instance exists for provided ID")
        return errors,None
    

def validate_prescription_order(id):
    errors=[]
    prescription_order=None
    if models.PrescriptionOrders.objects.filter(id=id).exists():
        prescription_order=models.PrescriptionOrders.objects.filter(id=id).first()
        return [],prescription_order
    else:
        errors.append("No prescription order instance exists for provided ID")
        return errors,None
    

def validate_prescription_order_item(id):
    errors=[]
    prescription_order_item=None
    if models.PrescriptionOrderItems.objects.filter(id=id).exists():
        prescription_order_item=models.PrescriptionOrderItems.objects.filter(id=id).first()
        return [],prescription_order_item
    else:
        errors.append("No prescription order item instance exists for provided ID")
        return errors,None
    

def validate_hospital_prescription_item(id):
    errors=[]
    hospital_prescription_item=None
    if models.HospitalPrescriptionItem.objects.filter(id=id).exists():
        hospital_prescription_item=models.HospitalPrescriptionItem.objects.filter(id=id).first()
        return [],hospital_prescription_item
    else:
        errors.append("No prescription item instance exists for provided ID")
        return errors,None
    
def validate_entity_sub_store_receipt(id):
    errors=[]
    hospital_prescription_item=None
    if models.EntitySubStoreReceipts.objects.filter(id=id).exists():
        hospital_prescription_item=models.EntitySubStoreReceipts.objects.filter(id=id).first()
        return [],hospital_prescription_item
    else:
        errors.append("No receipt item instance exists for provided ID")
        return errors,None
    
def validate_admission(id):
    errors=[]
    admission=None
    if models.Admission.objects.filter(id=id).exists():
        admission=models.Admission.objects.filter(id=id).first()
        return [],admission
    else:
        errors.append("No admission instance exists for provided ID")
        return errors,None