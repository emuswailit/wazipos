import requests
from decouple import config

# from intergrations.jambopay.jambopay_wallet import get_auth_token

def jambopay_check_payment_status(ref):
    errors =[]
    # token = get_auth_token()
    token =""

    headers = {
                "Authorization": "Bearer " + token,
            }
           
    result = requests.get(
                config(f"JAMBOPAY_BASE_URL")
                + f"/wallet/transaction/{ref}",
                headers=headers,
            )
    result_json = result.json()

    print("status of", result_json)
    if result_json:

        if "message" in result_json:
                for m in result_json["message"]:
                    errors.append(m)
                return errors, None
        else:
            return [],result_json
    else:
        return ["No result json"], None
    
def check_payment_status(ref,token):
    errors =[]
 

    headers = {
                "Authorization": "Bearer " + token,
            }
           
    result = requests.get(
                config(f"JAMBOPAY_BASE_URL")
                + f"/wallet/transaction/{ref}",
                headers=headers,
            )
    result_json = result.json()

    print("status of", result_json)
    if result_json:

        if "message" in result_json:
                for m in result_json["message"]:
                    errors.append(m)
                return errors, None
        else:
            return [],result_json
    else:
        return ["No result json"], None
def jambopay_check_payment_status(ref):
    errors =[]
    # token = get_auth_token()
    token =""

    headers = {
                "Authorization": "Bearer " + token,
            }
           
    result = requests.get(
                config(f"JAMBOPAY_BASE_URL")
                + f"/wallet/transaction/{ref}",
                headers=headers,
            )
    result_json = result.json()

    print("status of", result_json)
    if result_json:

        if "message" in result_json:
                for m in result_json["message"]:
                    errors.append(m)
                return errors, None
        else:
            return [],result_json
    else:
        return ["No result json"], None