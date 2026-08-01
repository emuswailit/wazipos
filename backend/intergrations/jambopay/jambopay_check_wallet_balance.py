from email import errors
# from intergrations.jambopay.jambopay_generate_token import get_auth_token
from decouple import config
import requests
import asyncio
def check_wallet_balance(data):
    errors=[]
    token=None
    # token = get_auth_token()

    headers = {
                "Authorization": "Bearer " + token,
            }
           
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/balance",
            data=data,
            headers=headers,
        )
    result_json = result.json()

    print("status of", result_json)
    if result_json:

        if "balance" in result_json:

            return [], result_json["balance"]
        else:
            if "message" in result_json:
                for m in result_json["message"]:
                    errors.append(m)
                return errors, None
    else:
        return ["No result json"], None

