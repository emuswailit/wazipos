# core/ws_access.py — who may open which live socket.
#
#   @ws_access(entity_types=("Retailer",))          staff of a retailer (any role in it)
#   @ws_access(roles=("Agent",))                     users holding a role value
#   @ws_access(platform_admin=True)                  WaziPOS admins
#   @ws_access()                                     anyone signed in
#
# Wraps the consumer's connect(). A refused socket is accepted and closed at once
# with a code, so the app sees WHY instead of the browser's opaque "connection
# refused" (which also makes clients retry forever):
#   4001 no token · 4002 invalid token · 4003 expired token   (chats/middleware.py)
#   4403 signed in, but this socket isn't for your role / business
# The app mirrors these rules (frontend utils/socketAccess.ts) and doesn't open
# sockets it may not use; this is the server's own check.

import functools

from channels.db import database_sync_to_async

WS_CLOSE_NOT_SIGNED_IN = 4001
WS_CLOSE_FORBIDDEN = 4403


def _role_values(user):
    return set(user.roles.values_list("value", flat=True))


def is_platform_admin(user):
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True
    return "Admin" in _role_values(user)


def allowed(user, entity_types=(), roles=(), platform_admin=False):
    """Any one rule passing is enough; no rules = any signed-in user."""
    if not (entity_types or roles or platform_admin):
        return True
    if platform_admin and is_platform_admin(user):
        return True
    if entity_types:
        entity = getattr(user, "entity", None)
        kind = str(getattr(entity, "entity_type", "") or "")
        # "Retailer" matches GeneralRetailer and PharmaceuticalRetailer, etc.
        if kind and any(kind == t or kind.endswith(t) for t in entity_types):
            return True
    if roles and _role_values(user) & set(roles):
        return True
    return False


async def _refuse(consumer, code):
    await consumer.accept()
    await consumer.close(code=code)


def ws_access(entity_types=(), roles=(), platform_admin=False):
    def decorate(cls):
        original = cls.connect

        @functools.wraps(original)
        async def connect(self, *args, **kwargs):
            user = self.scope.get("user")
            if not user or not getattr(user, "is_authenticated", False):
                await _refuse(self, self.scope.get("close_code") or WS_CLOSE_NOT_SIGNED_IN)
                return
            ok = await database_sync_to_async(allowed)(user, entity_types, roles, platform_admin)
            if not ok:
                await _refuse(self, WS_CLOSE_FORBIDDEN)
                return
            return await original(self, *args, **kwargs)

        cls.connect = connect
        return cls

    return decorate
