# from intergrations.jambopay.jambopay_generate_token import get_auth_token
from decouple import config
import requests


def jambopay_settlement_wallet_transfer(data):
    errors =[]

    # token = get_auth_token()
    token=None
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }
    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/transaction/transfer",
            data=data,
            headers=headers,
        )

    result_json=result.json()
    if "ref" in result_json:
        return [], result_json
    else:
        if "message" in result_json:
            for m in result_json["message"]:
                errors.append(m)
            return errors, None