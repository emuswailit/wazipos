# core/current_request.py
#
# Per-thread storage for the active request. Read by
# EntityRelatedModel to auto-populate `entity` and `owner`.

from __future__ import annotations

import threading
from typing import Optional

from django.http import HttpRequest

_state = threading.local()


def set_current_request(request: Optional[HttpRequest]) -> None:
    _state.request = request


def get_current_request() -> Optional[HttpRequest]:
    return getattr(_state, "request", None)


def get_current_user():
    request = get_current_request()
    if request is None:
        return None
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return user


def get_current_entity():
    user = get_current_user()
    if user is None:
        return None

    entity = getattr(user, "entity", None)
    if entity is not None:
        return entity

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
    _state.request = None