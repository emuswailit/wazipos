# churches/services.py — everything the church screens do (views.py routes actions here).
#
# Who may do what (phase 1):
#   SUPER        the church's owner / super admin: everything, incl. officials and settings
#   PASTOR       register, groups, SMS, announcements, schedule, events, settings
#   SECRETARY    same as PASTOR
#   TREASURER    view the register and dashboard (giving comes in phase 2)
#   WELFARE      view the register and dashboard (welfare comes in phase 3)
#   GROUP_LEADER their own group(s) only: its members, SMS to it, its events / schedule
# Everyone signed in: find churches, open a church page; members see their own family.

import logging
from datetime import date, datetime, timedelta

from django.contrib.gis.geos import Point
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from authentication import models as auth_models
from core.utils import normalize_phone

from .models import (
    Announcements,
    ChurchOfficials,
    ChurchProfiles,
    Events,
    Families,
    Groups,
    MemberEvents,
    Members,
    Messages,
    ScheduleItems,
)

log = logging.getLogger(__name__)

CHURCH_TYPE = "Church"
OFFICE_ORDER = ["SUPER", "PASTOR", "SECRETARY", "TREASURER", "WELFARE", "GROUP_LEADER"]
OFFICE_LABELS = {"SUPER": "Church admin", **dict(ChurchOfficials.OFFICES)}
RUN = {"SUPER", "PASTOR", "SECRETARY"}  # run the register, groups, SMS, notices, programme
VIEW_REGISTER = RUN | {"TREASURER", "WELFARE"}
SMS_MAX_LENGTH = 459  # three SMS parts
DAY_NAMES = dict(ScheduleItems.DAYS)


class ChurchError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = list(errors or [message])


# ------------------------------------------------------------------ helpers

def _s(v):
    return "" if v is None else str(v).strip()


def _date(v, field):
    v = _s(v)
    if not v:
        return None
    try:
        return date.fromisoformat(v[:10])
    except ValueError:
        raise ChurchError("Check the details", [f"{field}: use a date like 2026-12-25"])


def _datetime(v, field):
    v = _s(v)
    if not v:
        return None
    try:
        d = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        raise ChurchError("Check the details", [f"{field}: use a date and time like 2026-12-25T10:00"])
    return d if timezone.is_aware(d) else timezone.make_aware(d)


def _time(v, field):
    v = _s(v)
    if not v:
        return None
    try:
        return datetime.strptime(v[:5], "%H:%M").time()
    except ValueError:
        raise ChurchError("Check the details", [f"{field}: use a time like 09:30"])


def _iso(v):
    return v.isoformat() if v else None


def _age(dob, today=None):
    if not dob:
        return None
    today = today or timezone.localdate()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _phone(v):
    v = _s(v)
    if not v:
        return ""
    n = normalize_phone(v)
    if not n:
        raise ChurchError("Check the details", [f"{v} is not a valid phone number"])
    return n


def _phone_variants(n):
    """Users.phone is not stored in one format everywhere: try the common ones."""
    if not n:
        return []
    tail = n[-9:]
    return list({n, f"+{n}", f"0{tail}", f"254{tail}", f"+254{tail}"})


def _user_for_phone(n):
    if not n:
        return None
    return auth_models.Users.objects.filter(phone__in=_phone_variants(n), is_active=True).first()


def _page(data, default=50, cap=200):
    try:
        size = max(1, min(int(data.get("page_size") or default), cap))
    except (TypeError, ValueError):
        size = default
    try:
        page = max(1, int(data.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    return (page - 1) * size, size, page


def profile_for(church):
    profile, _ = ChurchProfiles.objects.get_or_create(entity=church)
    return profile


def _live(qs, now=None):
    now = now or timezone.now()
    return qs.filter(Q(publish_at__isnull=True) | Q(publish_at__lte=now)).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))


# ------------------------------------------------------------------ access

def office_at(user, church):
    """(office, group ids led) for this user at this church, or (None, []) when they don't help run it."""
    if not user or not user.is_authenticated or not church:
        return None, []
    if church.owner_id == user.pk or user.roles.filter(entity=church, value__endswith="SuperAdmin").exists():
        return "SUPER", []
    rows = list(ChurchOfficials.objects.filter(church=church, user=user, is_active=True))
    if not rows:
        return None, []
    office = min((r.office for r in rows), key=OFFICE_ORDER.index)
    groups = [str(r.group_id) for r in rows if r.office == "GROUP_LEADER" and r.group_id]
    return office, groups


def managed_churches(user):
    """Churches this person helps run (owner / super admin / official)."""
    if not user or not user.is_authenticated:
        return auth_models.Entities.objects.none()
    ids = set(
        auth_models.Entities.objects.filter(entity_type=CHURCH_TYPE).filter(
            Q(owner=user) | Q(pk__in=user.roles.filter(value__endswith="SuperAdmin").values("entity_id"))
        ).values_list("pk", flat=True)
    )
    ids |= set(ChurchOfficials.objects.filter(user=user, is_active=True, church__entity_type=CHURCH_TYPE).values_list("church_id", flat=True))
    return auth_models.Entities.objects.filter(pk__in=ids).order_by("title")


def is_official(user):
    """For the login token: owns a church or holds an active office (shows the Church admin menu),
    whichever business they are signed in to."""
    if auth_models.Entities.objects.filter(owner=user, entity_type=CHURCH_TYPE).exists():
        return True
    return ChurchOfficials.objects.filter(user=user, is_active=True, church__entity_type=CHURCH_TYPE).exists()


class Scope:
    def __init__(self, user, church, office, groups):
        self.user, self.church, self.office, self.groups = user, church, office, groups

    @property
    def runs(self):
        return self.office in RUN

    def need(self, allowed, what="do this"):
        if self.office not in allowed:
            raise ChurchError("Not allowed", [f"Your church role ({OFFICE_LABELS.get(self.office, self.office)}) can't {what}."])

    def need_group(self, group_id, what="do this"):
        """Runners may touch any group; group leaders only their own."""
        if self.runs:
            return
        if self.office == "GROUP_LEADER" and group_id and str(group_id) in self.groups:
            return
        raise ChurchError("Not allowed", [f"You can only {what} for the group you lead."])


def scope_for(user, data):
    """The church being managed: the one asked for, else the business you're signed in to, else your first."""
    churches = list(managed_churches(user))
    if not churches:
        raise ChurchError("Not a church official", ["You don't help run any church on WaziPOS."])
    wanted = _s(data.get("church"))
    church = None
    if wanted:
        church = next((c for c in churches if str(c.pk) == wanted), None)
        if church is None:
            raise ChurchError("Not allowed", ["You don't help run that church."])
    if church is None and user.entity_id:
        church = next((c for c in churches if c.pk == user.entity_id), None)
    church = church or churches[0]
    if getattr(church, "is_active", True) is False:
        raise ChurchError("Church deactivated", [f"{church.title} has been deactivated by WaziPOS. Contact WaziPOS support."])
    office, groups = office_at(user, church)
    return Scope(user, church, office, groups)


