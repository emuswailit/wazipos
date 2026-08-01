from decouple import config
import requests
from core.responses import custom_error_response

def get_swift_auth_token():
    the_data = {
        "client_id": config("JAMBOPAY_SWIFT_CLIENT_ID"),
        "client_secret": config("JAMBOPAY_SWIFT_CLIENT_SECRET"),
        "grant_type": config("JAMBOPAY_SWIFT_GRANT_TYPE"),
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    # Execute the post
    result = requests.post(config("JAMBOPAY_SWIFT_AUTH_URL"), data=the_data, headers=headers)
    result_json = result.json()
    if result_json and result_json["access_token"]:
        return result_json["access_token"]
    else:
        return custom_error_response(
            1, "Could not generate Jambopay swift authentication token"
        )

try:
    pass
    # token = get_swift_auth_token()
except Exception as e:
    print(e)


def send_swift_sms(data):
    errors =[]
    return errors, None
    # token = get_swift_auth_token()

    # headers = {
    #             "Authorization": "Bearer " + token,
    #         }
    
    # result = requests.post(
    #         config("JAMBOPAY_SWIFT_SMS_URL"),
    #         data=data,
    #         headers=headers,
    #     )
    # result_json = result.json()

    # print("status of", result_json)
    # if result_json:

    #     if "message" in result_json:
    #             for m in result_json["message"]:
    #                 errors.append(m)
    #             return errors, None
    #     else:
    #         return [],result_json
    # else:
    #     return ["No result json"], None