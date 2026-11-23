# employees/jobs_views.py — Jobs board endpoints.
#
#   POST /api/v1/employees/jobs          (signed in — every user, Client role and up)
#       Job seekers:  Browse {q?, employment_type?, cadre?, county?, page?}
#                     JobDetails {advert_id | code}
#                     Apply {advert_id | code, phone, email?, cover_note?, license_number?,
#                            years_experience?, available_from?, expected_pay?, cv? (multipart)}
#                     MyApplications · WithdrawApplication {application_id} · Lookups
#       Employers (the business's super admin):
#                     EmployerAdverts · SaveAdvert {advert_id?, title, employment_type, vacancies, closes, …}
#                     SetAdvertStatus {advert_id, status} · AdvertApplications {advert_id, status?}
#                     UpdateApplication {application_id, status?, employer_notes?, interview_at?,
#                                        interview_location?, message?}
#
#   POST /api/v1/employees/jobs/public   (no account) PublicJob {code} → teaser only.
#
# Errors: business problems → HTTP 200 {response_code: 1, response_message, errors: [...]};
# anything unexpected is logged and answered with HTTP 500 and a plain message —
# never a stack trace.

import logging

from django.http import JsonResponse
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, parser_classes, permission_classes, renderer_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.renderers import JSONRenderer
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from core.responses import custom_errors_response, custom_success_message
from employees import cv as cvs
from employees import jobs

log = logging.getLogger(__name__)


class PublicJobThrottle(AnonRateThrottle):
    rate = "60/min"


class JobsUserThrottle(UserRateThrottle):
    rate = "240/min"


def _crash(action, user, err):
    """Log the real cause; tell the client something useful."""
    log.exception("jobs %s failed for %s", action, getattr(user, "pk", None))
    try:
        from utils.logging import create_log

        create_log("error", f"Jobs {action} failed: {err}")
    except Exception:
        pass
    return JsonResponse(
        {"response_code": 1, "response_message": "Server problem", "errors": ["Something went wrong on our side. Please try again shortly."]},
        status=500,
    )


def _run(action, user, fn, message, key):
    try:
        return custom_success_message(0, message, fn(), key)
    except (jobs.JobError, cvs.CVError) as e:
        return custom_errors_response(1, e.message, e.errors)
    except exceptions.ValidationError as e:
        detail = e.detail if isinstance(e.detail, list) else [str(e.detail)]
        return custom_errors_response(1, "Check the details", [str(d) for d in detail])
    except exceptions.PermissionDenied as e:
        return custom_errors_response(1, "Not allowed", [str(e.detail)])
    except Exception as e:  # noqa: BLE001 — last line of defence
        return _crash(action, user, e)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@renderer_classes([JSONRenderer])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@throttle_classes([JobsUserThrottle])
def jobsAPIView(request):
    data = request.data
    action = data.get("action") if hasattr(data, "get") else None
    user = request.user
    if not action:
        return custom_errors_response(1, "Check the details", ["Action is not supplied"])

    routes = {
        # seekers
        "Browse": (lambda: jobs.browse(user, data, request), "Jobs", "jobs"),
        "JobDetails": (lambda: jobs.details(user, data, request), "Job", "job"),
        "Apply": (lambda: jobs.apply(user, data, request.FILES, request), "Application sent", "application"),
        "MyApplications": (lambda: jobs.my_applications(user, request), "My applications", "applications"),
        "WithdrawApplication": (lambda: jobs.withdraw(user, data), "Application withdrawn", "application"),
        "Lookups": (lambda: jobs.lookups(user), "Lookups", "lookups"),
        # My CV (+ AI assistant)
        "MyCVs": (lambda: cvs.list_cvs(user), "CVs", "cvs"),
        "GetCV": (lambda: cvs.get_cv(user, data), "CV", "cv"),
        "SaveCV": (lambda: cvs.save_cv(user, data), "CV saved", "cv"),
        "DeleteCV": (lambda: cvs.delete_cv(user, data), "CV deleted", "cv"),
        "ShareCV": (lambda: cvs.set_sharing(user, data), "Sharing updated", "cv"),
        "CVAssist": (lambda: cvs.ai_assist(user, data), "Suggestion", "assist"),
        # employers
        "EmployerAdverts": (lambda: jobs.employer_adverts(user, request), "Adverts", "adverts"),
        "SaveAdvert": (lambda: jobs.save_advert(user, data, request), "Advert saved", "advert"),
        "SetAdvertStatus": (lambda: jobs.set_status(user, data, request), "Advert updated", "advert"),
        "AdvertApplications": (lambda: jobs.advert_applications(user, data, request), "Applications", "pipeline"),
        "UpdateApplication": (lambda: jobs.update_application(user, data, request), "Application updated", "application"),
    }
    route = routes.get(str(action))
    if not route:
        return custom_errors_response(1, "Check the details", [f"Unknown action '{action}'"])
    fn, message, key = route
    return _run(action, user, fn, message, key)


@api_view(["POST", "GET"])
@permission_classes([permissions.AllowAny])
@renderer_classes([JSONRenderer])
@parser_classes([JSONParser, FormParser])
@throttle_classes([PublicJobThrottle])
def publicJobAPIView(request):
    data = request.data if request.method == "POST" else request.query_params
    return _run("PublicJob", None, lambda: jobs.public_teaser(data, request), "Job", "job")


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
@throttle_classes([PublicJobThrottle])
def cvPublicView(request, token):
    """A shared CV link: the CV page as the owner rendered it (print / save as PDF in the browser)."""
    from django.http import HttpResponse, HttpResponseNotFound

    try:
        html = cvs.public_html(token)
    except Exception as e:  # noqa: BLE001
        return _crash("PublicCV", None, e)
    if not html:
        return HttpResponseNotFound("<h1>CV not available</h1><p>This link was switched off by its owner.</p>")
    resp = HttpResponse(html, content_type="text/html; charset=utf-8")
    # User-made HTML: no scripts, no outside requests except images/fonts, sandboxed.
    resp["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data: https:; font-src data: https://fonts.gstatic.com; sandbox allow-popups allow-modals"
    resp["X-Robots-Tag"] = "noindex, nofollow"
    resp["Referrer-Policy"] = "no-referrer"
    resp["X-Content-Type-Options"] = "nosniff"
    return resp
