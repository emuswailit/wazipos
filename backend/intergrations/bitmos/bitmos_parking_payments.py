import requests
import json

def check_vehicle_parked(plate):
    data = json.dumps({
    "plate": plate

        })
    headers = {
        "Content-Type": "application/json",
        "Authorization": "",
    }
    result = requests.post(
            "http://185.188.249.226/api/v1/check_vehicle/",
            data=data,
            headers=headers,
        )

    result_json=result.json()
    return result_json


def pay_vehicle_parking(plate, msisdn):
    data = json.dumps({
    "plate": plate,
    "phone":msisdn

        })
    headers = {
        "Content-Type": "application/json",
        "Authorization": "",
    }
    result = requests.post(
            "http://185.188.249.226/api/v1/stkpush",
            data=data,
            headers=headers,
        )

    result_json=result.json()
    return result_json