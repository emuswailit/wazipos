from rest_framework.generics import get_object_or_404
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet
from rest_framework import generics, permissions, response, status, exceptions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
 
from .models import Conversation
 
from .serializers import ConversationSerializer
from . import serializers
from core.responses import custom_success_message, custom_errors_response,custom_error_response
from .utils import chats_utils 
 
 
class ConversationViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    serializer_class = ConversationSerializer
    queryset = Conversation.objects.none()
    lookup_field = "name"
 
    def get_queryset(self):
        queryset = Conversation.objects.filter(
            name__contains=self.request.user.phone
        )
        return queryset
 
    def get_serializer_context(self):
        return {"request": self.request, "user": self.request.user}
    

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def commentsAPIView(request):
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")


    if request.data["action"] == "CreateComment":
        """Create a comment for the user"""

        errors, comment = chats_utils.create_comment(
            request.data, request.user
        )

        if comment:
            serializer = serializers.CommentSerializer(
                comment, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Comment created successfully",
                serializer.data,
                "comment",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Comment could not created",errors)
    elif request.data["action"] == "GetComments":
        """Get comments"""

        comments = chats_utils.get_all_comments(
        request.user
        )
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(comments, request)
        serializer = serializers.CommentSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)
    elif request.data["action"] == "UpdateComment":
        """Update a comment for the user"""

        errors, comment = chats_utils.update_comment(
            request.data, request.user
        )

        if comment:
            serializer = serializers.CommentSerializer(
                comment, many=False, context={"request": request}
            )
            return custom_success_message(
                0,
                "Comment updated successfully",
                serializer.data,
                "comment",
            )

        if len(errors)>0:
            return custom_errors_response(1,"Comment could not updated",errors)
        
 
    else:
        raise exceptions.ValidationError(f'Action { request.data["action"]} is unknown')