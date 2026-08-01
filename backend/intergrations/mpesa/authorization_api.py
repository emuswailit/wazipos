import requests
from django.http import JsonResponse
from decouple import config

def get_access_token():
    errors =[]
    consumer_key = config("MPESA_CONSUMER_KEY")
    consumer_secret = config("MPESA_CONSUMER_SECRET")
    access_token_url = config("MPESA_AUTH_URL")
    headers = {'Content-Type': 'application/json'}
    auth = (consumer_key, consumer_secret)
    try:
        response = requests.get(access_token_url, headers=headers, auth=auth)
        response.raise_for_status()  # Raise exception for non-2xx status codes
        result = response.json()
        access_token = result['access_token']
        return [],access_token
    except requests.exceptions.RequestException as e:
        errors.append(str(e))
        return errors,None