# chat/consumers.py
import json
import time
from uuid import UUID
from asgiref.sync import async_to_sync
from .models import Conversation,Message
from authentication.models import Users
from channels.generic.websocket import JsonWebsocketConsumer
from django.core.exceptions import ValidationError
from .serializers import MessageSerializer,CommentSerializer
from authentication.serializers import UsersSerializer

from djangochannelsrestframework.generics import GenericAsyncAPIConsumer
from djangochannelsrestframework.observer import model_observer
from djangochannelsrestframework.decorators import action
from djangochannelsrestframework.mixins import ListModelMixin
from djangochannelsrestframework import permissions

from channels.generic.websocket import WebsocketConsumer


from json import JSONEncoder
from uuid import UUID

from json import JSONEncoder
from uuid import UUID

from json import JSONEncoder
from uuid import UUID
from django.contrib.auth import get_user_model


Users = get_user_model()
from .models import Comment



class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            # if the obj is uuid, we simply return the value of uuid
            return obj.hex
        return json.JSONEncoder.default(self, obj)
    


class PersonalChatConsumer(JsonWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(args, kwargs)
        self.user = None
        self.conversation_name = None
        self.conversation = None
    
    def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
    
        self.accept()
        self.conversation_name = f"{self.scope['url_route']['kwargs']['conversation_name']}"
        print("Convo name", self.conversation_name)
        self.conversation, created = Conversation.objects.get_or_create(name=self.conversation_name)
    
        async_to_sync(self.channel_layer.group_add)(
            self.conversation_name,
            self.channel_name,
        )

        messages = self.conversation.messages.all().order_by("timestamp")[0:50]
        print("Messages",messages)
      
        data =MessageSerializer(messages,many=True,context={'request': None}).data
        self.messages = json.dumps(data,cls=UUIDEncoder)
        self.send_json({
            "type": "last_50_messages",
            "messages": json.loads(self.messages),
        })

    
    def disconnect(self, code):
        print("Disconnected!")
        return super().disconnect(code)
 
    def receive_json(self, content, **kwargs):
        message_type = content["type"]
        if message_type == "greeting":
            self.send_json({
                    "type": "greeting_response",
                    "message": "How are you?",
                })
            
        if message_type == "chat_message":
            message = Message.objects.create(
                from_user=self.user,
                to_user=self.get_receiver(),
                content=content["message"],
                conversation=self.conversation
            )
        
        if message_type == "chat_message":
            async_to_sync(self.channel_layer.group_send)(
                self.conversation_name,
                {
                    "type": "chat_message_echo",
                    "name": content["name"],
                    "message": content["message"],
                },
            )
            data =MessageSerializer(message,many=False,context={'request': None}).data
            self.message = json.dumps(data,cls=UUIDEncoder)
            print("my message", self.message)
            async_to_sync(self.channel_layer.group_send)(
                    self.conversation_name,
                    {
                        "type": "chat_message_echo",
                        "name": self.user.phone,
                        "message": json.loads(self.message),
                    },
                )

            notification_group_name = self.get_receiver().phone + "__notifications"
            data =MessageSerializer(message,many=False,context={'request': None}).data
            async_to_sync(self.channel_layer.group_send)(
                notification_group_name,
                {
                    "type": "new_message_notification",
                    "name": self.user.phone,
                    "message": data,
                },
            )
            return super().receive_json(content, **kwargs)
    
    @classmethod
    def encode_json(cls, content):
        return json.dumps(content, cls=UUIDEncoder)
    
    
    def chat_message_echo(self, event):
        print(event)
        self.send_json(event)




    def get_receiver(self):
        phones = self.conversation_name.split("__")
        for phone in phones:
            if phone != self.user.phone:
                # This is the receiver
                print("Receiver phone",phone)
                return Users.objects.get(phone=phone)


    # consumers.py


class CommentsNotificationConsumer(WebsocketConsumer):
    def connect(self):
        user = self.scope["user"]
        print("User at connect", f"{user}")
        if user.is_authenticated:
            self.group_name = f"user_{user.id}"
            async_to_sync(self.channel_layer.group_add)(
                self.group_name, self.channel_name
            )
            self.accept()
        else:
            self.close()

    def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            print("Disconnecting from group", self.group_name)
            print("Channel name", self.channel_name)

            async_to_sync(self.channel_layer.group_discard)(
                self.group_name, self.channel_name
            )

    def send_notification(self, event):
        message = event["message"]
        print("Message at send_notification", message)
        notification_id = event["notification_id"]
        self.send(text_data=json.dumps({
            "message": message,
            "notification_id": notification_id,
        }))

# class CommentsConsumer(GenericAsyncAPIConsumer):
    # queryset = Users.objects.all()
    # serializer_class = UsersSerializer

    # @model_observer(Comment)
    # async def comment_activity(
    #     self,
    #     message: CommentSerializer,
    #     observer=None,
    #     subscribing_request_ids=[],
    #     **kwargs
    # ):
    #     await self.send_json(message.data)

    # @comment_activity.serializer
    # def comment_activity(self, instance: Comment, action, **kwargs) -> CommentSerializer:
    #     """This will return the comment serializer"""
    #     return CommentSerializer(instance)

    # @comment_activity.groups_for_signal
    # def comment_activity(self, instance: Comment, **kwargs):
    #     # this block of code is called very often *DO NOT make DB QUERIES HERE*
    #     yield f'-user__{instance.user_id}'  #! the string **user** is the ``Comment's`` user field.
    #     print("Comment activity groups for signal", instance.user_id)

    # @comment_activity.groups_for_consumer
    # def comment_activity(self, school=None, classroom=None, **kwargs):
    #     # This is called when you subscribe/unsubscribe
    #     yield f'-user__{self.scope["user"].pk}'

    # @action()
    # async def subscribe_to_comment_activity(self, request_id, **kwargs):
    #     # We will check if the user is authenticated for subscribing.
    #     if "user" in self.scope and self.scope["user"].is_authenticated:
    #         await self.comment_activity.subscribe(request_id=request_id)