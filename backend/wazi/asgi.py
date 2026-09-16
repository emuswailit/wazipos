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
from analytics.routing import analytics_websocket_urlpatterns   # NEW


routes = (
    chats_websocket_urlpatterns
    + retailers_websocket_urlpatterns
    + wholesalers_websocket_urlpatterns
    + transport_websocket_urlpatterns
    + authentication_websocket_urlpatterns
    + messaging_websocket_urlpatterns
    + products_websocket_urlpatterns
    + analytics_websocket_urlpatterns    # NEW
)


from chats.middleware import TokenAuthMiddleware

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            TokenAuthMiddleware(URLRouter(routes))
        ),
     }
)