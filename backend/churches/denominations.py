# churches/denominations.py — denominations, regions and the admin hierarchy above parishes.
#
#   Organizations -> Divisions -> Entities (authentication app), for churches:
#   Denomination (Organizations, type DENOMINATION; e.g. Free Pentecostal Fellowship in Kenya)
#     -> Region (a Divisions row; called by Organizations.division_label, e.g. "Teso Region")
#        -> Parish (a Church entity: Entities.organization + Entities.division; e.g. Odioi Parish)
#           -> Groups
# In this module and its API a "region" is an authentication.Divisions row.
#
# Every level has admins, appointed only by an admin higher up:
#   WaziPOS admins (is_staff / is_superuser)   create denominations; appoint denomination roles
#   Denomination HEAD / ADMIN                  regions; region admins; parish officials anywhere;
#                                              approve / remove parishes; notices and events
#   Denomination COMMUNICATIONS                notices and events (denomination-wide or a region)
#   Region admin (DivisionAdmins)              their region's parishes: approve join requests,
#                                              appoint / remove parish officials; region notices
#   Parish admin / pastor (services.py)        group leaders of their parish
# A parish asks to join from its settings (request_to_join), naming its region; or head
# office / a region admin registers it directly (create_parish). Whole denominations
# + regions ship as a Django fixture (manage.py loaddata fpfk); parish lists import with
# manage.py load_denomination (import_denomination).

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from authentication import models as auth_models

from authentication.models import Divisions

from .models import Announcements, ChurchOfficials, ChurchProfiles, DenominationAdmins, DivisionAdmins, Events, Families, Members
from .services import (
    CHURCH_TYPE,
    DENOMINATION,
    OFFICE_LABELS,
    PARISH_OFFICES,
    ChurchError,
    _announcement,
    _event,
    _iso,
    _live,
    _phone,
    _s,
    _user_for_phone,
    _user_name,
    appoint,
    fill_announcement,
    fill_event,
    official_rows,
    org_title,
    profile_for,
)

log = logging.getLogger(__name__)

ROLE_LABELS = {"PLATFORM": "WaziPOS admin", "REGION_ADMIN": "Region admin", **dict(DenominationAdmins.ROLES)}
DENOM_RUN = {"PLATFORM", "HEAD", "ADMIN"}            # regions, region admins, parishes, officials
POST = {"PLATFORM", "HEAD", "ADMIN", "COMMUNICATIONS", "REGION_ADMIN"}


# ------------------------------------------------------------------ who

def is_platform_admin(user):
    """WaziPOS staff: is_staff or is_superuser."""
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def denomination_role(user, org):
    if not user or not user.is_authenticated or org is None:
        return None
    row = DenominationAdmins.objects.filter(organization=org, user=user, is_active=True).first()
    if row:
        return row.role
    if org.owner_id == user.pk:
        return "HEAD"
    return None


def region_ids_for(user, org):
    return [str(r) for r in DivisionAdmins.objects.filter(user=user, is_active=True, division__organization=org, division__is_active=True).values_list("division_id", flat=True)]


def is_denomination_admin(user):
    """For the login token: holds a denomination role (shows the Denomination menu)."""
    if DenominationAdmins.objects.filter(user=user, is_active=True, organization__organization_type=DENOMINATION).exists():
        return True
    return auth_models.Organizations.objects.filter(owner=user, organization_type=DENOMINATION).exists()


def is_region_admin(user):
    """For the login token: runs a region (shows the Denomination menu, scoped to the region)."""
    return DivisionAdmins.objects.filter(user=user, is_active=True, division__is_active=True).exists()


def orgs_for(user):
    qs = auth_models.Organizations.objects.filter(organization_type=DENOMINATION)
    if is_platform_admin(user):
        return qs.order_by("title")
    ids = set(DenominationAdmins.objects.filter(user=user, is_active=True).values_list("organization_id", flat=True))
    ids |= set(DivisionAdmins.objects.filter(user=user, is_active=True, division__is_active=True).values_list("division__organization_id", flat=True))
    return qs.filter(Q(pk__in=ids) | Q(owner=user)).order_by("title")


class Scope:
    """What this person runs: the whole denomination (regions=None) or some of its regions."""

    def __init__(self, user, org, role, regions):
        self.user, self.org, self.role, self.regions = user, org, role, regions

    @property
    def whole(self):
        return self.regions is None

    def need(self, roles, what="do this"):
        if self.role not in roles:
            raise ChurchError("Not allowed", [f"Your role ({ROLE_LABELS.get(self.role, self.role)}) can't {what}."])

    def need_region(self, region_id, what="do this"):
        """Denomination-wide roles reach every region; region admins only theirs."""
        if self.whole:
            return
        if region_id and str(region_id) in self.regions:
            return
        raise ChurchError("Not allowed", [f"You can only {what} in the region you run."])

    def parishes(self):
        qs = auth_models.Entities.objects.filter(entity_type=CHURCH_TYPE, organization=self.org)
        return qs if self.whole else qs.filter(division_id__in=self.regions)


