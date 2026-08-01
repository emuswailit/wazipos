from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from celery import Celery

app = Celery()
channel_layer = get_channel_layer()

@app.task
def load_agent_users():

    result= async_to_sync(channel_layer.group_send)(
            'agent-users',
            {
                "type": "send_agent_users"
            },
        )
    return result



@app.task
def load_agent_entities():

    result= async_to_sync(channel_layer.group_send)(
            'agent-entities',
            {
                "type": "send_agent_entities"
            },
        )
    return result


@app.task
def load_client_entities():

    result= async_to_sync(channel_layer.group_send)(
            'client-entities',
            {
                "type": "send_client_entities"
            },
        )
    return result