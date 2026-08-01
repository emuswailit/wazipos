from .. import models
from rest_framework import exceptions

def validate_sacco_product(id):
    
    if models.SaccoProducts.objects.filter(id=id).exists():
        return models.SaccoProducts.objects.filter(id=id).first()
    else:
        raise exceptions.ValidationError("No sacco product for provided ID")
def validate_sacco_member(id):
    
    if models.Members.objects.filter(id=id).exists():
        return models.Members.objects.filter(id=id).first()
    else:
        raise exceptions.ValidationError("No sacco member for provided ID")
    

def validate_sacco_member_account(id):
    
    if models.MemberAccounts.objects.filter(id=id).exists():
        return models.MemberAccounts.objects.filter(id=id).first()
    else:
        raise exceptions.ValidationError("No sacco member account for provided ID")
    
def validate_loan_application(id):
    
    if models.LoanApplications.objects.filter(id=id).exists():
        return models.LoanApplications.objects.filter(id=id).first()
    else:
        raise exceptions.ValidationError("No loan application for provided ID")
