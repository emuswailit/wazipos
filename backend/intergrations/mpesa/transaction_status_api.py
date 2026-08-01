from decouple import config
from datetime import datetime
import base64
import json
import requests
from .authorization_api import get_access_token
from utils.logging import create_log


def query_stk_status(checkout_request_id,passkey,shortcode):
    errors=[]
    errors,access_token = get_access_token()
    if access_token:
          
            business_short_code = shortcode
            timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
            passkey = passkey
            password = base64.b64encode((business_short_code + passkey + timestamp).encode()).decode()
           
            query_headers = {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + access_token
            }

            query_payload = {
                'BusinessShortCode': business_short_code,
                'Password': password,
                'Timestamp': timestamp,
                'CheckoutRequestID': checkout_request_id
            }

            try:
                response = requests.post(config("MPESA_QUERY_URL"), headers=query_headers, json=query_payload)
                response.raise_for_status()
                # Raise exception for non-2xx status codes
                response_data = response.json()

                if 'ResultCode' in response_data:
                    result_code = response_data['ResultCode']
                    if result_code == '1037':
                        message = "1037 Timeout in completing transaction"
                    elif result_code == '1032':
                        message = "1032 Transaction has been canceled by the user"
                    elif result_code == '1':
                        message = "1 The balance is insufficient for the transaction"
                    elif result_code == '0':
                        message = "0 The transaction was successful"
                    else:
                        message = "Unknown result code: " + result_code
                else:
                    message = "Error in response"

                return [],message
            except requests.exceptions.RequestException as e:
                errors.append(str(e))
                return errors,None
            except json.JSONDecodeError as e:
                errors.append(str(e))
                return errors,None
