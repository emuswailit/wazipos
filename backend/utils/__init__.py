from rest_framework.views import exception_handler


def custom_exception_handler(exc, contex):
    handlers = {
        'ValidationError': handle_generic_error,
        'Http404': handle_generic_error,
        'PermissionDenied': handle_generic_error,
        'NotAuthenticated': handle_generic_error,
        'ObjectDoesNotExist': handle_generic_error,
    }

    response = exception_handler(exc, contex)
    exception_class = exc.__class__.__name__

    if exception_class in handlers:
        return handlers[exception_class](exc, context, response)
    return response


def _handle_authentication_error(exc, context, response):
    response.data = {
        'error': 'Please log in to proceed'
    }


def _handle_generic_error(exc, context, error):
    return response


