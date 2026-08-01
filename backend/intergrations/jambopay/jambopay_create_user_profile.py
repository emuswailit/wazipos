from decouple import config
import requests

# from intergrations.jambopay.jambopay_generate_token import get_auth_token

def create_jambopay_profile(profile_data):
    errors =[]
    # token = get_auth_token()
    token =""
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    result = requests.post(
        config("JAMBOPAY_BASE_URL") + "/wallet/profile", data=profile_data, headers=headers
    )
    profile = result.json()
    if "firstName" in profile and "lastName" in profile and "identityNumber" in profile:
    
        return [], profile
    else:
        
        for i in profile["message"]:
            errors.append(i)
        return errors, None