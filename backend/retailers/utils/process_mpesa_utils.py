from decouple import config
import requests
from rest_framework import exceptions


def process_mpesa(payment_account_number, reference_number, amount):

    token_data = {
        "action": config('TOKEN_ACTION'),
        "consumer_code": config('TOKEN_CONSUMER_CODE'),
        "consumer_key": config('TOKEN_CONSUMER_KEY'),
        "consumer_secret": config('TOKEN_CONSUMER_SECRET')
    }
    result = requests.post(f'{config("TOKEN_URL")}', json=token_data,
                           headers={'Accept': 'application/json', 'Api-Key': f'{config("TOKEN_API_KEY")}'})
    result_json = result.json()
    token = result_json['access_token']
    if token:
        transaction_data = {
            "action": "ProcessCollection",
            "channel_id": 37,
            "amount": round(amount),
            "account_number": payment_account_number,
            "msisdn": payment_account_number,
            "reference_number": reference_number,
            "narration": f"Customer Order {reference_number}",
            "result_url": "https://webhook.site/3a9b9c43-c2c7-417e",
            "metadata": {
                "key0": "value0",
                "key1": "value1"
            },
            "show_qr_code": 1
        }
        payment_result = requests.post(f'{config("TRANSACTION_URL")}', json=transaction_data,
                                       headers={'Accept': 'application/json', 'Access-Token': f'{token}'})
        payment_result_json = payment_result.json()
        if payment_result_json:
            return payment_result_json
        else:
            raise exceptions.ValidationError("Mpesa failed")
