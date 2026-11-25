# churches/models.py — churches on WaziPOS.
#
# A denomination / fellowship (e.g. Free Pentecostal Fellowship in Kenya) is an
# authentication.Organizations row with organization_type DENOMINATION, created by
# WaziPOS admins, run by its head-office admins (DenominationAdmins). Each parish /
# local church is an Entities row of type "Church"; it asks to join its denomination
# (ChurchProfiles.org_request) and head office approves, which sets
# Entities.organization. Independent churches have no denomination.
#
# Hierarchy (authentication app): Organizations -> Divisions -> Entities. For churches:
# denomination -> region (a Divisions row, shown with Organizations.division_label) ->
# parish (a Church entity, Entities.division) -> groups. Each level has admins,
# appointed only by an admin higher up:
#   denomination roles (DenominationAdmins)   by WaziPOS admins
#   region admins (DivisionAdmins)            by denomination head / admins
#   parish offices (ChurchOfficials)          by the parish's region admins or above
#                                             (an independent church's own owner)
#   group leaders (ChurchOfficials)           by the parish admin / pastor
#
# Phase 1: the family register (families, members, promotion on marriage, life
# events), groups and ministries, church officials, announcements, the weekly
# programme and events, and SMS to members. Giving, welfare, attendance and
# pastoral care come in later phases.

import secrets
import uuid

from django.conf import settings
from django.db import models


def _code():
    return secrets.token_hex(4)  # 8 characters, for public links (/church/<code>)


class ChurchProfiles(models.Model):
    """Public details of a Church entity (created the first time the church is opened)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.OneToOneField("authentication.Entities", on_delete=models.CASCADE, related_name="church_profile")
    code = models.CharField(max_length=16, unique=True, default=_code)
    denomination = models.CharField(max_length=120, blank=True, default="")
    about = models.TextField(blank=True, default="")
    # Listed in "Find a church" and its public page opens for anyone.
    is_listed = models.BooleanField(default=True)
    # Recipients the church may text per calendar month (SMS costs WaziPOS money).
    sms_monthly_quota = models.PositiveIntegerField(default=500)
    family_seq = models.PositiveIntegerField(default=0)
    # The region (division) asked for while the join request is pending. Once approved the
    # parish's region is Entities.division (set with Entities.organization).
    requested_division = models.ForeignKey("authentication.Divisions", on_delete=models.SET_NULL, null=True, blank=True, related_name="parish_requests")
    # Joining a denomination: the parish asks, head office decides.
    ORG_STATUSES = (("NONE", "Independent"), ("PENDING", "Waiting for head office"), ("APPROVED", "Part of the denomination"), ("REJECTED", "Not accepted"))
    org_request = models.ForeignKey("authentication.Organizations", on_delete=models.SET_NULL, null=True, blank=True, related_name="parish_requests")
    org_status = models.CharField(max_length=10, choices=ORG_STATUSES, default="NONE")
    org_note = models.CharField(max_length=255, blank=True, default="")
    org_decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    org_decided_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.entity.title} ({self.code})"


class DenominationAdmins(models.Model):
    """Head-office people who run a denomination on WaziPOS (appointed by WaziPOS admins)."""

    ROLES = (("HEAD", "Head / overseer"), ("ADMIN", "Head-office admin"), ("COMMUNICATIONS", "Communications"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("authentication.Organizations", on_delete=models.CASCADE, related_name="denomination_admins")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="denomination_roles")
    role = models.CharField(max_length=16, choices=ROLES, default="ADMIN")
    is_active = models.BooleanField(default=True)
    added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "user"], name="uniq_denomination_admin")]


class DivisionAdmins(models.Model):
    """Runs a division (a denomination's region): its parishes' join requests, parish
    officials, region notices. Appointed by the denomination's head office."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    division = models.ForeignKey("authentication.Divisions", on_delete=models.CASCADE, related_name="church_admins")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="church_division_roles")
    is_active = models.BooleanField(default=True)
    added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["division", "user"], name="uniq_division_admin")]


