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


class Adverts(EntityRelatedModel):
    entity = models.ForeignKey(Entities, on_delete=models.CASCADE)
    designation = models.ForeignKey(Designations, on_delete=models.CASCADE)
    closes = models.DateField()
    vacancies = models.PositiveIntegerField()
    title = models.CharField(max_length=100, unique=True)
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    owner = models.ForeignKey(
        Users, related_name="advert_created_by", on_delete=models.CASCADE
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (
            "entity",
            "title",
        )

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Adverts, self).save(*args, **kwargs)


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
    # facility_sub_store = models.ForeignKey(
    #     "logistics.FacilitySubStore",
    #     on_delete=models.CASCADE,
    #     related_name="employees_facility_sub_store",
    #     null=True,
    #     blank=True,
    # )
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
    terminal_date = models.DateField(null=True, blank=True)
    owner = models.ForeignKey(
        Users, related_name="employee_created_by", on_delete=models.CASCADE
    )
    # assigned_routes = models.ManyToManyField("transport.OperationRoutes",blank=True)
    assigned_branches = models.ManyToManyField(EntityBranches,blank=True)
    current_branch = models.ForeignKey(EntityBranches,blank=True, null=True,on_delete=models.DO_NOTHING,related_name="current_assigned_outlet")
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


class DeliveryPersons(EntityRelatedModel):
    """
    A profile should only have one instance of employee. Only entity should be changed when user moves to another entity
    """

    ACTIVE_CHOICES = (
        ("true", "true"),
        ("false", "false"),
    )
    entity = models.ForeignKey(Entities, on_delete=models.CASCADE)
    user = models.ForeignKey(Users, on_delete=models.CASCADE)
    is_active = models.CharField(choices=ACTIVE_CHOICES, default="true", max_length=5)
    owner = models.ForeignKey(
        Users, related_name="delivery_person_created_by", on_delete=models.CASCADE
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "entity"], name="One can be courier once in an entity"
            ),
        ]

    # class Meta:
    #     unique_together = ("user", "entity")

    # def save(self, *args, **kwargs):
    #     print("Niko hapa")
    #     if len(self.employee_roles.all()) > 0:
    #         all_user = self.user.roles.all()
    #         entity_user_roles = self.employee_roles.roles.all()
    #         print("all_user_roles", all_user_roles)
    #         print("entity_user_roles", entity_user_roles)
    #     super(Employees, self).save(*args, **kwargs)

    # class Meta:
    #     unique_together = ('entity', 'profile',)

    # def __str__(self):
    #     return f"{self.designation.title}"


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
