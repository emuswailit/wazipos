# employees/jobs.py — the WaziPOS jobs board.
#
# Businesses (any entity) advertise openings — permanent posts and locum cover —
# built on Designations / Cadres / Adverts. Every signed-in user (Client role and
# up) can browse, save and apply; the business's super admin runs the pipeline:
#
#     SUBMITTED → SHORTLISTED → INTERVIEW → OFFERED → HIRED
#                    ↘ REJECTED (any time)      applicant: WITHDRAWN
#
# Public share links (wazipos.co.ke/job/<share_code>) get a teaser only
# (public_teaser); the full advert, pay details and applying need an account.
#
# Every function either returns plain dicts or raises JobError(message, [reasons]),
# which the view turns into the standard {response_code: 1, response_message, errors}.

import logging
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Q
from django.utils import timezone

from authentication.models import Cadres
from employees.models import Adverts, Designations, JobApplications

log = logging.getLogger(__name__)

PAGE_SIZE = 20
EMPLOYMENT_TYPES = {k for k, _ in Adverts.EMPLOYMENT_TYPES}
PAY_PERIODS = {k for k, _ in Adverts.PAY_PERIODS}
CV_TYPES = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"}
CV_MAX_BYTES = 5 * 1024 * 1024
PHONE_RE = re.compile(r"^\+?\d{9,15}$")

# Which pipeline moves the employer may make from each status.
TRANSITIONS = {
    "SUBMITTED": {"SHORTLISTED", "INTERVIEW", "REJECTED"},
    "SHORTLISTED": {"INTERVIEW", "OFFERED", "REJECTED"},
    "INTERVIEW": {"OFFERED", "REJECTED", "SHORTLISTED"},
    "OFFERED": {"HIRED", "REJECTED"},
    "HIRED": set(),
    "REJECTED": {"SHORTLISTED"},  # reconsider
    "WITHDRAWN": set(),
}


class JobError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = errors or [message]


# ------------------------------------------------------------------ parsing


def _text(data, key, *, required=False, max_len=None, label=None):
    v = data.get(key)
    v = "" if v is None else str(v).strip()
    if required and not v:
        raise JobError("Check the details", [f"{label or key.replace('_', ' ').capitalize()} is required"])
    if max_len and len(v) > max_len:
        raise JobError("Check the details", [f"{label or key.replace('_', ' ').capitalize()} must be at most {max_len} characters"])
    return v or None


def _int(data, key, *, default=0, minimum=0, label=None):
    raw = data.get(key)
    if raw in (None, ""):
        return default
    try:
        v = int(str(raw).strip())
    except (TypeError, ValueError):
        raise JobError("Check the details", [f"{label or key.replace('_', ' ').capitalize()} must be a whole number"])
    if v < minimum:
        raise JobError("Check the details", [f"{label or key.replace('_', ' ').capitalize()} must be at least {minimum}"])
    return v