def _own(model, scope, pk, what):
    obj = model.objects.filter(pk=_s(pk), church=scope.church).first() if _s(pk) else None
    if obj is None:
        raise ChurchError("Not found", [f"That {what} was not found in {scope.church.title}."])
    return obj


# ------------------------------------------------------------------ shapes

def _church_card(church, profile=None, distance=None, member=False):
    profile = profile or getattr(church, "church_profile", None)
    return {
        "id": str(church.pk),
        "title": church.title,
        "town": church.town or "",
        "road": church.road or "",
        "phone": church.phone or "",
        "denomination": profile.denomination if profile else "",
        "code": profile.code if profile else None,
        "distance_km": round(distance.km, 1) if distance is not None else None,
        "is_member": member,
    }


def _group(g, counts=None):
    return {
        "id": str(g.pk), "name": g.name, "kind": g.kind, "kind_label": dict(Groups.KINDS).get(g.kind, g.kind),
        "description": g.description, "meets": g.meets, "is_active": g.is_active,
        "members": (counts or {}).get(g.pk, getattr(g, "n_members", None)),
        "leaders": [
            {"id": str(o.pk), "user_id": str(o.user_id), "name": _user_name(o.user)}
            for o in g.leaders.filter(is_active=True).select_related("user")
        ],
    }


def _user_name(u):
    if not u:
        return ""
    return f"{u.first_name or ''} {u.last_name or ''}".strip() or (u.phone or u.email or "")


def _member(m, brief=False):
    out = {
        "id": str(m.pk), "family_id": str(m.family_id), "first_name": m.first_name, "last_name": m.last_name,
        "name": m.full_name, "gender": m.gender, "date_of_birth": _iso(m.date_of_birth), "age": _age(m.date_of_birth),
        "role_in_family": m.role_in_family, "role_label": dict(Members.ROLES).get(m.role_in_family, m.role_in_family),
        "status": m.status, "status_label": dict(Members.STATUSES).get(m.status, m.status),
        "phone": m.phone, "has_account": bool(m.user_id),
    }
    if brief:
        return out
    out.update({
        "id_number": m.id_number, "baptised_on": _iso(m.baptised_on), "confirmed_on": _iso(m.confirmed_on),
        "married_on": _iso(m.married_on), "died_on": _iso(m.died_on), "notes": m.notes,
        "origin_family": {"id": str(m.origin_family_id), "name": m.origin_family.name, "number": m.origin_family.number} if m.origin_family_id else None,
        "family_name": m.family.name, "family_number": m.family.number,
        "groups": [{"id": str(g.pk), "name": g.name} for g in m.groups.all()],
    })
    return out


def _family(f, with_members=True):
    out = {
        "id": str(f.pk), "number": f.number, "name": f.name, "area": f.area, "status": f.status,
        "joined_on": _iso(f.joined_on), "notes": f.notes,
        "cell_group": {"id": str(f.cell_group_id), "name": f.cell_group.name} if f.cell_group_id else None,
        "parent_family": {"id": str(f.parent_family_id), "name": f.parent_family.name, "number": f.parent_family.number} if f.parent_family_id else None,
    }
    members = list(f.members.all())  # uses the list's prefetch; sorted below
    order = {"HEAD": 0, "SPOUSE": 1, "CHILD": 2, "DEPENDANT": 3}
    members.sort(key=lambda m: (order.get(m.role_in_family, 9), m.date_of_birth or date.max))
    head = next((m for m in members if m.role_in_family == "HEAD" and m.status != "DECEASED"), None)
    out["head"] = head.full_name if head else ""
    out["phone"] = head.phone if head else ""
    out["size"] = sum(1 for m in members if m.status in ("ACTIVE", "VISITOR"))
    if with_members:
        out["members"] = [_member(m, brief=True) for m in members]
        out["branch_families"] = [{"id": str(b.pk), "name": b.name, "number": b.number} for b in f.branch_families.all()]
    return out


def _announcement(a):
    return {
        "id": str(a.pk), "title": a.title, "body": a.body, "audience": a.audience, "pinned": a.pinned,
        "publish_at": _iso(a.publish_at), "expires_at": _iso(a.expires_at), "created": _iso(a.created),
    }


def _schedule(s):
    return {
        "id": str(s.pk), "day": s.day, "day_label": DAY_NAMES.get(s.day, ""), "starts": s.starts.strftime("%H:%M"),
        "ends": s.ends.strftime("%H:%M") if s.ends else None, "title": s.title, "venue": s.venue, "notes": s.notes,
        "group": {"id": str(s.group_id), "name": s.group.name} if s.group_id else None, "is_active": s.is_active,
    }


def _event(e):
    return {
        "id": str(e.pk), "title": e.title, "starts_at": _iso(e.starts_at), "ends_at": _iso(e.ends_at), "venue": e.venue,
        "description": e.description, "leader": e.leader, "audience": e.audience, "is_cancelled": e.is_cancelled,
        "group": {"id": str(e.group_id), "name": e.group.name} if e.group_id else None,
    }


def _message(m):
    return {
        "id": str(m.pk), "body": m.body, "audience": m.audience, "audience_label": m.audience_label, "recipients": m.recipients,
        "sent": m.sent, "failed": m.failed, "status": m.status, "sent_by": _user_name(m.sent_by), "created": _iso(m.created),
        "finished_at": _iso(m.finished_at),
    }


# ------------------------------------------------------------------ admin: home & settings

def _sms_used(church, now=None):
    now = now or timezone.now()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return Messages.objects.filter(church=church, created__gte=start).exclude(status="FAILED").aggregate(n=Sum("recipients"))["n"] or 0


