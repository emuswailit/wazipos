# core/email_layout.py
#
# The one WaziPOS email look: cobalt -> sky gradient header ("WaziPOS" + title),
# white card with a light border, muted footer line. core.utils.send_email applies
# it to every email, so callers can pass plain text (blank lines = paragraphs,
# URLs become links) or their own inner HTML and still get the branded layout.

import re

from django.utils.html import escape

# Marks HTML that already has the layout, so send_email never wraps it twice.
BRAND_MARK = "<!--wazipos-email-->"
DEFAULT_FOOTER = "This email was sent by WaziPOS."

_URL = re.compile(r"(https?://[^\s<>\"']+)")
_PREFIX = re.compile(r"^\s*wazipos\s*[·:\-|]\s*", re.IGNORECASE)


def title_from_subject(subject):
    """'WaziPOS · Order paid' -> 'Order paid' (the header already says WaziPOS)."""
    return _PREFIX.sub("", str(subject or "")).strip() or "WaziPOS"


def _linkify(escaped_text):
    return _URL.sub(
        lambda m: f"<a href='{m.group(1)}' style='color:#2a6ff3;word-break:break-all'>{m.group(1)}</a>",
        escaped_text,
    )


def paragraph(text):
    """One plain-text paragraph as branded HTML (escaped, links clickable, line breaks kept)."""
    inner = _linkify(escape(str(text))).replace("\n", "<br>")
    return f"<p style='margin:0 0 10px'>{inner}</p>"


def text_to_html(body):
    """Plain email text -> branded paragraphs (split on blank lines)."""
    parts = [p.strip() for p in re.split(r"\n\s*\n", str(body or "")) if p.strip()]
    return "".join(paragraph(p) for p in parts)


def lines_to_html(lines):
    return "".join(paragraph(l) for l in (lines or []) if l)


def button(label, url):
    """A call-to-action button in the brand colour."""
    return (
        f"<p style='margin:16px 0'><a href='{escape(url)}' style='display:inline-block;background:#2a6ff3;color:#ffffff;"
        f"padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600'>{escape(label)}</a></p>"
    )


def branded_html(subject, content_html, footer=None):
    """Wrap inner HTML in the WaziPOS layout."""
    title = title_from_subject(subject)
    return (
        f"{BRAND_MARK}<div style='background:#f4f7fc;padding:24px 12px'>"
        "<div style='font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0b1733;background:#ffffff;border-radius:14px'>"
        "<div style='background:#2a6ff3;background:linear-gradient(100deg,#2a6ff3,#22b8f0);color:#ffffff;padding:18px 22px;border-radius:14px 14px 0 0'>"
        f"<div style='font-size:13px;opacity:.9'>WaziPOS</div><div style='font-size:19px;font-weight:700'>{escape(title)}</div></div>"
        "<div style='padding:20px 22px;border:1px solid #e1e8f5;border-top:0;border-radius:0 0 14px 14px;font-size:14px;line-height:1.55'>"
        f"{content_html}"
        f"<p style='margin:18px 0 0;color:#6b7a99;font-size:12px'>{escape(footer or DEFAULT_FOOTER)}</p></div></div></div>"
    )


def brand(subject, body=None, html_body=None, footer=None):
    """The branded HTML for an email: keeps already-branded HTML, wraps anything else."""
    if html_body and BRAND_MARK in html_body:
        return html_body
    return branded_html(subject, html_body if html_body else text_to_html(body), footer)
