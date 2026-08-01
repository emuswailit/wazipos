import requests
from decouple import config

# from intergrations.jambopay.jambopay_generate_token import get_auth_token

def create_white_label_account(data):
    errors =[]
    token =None
    # token = get_auth_token()
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
    }

    result = requests.post(
            config("JAMBOPAY_BASE_URL") + "/wallet/account",
            data=data,
            headers=headers,
        )
    result_json=result.json()
    print("RSJ",result_json)
    if "accountNo" in result_json:
        # created=EntityPSPCollectionAccount.objects.create(
        #     entity=user.entity,
        #     psp=psp,
        #     account_number=result_json["accountNo"],
        #     owner=user,
        #     account_type=result_json["accountType"],
        # )

        
        return [], result_json
    else:
        if "message" in result_json:
            for m in result_json["message"]:
                errors.append(m)

            return errors, None