def admin_home(user, data):
    scope = scope_for(user, data)
    church = scope.church
    profile = profile_for(church)
    members = Members.objects.filter(church=church)
    if scope.office == "GROUP_LEADER":
        members = members.filter(groups__in=scope.groups).distinct()
    by_status = dict(members.values_list("status").annotate(n=Count("pk")))
    today = timezone.localdate()
    now = timezone.now()

    # Birthdays in the next 7 days (active members).
    soon = []
    for m in members.filter(status="ACTIVE", date_of_birth__isnull=False).only("pk", "first_name", "last_name", "date_of_birth", "family_id"):
        try:
            this_year = m.date_of_birth.replace(year=today.year)
        except ValueError:  # 29 Feb
            this_year = date(today.year, 3, 1)
        if this_year < today:
            try:
                this_year = m.date_of_birth.replace(year=today.year + 1)
            except ValueError:
                this_year = date(today.year + 1, 3, 1)
        if (this_year - today).days <= 7:
            soon.append({"id": str(m.pk), "name": m.full_name, "date": this_year.isoformat(), "turns": this_year.year - m.date_of_birth.year})
    soon.sort(key=lambda b: b["date"])

    events = Events.objects.filter(church=church, starts_at__gte=now, starts_at__lte=now + timedelta(days=14), is_cancelled=False).select_related("group")
    return {
        "church": {**_church_card(church, profile), "about": profile.about, "is_listed": profile.is_listed},
        "office": scope.office,
        "office_label": OFFICE_LABELS.get(scope.office, scope.office),
        "my_groups": scope.groups,
        "churches": [{"id": str(c.pk), "title": c.title} for c in managed_churches(user)],
        "counts": {
            "families": Families.objects.filter(church=church, status="ACTIVE").count() if scope.office != "GROUP_LEADER" else None,
            "members": by_status.get("ACTIVE", 0),
            "visitors": by_status.get("VISITOR", 0),
            "groups": Groups.objects.filter(church=church, is_active=True).count(),
            "announcements": _live(Announcements.objects.filter(church=church)).count(),
        },
        "sms": {"used": _sms_used(church), "quota": profile.sms_monthly_quota},
        "birthdays": soon[:20],
        "upcoming": [_event(e) for e in events[:10]],
        "can": {
            "edit_register": scope.runs,
            "view_register": scope.office in VIEW_REGISTER,
            "manage_groups": scope.runs,
            "send_sms": scope.runs or scope.office == "GROUP_LEADER",
            "post": scope.runs or scope.office == "GROUP_LEADER",
            "officials": scope.office == "SUPER",
            "settings": scope.runs,
        },
    }


def save_settings(user, data):
    scope = scope_for(user, data)
    scope.need(RUN, "change the church's details")
    profile = profile_for(scope.church)
    if "denomination" in data:
        profile.denomination = _s(data.get("denomination"))[:120]
    if "about" in data:
        profile.about = _s(data.get("about"))[:4000]
    if "is_listed" in data:
        profile.is_listed = str(data.get("is_listed")).lower() in ("true", "1", "yes")
    profile.save()
    return admin_home(user, {"church": str(scope.church.pk)})["church"]


# ------------------------------------------------------------------ admin: register

def families(user, data):
    scope = scope_for(user, data)
    scope.need(VIEW_REGISTER, "see the family register")
    qs = Families.objects.filter(church=scope.church).select_related("cell_group", "parent_family")
    status = _s(data.get("status")) or "ACTIVE"
    if status != "ALL":
        qs = qs.filter(status=status)
    q = _s(data.get("q"))
    if q:
        qs = qs.filter(
            Q(name__icontains=q) | Q(number__icontains=q) | Q(area__icontains=q)
            | Q(members__first_name__icontains=q) | Q(members__last_name__icontains=q) | Q(members__phone__icontains=q)
        ).distinct()
    if _s(data.get("cell_group")):
        qs = qs.filter(cell_group_id=_s(data.get("cell_group")))
    total = qs.count()
    start, size, page = _page(data)
    rows = qs.order_by("number")[start:start + size].prefetch_related("members", "branch_families")
    return {"families": [_family(f, with_members=False) for f in rows], "total": total, "page": page, "page_size": size}


def family(user, data):
    scope = scope_for(user, data)
    scope.need(VIEW_REGISTER, "see the family register")
    f = _own(Families.objects.select_related("cell_group", "parent_family"), scope, data.get("family_id"), "family")
    return _family(f)


def _next_number(church):
    profile = ChurchProfiles.objects.select_for_update().get(pk=profile_for(church).pk)
    while True:
        profile.family_seq += 1
        number = f"F{profile.family_seq:04d}"
        if not Families.objects.filter(church=church, number=number).exists():
            profile.save(update_fields=["family_seq", "updated"])
            return number


def _member_fields(m, data, scope):
    """Apply the editable member fields from `data` (validated)."""
    errors = []
    if "first_name" in data:
        m.first_name = _s(data.get("first_name"))[:80]
    if not m.first_name:
        errors.append("First name is required")
    if "last_name" in data:
        m.last_name = _s(data.get("last_name"))[:80]
    if "gender" in data:
        g = _s(data.get("gender"))
        if g and g not in dict(Members.GENDERS):
            errors.append("Gender must be Female or Male")
        m.gender = g
    if "role_in_family" in data:
        r = _s(data.get("role_in_family")) or "CHILD"
        if r not in dict(Members.ROLES):
            errors.append("Pick the member's place in the family")
        m.role_in_family = r
    if "status" in data and _s(data.get("status")):
        st = _s(data.get("status"))
        if st not in dict(Members.STATUSES):
            errors.append("Unknown status")
        m.status = st
    for f in ("date_of_birth", "baptised_on", "confirmed_on", "married_on"):
        if f in data:
            setattr(m, f, _date(data.get(f), f.replace("_", " ")))
    if m.date_of_birth and m.date_of_birth > timezone.localdate():
        errors.append("Date of birth can't be in the future")
    if "id_number" in data:
        m.id_number = _s(data.get("id_number"))[:30]
    if "notes" in data:
        m.notes = _s(data.get("notes"))[:2000]
    if "phone" in data:
        try:
            m.phone = _phone(data.get("phone"))
        except ChurchError as e:
            errors.extend(e.errors)
    if errors:
        raise ChurchError("Check the details", errors)
    if m.phone and not m.user_id:
        u = _user_for_phone(m.phone)
        if u:
            m.user = u


def save_family(user, data):
    """New family (with its household head) or edit a family's details."""
    scope = scope_for(user, data)
    scope.need(RUN, "change the family register")
    church = scope.church
    with transaction.atomic():
        if _s(data.get("family_id")):
            f = _own(Families, scope, data.get("family_id"), "family")
            created = False
        else:
            f = Families(church=church, created_by=user, joined_on=timezone.localdate())
            created = True
        if "name" in data or created:
            f.name = _s(data.get("name"))[:160]
        if "area" in data:
            f.area = _s(data.get("area"))[:160]
        if "notes" in data:
            f.notes = _s(data.get("notes"))[:2000]
        if "joined_on" in data:
            f.joined_on = _date(data.get("joined_on"), "joined on") or f.joined_on
        if "status" in data and _s(data.get("status")):
            if _s(data.get("status")) not in dict(Families.STATUSES):
                raise ChurchError("Check the details", ["Unknown family status"])
            f.status = _s(data.get("status"))
        if "cell_group_id" in data:
            gid = _s(data.get("cell_group_id"))
            f.cell_group = _own(Groups, scope, gid, "group") if gid else None
        head_data = data.get("head") if isinstance(data.get("head"), dict) else None
        if created and not head_data:
            raise ChurchError("Check the details", ["Add the household head (father, mother or guardian)."])
        if not f.name and head_data:
            f.name = f"{_s(head_data.get('last_name')) or _s(head_data.get('first_name'))} family".strip()
        if not f.name:
            raise ChurchError("Check the details", ["Give the family a name, e.g. Otieno family"])
        if created:
            f.number = _next_number(church)
        f.save()
        if created:
            head = Members(church=church, family=f, role_in_family="HEAD")
            _member_fields(head, {**head_data, "role_in_family": "HEAD"}, scope)
            head.save()
            MemberEvents.objects.create(member=head, kind="JOINED", date=f.joined_on, details=f"Registered with family {f.number}", recorded_by=user)
    f = Families.objects.select_related("cell_group", "parent_family").get(pk=f.pk)
    return _family(f)


