from rest_framework import pagination
from rest_framework.response import Response


class CustomPagination(pagination.LimitOffsetPagination):
    default_limit = 1000000
    max_limit = 1000000


# class CustomPagination(pagination.PageNumberPagination):
#     def get_paginated_response(self, data):
#         return Response(
#             {
#                 "next": self.get_next_link(),
#                 "previous": self.get_previous_link(),
#                 "count": self.page.paginator.count,
#                 "result": data,
#             }
#         )

# {
#     "next": self.get_next_link(),
#     "previous": self.get_previous_link(),
#     "Count": self.page.paginator.count,
#     "Items": data,
# }
