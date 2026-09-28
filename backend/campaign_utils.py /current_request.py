# utils/current_request.py
#
# Per-thread storage for the active request. Read by
# EntityRelatedModel to auto-populate `entity` and `owner` from
# the logged-in user when a new row is created.
#
# Safe under gunicorn sync workers and under ASGI/Channels where
# each connection runs on its own thread or task context.

from __future__ import annotations

import threading
from typing import Optional

from django.http import HttpRequest

_state = threading.local()


def set_current_request(request: Optional[HttpRequest]) -> None:
    """Set the active request for the current thread."""
    _state.request = request


def get_current_request() -> Optional[HttpRequest]:
    """Return the active request, or None outside a request cycle."""
    return getattr(_state, "request", None)


def get_current_user():
    """
    Return the authenticated user for the active request, or None.
    Safe to call from anywhere — never raises.
    """
    request = get_current_request()
    if request is None:
        return None
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return user


def get_current_entity():
    """
    Return the entity attached to the current user, or None.
    Prefers user.entity; falls back to the first role's entity
    if the direct FK is empty.
    """
    user = get_current_user()
    if user is None:
        return None

    entity = getattr(user, "entity", None)
    if entity is not None:
        return entity

    # Fallback: some deployments only populate entity via roles.
    roles = getattr(user, "roles", None)
    if roles is not None:
        try:
            first = roles.first()
        except Exception:
            first = None
        if first is not None:
            return getattr(first, "entity", None)

    return None


def clear_current_request() -> None:
    """Clear the thread-local — call from middleware's finally block."""
    _state.request = None