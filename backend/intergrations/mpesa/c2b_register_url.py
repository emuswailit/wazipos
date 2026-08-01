import requests
from .authorization_api import get_access_token
import json
from utils.logging import create_log

def register_url(shortcode):
    errors=[]
    errors,access_token = get_access_token()

    headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + access_token
    }

    payload = {
        'ShortCode': shortcode,
        'ResponseType': 'Completed',
        'ConfirmationUR': 'https://api.wazipos.com/api/v1/payments/lnm/paybill/confirmation',
        'ValidationURL': 'https://api.wazipos.com/api/v1/payments/lnm/paybill/validation',
    }
    create_log("info", payload)
    try:
        response = requests.request("POST", 'https://sandbox.safaricom.co.ke/mpesa/c2b/v1/registerurl', headers = headers, data = payload)
        response.raise_for_status()   
        # Raise exception for non-2xx status codes
        response_data = response.json()
        create_log("info",response.text.encode('utf8'))
        return [], response_data
    except requests.exceptions.RequestException as e:
        errors.append(str(e))
        return errors,None
    

def validate_and_confirm(amount,msisdn,shortcode,reference_number):
    errors=[]
    errors,access_token = get_access_token()
    headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + access_token
    }


    payload = {
                'ShortCode': shortcode,
                'CommandID': 'CustomerBuyGoodsOnline',
                'Amount': amount,
                'MSISDN': msisdn,
                'BillRefNumber': ''
            }
    create_log("info", "payload json")
    create_log("info", payload)
    try:
        response = requests.request("POST", 'https://sandbox.safaricom.co.ke/mpesa/c2b/v1/simulate', headers = headers, data = payload)
        
        response.raise_for_status()   
        # Raise exception for non-2xx status codes
        response_data = response.json()
        create_log("info",response.text.encode('utf8'))
        return [], response_data
    except requests.exceptions.RequestException as e:
        errors.append(str(e))
        return errors,None