def save_member(user, data):
    scope = scope_for(user, data)
    scope.need(RUN, "change the family register")
    with transaction.atomic():
        if _s(data.get("member_id")):
            m = _own(Members.objects.select_related("family"), scope, data.get("member_id"), "member")
            created = False
            before = {f: getattr(m, f) for f in ("baptised_on", "confirmed_on")}
        else:
            fam = _own(Families, scope, data.get("family_id"), "family")
            m = Members(church=scope.church, family=fam)
            created = True
            before = {}
        _member_fields(m, data, scope)
        if m.role_in_family == "HEAD":
            other = Members.objects.filter(family=m.family, role_in_family="HEAD").exclude(pk=m.pk).exclude(status="DECEASED")
            if other.exists():
                raise ChurchError("Check the details", [f"{other.first().full_name} is already the household head. Make this person Spouse, or change the head first."])
        m.save()
        if created:
            kind = "BIRTH" if m.role_in_family == "CHILD" and m.date_of_birth and _age(m.date_of_birth) is not None and _age(m.date_of_birth) < 1 else "JOINED"
            MemberEvents.objects.create(member=m, kind=kind, date=m.date_of_birth if kind == "BIRTH" else timezone.localdate(), details=f"Added to family {m.family.number}", recorded_by=user)
        for field, kind in (("baptised_on", "BAPTISM"), ("confirmed_on", "CONFIRMATION")):
            if getattr(m, field) and getattr(m, field) != before.get(field):
                MemberEvents.objects.create(member=m, kind=kind, date=getattr(m, field), recorded_by=user)
        if "group_ids" in data and isinstance(data.get("group_ids"), list):
            groups = list(Groups.objects.filter(church=scope.church, pk__in=[_s(g) for g in data["group_ids"] if _s(g)]))
            m.groups.set(groups)
    return member(user, {"church": str(scope.church.pk), "member_id": str(m.pk)})


def member(user, data):
    scope = scope_for(user, data)
    m = _own(Members.objects.select_related("family", "origin_family"), scope, data.get("member_id"), "member")
    if scope.office not in VIEW_REGISTER:
        scope.need_group(next((str(g.pk) for g in m.groups.all() if str(g.pk) in scope.groups), None), "see members")
    out = _member(m)
    out["events"] = [
        {"id": str(e.pk), "kind": e.kind, "kind_label": dict(MemberEvents.KINDS).get(e.kind, e.kind), "date": _iso(e.date), "details": e.details}
        for e in m.events.all()[:50]
    ]
    return out


def members(user, data):
    scope = scope_for(user, data)
    qs = Members.objects.filter(church=scope.church).select_related("family")
    if scope.office not in VIEW_REGISTER:
        if scope.office != "GROUP_LEADER":
            scope.need(VIEW_REGISTER, "see the register")
        qs = qs.filter(groups__in=scope.groups).distinct()
    status = _s(data.get("status")) or "ACTIVE"
    if status != "ALL":
        qs = qs.filter(status=status)
    q = _s(data.get("q"))
    if q:
        qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(phone__icontains=q) | Q(family__name__icontains=q) | Q(family__number__icontains=q))
    if _s(data.get("group_id")):
        if scope.office == "GROUP_LEADER":
            scope.need_group(data.get("group_id"), "see members")
        qs = qs.filter(groups__pk=_s(data.get("group_id")))
    if _s(data.get("family_id")):
        qs = qs.filter(family_id=_s(data.get("family_id")))
    if _s(data.get("gender")):
        qs = qs.filter(gender=_s(data.get("gender")))
    total = qs.count()
    start, size, page = _page(data)
    rows = qs.order_by("first_name", "last_name")[start:start + size]
    out = []
    for m in rows:
        row = _member(m, brief=True)
        row["family_name"], row["family_number"] = m.family.name, m.family.number
        out.append(row)
    return {"members": out, "total": total, "page": page, "page_size": size}


def promote_member(user, data):
    """A child marries: start a new family headed by them, or join their spouse's family.
    The family they grew up in stays on record (origin_family / parent_family)."""
    scope = scope_for(user, data)
    scope.need(RUN, "change the family register")
    mode = _s(data.get("mode")) or "NEW_FAMILY"
    if mode not in ("NEW_FAMILY", "JOIN_FAMILY"):
        raise ChurchError("Check the details", ["Choose: start a new family, or join the spouse's family"])
    married_on = _date(data.get("married_on"), "wedding date")
    with transaction.atomic():
        m = _own(Members.objects.select_for_update().select_related("family"), scope, data.get("member_id"), "member")
        if m.status == "DECEASED":
            raise ChurchError("Check the details", [f"{m.full_name} is recorded as deceased."])
        old = m.family
        if mode == "NEW_FAMILY":
            fam = Families.objects.create(
                church=scope.church, number=_next_number(scope.church),
                name=_s(data.get("family_name"))[:160] or f"{m.last_name or m.first_name} family",
                area=_s(data.get("area"))[:160] or old.area, parent_family=old, joined_on=married_on or timezone.localdate(), created_by=user,
            )
            role = "HEAD"
        else:
            fam = _own(Families, scope, data.get("family_id"), "family")
            if fam.pk == old.pk:
                raise ChurchError("Check the details", ["Pick the spouse's family (not the one they are in now)."])
            role = "SPOUSE" if Members.objects.filter(family=fam, role_in_family="HEAD").exclude(status="DECEASED").exists() else "HEAD"
        m.origin_family = m.origin_family or old
        m.family = fam
        m.role_in_family = role
        if married_on:
            m.married_on = married_on
        m.save()
        if married_on:
            MemberEvents.objects.create(member=m, kind="WEDDING", date=married_on, recorded_by=user)
        MemberEvents.objects.create(
            member=m, kind="PROMOTED", date=married_on or timezone.localdate(),
            details=f"Moved from {old.number} {old.name} to {fam.number} {fam.name} as {dict(Members.ROLES)[role].lower()}", recorded_by=user,
        )
        spouse = data.get("spouse") if isinstance(data.get("spouse"), dict) else None
        if mode == "NEW_FAMILY" and spouse and _s(spouse.get("first_name")):
            s = Members(church=scope.church, family=fam, role_in_family="SPOUSE", married_on=married_on)
            _member_fields(s, {**spouse, "role_in_family": "SPOUSE"}, scope)
            s.save()
            MemberEvents.objects.create(member=s, kind="JOINED", date=married_on or timezone.localdate(), details=f"Joined through marriage to {m.full_name}", recorded_by=user)
            if married_on:
                MemberEvents.objects.create(member=s, kind="WEDDING", date=married_on, recorded_by=user)
    return _family(Families.objects.select_related("cell_group", "parent_family").get(pk=fam.pk))


