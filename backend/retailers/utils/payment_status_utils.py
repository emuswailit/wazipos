from rest_framework import exceptions
import requests
from decouple import config


def get_payment_status(reference_number, token):
    """ Syn c issues"""
    payment_data = {
        "action": "TransactionStatus",
        "reference_number": reference_number
    }
    status_result = requests.post(f'{config("TRANSACTION_URL")}', json=payment_data,
                                  headers={'Accept': 'application/json', 'Access-Token': f'{token}'})

    status_result_json = status_result.json()

    if status_result_json:
        return status_result_json
    else:

        raise
