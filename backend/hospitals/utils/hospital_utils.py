from .. import models
import re
from datetime import datetime, date
from django.db.models import Q
from services.models import LaboratoryServices, RadiologyServices,PhysiotherapyServices


def generate_visitor_number(department):
    entity_today_length=0

    title = department.title
    title = title.replace(" ", "")
    title = re.sub('[^A-Za-z0-9]+', '', title)
    title = re.sub("\(.*?\)", "", title)
    title = re.sub("\[.*?\]", "", title)
    title = re.sub(r"[-()\"#/@;:<>{}`+=~|.!?,]", "", title)
    first_lettera = title[:4]
    if models.VisitorTickets.objects.filter(entity=department.entity,department=department,created__gte=date.today()).exists():
        entity_today_length = models.VisitorTickets.objects.filter(entity=department.entity,department=department,created__gte=date.today()).count()
    entry_number = str(first_lettera+str(entity_today_length).zfill(4)).upper()

    return entry_number

def create_visitor_ticket(data):
    errors=[]
    department =""
    department = None
    country_id=None
    visitor_names=None
    visitor_phone=None
    identifier_type=None
    identifier_number=None
    visitor_number = None
    if not "visitor_names" in  data or data["visitor_names"]=="":
        errors.append("Visitor names are required")
        return errors,None
    else:
        visitor_names=data["visitor_names"]
       

    if not "country" in data or  data["country"]=="":
        errors.append("Select visitor country")
        return errors,None
    else:
        country_id = data["country"]
        print(country_id)
    
    if not data or not data["department"] or data["department"]==None:
        errors.append("Select department to visit")
        return errors,None
    else:
        department_id = data["department"]
       
       

    if not "visitor_phone" in data  or data["visitor_phone"]=="":
        errors.append("Enter visitor phone")
        return errors,None
    else:
        visitor_phone=data["visitor_phone"]

    if not data or not data["identifier_type"] or data["identifier_type"]==None:
        errors.append("Enter visitor identifier type")
        return errors,None
    else:
        identifier_type=data["identifier_type"]

    if not data or not data["identifier_number"] or data["identifier_number"]==None:
        errors.append("Enter visitor identifier type")
        return errors,None
    else:
        identifier_number=data["identifier_number"]
    
   
    if models.Departments.objects.filter(id=department_id).exists():
        department=models.Departments.objects.filter(id=department_id).first()
        visitor_number = generate_visitor_number(department)
    else:
        errors.append("No department with provided ID")
        return errors, None
    
    visitor_ticket = models.VisitorTickets.objects.create(entity=department.entity,department=department,
                                                          country_id=country_id,
                                                          visitor_number=visitor_number,
                                                          identifier_type=identifier_type,
                                                          identifier_number=identifier_number,
                                                          visitor_names=visitor_names,
                                                          visitor_phone=visitor_phone)
    return [],visitor_ticket


def update_visitor_ticket(data):
    errors=[]
    departure_time=None
    visitor_ticket_id=None
    visitor_ticket=None


    if not data or not data["visitor_ticket"] or data["visitor_ticket"]==None:
        errors.append("Ticket ID is required")
        return errors,None
    else:
        visitor_ticket_id=data["visitor_ticket"]
        if models.VisitorTickets.objects.filter(id=visitor_ticket_id).exists():
            visitor_ticket=models.VisitorTickets.objects.filter(id=visitor_ticket_id).first()
        else:
            errors.append("No ticket for provided ID")
            return errors,None

    if not data or not data["departure_time"] or data["departure_time"]==None:
        errors.append("Departure time required")
        return errors,None
    else:
        departure_time=data["departure_time"]

        if visitor_ticket.departure_time:
            errors.append("Departure time is already updated")
            return errors,None
        else:
            visitor_ticket.departure_time=departure_time
            visitor_ticket.save()

            return [], visitor_ticket
        

def search_laboratory_services(data, user):
    laboratory_services = []
    # Search through all laboratory_services for admin users
    
    laboratory_services =LaboratoryServices.objects.filter(
            Q(title__icontains=data['searchQuery']) 
        )

    return laboratory_services

def search_radiology_services(data, user):
    radiology_services = []
    # Search through all radiology_services for admin users
    
    radiology_services =RadiologyServices.objects.filter(
            Q(title__icontains=data['searchQuery']) 
        )

    return radiology_services

def search_physiotherapy_services(data, user):
    physiotherapy_services = []
    # Search through all physiotherapy_services for admin users
    
    physiotherapy_services =PhysiotherapyServices.objects.filter(
            Q(title__icontains=data['searchQuery']) 
        )

    return physiotherapy_services