def set_member_status(user, data):
    """Deceased / transferred out / visitor / active again — with the date, kept in the member's history."""
    scope = scope_for(user, data)
    scope.need(RUN, "change the family register")
    status = _s(data.get("status"))
    if status not in dict(Members.STATUSES):
        raise ChurchError("Check the details", ["Pick a status"])
    on = _date(data.get("date"), "date") or timezone.localdate()
    note = _s(data.get("note"))[:200]
    with transaction.atomic():
        m = _own(Members, scope, data.get("member_id"), "member")
        m.status = status
        if status == "DECEASED":
            m.died_on = on
            kind = "DEATH"
        elif status == "TRANSFERRED":
            kind = "TRANSFER_OUT"
        else:
            kind = "STATUS"
        m.save()
        MemberEvents.objects.create(member=m, kind=kind, date=on, details=note or f"Now {dict(Members.STATUSES)[status].lower()}", recorded_by=user)
    return member(user, {"church": str(scope.church.pk), "member_id": str(m.pk)})


def remove_member(user, data):
    """Delete a member entered by mistake (no history kept). Real departures use SetMemberStatus."""
    scope = scope_for(user, data)
    scope.need(RUN, "change the family register")
    m = _own(Members, scope, data.get("member_id"), "member")
    if m.role_in_family == "HEAD" and Members.objects.filter(family=m.family).exclude(pk=m.pk).exists():
        raise ChurchError("Check the details", ["Make someone else the household head before removing this person."])
    fam = m.family
    m.delete()
    if not fam.members.exists():
        fam.delete()
        return {"removed": True, "family_removed": True}
    return {"removed": True, "family_removed": False}


# ------------------------------------------------------------------ admin: groups

def groups(user, data):
    scope = scope_for(user, data)
    qs = Groups.objects.filter(church=scope.church).annotate(n_members=Count("members", filter=Q(members__status="ACTIVE")))
    if not scope.runs and scope.office not in VIEW_REGISTER:
        qs = qs.filter(pk__in=scope.groups)
    if _s(data.get("active")) != "ALL":
        qs = qs.filter(is_active=True)
    return {"groups": [_group(g) for g in qs.order_by("kind", "name")], "kinds": [{"value": k, "label": v} for k, v in Groups.KINDS]}


def save_group(user, data):
    scope = scope_for(user, data)
    scope.need(RUN, "add or change groups")
    if _s(data.get("group_id")):
        g = _own(Groups, scope, data.get("group_id"), "group")
    else:
        g = Groups(church=scope.church)
    if "name" in data or not g.pk:
        g.name = _s(data.get("name"))[:120]
    if not g.name:
        raise ChurchError("Check the details", ["Give the group a name"])
    if Groups.objects.filter(church=scope.church, name__iexact=g.name).exclude(pk=g.pk).exists():
        raise ChurchError("Check the details", [f"There is already a group called {g.name}"])
    if "kind" in data:
        k = _s(data.get("kind")) or "MINISTRY"
        if k not in dict(Groups.KINDS):
            raise ChurchError("Check the details", ["Pick the kind of group"])
        g.kind = k
    for f, n in (("description", 2000), ("meets", 160)):
        if f in data:
            setattr(g, f, _s(data.get(f))[:n])
    if "is_active" in data:
        g.is_active = str(data.get("is_active")).lower() in ("true", "1", "yes")
    g.save()
    g = Groups.objects.annotate(n_members=Count("members", filter=Q(members__status="ACTIVE"))).get(pk=g.pk)
    return _group(g)


def set_group_members(user, data):
    """Add / remove members of a group (runners, or the group's own leader)."""
    scope = scope_for(user, data)
    g = _own(Groups, scope, data.get("group_id"), "group")
    scope.need_group(g.pk, "change members")
    add = [_s(x) for x in (data.get("add") or []) if _s(x)]
    remove = [_s(x) for x in (data.get("remove") or []) if _s(x)]
    if add:
        g.members.add(*Members.objects.filter(church=scope.church, pk__in=add))
    if remove:
        g.members.remove(*Members.objects.filter(church=scope.church, pk__in=remove))
    g = Groups.objects.annotate(n_members=Count("members", filter=Q(members__status="ACTIVE"))).get(pk=g.pk)
    return _group(g)


# ------------------------------------------------------------------ admin: officials

def officials(user, data):
    scope = scope_for(user, data)
    scope.need({"SUPER"}, "see the church's officials")
    rows = ChurchOfficials.objects.filter(church=scope.church, is_active=True).select_related("user", "group").order_by("office")
    return {
        "officials": [
            {
                "id": str(o.pk), "user_id": str(o.user_id), "name": _user_name(o.user), "phone": o.user.phone or "",
                "office": o.office, "office_label": OFFICE_LABELS.get(o.office, o.office),
                "group": {"id": str(o.group_id), "name": o.group.name} if o.group_id else None, "since": _iso(o.created),
            }
            for o in rows
        ],
        "offices": [{"value": k, "label": v} for k, v in ChurchOfficials.OFFICES],
    }


