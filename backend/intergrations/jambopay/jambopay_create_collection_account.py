# from intergrations.jambopay.jambopay_wallet import get_auth_token
import requests
from decouple import config

def jambopay_create_collection_account(data,user):
    tenant_accounts=[]
    # token = get_auth_token()
    token =None
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    query_params = {"phoneNumber": user.phone, "key2": "value2"}
    result = requests.get(
        config("JAMBOPAY_BASE_URL") + "/wallet/account",
        params=query_params,
        headers=headers,
    )

    result_json = result.json()
    print("result json", result_json)
    if "count" in result_json and "data" in result_json:
        tenant_accounts=[]
        
        for item in result_json["data"]:
            if item["tenant"]["phoneNumber"]=="25472217348" and item["name"]==data["name"]:
                return [],item
        
            else:
                # Create new account
                result = requests.post(
                    config("JAMBOPAY_BASE_URL") + "/wallet/account",
                    data=data,
                    headers=headers,
                )
                result_json=result.json()
                if "accountNo" in result_json:
                    return [], result_json
                

                