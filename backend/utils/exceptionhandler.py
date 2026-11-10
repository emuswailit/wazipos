import logging
import uuid

from django.db import DatabaseError, IntegrityError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler, set_rollback

logger = logging.getLogger("wazipos.api")


def custom_exception_handler(exc, context):
    # Let DRF build its response first for the exceptions it understands
    # (ValidationError, NotAuthenticated, PermissionDenied, Http404, ...).
    response = exception_handler(exc, context)

    if response is None:
        # Anything DRF doesn't know about (IntegrityError, KeyError, AttributeError,
        # ...) used to escape as Django's 500 page — with a full traceback when
        # DEBUG is on. Answer with the app's usual JSON error shape instead and keep
        # the details in the server log.
        return _handle_unexpected_error(exc, context)

    handlers = {
        "ValidationError": _handle_generic_error,
        "Http404": _handle_generic_error,
        "PermissionDenied": _handle_generic_error,
        "Unauthorized": _handle_authentication_error,
    }
    exception_class = exc.__class__.__name__
    if exception_class in handlers:
        return handlers[exception_class](exc, context, response)

    return response


def _handle_generic_error(exc, context, response):
    # Wrap DRF's response body in the `errors` key.
    response.data = {"errors": response.data}
    return response


def _handle_authentication_error(exc, context, response):
    response.data = {"error": "Please log in to proceed"}
    return response


def _describe_request(context):
    request = context.get("request")
    view = context.get("view")
    action = None
    try:
        data = getattr(request, "data", None)
        if hasattr(data, "get"):
            action = data.get("action")
    except Exception:  # unreadable body — never fail while reporting a failure
        action = None
    user = getattr(request, "user", None)
    return {
        "path": getattr(request, "path", None),
        "method": getattr(request, "method", None),
        "action": action,
        "user": getattr(user, "pk", None) or "anonymous",
        "view": type(view).__name__ if view is not None else None,
    }


def _handle_unexpected_error(exc, context):
    """JSON error for unhandled exceptions; details go to the log, not the client."""
    # Short reference the user can quote and support can grep for in the logs.
    error_ref = uuid.uuid4().hex[:8].upper()
    info = _describe_request(context)

    # Same as DRF does for the errors it handles: roll back the request's
    # transaction (ATOMIC_REQUESTS) instead of committing half a change.
    set_rollback()

    if isinstance(exc, IntegrityError):
        # A unique / foreign-key / not-null constraint failed: usually a clash with
        # an existing record, or two requests racing each other.
        http_status = status.HTTP_409_CONFLICT
        message = "This couldn't be saved because it clashes with an existing record. Please try again."
    elif isinstance(exc, DatabaseError):
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE
        message = "The database is temporarily unavailable. Please try again shortly."
    else:
        http_status = status.HTTP_500_INTERNAL_SERVER_ERROR
        message = "Something went wrong on our side. Please try again."

    logger.exception(
        "Unhandled %s [ref %s] %s %s action=%s user=%s view=%s",
        type(exc).__name__, error_ref, info["method"], info["path"],
        info["action"], info["user"], info["view"],
    )

    return Response(
        {
            "response_code": 1,
            "response_message": message,
            "errors": [f"{message} (ref {error_ref})"],
            "error_ref": error_ref,
        },
        status=http_status,
    )