def save_official(user, data):
    scope = scope_for(user, data)
    scope.need({"SUPER"}, "appoint officials")
    office = _s(data.get("office"))
    if office not in dict(ChurchOfficials.OFFICES):
        raise ChurchError("Check the details", ["Pick the office (pastor, secretary…)"])
    phone = _phone(data.get("phone"))
    if not phone:
        raise ChurchError("Check the details", ["Enter the person's phone number"])
    person = _user_for_phone(phone)
    if person is None:
        raise ChurchError("No WaziPOS account", [f"Nobody with {phone} is on WaziPOS yet. Ask them to sign up (it's free), then add them here."])
    group = None
    if office == "GROUP_LEADER":
        group = _own(Groups, scope, data.get("group_id"), "group")
    row = ChurchOfficials.objects.filter(church=scope.church, user=person, office=office, group=group).first()
    if row:
        row.is_active = True
        row.added_by = user
        row.save(update_fields=["is_active", "added_by", "updated"])
    else:
        ChurchOfficials.objects.create(church=scope.church, user=person, office=office, group=group, added_by=user)
    try:
        from core.notify import notify_users

        notify_users(
            [person], f"You're now {OFFICE_LABELS[office]} at {scope.church.title}",
            [f"{_user_name(user) or 'The church admin'} added you as {OFFICE_LABELS[office]}{f' of {group.name}' if group else ''} at {scope.church.title} on WaziPOS.",
             "Sign out and sign in again to see the Church admin menu."],
            email=True,
        )
    except Exception:  # noqa: BLE001 — a missed notice never blocks the appointment
        log.warning("church official notice failed", exc_info=True)
    return officials(user, {"church": str(scope.church.pk)})


def remove_official(user, data):
    scope = scope_for(user, data)
    scope.need({"SUPER"}, "remove officials")
    row = _own(ChurchOfficials, scope, data.get("official_id"), "official")
    row.is_active = False
    row.save(update_fields=["is_active", "updated"])
    return officials(user, {"church": str(scope.church.pk)})


# ------------------------------------------------------------------ admin: announcements, schedule, events

def announcements(user, data):
    scope = scope_for(user, data)
    qs = Announcements.objects.filter(church=scope.church)
    if _s(data.get("show")) != "ALL":
        qs = _live(qs) | Announcements.objects.filter(church=scope.church, publish_at__gt=timezone.now())
    return {"announcements": [_announcement(a) for a in qs.distinct().order_by("-pinned", "-created")[:200]]}


def save_announcement(user, data):
    scope = scope_for(user, data)
    scope.need(RUN, "post announcements")
    a = _own(Announcements, scope, data.get("announcement_id"), "announcement") if _s(data.get("announcement_id")) else Announcements(church=scope.church, created_by=user)
    for f, n in (("title", 160), ("body", 5000)):
        if f in data or not a.pk:
            setattr(a, f, _s(data.get(f))[:n])
    errors = []
    if not a.title:
        errors.append("Give the announcement a title")
    if not a.body:
        errors.append("Write the announcement")
    if "audience" in data:
        if _s(data.get("audience")) not in dict(Announcements.AUDIENCES):
            errors.append("Pick who sees it")
        a.audience = _s(data.get("audience"))
    if "pinned" in data:
        a.pinned = str(data.get("pinned")).lower() in ("true", "1", "yes")
    if "publish_at" in data:
        a.publish_at = _datetime(data.get("publish_at"), "publish at")
    if "expires_at" in data:
        a.expires_at = _datetime(data.get("expires_at"), "expires at")
    if a.publish_at and a.expires_at and a.expires_at <= a.publish_at:
        errors.append("It must expire after it is published")
    if errors:
        raise ChurchError("Check the details", errors)
    a.save()
    return _announcement(a)


def delete_announcement(user, data):
    scope = scope_for(user, data)
    scope.need(RUN, "remove announcements")
    _own(Announcements, scope, data.get("announcement_id"), "announcement").delete()
    return {"deleted": True}


def schedule(user, data):
    scope = scope_for(user, data)
    qs = ScheduleItems.objects.filter(church=scope.church).select_related("group")
    if _s(data.get("show")) != "ALL":
        qs = qs.filter(is_active=True)
    return {"schedule": [_schedule(s) for s in qs], "days": [{"value": k, "label": v} for k, v in ScheduleItems.DAYS]}


def save_schedule_item(user, data):
    scope = scope_for(user, data)
    s = _own(ScheduleItems, scope, data.get("item_id"), "programme item") if _s(data.get("item_id")) else ScheduleItems(church=scope.church)
    gid = _s(data.get("group_id")) if "group_id" in data else (str(s.group_id) if s.group_id else "")
    scope.need_group(gid or None, "change the weekly programme")
    errors = []
    if "day" in data or not s.pk:
        try:
            s.day = int(data.get("day"))
            if s.day not in DAY_NAMES:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Pick the day")
    if "starts" in data or not s.pk:
        s.starts = _time(data.get("starts"), "starts")
        if not s.starts:
            errors.append("Enter the start time")
    if "ends" in data:
        s.ends = _time(data.get("ends"), "ends")
    if s.starts and s.ends and s.ends <= s.starts:
        errors.append("It must end after it starts")
    for f, n in (("title", 120), ("venue", 120), ("notes", 255)):
        if f in data or not s.pk:
            setattr(s, f, _s(data.get(f))[:n])
    if not s.title:
        errors.append("Name it, e.g. English service")
    if "is_active" in data:
        s.is_active = str(data.get("is_active")).lower() in ("true", "1", "yes")
    if errors:
        raise ChurchError("Check the details", errors)
    s.group = _own(Groups, scope, gid, "group") if gid else None
    s.save()
    return _schedule(s)


def delete_schedule_item(user, data):
    scope = scope_for(user, data)
    s = _own(ScheduleItems, scope, data.get("item_id"), "programme item")
    scope.need_group(str(s.group_id) if s.group_id else None, "change the weekly programme")
    s.delete()
    return {"deleted": True}


def events(user, data):
    scope = scope_for(user, data)
    qs = Events.objects.filter(church=scope.church).select_related("group")
    when = _s(data.get("when")) or "UPCOMING"
    now = timezone.now()
    if when == "UPCOMING":
        qs = qs.filter(Q(starts_at__gte=now - timedelta(hours=6)) | Q(ends_at__gte=now))
    elif when == "PAST":
        qs = qs.filter(starts_at__lt=now).order_by("-starts_at")
    return {"events": [_event(e) for e in qs[:200]]}


def save_event(user, data):
    scope = scope_for(user, data)
    e = _own(Events, scope, data.get("event_id"), "event") if _s(data.get("event_id")) else Events(church=scope.church, created_by=user)
    gid = _s(data.get("group_id")) if "group_id" in data else (str(e.group_id) if e.group_id else "")
    scope.need_group(gid or None, "post events")
    errors = []
    for f, n in (("title", 160), ("venue", 160), ("description", 5000), ("leader", 120)):
        if f in data or not e.pk:
            setattr(e, f, _s(data.get(f))[:n])
    if not e.title:
        errors.append("Give the event a title")
    if "starts_at" in data or not e.pk:
        e.starts_at = _datetime(data.get("starts_at"), "starts")
        if not e.starts_at:
            errors.append("Pick when it starts")
    if "ends_at" in data:
        e.ends_at = _datetime(data.get("ends_at"), "ends")
    if e.starts_at and e.ends_at and e.ends_at <= e.starts_at:
        errors.append("It must end after it starts")
    if "audience" in data:
        if _s(data.get("audience")) not in dict(Events.AUDIENCES):
            errors.append("Pick who sees it")
        e.audience = _s(data.get("audience"))
    if "is_cancelled" in data:
        e.is_cancelled = str(data.get("is_cancelled")).lower() in ("true", "1", "yes")
    if errors:
        raise ChurchError("Check the details", errors)
    e.group = _own(Groups, scope, gid, "group") if gid else None
    e.save()
    return _event(e)


