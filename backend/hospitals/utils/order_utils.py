from rest_framework import exceptions
import json
from authentication.models import Departments
from authentication.validators import authentication_models_validators
from employees.utils import employees_models_validators
from .. import models 
from ..validators import hospitals_model_validators
from logistics.utils import logistics_models_validators
from drugs.models import Preparation,Routes,Frequency
from datetime import date
from products.models import Products
from authentication.models import Dependants
from core.date_utils import get_today
from payments.validators import payments_models_validators
from authentication.utils.utils import generate_reference_number,get_telco_by_phone_number,use_reference_number
from payments.models import UserAccounts
from intergrations.jambopay.jp_mobile_money_checkout import jambopay_mobile_checkout
from intergrations.jambopay.jambopay_wallet import get_account_by_phone
from intergrations.jambopay.jambopay_wallet import customer_order_payment, jambopay_wallet_checkout
from .inventory_utils import update_sub_store_inventory
from ..utils import consultations_models_validators
from utils.logging import create_log


## Laboratory orders
def create_laboratory_orders(data,user):
    errors=[]
    origin_department = None
    destination_department = None
    dependant = None
    created = None
    employee=None
    referral_comment=None
    admission = None
    reference_number=None

    employee = employees_models_validators.validate_employee(user)

    if  "admission" in data and not data['admission']=="":
       errors,  admission = hospitals_model_validators.validate_admission(data["admission"])

    if not "origin_department" in data or data['origin_department']=="":
        errors.append("Origin department ID is required")
        return errors,None
    else:
        origin_department = authentication_models_validators.validate_department(data["origin_department"],user)

    if not "destination_department" in data or data['destination_department']=="":
        errors.append("Origin department ID is required")
        return errors,None
    else:
        destination_department = authentication_models_validators.validate_department(data["destination_department"],user)
    
    if "referral_comment" in data and not data["referral_comment"]=="":
        referral_comment = data["referral_comment"]
    
    if not "dependant" in data or data['dependant']=="":
        errors.append("Dependant ID is required")
        return errors,None
    else:
        dependant =authentication_models_validators.validate_dependant(data['dependant'])

    if models.LaboratoryOrders.objects.filter(destination_department=destination_department,dependant=dependant,is_closed="false",created__gte=date.today(),entity=user.entity).exists():
        # errors.append(f"An open laboratory order for {dependant} already exists")
        existing =  models.LaboratoryOrders.objects.filter(destination_department=destination_department,dependant=dependant,is_closed="false",created__gte=date.today(),entity=user.entity).first()
        return [],existing
    try:
        print("am here")
        reference_number = generate_reference_number(user.entity,user)
        created = models.LaboratoryOrders.objects.create(
            reference_number=reference_number,
            admission=admission,
            origin_department=origin_department,
            destination_department=destination_department,
            referral_comment=referral_comment,
            dependant=dependant,
            created_by=employee,
            entity=user.entity,
            owner=user
        )
        if created:
            use_reference_number(reference_number)
            return [],created
    except Exception as e:
        errors.append(str(e))
        return errors, None

def get_laboratory_order_payments(data,user):
    from datetime import date
    laboratory_order_payments =[]
    today = date.today()
   

    laboratory_order_payments= models.LaboratoryOrderPayments.objects.filter(entity=user.entity).all()
    return laboratory_order_payments

def get_pharmacy_order_payments(data,user):
    from datetime import date
    pharmacy_order_payments =[]
    today = date.today()
   
    pharmacy_order_payments= models.PrescriptionOrderPayments.objects.filter(entity=user.entity).all()
    return pharmacy_order_payments

def get_physiotherapy_order_payments(data,user):
    from datetime import date
    physiotherapy_order_payments =[]
    today = date.today()
   
    physiotherapy_order_payments= models.PhysiotherapyOrderPayments.objects.filter(entity=user.entity).all()
    return physiotherapy_order_payments

def get_radiology_order_payments(data,user):
    from datetime import date
    radiology_order_payments =[]
    today = date.today()
   
    radiology_order_payments= models.RadiologyOrderPayments.objects.filter(entity=user.entity).all()
    return radiology_order_payments





def get_all_laboratory_orders(data,user):
    from datetime import date
    laboratory_orders =[]
    today = date.today()
    employee = employees_models_validators.validate_employee(user)

    laboratory_orders= models.LaboratoryOrders.objects.filter(entity=user.entity).all()
    return laboratory_orders

def get_dependant_laboratory_orders(data,user):
    
    dependant = None
    laboratory_orders =[]
    if not "dependant" in data or data['dependant']=="":
        raise exceptions.ValidationError("Client ID is required")
    else:
        if Dependants.objects.filter(id=data['dependant']).exists():
            dependant=Dependants.objects.filter(id=data['dependant']).first()
            laboratory_orders= models.LaboratoryOrders.objects.filter(dependant=dependant).all()
    return laboratory_orders

def create_laboratory_examination(data,user):
    laboratory_order=None
    created=None
    employee =None
    errors =[]
    examination=None
    
    if not "examination" in data or data["examination"]=="":
        errors.append("Laboratory examnation/service ID is required")
    else:
        errors, examination = hospitals_model_validators.validate_entity_laboratory_services(data['examination'])

        if errors and not examination:
            return errors,None

    
    
    if not "laboratory_order" in data or data["laboratory_order"]=="":
        errors.append("Laboratory Order ID is required")
    else:
        errors, laboratory_order = hospitals_model_validators.validate_laboratory_orders(data['laboratory_order'])
        if errors and not laboratory_order:
            return errors,None
        elif laboratory_order and laboratory_order.is_closed=="true": 
            errors.append("Order is closed")
            return errors,None
        elif laboratory_order and examination:
            if models.LaboratoryExaminations.objects.filter(laboratory_order=laboratory_order,examination=examination).exists():
                errors.append("Selected service is already added to rder")
                return errors,None

    employee = employees_models_validators.validate_employee(user)

    
    
    if len(errors)>0:
        return errors,None
    else:
        created = models.LaboratoryExaminations.objects.create(
            requested_by=employee,
            examination=examination,
            laboratory_order=laboratory_order,
            entity=user.entity,
            owner=user
            )
        if created:
            return [],laboratory_order

