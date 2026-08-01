from rest_framework import exceptions
import requests
from decouple import config


def user_details_kyc(national_id, token):
    payment_data = {
        "action": "eKYC",
        "doc_number": national_id
    }
    status_result = requests.post(f'{config("EKYC_URL")}', json=payment_data,
                                  headers={'Accept': 'application/json', 'Access-Token': f'{token}'})

    status_result_json = status_result.json()

    if status_result_json:
        print('result', status_result_json)
        return status_result_json
    else:

        raise