def scope_for(user, data):
    orgs = list(orgs_for(user))
    if not orgs:
        raise ChurchError("Not head office", ["You don't run any denomination or region on WaziPOS."])
    want = _s(data.get("organization"))
    org = next((o for o in orgs if str(o.pk) == want), None) if want else orgs[0]
    if org is None:
        raise ChurchError("Not allowed", ["You don't run that denomination."])
    role = denomination_role(user, org)
    if role:
        return Scope(user, org, role, None)
    if is_platform_admin(user):
        return Scope(user, org, "PLATFORM", None)
    regions = region_ids_for(user, org)
    if not regions:
        raise ChurchError("Not allowed", ["You don't run that denomination."])
    return Scope(user, org, "REGION_ADMIN", regions)


def _tell(people, subject, lines):
    try:
        from core.notify import notify_users

        notify_users([p for p in people if p is not None], subject, lines, email=True)
    except Exception:  # noqa: BLE001 - a missed notice never blocks the request
        log.warning("denomination notice failed", exc_info=True)


def _deciders(org, region=None):
    """Who decides on a parish: the region's admins, else head office."""
    people = []
    if region is not None:
        people = [r.user for r in DivisionAdmins.objects.filter(division=region, is_active=True).select_related("user")]
    if not people:
        people = [r.user for r in DenominationAdmins.objects.filter(organization=org, is_active=True, role__in=("HEAD", "ADMIN")).select_related("user")]
        if org.owner_id and all(p.pk != org.owner_id for p in people):
            people.append(org.owner)
    return people


def _region_of(org, region_id, required=False):
    if not region_id:
        if required:
            raise ChurchError("Check the details", ["Pick the region"])
        return None
    region = Divisions.objects.filter(pk=region_id, organization=org, is_active=True).first()
    if region is None:
        raise ChurchError("Check the details", ["Pick a region of this denomination."])
    return region


# ------------------------------------------------------------------ parish side

def _approve(user, church, profile, org):
    church.organization = org
    church.division = profile.requested_division if profile.requested_division_id and profile.requested_division.organization_id == org.pk else None
    church.save(update_fields=["organization", "division"])
    profile.org_request, profile.org_status = org, "APPROVED"
    profile.org_decided_by, profile.org_decided_at = user, timezone.now()


def request_to_join(user, church, profile, org_id, region_id=""):
    """From the parish's settings: ask to join a denomination in a region, or leave it (blank).
    Once approved, only head office moves a parish between regions. The caller saves `profile`."""
    if not org_id:
        if church.organization_id:
            church.organization, church.division = None, None
            church.save(update_fields=["organization", "division"])
        profile.org_request, profile.org_status, profile.org_note, profile.requested_division = None, "NONE", "", None
        return
    org = auth_models.Organizations.objects.filter(pk=org_id, organization_type=DENOMINATION).first()
    if org is None:
        raise ChurchError("Check the details", ["Pick a denomination from the list."])
    has_regions = Divisions.objects.filter(organization=org, is_active=True).exists()
    region = _region_of(org, region_id, required=has_regions)
    if church.organization_id == org.pk:
        if region is not None and region.pk != church.division_id:
            raise ChurchError("Ask head office", ["Your parish is already approved. Head office moves parishes between regions."])
        return
    profile.org_request, profile.org_note, profile.requested_division = org, "", region
    if is_platform_admin(user) or denomination_role(user, org) in ("HEAD", "ADMIN"):
        _approve(user, church, profile, org)
        return
    profile.org_status = "PENDING"
    if church.organization_id:  # leaving another denomination while asking to join this one
        church.organization, church.division = None, None
        church.save(update_fields=["organization", "division"])
    where = f" in {region.name}" if region else ""
    _tell(_deciders(org, region), f"{church.title} asks to join {org_title(org)}", [
        f"{church.title}{f' ({church.town})' if church.town else ''} asked to be listed as a parish of {org_title(org)}{where} on WaziPOS.",
        "Approve or decline it in Denomination -> Parishes -> Requests.",
    ])


def denominations(user, data):
    """Denominations for pickers (parish settings, Find a church) with their parish counts."""
    qs = auth_models.Organizations.objects.filter(organization_type=DENOMINATION)
    q = _s(data.get("q"))
    if q:
        qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))
    qs = qs.annotate(n_parishes=Count("entity_organization", filter=Q(entity_organization__entity_type=CHURCH_TYPE))).order_by("title")
    return {"denominations": [{"id": str(o.pk), "title": org_title(o), "description": o.description or "", "parishes": o.n_parishes} for o in qs[:300]]}


