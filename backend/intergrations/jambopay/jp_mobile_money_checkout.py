
import json
from decouple import config
import requests
from utils.logging import create_log
from core.responses import custom_error_response

def get_auth_token():
    print("Get token at mobile money checkout: blocked ")
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



def jambopay_mobile_checkout(data):
    create_log("info",data)
    errors =[]
    token=None
    return errors, None
    # token = get_auth_token()

    # if token:
    #     create_log("info",f"token {token}")
    #     headers = {
    #         "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0",
    #         "Content-Type": "application/json",
    #         "Authorization": "Bearer " + token,
    #         "Accept": "*/*",
    #     }
    #     try:
    #         result = requests.post(
    #                 config("JAMBOPAY_BASE_URL") + "/checkout/express",
    #                 data=data,
    #                 headers=headers,
    #             )
    #         if result:
    #             create_log("info",f"result {result}")
    #         else:
    #             create_log("info",f"result: none")

            
    #         result_json=result.json()
    #         create_log("info",f"result_json {result_json}")

        
    #         if "ref" in result_json:
    #             return [], result_json
    #         else:
    #             if "message" in result_json:
    #                 for m in result_json["message"]:
    #                     errors.append(m)
    #                 return errors, None
    #     except Exception as e:
    #         create_log("error", f"Error at JP {str(e)}")
    #         return errors, None
    # else:
    #     errors.append("Token generation failed")
    #     return errors, None
        


    # data = json.dumps({
    #     "orderId": query_order.reference_number,
    #     "amount": int(query_order.order_net_price_total),
    #     "callBackUrl": "https://webhook.site/7911487f-fc9e-46b0-a812-3adfa008375c",
    #     "accountTo":  config("WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT"),
    #     "description": "Merchant payment",
    #     "modeOfPayment": "MOBILE_MONEY",
    #     "provider": "Mpesa",
    #     "data": {
    #         "phoneNumber": phone_number,
    #         "serviceType": "MERCHANTPAYMENT"
    #     }
    #     })