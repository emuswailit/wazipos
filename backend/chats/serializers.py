from rest_framework import serializers
 
from .models import Message,Conversation,Comment
from authentication.serializers import UsersSerializer
from django.contrib.auth import get_user_model


Users = get_user_model()
 
class MessageSerializer(serializers.ModelSerializer):
    from_user_title = serializers.SerializerMethodField()
    to_user_title = serializers.SerializerMethodField()
    from_user = serializers.SerializerMethodField()
    to_user = serializers.SerializerMethodField()
    conversation = serializers.SerializerMethodField()
 
    class Meta:
        model = Message
        fields = (
            "id",
            "conversation",
            "from_user_title",
            "to_user_title",
            "from_user",
            "to_user",
            "content",
            "timestamp",
            "read",
        )
 
    def get_conversation(self, obj):
        return str(obj.conversation.id)
 
    def get_from_user(self, obj):
        return UsersSerializer(obj.from_user,context=self.context).data
 
    def get_to_user(self, obj):
        return UsersSerializer(obj.to_user,context=self.context).data
    def get_from_user_title(self, obj):
        return f"{obj.from_user.first_name} {obj.from_user.last_name}"
 
    def get_to_user_title(self, obj):
        return f"{obj.to_user.first_name} {obj.to_user.last_name}"
    



 
 
class ConversationSerializer(serializers.ModelSerializer):
    other_user = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
 
    class Meta:
        model = Conversation
        fields = ("id", "name", "other_user", "last_message")
 
    def get_last_message(self, obj):
        messages = obj.messages.all().order_by("-timestamp")
        if not messages.exists():
            return None
        message = messages[0]
        return MessageSerializer(message).data
 
    def get_other_user(self, obj):
        phones = obj.name.split("__")
        context = {}
        for phone in phones:
            if phone != self.context["user"].phone:
                # This is the other participant
                other_user = Users.objects.get(phone=phone)
                return UsersSerializer(other_user, context=context).data
            



class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ["id", "text", "user"]