def public_regions(user, data):
    """A denomination's regions, for the parish's region picker."""
    org = auth_models.Organizations.objects.filter(pk=_s(data.get("organization_id")), organization_type=DENOMINATION).first()
    if org is None:
        raise ChurchError("Not found", ["That denomination was not found."])
    return {"regions": [{"id": str(r.pk), "name": r.name} for r in Divisions.objects.filter(organization=org, is_active=True)], "label": org.division_label}


# ------------------------------------------------------------------ overview

def _counts(church_ids):
    members = dict(Members.objects.filter(church_id__in=church_ids, status="ACTIVE").values_list("church_id").annotate(n=Count("pk")))
    families = dict(Families.objects.filter(church_id__in=church_ids, status="ACTIVE").values_list("church_id").annotate(n=Count("pk")))
    return members, families


def _div(c):
    """An approved parish's division, else the one its pending request asked for."""
    if c.division_id:
        return c.division
    p = getattr(c, "church_profile", None)
    return p.requested_division if p and p.requested_division_id else None


def _parish(c, members, families):
    p = getattr(c, "church_profile", None)
    owner = c.owner if c.owner_id else None
    return {
        "id": str(c.pk), "title": c.title, "town": c.town or "", "phone": c.phone or "",
        "region": {"id": str(_div(c).pk), "name": _div(c).name} if _div(c) else None,
        "members": members.get(c.pk, 0), "families": families.get(c.pk, 0),
        "admin": _user_name(owner), "admin_phone": (owner.phone or "") if owner else "",
        "org_status": p.org_status if p else "NONE", "org_note": p.org_note if p else "", "updated": _iso(p.updated) if p else None,
        "is_active": getattr(c, "is_active", True) is not False,
    }


def _region_row(r, parishes=0, members=0, families=0):
    return {
        "id": str(r.pk), "name": r.name, "description": r.description, "is_active": r.is_active,
        "parishes": parishes, "members": members, "families": families,
        "admins": [
            {"id": str(a.pk), "user_id": str(a.user_id), "name": _user_name(a.user), "phone": a.user.phone or "", "since": _iso(a.created)}
            for a in r.church_admins.filter(is_active=True).select_related("user")
        ],
    }


def _pending(scope):
    qs = ChurchProfiles.objects.filter(org_request=scope.org, org_status="PENDING")
    return qs if scope.whole else qs.filter(requested_division_id__in=scope.regions)


def home(user, data):
    scope = scope_for(user, data)
    org = scope.org
    parishes = list(scope.parishes())
    members, families = _counts([c.pk for c in parishes])
    by_region = {}
    for c in parishes:
        key = str(c.division_id) if c.division_id else ""
        x = by_region.setdefault(key, {"parishes": 0, "members": 0, "families": 0})
        x["parishes"] += 1
        x["members"] += members.get(c.pk, 0)
        x["families"] += families.get(c.pk, 0)
    regions_qs = Divisions.objects.filter(organization=org)
    if not scope.whole:
        regions_qs = regions_qs.filter(pk__in=scope.regions)
    regions = [_region_row(r, **by_region.get(str(r.pk), {})) for r in regions_qs]
    if scope.whole and "" in by_region:
        regions.append({"id": "", "name": "No region set", "description": "", "is_active": True, "admins": [], **by_region[""]})
    now = timezone.now()
    ev = Events.objects.filter(organization=org, starts_at__gte=now, is_cancelled=False).select_related("group", "organization", "division")
    if not scope.whole:
        ev = ev.filter(Q(division__isnull=True) | Q(division_id__in=scope.regions))
    notices = _live(Announcements.objects.filter(organization=org))
    if not scope.whole:
        notices = notices.filter(division_id__in=scope.regions)
    return {
        "organization": {"id": str(org.pk), "title": org_title(org), "description": org.description or "", "email": org.email or ""},
        "role": scope.role,
        "role_label": ROLE_LABELS.get(scope.role, scope.role),
        "division_label": org.division_label,
        "level": "DENOMINATION" if scope.whole else "REGION",
        "my_regions": [] if scope.whole else [{"id": r["id"], "name": r["name"]} for r in regions],
        "organizations": [{"id": str(o.pk), "title": org_title(o)} for o in orgs_for(user)],
        "counts": {
            "parishes": len(parishes), "pending": _pending(scope).count(),
            "members": sum(members.values()), "families": sum(families.values()),
            "regions": regions_qs.filter(is_active=True).count(), "notices": notices.count(),
        },
        "regions": sorted(regions, key=lambda r: (r["id"] == "", -r["members"], r["name"])),
        "upcoming": [_event(e) for e in ev[:10]],
        "can": {
            "manage_regions": scope.role in DENOM_RUN,
            "decide_parishes": scope.role in DENOM_RUN or scope.role == "REGION_ADMIN",
            "appoint_officials": scope.role in DENOM_RUN or scope.role == "REGION_ADMIN",
            "move_parishes": scope.role in DENOM_RUN,
            "post": scope.role in POST,
            "denomination_roles": scope.role == "PLATFORM",
        },
    }


