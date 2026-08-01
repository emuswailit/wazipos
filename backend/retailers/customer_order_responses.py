from rest_framework.response import Response
from rest_framework import status


def custom_error_response(
    response_code,
    response_message,
):
    return Response(
        data={
            "response_code": response_code,
            "response_message": response_message,
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def custom_success_message(response_code, response_message, serializer, tag):
    return Response(
        data={
            "response_code": response_code,
            "response_message": response_message,
            tag: serializer,
        },
        status=status.HTTP_200_OK,
    )

def custom_success_message_no_payload(response_code, response_message):
    return Response(
        data={
            "response_code": response_code,
            "response_message": response_message,

           
        },
        status=status.HTTP_200_OK,
    )