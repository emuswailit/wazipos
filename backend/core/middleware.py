# core/middleware.py

from __future__ import annotations

from core.current_request import (
    clear_current_request,
    set_current_request,
)


class CurrentRequestMiddleware:
    """
    Store the active request in a thread-local so models can read
    the logged-in user during save(). Must run AFTER
    AuthenticationMiddleware.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        set_current_request(request)
        try:
            return self.get_response(request)
        finally:
            clear_current_request()