# ------------------------------------------------------------------ regions

def regions(user, data):
    scope = scope_for(user, data)
    qs = Divisions.objects.filter(organization=scope.org)
    if not scope.whole:
        qs = qs.filter(pk__in=scope.regions)
    parishes = list(scope.parishes())
    members, families = _counts([c.pk for c in parishes])
    agg = {}
    for c in parishes:
        x = agg.setdefault(str(c.division_id) if c.division_id else "", {"parishes": 0, "members": 0, "families": 0})
        x["parishes"] += 1
        x["members"] += members.get(c.pk, 0)
        x["families"] += families.get(c.pk, 0)
    return {"regions": [_region_row(r, **agg.get(str(r.pk), {})) for r in qs]}


def save_region(user, data):
    scope = scope_for(user, data)
    scope.need(DENOM_RUN, "add or change regions")
    name = _s(data.get("name"))[:120]
    if not name:
        raise ChurchError("Check the details", ["Name the region, e.g. Nairobi Region"])
    r = Divisions.objects.filter(pk=_s(data.get("region_id")), organization=scope.org).first() if _s(data.get("region_id")) else Divisions(organization=scope.org)
    if r is None:
        raise ChurchError("Not found", ["That region was not found."])
    if Divisions.objects.filter(organization=scope.org, name__iexact=name).exclude(pk=r.pk).exists():
        raise ChurchError("Check the details", [f"There is already a region called {name}."])
    r.name = name
    if "description" in data:
        r.description = _s(data.get("description"))[:255]
    if "code" in data:
        r.code = _s(data.get("code"))[:20].upper()
    if "is_active" in data:
        r.is_active = str(data.get("is_active")).lower() in ("true", "1", "yes")
    r.save()
    return _region_row(r)


def save_region_admin(user, data):
    """Head office appoints a region admin (by WaziPOS phone)."""
    scope = scope_for(user, data)
    scope.need(DENOM_RUN, "appoint region admins")
    region = _region_of(scope.org, _s(data.get("region_id")), required=True)
    phone = _phone(data.get("phone"))
    person = _user_for_phone(phone) if phone else None
    if person is None:
        raise ChurchError("No WaziPOS account", [f"Nobody with {phone or 'that number'} is on WaziPOS yet. Ask them to sign up (free), then add them."])
    row, _ = DivisionAdmins.objects.get_or_create(division=region, user=person, defaults={"added_by": user})
    row.is_active, row.added_by = True, user
    row.save()
    _tell([person], f"You're now admin of {region.name}, {org_title(scope.org)}", [
        f"You were made region admin of {region.name} in {org_title(scope.org)} on WaziPOS.",
        "You approve parishes joining the region and appoint their officials. Sign out and sign in again to see the Denomination menu.",
    ])
    return _region_row(region)


def remove_region_admin(user, data):
    scope = scope_for(user, data)
    scope.need(DENOM_RUN, "remove region admins")
    row = DivisionAdmins.objects.filter(pk=_s(data.get("admin_id")), division__organization=scope.org, is_active=True).select_related("division").first()
    if row is None:
        raise ChurchError("Not found", ["That region admin was not found."])
    row.is_active = False
    row.save(update_fields=["is_active", "updated"])
    return _region_row(row.division)


# ------------------------------------------------------------------ parishes

def parishes(user, data):
    scope = scope_for(user, data)
    status = _s(data.get("status")) or "APPROVED"
    if status == "APPROVED":
        qs = scope.parishes()
    elif status in ("PENDING", "REJECTED"):
        qs = auth_models.Entities.objects.filter(entity_type=CHURCH_TYPE, church_profile__org_request=scope.org, church_profile__org_status=status)
        if not scope.whole:
            qs = qs.filter(church_profile__requested_division_id__in=scope.regions)
    else:
        raise ChurchError("Check the details", ["Unknown status"])
    q = _s(data.get("q"))
    if q:
        qs = qs.filter(Q(title__icontains=q) | Q(town__icontains=q) | Q(division__name__icontains=q) | Q(church_profile__requested_division__name__icontains=q))
    region_id = _s(data.get("region_id"))
    if status == "APPROVED":
        if region_id == "NONE":
            qs = qs.filter(division__isnull=True)
        elif region_id:
            qs = qs.filter(division_id=region_id)
    elif region_id == "NONE":
        qs = qs.filter(church_profile__requested_division__isnull=True)
    elif region_id:
        qs = qs.filter(church_profile__requested_division_id=region_id)
    rows = list(qs.select_related("church_profile", "church_profile__requested_division", "division", "owner").order_by("title")[:500])
    members, families = _counts([c.pk for c in rows])
    return {"parishes": [_parish(c, members, families) for c in rows]}


