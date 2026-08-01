import qrcode
from PIL import Image
from utils.encription import encrypt
from core.responses import custom_errors_response
from intergrations.jambopay.jambopay_get_profile_accounts import get_jambopay_main_profile_accounts
from authentication.models import Users
from django.db import transaction
from authentication.validators.authentication_models_validators import validate_entity
def generate_qr_code(data, user):
    errors=[]
    data_to_encrypt =""
    if not "phone_or_email" in data or data["phone_or_email"]=="":
        errors.append("Phone or email is required")
    if not "password" in data or data["password"]=="":
        errors.append("Password is required")

    if len(errors)>0:
        return errors, None
    else:
        phone_or_email =data["phone_or_email"]
        password=data["password"]
        data_to_encrypt=f"{phone_or_email}:{password}"  
        encrypted_data = encrypt(data_to_encrypt)
        print("Enc",encrypted_data)
     

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=8,
        border=4,
    )
    qr.add_data("https://wazipos.com/front/"+encrypted_data)
    # qr.add_data("http://localhost:3000/front/"+encrypted_data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    return {}, img



@transaction.atomic
def create_user_and_wallet(data, user):
    errors = []
    firstName = None
    lastName = None
    identityType = None
    identityNumber = None
    phoneNumber = None
    gender = None
    dateOfBirth = None
    county = None
    physicalAddress = None
    email = None
    entity = None
    user = None

    if not "user_details" in data:
        errors.append("User details are required")
    
    if not "entity" in data["user_details"]:
        errors.append("Entity ID is required")
    else:
        entity_id = data["user_details"]["entity"]
        entity = validate_entity(entity_id)

    if not "firstName" in data["user_details"]:
        errors.append("First name is required")
    else:
        firstName = data["user_details"]["firstName"]

    if not "lastName" in data["user_details"]:
        errors.append("First name is required")
    else:
        lastName = data["user_details"]["lastName"]

    if not "identityType" in data["user_details"]:
        errors.append("Ientity type is required")
    else:
        identityType = data["user_details"]["identityType"]


    if not "identityNumber" in data["user_details"]:
        errors.append("Identity number is required")
    else:
        identityNumber = data["user_details"]["identityNumber"]


    if not "phoneNumber" in data["user_details"]:
        errors.append("Phone number is required")
    else:
        phoneNumber = data["user_details"]["phoneNumber"]


    if not "gender" in data["user_details"]:
        errors.append("Gender is required")
    else:
        gender = data["user_details"]["gender"]


    if not "dateOfBirth" in data["user_details"]:
        errors.append("First name is required")
    else:
        dateOfBirth = data["user_details"]["dateOfBirth"]


    if not "county" in data["user_details"]:
        errors.append("First name is required")
    else:
        county = data["user_details"]["county"]

    if not "physicalAddress" in data["user_details"]:
        errors.append("Physical address is required")
    else:
        physicalAddress = data["user_details"]["physicalAddress"]

    if not "email" in data["user_details"]:
        errors.append("Email is required")
    else:
        email = data["user_details"]["email"]
    
    if len(errors)>0:
        return errors, None
    else:
        profile_data = data["user_details"]
        errors, accounts = get_jambopay_main_profile_accounts(phoneNumber)
###
        if accounts:
            if Users.objects.filter(phone=phoneNumber).exists():
                user = Users.objects.filter(phone=phoneNumber).first()
                errors.append("User has wallet and is already registerered")
                return errors, None
            else:
                # Create new user
                user = Users.objects.create(phone = phoneNumber, 
                                            email=email, 
                                            gender = gender, 
                                            password = identityNumber, 
                                            identifier_number=identityNumber, 
                                            identifier_type=identityType,
                                            first_name = firstName,
                                            last_name = lastName,
                                            date_of_birth = dateOfBirth,
                                            entity=entity
                                            )
            if user:
                errors.append("User not created")
                return [], user
            else:
                return errors, None
        else:
            errors, profile = create_jambopay_profile(profile_data)