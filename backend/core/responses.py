from rest_framework.response import Response
from rest_framework import status
from django.http import JsonResponse,HttpResponse


def custom_error_response(
    response_code,
    response_message,
):
    return Response(
        data={
            "response_code": response_code,
            "response_message": response_message,
        },
        status=status.HTTP_200_OK,
    )


def custom_errors_response(response_code, response_message, errors):
    return JsonResponse(
        {
            "response_code": response_code,
            "response_message": response_message,
            "errors": errors,
        },
        status=status.HTTP_200_OK,
    )


def custom_plain_response(response_code, response_message, reference=""):
    return JsonResponse(
        {
            "response_code": response_code,
            "response_message": response_message,
            "reference": reference

        }
    )

def custom_count_response(response_code, response_message,count):
    return JsonResponse(
        {
            "response_code": response_code,
            "response_message": response_message,
            "count": count,
        }
    )

def custom_success_message(response_code, response_message, serializer, label):
    return Response(
        data={
            "response_code": response_code,
            "response_message": response_message,
            label: serializer,
        },
        status=status.HTTP_200_OK,
    )

def custom_success_message_with_reference(response_code, response_message, serializer, label,reference=""):
    return Response(
        data={
            "response_code": response_code,
            "response_message": response_message,
            "reference":reference,
            label: serializer,
        },
        status=status.HTTP_200_OK,
    )

def custom_json_response(response_code, response_message, label, json):
    return JsonResponse(
        {
            "response_code": response_code,
            "response_message": response_message,
            f"{label}": json,
        }
    )


def qr_code_response(qr_code):
    response = HttpResponse(content_type="image/png")
    qr_code.save(response, "PNG")
    return response