def _parish_in_scope(scope, church_id, what):
    church = auth_models.Entities.objects.filter(pk=_s(church_id), entity_type=CHURCH_TYPE).select_related("owner").first()
    if church is None:
        raise ChurchError("Not found", ["That parish was not found."])
    profile = profile_for(church)
    if church.organization_id != scope.org.pk and profile.org_request_id != scope.org.pk:
        raise ChurchError("Not found", ["That parish is not part of this denomination."])
    scope.need_region(church.division_id or profile.requested_division_id, what)
    return church, profile


def decide_parish(user, data):
    """APPROVE / REJECT a parish's request to join, or REMOVE an approved parish.
    Region admins decide for their region; head office for any (and may set the region)."""
    scope = scope_for(user, data)
    if scope.role not in DENOM_RUN and scope.role != "REGION_ADMIN":
        scope.need(DENOM_RUN, "decide on parishes")
    decision = _s(data.get("decision")).upper()
    if decision not in ("APPROVE", "REJECT", "REMOVE"):
        raise ChurchError("Check the details", ["Choose approve, decline or remove"])
    church, profile = _parish_in_scope(scope, data.get("church"), "decide on parishes")
    note = _s(data.get("note"))[:255]
    with transaction.atomic():
        if "region_id" in data and scope.whole:
            profile.requested_division = _region_of(scope.org, _s(data.get("region_id")))
        if decision == "REMOVE":
            if church.organization_id != scope.org.pk:
                raise ChurchError("Check the details", ["That parish is not part of this denomination."])
            church.organization, church.division = None, None
            church.save(update_fields=["organization", "division"])
            profile.org_status, profile.org_note = "REJECTED", note or "Removed"
        else:
            if profile.org_request_id != scope.org.pk or profile.org_status not in ("PENDING", "REJECTED"):
                raise ChurchError("Check the details", ["That parish has not asked to join this denomination."])
            if decision == "APPROVE":
                _approve(user, church, profile, scope.org)
                profile.org_note = note
            else:
                profile.org_status, profile.org_note = "REJECTED", note
        profile.org_decided_by, profile.org_decided_at = user, timezone.now()
        profile.save()
    verb = {"APPROVE": "is now a parish of", "REJECT": "was not accepted by", "REMOVE": "was removed from"}[decision]
    _tell([church.owner] if church.owner_id else [], f"{church.title} {verb} {org_title(scope.org)}",
          [f"{church.title} {verb} {org_title(scope.org)} on WaziPOS."] + ([f"Note: {note}"] if note else []))
    church.church_profile = profile
    members, families = _counts([church.pk])
    return _parish(church, members, families)


def move_parish(user, data):
    """Head office puts a parish in a region (or none)."""
    scope = scope_for(user, data)
    scope.need(DENOM_RUN, "move parishes between regions")
    church, profile = _parish_in_scope(scope, data.get("church"), "move parishes")
    region = _region_of(scope.org, _s(data.get("region_id")))
    church.division = region
    church.save(update_fields=["division"])
    profile.requested_division = region
    profile.save(update_fields=["requested_division", "updated"])
    church.church_profile = profile
    members, families = _counts([church.pk])
    return _parish(church, members, families)


def parish_officials(user, data):
    scope = scope_for(user, data)
    church, _profile = _parish_in_scope(scope, data.get("church"), "see parish officials")
    can = scope.role in DENOM_RUN or scope.role == "REGION_ADMIN"
    return {
        "parish": {"id": str(church.pk), "title": church.title},
        "officials": official_rows(church),
        "offices": [{"value": o, "label": OFFICE_LABELS[o]} for o in PARISH_OFFICES] if can else [],
        "can_appoint": can,
    }


def appoint_parish_official(user, data):
    """Region admin (their region) or head office appoints a parish office: admin, pastor, secretary…
    Group leaders are appointed inside the parish by its admin / pastor."""
    scope = scope_for(user, data)
    if scope.role not in DENOM_RUN and scope.role != "REGION_ADMIN":
        scope.need(DENOM_RUN, "appoint parish officials")
    church, _profile = _parish_in_scope(scope, data.get("church"), "appoint parish officials")
    if church.organization_id != scope.org.pk:
        raise ChurchError("Check the details", ["Approve the parish first."])
    office = _s(data.get("office"))
    if office not in PARISH_OFFICES:
        raise ChurchError("Check the details", ["Pick a parish office (group leaders are appointed by the parish)."])
    appoint(user, church, data.get("phone"), office)
    return parish_officials(user, {**data, "organization": str(scope.org.pk)})


