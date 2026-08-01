from .. import models
def validate_preparation(id):
    errors=[]
    if models.Preparation.objects.filter(id=id).exists():
        return [],models.Preparation.objects.filter(id=id).first()
    else:
        errors.append("No preparation exists with provided ID")
        return errors, None