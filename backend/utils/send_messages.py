import requests as r
from decouple import config
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms


def send_message(expo_token, title, body):
    message = {
        'to': expo_token,
        'title': title,
        'body': body
    }
    return r.post('https://exp.host/--/api/v2/push/send', json=message)

def send_sms(message,phone):
    payload = {
                    "contact" : phone,
                    "message" : message,
                    "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
                    "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
                }
        
    errors, sent = send_swift_sms(payload)