def remove_parish_official(user, data):
    scope = scope_for(user, data)
    if scope.role not in DENOM_RUN and scope.role != "REGION_ADMIN":
        scope.need(DENOM_RUN, "remove parish officials")
    church, _profile = _parish_in_scope(scope, data.get("church"), "remove parish officials")
    row = ChurchOfficials.objects.filter(pk=_s(data.get("official_id")), church=church, is_active=True).first()
    if row is None:
        raise ChurchError("Not found", ["That official was not found."])
    row.is_active = False
    row.save(update_fields=["is_active", "updated"])
    return parish_officials(user, {**data, "organization": str(scope.org.pk)})


# ------------------------------------------------------------------ notices and events

def _target_region(scope, data):
    """Denomination roles post to everyone or one region; region admins to their region."""
    region_id = _s(data.get("region_id"))
    if scope.whole:
        return _region_of(scope.org, region_id) if region_id else None
    if not region_id and len(scope.regions) == 1:
        region_id = scope.regions[0]
    scope.need_region(region_id, "post")
    return _region_of(scope.org, region_id, required=True)


def _own(model, scope, pk, what):
    obj = model.objects.filter(pk=_s(pk), organization=scope.org).first() if _s(pk) else None
    if obj is None:
        raise ChurchError("Not found", [f"That {what} was not found."])
    if not scope.whole:
        scope.need_region(obj.division_id, f"change this {what}")
    return obj


def _scoped(qs, scope):
    return qs if scope.whole else qs.filter(division_id__in=scope.regions)


def announcements(user, data):
    scope = scope_for(user, data)
    base = _scoped(Announcements.objects.filter(organization=scope.org), scope)
    qs = base if _s(data.get("show")) == "ALL" else (_live(base) | base.filter(publish_at__gt=timezone.now()))
    return {"announcements": [_announcement(a) for a in qs.distinct().select_related("organization", "division").order_by("-pinned", "-created")[:200]]}


def save_announcement(user, data):
    scope = scope_for(user, data)
    scope.need(POST, "post notices")
    if _s(data.get("announcement_id")):
        a = _own(Announcements, scope, data.get("announcement_id"), "notice")
    else:
        a = Announcements(organization=scope.org, created_by=user)
    if "region_id" in data or not a.pk:
        a.division = _target_region(scope, data)
    fill_announcement(a, data)
    a.save()
    return _announcement(a)


def delete_announcement(user, data):
    scope = scope_for(user, data)
    scope.need(POST, "remove notices")
    _own(Announcements, scope, data.get("announcement_id"), "notice").delete()
    return {"deleted": True}


def events(user, data):
    scope = scope_for(user, data)
    qs = _scoped(Events.objects.filter(organization=scope.org), scope).select_related("group", "organization", "division")
    now = timezone.now()
    if (_s(data.get("when")) or "UPCOMING") == "UPCOMING":
        qs = qs.filter(Q(starts_at__gte=now - timedelta(hours=6)) | Q(ends_at__gte=now))
    else:
        qs = qs.filter(starts_at__lt=now).order_by("-starts_at")
    return {"events": [_event(e) for e in qs[:200]]}


def save_event(user, data):
    scope = scope_for(user, data)
    scope.need(POST, "post events")
    if _s(data.get("event_id")):
        e = _own(Events, scope, data.get("event_id"), "event")
    else:
        e = Events(organization=scope.org, created_by=user)
    if "region_id" in data or not e.pk:
        e.division = _target_region(scope, data)
    fill_event(e, data)
    e.save()
    return _event(e)


def delete_event(user, data):
    scope = scope_for(user, data)
    scope.need(POST, "remove events")
    _own(Events, scope, data.get("event_id"), "event").delete()
    return {"deleted": True}


# ------------------------------------------------------------------ denomination roles (WaziPOS admins)

def admins(user, data):
    scope = scope_for(user, data)
    rows = DenominationAdmins.objects.filter(organization=scope.org, is_active=True).select_related("user").order_by("role")
    return {
        "admins": [
            {"id": str(r.pk), "user_id": str(r.user_id), "name": _user_name(r.user), "phone": r.user.phone or "", "role": r.role, "role_label": ROLE_LABELS[r.role], "since": _iso(r.created)}
            for r in rows
        ],
        "roles": [{"value": k, "label": v} for k, v in DenominationAdmins.ROLES],
        "can_manage": scope.role == "PLATFORM" or is_platform_admin(user),
    }


