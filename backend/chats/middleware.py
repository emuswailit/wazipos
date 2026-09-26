# chats/middleware.py

import logging
from urllib.parse import parse_qs

import jwt
from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.utils.translation import gettext_lazy as _
from rest_framework.authentication import TokenAuthentication as DRFTokenAuth
from rest_framework.exceptions import AuthenticationFailed

from authentication.models import Users, Entities

logger = logging.getLogger(__name__)

User = get_user_model()

# Close codes sent to the client when auth fails.
#   4001 — no token supplied
#   4002 — invalid / malformed / bad-signature token
#   4003 — expired token (client should refresh + reconnect)
WS_CLOSE_NO_TOKEN = 4001
WS_CLOSE_INVALID_TOKEN = 4002
WS_CLOSE_EXPIRED_TOKEN = 4003


class TokenAuthentication:
    """
    Simple token-based authentication.

    Clients authenticate by passing the token key in the query
    parameters. For example:

        ?token=401f7ac837da42b97f613d789819ff93537bee6a
    """

    model = None

    def get_model(self):
        if self.model is not None:
            return self.model
        from rest_framework.authtoken.models import Token
        return Token

    def authenticate_credentials(self, key):
        model = self.get_model()
        try:
            token = model.objects.select_related("user").get(key=key)
        except model.DoesNotExist:
            raise AuthenticationFailed(_("Invalid token."))

        if not token.user.is_active:
            raise AuthenticationFailed(
                _("User inactive or deleted.")
            )

        return token.user


@database_sync_to_async
def get_user(scope):
    """
    Return the user model instance associated with the given scope,
    or AnonymousUser if the token is missing, invalid, or expired.

    Side effect: sets `scope["close_code"]` to one of the WS_CLOSE_*
    constants when auth fails, so the consumer can close with a
    meaningful code.
    """
    token = scope.get("token")
    if not token:
        scope["close_code"] = WS_CLOSE_NO_TOKEN
        return AnonymousUser()

    try:
        payload = jwt.decode(
            jwt=token,
            key=settings.SECRET_KEY,
            algorithms=["HS256"],
        )
    except jwt.ExpiredSignatureError:
        logger.info("WS auth — token expired")
        scope["close_code"] = WS_CLOSE_EXPIRED_TOKEN
        return AnonymousUser()
    except jwt.InvalidTokenError as e:
        logger.info(
            "WS auth — invalid token (%s)",
            e.__class__.__name__,
        )
        scope["close_code"] = WS_CLOSE_INVALID_TOKEN
        return AnonymousUser()
    except Exception:
        logger.exception("WS auth — unexpected decode failure")
        scope["close_code"] = WS_CLOSE_INVALID_TOKEN
        return AnonymousUser()

    user_id = payload.get("user_id")
    if not user_id:
        scope["close_code"] = WS_CLOSE_INVALID_TOKEN
        return AnonymousUser()

    try:
        user = Users.objects.get(id=user_id)
    except Users.DoesNotExist:
        logger.info("WS auth — user %s not found", user_id)
        scope["close_code"] = WS_CLOSE_INVALID_TOKEN
        return AnonymousUser()
    except Exception:
        logger.exception("WS auth — user lookup failed")
        scope["close_code"] = WS_CLOSE_INVALID_TOKEN
        return AnonymousUser()

    if not user.is_active:
        scope["close_code"] = WS_CLOSE_INVALID_TOKEN
        return AnonymousUser()

    return user


