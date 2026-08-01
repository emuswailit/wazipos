import uuid

from django.contrib.auth import get_user_model
from django.db import models

from django.db.models.signals import post_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from utils.logging import create_log

User = get_user_model()


class Conversation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128)
    online = models.ManyToManyField(to=User, blank=True)

    def get_online_count(self):
        return self.online.count()

    def join(self, user):
        self.online.add(user)
        self.save()

    def leave(self, user):
        self.online.remove(user)
        self.save()

    def __str__(self):
        return f"{self.name} ({self.get_online_count()})"


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    from_user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="messages_from_me"
    )
    to_user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="messages_to_me"
    )
    content = models.CharField(max_length=512)
    timestamp = models.DateTimeField(auto_now_add=True)
    read = models.BooleanField(default=False)

    def __str__(self):
        return f"From {self.from_user.phone} to {self.to_user.phone}: {self.content} [{self.timestamp}]"



class Comment(models.Model):
    text = models.TextField()
    user = models.ForeignKey(User, related_name="comments", on_delete=models.CASCADE)
    date = models.DateTimeField(auto_now_add=True)

@receiver(post_save, sender=Comment)
def send_notification_on_create(sender, instance, created, **kwargs):
    create_log("info","Am at notification")
    if created:  # Only send notification when a new object is created
        print("Notification sent for comment creation", f"{instance.text}")
        channel_layer = get_channel_layer()
        group_name = f"user_{instance.user.id}"  # Target specific user's group
        notification_data = {
            "type": "send_notification",  # Custom type for your consumer
            "message": instance.text,
            "notification_id": instance.id,
        }
        async_to_sync(channel_layer.group_send)(group_name, notification_data)