def update_laboratory_examination(data,user):
    processed_by =None
    laboratory_examination=None
    errors=[]



    if "laboratory_examination" in data and not data['laboratory_examination']=="":
       laboratory_examination = hospitals_model_validators.validate_laboratory_examinaton(data['laboratory_examination'])
           
    if "processed_by" in data and not data['processed_by']=="":
        user = authentication_models_validators.validate_user(data['processed_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            laboratory_examination.processed_by=employee
            laboratory_examination.save()

    if "reported_by" in data and not data['reported_by']=="":
        user = authentication_models_validators.validate_user(data['reported_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            laboratory_examination.reported_by=employee
            laboratory_examination.save()
    
    
    if "report" in data and not data["report"]=="":
        laboratory_examination.report = data["report"]
        laboratory_examination.save()

    return errors,laboratory_examination

def update_laboratory_order(data,user):
    processed_by =None
    laboratory_order=None
    errors=[]



    if "laboratory_order" in data and not data['laboratory_order']=="":
       errors, laboratory_order = hospitals_model_validators.validate_laboratory_orders(data['laboratory_order'])
       if not laboratory_order and errors:
           return errors,None
           
    if "processed_by" in data and not data['processed_by']=="":
        user = authentication_models_validators.validate_user(data['processed_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            laboratory_order.processed_by=employee
            laboratory_order.save()

    if "reported_by" in data and not data['reported_by']=="":
        user = authentication_models_validators.validate_user(data['reported_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            laboratory_order.reported_by=employee
            laboratory_order.save()
    
    
    if "report" in data and not data["report"]=="":
        laboratory_order.report = data["report"]
        laboratory_order.save()

    if "is_closed" in data and not data["is_closed"]=="":
        laboratory_order.is_closed = data["is_closed"]
        if models.LaboratoryExaminations.objects.filter(laboratory_order=laboratory_order).count()>0:
            laboratory_order.save()
        else:
            errors.append("Order has no added examinations thus cannot be closed. You can delete it instaed")
            return errors,None

    return errors,laboratory_order


##Radiology

def create_radiology_orders(data,user):
    errors=[]
    origin_department = None
    destination_department = None
    dependant = None
    created = None
    employee=None
    referral_comment=None
    existing =None
    admission =None
    reference_number=None

    if  "admission" in data and not data['admission']=="":
        errors,admission = hospitals_model_validators.validate_admission(data["admission"])


    employee = employees_models_validators.validate_employee(user)

    if not "dependant" in data or data['dependant']=="":
        errors.append("Dependant ID is required")
        return errors,None
    else:
        dependant =authentication_models_validators.validate_dependant(data['dependant'])

    if not "origin_department" in data or data['origin_department']=="":
        errors.append("Origin department ID is required")
        return errors,None
    else:
        origin_department = authentication_models_validators.validate_department(data["origin_department"],user)

    if not "destination_department" in data or data['destination_department']=="":
        errors.append("Origin department ID is required")
        return errors,None
    else:
        destination_department = authentication_models_validators.validate_department(data["destination_department"],user)

    if models.RadiologyOrders.objects.filter(origin_department=origin_department,dependant=dependant,is_closed="false",created__gte=date.today(),entity=user.entity).exists():
      
        existing=models.RadiologyOrders.objects.filter(origin_department=origin_department,dependant=dependant,is_closed="false",created__gte=date.today(),entity=user.entity).first()
        # errors.append(f"An open radiology order for {dependant} already exists")
        return [],existing
        
 
    
    if "referral_comment" in data and not data["referral_comment"]=="":
        referral_comment = data["referral_comment"]


    print("Am here 2")
    try:
        reference_number = generate_reference_number(user.entity,user)
        created = models.RadiologyOrders.objects.create(
            reference_number=reference_number,
            admission=admission,
            origin_department=origin_department,
            destination_department=destination_department,
            referral_comment=referral_comment,
            dependant=dependant,
            created_by=employee,
            entity=user.entity,
            owner=user
        )
        if created:
            use_reference_number(reference_number)
            return [],created
    except Exception as e:
        
        errors.append(str(e))
        return errors, None
    
def get_all_radiology_orders(data,user):
    from datetime import date
    radiology_orders =[]
    today = date.today()

    # radiology_orders= models.RadiologyOrders.objects.filter(created__gte=today,entity=user.entity).all()
    radiology_orders= models.RadiologyOrders.objects.filter(entity=user.entity).all()
    return radiology_orders

def get_dependant_radiology_orders(data,user):
    dependant = None
    radiology_orders =[]
    if not "dependant" in data or data['dependant']=="":
        raise exceptions.ValidationError("Client ID is required")
    else:
        if Dependants.objects.filter(id=data['dependant']).exists():
            dependant=Dependants.objects.filter(id=data['dependant']).first()
            radiology_orders= models.RadiologyOrders.objects.filter(dependant=dependant).all()
    return radiology_orders

def create_radiology_examination(data,user):
    radiology_order=None
    created=None
    employee =None
    errors =[]
    examination=None
    
    if not "examination" in data or data["examination"]=="":
        errors.append("Radiology examnation/service ID is required")
    else:
        errors, examination = hospitals_model_validators.validate_entity_radiology_services(data['examination'])

        if errors and not examination:
            return errors,None

    
    
    if not "radiology_order" in data or data["radiology_order"]=="":
        errors.append("Laboratory Order ID is required")
    else:
        errors, radiology_order = hospitals_model_validators.validate_radiology_orders(data['radiology_order'])
        if errors and not radiology_order:
            return errors,None
        elif radiology_order and examination:
            if models.RadiologyExaminations.objects.filter(radiology_order=radiology_order,examination=examination).exists():
                errors.append("Selected service is already added to rder")
                return errors,None

    employee = employees_models_validators.validate_employee(user)

    
    
    if len(errors)>0:
        return errors,None
    else:
        created = models.RadiologyExaminations.objects.create(
            requested_by=employee,
            examination=examination,
            radiology_order=radiology_order,
            entity=user.entity,
            owner=user
            )
        if created:
            return [],radiology_order

def update_radiology_examination(data,user):
    processed_by =None
    radiology_examination=None
    errors=[]



    if "radiology_examination" in data and not data['radiology_examination']=="":
       radiology_examination = hospitals_model_validators.validate_radiology_examinaton(data['radiology_examination'])
           
    if "processed_by" in data and not data['processed_by']=="":
        user = authentication_models_validators.validate_user(data['processed_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            radiology_examination.processed_by=employee
            radiology_examination.save()

    if "reported_by" in data and not data['reported_by']=="":
        user = authentication_models_validators.validate_user(data['reported_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            radiology_examination.reported_by=employee
            radiology_examination.save()
    
    
    if "report" in data and not data["report"]=="":
        radiology_examination.report = data["report"]
        radiology_examination.save()

    return errors,radiology_examination.radiology_order

def update_physiotherapy_order(data,user):
    processed_by =None
    physiotherapy_order=None
    errors=[]
    if "physiotherapy_order" in data and not data['physiotherapy_order']=="":
       errors, physiotherapy_order = hospitals_model_validators.validate_physiotherapy_orders(data['physiotherapy_order'])
       if not physiotherapy_order and errors:
           return errors,None
           
    if "processed_by" in data and not data['processed_by']=="":
        user = authentication_models_validators.validate_user(data['processed_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            physiotherapy_order.processed_by=employee
            physiotherapy_order.save()

    if "reported_by" in data and not data['reported_by']=="":
        user = authentication_models_validators.validate_user(data['reported_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            physiotherapy_order.reported_by=employee
            physiotherapy_order.save()
    
    
    if "report" in data and not data["report"]=="":
        physiotherapy_order.report = data["report"]
        physiotherapy_order.save()

    if "is_closed" in data and not data["is_closed"]=="":
        physiotherapy_order.is_closed = data["is_closed"]
        if models.PhysiotherapyProcedures.objects.filter(physiotherapy_order=physiotherapy_order).count()>0:
            physiotherapy_order.save()
        else:
            errors.append("Order has no added procedures thus cannot be closed. You can delete it instaed")
            return errors,None

    return errors,physiotherapy_order

def update_radiology_order(data,user):
    processed_by =None
    radiology_order=None
    errors=[]

    print("Dara",data)

    if "radiology_order" in data and not data['radiology_order']=="":
       errors, order = hospitals_model_validators.validate_radiology_orders(data['radiology_order'])
       print("order here",order)
       print("errors here",errors)
       if  errors:
           return errors,None
       elif order:
           radiology_order=order
    else:
        errors.append("Radiology rder ID is required")
        return errors,None
           
    if "processed_by" in data and not data['processed_by']=="":
        user = authentication_models_validators.validate_user(data['processed_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            radiology_order.processed_by=employee
            radiology_order.save()

    if "reported_by" in data and not data['reported_by']=="":
        user = authentication_models_validators.validate_user(data['reported_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            radiology_order.reported_by=employee
            radiology_order.save()
    
    
    if "report" in data and not data["report"]=="":
        radiology_order.report = data["report"]
        radiology_order.save()

    if "is_closed" in data and not data["is_closed"]=="":
        radiology_order.is_closed = data["is_closed"]
        if models.RadiologyExaminations.objects.filter(radiology_order=radiology_order).count()>0:
            radiology_order.save()
        else:
            errors.append("Order has no added examinations thus cannot be closed. You can delete it instaed")
            return errors,None

    return errors,radiology_order
##Physiotherapy

def create_physiotherapy_orders(data,user):
    errors=[]
    origin_department = None
    destination_department = None
    dependant = None
    created = None
    employee=None
    referral_comment=None
    admission=None
    existing = None


    if  "admission" in data and not data['admission']=="":
        errors, admission = hospitals_model_validators.validate_admission(data["admission"])

    employee = employees_models_validators.validate_employee(user)

    if not "origin_department" in data or data['origin_department']=="":
        errors.append("Origin department ID is required")
        return errors,None
    else:
        origin_department = authentication_models_validators.validate_department(data["origin_department"],user)

    if not "destination_department" in data or data['destination_department']=="":
        errors.append("Origin department ID is required")
        return errors,None
    else:
        destination_department = authentication_models_validators.validate_department(data["destination_department"],user)
    
    
    if not "dependant" in data or data['dependant']=="":
        errors.append("Dependant ID is required")
        return errors,None
    else:
        dependant =authentication_models_validators.validate_dependant(data['dependant'])

    if "referral_comment" in data and not data["referral_comment"]=="":
        referral_comment = data["referral_comment"]
    
    
    if models.PhysiotherapyOrders.objects.filter(destination_department=destination_department,dependant=dependant,is_closed="false",created__gte=date.today(),entity=user.entity).exists():
        # errors.append(f"An open physiotherapy order for {dependant} already exists")
        existing =models.PhysiotherapyOrders.objects.filter(destination_department=destination_department,dependant=dependant,is_closed="false",created__gte=date.today(),entity=user.entity).first()
        return [],existing
    try:
        reference_number = generate_reference_number(user.entity,user)
        created = models.PhysiotherapyOrders.objects.create(
            reference_number=reference_number,
            admission=admission,
            origin_department=origin_department,
            destination_department=destination_department,
            referral_comment=referral_comment,
            dependant=dependant,
            created_by=employee,
            entity=user.entity,
            owner=user
        )
        if created:
            use_reference_number(reference_number)
            return [],created
    except Exception as e:
        errors.append(str(e))
        return errors,None

def get_all_physiotherapy_orders(data,user):
    from datetime import date
    physiotherapy_orders =[]
    today = date.today()

    physiotherapy_orders= models.PhysiotherapyOrders.objects.filter(entity=user.entity).all().order_by("-created")
    return physiotherapy_orders

def get_dependant_physiotherapy_orders(data,user):
    dependant = None
    physiotherapy_orders =[]
    if not "dependant" in data or data['dependant']=="":
        raise exceptions.ValidationError("Client ID is required")
    else:
        if Dependants.objects.filter(id=data['dependant']).exists():
            dependant=Dependants.objects.filter(id=data['dependant']).first()
            physiotherapy_orders= models.PhysiotherapyOrders.objects.filter(dependant=dependant).all().order_by("-created")
    return physiotherapy_orders

def create_physiotherapy_procedure(data,user):
    physiotherapy_order=None
    created=None
    employee =None
    errors =[]
    examination=None
    
    if not "procedure" in data or data["procedure"]=="":
        errors.append("Laboratory examnation/service ID is required")
    else:
        errors, procedure = hospitals_model_validators.validate_entity_physiotherapy_services(data['procedure'])

        if errors and not procedure:
            return errors,None
    if not "physiotherapy_order" in data or data["physiotherapy_order"]=="":
        errors.append("Physiotherapy order ID is required")
    else:
        errors, physiotherapy_order = hospitals_model_validators.validate_physiotherapy_orders(data['physiotherapy_order'])
        if errors and not physiotherapy_order:
            return errors,None
        elif physiotherapy_order and examination:
            if models.PhysiotherapyOrders.objects.filter(physiotherapy_order=physiotherapy_order,examination=examination).exists():
                errors.append("Selected service is already added to rder")
                return errors,None

    employee = employees_models_validators.validate_employee(user)

    
    
    if len(errors)>0:
        return errors,None
    else:
        try:
            created = models.PhysiotherapyProcedures.objects.create(
                requested_by=employee,
                procedure=procedure,
                physiotherapy_order=physiotherapy_order,
                entity=user.entity,
                owner=user
                )
            if physiotherapy_order:
                return [],physiotherapy_order
        except Exception as e:
            errors.append(str(e))
            return errors, None

def update_physiotherapy_examination(data,user):
    processed_by =None
    physiotherapy_examination=None
    errors=[]



    if "physiotherapy_examination" in data and not data['physiotherapy_examination']=="":
       physiotherapy_examination = hospitals_model_validators.validate_physiotherapy_examinaton(data['physiotherapy_examination'])
           
    if "processed_by" in data and not data['processed_by']=="":
        user = authentication_models_validators.validate_user(data['processed_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            physiotherapy_examination.processed_by=employee
            physiotherapy_examination.save()

    if "reported_by" in data and not data['reported_by']=="":
        user = authentication_models_validators.validate_user(data['reported_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            physiotherapy_examination.reported_by=employee
            physiotherapy_examination.save()
    
    
    if "report" in data and not data["report"]=="":
        physiotherapy_examination.report = data["report"]
        physiotherapy_examination.save()

    return errors,physiotherapy_examination



#Hospital prescriptions

def get_all_hospital_prescriptions(data,user):
    from datetime import date
    hospital_prescriptions =[]
    today = date.today()

    # hospital_prescriptions= models.HospitalPrescription.objects.filter(created__gte=today,entity=user.entity).all()
    hospital_prescriptions= models.HospitalPrescription.objects.filter(entity=user.entity).all().order_by('-created')
    return hospital_prescriptions

def get_queuing_hospital_prescriptions(data,user):
    from datetime import date
    hospital_prescriptions =[]
    today = date.today()

    # hospital_prescriptions= models.HospitalPrescription.objects.filter(created__gte=today,entity=user.entity).all()
    hospital_prescriptions= models.HospitalPrescription.objects.filter(entity=user.entity,status="QUEUING").order_by('-created')
    return hospital_prescriptions



def get_department_prescriptions(data,user):
    department =None
    from datetime import date
    hospital_prescriptions =[]
    today = date.today()
    employee = employees_models_validators.validate_employee(user)
    department=employee.department

    hospital_prescriptions= models.HospitalPrescription.objects.filter(created__gte=today,entity=user.entity, entity_sub_store__department=department).all().order_by("-created")
    return hospital_prescriptions

def get_dependant_hospital_prescriptions(data,user):
    
    from datetime import date
    hospital_prescriptions =[]
    today = date.today()

    if "dependant" in data and not data["dependant"]=="":
        dependant = authentication_models_validators.validate_dependant(data["dependant"])

        hospital_prescriptions= models.HospitalPrescription.objects.filter(created__gte=today,entity=user.entity,dependant=dependant).all().order_by("-created")
    return hospital_prescriptions

def get_admission_prescription_items(data,user):
    
    prescription_items=[]

    if  "admission" in data and not  data['admission']=="":

        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if admission:
            if models.HospitalPrescriptionItem.objects.filter(hospital_prescription__admission=admission).exists():
                prescription_items= models.HospitalPrescriptionItem.objects.filter(hospital_prescription__admission=admission).all()
    return prescription_items

def update_hospital_prescription_item_administration(data,user):
    administration=None
    errors=[]
    if  "hospital_prescription_item_administration" in data or data["hospital_prescription_item_administration"]=="":
        if models.HospitalPrescriptionItemAdministrations.objects.filter(id=data["hospital_prescription_item_administration"]).exists():
            administration=models.HospitalPrescriptionItemAdministrations.objects.filter(id=data["hospital_prescription_item_administration"]).first()

            if "comment" in data and not data["comment"]=="":
                administration.comment=data["comment"]
            if "is_administered" in data and not data["is_administered"]=="":
                administration.is_administered=data["is_administered"]
                administration.save()
            return [],administration.hospital_prescription_item
        
        else:
            errors.append("Item not found")
            return errors, None
    else:
        errors.append("Administration ID ire required")
        return errors, None

def create_hospital_prescription(data,user):
    errors=[]
    origin_department = None
    destination_department = None
    dependant = None
    created = None
    employee=None
    entity_sub_store=None
    nature = None
    admission = None
    existing = None

    employee = employees_models_validators.validate_employee(user)

    if not "origin_department" in data or data['origin_department']=="":
        errors.append("Origin department ID is required")
        return errors,None
    else:
        if Departments.objects.filter(id=data['origin_department']).exists():
            origin_department =Departments.objects.filter(id=data['origin_department']).first()

    if "nature" in data and not data["nature"]=="":
        nature = data["nature"]  




    if  "admission" in data and not  data['admission']=="":

        errors, admission = consultations_models_validators.validate_admission_model(data['admission'])
        if errors:
            return errors, None
        if models.HospitalPrescription.objects.filter(admission=admission, nature=nature,is_closed="false").exists():
            existing = models.HospitalPrescription.objects.filter(admission=admission, nature=nature,is_closed="false").first()
            return [], existing


    if not "entity_sub_store" in data or data['entity_sub_store']=="":
        errors.append("Dispensing pharmacy  ID is required")
        return errors,None
    else:
        if models.EntitySubStore.objects.filter(id=data['entity_sub_store']).exists():
            entity_sub_store =models.EntitySubStore.objects.filter(id=data['entity_sub_store']).first()
            if entity_sub_store.department:
                destination_department=entity_sub_store.department
    

    if not "dependant" in data or data['dependant']=="":
        errors.append("Dependant ID is required")
        return errors,None
    else:
        dependant =authentication_models_validators.validate_dependant(data['dependant'])

    if models.HospitalPrescription.objects.filter(origin_department=destination_department,dependant=dependant,is_closed="false",created__gte=date.today(),entity=user.entity,owner=user).exists():
        errors.append(f"An open hospital prescription for {dependant} already exists")
        return errors,None
    try:
        created = models.HospitalPrescription.objects.create(
            origin_department=origin_department,
            destination_department=destination_department,
            dependant=dependant,
            created_by=employee,
            entity=user.entity,
            owner=user,
            entity_sub_store=entity_sub_store,
            nature=nature,
            admission=admission
        )
        return [],created
    except Exception as e:
        errors.append(str(e))
        return errors,None

def create_hospital_prescription_item(data,user):
    errors=[]
    hospital_prescription = None
    preparation = None
    route = None
    frequency = None
    dependant = None
    created = None
    employee=None
    dose=None
    days=None
    product =None

    employee = employees_models_validators.validate_employee(user)

    if not "hospital_prescription" in data or data['hospital_prescription']=="":
        errors.append("Hospital prescription ID is required")
        return errors,None
    else:
        if models.HospitalPrescription.objects.filter(id=data['hospital_prescription']).exists():
            hospital_prescription =models.HospitalPrescription.objects.filter(id=data['hospital_prescription']).first()
        else:
            errors.append("No hospital prescription for provided ID exists")
            return errors,None
    
    if "product" in data and not data['product']=="":
        
        if Products.objects.filter(id=data["product"]).exists():
            product =Products.objects.filter(id=data["product"]).first()
    else:
        if Preparation.objects.filter(id=data['preparation']).exists():
            preparation =Preparation.objects.filter(id=data['preparation']).first()

        else:
            errors.append("No drug for provided ID exists")
            return errors,None
    if not "preparation" in data or data['preparation']=="":
        errors.append("Preparation ID is required")
        return errors,None
    else:
        if Preparation.objects.filter(id=data['preparation']).exists():
            preparation =Preparation.objects.filter(id=data['preparation']).first()

        else:
            errors.append("No drug for provided ID exists")
            return errors,None

    if not "route" in data or data['route']=="":
        errors.append("Route ID is required")
        return errors,None
    else:
        if Routes.objects.filter(id=data['route']).exists():
            route =Routes.objects.filter(id=data['route']).first()
        else:
            errors.append("No route  for provided ID exists")
            return errors,None
    
    if not "frequency" in data or data['frequency']=="":
        errors.append("Frequency ID is required")
        return errors,None
    else:
        if Frequency.objects.filter(id=data['frequency']).exists():
            frequency =Frequency.objects.filter(id=data['frequency']).first()
        else:
            errors.append("No frequncy for provided ID exists")
            return errors,None

    if not "dose" in data or data['dose']=="":
        errors.append("Dose is required")
        return errors,None
    else:
        dose =data['dose']

    if not "days" in data or data['days']=="":
        errors.append("Duration in days is required")
        return errors,None
    else:
        days =data['days']

    if models.HospitalPrescriptionItem.objects.filter(hospital_prescription=hospital_prescription,product=product,created__gte=date.today(),entity=user.entity,owner=user).exists():
        errors.append(f"Item is already added to prescription")
        return errors,None
    try:
        created = models.HospitalPrescriptionItem.objects.create(
            hospital_prescription=hospital_prescription,
            preparation=preparation,
            product=product,
            route=route,
            frequency=frequency,
            days=days,
            dose=dose,
            created_by=employee,
            prescribed_by=employee,
            entity=user.entity,
            owner=user,
        )
        if created:
            return [],hospital_prescription
    except Exception as e:
        errors.append(str(e))
        return errors, None

def delete_hospital_prescription_item(data,user):
    errors =[]
    hospital_prescription_item = None
    hospital_prescription = None

    if "hospital_prescription_item" in data and not data["hospital_prescription_item"]=="":
        if models.HospitalPrescriptionItem.objects.filter(id=data["hospital_prescription_item"]).exists():
            hospital_prescription_item =models.HospitalPrescriptionItem.objects.filter(id=data["hospital_prescription_item"]).first()
            hospital_prescription=hospital_prescription_item.hospital_prescription
            hospital_prescription_item.delete()
            return [],hospital_prescription
        else:
            errors.append("Item with given ID not found")
            return errors,None
        
    else:
        errors.append("Item ID is required")
        return errors,None
    
def update_hospital_prescription(data,user):
    processed_by =None
    laboratory_order=None
    errors=[]



    if "hospital_prescription" in data and not data['hospital_prescription']=="":
       errors, hospital_prescription = hospitals_model_validators.validate_hospital_prescription(data['hospital_prescription'])
       if not hospital_prescription and errors:
           return errors,None
           
    if "processed_by" in data and not data['processed_by']=="":
        user = authentication_models_validators.validate_user(data['processed_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            hospital_prescription.processed_by=employee
            hospital_prescription.save()

    if "reported_by" in data and not data['reported_by']=="":
        user = authentication_models_validators.validate_user(data['reported_by'])
        if user:
            employee =employees_models_validators.validate_employee(user)
            hospital_prescription.reported_by=employee
            hospital_prescription.save()
    


    if "is_closed" in data and not data["is_closed"]=="":
       
        if models.HospitalPrescriptionItem.objects.filter(hospital_prescription=hospital_prescription).count()>0:
            if hospital_prescription.is_closed=="false":
                hospital_prescription.is_closed="true"
                hospital_prescription.status="QUEUING"
                hospital_prescription.save()
            else:
                errors.append("Prescription is already closed")
                return errors,None
        else:
            errors.append("Prescription has no added items thus cannot be closed.")
            return errors,None

    return errors,hospital_prescription





def delete_laboratory_examination(data,user):
    errors =[]
    laboratory_order = None
    laboratory_examination = None

    if "laboratory_examination" in data and not data["laboratory_examination"]=="":
        if models.LaboratoryExaminations.objects.filter(id=data["laboratory_examination"]).exists():
            laboratory_examination =models.LaboratoryExaminations.objects.filter(id=data["laboratory_examination"]).first()
            laboratory_order=laboratory_examination.laboratory_order
            laboratory_examination.delete()
            return [],laboratory_order
        else:
            errors.append("Laboratory examination with given ID not found")
            return errors,None
        
    else:
        errors.append("laboratory examination ID is required")
        return errors,None
    

def delete_radiology_examination(data,user):
    errors =[]
    radiology_order = None
    radiology_examination = None

    if "radiology_examination" in data and not data["radiology_examination"]=="":
        if models.RadiologyExaminations.objects.filter(id=data["radiology_examination"]).exists():
            radiology_examination =models.RadiologyExaminations.objects.filter(id=data["radiology_examination"]).first()
            radiology_order=radiology_examination.radiology_order
            radiology_examination.delete()
            return [],radiology_order
        else:
            errors.append("Laboratory examination with given ID not found")
            return errors,None
        
    else:
        errors.append("laboratory examination ID is required")
        return errors,None
    
def delete_physiotherapy_procedure(data,user):
    errors =[]
    physiotherapy_procedure = None
    radiology_examination = None

    if "physiotherapy_procedure" in data and not data["physiotherapy_procedure"]=="":
        if models.PhysiotherapyProcedures.objects.filter(id=data["physiotherapy_procedure"]).exists():
            physiotherapy_procedure =models.PhysiotherapyProcedures.objects.filter(id=data["physiotherapy_procedure"]).first()
            physiotherapy_order=physiotherapy_procedure.physiotherapy_order
            physiotherapy_procedure.delete()
            return [],physiotherapy_order
        else:
            errors.append("Physiotherapy procedure with given ID not found")
            return errors,None
        
    else:
        errors.append("Physiotherapy procedure ID is required")
        return errors,None

## Prescription Orders

def create_prescription_order(data,user):
    errors =[]
    hospital_prescription=None
    entity_store=None
    entity_sub_store=None
    order_total_price=None
    employee=None
    existing_prescription_order=None
    reference_number=None

    if not "hospital_prescription" in data or data["hospital_prescription"]=="":
        errors.append("Prescription ID is required")
    else:
        errors, hospital_prescription = hospitals_model_validators.validate_hospital_prescription(data["hospital_prescription"])

        if models.PrescriptionOrders.objects.filter(hospital_prescription=hospital_prescription,status="OPEN", created__gte=get_today()).exists():
            existing_prescription_order=models.PrescriptionOrders.objects.filter(hospital_prescription=hospital_prescription,status="OPEN", created__gte=get_today()).first()
            return [],existing_prescription_order

    if  "entity_store" in data and not data["entity_store"]=="":
        errors, entity_store = hospitals_model_validators.validate_entity_store(data["entity_store"])
        

    if not "entity_sub_store" in data or data["entity_sub_store"]=="":
        errors.append("Store ID is required")
    else:
        errors, entity_sub_store = logistics_models_validators.validate_entity_sub_store(data["entity_sub_store"])



    employee = employees_models_validators.validate_employee(user)

    if len(errors)>0:
        return errors, None
    else:
        try:
            reference_number = generate_reference_number(user.entity, user)
            created = models.PrescriptionOrders.objects.create(
                reference_number=reference_number,
                hospital_prescription=hospital_prescription,
                admission=hospital_prescription.admission,
                entity_store=entity_store,
                entity=user.entity,
                owner=user,
                entity_sub_store=entity_sub_store,
                employee=employee,
                order_total_price=0.00,
                status="OPEN"
            )
            if created:
                use_reference_number(reference_number)
                return [], created
        except Exception as e:
            errors.append(str(e))
            return  errors, None
        

        
def process_prescription_order_payment(prescription_order, payment_method,user,mobile_money_phone):
    errors = []
    administrator_account = None
    reference_number = None

    reference_number = generate_reference_number(prescription_order.entity,prescription_order.owner)
    if payment_method.title=="CASH":
    

        # Cash payments
        try:
            created = models.PrescriptionOrderPayments.objects.create(
                payment_method=payment_method,
                reference_number=reference_number,
                status="SUCCESS",
                amount=prescription_order.order_total_price,
                entity=prescription_order.entity,
                owner=prescription_order.owner,
                prescription_order = prescription_order,
            )
        
            if created:
                print("Created")
                # print("payment", customer_order_payment)
                update_sub_store_inventory(prescription_order)
                prescription_order.status="COMPLETE"
                prescription_order.save()
                return [], prescription_order
        except Exception as e:
            errors.append(str(e))
            return errors, None
    elif payment_method.title=="CREDIT":
        errors.append("No available now")
        return errors, None

    elif payment_method.title=="MOBILE MONEY":
        amount = prescription_order.order_total_price
        if not prescription_order.entity.administrator:
            errors.append("Entity has no administrator")
            return errors, None
       
        if not UserAccounts.objects.filter(owner = prescription_order.entity.administrator).exists():
            errors.append("Entity admin has no collection account")
            return errors, None
        else:
            administrator_account =  UserAccounts.objects.filter(owner = prescription_order.entity.administrator).first()
            
      
            payload = None
            telco, formatted_phone_number = get_telco_by_phone_number(mobile_money_phone)
        

            if telco=="MPESA":
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount": int(prescription_order.order_total_price),
                    "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
                    "accountTo":  administrator_account.account_number,
                    "description": "Merchant payment",
                    "modeOfPayment": "MOBILE_MONEY",
                    "provider": "Mpesa",
                    "data": {
                        "phoneNumber": formatted_phone_number,
                        "serviceType": "MERCHANTPAYMENT"
                    }
                    })
           
            elif telco=="AIRTELMONEY":
                amount = prescription_order.order_total_price
                payload = json.dumps({
                    "orderId": reference_number,
                    "amount":  int(amount),
                    "callBackUrl": "https://webhook.site/94df1553-1b65-44c3-99ba-4ff3a32c554e",
                    "accountTo":administrator_account.account_number, 
                    "currency":"KES",
                    "description": "TOPUP",
                    "modeOfPayment": "MOBILE_MONEY",
                    "provider": "AIRTELMONEY",
                    "data": {
                        "phoneNumber": formatted_phone_number,
                        "serviceType": "MERCHANTPAYMENT" 
                    }
            
                    })
        
            errors, result_json = jambopay_mobile_checkout(payload)
            print("errors",errors)
            print("result_json",result_json)
            if errors:
                return errors, None
            else:
                if result_json:
                    created = models.PrescriptionOrderPayments.objects.create(
                        payment_method=payment_method,
                        reference_number=reference_number,
                        status="INITIATED",
                        amount=float(prescription_order.order_amount_total),
                        entity=prescription_order.entity,
                        owner=user,
                        prescription_order = prescription_order,
                        administrator_account=administrator_account,
                        psp_reference_number= result_json["ref"],
                        telco= telco
                    )
                    use_reference_number(reference_number)
                    if created:
                        return [], created
                    else:
                        errors.append("Customer order payment not created")
                        return errors, None


                else:
                    errors.append("Prescription order via mobile Airtel Mmoney failed")
                    return errors, None
                
        
    elif payment_method.title=="JAMBOPAY WALLET":


        if not prescription_order.entity.administrator:
            errors.append("Entity has no administrator")
            return errors, None
        
        if not UserAccounts.objects.filter(owner = user.entity.administrator).exists():
            errors.append("Entity adminisrator has no collection account")
            return errors, None
        else:
            administrator_account =  UserAccounts.objects.filter(owner = user.entity.administrator).first()

        errors, wallet = get_account_by_phone(mobile_money_phone)
        if wallet:
            data ={
                        "orderId": reference_number,
                        "amount":  int(prescription_order.orde_total_aamount),
                        "callBackUrl": "https://webhook.site/931bef21-de22-43bc-a45b-7e12999ac9cb",
                        "accountTo": administrator_account.account_number,
                        "description": "Customer order payment",
                        "modeOfPayment": "WALLET_AS_SERVICE",
                        "provider": "JAMBOPAY",
                        "data": {
                                "serviceType": "MERCHANTPAYMENT",
                                "accountNo": wallet
                        }
                        }
            response = jambopay_wallet_checkout(data)

            if not "statusCode" in response and  "ref" in response:
                try:
                    created = models.PrescriptionOrderPayments.objects.create(
                        payment_method=payment_method,
                        reference_number=reference_number,
                        status="INITIATED",
                        amount=float(prescription_order.order_total_amounnt),
                        entity=prescription_order.entity,
                        owner=user,
                        prescription_order = prescription_order,
                        entity_collection_account=administrator_account
                    )
                    use_reference_number(reference_number)
                    if created:
                    
                        return [], prescription_order
 
                        
                except Exception as e:
                    errors.append(str(e))
                    return errors, None
            else:
                # errors.append( str(response))
                return errors, None, None

        else:
            errors.append("No wallet for provided mobile phone")
            return errors, None
    else:
        errors.append("Unsupported payment method")
        return errors, None,None


def close_prescription_order(data,user):
    errors =[]
    prescription_order=None
    payment_method=None
    mobile_money_number=None
    if not "prescription_order" in data or data["prescription_order"]=="":
        errors.append("Prescription order ID is required")
        return errors, None
    else:
        errors, prescription_order=hospitals_model_validators.validate_prescription_order(data["prescription_order"])
        if errors:
            return errors, None
        elif prescription_order:
            if  models.PrescriptionOrderPayments.objects.filter(prescription_order=prescription_order).exists():
                errors.append("Order is already closed.")
                return errors, None
            else:
                pass
            if not models.PrescriptionOrderItems.objects.filter(prescription_order=prescription_order).exists():
                errors.append("Prescription order has no items added")
                return errors, None


    
    if not "payment_method" in data or data["payment_method"]=="":
        errors.append("Payment method ID is required")
        return errors, None
    else:
        payment_method= payments_models_validators.validate_payment_method_exists(data["payment_method"])

    if "mobile_money_number" in data and not data["mobile_money_number"]=="":
        mobile_money_number= data["mobile_money_number"]

    if len(errors)>0:
        return errors, None
    else:
        prescription_order.status="CLOSED"
        prescription_order.save()
        
        

        # Process payment based on selected payment method
        errors, prescription_order= process_prescription_order_payment(prescription_order,payment_method,user,mobile_money_number)
        if errors:
            return errors, None
        else:
            return [], prescription_order


 
def update_prescription_order(data,user):
    errors =[]
    prescription_order =None
    if not "prescription_order" in data or data["prescription_order"]=="":
        errors.append("Prescriptiion ID is required")
    else:
        prescription_order= hospitals_model_validators.validate_precription_order(data['prescription_order'])



def create_or_update_prescription_order_item(data,user):
    errors=[]
    prescription_order=None
    hospital_prescription_item=None
    issued_unit_quantity= None
    required_unit_quantity=None

    if not "prescription_order" in data or data["prescription_order"]=="":
        errors.append("Prescription ID is required")
        return errors,None
    else:
        errors, prescription_order=hospitals_model_validators.validate_prescription_order(data["prescription_order"])
        if errors:
            return errors,None
        else:
            print("prescription_order",prescription_order)


    if not "hospital_prescription_item" in data or data["hospital_prescription_item"]=="":
        errors.append("Prescription Item ID is required")
        return errors,None
    else:
        errors, hospital_prescription_item=hospitals_model_validators.validate_hospital_prescription_item(data["hospital_prescription_item"])
        if errors:
            return errors, None
        else:
            print("hospital_prescription_item",hospital_prescription_item)
        

    if not "entity_sub_store_receipt" in data or data["entity_sub_store_receipt"]=="":
        errors.append("Stock iten ID is required")
        return errors,None
    else:
        errors, entity_sub_store_receipt=hospitals_model_validators.validate_entity_sub_store_receipt(data["entity_sub_store_receipt"])
        if errors:
            return errors,None

    if not "required_unit_quantity" in data or data["required_unit_quantity"] =="":
        errors.append("Required quantity is required")
        return errors,None
    else:
        required_unit_quantity=data["required_unit_quantity"]
        # Set the required quantity and balance quantity for this product

        if hospital_prescription_item:
            hospital_prescription_item.required_unit_quantity=required_unit_quantity
            hospital_prescription_item.balance_unit_quantity=required_unit_quantity
            hospital_prescription_item.save()
   
    if not "issued_unit_quantity" in data or data["issued_unit_quantity"] =="":
        errors.append("Issued quantity is required")
        return errors, None
    else:
        issued_unit_quantity=data["issued_unit_quantity"]

    if models.PrescriptionOrderItems.objects.filter(prescription_order=prescription_order,hospital_prescription_item=hospital_prescription_item,entity_sub_store_receipt=entity_sub_store_receipt).exists():
        existing =models.PrescriptionOrderItems.objects.filter(prescription_order=prescription_order,hospital_prescription_item=hospital_prescription_item,entity_sub_store_receipt=entity_sub_store_receipt).first()
        existing.issued_unit_quantity=issued_unit_quantity
        existing.item_total_price=float(entity_sub_store_receipt.unit_selling_price) * float(issued_unit_quantity)
        existing.save()
        return [],prescription_order
    


    if len(errors)>0:
        return errors, None
    else:
        try:
            created = models.PrescriptionOrderItems.objects.create(
                entity=user.entity,
                owner=user,
                prescription_order=prescription_order,
                hospital_prescription_item=hospital_prescription_item,
                entity_sub_store_receipt=entity_sub_store_receipt,
                issued_unit_quantity=issued_unit_quantity,
                item_total_price=float(entity_sub_store_receipt.unit_selling_price) * float(issued_unit_quantity),
            )
            if created:
                return [],prescription_order
        except Exception as e:
            errors.append(str(e))
            return errors, None




def delete_prescription_order_item(data,user):
    errors=[]
    prescription_order_item=None
    prescription_order=None
    if not "prescription_order_item" in data or data["prescription_order_item"]=="":
        errors.append("Prescription order item ID is required")
        return errors, None
    else:
        errors, prescription_order_item= hospitals_model_validators.validate_prescription_order_item(data["prescription_order_item"])
        if prescription_order_item:
            prescription_order=prescription_order_item.prescription_order
            prescription_order_item.delete()
            return [],prescription_order
        else:
            return errors,None


