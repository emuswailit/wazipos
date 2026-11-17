# core/access_log.py
#
# Logs every request to the API (api.wazipos.co.ke) into analytics.ApiAccessLog:
# the caller's IP, the signed-in user (and their business) when there is one,
# the method, path and "action" of command endpoints, the status and the time
# taken. Admins see it under Admin -> Access logs (analytics/access-logs).
#
# - Never slows a request: rows go into an in-memory queue and a background
#   thread writes them in batches (bulk_create). If the queue is full (DB down),
#   rows are dropped rather than holding requests up.
# - Never stores request bodies or tokens: only the "action" name is read, and
#   only from small JSON bodies.
# - The user: API calls use JWT, so Django's middleware sees an anonymous user;
#   DRF sets the real one on the request while the view runs. For views that
#   never look at the user (public endpoints), the bearer token is decoded here.
# - Old rows are pruned: ACCESS_LOG_RETENTION_DAYS (default 90), also
#   `python manage.py prune_access_logs`.

from __future__ import annotations

import ipaddress
import json
import queue
import threading
import time
from datetime import timedelta

from decouple import config

RETENTION_DAYS = int(config("ACCESS_LOG_RETENTION_DAYS", default=90))
ENABLED = str(config("ACCESS_LOG_ENABLED", default="true")).lower() not in ("0", "false", "no")

# Not worth a row: preflights, files, dev reload, and the log screen reading itself.
SKIP_METHODS = {"OPTIONS", "HEAD"}
SKIP_PREFIXES = ("/static/", "/media/", "/__reload__/", "/favicon", "/api/v1/analytics/access-logs")
MAX_BODY_FOR_ACTION = 64 * 1024

_QUEUE: "queue.Queue[dict]" = queue.Queue(maxsize=20000)
_BATCH = 200
_FLUSH_SECONDS = 2.0
_PRUNE_EVERY_SECONDS = 6 * 3600
_writer_started = False
_writer_lock = threading.Lock()


# ---------------------------------------------------------------- the caller

def _is_internal(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return a.is_private or a.is_loopback or a.is_link_local


def client_ip(request) -> str:
    """
    The caller's IP. Behind a reverse proxy (nginx, a load balancer) the socket
    address is the proxy's, so X-Forwarded-For / X-Real-IP are used — but only
    when the request really came through a proxy on our own network, so a
    client cannot pick its logged IP by sending the header itself.
    """
    remote = (request.META.get("REMOTE_ADDR") or "").strip()
    if remote and not _is_internal(remote):
        return remote
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        # Rightmost address that is not one of our proxies = who connected to them.
        for part in reversed([p.strip() for p in forwarded.split(",") if p.strip()]):
            try:
                ipaddress.ip_address(part)
            except ValueError:
                continue
            if not _is_internal(part):
                return part
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    real = (request.META.get("HTTP_X_REAL_IP") or "").strip()
    return real or remote or "0.0.0.0"


def _request_action(request) -> str:
    """The "action" of a command endpoint (POST {"action": ...} or ?action=)."""
    action = request.GET.get("action", "")
    if action:
        return str(action)[:120]
    if request.method not in ("POST", "PUT", "PATCH"):
        return ""
    ctype = request.META.get("CONTENT_TYPE", "")
    try:
        length = int(request.META.get("CONTENT_LENGTH") or 0)
    except ValueError:
        length = 0
    if "application/json" not in ctype or not (0 < length <= MAX_BODY_FOR_ACTION):
        return ""
    try:
        # Reading request.body caches it, so the view can still read the stream.
        data = json.loads(request.body or b"{}")
    except Exception:
        return ""
    return str(data.get("action") or "")[:120] if isinstance(data, dict) else ""


def _request_user(request):
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        return user
    header = request.META.get("HTTP_AUTHORIZATION", "")
    if not header.lower().startswith("bearer "):
        return None
    try:
        from rest_framework_simplejwt.authentication import JWTAuthentication

        result = JWTAuthentication().authenticate(request)
        return result[0] if result else None
    except Exception:  # expired / invalid token: an anonymous call
        return None


def _user_label(user) -> str:
    name = " ".join(p for p in (getattr(user, "first_name", "") or "", getattr(user, "last_name", "") or "") if p).strip()
    contact = getattr(user, "email", "") or getattr(user, "phone", "") or ""
    if name and contact:
        return f"{name} <{contact}>"[:200]
    return (name or contact or str(user.pk))[:200]


# ---------------------------------------------------------------- the writer

def _ensure_writer():
    global _writer_started
    if _writer_started:
        return
    with _writer_lock:
        if _writer_started:
            return
        threading.Thread(target=_writer_loop, name="access-log-writer", daemon=True).start()
        _writer_started = True


def _writer_loop():
    from django.db import close_old_connections

    from utils.logging import create_log

    last_prune = 0.0
    while True:
        rows = []
        try:
            rows.append(_QUEUE.get(timeout=_FLUSH_SECONDS))
            while len(rows) < _BATCH:
                rows.append(_QUEUE.get_nowait())
        except queue.Empty:
            pass
        try:
            close_old_connections()
            if rows:
                from analytics.models import ApiAccessLog

                ApiAccessLog.objects.bulk_create([ApiAccessLog(**r) for r in rows], batch_size=_BATCH)
            if time.monotonic() - last_prune > _PRUNE_EVERY_SECONDS:
                last_prune = time.monotonic()
                prune_access_logs()
        except Exception as e:  # never let the writer die
            try:
                create_log("error", f"Access log write failed ({len(rows)} rows): {e!r}")
            except Exception:
                pass
            time.sleep(5)


def prune_access_logs(days: int | None = None) -> int:
    """Delete rows older than the retention period. Returns how many."""
    from django.utils import timezone

    from analytics.models import ApiAccessLog

    cutoff = timezone.now() - timedelta(days=days or RETENTION_DAYS)
    deleted, _ = ApiAccessLog.objects.filter(created__lt=cutoff).delete()
    return deleted


# ---------------------------------------------------------------- middleware

class AccessLogMiddleware:
    """Records each API request (see the module notes). Place after AuthenticationMiddleware."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not ENABLED or request.method in SKIP_METHODS or request.path.startswith(SKIP_PREFIXES):
            return self.get_response(request)

        started = time.monotonic()
        action = _request_action(request)  # before the view reads the body
        response = self.get_response(request)
        try:
            self._record(request, response, action, started)
        except Exception:
            pass  # logging must never break a response
        return response

    def _record(self, request, response, action, started):
        from django.utils import timezone

        user = _request_user(request)
        entity = getattr(user, "entity", None) if user else None
        row = {
            "created": timezone.now(),
            "ip": client_ip(request),
            "method": request.method[:8],
            "path": request.path[:300],
            "action": action,
            "status_code": getattr(response, "status_code", 0) or 0,
            "duration_ms": int((time.monotonic() - started) * 1000),
            "user_id": getattr(user, "pk", None),
            "user_label": _user_label(user) if user else "",
            "entity_ref": str(getattr(entity, "pk", "") or "")[:64],
            "entity_title": (getattr(entity, "title", "") or "")[:200],
            "user_agent": (request.META.get("HTTP_USER_AGENT") or "")[:300],
            "origin": (request.META.get("HTTP_ORIGIN") or request.META.get("HTTP_REFERER") or "")[:200],
        }
        try:
            ipaddress.ip_address(row["ip"])
        except ValueError:
            row["ip"] = "0.0.0.0"
        _ensure_writer()
        try:
            _QUEUE.put_nowait(row)
        except queue.Full:
            pass