class ChurchOfficials(models.Model):
    """A person who helps run a parish. The owner / super admins need no row.
    Offices are appointed by the parish's region admins or head office (an independent
    church's own owner); group leaders by the parish admin / pastor."""

    OFFICES = (
        ("ADMIN", "Parish admin"),
        ("PASTOR", "Pastor / Priest"),
        ("SECRETARY", "Secretary"),
        ("TREASURER", "Treasurer"),
        ("WELFARE", "Welfare committee"),
        ("GROUP_LEADER", "Group leader"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    church = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE, related_name="church_officials")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="church_offices")
    office = models.CharField(max_length=20, choices=OFFICES)
    # Group leaders lead one group.
    group = models.ForeignKey("churches.Groups", on_delete=models.CASCADE, null=True, blank=True, related_name="leaders")
    is_active = models.BooleanField(default=True)
    added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["church", "user", "office", "group"], name="uniq_church_official_office")]


class Groups(models.Model):
    """Ministries, fellowships, cells, choir, Sunday school…"""

    KINDS = (
        ("MINISTRY", "Ministry"),
        ("CELL", "Cell / home fellowship"),
        ("CHOIR", "Choir / praise team"),
        ("YOUTH", "Youth"),
        ("WOMEN", "Women"),
        ("MEN", "Men"),
        ("CHILDREN", "Sunday school / children"),
        ("OTHER", "Other"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    church = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE, related_name="church_groups")
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=12, choices=KINDS, default="MINISTRY")
    description = models.TextField(blank=True, default="")
    meets = models.CharField(max_length=160, blank=True, default="")  # e.g. "Thursdays 6pm, Kilimani"
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["church", "name"], name="uniq_church_group_name")]

    def __str__(self):
        return self.name


class Families(models.Model):
    STATUSES = (("ACTIVE", "Active"), ("TRANSFERRED", "Transferred out"), ("INACTIVE", "Inactive"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    church = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE, related_name="church_families")
    number = models.CharField(max_length=20)  # F0001, per church
    name = models.CharField(max_length=160)  # e.g. "Otieno family"
    area = models.CharField(max_length=160, blank=True, default="")  # estate / village
    cell_group = models.ForeignKey(Groups, on_delete=models.SET_NULL, null=True, blank=True, related_name="cell_families")
    # Set when the family was started by a child of another family (promotion on marriage).
    parent_family = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="branch_families")
    status = models.CharField(max_length=12, choices=STATUSES, default="ACTIVE")
    joined_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["church", "number"], name="uniq_church_family_number")]

    def __str__(self):
        return f"{self.number} {self.name}"


class Members(models.Model):
    ROLES = (("HEAD", "Household head"), ("SPOUSE", "Spouse"), ("CHILD", "Child"), ("DEPENDANT", "Other dependant"))
    STATUSES = (("ACTIVE", "Active"), ("VISITOR", "Visitor"), ("TRANSFERRED", "Transferred out"), ("DECEASED", "Deceased"))
    GENDERS = (("Female", "Female"), ("Male", "Male"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    church = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE, related_name="church_members")
    family = models.ForeignKey(Families, on_delete=models.PROTECT, related_name="members")
    # The family they were born into, kept after promotion to a new family.
    origin_family = models.ForeignKey(Families, on_delete=models.SET_NULL, null=True, blank=True, related_name="grown_children")
    # Their WaziPOS account (matched by phone), so they see "My family" in the app.
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="church_memberships")
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True, default="")
    gender = models.CharField(max_length=10, choices=GENDERS, blank=True, default="")
    date_of_birth = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True, default="", db_index=True)
    id_number = models.CharField(max_length=30, blank=True, default="")
    role_in_family = models.CharField(max_length=10, choices=ROLES, default="CHILD")
    status = models.CharField(max_length=12, choices=STATUSES, default="ACTIVE", db_index=True)
    baptised_on = models.DateField(null=True, blank=True)
    confirmed_on = models.DateField(null=True, blank=True)
    married_on = models.DateField(null=True, blank=True)
    died_on = models.DateField(null=True, blank=True)
    groups = models.ManyToManyField(Groups, related_name="members", blank=True)
    notes = models.TextField(blank=True, default="")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.full_name