def delete_event(user, data):
    scope = scope_for(user, data)
    e = _own(Events, scope, data.get("event_id"), "event")
    scope.need_group(str(e.group_id) if e.group_id else None, "remove events")
    e.delete()
    return {"deleted": True}


# ------------------------------------------------------------------ admin: SMS

AUDIENCE_KINDS = ("ALL", "HEADS", "GROUP", "FAMILY", "AGE", "GENDER")


def _audience(scope, aud):
    """(members queryset with phones, label) for an audience description."""
    aud = aud if isinstance(aud, dict) else {}
    kind = _s(aud.get("kind")) or "ALL"
    if kind not in AUDIENCE_KINDS:
        raise ChurchError("Check the details", ["Pick who gets the message"])
    qs = Members.objects.filter(church=scope.church, status__in=("ACTIVE", "VISITOR")).exclude(phone="")
    if str(aud.get("include_visitors")).lower() not in ("true", "1", "yes"):
        qs = qs.filter(status="ACTIVE")
    if scope.office == "GROUP_LEADER" and kind != "GROUP":
        raise ChurchError("Not allowed", ["Group leaders can only text their own group."])
    if kind == "ALL":
        label = "All members"
    elif kind == "HEADS":
        qs, label = qs.filter(role_in_family="HEAD"), "Household heads"
    elif kind == "GROUP":
        g = _own(Groups, scope, aud.get("group_id"), "group")
        scope.need_group(g.pk, "text members")
        qs, label = qs.filter(groups=g), g.name
    elif kind == "FAMILY":
        f = _own(Families, scope, aud.get("family_id"), "family")
        qs, label = qs.filter(family=f), f"{f.number} {f.name}"
    elif kind == "GENDER":
        g = _s(aud.get("gender"))
        if g not in dict(Members.GENDERS):
            raise ChurchError("Check the details", ["Pick Female or Male"])
        qs, label = qs.filter(gender=g), "Women" if g == "Female" else "Men"
    else:  # AGE
        today = timezone.localdate()
        try:
            lo = int(aud.get("min_age") or 0)
            hi = int(aud.get("max_age") or 120)
        except (TypeError, ValueError):
            raise ChurchError("Check the details", ["Ages must be whole numbers"])
        if lo > hi:
            raise ChurchError("Check the details", ["The youngest age must be below the oldest"])
        born_after = date(today.year - hi - 1, today.month, min(today.day, 28))
        born_before = date(today.year - lo, today.month, min(today.day, 28))
        qs, label = qs.filter(date_of_birth__gt=born_after, date_of_birth__lte=born_before), f"Aged {lo}–{hi}"
    return qs.distinct(), label


