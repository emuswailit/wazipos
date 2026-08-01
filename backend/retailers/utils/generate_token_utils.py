from rest_framework import exceptions
from decouple import config
import requests


def generate_token():
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
        return token
    else:
        raise exceptions.ValidationError('Could not generate token')