def _need_platform(user):
    if not is_platform_admin(user):
        raise ChurchError("Not allowed", ["Denomination roles are appointed by WaziPOS admins."])


def save_admin(user, data):
    """WaziPOS admins appoint a denomination's head / admins / communications."""
    _need_platform(user)
    scope = scope_for(user, data)
    role = _s(data.get("role")) or "ADMIN"
    if role not in dict(DenominationAdmins.ROLES):
        raise ChurchError("Check the details", ["Pick the role"])
    phone = _phone(data.get("phone"))
    person = _user_for_phone(phone) if phone else None
    if person is None:
        raise ChurchError("No WaziPOS account", [f"Nobody with {phone or 'that number'} is on WaziPOS yet. Ask them to sign up (free), then add them."])
    row, _ = DenominationAdmins.objects.get_or_create(organization=scope.org, user=person, defaults={"role": role, "added_by": user})
    row.role, row.is_active, row.added_by = role, True, user
    row.save()
    _tell([person], f"You're now {ROLE_LABELS[role]} for {org_title(scope.org)}", [
        f"You were added as {ROLE_LABELS[role]} of {org_title(scope.org)} on WaziPOS.",
        "Sign out and sign in again to see the Denomination menu.",
    ])
    return admins(user, {"organization": str(scope.org.pk)})


def remove_admin(user, data):
    _need_platform(user)
    scope = scope_for(user, data)
    row = DenominationAdmins.objects.filter(pk=_s(data.get("admin_id")), organization=scope.org, is_active=True).first()
    if row is None:
        raise ChurchError("Not found", ["That admin was not found."])
    row.is_active = False
    row.save(update_fields=["is_active", "updated"])
    return admins(user, {"organization": str(scope.org.pk)})


# ------------------------------------------------------------------ WaziPOS admins: the desk

def desk(user, data):
    """All denominations, with parish and region counts, heads and pending join requests."""
    _need_platform(user)
    rows = denominations(user, data)["denominations"]
    heads = {}
    for r in DenominationAdmins.objects.filter(is_active=True, role="HEAD").select_related("user"):
        heads.setdefault(str(r.organization_id), []).append(_user_name(r.user))
    pending = {str(k): n for k, n in ChurchProfiles.objects.filter(org_status="PENDING").values_list("org_request_id").annotate(n=Count("pk"))}
    nregions = {str(k): n for k, n in Divisions.objects.filter(is_active=True).values_list("organization_id").annotate(n=Count("pk"))}
    for d in rows:
        d["heads"] = heads.get(d["id"], [])
        d["pending"] = pending.get(d["id"], 0)
        d["regions"] = nregions.get(d["id"], 0)
    return {"denominations": rows}


def desk_save(user, data):
    """Create or rename a denomination; optionally appoint its head by phone."""
    _need_platform(user)
    title = _s(data.get("title"))[:256]
    if not title:
        raise ChurchError("Check the details", ["Enter the name, e.g. Free Pentecostal Fellowship in Kenya"])
    org = None
    if _s(data.get("organization_id")):
        org = auth_models.Organizations.objects.filter(pk=_s(data.get("organization_id")), organization_type=DENOMINATION).first()
        if org is None:
            raise ChurchError("Not found", ["That denomination was not found."])
    clash = auth_models.Organizations.objects.filter(organization_type=DENOMINATION, title=title.upper())
    if org is not None:
        clash = clash.exclude(pk=org.pk)
    if clash.exists():
        raise ChurchError("Check the details", [f"{title} is already on WaziPOS."])
    with transaction.atomic():
        org = org or auth_models.Organizations(organization_type=DENOMINATION)
        org.title = title  # upper-cased by Organizations.save()
        if "description" in data:
            org.description = _s(data.get("description"))[:256] or None
        if "email" in data:
            org.email = _s(data.get("email"))[:256] or None
        org.save()
        if _s(data.get("head_phone")):
            save_admin(user, {"organization": str(org.pk), "phone": data.get("head_phone"), "role": "HEAD"})
    return next(d for d in desk(user, {})["denominations"] if d["id"] == str(org.pk))


# ------------------------------------------------------------------ parishes registered from above

PARISH_OWNERSHIP = "FAITH-BASED ORGANIZATION"


