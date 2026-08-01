import requests
from decouple import config
from datetime import datetime
import base64

from .authorization_api import get_access_token
from utils.logging import create_log


def initiate_stk_push(amount,transaction_desc,passkey, phone,reference_number,shortcode,):
    errors=[]
    errors,access_token = get_access_token()
    if access_token:
        business_short_code = shortcode
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password = base64.b64encode((business_short_code + passkey + timestamp).encode()).decode()
        account_reference = reference_number
        transaction_desc = transaction_desc
        stk_push_headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + access_token
        }

        stk_push_payload = {
                'BusinessShortCode': business_short_code,
                'Password': password,
                'Timestamp': timestamp,
                'TransactionType': 'CustomerPayBillOnline',
                'Amount': amount,
                'PartyA': phone,
                'PartyB': business_short_code,
                'PhoneNumber': phone,
                'CallBackURL': config("MPESA_STK_CALLBACK_URL"),
                'AccountReference': account_reference,
                'TransactionDesc': transaction_desc
            }

        print("stk_push_payload ", stk_push_payload)
        try:
            response = requests.post(config("MPESA_STK_URL"), headers=stk_push_headers, json=stk_push_payload)
            response.raise_for_status()   
            # Raise exception for non-2xx status codes
            response_data = response.json()
            
            checkout_request_id = response_data['CheckoutRequestID']
            response_code = response_data['ResponseCode']
            print("response at stk ", response_data)
            if response_code == "0":
                return  [],checkout_request_id
            else:
                errors.append("Ckeckout request failed")
        except requests.exceptions.RequestException as e:
            errors.append(str(e))
            return errors,None