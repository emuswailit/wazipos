import uuid
import profile
from rest_framework.validators import UniqueTogetherValidator
from django.db import models
from core.models import EntityRelatedModel
from authentication.models import Cadres, Departments, Entities, EntityBranches, Profiles, Roles, Users
from django.db.models.signals import post_save
from django.dispatch import receiver


class Designations(EntityRelatedModel):
    TENURE_CHOICES = (
        ("CONTRACTUAL", "CONTRACTUAL"),
        ("INTERNSHIP", "INTERNSHIP"),
        ("LOCUM", "LOCUM"),
        ("PERMANENT", "PERMANENT"),
        ("TEMPORARY", "TEMPORARY"),
    )

    cadre = models.ForeignKey(Cadres, on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(
        max_length=240,
    )
    description = models.TextField(null=True, blank=True)
    tenure = models.CharField(max_length=255, choices=TENURE_CHOICES)
    total_slots = models.IntegerField()
    duration_in_months = models.IntegerField(default=0)
    advertised_slots = models.IntegerField(default=0)
    filled_slots = models.IntegerField(default=0)
    open_slots = models.IntegerField(default=0)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["title", "entity"],
                name="Designation title is unique per entity",
            ),
        ]

    def vacant_slots(self):
        return self.total_slots - self.filled_slots

    def advertised(self):
        return self.advertised_slots > 0

    def __str__(self):
        return f"{self.title}"

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        self.open_slots = self.total_slots - self.filled_slots
        super(Designations, self).save(*args, **kwargs)


def _share_code():
    """Short, unambiguous code for public job links (wazipos.co.ke/job/<code>)."""
    import secrets

    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(secrets.choice(alphabet) for _ in range(8))


class Adverts(EntityRelatedModel):
    """
    A job opening an entity advertises on the WaziPOS jobs board.

    Permanent posts and locum (short, shift-based) cover share one model: locums
    carry dates / hours / a day or shift rate, permanent posts a monthly salary
    range. Anyone signed in can browse and apply; the public link
    (/job/<share_code>) shows a teaser only — full details need an account.
    """

    EMPLOYMENT_TYPES = (
        ("PERMANENT", "PERMANENT"),
        ("LOCUM", "LOCUM"),
        ("CONTRACT", "CONTRACT"),
        ("INTERNSHIP", "INTERNSHIP"),
        ("TEMPORARY", "TEMPORARY"),
    )
    STATUSES = (
        ("DRAFT", "DRAFT"),
        ("OPEN", "OPEN"),
        ("PAUSED", "PAUSED"),
        ("CLOSED", "CLOSED"),
        ("FILLED", "FILLED"),
    )
    PAY_PERIODS = (
        ("HOUR", "HOUR"),
        ("SHIFT", "SHIFT"),
        ("DAY", "DAY"),
        ("WEEK", "WEEK"),
        ("MONTH", "MONTH"),
        ("YEAR", "YEAR"),
    )

    entity = models.ForeignKey(Entities, on_delete=models.CASCADE)
    designation = models.ForeignKey(Designations, on_delete=models.CASCADE)
    cadre = models.ForeignKey(Cadres, on_delete=models.SET_NULL, null=True, blank=True, related_name="job_adverts")
    closes = models.DateField()
    vacancies = models.PositiveIntegerField()
    filled = models.PositiveIntegerField(default=0)
    # Not unique: many businesses hire a "Pharmacist", and the same one may re-advertise.
    title = models.CharField(max_length=160)
    description = models.TextField(null=True, blank=True)
    responsibilities = models.TextField(null=True, blank=True)
    requirements = models.TextField(null=True, blank=True)
    benefits = models.TextField(null=True, blank=True)

    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPES, default="PERMANENT", db_index=True)
    status = models.CharField(max_length=10, choices=STATUSES, default="OPEN", db_index=True)
    share_code = models.CharField(max_length=12, unique=True, null=True, blank=True, db_index=True)

    # Where (defaults to the business's own town / county when blank).
    work_location = models.CharField(max_length=200, null=True, blank=True)

    # Pay: a range, per period. Hidden on the board when show_pay is off.
    pay_min = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    pay_max = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    pay_period = models.CharField(max_length=10, choices=PAY_PERIODS, default="MONTH")
    show_pay = models.BooleanField(default=True)

    # Locum / short-term cover.
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    shift_hours = models.CharField(max_length=120, null=True, blank=True)

    # Professional hiring.
    min_experience_years = models.PositiveIntegerField(default=0)
    requires_license = models.BooleanField(default=False)
    license_body = models.CharField(max_length=120, null=True, blank=True)  # e.g. PPB, KMPDC, NCK
    contact_email = models.EmailField(null=True, blank=True)

    views_count = models.PositiveIntegerField(default=0)
    applications_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    owner = models.ForeignKey(
        Users, related_name="advert_created_by", on_delete=models.CASCADE
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]
        indexes = [models.Index(fields=["status", "closes"])]

    def save(self, *args, **kwargs):
        self.title = (self.title or "").strip()
        if not self.share_code:
            for _ in range(6):
                code = _share_code()
                if not Adverts.objects.filter(share_code=code).exists():
                    self.share_code = code
                    break
        # is_active mirrors the status for older screens.
        self.is_active = self.status == "OPEN"
        super(Adverts, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} — {self.entity_id}"


