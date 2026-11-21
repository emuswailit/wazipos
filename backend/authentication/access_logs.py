# authentication/access_logs.py
#
# Admin screen data for the API access log (authentication.AccessLogs, written
# by core.access_log.AccessLogMiddleware). Platform admins only.
#
#   POST /api/v1/authentication/access-logs
#     GetAccessLogs  {page?, page_size?, q?, ip?, user?, app?, source?,
#                     scope?: "ALL"|"SIGNED_IN"|"ANONYMOUS"|"ERRORS",
#                     date_from?, date_to? (YYYY-MM-DD)}
#                    -> {logs: {count, results[]}, stats}
#     GetAccessIps   {same filters, limit?}
#                    -> {ips: [{ip, requests, users[], last_seen, first_seen, errors}]}
#
#   ws/authentication/access-logs/  (consumers.AccessLogsConsumer)
#     -> {"event": "access_logs.created", "logs": [row, ...]} as rows are written.

from datetime import datetime, time, timedelta

from django.db.models import Count, Max, Min, Q
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.decorators import api_view, permission_classes

from authentication.models import AccessLogs
from core.app_permissions import AdminRoleOnly
from core.responses import custom_success_message

MAX_PAGE_SIZE = 200
LIVE_GROUP = "admin-access-logs"


def log_row(r: AccessLogs) -> dict:
    return {
        "id": r.id,
        "created": r.created.isoformat(),
        "ip": r.ip,
        "method": r.method,
        "endpoint": r.endpoint,
        "status_code": r.status_code,
        "duration_ms": r.duration_ms,
        "user": str(r.user_id) if r.user_id else None,
        "user_label": r.user_label,
        "entity_title": r.entity_title,
        "app": r.app,
        "url": r.url,
        "action": r.action,
        "source": r.source,
        "client_route": r.client_route,
        "user_agent": r.user_agent,
    }


def broadcast_logs(rows) -> None:
    """Push freshly written rows to the admins watching the live log. Never raises."""
    if not rows:
        return
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(
            LIVE_GROUP, {"type": "access_logs.created", "logs": [log_row(r) for r in rows if r.pk]},
        )
    except Exception:
        pass  # Redis down: the screen still loads over HTTP


def _day(value, end=False):
    if not value:
        return None
    try:
        d = datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        raise exceptions.ValidationError("Dates must look like 2026-11-17")
    moment = datetime.combine(d, time.max if end else time.min)
    return timezone.make_aware(moment, timezone.get_current_timezone())


def _filtered(data):
    qs = AccessLogs.objects.all()
    start, end = _day(data.get("date_from")), _day(data.get("date_to"), end=True)
    if not start and not end:
        start = timezone.now() - timedelta(days=7)  # default window: the last week
    if start:
        qs = qs.filter(created__gte=start)
    if end:
        qs = qs.filter(created__lte=end)
    if data.get("ip"):
        qs = qs.filter(ip=str(data["ip"]).strip())
    if data.get("user"):
        qs = qs.filter(user_id=data["user"])
    if data.get("app"):
        qs = qs.filter(app=str(data["app"]).strip())
    if data.get("source"):
        qs = qs.filter(source=str(data["source"]).strip().upper())
    scope = str(data.get("scope") or "ALL").upper()
    if scope == "SIGNED_IN":
        qs = qs.filter(user__isnull=False)
    elif scope == "ANONYMOUS":
        qs = qs.filter(user__isnull=True)
    elif scope == "ERRORS":
        qs = qs.filter(status_code__gte=400)
    q = str(data.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(ip__startswith=q) | Q(endpoint__icontains=q) | Q(action__icontains=q) | Q(app__icontains=q)
            | Q(user_label__icontains=q) | Q(entity_title__icontains=q) | Q(client_route__icontains=q)
        )
    return qs


@api_view(["POST"])
@permission_classes([AdminRoleOnly])
def accessLogsAPIView(request):
    data = request.data
    action = data.get("action")

    if action == "GetAccessLogs":
        qs = _filtered(data)
        try:
            page = max(1, int(data.get("page") or 1))
            size = min(MAX_PAGE_SIZE, max(1, int(data.get("page_size") or 50)))
        except (TypeError, ValueError):
            raise exceptions.ValidationError("page and page_size must be numbers")
        total = qs.count()
        rows = qs.order_by("-created")[(page - 1) * size: page * size]
        stats = qs.aggregate(
            ips=Count("ip", distinct=True),
            users=Count("user", distinct=True),
            errors=Count("id", filter=Q(status_code__gte=400)),
        )
        return custom_success_message(
            0, "Access logs",
            {"logs": {"count": total, "results": [log_row(r) for r in rows]}, "stats": {"requests": total, **stats}},
            "data",
        )

    if action == "GetAccessIps":
        try:
            limit = min(500, max(1, int(data.get("limit") or 100)))
        except (TypeError, ValueError):
            limit = 100
        qs = _filtered({**data, "ip": None})
        groups = (
            qs.values("ip")
            .annotate(
                requests=Count("id"),
                errors=Count("id", filter=Q(status_code__gte=400)),
                last_seen=Max("created"),
                first_seen=Min("created"),
            )
            .order_by("-requests")[:limit]
        )
        ips = [g["ip"] for g in groups]
        users_by_ip: dict = {}
        for ip, label in qs.filter(ip__in=ips, user__isnull=False).values_list("ip", "user_label").distinct():
            users_by_ip.setdefault(ip, []).append(label)
        result = [
            {
                "ip": g["ip"],
                "requests": g["requests"],
                "errors": g["errors"],
                "last_seen": g["last_seen"].isoformat() if g["last_seen"] else None,
                "first_seen": g["first_seen"].isoformat() if g["first_seen"] else None,
                "users": sorted(set(users_by_ip.get(g["ip"], [])))[:10],
            }
            for g in groups
        ]
        return custom_success_message(0, "Access by IP", result, "ips")

    raise exceptions.ValidationError(f"Action {action} is unknown")
