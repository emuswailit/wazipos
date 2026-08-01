from celery import Celery
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

app = Celery()
channel_layer = get_channel_layer()
# Products web socket task

@app.task
def load_products():

    result= async_to_sync(channel_layer.group_send)(
            'products',
            {
                "type": "send_products"
            },
        )
    return result