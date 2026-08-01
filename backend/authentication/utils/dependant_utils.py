from .. import models
from django.db.models import Q
from core.phone_number_utils import get_telco_by_phone_number

def search_dependants (data):
    dependants =[]
    searchQuery=""
    phone =None

    if "searchQuery" in data and not data["searchQuery"]==None:
        searchQuery = data["searchQuery"]

        if(len(searchQuery)==10 and searchQuery[0]=="0"):

            telco, phone_number = get_telco_by_phone_number(searchQuery)
            if phone_number:
                dependants= models.Dependants.objects.filter(
                     Q(user__phone__iexact=phone_number)
                )
        else:

            dependants= models.Dependants.objects.filter(
                Q(user__identifier_number__iexact=searchQuery) |  Q(user__phone__iexact=searchQuery)
            )
    
    return dependants