# utils/middleware.py

from __future__ import annotations

from .current_request import (
    clear_current_request,
    set_current_request,
)


class CurrentRequestMiddleware:
    """
    Store the active request in a thread-local so models can read
    the logged-in user when saving rows.

    Must run AFTER AuthenticationMiddleware so request.user is
    populated by the time views execute.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        set_current_request(request)
        try:
            return self.get_response(request)
        finally:
            clear_current_request()