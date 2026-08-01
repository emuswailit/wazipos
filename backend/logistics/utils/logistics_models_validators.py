from .. import models

def validate_organization_store(id):
    errors=[]
    if models.OrganizationStore.objects.filter(id=id).exists():
        return [],models.OrganizationStore.objects.filter(id=id).first()
    else:
        errors.append("Organization Store with provided ID does not exist")
        return errors,None
    
def validate_organization_sub_store(id):
    errors=[]
    if models.OrganizationSubStore.objects.filter(id=id).exists():
        return [],models.OrganizationSubStore.objects.filter(id=id).first()
    else:
        errors.append("Organization Sub Store with provided ID does not exist")
        return errors,None
    
def validate_entity_store(id):
    errors=[]
    if models.EntityStore.objects.filter(id=id).exists():
        return [],models.EntityStore.objects.filter(id=id).first()
    else:
        errors.append("Entity Store with provided ID does not exist")
        return errors,None
    
def validate_entity_sub_store(id):
    errors=[]
    if models.EntitySubStore.objects.filter(id=id).exists():
        return [],models.EntitySubStore.objects.filter(id=id).first()
    else:
        errors.append("Entity Sub Store with provided ID does not exist")
        return errors,None
    

def validate_entity_sub_store_receipt(id):
    errors=[]
    if models.EntitySubStoreReceipts.objects.filter(id=id).exists():
        return [],models.EntitySubStoreReceipts.objects.filter(id=id).first()
    else:
        errors.append("Entity Sub Store receipt with provided ID does not exist")
        return errors,None
    
def validate_entity_store_issue(id):
    errors=[]
    if models.EntityStoreIssues.objects.filter(id=id).exists():
        return [],models.EntityStoreIssues.objects.filter(id=id).first()
    else:
        errors.append("Entity Store issues with provided ID does not exist")
        return errors,None
    

def validate_entity_store_receipt(id):
    errors=[]
    if models.EntityStoreReceipts.objects.filter(id=id).exists():
        return [],models.EntityStoreIssues.objects.filter(id=id).first()
    else:
        errors.append("Entity Store receipt with provided ID does not exist")
        return errors,None