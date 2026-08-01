from ..models import Comment
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

def create_comment(data, user):
    """
    Create a comment for the user.
    """
    errors = []
    comment = None
    text = None
    if not "text" in data or data["text"] == "":
        errors.append("Text is required for the comment.")
        return errors, comment
    else:
        text = data["text"]

    try:
        comment = Comment.objects.create(
            user=user,
            text=text,
        )
        comment.save()

        return errors, comment
    except Exception as e:
        errors.append(str(e))

    return errors, comment


def update_comment(data, user):
    errors = []
    comment = None
    text = None
    if not "text" in data or data["text"] == "":
        errors.append("Text is required for the comment.")
        return errors, comment
    else:
        text = data["text"]
    if not "id" in data or data["id"] == "":
        errors.append("ID is required for the comment.")
        return errors, comment
    else:
        if Comment.objects.filter(id=data["id"]).exists():
            comment = Comment.objects.filter(id=data["id"]).first()
        else:
            errors.append("Comment does not exist.")
            return errors, comment
        
    if len(errors) == 0:
        try:
            comment.text = text
            comment.save()

            channel_layer = get_channel_layer()
            group_name = f"user_{comment.user.id}"  # Target specific user's group
            notification_data = {
                "type": "send_notification",  # Custom type for your consumer
                "message": comment.text,
                "notification_id": comment.id,
            }
            async_to_sync(channel_layer.group_send)(group_name, notification_data)
            return errors, comment
        except Exception as e:
            errors.append(str(e))

def get_all_comments(user):
    """
    Get all comments for the user.
    """
    comments = Comment.objects.filter(user=user).order_by("-date")
    return comments