class MemberEvents(models.Model):
    """The member's history: births, baptism, weddings, promotions, transfers, death."""

    KINDS = (
        ("JOINED", "Joined"),
        ("BIRTH", "Birth"),
        ("BAPTISM", "Baptism"),
        ("CONFIRMATION", "Confirmation"),
        ("WEDDING", "Wedding"),
        ("PROMOTED", "Started / joined a family"),
        ("TRANSFER_IN", "Transferred in"),
        ("TRANSFER_OUT", "Transferred out"),
        ("DEATH", "Death"),
        ("STATUS", "Status changed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    member = models.ForeignKey(Members, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=14, choices=KINDS)
    date = models.DateField(null=True, blank=True)
    details = models.CharField(max_length=255, blank=True, default="")
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-date", "-created")


class Announcements(models.Model):
    AUDIENCES = (("PUBLIC", "Everyone (public page)"), ("MEMBERS", "Members only"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # One of the two: a parish's own notice, or a denomination-wide one (every parish page).
    church = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE, null=True, blank=True, related_name="church_announcements")
    organization = models.ForeignKey("authentication.Organizations", on_delete=models.CASCADE, null=True, blank=True, related_name="denomination_announcements")
    # With organization: only that division's (region's) parishes, else every parish of the denomination.
    division = models.ForeignKey("authentication.Divisions", on_delete=models.CASCADE, null=True, blank=True, related_name="church_announcements")
    title = models.CharField(max_length=160)
    body = models.TextField()
    audience = models.CharField(max_length=8, choices=AUDIENCES, default="PUBLIC")
    pinned = models.BooleanField(default=False)
    publish_at = models.DateTimeField(null=True, blank=True)  # empty = now
    expires_at = models.DateTimeField(null=True, blank=True)  # empty = until removed
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-pinned", "-created")


class ScheduleItems(models.Model):
    """The weekly programme: what happens every week, and when."""

    DAYS = ((0, "Monday"), (1, "Tuesday"), (2, "Wednesday"), (3, "Thursday"), (4, "Friday"), (5, "Saturday"), (6, "Sunday"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    church = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE, related_name="church_schedule")
    day = models.PositiveSmallIntegerField(choices=DAYS)
    starts = models.TimeField()
    ends = models.TimeField(null=True, blank=True)
    title = models.CharField(max_length=120)  # e.g. "English service"
    venue = models.CharField(max_length=120, blank=True, default="")
    group = models.ForeignKey(Groups, on_delete=models.SET_NULL, null=True, blank=True, related_name="schedule")
    notes = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("day", "starts")


class Events(models.Model):
    """Dated happenings: conferences, weddings, funerals, retreats, a special service."""

    AUDIENCES = Announcements.AUDIENCES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # One of the two: a parish's event, or a denomination-wide one (conference, convention…).
    church = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE, null=True, blank=True, related_name="church_events")
    organization = models.ForeignKey("authentication.Organizations", on_delete=models.CASCADE, null=True, blank=True, related_name="denomination_events")
    division = models.ForeignKey("authentication.Divisions", on_delete=models.CASCADE, null=True, blank=True, related_name="church_events")
    title = models.CharField(max_length=160)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    venue = models.CharField(max_length=160, blank=True, default="")
    description = models.TextField(blank=True, default="")
    # Speaker / preacher / officiating minister.
    leader = models.CharField(max_length=120, blank=True, default="")
    audience = models.CharField(max_length=8, choices=AUDIENCES, default="PUBLIC")
    group = models.ForeignKey(Groups, on_delete=models.SET_NULL, null=True, blank=True, related_name="events")
    is_cancelled = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("starts_at",)


class Messages(models.Model):
    """An SMS sent to members (one row per send, recipients counted)."""

    STATUSES = (("QUEUED", "Queued"), ("SENDING", "Sending"), ("SENT", "Sent"), ("PARTIAL", "Partly sent"), ("FAILED", "Failed"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    church = models.ForeignKey("authentication.Entities", on_delete=models.CASCADE, related_name="church_messages")
    body = models.TextField()
    audience = models.JSONField(default=dict)  # {"kind": "ALL" | "GROUP" | "FAMILY" | "AGE" | "STATUS", ...}
    audience_label = models.CharField(max_length=160, blank=True, default="")
    phones = models.JSONField(default=list)
    recipients = models.PositiveIntegerField(default=0)
    sent = models.PositiveIntegerField(default=0)
    failed = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=8, choices=STATUSES, default="QUEUED")
    errors = models.JSONField(default=list, blank=True)
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created",)