def _money(data, key, label=None):
    raw = data.get(key)
    if raw in (None, ""):
        return None
    try:
        v = Decimal(str(raw).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        raise JobError("Check the details", [f"{label or key.replace('_', ' ').capitalize()} must be an amount"])
    if v < 0:
        raise JobError("Check the details", [f"{label or key.replace('_', ' ').capitalize()} can't be negative"])
    return v.quantize(Decimal("0.01"))


def _date(data, key, label=None):
    raw = data.get(key)
    if raw in (None, ""):
        return None
    if isinstance(raw, date):
        return raw
    try:
        return datetime.strptime(str(raw)[:10], "%Y-%m-%d").date()
    except ValueError:
        raise JobError("Check the details", [f"{label or key.replace('_', ' ').capitalize()} must be a date (YYYY-MM-DD)"])


def _datetime(data, key, label=None):
    raw = data.get(key)
    if raw in (None, ""):
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        raise JobError("Check the details", [f"{label or key} must be a date and time"])
    return dt if timezone.is_aware(dt) else timezone.make_aware(dt)


def _bool(data, key, default=False):
    raw = data.get(key)
    if raw in (None, ""):
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _today():
    return timezone.localdate()


# ------------------------------------------------------------------ access


def is_entity_admin(user, entity):
    """
    Only a business's own admin posts and manages its job adverts — decided by roles
    alone: the user must hold that entity's admin role, `{entity_type}SuperAdmin`
    (e.g. GeneralRetailerSuperAdmin) issued *for this entity*. A SuperAdmin role of
    another business, the platform Admin role, Agent / Onboarder and staff roles don't
    count, and neither do the owner / administrator fields on their own.
    """
    if not user or not getattr(user, "is_authenticated", False) or not entity or not entity.entity_type:
        return False
    return user.roles.filter(entity=entity, value=f"{entity.entity_type}SuperAdmin").exists()


def _employer_entity(user):
    """The business this user hires for (they must be one of its admins)."""
    entity = getattr(user, "entity", None)
    if not entity:
        raise JobError("Not allowed", ["Sign in to your business to manage job adverts"])
    if not is_entity_admin(user, entity):
        raise JobError("Not allowed", ["Only your business's admins can post and manage its job adverts"])
    return entity


def _employer_advert(user, advert_id):
    entity = _employer_entity(user)
    if not advert_id:
        raise JobError("Check the details", ["Advert is required"])
    advert = Adverts.objects.select_related("designation", "cadre", "entity").filter(id=advert_id, entity=entity).first()
    if not advert:
        raise JobError("Not found", ["That advert doesn't exist or isn't your business's"])
    return advert


def _is_employer_of(user, advert):
    try:
        return _employer_entity(user).id == advert.entity_id
    except JobError:
        return False


# ------------------------------------------------------------------ shaping


def _location(a):
    if a.work_location:
        return a.work_location
    e = a.entity
    parts = [getattr(e, "town", None), getattr(getattr(e, "county", None), "title", None)]
    return ", ".join([p for p in parts if p]) or None


def _county(a):
    c = getattr(a.entity, "county", None)
    return {"id": str(c.id), "title": c.title} if c else None


def _logo(a, request=None):
    try:
        logo = a.entity.logos.first()
        f = getattr(logo, "logo", None) or getattr(logo, "image", None) or getattr(logo, "file", None)
        if f:
            return request.build_absolute_uri(f.url) if request else f.url
    except Exception:
        pass
    return None


def pay_label(a):
    if not a.show_pay or (a.pay_min is None and a.pay_max is None):
        return None
    per = {"HOUR": "hour", "SHIFT": "shift", "DAY": "day", "WEEK": "week", "MONTH": "month", "YEAR": "year"}.get(a.pay_period, "month")
    fmt = lambda v: f"KES {v:,.0f}"
    if a.pay_min is not None and a.pay_max is not None and a.pay_max != a.pay_min:
        return f"{fmt(a.pay_min)} – {fmt(a.pay_max)} / {per}"
    return f"{fmt(a.pay_max if a.pay_max is not None else a.pay_min)} / {per}"


def _is_open(a):
    return a.status == "OPEN" and a.closes >= _today()


def _ensure_code(a):
    """Adverts from before the jobs board have no share code yet — give them one."""
    if not a.share_code:
        from employees.models import _share_code

        try:
            for _ in range(6):
                code = _share_code()
                # Only this column: save() would also re-derive is_active from status.
                if not Adverts.objects.filter(share_code=code).exists():
                    Adverts.objects.filter(pk=a.pk, share_code__isnull=True).update(share_code=code)
                    a.share_code = code
                    break
        except Exception as e:
            log.warning("share code for advert %s failed: %s", a.pk, e)
    return a.share_code


def advert_card(a, request=None, applied=None):
    """Board / list row — enough for a card, cached offline on the device."""
    _ensure_code(a)
    return {
        "id": str(a.id),
        "code": a.share_code,
        "title": a.title,
        "entity": {"id": str(a.entity_id), "title": a.entity.title, "type": a.entity.entity_type, "logo": _logo(a, request)},
        "designation": a.designation.title if a.designation_id else None,
        "cadre": {"id": str(a.cadre_id), "title": a.cadre.title} if a.cadre_id else None,
        "employment_type": a.employment_type,
        "location": _location(a),
        "county": _county(a),
        "pay": pay_label(a),
        "vacancies": a.vacancies,
        "closes": a.closes.isoformat(),
        "starts_on": a.starts_on.isoformat() if a.starts_on else None,
        "ends_on": a.ends_on.isoformat() if a.ends_on else None,
        "shift_hours": a.shift_hours,
        "requires_license": a.requires_license,
        "license_body": a.license_body,
        "min_experience_years": a.min_experience_years,
        "excerpt": (a.description or "")[:180],
        "status": a.status,
        "is_open": _is_open(a),
        "applied": bool(applied and str(a.id) in applied),
        "created": a.created.isoformat(),
    }


def advert_full(a, user, request=None):
    mine = JobApplications.objects.filter(advert=a, applicant=user).first() if user and user.is_authenticated else None
    out = advert_card(a, request, applied={str(a.id)} if mine and mine.status != "WITHDRAWN" else None)
    out.update({
        "description": a.description,
        "responsibilities": a.responsibilities,
        "requirements": a.requirements,
        "benefits": a.benefits,
        "pay_min": str(a.pay_min) if a.pay_min is not None and a.show_pay else None,
        "pay_max": str(a.pay_max) if a.pay_max is not None and a.show_pay else None,
        "pay_period": a.pay_period,
        "my_application": application_out(mine) if mine else None,
        "is_employer": _is_employer_of(user, a),
        "share_url": share_url(a),
    })
    return out


def employer_advert_out(a, counts=None, request=None):
    out = advert_full(a, None, request)
    out.update({
        "is_employer": True,
        "show_pay": a.show_pay,
        "pay_min": str(a.pay_min) if a.pay_min is not None else None,
        "pay_max": str(a.pay_max) if a.pay_max is not None else None,
        "work_location": a.work_location,
        "contact_email": a.contact_email,
        "designation_id": str(a.designation_id),
        "cadre_id": str(a.cadre_id) if a.cadre_id else None,
        "filled": a.filled,
        "views": a.views_count,
        "applications": a.applications_count,
        "pipeline": counts or {},
    })
    return out


def application_out(app, for_employer=False, request=None):
    out = {
        "id": str(app.id),
        "status": app.status,
        "advert": {"id": str(app.advert_id), "title": app.advert.title, "code": app.advert.share_code, "entity": app.advert.entity.title},
        "cover_note": app.cover_note,
        "phone": app.phone,
        "email": app.email,
        "license_number": app.license_number,
        "years_experience": app.years_experience,
        "available_from": app.available_from.isoformat() if app.available_from else None,
        "expected_pay": str(app.expected_pay) if app.expected_pay is not None else None,
        "cv": (request.build_absolute_uri(app.cv.url) if request else app.cv.url) if app.cv else None,
        "wazi_cv": _wazi_cv_link(app),
        "interview_at": app.interview_at.isoformat() if app.interview_at else None,
        "interview_location": app.interview_location,
        "message": app.message_to_applicant,
        "created": app.created.isoformat(),
        "updated": app.updated.isoformat(),
    }
    if for_employer:
        u = app.applicant
        out["applicant"] = {
            "id": str(u.id),
            "name": " ".join(p for p in [u.first_name, u.middle_name, u.last_name] if p).strip() or u.email,
            "email": u.email,
            "phone": u.phone,
            "education_level": u.education_level,
        }
        out["employer_notes"] = app.employer_notes
    return out


def _wazi_cv_link(app):
    if not getattr(app, "wazi_cv_id", None):
        return None
    from employees.cv import share_url as cv_url

    return cv_url(app.wazi_cv) if app.wazi_cv.share_token else None


def share_url(a):
    from django.conf import settings

    base = getattr(settings, "WEB_APP_URL", None) or "https://wazipos.co.ke"
    return f"{str(base).rstrip('/')}/job/{a.share_code}"


# ------------------------------------------------------------------ board (any signed-in user)


def _open_qs():
    return (
        Adverts.objects.select_related("entity", "entity__county", "designation", "cadre")
        # is_active: adverts made before the jobs board default to OPEN on migration;
        # the old on/off flag keeps switched-off ones hidden.
        .filter(status="OPEN", is_active=True, closes__gte=_today(), entity__is_active=True)
    )


def browse(user, data, request=None):
    qs = _open_qs()
    q = _text(data, "q", max_len=100)
    if q:
        qs = qs.filter(
            Q(title__icontains=q) | Q(description__icontains=q) | Q(entity__title__icontains=q)
            | Q(designation__title__icontains=q) | Q(cadre__title__icontains=q) | Q(work_location__icontains=q)
            | Q(entity__town__icontains=q)
        )
    kind = _text(data, "employment_type")
    if kind:
        if kind not in EMPLOYMENT_TYPES:
            raise JobError("Check the details", [f"Unknown job type '{kind}'"])
        qs = qs.filter(employment_type=kind)
    cadre = _text(data, "cadre")
    if cadre:
        qs = qs.filter(cadre_id=cadre)
    county = _text(data, "county")
    if county:
        qs = qs.filter(entity__county_id=county)

    page = _int(data, "page", default=1, minimum=1)
    total = qs.count()
    rows = list(qs.order_by("-created")[(page - 1) * PAGE_SIZE: page * PAGE_SIZE])
    applied = set(
        str(i) for i in JobApplications.objects.filter(applicant=user, advert__in=rows).exclude(status="WITHDRAWN").values_list("advert_id", flat=True)
    )
    return {
        "results": [advert_card(a, request, applied) for a in rows],
        "count": total,
        "page": page,
        "pages": max(1, -(-total // PAGE_SIZE)),
    }


def _find_advert(data):
    advert_id, code = _text(data, "advert_id"), _text(data, "code")
    qs = Adverts.objects.select_related("entity", "entity__county", "designation", "cadre")
    a = None
    if advert_id:
        a = qs.filter(id=advert_id).first()
    elif code:
        a = qs.filter(share_code=code.upper()).first()
    else:
        raise JobError("Check the details", ["Advert is required"])
    if not a:
        raise JobError("Not found", ["This job advert doesn't exist or was removed"])
    return a


def details(user, data, request=None):
    a = _find_advert(data)
    employer = _is_employer_of(user, a)
    applied = JobApplications.objects.filter(advert=a, applicant=user).exists()
    if a.status in ("DRAFT",) and not employer:
        raise JobError("Not found", ["This job advert isn't published"])
    if not employer:
        Adverts.objects.filter(pk=a.pk).update(views_count=F("views_count") + 1)
    out = advert_full(a, user, request)
    if not out["is_open"] and not applied and not employer:
        out["closed_notice"] = "Applications for this job have closed."
    return out


def apply(user, data, files=None, request=None):
    a = _find_advert(data)
    if not _is_open(a):
        raise JobError("Applications closed", ["This job is no longer taking applications"])
    if _is_employer_of(user, a):
        raise JobError("Not allowed", ["You can't apply to your own business's advert"])

    phone = re.sub(r"[\s\-()]", "", _text(data, "phone", required=True, label="Phone") or "")
    if not PHONE_RE.match(phone):
        raise JobError("Check the details", ["Phone must be a valid number, e.g. 0712345678"])
    email = _text(data, "email", max_len=254) or user.email
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise JobError("Check the details", ["Email doesn't look right"])
    license_number = _text(data, "license_number", max_len=80, label="Licence number")
    if a.requires_license and not license_number:
        raise JobError("Check the details", [f"This job needs a practising licence{f' ({a.license_body})' if a.license_body else ''} — enter your licence number"])
    years = _int(data, "years_experience", label="Years of experience")
    cover = _text(data, "cover_note", max_len=3000, label="Cover note")
    available_from = _date(data, "available_from", label="Available from")
    expected_pay = _money(data, "expected_pay", label="Expected pay")

    cv = (files or {}).get("cv") if files else None
    if cv:
        name = str(getattr(cv, "name", "")).lower()
        ext = name[name.rfind("."):] if "." in name else ""
        if ext not in CV_TYPES:
            raise JobError("Check the details", ["CV must be a PDF, Word document or photo"])
        if getattr(cv, "size", 0) > CV_MAX_BYTES:
            raise JobError("Check the details", ["CV must be 5 MB or smaller"])

    wazi_cv = None
    if _text(data, "cv_id"):
        from employees.models import CurriculumVitae

        wazi_cv = CurriculumVitae.objects.filter(id=_text(data, "cv_id"), user=user).first()
        if not wazi_cv or not wazi_cv.html:
            raise JobError("Check the details", ["Save your WaziPOS CV once before attaching it"])
        if not wazi_cv.share_token:
            import secrets as _s

            wazi_cv.share_token = _s.token_urlsafe(18)
            wazi_cv.save(update_fields=["share_token", "updated"])
    fields = dict(
        phone=phone, email=email, license_number=license_number, years_experience=years, cover_note=cover,
        available_from=available_from, expected_pay=expected_pay, wazi_cv=wazi_cv,
    )
    try:
        with transaction.atomic():
            existing = JobApplications.objects.select_for_update().filter(advert=a, applicant=user).first()
            if existing and existing.status != "WITHDRAWN":
                raise JobError("Already applied", ["You've already applied for this job — follow it in My applications"])
            if existing:  # re-applying after withdrawing
                for k, v in fields.items():
                    setattr(existing, k, v)
                existing.status = "SUBMITTED"
                if cv:
                    existing.cv = cv
                existing.save()
                app = existing
            else:
                app = JobApplications.objects.create(advert=a, applicant=user, entity=a.entity, owner=user, cv=cv, **fields)
            Adverts.objects.filter(pk=a.pk).update(applications_count=F("applications_count") + 1)
    except IntegrityError:
        raise JobError("Already applied", ["You've already applied for this job"])

    _tell_employer_new_application(app)
    _tell_applicant(app, "SUBMITTED")
    return application_out(JobApplications.objects.select_related("advert", "advert__entity").get(pk=app.pk), request=request)


def my_applications(user, request=None):
    rows = JobApplications.objects.select_related("advert", "advert__entity").filter(applicant=user).order_by("-updated")[:200]
    return [application_out(r, request=request) for r in rows]


def withdraw(user, data):
    app_id = _text(data, "application_id", required=True, label="Application")
    with transaction.atomic():
        app = JobApplications.objects.select_for_update().select_related("advert", "advert__entity").filter(id=app_id, applicant=user).first()
        if not app:
            raise JobError("Not found", ["That application doesn't exist"])
        if app.status in ("HIRED", "WITHDRAWN"):
            raise JobError("Not allowed", [f"This application is already {app.status.lower()}"])
        app.status = "WITHDRAWN"
        app.save(update_fields=["status", "updated"])
        Adverts.objects.filter(pk=app.advert_id, applications_count__gt=0).update(applications_count=F("applications_count") - 1)
    return application_out(app)


def lookups(user):
    out = {
        "cadres": [{"id": str(c.id), "title": c.title} for c in Cadres.objects.order_by("title")[:500]],
        "employment_types": [k for k, _ in Adverts.EMPLOYMENT_TYPES],
        "pay_periods": [k for k, _ in Adverts.PAY_PERIODS],
        "can_post": False,
        "designations": [],
    }
    try:
        entity = _employer_entity(user)
        out["can_post"] = True
        out["designations"] = [
            {"id": str(d.id), "title": d.title, "tenure": d.tenure, "cadre_id": str(d.cadre_id) if d.cadre_id else None}
            for d in Designations.objects.filter(entity=entity).order_by("title")
        ]
    except JobError:
        pass
    return out


# ------------------------------------------------------------------ employer


def employer_adverts(user, request=None):
    entity = _employer_entity(user)
    rows = list(Adverts.objects.select_related("entity", "entity__county", "designation", "cadre").filter(entity=entity).order_by("-created")[:300])
    counts = {}
    for r in (
        JobApplications.objects.filter(advert__in=rows).exclude(status="WITHDRAWN")
        .values("advert_id", "status").annotate(n=Count("id"))
    ):
        counts.setdefault(str(r["advert_id"]), {})[r["status"]] = r["n"]
    return [employer_advert_out(a, counts.get(str(a.id), {}), request) for a in rows]


def _designation_for(entity, user, data, employment_type, vacancies, cadre):
    did = _text(data, "designation_id")
    if did:
        d = Designations.objects.filter(id=did, entity=entity).first()
        if not d:
            raise JobError("Check the details", ["That designation isn't one of your business's"])
        return d
    title = _text(data, "designation_title", max_len=240, label="Role / designation")
    if not title:
        raise JobError("Check the details", ["Pick a designation or type the role's name"])
    tenure = employment_type if employment_type in {"CONTRACTUAL", "INTERNSHIP", "LOCUM", "PERMANENT", "TEMPORARY"} else (
        "CONTRACTUAL" if employment_type == "CONTRACT" else "PERMANENT"
    )
    d = Designations.objects.filter(entity=entity, title__iexact=title).first()
    if d:
        return d
    return Designations.objects.create(entity=entity, owner=user, title=title, tenure=tenure, total_slots=vacancies, cadre=cadre)


def save_advert(user, data, request=None):
    entity = _employer_entity(user)
    advert_id = _text(data, "advert_id")
    advert = _employer_advert(user, advert_id) if advert_id else None

    title = _text(data, "title", required=True, max_len=160, label="Job title")
    employment_type = (_text(data, "employment_type") or "PERMANENT").upper()
    if employment_type not in EMPLOYMENT_TYPES:
        raise JobError("Check the details", ["Job type must be permanent, locum, contract, internship or temporary"])
    vacancies = _int(data, "vacancies", default=1, minimum=1, label="Vacancies")
    closes = _date(data, "closes", label="Closing date")
    if not closes:
        raise JobError("Check the details", ["Closing date is required"])
    status = (_text(data, "status") or (advert.status if advert else "OPEN")).upper()
    if status not in ("DRAFT", "OPEN", "PAUSED", "CLOSED", "FILLED"):
        raise JobError("Check the details", ["Unknown status"])
    if status == "OPEN" and closes < _today():
        raise JobError("Check the details", ["Closing date can't be in the past for an open advert"])

    pay_min, pay_max = _money(data, "pay_min", "Minimum pay"), _money(data, "pay_max", "Maximum pay")
    if pay_min is not None and pay_max is not None and pay_min > pay_max:
        raise JobError("Check the details", ["Minimum pay can't be more than maximum pay"])
    pay_period = (_text(data, "pay_period") or ("DAY" if employment_type == "LOCUM" else "MONTH")).upper()
    if pay_period not in PAY_PERIODS:
        raise JobError("Check the details", ["Unknown pay period"])

    starts_on, ends_on = _date(data, "starts_on", "Start date"), _date(data, "ends_on", "End date")
    if employment_type == "LOCUM" and not starts_on:
        raise JobError("Check the details", ["Locum adverts need a start date"])
    if starts_on and ends_on and ends_on < starts_on:
        raise JobError("Check the details", ["End date can't be before the start date"])

    cadre = None
    cadre_id = _text(data, "cadre_id")
    if cadre_id:
        cadre = Cadres.objects.filter(id=cadre_id).first()
        if not cadre:
            raise JobError("Check the details", ["Unknown cadre"])

    requires_license = _bool(data, "requires_license")
    contact_email = _text(data, "contact_email", max_len=254)
    if contact_email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", contact_email):
        raise JobError("Check the details", ["Contact email doesn't look right"])

    values = dict(
        title=title, employment_type=employment_type, vacancies=vacancies, closes=closes, status=status,
        description=_text(data, "description", max_len=8000, label="Description"),
        responsibilities=_text(data, "responsibilities", max_len=6000, label="Responsibilities"),
        requirements=_text(data, "requirements", max_len=6000, label="Requirements"),
        benefits=_text(data, "benefits", max_len=4000, label="Benefits"),
        work_location=_text(data, "work_location", max_len=200, label="Location"),
        pay_min=pay_min, pay_max=pay_max, pay_period=pay_period, show_pay=_bool(data, "show_pay", True),
        starts_on=starts_on, ends_on=ends_on, shift_hours=_text(data, "shift_hours", max_len=120, label="Hours"),
        min_experience_years=_int(data, "min_experience_years", label="Experience"),
        requires_license=requires_license,
        license_body=_text(data, "license_body", max_len=120, label="Licensing body") if requires_license else None,
        contact_email=contact_email, cadre=cadre,
    )

    with transaction.atomic():
        designation = _designation_for(entity, user, data, employment_type, vacancies, cadre)
        if values["cadre"] is None and designation.cadre_id:
            values["cadre"] = designation.cadre
        if advert:
            if advert.filled > vacancies:
                raise JobError("Check the details", [f"{advert.filled} already hired — vacancies can't be fewer"])
            for k, v in values.items():
                setattr(advert, k, v)
            advert.designation = designation
            advert.save()
        else:
            advert = Adverts.objects.create(entity=entity, owner=user, designation=designation, **values)
        _sync_designation(designation)
    return employer_advert_out(Adverts.objects.select_related("entity", "entity__county", "designation", "cadre").get(pk=advert.pk), request=request)


def set_status(user, data, request=None):
    advert = _employer_advert(user, _text(data, "advert_id"))
    status = (_text(data, "status", required=True) or "").upper()
    if status not in ("DRAFT", "OPEN", "PAUSED", "CLOSED", "FILLED"):
        raise JobError("Check the details", ["Unknown status"])
    if status == "OPEN" and advert.closes < _today():
        raise JobError("Closing date passed", ["Move the closing date forward before re-opening this advert"])
    advert.status = status
    advert.save()
    _sync_designation(advert.designation)
    return employer_advert_out(advert, request=request)


def advert_applications(user, data, request=None):
    advert = _employer_advert(user, _text(data, "advert_id"))
    qs = JobApplications.objects.select_related("applicant", "advert", "advert__entity").filter(advert=advert)
    status = _text(data, "status")
    if status:
        qs = qs.filter(status=status.upper())
    else:
        qs = qs.exclude(status="WITHDRAWN")
    return {"advert": employer_advert_out(advert, request=request), "applications": [application_out(a, True, request) for a in qs.order_by("-created")[:500]]}


def update_application(user, data, request=None):
    entity = _employer_entity(user)
    app_id = _text(data, "application_id", required=True, label="Application")
    new_status = (_text(data, "status") or "").upper() or None
    with transaction.atomic():
        app = (
            JobApplications.objects.select_for_update()
            .select_related("advert", "advert__designation", "applicant", "advert__entity")
            .filter(id=app_id, advert__entity=entity).first()
        )
        if not app:
            raise JobError("Not found", ["That application doesn't exist or isn't for your business"])
        old = app.status
        if new_status and new_status != old:
            if new_status not in TRANSITIONS.get(old, set()):
                raise JobError("Not allowed", [f"An application that is {old.lower()} can't move to {new_status.lower()}"])
            if new_status == "INTERVIEW" and not (_datetime(data, "interview_at", "Interview time") or app.interview_at):
                raise JobError("Check the details", ["Set the interview date and time"])
            if new_status == "HIRED":
                advert = Adverts.objects.select_for_update().get(pk=app.advert_id)
                if advert.filled >= advert.vacancies:
                    raise JobError("All positions filled", ["Every vacancy on this advert is already filled — raise the vacancies first"])
                advert.filled += 1
                if advert.filled >= advert.vacancies:
                    advert.status = "FILLED"
                advert.save()
                Designations.objects.filter(pk=advert.designation_id).update(filled_slots=F("filled_slots") + 1)
            app.status = new_status
            app.decided_by = user
        if "employer_notes" in data:
            app.employer_notes = _text(data, "employer_notes", max_len=4000, label="Notes")
        if "interview_at" in data:
            app.interview_at = _datetime(data, "interview_at", "Interview time")
        if "interview_location" in data:
            app.interview_location = _text(data, "interview_location", max_len=200, label="Interview location")
        if "message" in data:
            app.message_to_applicant = _text(data, "message", max_len=2000, label="Message")
        app.save()
        if new_status == "HIRED":
            _sync_designation(app.advert.designation)
    if new_status and new_status != old:
        _tell_applicant(app, new_status)
    return application_out(app, True, request)


def _sync_designation(designation):
    """Keep the designation's advertised / open slot counters in step with its adverts."""
    try:
        d = Designations.objects.get(pk=designation.pk)
        open_ads = Adverts.objects.filter(designation=d, status="OPEN", closes__gte=_today())
        d.advertised_slots = sum(max(0, a.vacancies - a.filled) for a in open_ads)
        if d.total_slots < d.filled_slots + d.advertised_slots:
            d.total_slots = d.filled_slots + d.advertised_slots
        d.save()
    except Exception as e:  # counters are a convenience; never fail the request for them
        log.warning("designation sync failed for %s: %s", getattr(designation, "pk", None), e)


def close_expired():
    """Daily: open adverts past their closing date become CLOSED."""
    today = _today()
    ids = list(Adverts.objects.filter(status="OPEN", closes__lt=today).values_list("id", flat=True))
    if ids:
        Adverts.objects.filter(id__in=ids).update(status="CLOSED", is_active=False)
        for d in Designations.objects.filter(adverts__id__in=ids).distinct():
            _sync_designation(d)
    return len(ids)


# ------------------------------------------------------------------ public (no account)


def public_teaser(data, request=None):
    """What a shared link shows to anyone: enough to want it, not the full advert."""
    code = _text(data, "code", required=True, max_len=12, label="Job code")
    a = Adverts.objects.select_related("entity", "entity__county", "designation", "cadre").filter(share_code=code.upper()).exclude(status="DRAFT").first()
    if not a:
        raise JobError("Not found", ["This job link is no longer valid"])
    return {
        "code": a.share_code,
        "title": a.title,
        "entity": {"title": a.entity.title, "logo": _logo(a, request)},
        "employment_type": a.employment_type,
        "location": _location(a),
        "cadre": a.cadre.title if a.cadre_id else None,
        "closes": a.closes.isoformat(),
        "vacancies": a.vacancies,
        "pay": pay_label(a),
        "excerpt": ((a.description or "")[:160] + ("…" if a.description and len(a.description) > 160 else "")) or None,
        "is_open": _is_open(a),
    }


# ------------------------------------------------------------------ notifications


def _tell_employer_new_application(app):
    from core.notify import notify_entity

    a = app.advert
    name = " ".join(p for p in [app.applicant.first_name, app.applicant.last_name] if p) or app.applicant.email
    notify_entity(
        a.entity,
        f"New application: {a.title}",
        [
            f"{name} applied for {a.title}.",
            f"Experience: {app.years_experience} year(s)" + (f" · Licence {app.license_number}" if app.license_number else ""),
            "Open Jobs → My adverts in WaziPOS to review it.",
        ],
        email=True, push=True, data={"type": "job_application", "advert": str(a.id)},
    )


APPLICANT_MESSAGES = {
    "SUBMITTED": ("Application sent", "Your application for {title} at {entity} was received.", False),
    "SHORTLISTED": ("You've been shortlisted", "Good news — {entity} shortlisted you for {title}.", False),
    "INTERVIEW": ("Interview invitation", "{entity} invited you to interview for {title}{when}{where}.", True),
    "OFFERED": ("Job offer", "{entity} is offering you the {title} position. Open WaziPOS to respond.", True),
    "HIRED": ("You're hired", "Congratulations — {entity} hired you as {title}.", False),
    "REJECTED": ("Application update", "{entity} has moved forward with other candidates for {title}. Keep applying!", False),
}


def _tell_applicant(app, status):
    """Email always; SMS only when the applicant must act (interview, offer)."""
    from core.notify import notify_users

    msg = APPLICANT_MESSAGES.get(status)
    if not msg:
        return
    subject, line, needs_action = msg
    when = f" on {timezone.localtime(app.interview_at).strftime('%a %d %b, %H:%M')}" if app.interview_at else ""
    where = f" at {app.interview_location}" if app.interview_location else ""
    text = line.format(title=app.advert.title, entity=app.advert.entity.title, when=when, where=where)
    lines = [text]
    if app.message_to_applicant:
        lines.append(f"Message from {app.advert.entity.title}: {app.message_to_applicant}")
    notify_users(
        [app.applicant], subject, lines,
        email=True, push=True, sms=needs_action, sms_text=f"WaziPOS Jobs: {text}"[:300],
        data={"type": "job_application", "application": str(app.id)},
    )