def sms_preview(user, data):
    scope = scope_for(user, data)
    if not (scope.runs or scope.office == "GROUP_LEADER"):
        scope.need(RUN, "send SMS")
    qs, label = _audience(scope, data.get("audience"))
    phones = sorted({normalize_phone(p) or p for p in qs.values_list("phone", flat=True)})
    profile = profile_for(scope.church)
    used = _sms_used(scope.church)
    body = _s(data.get("message"))
    parts = max(1, -(-len(body) // 153)) if len(body) > 160 else 1
    return {
        "label": label, "recipients": len(phones), "without_phone": Members.objects.filter(church=scope.church, status="ACTIVE", phone="").count(),
        "quota": profile.sms_monthly_quota, "used": used, "left": max(0, profile.sms_monthly_quota - used), "parts": parts,
    }


def send_sms(user, data):
    scope = scope_for(user, data)
    if not (scope.runs or scope.office == "GROUP_LEADER"):
        scope.need(RUN, "send SMS")
    body = _s(data.get("message"))
    if not body:
        raise ChurchError("Check the details", ["Write the message"])
    if len(body) > SMS_MAX_LENGTH:
        raise ChurchError("Check the details", [f"Keep it under {SMS_MAX_LENGTH} characters (it is {len(body)})."])
    qs, label = _audience(scope, data.get("audience"))
    phones = sorted({normalize_phone(p) or p for p in qs.values_list("phone", flat=True)})
    if not phones:
        raise ChurchError("Nobody to text", [f"No active member in '{label}' has a phone number."])
    with transaction.atomic():
        profile = ChurchProfiles.objects.select_for_update().get(pk=profile_for(scope.church).pk)
        left = profile.sms_monthly_quota - _sms_used(scope.church)
        if len(phones) > left:
            raise ChurchError(
                "SMS limit reached",
                [f"This message goes to {len(phones)} people but {max(0, left)} SMS are left this month (limit {profile.sms_monthly_quota}). Contact WaziPOS to raise the limit."],
            )
        msg = Messages.objects.create(
            church=scope.church, body=body, audience=data.get("audience") or {"kind": "ALL"}, audience_label=label,
            phones=phones, recipients=len(phones), sent_by=user,
        )

    def _dispatch():
        try:
            from churches.tasks import send_church_message

            send_church_message.delay(str(msg.pk))
        except Exception:  # noqa: BLE001 — no worker / broker: send now
            log.warning("church sms: queue unavailable, sending inline", exc_info=True)
            deliver(str(msg.pk))

    transaction.on_commit(_dispatch)
    return _message(msg)


def deliver(message_id):
    """Send a queued church SMS (Celery task, or inline when no worker is running)."""
    from core.utils import send_bulk_sms

    msg = Messages.objects.filter(pk=message_id, status="QUEUED").first()
    if msg is None:
        return None
    Messages.objects.filter(pk=msg.pk).update(status="SENDING")
    try:
        errors, results = send_bulk_sms(msg.phones, msg.body)
    except Exception as e:  # noqa: BLE001
        log.exception("church sms %s failed", msg.pk)
        errors, results = [str(e)], {}
    sent = len(results or {})
    msg.sent, msg.failed = sent, max(0, msg.recipients - sent)
    msg.errors = list(errors or [])[:100]
    msg.status = "SENT" if msg.failed == 0 else ("PARTIAL" if sent else "FAILED")
    msg.finished_at = timezone.now()
    msg.save(update_fields=["sent", "failed", "errors", "status", "finished_at"])
    return msg.status


def sms_log(user, data):
    scope = scope_for(user, data)
    if not (scope.runs or scope.office == "GROUP_LEADER"):
        scope.need(RUN, "see sent SMS")
    qs = Messages.objects.filter(church=scope.church).select_related("sent_by")
    if scope.office == "GROUP_LEADER":
        qs = qs.filter(sent_by=user)
    profile = profile_for(scope.church)
    return {"messages": [_message(m) for m in qs[:100]], "quota": profile.sms_monthly_quota, "used": _sms_used(scope.church)}


# ------------------------------------------------------------------ everyone: find, church page, my family

def link_memberships(user):
    """Members registered with this person's phone become theirs (they then see their family)."""
    if not user or not user.is_authenticated or not user.phone:
        return
    n = normalize_phone(user.phone)
    if not n:
        return
    Members.objects.filter(user__isnull=True, phone__in=_phone_variants(n)).update(user=user)


def _my_member_rows(user):
    link_memberships(user)
    return Members.objects.filter(user=user).exclude(status__in=("DECEASED", "TRANSFERRED")).select_related("church", "family")


def find_churches(user, data):
    qs = auth_models.Entities.objects.filter(entity_type=CHURCH_TYPE).exclude(is_active=False).exclude(church_profile__is_listed=False)
    q = _s(data.get("q"))
    if q:
        qs = qs.filter(Q(title__icontains=q) | Q(town__icontains=q) | Q(road__icontains=q) | Q(church_profile__denomination__icontains=q))
    here = None
    try:
        lat, lng = float(data.get("latitude")), float(data.get("longitude"))
        if -90 <= lat <= 90 and -180 <= lng <= 180 and (lat or lng):
            here = Point(lng, lat, srid=4326)
    except (TypeError, ValueError):
        pass
    if here is not None:
        from django.contrib.gis.db.models.functions import Distance

        qs = qs.annotate(distance=Distance("locations__point", here)).order_by("distance")
    else:
        qs = qs.order_by("title")
    mine = set(_my_member_rows(user).values_list("church_id", flat=True))
    start, size, page = _page(data, default=30, cap=100)
    rows = list(qs.select_related("church_profile")[start:start + size])
    services = {}
    for s in ScheduleItems.objects.filter(church__in=rows, is_active=True).order_by("day", "starts"):
        services.setdefault(s.church_id, []).append(f"{DAY_NAMES[s.day][:3]} {s.starts.strftime('%H:%M')} {s.title}")
    out = []
    for c in rows:
        card = _church_card(c, getattr(c, "church_profile", None), getattr(c, "distance", None), c.pk in mine)
        card["services"] = services.get(c.pk, [])[:3]
        out.append(card)
    return {"churches": out, "page": page, "page_size": size, "near": here is not None}


def _resolve_church(data):
    cid, code = _s(data.get("church_id")), _s(data.get("code"))
    church = None
    if cid:
        church = auth_models.Entities.objects.filter(pk=cid, entity_type=CHURCH_TYPE).first()
    elif code:
        p = ChurchProfiles.objects.filter(code=code).select_related("entity").first()
        church = p.entity if p else None
    if church is None or getattr(church, "is_active", True) is False:
        raise ChurchError("Not found", ["That church is not on WaziPOS."])
    return church


def _page_payload(church, members_view):
    profile = profile_for(church)
    now = timezone.now()
    ann = _live(Announcements.objects.filter(church=church))
    ev = Events.objects.filter(church=church, is_cancelled=False).filter(Q(starts_at__gte=now - timedelta(hours=6)) | Q(ends_at__gte=now)).select_related("group")
    if not members_view:
        ann, ev = ann.filter(audience="PUBLIC"), ev.filter(audience="PUBLIC")
    return {
        "church": {**_church_card(church, profile), "about": profile.about, "email": church.email or ""},
        "announcements": [_announcement(a) for a in ann.order_by("-pinned", "-created")[:30]],
        "schedule": [_schedule(s) for s in ScheduleItems.objects.filter(church=church, is_active=True).select_related("group")],
        "events": [_event(e) for e in ev[:30]],
    }


def church_page(user, data):
    church = _resolve_church(data)
    profile = profile_for(church)
    office, _groups = office_at(user, church)
    me = _my_member_rows(user).filter(church=church).first()
    if profile.is_listed is False and not (me or office):
        raise ChurchError("Not found", ["That church is not on WaziPOS."])
    out = _page_payload(church, members_view=bool(me or office))
    out["is_member"] = bool(me)
    out["my_family_id"] = str(me.family_id) if me else None
    out["can_manage"] = bool(office)
    out["share_url"] = f"https://wazipos.co.ke/church/{profile.code}"
    return out


def public_church(data):
    """No sign-in: what a shared church link shows (public notices, programme, public events)."""
    church = _resolve_church({"code": data.get("code")})
    profile = profile_for(church)
    if profile.is_listed is False:
        raise ChurchError("Not found", ["That church is not on WaziPOS."])
    out = _page_payload(church, members_view=False)
    out["church"].pop("phone", None)
    return out


def my_churches(user, data):
    rows = list(_my_member_rows(user))
    managed = list(managed_churches(user))
    seen, out = set(), []
    for m in rows:
        if m.church_id in seen:
            continue
        seen.add(m.church_id)
        card = _church_card(m.church, profile_for(m.church), member=True)
        card.update({"family_id": str(m.family_id), "family_name": m.family.name, "family_number": m.family.number, "role_label": dict(Members.ROLES).get(m.role_in_family)})
        out.append(card)
    return {"churches": out, "managed": [{"id": str(c.pk), "title": c.title} for c in managed]}


def my_family(user, data):
    """The signed-in member's own family (names, places in the family, key dates)."""
    rows = _my_member_rows(user)
    if _s(data.get("church_id")):
        rows = rows.filter(church_id=_s(data.get("church_id")))
    me = rows.first()
    if me is None:
        raise ChurchError(
            "Not in a church register",
            ["Your phone number isn't in any church's family register yet. Ask your church secretary to register your family with this number."],
        )
    fam = Families.objects.select_related("cell_group", "parent_family").get(pk=me.family_id)
    out = _family(fam)
    out["church"] = _church_card(me.church, profile_for(me.church), member=True)
    out["me"] = str(me.pk)
    full = {str(m.pk): m for m in fam.members.all()}
    for row in out["members"]:
        m = full.get(row["id"])
        if m:
            row.update({"baptised_on": _iso(m.baptised_on), "confirmed_on": _iso(m.confirmed_on), "married_on": _iso(m.married_on)})
        if row["id"] != str(me.pk):
            row.pop("phone", None)  # other people's numbers stay with the church office
    return out
