from django.urls import path, re_path

from . import consumers


messaging_websocket_urlpatterns = [
    path("ws/messaging/", consumers.UserConsumer.as_asgi()),
    path('ws/messaging/chats/', consumers.RoomConsumer.as_asgi()),
    path('ws/messaging/posts/', consumers.PostConsumer.as_asgi()),
]