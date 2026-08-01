import os
from django.core.asgi import get_asgi_application

import django

# import sys
# sys.path.append(os.path.abspath(os.path.dirname(__name__)))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wazi.settings.development")
# django.setup()
django_asgi_app = get_asgi_application()



from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator



from authentication.routing import authentication_websocket_urlpatterns
from chats.routing import chats_websocket_urlpatterns
from messaging.routing import messaging_websocket_urlpatterns
from retailers.routing import retailers_websocket_urlpatterns
from transport.routing import transport_websocket_urlpatterns
from wholesalers.routing import wholesalers_websocket_urlpatterns
from products.routing import products_websocket_urlpatterns



routes =chats_websocket_urlpatterns+retailers_websocket_urlpatterns+wholesalers_websocket_urlpatterns+transport_websocket_urlpatterns+authentication_websocket_urlpatterns+messaging_websocket_urlpatterns+products_websocket_urlpatterns





from chats.middleware import TokenAuthMiddleware

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            TokenAuthMiddleware(URLRouter(routes))
        ),
     }
)








"""
ASGI config for wazi project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.1/howto/deployment/asgi/
"""

# import os
# from django.urls import path
# from django.core.asgi import get_asgi_application
# from channels.security.websocket import AllowedHostsOriginValidator










# from wazi.websocket import websocket_application

# from channels.auth import AuthMiddlewareStack
# from channels.routing import ProtocolTypeRouter, URLRouter


# from pages.routing import ws_urlpatterns

# os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wazi.settings")

# application = ProtocolTypeRouter(
#     {
#         "http": get_asgi_application(),
#         "websocket": AllowedHostsOriginValidator(
#             AuthMiddlewareStack(
#                 URLRouter(
#                     [
#                         # path("ws/pages/", PagesConsumer.as_asgi()),
#                         # path("ws/graph/", GraphConsumer.as_asgi()),
#                         # path("ws/chat/<str:phone>", PersonalChatConsumer.as_asgi()),
#                     ]
#                 )
#             )
#         ),
#     }
# )

# django_application = get_asgi_application()


# async def application(scope, receive, send):
#     if scope['type'] == 'http':
#         await django_application(scope, receive, send)
#     elif scope['type'] == 'websocket':
#         await websocket_application(scope, receive, send)
#     else:
#         raise NotImplementedError(f"Unknown scope type {scope['type']}")
