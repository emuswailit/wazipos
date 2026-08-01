from decouple import config
import requests
from core.responses import custom_error_response

def get_auth_token():
    print("Attempting JP............auth: blocked")
    return None
    # the_data = {
    #     "client_id": config("JAMBOPAY_CLIENT_ID"),
    #     "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
    #     "grant_type": config("JAMBOPA_GRANT_TYPE"),
    # }
    # headers = {"Content-Type": "application/x-www-form-urlencoded"}
    # # Execute the post
    # result = requests.post(config("JAMBOPAY_AUTH_URL"), data=the_data, headers=headers)
    # result_json = result.json()
    # print("result json at token", result_json)
    # if result_json and result_json["access_token"]:
    #     return result_json["access_token"]
    # else:
    #     return custom_error_response(
    #         1, "Could not generate Jambopay authentication token"
    #     )

try:
    token = get_auth_token()
except Exception as e:
    print(e)