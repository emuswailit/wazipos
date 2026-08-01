from django.urls import path,include
from .views import ConversationViewSet
from rest_framework.routers import DefaultRouter
from . import views


router = DefaultRouter()
router.register(r'conversations', ConversationViewSet)
urlpatterns = [
 path('', include(router.urls)),
     path(
        "comments",
        views.commentsAPIView,
        name="comments-apiview",
    ),
]