from django.urls import re_path,path

from . import consumers

authentication_websocket_urlpatterns = [

    path("ws/authentication/agents/users/",consumers.AgentUsersConsumer.as_asgi()),
    path("ws/authentication/agents/entities/",consumers.AgentEntitiesConsumer.as_asgi()),
    path("ws/authentication/clients/entities/",consumers.ClientEntitiesConsumer.as_asgi()),

]