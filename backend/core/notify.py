# core/notify.py
#
# One place to tell people things. Builds on the single senders in core/utils.py
# (send_email, send_sms, send_push_notification) and decides WHO gets WHAT:
#
#   notify_entity(entity, subject, lines, ...)   a business: its super admins, owner
#                                                and administrator
#   notify_users(users, subject, lines, ...)     particular people
#
# Channels per call: email (default on), sms, push. Placeholder emails
# (@users.wazipos.co.ke) and invalid phones are skipped. Messages go out after the
# database transaction commits, on a background thread, so a slow mail server never
# slows the request and nothing is sent for work that was rolled back.
#
# Rule of thumb used across WaziPOS (notifications/signals.py):
#   email  every order, payment, pay-in receipt and payout — the business record
#   live   every message, to whoever has the app open (websocket; the app then
#          hides the duplicate push)
#   push   new work for a business (a new order, money received) when the app is closed
#   sms    only when someone must act or has no app/email: a payout to a person,
#          a payout that failed or is waiting for a payout account

import threading
from decimal import Decimal

from django.db import close_old_connections, transaction
from django.utils.html import escape

from utils.logging import create_log


def money(value):
    try:
        return f"KES {Decimal(str(value or 0)):,.2f}"
    except Exception:
        return f"KES {value}"


def entity_admins(entity):
    """The people who run a business: super admins for it, its owner and administrator."""
    if entity is None:
        return []
    from authentication.models import Users

    people = {u.pk: u for u in Users.objects.filter(roles__entity=entity, roles__value__endswith="SuperAdmin").distinct()}
    for attr in ("owner", "administrator"):
        u = getattr(entity, attr, None)
        if u is not None and getattr(u, "pk", None):
            people.setdefault(u.pk, u)
    return list(people.values())


def _real_email(user):
    from authentication.utils.admin_users import has_real_email

    try:
        return has_real_email(user)
    except Exception:
        return bool(getattr(user, "email", None))


def _html(subject, lines, footer):
    rows = "".join(f"<p style='margin:0 0 10px'>{escape(str(l))}</p>" for l in lines if l)
    return (
        "<div style='font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0b1733'>"
        "<div style='background:linear-gradient(100deg,#2a6ff3,#22b8f0);color:#fff;padding:18px 22px;border-radius:14px 14px 0 0'>"
        f"<div style='font-size:13px;opacity:.9'>WaziPOS</div><div style='font-size:19px;font-weight:700'>{escape(subject)}</div></div>"
        f"<div style='padding:20px 22px;border:1px solid #e1e8f5;border-top:0;border-radius:0 0 14px 14px;font-size:14px;line-height:1.55'>{rows}"
        f"<p style='margin:18px 0 0;color:#6b7a99;font-size:12px'>{escape(footer)}</p></div></div>"
    )


def _broadcast(people, subject, lines, data):
    """Live alert to each person's connected app (ws/notifications/alerts/)."""
    try:
        import uuid

        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        from django.utils import timezone

        from notifications.consumers import alerts_group

        layer = get_channel_layer()
        if layer is None:
            return
        alert = {
            "id": uuid.uuid4().hex,
            "title": subject,
            "body": str(lines[0]) if lines else subject,
            "lines": [str(l) for l in lines if l],
            "data": data or {},
            "created": timezone.now().isoformat(),
        }
        for u in people:
            async_to_sync(layer.group_send)(alerts_group(u.pk), {"type": "alert.created", "alert": alert})
    except Exception as e:
        create_log("error", f"Live alert '{subject}' failed: {e}")


def _deliver(people, subject, lines, email, sms, push, sms_text, data):
    from core.utils import send_email, send_push_notification, send_sms

    # Everyone told about it also gets it live if their app is connected right now.
    _broadcast(people, subject, lines, data)

    body = "\n\n".join(str(l) for l in lines if l)
    footer = "You get this because you run this account on WaziPOS."
    emails = sorted({u.email.strip() for u in people if email and _real_email(u)})
    if emails:
        # One email per person keeps addresses private.
        for address in emails:
            send_email(to=address, subject=f"WaziPOS · {subject}", body=f"{body}\n\n{footer}", html_body=_html(subject, lines, footer))
    if sms:
        text = (sms_text or f"{subject}. {lines[0] if lines else ''}").strip()
        for phone in sorted({str(u.phone) for u in people if getattr(u, "phone", None) and str(u.phone) not in ("", "None")}):
            send_sms(phone, f"WaziPOS: {text}"[:300])
    if push:
        for u in people:
            token = getattr(u, "notification_token", None)
            if token and token != "None":
                send_push_notification(token, subject, (lines[0] if lines else subject)[:180], data or {})


def notify_users(users, subject, lines, *, email=True, sms=False, push=False, sms_text=None, data=None):
    """Tell these people (after commit, off the request thread). Never raises."""
    people = [u for u in (users or []) if u is not None]
    if not people:
        return

    def run():
        try:
            _deliver(people, subject, list(lines or []), email, sms, push, sms_text, data)
        except Exception as e:
            create_log("error", f"Notification '{subject}' failed: {e}")
        finally:
            close_old_connections()

    transaction.on_commit(lambda: threading.Thread(target=run, daemon=True).start())


def later(build):
    """
    Run `build()` after the transaction commits, on a background thread — for messages
    whose content (order totals, items) is only complete once everything is saved.
    Inside it, call deliver_to_users / deliver_to_entity (they send at once).
    """
    def run():
        try:
            build()
        except Exception as e:
            create_log("error", f"Deferred notification failed: {e}")
        finally:
            close_old_connections()

    transaction.on_commit(lambda: threading.Thread(target=run, daemon=True).start())


def deliver_to_users(users, subject, lines, *, email=True, sms=False, push=False, sms_text=None, data=None):
    """Send right now (use inside later())."""
    people = [u for u in (users or []) if u is not None]
    if people:
        _deliver(people, subject, list(lines or []), email, sms, push, sms_text, data)


def deliver_to_entity(entity, subject, lines, **channels):
    deliver_to_users(entity_admins(entity), subject, lines, **channels)


def notify_entity(entity, subject, lines, **channels):
    """Tell a business's admins (super admins, owner, administrator)."""
    try:
        notify_users(entity_admins(entity), subject, lines, **channels)
    except Exception as e:
        create_log("error", f"Notification to {entity} failed: {e}")
