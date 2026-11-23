from django.urls import path
from . import jobs_views, views


urlpatterns = [
    path("admin", views.employeesAdminAPIView, name="employees-admin-api-view"),
    path("joint", views.employeesJointAPIView, name="employees-joint-api-view"),
    path("designations", views.designationsAPIView, name="designations-api-view"),
    path("adverts", views.advertsAPIView, name="adverts-api-view"),
    # Jobs board: browse / apply (signed in) and the public teaser for shared links.
    path("jobs", jobs_views.jobsAPIView, name="jobs-api-view"),
    path("jobs/public", jobs_views.publicJobAPIView, name="jobs-public-api-view"),
    path("cv/<str:token>", jobs_views.cvPublicView, name="cv-public-view"),
]