class TokenAuthMiddleware:
    """
    Custom middleware that takes a token from the query string and
    authenticates via JWT.

    If the token is missing, invalid, or expired, `scope["user"]`
    is set to AnonymousUser and `scope["close_code"]` is set to a
    WS_CLOSE_* value. The consumer is responsible for calling
    `self.close(code=...)` when it sees that.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        # Reset per-connection state.
        scope["close_code"] = None
        scope["token"] = None
        scope["selected_query_entity"] = None

        try:
            query_params = parse_qs(
                scope["query_string"].decode()
            )
        except Exception:
            logger.exception("WS auth — could not parse query string")
            query_params = {}

        # ---- token ----
        token_values = query_params.get("token") or []
        token = token_values[0] if token_values else None
        if token:
            scope["token"] = token

        # ---- optional selected_query_entity ----
        entity_values = (
            query_params.get("selected_query_entity") or []
        )
        if entity_values and entity_values[0] != "":
            scope["selected_query_entity"] = entity_values[0]

        # ---- resolve user (never raises) ----
        scope["user"] = await get_user(scope)

        return await self.app(scope, receive, send)




# from urllib.parse import parse_qs
# from channels.db import database_sync_to_async

# from django.contrib.auth import get_user_model
# from django.utils.translation import gettext_lazy as _
# from rest_framework.exceptions import AuthenticationFailed
# from authentication.models import Users,Entities
# import jwt
# from django.conf import settings

# User = get_user_model()


# class TokenAuthentication:
#     """
#     Simple token based authentication.

#     Clients should authenticate by passing the token key in the query parameters.
#     For example:

#         ?token=401f7ac837da42b97f613d789819ff93537bee6a
#     """

#     model = None

#     def get_model(self):
#         if self.model is not None:
#             return self.model
#         from rest_framework.authtoken.models import Token

#         return Token

#     """
#     A custom token model may be used, but must have the following properties.

#     * key -- The string identifying the token
#     * user -- The user to which the token belongs
#     """

#     def authenticate_credentials(self, key):
#         model = self.get_model()
#         try:
#             token = model.objects.select_related("user").get(key=key)
#         except model.DoesNotExist:
#             raise AuthenticationFailed(_("Invalid token."))

#         if not token.user.is_active:
#             raise AuthenticationFailed(_("User inactive or deleted."))

#         return token.user


# @database_sync_to_async
# def get_user(scope):
#     """
#     Return the user model instance associated with the given scope.
#     If no user is retrieved, return an instance of `AnonymousUser`.
#     """
#     # postpone model import to avoid ImproperlyConfigured error before Django
#     # setup is complete.
#     from django.contrib.auth.models import AnonymousUser

#     if "token" not in scope:
#         raise ValueError(
#             "Cannot find token in scope. You should wrap your consumer in "
#             "TokenAuthMiddleware."
#         )
#     token = scope["token"]
#     print("Token at look up",token)
#     user = None
#     try:
#         # Use token to retrieve logged in user
#         payload = jwt.decode(
#                 jwt=token, key=settings.SECRET_KEY, algorithms=["HS256"]
#             )
#         user = Users.objects.get(id=payload["user_id"])
#         print("Retrieved user",user)
#     except AuthenticationFailed:
#         pass
#     return user or AnonymousUser()


# class TokenAuthMiddleware:
#     """
#     Custom middleware that takes a token from the query string and authenticates via
#     Django Rest Framework authtoken.
#     """

#     def __init__(self, app):
#         # Store the ASGI application we were passed
#         self.app = app

#     async def __call__(self, scope, receive, send):
#         entity = None
#         entity_id = None
#         # Look up user from query string (you should also do things like
#         # checking if it is a valid user ID, or if scope["user"] is already
#         # populated).
#         query_params = parse_qs(scope["query_string"].decode())
#         token = query_params["token"][0]
#         if "selected_query_entity" in query_params and not query_params["selected_query_entity"][0]=="":
#             entity_id = query_params["selected_query_entity"][0]
#             if entity_id:
#                 scope["selected_query_entity"] = entity_id
#             else:
#                 scope["selected_query_entity"] = None
#         else:
#             scope["selected_query_entity"] = None
            
#         print("Token at retrieve",token)
#         scope["token"] = token
#         scope["user"] = await get_user(scope)
#         return await self.app(scope, receive, send)