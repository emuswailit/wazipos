
from datetime import timedelta, date, datetime
from payments.models import BranchCollectionAccount
from employees.validators.employees_models_validators import validate_employee
from intergrations.jambopay.jambopay_wallet import get_wallet_balance
from . import models


def retrieve_bar_collection(days_ago,branch_collection_account):
    bar_collection= []
    
    today = datetime.today()
    
    for x in range(days_ago):
        qs= []
        total_day_bar_collection=0.00
        this_date = today - timedelta(days = x)
        
        qs = models.BarOrderPaymentSettlement.objects.filter(created__date=this_date,branch_collection_account=branch_collection_account).all()
        print("qs", qs)
        for i in qs:
            total_day_bar_collection = total_day_bar_collection + float(i.amount)
        else:
            print("No match")

        bar_collection.append({f"{this_date.date()}": {"value":total_day_bar_collection,"number":len(qs)}})

    return bar_collection

def retrieve_food_collection(days_ago,branch_collection_account):
    food_collection= []
    qs=[]
    
    today = datetime.today()
    
    for x in range(days_ago):
        total_day_food_collection=0.00
        this_date = today - timedelta(days = x)
        
        qs = models.FoodOrderPaymentSettlement.objects.filter(created__date=this_date,branch_collection_account=branch_collection_account).all()
        print("qs", qs)
        for i in qs:
            total_day_food_collection = total_day_food_collection + float(i.amount)
        else:
            print("No match")

        food_collection.append({f"{this_date.date()}": {"value":total_day_food_collection,"number":len(qs)}})

    return food_collection

def retrieve_accommodation_collection(days_ago,branch_collection_account):
    accommodation_collection= []
    qs=[]
    
    today = datetime.today()
    
    for x in range(days_ago):
        total_day_accommodation_collection=0.00
        this_date = today - timedelta(days = x)
        
        qs = models.AccommodationOrderPaymentSettlement.objects.filter(created__date=this_date,branch_collection_account=branch_collection_account).all()
        print("qs", qs)
        for i in qs:
            total_day_accommodation_collection = total_day_accommodation_collection + float(i.amount)
        else:
            print("No match")

        accommodation_collection.append({f"{this_date.date()}": {"value":total_day_accommodation_collection,"number":len(qs)}})

    return accommodation_collection

def retrieve_accommodation_payments(days_ago,branch_collection_account):
    accommodation_payments= []
    
    today = datetime.today()
    
    for x in range(days_ago):
        total_day_accommodation_payments=0.00
        this_date = today - timedelta(days = x)
        
        qs = models.AccomodationOrderPayments.objects.filter(created__date=this_date,branch_collection_account=branch_collection_account,status="SUCCESS").all()
        print("qs", qs)
        for i in qs:
            total_day_accommodation_payments = total_day_accommodation_payments + float(i.amount)
        else:
            print("No match")

        accommodation_payments.append({f"{this_date.date()}": total_day_accommodation_payments})

    return accommodation_payments
    

def retrieve_branch_collection_account_data(user):
    errors = []
    data= {}
    employee = None
    employee = validate_employee(user)
    branch_collection_account = None
    if BranchCollectionAccount.objects.filter(branch = employee.current_branch).exists():
        branch_collection_account = BranchCollectionAccount.objects.filter(branch = employee.current_branch).first()

        payload = {
            "account_number": branch_collection_account.account_number
        }
        errors, balance_json = get_wallet_balance(payload)
        days_ago = 7

        data = {
            "acccount_details":{
                "account_name":branch_collection_account.account_name,
                "account_number":branch_collection_account.account_number,
                "current_balance":balance_json["balance"]
            },
            "bar_collection": retrieve_bar_collection(days_ago,branch_collection_account),
            "food_collection": retrieve_food_collection(days_ago,branch_collection_account),
            "accommodation_collection": retrieve_accommodation_collection(days_ago,branch_collection_account),
            "accommodation_payments": retrieve_accommodation_payments(days_ago,branch_collection_account),
            
        }
        return [], data
    else:
        errors.append("Account details not retrieved")
        return errors, data
    

 