class CurriculumVitae(models.Model):
    """
    A user's CV built in WaziPOS (Jobs → My CV). `data` holds the sections the form
    edits; `html` is the rendered CV the app made (used for the share link and for
    employers when it's attached to an application).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Users, on_delete=models.CASCADE, related_name="cvs")
    title = models.CharField(max_length=120, default="My CV")
    template = models.CharField(max_length=20, default="modern")
    accent = models.CharField(max_length=9, default="#2a6ff3")
    data = models.JSONField(default=dict, blank=True)
    html = models.TextField(null=True, blank=True)
    share_token = models.CharField(max_length=40, unique=True, null=True, blank=True)
    is_public = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated"]

    def __str__(self):
        return f"{self.title} ({self.user_id})"


class JobApplications(EntityRelatedModel):
    """A user's application to an advert. One per user per advert."""

    STATUSES = (
        ("SUBMITTED", "SUBMITTED"),
        ("SHORTLISTED", "SHORTLISTED"),
        ("INTERVIEW", "INTERVIEW"),
        ("OFFERED", "OFFERED"),
        ("HIRED", "HIRED"),
        ("REJECTED", "REJECTED"),
        ("WITHDRAWN", "WITHDRAWN"),
    )

    advert = models.ForeignKey(Adverts, on_delete=models.CASCADE, related_name="applications")
    applicant = models.ForeignKey(Users, on_delete=models.CASCADE, related_name="job_applications")
    status = models.CharField(max_length=12, choices=STATUSES, default="SUBMITTED", db_index=True)

    cover_note = models.TextField(null=True, blank=True)
    phone = models.CharField(max_length=20)
    email = models.EmailField(null=True, blank=True)
    license_number = models.CharField(max_length=80, null=True, blank=True)
    years_experience = models.PositiveIntegerField(default=0)
    available_from = models.DateField(null=True, blank=True)
    expected_pay = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cv = models.FileField(upload_to="jobs/cv/", null=True, blank=True)
    wazi_cv = models.ForeignKey("CurriculumVitae", on_delete=models.SET_NULL, null=True, blank=True, related_name="applications")

    # Employer side.
    employer_notes = models.TextField(null=True, blank=True)
    interview_at = models.DateTimeField(null=True, blank=True)
    interview_location = models.CharField(max_length=200, null=True, blank=True)
    message_to_applicant = models.TextField(null=True, blank=True)
    decided_by = models.ForeignKey(Users, on_delete=models.SET_NULL, null=True, blank=True, related_name="job_decisions")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]
        constraints = [
            models.UniqueConstraint(fields=["advert", "applicant"], name="one_application_per_advert"),
        ]

    def __str__(self):
        return f"{self.applicant_id} → {self.advert_id} ({self.status})"


class Employees(EntityRelatedModel):
    """
    A profile should only have one instance of employee. Only entity should be changed when user moves to another entity
    """

    ACTIVE_CHOICES = (
        ("true", "true"),
        ("false", "false"),
    )
    entity = models.ForeignKey(Entities, on_delete=models.CASCADE)
    department = models.ForeignKey(
        Departments, on_delete=models.CASCADE, null=True, blank=True
    )
    designation = models.ForeignKey(
        Designations,
        on_delete=models.CASCADE,
        related_name="employees",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(Users, on_delete=models.CASCADE)
    advert = models.ForeignKey(Adverts, on_delete=models.CASCADE, null=True, blank=True)
    hire_date = models.DateField(null=True, blank=True)
    counter_discount_limit = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    is_active = models.CharField(choices=ACTIVE_CHOICES, default="true", max_length=5)
    is_authorized = models.CharField(
        choices=ACTIVE_CHOICES, default="false", max_length=5
    )
    
    # 🌟 NEW: Flag to indicate if this employee can fulfil deliveries
    can_deliver = models.BooleanField(
        default=False, 
        help_text="Check if this employee is allowed to fulfil deliveries (e.g., riders, drivers, clerks)."
    )
    
    terminal_date = models.DateField(null=True, blank=True)
    owner = models.ForeignKey(
        Users, related_name="employee_created_by", on_delete=models.CASCADE
    )
    assigned_branches = models.ManyToManyField(EntityBranches, blank=True)
    current_branch = models.ForeignKey(
        EntityBranches, 
        blank=True, 
        null=True, 
        on_delete=models.DO_NOTHING, 
        related_name="current_assigned_outlet"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.first_name} {self.user.last_name}"

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "entity"],
                name="One can be employed only once in an organisation",
            ),
        ]


class Salaries(EntityRelatedModel):
    employee = models.ForeignKey(
        Employees, on_delete=models.CASCADE, related_name="salaries"
    )
    basic_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    house_allowance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    other_allowance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    total_tax = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_active = models.BooleanField(default=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


@receiver(post_save, sender=Employees)
def create_employee_salary(sender, instance, created, **kwargs):
    if created:
        Salaries.objects.create(
            employee=instance, entity=instance.entity, owner=instance.owner
        )