def _new_parish(org, region, title, town="", road="", phone="", email="", latitude=None, longitude=None, by=None):
    """Create a parish (Church entity) that belongs to the denomination from the start.
    No owner: its parish admin is appointed from above (no automatic super admin)."""
    from django.contrib.gis.geos import Point
    from entitylocations.models import Locations

    try:
        lat, lng = float(latitude), float(longitude)
        if not (-90 <= lat <= 90 and -180 <= lng <= 180) or (lat == 0 and lng == 0):
            raise ValueError
    except (TypeError, ValueError):
        raise ChurchError("Check the details", [f"{title}: pin the parish on the map (GPS location is required)."])
    church = auth_models.Entities.objects.create(
        title=title, entity_type=CHURCH_TYPE, entity_ownership=PARISH_OWNERSHIP, organization=org, division=region,
        town=town or None, road=road or None, phone=phone or None, email=email or None,
    )
    Locations.objects.create(entity=church, point=Point(lng, lat, srid=4326), farness="")
    profile = profile_for(church)
    profile.requested_division, profile.org_request, profile.org_status = region, org, "APPROVED"
    profile.org_decided_by, profile.org_decided_at = by, timezone.now()
    profile.save()
    return church


def create_parish(user, data):
    """Head office (any region) or a region admin (their region) registers a parish.
    Optionally appoints its parish admin by WaziPOS phone."""
    scope = scope_for(user, data)
    if scope.role not in DENOM_RUN and scope.role != "REGION_ADMIN":
        scope.need(DENOM_RUN, "register parishes")
    title = _s(data.get("title"))[:256]
    if not title:
        raise ChurchError("Check the details", ["Name the parish, e.g. FPFK Kayole"])
    has_regions = Divisions.objects.filter(organization=scope.org, is_active=True).exists()
    region = _region_of(scope.org, _s(data.get("region_id")), required=has_regions or not scope.whole)
    scope.need_region(region.pk if region else None, "register parishes")
    if auth_models.Entities.objects.filter(entity_type=CHURCH_TYPE, organization=scope.org, title=title.upper()).exists():
        raise ChurchError("Check the details", [f"{title} is already a parish of {org_title(scope.org)}."])
    admin_phone = _s(data.get("admin_phone"))
    with transaction.atomic():
        church = _new_parish(
            scope.org, region, title, _s(data.get("town"))[:256], _s(data.get("road"))[:256],
            _phone(data.get("phone")) if _s(data.get("phone")) else "", _s(data.get("email"))[:256],
            data.get("latitude"), data.get("longitude"), by=user,
        )
        if admin_phone:
            appoint(user, church, admin_phone, "ADMIN")
    church = auth_models.Entities.objects.select_related("church_profile", "division", "owner").get(pk=church.pk)
    members, families = _counts([church.pk])
    return _parish(church, members, families)


def import_denomination(spec, by=None):
    """Create / update a denomination with its regions and parishes from a dict
    (format: churches/management/commands/load_denomination.py). Safe to run again: matches by name.
    Returns a summary {denomination, regions_created, parishes_created, skipped: [...]}."""
    title = _s(spec.get("title"))
    if not title:
        raise ChurchError("Check the details", ["The file needs a denomination title"])
    out = {"denomination": title, "regions_created": 0, "parishes_created": 0, "parishes_existing": 0, "skipped": []}
    with transaction.atomic():
        org = auth_models.Organizations.objects.filter(organization_type=DENOMINATION, title=title.upper()).first()
        if org is None:
            org = auth_models.Organizations(organization_type=DENOMINATION, title=title)
        org.description = _s(spec.get("description"))[:256] or org.description
        org.email = _s(spec.get("email"))[:256] or org.email
        org.save()
        regions = {}
        for r in spec.get("regions") or []:
            name = _s(r.get("name") if isinstance(r, dict) else r)[:120]
            if not name:
                continue
            region = Divisions.objects.filter(organization=org, name__iexact=name).first()
            if region is None:
                region = Divisions.objects.create(organization=org, name=name, description=_s(r.get("description") if isinstance(r, dict) else "")[:255])
                out["regions_created"] += 1
            regions[name.lower()] = region
        for p in spec.get("parishes") or []:
            name = _s(p.get("title"))
            if not name:
                continue
            if auth_models.Entities.objects.filter(entity_type=CHURCH_TYPE, organization=org, title=name.upper()).exists():
                out["parishes_existing"] += 1
                continue
            region = regions.get(_s(p.get("region")).lower())
            if region is None and _s(p.get("region")):
                region = Divisions.objects.filter(organization=org, name__iexact=_s(p.get("region"))).first()
            if region is None and regions:
                out["skipped"].append(f"{name}: unknown region '{_s(p.get('region'))}'")
                continue
            try:
                with transaction.atomic():
                    _new_parish(org, region, name, _s(p.get("town")), _s(p.get("road")), _s(p.get("phone")), _s(p.get("email")),
                                p.get("latitude"), p.get("longitude"), by=by)
                out["parishes_created"] += 1
            except ChurchError as e:
                out["skipped"].append("; ".join(e.errors))
    return out
