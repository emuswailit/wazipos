from django.urls import re_path,path

from . import consumers
chats_websocket_urlpatterns = [

    # path("ws/chats/<conversation_name>/",consumers.PersonalChatConsumer.as_asgi()),
     path("ws/chats/comments/",consumers.CommentsNotificationConsumer.as_asgi()),
]